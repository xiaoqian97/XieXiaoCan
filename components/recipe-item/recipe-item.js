const util = require('../../utils/util')
const { getIngredientCategoryById } = require('../../utils/tagData')

const DEFAULT_RECIPE_IMAGE = '/images/default-recipe.jpg'

// 菜谱项组件
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 菜谱数据
    recipe: {
      type: Object,
      value: {},
      observer(recipe) {
        this.updateDisplayImage(recipe)
      }
    },
    // 是否显示状态标签（用于我的菜谱页面）
    showStatus: {
      type: Boolean,
      value: false
    },
    showCartAction: {
      type: Boolean,
      value: true
    },
    compact: {
      type: Boolean,
      value: false
    },
    showFavoriteInfo: {
      type: Boolean,
      value: false
    },
    showStats: {
      type: Boolean,
      value: false
    },
    showViewStats: {
      type: Boolean,
      value: false
    },
    showViewerInfo: {
      type: Boolean,
      value: false
    },
    // 烹饪方式数据（用于标签显示）
    cookingMethods: {
      type: Array,
      value: []
    },
    // 口味类型数据（用于标签显示）
    flavorTypes: {
      type: Array,
      value: []
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    displayImage: '',
    hasRealImage: false,
    placeholderEmoji: '🍽️'
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 菜谱点击事件
     */
    onRecipeClick: function(e) {
      const recipeId = e.currentTarget.dataset.id
      if (recipeId) {
        // 触发父组件的菜谱点击事件
        this.triggerEvent('recipeclick', {
          recipeId: recipeId,
          recipe: this.data.recipe
        })
      }
    },

    /**
     * 购物车操作事件
     */
    onCartAction: function(e) {
      // 在微信小程序中，通过catchtap来阻止事件冒泡，而不是在JS中调用stopPropagation
      const recipeId = e.currentTarget.dataset.recipeId
      if (recipeId) {
        // 触发父组件的购物车操作事件
        this.triggerEvent('cartaction', {
          recipeId: recipeId,
          recipe: this.data.recipe,
          isInCart: this.data.recipe.isInCart
        })
      }
    },

    onFavoriteInfo: function() {
      this.triggerEvent('favoriteinfo', {
        recipe: this.data.recipe
      })
    },

    onViewerInfo: function() {
      this.triggerEvent('viewerinfo', {
        recipe: this.data.recipe
      })
    },

    onImageLoad: function() {
      this._imageRetryCount = 0
    },

    onImageError: function() {
      const images = this.data.recipe && Array.isArray(this.data.recipe.images)
        ? this.data.recipe.images
        : []
      const cloudSrc = images.find(item => typeof item === 'string' && item.indexOf('cloud://') === 0)
      if (!cloudSrc || Number(this._imageRetryCount || 0) >= 2) {
        this.showImagePlaceholder(this.data.recipe)
        return
      }

      this._imageRetryCount = Number(this._imageRetryCount || 0) + 1
      util.invalidateCloudImage(cloudSrc)
      this.setData({ displayImage: '', hasRealImage: false })
      setTimeout(() => this.resolveRecipeImage(cloudSrc, this.data.recipe), 350 * this._imageRetryCount)
    },

    showImagePlaceholder: function(recipe) {
      const category = getIngredientCategoryById(recipe && recipe.ingredientCategory) || {}
      this._pendingImageSrc = ''
      this.setData({
        displayImage: '',
        hasRealImage: false,
        placeholderEmoji: category.emoji || '🍽️'
      })
    },

    resolveRecipeImage: function(src, recipe) {
      this._pendingImageSrc = src
      util.resolveCloudImage(src).then(displayImage => {
        if (this._pendingImageSrc !== src) return
        if (!displayImage || displayImage === DEFAULT_RECIPE_IMAGE) {
          if (Number(this._imageRetryCount || 0) < 2) {
            this._imageRetryCount = Number(this._imageRetryCount || 0) + 1
            util.invalidateCloudImage(src)
            setTimeout(() => this.resolveRecipeImage(src, recipe), 350 * this._imageRetryCount)
            return
          }
          this.showImagePlaceholder(recipe)
          return
        }
        this.setData({ displayImage, hasRealImage: true })
      }).catch(() => this.onImageError())
    },

    updateDisplayImage: function(recipe) {
      const images = recipe && Array.isArray(recipe.images) ? recipe.images : []
      const rawSrc = images[0] || ''
      const resolvedSrc = (recipe && recipe.displayImage) || ''
      // 父页面解析失败时会给出兜底图，此时仍应拿原始 cloud:// 地址重试。
      const src = resolvedSrc && resolvedSrc !== DEFAULT_RECIPE_IMAGE ? resolvedSrc : rawSrc
      this._imageRetryCount = 0

      // 没图（或者只有那张通用兜底图）就按食材分类显示占位图标，不拿别的菜的照片糊弄
      if (!src || src === DEFAULT_RECIPE_IMAGE) {
        this.showImagePlaceholder(recipe)
        return
      }

      if (src.indexOf('cloud://') !== 0) {
        this._pendingImageSrc = ''
        this.setData({ displayImage: src, hasRealImage: true })
        return
      }

      this.resolveRecipeImage(src, recipe)
    }
  }
})
