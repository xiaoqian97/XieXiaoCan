const app = getApp()
const util = require('../../utils/util')
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

Page({
  data: {
    loading: false,
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
    imageRequiredClass: 'required',
    nameLabel: '这道菜叫什么',
    descriptionLabel: '馋点备注',
    descriptionPlaceholder: '简单说说这道菜需要特别注意啥...',
    optionalSuffix: '',
    ingredientRequiredClass: 'required',
    stepRequiredClass: 'required',
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
    showMoreTags: false,
    
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
    }
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
        stepRequiredClass: 'required',
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
        imageRequiredClass: 'required',
        nameLabel: '菜品名称',
        descriptionLabel: '馋点备注',
        descriptionPlaceholder: '修改这道菜需要特别注意的地方...',
        optionalSuffix: '',
        ingredientRequiredClass: 'required',
        stepRequiredClass: 'required',
        showRecipePrivacy: false,
        showCookingInfo: true,
        footerClass: ''
      }
    }

    return {
      navTitle: '添一道拿手菜',
      submitText: '添一道拿手菜',
      imageLabel: '先来张馋图',
      imageRequiredClass: 'required',
      nameLabel: '这道菜叫什么',
      descriptionLabel: '馋点备注',
      descriptionPlaceholder: '简单说说这道菜需要特别注意啥...',
      optionalSuffix: '',
      ingredientRequiredClass: 'required',
      stepRequiredClass: 'required',
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
    wx.showLoading({ title: '加载中...' })
    
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
              optionalTags: optionalTags,
              ingredients: recipe.ingredients || [{ id: 'ing_1', name: '', amount: '' }],
              steps: recipe.steps || [{ id: 'step_1', content: '', image: '' }],
              isPublic: recipe.isPublic !== false
            },
            cookingMethods: cookingMethods,
            flavorTypes: flavorTypes,
            submitText: recipe.status === 'draft' ? '保存并发布' : '保存修改',
            draftText: '保存草稿',
            showDraftAction: recipe.status === 'draft',
            footerClass: recipe.status === 'draft' ? '' : 'single-action'
          })
          // 调试：确认编辑模式下的optionalTags
        }
      },
      fail: (err) => {
        console.error('加载菜谱失败:', err)
        wx.showToast({
          title: '菜谱没翻出来',
          icon: 'error'
        })
      },
      complete: () => {
        wx.hideLoading()
      }
    })
  },

  loadWishData(wishId) {
    wx.showLoading({ title: '饭愿加载中...' })

    wx.cloud.callFunction({
      name: 'wish',
      data: {
        action: 'detail',
        wishId
      },
      success: (res) => {
        if (res.result.success) {
          this.applyRecordToForm(res.result.data)
        } else {
          wx.showToast({
            title: res.result.message || '饭愿没加载出来',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        console.error('加载饭愿失败:', err)
        wx.showToast({
          title: '饭愿没加载出来',
          icon: 'error'
        })
      },
      complete: () => {
        wx.hideLoading()
      }
    })
  },

  applyRecordToForm(record) {
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
        steps: record.steps && record.steps.length ? record.steps : [{ id: 'step_1', content: '', image: '' }],
        isPublic: true
      },
      cookingMethods,
      flavorTypes,
      showMoreTags: optionalTags.length > 0
    })
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
           formData.ingredients.some(ing => ing && ing.name && ing.amount && (ing.name.trim() || ing.amount.trim())) ||
           formData.steps.some(step => step && step.content && step.content.trim())
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
    this.saveRecipe(false)
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

    // 发布时的额外验证
    if (isPublish && !this.data.isWishMode && !this.validateForPublish()) {
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
          const successMessage = this.data.isEditMode 
            ? (isPublish ? '这道菜更新好了' : '先替你存好了')
            : (isPublish ? '已加入菜谱' : '先替你存好了')
          
          wx.showToast({
            title: successMessage,
            icon: 'success'
          })
          
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
    const hasStep = formData.steps.some(step => step && step.content && step.content.trim())

    if (!hasIngredient) {
      errors.push('请补上备菜清单')
    }
    if (!hasStep) {
      errors.push('请写下投喂步骤')
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

  // 发布时的额外验证
  validateForPublish() {
    const { formData } = this.data

    if (formData.images.length === 0) {
      wx.showToast({
        title: '先来一张馋图',
        icon: 'none'
      })
      return false
    }

    // 验证所有步骤都有内容
    for (let i = 0; i < formData.steps.length; i++) {
      if (!formData.steps[i].content.trim()) {
        wx.showToast({
          title: `第${i + 1}步还没写`,
          icon: 'none'
        })
        return false
      }
    }

    return true
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
        const cloudPath = `recipes/${Date.now()}-${index}-${Math.random().toString(36).slice(-6)}.jpg`

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

    const cloudPath = `steps/${Date.now()}-${Math.random().toString(36).slice(-6)}.jpg`

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
