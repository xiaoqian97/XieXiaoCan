const util = require('../../utils/util')
const { getTheme } = require('../../utils/blessingData')

Page({
  data: {
    activeTab: 'received',
    blessings: [],
    loading: true
  },

  onLoad(options) {
    if (options.tab === 'sent') this.setData({ activeTab: 'sent' })
  },

  onShow() {
    if (this.collapseDuplicatePage()) return
    if (!util.requireLogin('查看祝福需要登录')) {
      this.setData({ loading: false })
      return
    }
    this.loadBlessings()
  },

  collapseDuplicatePage() {
    const pages = getCurrentPages()
    const currentIndex = pages.length - 1
    const firstIndex = pages.findIndex(page => page.route === 'pages/blessings/blessings')
    if (firstIndex < 0 || firstIndex === currentIndex || this._collapsing) return false

    this._collapsing = true
    const targetPage = pages[firstIndex]
    if (targetPage && typeof targetPage.setData === 'function') {
      targetPage.setData({ activeTab: this.data.activeTab })
    }
    wx.navigateBack({ delta: currentIndex - firstIndex })
    return true
  },

  onPullDownRefresh() {
    this.loadBlessings().finally(() => wx.stopPullDownRefresh())
  },

  switchTab(e) {
    const activeTab = e.currentTarget.dataset.tab
    if (activeTab === this.data.activeTab) return
    this.setData({ activeTab }, () => this.loadBlessings())
  },

  loadBlessings() {
    const requestId = (this._blessingRequestId || 0) + 1
    const mode = this.data.activeTab
    this._blessingRequestId = requestId
    this.setData({ loading: true })
    return util.callCloudFunction('blessing', { action: 'list', mode }).then(res => {
      if (requestId !== this._blessingRequestId || mode !== this.data.activeTab) return
      this.setData({
        blessings: (res.data || []).map(item => this.decorate(item, mode)),
        loading: false
      })
    }).catch(error => {
      if (requestId !== this._blessingRequestId) return
      this.setData({ blessings: [], loading: false })
      util.showError(error.message || '祝福还没加载出来')
    })
  },

  decorate(item, mode = this.data.activeTab) {
    const theme = getTheme(item.themeKey)
    return {
      ...item,
      themeClass: theme.className,
      emoji: item.type === 'festival' ? theme.emoji : theme.emoji,
      displayTime: formatTime(item.sendAt || item.createdAt),
      displayStatus: getDisplayStatus(item),
      statusText: getStatusText(item),
      personText: mode === 'sent' ? `送给 ${item.recipientName}` : `来自 ${item.senderName}`
    }
  },

  openDetail(e) {
    wx.navigateTo({ url: `/pages/blessing-detail/blessing-detail?id=${e.currentTarget.dataset.id}` })
  },

  createBlessing() {
    wx.navigateTo({ url: '/pages/blessing-compose/blessing-compose' })
  }
})

function getStatusText(item) {
  if (item.status === 'sent' && item.readAt) return '已查看'
  if (item.status === 'sent' && item.dismissedAt && item.canSeeDismissedStatus) return '已收起'
  return { scheduled: '等待送达', processing: '正在送达', sent: '已送达', cancelled: '已取消', failed: '发送失败' }[item.status] || ''
}

function getDisplayStatus(item) {
  if (item.status === 'sent' && item.readAt) return 'viewed'
  if (item.status === 'sent' && item.dismissedAt && item.canSeeDismissedStatus) return 'dismissed'
  return item.status
}

function formatTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
