const util = require('../../utils/util')

Page({
  data: {
    relationships: [],
    keyword: '',
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true,
    loading: false
  },

  onLoad() {
    this.refreshRelationships()
  },

  onPullDownRefresh() {
    this.refreshRelationships().finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.loadRelationships(false)
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    this.refreshRelationships()
  },

  onClearSearch() {
    this.setData({ keyword: '' })
    this.refreshRelationships()
  },

  refreshRelationships() {
    this.setData({ relationships: [], page: 1, hasMore: true })
    return this.loadRelationships(true)
  },

  loadRelationships(reset) {
    if (this.data.loading) return Promise.resolve()
    const page = reset ? 1 : this.data.page
    this.setData({ loading: true })
    return util.callCloudFunction('admin', {
      action: 'getRelationships',
      page,
      pageSize: this.data.pageSize,
      keyword: this.data.keyword
    }).then(res => {
      const data = res.data || {}
      const rows = (data.relationships || []).map(row => ({
        ...row,
        feederNames: (row.availableFeeders || []).map(feeder => feeder.nickname)
      }))
      return util.resolveCloudImages(rows.map(row => row.avatar), '/images/default-avatar.png').then(avatars => {
        const resolved = rows.map((row, index) => ({ ...row, avatar: avatars[index] }))
        this.setData({
          relationships: reset ? resolved : this.data.relationships.concat(resolved),
          total: data.total || 0,
          page: page + 1,
          hasMore: Boolean(data.hasMore),
          loading: false
        })
      })
    }).catch(error => {
      this.setData({ loading: false })
      util.showError(error.message || '投喂关系加载失败')
    })
  },

  onFeederChange(e) {
    const rowIndex = Number(e.currentTarget.dataset.index)
    const feederIndex = Number(e.detail.value)
    const row = this.data.relationships[rowIndex]
    const feeder = row && row.availableFeeders && row.availableFeeders[feederIndex]
    if (!row || !feeder || feeder.openid === row.fixedFeederOpenid) return

    const dialog = this.selectComponent('#feederSwitchDialog')
    if (!dialog) return
    dialog.open({
      dinerName: row.nickname,
      previousName: row.fixedFeederName,
      nextName: feeder.nickname
    }).then(confirmed => {
      if (confirmed) this.updateFixedFeeder(row.openid, feeder.openid)
    })
  },

  updateFixedFeeder(targetOpenid, feederOpenid) {
    wx.showLoading({ title: '正在更新...' })
    util.callCloudFunction('admin', {
      action: 'setFixedFeeder',
      targetOpenid,
      feederOpenid
    }).then(result => {
      wx.hideLoading()
      util.showSuccess(result.message || '关系已更新')
      this.refreshRelationships()
    }).catch(error => {
      wx.hideLoading()
      util.showError(error.message || '关系更新失败')
    })
  },

  onClearFeeder(e) {
    const row = e.currentTarget.dataset.row
    if (!row || !row.fixedFeederOpenid) return
    this.selectComponent('#themeConfirmDialog').open({
      icon: '💔',
      title: '清除固定投喂官',
      content: `清除后，“${row.nickname}”将暂时无法提交投喂单，确定继续吗？`,
      confirmText: '确认清除',
      tone: 'danger'
    }).then(confirmed => {
      if (!confirmed) return
      wx.showLoading({ title: '正在清除...' })
      util.callCloudFunction('admin', {
        action: 'clearFixedFeeder',
        targetOpenid: row.openid
      }).then(result => {
        wx.hideLoading()
        util.showSuccess(result.message || '已清除')
        this.refreshRelationships()
      }).catch(error => {
        wx.hideLoading()
        util.showError(error.message || '清除失败')
      })
    })
  }
})
