const WeCropper = require('../avatar-cropper/we-cropper/we-cropper.js')

const device = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
const width = device.windowWidth
const height = device.windowHeight - 72
const cutWidth = width - 32
const cutHeight = cutWidth * 9 / 16

Page({
  data: {
    ready: false,
    cropperOpt: {
      id: 'recipeCropper',
      targetId: 'recipeTargetCropper',
      pixelRatio: device.pixelRatio,
      width,
      height,
      scale: 2.5,
      zoom: 8,
      cut: {
        x: 16,
        y: (height - cutHeight) / 2,
        width: cutWidth,
        height: cutHeight
      },
      boundStyle: {
        color: '#E85D4A',
        mask: 'rgba(0, 0, 0, 0.72)',
        lineWidth: 2,
        borderWidth: 1
      }
    }
  },

  onLoad() {
    this.eventChannel = this.getOpenerEventChannel()
    this.eventChannel.on('cropSource', ({ path }) => this.prepareImage(path))
  },

  prepareImage(path) {
    wx.getImageInfo({
      src: path,
      success: info => {
        const cropperOpt = {
          ...this.data.cropperOpt,
          src: info.path || path
        }
        this.setData({ cropperOpt, ready: true }, () => this.initCropper(cropperOpt))
      },
      fail: error => {
        console.error('读取待裁剪图片失败:', error)
        wx.showToast({ title: '图片读取失败', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1000)
      }
    })
  },

  initCropper(cropperOpt) {
    try {
      this.cropper = new WeCropper(cropperOpt)
        .on('beforeImageLoad', () => wx.showLoading({ title: '正在准备图片...' }))
        .on('imageLoad', () => wx.hideLoading())
    } catch (error) {
      console.error('初始化菜品图片裁剪器失败:', error)
      wx.hideLoading()
      wx.showToast({ title: '裁剪器初始化失败', icon: 'none' })
    }
  },

  touchStart(e) {
    if (this.cropper) this.cropper.touchStart(e)
  },

  touchMove(e) {
    if (this.cropper) this.cropper.touchMove(e)
  },

  touchEnd(e) {
    if (this.cropper) this.cropper.touchEnd(e)
  },

  cancelCrop() {
    wx.navigateBack()
  },

  confirmCrop() {
    if (!this.cropper) {
      wx.showToast({ title: '图片还没准备好', icon: 'none' })
      return
    }

    wx.showLoading({ title: '正在裁剪...' })
    this.cropper.getCropperImage({
      original: true,
      destWidth: 720,
      destHeight: 405,
      fileType: 'jpg',
      quality: 0.9
    }, (path, error) => {
      wx.hideLoading()
      if (error || !path) {
        console.error('裁剪菜品图片失败:', error)
        wx.showToast({ title: '图片裁剪失败', icon: 'none' })
        return
      }

      this.eventChannel.emit('cropComplete', { path })
      wx.navigateBack()
    })
  }
})
