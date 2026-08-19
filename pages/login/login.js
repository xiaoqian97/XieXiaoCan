const app = getApp()
const util = require('../../utils/util')
const subscribe = require('../../utils/subscribe')

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,
    avatarUrl: '',
    nickname: '',
    hasAgreed: false,
    selectedRole: '',
    needsRoleSelection: true,
    showRoleModal: false,
    registrationLoading: true,
    registrationError: '',
    isReturningUser: false,
    returningUserInfo: null,
    returningAvatar: '',
    showSubscribeGuide: false,
    subscribeGuidePending: false,
    uploadOpenid: ''
  },

  onLoad: function () {
    // 检查是否已经登录
    this.checkLoginStatus()
    if (!app.globalData.userInfo) this.loadRegistrationState()
    subscribe.preload()
  },

  loadRegistrationState: function() {
    this.setData({ registrationLoading: true, registrationError: '' })
    util.callCloudFunction('login', { action: 'getRegistrationState' }).then(res => {
      const returningUserInfo = res.userInfo || null
      this.setData({
        uploadOpenid: res.openid || '',
        needsRoleSelection: Boolean(res.needsRoleSelection),
        isReturningUser: Boolean(res.registered && returningUserInfo),
        returningUserInfo,
        avatarUrl: returningUserInfo ? (returningUserInfo.avatar || '') : '',
        nickname: returningUserInfo ? (returningUserInfo.nickname || '') : '',
        registrationLoading: false
      })
      if (returningUserInfo) {
        util.resolveCloudImage(returningUserInfo.avatar, '/images/default-avatar.png').then(returningAvatar => {
          this.setData({ returningAvatar })
        })
      }
    }).catch(error => {
      this.setData({
        registrationLoading: false,
        registrationError: error.message || '账号信息加载失败'
      })
    })
  },

  onRetryRegistrationState: function() {
    this.loadRegistrationState()
  },

  // 检查登录状态
  checkLoginStatus: function() {
    if (app.globalData.userInfo && app.globalData.openid) {
      const userInfo = app.globalData.userInfo
      this.setData({
        userInfo,
        hasUserInfo: true,
        avatarUrl: isDefaultAvatar(userInfo.avatar) ? '' : userInfo.avatar,
        nickname: isDefaultNickname(userInfo.nickname) ? '' : userInfo.nickname,
        needsRoleSelection: !isValidRole(userInfo.role),
        registrationLoading: false,
        isReturningUser: false
      })
    }
  },

  onRoleSelect: function(e) {
    const role = e.currentTarget.dataset.role
    if (role === 'chef' || role === 'consumer') this.setData({ selectedRole: role })
  },

  onCloseRoleModal: function() {
    this.setData({ showRoleModal: false })
  },

  stopPropagation: function() {},

  onChooseAvatar: function(e) {
    this.setData({
      avatarUrl: e.detail.avatarUrl
    })
  },

  onNicknameInput: function(e) {
    this.setData({
      nickname: e.detail.value
    })
  },

  onAgreementChange: function(e) {
    this.setData({ hasAgreed: e.detail.value.includes('agreed') })
  },

  onOpenAgreement: function(e) {
    wx.navigateTo({ url: `/pages/legal/legal?type=${e.currentTarget.dataset.type}` })
  },

  onLoginTap: function() {
    if (!this.data.hasUserInfo && !this.data.hasAgreed) {
      util.showError('请先阅读并同意用户服务协议和隐私政策')
      return
    }

    const nickname = this.data.nickname.trim()

    if (!nickname) {
      util.showError('先填个好认的昵称')
      return
    }

    if (!this.data.avatarUrl || isDefaultAvatar(this.data.avatarUrl)) {
      util.showError('先选个投喂头像')
      return
    }

    if (this.data.needsRoleSelection) {
      this.setData({ showRoleModal: true })
      return
    }

    this.login({
      nickName: nickname,
      avatarUrl: this.data.avatarUrl
    })
  },

  onRoleConfirm: function() {
    if (!this.data.selectedRole) {
      util.showError('请选择投喂官或点菜人')
      return
    }
    const nickname = this.data.nickname.trim()
    if (!nickname || !this.data.avatarUrl) {
      this.setData({ showRoleModal: false })
      util.showError('请先完善头像和昵称')
      return
    }
    this.setData({ showRoleModal: false })
    this.login({
      nickName: nickname,
      avatarUrl: this.data.avatarUrl,
      role: this.data.selectedRole
    })
  },

  // 登录
  login: function(userInfo) {
    util.showLoading('启动中...')

    this.prepareUserInfo(userInfo).then(profile => app.login(profile)).then(res => {
      this.setData({
        userInfo: res.userInfo,
        hasUserInfo: true,
        avatarUrl: res.userInfo.avatar || '',
        nickname: res.userInfo.nickname || '',
        needsRoleSelection: !isValidRole(res.userInfo.role),
        showRoleModal: false
      })
      util.hideLoading()

      if (res.isNewUser) {
        subscribe.preload(true).finally(() => this.setData({ showSubscribeGuide: true }))
        return
      }
      this.goHome()
    }).catch(err => {
      util.hideLoading()
      util.showError(err.message || '没启动成功')
      console.error('登录失败', err)
    })
  },

  onEnableFirstSubscribe: function() {
    if (this.data.subscribeGuidePending) return
    this.setData({ subscribeGuidePending: true })
    subscribe.requestAll().then(result => {
      if (!result.requested) {
        util.showError('微信提醒暂未配置，站内消息仍会正常送达')
      } else if (result.acceptedCount) {
        util.showSuccess(`已补充${result.acceptedCount}项提醒`)
      } else {
        util.showError('暂未开启微信提醒，可稍后在“我的”中补充')
      }
    }).finally(() => {
      this.setData({ showSubscribeGuide: false, subscribeGuidePending: false })
      setTimeout(() => this.goHome(), 500)
    })
  },

  onSkipFirstSubscribe: function() {
    this.setData({ showSubscribeGuide: false })
    this.goHome()
  },

  goHome: function() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  prepareUserInfo: function(userInfo) {
    if (!userInfo || !userInfo.avatarUrl || userInfo.avatarUrl.indexOf('cloud://') === 0 || userInfo.avatarUrl.indexOf('https://') === 0) {
      return Promise.resolve(userInfo)
    }

    const cloudPath = util.buildUserCloudPath(
      'avatars',
      `${Date.now()}-${Math.random().toString(36).substr(2)}.jpg`,
      this.data.uploadOpenid
    )
    return util.uploadFile(userInfo.avatarUrl, cloudPath).then(res => ({
      ...userInfo,
      avatarUrl: res.fileID
    }))
  },

  // 退出登录
  logout: function() {
    util.showConfirm('确定要退出登录吗？').then(confirm => {
      if (confirm) {
        // 调用app的logout方法
        app.logout()
        
        // 更新页面状态
        this.setData({
          userInfo: null,
          hasUserInfo: false,
          showRoleModal: false,
          selectedRole: ''
        })
        this.loadRegistrationState()
        
        util.showSuccess('已退出登录')
      }
    })
  },

  // 进入应用（重新登录但不更新用户信息）
  enterApp: function() {
    if (this.data.needsRoleSelection) {
      this.setData({ showRoleModal: true })
      return
    }
    util.showLoading('启动中...')
    app.login(null).then(res => {
      if (!res) return
      this.setData({
        userInfo: res.userInfo,
        hasUserInfo: true,
        needsRoleSelection: !isValidRole(res.userInfo.role),
        isReturningUser: false
      })
      util.hideLoading()
      
      this.goHome()
    }).catch(err => {
      util.hideLoading()
      util.showError('没启动成功')
      console.error('登录失败', err)
    })
  },

  // 进入预览模式
  enterPreviewMode: function() {
    const app = getApp()
    app.globalData.isPreviewMode = true
    
    // 跳转到首页
    wx.switchTab({
      url: '/pages/index/index'
    })
  }
})

function isDefaultNickname(nickname) {
  return !nickname || ['微信用户', '未登录用户', '用户'].includes(nickname)
}

function isDefaultAvatar(avatar) {
  return !avatar || avatar.includes('/images/default-avatar') || avatar.includes('thirdwx.qlogo.cn')
}

function isValidRole(role) {
  return ['admin', 'chef', 'consumer'].includes(role)
}
