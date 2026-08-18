const util = require('../../utils/util')
const { CUSTOM_TEMPLATES, getTheme } = require('../../utils/blessingData')

Page({
  data: {
    templates: [],
    selectedTemplateKey: 'missing-you',
    selectedThemeClass: 'theme-missing-you',
    selectedEmoji: '💭',
    friends: [],
    friendIndex: 0,
    title: '',
    content: '',
    contentHtml: '',
    contentLength: 0,
    sendMode: 'immediate',
    sendDate: '',
    sendTime: '',
    minDate: '',
    loadingFriends: true,
    submitting: false
  },

  onLoad(options) {
    if (!util.requireLogin('送祝福需要登录')) return
    const defaults = getDefaultSchedule()
    const templates = CUSTOM_TEMPLATES.map(item => ({ ...item, themeClass: getTheme(item.themeKey).className }))
    this.setData({ templates, sendDate: defaults.date, sendTime: defaults.time, minDate: defaults.today })
    this.selectTemplateByKey(options.template || 'missing-you')
    this._recipientId = options.recipient || ''
    this.loadFriends()
  },

  loadFriends() {
    util.callCloudFunction('friend', { action: 'getFriendList' }).then(res => {
      const friends = res.data || []
      const friendIndex = Math.max(0, friends.findIndex(item => item.openid === this._recipientId || item.id === this._recipientId))
      this.setData({ friends, friendIndex, loadingFriends: false })
    }).catch(error => {
      this.setData({ friends: [], loadingFriends: false })
      util.showError(error.message || '饭搭子还没加载出来')
    })
  },

  selectTemplate(e) {
    this.selectTemplateByKey(e.currentTarget.dataset.key)
  },

  selectTemplateByKey(key) {
    const template = CUSTOM_TEMPLATES.find(item => item.key === key) || CUSTOM_TEMPLATES[0]
    const theme = getTheme(template.themeKey)
    this.setData({
      selectedTemplateKey: template.key,
      selectedThemeClass: theme.className,
      selectedEmoji: template.emoji,
      title: template.title,
      content: template.content,
      contentHtml: plainTextToHtml(template.content),
      contentLength: template.content.length
    }, () => this.syncEditorContents())
  },

  onFriendChange(e) { this.setData({ friendIndex: Number(e.detail.value) }) },
  onTitleInput(e) { this.setData({ title: e.detail.value }) },
  onEditorReady() {
    wx.createSelectorQuery().in(this).select('#blessingEditor').context(res => {
      this.editorCtx = res && res.context
      this.syncEditorContents()
    }).exec()
  },
  onEditorInput(e) {
    const detail = e.detail || {}
    const content = String(detail.text || '').replace(/\n$/, '')
    this.setData({
      content,
      contentHtml: detail.html || plainTextToHtml(content),
      contentLength: content.length
    })
  },
  applyEditorFormat(e) {
    if (!this.editorCtx) return
    const { name, value } = e.currentTarget.dataset
    this.editorCtx.format(name, value || undefined)
  },
  runEditorAction(e) {
    if (!this.editorCtx) return
    const action = e.currentTarget.dataset.action
    if (action === 'clear') this.editorCtx.removeFormat()
    if (action === 'undo') this.editorCtx.undo()
    if (action === 'redo') this.editorCtx.redo()
  },
  syncEditorContents() {
    if (!this.editorCtx) return
    this.editorCtx.setContents({ html: this.data.contentHtml || '<p><br></p>' })
  },
  onDateChange(e) { this.setData({ sendDate: e.detail.value }) },
  onTimeChange(e) { this.setData({ sendTime: e.detail.value }) },
  setSendMode(e) { this.setData({ sendMode: e.currentTarget.dataset.mode }) },

  submitBlessing() {
    if (this.data.submitting) return
    const friend = this.data.friends[this.data.friendIndex]
    const title = String(this.data.title || '').trim()
    const content = String(this.data.content || '').trim()
    if (!friend) return util.showError('请先选择一位饭搭子')
    if (!title) return util.showError('请填写祝福标题')
    if (!content) return util.showError('请写下想对 TA 说的话')
    if (content.length > 500) return util.showError('祝福正文最多 500 个字')

    const template = CUSTOM_TEMPLATES.find(item => item.key === this.data.selectedTemplateKey) || CUSTOM_TEMPLATES[0]
    const payload = {
      action: 'create',
      recipientId: friend.openid || friend.id,
      templateKey: template.key,
      themeKey: template.themeKey,
      title,
      content,
      contentHtml: this.data.contentHtml,
      sendMode: this.data.sendMode
    }
    if (this.data.sendMode === 'scheduled') {
      const date = new Date(`${this.data.sendDate.replace(/-/g, '/')} ${this.data.sendTime}:00`)
      if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() + 60000) return util.showError('请选择至少 1 分钟后的时间')
      payload.sendAt = date.toISOString()
    }

    this.setData({ submitting: true })
    util.callCloudFunction('blessing', payload).then(res => {
      util.showSuccess(res.message || (this.data.sendMode === 'scheduled' ? '祝福会按时送达' : '祝福已经送出'))
      setTimeout(() => this.returnToBlessings(), 700)
    }).catch(error => {
      this.setData({ submitting: false })
      util.showError(error.message || '祝福没有送出去')
    })
  },

  returnToBlessings() {
    const pages = getCurrentPages()
    const currentIndex = pages.length - 1
    const blessingIndex = pages.findIndex(page => page.route === 'pages/blessings/blessings')
    if (blessingIndex >= 0 && blessingIndex < currentIndex) {
      const blessingPage = pages[blessingIndex]
      if (blessingPage && typeof blessingPage.setData === 'function') {
        blessingPage.setData({ activeTab: 'sent' })
      }
      wx.navigateBack({ delta: currentIndex - blessingIndex })
      return
    }
    wx.redirectTo({ url: '/pages/blessings/blessings?tab=sent' })
  }
})

function plainTextToHtml(value) {
  const escaped = String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  return `<p>${escaped.replace(/\r?\n/g, '<br>')}</p>`
}

function getDefaultSchedule() {
  const now = new Date()
  const target = new Date(now.getTime() + 10 * 60000)
  const pad = value => String(value).padStart(2, '0')
  const formatDate = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return { today: formatDate(now), date: formatDate(target), time: `${pad(target.getHours())}:${pad(target.getMinutes())}` }
}
