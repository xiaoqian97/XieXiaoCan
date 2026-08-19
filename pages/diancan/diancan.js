const cartManager = require('../../utils/cartManager')
const tagData = require('../../utils/tagData')
const util = require('../../utils/util')
const subscribe = require('../../utils/subscribe')
const share = require('../../utils/share')

Page({
  data: {
    // 饭篮数据
    cartItems: [],
    cartStats: {
      totalCount: 0,
      selectedCount: 0,
      hasItems: false,
      hasSelected: false
    },
    
    // 投喂单配置
    selectedFriend: null,
    selectedFriendId: '',
    selectedDate: '',
    minDate: '',
    maxDate: '',
    selectedTime: '',
    selectedTimeLabel: '', // 时间显示标签
    orderNotes: '',
    showPostCreateShare: false,
    postCreateShareContent: '',
    
    // 时间选项
    timeOptions: [],
    
    // 选择器状态
    showTimeSelector: false,
    
    // 计算属性
    canCreateOrder: false,
    submittingOrder: false
  },

  onLoad: function() {
    // 初始化时间选项
    const timeOptions = tagData.getMealTimes()
    this.setData({
      timeOptions: timeOptions
    })
    
    this.loadCartData()
    this.initDate()
    
    // 如果已有选择的时间，确保标签也被设置
    if (this.data.selectedTime) {
      const timeOption = timeOptions.find(t => t.value === this.data.selectedTime)
      if (timeOption) {
        this.setData({
          selectedTimeLabel: timeOption.label
        })
      }
    }
  },

  onShow: function () {
    const userInfo = getApp().globalData.userInfo || wx.getStorageSync('userInfo') || {}
    if (['chef', 'admin'].includes(userInfo.role)) {
      wx.showToast({ title: '投喂官请前往投喂单处理需求', icon: 'none' })
      wx.switchTab({ url: '/pages/order-list/order-list' })
      return
    }
    require('../../utils/analytics').trackEvent('cart_view')

    // 更新自定义tabbar的选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 'diancan'
      })
    }
    
    // 刷新饭篮数据
    this.loadCartData()
    this.loadBoundFriends()
    subscribe.preload()
    cartManager.syncFromCloud().then(() => this.loadCartData())
    
    // 确保时间标签正确显示
    if (this.data.selectedTime && !this.data.selectedTimeLabel) {
      const timeOption = this.data.timeOptions.find(t => t.value === this.data.selectedTime)
      if (timeOption) {
        this.setData({
          selectedTimeLabel: timeOption.label
        })
      }
    }
  },

  // 加载饭篮数据
  loadCartData: function() {
    const cartData = cartManager.getCartData()
    const displayImageMap = this.data.cartItems.reduce((map, item) => {
      if (item.displayImage) map[item.cartKey] = item.displayImage
      return map
    }, {})
    const cartItems = cartData.cartItems.map(item => ({
      ...item,
      displayImage: displayImageMap[item.cartKey] || item.displayImage || ''
    }))
    this.setData({
      cartItems,
      cartStats: {
        totalCount: cartData.totalCount,
        selectedCount: cartData.selectedCount,
        hasItems: cartData.totalCount > 0,
        hasSelected: cartData.selectedCount > 0
      }
    })
    this.resolveCartImages(cartItems)
    this.updateCanCreateOrder()
  },

  // 空饭篮时前往菜品页
  goToRecipes: function() {
    wx.switchTab({
      url: '/pages/recipe-list/recipe-list'
    })
  },

  resolveCartImages: function(cartItems) {
    const unresolvedItems = cartItems.filter(item => !item.displayImage)
    if (!unresolvedItems.length) return
    util.resolveCloudImages(unresolvedItems.map(item => item.image)).then(images => {
      const imageMap = unresolvedItems.reduce((map, item, index) => {
        map[item.cartKey] = images[index]
        return map
      }, {})
      this.setData({
        cartItems: this.data.cartItems.map(item => ({
          ...item,
          displayImage: item.displayImage || imageMap[item.cartKey]
        }))
      })
    })
  },

  loadBoundFriends: function() {
    if (!util.isLoggedIn()) return
    util.callCloudFunction('friend', { action: 'getFriendList' }).then(res => {
      const friends = res.data || []
      const fixedFeeder = friends.find(friend => friend.isFixedFeeder) || null
      const selectedFriend = fixedFeeder
        ? {
            ...fixedFeeder,
            displayName: fixedFeeder.remark || fixedFeeder.nickname || fixedFeeder.originalNickname || '固定投喂官'
          }
        : null
      this.setData({
        selectedFriend,
        selectedFriendId: selectedFriend ? selectedFriend.openid : ''
      })
      this.updateCanCreateOrder()
    }).catch(error => {
      this.setData({ selectedFriend: null, selectedFriendId: '' })
      util.showError(error.message || '固定投喂官信息加载失败')
      this.updateCanCreateOrder()
    })
  },

  // 初始化日期
  initDate: function() {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    const maxDate = new Date(today)
    maxDate.setDate(today.getDate() + 30)
    this.setData({
      selectedDate: `${year}-${month}-${day}`,
      minDate: this.formatDate(today),
      maxDate: this.formatDate(maxDate)
    })
  },

  // 更新是否可以提交投喂单
  updateCanCreateOrder: function() {
    const { selectedFriend, selectedTime, cartStats } = this.data
    const canCreate = Boolean(selectedFriend && selectedTime && cartStats.selectedCount > 0)
    this.setData({
      canCreateOrder: canCreate
    })
  },

  // 切换商品选中状态
  onToggleSelection: function(e) {
    const cartKey = e.currentTarget.dataset.cartKey
    cartManager.toggleRecipeSelection(cartKey)
    this.loadCartData()
  },

  // 移除商品
  onRemoveItem: function(e) {
    const cartKey = e.currentTarget.dataset.cartKey
    this.selectComponent('#themeConfirmDialog').open({
      icon: '🧺',
      title: '拿出这道菜？',
      content: '确定要从饭篮里拿出这道菜吗？',
      confirmText: '拿出',
      tone: 'danger'
    }).then(confirmed => {
      if (!confirmed) return
      cartManager.removeFromCart(cartKey)
      this.loadCartData()
      wx.showToast({ title: '已拿出', icon: 'success' })
    })
  },

  onCustomDateChange: function(e) {
    this.setData({
      selectedDate: e.detail.value
    })
  },

  // 选择时间
  onSelectTime: function() {
    this.setData({
      showTimeSelector: true
    })
  },

  // 时间选择回调
  onTimeSelect: function(e) {
    const time = e.currentTarget.dataset.time
    const timeOption = this.data.timeOptions.find(t => t.value === time)
    this.setData({
      selectedTime: time,
      selectedTimeLabel: timeOption ? timeOption.label : time,
      showTimeSelector: false
    })
    this.updateCanCreateOrder()
  },
  
  // 获取时间标签
  getTimeLabel: function(timeValue) {
    if (!timeValue) return ''
    const timeOption = this.data.timeOptions.find(t => t.value === timeValue)
    return timeOption ? timeOption.label : timeValue
  },

  // 关闭时间选择器
  onCloseTimeSelector: function() {
    this.setData({
      showTimeSelector: false
    })
  },

  // 备注输入
  onNotesInput: function(e) {
    this.setData({
      orderNotes: e.detail.value
    })
  },

  // 创建投喂单
  onCreateOrder: function() {
    if (this.data.submittingOrder) return
    if (!util.requireLogin('提交投喂单需要登录')) return
    const { selectedFriend, selectedTime, selectedDate, orderNotes, cartItems } = this.data
    if (!selectedFriend) {
      this.promptSetFixedFeeder()
      return
    }
    
    if (!selectedTime) {
      wx.showToast({
        title: '请选择开饭时间',
        icon: 'none'
      })
      return
    }
    
    const selectedRecipes = cartItems.filter(item => item.isSelected)
    if (selectedRecipes.length === 0) {
      wx.showToast({
        title: '先勾选要安排的菜',
        icon: 'none'
      })
      return
    }

    if (selectedRecipes.some(recipe => recipe.authorId !== selectedFriend.openid)) {
      util.showError('饭篮中存在不属于当前投喂官的菜，请移除后重试')
      return
    }
    
    // 必须由本次点击直接触发订阅授权，异步加载模板会失去 TAP 手势。
    subscribe.requestNext('orderStatus').finally(() => {
      this.selectComponent('#themeConfirmDialog').open({
        icon: '🍽️',
        title: '确认提交投喂单',
        content: `确定让${selectedFriend.displayName || selectedFriend.nickname}投喂${selectedRecipes.length}道菜吗？`,
        confirmText: '提交投喂单'
      }).then(confirmed => {
        if (confirmed) this.submitOrder(selectedRecipes, selectedFriend, selectedTime, selectedDate, orderNotes)
      })
    })
  },

  promptSetFixedFeeder: function() {
    this.selectComponent('#themeConfirmDialog').open({
      icon: '🏠',
      title: '还没有固定投喂官',
      content: '提交投喂单前，需要先在“我的饭搭子”中选择一位投喂官，并设为固定投喂官。',
      confirmText: '去设置',
      cancelText: '稍后再说'
    }).then(confirmed => {
      if (confirmed) wx.navigateTo({ url: '/pages/friends/friends' })
    })
  },

  // 提交投喂单
  submitOrder: function(recipes, friend, mealType, orderDate, notes) {
    if (this.data.submittingOrder) return
    const requestId = this._pendingOrderRequestId || `order_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    this._pendingOrderRequestId = requestId
    this.setData({ submittingOrder: true })
    wx.showLoading({
      title: '提交投喂单中...'
    })
    
    // 调用云函数创建投喂单
    wx.cloud.callFunction({
      name: 'order',
      data: {
        action: 'createOrder',
        orderData: {
          requestId,
          recipes: recipes.map(recipe => ({
            type: recipe.type || 'recipe',
            wishId: recipe.wishId || '',
            recipeId: recipe.recipeId,
            recipeName: recipe.recipeName,
            authorId: recipe.authorId,
            authorName: recipe.authorName,
            authorAvatar: recipe.authorAvatar,
            image: recipe.image,
            preparationTime: recipe.preparationTime,
            difficulty: recipe.difficulty,
            servingSize: recipe.servingSize,
            note: recipe.note || ''
          })),
          assigneeId: friend.openid,
          mealType: mealType,
          orderDate: orderDate,
          orderTime: new Date().toISOString(),
          notes: notes
        }
      }
    }).then(res => {
      if (res.result.success) {
        this._pendingOrderRequestId = ''
        getApp().globalData.orderDataVersion = (getApp().globalData.orderDataVersion || 0) + 1
        const resultData = res.result.data || {}
        const reminder = resultData.reminder
        this._postCreateOrderShare = {
          _id: resultData.orderId,
          status: 'pending',
          creatorName: (getApp().globalData.userInfo || {}).nickname || '饭搭子',
          mealTypeLabel: this.data.selectedTimeLabel || '今日',
          recipes: recipes.map(recipe => ({ image: recipe.image, displayImage: recipe.displayImage }))
        }
        // 清空已选择的商品
        recipes.forEach(recipe => {
          cartManager.removeFromCart(recipe.cartKey || recipe.recipeId)
        })
        
        // 刷新饭篮数据
        this.loadCartData()
        
        // 重置选择状态
        this.setData({
          selectedTime: '',
          selectedTimeLabel: '',
          orderNotes: ''
        })
        
        this.setData({
          showPostCreateShare: true,
          postCreateShareContent: reminder && reminder.sent === false
            ? '微信提醒可能没有送达，可以分享给投喂官，方便 TA 及时看到你的点餐需求。'
            : '可以分享给投喂官，方便 TA 及时看到你的点餐需求。'
        })
      } else {
        this._pendingOrderRequestId = ''
        wx.showToast({
          title: res.result.message || '投喂单没提交成功',
          icon: 'none'
        })
      }
    }).catch(err => {
      console.error('创建投喂单失败:', err)
      wx.showToast({
        title: '投喂单没提交成功',
        icon: 'none'
      })
    }).finally(() => {
      wx.hideLoading()
      this.setData({ submittingOrder: false })
    })
  },

  onPostCreateShareClose: function() {
    this.setData({ showPostCreateShare: false })
    wx.switchTab({ url: '/pages/order-list/order-list' })
  },

  onShareAppMessage: function() {
    return this._postCreateOrderShare
      ? share.getOrderShare(this._postCreateOrderShare, this._postCreateOrderShare._id)
      : share.getBrandShare()
  },

  // 跳转到菜谱页面
  onGoToRecipes: function() {
    wx.switchTab({
      url: '/pages/recipe-list/recipe-list'
    })
  },

  // 格式化日期
  formatDate: function(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
})
