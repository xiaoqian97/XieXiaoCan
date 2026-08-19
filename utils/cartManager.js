/**
 * 购物车管理工具
 * 负责购物车的本地存储和状态管理
 */

const CART_KEY = 'food_cart_data'
const MAX_ITEMS = 20
let syncTimer = null
let mutationVersion = 0

function getCurrentOpenid() {
  try {
    const app = getApp()
    return app.globalData.openid || wx.getStorageSync('openid') || ''
  } catch (error) {
    return wx.getStorageSync('openid') || ''
  }
}

function getStorageKey() {
  return `${CART_KEY}:${getCurrentOpenid() || 'guest'}`
}

function getCartKey(item) {
  if (item.cartKey) return item.cartKey
  if (item.wishId) return `wish:${item.wishId}`
  return `recipe:${item.recipeId || item._id}`
}

/**
 * 获取购物车数据
 */
function getCartData() {
  try {
    const storageKey = getStorageKey()
    let cartData = wx.getStorageSync(storageKey)
    if (!cartData && getCurrentOpenid()) {
      cartData = wx.getStorageSync(CART_KEY)
      if (cartData) {
        wx.setStorageSync(storageKey, cartData)
        wx.removeStorageSync(CART_KEY)
      }
    }
    if (cartData && Array.isArray(cartData.cartItems)) {
      cartData.cartItems = cartData.cartItems.map(item => ({
        ...item,
        cartKey: getCartKey(item),
        type: item.type || (item.wishId ? 'wish' : 'recipe'),
        updatedAt: item.updatedAt || item.addedAt || new Date(0).toISOString()
      }))
      cartData.deletedKeys = cartData.deletedKeys && typeof cartData.deletedKeys === 'object'
        ? cartData.deletedKeys
        : {}
      cartData.revision = Number(cartData.revision) || 0
      cartData.totalCount = cartData.cartItems.length
      cartData.selectedCount = cartData.cartItems.filter(item => item.isSelected).length
    }
    return cartData || {
      cartItems: [],
      totalCount: 0,
      selectedCount: 0,
      deletedKeys: {},
      revision: 0,
      lastUpdated: new Date(0).toISOString()
    }
  } catch (error) {
    console.error('获取购物车数据失败:', error)
    return {
      cartItems: [],
      totalCount: 0,
      selectedCount: 0,
      deletedKeys: {},
      revision: 0,
      lastUpdated: new Date(0).toISOString()
    }
  }
}

/**
 * 保存购物车数据
 */
function saveCartData(cartData) {
  try {
    cartData.lastUpdated = new Date().toISOString()
    cartData.deletedKeys = cartData.deletedKeys || {}
    mutationVersion += 1
    wx.setStorageSync(getStorageKey(), cartData)
    scheduleCloudSync(cartData, mutationVersion)
    return true
  } catch (error) {
    console.error('保存购物车数据失败:', error)
    return false
  }
}

/**
 * 添加菜谱到购物车
 */
