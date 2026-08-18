const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const PRIMARY_ADMIN_OPENID = 'oyWDkxVwYIHb3adMU4PpCl9rWUqI'
const MAX_SESSION_SECONDS = 12 * 60 * 60
const EVENT_LABELS = {
  recipe_list_view: '浏览菜谱',
  recipe_detail_view: '查看菜谱详情',
  recipe_create: '添加菜谱',
  recipe_update: '编辑菜谱',
  recipe_search: '搜索菜谱',
  cart_view: '查看饭篮',
  cart_update: '调整饭篮',
  order_list_view: '查看投喂单',
  order_submit: '提交投喂单',
  order_status_update: '处理投喂单',
  order_rate: '评价投喂单',
  wish_view: '查看饭愿',
  wish_create: '许下饭愿',
  wish_process: '处理饭愿',
  favorite_view: '查看收藏',
  favorite_toggle: '收藏菜谱',
  blessing_view: '查看祝福',
  blessing_create: '发送祝福',
  friend_view: '查看饭搭子',
  friend_request: '添加饭搭子',
  fixed_feeder_change: '更换固定投喂官',
  feedback_submit: '提交反馈',
  notification_view: '查看消息'
}

exports.main = async event => {
  const openid = cloud.getWXContext().OPENID
  if (!openid) return { success: false, message: '请先登录' }

  try {
    switch (event.action) {
      case 'startSession':
        return await startSession(openid, event)
      case 'updateSession':
        return await updateSession(openid, event)
      case 'trackEvent':
        return await trackEvent(openid, event)
      case 'getDashboard':
        await requirePrimaryAdmin(openid)
        return await getDashboard(event)
      case 'getChefRecipes':
        await requirePrimaryAdmin(openid)
        return await getChefRecipes()
      default:
        return { success: false, message: '未知埋点操作' }
    }
  } catch (error) {
    return { success: false, message: error.message || '埋点操作失败' }
  }
}

async function startSession(openid, event) {
  const sessionId = normalizeId(event.sessionId)
  if (!sessionId) throw new Error('会话标识无效')
  const now = new Date()
  const dateKey = formatDateKey(now)
  let existed = false
  try {
    const result = await db.collection('analytics_sessions').doc(sessionId).get()
    existed = Boolean(result.data && result.data.userId === openid)
  } catch (error) {
    existed = false
  }

  if (!existed) {
    await db.collection('analytics_sessions').doc(sessionId).set({
      data: {
        userId: openid,
        dateKey,
        startedAt: now,
        lastActiveAt: now,
        endedAt: null,
        durationSeconds: 0,
        status: 'active',
        appVersion: String(event.appVersion || '').slice(0, 30),
        envVersion: String(event.envVersion || '').slice(0, 20)
      }
    })
    await updateDailyStat(openid, dateKey, stat => {
      stat.sessionCount += 1
      stat.lastVisitAt = now
    })
  }
  return { success: true, data: { sessionId } }
}

async function updateSession(openid, event) {
  const sessionId = normalizeId(event.sessionId)
  if (!sessionId) return { success: true }
  let session
  try {
    session = (await db.collection('analytics_sessions').doc(sessionId).get()).data
  } catch (error) {
    return { success: true }
  }
  if (!session || session.userId !== openid) throw new Error('无权更新该会话')

  const now = new Date()
  const nextDuration = Math.min(MAX_SESSION_SECONDS, Math.max(0, Number(event.durationSeconds) || 0))
  const previousDuration = Math.max(0, Number(session.durationSeconds) || 0)
  const delta = Math.max(0, nextDuration - previousDuration)
  await db.collection('analytics_sessions').doc(sessionId).update({
    data: {
      durationSeconds: nextDuration,
      lastActiveAt: now,
      endedAt: event.ended ? now : null,
      status: event.ended ? 'ended' : 'active'
    }
  })
  if (delta > 0) {
    await updateDailyStat(openid, session.dateKey || formatDateKey(now), stat => {
      stat.durationSeconds += delta
      stat.lastVisitAt = now
    })
  }
  return { success: true }
}

async function trackEvent(openid, event) {
  const eventName = String(event.eventName || '')
  if (!EVENT_LABELS[eventName]) throw new Error('埋点事件无效')
  const now = new Date()
  const dateKey = formatDateKey(now)
  const metadata = sanitizeMetadata(event.metadata)
  await db.collection('analytics_events').add({
    data: {
      userId: openid,
      eventName,
      dateKey,
      metadata,
      createdAt: now
    }
  })
  await updateDailyStat(openid, dateKey, stat => {
    stat.eventCounts[eventName] = (stat.eventCounts[eventName] || 0) + 1
    stat.lastActiveAt = now
  })
  return { success: true }
}

