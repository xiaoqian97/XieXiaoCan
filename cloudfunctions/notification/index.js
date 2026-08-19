const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    switch (event.action) {
      case 'createShareNotification':
        return await createShareNotification(openid, event)
      case 'list':
        return await listNotifications(openid, event)
      case 'getFirstUnread':
        return await getFirstUnread(openid, event.excludeIds)
      case 'getWishUnreadCount':
        return await getWishUnreadCount(openid, event.mode)
      case 'markWishRead':
        return await markWishRead(openid, event.mode)
      case 'markRead':
        return await markRead(openid, event.notificationId)
      case 'markAllRead':
        return await markAllRead(openid)
      case 'delete':
        return await deleteNotification(openid, event.notificationId)
      case 'getSubscribeConfig':
        return await getSubscribeConfig()
      default:
        return { success: false, message: '未知操作' }
    }
  } catch (error) {
    console.error('通知操作失败:', error)
    return {
      success: false,
      message: error.message || '通知操作失败'
    }
  }
}

async function createShareNotification(openid, event) {
  if (event.type === 'order_share') {
    return await createOrderShare(openid, event.orderId)
  }
  if (event.type === 'wish_share') {
    return await createWishShare(openid, event.wishId)
  }

  return { success: false, message: '通知类型不正确' }
}

async function createOrderShare(openid, orderId) {
  if (!orderId) return { success: false, message: '投喂单不存在' }

  const order = await getRecord('orders', orderId)
  if (!order) return { success: false, message: '投喂单不存在' }
  if (order.creatorId !== openid && order.assigneeId !== openid) {
    return { success: false, message: '无权限分享这张投喂单' }
  }
  if (!(await areBound(order.creatorId, order.assigneeId))) {
    return { success: false, message: '饭搭子关系已解除，不能再分享这张投喂单' }
  }

  const sender = await getUser(openid)
  const recipientId = order.assigneeId === openid ? order.creatorId : order.assigneeId
  const mealLabel = getMealTypeLabel(order.mealType)
  const title = `${sender.nickname || '饭搭子'}给你发来一张${mealLabel}投喂单`
  const content = `${order.orderDate || '今天'}，共${order.totalRecipes || (order.recipes || []).length}道菜`

  return await addNotification({
    type: 'order_share',
    senderId: openid,
    recipientId,
    title,
    content,
    targetPage: `/pages/order-detail/order-detail?orderId=${orderId}`,
    targetId: orderId
  })
}

async function createWishShare(openid, wishId) {
  if (!wishId) return { success: false, message: '饭愿不存在' }

  const wish = await getRecord('wishes', wishId)
  if (!wish) return { success: false, message: '饭愿不存在' }
  if (wish.creatorId !== openid && wish.assigneeId !== openid) {
    return { success: false, message: '无权限分享这个饭愿' }
  }
  if (!(await areBound(wish.creatorId, wish.assigneeId))) {
    return { success: false, message: '饭搭子关系已解除，不能再分享这个饭愿' }
  }

  const sender = await getUser(openid)
  const title = `${sender.nickname || '饭搭子'}给你发来一道饭愿`
  const content = `${wish.name || '想吃的菜'}，来看看这份饭愿吧`

  const recipientId = wish.assigneeId === openid ? wish.creatorId : wish.assigneeId
  const targetPage = recipientId === wish.assigneeId
    ? '/pages/wish-list/wish-list?mode=pool'
    : '/pages/wish-list/wish-list?mode=mine'

  return await addNotification({
    type: 'wish_share',
    senderId: openid,
    recipientId,
    title,
    content,
    targetPage,
    targetId: wishId
  })
}

