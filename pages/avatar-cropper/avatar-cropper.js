import WeCropper from './we-cropper/we-cropper.js'

import GlobalConfig from './config.js'

const globalConfig = new GlobalConfig()
globalConfig.init()

const config = globalConfig
const device = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
const width = device.windowWidth
const safeBottom = device.safeArea
  ? Math.max(0, device.screenHeight - device.safeArea.bottom)
  : 0
const height = device.windowHeight - 60 - safeBottom

Page({
  data: {
    cropperOpt: {
      id: 'cropper',
      targetId: 'targetCropper',
      pixelRatio: device.pixelRatio,
      width,
      height,
      scale: 2.5,
      zoom: 8,
      cut: {
        x: (width - 300) / 2,
        y: (height - 300) / 2,
        width: 300,
        height: 300
      },
      boundStyle: {
        color: config.getThemeColor(),
        mask: 'rgba(0,0,0,0.8)',
        lineWidth: 2,
        borderWidth: 1
      }
    }
  },
  touchStart(e) {
    if (this.cropper) {
      this.cropper.touchStart(e)
    }
  },
  touchMove(e) {
    if (this.cropper) {
      this.cropper.touchMove(e)
    }
  },
  touchEnd(e) {
    if (this.cropper) {
      this.cropper.touchEnd(e)
    }
  },

  getCropperImage() {
    if (!this.cropper) {
      wx.showModal({
        title: '提示',
        content: '图片裁剪器未初始化，请重新选择图片',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
      return
    }

    this.cropper.getCropperImage((path, err) => {
      if (err) {
        wx.showModal({
          title: '温馨提示',
          content: err.message
        })
      } else {
        // 使用全局事件或存储传递数据
        const app = getApp()
        app.globalData.croppedAvatarPath = path
        wx.navigateBack()
      }
    })
  },

  uploadTap() {
    wx.navigateBack({
      delta: 1,
    })
  },

  onLoad(option) {
    const {
      cropperOpt
    } = this.data
    cropperOpt.boundStyle.color = config.getThemeColor()
    this.setData({
      cropperOpt
    })

    if (!option.src) {
      wx.showModal({
        title: '提示',
        content: '缺少图片参数，请重新选择图片',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
      return
    }


    // 先获取图片信息，确保文件存在
    wx.getImageInfo({
      src: option.src,
      success: (res) => {
        cropperOpt.src = res.path // 使用获取到的有效路径
        this.initCropper(cropperOpt)
      },
      fail: (err) => {
        console.error('获取图片信息失败', err)
        wx.showModal({
          title: '提示',
          content: '图片加载失败，请重新选择',
          showCancel: false,
          success: () => {
            wx.navigateBack()
          }
        })
      }
    })
  },
  
  // 初始化裁剪器
  initCropper: function(cropperOpt) {
    try {
      this.cropper = new WeCropper(cropperOpt).on('ready', () => {
      }).on('beforeImageLoad', () => {
        wx.showToast({
          title: '上传中',
          icon: 'loading',
          duration: 20000
        })
      }).on('imageLoad', () => {
        wx.hideToast()
      }).on('beforeDraw', () => {
      })
    } catch (error) {
      console.error('初始化裁剪器失败', error)
      wx.showModal({
        title: '提示',
        content: '裁剪器初始化失败，请重试',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
    }
  }
})
