const util = require('../../utils/util')

Page({
  data: {
    loading: true,
    category: 'festival',
    status: 'all',
    categories: [{ value: 'festival', label: '节日祝福' }, { value: 'friend', label: '好友送出' }],
    statuses: [{ value: 'all', label: '全部' }, { value: 'opened', label: '已拆开' }, { value: 'unopened', label: '未拆开' }, { value: 'dismissed', label: '已收起' }, { value: 'failed', label: '失败' }],
    summary: { total: 0, sent: 0, opened: 0, unopened: 0, dismissed: 0, failed: 0, wechatSent: 0 },
    items: [],
    detail: null,
    detailLoading: false
  },

  onLoad() {
    const userInfo = getApp().globalData.userInfo || wx.getStorageSync('userInfo') || {}
    if (!userInfo.isPrimaryAdmin) {
      util.showError('仅主管理员可以查看')
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    this._authorized = true
    this.loadLogs()
  },

  onPullDownRefresh() {
    if (!this._authorized) return wx.stopPullDownRefresh()
    this.loadLogs().finally(() => wx.stopPullDownRefresh())
  },

  switchCategory(e) {
    const category = e.currentTarget.dataset.value
    if (category === this.data.category) return
    this.setData({ category, status: 'all', detail: null }, () => this.loadLogs())
  },

  switchStatus(e) {
    const status = e.currentTarget.dataset.value
    if (status === this.data.status) return
    this.setData({ status, detail: null }, () => this.loadLogs())
  },

  loadLogs() {
    this.setData({ loading: true })
    return util.callCloudFunction('blessing', {
      action: 'getAdminLogs',
      category: this.data.category,
      status: this.data.status,
      page: 1,
      pageSize: 100
    }).then(res => {
      const data = res.data || {}
      this.setData({
        summary: data.summary || this.data.summary,
        items: (data.items || []).map(formatItem),
        loading: false
      })
    }).catch(error => {
      this.setData({ loading: false, items: [] })
      util.showError(error.message || '祝福日志加载失败')
    })
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id || this.data.detailLoading) return
    this.setData({ detailLoading: true })
    util.callCloudFunction('blessing', { action: 'getAdminLogDetail', id }).then(res => {
      this.setData({ detail: formatItem(res.data || {}), detailLoading: false })
    }).catch(error => {
      this.setData({ detailLoading: false })
      util.showError(error.message || '祝福详情加载失败')
    })
  },

  closeDetail() {
    this.setData({ detail: null })
  },

  noop() {
    // 阻止详情面板点击事件穿透到遮罩层。
  }
})

function formatItem(item) {
  return {
    ...item,
    sentAtText: formatTime(item.sentAt || item.createdAt),
    readAtText: formatTime(item.readAt),
    dismissedAtText: formatTime(item.dismissedAt),
    wechatText: { sent: '已发送', failed: '发送失败', pending: '等待发送', skipped: '未发送' }[item.wechatStatus] || '未发送'
  }
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
