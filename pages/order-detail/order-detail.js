const TagData = require('../../utils/tagData')
const cartManager = require('../../utils/cartManager')
const util = require('../../utils/util')
const share = require('../../utils/share')

/**
 * 投喂单详情页面
 */
Page({
  data: {
    orderId: '',
    order: null,
    loading: true,
    showActionSheet: false,
    userInfo: null,
    showRatingModal: false,
    ratingRecipes: [],
    ratingContent: '',
    ratingStars: [1, 2, 3, 4, 5]
  },

  onLoad: function(options) {
    if (!util.requireLogin('查看投喂单详情需要登录')) {
      this.setData({ loading: false })
      return
    }
    const { orderId } = options
    if (orderId) {
      this.setData({ orderId })
      this.loadOrderDetail(orderId)
    } else {
      wx.showToast({
        title: '投喂单ID错误',
        icon: 'error'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
    this.getUserInfo()
  },

   // 获取用户信息
   getUserInfo: function() {
    try {
      const userInfo = wx.getStorageSync('userInfo')
      if (userInfo) {
        this.setData({
          userInfo: userInfo
        })
      } else {
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
    }
  },

  // 加载投喂单详情
  loadOrderDetail: function(orderId) {
    wx.showLoading({
      title: '投喂单加载中...'
    })

    wx.cloud.callFunction({
      name: 'order',
      data: {
        action: 'getOrderDetail',
        orderId: orderId
      }
    }).then(res => {
      wx.hideLoading()
      
      if (res.result.success) {
        this.resolveOrderImages(res.result.data).then(order => {
          this.setData({
            order,
            loading: false
          })
        })
      } else {
        console.error('订单详情加载失败:', res.result)
        this.setData({ loading: false })
        wx.showToast({
          title: res.result.message || '投喂单没加载出来',
          icon: 'none'
        })
        // 加载失败时返回上一页
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      }
    }).catch(err => {
      wx.hideLoading()
      this.setData({ loading: false })
      wx.showToast({
        title: '投喂单没加载出来',
        icon: 'error'
      })
      console.error('加载订单详情失败', err)
      // 加载失败时返回上一页
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    })
  },

  resolveOrderImages: function(order) {
    const recipes = order.recipes || []
    const ratingMap = new Map((order.recipeRatings || []).map(item => [item.recipeId, item.score]))
    return Promise.all([
      util.resolveCloudImages(recipes.map(item => item.image)),
      util.resolveCloudImage(order.creatorAvatar, '/images/default-avatar.png'),
      util.resolveCloudImage(order.assigneeAvatar, '/images/default-avatar.png')
    ]).then(([images, creatorAvatar, assigneeAvatar]) => ({
      ...order,
      displayCreatorAvatar: creatorAvatar,
      displayAssigneeAvatar: assigneeAvatar,
      recipes: recipes.map((recipe, index) => ({
        ...recipe,
        displayImage: images[index],
        dishRating: ratingMap.get(recipe.recipeId) || ''
      }))
    }))
  },

  // 获取状态样式
  getStatusStyle: function(status) {
    return TagData.getOrderStatusStyle(status)
  },

  // 获取餐次图标
  getMealTypeIcon: function(mealType) {
    const icons = {
      breakfast: '🌅',
      lunch: '🌞',
      dinner: '🌙'
    }
    return icons[mealType] || '🍽️'
  },

  // 显示操作菜单
  onShowActions: function() {
    const { order } = this.data
    if (!order) return

    const actions = []
    
    if (order.status === 'pending') {
      actions.push('开始投喂')
      actions.push('取消投喂')
    } else if (order.status === 'processing') {
      actions.push('投喂完成')
      actions.push('取消投喂')
    } else if (order.status === 'completed') {
      if (order.creatorId === this.data.userInfo.openid) {
        actions.push('再来一单')
      }
      if (order.creatorId === this.data.userInfo.openid && !order.rating) {
        actions.push('评价投喂单')
      }
    }

    if (actions.length === 0) return

    wx.showActionSheet({
      itemList: actions,
      success: (res) => {
        const action = actions[res.tapIndex]
        this.handleAction(action)
      }
    })
  },

  // 处理操作
  handleAction: function(action) {
    const { order } = this.data
    
    switch (action) {
      case '开始投喂':
        this.startCooking()
        break
      case '投喂完成':
        this.completeCooking()
        break
      case '取消投喂':
        this.cancelOrder()
        break
      case '再来一单':
        this.reorder()
        break
      case '评价投喂单':
        this.rateOrder()
        break
    }
  },

  // 开始投喂
  startCooking: function() {
    this.selectComponent('#themeConfirmDialog').open({
      icon: '🔥',
      title: '确认开始投喂',
      content: '确定要开始投喂这张投喂单吗？',
      confirmText: '开始投喂'
    }).then(confirmed => {
      if (confirmed) this.updateOrderStatus('processing')
    })
  },

  // 投喂完成
  completeCooking: function() {
    this.selectComponent('#themeConfirmDialog').open({
      icon: '✨',
      title: '确认投喂完成',
      content: '确定已经投喂完成了吗？',
      confirmText: '完成投喂'
    }).then(confirmed => {
      if (confirmed) this.updateOrderStatus('completed')
    })
  },

  // 取消投喂
  cancelOrder: function() {
    this.selectComponent('#themeConfirmDialog').open({
      icon: '↩️',
      title: '确认取消投喂',
      content: '确定要取消这次投喂吗？',
      confirmText: '取消投喂',
      tone: 'danger'
    }).then(confirmed => {
      if (confirmed) this.updateOrderStatus('cancelled')
    })
  },

  // 再来一单
  reorder: function() {
    const { order } = this.data
    if (!order || !this.data.userInfo || order.creatorId !== this.data.userInfo.openid) {
      util.showError('只有点菜人可以再来一单')
      return
    }
    if (!order || !order.recipes || order.recipes.length === 0) {
      wx.showToast({
        title: '投喂单里没有菜',
        icon: 'none'
      })
      return
    }

    wx.showLoading({
      title: '放进饭篮中...'
    })

    let successCount = 0
    let failCount = 0
    const totalCount = order.recipes.length

    // 将投喂单中的菜谱放进饭篮
    order.recipes.forEach((recipe, index) => {
      try {
        // 转换投喂单菜谱数据为饭篮格式
        const cartRecipe = this.convertOrderRecipeToCartFormat(recipe)
        
        // 放进饭篮
        const result = cartManager.addToCart(cartRecipe)
        
        if (result.success) {
          successCount++
        } else {
          failCount++
          console.error('添加到购物车失败:', recipe.recipeName, result.message)
        }
      } catch (error) {
        failCount++
        console.error('处理菜谱时出错:', recipe.recipeName, error)
      }
    })

    wx.hideLoading()

    // 显示结果反馈
    if (successCount > 0) {
      if (failCount === 0) {
        wx.showToast({
          title: `已放${successCount}道菜进饭篮`,
          icon: 'success'
        })
      } else {
        wx.showToast({
          title: `放进${successCount}道，${failCount}道没放进去`,
          icon: 'none',
          duration: 3000
        })
      }
    } else {
      wx.showToast({
        title: '没放进去，再试一次',
        icon: 'none'
      })
      return
    }
    
    // 跳转到点餐页面
    setTimeout(() => {
      wx.switchTab({
        url: '/pages/diancan/diancan'
      })
    }, 1500)
  },

  // 将投喂单菜谱数据转换为饭篮格式
  convertOrderRecipeToCartFormat: function(orderRecipe) {
    return {
      _id: orderRecipe.recipeId,
      name: orderRecipe.recipeName,
      creatorId: orderRecipe.authorId,
      creator: {
        nickname: orderRecipe.authorName,
        avatar: orderRecipe.authorAvatar
      },
      images: orderRecipe.image ? [orderRecipe.image] : ['/images/default-recipe.jpg'],
      preparationTime: {
        label: orderRecipe.preparationTime || '30分钟'
      },
      difficulty: {
        label: orderRecipe.difficulty || '简单'
      },
      servingSize: {
        label: orderRecipe.servingSize || '2-3人份'
      }
    }
  },

  // 评价投喂单
  rateOrder: function() {
    const { order, userInfo } = this.data
    if (!order || order.creatorId !== (userInfo && userInfo.openid)) {
      util.showError('只有点饭人可以评价')
      return
    }
    if (order.rating) {
      util.showError('这张投喂单已经评价过了')
      return
    }
    this.setData({
      showRatingModal: true,
      ratingRecipes: (order.recipes || [])
        .filter(recipe => recipe.recipeId)
        .map(recipe => ({
          recipeId: recipe.recipeId,
          recipeName: recipe.recipeName || '未命名菜品',
          displayImage: recipe.displayImage || recipe.image || '/images/default-recipe.jpg',
          score: 5
        })),
      ratingContent: ''
    })
  },

  onRatingScoreSelect: function(e) {
    const index = Number(e.currentTarget.dataset.index)
    const score = Number(e.currentTarget.dataset.score)
    this.setData({ [`ratingRecipes[${index}].score`]: score })
  },

  onRatingContentInput: function(e) {
    this.setData({ ratingContent: e.detail.value })
  },

  closeRatingModal: function() {
    this.setData({ showRatingModal: false })
  },

  submitRating: function() {
    const { ratingRecipes, ratingContent, orderId } = this.data
    if (!ratingRecipes.length) {
      util.showError('这张投喂单没有可评分的菜品')
      return
    }
    const averageScore = Number((ratingRecipes.reduce((total, item) => total + item.score, 0) / ratingRecipes.length).toFixed(1))
    util.showLoading('保存评价中...')
    util.callCloudFunction('order', {
      action: 'rateOrder',
      orderId,
      rating: {
        score: averageScore,
        content: ratingContent.trim()
      },
      recipeRatings: ratingRecipes.map(item => ({
        recipeId: item.recipeId,
        score: item.score
      }))
    }).then(() => {
      util.hideLoading()
      this.setData({ showRatingModal: false })
      util.showSuccess('评价已存好')
      this.loadOrderDetail(orderId)
    }).catch(err => {
      util.hideLoading()
      util.showError(err.message || '评价没保存成功')
    })
  },

  // 更新投喂单状态
  updateOrderStatus: function(newStatus, rating) {
    wx.showLoading({
      title: '更新投喂单中...'
    })

    wx.cloud.callFunction({
      name: 'order',
      data: {
        action: 'updateOrderStatus',
        orderId: this.data.orderId,
        status: newStatus,
        rating
      }
    }).then(res => {
      wx.hideLoading()
      
      if (res.result.success) {
        // 重新加载订单详情
        this.loadOrderDetail(this.data.orderId)
        const reminder = res.result.data && res.result.data.reminder
        if (reminder && reminder.sent === false) {
          wx.showModal({
            title: '投喂单已更新',
            content: `微信提醒未发送：${reminder.message}`,
            showCancel: false
          })
        } else if (reminder && reminder.sent) {
          wx.showToast({ title: '投喂单已更新并提醒对方', icon: 'success' })
        } else {
          wx.showToast({ title: '投喂单已更新', icon: 'success' })
        }
      } else {
        wx.showToast({
          title: res.result.message || '更新失败',
          icon: 'none'
        })
      }
    }).catch(err => {
      wx.hideLoading()
      wx.showToast({
        title: '更新失败',
        icon: 'error'
      })
      console.error('更新订单状态失败', err)
    })
  },

  // 查看菜谱详情
  onViewRecipe: function(e) {
    const recipeId = e.currentTarget.dataset.recipeId
    wx.navigateTo({
      url: `/pages/recipe-detail/recipe-detail?id=${recipeId}`
    })
  },

  // 返回订单列表
  onGoBack: function() {
    wx.navigateBack()
  },

  onShareOrderTap: function() {
    const order = this.data.order
    const orderId = order && order._id ? order._id : this.data.orderId
    if (orderId) {
      this.createShareNotification(orderId)
    }
  },

  onShareAppMessage: function() {
    const order = this.data.order
    if (!order) {
      return share.getBrandShare()
    }

    return share.getOrderShare(order, this.data.orderId)
  },

  createShareNotification: function(orderId) {
    util.callCloudFunction('notification', {
      action: 'createShareNotification',
      type: 'order_share',
      orderId
    }).catch(err => {
      console.error('创建投喂单分享通知失败:', err)
    })
  }
})
