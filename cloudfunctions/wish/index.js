const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event

  try {
    switch (action) {
      case 'create':
        return await createWish(openid, event)
      case 'listMine':
        return await listMine(openid, event)
      case 'listFriend':
        return await listFriend(openid, event)
      case 'listPool':
        return await listPool(openid, event)
      case 'detail':
        return await getWishDetail(openid, event.wishId)
      case 'accept':
        return await updateByChef(openid, event.wishId, { status: 'accepted', acceptedAt: new Date() })
      case 'acceptAsRecipe':
        return await acceptAsRecipe(openid, event)
      case 'reject':
        return await updateByChef(openid, event.wishId, {
          status: 'rejected',
          rejectReason: event.rejectReason || '',
          rejectedAt: new Date()
        })
      case 'cancel':
        return await cancelWish(openid, event.wishId)
      case 'markInCart':
        return await updateByOwner(openid, event.wishId, { status: 'in_cart' })
      case 'markOrdered':
        return await markOrdered(openid, event.wishIds || [])
      default:
        return { success: false, message: '未知操作' }
    }
  } catch (error) {
    console.error('心愿操作失败:', error)
    return {
      success: false,
      message: error.message || '操作失败'
    }
  }
}

async function createWish(openid, event) {
  const user = await getUserByOpenid(openid)
  if (['chef', 'admin'].includes(user.role)) {
    return { success: false, message: '投喂官请直接添拿手菜' }
  }
  const feederOpenid = user.fixedFeederOpenid || ''
  if (!feederOpenid) {
    return { success: false, message: '请先在“我的饭搭子”中设置固定投喂官' }
  }
  if (!(await areBound(openid, feederOpenid))) {
    return { success: false, message: '绑定申请通过后才能向投喂官许愿' }
  }

  const data = normalizeWishData(event.data || event)
  const name = data.name
  const note = data.description || (event.note || '').trim()

  if (!name) {
    return { success: false, message: '写下想吃的那道菜' }
  }
  if (!data.sceneCategory) {
    return { success: false, message: '选一下这道菜适合什么时候吃' }
  }
  if (!data.ingredientCategory) {
    return { success: false, message: '选一下主角食材' }
  }

  const now = new Date()
  const result = await db.collection('wishes').add({
    data: {
      creatorId: openid,
      assigneeId: feederOpenid,
      note,
      ...data,
      status: 'pending',
      rejectReason: '',
      createdAt: now,
      updatedAt: now
    }
  })

  return {
    success: true,
    data: {
      wishId: result._id
    }
  }
}

async function getWishDetail(openid, wishId) {
  const wish = await getWish(wishId)
  if (!wish) {
    return { success: false, message: '这个饭愿找不到了' }
  }
  if (wish.creatorId !== openid && wish.assigneeId !== openid) {
    return { success: false, message: '这个饭愿不能看' }
  }

  return {
    success: true,
    data: formatWish(wish)
  }
}

async function acceptAsRecipe(openid, event) {
  const wish = await getWish(event.wishId)
  if (!wish) {
    return { success: false, message: '这个饭愿找不到了' }
  }
  if (wish.assigneeId !== openid || !(await isFeeder(openid))) {
    return { success: false, message: '这个饭愿不能处理' }
  }
  if (!(await areBound(wish.creatorId, wish.assigneeId))) {
    return { success: false, message: '饭搭子关系已解除，这个饭愿不能继续处理' }
  }
  if (['ordered', 'done', 'cancelled'].includes(wish.status)) {
    return { success: false, message: '这个饭愿现在不能安排上桌' }
  }
  if (wish.recipeId) {
    return { success: false, message: '这个饭愿已经安排上桌了' }
  }

  const data = normalizeWishData(event.data || wish)
  if (!data.name) {
    return { success: false, message: '这道菜还没起名' }
  }
  if (!data.sceneCategory) {
    return { success: false, message: '选一下这道菜适合什么时候吃' }
  }
  if (!data.ingredientCategory) {
    return { success: false, message: '选一下主角食材' }
  }
  if (!data.ingredients.length) {
    return { success: false, message: '请补上备菜清单' }
  }
  if (!data.steps.length) {
    return { success: false, message: '请写下投喂步骤' }
  }

  const now = new Date()
  const recipeData = {
    ...data,
    creatorId: openid,
    sourceWishId: event.wishId,
    isPublic: true,
    status: 'published',
    createdAt: now,
    updatedAt: now
  }
  const recipeResult = await db.collection('recipes').add({
    data: recipeData
  })

  await db.collection('wishes').doc(event.wishId).update({
    data: {
      ...data,
      note: data.description,
      recipeId: recipeResult._id,
      status: 'accepted',
      acceptedAt: now,
      updatedAt: now
    }
  })

  return {
    success: true,
    data: {
      recipeId: recipeResult._id
    },
    message: '已安排上桌'
  }
}

