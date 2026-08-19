const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const DEFAULT_ADMIN_OPENID = 'oyWDkxVwYIHb3adMU4PpCl9rWUqI'
const DEFAULT_CHEF_OPENID = DEFAULT_ADMIN_OPENID

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { userInfo } = event

  try {
    const openid = wxContext.OPENID
    const familyConfig = await getFamilyConfig()
    const isConfiguredAdmin = openid === familyConfig.adminOpenid
    const configuredRole = openid === familyConfig.chefOpenid ? 'chef' : ''
    
    if (!openid) {
      return {
        success: false,
        message: '获取用户身份失败'
      }
    }

    if (event.action === 'getRegistrationState') {
      const existingUser = await db.collection('users').where({ openid }).limit(1).get()
      const existingProfile = existingUser.data[0] || null
      const storedRole = existingProfile ? normalizeRole(existingProfile.role) : ''
      return {
        success: true,
        registered: Boolean(existingProfile),
        needsRoleSelection: !(configuredRole || storedRole),
        role: configuredRole || storedRole || '',
        userInfo: existingProfile ? {
          nickname: existingProfile.nickname || '微信用户',
          avatar: existingProfile.avatar || '',
          role: configuredRole || storedRole || '',
          isAdmin: Boolean(isConfiguredAdmin || existingProfile.isAdmin || existingProfile.role === 'admin'),
          isPrimaryAdmin: isConfiguredAdmin
        } : null
      }
    }

    // 查询用户是否已存在
    const userResult = await db.collection('users').where({
      openid: openid
    }).get()

    let userData = null
    const isNewUser = userResult.data.length === 0

    if (isNewUser) {
      const role = configuredRole || normalizeRegistrationRole(userInfo && userInfo.role)
      if (!role) {
        return {
          success: false,
          code: 'ROLE_REQUIRED',
          message: '首次登录请选择投喂官或点菜人'
        }
      }
      const searchCode = generateSearchCode()
      const now = new Date()
      const avatarCheck = await validateAvatar(userInfo && userInfo.avatarUrl, openid)
      if (!avatarCheck.success) return avatarCheck
      await validateText(userInfo && userInfo.nickName, openid)

      // 新用户，创建用户记录
      const createResult = await db.collection('users').add({
        data: {
          openid: openid,
          nickname: userInfo ? userInfo.nickName : '微信用户',
          avatar: userInfo ? userInfo.avatarUrl : '',
          role,
          isAdmin: isConfiguredAdmin,
          searchCode, // 生成搜索码用于好友添加
          createTime: now,
          updateTime: now
        }
      })

      userData = {
        _id: createResult._id,
        openid: openid,
        nickname: userInfo ? userInfo.nickName : '微信用户',
        avatar: userInfo ? userInfo.avatarUrl : '',
        role,
        isAdmin: isConfiguredAdmin,
        searchCode,
        createTime: now,
        updateTime: now
      }
    } else {
      // 老用户，直接返回数据库中的最新信息
      userData = userResult.data[0]
      const storedRole = normalizeRole(userData.role)
      const role = configuredRole || storedRole || normalizeRegistrationRole(userInfo && userInfo.role)
      const isAdmin = Boolean(isConfiguredAdmin || userData.isAdmin || userData.role === 'admin')
      if (!role) {
        return {
          success: false,
          code: 'ROLE_REQUIRED',
          message: '请先选择投喂官或点菜人'
        }
      }
      const updateData = {
        updateTime: new Date()
      }

      if (userData.role !== role) {
        updateData.role = role
      }
      if (userData.isAdmin !== isAdmin) {
        updateData.isAdmin = isAdmin
      }
      
      // 如果传入了新的用户信息，根据情况更新昵称和头像
      if (userInfo) {
        // 只有当数据库中没有自定义昵称时才使用微信昵称
        // 避免用微信昵称覆盖用户自定义的昵称
        if (userInfo.nickName && isDefaultNickname(userData.nickname)) {
          await validateText(userInfo.nickName, openid)
          updateData.nickname = userInfo.nickName
        }

        // 只有当数据库中没有头像（新用户）或者当前是微信默认头像时才更新
        // 避免用微信默认头像覆盖用户自定义上传的头像（fileID格式）
        if (userInfo.avatarUrl && isDefaultAvatar(userData.avatar)) {
          const avatarCheck = await validateAvatar(userInfo.avatarUrl, openid)
          if (!avatarCheck.success) return avatarCheck
          updateData.avatar = userInfo.avatarUrl
        }
      }

      // 每次进入小程序都刷新最近活跃时间，供饭搭子列表展示。
      await db.collection('users').doc(userData._id).update({ data: updateData })
      userData = { ...userData, ...updateData }
    }

    userData = await attachUserStats(userData)

    return {
      success: true,
      openid: openid,
      userInfo: {
        ...userData,
        isAdmin: Boolean(isConfiguredAdmin || userData.isAdmin || userData.role === 'admin'),
        isPrimaryAdmin: isConfiguredAdmin
      },
      isNewUser,
      message: '登录成功'
    }

  } catch (error) {
    console.error('登录云函数执行错误:', error)
    return {
      success: false,
      message: error.message || '登录失败'
    }
  }
}

