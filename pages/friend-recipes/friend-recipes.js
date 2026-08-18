const util = require('../../utils/util')
const {
  getCookingMethods,
  getFlavorTypes,
  getSceneCategoryById,
  getIngredientCategoryById
} = require('../../utils/tagData')

Page({
  data: {
    friendId: '',
    friendName: 'TA',
    searchValue: '',
    recipes: [],
    loading: true,
    loadingMore: false,
    page: 1,
    pageSize: 20,
    hasMore: true,
    cookingMethods: getCookingMethods(),
    flavorTypes: getFlavorTypes()
  },

  onLoad(options = {}) {
    if (!util.requireLogin('查看饭搭子菜谱需要登录')) {
      this.setData({ loading: false })
      return
    }
    const friendId = safeDecode(options.friendId)
    const friendName = safeDecode(options.friendName) || 'TA'
    if (!friendId) {
      util.showError('饭搭子信息不完整')
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    this.setData({ friendId, friendName })
    wx.setNavigationBarTitle({ title: `${friendName}的菜谱` })
    this.loadRecipes(true)
  },

  onPullDownRefresh() {
    this.loadRecipes(true)
  },

  onReachBottom() {
    this.loadRecipes(false)
  },

  onSearchInput(e) {
    const searchValue = e.detail.value || ''
    this.setData({ searchValue })
    clearTimeout(this._searchTimer)
    this._searchTimer = setTimeout(() => this.loadRecipes(true), 300)
  },

  onSearchConfirm() {
    clearTimeout(this._searchTimer)
    this.loadRecipes(true)
  },

  onClearSearch() {
    clearTimeout(this._searchTimer)
    this.setData({ searchValue: '' }, () => this.loadRecipes(true))
  },

  loadRecipes(reset = true) {
    if (!this.data.friendId || (!reset && (!this.data.hasMore || this.data.loadingMore))) {
      wx.stopPullDownRefresh()
      return Promise.resolve()
    }
    const page = reset ? 1 : this.data.page + 1
    const requestId = (this._requestId || 0) + 1
    this._requestId = requestId
    this.setData(reset ? { loading: true } : { loadingMore: true })

    return util.callCloudFunction('recipe', {
      action: 'list',
      creatorId: this.data.friendId,
      search: this.data.searchValue.trim(),
      page,
      pageSize: this.data.pageSize
    }).then(res => {
      if (requestId !== this._requestId) return null
      const payload = res.data || {}
      const recipes = (payload.recipes || []).map(recipe => this.formatRecipe(recipe))
      return util.resolveCloudImages(recipes.map(recipe => recipe.images[0])).then(images => ({
        recipes: recipes.map((recipe, index) => ({ ...recipe, displayImage: images[index] })),
        hasMore: recipes.length === this.data.pageSize
      }))
    }).then(result => {
      if (!result || requestId !== this._requestId) return
      this.setData({
        recipes: reset ? result.recipes : this.data.recipes.concat(result.recipes),
        page,
        hasMore: result.hasMore,
        loading: false,
        loadingMore: false
      })
    }).catch(error => {
      if (requestId !== this._requestId) return
      this.setData({
        recipes: reset ? [] : this.data.recipes,
        loading: false,
        loadingMore: false
      })
      util.showError(error.message || 'TA 的菜谱没加载出来')
    }).finally(() => wx.stopPullDownRefresh())
  },

  formatRecipe(recipe) {
    const scene = getSceneCategoryById(recipe.sceneCategory)
    const ingredient = getIngredientCategoryById(recipe.ingredientCategory)
    const ratingCount = Number(recipe.ratingCount || 0)
    return {
      ...recipe,
      images: Array.isArray(recipe.images) && recipe.images.length ? recipe.images : ['/images/default-recipe.jpg'],
      sceneDisplay: scene ? scene.shortName : '',
      ingredientDisplay: ingredient ? ingredient.name : '',
      preparationTimeDisplay: recipe.preparationTime && recipe.preparationTime.label || '',
      difficultyDisplay: recipe.difficulty && recipe.difficulty.label || '',
      servingSizeDisplay: recipe.servingSize && recipe.servingSize.label || '',
      ratingAverage: ratingCount > 0 ? (Number(recipe.ratingTotal || 0) / ratingCount).toFixed(1) : ''
    }
  },

  onRecipeTap(e) {
    const recipeId = e.detail && e.detail.recipeId
    if (!recipeId) return
    wx.navigateTo({
      url: `/pages/recipe-detail/recipe-detail?id=${encodeURIComponent(recipeId)}&readonly=1`
    })
  },

  onUnload() {
    clearTimeout(this._searchTimer)
  }
})

function safeDecode(value) {
  try {
    return decodeURIComponent(value || '')
  } catch (error) {
    return String(value || '')
  }
}