async function updateDailyStat(openid, dateKey, mutate) {
  const id = `${dateKey}_${openid}`
  await db.runTransaction(async transaction => {
    let current = null
    try {
      current = (await transaction.collection('analytics_daily_stats').doc(id).get()).data
    } catch (error) {
      current = null
    }
    const stat = {
      userId: openid,
      dateKey,
      sessionCount: Number(current && current.sessionCount) || 0,
      durationSeconds: Number(current && current.durationSeconds) || 0,
      eventCounts: { ...((current && current.eventCounts) || {}) },
      lastVisitAt: current && current.lastVisitAt ? current.lastVisitAt : null,
      lastActiveAt: current && current.lastActiveAt ? current.lastActiveAt : null,
      updatedAt: new Date()
    }
    mutate(stat)
    await transaction.collection('analytics_daily_stats').doc(id).set({ data: stat })
  })
}

async function getDashboard(event) {
  const range = [0, 7, 30, 90].includes(Number(event.days)) ? Number(event.days) : 30
  const startDate = new Date()
  startDate.setHours(0, 0, 0, 0)
  startDate.setDate(startDate.getDate() - range + 1)
  const startKey = range ? formatDateKey(startDate) : ''
  const [stats, users] = await Promise.all([
    getAllRecords('analytics_daily_stats', startKey ? { dateKey: _.gte(startKey) } : {}),
    getAllRecords('users', {})
  ])
  const userMap = new Map(users.map(user => [user.openid, user]))
  const userStatsMap = new Map()
  const featureCounts = {}
  const trendMap = {}

  stats.forEach(item => {
    const summary = userStatsMap.get(item.userId) || {
      userId: item.userId,
      sessionCount: 0,
      durationSeconds: 0,
      activeDays: 0,
      lastVisitAt: null,
      eventCounts: {}
    }
    summary.sessionCount += Number(item.sessionCount) || 0
    summary.durationSeconds += Number(item.durationSeconds) || 0
    summary.activeDays += 1
    if (item.lastVisitAt && (!summary.lastVisitAt || new Date(item.lastVisitAt) > new Date(summary.lastVisitAt))) {
      summary.lastVisitAt = item.lastVisitAt
    }
    Object.entries(item.eventCounts || {}).forEach(([name, count]) => {
      const value = Number(count) || 0
      summary.eventCounts[name] = (summary.eventCounts[name] || 0) + value
      featureCounts[name] = (featureCounts[name] || 0) + value
    })
    userStatsMap.set(item.userId, summary)

    const trend = trendMap[item.dateKey] || { date: item.dateKey, users: 0, sessions: 0, durationSeconds: 0 }
    trend.users += 1
    trend.sessions += Number(item.sessionCount) || 0
    trend.durationSeconds += Number(item.durationSeconds) || 0
    trendMap[item.dateKey] = trend
  })

  const userStats = [...userStatsMap.values()].map(item => {
    const user = userMap.get(item.userId) || {}
    const topFeatures = Object.entries(item.eventCounts).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([name, count]) => ({ name, label: EVENT_LABELS[name] || name, count }))
    return {
      userId: item.userId,
      nickname: user.nickname || '未命名用户',
      avatar: user.avatar || '/images/default-avatar.png',
      roleLabel: ['chef', 'admin'].includes(user.role) ? '投喂官' : '点菜人',
      sessionCount: item.sessionCount,
      durationSeconds: item.durationSeconds,
      averageSeconds: item.sessionCount ? Math.round(item.durationSeconds / item.sessionCount) : 0,
      activeDays: item.activeDays,
      lastVisitAt: item.lastVisitAt,
      topFeatures
    }
  }).sort((a, b) => b.durationSeconds - a.durationSeconds)

  const features = Object.entries(featureCounts).map(([name, count]) => ({
    name,
    label: EVENT_LABELS[name] || name,
    count
  })).sort((a, b) => b.count - a.count)
  const totalSessions = userStats.reduce((sum, item) => sum + item.sessionCount, 0)
  const totalDurationSeconds = userStats.reduce((sum, item) => sum + item.durationSeconds, 0)

  return {
    success: true,
    data: {
      range,
      overview: {
        activeUsers: userStats.length,
        totalSessions,
        totalDurationSeconds,
        averageSeconds: totalSessions ? Math.round(totalDurationSeconds / totalSessions) : 0
      },
      users: userStats,
      features,
      trend: Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date))
    }
  }
}

