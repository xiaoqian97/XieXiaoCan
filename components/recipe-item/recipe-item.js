const util = require('../../utils/util')

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
    displayImage: '/images/default-recipe.jpg'
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

    updateDisplayImage: function(recipe) {
      const images = recipe && Array.isArray(recipe.images) ? recipe.images : []
      const src = (recipe && recipe.displayImage) || images[0] || '/images/default-recipe.jpg'

      if (src.indexOf('cloud://') !== 0) {
        this.setData({ displayImage: src })
        return
      }

      this._pendingImageSrc = src
      util.resolveCloudImage(src).then(displayImage => {
        if (this._pendingImageSrc !== src) return
        this.setData({ displayImage })
      })
    }
  }
})
