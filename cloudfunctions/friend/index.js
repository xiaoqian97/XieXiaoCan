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

    // 获取已发送的请求
    const sentResult = await db.collection('friend_requests').where({
      fromOpenid: openid,
      status: 'pending'
    }).orderBy('createTime', 'desc').get()

    const pendingRequests = []
    const sentRequests = []

    // 处理待处理请求
    for (let item of pendingResult.data) {
      const userResult = await db.collection('users').where({
        openid: item.fromOpenid
      }).get()
      
      if (userResult.data.length > 0) {
        const user = userResult.data[0]
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
      const userResult = await db.collection('users').where({
        openid: item.targetOpenid
      }).get()
      
      if (userResult.data.length > 0) {
        const user = userResult.data[0]
        sentRequests.push({
          id: item._id,
          targetOpenid: item.targetOpenid,
          nickname: user.nickname || '未知用户',
          avatar: user.avatar || '/images/default-avatar.png',
          time: formatTime(item.createTime),
          status: '待确认'
        })
      }
    }

    return {
      success: true,
      data: {
        pendingRequests,
        sentRequests
      }
    }
  } catch (error) {
    console.error('获取好友请求失败:', error)
    return {
      success: false,
      message: '获取好友请求失败',
      data: {
        pendingRequests: [],
        sentRequests: []
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
  await db.collection('friend_requests').add({
    data: {
      fromOpenid,
      targetOpenid,
      message,
      status: 'pending',
      createTime: new Date()
    }
  })

  return {
    success: true,
    message: '绑定申请已发送'
  }
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

  return {
    success: true,
    message: accept ? '绑定成功' : '已拒绝绑定申请'
  }
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