async function getChefRecipes() {
  const [users, recipes, favorites, orders] = await Promise.all([
    getAllRecords('users', { role: _.in(['chef', 'admin']) }),
    getAllRecords('recipes', {}),
    getAllRecords('favorites', {}),
    getAllRecords('orders', {})
  ])
  const favoriteMap = favorites.reduce((map, item) => {
    if (item.recipeId) map[item.recipeId] = (map[item.recipeId] || 0) + 1
    return map
  }, {})
  const salesMap = orders.reduce((map, order) => {
    if (order.status === 'cancelled') return map
    ;(order.recipes || []).forEach(item => {
      if (item && item.recipeId) map[item.recipeId] = (map[item.recipeId] || 0) + 1
    })
    return map
  }, {})
  const chefMap = new Map(users.map(user => [user.openid, {
    openid: user.openid,
    nickname: user.nickname || '未命名投喂官',
    avatar: user.avatar || '/images/default-avatar.png',
    publishedCount: 0,
    draftCount: 0,
    viewCount: 0,
    favoriteCount: 0,
    salesCount: 0,
    ratingTotal: 0,
    ratingCount: 0,
    latestRecipeAt: null,
    recipes: []
  }]))

  recipes.forEach(recipe => {
    const chef = chefMap.get(recipe.creatorId)
    if (!chef) return
    const ratingCount = Number(recipe.ratingCount) || 0
    const ratingTotal = Number(recipe.ratingTotal) || 0
    const item = {
      _id: recipe._id,
      name: recipe.name || '未命名菜谱',
      image: (recipe.images && recipe.images[0]) || '/images/default-recipe.jpg',
      status: recipe.status || 'draft',
      statusLabel: recipe.status === 'published' ? '已发布' : '草稿',
      viewCount: Number(recipe.viewCount) || 0,
      favoriteCount: favoriteMap[recipe._id] || 0,
      salesCount: salesMap[recipe._id] || 0,
      ratingAverage: ratingCount ? (ratingTotal / ratingCount).toFixed(1) : '',
      createdAt: recipe.createdAt || null
    }
    chef.recipes.push(item)
    if (recipe.status === 'published') chef.publishedCount += 1
    else chef.draftCount += 1
    chef.viewCount += item.viewCount
    chef.favoriteCount += item.favoriteCount
    chef.salesCount += item.salesCount
    chef.ratingTotal += ratingTotal
    chef.ratingCount += ratingCount
    if (recipe.createdAt && (!chef.latestRecipeAt || new Date(recipe.createdAt) > new Date(chef.latestRecipeAt))) {
      chef.latestRecipeAt = recipe.createdAt
    }
  })

  const chefs = [...chefMap.values()].map(chef => ({
    ...chef,
    ratingAverage: chef.ratingCount ? (chef.ratingTotal / chef.ratingCount).toFixed(1) : '',
    recipes: chef.recipes.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  })).sort((a, b) => (b.publishedCount + b.draftCount) - (a.publishedCount + a.draftCount))
  return { success: true, data: { chefs } }
}

async function requirePrimaryAdmin(openid) {
  let primaryAdminOpenid = PRIMARY_ADMIN_OPENID
  try {
    const config = await db.collection('app_config').doc('family').get()
    primaryAdminOpenid = (config.data && config.data.adminOpenid) || PRIMARY_ADMIN_OPENID
  } catch (error) {}
  if (openid !== primaryAdminOpenid) throw new Error('仅主管理员可以查看埋点数据')
}

async function getAllRecords(collection, condition) {
  const records = []
  let skip = 0
  while (true) {
    const result = await db.collection(collection).where(condition || {}).skip(skip).limit(100).get()
    const page = result.data || []
    records.push(...page)
    if (page.length < 100) return records
    skip += 100
  }
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
  const result = {}
  Object.entries(metadata).slice(0, 8).forEach(([key, value]) => {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/.test(key)) return
    if (['string', 'number', 'boolean'].includes(typeof value)) result[key] = String(value).slice(0, 100)
  })
  return result
}

function normalizeId(value) {
  const id = String(value || '')
  return /^[a-zA-Z0-9_-]{8,80}$/.test(id) ? id : ''
}

function formatDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
