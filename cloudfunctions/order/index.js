const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action } = event

  try {
    switch (action) {
      case 'createOrder':
        return await createOrder(wxContext.OPENID, event.orderData)
      
      case 'getOrderList':
        return await getOrderList(wxContext.OPENID, event.status, event.page, event.limit, event.searchValue)
      
      case 'getOrderDetail':
        return await getOrderDetail(wxContext.OPENID, event.orderId)
      
      case 'updateOrderStatus':
        return await updateOrderStatus(wxContext.OPENID, event.orderId, event.status)

      case 'rateOrder':
        return await rateOrder(wxContext.OPENID, event.orderId, event.rating, event.recipeRatings)

      case 'saveMemoryNote':
        return await saveMemoryNote(wxContext.OPENID, event.orderId, event.note)
      
      case 'cancelOrder':
        return await cancelOrder(wxContext.OPENID, event.orderId)

      case 'hideOrder':
        return await hideOrder(wxContext.OPENID, event.orderId)
      
      
      case 'getOrderStatistics':
        return await getOrderStatistics(wxContext.OPENID)

      case 'getMemoryOverview':
        return await getMemoryOverview(wxContext.OPENID)

      case 'rebuildStatistics':
        return await rebuildStatistics(wxContext.OPENID)
      
      default:
        return {
          success: false,
          message: '未知操作'
        }
    }
  } catch (error) {
    console.error('云函数执行错误:', error)
    return {
      success: false,
      message: error.message || '服务器错误'
    }
  }
}

// 创建订单
async function createOrder(openid, orderData) {
  const { recipes, assigneeId, mealType, orderDate, orderTime, notes } = orderData || {}
  const requestId = normalizeOrderRequestId(orderData && orderData.requestId)
  if (!requestId) return { success: false, message: '提交标识无效，请重新提交' }

  const currentUser = await getUserByOpenid(openid)
  const familyConfig = await getFamilyConfig()
  const isFeeder = ['chef', 'admin'].includes(currentUser.role) ||
    openid === familyConfig.chefOpenid
  if (isFeeder) {
    return { success: false, message: '投喂官不能提交点菜单，请前往投喂单处理点菜需求' }
  }

  if (!recipes || recipes.length === 0) {
    return {
      success: false,
      message: '投喂单里还没有菜'
    }
  }

  const fixedFeederOpenid = currentUser.fixedFeederOpenid || ''
  if (!fixedFeederOpenid) {
    return { success: false, message: '尚未设置固定投喂官，请前往“我的饭搭子”设置' }
  }
  if (assigneeId !== fixedFeederOpenid) {
    return { success: false, message: '投喂单只能提交给你设置的固定投喂官' }
  }

  if (assigneeId === openid || !(await areBound(openid, assigneeId))) {
    return { success: false, message: '请先与固定投喂官建立绑定关系' }
  }

  const recipeValidation = await validateOrderRecipes(openid, fixedFeederOpenid, recipes)
  if (!recipeValidation.success) {
    return recipeValidation
  }

  if (!mealType) {
    return {
      success: false,
      message: '请选择开饭时间'
    }
  }

  // 生成订单号
  const orderNo = generateOrderNo()

  // 计算预计制作时间
  const estimatedTime = recipes.reduce((total, recipe) => {
    const time = parseInt(recipe.preparationTime) || 30
    return total + time
  }, 0)
  const order = {
    orderNo,
    creatorId: openid,
    assigneeId,
    mealType,
    orderDate,
    orderTime,
    recipes,
    status: 'pending', // pending: 待处理, processing: 处理中, completed: 已完成, cancelled: 已取消
    notes: notes || '',
    totalRecipes: recipes.length,
    estimatedTime,
    requestId,
    createdAt: new Date(),
    updatedAt: new Date()
  }

  const orderId = buildOrderId(openid, requestId)
  const transactionResult = await db.runTransaction(async transaction => {
    const orderRef = transaction.collection('orders').doc(orderId)
    try {
      const existing = await orderRef.get()
      if (existing.data) return { created: false, order: existing.data }
    } catch (error) {
      // 文档不存在时继续创建。
    }
    await orderRef.set({ data: order })
    return { created: true, order }
  })

  if (!transactionResult.created) {
    return {
      success: true,
      data: {
        orderId,
        orderNo: transactionResult.order.orderNo,
        duplicate: true,
        message: '投喂单已提交，请勿重复操作'
      }
    }
  }

  await markWishesOrdered(openid, recipes, orderId)
  await updateFeedingStats(order, 'created').catch(error => console.error('新投喂单统计更新失败:', error))
  await createOrderNotification('created', order, orderId, openid)
    .catch(error => console.error('新投喂单站内消息创建失败:', error))
  const reminder = await sendOrderSubscribeMessage('orderCreated', order, orderId)
    .catch(error => ({ sent: false, message: formatSubscribeError(error) }))

  return {
    success: true,
    data: {
      orderId,
      orderNo,
      reminder,
      message: '投喂单已提交'
    }
  }
}

