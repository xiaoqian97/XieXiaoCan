const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const FESTIVALS = {
  new_year: { name: '元旦', icon: '🎆', themeKey: 'new-year', title: '新年第一份祝福', content: '新的一年，也要继续和喜欢的人好好吃饭。' },
  valentine: { name: '情人节', icon: '💌', themeKey: 'valentine', title: '今天比昨天更喜欢你', content: '爱藏在每一顿饭里，也藏在每一次惦记里。' },
  spring_festival: { name: '春节', icon: '🏮', themeKey: 'spring', title: '新年快乐，万事有回应', content: '新的一年继续负责开心，也继续把彼此好好喂饱。' },
  labor_day: { name: '劳动节', icon: '☀️', themeKey: 'labor', title: '今天辛苦啦', content: '认真生活的人最可爱，今天也别忘了好好吃饭。' },
  children_day: { name: '儿童节', icon: '🎈', themeKey: 'children', title: '永远做彼此的小朋友', content: '愿你一直有糖吃、有饭香，也一直有人宠。' },
  qixi: { name: '七夕', icon: '🌌', themeKey: 'qixi', title: '鹊桥有约，饭桌也有约', content: '人间烟火里，最浪漫的是一直和你一起吃饭。' },
  mid_autumn: { name: '中秋节', icon: '🌕', themeKey: 'mid-autumn', title: '月亮圆，饭桌也要团圆', content: '愿每一次想念都有回应，每一顿饭都有陪伴。' },
  national_day: { name: '国庆节', icon: '✨', themeKey: 'national', title: '假期快乐，一起吃点好的', content: '把日子过得热气腾腾，把喜欢的人放在心上。' }
}

const LUNAR_DATES = {
  2026: { spring_festival: '02-17', qixi: '08-19', mid_autumn: '09-25' },
  2027: { spring_festival: '02-06', qixi: '08-08', mid_autumn: '09-15' },
  2028: { spring_festival: '01-26', qixi: '08-26', mid_autumn: '10-03' },
  2029: { spring_festival: '02-13', qixi: '08-16', mid_autumn: '09-22' },
  2030: { spring_festival: '02-03', qixi: '08-05', mid_autumn: '09-12' }
}

const FIXED_DATES = {
  '01-01': 'new_year',
  '02-14': 'valentine',
  '05-01': 'labor_day',
  '06-01': 'children_day',
  '10-01': 'national_day'
}

exports.main = async (event = {}, context) => {
  const openid = cloud.getWXContext().OPENID
  const action = event.action || ''

  try {
    if (!action) return await processDueBlessings()
    switch (action) {
      case 'create': return await createBlessing(openid, event)
      case 'list': return await listBlessings(openid, event.mode)
      case 'getUnopenedCount': return await getUnopenedBlessingCount(openid)
      case 'detail': return await getBlessingDetail(openid, event.id)
      case 'dismiss': return await dismissBlessing(openid, event.id)
      case 'cancel': return await cancelBlessing(openid, event.id)
      case 'ensureFestivalGreeting': return await ensureFestivalGreeting(openid)
      case 'processDue': return await processDueBlessings()
      case 'getAdminLogs':
        await requirePrimaryAdmin(openid)
        return await getAdminLogs(event)
      case 'getAdminLogDetail':
        await requirePrimaryAdmin(openid)
        return await getAdminLogDetail(event.id)
      default: return { success: false, message: '未知操作' }
    }
  } catch (error) {
    console.error('祝福操作失败:', error)
    return { success: false, message: error.message || '祝福暂时没有送达' }
  }
}

async function getUnopenedBlessingCount(openid) {
  const records = await getAllRecords('blessings', {
    recipientId: openid,
    status: 'sent'
  })
  return {
    success: true,
    data: {
      unopenedCount: records.filter(item => !item.readAt).length
    }
  }
}