async function listNotifications(openid, event = {}) {
  const page = Math.max(1, Number(event.page) || 1)
  const limit = Math.min(50, Math.max(1, Number(event.limit) || 20))
  const query = db.collection('notifications').where({ recipientId: openid })
  const [result, countResult, unreadResult] = await Promise.all([
    query.orderBy('createdAt', 'desc').skip((page - 1) * limit).limit(limit).get(),
    query.count(),
    db.collection('notifications').where({ recipientId: openid, read: false }).count()
  ])

  return {
    success: true,
    data: {
      notifications: result.data.map(item => ({
        ...item,
        targetPage: normalizeWishTargetPage(item),
        title: sanitizeTerminology(item.title),
        content: sanitizeTerminology(sanitizeLegacyWishContent(item)),
        createdAtText: formatDate(item.createdAt)
      })),
      total: countResult.total,
      unreadCount: unreadResult.total,
      page,
      limit,
      hasMore: page * limit < countResult.total
    }
  }
}

async function getFirstUnread(openid, excludeIds = []) {
  const excluded = new Set((Array.isArray(excludeIds) ? excludeIds : [])
    .slice(-100)
    .map(id => String(id || '').trim())
    .filter(Boolean))
  const result = await db.collection('notifications')
    .where({ recipientId: openid, read: false })
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get()
  const item = (result.data || []).find(notification => !excluded.has(notification._id))

  return {
    success: true,
    data: item ? {
      ...item,
      targetPage: normalizeWishTargetPage(item),
      title: sanitizeTerminology(item.title),
      content: sanitizeTerminology(sanitizeLegacyWishContent(item)),
      createdAtText: formatDate(item.createdAt)
    } : null
  }
}

async function getWishUnreadCount(openid, mode) {
  const unread = await getAllUnreadNotifications(openid)
  const types = getWishNotificationTypes(mode)
  return {
    success: true,
    data: {
      unreadCount: unread.filter(item => types.includes(item.type)).length
    }
  }
}

async function markWishRead(openid, mode) {
  const unread = await getAllUnreadNotifications(openid)
  const types = getWishNotificationTypes(mode)
  const ids = unread.filter(item => types.includes(item.type)).map(item => item._id)
  const readAt = new Date()
  for (let index = 0; index < ids.length; index += 20) {
    await Promise.all(ids.slice(index, index + 20).map(id => {
      return db.collection('notifications').doc(id).update({
        data: { read: true, readAt }
      })
    }))
  }
  return { success: true, updated: ids.length }
}

async function getAllUnreadNotifications(openid) {
  const records = []
  const limit = 100
  let offset = 0
  while (true) {
    const result = await db.collection('notifications')
      .where({ recipientId: openid, read: false })
      .skip(offset)
      .limit(limit)
      .get()
    const items = result.data || []
    records.push(...items)
    if (items.length < limit) return records
    offset += items.length
  }
}

function getWishNotificationTypes(mode) {
  return mode === 'pool'
    ? ['wish_received', 'wish_share']
    : ['wish_status', 'wish_share']
}

function normalizeWishTargetPage(item) {
  if (item.type === 'wish_received') return '/pages/wish-list/wish-list?mode=pool'
  if (item.type === 'wish_status') return '/pages/wish-list/wish-list?mode=mine'
  if (item.type === 'wish_share' && String(item.targetPage || '').includes('mode=acceptWish')) {
    return '/pages/wish-list/wish-list?mode=pool'
  }
  return item.targetPage || '/pages/notifications/notifications'
}

function sanitizeLegacyWishContent(item) {
  const content = String(item.content || '')
  if (item.type !== 'wish_share') return content
  if (content.includes('来看看这份饭愿吧')) return content
  const wishName = content
    .replace(/[，,]?饭钱\s*¥?\s*\d+(?:\.\d+)?/g, '')
    .replace(/[，,]?饭钱待定/g, '')
    .replace(/[，,、\s]+$/g, '')
  return `${wishName || '想吃的菜'}，来看看这份饭愿吧`
}

function sanitizeTerminology(value) {
  return String(value || '').replace(/家里人/g, '饭搭子')
}

async function markRead(openid, notificationId) {
  if (!notificationId) return { success: true }

  const notification = await getRecord('notifications', notificationId)
  if (!notification || notification.recipientId !== openid) {
    return { success: false, message: '通知不存在' }
  }

  await db.collection('notifications').doc(notificationId).update({
    data: {
      read: true,
      readAt: new Date()
    }
  })

  return { success: true }
}

