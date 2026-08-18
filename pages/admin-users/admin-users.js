const util = require('../../utils/util')

const ROLE_OPTIONS = [
  { value: 'chef', label: '投喂官' },
  { value: 'consumer', label: '点菜人' }
]

Page({
  data: {
    users: [],
    keyword: '',
    currentRole: '',
    roleFilters: [
      { value: '', label: '全部' },
      { value: 'feeder', label: '全部投喂官' },
      { value: 'admin', label: '管理员' },
      ...ROLE_OPTIONS
    ],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
    total: 0,
    canManageAdmins: false
  },

  onLoad(options) {
    const currentUser = getApp().globalData.userInfo || wx.getStorageSync('userInfo') || {}
    this.setData({ canManageAdmins: Boolean(currentUser.isPrimaryAdmin) })
    const role = options.role || ''
    if (this.data.roleFilters.some(item => item.value === role)) {
      this.setData({ currentRole: role })
    }
    this.refreshUsers()
  },

  onPullDownRefresh() {
    this.refreshUsers().finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.loadUsers(false)
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    this.refreshUsers()
  },

  onClearSearch() {
    this.setData({ keyword: '' })
    this.refreshUsers()
  },

  onRoleFilter(e) {
    this.setData({ currentRole: e.currentTarget.dataset.role || '' })
    this.refreshUsers()
  },

  refreshUsers() {
    this.setData({ users: [], page: 1, hasMore: true })
    return this.loadUsers(true)
  },

  loadUsers(reset) {
    if (this.data.loading) return Promise.resolve()
    this.setData({ loading: true })
    const page = reset ? 1 : this.data.page
    return util.callCloudFunction('admin', {
      action: 'getUsers',
      page,
      pageSize: this.data.pageSize,
      keyword: this.data.keyword,
      role: this.data.currentRole
    }).then(res => {
      const data = res.data || {}
      const users = data.users || []
      return util.resolveCloudImages(users.map(user => user.avatar), '/images/default-avatar.png').then(avatars => {
        const resolved = users.map((user, index) => ({ ...user, avatar: avatars[index] }))
        this.setData({
          users: reset ? resolved : this.data.users.concat(resolved),
          total: data.total || 0,
          page: page + 1,
          hasMore: Boolean(data.hasMore),
          loading: false
        })
      })
    }).catch(error => {
      this.setData({ loading: false })
      util.showError(error.message || '用户列表加载失败')
    })
  },

  onRoleAction(e) {
    const user = e.currentTarget.dataset.user
    if (!user) return
    wx.showActionSheet({
      itemList: ROLE_OPTIONS.map(item => item.label),
      success: res => {
        const nextRole = ROLE_OPTIONS[res.tapIndex]
        if (!nextRole || nextRole.value === user.role) return
        this.confirmRoleChange(user, nextRole)
      }
    })
  },

  onAdminPermissionAction(e) {
    const user = e.currentTarget.dataset.user
    if (!user) return
    if (user.isPrimaryAdmin && user.isAdmin) {
      util.showError('主管理员权限不可取消')
      return
    }
    const enabled = !user.isAdmin
    this.selectComponent('#themeConfirmDialog').open({
      icon: '🛡️',
      title: enabled ? '授予管理员权限' : '取消管理员权限',
      content: enabled
        ? `确定让“${user.nickname}”同时拥有管理员权限吗？其${user.roleLabel}身份不会改变。`
        : `确定取消“${user.nickname}”的管理员权限吗？其${user.roleLabel}身份不会改变。`,
      confirmText: enabled ? '确认授予' : '取消权限',
      tone: enabled ? 'primary' : 'danger'
    }).then(confirmed => {
      if (!confirmed) return
      wx.showLoading({ title: '正在更新...' })
      util.callCloudFunction('admin', {
        action: 'updateAdminPermission',
        targetOpenid: user.openid,
        enabled
      }).then(result => {
        wx.hideLoading()
        util.showSuccess(result.message || '权限已更新')
        this.refreshUsers()
      }).catch(error => {
        wx.hideLoading()
        util.showError(error.message || '权限更新失败')
      })
    })
  },

  confirmRoleChange(user, nextRole) {
    this.selectComponent('#themeConfirmDialog').open({
      icon: '🎭',
      title: '确认修改身份',
      content: `确定将“${user.nickname}”设为${nextRole.label}吗？身份将在对方下次登录时同步到本地。`,
      confirmText: '确认修改'
    }).then(confirmed => {
      if (!confirmed) return
      wx.showLoading({ title: '正在更新...' })
      util.callCloudFunction('admin', {
        action: 'updateUserRole',
        targetOpenid: user.openid,
        role: nextRole.value
      }).then(result => {
        wx.hideLoading()
        util.showSuccess(result.message || '身份已更新')
        this.refreshUsers()
      }).catch(error => {
        wx.hideLoading()
        util.showError(error.message || '身份更新失败')
      })
    })
  }
})
