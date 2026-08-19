const util = require('../../utils/util')

Page({
  data: {
    type: 'feedback',
    description: '',
    images: [],
    submitting: false,
    maxImages: 3
  },

  onLoad() {
    util.requireLogin('提交反馈需要登录后使用')
  },

  onTypeChange(e) {
    this.setData({ type: e.detail.value })
  },

  onDescriptionInput(e) {
    this.setData({ description: e.detail.value })
  },

  chooseImages() {
    const remaining = this.data.maxImages - this.data.images.length
    if (remaining <= 0) return

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: res => {
        const selected = (res.tempFiles || [])
          .filter(file => file.tempFilePath && (!file.size || file.size <= 5 * 1024 * 1024))
          .map(file => file.tempFilePath)
        if (!selected.length) {
          util.showError('请选择小于 5MB 的图片')
          return
        }
        this.setData({ images: this.data.images.concat(selected).slice(0, this.data.maxImages) })
      }
    })
  },

  previewImage(e) {
    wx.previewImage({
      current: this.data.images[Number(e.currentTarget.dataset.index)] || this.data.images[0],
      urls: this.data.images
    })
  },

  removeImage(e) {
    const images = this.data.images.slice()
    images.splice(Number(e.currentTarget.dataset.index), 1)
    this.setData({ images })
  },

  submitFeedback() {
    const description = this.data.description.trim()
    if (!description) {
      util.showError('请填写问题或建议描述')
      return
    }
    if (this.data.submitting) return

    this.setData({ submitting: true })
    util.showLoading(this.data.images.length ? '正在上传图片...' : '正在提交...')
    this.uploadImages().then(images => (
      util.callCloudFunction('feedback', {
        action: 'submit',
        type: this.data.type,
        description,
        images
      })
    )).then(() => {
      util.hideLoading()
      this.setData({ submitting: false })
      wx.showModal({
        title: '提交成功',
        content: '谢谢你的认真反馈，管理员会在工作台看到。',
        showCancel: false,
        success: () => wx.navigateBack()
      })
    }).catch(error => {
      util.hideLoading()
      this.setData({ submitting: false })
      util.showError(error.message || '提交失败，请稍后重试')
    })
  },

  uploadImages() {
    if (!this.data.images.length) return Promise.resolve([])
    return Promise.all(this.data.images.map((filePath, index) => {
      const cloudPath = util.buildUserCloudPath('feedbacks', `${Date.now()}-${index}-${Math.random().toString(36).slice(-6)}.jpg`)
      return util.uploadFile(filePath, cloudPath).then(result => result.fileID)
    }))
  }
})
