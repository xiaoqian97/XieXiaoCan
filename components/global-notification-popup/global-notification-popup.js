Component({
  data: {
    visible: false,
    message: {},
    icon: '🔔',
    typeLabel: '我的消息',
    themeKey: 'default',
    confirmText: '去看看',
    isBlessing: false,
    opening: false
  },

  lifetimes: {
    detached() {
      clearTimeout(this._openingTimer)
      const resolve = this._resolvePopup
      this._resolvePopup = null
      if (resolve) resolve({ confirm: false, action: 'detached' })
    }
  },

  methods: {
    show(message = {}) {
      if (this._resolvePopup) this.finish(false)
      const meta = getMessageMeta(message.type)
      this.setData({
        visible: true,
        message,
        icon: getThemeIcon(message.themeKey) || meta.icon,
        typeLabel: meta.label,
        themeKey: message.themeKey || 'default',
        confirmText: meta.confirmText || '去看看',
        isBlessing: ['blessing', 'festival_blessing'].includes(message.type),
        opening: false
      })
      return new Promise(resolve => {
        this._resolvePopup = resolve
      })
    },

    onLater() {
      if (this.data.opening) return
      this.finish(false, 'later')
    },

    onConfirm() {
      if (this.data.opening) return
      if (!this.data.isBlessing) {
        this.finish(true, 'confirm')
        return
      }
      this.setData({ opening: true })
      clearTimeout(this._openingTimer)
      this._openingTimer = setTimeout(() => this.finish(true, 'opened'), 900)
    },

    stopPropagation() {},

    finish(confirm, action = confirm ? 'confirm' : 'cancel') {
      clearTimeout(this._openingTimer)
      this._openingTimer = null
      const resolve = this._resolvePopup
      this._resolvePopup = null
      if (this.data.visible) this.setData({ visible: false, opening: false })
      if (resolve) resolve({ confirm, action })
    }
  }
})

function getMessageMeta(type) {
  const metas = {
    order_share: { icon: '🍱', label: '投喂单消息' },
    order_created: { icon: '🍱', label: '新的投喂单' },
    order_status: { icon: '🍲', label: '投喂进度' },
    wish_share: { icon: '💭', label: '饭愿消息' },
    blessing: { icon: '💌', label: '饭搭子的祝福', confirmText: '拆开祝福' },
    festival_blessing: { icon: '✨', label: '节日限定祝福', confirmText: '收下祝福' }
  }
  return metas[type] || { icon: '🔔', label: '我的消息' }
}

function getThemeIcon(themeKey) {
  return {
    'new-year': '🎆', valentine: '💌', spring: '🏮', labor: '☀️', children: '🎈',
    qixi: '🌌', 'mid-autumn': '🌕', national: '✨', 'missing-you': '💭',
    'warm-hug': '🫶', morning: '🌤️', night: '🌙', anniversary: '💞', birthday: '🎂',
    'eat-well': '🍚', 'waiting-home': '🏠'
  }[themeKey] || ''
}