async function getAdminLogs(event) {
  const category = event.category === 'friend' ? 'friend' : 'festival'
  const statusFilter = ['all', 'sent', 'opened', 'unopened', 'dismissed', 'failed', 'scheduled'].includes(event.status)
    ? event.status
    : 'all'
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = Math.min(30, Math.max(1, Number(event.pageSize) || 20))
  const type = category === 'festival' ? 'festival' : 'custom'
  const records = await getAllRecords('blessings', { type })
  const filtered = records.filter(item => matchesAdminStatus(item, statusFilter))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  const currentPage = filtered.slice((page - 1) * pageSize, page * pageSize)
  const userIds = [...new Set(currentPage.flatMap(item => [item.senderId, item.recipientId]).filter(id => id && id !== 'system'))]
  const users = await getUsers(userIds)
  const items = await attachAdminAvatarUrls(currentPage.map(item => formatAdminLogItem(item, users)))

  return {
    success: true,
    data: {
      category,
      status: statusFilter,
      summary: summarizeBlessings(records),
      items,
      total: filtered.length,
      page,
      hasMore: page * pageSize < filtered.length
    }
  }
}

async function getAdminLogDetail(id) {
  if (!id) throw new Error('祝福日志不存在')
  const item = await getRecord('blessings', id)
  if (!item) throw new Error('祝福日志不存在')
  const users = await getUsers([item.senderId, item.recipientId].filter(id => id && id !== 'system'))
  const [formattedItem] = await attachAdminAvatarUrls([formatAdminLogItem(item, users)])
  return {
    success: true,
    data: {
      ...formattedItem,
      content: item.content || '',
      contentHtml: item.contentHtml || '',
      wechatMessage: item.wechatMessage || '',
      failReason: item.failReason || ''
    }
  }
}

async function attachAdminAvatarUrls(items = []) {
  const fileIDs = [...new Set(items.flatMap(item => [item.senderAvatar, item.recipientAvatar])
    .filter(value => typeof value === 'string' && value.startsWith('cloud://')))]
  if (!fileIDs.length) {
    return items.map(item => ({
      ...item,
      displaySenderAvatar: item.senderAvatar,
      displayRecipientAvatar: item.recipientAvatar
    }))
  }
  try {
    const result = await cloud.getTempFileURL({ fileList: fileIDs })
    const urlMap = (result.fileList || []).reduce((map, file) => {
      if (file.fileID && file.tempFileURL) map[file.fileID] = file.tempFileURL
      return map
    }, {})
    return items.map(item => ({
      ...item,
      displaySenderAvatar: urlMap[item.senderAvatar] || item.senderAvatar,
      displayRecipientAvatar: urlMap[item.recipientAvatar] || item.recipientAvatar
    }))
  } catch (error) {
    console.error('祝福日志头像地址转换失败:', error)
    return items.map(item => ({
      ...item,
      displaySenderAvatar: item.senderAvatar,
      displayRecipientAvatar: item.recipientAvatar
    }))
  }
}

function summarizeBlessings(records) {
  return records.reduce((summary, item) => {
    summary.total += 1
    if (item.status === 'sent') summary.sent += 1
    if (item.status === 'failed') summary.failed += 1
    if (item.status === 'scheduled' || item.status === 'processing') summary.pending += 1
    if (item.status === 'sent' && item.readAt) summary.opened += 1
    if (item.status === 'sent' && item.dismissedAt && !item.readAt) summary.dismissed += 1
    if (item.status === 'sent' && !item.readAt && !item.dismissedAt) summary.unopened += 1
    if (item.wechatStatus === 'sent') summary.wechatSent += 1
    if (item.wechatStatus === 'failed') summary.wechatFailed += 1
    return summary
  }, { total: 0, sent: 0, failed: 0, pending: 0, opened: 0, dismissed: 0, unopened: 0, wechatSent: 0, wechatFailed: 0 })
}

function matchesAdminStatus(item, status) {
  if (status === 'all') return true
  if (status === 'opened') return item.status === 'sent' && Boolean(item.readAt)
  if (status === 'dismissed') return item.status === 'sent' && Boolean(item.dismissedAt) && !item.readAt
  if (status === 'unopened') return item.status === 'sent' && !item.readAt && !item.dismissedAt
  if (status === 'scheduled') return ['scheduled', 'processing'].includes(item.status)
  return item.status === status
}

function formatAdminLogItem(item, users) {
  const sender = item.senderId === 'system' ? { nickname: '谢小馋', avatar: '' } : (users[item.senderId] || {})
  const recipient = users[item.recipientId] || {}
  return {
    _id: item._id,
    type: item.type,
    festivalKey: item.festivalKey || '',
    title: item.title || '一份祝福',
    senderName: sender.nickname || item.senderName || '饭搭子',
    senderAvatar: sender.avatar || '/images/default-avatar.png',
    recipientName: recipient.nickname || '饭搭子',
    recipientAvatar: recipient.avatar || '/images/default-avatar.png',
    status: item.status || '',
    deliveryStatus: getAdminDeliveryStatus(item),
    sentAt: item.sentAt || null,
    readAt: item.readAt || null,
    dismissedAt: item.dismissedAt || null,
    wechatStatus: item.wechatStatus || 'skipped',
    createdAt: item.createdAt || null
  }
}

