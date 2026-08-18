const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const PRIMARY_ADMIN_OPENID = 'oyWDkxVwYIHb3adMU4PpCl9rWUqI'
const ROLE_LABELS = {
  chef: '投喂官',
  consumer: '点菜人'
}

exports.main = async event => {
  const openid = cloud.getWXContext().OPENID

  try {
    const admin = await requireAdmin(openid)
    switch (event.action) {
      case 'getDashboard':
        return await getDashboard()
      case 'getUsers':
        return await getUsers(event)
      case 'updateUserRole':
        return await updateUserRole(admin, event)
      case 'updateAdminPermission':
        return await updateAdminPermission(admin, event)
      case 'getRelationships':
        return await getRelationships(event)
      case 'getActiveOrders':
        return await getActiveOrders(event)
      case 'getPublishedRecipes':
        return await getPublishedRecipes(event)
      case 'setFixedFeeder':
        return await setFixedFeeder(admin, event)
      case 'clearFixedFeeder':
        return await clearFixedFeeder(admin, event)
      default:
        return { success: false, message: '未知管理员操作' }
    }
  } catch (error) {
    return { success: false, message: error.message || '管理员操作失败' }
  }
}

async function requireAdmin(openid) {
  const user = await getUser(openid)
  const config = await getFamilyConfig()
  const primaryAdminOpenid = config.adminOpenid || PRIMARY_ADMIN_OPENID
  if (openid !== primaryAdminOpenid && !user.isAdmin && user.role !== 'admin') {
    throw new Error('无管理员权限')
  }
  return { ...user, primaryAdminOpenid }
}

async function getDashboard() {
  const [users, admins, chefs, recipes, pendingOrders, relationships] = await Promise.all([
    db.collection('users').count(),
    db.collection('users').where(_.or([{ isAdmin: true }, { role: 'admin' }])).count(),
    db.collection('users').where({ role: _.in(['chef', 'admin']) }).count(),
    db.collection('recipes').where({ status: 'published' }).count(),
    db.collection('orders').where({ status: _.in(['pending', 'processing']) }).count(),
    db.collection('friends').where({ status: 'accepted' }).count()
  ])

  return {
    success: true,
    data: {
      userCount: users.total || 0,
      adminCount: admins.total || 0,
      feederCount: chefs.total || 0,
      recipeCount: recipes.total || 0,
      activeOrderCount: pendingOrders.total || 0,
      relationshipCount: relationships.total || 0
    }
  }
}

