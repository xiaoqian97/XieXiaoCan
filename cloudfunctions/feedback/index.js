const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const PRIMARY_ADMIN_OPENID = 'oyWDkxVwYIHb3adMU4PpCl9rWUqI'

exports.main = async event => {
  const openid = cloud.getWXContext().OPENID
  try {
    switch (event.action) {
      case 'submit':
        return await submitFeedback(openid, event)
      case 'list':
        return await listFeedbacks(openid, event)
      case 'getPendingCount':
        return await getPendingCount(openid)
      case 'process':
        return await processFeedback(openid, event.feedbackId)
      default:
        return { success: false, message: '未知反馈操作' }
    }
  } catch (error) {
    return { success: false, message: error.message || '反馈操作失败' }
  }
}

async function submitFeedback(openid, event) {
  const user = await getUser(openid)
  const type = ['feedback', 'suggestion'].includes(event.type) ? event.type : ''
  const description = String(event.description || '').trim()
  const images = Array.isArray(event.images) ? event.images.filter(isCloudFile).slice(0, 3) : []

  if (!type) throw new Error('请选择反馈类型')
  if (!description) throw new Error('请填写问题或建议描述')
  if (description.length > 500) throw new Error('描述不能超过500字')

  try {
    await checkTextSecurity(openid, description)
    await validateFeedbackImages(images, openid)
  } catch (error) {
    // 图片在提交前已经上传到云存储，审核失败时及时清理，避免留下不可用文件。
    if (images.length) await cloud.deleteFile({ fileList: images }).catch(() => {})
    throw error
  }

  const result = await db.collection('feedbacks').add({
    data: {
      creatorId: openid,
      creatorName: user.nickname || '未命名用户',
      type,
      description,
      images,
      status: 'submitted',
      createdAt: new Date()
    }
  })
  return { success: true, data: { feedbackId: result._id } }
}

async function checkTextSecurity(openid, content) {
  const result = await cloud.openapi.security.msgSecCheck({
    openid,
    scene: 2,
    version: 2,
    content
  })
  const suggest = result && result.result && result.result.suggest
  if (suggest && suggest !== 'pass') throw new Error('内容未通过安全检测，请修改后再提交')
}

async function validateFeedbackImages(images, openid) {
  for (const fileID of images) {
    const file = await cloud.downloadFile({ fileID })
    const contentType = detectImageContentType(file.fileContent)
    if (!contentType) throw new Error('图片格式暂不支持，请使用 JPG 或 PNG 图片')

    const result = await cloud.openapi.security.imgSecCheck({
      media: { contentType, value: file.fileContent },
      version: 2,
      scene: 2,
      openid
    })
    const suggest = result && result.result && result.result.suggest
    if (suggest && suggest !== 'pass') throw new Error('图片内容未通过安全检测，请更换后再提交')
  }
}

function detectImageContentType(buffer) {
  if (!buffer || buffer.length < 12) return ''
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg'
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
    buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A
  ) return 'image/png'
  return ''
}

async function listFeedbacks(openid, event) {
  await requireAdmin(openid)
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = Math.min(30, Math.max(1, Number(event.pageSize) || 20))
  const type = ['feedback', 'suggestion'].includes(event.type) ? event.type : ''
  const query = db.collection('feedbacks').where(type ? { type } : {})
  const [countResult, pendingTotal, listResult] = await Promise.all([
    query.count(),
    countPendingFeedbacks(),
    query.orderBy('createdAt', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
  ])
  const creatorIds = [...new Set((listResult.data || []).map(item => item.creatorId).filter(Boolean))]
  const users = await getUsersByOpenids(creatorIds)
  const userMap = new Map(users.map(user => [user.openid, user]))
  const items = (listResult.data || []).map(item => {
    const user = userMap.get(item.creatorId) || {}
    return {
      _id: item._id,
      creatorId: item.creatorId,
      creatorName: user.nickname || item.creatorName || '未命名用户',
      creatorAvatar: user.avatar || '/images/default-avatar.png',
      type: item.type,
      typeLabel: item.type === 'suggestion' ? '建议' : '反馈',
      description: item.description || '',
      images: item.images || [],
      status: item.status || 'submitted',
      processedAt: item.processedAt || null,
      createdAt: item.createdAt || null
    }
  })
  return {
    success: true,
    data: {
      items,
      total: countResult.total || 0,
      pendingTotal,
      page,
      hasMore: page * pageSize < (countResult.total || 0)
    }
  }
}

async function getPendingCount(openid) {
  const admin = await requireAdmin(openid)
  return {
    success: true,
    data: {
      isPrimaryAdmin: admin.isPrimaryAdmin,
      pendingTotal: admin.isPrimaryAdmin ? await countPendingFeedbacks() : 0
    }
  }
}

async function processFeedback(openid, feedbackId) {
  await requireAdmin(openid)
  if (!feedbackId) throw new Error('反馈记录不存在')
  const processedAt = new Date()
  await db.collection('feedbacks').doc(feedbackId).update({
    data: { status: 'processed', processedAt, processedBy: openid }
  })
  return { success: true, data: { processedAt }, message: '已标记为处理完成' }
}

async function requireAdmin(openid) {
  const [user, config] = await Promise.all([getUser(openid), getFamilyConfig()])
  const primaryAdminOpenid = config.adminOpenid || PRIMARY_ADMIN_OPENID
  if (openid !== primaryAdminOpenid && !user.isAdmin && user.role !== 'admin') {
    throw new Error('无管理员权限')
  }
  return { isPrimaryAdmin: openid === primaryAdminOpenid }
}

async function countPendingFeedbacks() {
  const [allResult, processedResult] = await Promise.all([
    db.collection('feedbacks').count(),
    db.collection('feedbacks').where({ status: 'processed' }).count()
  ])
  return Math.max(0, (allResult.total || 0) - (processedResult.total || 0))
}

async function getUser(openid) {
  const result = await db.collection('users').where({ openid }).limit(1).get()
  if (!result.data[0]) throw new Error('请先登录后再提交')
  return result.data[0]
}

async function getUsersByOpenids(openids) {
  if (!openids.length) return []
  const command = db.command
  const batches = []
  for (let index = 0; index < openids.length; index += 10) batches.push(openids.slice(index, index + 10))
  const results = await Promise.all(batches.map(batch => (
    db.collection('users').where({ openid: command.in(batch) }).get()
  )))
  return results.reduce((all, result) => all.concat(result.data || []), [])
}

async function getFamilyConfig() {
  try {
    const result = await db.collection('app_config').doc('family').get()
    return result.data || {}
  } catch (error) {
    return {}
  }
}

function isCloudFile(value) {
  return typeof value === 'string' && value.indexOf('cloud://') === 0
}
