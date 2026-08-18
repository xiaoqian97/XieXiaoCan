const util = require('../../utils/util')
const cartManager = require('../../utils/cartManager')
const share = require('../../utils/share')

Page({
  data: {
    mode: 'mine',
    title: '我的饭愿',
    wishes: [],
    loading: true,
    loadingMore: false,
    page: 1,
    hasMore: true,
    sharingWish: null,
    readOnly: false,
    friendId: '',
    friendName: ''
  },

  onLoad(options) {
    if (!util.requireLogin('查看饭愿需要登录')) {
      this.setData({ loading: false })
      return
    }
    const mode = options.mode === 'pool' ? 'pool' : (options.mode === 'friend' ? 'friend' : 'mine')
    const friendName = safeDecode(options.friendName) || 'TA'
    const title = mode === 'pool' ? '待投喂清单' : (mode === 'friend' ? `${friendName}的饭愿` : '我的饭愿')
    this.setData({
      mode,
      title,
      readOnly: mode === 'friend',
      friendId: safeDecode(options.friendId),
      friendName
    })
    wx.setNavigationBarTitle({ title })
  },

  onShow() {
    this.loadWishes(true)
  },

  onPullDownRefresh() {
    this.loadWishes(true)
  },

  onReachBottom() {
    this.loadWishes(false)
  },

  loadWishes(reset = true) {
    if (!util.isLoggedIn()) return
    if (!reset && (!this.data.hasMore || this.data.loadingMore)) return
    const page = reset ? 1 : this.data.page + 1
    this.setData(reset ? { loading: true } : { loadingMore: true })

    const action = this.data.mode === 'pool'
      ? 'listPool'
      : (this.data.mode === 'friend' ? 'listFriend' : 'listMine')
    util.callCloudFunction('wish', {
      action,
      friendOpenid: this.data.friendId,
      page,
      limit: 20
    }).then(res => {
      const wishes = res.data || []
      return Promise.all(wishes.map(wish => {
        return Promise.all([
          util.resolveCloudImage(wish.coverImage, '/images/default-recipe.jpg'),
          util.resolveCloudImage(wish.submitterAvatar, '/images/default-avatar.png')
        ]).then(images => ({
          ...wish,
          displayCoverImage: images[0],
          displaySubmitterAvatar: images[1]
        }))
      })).then(items => ({
        wishes: items,
        hasMore: Boolean(res.pagination && res.pagination.hasMore)
      }))
    }).then(result => {
      this.setData({
        wishes: reset ? result.wishes : this.data.wishes.concat(result.wishes),
        page,
        hasMore: result.hasMore,
        loading: false,
        loadingMore: false
      })
    }).catch(err => {
      this.setData({ loading: false, loadingMore: false })
      util.showError(err.message || '饭愿没加载出来')
    }).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  openCreateModal() {
    wx.navigateTo({
      url: '/pages/recipe-form/recipe-form?mode=wish'
    })
  },

  acceptWish(e) {
    wx.navigateTo({
      url: `/pages/recipe-form/recipe-form?mode=acceptWish&wishId=${e.currentTarget.dataset.id}`
    })
  },

  rejectWish(e) {
    const wishId = e.currentTarget.dataset.id
    this.selectComponent('#themeConfirmDialog').open({
      icon: '💭',
      title: '先欠着？',
      content: '确定这道饭愿先不安排吗？',
      confirmText: '先欠着',
      tone: 'danger'
    }).then(confirmed => {
      if (confirmed) this.updateWish(wishId, 'reject', '已先欠着')
    })
  },

  cancelWish(e) {
    const wishId = e.currentTarget.dataset.id
    this.selectComponent('#themeConfirmDialog').open({
      icon: '↩️',
      title: '取消饭愿？',
      content: '确定把这个饭愿收回吗？',
      confirmText: '收回饭愿',
      tone: 'danger'
    }).then(confirmed => {
      if (confirmed) this.updateWish(wishId, 'cancel', '饭愿已收回')
    })
  },

  updateWish(wishId, action, successText) {
    util.showLoading('安排中...')
    util.callCloudFunction('wish', {
      action,
      wishId
    }).then(() => {
      util.hideLoading()
      util.showSuccess(successText)
      this.loadWishes()
    }).catch(err => {
      util.hideLoading()
      util.showError(err.message || '没安排好')
    })
  },

  addWishToCart(e) {
    const wish = this.data.wishes.find(item => item._id === e.currentTarget.dataset.id)
    if (!wish) return

    if (!['accepted', 'in_cart'].includes(wish.status)) {
      util.showError('投喂官安排后才能放进饭篮')
      return
    }

    const result = cartManager.addWishToCart(wish)
    if (!result.success) {
      util.showError(result.message)
      return
    }

    util.callCloudFunction('wish', {
      action: 'markInCart',
      wishId: wish._id
    }).then(() => {
      util.showSuccess('已放进饭篮')
      this.loadWishes()
    }).catch(() => {
      util.showSuccess('已放进饭篮')
      this.loadWishes()
    })
  },

  goToCart() {
    wx.switchTab({
      url: '/pages/diancan/diancan'
    })
  },

  onShareWishTap(e) {
    const wishId = e.currentTarget.dataset.id
    const wish = this.data.wishes.find(item => item._id === wishId)
    this.setData({
      sharingWish: wish || null
    })
    if (wish) {
      this.createShareNotification(wish._id)
    }
  },

  onShareAppMessage(options) {
    const wishId = options && options.target && options.target.dataset ? options.target.dataset.id : ''
    const wish = this.data.wishes.find(item => item._id === wishId) || this.data.sharingWish
    if (!wish) {
      return share.getBrandShare()
    }

    return share.getWishShare(wish, this.getWishSharePath(wish))
  },

  getWishSharePath(wish) {
    if (this.data.mode === 'mine') {
      return `/pages/recipe-form/recipe-form?mode=acceptWish&wishId=${wish._id}`
    }

    return '/pages/wish-list/wish-list?mode=mine'
  },

  createShareNotification(wishId) {
    util.callCloudFunction('notification', {
      action: 'createShareNotification',
      type: 'wish_share',
      wishId
    }).catch(err => {
      console.error('创建饭愿分享通知失败:', err)
    })
  }
})

function safeDecode(value) {
  try {
    return decodeURIComponent(value || '')
  } catch (error) {
    return String(value || '')
  }
}
