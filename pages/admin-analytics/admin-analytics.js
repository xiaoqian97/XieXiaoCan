const util = require('../../utils/util')

Page({
  data: {
    loading: true,
    days: 30,
    ranges: [{ value: 7, label: '近7天' }, { value: 30, label: '近30天' }, { value: 90, label: '近90天' }, { value: 0, label: '全部' }],
    overview: {
      activeUsers: 0,
      totalSessions: 0,
      totalDurationText: '0分钟',
      averageText: '0分钟'
    },
    features: [],
    users: [],
    trend: [],
    chefs: [],
    expandedChef: ''
  },

  onLoad() {
    const userInfo = getApp().globalData.userInfo || wx.getStorageSync('userInfo') || {}
    if (!userInfo.isPrimaryAdmin) {
      util.showError('仅主管理员可以查看')
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    this._authorized = true
    this.loadAll()
  },

  onPullDownRefresh() {
    if (!this._authorized) return wx.stopPullDownRefresh()
    this.loadAll().finally(() => wx.stopPullDownRefresh())
  },

  changeRange(e) {
    const days = Number(e.currentTarget.dataset.days)
    if (days === this.data.days) return
    this.setData({ days })
    this.loadAnalytics()
  },

  loadAll() {
    this.setData({ loading: true })
    return Promise.all([this.loadAnalytics(), this.loadChefRecipes()]).finally(() => {
      this.setData({ loading: false })
    })
  },

  loadAnalytics() {
    const requestId = (this._analyticsRequestId || 0) + 1
    const days = this.data.days
    this._analyticsRequestId = requestId
    return util.callCloudFunction('analytics', {
      action: 'getDashboard',
      days
    }).then(res => {
      if (requestId !== this._analyticsRequestId || days !== this.data.days) return
      const data = res.data || {}
      const overview = data.overview || {}
      const maxFeature = Math.max(1, ...((data.features || []).map(item => Number(item.count) || 0)))
      const maxTrend = Math.max(1, ...((data.trend || []).map(item => Number(item.sessions) || 0)))
      const users = (data.users || []).map(item => ({
        ...item,
        durationText: formatDuration(item.durationSeconds),
        averageText: formatDuration(item.averageSeconds),
        lastVisitText: formatDateTime(item.lastVisitAt),
        topFeatureText: (item.topFeatures || []).map(feature => feature.label).join('、') || '暂无功能记录'
      }))
      const trend = (data.trend || []).slice(-14).map(item => ({
        ...item,
        dateLabel: item.date.slice(5).replace('-', '/'),
        width: Math.max(4, Math.round((item.sessions / maxTrend) * 100))
      }))
      return util.resolveCloudImages(users.map(item => item.avatar), util.DEFAULT_AVATAR).then(avatars => {
        if (requestId !== this._analyticsRequestId || days !== this.data.days) return
        this.setData({
          overview: {
            activeUsers: overview.activeUsers || 0,
            totalSessions: overview.totalSessions || 0,
            totalDurationText: formatDuration(overview.totalDurationSeconds),
            averageText: formatDuration(overview.averageSeconds)
          },
          features: (data.features || []).slice(0, 10).map(item => ({
          ...item,
          width: Math.max(8, Math.round((item.count / maxFeature) * 100))
          })),
          users: users.map((item, index) => ({ ...item, avatar: avatars[index] })),
          trend
        })
      })
    }).catch(error => {
      if (requestId !== this._analyticsRequestId) return
      util.showError(error.message || '埋点数据加载失败')
    })
  },

  loadChefRecipes() {
    return util.callCloudFunction('analytics', { action: 'getChefRecipes' }).then(res => {
      const chefs = ((res.data && res.data.chefs) || []).map(chef => ({
        ...chef,
        latestRecipeText: chef.latestRecipeAt ? formatDateTime(chef.latestRecipeAt) : '尚未添加',
        recipes: (chef.recipes || []).map(recipe => ({
          ...recipe,
          createdText: formatDateTime(recipe.createdAt),
          displayImage: recipe.image || util.DEFAULT_RECIPE_IMAGE
        }))
      }))
      const recipes = chefs.flatMap(chef => chef.recipes)
      return Promise.all([
        util.resolveCloudImages(recipes.map(recipe => recipe.image), util.DEFAULT_RECIPE_IMAGE),
        util.resolveCloudImages(chefs.map(chef => chef.avatar), util.DEFAULT_AVATAR)
      ]).then(([images, avatars]) => {
        recipes.forEach((recipe, index) => { recipe.displayImage = images[index] || util.DEFAULT_RECIPE_IMAGE })
        chefs.forEach((chef, index) => { chef.avatar = avatars[index] || util.DEFAULT_AVATAR })
        this.setData({ chefs })
      })
    }).catch(error => {
      util.showError(error.message || '投喂官菜谱加载失败')
    })
  },

  toggleChef(e) {
    const openid = e.currentTarget.dataset.openid
    this.setData({ expandedChef: this.data.expandedChef === openid ? '' : openid })
  },

  openRecipeDetail(e) {
    const recipeId = e.currentTarget.dataset.id
    if (!recipeId) return
    wx.navigateTo({ url: `/pages/recipe-detail/recipe-detail?id=${recipeId}&readonly=1` })
  }
})

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0)
  if (value < 60) return `${Math.round(value)}秒`
  if (value < 3600) return `${Math.round(value / 60)}分钟`
  const hours = Math.floor(value / 3600)
  const minutes = Math.round((value % 3600) / 60)
  return minutes ? `${hours}小时${minutes}分` : `${hours}小时`
}

function formatDateTime(value) {
  if (!value) return '暂无记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '暂无记录'
  const pad = number => String(number).padStart(2, '0')
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