function getAdminDeliveryStatus(item) {
  if (item.status === 'sent' && item.readAt) return '已拆开'
  if (item.status === 'sent' && item.dismissedAt) return '已收起未拆'
  if (item.status === 'sent') return '未拆开'
  return { scheduled: '等待送达', processing: '正在送达', failed: '发送失败', cancelled: '已取消' }[item.status] || '状态未知'
}

async function createBlessing(openid, event) {
  const recipientId = String(event.recipientId || '')
  const title = String(event.title || '').trim().slice(0, 30)
  const content = String(event.content || '').trim().slice(0, 500)
  const contentHtml = sanitizeRichText(event.contentHtml, content)
  const themeKey = String(event.themeKey || 'missing-you').slice(0, 30)
  const sendMode = event.sendMode === 'scheduled' ? 'scheduled' : 'immediate'

  if (!recipientId || !title || !content) throw new Error('请补全接收人、标题和祝福内容')
  if (recipientId === openid) throw new Error('祝福要送给饭搭子哦')
  if (!await areFriends(openid, recipientId)) throw new Error('只能给已绑定的饭搭子发送祝福')
  await checkRateLimit(openid)
  await checkTextSecurity(openid, `${title} ${content}`)

  let sendAt = new Date()
  if (sendMode === 'scheduled') {
    sendAt = new Date(event.sendAt)
    if (Number.isNaN(sendAt.getTime()) || sendAt.getTime() < Date.now() + 60000) {
      throw new Error('定时发送时间至少要晚于现在 1 分钟')
    }
  }

  const sender = await getUser(openid)
  const record = {
    type: 'custom',
    senderId: openid,
    recipientId,
    senderName: sender.nickname || '饭搭子',
    templateKey: String(event.templateKey || 'custom').slice(0, 30),
    themeKey,
    title,
    content,
    contentHtml,
    sendMode,
    sendAt,
    status: sendMode === 'scheduled' ? 'scheduled' : 'processing',
    wechatStatus: 'pending',
    createdAt: new Date(),
    updatedAt: new Date()
  }
  const addResult = await db.collection('blessings').add({ data: record })
  const id = addResult._id

  if (sendMode === 'immediate') {
    await deliverBlessing({ ...record, _id: id })
    return { success: true, data: { id, status: 'sent' }, message: '祝福已经送出' }
  }
  return { success: true, data: { id, status: 'scheduled' }, message: '祝福会按时送达' }
}

async function listBlessings(openid, mode) {
  const condition = mode === 'sent' ? { senderId: openid } : { recipientId: openid, status: 'sent' }
  const result = await db.collection('blessings')
    .where(condition)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get()
  const userIds = [...new Set(result.data.flatMap(item => [item.senderId, item.recipientId]).filter(id => id && id !== 'system'))]
  const [users, config] = await Promise.all([
    getUsers(userIds),
    mode === 'sent' ? getFamilyConfig() : Promise.resolve({})
  ])
  const canSeeDismissedStatus = mode === 'sent' && openid === String(config.adminOpenid || '')
  return {
    success: true,
    data: result.data.map(item => ({
      ...item,
      canSeeDismissedStatus,
      senderName: item.senderId === 'system' ? '谢小馋' : (users[item.senderId] && users[item.senderId].nickname) || item.senderName || '饭搭子',
      recipientName: (users[item.recipientId] && users[item.recipientId].nickname) || '饭搭子'
    }))
  }
}

