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
const app = getApp()

Page({
  data: {
    recipes: [],
    loading: true,
    hasMore: true,
    page: 1,
    pageSize: 10,
    
    // 搜索相关
    searchValue: '',
    showSearch: false,
    
    // 筛选相关
    showFilter: false,
    sceneCategories: [],
    ingredientCategories: [],
    cookingMethods: [],
    flavorTypes: [],
    selectedScenes: [],
    selectedIngredients: [],
    selectedOptionalTags: [],
    
    // 高级筛选
    selectedTime: '',
    
    // 状态筛选
    selectedStatus: 'all', // all, draft, published
    
    // 状态筛选选项
    statusOptions: [
      { id: 'all', name: '全部', count: 0 },
      { id: 'published', name: '已发布', count: 0 },
      { id: 'draft', name: '草稿', count: 0 },
    ],
    
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
    canCreateRecipe: false,
    isPrimaryAdmin: false,
    needsFixedFeeder: false,
    showFavoriteModal: false,
    favoriteModalRecipeId: '',
    favoriteModalTitle: '',
    favoriteUserTotal: 0,
    favoriteUsers: [],
    showViewerModal: false,
    viewerModalRecipeId: '',
    viewerModalTitle: '',
    viewerUserTotal: 0,
    viewerUsers: []
  },

  onLoad: function (options) {
    this._recipeDataVersion = app.globalData.recipeDataVersion || 0
    if (!util.requireLogin('查看我的菜谱需要登录')) {
      this.setData({ loading: false })
      return
    }
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
      }))
    })
    this.updateRecipePermission()
    this.updateComputedData()
    this.loadRecipes()
  },

  onShow: function () {
    if (!util.isLoggedIn()) return
    const recipeDataChanged = this._recipeDataVersion !== (app.globalData.recipeDataVersion || 0)
    if (recipeDataChanged) this._recipeDataVersion = app.globalData.recipeDataVersion || 0
    this.updateRecipePermission()
    // 更新自定义tabbar的选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 'recipeList'
      })
    }
    
    if (this._needsFullRefresh || recipeDataChanged) {
      this._needsFullRefresh = false
      this.refreshData(true)
      return
    }
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
    this.setData({
      canCreateRecipe: ['chef', 'admin'].includes(userInfo.role),
      isPrimaryAdmin: Boolean(userInfo.isPrimaryAdmin)
    })
  },

  refreshData: function(silent = false) {
    const resetState = {
      page: 1,
      hasMore: true,
      loading: !silent
    }
    if (!silent) resetState.recipes = []
    this.setData(resetState)
    this.loadRecipes()
  },

  loadRecipes: function() {
    const { 
      page, 
      pageSize, 
      searchValue, 
      selectedScenes,
      selectedIngredients,
      selectedOptionalTags,
      currentQuickFilter,
      selectedTime,
      selectedStatus
    } = this.data
    
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
        action: 'myRecipes',
        page,
        pageSize,
        search: searchValue,
        sceneCategories: sceneCategories.length > 0 ? sceneCategories : undefined,
        ingredientCategories: selectedIngredients.length > 0 ? selectedIngredients : undefined,
        optionalTags: selectedOptionalTags.length > 0 ? selectedOptionalTags : undefined,
        preparationTime: timeValue ? timeValue : undefined,
        status: selectedStatus !== 'all' ? selectedStatus : undefined
      }
    }).then(res => {
      if (res.result.success) {
        const payload = res.result.data || {}
        const newRecipes = payload.recipes || []
        if (newRecipes.length > 0) {
        }
        // 格式化菜谱显示数据
        const formattedRecipes = newRecipes.map(recipe => this.formatRecipeForDisplay(recipe))
        
        this.setData({
          recipes: page === 1 ? formattedRecipes : [...this.data.recipes, ...formattedRecipes],
          hasMore: newRecipes.length === pageSize,
          needsFixedFeeder: Boolean(payload.needsFixedFeeder),
          loading: false
        })
        this._hasLoaded = true
      } else {
        console.error('菜谱列表加载失败:', res.result)
        this.setData({ loading: false })
        wx.showToast({
          title: res.result.message || '加载失败',
          icon: 'none'
        })
      }
      wx.stopPullDownRefresh()
    }).catch(err => {
      this.setData({ loading: false })
      wx.stopPullDownRefresh()
      wx.showToast({
        title: '加载失败',
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
      currentQuickFilter: sceneId,
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
      this.setData({ [`recipes[${index}]`]: { ...current, ...updated } })
    }).catch(() => {})
  },

  onFavoriteInfo: function(e) {
    const recipe = e.detail && e.detail.recipe
    if (!recipe) return
    const users = (Array.isArray(recipe.favoriteUsers) ? recipe.favoriteUsers : []).slice(0, 20)
    this.setData({
      showFavoriteModal: true,
      favoriteModalRecipeId: recipe._id || '',
      favoriteModalTitle: recipe.name || '这道菜',
      favoriteUserTotal: Number(recipe.favoriteCount || users.length),
      favoriteUsers: users.map(user => ({
        ...user,
        displayAvatar: util.DEFAULT_AVATAR
      }))
    })

    util.resolveCloudImages(users.map(user => user.avatar), util.DEFAULT_AVATAR).then(avatars => {
      if (!this.data.showFavoriteModal || this.data.favoriteModalRecipeId !== (recipe._id || '')) return
      this.setData({
        favoriteUsers: users.map((user, index) => ({ ...user, displayAvatar: avatars[index] }))
      })
    })
  },

  closeFavoriteModal: function() {
    this.setData({ showFavoriteModal: false })
  },

  onViewerInfo: function(e) {
    if (!this.data.isPrimaryAdmin) return
    const recipe = e.detail && e.detail.recipe
    if (!recipe || !recipe._id) return
    this.setData({
      showViewerModal: true,
      viewerModalRecipeId: recipe._id,
      viewerModalTitle: recipe.name || '这道菜',
      viewerUserTotal: 0,
      viewerUsers: []
    })
    util.callCloudFunction('recipe', {
      action: 'getViewers',
      recipeId: recipe._id
    }).then(payload => {
      if (!this.data.showViewerModal || this.data.viewerModalRecipeId !== recipe._id) return
      const data = payload.data || {}
      const users = Array.isArray(data.viewers) ? data.viewers : []
      this.setData({
        viewerUserTotal: Number(data.total || 0),
        viewerUsers: users.map(user => ({ ...user, displayAvatar: util.DEFAULT_AVATAR }))
      })
      return util.resolveCloudImages(users.map(user => user.avatar), util.DEFAULT_AVATAR).then(avatars => {
        if (!this.data.showViewerModal || this.data.viewerModalRecipeId !== recipe._id) return
        this.setData({
          viewerUsers: users.map((user, index) => ({ ...user, displayAvatar: avatars[index] }))
        })
      })
    }).catch(error => {
      if (this.data.showViewerModal && this.data.viewerModalRecipeId === recipe._id) {
        this.setData({ showViewerModal: false })
        wx.showToast({ title: error.message || '加载查看者失败', icon: 'none' })
      }
    })
  },

  closeViewerModal: function() {
    this.setData({ showViewerModal: false })
  },

  stopPropagation: function() {
  },

  // 添加菜谱
  onAddClick: function() {
    if (!this.data.canCreateRecipe) {
      wx.showToast({
        title: '先许个饭愿',
        icon: 'none'
      })
      return
    }
    wx.navigateTo({
      url: '/pages/recipe-form/recipe-form',
      success: () => {
        this._needsFullRefresh = true
      }
    })
  },

  // 搜索功能
  onSearchClick: function() {
    this.setData({
      showSearch: !this.data.showSearch
    })
  },

  onSearchInput: function(e) {
    this.setData({
      searchValue: e.detail
    })
  },

  onSearchConfirm: function() {
    this.refreshData()
  },

  onSearchClear: function() {
    this.setData({
      searchValue: '',
      showSearch: false
    })
    this.refreshData()
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
    const ingredientId = e.currentTarget.dataset.id
    const selectedIngredients = [...this.data.selectedIngredients]
    const index = selectedIngredients.indexOf(ingredientId)

    if (index !== -1) {
      selectedIngredients.splice(index, 1)
    } else {
      if (selectedIngredients.length >= 3) {
        wx.showToast({
          title: '最多选择3个食材',
          icon: 'none'
        })
        return
      }
      selectedIngredients.push(ingredientId)
    }

    this.setData({
      selectedIngredients
    })
    this.updateComputedData()
    this.refreshData()
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
    this.setData({ selectedIngredients })
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

  // 状态筛选
  onStatusFilterChange: function(e) {
    const statusId = e.currentTarget.dataset.status
    this.setData({
      selectedStatus: statusId
    })
    this.refreshData()
  },


  // 重置所有筛选条件
  onResetAllFilters: function() {
    this.selectComponent('#themeConfirmDialog').open({
      icon: '🧹',
      title: '重置筛选',
      content: '确定要清空所有筛选条件吗？',
      confirmText: '重置',
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
      title: '已重置筛选条件',
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
    
    this.setData({
      selectedFiltersCount: count,
      hasActiveFilters: count > 0,
      currentQuickFilterName: currentQuickFilterName,
      selectedTimeLabel: selectedTimeLabel,
      selectedScenesDisplay: selectedScenesDisplay,
      selectedIngredientsDisplay: selectedIngredientsDisplay,
      selectedOptionalTagsDisplay: selectedOptionalTagsDisplay,
      allOptionalTags: allOptionalTags
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
    
    return {
      ...recipe,
      sceneDisplay: sceneCategory ? sceneCategory.shortName : '',
      ingredientDisplay: ingredientCategory ? ingredientCategory.name : '',
      preparationTimeDisplay: recipe.preparationTime ? recipe.preparationTime.label : '',
      difficultyDisplay: recipe.difficulty ? recipe.difficulty.label : '',
      servingSizeDisplay: recipe.servingSize ? recipe.servingSize.label : '',
      ratingAverage: ratingCount > 0 ? (ratingTotal / ratingCount).toFixed(1) : ''
    }
  }
})