function addToCart(recipe) {
  const cartData = getCartData()
  const { cartItems } = cartData
  
  // 检查购物车是否已满（最多20道菜）
  if (cartItems.length >= MAX_ITEMS) {
    return {
      success: false,
      message: `饭篮最多先放${MAX_ITEMS}道菜，先拿出几道再安排`
    }
  }
  
  const cartKey = getCartKey(recipe)
  const now = new Date().toISOString()
  // 检查是否已存在
  const existingIndex = cartItems.findIndex(item => getCartKey(item) === cartKey)
  
  if (existingIndex !== -1) {
    // 已存在，更新信息
    cartItems[existingIndex] = {
      type: 'recipe',
      cartKey,
      recipeId: recipe._id,
      wishId: '',
      recipeName: recipe.name,
      authorId: recipe.creatorId,
      authorName: recipe.creator.nickname || '未知用户',
      authorAvatar: recipe.creator.avatar || '/images/default-avatar.png',
      image: recipe.images[0] || '/images/default-recipe.jpg',
      preparationTime: recipe.preparationTime ? recipe.preparationTime.label : '',
      difficulty: recipe.difficulty ? recipe.difficulty.label : '',
      servingSize: recipe.servingSize ? recipe.servingSize.label : '',
      addedAt: cartItems[existingIndex].addedAt || now,
      updatedAt: now,
      isSelected: true
    }
  } else {
    // 不存在，添加新项
    cartItems.push({
      type: 'recipe',
      cartKey,
      recipeId: recipe._id,
      wishId: '',
      recipeName: recipe.name,
      authorId: recipe.creatorId,
      authorName: recipe.creator.nickname|| '未知用户',
      authorAvatar: recipe.creator.avatar || '/images/default-avatar.png',
      image: recipe.images[0] || '/images/default-recipe.jpg',
      preparationTime: recipe.preparationTime ? recipe.preparationTime.label : '',
      difficulty: recipe.difficulty ? recipe.difficulty.label : '',
      servingSize: recipe.servingSize ? recipe.servingSize.label : '',
      addedAt: now,
      updatedAt: now,
      isSelected: true
    })
  }
  
  // 更新统计信息
  cartData.totalCount = cartItems.length
  cartData.selectedCount = cartItems.filter(item => item.isSelected).length
  
  const saveResult = saveCartData(cartData)
  return {
    success: saveResult,
    message: saveResult ? '已放进饭篮' : '没放进去'
  }
  delete cartData.deletedKeys[cartKey]
}

function scheduleCloudSync(cartData, version = mutationVersion) {
  if (!getCurrentOpenid() || !wx.cloud) return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    wx.cloud.callFunction({
      name: 'cart',
      data: { action: 'save', cartData }
    }).then(res => {
      if (res.result && res.result.success) {
        if (res.result.data && version === mutationVersion) {
          wx.setStorageSync(getStorageKey(), res.result.data)
        }
        require('./analytics').trackEvent('cart_update')
      }
    }).catch(error => console.error('饭篮云端同步失败:', error))
  }, 300)
}

function syncFromCloud() {
  if (!getCurrentOpenid() || !wx.cloud) return Promise.resolve(getCartData())
  const local = getCartData()
  const version = mutationVersion
  return wx.cloud.callFunction({ name: 'cart', data: { action: 'save', cartData: local } }).then(res => {
    const merged = res.result && res.result.success ? res.result.data : null
    if (merged && version === mutationVersion) wx.setStorageSync(getStorageKey(), merged)
    return merged && version === mutationVersion ? getCartData() : local
  }).catch(error => {
    console.error('获取云端饭篮失败:', error)
    return local
  })
}

function addWishToCart(wish) {
  const cartData = getCartData()
  const { cartItems } = cartData
  const coverImage = wish.coverImage || (wish.images && wish.images[0]) || '/images/default-recipe.jpg'

  if (cartItems.length >= MAX_ITEMS) {
    return {
      success: false,
      message: `饭篮最多先放${MAX_ITEMS}道菜，先拿出几道再安排`
    }
  }

  const cartKey = `wish:${wish._id}`
  const item = {
    type: 'wish',
    cartKey,
    recipeId: '',
    wishId: wish._id,
    recipeName: wish.name,
    authorId: wish.assigneeId,
    authorName: '投喂官',
    authorAvatar: '/images/default-avatar.png',
    image: coverImage,
    preparationTime: wish.preparationTime ? wish.preparationTime.label : '',
    difficulty: wish.difficulty ? wish.difficulty.label : '',
    servingSize: wish.servingSize ? wish.servingSize.label : '',
    note: wish.displayNote || wish.description || wish.note || '',
    addedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isSelected: true
  }

  const existingIndex = cartItems.findIndex(cartItem => getCartKey(cartItem) === cartKey)
  if (existingIndex !== -1) {
    item.addedAt = cartItems[existingIndex].addedAt || item.addedAt
    cartItems[existingIndex] = item
  } else {
    cartItems.push(item)
  }
  delete cartData.deletedKeys[cartKey]

  cartData.totalCount = cartItems.length
  cartData.selectedCount = cartItems.filter(item => item.isSelected).length

  const saveResult = saveCartData(cartData)
  return {
    success: saveResult,
    message: saveResult ? '已放进饭篮' : '没放进去'
  }
}

