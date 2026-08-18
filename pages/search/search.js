Page({
  onLoad() {
    wx.switchTab({
      url: '/pages/recipe-list/recipe-list',
      fail: () => {
        wx.reLaunch({
          url: '/pages/recipe-list/recipe-list'
        })
      }
    })
  }
})
