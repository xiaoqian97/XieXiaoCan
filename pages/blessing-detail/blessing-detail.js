const app = getApp()
const util = require('../../utils/util')
const { getTheme } = require('../../utils/blessingData')

Page({
  data: { loading: true, blessing: null, isSender: false, cancelling: false },
  onLoad(options) {
    this._id = options.id || ''
    if (!util.requireLogin('查看祝福需要登录')) return this.setData({ loading: false })
    this.loadDetail()
  },
  loadDetail() {
    util.callCloudFunction('blessing', { action: 'detail', id: this._id }).then(res => {
      const item = res.data
      const theme = getTheme(item.themeKey)
      this.setData({
        loading: false,
        cancelling: false,
        blessing: {
          ...item,
          emoji: theme.emoji,
          themeClass: theme.className,
          displayHtml: item.contentHtml || plainTextToHtml(item.content),
          displayTime: formatTime(item.sentAt || item.sendAt || item.createdAt),
          viewedAtText: formatTime(item.readAt),
          dismissedAtText: formatTime(item.dismissedAt),
          statusText: getStatusText(item)
        },
        isSender: item.senderId === (app.globalData.openid || wx.getStorageSync('openid'))
      })
    }).catch(error => {
      this.setData({ loading: false, cancelling: false })
      util.showError(error.message || '祝福没有打开')
    })
  },
  cancelBlessing() {
    if (this.data.cancelling) return
    this.selectComponent('#themeConfirmDialog').open({
      icon: '💌',
      title: '取消定时祝福',
      content: '取消后这份祝福不会发送给 TA，确定取消吗？',
      confirmText: '取消祝福',
      tone: 'danger'
    }).then(confirmed => {
      if (!confirmed) return
      this.setData({ cancelling: true })
      util.callCloudFunction('blessing', { action: 'cancel', id: this._id }).then(() => {
        util.showSuccess('已取消定时祝福')
        this.loadDetail()
      }).catch(error => { this.setData({ cancelling: false }); util.showError(error.message || '取消失败') })
    })
  },
  sendAnother() { wx.navigateTo({ url: `/pages/blessing-compose/blessing-compose?recipient=${this.data.blessing.recipientId || ''}` }) }
})

function getStatusText(item) { if(item.status === 'sent' && item.readAt) return '已查看'; if(item.status === 'sent' && item.dismissedAt && item.canSeeDismissedStatus) return '已收起'; return { scheduled:'等待送达',processing:'正在送达',sent:'已送达',cancelled:'已取消',failed:'发送失败' }[item.status] || '' }
function formatTime(value) { const date=new Date(value); if(Number.isNaN(date.getTime())) return ''; const pad=n=>String(n).padStart(2,'0'); return `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}` }
function plainTextToHtml(value) { const escaped=String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); return `<p>${escaped.replace(/\r?\n/g,'<br>')}</p>` }
