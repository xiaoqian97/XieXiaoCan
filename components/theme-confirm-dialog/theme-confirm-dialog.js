Component({
  data: {
    visible: false,
    icon: '🍲',
    kicker: '谢小馋提醒你',
    title: '',
    content: '',
    cancelText: '再想想',
    confirmText: '确定',
    tone: 'primary'
  },

  methods: {
    open(options = {}) {
      this.setData({
        visible: true,
        icon: options.icon || '🍲',
        kicker: options.kicker || '谢小馋提醒你',
        title: options.title || '确认操作',
        content: options.content || '',
        cancelText: options.cancelText || '再想想',
        confirmText: options.confirmText || '确定',
        tone: options.tone === 'danger' ? 'danger' : 'primary'
      })
      return new Promise(resolve => { this._resolve = resolve })
    },

    cancel() {
      this.close(false)
    },

    confirm() {
      this.close(true)
    },

    close(confirmed) {
      this.setData({ visible: false })
      if (this._resolve) this._resolve(confirmed)
      this._resolve = null
    },

    stopPropagation() {}
  }
})
