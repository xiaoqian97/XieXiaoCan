const app = getApp()
const util = require('../../utils/util')
const cartManager = require('../../utils/cartManager')

const ADMIN_ROLE_OPTIONS = [
  { value: 'chef', label: '投喂官' },
  { value: 'consumer', label: '点菜人' }
]

Page({
  data: {
    friends: [],
    filteredFriends: [],
    friendRequestCount: 0,
    loading: true,
    isDataLoaded: false,
    showSearch: true,
    searchKeyword: '',
    searchFocus: false
  },

  onLoad: function () {
    if (!util.requireLogin('饭搭子功能需要登录')) {
      this.setData({ loading: false })
      return
    }
    
    // 先测试云函数调用是否正常
    this.testCloudFunction()
  },

  // 测试云函数调用
  testCloudFunction: function() {
    if (!wx.cloud) {
      console.error('云开发不可用')
      return
    }
    
    wx.cloud.callFunction({
      name: 'user',
      data: {
        action: 'getProfile'
      },
      success: (res) => {
        // 测试成功后直接调用好友数据加载，不通过loadFriendsData
        this.loadFriendsDataDirect()
      },
      fail: (error) => {
        console.error('测试云函数调用失败:', error)
        // 即使测试失败也尝试加载好友数据
        this.loadFriendsDataDirect()
      }
    })
  },

  onShow: function () {
    if (!util.isLoggedIn()) return
    // 更新自定义tabbar的选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 'friends'
      })
    }
    
    // 只在数据未加载或需要刷新时才加载数据
    if (!this.data.isDataLoaded) {
      this.loadFriendsData()
    }
  },

  onPullDownRefresh: function() {
    if (!util.isLoggedIn()) {
      wx.stopPullDownRefresh()
      return
    }
    this.setData({ isDataLoaded: false })
    this.loadFriendsDataDirect().finally(() => wx.stopPullDownRefresh())
  },

  // 页面间通信 - 处理好友请求结果
  onFriendRequestHandled: function() {
    // 当好友请求被处理时，刷新数据
    this.refreshData()
  },

  // 手动刷新数据
  refreshData: function() {
    this.setData({ isDataLoaded: false })
    return this.loadFriendsData()
  },

  // 刷新按钮点击
  onRefresh: function() {
    this.refreshData()
  },

  // 直接加载好友数据（不检查loading状态）
  loadFriendsDataDirect: function() {
    
    // 检查云开发是否可用
    if (!wx.cloud) {
      console.error('云开发不可用，请检查基础库版本')
      wx.showToast({
        title: '云开发不可用',
        icon: 'none'
      })
      this.setData({
        friends: [],
        loading: false,
        isDataLoaded: false
      })
      return Promise.resolve()
    }
    
    this.setData({ loading: true })

    let timeoutId
    const timeout = new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => reject(new Error('加载超时，请重试')), 10000)
    })

    return Promise.race([
      util.callCloudFunction('friend', { action: 'getFriendList' }),
      timeout
    ]).then(res => {
      const friends = res.data || []
      return util.resolveCloudImages(
        friends.map(friend => friend.avatar),
        '/images/default-avatar.png'
      ).then(avatars => friends.map((friend, index) => ({ ...friend, avatar: avatars[index] })))
    }).then(resolvedFriends => {
      this.setData({
        friends: resolvedFriends,
        filteredFriends: resolvedFriends,
        loading: false,
        isDataLoaded: true
      })
      return this.loadFriendRequestCount()
    }).catch(error => {
      util.showError(error.message || '饭搭子列表加载失败')
      this.setData({
        friends: [],
        filteredFriends: [],
        loading: false,
        isDataLoaded: false
      })
    }).finally(() => clearTimeout(timeoutId))
  },

  // 加载好友数据（带重复检查）
  loadFriendsData: function() {
    
    // 防止重复加载
    if (this.data.loading) {
      return Promise.resolve()
    }
    
    // 如果数据已加载，直接返回
    if (this.data.isDataLoaded) {
      return Promise.resolve()
    }
    
    // 调用直接加载方法
    return this.loadFriendsDataDirect()
  },

  // 加载好友请求数量
  loadFriendRequestCount: function() {
    return util.callCloudFunction('friend', { action: 'getFriendRequests' }).then(res => {
      const pendingRequests = res.data && res.data.pendingRequests
      this.setData({ friendRequestCount: pendingRequests ? pendingRequests.length : 0 })
    }).catch(() => {})
  },

  // 切换搜索框显示（现在搜索框默认显示，此方法保留以防需要）
  onToggleSearch: function() {
    // 搜索框默认显示，此方法暂时保留
  },

  // 搜索输入
  onSearchInput: function(e) {
    const keyword = e.detail
    this.setData({
      searchKeyword: keyword
    })
    this.filterFriends()
  },

  // 搜索确认
  onSearchConfirm: function() {
    this.filterFriends()
  },

  // 清空搜索
  onClearSearch: function() {
    this.setData({
      searchKeyword: '',
      filteredFriends: this.data.friends
    })
  },

  // 过滤好友列表
  filterFriends: function() {
    const keyword = this.data.searchKeyword.trim().toLowerCase()
    const friends = this.data.friends
    
    if (!keyword) {
      this.setData({
        filteredFriends: friends
      })
      return
    }
    
    const filtered = friends.filter(friend => {
      return friend.nickname.toLowerCase().includes(keyword) ||
        (friend.originalNickname || '').toLowerCase().includes(keyword)
    })
    
    this.setData({
      filteredFriends: filtered
    })
    
  },

  // 添加好友
  onAddFriend: function() {
    wx.navigateTo({
      url: '/pages/friend-requests/friend-requests'
    })
  },

  // 跳转到好友请求页面
  onGoToRequests: function() {
    wx.navigateTo({
      url: '/pages/friend-requests/friend-requests'
    })
  },

  // 好友菜单
  onFriendMenu: function(e) {
    const friend = e.currentTarget.dataset.friend
    const actions = []
    const currentUser = app.globalData.userInfo || wx.getStorageSync('userInfo') || {}
    actions.push({
      label: '送 TA 一份祝福',
      handler: () => wx.navigateTo({
        url: `/pages/blessing-compose/blessing-compose?recipient=${encodeURIComponent(friend.openid)}`
      })
    })
    if (friend.canFeed) {
      actions.push({
        label: friend.isFixedFeeder ? '取消固定投喂官' : '设为固定投喂官',
        handler: () => friend.isFixedFeeder
          ? this.clearFixedFeeder(friend)
          : this.setFixedFeeder(friend)
      })
    }
    if (currentUser.isAdmin || currentUser.role === 'admin') {
      actions.push({ label: '修改身份', handler: () => this.changeFriendRole(friend) })
    }
    if (currentUser.isPrimaryAdmin) {
      actions.push({
        label: friend.isAdmin ? '取消管理员权限' : '授予管理员权限',
        handler: () => this.toggleFriendAdminPermission(friend)
      })
    }
    actions.push({ label: '修改备注', handler: () => this.editFriendRemark(friend) })
    if (friend.role !== 'consumer') {
      actions.push({ label: '查看菜谱', handler: () => this.openFriendRecipes(friend) })
    }
    actions.push(
      { label: '复制昵称去微信联系', handler: () => this.copyFriendNickname(friend) },
      { label: '解除绑定', handler: () => this.deleteFriend(friend) }
    )

    wx.showActionSheet({
      itemList: actions.map(item => item.label),
      success: (res) => {
        const action = actions[res.tapIndex]
        if (action) action.handler()
      }
    })
  },

  changeFriendRole: function(friend) {
    wx.showActionSheet({
      itemList: ADMIN_ROLE_OPTIONS.map(item => (
        item.value === friend.role ? `${item.label}（当前）` : item.label
      )),
      success: res => {
        const nextRole = ADMIN_ROLE_OPTIONS[res.tapIndex]
        if (!nextRole || nextRole.value === friend.role) return
        this.selectComponent('#themeConfirmDialog').open({
          icon: '🎭',
          title: '确认修改身份',
          content: `确定将“${friend.nickname}”设为${nextRole.label}吗？`,
          confirmText: '确认修改'
        }).then(confirmed => {
          if (!confirmed) return
          util.showLoading('正在修改...')
          util.callCloudFunction('admin', {
            action: 'updateUserRole',
            targetOpenid: friend.openid,
            role: nextRole.value
          }).then(result => {
            util.hideLoading()
            util.showSuccess(result.message || '身份已修改')
            this.loadFriendsDataDirect()
          }).catch(error => {
            util.hideLoading()
            util.showError(error.message || '身份修改失败')
          })
        })
      }
    })
  },

  toggleFriendAdminPermission: function(friend) {
    const enabled = !friend.isAdmin
    this.selectComponent('#themeConfirmDialog').open({
      icon: '🛡️',
      title: enabled ? '授予管理员权限' : '取消管理员权限',
      content: enabled
        ? `确定让“${friend.nickname}”同时拥有管理员权限吗？其${friend.identityLabel || '当前'}身份不会改变。`
        : `确定取消“${friend.nickname}”的管理员权限吗？其业务身份不会改变。`,
      confirmText: enabled ? '确认授予' : '取消权限',
      tone: enabled ? 'primary' : 'danger'
    }).then(confirmed => {
      if (!confirmed) return
      util.showLoading('正在更新...')
      util.callCloudFunction('admin', {
        action: 'updateAdminPermission',
        targetOpenid: friend.openid,
        enabled
      }).then(result => {
        util.hideLoading()
        util.showSuccess(result.message || '权限已更新')
        this.loadFriendsDataDirect()
      }).catch(error => {
        util.hideLoading()
        util.showError(error.message || '权限更新失败')
      })
    })
  },

  onViewFriendWishes: function(e) {
    const friend = e.currentTarget.dataset.friend
    if (!friend || !friend.openid) return
    wx.navigateTo({
      url: `/pages/wish-list/wish-list?mode=friend&friendId=${encodeURIComponent(friend.openid)}&friendName=${encodeURIComponent(friend.nickname || 'TA')}`
    })
  },

  onViewFriendFavorites: function(e) {
    const friend = e.currentTarget.dataset.friend
    if (!friend || !friend.openid) return
    wx.navigateTo({
      url: `/pages/favorites/favorites?mode=friend&friendId=${encodeURIComponent(friend.openid)}&friendName=${encodeURIComponent(friend.nickname || 'TA')}`
    })
  },

  setFixedFeeder: function(friend) {
    const current = this.data.friends.find(item => item.isFixedFeeder)
    const dialog = this.selectComponent('#feederSwitchDialog')
    if (!dialog) return
    dialog.open({
      previousName: current && current.nickname,
      nextName: friend.nickname
    }).then(confirmed => {
      if (!confirmed) return
      util.showLoading(current ? '正在更换...' : '正在设置...')
      return util.callCloudFunction('friend', {
        action: 'setFixedFeeder',
        friendOpenid: friend.openid
      }).then(result => {
        util.hideLoading()
        if (current) cartManager.removeByAuthor(current.openid)
        util.showSuccess(result.message || '固定投喂官已更新')
        this.loadFriendsDataDirect()
      }).catch(error => {
        util.hideLoading()
        util.showError(error.message || '设置失败')
      })
    })
  },

  clearFixedFeeder: function(friend) {
    this.selectComponent('#themeConfirmDialog').open({
      icon: '💔',
      title: '取消固定投喂官',
      content: `取消后将无法提交投喂单，确定取消“${friend.nickname}”吗？`,
      confirmText: '确认取消',
      tone: 'danger'
    }).then(confirmed => {
      if (!confirmed) return
      util.callCloudFunction('friend', { action: 'clearFixedFeeder' }).then(() => {
        cartManager.removeByAuthor(friend.openid)
        util.showSuccess('已取消固定投喂官')
        this.loadFriendsDataDirect()
      }).catch(error => util.showError(error.message || '取消失败'))
    })
  },

  copyFriendNickname: function(friend) {
    const text = friend.originalNickname || friend.nickname || ''
    if (!text) return
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '昵称已复制，去微信联系TA', icon: 'none' })
    })
  },

  openFriendRecipes: function(friend) {
    wx.setStorageSync('recipeListCreatorFilter', friend.openid)
    wx.switchTab({ url: '/pages/recipe-list/recipe-list' })
  },

  editFriendRemark: function(friend) {
    wx.showModal({
      title: '修改备注',
      editable: true,
      content: friend.remark || friend.originalNickname || friend.nickname,
      placeholderText: friend.remark || friend.originalNickname || friend.nickname,
      success: (modalRes) => {
        if (!modalRes.confirm) return
        util.callCloudFunction('friend', {
          action: 'updateRemark',
          friendOpenid: friend.openid,
          remark: modalRes.content
        }).then(() => {
          util.showSuccess('备注已更新')
          this.loadFriendsDataDirect()
        }).catch(error => util.showError(error.message || '备注修改失败'))
      }
    })
  },

  // 删除好友
  deleteFriend: function(friend) {
    this.selectComponent('#themeConfirmDialog').open({
      icon: '🔗',
      title: '解除绑定',
      content: `确定要解除与“${friend.nickname}”的绑定吗？未完成的投喂单和饭愿将自动取消，饭篮会移除对方的菜品，历史记录会保留。`,
      confirmText: '解除绑定',
      tone: 'danger'
    }).then(confirmed => {
      if (!confirmed) return
      wx.showLoading({ title: '删除中...' })
      wx.cloud.callFunction({
        name: 'friend',
        data: {
          action: 'deleteFriend',
          friendOpenid: friend.openid
        },
        success: (res) => {
          wx.hideLoading()
          if (res.result.success) {
            cartManager.removeByAuthor(friend.openid)
            const friends = this.data.friends.filter(item => item.id !== friend.id)
            this.setData({ friends })
            wx.showToast({ title: '已解除绑定', icon: 'success' })
          } else {
            wx.showToast({ title: res.result.message || '删除失败', icon: 'none' })
          }
        },
        fail: (error) => {
          wx.hideLoading()
          console.error('删除好友失败:', error)
          wx.showToast({ title: '网络错误，请重试', icon: 'none' })
        }
      })
    })
  }
})  
