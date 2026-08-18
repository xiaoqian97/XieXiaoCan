const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const MAX_ITEMS = 20

exports.main = async event => {
  const openid = cloud.getWXContext().OPENID
  if (!openid) return { success: false, message: '请先登录' }

  try {
    if (event.action === 'get') return await getCart(openid)
    if (event.action === 'save') return await saveCart(openid, event.cartData)
    return { success: false, message: '未知操作' }
  } catch (error) {
    console.error('饭篮云函数执行失败:', error)
    return { success: false, message: error.message || '饭篮同步失败' }
  }
}

async function getCart(openid) {
  const result = await db.collection('carts').where({ userId: openid }).limit(1).get()
  const record = result.data[0]
  const cartItems = record ? await filterAllowedItems(openid, record.cartItems || []) : []
  const cleanedAt = new Date()
  const wasCleaned = record && cartItems.length !== (record.cartItems || []).length
  if (wasCleaned) {
    await db.collection('carts').doc(record._id).update({ data: { cartItems, updatedAt: cleanedAt } })
  }
  return {
    success: true,
    data: record ? {
      cartItems,
      totalCount: cartItems.length,
      selectedCount: cartItems.filter(item => item.isSelected).length,
      lastUpdated: wasCleaned ? cleanedAt : record.updatedAt
    } : null
  }
}

async function saveCart(openid, cartData = {}) {
  const normalizedItems = Array.isArray(cartData.cartItems)
    ? cartData.cartItems.slice(0, MAX_ITEMS).map(normalizeCartItem).filter(Boolean)
    : []
  const cartItems = await filterAllowedItems(openid, normalizedItems)
  const data = {
    userId: openid,
    cartItems,
    updatedAt: cartData.lastUpdated ? new Date(cartData.lastUpdated) : new Date()
  }
  const result = await db.collection('carts').where({ userId: openid }).limit(1).get()
  if (result.data.length) {
    await db.collection('carts').doc(result.data[0]._id).update({ data })
  } else {
    await db.collection('carts').add({ data: { ...data, createdAt: new Date() } })
  }
  return { success: true, data: { updatedAt: data.updatedAt } }
}

async function filterAllowedItems(openid, cartItems) {
  const userResult = await db.collection('users').where({ openid }).limit(1).get()
  const user = userResult.data[0] || {}
  const feederOpenid = user.role === 'consumer' ? String(user.fixedFeederOpenid || '') : ''
  if (!feederOpenid || !(await areBound(openid, feederOpenid))) return []
  return cartItems.filter(item => item.authorId === feederOpenid)
}

async function areBound(openid, otherOpenid) {
  const result = await db.collection('friends').where({
    $or: [
      { userOpenid: openid, friendOpenid: otherOpenid },
      { userOpenid: otherOpenid, friendOpenid: openid }
    ],
    status: 'accepted'
  }).limit(1).get()
  return result.data.length > 0
}

function normalizeCartItem(item) {
  if (!item || typeof item !== 'object') return null
  const recipeId = String(item.recipeId || '').slice(0, 64)
  const wishId = String(item.wishId || '').slice(0, 64)
  if (!recipeId && !wishId) return null
  return {
    type: wishId ? 'wish' : 'recipe',
    cartKey: String(item.cartKey || (wishId ? `wish:${wishId}` : `recipe:${recipeId}`)).slice(0, 140),
    recipeId,
    wishId,
    recipeName: String(item.recipeName || '').slice(0, 40),
    authorId: String(item.authorId || '').slice(0, 64),
    authorName: String(item.authorName || '').slice(0, 20),
    authorAvatar: String(item.authorAvatar || '').slice(0, 500),
    image: String(item.image || '').slice(0, 500),
    preparationTime: String(item.preparationTime || '').slice(0, 20),
    difficulty: String(item.difficulty || '').slice(0, 20),
    servingSize: String(item.servingSize || '').slice(0, 20),
    note: String(item.note || '').slice(0, 100),
    addedAt: item.addedAt || new Date().toISOString(),
    isSelected: !!item.isSelected
  }
}
