const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async event => {
  const openid = cloud.getWXContext().OPENID

  try {
    switch (event.action) {
      case 'status':
        return await getFavoriteStatus(openid, event.recipeId)
      case 'toggle':
        return await toggleFavorite(openid, event.recipeId)
      case 'list':
        return await listFavorites(openid, event)
      case 'listFriend':
        return await listFriendFavorites(openid, event)
      default:
        return { success: false, message: '未知操作' }
    }
  } catch (error) {
    console.error('收藏操作失败:', error)
    return { success: false, message: error.message || '收藏操作失败' }
  }
}

async function getFavoriteStatus(userId, recipeId) {
  if (!isValidRecipeId(recipeId)) return { success: false, message: '菜谱不存在' }

  const result = await db.collection('favorites').where({ userId, recipeId }).limit(1).get()
  return {
    success: true,
    data: { isFavorited: result.data.length > 0 }
  }
}

async function toggleFavorite(userId, recipeId) {
  if (!isValidRecipeId(recipeId)) return { success: false, message: '菜谱不存在' }

  const recipeResult = await db.collection('recipes').doc(recipeId).get()
  if (!recipeResult.data || !(await canViewRecipe(userId, recipeResult.data))) {
    return { success: false, message: '这道菜暂时不能收藏' }
  }

  const favoriteId = buildFavoriteId(userId, recipeId)
  const legacyResult = await db.collection('favorites').where({ userId, recipeId }).get()
  const legacyIds = legacyResult.data.map(item => item._id).filter(id => id !== favoriteId)
  if (legacyResult.data.length && !legacyResult.data.some(item => item._id === favoriteId)) {
    await db.collection('favorites').doc(favoriteId).set({
      data: { userId, recipeId, createdAt: legacyResult.data[0].createdAt || new Date() }
    })
  }
  if (legacyIds.length) {
    await Promise.all(legacyIds.map(id => db.collection('favorites').doc(id).remove()))
  }

  return db.runTransaction(async transaction => {
    const favoriteRef = transaction.collection('favorites').doc(favoriteId)
    try {
      const existing = await favoriteRef.get()
      if (existing.data) {
        await favoriteRef.remove()
        return { success: true, data: { isFavorited: false } }
      }
    } catch (error) {
      // 文档不存在时继续新增。
    }
    await favoriteRef.set({ data: { userId, recipeId, createdAt: new Date() } })
    return { success: true, data: { isFavorited: true } }
  })
}

function buildFavoriteId(userId, recipeId) {
  const digest = crypto.createHash('sha256').update(`${userId}:${recipeId}`).digest('hex').slice(0, 32)
  return `favorite_${digest}`
}

async function listFriendFavorites(openid, event = {}) {
  const friendOpenid = String(event.friendOpenid || '').trim()
  if (!friendOpenid || !(await areBound(openid, friendOpenid))) {
    return { success: false, message: '只能查看已绑定饭搭子的收藏' }
  }
  return listFavorites(friendOpenid, event, openid)
}

async function listFavorites(userId, event = {}, viewerId = userId) {
  const page = Math.max(1, Number(event.page) || 1)
  const limit = Math.min(30, Math.max(1, Number(event.limit) || 20))
  const query = db.collection('favorites').where({ userId })
  const [result, countResult] = await Promise.all([
    query.orderBy('createdAt', 'desc').skip((page - 1) * limit).limit(limit).get(),
    query.count()
  ])
  const recipeIds = [...new Set(result.data.map(item => item.recipeId).filter(isValidRecipeId))]
  const recipeResult = recipeIds.length
    ? await db.collection('recipes').where({ _id: db.command.in(recipeIds) }).get()
    : { data: [] }
  const recipeMap = recipeResult.data.reduce((map, recipe) => {
    map[recipe._id] = recipe
    return map
  }, {})
  const visibleRecipes = await Promise.all(result.data.map(async favorite => {
    const recipe = recipeMap[favorite.recipeId]
    if (!recipe || !(await canViewRecipe(viewerId, recipe))) return null
    return {
      ...recipe,
      favoriteId: favorite._id,
      favoritedAt: favorite.createdAt
    }
  }))

  return {
    success: true,
    data: {
      recipes: visibleRecipes.filter(Boolean),
      total: countResult.total,
      page,
      limit,
      hasMore: page * limit < countResult.total
    }
  }
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

function isValidRecipeId(recipeId) {
  return typeof recipeId === 'string' && recipeId.length > 0 && recipeId.length <= 64
}

async function canViewRecipe(openid, recipe) {
  if (recipe.isPublic || recipe.creatorId === openid) return true
  const result = await db.collection('friends').where({
    $or: [
      { userOpenid: openid, friendOpenid: recipe.creatorId },
      { userOpenid: recipe.creatorId, friendOpenid: openid }
    ],
    status: 'accepted'
  }).limit(1).get()
  return result.data.length > 0
}