// 登录资料同时返回个人页需要的实时统计，避免前端使用不存在的占位字段。
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

async function getFamilyConfig() {
  try {
    const result = await db.collection('app_config').doc('family').get()
    if (result.data && result.data.chefOpenid) {
      const config = sanitizeFamilyConfig(result.data)
      if (!result.data.adminOpenid) {
        await db.collection('app_config').doc('family').update({
          data: { adminOpenid: config.adminOpenid, updatedAt: new Date() }
        })
      }
      return config
    }
  } catch (error) {
    // 兼容旧数据：首次升级时从已有厨师账号生成集中配置。
  }

  const existingConfigs = await db.collection('app_config').limit(20).get()
  const existingConfig = existingConfigs.data.find(item => item && item.chefOpenid)
  if (existingConfig) {
    const config = sanitizeFamilyConfig(existingConfig)
    await db.collection('app_config').doc('family').set({ data: { ...config, updatedAt: new Date() } })
    return config
  }

  const config = {
    chefOpenid: DEFAULT_CHEF_OPENID,
    adminOpenid: DEFAULT_ADMIN_OPENID,
    chefNickname: '小千',
    subscribeTemplates: {},
    updatedAt: new Date()
  }
  await db.collection('app_config').doc('family').set({ data: config })
  return sanitizeFamilyConfig(config)
}

function sanitizeFamilyConfig(config) {
  return {
    chefOpenid: config.chefOpenid,
    adminOpenid: config.adminOpenid || DEFAULT_ADMIN_OPENID,
    chefNickname: config.chefNickname || '投喂官',
    miniprogramState: config.miniprogramState || 'formal',
    subscribeTemplates: config.subscribeTemplates || {}
  }
}

function isDefaultNickname(nickname) {
  return !nickname || ['微信用户', '未登录用户', '用户'].includes(nickname)
}

function normalizeRole(role) {
  if (role === 'admin') return 'chef'
  return ['chef', 'consumer'].includes(role) ? role : ''
}

function normalizeRegistrationRole(role) {
  return ['chef', 'consumer'].includes(role) ? role : ''
}

function isDefaultAvatar(avatar) {
  return !avatar || avatar.includes('thirdwx.qlogo.cn') || avatar.includes('/images/default-avatar')
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
    console.error('头像内容安全检测服务异常:', error)
    return { success: false, message: '头像安全检测服务繁忙，请稍后重试' }
  }
}

async function validateText(content, openid) {
  const value = String(content || '').trim()
  if (!value) return
  const result = await cloud.openapi.security.msgSecCheck({ openid, scene: 2, version: 2, content: value })
  const suggest = result && result.result && result.result.suggest
  if (suggest && suggest !== 'pass') throw new Error('昵称未通过内容安全检测，请更换后重试')
}

// 生成用户搜索码（用于好友添加）
function generateSearchCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}
