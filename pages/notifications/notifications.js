const util = require('../../utils/util')
const navigation = require('../../utils/navigation')

Page({
  data: {
    notifications: [],
    unreadCount: 0,
    loading: true,
    markingAllRead: false,
    loadingMore: false,
    page: 1,
    pageSize: 20,
    hasMore: true
  },

  onLoad() {
    if (!util.requireLogin('查看通知需要登录')) {
      this.setData({ loading: false })
    }
  },

  onShow() {
    this.loadNotifications(true)
  },

  onPullDownRefresh() {
    this.loadNotifications(true).finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (!this.data.loading && !this.data.loadingMore && this.data.hasMore) this.loadNotifications(false)
  },

  loadNotifications(reset = true) {
    if (!util.isLoggedIn()) return Promise.resolve()
    const page = reset ? 1 : this.data.page + 1
    this.setData(reset ? { loading: true, page: 1 } : { loadingMore: true })

    return util.callCloudFunction('notification', {
      action: 'list',
      page,
      limit: this.data.pageSize
    }).then(res => {
      const payload = Array.isArray(res.data) ? { notifications: res.data } : (res.data || {})
      const notifications = (payload.notifications || []).map(item => this.decorateNotification(item))
      this.setData({
        notifications: reset ? notifications : [...this.data.notifications, ...notifications],
        unreadCount: Number.isFinite(Number(payload.unreadCount))
          ? Number(payload.unreadCount)
          : notifications.filter(item => !item.read).length,
        page,
        hasMore: typeof payload.hasMore === 'boolean' ? payload.hasMore : notifications.length === this.data.pageSize,
        loading: false,
        loadingMore: false
      })
    }).catch(err => {
      this.setData({ loading: false, loadingMore: false })
      util.showError(err.message || '消息没加载出来')
    })
  },

  openNotification(e) {
    const { id, page } = e.currentTarget.dataset
    const index = this.data.notifications.findIndex(item => item._id === id)
    if (this._suppressNotificationClick || (index >= 0 && this.data.notifications[index].swipeOffset)) {
      if (index >= 0) this.setData({ [`notifications[${index}].swipeOffset`]: 0 })
      return
    }
    const wasUnread = index >= 0 && !this.data.notifications[index].read
    const previousUnreadCount = this.data.unreadCount
    const notifications = this.data.notifications.map(item => (
      item._id === id ? { ...item, read: true } : item
    ))
    this.setData({
      notifications,
      unreadCount: Math.max(0, previousUnreadCount - (wasUnread ? 1 : 0))
    })

    util.callCloudFunction('notification', {
      action: 'markRead',
      notificationId: id
    }).catch(err => {
      console.error('标记通知已读失败:', err)
      if (index >= 0) {
        this.setData({
          [`notifications[${index}].read`]: !wasUnread,
          unreadCount: previousUnreadCount
        })
      }
      util.showError('已读状态同步失败，请稍后重试')
    })

    if (page) navigation.navigateToTarget(page).catch(() => {})
  },

  markAllRead() {
    if (!this.data.unreadCount || this.data.markingAllRead) return

    this.setData({ markingAllRead: true })
    util.callCloudFunction('notification', {
      action: 'markAllRead'
    }).then(() => {
      this.setData({
        notifications: this.data.notifications.map(item => ({ ...item, read: true })),
        unreadCount: 0,
        markingAllRead: false
      })
      wx.showToast({ title: '消息已全部读完', icon: 'success' })
    }).catch(err => {
      this.setData({ markingAllRead: false })
      util.showError(err.message || '操作失败，请稍后重试')
    })
  },

  onNotificationTouchStart(e) {
    const id = e.currentTarget.dataset.id
    const index = this.data.notifications.findIndex(item => item._id === id)
    const touch = e.touches && e.touches[0]
    if (index < 0 || !touch) return
    this._notificationSwipe = {
      index,
      startX: touch.clientX,
      startY: touch.clientY,
      startOffset: Number(this.data.notifications[index].swipeOffset) || 0,
      horizontal: false
    }
    const updates = {}
    this.data.notifications.forEach((item, itemIndex) => {
      if (itemIndex !== index && item.swipeOffset) updates[`notifications[${itemIndex}].swipeOffset`] = 0
    })
    if (Object.keys(updates).length) this.setData(updates)
  },

  onNotificationTouchMove(e) {
    if (!this._notificationSwipe) return
    const touch = e.touches && e.touches[0]
    if (!touch) return
    const deltaX = touch.clientX - this._notificationSwipe.startX
    const deltaY = touch.clientY - this._notificationSwipe.startY
    if (!this._notificationSwipe.horizontal && Math.abs(deltaX) <= Math.abs(deltaY)) return
    this._notificationSwipe.horizontal = true
    const offset = Math.max(-76, Math.min(0, this._notificationSwipe.startOffset + deltaX))
    this.setData({ [`notifications[${this._notificationSwipe.index}].swipeOffset`]: offset })
  },

  onNotificationTouchEnd() {
    if (!this._notificationSwipe) return
    const { index, horizontal } = this._notificationSwipe
    const currentOffset = Number(this.data.notifications[index].swipeOffset) || 0
    this.setData({ [`notifications[${index}].swipeOffset`]: currentOffset < -36 ? -76 : 0 })
    this._notificationSwipe = null
    if (horizontal) {
      this._suppressNotificationClick = true
      setTimeout(() => { this._suppressNotificationClick = false }, 250)
    }
  },

  onDeleteNotification(e) {
    const id = e.currentTarget.dataset.id
    const index = this.data.notifications.findIndex(item => item._id === id)
    if (index < 0) return
    util.callCloudFunction('notification', {
      action: 'delete',
      notificationId: id
    }).then(() => {
      const notifications = this.data.notifications.filter(item => item._id !== id)
      const wasUnread = !this.data.notifications[index].read
      this.setData({
        notifications,
        unreadCount: Math.max(0, this.data.unreadCount - (wasUnread ? 1 : 0))
      })
      wx.showToast({ title: '已删除', icon: 'success' })
    }).catch(err => {
      this.setData({ [`notifications[${index}].swipeOffset`]: 0 })
      util.showError(err.message || '删除失败，请稍后重试')
    })
  },

  decorateNotification(item) {
    const typeMap = {
      order_share: { icon: '🍱', typeLabel: '投喂单', themeClass: 'order' },
      order_created: { icon: '🍱', typeLabel: '新投喂单', themeClass: 'order' },
      order_status: { icon: '🍲', typeLabel: '投喂进度', themeClass: 'order' },
      wish_share: { icon: '💭', typeLabel: '饭愿', themeClass: 'wish' },
      wish_received: { icon: '🍽️', typeLabel: '新的饭愿', themeClass: 'wish' },
      wish_status: { icon: '💭', typeLabel: '饭愿进度', themeClass: 'wish' },
      friend_request: { icon: '👥', typeLabel: '饭搭子申请', themeClass: 'friend' },
      friend_request_result: { icon: '🤝', typeLabel: '申请结果', themeClass: 'friend' },
      blessing: { icon: '💌', typeLabel: '祝福', themeClass: 'blessing' },
      festival_blessing: { icon: '✨', typeLabel: '节日祝福', themeClass: 'festival' }
    }
    const meta = typeMap[item.type] || { icon: '🔔', typeLabel: '我的消息', themeClass: 'default' }
    return {
      ...item,
      ...meta,
      title: sanitizeTerminology(item.title),
      content: sanitizeTerminology(sanitizeLegacyWishContent(item)),
      displayTime: formatMessageTime(item.createdAt, item.createdAtText),
      read: item.read === true,
      swipeOffset: 0
    }
  }
})

function sanitizeLegacyWishContent(item) {
  const content = String(item.content || '')
  if (item.type !== 'wish_share') return content
  if (content.includes('来看看这份饭愿吧')) return content
  const wishName = content
    .replace(/[，,]?饭钱\s*¥?\s*\d+(?:\.\d+)?/g, '')
    .replace(/[，,]?饭钱待定/g, '')
    .replace(/[，,、\s]+$/g, '')
  return `${wishName || '想吃的菜'}，来看看这份饭愿吧`
}

function sanitizeTerminology(value) {
  return String(value || '').replace(/家里人/g, '饭搭子')
}

function formatMessageTime(value, fallback) {
  if (!value) return fallback || ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback || ''
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const dayDiff = Math.round((startToday - startTarget) / 86400000)
  const pad = number => String(number).padStart(2, '0')
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (dayDiff === 0) return `今天 ${time}`
  if (dayDiff === 1) return `昨天 ${time}`
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}
