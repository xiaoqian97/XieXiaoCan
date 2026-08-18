const TagData = require('../../utils/tagData')
const util = require('../../utils/util')
const share = require('../../utils/share')

/**
 * 投喂单列表页面
 */
Page({
  data: {
    // 投喂单数据
    orders: [],
    loading: true,
    hasMore: true,
    page: 1,
    pageSize: 10,
    refreshing: false,
    
    // 状态筛选
    statusTabs: TagData.getOrderStatusTabs(),
    currentStatus: 'all',
    
    // 搜索
    searchValue: '',
    showSearch: false,
    
    // 用户信息
    userInfo: null,
    sharingOrder: null
  },

  // 防抖定时器
  searchTimer: null,

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



  onLoad: function() {
    if (!util.requireLogin('查看投喂单需要登录')) {
      this.setData({ loading: false })
      return
    }
    this.getUserInfo()
    this.loadOrders()
  },

  onUnload: function() {
    // 页面卸载时清理定时器
    if (this.searchTimer) {
      clearTimeout(this.searchTimer)
      this.searchTimer = null
    }
  },

  onShow: function() {
    // 更新自定义tabbar的选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 'order'
      })
    }
    
    // 更新用户信息
    this.getUserInfo()

    if (this._viewedOrderId) {
      const orderId = this._viewedOrderId
      this._viewedOrderId = ''
      this.syncOrderCard(orderId)
    }
  },


  // scroll-view 下拉刷新
  onRefresh: function() {
    this.setData({
      refreshing: true
    })
    this.refreshData()
  },

  onReachBottom: function() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore()
    }
  },

  // 刷新数据
  refreshData: function() {
    this.setData({
      orders: [],
      page: 1,
      hasMore: true,
      loading: true,
      refreshing: true
    })
    this.loadOrders()
  },

  // 加载投喂单列表
  loadOrders: function() {
    if (!util.isLoggedIn()) return
    const { page, pageSize, currentStatus, searchValue } = this.data
    
    
    wx.cloud.callFunction({
      name: 'order',
      data: {
        action: 'getOrderList',
        status: currentStatus === 'all' ? null : currentStatus,
        page: page,
        limit: pageSize,
        searchValue: searchValue || ''
      }
    }).then(res => {
      if (res.result.success) {
        const orders = res.result.data.orders || []
        return Promise.all(orders.map(order => this.resolveOrderImages(order)))
      } else {
        throw new Error(res.result.message || '投喂单没加载出来')
      }
    }).then(orders => {
        this.setData({
          orders: page === 1 ? orders : [...this.data.orders, ...orders],
          hasMore: orders.length === pageSize,
          loading: false,
          refreshing: false
        })
      wx.stopPullDownRefresh()
    }).catch(err => {
      this.setData({ 
        loading: false,
        refreshing: false
      })
      wx.stopPullDownRefresh()
      wx.showToast({
        title: '投喂单没加载出来',
        icon: 'error'
      })
      console.error('加载订单列表失败', err)
    })
  },



  // 加载更多
  loadMore: function() {
    this.setData({
      page: this.data.page + 1,
      loading: true
    })
    this.loadOrders()
  },

  // 状态筛选
  onStatusChange: function(e) {
    const status = e.currentTarget.dataset.status
    this.setData({
      currentStatus: status,
      orders: [],
      page: 1,
      hasMore: true
    })
    this.loadOrders()
  },

  // 搜索功能
  onSearchClick: function() {
    this.setData({
      showSearch: !this.data.showSearch
    })
  },

  onSearchChange: function(e) {
    const searchValue = e.detail
    
    // 更新搜索值
    this.setData({
      searchValue: searchValue
    })
    
    // 清除之前的定时器
    if (this.searchTimer) {
      clearTimeout(this.searchTimer)
    }
    
    // 设置防抖定时器，500ms后执行搜索
    this.searchTimer = setTimeout(() => {
      this.performSearch()
    }, 500)
  },

  // 新增独立的搜索方法
  performSearch: function() {
    this.setData({
      orders: [],
      page: 1,
      hasMore: true,
      loading: true
      // 注意：不设置 refreshing: true，避免与下拉刷新冲突
    })
    this.loadOrders()
  },

  onSearchClear: function() {
    this.setData({
      searchValue: '',
      showSearch: false
    })
    this.refreshData()
  },

  // 投喂单点击
  onOrderClick: function(e) {
    const orderId = e.currentTarget.dataset.orderId
    const index = this.data.orders.findIndex(item => item._id === orderId)
    if (this._suppressOrderClick || (index >= 0 && this.data.orders[index].swipeOffset)) {
      if (index >= 0) this.setData({ [`orders[${index}].swipeOffset`]: 0 })
      return
    }
    wx.navigateTo({
      url: `/pages/order-detail/order-detail?orderId=${orderId}`,
      success: () => {
        this._viewedOrderId = orderId
      }
    })
  },

  syncOrderCard: function(orderId) {
    const index = this.data.orders.findIndex(order => order._id === orderId)
    if (index < 0) return

    util.callCloudFunction('order', {
      action: 'getOrderDetail',
      orderId
    }).then(res => {
      const detail = res.data || {}
      if (this.data.currentStatus !== 'all' && detail.status !== this.data.currentStatus) {
        this.setData({ orders: this.data.orders.filter(order => order._id !== orderId) })
        return null
      }
      const current = this.data.orders[index]
      return this.resolveOrderImages({
        ...current,
        ...detail,
        creator: {
          ...(current.creator || {}),
          nickname: detail.creatorName || (current.creator && current.creator.nickname),
          avatar: detail.creatorAvatar || (current.creator && current.creator.avatar)
        },
        assignee: {
          ...(current.assignee || {}),
          nickname: detail.assigneeName || (current.assignee && current.assignee.nickname),
          avatar: detail.assigneeAvatar || (current.assignee && current.assignee.avatar)
        }
      })
    }).then(order => {
      if (!order) return
      const currentIndex = this.data.orders.findIndex(item => item._id === orderId)
      if (currentIndex >= 0) this.setData({ [`orders[${currentIndex}]`]: order })
    }).catch(() => {})
  },

  resolveOrderImages: function(order) {
    const recipes = order.recipes || []
    return Promise.all([
      util.resolveCloudImages(recipes.map(item => item.image)),
      util.resolveCloudImage(order.creator && order.creator.avatar, '/images/default-avatar.png'),
      util.resolveCloudImage(order.assignee && order.assignee.avatar, '/images/default-avatar.png')
    ]).then(([images, creatorAvatar, assigneeAvatar]) => ({
      ...order,
      creator: {
        ...(order.creator || {}),
        displayAvatar: creatorAvatar
      },
      assignee: {
        ...(order.assignee || {}),
        displayAvatar: assigneeAvatar
      },
      recipes: recipes.map((recipe, index) => ({
        ...recipe,
        displayImage: images[index]
      })),
      swipeOffset: 0
    }))
  },

  onOrderTouchStart: function(e) {
    const touch = e.touches && e.touches[0]
    if (!touch) return
    const orderId = e.currentTarget.dataset.orderId
    const index = this.data.orders.findIndex(item => item._id === orderId)
    if (index < 0) return
    this._orderSwipe = {
      index,
      startX: touch.clientX,
      startY: touch.clientY,
      startOffset: Number(this.data.orders[index].swipeOffset) || 0,
      horizontal: false
    }
    const updates = {}
    this.data.orders.forEach((item, itemIndex) => {
      if (itemIndex !== index && item.swipeOffset) updates[`orders[${itemIndex}].swipeOffset`] = 0
    })
    if (Object.keys(updates).length) this.setData(updates)
  },

  onOrderTouchMove: function(e) {
    if (!this._orderSwipe) return
    const touch = e.touches && e.touches[0]
    if (!touch) return
    const deltaX = touch.clientX - this._orderSwipe.startX
    const deltaY = touch.clientY - this._orderSwipe.startY
    if (!this._orderSwipe.horizontal && Math.abs(deltaX) < 8) return
    if (!this._orderSwipe.horizontal && Math.abs(deltaX) <= Math.abs(deltaY)) return
    this._orderSwipe.horizontal = true
    const offset = Math.max(-76, Math.min(0, this._orderSwipe.startOffset + deltaX))
    this.setData({ [`orders[${this._orderSwipe.index}].swipeOffset`]: offset })
  },

  onOrderTouchEnd: function() {
    if (!this._orderSwipe) return
    const { index, horizontal } = this._orderSwipe
    const currentOffset = Number(this.data.orders[index].swipeOffset) || 0
    this.setData({ [`orders[${index}].swipeOffset`]: currentOffset < -36 ? -76 : 0 })
    if (horizontal) {
      this._suppressOrderClick = true
      setTimeout(() => { this._suppressOrderClick = false }, 250)
    }
    this._orderSwipe = null
  },

  onDeleteOrder: function(e) {
    const orderId = e.currentTarget.dataset.orderId
    this.selectComponent('#themeConfirmDialog').open({
      icon: '🗑️',
      title: '删除投喂单',
      content: '删除后将不再显示在你的投喂单列表中。',
      confirmText: '删除',
      tone: 'danger'
    }).then(confirmed => {
      if (!confirmed) return
      util.callCloudFunction('order', { action: 'hideOrder', orderId }).then(() => {
        this.setData({ orders: this.data.orders.filter(item => item._id !== orderId) })
        util.showSuccess('已删除')
      }).catch(error => util.showError(error.message || '删除失败'))
    })
  },

  onShareOrderTap: function(e) {
    const orderId = e.currentTarget.dataset.orderId
    const order = this.data.orders.find(item => item._id === orderId)
    this.setData({
      sharingOrder: order || null
    })
    if (order) {
      this.createShareNotification(order._id)
    }
  },

  onShareAppMessage: function(options) {
    const orderId = options && options.target && options.target.dataset ? options.target.dataset.orderId : ''
    const order = this.data.orders.find(item => item._id === orderId) || this.data.sharingOrder
    if (!order) {
      return share.getBrandShare()
    }

    return share.getOrderShare(order)
  },

  createShareNotification: function(orderId) {
    util.callCloudFunction('notification', {
      action: 'createShareNotification',
      type: 'order_share',
      orderId
    }).catch(err => {
      console.error('创建投喂单分享通知失败:', err)
    })
  },

  // 获取状态样式
  getStatusStyle: function(status) {
    return TagData.getOrderStatusStyle(status)
  },

  // 跳转到饭篮页面
  onGoToDiancan: function() {
    wx.switchTab({
      url: '/pages/diancan/diancan'
    })
  },

  // 开始投喂
  onStartCooking: function(e) {
    const orderId = e.currentTarget.dataset.orderId
    
    this.selectComponent('#themeConfirmDialog').open({
      icon: '🔥',
      title: '开始投喂',
      content: '确定要开始投喂这张投喂单吗？',
      confirmText: '开始投喂'
    }).then(confirmed => {
      if (confirmed) this.updateOrderStatus(orderId, 'processing', '开始投喂')
    })
  },

  // 投喂完成
  onCompleteOrder: function(e) {
    const orderId = e.currentTarget.dataset.orderId
    
    this.selectComponent('#themeConfirmDialog').open({
      icon: '✨',
      title: '完成投喂',
      content: '确定这张投喂单已经完成了吗？',
      confirmText: '完成投喂'
    }).then(confirmed => {
      if (confirmed) this.updateOrderStatus(orderId, 'completed', '投喂完成')
    })
  },

  // 取消投喂
  onCancelOrder: function(e) {
    const orderId = e.currentTarget.dataset.orderId
    
    this.selectComponent('#themeConfirmDialog').open({
      icon: '↩️',
      title: '取消投喂',
      content: '确定要取消这次投喂吗？',
      confirmText: '取消投喂',
      tone: 'danger'
    }).then(confirmed => {
      if (confirmed) this.updateOrderStatus(orderId, 'cancelled', '取消投喂')
    })
  },

  // 再来一单
  onOrderAgain: function(e) {
    const orderId = e.currentTarget.dataset.orderId
    
    // 跳转到点餐页面，可以预填充菜品信息
    wx.switchTab({
      url: '/pages/diancan/diancan'
    })
  },

  // 更新投喂单状态
  updateOrderStatus: function(orderId, status, actionName) {
    wx.showLoading({
      title: '安排中...'
    })

    wx.cloud.callFunction({
      name: 'order',
      data: {
        action: 'updateOrderStatus',
        orderId: orderId,
        status: status
      }
    }).then(res => {
      wx.hideLoading()
      
      if (res.result.success) {
        wx.showToast({
          title: `${actionName}成功`,
          icon: 'success'
        })
        // 刷新订单列表
        this.refreshData()
      } else {
        wx.showToast({
          title: res.result.message || `${actionName}失败`,
          icon: 'none'
        })
      }
    }).catch(err => {
      wx.hideLoading()
      wx.showToast({
        title: `${actionName}失败`,
        icon: 'error'
      })
      console.error('更新订单状态失败', err)
    })
  }
})  
