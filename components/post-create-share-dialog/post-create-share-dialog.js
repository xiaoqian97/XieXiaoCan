Component({
  properties: {
    visible: { type: Boolean, value: false },
    icon: { type: String, value: '💌' },
    title: { type: String, value: '已经创建成功' },
    content: { type: String, value: '可以分享给投喂官，方便 TA 及时看到你的需求。' },
    shareText: { type: String, value: '分享给投喂官' }
  },

  methods: {
    close() {
      this.triggerEvent('close')
    },
    stopPropagation() {}
  }
})