async function getBlessingDetail(openid, id) {
  if (!id) throw new Error('祝福不存在')
  const item = await getRecord('blessings', id)
  if (!item || (item.senderId !== openid && item.recipientId !== openid)) throw new Error('无权查看这份祝福')
  if (item.recipientId === openid && item.status !== 'sent') throw new Error('这份祝福还没到拆开的时间')
  if (item.recipientId === openid && !item.readAt) {
    const readAt = new Date()
    await db.collection('blessings').doc(id).update({ data: { readAt, updatedAt: readAt } })
    item.readAt = readAt
  }
  const [sender, recipient, config] = await Promise.all([
    item.senderId === 'system' ? Promise.resolve({ nickname: '谢小馋' }) : getUser(item.senderId),
    getUser(item.recipientId),
    item.senderId === openid ? getFamilyConfig() : Promise.resolve({})
  ])
  return {
    success: true,
    data: {
      ...item,
      canSeeDismissedStatus: item.senderId === openid && openid === String(config.adminOpenid || ''),
      senderName: sender.nickname || '饭搭子',
      recipientName: recipient.nickname || '饭搭子'
    }
  }
}

async function dismissBlessing(openid, id) {
  const item = await getRecord('blessings', id)
  if (!item || item.recipientId !== openid) throw new Error('无权收起这份祝福')
  if (item.status !== 'sent') throw new Error('这份祝福还没有送达')
  if (item.readAt || item.dismissedAt) return { success: true, message: item.readAt ? '祝福已经拆开' : '祝福已收起' }
  const dismissedAt = new Date()
  await db.collection('blessings').doc(id).update({ data: { dismissedAt, updatedAt: dismissedAt } })
  return { success: true, message: '祝福已收起' }
}

async function cancelBlessing(openid, id) {
  const item = await getRecord('blessings', id)
  if (!item || item.senderId !== openid) throw new Error('无权取消这份祝福')
  if (item.status !== 'scheduled') throw new Error('只有待发送的祝福可以取消')
  await db.collection('blessings').doc(id).update({ data: { status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() } })
  return { success: true, message: '已取消定时祝福' }
}

async function ensureFestivalGreeting(openid) {
  if (!openid) return { success: true, data: null }
  const today = getChinaDateParts()
  const config = await getFamilyConfig()
  const festivalKey = getFestivalKey(today.year, today.monthDay, config.festivalDates)
  if (!festivalKey) return { success: true, data: null }
  const festival = FESTIVALS[festivalKey]
  const id = `festival_${today.year}_${festivalKey}_${openid}`
  const existing = await getRecord('blessings', id)
  if (existing) {
    if (existing.status === 'processing') {
      await deliverBlessing({ ...existing, _id: id }, false)
    }
    return { success: true, data: { id, created: false } }
  }

  const record = {
    _id: id,
    type: 'festival',
    festivalKey,
    senderId: 'system',
    recipientId: openid,
    senderName: '谢小馋',
    themeKey: festival.themeKey,
    title: festival.title,
    content: festival.content,
    contentHtml: plainTextToHtml(festival.content),
    sendMode: 'immediate',
    sendAt: new Date(),
    status: 'processing',
    wechatStatus: 'skipped',
    createdAt: new Date(),
    updatedAt: new Date()
  }
  const { _id, ...recordData } = record
  try {
    await db.collection('blessings').doc(id).set({ data: recordData })
  } catch (error) {
    const duplicate = await getRecord('blessings', id)
    if (!duplicate) throw error
  }
  await deliverBlessing(record, false)
  return { success: true, data: { id, created: true, festivalKey } }
}

async function processDueBlessings() {
  const result = await db.collection('blessings').where({
    status: 'scheduled',
    sendAt: _.lte(new Date())
  }).orderBy('sendAt', 'asc').limit(100).get()

  let sent = 0
  for (const item of result.data) {
    const claim = await db.collection('blessings').where({ _id: item._id, status: 'scheduled' }).update({
      data: { status: 'processing', updatedAt: new Date() }
    })
    if (!claim.stats || !claim.stats.updated) continue
    try {
      if (!await areFriends(item.senderId, item.recipientId)) {
        await db.collection('blessings').doc(item._id).update({ data: { status: 'cancelled', failReason: '饭搭子关系已解除', updatedAt: new Date() } })
        continue
      }
      await deliverBlessing({ ...item, status: 'processing' })
      sent += 1
    } catch (error) {
      await db.collection('blessings').doc(item._id).update({
        data: { status: 'failed', failReason: String(error.message || '发送失败').slice(0, 100), updatedAt: new Date() }
      })
    }
  }
  return { success: true, data: { checked: result.data.length, sent } }
}

