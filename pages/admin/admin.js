const util = require('../../utils/util')

Page({
  data: {
    loading: true,
    stats: {
      userCount: 0,
      feederCount: 0,
      activeOrderCount: 0,
      recipeCount: 0,
      relationshipCount: 0
    }
  },

  onLoad() {
    const userInfo = getApp().globalData.userInfo || wx.getStorageSync('userInfo') || {}
    if (!userInfo.isAdmin && userInfo.role !== 'admin') {
      this._authorized = false
      util.showError('仅管理员可以访问')
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    this._authorized = true
  },

  onShow() {
    if (this._authorized) this.loadDashboard()
  },

  onPullDownRefresh() {
    this.loadDashboard().finally(() => wx.stopPullDownRefresh())
  },

  loadDashboard() {
    this.setData({ loading: true })
    return util.callCloudFunction('admin', { action: 'getDashboard' }).then(res => {
      this.setData({ stats: res.data || {}, loading: false })
    }).catch(error => {
      this.setData({ loading: false })
      util.showError(error.message || '工作台加载失败')
    })
  },

  openUsers(e) {
    const role = (e && e.currentTarget.dataset.role) || ''
    wx.navigateTo({ url: `/pages/admin-users/admin-users?role=${role}` })
  },

  openRelationships() {
    wx.navigateTo({ url: '/pages/admin-relations/admin-relations' })
  },

  openDataList(e) {
    const type = e.currentTarget.dataset.type
    wx.navigateTo({ url: `/pages/admin-data/admin-data?type=${type}` })
  }
})
