const app = getApp()
const util = require('../../utils/util')
const recipeTemplate = require('../../utils/recipeTemplate')
const recipeParser = require('../../utils/recipeParser')
const {
  getSceneCategories,
  getIngredientCategories,
  getCookingMethods,
  getFlavorTypes,
  getPreparationTimes,
  getDifficultyLevels,
  getServingSizes,
  getSceneCategoryById,
  getIngredientCategoryById,
  validateRequiredFields
} = require('../../utils/tagData')

// 复制过模板的人才会看到「要不要从剪贴板填充」的提示，避免无谓地读剪贴板
const TEMPLATE_COPIED_KEY = 'recipe_ai_template_copied_at'
const TEMPLATE_HINT_WINDOW = 30 * 60 * 1000
// 悬浮球位置记在本地，下次进来还在用户放的地方
const FAB_POSITION_KEY = 'recipe_ai_fab_position'
const FAB_SIZE_RPX = 96
const FAB_EDGE_PX = 8
const FAB_TAP_SLOP = 6

Page({
  data: {
    loading: false,
    initialLoading: false,
    initialLoadError: '',
    showTemplateEntry: false,
    filledFlash: false,
    fabLeft: 0,
    fabTop: 0,
    fabDragging: false,
    inputDebounceTimer: null,
    formMode: 'recipe',
    isWishMode: false,
    isWishSubmitMode: false,
    isAcceptWishMode: false,
    wishId: '',
    submitText: '添一道拿手菜',
    draftText: '先存着',
    showDraftAction: true,
    imageLabel: '先来张馋图',
    imageRequiredClass: '',
    nameLabel: '这道菜叫什么',
    descriptionLabel: '馋点备注',
    descriptionPlaceholder: '简单说说这道菜需要特别注意啥...',
    optionalSuffix: '',
    ingredientRequiredClass: 'required',
    stepRequiredClass: '',
    showRecipePrivacy: true,
    showCookingInfo: true,
    footerClass: '',
    formData: {
      images: [],
      name: '',
      description: '',
      xiaohongshuUrl: '',
      sceneCategory: '', // 必选：场景分类ID
      ingredientCategory: '', // 必选：食材分类ID
      preparationTimeIndex: 0,
      difficultyIndex: 0,
      servingSizeIndex: 0,
      optionalTags: [], // 可选标签：烹饪方式和口味特色
      ingredients: [
        { id: 'ing_1', name: '', amount: '' },
        { id: 'ing_2', name: '', amount: '' }
      ],
      sideIngredients: '',
      seasonings: '',
      steps: [
        { id: 'step_1', content: '', image: '' },
        { id: 'step_2', content: '', image: '' }
      ],
      isPublic: true
    },
    // 枚举数据
    sceneCategories: [],
    ingredientCategories: [],
    cookingMethods: [],
    flavorTypes: [],
    preparationTimes: [],
    difficultyLevels: [],
    servingSizes: [],
    // UI状态
    // 标签区域默认展开，方便直接浏览和选择口味
    showMoreTags: true,
    
    // 编辑模式
    isEditMode: false,
    editRecipeId: ''
  },

  onLoad(options) {
    if (!util.requireLogin('提交菜品或饭愿需要登录')) return
    const formMode = options.mode === 'wish' || options.mode === 'acceptWish' ? options.mode : 'recipe'
    const isWishMode = formMode === 'wish' || formMode === 'acceptWish'
    const isWishSubmitMode = formMode === 'wish'
    const isAcceptWishMode = formMode === 'acceptWish'
    const isEditMode = formMode === 'recipe' && !!options.id
    const modeConfig = this.getModeConfig(formMode, isEditMode)

    // 初始化所有枚举数据
    const cookingMethods = getCookingMethods().map(item => ({
      ...item,
      selected: false
    }))
    
    const flavorTypes = getFlavorTypes().map(item => ({
      ...item,
      selected: false
    }))
    
    const preparationTimes = getPreparationTimes()
    
    this.setData({
      sceneCategories: getSceneCategories(),
      ingredientCategories: getIngredientCategories(),
      cookingMethods: cookingMethods,
      flavorTypes: flavorTypes,
      preparationTimes: preparationTimes,
      difficultyLevels: getDifficultyLevels(),
      servingSizes: getServingSizes(),
      formMode,
      showTemplateEntry: formMode === 'recipe',
      ...this.getInitialFabPosition(),
      isWishMode,
      isWishSubmitMode,
      isAcceptWishMode,
      isEditMode,
      editRecipeId: isEditMode ? options.id : '',
      wishId: options.wishId || '',
      ...modeConfig
    }, () => {
      // 数据设置完成后的回调
    })
    
    // 调试：确认optionalTags初始状态
    wx.setNavigationBarTitle({ title: modeConfig.navTitle })

    if (isAcceptWishMode && options.wishId) {
      this.loadWishData(options.wishId)
      return
    }
    
    if (isEditMode) {
      this.loadRecipeData(options.id)
      return
    }
    this._shouldCheckLocalDraft = formMode === 'recipe'
  },

  onReady() {
    if (this._shouldCheckLocalDraft) this.promptEntryChoice()
  },

  getModeConfig(formMode, isEditMode = false) {
    if (formMode === 'wish') {
      return {
        navTitle: '许个饭愿',
        submitText: '许个饭愿',
        imageLabel: '先来张馋图',
        imageRequiredClass: '',
        nameLabel: '这道菜叫什么',
        descriptionLabel: '想怎么吃',
        descriptionPlaceholder: '少辣、甜口、突然很馋，都可以写...',
        optionalSuffix: '（可选）',
        ingredientRequiredClass: '',
        stepRequiredClass: '',
        showRecipePrivacy: false,
        showCookingInfo: false,
        footerClass: 'single-action'
      }
    }

    if (formMode === 'acceptWish') {
      return {
        navTitle: '安排上桌',
        submitText: '安排上桌',
        imageLabel: '先来张馋图',
        imageRequiredClass: '',
        nameLabel: '这道菜叫什么',
        descriptionLabel: '馋点备注',
        descriptionPlaceholder: '可以按实际做法调整这道菜的描述...',
        optionalSuffix: '',
        ingredientRequiredClass: 'required',
        stepRequiredClass: '',
        showRecipePrivacy: false,
        showCookingInfo: true,
        footerClass: 'single-action'
      }
    }

    if (isEditMode) {
      return {
        navTitle: '编辑拿手菜',
        submitText: '保存修改',
        draftText: '保存草稿',
        showDraftAction: true,
        imageLabel: '更新菜品馋图',
        imageRequiredClass: '',
        nameLabel: '菜品名称',
        descriptionLabel: '馋点备注',
        descriptionPlaceholder: '修改这道菜需要特别注意的地方...',
        optionalSuffix: '',
        ingredientRequiredClass: 'required',
        stepRequiredClass: '',
        showRecipePrivacy: false,
        showCookingInfo: true,
        footerClass: ''
      }
    }

    return {
      navTitle: '添一道拿手菜',
      submitText: '添一道拿手菜',
      imageLabel: '先来张馋图',
      imageRequiredClass: '',
      nameLabel: '这道菜叫什么',
      descriptionLabel: '馋点备注',
      descriptionPlaceholder: '简单说说这道菜需要特别注意啥...',
      optionalSuffix: '',
      ingredientRequiredClass: 'required',
      stepRequiredClass: '',
      showRecipePrivacy: false,
      showCookingInfo: true,
      footerClass: ''
    }
  },

  onUnload() {
    // 页面卸载时的清理工作
    if (this.data.inputDebounceTimer) {
      clearTimeout(this.data.inputDebounceTimer)
    }
  },

  // 加载菜谱数据（编辑模式）
  loadRecipeData(recipeId) {
    this.setData({ initialLoading: true, initialLoadError: '' })

    wx.cloud.callFunction({
      name: 'recipe',
      data: {
        action: 'getById',
        recipeId: recipeId
      },
      success: (res) => {
        if (res.result.success) {
          const recipe = res.result.data
          const optionalTags = recipe.optionalTags || []
          
          // 更新烹饪方式的选中状态
          const cookingMethods = this.data.cookingMethods.map(item => ({
            ...item,
            selected: optionalTags.includes(item.id)
          }))

          // 更新口味特色的选中状态
          const flavorTypes = this.data.flavorTypes.map(item => ({
            ...item,
            selected: optionalTags.includes(item.id)
          }))

          this.setData({
            formData: {
              ...this.data.formData,
              images: recipe.images || [],
              name: recipe.name || '',
              description: recipe.description || '',
              xiaohongshuUrl: recipe.xiaohongshuUrl || '',
              sceneCategory: recipe.sceneCategory || '',
              ingredientCategory: recipe.ingredientCategory || '',
              preparationTimeIndex: this.findOptionIndex(this.data.preparationTimes, recipe.preparationTime, 'value'),
              difficultyIndex: this.findOptionIndex(this.data.difficultyLevels, recipe.difficulty, 'value'),
              servingSizeIndex: this.findOptionIndex(this.data.servingSizes, recipe.servingSize, 'value'),
              optionalTags: optionalTags,
              ingredients: recipe.ingredients || [{ id: 'ing_1', name: '', amount: '' }],
              sideIngredients: recipe.sideIngredients || '',
              seasonings: recipe.seasonings || '',
              steps: recipe.steps || [{ id: 'step_1', content: '', image: '' }],
              isPublic: recipe.isPublic !== false
            },
            cookingMethods: cookingMethods,
            flavorTypes: flavorTypes,
            submitText: recipe.status === 'draft' ? '保存并发布' : '保存修改',
            draftText: '保存草稿',
            showDraftAction: recipe.status === 'draft',
            footerClass: recipe.status === 'draft' ? '' : 'single-action',
            initialLoading: false
          })
        } else {
          this.setData({
            initialLoading: false,
            initialLoadError: res.result.message || '菜谱加载失败，请稍后重试'
          })
        }
      },
      fail: (err) => {
        console.error('加载菜谱失败:', err)
        this.setData({ initialLoading: false, initialLoadError: '菜谱加载失败，请检查网络后重试' })
        wx.showToast({
          title: '菜谱没翻出来',
          icon: 'error'
        })
      }
    })
  },

  loadWishData(wishId) {
    this.setData({ initialLoading: true, initialLoadError: '' })

    wx.cloud.callFunction({
      name: 'wish',
      data: {
        action: 'detail',
        wishId
      },
      success: (res) => {
        if (res.result.success) {
          this.applyRecordToForm(res.result.data, () => this.setData({ initialLoading: false }))
        } else {
          this.setData({
            initialLoading: false,
            initialLoadError: res.result.message || '饭愿加载失败，请稍后重试'
          })
          wx.showToast({
            title: res.result.message || '饭愿没加载出来',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        console.error('加载饭愿失败:', err)
        this.setData({ initialLoading: false, initialLoadError: '饭愿加载失败，请检查网络后重试' })
        wx.showToast({
          title: '饭愿没加载出来',
          icon: 'error'
        })
      }
    })
  },

  retryInitialLoad() {
    if (this.data.isEditMode && this.data.editRecipeId) {
      this.loadRecipeData(this.data.editRecipeId)
      return
    }
    if (this.data.isAcceptWishMode && this.data.wishId) {
      this.loadWishData(this.data.wishId)
    }
  },

  stopInitialLoadingEvent() {},

  applyRecordToForm(record, callback) {
    const optionalTags = record.optionalTags || []
    const cookingMethods = this.data.cookingMethods.map(item => ({
      ...item,
      selected: optionalTags.includes(item.id)
    }))
    const flavorTypes = this.data.flavorTypes.map(item => ({
      ...item,
      selected: optionalTags.includes(item.id)
    }))

    this.setData({
      formData: {
        ...this.data.formData,
        images: record.images || [],
        name: record.name || '',
        description: record.description || record.note || '',
        xiaohongshuUrl: record.xiaohongshuUrl || '',
        sceneCategory: record.sceneCategory || '',
        ingredientCategory: record.ingredientCategory || '',
        preparationTimeIndex: this.findOptionIndex(this.data.preparationTimes, record.preparationTime, 'value'),
        difficultyIndex: this.findOptionIndex(this.data.difficultyLevels, record.difficulty, 'value'),
        servingSizeIndex: this.findOptionIndex(this.data.servingSizes, record.servingSize, 'value'),
        optionalTags,
        ingredients: record.ingredients && record.ingredients.length ? record.ingredients : [{ id: 'ing_1', name: '', amount: '' }],
        sideIngredients: record.sideIngredients || '',
        seasonings: record.seasonings || '',
        steps: record.steps && record.steps.length ? record.steps : [{ id: 'step_1', content: '', image: '' }],
        isPublic: true
      },
      cookingMethods,
      flavorTypes,
      showMoreTags: true
    }, callback)
  },

  findOptionIndex(list, value, key) {
    const rawValue = value && typeof value === 'object' ? value[key] : value
    const index = list.findIndex(item => item[key] === rawValue)
    return index >= 0 ? index : 0
  },

  // 检查表单是否有未保存的数据
  isFormDirty() {
    const { formData } = this.data
    return formData.images.length > 0 ||
           formData.name.trim() ||
           formData.description.trim() ||
           formData.sceneCategory ||
           formData.ingredientCategory ||
           formData.optionalTags.length > 0 ||
           String(formData.sideIngredients || '').trim() ||
           String(formData.seasonings || '').trim() ||
           formData.ingredients.some(ing => ing && (String(ing.name || '').trim() || String(ing.amount || '').trim())) ||
           formData.steps.some(step => step && (String(step.content || '').trim() || step.image))
  },

  // 检查表单脏数据并确认
  checkFormDirty(callback) {
    if (this.isFormDirty()) {
      this.selectComponent('#themeConfirmDialog').open({
        icon: '📝',
        title: '还没存好',
        content: '这道菜还没存，确定要离开吗？',
        cancelText: '继续编辑',
        confirmText: '确认离开',
        tone: 'danger'
      }).then(confirmed => {
        if (confirmed && callback) callback()
      })
    } else {
      callback && callback()
    }
  },

  // 返回上一页
  onBack() {
    this.checkFormDirty(() => {
      wx.navigateBack()
    })
  },

  // 保存草稿
  onSave() {
    if (!this.data.isEditMode && this.data.formMode === 'recipe') {
      this.saveLocalDraft()
      return
    }
    this.saveRecipe(false)
  },

  getLocalDraftKey() {
    const openid = app.globalData.openid || wx.getStorageSync('openid') || 'current'
    return `recipe_form_draft_${openid}`
  },

  saveLocalDraft() {
    if (!this.isFormDirty()) {
      util.showError('先填写一点内容再保存')
      return
    }
    wx.setStorageSync(this.getLocalDraftKey(), {
      formData: this.data.formData,
      showMoreTags: this.data.showMoreTags,
      savedAt: Date.now()
    })
    util.showSuccess('已替你存好')
    setTimeout(() => wx.navigateBack(), 700)
  },

  getWindowSize() {
    if (this._windowSize) return this._windowSize
    const info = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()) || {}
    this._windowSize = {
      width: info.windowWidth || 375,
      height: info.windowHeight || 667
    }
    return this._windowSize
  },

  getFabSize() {
    return Math.round(FAB_SIZE_RPX * this.getWindowSize().width / 750)
  },

  clampFabPosition(left, top) {
    const { width, height } = this.getWindowSize()
    const size = this.getFabSize()
    const maxLeft = width - size - FAB_EDGE_PX
    const maxTop = height - size - FAB_EDGE_PX
    return {
      fabLeft: Math.min(Math.max(left, FAB_EDGE_PX), Math.max(maxLeft, FAB_EDGE_PX)),
      fabTop: Math.min(Math.max(top, FAB_EDGE_PX), Math.max(maxTop, FAB_EDGE_PX))
    }
  },

  getInitialFabPosition() {
    const { width, height } = this.getWindowSize()
    const size = this.getFabSize()
    const saved = wx.getStorageSync(FAB_POSITION_KEY)
    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
      return this.clampFabPosition(saved.left, saved.top)
    }
    // 默认贴右侧、略高于底部按钮
    return this.clampFabPosition(width - size - 16, height - size - 200)
  },

  onFabTouchStart(e) {
    const touch = (e.touches && e.touches[0]) || {}
    this._fabDrag = {
      startX: touch.clientX || 0,
      startY: touch.clientY || 0,
      originLeft: this.data.fabLeft,
      originTop: this.data.fabTop,
      moved: false
    }
  },

  onFabTouchMove(e) {
    const drag = this._fabDrag
    if (!drag) return
    const touch = (e.touches && e.touches[0]) || {}
    const deltaX = (touch.clientX || 0) - drag.startX
    const deltaY = (touch.clientY || 0) - drag.startY
    if (!drag.moved && Math.abs(deltaX) < FAB_TAP_SLOP && Math.abs(deltaY) < FAB_TAP_SLOP) return
    drag.moved = true
    const position = this.clampFabPosition(drag.originLeft + deltaX, drag.originTop + deltaY)
    this.setData({ ...position, fabDragging: true })
  },

  onFabTouchEnd() {
    const drag = this._fabDrag
    this._fabDrag = null
    if (!drag) return
    if (!drag.moved) {
      this.setData({ fabDragging: false })
      this.openAiPanel()
      return
    }
    this.setData({ fabDragging: false })
    wx.setStorageSync(FAB_POSITION_KEY, { left: this.data.fabLeft, top: this.data.fabTop })
  },

  openAiPanel() {
    const dialog = this.selectComponent('#themeConfirmDialog')
    if (!dialog) return
    dialog.open({
      icon: '🤖',
      title: '让 AI 帮你填表',
      content: '把模板复制给 AI，补上菜名和参考链接；\n它写好后复制回来，点「从剪贴板填充」。',
      confirmText: '复制模板',
      extraText: '从剪贴板填充',
      cancelText: '关闭'
    }).then(choice => {
      if (choice === true) this.onCopyAiTemplate()
      else if (choice === 'extra') this.fillFromClipboard()
    })
  },

  // 刚复制过模板才提示粘贴：iOS 读剪贴板会弹系统提示，不能每次进页面都读一遍
  hasFreshTemplateCopy() {
    const copiedAt = Number(wx.getStorageSync(TEMPLATE_COPIED_KEY) || 0)
    return Boolean(copiedAt) && Date.now() - copiedAt < TEMPLATE_HINT_WINDOW
  },

  // 草稿和剪贴板可能同时存在，合成一个三选一，避免连着弹两个弹窗
  promptEntryChoice() {
    const draft = wx.getStorageSync(this.getLocalDraftKey())
    const hasDraft = Boolean(draft && draft.formData)
    const canPaste = this.hasFreshTemplateCopy()
    if (!hasDraft) {
      if (canPaste) this.promptClipboardFill()
      return
    }
    if (!canPaste) {
      this.promptLocalDraft(draft)
      return
    }

    const dialog = this.selectComponent('#themeConfirmDialog')
    if (!dialog) return
    dialog.open({
      icon: '📝',
      title: '从哪儿接着来？',
      content: '上次还有没填完的内容，你刚才也复制过 AI 模板。想怎么开始？',
      confirmText: '继续上次填写',
      extraText: '用剪贴板填充',
      cancelText: '从头开始',
      dismissible: false
    }).then(choice => {
      if (choice === true) {
        this.restoreLocalDraft(draft)
        return
      }
      // 选剪贴板时先留着草稿：万一粘贴的内容不对，下次进来还能捡回来
      if (choice === 'extra') {
        this.fillFromClipboard()
        return
      }
      wx.removeStorageSync(this.getLocalDraftKey())
    })
  },

  promptClipboardFill() {
    const dialog = this.selectComponent('#themeConfirmDialog')
    if (!dialog) return
    dialog.open({
      icon: '🤖',
      title: '从剪贴板填充？',
      content: '你刚复制过模板，如果 AI 已经写好并复制回来了，可以直接填进表单。',
      confirmText: '填充',
      cancelText: '先不用'
    }).then(confirmed => {
      if (confirmed) this.fillFromClipboard()
    })
  },

  onCopyAiTemplate() {
    wx.setClipboardData({
      data: recipeTemplate.buildAiPrompt(),
      success: () => {
        wx.setStorageSync(TEMPLATE_COPIED_KEY, Date.now())
        const dialog = this.selectComponent('#themeConfirmDialog')
        if (!dialog) return
        dialog.open({
          icon: '🤖',
          title: '模板已复制',
          content: '粘贴给 AI，补上菜名和参考链接。\n它写好后复制回来，点「从剪贴板填充」。',
          showCancel: false,
          confirmText: '知道了'
        })
      },
      fail: () => util.showError('复制失败，再试一次')
    })
  },

  fillFromClipboard() {
    wx.getClipboardData({
      success: res => this.handleClipboardText(res.data),
      fail: () => util.showError('没读到剪贴板内容')
    })
  },

  handleClipboardText(text) {
    const parsed = recipeParser.parseRecipeTemplate(text)
    if (!parsed.ok) {
      util.showError(parsed.warnings[0] || '没认出菜谱内容')
      return
    }
    if (!this.isFormDirty()) {
      this.applyParsedRecipe(parsed)
      return
    }
    const dialog = this.selectComponent('#themeConfirmDialog')
    if (!dialog) {
      this.applyParsedRecipe(parsed)
      return
    }
    dialog.open({
      icon: '🤖',
      title: '覆盖当前内容？',
      content: '表单里已经填了东西，填充会替换识别到的那几项。',
      confirmText: '覆盖填充',
      cancelText: '再想想'
    }).then(confirmed => {
      if (confirmed) this.applyParsedRecipe(parsed)
    })
  },

  applyParsedRecipe(parsed) {
    const fields = parsed.fields || {}
    const formData = { ...this.data.formData }

    const TEXT_KEYS = ['name', 'description', 'sceneCategory', 'ingredientCategory', 'sideIngredients', 'seasonings', 'xiaohongshuUrl']
    TEXT_KEYS.forEach(key => {
      if (fields[key]) formData[key] = fields[key]
    })
    if (fields.ingredients && fields.ingredients.length) formData.ingredients = fields.ingredients
    if (fields.steps && fields.steps.length) formData.steps = fields.steps
    if (fields.optionalTags && fields.optionalTags.length) formData.optionalTags = fields.optionalTags
    if (fields.preparationTime) {
      formData.preparationTimeIndex = this.findOptionIndex(this.data.preparationTimes, fields.preparationTime, 'value')
    }
    if (fields.difficulty) {
      formData.difficultyIndex = this.findOptionIndex(this.data.difficultyLevels, fields.difficulty, 'value')
    }
    if (fields.servingSize) {
      formData.servingSizeIndex = this.findOptionIndex(this.data.servingSizes, fields.servingSize, 'value')
    }

    const optionalTags = formData.optionalTags || []
    this.setData({
      formData,
      cookingMethods: this.data.cookingMethods.map(item => ({ ...item, selected: optionalTags.indexOf(item.id) >= 0 })),
      flavorTypes: this.data.flavorTypes.map(item => ({ ...item, selected: optionalTags.indexOf(item.id) >= 0 })),
      showMoreTags: true,
      filledFlash: true
    })
    setTimeout(() => this.setData({ filledFlash: false }), 1800)
    wx.removeStorageSync(TEMPLATE_COPIED_KEY)
    this.showFillResult(parsed)
  },

  showFillResult(parsed) {
    const dialog = this.selectComponent('#themeConfirmDialog')
    if (!dialog) {
      util.showSuccess('已填入')
      return
    }
    const notes = ['已填入：' + (parsed.filledLabels || []).join('、')]
    if (parsed.warnings && parsed.warnings.length) notes.push(parsed.warnings.join('\n'))
    notes.push('AI 写的内容记得核对，馋图可以自己再加。')
    dialog.open({
      icon: '✅',
      title: '填好了',
      content: notes.join('\n'),
      showCancel: false,
      confirmText: '知道了'
    })
  },

  promptLocalDraft(cached) {
    const draft = cached || wx.getStorageSync(this.getLocalDraftKey())
    if (!draft || !draft.formData) return
    const dialog = this.selectComponent('#themeConfirmDialog')
    if (!dialog) return
    dialog.open({
      icon: '📝',
      title: '继续上次填写？',
      content: '发现一份还没完成的拿手菜，是否继续填写？选择清空后将从头开始。',
      cancelText: '清空',
      confirmText: '继续填写',
      dismissible: false
    }).then(continued => {
      if (continued) this.restoreLocalDraft(draft)
      else wx.removeStorageSync(this.getLocalDraftKey())
    })
  },

  restoreLocalDraft(draft) {
    const formData = draft.formData || {}
    const optionalTags = Array.isArray(formData.optionalTags) ? formData.optionalTags : []
    this.setData({
      formData: {
        ...this.data.formData,
        ...formData,
        images: Array.isArray(formData.images) ? formData.images : [],
        optionalTags,
        ingredients: Array.isArray(formData.ingredients) && formData.ingredients.length
          ? formData.ingredients
          : [{ id: 'ing_1', name: '', amount: '' }],
        steps: Array.isArray(formData.steps) && formData.steps.length
          ? formData.steps
          : [{ id: 'step_1', content: '', image: '' }],
        sideIngredients: formData.sideIngredients || '',
        seasonings: formData.seasonings || ''
      },
      cookingMethods: this.data.cookingMethods.map(item => ({ ...item, selected: optionalTags.includes(item.id) })),
      flavorTypes: this.data.flavorTypes.map(item => ({ ...item, selected: optionalTags.includes(item.id) })),
      showMoreTags: true
    })
  },

  // 提交表单
  onSubmit() {
    this.saveRecipe(true)
  },

  // 保存菜谱
  saveRecipe(isPublish) {
    // 调试：打印表单数据
    
    // 使用统一的验证函数
    const errors = this.data.isAcceptWishMode
      ? this.validateAcceptWishForm()
      : (this.data.isWishMode ? this.validateWishForm() : validateRequiredFields(this.data.formData))
    
    if (errors.length > 0) {
      wx.showToast({
        title: errors[0],
        icon: 'none'
      })
      return
    }

    this.setData({ loading: true })

    const formData = this.prepareFormData(isPublish)

    if (this.data.formMode === 'wish') {
      this.submitWishForm(formData)
      return
    }

    if (this.data.formMode === 'acceptWish') {
      this.acceptWishAsRecipe(formData)
      return
    }
    
    
    // 调用云函数保存菜谱
    const action = this.data.isEditMode ? 'update' : 'create'
    const requestData = this.data.isEditMode ? {
      action: 'update',
      recipeId: this.data.editRecipeId,
      data: formData
    } : {
      action: 'create',
      data: formData
    }
    
    wx.cloud.callFunction({
      name: 'recipe',
      data: requestData,
      success: (res) => {
        
        if (res.result && res.result.success) {
          if (isPublish && !this.data.isEditMode) wx.removeStorageSync(this.getLocalDraftKey())
          const successMessage = this.data.isEditMode 
            ? (isPublish ? '这道菜更新好了' : '先替你存好了')
            : (isPublish ? '已加入菜谱' : '先替你存好了')
          
          wx.showToast({
            title: successMessage,
            icon: 'success'
          })
          this.markHomeRecommendRefresh()
          
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
        } else {
          // 云函数返回失败
          const errorMessage = res.result?.message || '没保存成功'
          console.error('菜谱创建失败:', errorMessage)
          wx.showToast({
            title: errorMessage,
            icon: 'none',
            duration: 2000
          })
        }
      },
      fail: (err) => {
        console.error('保存菜谱失败:', err)
        wx.showToast({
          title: '没保存成功',
          icon: 'error'
        })
      },
      complete: () => {
        this.setData({ loading: false })
      }
    })
  },

  validateWishForm() {
    const { formData } = this.data
    const errors = []

    if (!formData.name || !formData.name.trim()) {
      errors.push('这道菜还没起名')
    }
    if (!formData.sceneCategory) {
      errors.push('选一下这道菜适合什么时候吃')
    }
    if (!formData.ingredientCategory) {
      errors.push('选一下主角食材')
    }

    return errors
  },

  validateAcceptWishForm() {
    const errors = this.validateWishForm()
    const { formData } = this.data
    const hasIngredient = formData.ingredients.some(item =>
      item && item.name && item.amount && item.name.trim() && item.amount.trim()
    )
    if (!hasIngredient) {
      errors.push('请补上备菜清单')
    }

    return errors
  },

  submitWishForm(formData) {
    wx.cloud.callFunction({
      name: 'wish',
      data: {
        action: 'create',
        data: formData
      },
      success: (res) => {
        if (res.result && res.result.success) {
          wx.showToast({
            title: '饭愿已送达',
            icon: 'success'
          })
          setTimeout(() => {
            wx.navigateBack()
          }, 1200)
        } else {
          wx.showToast({
            title: res.result?.message || '饭愿没送出去',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        console.error('提交饭愿失败:', err)
        wx.showToast({
          title: '饭愿没送出去',
          icon: 'error'
        })
      },
      complete: () => {
        this.setData({ loading: false })
      }
    })
  },

  acceptWishAsRecipe(formData) {
    wx.cloud.callFunction({
      name: 'wish',
      data: {
        action: 'acceptAsRecipe',
        wishId: this.data.wishId,
        data: formData
      },
      success: (res) => {
        if (res.result && res.result.success) {
          wx.showToast({
            title: '已安排上桌',
            icon: 'success'
          })
          setTimeout(() => {
            wx.navigateBack()
          }, 1200)
        } else {
          wx.showToast({
            title: res.result?.message || '没安排成功',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        console.error('安排上桌失败:', err)
        wx.showToast({
          title: '没安排成功',
          icon: 'error'
        })
      },
      complete: () => {
        this.setData({ loading: false })
      }
    })
  },

  markHomeRecommendRefresh() {
    const app = getApp()
    app.globalData.recipeDataVersion = (app.globalData.recipeDataVersion || 0) + 1
    const pages = getCurrentPages()
    const previousPage = pages[pages.length - 2]
    if (previousPage && previousPage.route === 'pages/index/index') {
      previousPage._needsRecommendRefresh = true
    }
  },

  // 准备表单数据
  prepareFormData(isPublish) {
    const { formData, preparationTimes, difficultyLevels, servingSizes } = this.data
    
    
    // 过滤空食材
    const ingredients = formData.ingredients.filter(item => 
      item && item.name && item.amount && 
      item.name.trim() && item.amount.trim()
    )
    

    // 过滤空步骤
    const steps = formData.steps.filter(step => 
      step && step.content && step.content.trim()
    ).map(step => ({
      content: step.content.trim(),
      image: step.image || ''
    }))

    return {
      images: formData.images,
      name: formData.name.trim(),
      description: formData.description.trim(),
      xiaohongshuUrl: formData.xiaohongshuUrl.trim(),
      sceneCategory: formData.sceneCategory,
      ingredientCategory: formData.ingredientCategory,
      preparationTime: preparationTimes[formData.preparationTimeIndex],
      difficulty: difficultyLevels[formData.difficultyIndex],
      servingSize: servingSizes[formData.servingSizeIndex],
      optionalTags: formData.optionalTags,
      ingredients: ingredients,
      sideIngredients: String(formData.sideIngredients || '').trim(),
      seasonings: String(formData.seasonings || '').trim(),
      steps: steps,
      isPublic: formData.isPublic !== false,
      status: isPublish ? 'published' : 'draft'
    }
  },

  // 场景分类选择
  onSceneCategorySelect(e) {
    const categoryId = e.currentTarget.dataset.id
    this.setData({
      'formData.sceneCategory': categoryId
    })
  },

  // 食材分类选择
  onIngredientCategorySelect(e) {
    const categoryId = e.currentTarget.dataset.id
    this.setData({
      'formData.ingredientCategory': categoryId
    })
  },

  // 切换更多标签显示
  toggleMoreTags() {
    this.setData({
      showMoreTags: !this.data.showMoreTags
    })
  },

  // 可选标签选择/取消
  onOptionalTagToggle(e) {
    const tagId = e.currentTarget.dataset.id
    const optionalTags = [...this.data.formData.optionalTags]
    const index = optionalTags.indexOf(tagId)


    if (index !== -1) {
      // 标签已存在，移除
      optionalTags.splice(index, 1)
    } else {
      // 标签不存在，添加（限制最多8个标签）
      if (optionalTags.length >= 8) {
        wx.showToast({
          title: '最多只能选择8个标签',
          icon: 'none'
        })
        return
      }
      optionalTags.push(tagId)
    }

    // 更新烹饪方式的选中状态
    const cookingMethods = this.data.cookingMethods.map(item => ({
      ...item,
      selected: optionalTags.includes(item.id)
    }))

    // 更新口味特色的选中状态
    const flavorTypes = this.data.flavorTypes.map(item => ({
      ...item,
      selected: optionalTags.includes(item.id)
    }))

    this.setData({
      'formData.optionalTags': optionalTags,
      cookingMethods: cookingMethods,
      flavorTypes: flavorTypes
    })
  },

  // 表单字段变化处理
  onNameChange(e) {
    this.setData({
      'formData.name': e.detail
    })
  },

  onDescriptionChange(e) {
    this.setData({
      'formData.description': e.detail
    })
  },

  onXiaohongshuUrlChange(e) {
    this.setData({
      'formData.xiaohongshuUrl': e.detail
    })
  },

  onSideIngredientsChange(e) {
    this.setData({ 'formData.sideIngredients': e.detail })
  },

  onSeasoningsChange(e) {
    this.setData({ 'formData.seasonings': e.detail })
  },

  onPreparationTimeChange(e) {
    const selectedIndex = e.detail.value || e.detail
    const preparationTimes = this.data.preparationTimes
    
    
    // 验证索引是否在有效范围内
    if (!preparationTimes || !Array.isArray(preparationTimes) || preparationTimes.length === 0) {
      console.error('preparationTimes数组未正确初始化')
      wx.showToast({
        title: '数据加载中，请稍后再试',
        icon: 'none'
      })
      return
    }
    
    if (selectedIndex < 0 || selectedIndex >= preparationTimes.length) {
      console.error('选择的索引超出范围:', selectedIndex, '数组长度:', preparationTimes.length)
      wx.showToast({
        title: '选择无效，请重新选择',
        icon: 'none'
      })
      return
    }
    
    
    this.setData({
      'formData.preparationTimeIndex': selectedIndex
    }, () => {
      // 数据更新后的回调，确保页面重新渲染
    })
  },

  onDifficultyChange(e) {
    const selectedIndex = e.detail.value || e.detail
    const difficultyLevels = this.data.difficultyLevels
    
    
    // 验证索引是否在有效范围内
    if (!difficultyLevels || !Array.isArray(difficultyLevels) || difficultyLevels.length === 0) {
      console.error('difficultyLevels数组未正确初始化')
      wx.showToast({
        title: '数据加载中，请稍后再试',
        icon: 'none'
      })
      return
    }
    
    if (selectedIndex < 0 || selectedIndex >= difficultyLevels.length) {
      console.error('选择的索引超出范围:', selectedIndex, '数组长度:', difficultyLevels.length)
      wx.showToast({
        title: '选择无效，请重新选择',
        icon: 'none'
      })
      return
    }
    
    
    this.setData({
      'formData.difficultyIndex': selectedIndex
    }, () => {
      // 数据更新后的回调，确保页面重新渲染
    })
  },

  onServingSizeChange(e) {
    const selectedIndex = e.detail.value || e.detail
    const servingSizes = this.data.servingSizes
    
    
    // 验证索引是否在有效范围内
    if (!servingSizes || !Array.isArray(servingSizes) || servingSizes.length === 0) {
      console.error('servingSizes数组未正确初始化')
      wx.showToast({
        title: '数据加载中，请稍后再试',
        icon: 'none'
      })
      return
    }
    
    if (selectedIndex < 0 || selectedIndex >= servingSizes.length) {
      console.error('选择的索引超出范围:', selectedIndex, '数组长度:', servingSizes.length)
      wx.showToast({
        title: '选择无效，请重新选择',
        icon: 'none'
      })
      return
    }
    
    
    this.setData({
      'formData.servingSizeIndex': selectedIndex
    }, () => {
      // 数据更新后的回调，确保页面重新渲染
    })
  },

  onPrivacyChange(e) {
    this.setData({
      'formData.isPublic': e.detail
    })
  },

  // 图片上传
  onImageUpload() {
    const currentCount = this.data.formData.images.length

    if (currentCount >= 5) {
      wx.showToast({
        title: '最多只能上传5张图片',
        icon: 'none'
      })
      return
    }

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      maxDuration: 30,
      camera: 'back',
      success: (res) => {
        const tempFilePath = res.tempFiles[0] && res.tempFiles[0].tempFilePath
        if (!tempFilePath) return

        wx.navigateTo({
          url: '/pages/image-crop/image-crop',
          success: navigation => {
            navigation.eventChannel.emit('cropSource', { path: tempFilePath })
            navigation.eventChannel.on('cropComplete', result => {
              if (result && result.path) this.uploadMultipleImages([result.path])
            })
          }
        })
      }
    })
  },

  // 上传多张图片到云存储
  uploadMultipleImages(filePaths) {
    wx.showLoading({ title: `上传中(0/${filePaths.length})...` })

    const uploadPromises = filePaths.map((filePath, index) => {
      return new Promise((resolve, reject) => {
        const cloudPath = util.buildUserCloudPath('recipes', `${Date.now()}-${index}-${Math.random().toString(36).slice(-6)}.jpg`)

        wx.cloud.uploadFile({
          cloudPath,
          filePath,
          success: (res) => {
            wx.showLoading({ title: `上传中(${index + 1}/${filePaths.length})...` })
            resolve(res.fileID)
          },
          fail: (err) => reject(err)
        })
      })
    })

    Promise.all(uploadPromises)
      .then(fileIDs => {
        const currentImages = [...this.data.formData.images]
        const newImages = currentImages.concat(fileIDs)

        this.setData({
          'formData.images': newImages
        })

        wx.hideLoading()
        wx.showToast({
          title: `上传成功${fileIDs.length}张图片`,
          icon: 'success'
        })
      })
      .catch(err => {
        console.error('上传图片失败:', err)
        wx.hideLoading()
        wx.showToast({
          title: '上传失败',
          icon: 'error'
        })
      })
  },

  // 删除图片
  removeImage(e) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.formData.images]
    images.splice(index, 1)
    this.setData({
      'formData.images': images
    })
  },

  // 全局统一使用图片数组第一项作为菜谱封面
  setCoverImage(e) {
    const index = Number(e.currentTarget.dataset.index)
    const images = [...this.data.formData.images]
    if (!Number.isInteger(index) || index <= 0 || index >= images.length) return

    const [coverImage] = images.splice(index, 1)
    images.unshift(coverImage)
    this.setData({
      'formData.images': images
    })
    wx.showToast({
      title: '已设为封面',
      icon: 'success'
    })
  },

  // 食材相关操作
  onIngredientNameInput(e) {
    const index = e.currentTarget.dataset.index
    const value = e.detail
    this.setData({
      [`formData.ingredients[${index}].name`]: value
    })
  },

  onIngredientAmountInput(e) {
    const index = e.currentTarget.dataset.index
    const value = e.detail
    this.setData({
      [`formData.ingredients[${index}].amount`]: value
    })
  },

  addIngredient() {
    const ingredients = [...this.data.formData.ingredients]
    const newId = `ing_${Date.now()}`
    ingredients.push({ 
      id: newId, 
      name: '', 
      amount: '' 
    })
    this.setData({
      'formData.ingredients': ingredients
    })
  },

  removeIngredient(e) {
    const index = e.currentTarget.dataset.index
    const ingredients = [...this.data.formData.ingredients]
    if (ingredients.length > 1) {
      ingredients.splice(index, 1)
      this.setData({
        'formData.ingredients': ingredients
      })
    }
  },

  // 步骤相关操作
  onStepContentChange(e) {
    const index = e.currentTarget.dataset.index
    const value = e.detail
    this.setData({
      [`formData.steps[${index}].content`]: value
    })
  },

  addStep() {
    const steps = [...this.data.formData.steps]
    const newId = `step_${Date.now()}`
    steps.push({ id: newId, content: '', image: '' })
    this.setData({
      'formData.steps': steps
    })
  },

  removeStep(e) {
    const index = e.currentTarget.dataset.index
    const steps = [...this.data.formData.steps]
    if (steps.length > 1) {
      steps.splice(index, 1)
      this.setData({
        'formData.steps': steps
      })
    }
  },

  // 步骤图片上传
  onStepImageUpload(e) {
    const index = e.currentTarget.dataset.index
    
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.uploadStepImage(tempFilePath, index)
      }
    })
  },

  // 上传步骤图片到云存储
  uploadStepImage(tempFilePath, stepIndex) {
    wx.showLoading({ title: '上传图片中...' })

    const cloudPath = util.buildUserCloudPath('recipes', `steps-${Date.now()}-${Math.random().toString(36).slice(-6)}.jpg`)

    wx.cloud.uploadFile({
      cloudPath,
      filePath: tempFilePath,
      success: (res) => {
        this.setData({
          [`formData.steps[${stepIndex}].image`]: res.fileID
        })
        wx.hideLoading()
        wx.showToast({
          title: '图片上传成功',
          icon: 'success'
        })
      },
      fail: (err) => {
        console.error('上传步骤图片失败:', err)
        wx.hideLoading()
        wx.showToast({
          title: '上传失败',
          icon: 'error'
        })
      }
    })
  },

  // 删除步骤图片
  removeStepImage(e) {
    const index = e.currentTarget.dataset.index
    this.setData({
      [`formData.steps[${index}].image`]: ''
    })
  }
})
