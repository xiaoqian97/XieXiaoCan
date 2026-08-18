Component({
  data: {
    visible: false,
    dinerName: '',
    previousName: '',
    nextName: '',
    isSwitch: false
  },

  methods: {
    open(options = {}) {
      this.setData({
        visible: true,
        dinerName: options.dinerName || '',
        previousName: options.previousName || '',
        nextName: options.nextName || '投喂官',
        isSwitch: Boolean(options.previousName)
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
