const { 
  getSceneCategoryById, 
  getIngredientCategoryById,
  getCookingMethods,
  getFlavorTypes
} = require('../../utils/tagData')
const util = require('../../utils/util')
const share = require('../../utils/share')

Page({
  data: {
    // 菜谱数据
    recipe: {
      _id: '',
      name: '',
      description: '',
      images: [],
      ingredients: [],
      sideIngredients: '',
      seasonings: '',
      steps: [],
      preparationTime: {},
      difficulty: {},
      servingSize: {},
      sceneCategory: '',
      ingredientCategory: '',
      optionalTags: [],
      creator: {
        nickname: '',
        avatar: ''
      },
      interactions: {},
      myInteraction: '',
      myInteractions: [],
      createTime: ''
    },
    
    // 分类信息
    sceneCategoryInfo: {},
    ingredientCategoryInfo: {},
    optionalTagsInfo: [],
    
    // 页面状态
    loading: true,
    loadError: '',
    isFavorited: false,
    isMyRecipe: false, // 是否为当前用户的菜谱
    readOnly: false,
    interactionLoading: false,
    interactionOptions: [
      { key: 'tasty', label: '好吃', icon: '😋', selected: false },
      { key: 'want_again', label: '下次还想吃', icon: '🔁', selected: false },
      { key: 'less_spicy', label: '少辣一点', icon: '🌶️', selected: false },
      { key: 'just_right', label: '分量刚好', icon: '👌', selected: false }
    ],
    
    // 页面参数
    recipeId: ''
  },

  onLoad(options) {
    const readOnly = options.readonly === '1'
    
    if (isValidRecipeId(options.id)) {
      this.setData({
        recipeId: options.id,
        readOnly
      })
      this.loadRecipeDetail(!readOnly)
    } else {
      wx.showToast({
          title: '这道菜找不到编号',
        icon: 'error'
      })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/recipe-list/recipe-list' })
      }, 1500)
    }
  },

  onShow() {
    if (this._editingRecipe) {
      this._editingRecipe = false
      this.loadRecipeDetail(false, true)
    }
    // 检查收藏状态
    if (!this.data.readOnly && !this.data.loading) this.checkFavoriteStatus()
  },

  onPullDownRefresh() {
    this.loadRecipeDetail(false)
  },

  // 加载菜谱详情
  loadRecipeDetail(recordView = false, silent = false) {
    if (!isValidRecipeId(this.data.recipeId)) return Promise.resolve(false)
    if (!silent) this.setData({ loading: true, loadError: '' })
    
    wx.cloud.callFunction({
      name: 'recipe',
      data: {
        action: 'detail',
        recipeId: this.data.recipeId,
        recordView
      }
    }).then(res => {
      if (res.result.success) {
        const recipe = res.result.data
        this.processRecipeData(recipe)
        return new Promise(resolve => {
          this.setData({ recipe, loadError: '' }, resolve)
        }).then(() => this.resolveRecipeImages()).then(() => {
          if (!this.data.readOnly) return this.checkFavoriteStatus()
          return null
        }).then(() => {
          if (!silent) this.setData({ loading: false })
          return true
        })
      } else {
        console.error('加载菜谱详情失败:', res.result)
        const message = res.result.message || '这道菜没加载出来'
        wx.showToast({
          title: message,
          icon: 'error'
        })
        if (!silent) this.setData({ loading: false, loadError: message })
        return false
      }
    }).catch(err => {
      console.error('加载菜谱详情失败:', err)
      if (!silent) this.setData({ loading: false, loadError: '菜谱加载失败，请检查网络后重试' })
      wx.showToast({
        title: '这道菜没加载出来',
        icon: 'error'
      })
      return false
    }).then(result => {
      wx.stopPullDownRefresh()
      return result
    })
  },

  retryLoadRecipe() {
    this.loadRecipeDetail(false)
  },

  stopLoadingEvent() {},

  // 处理菜谱数据
  processRecipeData(recipe) {
    // 没图就保持空数组：头图改成分类占位块，也避免发布时把本地兜底图写进数据库
    recipe.images = Array.isArray(recipe.images) ? recipe.images.filter(Boolean) : []
    recipe.optionalTags = Array.isArray(recipe.optionalTags) ? recipe.optionalTags : []
    recipe.myInteractions = Array.isArray(recipe.myInteractions)
      ? recipe.myInteractions
      : (recipe.myInteraction ? [recipe.myInteraction] : [])
    recipe.creator = {
      id: recipe.creator && recipe.creator.id ? recipe.creator.id : recipe.creatorId,
      nickname: recipe.creator && recipe.creator.nickname ? recipe.creator.nickname : '未知用户',
      avatar: recipe.creator && recipe.creator.avatar ? recipe.creator.avatar : ''
    }

    // 获取场景分类信息
    const sceneCategoryInfo = getSceneCategoryById(recipe.sceneCategory) || {}
    
    // 获取食材分类信息
    const ingredientCategoryInfo = getIngredientCategoryById(recipe.ingredientCategory) || {}
    
    // 获取可选标签信息
    const cookingMethods = getCookingMethods()
    const flavorTypes = getFlavorTypes()
    const allOptionalTags = [...cookingMethods, ...flavorTypes]
    
    const optionalTagsInfo = recipe.optionalTags.map(tagId => {
      return allOptionalTags.find(tag => tag.id === tagId) || { id: tagId, name: '未知标签', emoji: '🏷️' }
    })
    
    // 判断是否为当前用户的菜谱
    const app = getApp()
    const currentOpenid = app.globalData.openid || wx.getStorageSync('openid')
    const isMyRecipe = currentOpenid && recipe.creatorId === currentOpenid
    
    this.setData({
      sceneCategoryInfo,
      ingredientCategoryInfo,
      optionalTagsInfo,
      isMyRecipe,
      interactionOptions: this.getInteractionOptions(recipe.myInteractions)
    })
  },

  getInteractionOptions(selectedReactions = []) {
    return this.data.interactionOptions.map(item => ({
      ...item,
      selected: selectedReactions.includes(item.key)
    }))
  },

  // 检查收藏状态
  checkFavoriteStatus() {
    const app = getApp()
    if (!isValidRecipeId(this.data.recipeId) || !app.isLoggedIn()) {
      this.setData({ isFavorited: false })
      return Promise.resolve()
    }

    return util.callCloudFunction('favorite', {
      action: 'status',
      recipeId: this.data.recipeId
    }).then(res => {
      this.setData({ isFavorited: !!(res.data && res.data.isFavorited) })
    }).catch(err => {
      console.error('获取收藏状态失败:', err)
    })
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  },

  // 切换收藏状态
  toggleFavorite() {
    if (this.data.readOnly) return
    if (!util.requireLogin('收藏菜品需要登录')) return

    util.callCloudFunction('favorite', {
      action: 'toggle',
      recipeId: this.data.recipeId
    }).then(res => {
      const isFavorited = !!(res.data && res.data.isFavorited)
      const app = getApp()
      app.globalData.favoriteDataVersion = (app.globalData.favoriteDataVersion || 0) + 1
      this.setData({ isFavorited })
      util.showSuccess(isFavorited ? '已加入收藏' : '已取消收藏')
    }).catch(err => {
      util.showError(err.message || '收藏没保存成功')
    })
  },

  onInteractionTap(e) {
    if (this.data.readOnly || this.data.interactionLoading || !util.requireLogin('记录口味反馈需要登录')) return
    const reaction = e.currentTarget.dataset.reaction
    this.setData({ interactionLoading: true })
    util.callCloudFunction('recipe', { action: 'saveInteraction', recipeId: this.data.recipeId, reaction }).then(res => {
      const summary = res.data || {}
      const myInteractions = Array.isArray(summary.myReactions)
        ? summary.myReactions
        : (summary.myReaction ? [summary.myReaction] : [])
      this.setData({
        'recipe.interactions': summary.counts || {},
        'recipe.myInteraction': summary.myReaction || '',
        'recipe.myInteractions': myInteractions,
        interactionOptions: this.getInteractionOptions(myInteractions)
      })
      util.showSuccess(myInteractions.includes(reaction) ? '口味反馈已记住' : '已取消这条反馈')
    }).catch(error => util.showError(error.message || '反馈保存失败'))
      .finally(() => this.setData({ interactionLoading: false }))
  },

  // 预览图片
  previewImage(e) {
    const current = e.currentTarget.dataset.current
    const urls = this.data.recipe.images
    
    wx.previewImage({
      current: urls[current],
      urls: urls
    })
  },

  // 预览步骤图片
  previewStepImage(e) {
    const index = e.currentTarget.dataset.index
    const step = this.data.recipe.steps[index]
    
    if (step && step.image) {
      wx.previewImage({
        current: step.image,
        urls: [step.image]
      })
    }
  },

  resolveRecipeImages() {
    const recipe = this.data.recipe
    const originalImages = recipe.originalImages || [...(recipe.images || [])]
    const originalCreatorAvatar = recipe.originalCreatorAvatar || (recipe.creator && recipe.creator.avatar) || ''
    const originalSteps = (recipe.steps || []).map(step => ({
      ...step,
      originalImage: step.originalImage || step.image || ''
    }))
    const stepImages = originalSteps.map(step => step.originalImage).filter(Boolean)

    return Promise.all([
      util.resolveCloudImages([...originalImages, ...stepImages]),
      util.resolveCloudImage(originalCreatorAvatar, '/images/default-avatar.png')
    ]).then(([urls, creatorAvatar]) => {
      const imageCount = originalImages.length
      const images = urls.slice(0, imageCount)
      const stepUrls = urls.slice(imageCount)
      let stepIndex = 0
      const steps = originalSteps.map(step => {
        if (!step.originalImage) return step
        return {
          ...step,
          image: stepUrls[stepIndex++] || step.image
        }
      })

      return new Promise(resolve => {
        this.setData({
          'recipe.images': images,
          'recipe.originalImages': originalImages,
          'recipe.steps': steps,
          'recipe.creator.avatar': creatorAvatar,
          'recipe.originalCreatorAvatar': originalCreatorAvatar
        }, resolve)
      })
    }).catch(error => {
      // 图片解析失败不阻断详情正文，图片组件仍可使用原始云文件地址或占位图。
      console.error('菜谱图片解析失败:', error)
    })
  },

  openXiaohongshu() {
    const url = this.data.recipe.xiaohongshuUrl
    if (!url) return

    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showModal({
          title: '灵感链接已复制',
          content: '请打开小红书，在搜索框粘贴链接即可查看这篇灵感笔记。',
          showCancel: false,
          confirmText: '知道了',
          confirmColor: '#E85D4A'
        })
      },
      fail: () => util.showError('灵感链接复制失败，请稍后重试')
    })
  },


  // 按场景筛选
  filterByScene(e) {
    const sceneId = e.currentTarget.dataset.scene
    wx.navigateTo({
      url: `/pages/recipe-list/recipe-list?scene=${sceneId}`
    })
  },

  // 按食材筛选
  filterByIngredient(e) {
    const ingredientId = e.currentTarget.dataset.ingredient
    wx.navigateTo({
      url: `/pages/recipe-list/recipe-list?ingredient=${ingredientId}`
    })
  },

  // 按标签筛选
  filterByTag(e) {
    const tagId = e.currentTarget.dataset.tag
    wx.navigateTo({
      url: `/pages/recipe-list/recipe-list?tag=${tagId}`
    })
  },

  // 查看创建者菜谱
  viewCreatorRecipes() {
    const creatorId = this.data.recipe.creatorId || (this.data.recipe.creator && this.data.recipe.creator.id)
    if (creatorId) {
      if (this.data.isMyRecipe) {
        wx.navigateTo({ url: '/pages/my-recipe/my-recipe' })
        return
      }
      const creatorName = this.data.recipe.creator && this.data.recipe.creator.nickname || 'TA'
      wx.navigateTo({
        url: `/pages/friend-recipes/friend-recipes?friendId=${encodeURIComponent(creatorId)}&friendName=${encodeURIComponent(creatorName)}`
      })
    } else {
      wx.showToast({
        title: '创建者信息不完整',
        icon: 'none'
      })
    }
  },

  // 页面分享配置
  onShareAppMessage() {
    return share.getRecipeShare(this.data.recipe)
  },

  // 分享到朋友圈
  onShareTimeline() {
    return share.getRecipeTimelineShare(this.data.recipe)
  },

  // 编辑菜谱
  editRecipe() {
    if (this.data.readOnly) return
    const recipeId = this.data.recipeId
    wx.navigateTo({
      url: `/pages/recipe-form/recipe-form?id=${recipeId}`,
      success: () => {
        this._editingRecipe = true
      }
    })
  },

  // 删除菜谱
  deleteRecipe() {
    if (this.data.readOnly) return
    const recipe = this.data.recipe
    this.selectComponent('#themeConfirmDialog').open({
      icon: '🗑️',
      title: '删除这道菜',
      content: `确定要删除"${recipe.name}"吗？删除后无法恢复。`,
      confirmText: '删除',
      cancelText: '保留',
      tone: 'danger'
    }).then(confirmed => {
      if (confirmed) this.confirmDeleteRecipe()
    })
  },

  // 确认删除菜谱
  confirmDeleteRecipe() {
    wx.showLoading({ title: '删除中...' })
    
    wx.cloud.callFunction({
      name: 'recipe',
      data: {
        action: 'delete',
        recipeId: this.data.recipeId
      }
    }).then(res => {
      wx.hideLoading()
      
      if (res.result.success) {
        const app = getApp()
        app.globalData.recipeDataVersion = (app.globalData.recipeDataVersion || 0) + 1
        app.globalData.favoriteDataVersion = (app.globalData.favoriteDataVersion || 0) + 1
        wx.showToast({
          title: '删除成功',
          icon: 'success'
        })
        
        // 延迟返回上一页，让用户看到成功提示
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        wx.showToast({
          title: res.result.message || '删除失败',
          icon: 'error'
        })
      }
    }).catch(err => {
      wx.hideLoading()
      console.error('删除菜谱失败:', err)
      wx.showToast({
        title: '删除失败',
        icon: 'error'
      })
    })
  },

  // 发布菜谱
  publishRecipe() {
    if (this.data.readOnly) return
    const recipe = this.data.recipe
    this.selectComponent('#themeConfirmDialog').open({
      icon: '🍽️',
      title: '发布这道菜',
      content: `确定要发布"${recipe.name}"吗？发布后饭搭子都能看到。`,
      confirmText: '发布',
      cancelText: '再看看'
    }).then(confirmed => {
      if (confirmed) this.confirmPublishRecipe()
    })
  },

  // 确认发布菜谱
  confirmPublishRecipe() {
    wx.showLoading({ title: '发布中...' })
    
    // 获取当前菜谱数据，只更新状态和公开性
    const recipe = this.data.recipe
    const updateData = {
      name: recipe.name,
      description: recipe.description,
      images: recipe.images,
      ingredients: recipe.ingredients,
      sideIngredients: recipe.sideIngredients || '',
      seasonings: recipe.seasonings || '',
      steps: recipe.steps,
      xiaohongshuUrl: recipe.xiaohongshuUrl || '',
      preparationTime: recipe.preparationTime,
      difficulty: recipe.difficulty,
      servingSize: recipe.servingSize,
      sceneCategory: recipe.sceneCategory,
      ingredientCategory: recipe.ingredientCategory,
      optionalTags: recipe.optionalTags,
      isPublic: true,
      status: 'published'
    }
    
    wx.cloud.callFunction({
      name: 'recipe',
      data: {
        action: 'update',
        recipeId: this.data.recipeId,
        data: updateData
      }
    }).then(res => {
      wx.hideLoading()
      
      if (res.result.success) {
        wx.showToast({
          title: '发布成功',
          icon: 'success'
        })
        
        // 更新本地数据
        this.setData({
          'recipe.status': 'published',
          'recipe.isPublic': true
        })
        
        // 延迟返回上一页，让用户看到成功提示
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        wx.showToast({
          title: res.result.message || '发布失败',
          icon: 'error'
        })
      }
    }).catch(err => {
      wx.hideLoading()
      console.error('发布菜谱失败:', err)
      wx.showToast({
        title: '发布失败',
        icon: 'error'
      })
    })
  }
})

function isValidRecipeId(recipeId) {
  return typeof recipeId === 'string' && recipeId.length > 0 && recipeId.length <= 64
}