async function listMine(openid, event = {}) {
  const { page, limit } = normalizePagination(event)
  const query = db.collection('wishes').where({ creatorId: openid })
  const [result, countResult] = await Promise.all([
    query.orderBy('createdAt', 'desc').skip((page - 1) * limit).limit(limit).get(),
    query.count()
  ])

  return {
    success: true,
    data: result.data.map(formatWish),
    pagination: buildPagination(page, limit, countResult.total)
  }
}

async function listFriend(openid, event = {}) {
  const friendOpenid = String(event.friendOpenid || '').trim()
  if (!friendOpenid || !(await areBound(openid, friendOpenid))) {
    return { success: false, message: '只能查看已绑定饭搭子的饭愿' }
  }

  const { page, limit } = normalizePagination(event)
  // 饭愿只向被指定的投喂官开放，避免其他绑定关系看到不属于自己的内容。
  const query = db.collection('wishes').where({
    creatorId: friendOpenid,
    assigneeId: openid
  })
  const [result, countResult] = await Promise.all([
    query.orderBy('createdAt', 'desc').skip((page - 1) * limit).limit(limit).get(),
    query.count()
  ])

  return {
    success: true,
    data: result.data.map(formatWish),
    pagination: buildPagination(page, limit, countResult.total)
  }
}

async function listPool(openid, event = {}) {
  if (!(await isFeeder(openid))) {
    return { success: false, message: '待投喂清单只能投喂官查看' }
  }

  const { page, limit } = normalizePagination(event)
  const query = db.collection('wishes').where({ assigneeId: openid })
  const [result, countResult] = await Promise.all([
    query.orderBy('createdAt', 'desc').skip((page - 1) * limit).limit(limit).get(),
    query.count()
  ])
  const wishes = await Promise.all(result.data.map(async (wish) => {
    const formatted = formatWish(wish)

    try {
      const userResult = await db.collection('users').where({
        openid: wish.creatorId
      }).limit(1).get()
      const user = userResult.data[0] || {}
      const remark = await getRemark(openid, wish.creatorId)

      return {
        ...formatted,
        submitterName: remark || user.nickname || '饭搭子',
        submitterAvatar: user.avatar || ''
      }
    } catch (error) {
      return {
        ...formatted,
        submitterName: '她',
        submitterAvatar: ''
      }
    }
  }))

  return {
    success: true,
    data: wishes,
    pagination: buildPagination(page, limit, countResult.total)
  }
}

function normalizePagination(event = {}) {
  return {
    page: Math.max(1, Number(event.page) || 1),
    limit: Math.min(30, Math.max(1, Number(event.limit) || 20))
  }
}

function buildPagination(page, limit, total) {
  return {
    page,
    limit,
    total,
    hasMore: page * limit < total
  }
}

async function cancelWish(openid, wishId) {
  const wish = await getWish(wishId)
  if (!wish) {
    return { success: false, message: '这个饭愿找不到了' }
  }
  if (wish.creatorId !== openid) {
    return { success: false, message: '只能收回自己的饭愿' }
  }
  if (['ordered', 'done', 'cancelled'].includes(wish.status)) {
    return { success: false, message: '这个饭愿现在不能收回' }
  }

  return await updateWish(wishId, { status: 'cancelled', cancelledAt: new Date() })
}

async function markOrdered(openid, wishIds) {
  if (!Array.isArray(wishIds) || wishIds.length === 0) {
    return { success: true }
  }

  for (const wishId of wishIds) {
    const wish = await getWish(wishId)
    if (wish && wish.creatorId === openid && await areBound(wish.creatorId, wish.assigneeId)) {
      await updateWish(wishId, { status: 'ordered', orderedAt: new Date() })
    }
  }

  return { success: true }
}

