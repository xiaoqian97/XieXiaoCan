

const app = getApp()
const util = require('../utils/util')

Component({

  data: {
    safeAreaBottom: app.globalData.systemInfo.safeAreaBottom,
    hidden: false,
    selected: 'home',
    backgroundColor: '#ffffff',
    color: '#3F302B',
    selectedColor: '#E85D4A',
    isSwitching: false,
    list: [
      {
        "type": 'home',
        "pagePath": "/pages/index/index",
        "text": "首页",
        "iconPath": "./icons/home.svg",
        "selectedIconPath": "./icons/homeed.svg",
      },
      {
        "type": 'recipeList',
        "pagePath": "/pages/recipe-list/recipe-list",
        "text": "菜谱",
        "iconPath": "./icons/recipe.svg",
        "selectedIconPath": "./icons/recipeed.svg",
      },
      {
        "type": 'diancan',
        "pagePath": "/pages/diancan/diancan",
        "text": "饭篮",
        "iconPath": "./icons/diancan.svg",
        "selectedIconPath": "./icons/diancaned.svg",
      },
      {
        "type": 'order',
        "pagePath": "/pages/order-list/order-list",
        "text": "投喂单",
        "iconPath": "./icons/order.svg",
        "selectedIconPath": "./icons/ordered.svg",
      },
      {
        "type": 'profile',
        "pagePath": "/pages/profile/profile",
        "text": "我的",
        "iconPath": "./icons/profile.svg",
        "selectedIconPath": "./icons/profiled.svg",
      }
    ],
  },

  lifetimes: {
    ready() {
      this.getHeight()
    },
    detached() {
    }
  },

  attached() {
    this.updateRoleTabs()
  },

  methods: {

    updateRoleTabs() {
      const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || {}
      if (!['chef', 'admin'].includes(userInfo.role)) return
      this.setData({
        list: this.data.list.filter(item => item.type !== 'diancan')
      })
    },

    getHeight () {
      const query = wx.createSelectorQuery().in(this)
      query.select('.custom-tabbar').boundingClientRect(res => {
        if (res.height > 0) {
          app.globalData.tabbarHeight = res.height
        }
      }).exec()
    },

    tabbarInit() {
      this.setData({
        selected: this.data.list[0].type
      })
    },


    switchTab(e) {
      // 防止重复点击
      if (this.data.isSwitching) {
        return
      }
      
      const { index, item } = e.currentTarget.dataset
      const { list } = this.data

      if (['diancan', 'order', 'profile'].includes(item.type) && !util.requireLogin(`查看${item.text}需要登录后使用`)) {
        return
      }
      
      // 如果点击的是当前选中的tab，不执行切换
      if (this.data.selected === item.type) {
        return
      }
      
      
      this.setData({
        selected: item.type,
        isSwitching: true
      })
      
      wx.switchTab({
        url: item.pagePath,
        success: () => {
        },
        fail: (error) => {
          console.error('tab切换失败:', error)
          // 切换失败时恢复状态
          this.setData({
            isSwitching: false
          })
        },
        complete: () => {
          // 延迟重置切换状态，防止快速点击
          setTimeout(() => {
            this.setData({
              isSwitching: false
            })
          }, 500)
        }
      })
    }
  }
})