async function deliverBlessing(item, sendWechat = true) {
  const notificationType = item.type === 'festival' ? 'festival_blessing' : 'blessing'
  const duplicate = await db.collection('notifications').where({
    type: notificationType,
    recipientId: item.recipientId,
    targetId: item._id
  }).limit(1).get()
  if (!duplicate.data.length) {
    await db.collection('notifications').add({
      data: {
        type: notificationType,
        senderId: item.senderId,
        recipientId: item.recipientId,
        title: item.title,
        content: item.content,
        themeKey: item.themeKey,
        targetId: item._id,
        targetPage: `/pages/blessing-detail/blessing-detail?id=${item._id}`,
        read: false,
        createdAt: new Date()
      }
    })
  }

  let wechatStatus = sendWechat ? 'failed' : 'skipped'
  let wechatMessage = ''
  if (sendWechat) {
    try {
      const result = await sendWechatReminder(item)
      wechatStatus = result.sent ? 'sent' : 'skipped'
      wechatMessage = result.message || ''
    } catch (error) {
      wechatMessage = formatSubscribeError(error)
    }
  }
  await db.collection('blessings').doc(item._id).update({
    data: { status: 'sent', sentAt: new Date(), wechatStatus, wechatMessage, updatedAt: new Date() }
  })
}

