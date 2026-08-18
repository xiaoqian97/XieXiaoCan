Component({
  data: {
    visible: false,
    icon: '🍲',
    kicker: '谢小馋提醒你',
    title: '',
    content: '',
    cancelText: '再想想',
    confirmText: '确定',
    extraText: '',
    tone: 'primary',
    showCancel: true,
    dismissible: true
  },

  methods: {
    // 传了 extraText 就是三选一，此时 confirm 返回 true、extra 返回 'extra'、cancel 返回 false
    open(options = {}) {
      this.setData({
        visible: true,
        extraText: options.extraText || '',
        icon: options.icon || '🍲',
        kicker: options.kicker || '谢小馋提醒你',
        title: options.title || '确认操作',
        content: options.content || '',
        cancelText: options.cancelText || '再想想',
        confirmText: options.confirmText || '确定',
        tone: options.tone === 'danger' ? 'danger' : 'primary',
        showCancel: options.showCancel !== false,
        dismissible: options.dismissible !== false
      })
      return new Promise(resolve => { this._resolve = resolve })
    },

    cancel() {
      this.close(false)
    },

    extra() {
      this.close('extra')
    },

    onMaskTap() {
      if (this.data.dismissible) this.cancel()
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
