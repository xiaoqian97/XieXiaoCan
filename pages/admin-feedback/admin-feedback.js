const util = require('../../utils/util')

Page({
  data: {
    currentType: '',
    tabs: [
      { value: '', label: '全部' },
      { value: 'feedback', label: '反馈' },
      { value: 'suggestion', label: '建议' }
    ],
    items: [],
    total: 0,
    pendingTotal: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
    processingId: ''
  },

  onLoad() {
    const userInfo = getApp().globalData.userInfo || wx.getStorageSync('userInfo') || {}
    if (!userInfo.isAdmin && userInfo.role !== 'admin') {
      util.showError('仅管理员可以访问')
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    this.refreshData()
  },

  onPullDownRefresh() {
    this.refreshData().finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.loadData(false)
  },

  changeType(e) {
    const type = e.currentTarget.dataset.type || ''
    if (type === this.data.currentType) return
    this.setData({ currentType: type })
    this.refreshData()
  },

  refreshData() {
    this.setData({ items: [], total: 0, pendingTotal: 0, page: 1, hasMore: true })
    return this.loadData(true)
  },

  loadData(reset) {
    if (this.data.loading) return Promise.resolve()
    const page = reset ? 1 : this.data.page
    this.setData({ loading: true })
    return util.callCloudFunction('feedback', {
      action: 'list',
      type: this.data.currentType,
      page,
      pageSize: this.data.pageSize
    }).then(res => {
      const data = res.data || {}
      const rawItems = (data.items || []).map(item => ({
        ...item,
        displayTime: this.formatTime(item.createdAt)
      }))
      return this.resolveImages(rawItems).then(items => {
        this.setData({
          items: reset ? items : this.data.items.concat(items),
          total: Number(data.total) || 0,
          pendingTotal: Number(data.pendingTotal) || 0,
          page: page + 1,
          hasMore: Boolean(data.hasMore),
          loading: false
        })
      })
    }).catch(error => {
      this.setData({ loading: false })
      util.showError(error.message || '反馈加载失败')
    })
  },

  resolveImages(items) {
    const avatars = items.map(item => item.creatorAvatar)
    const feedbackImages = []
    items.forEach(item => (item.images || []).forEach(image => feedbackImages.push(image)))
    return Promise.all([
      util.resolveCloudImages(avatars, '/images/default-avatar.png'),
      util.resolveCloudImages(feedbackImages, '/images/default-recipe.jpg')
    ]).then(([resolvedAvatars, resolvedFeedbackImages]) => {
      let imageIndex = 0
      return items.map((item, index) => {
        const displayImages = (item.images || []).map(() => resolvedFeedbackImages[imageIndex++])
        return { ...item, displayAvatar: resolvedAvatars[index], displayImages }
      })
    })
  },

  previewImage(e) {
    const item = this.data.items[Number(e.currentTarget.dataset.itemIndex)]
    if (!item || !item.displayImages.length) return
    const imageIndex = Number(e.currentTarget.dataset.imageIndex) || 0
    wx.previewImage({ current: item.displayImages[imageIndex], urls: item.displayImages })
  },

  processFeedback(e) {
    const feedbackId = e.currentTarget.dataset.id
    if (!feedbackId || this.data.processingId) return
    this.selectComponent('#themeConfirmDialog').open({
      icon: '✅',
      title: '确认处理完成',
      content: '确认该反馈或建议已经处理完成吗？',
      confirmText: '标记已处理'
    }).then(confirmed => {
      if (!confirmed) return
      this.setData({ processingId: feedbackId })
      util.callCloudFunction('feedback', { action: 'process', feedbackId }).then(result => {
        const processedAt = result.data && result.data.processedAt
        this.setData({
          items: this.data.items.map(item => item._id === feedbackId
            ? { ...item, status: 'processed', processedAt }
            : item),
          pendingTotal: Math.max(0, this.data.pendingTotal - 1),
          processingId: ''
        })
        util.showSuccess('已处理')
      }).catch(error => {
        this.setData({ processingId: '' })
        util.showError(error.message || '处理失败')
      })
    })
  },

  formatTime(value) {
    if (!value) return '时间未记录'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '时间未记录'
    const pad = number => String(number).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
})
