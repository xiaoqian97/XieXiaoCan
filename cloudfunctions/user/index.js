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
      case 'getProfile':
        return await getUserProfile(openid)
      case 'updateProfile':
        return await updateUserProfile(event, openid)
      case 'getPreferences':
        return await getPreferences(openid)
      case 'updatePreferences':
        return await updatePreferences(event, openid)
      case 'searchUser':
        return await searchUser(event)
      case 'generateSearchCode':
        return await generateSearchCode(openid)
      case 'updateSearchCode':
        return await updateSearchCode(openid)
      default:
        return {
          success: false,
          message: '未知操作'
        }
    }
  } catch (error) {
    console.error('用户操作失败:', error)
    return {
      success: false,
      message: '操作失败',
      error: error.message
    }
  }
}

// 获取用户资料
async function getUserProfile(openid) {
  const result = await db.collection('users').where({
    openid: openid
  }).get()

  if (result.data.length === 0) {
    return {
      success: false,
      message: '用户不存在'
    }
  }

  const user = await attachUserStats(result.data[0])
  return {
    success: true,
    data: {
      user
    }
  }
}

// 更新用户资料
async function updateUserProfile(event, openid) {
  const { nickname, avatar } = event
  const updateData = { updatedAt: new Date() }

  if (nickname !== undefined) {
    const value = String(nickname || '').trim()
    if (!value) throw new Error('昵称不能为空')
    await validateText(value, openid)
    updateData.nickname = value
  }
  if (avatar !== undefined) {
    const avatarCheck = await validateAvatar(avatar, openid)
    if (!avatarCheck.success) return avatarCheck
    updateData.avatar = avatar
  }

  await db.collection('users').where({
    openid: openid
  }).update({
    data: updateData
  })

  return {
    success: true,
    data: {}
  }
}

async function getPreferences(openid) {
  const user = await getUserByOpenid(openid)
  return { success: true, data: { preferences: normalizePreferences(user.dietPreferences) } }
}

async function updatePreferences(event, openid) {
  const preferences = normalizePreferences(event.preferences)
  await db.collection('users').where({ openid }).update({ data: { dietPreferences: preferences, updatedAt: new Date() } })
  return { success: true, data: { preferences }, message: '饮食偏好已保存' }
}

async function getUserByOpenid(openid) {
  const result = await db.collection('users').where({ openid }).limit(1).get()
  if (!result.data[0]) throw new Error('用户不存在')
  return result.data[0]
}

function normalizePreferences(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const allowedSpicy = ['none', 'mild', 'medium', 'hot']
  const allowedDiet = ['none', 'vegetarian', 'low_fat']
  const unique = list => [...new Set((Array.isArray(list) ? list : []).map(item => String(item).trim()).filter(Boolean))].slice(0, 20)
  return {
    spicy: allowedSpicy.includes(source.spicy) ? source.spicy : 'medium',
    diet: allowedDiet.includes(source.diet) ? source.diet : 'none',
    likes: unique(source.likes),
    dislikes: unique(source.dislikes),
    allergies: unique(source.allergies),
    updatedAt: new Date()
  }
}

async function attachUserStats(userData) {
  if (!userData || !userData.openid) return userData

  const recipeResult = await db.collection('recipes').where({
    creatorId: userData.openid,
    status: 'published'
  }).field({ _id: true }).limit(1000).get()
  const recipeIds = recipeResult.data.map(item => item._id).filter(Boolean)
  let likeCount = 0
  if (recipeIds.length) {
    const favoriteResult = await db.collection('favorites').where({
      recipeId: db.command.in(recipeIds)
    }).count()
    likeCount = favoriteResult.total || 0
  }

  return {
    ...userData,
    recipeCount: recipeIds.length,
    likeCount
  }
}

async function validateAvatar(fileID, openid) {
  if (!fileID || !fileID.startsWith('cloud://')) return { success: true }

  try {
    const file = await cloud.downloadFile({ fileID })
    const result = await cloud.openapi.security.imgSecCheck({
      media: {
        contentType: 'image/jpeg',
        value: file.fileContent
      },
      version: 2,
      scene: 2,
      openid
    })
    if (result.result && result.result.suggest !== 'pass') {
      await cloud.deleteFile({ fileList: [fileID] }).catch(() => {})
      return { success: false, message: '头像未通过内容安全检测，请更换后重试' }
    }
    return { success: true }
  } catch (error) {
    // 网络抖动或安全接口超时不等于图片违规，保留文件供用户直接重试。
    console.error('头像内容安全检测服务异常:', error)
    return { success: false, message: '头像安全检测服务繁忙，请稍后重试' }
  }
}

async function validateText(content, openid) {
  const result = await cloud.openapi.security.msgSecCheck({
    openid,
    scene: 2,
    version: 2,
    content
  })
  const suggest = result && result.result && result.result.suggest
  if (suggest && suggest !== 'pass') throw new Error('昵称未通过内容安全检测，请更换后重试')
}

// 搜索用户
async function searchUser(event) {
  const { searchCode } = event

  const result = await db.collection('users').where({
    searchCode: searchCode
  }).get()

  if (result.data.length === 0) {
    return {
      success: false,
      message: '用户不存在'
    }
  }

  const user = result.data[0]
  return {
    success: true,
    data: {
      user: {
        _id: user._id,
        openid: user.openid,
        nickname: user.nickname,
        avatar: user.avatar,
        searchCode: user.searchCode
      }
    }
  }
}

// 生成搜索码
async function generateSearchCode(openid) {
  // 生成6位随机搜索码
  const searchCode = 'FY' + Math.random().toString(36).substr(2, 6).toUpperCase()
  
  // 检查搜索码是否已存在
  const existResult = await db.collection('users').where({
    searchCode: searchCode
  }).get()
  
  if (existResult.data.length > 0) {
    // 如果存在，递归重新生成
    return await generateSearchCode(openid)
  }
  
  // 更新用户的搜索码
  await db.collection('users').where({
    openid: openid
  }).update({
    data: {
      searchCode: searchCode,
      updatedAt: new Date()
    }
  })
  
  return {
    success: true,
    data: {
      searchCode: searchCode
    }
  }
}

// 更新搜索码
async function updateSearchCode(openid) {
  return await generateSearchCode(openid)
}
