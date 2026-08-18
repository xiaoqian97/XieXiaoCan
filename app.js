import Device from './utils/device.js'
const navigation = require('./utils/navigation')

App({
  onLaunch: async function () {
    this.refreshVersionInfo()
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        // env 参数说明：
        //   env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会默认请求到哪个云环境的资源
        //   此处请填入环境 ID, 环境 ID 可打开云控制台查看
        //   如不填则使用默认环境（第一个创建的环境）
        env: 'cloud1-d9g308hol3ca869e3', // 云环境ID，需要在微信开发者工具中创建
        traceUser: true,
      })
    }

    // 获取用户信息
    this.globalData.userInfo = null
    this.globalData.openid = null
    
    // 检查本地登录状态
    this.checkLoginStatus()
    await this.getSystemInfo()
  },

  onShow: function () {
    this.startNotificationPolling()
  },

  onHide: function () {
    this.stopNotificationPolling()
  },

  onError: function (msg) {
    console.error('小程序发生脚本错误或 API 调用报错：', msg)
  },

  // 检查登录状态
  checkLoginStatus: function() {
    // 从本地存储恢复登录数据
    if (this.restoreLoginData()) {
      this.login(null).catch(error => console.error('刷新登录配置失败:', error))
    }
  },

  // 保存登录数据到本地存储
  saveLoginData: function(userInfo, openid) {
    try {
      wx.setStorageSync('userInfo', userInfo)
      wx.setStorageSync('openid', openid)
    } catch (error) {
      console.error('保存登录数据失败:', error)
    }
  },

  // 清除本地登录数据
  clearLoginData: function() {
    try {
      wx.removeStorageSync('userInfo')
      wx.removeStorageSync('openid')
    } catch (error) {
      console.error('清除登录数据失败:', error)
    }
  },

  // 从本地存储恢复登录数据
  restoreLoginData: function() {
    try {
      const userInfo = wx.getStorageSync('userInfo')
      const openid = wx.getStorageSync('openid')
      
      if (userInfo && openid) {
        this.globalData.userInfo = userInfo
        this.globalData.openid = openid
        require('./utils/cartManager').syncFromCloud()
        return true
      } else {
        return false
      }
    } catch (error) {
      console.error('恢复登录数据失败:', error)
      return false
    }
  },

  // 检查是否已登录
  isLoggedIn: function() {
    return !!(this.globalData.userInfo && this.globalData.openid)
  },

  // 退出登录
  logout: function() {
    this.stopNotificationPolling()
    this._shownNotificationIds = Object.create(null)
    this.globalData.userInfo = null
    this.globalData.openid = null
    this.globalData.isPreviewMode = false
    this.clearLoginData()
  },

  // 手动登录
  login: function(userInfo) {
    const util = require('./utils/util')
    
    return util.callCloudFunction('login', {
      userInfo: userInfo
    }).then(res => {
      this.globalData.isPreviewMode = false
      this.globalData.openid = res.openid
      this.globalData.userInfo = res.userInfo
      require('./utils/cartManager').syncFromCloud()
      
      // 保存登录数据到本地存储
      this.saveLoginData(res.userInfo, res.openid)
      this.startNotificationPolling()
      
      return res
    })
  },

  startNotificationPolling: function() {
    this.stopNotificationPolling()
    if (!this.isLoggedIn() || this.globalData.isPreviewMode) return

    clearTimeout(this._notificationInitialTimer)
    this._notificationInitialTimer = setTimeout(() => {
      this.checkFirstUnreadNotification()
    }, 800)
    this._notificationTimer = setInterval(() => {
      this.checkFirstUnreadNotification()
    }, 20000)
  },

  stopNotificationPolling: function() {
    clearTimeout(this._notificationInitialTimer)
    clearInterval(this._notificationTimer)
    this._notificationInitialTimer = null
    this._notificationTimer = null
  },

  checkFirstUnreadNotification: function() {
    if (!this.isLoggedIn() || this.globalData.isPreviewMode || this._notificationChecking || this._notificationModalVisible) {
      return Promise.resolve()
    }

    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    if (!currentPage || currentPage.route === 'pages/login/login' || currentPage.route === 'pages/notifications/notifications') {
      return Promise.resolve()
    }

    this._notificationChecking = true
    const util = require('./utils/util')
    return this.ensureFestivalGreeting().then(() => (
      util.callCloudFunction('notification', { action: 'getFirstUnread' })
    )).then(res => {
      const message = res.data
      if (!message || !message._id) return
      this._shownNotificationIds = this._shownNotificationIds || Object.create(null)
      if (this._shownNotificationIds[message._id]) return

      const activePages = getCurrentPages()
      const activePage = activePages[activePages.length - 1]
      if (!activePage || activePage.route === 'pages/login/login' || activePage.route === 'pages/notifications/notifications') return
      const popup = activePage.selectComponent && activePage.selectComponent('#globalNotificationPopup')
      if (!popup || typeof popup.show !== 'function') return

      this._shownNotificationIds[message._id] = true
      this._notificationModalVisible = true
      return popup.show(message).then(modalRes => {
        const isBlessing = ['blessing', 'festival_blessing'].includes(message.type)
        if (!modalRes || !modalRes.confirm) {
          if (modalRes && modalRes.action === 'later' && isBlessing) {
            return Promise.all([
              util.callCloudFunction('blessing', { action: 'dismiss', id: message.targetId }),
              util.callCloudFunction('notification', { action: 'markRead', notificationId: message._id })
            ]).catch(() => {})
          }
          return
        }
        util.callCloudFunction('notification', {
          action: 'markRead',
          notificationId: message._id
        }).catch(() => {})
        const targetPage = message.targetPage || '/pages/notifications/notifications'
        navigation.navigateToTarget(targetPage).catch(() => (
          navigation.navigateToTarget('/pages/notifications/notifications')
        ))
      }).finally(() => {
        this._notificationModalVisible = false
      })
    }).catch(() => {}).finally(() => {
      this._notificationChecking = false
    })
  },

  ensureFestivalGreeting: function() {
    const now = new Date()
    const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
    if (this._festivalCheckedDate === dateKey || this._festivalChecking) return this._festivalChecking || Promise.resolve()
    const util = require('./utils/util')
    this._festivalChecking = util.callCloudFunction('blessing', { action: 'ensureFestivalGreeting' }).then(() => {
      this._festivalCheckedDate = dateKey
    }).catch(() => {}).finally(() => {
      this._festivalChecking = null
    })
    return this._festivalChecking
  },

  refreshVersionInfo: function() {
    try {
      const accountInfo = wx.getAccountInfoSync()
      const miniProgram = (accountInfo && accountInfo.miniProgram) || {}
      this.globalData.version = miniProgram.version || this.globalData.version || '1.0.0'
      this.globalData.envVersion = miniProgram.envVersion || 'develop'
    } catch (error) {
      this.globalData.version = this.globalData.version || '1.0.0'
      this.globalData.envVersion = 'develop'
    }
  },

  getSystemInfo() {
    return new Promise((resolve) => {
      Device.GetSystemInfo(async (res) => {
        try {
          this.globalData.systemInfo = res || {}
          this.globalData.navHeight = res.statusBarHeight || 20;
          
          let deviceName = res.model || 'Unknown Device'
          if (res.brand && res.brand !== 'Unknown') {
            deviceName = `${res.brand} ${deviceName}`
          }
          this.globalData.deviceName = deviceName // 设备机型
          
          resolve(true)
        } catch (error) {
          console.error('getSystemInfo error:', error);
          // 设置默认值
          this.globalData.systemInfo = {
            brand: 'Unknown',
            model: 'Unknown Device',
            screenWidth: 375,
            screenHeight: 667,
            statusBarHeight: 20
          }
          this.globalData.navHeight = 20;
          this.globalData.deviceName = 'Unknown Device';
          resolve(true)
        }
      })
    })
	},

  globalData: {
    userInfo: null,
    openid: null,
    isPreviewMode: false, // 预览模式标志
    version: '1.0.0', // 开发工具未返回线上版本号时的兜底值
    envVersion: 'develop',
    systemInfo: {}, // 设备信息
    navHeight: "",// 导航栏的高度
    deviceName: "",// 设备机型
  }
})
