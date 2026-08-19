const util = require('../../utils/util')

Page({
  data: {
    loading: true,
    memory: null,
    activePersonId: '',
    activePerson: null,
    subtitle: '每一顿投喂，都值得记住',
    emptyText: '还没有投喂记录，先去安排一顿吧。'
  },

  onLoad() {
    if (!util.requireLogin('查看投喂记忆需要登录')) {
      this.setData({ loading: false })
      return
    }
    this.loadMemories()
  },

  onPullDownRefresh() {
    this.loadMemories().finally(() => wx.stopPullDownRefresh())
  },

  loadMemories() {
    if (!util.isLoggedIn()) return Promise.resolve()
    this.setData({ loading: true })
    return util.callCloudFunction('order', { action: 'getMemoryOverview' }).then(res => {
      const memory = res.data || { people: [], completedMeals: 0, totalDishes: 0 }
      return this.resolveMemoryImages(memory).then(resolvedMemory => ({
        memory: resolvedMemory,
        activePersonId: resolvedMemory.people[0] ? resolvedMemory.people[0].id : '',
        activePerson: resolvedMemory.people[0] || null,
        subtitle: resolvedMemory.role === 'chef' ? '把每一位 TA 的口味都记下来' : '每一顿投喂，都值得记住',
        emptyText: resolvedMemory.role === 'chef' ? '还没有人向你点菜，先等一张投喂单吧。' : '还没有投喂记录，先去安排一顿吧。'
      }))
    }).then(data => {
      this.setData({ ...data, loading: false })
    }).catch(err => {
      console.error('加载投喂记忆失败:', err)
      this.setData({ loading: false, memory: null, activePerson: null })
      util.showError(err.message || '投喂记忆没加载出来')
    })
  },

  resolveMemoryImages(memory) {
    return Promise.all((memory.people || []).map(person => {
      const topRecipes = person.topRecipes || []
      const favoriteRecipes = person.favoriteRecipes || []
      return Promise.all([
        util.resolveCloudImage(person.avatar, '/images/default-avatar.png'),
        util.resolveCloudImages(topRecipes.map(recipe => recipe.image)),
        util.resolveCloudImages(favoriteRecipes.map(recipe => recipe.image))
      ]).then(([avatar, topImages, favoriteImages]) => ({
        ...person,
        displayAvatar: avatar,
        topRecipes: topRecipes.map((recipe, index) => ({ ...recipe, displayImage: topImages[index] })),
        favoriteRecipes: favoriteRecipes.map((recipe, index) => ({ ...recipe, displayImage: favoriteImages[index] }))
      }))
    })).then(people => ({ ...memory, people }))
  },

  onPersonTap(e) {
    const activePersonId = e.currentTarget.dataset.id
    const activePerson = (this.data.memory.people || []).find(person => person.id === activePersonId) || null
    this.setData({ activePersonId, activePerson })
  },

  onOrderTap(e) {
    const orderId = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/order-detail/order-detail?orderId=${orderId}` })
  },

  onRecipeTap(e) {
    const recipeId = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/recipe-detail/recipe-detail?id=${recipeId}` })
  },

  onGoToRecipes() {
    wx.switchTab({ url: '/pages/recipe-list/recipe-list' })
  }
})
