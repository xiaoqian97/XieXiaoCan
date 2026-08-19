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
    friendName: '',
    deletingWishId: ''
  },

  onLoad(options) {
    if (!util.requireLogin('查看饭愿需要登录')) {
      this.setData({ loading: false })
      return
    }
    const mode = options.mode === 'pool' ? 'pool' : (options.mode === 'friend' ? 'friend' : 'mine')
    const friendName = safeDecode(options.friendName) || 'TA'
    const title = mode === 'pool' ? '收到的饭愿' : (mode === 'friend' ? `${friendName}的饭愿` : '我的饭愿')
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
    this.markWishNotificationsRead()
    this.loadWishes(true)
  },

  markWishNotificationsRead() {
    if (this.data.mode === 'friend' || !util.isLoggedIn()) return Promise.resolve()
    return util.callCloudFunction('notification', {
      action: 'markWishRead',
      mode: this.data.mode
    }).catch(() => {})
  },

  onPullDownRefresh() {
    this.loadWishes(true).finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    this.loadWishes(false)
  },

  loadWishes(reset = true) {
    if (!util.isLoggedIn()) return Promise.resolve()
    if (!reset && (!this.data.hasMore || this.data.loadingMore)) return Promise.resolve()
    const page = reset ? 1 : this.data.page + 1
    this.setData(reset ? { loading: true } : { loadingMore: true })

    const action = this.data.mode === 'pool'
      ? 'listPool'
      : (this.data.mode === 'friend' ? 'listFriend' : 'listMine')
    return util.callCloudFunction('wish', {
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
          displaySubmitterAvatar: images[1],
          swipeOffset: 0
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

  onWishTouchStart(e) {
    const wishId = e.currentTarget.dataset.id
    const index = this.data.wishes.findIndex(item => item._id === wishId)
    const touch = e.touches && e.touches[0]
    const wish = this.data.wishes[index]
    if (index < 0 || !touch || !wish || wish.status !== 'cancelled' || this.data.readOnly) return
    this._wishSwipe = {
      index,
      startX: touch.clientX,
      startY: touch.clientY,
      startOffset: Number(wish.swipeOffset) || 0,
      horizontal: false
    }
    const updates = {}
    this.data.wishes.forEach((item, itemIndex) => {
      if (itemIndex !== index && item.swipeOffset) updates[`wishes[${itemIndex}].swipeOffset`] = 0
    })
    if (Object.keys(updates).length) this.setData(updates)
  },

  onWishTouchMove(e) {
    if (!this._wishSwipe) return
    const touch = e.touches && e.touches[0]
    if (!touch) return
    const deltaX = touch.clientX - this._wishSwipe.startX
    const deltaY = touch.clientY - this._wishSwipe.startY
    if (!this._wishSwipe.horizontal && Math.abs(deltaX) <= Math.abs(deltaY)) return
    this._wishSwipe.horizontal = true
    const offset = Math.max(-76, Math.min(0, this._wishSwipe.startOffset + deltaX))
    this.setData({ [`wishes[${this._wishSwipe.index}].swipeOffset`]: offset })
  },

  onWishTouchEnd() {
    if (!this._wishSwipe) return
    const { index } = this._wishSwipe
    const currentOffset = Number(this.data.wishes[index].swipeOffset) || 0
    this.setData({ [`wishes[${index}].swipeOffset`]: currentOffset < -36 ? -76 : 0 })
    this._wishSwipe = null
  },

  deleteWish(e) {
    const wishId = e.currentTarget.dataset.id
    if (!wishId || this.data.deletingWishId) return
    const wishIndex = this.data.wishes.findIndex(item => item._id === wishId)
    this.selectComponent('#themeConfirmDialog').open({
      icon: '🗑️',
      title: '删除饭愿？',
      content: '删除后无法恢复，确定删除这条已取消的饭愿吗？',
      confirmText: '确认删除',
      tone: 'danger'
    }).then(confirmed => {
      if (!confirmed) {
        if (wishIndex >= 0) this.setData({ [`wishes[${wishIndex}].swipeOffset`]: 0 })
        return
      }
      this.setData({ deletingWishId: wishId })
      util.showLoading('正在删除...')
      util.callCloudFunction('wish', {
        action: 'delete',
        wishId
      }).then(() => {
        cartManager.removeFromCart(`wish:${wishId}`)
        util.hideLoading()
        util.showSuccess('饭愿已删除')
        this.setData({
          deletingWishId: '',
          wishes: this.data.wishes.filter(item => item._id !== wishId)
        })
      }).catch(err => {
        util.hideLoading()
        const updates = { deletingWishId: '' }
        if (wishIndex >= 0) updates[`wishes[${wishIndex}].swipeOffset`] = 0
        this.setData(updates)
        util.showError(err.message || '饭愿没有删除成功')
      })
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