/**
 * 从购物车移除菜谱
 */
function removeFromCart(recipeId) {
  const cartData = getCartData()
  const { cartItems } = cartData
  
  const removedItems = cartItems.filter(item => getCartKey(item) === recipeId || item.recipeId === recipeId)
  const filteredItems = cartItems.filter(item => getCartKey(item) !== recipeId && item.recipeId !== recipeId)
  const removedAt = new Date().toISOString()
  cartData.deletedKeys = cartData.deletedKeys || {}
  removedItems.forEach(item => { cartData.deletedKeys[getCartKey(item)] = removedAt })
  
  cartData.cartItems = filteredItems
  cartData.totalCount = filteredItems.length
  cartData.selectedCount = filteredItems.filter(item => item.isSelected).length
  
  return saveCartData(cartData)
}

function removeByAuthor(authorId) {
  if (!authorId) return false
  const cartData = getCartData()
  const removedAt = new Date().toISOString()
  const removedItems = cartData.cartItems.filter(item => item.authorId === authorId)
  const cartItems = cartData.cartItems.filter(item => item.authorId !== authorId)
  if (cartItems.length === cartData.cartItems.length) return true
  cartData.deletedKeys = cartData.deletedKeys || {}
  removedItems.forEach(item => { cartData.deletedKeys[getCartKey(item)] = removedAt })
  cartData.cartItems = cartItems
  cartData.totalCount = cartItems.length
  cartData.selectedCount = cartItems.filter(item => item.isSelected).length
  return saveCartData(cartData)
}

/**
 * 清空购物车
 */
function clearCart() {
  const current = getCartData()
  const deletedAt = new Date().toISOString()
  const deletedKeys = { ...(current.deletedKeys || {}) }
  current.cartItems.forEach(item => { deletedKeys[getCartKey(item)] = deletedAt })
  const cartData = {
    cartItems: [],
    totalCount: 0,
    selectedCount: 0,
    deletedKeys,
    revision: current.revision || 0,
    lastUpdated: deletedAt
  }
  return saveCartData(cartData)
}

/**
 * 切换菜谱选中状态
 */
function toggleRecipeSelection(recipeId) {
  const cartData = getCartData()
  const { cartItems } = cartData
  
  const item = cartItems.find(item => getCartKey(item) === recipeId || item.recipeId === recipeId)
  if (item) {
    item.isSelected = !item.isSelected
    item.updatedAt = new Date().toISOString()
    cartData.selectedCount = cartItems.filter(item => item.isSelected).length
    return saveCartData(cartData)
  }
  return false
}

/**
 * 检查菜谱是否在购物车中
 */
function isInCart(recipeId) {
  const cartData = getCartData()
  return cartData.cartItems.some(item => getCartKey(item) === recipeId || item.recipeId === recipeId)
}

/**
 * 检查菜谱是否被选中
 */
function isSelected(recipeId) {
  const cartData = getCartData()
  const item = cartData.cartItems.find(item => getCartKey(item) === recipeId || item.recipeId === recipeId)
  return item ? item.isSelected : false
}

/**
 * 获取购物车统计信息
 */
function getCartStats() {
  const cartData = getCartData()
  return {
    totalCount: cartData.totalCount,
    selectedCount: cartData.selectedCount,
    hasItems: cartData.totalCount > 0,
    hasSelected: cartData.selectedCount > 0
  }
}

module.exports = {
  getCartData,
  saveCartData,
  addToCart,
  addWishToCart,
  removeFromCart,
  removeByAuthor,
  clearCart,
  toggleRecipeSelection,
  isInCart,
  isSelected,
  getCartStats,
  syncFromCloud
}