// 获取订单列表
async function getOrderList(openid, status = null, page = 1, limit = 10, searchValue = '') {
  page = Math.max(1, Number(page) || 1)
  limit = Math.min(50, Math.max(1, Number(limit) || 10))
  const hasSearch = Boolean(searchValue && searchValue.trim())
  let query = db.collection('orders').where({
    $or: [
      { creatorId: openid },
      { assigneeId: openid }
    ]
  })

  if (status && status !== 'all') {
    query = query.where({
      status
    })
  }

  // 先获取基础订单数据
  let result
  if (hasSearch) {
    const allOrders = []
    let offset = 0
    while (true) {
      const batch = await query.orderBy('createdAt', 'desc').skip(offset).limit(100).get()
      allOrders.push(...batch.data)
      if (batch.data.length < 100) break
      offset += 100
    }
    result = { data: allOrders }
  } else {
    result = await query.orderBy('createdAt', 'desc').skip((page - 1) * limit).limit(limit).get()
  }

  // 删除仅对当前用户生效，另一位饭搭子的记录和历史统计保持不变。
  const visibleOrders = result.data.filter(order => !(
    Array.isArray(order.hiddenFor) && order.hiddenFor.includes(openid)
  ))

  // 获取创建者和制作者信息
  let orders = await Promise.all(visibleOrders.map(async (order) => {
    try {
      const [creatorResult, assigneeResult] = await Promise.all([
        db.collection('users').where({ openid: order.creatorId }).get(),
        db.collection('users').where({ openid: order.assigneeId }).get()
      ])

      const creator = creatorResult.data.length > 0 ? creatorResult.data[0] : null
      const assignee = assigneeResult.data.length > 0 ? assigneeResult.data[0] : null
      const [creatorRemark, assigneeRemark] = await Promise.all([
        order.creatorId === openid ? '' : getRemark(openid, order.creatorId),
        order.assigneeId === openid ? '' : getRemark(openid, order.assigneeId)
      ])

      return {
        ...order,
        creator: creator ? { 
          nickname: creatorRemark || creator.nickname || '未知用户',
          avatar: creator.avatar || '' 
        } : { nickname: '未知用户', avatar: '' },
        assignee: assignee ? { 
          nickname: assigneeRemark || assignee.nickname || '未知用户',
          avatar: assignee.avatar || '' 
        } : { nickname: '未知用户', avatar: '' },
        mealTypeLabel: getMealTypeLabel(order.mealType),
        mealTypeIcon: getMealTypeIcon(order.mealType),
        statusLabel: getStatusLabel(order.status)
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
      return {
        ...order,
        creator: { nickname: '未知用户', avatar: '' },
        assignee: { nickname: '未知用户', avatar: '' },
        mealTypeLabel: getMealTypeLabel(order.mealType),
        mealTypeIcon: getMealTypeIcon(order.mealType),
        statusLabel: getStatusLabel(order.status)
      }
    }
  }))

  // 如果有搜索条件，进行客户端过滤（支持制作者昵称搜索）
  if (hasSearch) {
    const searchTerm = searchValue.trim().toLowerCase()
    orders = orders.filter(order => {
      // 搜索订单号
      if (order.orderNo && order.orderNo.toLowerCase().includes(searchTerm)) {
        return true
      }
      // 搜索制作者昵称
      if (order.assignee && order.assignee.nickname && 
          order.assignee.nickname.toLowerCase().includes(searchTerm)) {
        return true
      }
      // 搜索创建者昵称
      if (order.creator && order.creator.nickname && 
          order.creator.nickname.toLowerCase().includes(searchTerm)) {
        return true
      }
      // 搜索菜品名称
      if (order.recipes && order.recipes.some(recipe => 
          (recipe.recipeName && recipe.recipeName.toLowerCase().includes(searchTerm))
        )) {
        return true
      }
      return false
    })
  }

  // 获取总数（如果有搜索条件，需要重新计算）
  let total = result.data.length
  if (hasSearch) {
    total = orders.length
    orders = orders.slice((page - 1) * limit, page * limit)
  } else {
    const countResult = await query.count()
    total = countResult.total
  }

  return {
    success: true,
    data: {
      orders,
      total,
      page,
      limit,
      hasMore: page * limit < total
    }
  }
}

// 获取订单详情
async function getOrderDetail(openid, orderId) {
  const result = await db.collection('orders').doc(orderId).get()

  if (!result.data) {
    return {
      success: false,
      message: '投喂单不存在'
    }
  }

  const order = result.data

  // 检查权限：只有创建者或制作者可以查看订单
  if (order.creatorId !== openid && order.assigneeId !== openid) {
    return {
      success: false,
      message: '无权限查看这张投喂单'
    }
  }

  try {
    // 获取创建者和制作者信息
    const [creatorResult, assigneeResult] = await Promise.all([
      db.collection('users').where({ openid: order.creatorId }).get(),
      db.collection('users').where({ openid: order.assigneeId }).get()
    ])

    const creator = creatorResult.data.length > 0 ? creatorResult.data[0] : null
    const assignee = assigneeResult.data.length > 0 ? assigneeResult.data[0] : null
    const [creatorRemark, assigneeRemark] = await Promise.all([
      order.creatorId === openid ? '' : getRemark(openid, order.creatorId),
      order.assigneeId === openid ? '' : getRemark(openid, order.assigneeId)
    ])

    // 构建订单详情数据
    const orderDetail = {
      ...order,
      creatorName: creatorRemark || (creator ? creator.nickname || '未知用户' : '未知用户'),
      creatorAvatar: creator ? creator.avatar || '/images/default-avatar.png' : '/images/default-avatar.png',
      assigneeName: assigneeRemark || (assignee ? assignee.nickname || '未知用户' : '未知用户'),
      assigneeAvatar: assignee ? assignee.avatar || '/images/default-avatar.png' : '/images/default-avatar.png',
      mealTypeLabel: getMealTypeLabel(order.mealType),
      mealTypeIcon: getMealTypeIcon(order.mealType),
      statusLabel: getStatusLabel(order.status),
      orderDate: order.orderDate || new Date(order.createdAt).toLocaleDateString(),
      orderTime: order.orderTime || new Date(order.createdAt).toLocaleTimeString().slice(0, 5),
      createdAt: new Date(order.createdAt).toLocaleString(),
      updatedAt: new Date(order.updatedAt).toLocaleString()
    }

    return {
      success: true,
      data: orderDetail
    }
  } catch (error) {
    console.error('获取订单详情失败:', error)
    return {
      success: false,
      message: '投喂单详情没加载出来'
    }
  }
}

// 更新订单状态
async function updateOrderStatus(openid, orderId, status) {
  // 验证状态值
  const validStatuses = ['pending', 'processing', 'completed', 'cancelled']
  if (!validStatuses.includes(status)) {
    return {
      success: false,
      message: '无效的投喂单状态'
    }
  }

  // 检查订单权限
  const orderResult = await db.collection('orders').doc(orderId).get()
  if (!orderResult.data) {
    return {
      success: false,
      message: '投喂单不存在'
    }
  }

  const order = orderResult.data
  // 检查权限：只有创建者或制作者可以更新订单状态
  if (order.creatorId !== openid && order.assigneeId !== openid) {
    return {
      success: false,
      message: '无权限更新这张投喂单'
    }
  }
  if (!(await areBound(order.creatorId, order.assigneeId))) {
    return { success: false, message: '饭搭子关系已解除，这张投喂单不能继续操作' }
  }

  if (status === 'processing' && (order.status !== 'pending' || order.assigneeId !== openid)) {
    return {
      success: false,
      message: '只有投喂官可以开始制作'
    }
  }

  if (status === 'completed' && (order.status !== 'processing' || order.assigneeId !== openid)) {
    return {
      success: false,
      message: '只有投喂官可以完成投喂'
    }
  }

  if (status === 'cancelled' && !['pending', 'processing'].includes(order.status)) {
    return {
      success: false,
      message: '这张投喂单已经收口了'
    }
  }

  if (!['processing', 'completed', 'cancelled'].includes(status)) {
    return {
      success: false,
      message: '投喂单状态不能这样更新'
    }
  }

  const updateData = {
    status,
    updateTime: new Date(),
    updatedAt: new Date()
  }
  if (status === 'completed') updateData.completedAt = new Date()

  await db.collection('orders').doc(orderId).update({
    data: updateData
  })

  await updateFeedingStats(order, 'status', { from: order.status, to: status })
    .catch(error => console.error('投喂单状态统计更新失败:', error))

  if (status === 'completed') {
    await updateOrderWishes(order, 'done')
    await updateFeedingStats(order, 'completed')
      .catch(error => console.error('完成投喂统计更新失败:', error))
  }
  if (status === 'cancelled') {
    await updateOrderWishes(order, 'accepted')
  }
  await createOrderNotification(status, { ...order, status }, orderId, openid)
    .catch(error => console.error('投喂单状态站内消息创建失败:', error))
  const reminder = status === 'completed'
    ? await sendOrderSubscribeMessage('orderStatus', { ...order, status }, orderId, openid)
      .catch(error => ({ sent: false, message: formatSubscribeError(error) }))
    : null

  return {
    success: true,
    data: { reminder },
    message: '投喂单状态已更新'
  }
}

function normalizeOrderRequestId(value) {
  const requestId = String(value || '').trim()
  return /^[A-Za-z0-9_-]{8,80}$/.test(requestId) ? requestId : ''
}

function buildOrderId(openid, requestId) {
  const digest = crypto.createHash('sha256').update(`${openid}:${requestId}`).digest('hex').slice(0, 32)
  return `order_${digest}`
}

async function hideOrder(openid, orderId) {
  const orderResult = await db.collection('orders').doc(orderId).get()
  const order = orderResult.data
  if (!order) return { success: false, message: '投喂单不存在' }
  if (order.creatorId !== openid && order.assigneeId !== openid) {
    return { success: false, message: '无权删除这张投喂单' }
  }

  await db.collection('orders').doc(orderId).update({
    data: {
      hiddenFor: [...new Set([...(Array.isArray(order.hiddenFor) ? order.hiddenFor : []), openid])],
      updatedAt: new Date()
    }
  })
  return { success: true, message: '投喂单已删除' }
}

async function rateOrder(openid, orderId, rating, recipeRatings) {
  const orderResult = await db.collection('orders').doc(orderId).get()
  const order = orderResult.data

  if (!order) return { success: false, message: '投喂单不存在' }
  if (order.creatorId !== openid) return { success: false, message: '只有点饭人可以评价' }
  if (!(await areBound(order.creatorId, order.assigneeId))) {
    return { success: false, message: '饭搭子关系已解除，不能再评价这张投喂单' }
  }
  if (order.status !== 'completed') return { success: false, message: '投喂完成后才能评价' }
  if (order.rating) return { success: false, message: '这张投喂单已经评价过了' }

  const content = String((rating && rating.content) || '').trim()
  if (content.length > 100) return { success: false, message: '评价请控制在 100 字以内' }

  const orderRecipes = (order.recipes || []).filter(item => item && item.recipeId)
  const allowedRecipes = new Map(orderRecipes.map(item => [item.recipeId, item]))
  let normalizedRatings = []

  if (allowedRecipes.size > 0) {
    if (Array.isArray(recipeRatings) && recipeRatings.length > 0) {
      const submitted = new Map()
      for (const item of recipeRatings) {
        const recipeId = String((item && item.recipeId) || '')
        const score = Number(item && item.score)
        if (!allowedRecipes.has(recipeId) || !Number.isInteger(score) || score < 1 || score > 5) {
          return { success: false, message: '菜品评分数据不正确' }
        }
        submitted.set(recipeId, score)
      }
      if ([...allowedRecipes.keys()].some(recipeId => !submitted.has(recipeId))) {
        return { success: false, message: '请给每道菜打分' }
      }
      normalizedRatings = [...allowedRecipes.entries()].map(([recipeId, recipe]) => ({
        recipeId,
        recipeName: recipe.recipeName || '未命名菜品',
        score: submitted.get(recipeId)
      }))
    } else {
      const legacyScore = Number(rating && rating.score)
      if (!Number.isInteger(legacyScore) || legacyScore < 1 || legacyScore > 5) {
        return { success: false, message: '请给每道菜打分' }
      }
      normalizedRatings = [...allowedRecipes.entries()].map(([recipeId, recipe]) => ({
        recipeId,
        recipeName: recipe.recipeName || '未命名菜品',
        score: legacyScore
      }))
    }
  }

  const fallbackScore = Number(rating && rating.score)
  const score = normalizedRatings.length
    ? Number((normalizedRatings.reduce((total, item) => total + item.score, 0) / normalizedRatings.length).toFixed(1))
    : fallbackScore
  if (!Number.isFinite(score) || score < 1 || score > 5) {
    return { success: false, message: '请选择 1 到 5 分' }
  }

  const ratedAt = new Date()
  await db.runTransaction(async transaction => {
    const latestOrder = await transaction.collection('orders').doc(orderId).get()
    if (!latestOrder.data || latestOrder.data.rating) {
      throw new Error('这张投喂单已经评价过了')
    }

    for (const item of normalizedRatings) {
      await transaction.collection('recipes').doc(item.recipeId).update({
        data: {
          ratingTotal: _.inc(item.score),
          ratingCount: _.inc(1)
        }
      })
    }

    await transaction.collection('orders').doc(orderId).update({
      data: {
        rating: { score, content },
        recipeRatings: normalizedRatings,
        ratedAt,
        updatedAt: ratedAt
      }
    })
  })

  await updateFeedingStats(order, 'rated', { score, content })
    .catch(error => console.error('评分统计更新失败:', error))

  return { success: true, data: { score, content, recipeRatings: normalizedRatings } }
}

async function saveMemoryNote(openid, orderId, note) {
  const orderResult = await db.collection('orders').doc(orderId).get()
  const order = orderResult.data
  if (!order) return { success: false, message: '投喂单不存在' }
  if (order.creatorId !== openid && order.assigneeId !== openid) return { success: false, message: '没有权限记录这顿饭' }
  if (order.status !== 'completed') return { success: false, message: '投喂完成后才能记录记忆' }
  if (!(await areBound(order.creatorId, order.assigneeId))) return { success: false, message: '饭搭子关系已解除，不能修改这段记忆' }
  const memoryNote = String(note || '').trim()
  if (memoryNote.length > 100) return { success: false, message: '记忆请控制在 100 字以内' }
  await db.collection('orders').doc(orderId).update({ data: { memoryNote, memoryNoteUpdatedAt: new Date(), updatedAt: new Date() } })
  await updateFeedingStats(order, 'memoryNote', { memoryNote })
  return { success: true, data: { memoryNote } }
}

// 取消订单
async function cancelOrder(openid, orderId) {
  const orderResult = await db.collection('orders').doc(orderId).get()
  
  if (!orderResult.data) {
    return {
      success: false,
      message: '投喂单不存在'
    }
  }

  const order = orderResult.data
  // 检查权限：只有创建者或制作者可以取消订单
  if (order.creatorId !== openid && order.assigneeId !== openid) {
    return {
      success: false,
      message: '无权限取消这张投喂单'
    }
  }
  if (!(await areBound(order.creatorId, order.assigneeId))) {
    return { success: false, message: '饭搭子关系已解除，这张投喂单不能继续操作' }
  }

  // 只有待处理的订单可以取消
  if (order.status !== 'pending') {
    return {
      success: false,
      message: '这张投喂单现在不能取消'
    }
  }

  await db.collection('orders').doc(orderId).update({
    data: {
      status: 'cancelled',
      cancelTime: new Date(),
      updateTime: new Date()
    }
  })

  await updateOrderWishes(order, 'accepted')

  return {
    success: true,
    message: '投喂单已取消'
  }
}



// 获取订单统计
async function getOrderStatistics(openid) {
  const isChef = openid === await getChefOpenid()
  const aggregateResult = await db.collection('feeding_stats')
    .where(isChef ? { chefId: openid } : { dinerId: openid })
    .limit(100)
    .get()
  if (aggregateResult.data.length) {
    const stats = aggregateResult.data.reduce((total, item) => ({
      total: total.total + Number(item.totalOrders || 0),
      pending: total.pending + Number(item.pending || 0),
      processing: total.processing + Number(item.processing || 0),
      completed: total.completed + Number(item.completed || 0),
      cancelled: total.cancelled + Number(item.cancelled || 0)
    }), { total: 0, pending: 0, processing: 0, completed: 0, cancelled: 0 })
    return { success: true, data: stats }
  }

  const allOrders = await getOrdersByCondition({
    $or: [
      { creatorId: openid },
      { assigneeId: openid }
    ]
  })

  const stats = {
    total: allOrders.length,
    pending: 0,
    processing: 0,
    completed: 0,
    cancelled: 0
  }

  allOrders.forEach(order => {
    stats[order.status]++
  })

  return {
    success: true,
    data: stats
  }
}

async function getMemoryOverview(openid) {
  const isChef = openid === await getChefOpenid()
  const aggregateResult = await db.collection('feeding_stats')
    .where(isChef ? { chefId: openid } : { dinerId: openid })
    .limit(100)
    .get()
  if (aggregateResult.data.length) {
    return await buildMemoryFromAggregates(openid, isChef, aggregateResult.data)
  }

  const [asChefOrders, asDinerOrders] = await Promise.all([
    getOrdersByCondition({ assigneeId: openid }),
    getOrdersByCondition({ creatorId: openid })
  ])
  const orders = isChef ? asChefOrders : asDinerOrders
  const personKey = isChef ? 'creatorId' : 'assigneeId'
  const people = new Map()

  orders.forEach(order => {
    const personId = order[personKey]
    if (!personId) return
    if (!people.has(personId)) {
      people.set(personId, {
        id: personId,
        totalOrders: 0,
        completedMeals: 0,
        totalDishes: 0,
        ratingTotal: 0,
        ratingCount: 0,
        recipes: new Map(),
        recentMeals: [],
        latestRating: null
      })
    }

    const person = people.get(personId)
    person.totalOrders += 1
    if (order.status !== 'completed') return

    person.completedMeals += 1
    person.totalDishes += Number(order.totalRecipes) || (order.recipes || []).length
    person.recentMeals.push(order)

    ;(order.recipes || []).forEach(recipe => {
      const key = recipe.recipeId || recipe.recipeName
      if (!key) return
      const current = person.recipes.get(key) || {
        name: recipe.recipeName || '未命名菜品',
        image: recipe.image || '/images/default-recipe.jpg',
        count: 0
      }
      current.count += 1
      person.recipes.set(key, current)
    })

    const ratingScore = Number(order.rating && order.rating.score)
    if (Number.isFinite(ratingScore) && ratingScore >= 1 && ratingScore <= 5) {
      person.ratingTotal += ratingScore
      person.ratingCount += 1
      if (!person.latestRating || getOrderTime(order.ratedAt) > getOrderTime(person.latestRating.ratedAt)) {
        person.latestRating = {
          score: Number(order.rating.score),
          content: order.rating.content || '',
          ratedAt: order.ratedAt
        }
      }
    }
  })

  const personList = await Promise.all([...people.values()].map(async person => {
    const user = await getUserByOpenid(person.id)
    const remark = await getRemark(openid, person.id)
    const favorites = await getFavoriteRecipes(person.id)
    const recentMeals = person.recentMeals
      .sort((a, b) => getOrderTime(b.completedAt || b.updatedAt || b.createdAt) - getOrderTime(a.completedAt || a.updatedAt || a.createdAt))
      .slice(0, 3)
      .map(order => ({
        id: order._id,
        date: order.orderDate || formatMemoryDate(order.completedAt || order.updatedAt || order.createdAt),
        recipeNames: (order.recipes || []).map(recipe => recipe.recipeName).filter(Boolean).join('、') || '这一顿饭',
        memoryNote: order.memoryNote || ''
      }))

    return {
      id: person.id,
      nickname: remark || user.nickname || 'TA',
      avatar: user.avatar || '/images/default-avatar.png',
      totalOrders: person.totalOrders,
      completedMeals: person.completedMeals,
      totalDishes: person.totalDishes,
      ratingAverage: person.ratingCount ? (person.ratingTotal / person.ratingCount).toFixed(1) : '',
      ratingCount: person.ratingCount,
      topRecipes: [...person.recipes.values()].sort((a, b) => b.count - a.count).slice(0, 3),
      favoriteRecipes: favorites,
      recentMeals,
      latestRating: person.latestRating
    }
  }))

  const totalOrders = personList.reduce((total, person) => total + person.totalOrders, 0)
  const completedMeals = personList.reduce((total, person) => total + person.completedMeals, 0)
  const totalDishes = personList.reduce((total, person) => total + person.totalDishes, 0)
  return {
    success: true,
    data: {
      role: isChef ? 'chef' : 'diner',
      totalOrders,
      completedMeals,
      totalDishes,
      people: personList.sort((a, b) => b.completedMeals - a.completedMeals)
    }
  }
}

async function buildMemoryFromAggregates(openid, isChef, aggregates) {
  const people = await Promise.all(aggregates.map(async stats => {
    const personId = isChef ? stats.dinerId : stats.chefId
    const [user, favorites, remark] = await Promise.all([
      getUserByOpenid(personId),
      getFavoriteRecipes(personId),
      getRemark(openid, personId)
    ])
    return {
      id: personId,
      nickname: remark || user.nickname || 'TA',
      avatar: user.avatar || '/images/default-avatar.png',
      totalOrders: Number(stats.totalOrders || 0),
      completedMeals: Number(stats.completedMeals || 0),
      totalDishes: Number(stats.totalDishes || 0),
      ratingAverage: Number(stats.ratingCount || 0)
        ? (Number(stats.ratingTotal || 0) / Number(stats.ratingCount)).toFixed(1)
        : '',
      ratingCount: Number(stats.ratingCount || 0),
      topRecipes: Object.values(stats.recipeStats || {}).sort((a, b) => b.count - a.count).slice(0, 3),
      favoriteRecipes: favorites,
      recentMeals: stats.recentMeals || [],
      latestRating: stats.latestRating || null
    }
  }))

  return {
    success: true,
    data: {
      role: isChef ? 'chef' : 'diner',
      totalOrders: people.reduce((total, person) => total + person.totalOrders, 0),
      completedMeals: people.reduce((total, person) => total + person.completedMeals, 0),
      totalDishes: people.reduce((total, person) => total + person.totalDishes, 0),
      people: people.sort((a, b) => b.completedMeals - a.completedMeals)
    }
  }
}

async function rebuildStatistics(openid) {
  const chefOpenid = await getChefOpenid()
  if (openid !== chefOpenid) return { success: false, message: '只有固定投喂官可以重建统计' }

  await db.collection('feeding_stats').where({ chefId: chefOpenid }).remove()
  const orders = await getOrdersByCondition({ assigneeId: chefOpenid })
  for (const order of orders) {
    await updateFeedingStats(order, 'created')
    if (order.status !== 'pending') {
      await updateFeedingStats(order, 'status', { from: 'pending', to: order.status })
    }
    if (order.status === 'completed') await updateFeedingStats(order, 'completed')
    if (order.rating && Number(order.rating.score)) {
      await updateFeedingStats(order, 'rated', {
        score: Number(order.rating.score),
        content: order.rating.content || ''
      })
    }
  }
  return { success: true, data: { rebuiltOrders: orders.length } }
}

async function getOrdersByCondition(condition) {
  const pageSize = 100
  const orders = []
  let skip = 0

  while (true) {
    const result = await db.collection('orders').where(condition).skip(skip).limit(pageSize).get()
    const page = result.data || []
    orders.push(...page)
    if (page.length < pageSize) return orders
    skip += pageSize
  }
}

async function getUserByOpenid(openid) {
  try {
    const result = await db.collection('users').where({ openid }).limit(1).get()
    return result.data[0] || {}
  } catch (error) {
    return {}
  }
}

async function getFavoriteRecipes(userId) {
  try {
    const favoriteResult = await db.collection('favorites').where({ userId }).orderBy('createdAt', 'desc').limit(3).get()
    const recipes = await Promise.all((favoriteResult.data || []).map(async favorite => {
      try {
        const recipeResult = await db.collection('recipes').doc(favorite.recipeId).get()
        const recipe = recipeResult.data
        return recipe ? {
          id: recipe._id,
          name: recipe.name || '未命名菜品',
          image: (recipe.images || [])[0] || '/images/default-recipe.jpg'
        } : null
      } catch (error) {
        return null
      }
    }))
    return recipes.filter(Boolean)
  } catch (error) {
    return []
  }
}

function getOrderTime(value) {
  return value ? new Date(value).getTime() || 0 : 0
}

function formatMemoryDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

async function getFamilyConfig() {
  try {
    const result = await db.collection('app_config').doc('family').get()
    if (result.data && result.data.chefOpenid) return result.data
  } catch (error) {
    throw new Error('系统配置读取失败，请检查 app_config/family')
  }
  throw new Error('请先在 app_config/family 配置固定投喂官')
}

async function getChefOpenid() {
  return (await getFamilyConfig()).chefOpenid
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

async function validateOrderRecipes(openid, feederOpenid, recipes) {
  for (const item of recipes) {
    try {
      if (item.type === 'wish' || item.wishId) {
        if (!item.wishId) return { success: false, message: '饭愿信息不完整，请重新加入饭篮' }
        const result = await db.collection('wishes').doc(item.wishId).get()
        const wish = result.data
        if (!wish || wish.creatorId !== openid || wish.assigneeId !== feederOpenid) {
          return { success: false, message: '饭篮中存在不属于当前投喂关系的饭愿' }
        }
        continue
      }

      if (!item.recipeId) return { success: false, message: '菜品信息不完整，请重新加入饭篮' }
      const result = await db.collection('recipes').doc(item.recipeId).get()
      if (!result.data || result.data.creatorId !== feederOpenid) {
        return { success: false, message: '饭篮中存在不属于固定投喂官的菜品' }
      }
    } catch (error) {
      return { success: false, message: '饭篮中的菜品已失效，请移除后重新选择' }
    }
  }
  return { success: true }
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

async function updateFeedingStats(order, event, extra = {}) {
  const statsId = `${order.assigneeId}_${order.creatorId}`
  await db.runTransaction(async transaction => {
    let current = {}
    try {
      const result = await transaction.collection('feeding_stats').doc(statsId).get()
      current = result.data || {}
    } catch (error) {
      current = {}
    }

    const data = {
      chefId: order.assigneeId,
      dinerId: order.creatorId,
      totalOrders: Number(current.totalOrders || 0),
      completedMeals: Number(current.completedMeals || 0),
      totalDishes: Number(current.totalDishes || 0),
      ratingTotal: Number(current.ratingTotal || 0),
      ratingCount: Number(current.ratingCount || 0),
      pending: Number(current.pending || 0),
      processing: Number(current.processing || 0),
      completed: Number(current.completed || 0),
      cancelled: Number(current.cancelled || 0),
      recipeStats: current.recipeStats || {},
      recentMeals: Array.isArray(current.recentMeals) ? current.recentMeals : [],
      latestRating: current.latestRating || null,
      updatedAt: new Date()
    }
    if (event === 'created') {
      data.totalOrders += 1
      data.pending += 1
    }
    if (event === 'status') {
      if (Object.prototype.hasOwnProperty.call(data, extra.from)) {
        data[extra.from] = Math.max(0, data[extra.from] - 1)
      }
      if (Object.prototype.hasOwnProperty.call(data, extra.to)) data[extra.to] += 1
    }
    if (event === 'completed') {
      data.completedMeals += 1
      data.totalDishes += Number(order.totalRecipes) || (order.recipes || []).length
      ;(order.recipes || []).forEach(recipe => {
        const key = String(recipe.recipeId || recipe.recipeName || '').replace(/[.$]/g, '_')
        if (!key) return
        const currentRecipe = data.recipeStats[key] || {
          name: recipe.recipeName || '未命名菜品',
          image: recipe.image || '/images/default-recipe.jpg',
          count: 0
        }
        currentRecipe.count += 1
        data.recipeStats[key] = currentRecipe
      })
      data.recentMeals = [{
        id: order._id || '',
        date: order.orderDate || formatMemoryDate(order.completedAt || order.updatedAt || order.createdAt),
        recipeNames: (order.recipes || []).map(recipe => recipe.recipeName).filter(Boolean).join('、') || '这一顿饭',
        memoryNote: order.memoryNote || ''
      }, ...data.recentMeals].slice(0, 3)
    }
    if (event === 'memoryNote') {
      data.recentMeals = data.recentMeals.map(item => item.id === order._id
        ? { ...item, memoryNote: String(extra.memoryNote || '') }
        : item)
    }
    if (event === 'rated') {
      data.ratingTotal += Number(extra.score) || 0
      data.ratingCount += 1
      data.latestRating = {
        score: Number(extra.score) || 0,
        content: String(extra.content || '').slice(0, 100),
        ratedAt: new Date()
      }
    }
    await transaction.collection('feeding_stats').doc(statsId).set({ data })
  })
}

async function sendOrderSubscribeMessage(kind, order, orderId, actorOpenid = '') {
  const config = await getFamilyConfig()
  const template = config.subscribeTemplates && config.subscribeTemplates[kind]
  const templateId = template && (template.templateId || template.template_id)
  if (!templateId) return { sent: false, message: '微信提醒模板尚未配置' }

  const recipientId = kind === 'orderCreated'
    ? order.assigneeId
    : (actorOpenid === order.creatorId ? order.assigneeId : order.creatorId)
  if (!recipientId) return { sent: false, message: '没有找到消息接收人' }

  const creator = await getUserByOpenid(order.creatorId)
  const dinerName = await getRemark(recipientId, order.creatorId) || creator.nickname || '饭搭子'
  const payload = {
    dinerName: String(dinerName || '饭搭子'),
    dishes: (order.recipes || []).map(item => item.recipeName).filter(Boolean).join('、').slice(0, 20) || '一份投喂单',
    mealTime: formatMealTime(order),
    status: getStatusLabel(order.status),
    remark: String(order.notes || '快来看看吧').slice(0, 20)
  }
  const fields = template.fields || {}
  const data = {}
  Object.keys(fields).forEach(key => {
    const value = payload[fields[key]]
    const formattedValue = formatTemplateValue(key, value)
    if (formattedValue) data[key] = { value: formattedValue }
  })
  if (!Object.keys(data).length) return { sent: false, message: '订阅模板字段映射为空' }

  const result = await cloud.openapi.subscribeMessage.send({
    touser: recipientId,
    page: `${template.page || 'pages/order-detail/order-detail'}?orderId=${orderId}`,
    lang: 'zh_CN',
    miniprogramState: config.miniprogramState || 'formal',
    templateId,
    data
  })
  const errCode = Number(result && (result.errCode || result.errcode) || 0)
  if (errCode) {
    const error = new Error(result.errMsg || result.errmsg || '微信提醒发送失败')
    error.errCode = errCode
    throw error
  }
  return { sent: true }
}

async function createOrderNotification(event, order, orderId, actorOpenid) {
  const recipientId = event === 'created'
    ? order.assigneeId
    : (actorOpenid === order.creatorId ? order.assigneeId : order.creatorId)
  if (!recipientId || recipientId === actorOpenid) return

  const actor = await getUserByOpenid(actorOpenid)
  const actorName = actor.nickname || '饭搭子'
  const titleMap = {
    created: `${actorName}提交了新的投喂单`,
    processing: `${actorName}开始投喂啦`,
    completed: `${actorName}完成了这次投喂`,
    cancelled: `${actorName}取消了这次投喂`
  }
  const dishes = (order.recipes || []).map(item => item.recipeName).filter(Boolean).join('、').slice(0, 36)
  await db.collection('notifications').add({
    data: {
      type: event === 'created' ? 'order_created' : 'order_status',
      senderId: actorOpenid,
      recipientId,
      title: titleMap[event] || '投喂单有新变化',
      content: dishes || `共${order.totalRecipes || 0}道菜`,
      targetPage: `/pages/order-detail/order-detail?orderId=${orderId}`,
      targetId: orderId,
      read: false,
      createdAt: new Date()
    }
  })
}

function formatSubscribeError(error) {
  const code = Number(error && (error.errCode || error.errcode || error.code))
  const detail = String(error && (error.errMsg || error.errmsg || error.message) || '').trim()
  if (code === 43101) return '对方尚未允许该提醒，或一次订阅次数已经用完'
  if (code === 40037) return '订阅消息模板 ID 无效'
  if (code === 47003) return detail ? `订阅模板参数不正确：${detail}` : '订阅模板字段名或字段内容格式不正确'
  if (code === 41030) return '消息跳转页面在当前小程序版本中不存在'
  return detail || '微信提醒发送失败'
}

function formatSubscribeTime(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  const chinaDate = new Date(date.getTime() + 8 * 3600000)
  return `${String(chinaDate.getUTCHours()).padStart(2, '0')}:${String(chinaDate.getUTCMinutes()).padStart(2, '0')}`
}

function formatMealTime(order = {}) {
  const match = String(order.orderDate || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const mealTimes = { breakfast: '08:00', lunch: '12:00', dinner: '18:00' }
  const time = mealTimes[order.mealType] || formatSubscribeTime(order.orderTime) || '12:00'
  if (!match) return time
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日 ${time}`
}

function formatTemplateValue(key, value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^phrase\d+$/i.test(key)) return text.slice(0, 5)
  if (/^name\d+$/i.test(key)) return text.slice(0, 10)
  if (/^thing\d+$/i.test(key)) return text.slice(0, 20)
  return text
}

// 生成订单号
function generateOrderNo() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  const second = String(now.getSeconds()).padStart(2, '0')
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  
  return `FY${year}${month}${day}${hour}${minute}${second}${random}`
}

// 获取餐次标签
function getMealTypeLabel(mealType) {
  const labels = {
    breakfast: '早餐',
    lunch: '午餐',
    dinner: '晚餐'
  }
  return labels[mealType] || '未知'
}

// 获取餐次图标
function getMealTypeIcon(mealType) {
  const icons = {
    breakfast: '🌅',
    lunch: '🌞',
    dinner: '🌙'
  }
  return icons[mealType] || '🍽️'
}

// 获取状态标签
function getStatusLabel(status) {
  const labels = {
    pending: '待投喂',
    processing: '投喂中',
    completed: '已投喂',
    cancelled: '已取消'
  }
  return labels[status] || '未知'
}

async function markWishesOrdered(openid, recipes, orderId) {
  const wishIds = recipes
    .filter(recipe => recipe.wishId)
    .map(recipe => recipe.wishId)

  for (const wishId of wishIds) {
    try {
      const wishResult = await db.collection('wishes').doc(wishId).get()
      if (wishResult.data && wishResult.data.creatorId === openid) {
        await db.collection('wishes').doc(wishId).update({
          data: {
            status: 'ordered',
            orderId,
            orderedAt: new Date(),
            updatedAt: new Date()
          }
        })
      }
    } catch (error) {
      console.error('更新心愿订单状态失败:', wishId, error)
    }
  }
}

async function updateOrderWishes(order, nextStatus) {
  const wishIds = (order.recipes || [])
    .filter(recipe => recipe.wishId)
    .map(recipe => recipe.wishId)

  for (const wishId of wishIds) {
    try {
      const wishResult = await db.collection('wishes').doc(wishId).get()
      const wish = wishResult.data
      if (!wish || wish.creatorId !== order.creatorId) continue

      const data = {
        status: nextStatus,
        updatedAt: new Date()
      }
      if (nextStatus === 'done') data.doneAt = new Date()
      if (nextStatus === 'accepted') data.reopenedAt = new Date()

      await db.collection('wishes').doc(wishId).update({ data })
    } catch (error) {
      console.error('同步饭愿状态失败:', wishId, error)
    }
  }
}
