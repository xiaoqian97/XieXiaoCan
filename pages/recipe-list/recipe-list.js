const util = require('../../utils/util')
const { 
  getSceneCategories, 
  getIngredientCategories,
  getCookingMethods,
  getFlavorTypes,
  getSceneCategoryById,
  getIngredientCategoryById,
  getPreparationTimes
} = require('../../utils/tagData')
const cartManager = require('../../utils/cartManager')
const app = getApp()

Page({
  data: {
    recipes: [],
    recipeSections: [],
    loading: true,
    hasMore: true,
    page: 1,
    pageSize: 100,
    recipeScrollTop: 0,
    recipeScrollIntoView: '',
    
    // 搜索相关
    searchValue: '',
    showSearch: false,
    isSearchEmpty: false,
    isSearchLoading: false,
    
    // 筛选相关
    showFilter: false,
    sceneCategories: [],
    ingredientCategories: [],
    cookingMethods: [],
    flavorTypes: [],
    selectedScenes: [],
    selectedIngredients: [],
    activeCategoryId: '',
    selectedOptionalTags: [],
    
    // 高级筛选
    selectedTime: '',
    
    // 制作时间选项（使用公共枚举）
    timeOptions: [],
    
    // 计算属性
    selectedFiltersCount: 0,
    hasActiveFilters: false,
    currentQuickFilterName: '',
    selectedScenesDisplay: [],
    selectedIngredientsDisplay: [],
    selectedOptionalTagsDisplay: [],
    allOptionalTags: [],
    
    currentQuickFilter: null,
    
    // 购物车相关
    cartStats: {
      totalCount: 0,
      selectedCount: 0,
      hasItems: false,
      hasSelected: false
    },
    canCreateRecipe: false,
    canOrder: true,
    needsFixedFeeder: false,
    creatorId: '',
    showDecisionWheel: false,
    wheelOptions: [],
    wheelLights: [],
    wheelGradient: '',
    wheelRotation: 0,
    wheelTransition: false,
    spinDuration: 0,
    isWheelSpinning: false,
    wheelResult: null
  },

  onLoad: function (options) {
    this._recipeDataVersion = app.globalData.recipeDataVersion || 0
    // 初始化分类数据
    this.setData({
      sceneCategories: getSceneCategories(),
      ingredientCategories: getIngredientCategories(),
      cookingMethods: getCookingMethods(),
      flavorTypes: getFlavorTypes(),
      // 初始化时间选项（在正确的this上下文中）
      timeOptions: getPreparationTimes().map(time => ({
        id: time.value,
        label: time.label,
        emoji: this.getTimeEmoji(time.value),
        value: parseInt(time.value)
      })),
      creatorId: ''
    })
    this.updateRecipePermission()
    this.updateComputedData()
    // 初始化购物车统计
    this.updateCartStats()
  },

  onShow: function () {
    const hadLegacyCreatorFilter = Boolean(this.data.creatorId || wx.getStorageSync('recipeListCreatorFilter'))
    wx.removeStorageSync('recipeListCreatorFilter')
    let needsRefresh = !this._hasLoaded || hadLegacyCreatorFilter
    if (hadLegacyCreatorFilter) this.setData({ creatorId: '' })

    this.updateRecipePermission()
    const recipeDataChanged = this._recipeDataVersion !== (app.globalData.recipeDataVersion || 0)
    if (recipeDataChanged) this._recipeDataVersion = app.globalData.recipeDataVersion || 0
    // 更新自定义tabbar的选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 'recipeList'
      })
    }
    
    // 更新购物车统计
    this.updateCartStats()
    
    if (needsRefresh || recipeDataChanged) {
      this.refreshData(recipeDataChanged && !needsRefresh)
      return
    }

    this.syncCartState()
    if (this._viewedRecipeId) {
      const recipeId = this._viewedRecipeId
      this._viewedRecipeId = ''
      this.syncRecipeCard(recipeId)
    }
  },

  onPullDownRefresh: function () {
    this.refreshData()
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore()
    }
  },

  updateRecipePermission: function() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {}
    const isFeeder = ['chef', 'admin'].includes(userInfo.role)
    this.setData({
      canCreateRecipe: isFeeder,
      canOrder: !isFeeder
    })
  },

  refreshData: function(silent = false) {
    this._silentRecipeRefresh = silent
    const isSearchLoading = Boolean(String(this.data.searchValue || '').trim())
    const resetState = {
      page: 1,
      hasMore: true,
      loading: !silent,
      isSearchEmpty: false,
      isSearchLoading
    }
    if (!silent) Object.assign(resetState, {
      recipes: [],
      recipeSections: [],
      recipeScrollTop: 0,
      recipeScrollIntoView: '',
      activeCategoryId: ''
    })
    this.setData(resetState)
    this.loadRecipes()
  },

  loadRecipes: function() {
    const { 
      page, 
      pageSize, 
      searchValue, 
      selectedScenes,
      selectedOptionalTags,
      currentQuickFilter,
      selectedTime,
      creatorId
    } = this.data
    const requestId = (this._recipeRequestId || 0) + 1
    this._recipeRequestId = requestId
    
    // 构建筛选参数
    let sceneCategories = [...selectedScenes]
    if (currentQuickFilter) {
      sceneCategories.push(currentQuickFilter)
    }
    
    // 获取时间筛选的数值
    const timeValue = this.getSelectedTimeValue()
    
    wx.cloud.callFunction({
      name: 'recipe',
      data: {
        action: 'list',
        page,
        pageSize,
        search: searchValue,
        creatorId: creatorId || undefined,
        scope: creatorId ? undefined : 'fixedChef',
        sceneCategories: sceneCategories.length > 0 ? sceneCategories : undefined,
        optionalTags: selectedOptionalTags.length > 0 ? selectedOptionalTags : undefined,
        preparationTime: timeValue ? timeValue : undefined
      }
    }).then(res => {
      if (requestId !== this._recipeRequestId) return
      if (res.result.success) {
        const newRecipes = res.result.data.recipes || []
        if (newRecipes.length > 0) {
        }
        // 格式化菜谱显示数据
        const formattedRecipes = newRecipes.map(recipe => this.formatRecipeForDisplay(recipe))
        return util.resolveCloudImages(formattedRecipes.map(recipe => recipe.images[0])).then(images => {
          if (requestId !== this._recipeRequestId) return
          const resolvedRecipes = formattedRecipes.map((recipe, index) => ({
            ...recipe,
            displayImage: images[index]
          }))
          const recipes = page === 1 ? resolvedRecipes : [...this.data.recipes, ...resolvedRecipes]
          const recipeSections = this.getRecipeSections(recipes)

          this.setData({
            recipes,
            recipeSections,
            needsFixedFeeder: Boolean(res.result.data.needsFixedFeeder),
            isSearchEmpty: page === 1 && !res.result.data.needsFixedFeeder && Boolean(String(searchValue || '').trim()) && recipes.length === 0,
            isSearchLoading: false,
            hasMore: newRecipes.length === pageSize,
            loading: false
          }, () => {
            this._hasLoaded = true
            this.updateCategoryOffsets()
            if (page === 1 && recipeSections.length && !this._silentRecipeRefresh) {
              this.scrollToCategory(recipeSections[0].id)
            }
            this._silentRecipeRefresh = false
          })
          wx.stopPullDownRefresh()
        })
      } else {
        console.error('菜谱列表加载失败:', res.result)
        this.setData({ loading: false, isSearchLoading: false })
        wx.showToast({
        title: res.result.message || '菜谱没翻出来',
          icon: 'none'
        })
      }
      wx.stopPullDownRefresh()
    }).catch(err => {
      if (requestId !== this._recipeRequestId) return
      this.setData({ loading: false, isSearchLoading: false })
      wx.stopPullDownRefresh()
      wx.showToast({
        title: '菜谱没翻出来',
        icon: 'error'
      })
      console.error('加载菜谱列表失败', err)
    })
  },

  loadMore: function() {
    this.setData({
      page: this.data.page + 1,
      loading: true
    })
    this.loadRecipes()
  },

  // 快速筛选
  onQuickFilterChange: function(e) {
    const sceneId = e.currentTarget.dataset.sceneid
    this.setData({
      currentQuickFilter: this.data.currentQuickFilter === sceneId ? null : sceneId,
      selectedScenes: [] // 清空场景筛选，避免冲突
    })
    this.updateComputedData()
    this.refreshData()
  },

  // 菜谱点击
  onRecipeClick: function(e) {
    const { recipeId } = e.detail
    wx.navigateTo({
      url: `/pages/recipe-detail/recipe-detail?id=${recipeId}`,
      success: () => {
        this._viewedRecipeId = recipeId
      }
    })
  },

  syncCartState: function() {
    if (!this.data.recipes.length) return
    const recipes = this.data.recipes.map(recipe => ({
      ...recipe,
      isInCart: cartManager.isInCart(recipe._id),
      isSelected: cartManager.isSelected(recipe._id)
    }))
    this.setData({ recipes, recipeSections: this.getRecipeSections(recipes) })
  },

  syncRecipeCard: function(recipeId) {
    const index = this.data.recipes.findIndex(recipe => recipe._id === recipeId)
    if (index < 0) return
    util.callCloudFunction('recipe', {
      action: 'detail',
      recipeId,
      recordView: false
    }).then(res => {
      const current = this.data.recipes[index]
      const updated = this.formatRecipeForDisplay(res.data || {})
      return util.resolveCloudImage((updated.images || [])[0]).then(displayImage => ({
        ...current,
        ...updated,
        displayImage
      }))
    }).then(updatedRecipe => {
      const recipes = this.data.recipes.map(recipe => recipe._id === recipeId ? updatedRecipe : recipe)
      this.setData({ recipes, recipeSections: this.getRecipeSections(recipes) }, () => this.updateCategoryOffsets())
    }).catch(() => {})
  },

  // 添加菜谱
  onAddClick: function() {
    if (!util.requireLogin('许饭愿或添加菜品需要登录')) return
    if (!this.data.canCreateRecipe) {
      wx.showToast({
        title: '先许个饭愿',
        icon: 'none'
      })
      return
    }
    wx.navigateTo({
      url: '/pages/recipe-form/recipe-form'
    })
  },

  // 搜索功能
  onSearchClick: function() {
    this.setData({
      showSearch: !this.data.showSearch
    })
  },

  onSearchInput: function(e) {
    const searchValue = typeof e.detail === 'string'
      ? e.detail
      : ((e.detail && e.detail.value) || '')
    this.setData({
      searchValue,
      isSearchLoading: Boolean(searchValue.trim()),
      isSearchEmpty: false
    })
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null
      this.refreshData()
    }, 350)
  },

  onSearchConfirm: function(e) {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer)
      this.searchTimer = null
    }
    const value = typeof e.detail === 'string' ? e.detail : this.data.searchValue
    this.setData({
      searchValue: value,
      isSearchLoading: Boolean(String(value || '').trim()),
      isSearchEmpty: false
    }, () => this.refreshData())
  },

  onSearchClear: function() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer)
      this.searchTimer = null
    }
    this.setData({
      searchValue: '',
      showSearch: false,
      isSearchEmpty: false,
      isSearchLoading: false
    }, () => this.refreshData())
  },

  // 筛选功能
  onFilterClick: function() {
    this.setData({
      showFilter: !this.data.showFilter
    })
  },

  // 场景分类选择
  onSceneToggle: function(e) {
    const sceneId = e.currentTarget.dataset.id
    const selectedScenes = [...this.data.selectedScenes]
    const index = selectedScenes.indexOf(sceneId)

    // 检查是否与快速筛选冲突
    if (sceneId === this.data.currentQuickFilter) {
      wx.showToast({
        title: '该场景已在快速筛选中选择',
        icon: 'none'
      })
      return
    }

    if (index !== -1) {
      selectedScenes.splice(index, 1)
    } else {
      if (selectedScenes.length >= 3) {
        wx.showToast({
          title: '最多选择3个场景',
          icon: 'none'
        })
        return
      }
      selectedScenes.push(sceneId)
    }

    this.setData({
      selectedScenes,
      currentQuickFilter: null // 清空快速筛选
    })
    this.updateComputedData()
    this.refreshData()
  },

  // 食材分类选择
  onIngredientToggle: function(e) {
    this.scrollToCategory(e.currentTarget.dataset.id)
  },

  onAllIngredientCategories: function() {
    this.scrollToCategory('')
  },

  // 可选标签选择
  onOptionalTagToggle: function(e) {
    const tagId = e.currentTarget.dataset.id
    const selectedOptionalTags = [...this.data.selectedOptionalTags]
    const index = selectedOptionalTags.indexOf(tagId)

    if (index !== -1) {
      selectedOptionalTags.splice(index, 1)
    } else {
      if (selectedOptionalTags.length >= 5) {
        wx.showToast({
          title: '最多选择5个标签',
          icon: 'none'
        })
        return
      }
      selectedOptionalTags.push(tagId)
    }

    this.setData({
      selectedOptionalTags
    })
    this.updateComputedData()
    this.refreshData()
  },

  // 应用筛选
  onFilterConfirm: function() {
    this.setData({
      showFilter: false
    })
    this.refreshData()
  },

  // 重置筛选
  onFilterReset: function() {
    this.resetAllFilters()
  },

  // 移除选中的筛选条件
  onRemoveScene: function(e) {
    const sceneId = e.currentTarget.dataset.id
    const selectedScenes = this.data.selectedScenes.filter(id => id !== sceneId)
    this.setData({ selectedScenes })
    this.updateComputedData()
    this.refreshData()
  },

  onRemoveIngredient: function(e) {
    const ingredientId = e.currentTarget.dataset.id
    const selectedIngredients = this.data.selectedIngredients.filter(id => id !== ingredientId)
    this.setData({
      selectedIngredients,
      activeCategoryId: selectedIngredients[0] || ''
    })
    this.updateComputedData()
    this.refreshData()
  },

  onRemoveOptionalTag: function(e) {
    const tagId = e.currentTarget.dataset.id
    const selectedOptionalTags = this.data.selectedOptionalTags.filter(id => id !== tagId)
    this.setData({ selectedOptionalTags })
    this.updateComputedData()
    this.refreshData()
  },

  onRemoveQuickFilter: function() {
    this.setData({
      currentQuickFilter: null
    })
    this.updateComputedData()
    this.refreshData()
  },

  // 移除时间筛选
  onRemoveTimeFilter: function() {
    this.setData({
      selectedTime: ''
    })
    this.updateComputedData()
    this.refreshData()
  },


  // 时间筛选
  onTimeFilterToggle: function(e) {
    const timeId = e.currentTarget.dataset.time
    const currentTime = this.data.selectedTime
    
    // 如果点击的是已选中的时间，则取消选择
    const newTime = currentTime === timeId ? '' : timeId
    
    this.setData({
      selectedTime: newTime
    })
    
    this.updateComputedData()
    this.refreshData()
    
    // 获取时间选项信息用于日志
    const timeOption = this.data.timeOptions.find(t => t.id === newTime)
  },


  // 重置所有筛选条件
  onResetAllFilters: function() {
    this.selectComponent('#themeConfirmDialog').open({
      icon: '🧹',
      title: '清空筛选',
      content: '要清空当前口味重新挑吗？',
      confirmText: '清空',
      cancelText: '保留'
    }).then(confirmed => {
      if (confirmed) this.resetAllFilters()
    })
  },

  // 执行重置操作
  resetAllFilters: function() {
    this.setData({
      // 重置快速筛选
      currentQuickFilter: null,
      // 重置场景筛选
      selectedScenes: [],
      // 重置食材筛选
      selectedIngredients: [],
      activeCategoryId: '',
      // 重置可选标签筛选
      selectedOptionalTags: [],
      // 重置时间筛选
      selectedTime: '',
      // 重置搜索
      searchValue: '',
      showSearch: false,
      // 关闭筛选面板
      showFilter: false
    })
    
    // 更新计算属性
    this.updateComputedData()
    
    // 刷新数据
    this.refreshData()
    
    // 显示提示
    wx.showToast({
      title: '已清空筛选',
      icon: 'success',
      duration: 1500
    })
  },

  // 更新计算属性
  updateComputedData: function() {
    const { selectedScenes, selectedIngredients, selectedOptionalTags, currentQuickFilter, selectedTime, sceneCategories, ingredientCategories, cookingMethods, flavorTypes, timeOptions } = this.data
    let count = selectedScenes.length + selectedIngredients.length + selectedOptionalTags.length
    if (currentQuickFilter) count += 1
    if (selectedTime) count += 1
    
    // 计算当前快速筛选的名称
    let currentQuickFilterName = ''
    if (currentQuickFilter) {
      const quickFilter = sceneCategories.find(f => f.id === currentQuickFilter)
      currentQuickFilterName = quickFilter ? quickFilter.shortName : ''
    }
    
    // 计算当前时间筛选的标签
    let selectedTimeLabel = ''
    if (selectedTime) {
      const timeOption = timeOptions.find(t => t.id === selectedTime)
      selectedTimeLabel = timeOption ? timeOption.label : ''
    }
    
    // 计算选中场景的显示名称
    const selectedScenesDisplay = selectedScenes.map(sceneId => {
      const scene = sceneCategories.find(s => s.id === sceneId)
      return scene ? scene.name : ''
    })
    
    // 计算选中食材的显示名称
    const selectedIngredientsDisplay = selectedIngredients.map(ingredientId => {
      const ingredient = ingredientCategories.find(i => i.id === ingredientId)
      return ingredient ? ingredient.name : ''
    })
    
    // 计算选中可选标签的显示名称
    const allOptionalTags = [...cookingMethods, ...flavorTypes]
    const selectedOptionalTagsDisplay = selectedOptionalTags.map(tagId => {
      const tag = allOptionalTags.find(t => t.id === tagId)
      return tag ? tag.name : ''
    })

    const isOptionalTagSelected = tag => selectedOptionalTags.includes(tag.id)
    
    this.setData({
      selectedFiltersCount: count,
      hasActiveFilters: count > 0,
      currentQuickFilterName: currentQuickFilterName,
      selectedTimeLabel: selectedTimeLabel,
      selectedScenesDisplay: selectedScenesDisplay,
      selectedIngredientsDisplay: selectedIngredientsDisplay,
      selectedOptionalTagsDisplay: selectedOptionalTagsDisplay,
      allOptionalTags: allOptionalTags,
      cookingMethods: cookingMethods.map(tag => ({ ...tag, selected: isOptionalTagSelected(tag) })),
      flavorTypes: flavorTypes.map(tag => ({ ...tag, selected: isOptionalTagSelected(tag) }))
    })
  },

  // 获取选中筛选条件的总数
  getSelectedFiltersCount: function() {
    const { selectedScenes, selectedIngredients, selectedOptionalTags, currentQuickFilter } = this.data
    let count = selectedScenes.length + selectedIngredients.length + selectedOptionalTags.length
    if (currentQuickFilter) count += 1
    return count
  },

  // 检查是否有筛选条件
  hasActiveFilters: function() {
    return this.getSelectedFiltersCount() > 0
  },

  // 获取选中时间的数值（分钟）
  getSelectedTimeValue: function() {
    const { selectedTime, timeOptions } = this.data
    if (!selectedTime) return null
    
    const timeOption = timeOptions.find(t => t.id === selectedTime)
    return timeOption ? timeOption.value : null
  },

  // 根据时间值获取对应的emoji
  getTimeEmoji: function(timeValue) {
    const time = parseInt(timeValue)
    if (time <= 10) return '⏱️' // 10分钟
    if (time <= 30) return '⏰' // 30分钟
    if (time <= 60) return '🕐' // 1小时
    return '🕒' // 2小时以上
  },

  // 格式化菜谱显示数据
  formatRecipeForDisplay: function(recipe) {
    // 获取场景和食材分类的显示信息
    const sceneCategory = getSceneCategoryById(recipe.sceneCategory)
    const ingredientCategory = getIngredientCategoryById(recipe.ingredientCategory)
    const ratingCount = Number(recipe.ratingCount || 0)
    const ratingTotal = Number(recipe.ratingTotal || 0)
    
    // 检查购物车状态
    const isInCart = cartManager.isInCart(recipe._id)
    const isSelected = cartManager.isSelected(recipe._id)
    
    return {
      ...recipe,
      images: Array.isArray(recipe.images) && recipe.images.length ? recipe.images : ['/images/default-recipe.jpg'],
      sceneDisplay: sceneCategory ? sceneCategory.shortName : '',
      ingredientDisplay: ingredientCategory ? ingredientCategory.name : '',
      preparationTimeDisplay: recipe.preparationTime ? recipe.preparationTime.label : '',
      difficultyDisplay: recipe.difficulty ? recipe.difficulty.label : '',
      servingSizeDisplay: recipe.servingSize ? recipe.servingSize.label : '',
      ratingAverage: ratingCount > 0 ? (ratingTotal / ratingCount).toFixed(1) : '',
      isInCart: isInCart,
      isSelected: isSelected
    }
  },

  getRecipeSections: function(recipes) {
    return this.data.ingredientCategories.map(category => ({
      ...category,
      recipes: recipes.filter(recipe => recipe.ingredientCategory === category.id)
    })).filter(section => section.recipes.length > 0)
  },

  scrollToCategory: function(categoryId) {
    this.setData({
      activeCategoryId: categoryId,
      recipeScrollIntoView: ''
    }, () => {
      this.setData({ recipeScrollIntoView: `category-${categoryId || 'all'}` })
    })
  },

  updateCategoryOffsets: function() {
    const query = wx.createSelectorQuery()
    query.select('.recipe-scroll').boundingClientRect()
    query.selectAll('.recipe-section').boundingClientRect()
    query.exec(([containerRect, sectionRects]) => {
      if (!containerRect || !sectionRects) return
      this._categoryOffsets = sectionRects.map(section => ({
        id: section.id.replace('category-', ''),
        top: section.top - containerRect.top + (this._recipeScrollTop || 0)
      }))
    })
  },

  onRecipeScroll: function(e) {
    const scrollTop = e.detail.scrollTop
    this._recipeScrollTop = scrollTop
    const currentSection = (this._categoryOffsets || []).filter(section => section.top <= scrollTop + 8).pop()
    if (currentSection && currentSection.id !== this.data.activeCategoryId) {
      this.setData({ activeCategoryId: currentSection.id })
    }
  },

  onOpenDecisionWheel: function() {
    if (!util.requireLogin('今天吃什么需要登录后使用')) return
    if (this.data.loading) {
      wx.showToast({ title: '菜谱还在加载中', icon: 'none' })
      return
    }

    const candidates = this.data.recipes.filter(recipe => !recipe.isInCart)
    if (!candidates.length) {
      wx.showToast({
        title: this.data.recipes.length ? '可选菜品都在饭篮里了' : '暂时没有可抽取的菜谱',
        icon: 'none'
      })
      return
    }

    const shuffled = [...candidates]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1))
      const current = shuffled[index]
      shuffled[index] = shuffled[randomIndex]
      shuffled[randomIndex] = current
    }

    const options = shuffled.slice(0, 16)
    const sectorAngle = 360 / options.length
    const labelRadius = options.length <= 3
      ? 122
      : (options.length === 4 ? 132 : (options.length <= 6 ? 143 : (options.length <= 8 ? 151 : (options.length <= 12 ? 160 : 166))))
    const labelWidth = options.length <= 3
      ? 154
      : (options.length <= 5 ? 126 : (options.length <= 8 ? 102 : (options.length <= 12 ? 78 : 60)))
    const labelHeight = options.length <= 8 ? 72 : (options.length <= 12 ? 68 : 66)
    const labelFontSize = options.length <= 8 ? 23 : (options.length <= 12 ? 20 : 17)
    const maxNameLength = options.length <= 8 ? 8 : 6
    const wheelOptions = options.map((recipe, index) => ({
      ...recipe,
      labelAngle: index * sectorAngle + sectorAngle / 2,
      labelX: Number((Math.sin((index * sectorAngle + sectorAngle / 2) * Math.PI / 180) * labelRadius).toFixed(2)),
      labelY: Number((-Math.cos((index * sectorAngle + sectorAngle / 2) * Math.PI / 180) * labelRadius).toFixed(2)),
      labelWidth,
      labelHeight,
      labelFontSize,
      wheelName: recipe.name.length > maxNameLength ? `${recipe.name.slice(0, maxNameLength)}…` : recipe.name
    }))
    const colors = ['#FFD22E', '#FFF0A0', '#FFC52C', '#FFE986', '#FFD83F', '#FFF2AA', '#FBC12A', '#FFE580']
    const gradientSegments = wheelOptions.map((item, index) => {
      const start = index * sectorAngle
      const end = (index + 1) * sectorAngle
      return `${colors[index % colors.length]} ${start}deg ${end}deg`
    })
    const wheelLights = Array.from({ length: 20 }, (item, index) => {
      const angle = index * 18
      const radians = angle * Math.PI / 180
      return {
        angle,
        offsetX: Number((Math.sin(radians) * 220).toFixed(2)),
        offsetY: Number((-Math.cos(radians) * 220).toFixed(2)),
        large: index % 2 === 0
      }
    })

    this.setData({
      showDecisionWheel: true,
      wheelOptions,
      wheelLights,
      wheelGradient: `conic-gradient(${gradientSegments.join(', ')})`,
      wheelRotation: 0,
      wheelTransition: false,
      spinDuration: 0,
      isWheelSpinning: false,
      wheelResult: null
    }, () => this.setTabBarHidden(true))
  },

  onSpinWheel: function() {
    if (this.data.isWheelSpinning || !this.data.wheelOptions.length) return

    const optionCount = this.data.wheelOptions.length
    const selectedIndex = Math.floor(Math.random() * optionCount)
    const sectorAngle = 360 / optionCount
    const duration = 3000 + Math.floor(Math.random() * 2001)
    const extraTurns = 6 + Math.floor(Math.random() * 3)
    const currentRotation = Number(this.data.wheelRotation || 0)
    const currentAngle = ((currentRotation % 360) + 360) % 360
    const selectedCenter = selectedIndex * sectorAngle + sectorAngle / 2
    const targetAngle = (360 - selectedCenter) % 360
    const adjustment = (targetAngle - currentAngle + 360) % 360
    const targetRotation = currentRotation + extraTurns * 360 + adjustment

    if (this._wheelTimer) clearTimeout(this._wheelTimer)
    this.setData({
      isWheelSpinning: true,
      wheelResult: null,
      wheelTransition: true,
      spinDuration: duration,
      wheelRotation: targetRotation
    })

    this._wheelTimer = setTimeout(() => {
      this._wheelTimer = null
      this.setData({
        isWheelSpinning: false,
        wheelResult: this.data.wheelOptions[selectedIndex]
      })
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
    }, duration + 80)
  },

  onConfirmWheelResult: function() {
    const recipe = this.data.wheelResult
    if (!recipe || this.data.isWheelSpinning) return

    this.setData({ showDecisionWheel: false })
    this.setTabBarHidden(false)
    this.onAddToCart({
      currentTarget: {
        dataset: { recipeId: recipe._id }
      }
    })
  },

  onCloseDecisionWheel: function() {
    if (this.data.isWheelSpinning) return
    this.setData({ showDecisionWheel: false })
    this.setTabBarHidden(false)
  },

  stopEvent: function() {},

  setTabBarHidden: function(hidden) {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) tabBar.setData({ hidden })
  },

  // 更新购物车统计信息
  updateCartStats: function() {
    const cartStats = cartManager.getCartStats()
    this.setData({
      cartStats: cartStats
    })
  },

  // 添加菜谱到购物车
  onAddToCart: function(e) {
    if (!this.data.canOrder) {
      util.showError('投喂官无需点菜，请在投喂单中处理需求')
      return
    }
    if (!util.requireLogin('把菜加入饭篮需要登录')) return
    const recipeId = e.currentTarget.dataset.recipeId
    const recipe = this.data.recipes.find(r => r._id === recipeId)
    
    if (!recipe) {
      wx.showToast({
        title: '这道菜信息不完整',
        icon: 'error'
      })
      return
    }

    const result = cartManager.addToCart(recipe)
    if (result.success) {
      // 更新菜谱的购物车状态
      const recipes = this.data.recipes.map(r => {
        if (r._id === recipeId) {
          return {
            ...r,
            isInCart: true,
            isSelected: false
          }
        }
        return r
      })
      
      this.setData({
        recipes,
        recipeSections: this.getRecipeSections(recipes)
      })
      
      // 更新购物车统计
      this.updateCartStats()
      
      wx.showToast({
        title: result.message || '已放进饭篮',
        icon: 'success',
        duration: 1500
      })
    } else {
      wx.showToast({
        title: result.message || '没放进去',
        icon: 'none',
        duration: 2000
      })
    }
  },

  // 从购物车移除菜谱
  onRemoveFromCart: function(e) {
    if (!this.data.canOrder) return
    if (!util.requireLogin('管理饭篮需要登录')) return
    const recipeId = e.currentTarget.dataset.recipeId
    
    const success = cartManager.removeFromCart(recipeId)
    if (success) {
      // 更新菜谱的购物车状态
      const recipes = this.data.recipes.map(r => {
        if (r._id === recipeId) {
          return {
            ...r,
            isInCart: false,
            isSelected: false
          }
        }
        return r
      })
      
      this.setData({
        recipes,
        recipeSections: this.getRecipeSections(recipes)
      })
      
      // 更新购物车统计
      this.updateCartStats()
      
      wx.showToast({
        title: '已从饭篮拿出',
        icon: 'success',
        duration: 1500
      })
    } else {
      wx.showToast({
        title: '没拿出来',
        icon: 'error'
      })
    }
  },

  // 跳转到点餐页面
  onGoToCart: function() {
    if (!this.data.canOrder) {
      wx.switchTab({ url: '/pages/order-list/order-list' })
      return
    }
    wx.switchTab({
      url: '/pages/diancan/diancan'
    })
  },

  onSubmitOrder: function() {
    if (this.data.cartStats.totalCount === 0) {
      wx.showToast({
        title: '请先选择菜品',
        icon: 'none'
      })
      return
    }

    this.onGoToCart()
  },

  goSetFixedFeeder: function() {
    wx.navigateTo({ url: '/pages/friends/friends' })
  },

  // 处理购物车操作事件
  onCartAction: function(e) {
    if (!this.data.canOrder) return
    const { recipeId, isInCart } = e.detail
    
    if (isInCart) {
      // 从购物车移除
      this.onRemoveFromCart({ currentTarget: { dataset: { recipeId } } })
    } else {
      // 添加到购物车
      this.onAddToCart({ currentTarget: { dataset: { recipeId } } })
    }
  },

  onUnload: function() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    if (this._wheelTimer) clearTimeout(this._wheelTimer)
    this.setTabBarHidden(false)
    this._recipeRequestId = (this._recipeRequestId || 0) + 1
  },

  onHide: function() {
    if (this._wheelTimer) {
      clearTimeout(this._wheelTimer)
      this._wheelTimer = null
    }
    if (this.data.showDecisionWheel) {
      this.setData({
        showDecisionWheel: false,
        isWheelSpinning: false,
        wheelResult: null
      })
    }
    this.setTabBarHidden(false)
  }
})
