const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const PRIMARY_ADMIN_OPENID = 'oyWDkxVwYIHb3adMU4PpCl9rWUqI'

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action } = event

  try {
    switch (action) {
      case 'getFriendList':
        return await getFriendList(wxContext.OPENID)
      
      case 'addFriend':
        // 兼容旧版调用，但不允许绕过对方确认直接建立好友关系。
        return await sendFriendRequest(wxContext.OPENID, event.friendOpenid, event.message)
      
      case 'deleteFriend':
        return await deleteFriend(wxContext.OPENID, event.friendOpenid)
      
      case 'getFriendRequests':
        return await getFriendRequests(wxContext.OPENID)
      
      case 'sendFriendRequest':
        return await sendFriendRequest(wxContext.OPENID, event.targetOpenid, event.message)
      
      case 'handleFriendRequest':
        return await handleFriendRequest(wxContext.OPENID, event.requestId, event.accept, event.remark)

      case 'cancelFriendRequest':
        return await cancelFriendRequest(wxContext.OPENID, event.requestId)

      case 'deleteFriendRequestRecord':
        return await deleteFriendRequestRecord(wxContext.OPENID, event.requestId)

      case 'deleteReceivedFriendRequestRecord':
        return await deleteReceivedFriendRequestRecord(wxContext.OPENID, event.requestId)

      case 'updateRemark':
        return await updateRemark(wxContext.OPENID, event.friendOpenid, event.remark)

      case 'setFixedFeeder':
        return await setFixedFeeder(wxContext.OPENID, event.friendOpenid)

      case 'clearFixedFeeder':
        return await clearFixedFeeder(wxContext.OPENID)
      
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

// 获取好友列表
async function getFriendList(openid) {
  try {
    const [currentUser, config] = await Promise.all([
      getUserByOpenid(openid),
      getFamilyConfig()
    ])
    const canViewAdminIdentity = openid === (config.adminOpenid || PRIMARY_ADMIN_OPENID)
    const fixedFeederOpenid = currentUser.fixedFeederOpenid || ''
    const result = await db.collection('friends').where({
      $or: [
        { userOpenid: openid },
        { friendOpenid: openid }
      ],
      status: 'accepted'
    }).get()

    const friends = []
    for (let item of result.data) {
      const friendOpenid = item.userOpenid === openid ? item.friendOpenid : item.userOpenid
      
      // 获取好友用户信息
      const userResult = await db.collection('users').where({
        openid: friendOpenid
      }).get()
      
      if (userResult.data.length > 0) {
        const user = userResult.data[0]
        const baseRole = user.role === 'admin' ? 'chef' : (user.role || 'consumer')
        const isAdmin = Boolean(user.isAdmin || user.role === 'admin')
        const canFeed = baseRole === 'chef'
        const isFixedFeeder = fixedFeederOpenid === friendOpenid
        const [recipeCountResult, wishCountResult, favoriteCountResult] = await Promise.all([
          db.collection('recipes').where({
            creatorId: friendOpenid,
            status: 'published'
          }).count(),
          baseRole === 'consumer'
            ? db.collection('wishes').where({
              creatorId: friendOpenid,
              assigneeId: openid
            }).count()
            : Promise.resolve({ total: 0 }),
          baseRole === 'consumer'
            ? db.collection('favorites').where({ userId: friendOpenid }).count()
            : Promise.resolve({ total: 0 })
        ])
        friends.push({
          id: friendOpenid,
          openid: friendOpenid,
          nickname: getRemarkForUser(item, openid) || user.nickname || '未知用户',
          originalNickname: user.nickname || '未知用户',
          remark: getRemarkForUser(item, openid),
          avatar: user.avatar || '/images/default-avatar.png',
          searchCode: user.searchCode || '',
          role: baseRole,
          isAdmin: canViewAdminIdentity && isAdmin,
          canFeed,
          isFixedFeeder,
          identityType: isFixedFeeder ? 'fixed' : (canFeed ? 'feeder' : 'diner'),
          identityLabel: `${isFixedFeeder ? '固定投喂官' : (canFeed ? '投喂官' : '点菜人')}${canViewAdminIdentity && isAdmin ? ' · 管理员' : ''}`,
          recipeCount: recipeCountResult.total || 0,
          wishCount: wishCountResult.total || 0,
          favoriteCount: favoriteCountResult.total || 0,
          lastActiveText: formatLastActive(user.updateTime || user.lastActiveAt),
          addTime: item.createTime
        })
      }
    }

    return {
      success: true,
      data: friends
    }
  } catch (error) {
    console.error('获取好友列表失败:', error)
    return {
      success: false,
      message: '获取好友列表失败',
      data: []
    }
  }
}

// 删除好友
async function deleteFriend(userOpenid, friendOpenid) {
  if (!friendOpenid || friendOpenid === userOpenid) {
    return { success: false, message: '请选择要解除绑定的饭搭子' }
  }

  await db.collection('friends').where({
    $or: [
      { userOpenid, friendOpenid },
      { userOpenid: friendOpenid, friendOpenid: userOpenid }
    ]
  }).remove()

  const [user, friend] = await Promise.all([
    getUserByOpenid(userOpenid),
    getUserByOpenid(friendOpenid)
  ])
  const updates = []
  if (user.fixedFeederOpenid === friendOpenid) {
    updates.push(db.collection('users').doc(user._id).update({
      data: { fixedFeederOpenid: '', updateTime: new Date() }
    }))
  }
  if (friend.fixedFeederOpenid === userOpenid) {
    updates.push(db.collection('users').doc(friend._id).update({
      data: { fixedFeederOpenid: '', updateTime: new Date() }
    }))
  }
  await Promise.all(updates)
  const cleanup = await cleanupRelationData(userOpenid, friendOpenid)

  return {
    success: true,
    message: '已解除绑定',
    data: cleanup
  }
}

async function cleanupRelationData(userOpenid, friendOpenid) {
  const [userOrders, friendOrders, userWishes, friendWishes, cartResult, userBlessings, friendBlessings, userNotifications, friendNotifications] = await Promise.all([
    getAllRelationRecords('orders', { creatorId: userOpenid }),
    getAllRelationRecords('orders', { creatorId: friendOpenid }),
    getAllRelationRecords('wishes', { creatorId: userOpenid }),
    getAllRelationRecords('wishes', { creatorId: friendOpenid }),
    db.collection('carts').where({ userId: _.in([userOpenid, friendOpenid]) }).limit(2).get(),
    getAllRelationRecords('blessings', { senderId: userOpenid }),
    getAllRelationRecords('blessings', { senderId: friendOpenid }),
    getAllRelationRecords('notifications', { recipientId: userOpenid }),
    getAllRelationRecords('notifications', { recipientId: friendOpenid })
  ])
  const orders = userOrders.concat(friendOrders).filter(order => (
    ((order.creatorId === userOpenid && order.assigneeId === friendOpenid) ||
      (order.creatorId === friendOpenid && order.assigneeId === userOpenid)) &&
    ['pending', 'processing'].includes(order.status)
  ))
  const wishes = userWishes.concat(friendWishes).filter(wish => (
    ((wish.creatorId === userOpenid && wish.assigneeId === friendOpenid) ||
      (wish.creatorId === friendOpenid && wish.assigneeId === userOpenid)) &&
    ['pending', 'accepted', 'in_cart', 'ordered'].includes(wish.status)
  ))
  const scheduledBlessings = userBlessings.concat(friendBlessings).filter(item => (
    ((item.senderId === userOpenid && item.recipientId === friendOpenid) ||
      (item.senderId === friendOpenid && item.recipientId === userOpenid)) &&
    item.status === 'scheduled'
  ))
  const unreadNotifications = userNotifications.concat(friendNotifications).filter(item => (
    ((item.senderId === userOpenid && item.recipientId === friendOpenid) ||
      (item.senderId === friendOpenid && item.recipientId === userOpenid)) &&
    item.read === false
  ))
  const now = new Date()

  for (const order of orders) {
    await db.collection('orders').doc(order._id).update({
      data: {
        status: 'cancelled',
        cancelTime: now,
        updateTime: now,
        updatedAt: now,
        cancelledByUnbind: true
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
        cancelledByUnbind: true
      }
    })
  }

  for (const cart of cartResult.data || []) {
    const blockedAuthorId = cart.userId === userOpenid ? friendOpenid : userOpenid
    const cartItems = (cart.cartItems || []).filter(item => item.authorId !== blockedAuthorId)
    if (cartItems.length !== (cart.cartItems || []).length) {
      await db.collection('carts').doc(cart._id).update({ data: { cartItems, updatedAt: now } })
    }
  }

  await Promise.all([
    ...scheduledBlessings.map(item => db.collection('blessings').doc(item._id).update({
      data: { status: 'cancelled', cancelledAt: now, updatedAt: now, failReason: '饭搭子关系已解除' }
    })),
    ...unreadNotifications.map(item => db.collection('notifications').doc(item._id).update({
      data: { read: true, readAt: now }
    }))
  ])

  return {
    cancelledOrders: orders.length,
    cancelledWishes: wishes.length
  }
}

async function getAllRelationRecords(collection, condition) {
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

async function cleanupPreviousFeederData(dinerOpenid, feederOpenid) {
  if (!dinerOpenid || !feederOpenid) return { cancelledOrders: 0, cancelledWishes: 0 }
  const [allOrders, allWishes, cartResult] = await Promise.all([
    getAllRelationRecords('orders', { creatorId: dinerOpenid }),
    getAllRelationRecords('wishes', { creatorId: dinerOpenid }),
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

// 获取好友请求列表
async function getFriendRequests(openid) {
  try {
    // 获取待处理的请求
    const pendingResult = await db.collection('friend_requests').where({
      targetOpenid: openid,
      status: 'pending'
    }).orderBy('createTime', 'desc').get()

    // 获取已发送的申请历史。接受、拒绝、取消的记录均保留，直到发送人主动删除。
    const sentResult = await db.collection('friend_requests').where({
      fromOpenid: openid
    }).orderBy('createTime', 'desc').limit(100).get()
    const receivedHistoryResult = await db.collection('friend_requests').where({
      targetOpenid: openid
    }).limit(100).get()

    const pendingRequests = []
    const sentRequests = []
    const receivedHistoryRequests = []

    // 处理待处理请求
    for (let item of pendingResult.data) {
      const userResult = await db.collection('users').where({
        openid: item.fromOpenid
      }).get()
      
      if (userResult.data.length > 0) {
        const user = userResult.data[0]
        await createFriendRequestNotification({
          requestId: item._id,
          fromOpenid: item.fromOpenid,
          targetOpenid: openid,
          senderName: user.nickname || '一位饭搭子',
          message: item.message
        }).catch(() => {})
        pendingRequests.push({
          id: item._id,
          fromOpenid: item.fromOpenid,
          nickname: user.nickname || '未知用户',
          avatar: user.avatar || '/images/default-avatar.png',
          message: item.message || '',
          time: formatTime(item.createTime)
        })
      }
    }

    // 处理已发送请求
    for (let item of sentResult.data) {
      if (item.senderDeletedAt) continue
      const userResult = await db.collection('users').where({
        openid: item.targetOpenid
      }).get()
      const user = userResult.data[0] || {}
      const statusMeta = getSentRequestStatusMeta(item.status)
      sentRequests.push({
        id: item._id,
        targetOpenid: item.targetOpenid,
        nickname: user.nickname || '未知用户',
        avatar: user.avatar || '/images/default-avatar.png',
        time: formatTime(item.createTime),
        status: statusMeta.label,
        description: statusMeta.description,
        statusClass: statusMeta.className,
        canCancel: item.status === 'pending'
      })
    }

    const receivedHistoryItems = receivedHistoryResult.data
      .filter(item => item.status !== 'pending' && !item.receiverDeletedAt)
      .sort((a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime())
    for (let item of receivedHistoryItems) {
      const userResult = await db.collection('users').where({ openid: item.fromOpenid }).get()
      const user = userResult.data[0] || {}
      const statusMeta = getReceivedRequestStatusMeta(item.status)
      receivedHistoryRequests.push({
        id: item._id,
        fromOpenid: item.fromOpenid,
        nickname: user.nickname || '未知用户',
        avatar: user.avatar || '/images/default-avatar.png',
        time: formatTime(item.createTime),
        status: statusMeta.label,
        description: statusMeta.description,
        statusClass: statusMeta.className
      })
    }

    return {
      success: true,
      data: {
        pendingRequests,
        sentRequests,
        receivedHistoryRequests
      }
    }
  } catch (error) {
    console.error('获取好友请求失败:', error)
    return {
      success: false,
      message: '获取好友请求失败',
      data: {
        pendingRequests: [],
        sentRequests: [],
        receivedHistoryRequests: []
      }
    }
  }
}

// 格式化时间
function formatTime(date) {
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString()
}

// 发送好友请求
async function sendFriendRequest(fromOpenid, targetOpenid, message = '') {
  if (fromOpenid === targetOpenid) {
    return {
      success: false,
      message: '不能向自己发送绑定申请'
    }
  }

  // 检查是否已经是好友
  const friendResult = await db.collection('friends').where({
    $or: [
      { userOpenid: fromOpenid, friendOpenid: targetOpenid },
      { userOpenid: targetOpenid, friendOpenid: fromOpenid }
    ]
  }).get()

  if (friendResult.data.length > 0) {
    return {
      success: false,
      message: '你们已经绑定'
    }
  }

  // 检查双方是否存在尚未处理的请求，避免交叉重复申请。
  const requestResult = await db.collection('friend_requests').where({
    $or: [
      { fromOpenid, targetOpenid },
      { fromOpenid: targetOpenid, targetOpenid: fromOpenid }
    ],
    status: 'pending'
  }).limit(1).get()

  if (requestResult.data.length > 0) {
    const pendingRequest = requestResult.data[0]
    return {
      success: false,
      message: pendingRequest.targetOpenid === fromOpenid
        ? '对方已经向你发送绑定申请，请先处理'
        : '已经发送过绑定申请，请等待对方处理'
    }
  }

  // 创建好友请求
  const requestAddResult = await db.collection('friend_requests').add({
    data: {
      fromOpenid,
      targetOpenid,
      message,
      status: 'pending',
      createTime: new Date()
    }
  })

  const requestId = requestAddResult._id
  const sender = await getUserByOpenid(fromOpenid)
  const senderName = sender.nickname || '一位饭搭子'
  const notificationResult = await createFriendRequestNotification({
    requestId,
    fromOpenid,
    targetOpenid,
    senderName,
    message
  }).then(() => ({ created: true })).catch(() => ({ created: false }))
  const wechatReminder = await sendFriendRequestSubscribeMessage({
    requestId,
    targetOpenid,
    senderName,
    message
  }).catch(error => ({
    sent: false,
    status: 'failed',
    message: formatSubscribeError(error)
  }))

  return {
    success: true,
    message: '绑定申请已发送',
    data: {
      requestId,
      notificationCreated: notificationResult.created,
      wechatReminder
    }
  }
}

function getSentRequestStatusMeta(status) {
  const metas = {
    pending: { label: '待确认', description: '等待对方确认', className: 'pending' },
    accepted: { label: '已接受', description: '已成为饭搭子', className: 'accepted' },
    rejected: { label: '已拒绝', description: '对方暂未接受本次绑定', className: 'rejected' },
    cancelled: { label: '已取消', description: '你已取消本次绑定', className: 'cancelled' }
  }
  return metas[status] || { label: '已结束', description: '本次申请已结束', className: 'ended' }
}

function getReceivedRequestStatusMeta(status) {
  const metas = {
    accepted: { label: '已接受', description: '你已接受本次绑定', className: 'accepted' },
    rejected: { label: '已拒绝', description: '你已拒绝本次绑定', className: 'rejected' },
    cancelled: { label: '已取消', description: '对方已取消本次绑定', className: 'cancelled' }
  }
  return metas[status] || { label: '已结束', description: '本次申请已结束', className: 'ended' }
}

// 处理好友请求
async function handleFriendRequest(openid, requestId, accept, remark = '') {
  // 获取请求信息
  const requestResult = await db.collection('friend_requests').doc(requestId).get()
  
  if (!requestResult.data || requestResult.data.targetOpenid !== openid) {
    return {
      success: false,
      message: '请求不存在或无权限'
    }
  }

  const request = requestResult.data
  if (request.status !== 'pending') {
    return {
      success: false,
      message: '该绑定申请已处理'
    }
  }

  if (accept) {
    const friendResult = await db.collection('friends').where({
      $or: [
        { userOpenid: request.fromOpenid, friendOpenid: request.targetOpenid },
        { userOpenid: request.targetOpenid, friendOpenid: request.fromOpenid }
      ]
    }).limit(1).get()

    if (friendResult.data.length === 0) {
      // 接受请求，创建好友关系。
      await db.collection('friends').add({
        data: {
          userOpenid: request.fromOpenid,
          friendOpenid: request.targetOpenid,
          userRemark: '',
          friendRemark: normalizeRemark(remark),
          status: 'accepted',
          createTime: new Date()
        }
      })
    }
  }

  // 更新请求状态
  await db.collection('friend_requests').doc(requestId).update({
    data: {
      status: accept ? 'accepted' : 'rejected',
      handleTime: new Date()
    }
  })

  await markFriendRequestNotificationRead(openid, requestId).catch(() => {})
  await notifyFriendRequestResult({
    request,
    handlerOpenid: openid,
    accepted: accept
  }).catch(() => {})

  return {
    success: true,
    message: accept ? '绑定成功' : '已拒绝绑定申请'
  }
}

async function notifyFriendRequestResult({ request, handlerOpenid, accepted }) {
  const handler = await getUserByOpenid(handlerOpenid)
  const handlerName = handler.nickname || '你的饭搭子'
  const title = accepted
    ? `${handlerName}已同意你的饭搭子申请`
    : `${handlerName}暂未接受你的饭搭子申请`
  const content = accepted
    ? '你们已成为饭搭子，快去看看吧'
    : '你可以稍后再发起新的绑定申请'
  const targetPage = accepted
    ? '/pages/friends/friends'
    : '/pages/friend-requests/friend-requests'

  await createFriendRequestResultNotification({
    requestId: request._id,
    senderId: handlerOpenid,
    recipientId: request.fromOpenid,
    title,
    content,
    targetPage
  }).catch(() => {})
  await sendFriendRequestSubscribeMessage({
    requestId: request._id,
    targetOpenid: request.fromOpenid,
    senderName: handlerName,
    message: accepted ? '已同意你的饭搭子申请' : '暂未接受你的饭搭子申请',
    page: targetPage.replace(/^\//, '')
  }).catch(() => {})
}

async function cancelFriendRequest(openid, requestId) {
  const result = await db.collection('friend_requests').doc(requestId).get()
  const request = result.data
  if (!request || request.fromOpenid !== openid) {
    return { success: false, message: '申请不存在或无权限取消' }
  }
  if (request.status !== 'pending') {
    return { success: false, message: '只有待确认的申请可以取消' }
  }

  await db.collection('friend_requests').doc(requestId).update({
    data: { status: 'cancelled', cancelTime: new Date() }
  })
  await markFriendRequestNotificationRead(request.targetOpenid, requestId).catch(() => {})
  return { success: true, message: '已取消绑定申请' }
}

async function deleteFriendRequestRecord(openid, requestId) {
  const result = await db.collection('friend_requests').doc(requestId).get()
  const request = result.data
  if (!request || request.fromOpenid !== openid) {
    return { success: false, message: '申请记录不存在或无权限删除' }
  }
  await db.collection('friend_requests').doc(requestId).update({
    data: { senderDeletedAt: new Date() }
  })
  return { success: true, message: '申请记录已删除' }
}

async function deleteReceivedFriendRequestRecord(openid, requestId) {
  const result = await db.collection('friend_requests').doc(requestId).get()
  const request = result.data
  if (!request || request.targetOpenid !== openid) {
    return { success: false, message: '申请记录不存在或无权限删除' }
  }
  if (request.status === 'pending') {
    return { success: false, message: '待处理申请请先接受或拒绝' }
  }
  await db.collection('friend_requests').doc(requestId).update({
    data: { receiverDeletedAt: new Date() }
  })
  return { success: true, message: '申请记录已删除' }
}

async function createFriendRequestNotification({ requestId, fromOpenid, targetOpenid, senderName, message }) {
  const existingResult = await db.collection('notifications').where({ targetId: requestId }).limit(5).get()
  const existing = existingResult.data.some(item => (
    item.type === 'friend_request' && item.recipientId === targetOpenid
  ))
  if (existing) return

  await db.collection('notifications').add({
    data: {
      type: 'friend_request',
      senderId: fromOpenid,
      recipientId: targetOpenid,
      title: `${senderName}向你发来饭搭子申请`,
      content: String(message || '想和你绑定成为饭搭子').slice(0, 36),
      targetPage: '/pages/friend-requests/friend-requests',
      targetId: requestId,
      read: false,
      createdAt: new Date()
    }
  })
}

async function createFriendRequestResultNotification({ requestId, senderId, recipientId, title, content, targetPage }) {
  const existingResult = await db.collection('notifications').where({ targetId: requestId }).limit(10).get()
  const existing = existingResult.data.some(item => (
    item.type === 'friend_request_result' && item.recipientId === recipientId
  ))
  if (existing) return

  await db.collection('notifications').add({
    data: {
      type: 'friend_request_result',
      senderId,
      recipientId,
      title,
      content,
      targetPage,
      targetId: requestId,
      read: false,
      createdAt: new Date()
    }
  })
}

async function markFriendRequestNotificationRead(openid, requestId) {
  const result = await db.collection('notifications').where({ targetId: requestId }).limit(5).get()
  const notification = result.data.find(item => (
    item.type === 'friend_request' && item.recipientId === openid && !item.read
  ))
  if (!notification) return
  await db.collection('notifications').doc(notification._id).update({
    data: {
      read: true,
      readAt: new Date()
    }
  })
}

async function sendFriendRequestSubscribeMessage({ requestId, targetOpenid, senderName, message, page = '' }) {
  const config = await getFamilyConfig()
  const template = config.subscribeTemplates && config.subscribeTemplates.friendRequest
  const templateId = template && (template.templateId || template.template_id)
  if (!templateId) {
    return { sent: false, status: 'skipped', message: '好友申请提醒模板尚未配置' }
  }

  const payload = {
    senderName: String(senderName || '一位饭搭子'),
    message: String(message || '想和你绑定成为饭搭子'),
    requestTime: formatChinaTime(new Date())
  }
  const data = {}
  Object.keys(template.fields || {}).forEach(key => {
    const value = formatTemplateValue(key, payload[template.fields[key]])
    if (value) data[key] = { value }
  })
  if (!Object.keys(data).length) {
    return { sent: false, status: 'skipped', message: '好友申请模板字段映射为空' }
  }

  const result = await cloud.openapi.subscribeMessage.send({
    touser: targetOpenid,
    page: `${page || template.page || 'pages/friend-requests/friend-requests'}?requestId=${requestId}`,
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
  return { sent: true, status: 'sent', message: '' }
}

function formatTemplateValue(key, value) {
  if (value === undefined || value === null) return ''
  const text = String(value).trim()
  if (!text) return ''
  if (/^time\d+$/i.test(key)) return text.slice(0, 20)
  if (/^(name|thing)\d+$/i.test(key)) return text.slice(0, 20)
  if (/^phrase\d+$/i.test(key)) return text.slice(0, 5)
  return text.slice(0, 20)
}

function formatChinaTime(value) {
  const date = new Date(value)
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatSubscribeError(error) {
  const code = Number(error && (error.errCode || error.errcode || error.code))
  const detail = String(error && (error.errMsg || error.errmsg || error.message) || '').trim()
  if (code === 43101) return '对方尚未允许该提醒，或订阅次数已经用完'
  if (code === 40037) return '好友申请订阅模板 ID 无效'
  if (code === 47003) return detail ? `好友申请模板参数不正确：${detail}` : '好友申请模板字段配置不正确'
  if (code === 41030) return '好友申请提醒的跳转页面不存在'
  return detail || '微信提醒发送失败'
}

function formatLastActive(value) {
  if (!value) return '最近活跃时间暂未记录'
  const time = new Date(value).getTime()
  if (!time) return '最近活跃时间暂未记录'
  const diff = Math.max(0, Date.now() - time)
  if (diff < 5 * 60 * 1000) return '最近活跃：刚刚'
  if (diff < 60 * 60 * 1000) return `最近活跃：${Math.floor(diff / 60000)}分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `最近活跃：${Math.floor(diff / 3600000)}小时前`
  return `最近活跃：${Math.floor(diff / 86400000)}天前`
}

async function updateRemark(openid, friendOpenid, remark) {
  const result = await db.collection('friends').where({
    $or: [
      { userOpenid: openid, friendOpenid },
      { userOpenid: friendOpenid, friendOpenid: openid }
    ],
    status: 'accepted'
  }).limit(1).get()
  const relationship = result.data[0]
  if (!relationship) return { success: false, message: '绑定关系不存在' }

  const field = relationship.userOpenid === openid ? 'userRemark' : 'friendRemark'
  await db.collection('friends').doc(relationship._id).update({
    data: {
      [field]: normalizeRemark(remark),
      updateTime: new Date()
    }
  })
  return { success: true, message: '备注已更新' }
}

function getRemarkForUser(relationship, openid) {
  return normalizeRemark(relationship.userOpenid === openid
    ? relationship.userRemark
    : relationship.friendRemark)
}

function normalizeRemark(remark) {
  return String(remark || '').trim().slice(0, 12)
}

async function setFixedFeeder(openid, friendOpenid) {
  if (!friendOpenid || friendOpenid === openid) {
    return { success: false, message: '请选择已绑定的投喂官' }
  }
  if (!(await areBound(openid, friendOpenid))) {
    return { success: false, message: '只能将已绑定的饭搭子设为固定投喂官' }
  }

  const [feeder, user] = await Promise.all([
    getUserByOpenid(friendOpenid),
    getUserByOpenid(openid)
  ])
  if (!['chef', 'admin'].includes(feeder.role)) {
    return { success: false, message: '该饭搭子当前不是投喂官' }
  }

  const previousFeederOpenid = user.fixedFeederOpenid || ''
  if (previousFeederOpenid === friendOpenid) {
    return { success: true, message: '已是当前固定投喂官' }
  }
  const cleanup = previousFeederOpenid
    ? await cleanupPreviousFeederData(openid, previousFeederOpenid)
    : { cancelledOrders: 0, cancelledWishes: 0 }
  await db.collection('users').doc(user._id).update({
    data: { fixedFeederOpenid: friendOpenid, updateTime: new Date() }
  })
  return {
    success: true,
    message: previousFeederOpenid ? '固定投喂官已更换' : '固定投喂官已设置',
    data: cleanup
  }
}

async function clearFixedFeeder(openid) {
  const user = await getUserByOpenid(openid)
  const previousFeederOpenid = user.fixedFeederOpenid || ''
  const cleanup = previousFeederOpenid
    ? await cleanupPreviousFeederData(openid, previousFeederOpenid)
    : { cancelledOrders: 0, cancelledWishes: 0 }
  await db.collection('users').doc(user._id).update({
    data: { fixedFeederOpenid: '', updateTime: new Date() }
  })
  return { success: true, message: '已取消固定投喂官', data: cleanup }
}

async function getUserByOpenid(openid) {
  const result = await db.collection('users').where({ openid }).limit(1).get()
  if (!result.data[0]) throw new Error('用户信息不存在，请重新登录')
  return result.data[0]
}

async function getFamilyConfig() {
  try {
    const result = await db.collection('app_config').doc('family').get()
    return result.data || {}
  } catch (error) {
    return {}
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
