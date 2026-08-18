const util = require('../../utils/util')

Page({
  data: {
    type: 'orders',
    title: '进行中投喂单',
    items: [],
    orderGroups: [],
    recipeGroups: [],
    keyword: '',
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false
  },

  onLoad(options) {
    const type = options.type === 'recipes' ? 'recipes' : 'orders'
    const title = type === 'recipes' ? '已发布菜品' : '进行中投喂单'
    this.setData({ type, title })
    wx.setNavigationBarTitle({ title })
    this.refreshData()
  },

  onPullDownRefresh() {
    this.refreshData().finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.loadData(false, this.requestVersion)
  },

  refreshData() {
    this.requestVersion = (this.requestVersion || 0) + 1
    this.setData({ items: [], orderGroups: [], recipeGroups: [], total: 0, page: 1, hasMore: true })
    return this.loadData(true, this.requestVersion)
  },

  loadData(reset, requestVersion) {
    if (this.data.loading && !reset) return Promise.resolve()
    const page = reset ? 1 : this.data.page
    const isRecipes = this.data.type === 'recipes'
    this.setData({ loading: true })

    return util.callCloudFunction('admin', {
      action: isRecipes ? 'getPublishedRecipes' : 'getActiveOrders',
      page,
      pageSize: this.data.pageSize,
      keyword: isRecipes ? '' : this.data.keyword
    }).then(res => {
      if (requestVersion !== this.requestVersion) return null
      const data = res.data || {}
      const rawItems = isRecipes ? (data.recipes || []) : (data.orders || [])
      const formattedItems = rawItems.map(item => ({
        ...item,
        displayTime: this.formatTime(item.createdAt)
      }))
      const imageTask = isRecipes
        ? util.resolveCloudImages(formattedItems.map(item => item.image), '/images/default-recipe.jpg')
          .then(images => formattedItems.map((item, index) => ({ ...item, displayImage: images[index] })))
        : Promise.resolve(formattedItems)

      return imageTask.then(items => {
        if (requestVersion !== this.requestVersion) return
        const allItems = reset ? items : this.data.items.concat(items)
        this.setData({
          items: allItems,
          orderGroups: isRecipes ? [] : this.groupOrdersByAssignee(allItems),
          recipeGroups: isRecipes ? this.groupRecipesByCreator(allItems) : [],
          total: Number(data.total) || 0,
          page: page + 1,
          hasMore: Boolean(data.hasMore),
          loading: false
        })
      })
    }).catch(error => {
      if (requestVersion !== this.requestVersion) return
      this.setData({ loading: false })
      util.showError(error.message || '明细加载失败')
    })
  },

  onSearchInput(event) {
    this.setData({ keyword: event.detail.value })
  },

  onSearch() {
    wx.hideKeyboard()
    return this.refreshData()
  },

  onClearSearch() {
    this.setData({ keyword: '' })
    return this.refreshData()
  },

  groupOrdersByAssignee(orders) {
    const groupMap = new Map()
    orders.forEach(order => {
      const assigneeId = order.assigneeId || `unknown-${order.assigneeName}`
      if (!groupMap.has(assigneeId)) {
        groupMap.set(assigneeId, {
          assigneeId,
          assigneeName: order.assigneeName || '未知投喂官',
          orders: []
        })
      }
      groupMap.get(assigneeId).orders.push(order)
    })
    return [...groupMap.values()]
  },

  groupRecipesByCreator(recipes) {
    const groupMap = new Map()
    recipes.forEach(recipe => {
      const creatorId = recipe.creatorId || `unknown-${recipe.creatorName}`
      if (!groupMap.has(creatorId)) {
        groupMap.set(creatorId, {
          creatorId,
          creatorName: recipe.creatorName || '未知投喂官',
          recipes: []
        })
      }
      groupMap.get(creatorId).recipes.push(recipe)
    })
    return [...groupMap.values()]
  },

  formatTime(value) {
    if (!value) return '时间未记录'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '时间未记录'
    const pad = number => String(number).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
})
