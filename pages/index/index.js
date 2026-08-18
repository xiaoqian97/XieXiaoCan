const app = getApp()
const util = require('../../utils/util')
const share = require('../../utils/share')
const cartManager = require('../../utils/cartManager')

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,
    isChef: false,
    canIUseGetUserProfile: false,
    recommendRecipes: [],
    recommendNeedsFixedFeeder: false,
    loading: true,
    showLoginPrompt: false,
    promptContent: '',
    isDataLoaded: false
  },

  onLoad: function () {
    this._initialLoadStarted = true
    this._recipeDataVersion = app.globalData.recipeDataVersion || 0
    this.checkLoginAndLoad()
  },

  onShow: function () {
    // 只在数据未加载时才检查登录和加载数据
    if (!this.data.isDataLoaded && !this._initialLoadStarted) {
      this.checkLoginAndLoad()
    } else {
      const identityChanged = this.updateUserRole()
      if (this.data.isDataLoaded && identityChanged) {
        this.setData({ recommendRecipes: [], recommendNeedsFixedFeeder: false })
        this.loadRecommendRecipes()
      } else if (this._recipeDataVersion !== (app.globalData.recipeDataVersion || 0)) {
        this._recipeDataVersion = app.globalData.recipeDataVersion || 0
        this.loadRecommendRecipes(true)
      } else if (this._viewedRecipeId) {
        const recipeId = this._viewedRecipeId
        this._viewedRecipeId = ''
        this.refreshRecipeViewCount(recipeId)
      } else if (this._needsRecommendRefresh) {
        this._needsRecommendRefresh = false
        this.loadRecommendRecipes(true)
      }
    }
    
    // 更新自定义tabbar的选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      const tabBar = this.getTabBar()
      if (tabBar.data.selected !== 'home') tabBar.setData({ selected: 'home' })
    }
  },

  // 检查登录状态并加载数据
  checkLoginAndLoad: function() {
    // 允许预览模式访问
    if (app.globalData.isPreviewMode) {
      this.setData({
        userInfo: app.globalData.userInfo,
        hasUserInfo: false,
        isPreviewMode: true,
        isChef: false
      })
      this.loadRecommendRecipes()
      return
    }

    // 检查是否已登录
    if (app.isLoggedIn()) {
      // 已登录，更新用户信息并加载数据
      this.setData({
        userInfo: app.globalData.userInfo,
        hasUserInfo: true,
        isPreviewMode: false,
        isChef: this.isChefUser(app.globalData.userInfo)
      })
      this.loadRecommendRecipes()
    } else {
      // 未登录用户可先浏览首页；仅在使用需身份的功能时主动登录。
      this.setData({
        userInfo: wx.getStorageSync('userInfo') || null,
        hasUserInfo: false,
        isPreviewMode: false,
        isChef: false,
        showLoginPrompt: false
      })
      this.loadRecommendRecipes()
    }
  },

  updateUserRole: function() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo')
    const current = this.data.userInfo || {}
    if (!userInfo) {
      const changed = Boolean(current.openid || this.data.hasUserInfo)
      if (changed) this.setData({ userInfo: null, hasUserInfo: false, isChef: false })
      return changed
    }
    const isChef = this.isChefUser(userInfo)
    const hasUserInfo = app.isLoggedIn()
    const userChanged = ['openid', 'nickname', 'avatar', 'role', 'isAdmin', 'fixedFeederOpenid']
      .some(key => current[key] !== userInfo[key])
    const identityChanged = current.openid !== userInfo.openid ||
      current.role !== userInfo.role ||
      this.data.hasUserInfo !== hasUserInfo ||
      current.fixedFeederOpenid !== userInfo.fixedFeederOpenid
    const updates = {}
    if (userChanged) updates.userInfo = userInfo
    if (this.data.isChef !== isChef) updates.isChef = isChef
    if (this.data.hasUserInfo !== hasUserInfo) updates.hasUserInfo = hasUserInfo
    if (Object.keys(updates).length) this.setData(updates)
    return identityChanged
  },

  isChefUser: function(userInfo) {
    return !!(userInfo && ['chef', 'admin'].includes(userInfo.role))
  },


  loadRecommendRecipes: function(silent = false) {
    const requestId = (this._recommendRequestId || 0) + 1
    this._recommendRequestId = requestId
    if (!silent) this.setData({ loading: true })
    util.callCloudFunction('recipe', {
      action: 'recommend',
      limit: 6,
      scope: this.data.hasUserInfo ? 'account' : 'public'
    }).then(res => {
      if (requestId !== this._recommendRequestId) return null
      const rawRecipes = ((res.data && res.data.recipes) || []).map(recipe => this.formatRecommendRecipe(recipe))
      const needsFixedFeeder = Boolean(res.data && res.data.needsFixedFeeder)
      return util.resolveCloudImages(rawRecipes.map(recipe => recipe.image)).then(images => ({
        recipes: rawRecipes.map((recipe, index) => ({ ...recipe, image: images[index] })),
        needsFixedFeeder
      }))
    }).then(result => {
      if (!result || requestId !== this._recommendRequestId) return
      this.setData({
        recommendRecipes: result.recipes,
        recommendNeedsFixedFeeder: result.needsFixedFeeder,
        loading: false,
        isDataLoaded: true
      }, () => this.loadFavoriteStatuses())
    }).catch(err => {
      if (requestId !== this._recommendRequestId) return
      console.error('加载推荐菜谱失败:', err)
      this.setData({
        recommendRecipes: [],
        recommendNeedsFixedFeeder: false,
        loading: false,
        isDataLoaded: true
      })
    })
  },

  formatRecommendRecipe: function(recipe) {
    const images = Array.isArray(recipe.images) ? recipe.images : []
    const cookTime = recipe.preparationTime && recipe.preparationTime.value
      ? parseInt(recipe.preparationTime.value, 10)
      : 30
    const ratingCount = Number(recipe.ratingCount || 0)
    const ratingTotal = Number(recipe.ratingTotal || 0)
    const ratingAverage = ratingCount > 0 ? (ratingTotal / ratingCount).toFixed(1) : ''
    const viewCount = Number(recipe.viewCount || 0)

    return {
      _id: recipe._id,
      title: recipe.name || recipe.title || '还没起名的菜',
      description: recipe.description || '等你来安排这一口',
      image: images[0] || recipe.image || '/images/default-recipe.jpg',
      cookTime: Number.isFinite(cookTime) ? cookTime : 30,
      ratingAverage,
      ratingCount,
      viewCount,
      viewCountDisplay: this.formatCount(viewCount),
      isFavorited: false,
      favoriteLoading: false,
      isVegetarian: recipe.ingredientCategory === 'vegetable'
    }
  },

  formatCount: function(count) {
    if (count >= 10000) return `${(count / 10000).toFixed(count >= 100000 ? 0 : 1)}w`
    if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`
    return String(count)
  },

  loadFavoriteStatuses: function() {
    if (!app.isLoggedIn() || !this.data.recommendRecipes.length) return

    util.callCloudFunction('favorite', { action: 'list' }).then(res => {
      const favoriteIds = new Set(((res.data && res.data.recipes) || []).map(recipe => recipe._id))
      this.setData({
        recommendRecipes: this.data.recommendRecipes.map(recipe => ({
          ...recipe,
          isFavorited: favoriteIds.has(recipe._id)
        }))
      })
    }).catch(err => {
      console.error('获取首页收藏状态失败:', err)
    })
  },

  onFavoriteTap: function(e) {
    if (!util.requireLogin('收藏菜品需要登录')) return

    const recipeId = e.currentTarget.dataset.id
    const index = this.data.recommendRecipes.findIndex(recipe => recipe._id === recipeId)
    if (index < 0 || this.data.recommendRecipes[index].favoriteLoading) return

    this.setData({ [`recommendRecipes[${index}].favoriteLoading`]: true })
    util.callCloudFunction('favorite', {
      action: 'toggle',
      recipeId
    }).then(res => {
      const isFavorited = !!(res.data && res.data.isFavorited)
      app.globalData.favoriteDataVersion = (app.globalData.favoriteDataVersion || 0) + 1
      this.setData({
        [`recommendRecipes[${index}].isFavorited`]: isFavorited,
        [`recommendRecipes[${index}].favoriteLoading`]: false
      })
      util.showSuccess(isFavorited ? '已加入收藏' : '已取消收藏')
    }).catch(err => {
      this.setData({ [`recommendRecipes[${index}].favoriteLoading`]: false })
      util.showError(err.message || '收藏没保存成功')
    })
  },

  onFriendsClick: function() {
    const title = this.data.isChef ? '待投喂清单' : '我的饭愿'
    if (!this.data.hasUserInfo) {
      this.setData({
        showLoginPrompt: true,
        promptContent: `${title}需要登录后使用`
      })
      return
    }

    wx.navigateTo({
      url: `/pages/wish-list/wish-list?mode=${this.data.isChef ? 'pool' : 'mine'}`
    })
  },

  onMoreClick: function() {
    wx.switchTab({
      url: '/pages/recipe-list/recipe-list'
    })
  },

  onRecommendBind: function() {
    if (!util.requireLogin('绑定饭搭子需要登录')) return
    wx.navigateTo({ url: '/pages/friends/friends' })
  },

  onEmptyRecommendAdd: function() {
    if (!util.requireLogin('添一道拿手菜需要登录')) return

    wx.navigateTo({
      url: '/pages/recipe-form/recipe-form'
    })
  },

  onRecipeClick: function(e) {
    const recipeId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/recipe-detail/recipe-detail?id=${recipeId}`,
      success: () => {
        this._viewedRecipeId = recipeId
      }
    })
  },

  refreshRecipeViewCount: function(recipeId) {
    const index = this.data.recommendRecipes.findIndex(recipe => recipe._id === recipeId)
    if (index < 0) return

    util.callCloudFunction('recipe', {
      action: 'detail',
      recipeId,
      recordView: false
    }).then(res => {
      const viewCount = Number(res.data && res.data.viewCount || 0)
      this.setData({
        [`recommendRecipes[${index}].viewCount`]: viewCount,
        [`recommendRecipes[${index}].viewCountDisplay`]: this.formatCount(viewCount)
      })
    }).catch(() => {})
  },

  onSearchClick: function() {
    wx.switchTab({
      url: '/pages/recipe-list/recipe-list'
    })
  },

  onAddRecipeClick: function() {
    const title = this.data.isChef ? '添一道拿手菜' : '许个饭愿'
    if (!this.data.hasUserInfo) {
      this.setData({
        showLoginPrompt: true,
        promptContent: `${title}需要登录后使用`
      })
      return
    }

    if (this.data.isChef) {
      wx.navigateTo({
        url: '/pages/recipe-form/recipe-form'
      })
      return
    }

    wx.navigateTo({
      url: '/pages/recipe-form/recipe-form?mode=wish'
    })
  },

  // 关闭提示弹窗
  onPromptClose: function() {
    this.setData({ showLoginPrompt: false })
  },

  // 点击立即登录
  onPromptLogin: function() {
    this.setData({ showLoginPrompt: false })
  },

  onOrderClick: function() {
    if (!util.requireLogin(this.data.isChef ? '查看待投喂单需要登录' : '使用饭篮并提交投喂单需要登录')) return

    if (this.data.isChef) {
      wx.switchTab({ url: '/pages/order-list/order-list' })
      return
    }

    const targetUrl = cartManager.getCartStats().hasItems
      ? '/pages/diancan/diancan'
      : '/pages/recipe-list/recipe-list'

    wx.switchTab({
      url: targetUrl
    })
  },

  onShareAppMessage: function() {
    return share.getBrandShare()
  },

  onShareTimeline: function() {
    const config = share.getBrandShare()
    return {
      title: config.title,
      imageUrl: config.imageUrl
    }
  }
})
