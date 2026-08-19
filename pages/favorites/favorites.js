const util = require('../../utils/util')
const {
  getSceneCategoryById,
  getIngredientCategoryById,
  getCookingMethods,
  getFlavorTypes
} = require('../../utils/tagData')

Page({
  data: {
    loading: true,
    loadingMore: false,
    recipes: [],
    page: 1,
    hasMore: true,
    readOnly: false,
    friendId: '',
    friendName: '',
    pageTitle: '我的收藏',
    cookingMethods: getCookingMethods(),
    flavorTypes: getFlavorTypes()
  },

  onLoad(options = {}) {
    this._favoriteDataVersion = getApp().globalData.favoriteDataVersion || 0
    const readOnly = options.mode === 'friend'
    const friendName = safeDecode(options.friendName) || 'TA'
    const pageTitle = readOnly ? `${friendName}的收藏` : '我的收藏'
    this.setData({
      readOnly,
      friendId: readOnly ? safeDecode(options.friendId) : '',
      friendName,
      pageTitle
    })
    wx.setNavigationBarTitle({ title: pageTitle })
  },

  onShow() {
    if (!util.requireLogin('查看收藏需要登录')) {
      this.setData({ loading: false, recipes: [] })
      return
    }
    const favoriteDataChanged = this._favoriteDataVersion !== (getApp().globalData.favoriteDataVersion || 0)
    if (favoriteDataChanged) this._favoriteDataVersion = getApp().globalData.favoriteDataVersion || 0
    if (!this._loaded || favoriteDataChanged) {
      this.loadFavorites(true, favoriteDataChanged && this._loaded)
      return
    }
    if (this._viewedRecipeId) {
      const recipeId = this._viewedRecipeId
      this._viewedRecipeId = ''
      this.syncFavoriteStatus(recipeId)
    }
  },

  onPullDownRefresh() {
    this.loadFavorites(true).finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    this.loadFavorites(false)
  },

  loadFavorites(reset = true, silent = false) {
    if (!util.isLoggedIn()) return Promise.resolve()
    if (!reset && (!this.data.hasMore || this.data.loadingMore)) return Promise.resolve()
    const page = reset ? 1 : this.data.page + 1
    this.setData(reset ? { loading: !silent } : { loadingMore: true })
    return util.callCloudFunction('favorite', {
      action: this.data.readOnly ? 'listFriend' : 'list',
      friendOpenid: this.data.friendId,
      page,
      limit: 20
    }).then(res => {
      const payload = res.data || {}
      const recipes = payload.recipes || []
      return util.resolveCloudImages(recipes.map(recipe => (recipe.images || [])[0])).then(images => {
        return {
          recipes: recipes.map((recipe, index) => {
            const scene = getSceneCategoryById(recipe.sceneCategory)
            const ingredient = getIngredientCategoryById(recipe.ingredientCategory)
            return {
              ...recipe,
              displayImage: images[index],
              sceneDisplay: scene ? scene.shortName : '家常',
              ingredientDisplay: ingredient ? ingredient.name : '美味',
              sceneLabel: scene ? scene.name : '家常',
              ingredientLabel: ingredient ? ingredient.name : '美味'
            }
          }),
          hasMore: Boolean(payload.hasMore)
        }
      })
    }).then(result => {
      this._loaded = true
      this.setData({
        recipes: reset ? result.recipes : this.data.recipes.concat(result.recipes),
        page,
        hasMore: result.hasMore,
        loading: false,
        loadingMore: false
      })
    }).catch(err => {
      this.setData({
        recipes: reset && !silent ? [] : this.data.recipes,
        loading: false,
        loadingMore: false
      })
      if (!silent) util.showError(err.message || '收藏没加载出来')
    })
  },

  onRecipeTap(e) {
    const recipeId = e.detail && e.detail.recipeId || e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/recipe-detail/recipe-detail?id=${recipeId}`,
      success: () => {
        this._viewedRecipeId = recipeId
      }
    })
  },

  syncFavoriteStatus(recipeId) {
    if (this.data.readOnly) return
    util.callCloudFunction('favorite', { action: 'status', recipeId }).then(res => {
      if (res.data && !res.data.isFavorited) {
        this.setData({ recipes: this.data.recipes.filter(recipe => recipe._id !== recipeId) })
      }
    }).catch(() => {})
  },

  onRemoveFavorite(e) {
    const recipeId = e.currentTarget.dataset.id
    util.showConfirm('要把这道菜移出收藏吗？').then(confirm => {
      if (!confirm) return
      return util.callCloudFunction('favorite', { action: 'toggle', recipeId })
    }).then(res => {
      if (!res) return
      const app = getApp()
      app.globalData.favoriteDataVersion = (app.globalData.favoriteDataVersion || 0) + 1
      this.setData({ recipes: this.data.recipes.filter(recipe => recipe._id !== recipeId) })
      util.showSuccess('已移出收藏')
    }).catch(err => {
      util.showError(err.message || '操作没成功')
    })
  },

  onGoToRecipes() {
    wx.switchTab({ url: '/pages/recipe-list/recipe-list' })
  }
})

function safeDecode(value) {
  try {
    return decodeURIComponent(value || '')
  } catch (error) {
    return String(value || '')
  }
}
