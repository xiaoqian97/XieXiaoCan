const util = require('../../utils/util')
const navigation = require('../../utils/navigation')

Page({
  data: {
    notifications: [],
    unreadCount: 0,
    loading: true,
    markingAllRead: false
  },

  onLoad() {
    if (!util.requireLogin('查看通知需要登录')) {
      this.setData({ loading: false })
    }
  },

  onShow() {
    this.loadNotifications()
  },

  onPullDownRefresh() {
    this.loadNotifications().finally(() => wx.stopPullDownRefresh())
  },

  loadNotifications() {
    if (!util.isLoggedIn()) return Promise.resolve()
    this.setData({ loading: true })

    return util.callCloudFunction('notification', {
      action: 'list'
    }).then(res => {
      const notifications = (res.data || []).map(item => this.decorateNotification(item))
      this.setData({
        notifications,
        unreadCount: notifications.filter(item => !item.read).length,
        loading: false
      })
    }).catch(err => {
      this.setData({ loading: false })
      util.showError(err.message || '消息没加载出来')
    })
  },

  openNotification(e) {
    const { id, page } = e.currentTarget.dataset
    const notifications = this.data.notifications.map(item => (
      item._id === id ? { ...item, read: true } : item
    ))
    this.setData({
      notifications,
      unreadCount: notifications.filter(item => !item.read).length
    })

    util.callCloudFunction('notification', {
      action: 'markRead',
      notificationId: id
    }).catch(err => {
      console.error('标记通知已读失败:', err)
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

  decorateNotification(item) {
    const typeMap = {
      order_share: { icon: '🍱', typeLabel: '投喂单', themeClass: 'order' },
      wish_share: { icon: '💭', typeLabel: '饭愿', themeClass: 'wish' },
      blessing: { icon: '💌', typeLabel: '祝福', themeClass: 'blessing' },
      festival_blessing: { icon: '✨', typeLabel: '节日祝福', themeClass: 'festival' }
    }
    const meta = typeMap[item.type] || { icon: '🔔', typeLabel: '我的消息', themeClass: 'default' }
    return {
      ...item,
      ...meta,
      title: sanitizeTerminology(item.title),
      content: sanitizeTerminology(sanitizeLegacyWishContent(item)),
      displayTime: formatMessageTime(item.createdAt, item.createdAtText)
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
