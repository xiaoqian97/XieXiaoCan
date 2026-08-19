const cloud = require('wx-server-sdk')
const crypto = require('crypto')

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
  const record = await loadOrMigrateCart(openid)
  if (!record) return { success: true, data: null }
  const allowedItems = await filterAllowedItems(openid, record.cartItems || [])
  if (allowedItems.length !== (record.cartItems || []).length) {
    const allowedKeys = new Set(allowedItems.map(getCartKey))
    const deletedKeys = { ...(record.deletedKeys || {}) }
    ;(record.cartItems || []).forEach(item => {
      if (!allowedKeys.has(getCartKey(item))) deletedKeys[getCartKey(item)] = new Date().toISOString()
    })
    return saveCart(openid, { ...record, cartItems: allowedItems, deletedKeys })
  }
  return { success: true, data: serializeCart(record) }
}

async function saveCart(openid, cartData = {}) {
  const incomingItems = Array.isArray(cartData.cartItems)
    ? cartData.cartItems.slice(0, MAX_ITEMS).map(normalizeCartItem).filter(Boolean)
    : []
  const allowedFeeder = await getAllowedFeeder(openid)
  const incoming = {
    cartItems: incomingItems.filter(item => item.authorId === allowedFeeder),
    deletedKeys: normalizeDeletedKeys(cartData.deletedKeys)
  }
  const cartId = buildCartId(openid)
  const transactionResult = await db.runTransaction(async transaction => {
    const cartRef = transaction.collection('carts').doc(cartId)
    let current = null
    try {
      current = (await cartRef.get()).data || null
    } catch (error) {}
    const merged = mergeCart(current || {}, incoming)
    const now = new Date()
    const deletedKeys = { ...merged.deletedKeys }
    const allowedCartItems = merged.cartItems.filter(item => {
      if (allowedFeeder && item.authorId === allowedFeeder) return true
      deletedKeys[getCartKey(item)] = now.toISOString()
      return false
    })
    const record = {
      userId: openid,
      cartItems: allowedCartItems.slice(0, MAX_ITEMS),
      deletedKeys,
      revision: Math.max(0, Number(current && current.revision) || 0) + 1,
      createdAt: current && current.createdAt ? current.createdAt : now,
      updatedAt: now
    }
    await cartRef.set({ data: record })
    return record
  })
  await removeLegacyCarts(openid, cartId)
  return { success: true, data: serializeCart(transactionResult) }
}

async function loadOrMigrateCart(openid) {
  const cartId = buildCartId(openid)
  try {
    const stable = (await db.collection('carts').doc(cartId).get()).data
    if (stable) return stable
  } catch (error) {}

  const legacy = await db.collection('carts').where({ userId: openid }).get()
  if (!legacy.data.length) return null
  const merged = legacy.data.reduce((cart, record) => mergeCart(cart, record), {})
  const record = {
    userId: openid,
    cartItems: (merged.cartItems || []).slice(0, MAX_ITEMS),
    deletedKeys: merged.deletedKeys || {},
    revision: Math.max(...legacy.data.map(item => Number(item.revision) || 0), 0),
    createdAt: legacy.data[0].createdAt || new Date(),
    updatedAt: new Date()
  }
  await db.collection('carts').doc(cartId).set({ data: record })
  await removeLegacyCarts(openid, cartId)
  return record
}

async function removeLegacyCarts(openid, stableId) {
  const result = await db.collection('carts').where({ userId: openid }).get()
  const legacyIds = result.data.map(item => item._id).filter(id => id !== stableId)
  if (legacyIds.length) await Promise.all(legacyIds.map(id => db.collection('carts').doc(id).remove()))
}

function mergeCart(left = {}, right = {}) {
  const leftDeleted = normalizeDeletedKeys(left.deletedKeys)
  const rightDeleted = normalizeDeletedKeys(right.deletedKeys)
  const deletedKeys = { ...leftDeleted, ...rightDeleted }
  Object.keys(leftDeleted).forEach(key => {
    if (toTime(leftDeleted[key]) > toTime(deletedKeys[key])) deletedKeys[key] = leftDeleted[key]
  })
  const itemMap = new Map()
  ;[...(left.cartItems || []), ...(right.cartItems || [])].forEach(rawItem => {
    const item = normalizeCartItem(rawItem)
    if (!item) return
    const key = getCartKey(item)
    const existing = itemMap.get(key)
    if (!existing || toTime(item.updatedAt) >= toTime(existing.updatedAt)) itemMap.set(key, item)
  })
  const cartItems = [...itemMap.values()]
    .filter(item => toTime(item.updatedAt) > toTime(deletedKeys[getCartKey(item)]))
    .sort((a, b) => toTime(a.addedAt) - toTime(b.addedAt))
  return { cartItems, deletedKeys }
}

async function filterAllowedItems(openid, cartItems) {
  const feederOpenid = await getAllowedFeeder(openid)
  if (!feederOpenid) return []
  return cartItems.filter(item => item.authorId === feederOpenid)
}

async function getAllowedFeeder(openid) {
  const userResult = await db.collection('users').where({ openid }).limit(1).get()
  const user = userResult.data[0] || {}
  const feederOpenid = user.role === 'consumer' ? String(user.fixedFeederOpenid || '') : ''
  if (!feederOpenid || !(await areBound(openid, feederOpenid))) return ''
  return feederOpenid
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
  const now = new Date().toISOString()
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
    addedAt: item.addedAt || now,
    updatedAt: item.updatedAt || item.addedAt || now,
    isSelected: !!item.isSelected
  }
}

function normalizeDeletedKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.keys(value).slice(0, 100).reduce((map, key) => {
    if (key && toTime(value[key])) map[String(key).slice(0, 140)] = new Date(value[key]).toISOString()
    return map
  }, {})
}

function serializeCart(record) {
  const cartItems = record.cartItems || []
  return {
    cartItems,
    totalCount: cartItems.length,
    selectedCount: cartItems.filter(item => item.isSelected).length,
    deletedKeys: record.deletedKeys || {},
    revision: Number(record.revision) || 0,
    lastUpdated: record.updatedAt || new Date(0).toISOString()
  }
}

function getCartKey(item) {
  return String(item.cartKey || (item.wishId ? `wish:${item.wishId}` : `recipe:${item.recipeId}`))
}

function buildCartId(openid) {
  return `cart_${crypto.createHash('sha256').update(openid).digest('hex').slice(0, 32)}`
}

function toTime(value) {
  const time = new Date(value || 0).getTime()
  return Number.isFinite(time) ? time : 0
}