async function updateByChef(openid, wishId, data) {
  const wish = await getWish(wishId)
  if (!wish) {
    return { success: false, message: '这个饭愿找不到了' }
  }
  if (wish.assigneeId !== openid || !(await isFeeder(openid))) {
    return { success: false, message: '这个饭愿不能处理' }
  }
  if (!(await areBound(wish.creatorId, wish.assigneeId))) {
    return { success: false, message: '饭搭子关系已解除，这个饭愿不能继续处理' }
  }
  if (['ordered', 'done', 'cancelled'].includes(wish.status)) {
    return { success: false, message: '这个饭愿现在不能处理' }
  }

  return await updateWish(wishId, data)
}

async function updateByOwner(openid, wishId, data) {
  const wish = await getWish(wishId)
  if (!wish) {
    return { success: false, message: '这个饭愿找不到了' }
  }
  if (wish.creatorId !== openid) {
    return { success: false, message: '只能操作自己的饭愿' }
  }
  if (!(await areBound(wish.creatorId, wish.assigneeId))) {
    return { success: false, message: '饭搭子关系已解除，这个饭愿不能继续操作' }
  }

  return await updateWish(wishId, data)
}

async function getWish(wishId) {
  if (!wishId) return null

  try {
    const result = await db.collection('wishes').doc(wishId).get()
    return result.data || null
  } catch (error) {
    return null
  }
}

async function updateWish(wishId, data) {
  await db.collection('wishes').doc(wishId).update({
    data: {
      ...data,
      updatedAt: new Date()
    }
  })

  return { success: true, message: '操作成功' }
}

function formatWish(wish) {
  const images = Array.isArray(wish.images) ? wish.images : []

  return {
    ...wish,
    coverImage: images[0] || '/images/default-recipe.jpg',
    displayNote: wish.description || wish.note || '',
    statusLabel: getStatusLabel(wish.status),
    createdAtText: formatDate(wish.createdAt),
    updatedAtText: formatDate(wish.updatedAt)
  }
}

function normalizeWishData(data) {
  const ingredients = Array.isArray(data.ingredients)
    ? data.ingredients.filter(item => item && item.name && item.amount && item.name.trim() && item.amount.trim())
    : []
  const steps = Array.isArray(data.steps)
    ? data.steps.filter(step => step && step.content && step.content.trim())
    : []

  return {
    images: Array.isArray(data.images) ? data.images : [],
    name: (data.name || '').trim(),
    description: (data.description || data.note || '').trim(),
    xiaohongshuUrl: (data.xiaohongshuUrl || '').trim(),
    sceneCategory: data.sceneCategory || '',
    ingredientCategory: data.ingredientCategory || '',
    preparationTime: data.preparationTime || { value: '30', label: '30分钟' },
    difficulty: data.difficulty || { value: 1, label: '简单', color: 'green' },
    servingSize: data.servingSize || { value: '3-4', label: '3-4人' },
    optionalTags: Array.isArray(data.optionalTags) ? data.optionalTags : [],
    ingredients,
    steps
  }
}

function getStatusLabel(status) {
  const labels = {
    pending: '等投喂官',
    accepted: '已安排上桌',
    rejected: '先欠着',
    in_cart: '已放进饭篮',
    ordered: '已提交投喂单',
    cancelled: '已取消',
    done: '已完成'
  }
  return labels[status] || '未知'
}

function formatDate(date) {
  if (!date) return ''
  return new Date(date).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false
  })
}

async function getUserByOpenid(openid) {
  const result = await db.collection('users').where({ openid }).limit(1).get()
  if (!result.data[0]) throw new Error('用户信息不存在，请重新登录')
  return result.data[0]
}

async function isFeeder(openid) {
  const user = await getUserByOpenid(openid)
  return ['chef', 'admin'].includes(user.role)
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

async function getRemark(openid, otherOpenid) {
  const result = await db.collection('friends').where({
    $or: [
      { userOpenid: openid, friendOpenid: otherOpenid },
      { userOpenid: otherOpenid, friendOpenid: openid }
    ],
    status: 'accepted'
  }).limit(1).get()
  const relationship = result.data[0]
  if (!relationship) return ''
  return String(relationship.userOpenid === openid
    ? relationship.userRemark || ''
    : relationship.friendRemark || '').trim()
}
