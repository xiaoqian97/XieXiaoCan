const app = getApp()
const util = require('../../utils/util')

Page({
  data: {
    userSearchCode: 'FY2024',
    searchCode: '',
    pendingRequests: [],
    receivedHistoryRequests: [],
    displayedReceivedHistoryRequests: [],
    receivedHistoryExpanded: false,
    sentRequests: [],
    displayedSentRequests: [],
    sentRequestsExpanded: false,
    loading: true,
    statusBarHeight: 20,
    currentUserOpenid: ''
  },

  onLoad: function () {
    if (!util.requireLogin('绑定饭搭子需要登录')) {
      this.setData({ loading: false })
      return
    }
    this.getStatusBarHeight()
    this.loadCurrentUserOpenid()
    this.loadUserSearchCode()
    this.loadRequestsData()
  },

  onShow: function () {
    if (!util.isLoggedIn()) return
    // 获取状态栏高度
    this.getStatusBarHeight()
    // 刷新数据
    this.loadUserSearchCode()
    this.loadRequestsData()
  },

  onReady: function () {
    // 页面渲染完成后再次获取状态栏高度
    this.getStatusBarHeight()
  },

  onPullDownRefresh: function() {
    if (!util.isLoggedIn()) {
      wx.stopPullDownRefresh()
      return
    }
    this.loadCurrentUserOpenid()
    this.loadUserSearchCode()
    this.loadRequestsData().finally(() => wx.stopPullDownRefresh())
  },

  // 获取状态栏高度
  getStatusBarHeight: function() {
    try {
      const systemInfo = wx.getSystemInfoSync()
      const statusBarHeight = systemInfo.statusBarHeight || 20
      
      this.setData({
        statusBarHeight: statusBarHeight
      })
    } catch (error) {
      console.error('获取状态栏高度失败:', error)
      this.setData({
        statusBarHeight: 20
      })
    }
  },

  // 加载当前用户openid
  loadCurrentUserOpenid: function() {
    wx.cloud.callFunction({
      name: 'user',
      data: {
        action: 'getProfile'
      },
      success: (res) => {
        if (res.result.success && res.result.data.user) {
          this.setData({
            currentUserOpenid: res.result.data.user.openid
          })
        }
      },
      fail: (error) => {
        console.error('获取当前用户openid失败:', error)
      }
    })
  },

  // 加载用户搜索码
  loadUserSearchCode: function() {
    wx.cloud.callFunction({
      name: 'user',
      data: {
        action: 'getProfile'
      },
      success: (res) => {
        if (res.result.success && res.result.data.user) {
          const user = res.result.data.user
          if (user.searchCode) {
            this.setData({
              userSearchCode: user.searchCode
            })
          } else {
            // 如果没有搜索码，生成一个
            this.generateUserSearchCode()
          }
        } else {
          // 如果用户不存在，生成一个搜索码
          this.generateUserSearchCode()
        }
      },
      fail: (error) => {
        console.error('获取用户信息失败:', error)
        // 生成一个默认搜索码
        this.generateUserSearchCode()
      }
    })
  },

  // 生成用户搜索码
  generateUserSearchCode: function() {
    wx.cloud.callFunction({
      name: 'user',
      data: {
        action: 'generateSearchCode'
      },
      success: (res) => {
        if (res.result.success) {
          this.setData({
            userSearchCode: res.result.data.searchCode
          })
          
          // 同步更新全局用户信息
          const app = getApp()
          if (app.globalData.userInfo) {
            app.globalData.userInfo.searchCode = res.result.data.searchCode
            // 更新本地存储
            wx.setStorageSync('userInfo', app.globalData.userInfo)
          }
        } else {
          // 如果生成失败，使用默认值
          this.setData({
            userSearchCode: 'FY' + Date.now().toString().slice(-6)
          })
        }
      },
      fail: (error) => {
        console.error('生成搜索码失败:', error)
        // 使用默认值
        this.setData({
          userSearchCode: 'FY' + Date.now().toString().slice(-6)
        })
      }
    })
  },

  // 加载请求数据
  loadRequestsData: function() {
    this.setData({ loading: true })

    return util.callCloudFunction('friend', { action: 'getFriendRequests' }).then(res => {
      const data = res.data || {}
      const pendingRequests = data.pendingRequests || []
      const receivedHistoryRequests = data.receivedHistoryRequests || []
      const sentRequests = data.sentRequests || []
      return Promise.all([
        util.resolveCloudImages(pendingRequests.map(item => item.avatar), '/images/default-avatar.png'),
        util.resolveCloudImages(receivedHistoryRequests.map(item => item.avatar), '/images/default-avatar.png'),
        util.resolveCloudImages(sentRequests.map(item => item.avatar), '/images/default-avatar.png')
      ]).then(([pendingAvatars, receivedHistoryAvatars, sentAvatars]) => {
        this.setData({
          pendingRequests: pendingRequests.map((item, index) => ({ ...item, avatar: pendingAvatars[index] })),
          receivedHistoryRequests: receivedHistoryRequests.map((item, index) => ({ ...item, avatar: receivedHistoryAvatars[index], swiped: false })),
          displayedReceivedHistoryRequests: receivedHistoryRequests.map((item, index) => ({ ...item, avatar: receivedHistoryAvatars[index], swiped: false })).slice(0, 3),
          receivedHistoryExpanded: false,
          sentRequests: sentRequests.map((item, index) => ({ ...item, avatar: sentAvatars[index], swiped: false })),
          displayedSentRequests: sentRequests.map((item, index) => ({ ...item, avatar: sentAvatars[index], swiped: false })).slice(0, 3),
          sentRequestsExpanded: false,
          loading: false
        })
      })
    }).catch(error => {
      util.showError(error.message || '获取请求列表失败')
      this.setData({
        pendingRequests: [],
        receivedHistoryRequests: [],
        displayedReceivedHistoryRequests: [],
        sentRequests: [],
        displayedSentRequests: [],
        loading: false
      })
    })
  },

  // 返回上一页
  onBack: function() {
    wx.navigateBack()
  },

  // 清空所有请求
  onClearAll: function() {
    this.selectComponent('#themeConfirmDialog').open({
      icon: '🧹',
      title: '确认清空',
      content: '确定要清空所有绑定申请吗？',
      confirmText: '清空申请',
      tone: 'danger'
    }).then(confirmed => {
      if (!confirmed) return
      this.setData({ pendingRequests: [], sentRequests: [] })
      wx.showToast({ title: '已清空', icon: 'success' })
    })
  },

  // 搜索码输入
  onSearchCodeInput: function(e) {
    this.setData({
      searchCode: e.detail.value
    })
  },

  // 清空搜索码
  onClearSearchCode: function() {
    this.setData({
      searchCode: ''
    })
  },

  // 搜索好友
  onSearchFriend: function() {
    const searchCode = this.data.searchCode.trim()
    
    if (!searchCode) {
      wx.showToast({
        title: '请输入搜索码',
        icon: 'none'
      })
      return
    }

    wx.showLoading({ title: '搜索中...' })
    
    // 先搜索用户
    wx.cloud.callFunction({
      name: 'user',
      data: {
        action: 'searchUser',
        searchCode: searchCode
      },
      success: (res) => {
        wx.hideLoading()
        if (res.result.success) {
          const user = res.result.data.user
          
          // 检查是否是自己
          if (user.openid === this.data.currentUserOpenid) {
            wx.showToast({
              title: '不能和自己绑定',
              icon: 'none'
            })
            return
          }
          
          this.selectComponent('#themeConfirmDialog').open({
            icon: '👋',
            title: '找到用户',
            content: `是否向“${user.nickname}”发送绑定申请？`,
            confirmText: '发送申请'
          }).then(confirmed => {
            if (confirmed) this.sendFriendRequest(user.openid, user.nickname, user.avatar)
          })
        } else {
          wx.showToast({
            title: res.result.message || '用户不存在',
            icon: 'none'
          })
        }
      },
      fail: (error) => {
        wx.hideLoading()
        console.error('搜索用户失败:', error)
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none'
        })
      }
    })
  },

  // 发送好友请求
  sendFriendRequest: function(targetOpenid, nickname, avatar) {
    wx.showLoading({ title: '发送中...' })
    
    wx.cloud.callFunction({
      name: 'friend',
      data: {
        action: 'sendFriendRequest',
        targetOpenid: targetOpenid,
        message: ''
      },
      success: (res) => {
        wx.hideLoading()
        if (res.result.success) {
          wx.showToast({
            title: '请求已发送',
            icon: 'success'
          })
          
          this.loadRequestsData()
          
          // 清空搜索框
          this.setData({
            searchCode: ''
          })
          
          // 通知好友页面刷新数据
          this.notifyFriendsPageRefresh()
        } else {
          wx.showToast({
            title: res.result.message || '发送失败',
            icon: 'none'
          })
        }
      },
      fail: (error) => {
        wx.hideLoading()
        console.error('发送好友请求失败:', error)
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none'
        })
      }
    })
  },

  // 分享搜索码
  onShareCode: function() {
    wx.setClipboardData({
      data: this.data.userSearchCode,
      success: () => {
        wx.showToast({
          title: '搜索码已复制',
          icon: 'success'
        })
      }
    })
  },

  // 更新搜索码
  onUpdateSearchCode: function() {
    this.selectComponent('#themeConfirmDialog').open({
      icon: '🔑',
      title: '更新搜索码',
      content: '确定要生成新的搜索码吗？旧的搜索码将失效。',
      confirmText: '生成新码',
      tone: 'danger'
    }).then(confirmed => {
      if (!confirmed) return
      wx.showLoading({ title: '生成中...' })
      wx.cloud.callFunction({
        name: 'user',
        data: { action: 'updateSearchCode' },
        success: (res) => {
          wx.hideLoading()
          if (res.result.success) {
            this.setData({ userSearchCode: res.result.data.searchCode })
            const app = getApp()
            if (app.globalData.userInfo) {
              app.globalData.userInfo.searchCode = res.result.data.searchCode
              wx.setStorageSync('userInfo', app.globalData.userInfo)
            }
            wx.showToast({ title: '搜索码已更新', icon: 'success' })
          } else {
            wx.showToast({ title: res.result.message || '更新失败', icon: 'none' })
          }
        },
        fail: (error) => {
          wx.hideLoading()
          console.error('更新搜索码失败:', error)
          wx.showToast({ title: '网络错误，请重试', icon: 'none' })
        }
      })
    })
  },

  // 接受好友请求
  onAcceptRequest: function(e) {
    const requestId = e.currentTarget.dataset.id
    const nickname = e.currentTarget.dataset.nickname || ''
    
    wx.showModal({
      title: '设置对方备注',
      content: nickname,
      editable: true,
      placeholderText: nickname || '输入对方的备注昵称',
      success: (res) => {
        if (res.confirm) {
          this.handleFriendRequest(requestId, true, res.content || nickname)
        }
      }
    })
  },

  // 拒绝好友请求
  onRejectRequest: function(e) {
    const requestId = e.currentTarget.dataset.id
    
    this.selectComponent('#themeConfirmDialog').open({
      icon: '🙅',
      title: '确认拒绝',
      content: '确定要拒绝这个绑定申请吗？',
      confirmText: '拒绝申请',
      tone: 'danger'
    }).then(confirmed => {
      if (confirmed) this.handleFriendRequest(requestId, false)
    })
  },

  // 处理好友请求
  handleFriendRequest: function(requestId, accept, remark = '') {
    wx.showLoading({ title: accept ? '接受中...' : '拒绝中...' })
    
    wx.cloud.callFunction({
      name: 'friend',
      data: {
        action: 'handleFriendRequest',
        requestId: requestId,
        accept: accept,
        remark: remark
      },
      success: (res) => {
        wx.hideLoading()
        if (res.result.success) {
          if (accept) {
            app.globalData.friendDataVersion = (app.globalData.friendDataVersion || 0) + 1
          }
          // 从待处理列表中移除
          this.removePendingRequest(requestId)
          
          wx.showToast({
            title: accept ? '绑定成功' : '已拒绝',
            icon: 'success'
          })
          
          // 通知好友页面刷新数据
          if (accept) {
            this.notifyFriendsPageRefresh()
          }
        } else {
          wx.showToast({
            title: res.result.message || '操作失败',
            icon: 'none'
          })
        }
      },
      fail: (error) => {
        wx.hideLoading()
        console.error('处理好友请求失败:', error)
        wx.showToast({
          title: '网络错误，请重试',
          icon: 'none'
        })
      }
    })
  },

  onCancelSentRequest: function(e) {
    const requestId = e.currentTarget.dataset.id
    this.selectComponent('#themeConfirmDialog').open({
      icon: '↩️',
      title: '取消绑定申请',
      content: '取消后对方将无法再接受本次申请。',
      confirmText: '确认取消',
      tone: 'danger'
    }).then(confirmed => {
      if (!confirmed) return
      return util.callCloudFunction('friend', { action: 'cancelFriendRequest', requestId }).then(() => {
        util.showSuccess('已取消绑定申请')
        this.loadRequestsData()
      }).catch(error => util.showError(error.message || '取消失败'))
    })
  },

  onSentTouchStart: function(e) {
    this._sentTouchStartX = e.touches && e.touches[0] ? e.touches[0].clientX : 0
  },

  onSentTouchEnd: function(e) {
    const endX = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : 0
    const deltaX = endX - (this._sentTouchStartX || 0)
    const requestId = e.currentTarget.dataset.id
    if (!requestId) return
    const sentRequests = this.data.sentRequests.map(item => ({
      ...item,
      swiped: deltaX < -40 ? item.id === requestId : (deltaX > 40 ? false : item.swiped)
    }))
    this.setData({
      sentRequests,
      displayedSentRequests: sentRequests.slice(0, this.data.sentRequestsExpanded ? sentRequests.length : 3)
    })
  },

  onDeleteSentRequest: function(e) {
    const requestId = e.currentTarget.dataset.id
    this.selectComponent('#themeConfirmDialog').open({
      icon: '🗑️',
      title: '删除申请记录',
      content: '删除后仅对你隐藏，不影响对方的记录。',
      confirmText: '删除记录',
      tone: 'danger'
    }).then(confirmed => {
      if (!confirmed) return
      return util.callCloudFunction('friend', { action: 'deleteFriendRequestRecord', requestId }).then(() => {
        const sentRequests = this.data.sentRequests.filter(item => item.id !== requestId)
        this.setData({
          sentRequests,
          displayedSentRequests: sentRequests.slice(0, this.data.sentRequestsExpanded ? sentRequests.length : 3)
        })
        util.showSuccess('申请记录已删除')
      }).catch(error => util.showError(error.message || '删除失败'))
    })
  },

  onReceivedTouchStart: function(e) {
    this._receivedTouchStartX = e.touches && e.touches[0] ? e.touches[0].clientX : 0
  },

  onReceivedTouchEnd: function(e) {
    const endX = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : 0
    const deltaX = endX - (this._receivedTouchStartX || 0)
    const requestId = e.currentTarget.dataset.id
    if (!requestId) return
    const receivedHistoryRequests = this.data.receivedHistoryRequests.map(item => ({
      ...item,
      swiped: deltaX < -40 ? item.id === requestId : (deltaX > 40 ? false : item.swiped)
    }))
    this.setData({
      receivedHistoryRequests,
      displayedReceivedHistoryRequests: receivedHistoryRequests.slice(0, this.data.receivedHistoryExpanded ? receivedHistoryRequests.length : 3)
    })
  },

  onDeleteReceivedRequest: function(e) {
    const requestId = e.currentTarget.dataset.id
    this.selectComponent('#themeConfirmDialog').open({
      icon: '🗑️',
      title: '删除申请记录',
      content: '删除后仅对你隐藏，不影响对方的记录或饭搭子关系。',
      confirmText: '删除记录',
      tone: 'danger'
    }).then(confirmed => {
      if (!confirmed) return
      return util.callCloudFunction('friend', { action: 'deleteReceivedFriendRequestRecord', requestId }).then(() => {
        const receivedHistoryRequests = this.data.receivedHistoryRequests.filter(item => item.id !== requestId)
        this.setData({
          receivedHistoryRequests,
          displayedReceivedHistoryRequests: receivedHistoryRequests.slice(0, this.data.receivedHistoryExpanded ? receivedHistoryRequests.length : 3)
        })
        util.showSuccess('申请记录已删除')
      }).catch(error => util.showError(error.message || '删除失败'))
    })
  },

  toggleReceivedHistory: function() {
    const receivedHistoryExpanded = !this.data.receivedHistoryExpanded
    const receivedHistoryRequests = this.data.receivedHistoryRequests
    this.setData({
      receivedHistoryExpanded,
      displayedReceivedHistoryRequests: receivedHistoryRequests.slice(0, receivedHistoryExpanded ? receivedHistoryRequests.length : 3)
    })
  },

  toggleSentRequests: function() {
    const sentRequestsExpanded = !this.data.sentRequestsExpanded
    const sentRequests = this.data.sentRequests
    this.setData({
      sentRequestsExpanded,
      displayedSentRequests: sentRequests.slice(0, sentRequestsExpanded ? sentRequests.length : 3)
    })
  },

  // 通知好友页面刷新数据
  notifyFriendsPageRefresh: function() {
    // 通过页面栈找到好友页面并刷新
    const pages = getCurrentPages()
    for (let i = pages.length - 1; i >= 0; i--) {
      const page = pages[i]
      if (page.route === 'pages/friends/friends' && page.onFriendRequestHandled) {
        page.onFriendRequestHandled()
        break
      }
    }
  },

  // 移除待处理请求
  removePendingRequest: function(requestId) {
    const pendingRequests = this.data.pendingRequests.filter(item => item.id !== requestId)
    this.setData({ pendingRequests })
  }
})