async function sendWechatReminder(item) {
  const config = await getFamilyConfig()
  const template = config.subscribeTemplates && config.subscribeTemplates.blessingReceived
  const templateId = template && (template.templateId || template.template_id)
  if (!templateId) return { sent: false, message: '祝福提醒模板尚未配置' }
  const payload = {
    senderName: String(item.senderName || '饭搭子').slice(0, 20),
    subject: 'TA的祝福',
    title: String(item.title || '一份祝福').slice(0, 20),
    summary: String(item.title || '一份祝福').slice(0, 20),
    sendTime: formatChinaTime(item.sendAt || new Date())
  }
  const data = {}
  Object.keys(template.fields || {}).forEach(key => {
    const fieldName = template.fields[key]
    // 兼容旧配置：phrase5 之前映射 title，现在固定显示“TA的祝福”；
    // thing3 之前映射 summary，现在展示用户填写的祝福标题。
    const value = fieldName === 'title' && /^phrase\d+$/i.test(key)
      ? payload.subject
      : payload[fieldName]
    const formattedValue = formatTemplateValue(key, value, fieldName)
    if (formattedValue) data[key] = { value: formattedValue }
  })
  if (!Object.keys(data).length) return { sent: false, message: '祝福模板字段映射为空' }
  const result = await cloud.openapi.subscribeMessage.send({
    touser: item.recipientId,
    page: `pages/blessing-detail/blessing-detail?id=${item._id}`,
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

async function checkTextSecurity(openid, content) {
  try {
    const result = await cloud.openapi.security.msgSecCheck({ openid, scene: 2, version: 2, content })
    const suggest = result && result.result && result.result.suggest
    if (suggest && suggest !== 'pass') throw new Error('祝福内容未通过安全检查，请修改后再试')
  } catch (error) {
    const code = Number(error.errCode || error.errcode || error.code)
    if (code === 87014 || String(error.message || '').includes('未通过安全检查')) throw error
  }
}

async function checkRateLimit(openid) {
  const result = await db.collection('blessings').where({
    senderId: openid,
    createdAt: _.gte(new Date(Date.now() - 60000))
  }).count()
  if (result.total >= 5) throw new Error('发送得太快啦，稍后再试')
}

async function areFriends(a, b) {
  if (!a || !b) return false
  const result = await db.collection('friends').where({
    $or: [
      { userOpenid: a, friendOpenid: b },
      { userOpenid: b, friendOpenid: a }
    ],
    status: 'accepted'
  }).limit(1).get()
  return result.data.length > 0
}

function getFestivalKey(year, monthDay, configuredDates = {}) {
  if (FIXED_DATES[monthDay]) return FIXED_DATES[monthDay]
  const configuredYear = configuredDates[year] || configuredDates[String(year)] || {}
  const configuredKey = Object.keys(configuredYear).find(key => configuredYear[key] === monthDay)
  if (configuredKey && FESTIVALS[configuredKey]) return configuredKey
  const lunar = LUNAR_DATES[year] || {}
  return Object.keys(lunar).find(key => lunar[key] === monthDay) || ''
}

function getChinaDateParts() {
  const date = new Date(Date.now() + 8 * 3600000)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return { year, monthDay: `${month}-${day}` }
}

function formatChinaTime(value) {
  const date = new Date(new Date(value).getTime() + 8 * 3600000)
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日 ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

function formatTemplateValue(key, value, fieldName = '') {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^phrase\d+$/i.test(key)) {
    if (fieldName === 'title' && text.length > 5) return '暖心祝福'
    return text.slice(0, 5)
  }
  if (/^name\d+$/i.test(key)) return text.slice(0, 10)
  if (/^thing\d+$/i.test(key)) return text.slice(0, 20)
  return text
}

function sanitizeRichText(html, fallbackText = '') {
  const source = String(html || '').slice(0, 12000)
  if (!source.trim()) return plainTextToHtml(fallbackText)
  const withoutDangerousBlocks = source
    .replace(/<(script|style|iframe|object|embed|svg|math)[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|svg|math)[^>]*\/?\s*>/gi, '')
  const allowedTags = new Set(['p', 'div', 'span', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote'])
  const sanitized = withoutDangerousBlocks.replace(/<\s*(\/?)\s*([a-z0-9-]+)([^>]*)>/gi, (match, closing, rawTag, rawAttributes) => {
    const tag = rawTag.toLowerCase()
    if (!allowedTags.has(tag)) return ''
    if (closing) return tag === 'br' ? '' : `</${tag}>`
    if (tag === 'br') return '<br>'
    const styleMatch = String(rawAttributes || '').match(/\sstyle\s*=\s*(["'])(.*?)\1/i)
    const style = styleMatch ? sanitizeInlineStyle(styleMatch[2]) : ''
    return `<${tag}${style ? ` style="${style}"` : ''}>`
  })
  return sanitized.trim() || plainTextToHtml(fallbackText)
}

function sanitizeInlineStyle(styleText) {
  const allowed = new Set(['color', 'background-color', 'text-align', 'font-weight', 'font-style', 'text-decoration', 'font-size'])
  return String(styleText || '').split(';').map(rule => {
    const separator = rule.indexOf(':')
    if (separator < 1) return ''
    const property = rule.slice(0, separator).trim().toLowerCase()
    const value = rule.slice(separator + 1).trim()
    if (!allowed.has(property) || !/^[#(),.%\w\s-]+$/.test(value) || /url|expression/i.test(value)) return ''
    return `${property}:${value}`
  }).filter(Boolean).join(';')
}

function plainTextToHtml(value) {
  const escaped = String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  return `<p>${escaped.replace(/\r?\n/g, '<br>')}</p>`
}

function formatSubscribeError(error) {
  const code = Number(error && (error.errCode || error.errcode || error.code))
  const detail = String(error && (error.errMsg || error.errmsg || error.message) || '').trim()
  if (code === 43101) return '对方尚未允许祝福提醒，或一次订阅次数已经用完'
  if (code === 40037) return '祝福提醒模板 ID 无效'
  if (code === 47003) return detail ? `祝福模板参数不正确：${detail}` : '祝福模板字段或内容格式不正确'
  return (detail || '微信提醒发送失败').slice(0, 100)
}

async function getFamilyConfig() {
  try {
    const result = await db.collection('app_config').doc('family').get()
    return result.data || {}
  } catch (error) {
    return {}
  }
}

async function requirePrimaryAdmin(openid) {
  const config = await getFamilyConfig()
  if (!config.adminOpenid) throw new Error('主管理员尚未配置')
  if (openid !== config.adminOpenid) throw new Error('仅主管理员可以查看祝福日志')
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

async function getUser(openid) {
  if (!openid) return {}
  const result = await db.collection('users').where({ openid }).limit(1).get()
  return result.data[0] || {}
}

async function getUsers(openids) {
  const ids = [...new Set((openids || []).filter(Boolean))]
  if (!ids.length) return {}
  const batches = []
  for (let index = 0; index < ids.length; index += 100) batches.push(ids.slice(index, index + 100))
  const results = await Promise.all(batches.map(batch => (
    db.collection('users').where({ openid: _.in(batch) }).get()
  )))
  return results.flatMap(result => result.data || []).reduce((map, user) => {
    map[user.openid] = user
    return map
  }, {})
}

async function getRecord(collection, id) {
  try {
    const result = await db.collection(collection).doc(id).get()
    return result.data || null
  } catch (error) {
    return null
  }
}