async function getUsers(event) {
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = Math.min(30, Math.max(1, Number(event.pageSize) || 20))
  const keyword = String(event.keyword || '').trim()
  const role = event.role === 'feeder' || event.role === 'admin'
    ? event.role
    : (ROLE_LABELS[event.role] ? event.role : '')
  const conditions = []

  if (role === 'feeder') {
    conditions.push({ role: _.in(['admin', 'chef']) })
  } else if (role === 'admin') {
    conditions.push(_.or([{ isAdmin: true }, { role: 'admin' }]))
  } else if (role) {
    conditions.push({ role })
  }
  if (keyword) {
    const regexp = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
    conditions.push(_.or([{ nickname: regexp }, { searchCode: regexp }]))
  }

  const where = conditions.length > 1 ? _.and(conditions) : (conditions[0] || {})
  const query = db.collection('users').where(where)
  const [countResult, listResult] = await Promise.all([
    query.count(),
    query.orderBy('createTime', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
  ])
  const users = await enrichUsers(listResult.data || [])

  return {
    success: true,
    data: {
      users,
      total: countResult.total || 0,
      page,
      hasMore: page * pageSize < (countResult.total || 0)
    }
  }
}

async function updateUserRole(admin, event) {
  const targetOpenid = String(event.targetOpenid || '')
  const nextRole = String(event.role || '')
  if (!ROLE_LABELS[nextRole]) throw new Error('无效的用户身份')

  const target = await getUser(targetOpenid)
  const currentRole = target.role === 'admin' ? 'chef' : (target.role || 'consumer')
  if (currentRole === nextRole && target.role !== 'admin') return { success: true, message: '身份没有变化' }

  if (currentRole === 'chef' && nextRole === 'consumer') {
    const [boundCount, activeOrderCount] = await Promise.all([
      db.collection('users').where({ fixedFeederOpenid: targetOpenid }).count(),
      db.collection('orders').where({
        assigneeId: targetOpenid,
        status: _.in(['pending', 'processing'])
      }).count()
    ])
    if ((boundCount.total || 0) > 0) {
      throw new Error(`仍有${boundCount.total}位点菜人将TA设为固定投喂官，请先调整关系`)
    }
    if ((activeOrderCount.total || 0) > 0) {
      throw new Error(`TA还有${activeOrderCount.total}张进行中的投喂单，暂时不能降级`)
    }
  }

  const updateData = { role: nextRole, updateTime: new Date() }
  if (nextRole !== 'consumer') updateData.fixedFeederOpenid = ''
  await db.collection('users').doc(target._id).update({ data: updateData })
  await writeAuditLog(admin, 'update_user_role', targetOpenid, {
    before: currentRole,
    after: nextRole
  })

  return { success: true, message: `已设为${ROLE_LABELS[nextRole]}` }
}

async function updateAdminPermission(admin, event) {
  if (admin.openid !== admin.primaryAdminOpenid) {
    throw new Error('只有主管理员可以授予或取消管理员权限')
  }
  const targetOpenid = String(event.targetOpenid || '')
  const enabled = event.enabled === true
  const target = await getUser(targetOpenid)
  const isPrimaryAdmin = target.openid === admin.primaryAdminOpenid

  if (isPrimaryAdmin && !enabled) throw new Error('不能取消主管理员权限')

  const wasAdmin = Boolean(target.isAdmin || target.role === 'admin' || isPrimaryAdmin)
  if (wasAdmin === enabled && target.role !== 'admin') {
    return { success: true, message: enabled ? '已是管理员' : '管理员权限未开启' }
  }

  const updateData = {
    isAdmin: enabled,
    updateTime: new Date()
  }
  // 兼容旧数据：原 role=admin 代表“管理员+投喂官”。
  if (target.role === 'admin') updateData.role = 'chef'

  await db.collection('users').doc(target._id).update({ data: updateData })
  await writeAuditLog(admin, 'update_admin_permission', targetOpenid, {
    before: wasAdmin,
    after: enabled
  })

  return { success: true, message: enabled ? '已授予管理员权限' : '已取消管理员权限' }
}

async function getRelationships(event) {
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = Math.min(30, Math.max(1, Number(event.pageSize) || 20))
  const keyword = String(event.keyword || '').trim()
  const conditions = [{ role: 'consumer' }]
  if (keyword) {
    const regexp = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
    conditions.push(_.or([{ nickname: regexp }, { searchCode: regexp }]))
  }
  const where = conditions.length > 1 ? _.and(conditions) : conditions[0]
  const query = db.collection('users').where(where)
  const [countResult, result] = await Promise.all([
    query.count(),
    query.orderBy('createTime', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
  ])

  const relationships = await Promise.all((result.data || []).map(async diner => {
    const relationResult = await db.collection('friends').where({
      $or: [
        { userOpenid: diner.openid },
        { friendOpenid: diner.openid }
      ],
      status: 'accepted'
    }).limit(100).get()
    const friendIds = relationResult.data.map(item => (
      item.userOpenid === diner.openid ? item.friendOpenid : item.userOpenid
    ))
    const friends = await getUsersByOpenids(friendIds)
    const feeders = friends
      .filter(user => ['chef', 'admin'].includes(user.role))
      .map(user => ({ openid: user.openid, nickname: user.nickname || '未命名投喂官' }))
    const fixedFeeder = feeders.find(item => item.openid === diner.fixedFeederOpenid) || null
    return {
      openid: diner.openid,
      nickname: diner.nickname || '未命名用户',
      avatar: diner.avatar || '/images/default-avatar.png',
      searchCode: diner.searchCode || '',
      fixedFeederOpenid: diner.fixedFeederOpenid || '',
      fixedFeederName: fixedFeeder ? fixedFeeder.nickname : '',
      fixedFeederValid: !diner.fixedFeederOpenid || Boolean(fixedFeeder),
      availableFeeders: feeders
    }
  }))

  return {
    success: true,
    data: {
      relationships,
      total: countResult.total || 0,
      page,
      hasMore: page * pageSize < (countResult.total || 0)
    }
  }
}

async function getActiveOrders(event) {
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = Math.min(30, Math.max(1, Number(event.pageSize) || 20))
  const keyword = String(event.keyword || '').trim().toLowerCase()
  const query = db.collection('orders').where({ status: _.in(['pending', 'processing']) })
  // ponytail: 搜索先覆盖 1000 条进行中记录；超过后再迁移到专用搜索字段或索引。
  const [countResult, result] = keyword
    ? [null, await query.orderBy('createdAt', 'desc').limit(1000).get()]
    : await Promise.all([
      query.count(),
      query.orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
    ])
  const userIds = []
  ;(result.data || []).forEach(order => {
    userIds.push(order.creatorId, order.assigneeId)
  })
  const users = await getUsersByOpenids(userIds)
  const userMap = new Map(users.map(user => [user.openid, user]))
  const matchedOrders = (result.data || []).map(order => {
    const creator = userMap.get(order.creatorId) || {}
    const assignee = userMap.get(order.assigneeId) || {}
    return {
      _id: order._id,
      orderNo: order.orderNo || '',
      assigneeId: order.assigneeId || '',
      creatorName: creator.nickname || '未知点菜人',
      assigneeName: assignee.nickname || '未知投喂官',
      status: order.status,
      statusLabel: order.status === 'processing' ? '投喂中' : '待处理',
      recipeNames: (order.recipes || []).map(item => item.recipeName).filter(Boolean).join('、') || '暂无菜品',
      totalRecipes: order.totalRecipes || (order.recipes || []).length,
      mealType: order.mealType || '',
      createdAt: order.createdAt || null
    }
  }).filter(order => !keyword || [
    order.orderNo,
    order.recipeNames,
    order.creatorName,
    order.assigneeName
  ].some(value => String(value || '').toLowerCase().includes(keyword)))
  const total = keyword ? matchedOrders.length : (countResult.total || 0)
  const orders = keyword
    ? matchedOrders.slice((page - 1) * pageSize, page * pageSize)
    : matchedOrders
  return {
    success: true,
    data: {
      orders,
      total,
      page,
      hasMore: page * pageSize < total
    }
  }
}

async function getPublishedRecipes(event) {
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = Math.min(30, Math.max(1, Number(event.pageSize) || 20))
  const query = db.collection('recipes').where({ status: 'published' })
  const [countResult, result] = await Promise.all([
    query.count(),
    query.orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
  ])
  const users = await getUsersByOpenids((result.data || []).map(recipe => recipe.creatorId))
  const userMap = new Map(users.map(user => [user.openid, user]))
  const recipeIds = (result.data || []).map(recipe => recipe._id).filter(Boolean)
  const creatorIds = [...new Set((result.data || []).map(recipe => recipe.creatorId).filter(Boolean))]
  const [favoriteResult, orderResult] = await Promise.all([
    recipeIds.length
      ? db.collection('favorites').where({ recipeId: _.in(recipeIds) }).limit(1000).get()
      : { data: [] },
    creatorIds.length
      ? db.collection('orders').where({ assigneeId: _.in(creatorIds) }).limit(1000).get()
      : { data: [] }
  ])
  const favoriteMap = favoriteResult.data.reduce((map, favorite) => {
    if (favorite.recipeId) map[favorite.recipeId] = (map[favorite.recipeId] || 0) + 1
    return map
  }, {})
  const salesMap = orderResult.data.reduce((map, order) => {
    if (order.status === 'cancelled') return map
    ;(order.recipes || []).forEach(item => {
      if (item && item.recipeId) map[item.recipeId] = (map[item.recipeId] || 0) + 1
    })
    return map
  }, {})
  const recipes = (result.data || []).map(recipe => {
    const creator = userMap.get(recipe.creatorId) || {}
    const ratingCount = Number(recipe.ratingCount) || 0
    return {
      _id: recipe._id,
      name: recipe.name || '未命名菜品',
      image: (recipe.images && recipe.images[0]) || '/images/default-recipe.jpg',
      creatorId: recipe.creatorId || '',
      creatorName: creator.nickname || '未知投喂官',
      isPublic: recipe.isPublic !== false,
      viewCount: Number(recipe.viewCount) || 0,
      favoriteCount: favoriteMap[recipe._id] || 0,
      salesCount: salesMap[recipe._id] || 0,
      ratingAverage: ratingCount > 0
        ? (Number(recipe.ratingTotal || 0) / ratingCount).toFixed(1)
        : '0',
      createdAt: recipe.createdAt || null
    }
  })
  return {
    success: true,
    data: {
      recipes,
      total: countResult.total || 0,
      page,
      hasMore: page * pageSize < (countResult.total || 0)
    }
  }
}

async function setFixedFeeder(admin, event) {
  const targetOpenid = String(event.targetOpenid || '')
  const feederOpenid = String(event.feederOpenid || '')
  if (!targetOpenid || !feederOpenid || targetOpenid === feederOpenid) {
    throw new Error('请选择有效的点菜人和投喂官')
  }
  const [target, feeder] = await Promise.all([getUser(targetOpenid), getUser(feederOpenid)])
  if (target.role !== 'consumer') throw new Error('只有点菜人需要设置固定投喂官')
  if (!['chef', 'admin'].includes(feeder.role)) throw new Error('目标用户不是投喂官')
  if (!(await areBound(targetOpenid, feederOpenid))) throw new Error('双方尚未绑定，不能设置固定投喂官')

  const before = target.fixedFeederOpenid || ''
  if (before === feederOpenid) return { success: true, message: '已是当前固定投喂官' }
  const cleanup = before
    ? await cleanupPreviousFeederData(targetOpenid, before)
    : { cancelledOrders: 0, cancelledWishes: 0 }
  await db.collection('users').doc(target._id).update({
    data: { fixedFeederOpenid: feederOpenid, updateTime: new Date() }
  })
  await writeAuditLog(admin, 'set_fixed_feeder', targetOpenid, { before, after: feederOpenid })
  return {
    success: true,
    message: before ? '固定投喂官已更换' : '固定投喂官已设置',
    data: cleanup
  }
}

async function clearFixedFeeder(admin, event) {
  const targetOpenid = String(event.targetOpenid || '')
  const target = await getUser(targetOpenid)
  const before = target.fixedFeederOpenid || ''
  const cleanup = before
    ? await cleanupPreviousFeederData(targetOpenid, before)
    : { cancelledOrders: 0, cancelledWishes: 0 }
  await db.collection('users').doc(target._id).update({
    data: { fixedFeederOpenid: '', updateTime: new Date() }
  })
  await writeAuditLog(admin, 'clear_fixed_feeder', targetOpenid, { before, after: '' })
  return { success: true, message: '固定投喂官已清除', data: cleanup }
}

async function cleanupPreviousFeederData(dinerOpenid, feederOpenid) {
  const [allOrders, allWishes, cartResult] = await Promise.all([
    getAllRecords('orders', { creatorId: dinerOpenid }),
    getAllRecords('wishes', { creatorId: dinerOpenid }),
    db.collection('carts').where({ userId: dinerOpenid }).limit(1).get()
  ])
  const orders = allOrders.filter(order => (
    order.assigneeId === feederOpenid && ['pending', 'processing'].includes(order.status)
  ))
  const wishes = allWishes.filter(wish => (
    wish.assigneeId === feederOpenid && ['pending', 'accepted', 'in_cart', 'ordered'].includes(wish.status)
  ))
  const now = new Date()

  for (const order of orders) {
    await db.collection('orders').doc(order._id).update({
      data: {
        status: 'cancelled',
        cancelTime: now,
        updateTime: now,
        updatedAt: now,
        cancelledByFeederChange: true
      }
    })
    await updateCancelledOrderStats(order)
  }
  for (const wish of wishes) {
    await db.collection('wishes').doc(wish._id).update({
      data: {
        status: 'cancelled',
        cancelledAt: now,
        updatedAt: now,
        cancelledByFeederChange: true
      }
    })
  }

  const cart = cartResult.data && cartResult.data[0]
  if (cart) {
    const cartItems = (cart.cartItems || []).filter(item => item.authorId !== feederOpenid)
    if (cartItems.length !== (cart.cartItems || []).length) {
      await db.collection('carts').doc(cart._id).update({ data: { cartItems, updatedAt: now } })
    }
  }
  return { cancelledOrders: orders.length, cancelledWishes: wishes.length }
}

async function getAllRecords(collection, condition) {
  const records = []
  let skip = 0
  while (true) {
    const result = await db.collection(collection).where(condition).skip(skip).limit(100).get()
    const page = result.data || []
    records.push(...page)
    if (page.length < 100) return records
    skip += 100
  }
}

async function updateCancelledOrderStats(order) {
  const statsId = `${order.assigneeId}_${order.creatorId}`
  await db.runTransaction(async transaction => {
    let current = null
    try {
      const result = await transaction.collection('feeding_stats').doc(statsId).get()
      current = result.data || null
    } catch (error) {
      current = null
    }
    if (!current) return
    const data = {
      ...current,
      [order.status]: Math.max(0, Number(current[order.status] || 0) - 1),
      cancelled: Number(current.cancelled || 0) + 1,
      updatedAt: new Date()
    }
    delete data._id
    await transaction.collection('feeding_stats').doc(statsId).set({ data })
  })
}

async function enrichUsers(users) {
  const feederMap = new Map()
  const feederIds = [...new Set(users.map(user => user.fixedFeederOpenid).filter(Boolean))]
  const feeders = await getUsersByOpenids(feederIds)
  feeders.forEach(user => feederMap.set(user.openid, user))

  return users.map(user => {
    const feeder = feederMap.get(user.fixedFeederOpenid)
    return {
      openid: user.openid,
      nickname: user.nickname || '未命名用户',
      avatar: user.avatar || '/images/default-avatar.png',
      searchCode: user.searchCode || '',
      role: user.role === 'admin' ? 'chef' : (user.role || 'consumer'),
      roleLabel: user.role === 'chef' || user.role === 'admin' ? '投喂官' : '点菜人',
      isAdmin: Boolean(user.isAdmin || user.role === 'admin' || user.openid === PRIMARY_ADMIN_OPENID),
      fixedFeederOpenid: user.fixedFeederOpenid || '',
      fixedFeederName: feeder ? (feeder.nickname || '未命名投喂官') : '',
      isPrimaryAdmin: user.openid === PRIMARY_ADMIN_OPENID,
      createTime: user.createTime || null
    }
  })
}

async function getUsersByOpenids(openids) {
  const ids = [...new Set((openids || []).filter(Boolean))]
  if (!ids.length) return []
  const batches = []
  for (let index = 0; index < ids.length; index += 10) batches.push(ids.slice(index, index + 10))
  const results = await Promise.all(batches.map(batch => (
    db.collection('users').where({ openid: _.in(batch) }).get()
  )))
  return results.reduce((list, result) => list.concat(result.data || []), [])
}

async function getUser(openid) {
  const result = await db.collection('users').where({ openid }).limit(1).get()
  if (!result.data[0]) throw new Error('用户不存在')
  return result.data[0]
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

async function getFamilyConfig() {
  try {
    const result = await db.collection('app_config').doc('family').get()
    if (result.data) return result.data
  } catch (error) {
    // 使用默认主管理员继续校验。
  }
  return { adminOpenid: PRIMARY_ADMIN_OPENID }
}

async function writeAuditLog(admin, action, targetOpenid, detail) {
  try {
    await db.collection('admin_logs').add({
      data: {
        adminOpenid: admin.openid,
        adminNickname: admin.nickname || '管理员',
        action,
        targetOpenid,
        detail,
        createdAt: new Date()
      }
    })
  } catch (error) {
    // 日志集合未创建时不阻断管理员操作，但部署文档要求补建该集合。
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