async function markAllRead(openid) {
  const result = await db.collection('notifications').where({
    recipientId: openid
  }).update({
    data: {
      read: true,
      readAt: new Date()
    }
  })

  return {
    success: true,
    updated: result.stats ? result.stats.updated : 0
  }
}

async function deleteNotification(openid, notificationId) {
  if (!notificationId) return { success: false, message: '消息不存在' }
  const notification = await getRecord('notifications', notificationId)
  if (!notification || notification.recipientId !== openid) {
    return { success: false, message: '消息不存在或无权删除' }
  }
  await db.collection('notifications').doc(notificationId).remove()
  return { success: true }
}

async function addNotification(data) {
  if (!data.recipientId || data.recipientId === data.senderId) {
    return { success: true }
  }

  const duplicate = await db.collection('notifications').where({
    type: data.type,
    senderId: data.senderId,
    recipientId: data.recipientId,
    targetId: data.targetId,
    read: false
  }).limit(1).get()

  if (duplicate.data && duplicate.data.length) {
    await db.collection('notifications').doc(duplicate.data[0]._id).update({
      data: {
        title: data.title,
        content: data.content,
        targetPage: data.targetPage,
        createdAt: new Date()
      }
    })
    return { success: true }
  }

  await db.collection('notifications').add({
    data: {
      ...data,
      read: false,
      createdAt: new Date()
    }
  })

  return { success: true }
}

async function getRecord(collection, id) {
  try {
    const result = await db.collection(collection).doc(id).get()
    return result.data || null
  } catch (error) {
    return null
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

async function getUser(openid) {
  try {
    const result = await db.collection('users').where({ openid }).limit(1).get()
    return result.data[0] || {}
  } catch (error) {
    return {}
  }
}

async function getSubscribeConfig() {
  const config = await getFamilyConfig()
  const templates = config.subscribeTemplates || {}
  const templateIds = getTemplateIds(templates)
  if (!templateIds.length) {
    return { success: false, message: '订阅模板 ID 未正确配置，请替换示例文字并填写公众平台中的真实模板 ID' }
  }
  const templatePriority = ['friendRequest', 'orderCreated', 'orderStatus', 'blessingReceived']
  const orderedKeys = [
    ...templatePriority.filter(key => templates[key]),
    ...Object.keys(templates).filter(key => !templatePriority.includes(key))
  ]
  const orderedTemplates = orderedKeys.reduce((result, key) => {
    const templateId = getConfiguredTemplateId(templates[key])
    if (templateId) result[key] = templateId
    return result
  }, {})
  if (!Object.keys(orderedTemplates).length) {
    return { success: false, message: '订阅模板 ID 未正确配置，请替换示例文字并填写公众平台中的真实模板 ID' }
  }
  return {
    success: true,
    data: {
      templateIds: [...new Set(Object.values(orderedTemplates))],
      templates: orderedTemplates
    }
  }
}

function getTemplateIds(templates) {
  return [...new Set(Object.values(templates).map(getConfiguredTemplateId).filter(Boolean))]
}

function getConfiguredTemplateId(template) {
  const templateId = String(template && (template.templateId || template.template_id) || '').trim()
  if (!templateId) return ''
  // README 中的中文示例不能作为微信订阅模板 ID 直接使用。
  if (/模板\s*(ID|编号)|请填写|这里填写/i.test(templateId)) return ''
  return templateId
}

async function getFamilyConfig() {
  try {
    const result = await db.collection('app_config').doc('family').get()
    if (result.data) return result.data
  } catch (error) {
    throw new Error('系统配置读取失败，请检查 app_config/family')
  }
  throw new Error('缺少 app_config/family 配置，请在云数据库中创建记录 ID 为 family 的记录')
}

function getMealTypeLabel(mealType) {
  const labels = {
    breakfast: '早餐',
    lunch: '午餐',
    dinner: '晚餐'
  }
  return labels[mealType] || '今日'
}

function formatDate(date) {
  if (!date) return ''
  return new Date(date).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false
  })
}
