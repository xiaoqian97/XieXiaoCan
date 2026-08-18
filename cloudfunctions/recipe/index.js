const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const PRIMARY_ADMIN_OPENID = 'oyWDkxVwYIHb3adMU4PpCl9rWUqI'
const SAMPLE_RECIPES = [
  ['红烧肉', '五花肉', '肉类经典，软糯下饭。', 'meat', 'heavy', ['stew', 'home_style', 'sweet']],
  ['宫保鸡丁', '鸡腿肉', '香辣微甜的快手下饭菜。', 'meat', 'quick', ['stir_fry', 'sichuan', 'spicy']],
  ['青椒肉丝', '里脊肉', '家常小炒，十几分钟就能上桌。', 'meat', 'daily', ['stir_fry', 'home_style']],
  ['清蒸鲈鱼', '鲈鱼', '保留鱼肉鲜甜，清爽不腻。', 'seafood', 'guest', ['steam', 'fresh', 'cantonese']],
  ['蒜蓉虾', '鲜虾', '蒜香浓郁，鲜味十足。', 'seafood', 'quick', ['stir_fry', 'fresh']],
  ['番茄鱼片', '鱼片', '酸甜开胃，汤汁拌饭很香。', 'seafood', 'daily', ['boil', 'sour', 'fresh']],
  ['番茄炒蛋', '鸡蛋', '酸甜软嫩，百吃不厌。', 'egg', 'daily', ['stir_fry', 'home_style', 'sour']],
  ['虾皮蒸蛋', '鸡蛋', '嫩滑鲜香，适合全家分享。', 'egg', 'quick', ['steam', 'fresh']],
  ['青椒炒鸡蛋', '鸡蛋', '清爽简单，配饭刚刚好。', 'egg', 'quick', ['stir_fry', 'home_style']],
  ['蚝油生菜', '生菜', '脆嫩清甜，三分钟快手菜。', 'vegetable', 'quick', ['stir_fry', 'light']],
  ['蒜蓉西兰花', '西兰花', '蒜香清爽，营养丰富。', 'vegetable', 'quick', ['stir_fry', 'light']],
  ['地三鲜', '茄子', '软糯入味的东北家常菜。', 'vegetable', 'daily', ['stir_fry', 'home_style']],
  ['扬州炒饭', '米饭', '颗粒分明，鲜香饱腹。', 'staple', 'quick', ['stir_fry', 'home_style']],
  ['番茄鸡蛋面', '面条', '热乎酸甜，一碗就满足。', 'staple', 'quick', ['boil', 'sour']],
  ['香菇焖饭', '大米', '米饭吸足菌菇香气。', 'staple', 'daily', ['stew', 'home_style']]
].map(([name, ingredient, description, ingredientCategory, sceneCategory, optionalTags]) => ({
  name,
  description,
  ingredient,
  ingredientCategory,
  sceneCategory,
  optionalTags
}))

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action } = event

  if (['detail', 'getById', 'update', 'delete', 'getViewers', 'getFavoriteUsers'].includes(action) && !isValidRecipeId(event.recipeId)) {
    return { success: false, message: '菜谱不存在' }
  }

  try {
    switch (action) {
      case 'create':
        return await createRecipe(event, openid)
      case 'list':
        return await getRecipeList(event, openid)
      case 'detail':
        return await getRecipeDetail(event, openid, event.recordView !== false)
      case 'getById':
        return await getRecipeById(event, openid)
      case 'update':
        return await updateRecipe(event, openid)
      case 'delete':
        return await deleteRecipe(event, openid)
      case 'recommend':
        return await getRecommendRecipes(event, openid)
      case 'getInteractions':
        return await getRecipeInteractions(event.recipeId, openid)
      case 'getViewers':
        return await getRecipeViewers(event.recipeId, openid)
      case 'getFavoriteUsers':
        return await getRecipeFavoriteUsers(event.recipeId, openid)
      case 'saveInteraction':
        return await saveRecipeInteraction(event, openid)
      case 'search':
        return await searchRecipes(event)
      case 'myRecipes':
        return await getMyRecipes(event, openid)
      case 'friendRecipes':
        return await getFriendRecipes(event, openid)
      case 'seedSamples':
        return await seedSampleRecipes(openid)
      case 'resolveImages':
        return await resolveImageUrls(event.fileIDs)
      default:
        return {
          success: false,
          message: '未知操作'
        }
    }
  } catch (error) {
    console.error('菜谱操作失败:', error)
    return {
      success: false,
      message: '操作失败',
      error: error.message
    }
  }
}

async function resolveImageUrls(fileIDs) {
  if (!Array.isArray(fileIDs) || fileIDs.length === 0 || fileIDs.length > 50) {
    return { success: false, message: '图片地址参数不正确' }
  }

  const uniqueFileIDs = [...new Set(fileIDs)]
  const isValid = uniqueFileIDs.every(fileID => (
    typeof fileID === 'string' && fileID.startsWith('cloud://') && fileID.length <= 1024
  ))
  if (!isValid) return { success: false, message: '图片地址参数不正确' }

  const result = await cloud.getTempFileURL({ fileList: uniqueFileIDs })
  return {
    success: true,
    data: {
      files: (result.fileList || []).map(file => ({
        fileID: file.fileID,
        tempFileURL: file.tempFileURL || ''
      }))
    }
  }
}

async function seedSampleRecipes(openid) {
  const chefOpenid = await getChefOpenid()
  if (openid !== chefOpenid) {
    return { success: false, message: '仅主厨账号可以初始化样例菜谱' }
  }

  const names = SAMPLE_RECIPES.map(recipe => recipe.name)
  const existing = await db.collection('recipes').where({
    creatorId: chefOpenid,
    name: _.in(names)
  }).get()
  const existingNames = new Set(existing.data.map(recipe => recipe.name))
  const recipesToCreate = SAMPLE_RECIPES.filter(recipe => !existingNames.has(recipe.name))

  await Promise.all(recipesToCreate.map(recipe => db.collection('recipes').add({
    data: {
      name: recipe.name,
      description: recipe.description,
      images: [],
      ingredients: [{ id: 'ing_1', name: recipe.ingredient, amount: '适量' }],
      steps: [{ id: 'step_1', content: `处理好${recipe.ingredient}后，按个人口味烹饪即可。`, image: '' }],
      xiaohongshuUrl: '',
      preparationTime: recipe.sceneCategory === 'quick' ? { value: '30', label: '30分钟' } : { value: '60', label: '1小时' },
      difficulty: { value: 1, label: '简单', color: 'green' },
      servingSize: { value: '3-4', label: '3-4人' },
      sceneCategory: recipe.sceneCategory,
      ingredientCategory: recipe.ingredientCategory,
      optionalTags: recipe.optionalTags,
      isPublic: true,
      status: 'published',
      creatorId: chefOpenid,
      viewCount: 0,
      ratingTotal: 0,
      ratingCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  })))

  return {
    success: true,
    data: {
      created: recipesToCreate.length,
      skipped: existingNames.size
    }
  }
}

// 创建菜谱
async function createRecipe(event, openid) {
  if (!(await canManageRecipes(openid))) {
    return {
      success: false,
      message: '请提交心愿'
    }
  }

  const { data } = event
  const { 
    name, 
    description, 
    images, 
    ingredients, 
    sideIngredients,
    seasonings,
    steps, 
    xiaohongshuUrl,
    preparationTime, 
    difficulty, 
    servingSize, 
    sceneCategory,
    ingredientCategory,
    optionalTags,
    isPublic,
    status 
  } = data

  // 验证必填字段
  if (!name || !name.trim()) {
    return {
      success: false,
      message: '菜谱名称不能为空'
    }
  }

  if (!sceneCategory) {
    return {
      success: false,
      message: '请选择菜谱场景'
    }
  }

  if (!ingredientCategory) {
    return {
      success: false,
      message: '请选择主要食材'
    }
  }

  if (!ingredients || ingredients.length === 0) {
    return {
      success: false,
      message: '请添加食材清单'
    }
  }

  await validateRecipeText(name, description, ingredients, steps, openid, sideIngredients, seasonings)
  const imageCheck = await validateRecipeImages(images, steps, openid)
  if (!imageCheck.success) return imageCheck

  const result = await db.collection('recipes').add({
    data: {
      name: name.trim(),
      description: description ? description.trim() : '',
      images: images || [],
      ingredients: ingredients || [],
      sideIngredients: String(sideIngredients || '').trim(),
      seasonings: String(seasonings || '').trim(),
      steps: steps || [],
      xiaohongshuUrl: xiaohongshuUrl ? xiaohongshuUrl.trim() : '',
      preparationTime: preparationTime || { value: '30', label: '30分钟' },
      difficulty: difficulty || { value: 1, label: '简单', color: 'green' },
      servingSize: servingSize || { value: '3-4', label: '3-4人' },
      sceneCategory,           // 场景分类ID
      ingredientCategory,      // 食材分类ID
      optionalTags: optionalTags || [], // 可选标签ID数组
      isPublic: isPublic !== false,
      status: status || 'draft',
      creatorId: openid,
      viewCount: 0,
      ratingTotal: 0,
      ratingCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  })

  return {
    success: true,
    data: {
      recipeId: result._id
    }
  }
}

// 获取菜谱列表
async function getRecipeList(event, openid) {
  const { 
    page = 1, 
    pageSize = 10, 
    search, 
    sceneCategories, 
    ingredientCategories,
    optionalTags,
    preparationTime
  } = event
  let creatorId = event.creatorId
  if (!creatorId && event.scope === 'fixedChef') {
    const userResult = await db.collection('users').where({ openid }).limit(1).get()
    const viewer = userResult.data[0] || {}
    creatorId = ['chef', 'admin'].includes(viewer.role)
      ? openid
      : (viewer.fixedFeederOpenid || '')
    if (!creatorId) {
      return { success: true, data: { recipes: [], total: 0, needsFixedFeeder: true } }
    }
  }

  let query = db.collection('recipes')

  // 构建筛选条件
  let conditions = []

  // 搜索条件（支持菜谱名称和描述）
  if (search && search.trim()) {
    const keyword = escapeRegExp(search.trim())
    conditions.push(
      _.or([
        {
          name: db.RegExp({
            regexp: keyword,
            options: 'i'
          })
        },
        {
          description: db.RegExp({
            regexp: keyword,
            options: 'i'
          })
        },
        {
          'ingredients.name': db.RegExp({
            regexp: keyword,
            options: 'i'
          })
        },
        {
          sideIngredients: db.RegExp({
            regexp: keyword,
            options: 'i'
          })
        },
        {
          seasonings: db.RegExp({
            regexp: keyword,
            options: 'i'
          })
        }
      ])
    )
  }

  // 场景分类筛选
  if (sceneCategories && sceneCategories.length > 0) {
    conditions.push({
      sceneCategory: _.in(sceneCategories)
    })
  }

  // 食材分类筛选
  if (ingredientCategories && ingredientCategories.length > 0) {
    conditions.push({
      ingredientCategory: _.in(ingredientCategories)
    })
  }

  // 可选标签筛选
  if (optionalTags && optionalTags.length > 0) {
    // 菜谱必须包含至少一个选中的可选标签
    conditions.push({
      optionalTags: _.in(optionalTags)
    })
  }

  // 制作时间筛选
  if (preparationTime) {
    const timeValue = parseInt(preparationTime)
    if (Number.isFinite(timeValue)) conditions.push({ 'preparationTime.value': String(timeValue) })
  }

  // 权限条件
  if (creatorId) {
    conditions.push({ creatorId: creatorId })
    // 查询指定用户的菜谱时，只显示已发布的
    conditions.push({ status: 'published' })
    if (creatorId !== openid && !(await areFamilyMembers(openid, creatorId))) {
      conditions.push({ isPublic: true })
    }
  } else {
    // 只显示公开的菜谱或自己的菜谱
    conditions.push(
      _.or([
        { isPublic: true, status: 'published' },
        { creatorId: openid, status: 'published' }
      ])
    )
  }

  // 合并所有条件
  let whereCondition = conditions.length > 0 ? _.and(conditions) : {}

  const result = await query
    .where(whereCondition)
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  // 获取创建者信息，添加错误处理
  const recipes = await Promise.all(result.data.map(async (recipe) => {
    try {
      const userResult = await db.collection('users').where({
        openid: recipe.creatorId
      }).get()
      
      const user = userResult.data.length > 0 ? userResult.data[0] : null
      return {
        ...recipe,
        creator: user ? { 
          nickname: user.nickname || '未知用户', 
          avatar: user.avatar || '' 
        } : { nickname: '未知用户', avatar: '' },
        createTime: formatTime(recipe.createdAt)
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
      return {
        ...recipe,
        creator: { nickname: '未知用户', avatar: '' },
        createTime: formatTime(recipe.createdAt)
      }
    }
  }))

  const recipesWithFavorites = await attachFavoriteStats(recipes)
  const recipesWithStats = await attachSalesStats(recipesWithFavorites)

  return {
    success: true,
    data: {
      recipes: recipesWithStats,
      total: result.data.length
    }
  }
}

async function attachFavoriteStats(recipes, includeUsers = false) {
  const recipeIds = recipes.map(recipe => recipe._id).filter(Boolean)
  if (!recipeIds.length) return recipes

  const favoriteResult = await db.collection('favorites').where({
    recipeId: _.in(recipeIds)
  }).limit(1000).get()
  const favoriteUserIds = favoriteResult.data.reduce((map, favorite) => {
    if (!favorite.recipeId || !favorite.userId) return map
    if (!map[favorite.recipeId]) map[favorite.recipeId] = []
    if (!map[favorite.recipeId].includes(favorite.userId)) map[favorite.recipeId].push(favorite.userId)
    return map
  }, {})

  if (!includeUsers) {
    return recipes.map(recipe => ({
      ...recipe,
      favoriteCount: (favoriteUserIds[recipe._id] || []).length
    }))
  }

  const userIds = [...new Set(Object.values(favoriteUserIds).flat())]
  const userResult = userIds.length
    ? await db.collection('users').where({ openid: _.in(userIds) }).limit(100).get()
    : { data: [] }
  const userMap = userResult.data.reduce((map, user) => {
    map[user.openid] = user
    return map
  }, {})

  return recipes.map(recipe => ({
    ...recipe,
    favoriteCount: (favoriteUserIds[recipe._id] || []).length,
    favoriteUsers: (favoriteUserIds[recipe._id] || []).map(userId => {
      const user = userMap[userId]
      return {
        openid: userId,
        nickname: user && user.nickname ? user.nickname : '微信用户',
        avatar: user && user.avatar ? user.avatar : ''
      }
    })
  }))
}

// 统计未取消订单中的下单次数；订单量超过当前上限后再迁移到预聚合字段。
async function attachSalesStats(recipes) {
  const creatorIds = [...new Set(recipes.map(recipe => recipe.creatorId).filter(Boolean))]
  if (!creatorIds.length) return recipes

  const result = await db.collection('orders').where({
    assigneeId: _.in(creatorIds)
  }).limit(1000).get()
  const salesMap = {}
  result.data.forEach(order => {
    if (order.status === 'cancelled') return
    ;(order.recipes || []).forEach(item => {
      const recipeId = item && item.recipeId
      if (!recipeId) return
      salesMap[recipeId] = (salesMap[recipeId] || 0) + 1
    })
  })

  return recipes.map(recipe => ({
    ...recipe,
    salesCount: salesMap[recipe._id] || 0
  }))
}

// 获取菜谱详情
async function getRecipeDetail(event, openid, recordView) {
  const { recipeId } = event
  
  try {
    const result = await db.collection('recipes').doc(recipeId).get()
    
    if (!result.data) {
      console.error('菜谱不存在，recipeId:', recipeId)
      return {
        success: false,
        message: '菜谱不存在',
        error: 'RECIPE_NOT_FOUND',
        recipeId: recipeId
      }
    }
    
    const recipe = result.data
    
    // 检查权限
    if (!recipe.isPublic && recipe.creatorId !== openid && !(await areFamilyMembers(openid, recipe.creatorId))) {
      console.error('没有权限查看此菜谱，recipeId:', recipeId, 'creatorId:', recipe.creatorId, 'openid:', openid)
      return {
        success: false,
        message: '没有权限查看此菜谱',
        error: 'NO_PERMISSION'
      }
    }

    recipe.viewCount = Number(recipe.viewCount || 0)
    if (recordView) {
      try {
        await db.collection('recipes').doc(recipeId).update({
          data: { viewCount: _.inc(1) }
        })
        recipe.viewCount += 1
        await recordRecipeView(recipeId, openid)
      } catch (error) {
        console.error('记录菜谱浏览量失败:', error)
      }
    }
    
    // 获取创建者信息
    try {
      const userResult = await db.collection('users').where({
        openid: recipe.creatorId
      }).get()
      
      const user = userResult.data.length > 0 ? userResult.data[0] : null
      recipe.creator = user ? { 
        nickname: user.nickname || '未知用户', 
        avatar: user.avatar || '' 
      } : { nickname: '未知用户', avatar: '' }
    } catch (error) {
      console.error('获取用户信息失败:', error)
      recipe.creator = { nickname: '未知用户', avatar: '' }
    }
    recipe.createTime = formatTime(recipe.createdAt)
    const interaction = await getRecipeInteractionSummary(recipeId, openid)
    recipe.interactions = interaction.counts
    recipe.myInteraction = interaction.myReaction
    recipe.myInteractions = interaction.myReactions
    
    return {
      success: true,
      data: recipe
    }
  } catch (error) {
    console.error('查询菜谱详情失败:', error)
    return {
      success: false,
      message: '查询菜谱详情失败',
      error: error.message,
      recipeId: recipeId
    }
  }
}

// 根据ID获取菜谱（用于编辑）
async function getRecipeById(event, openid) {
  const { recipeId } = event
  
  try {
    const result = await db.collection('recipes').doc(recipeId).get()
    
    if (!result.data) {
      console.error('菜谱不存在，recipeId:', recipeId)
      return {
        success: false,
        message: '菜谱不存在',
        error: 'RECIPE_NOT_FOUND',
        recipeId: recipeId
      }
    }
    
    const recipe = result.data
    
    // 只有创建者可以编辑
    if (recipe.creatorId !== openid) {
      console.error('没有权限编辑此菜谱，recipeId:', recipeId, 'creatorId:', recipe.creatorId, 'openid:', openid)
      return {
        success: false,
        message: '没有权限编辑此菜谱',
        error: 'NO_PERMISSION'
      }
    }
    
    return {
      success: true,
      data: recipe
    }
  } catch (error) {
    console.error('查询菜谱详情失败:', error)
    return {
      success: false,
      message: '查询菜谱详情失败',
      error: error.message,
      recipeId: recipeId
    }
  }
}

// 更新菜谱
async function updateRecipe(event, openid) {
  const { recipeId, data } = event
  const { 
    name, 
    description, 
    images, 
    ingredients, 
    sideIngredients,
    seasonings,
    steps, 
    xiaohongshuUrl,
    preparationTime, 
    difficulty, 
    servingSize, 
    sceneCategory,
    ingredientCategory,
    optionalTags,
    isPublic,
    status 
  } = data

  // 检查权限
  const recipeResult = await db.collection('recipes').doc(recipeId).get()
  if (!recipeResult.data || recipeResult.data.creatorId !== openid) {
    return {
      success: false,
      message: '没有权限修改此菜谱'
    }
  }

  // 验证必填字段
  if (!name || !name.trim()) {
    return {
      success: false,
      message: '菜谱名称不能为空'
    }
  }

  if (!sceneCategory) {
    return {
      success: false,
      message: '请选择菜谱场景'
    }
  }

  if (!ingredientCategory) {
    return {
      success: false,
      message: '请选择主要食材'
    }
  }

  const existingImageIDs = [
    ...(recipeResult.data.images || []),
    ...(recipeResult.data.steps || []).map(step => step.image)
  ].filter(Boolean)
  const imageCheck = await validateRecipeImages(images, steps, openid, existingImageIDs)
  if (!imageCheck.success) return imageCheck

  await validateRecipeText(name, description, ingredients, steps, openid, sideIngredients, seasonings)

  await db.collection('recipes').doc(recipeId).update({
    data: {
      name: name.trim(),
      description: description ? description.trim() : '',
      images: images || [],
      ingredients: ingredients || [],
      sideIngredients: String(sideIngredients || '').trim(),
      seasonings: String(seasonings || '').trim(),
      steps: steps || [],
      xiaohongshuUrl: xiaohongshuUrl ? xiaohongshuUrl.trim() : '',
      preparationTime: preparationTime || { value: '30', label: '30分钟' },
      difficulty: difficulty || { value: 1, label: '简单', color: 'green' },
      servingSize: servingSize || { value: '3-4', label: '3-4人' },
      sceneCategory,
      ingredientCategory,
      optionalTags: optionalTags || [],
      isPublic: isPublic !== false,
      status: status || 'draft',
      updatedAt: new Date()
    }
  })

  return {
    success: true,
    data: {}
  }
}

async function recordRecipeView(recipeId, openid) {
  if (!recipeId || !openid) return
  const viewId = `${recipeId}_${openid}`
  const viewRef = db.collection('recipe_views').doc(viewId)
  try {
    await viewRef.get()
    await viewRef.update({
      data: {
        viewCount: _.inc(1),
        lastViewedAt: new Date()
      }
    })
  } catch (error) {
    const message = String(error && (error.errMsg || error.message || ''))
    if (!/not exist|does not exist|document.*not/i.test(message)) throw error
    try {
      await viewRef.set({
        data: {
          recipeId,
          viewerId: openid,
          viewCount: 1,
          firstViewedAt: new Date(),
          lastViewedAt: new Date()
        }
      })
    } catch (setError) {
      // 多端同时首次打开时，其中一端可能已创建记录；此时补一次累加。
      const setMessage = String(setError && (setError.errMsg || setError.message || ''))
      if (!/already exist|duplicate/i.test(setMessage)) throw setError
      await viewRef.update({
        data: { viewCount: _.inc(1), lastViewedAt: new Date() }
      })
    }
  }
}

async function getRecipeViewers(recipeId, openid) {
  await requirePrimaryAdmin(openid)
  const [viewResult, totalResult] = await Promise.all([
    db.collection('recipe_views').where({ recipeId }).orderBy('viewCount', 'desc').limit(20).get(),
    db.collection('recipe_views').where({ recipeId }).count()
  ])
  const views = viewResult.data || []
  const viewerIds = [...new Set(views.map(item => item.viewerId).filter(Boolean))]
  let users = []
  if (viewerIds.length > 0) {
    const userResult = await db.collection('users').where({ openid: _.in(viewerIds) }).limit(20).get()
    users = userResult.data || []
  }
  const userMap = new Map(users.map(user => [user.openid, user]))
  return {
    success: true,
    data: {
      total: Number(totalResult.total || 0),
      viewers: views.map(item => {
        const user = userMap.get(item.viewerId) || {}
        return {
          openid: item.viewerId,
          nickname: user.nickname || '微信用户',
          avatar: user.avatar || '',
          viewCount: Number(item.viewCount || 0)
        }
      })
    }
  }
}

async function getRecipeFavoriteUsers(recipeId, openid) {
  await requirePrimaryAdmin(openid)
  const [favoriteResult, totalResult] = await Promise.all([
    db.collection('favorites').where({ recipeId }).orderBy('createdAt', 'desc').limit(20).get(),
    db.collection('favorites').where({ recipeId }).count()
  ])
  const favorites = favoriteResult.data || []
  const userIds = [...new Set(favorites.map(item => item.userId).filter(Boolean))]
  let users = []
  if (userIds.length > 0) {
    const userResult = await db.collection('users').where({ openid: _.in(userIds) }).limit(20).get()
    users = userResult.data || []
  }
  const userMap = new Map(users.map(user => [user.openid, user]))
  return {
    success: true,
    data: {
      total: Number(totalResult.total || 0),
      users: favorites.map(item => {
        const user = userMap.get(item.userId) || {}
        return {
          openid: item.userId,
          nickname: user.nickname || '微信用户',
          avatar: user.avatar || ''
        }
      })
    }
  }
}

const RECIPE_REACTIONS = ['tasty', 'want_again', 'less_spicy', 'just_right']

function normalizeInteractionReactions(interaction) {
  const values = interaction && Array.isArray(interaction.reactions)
    ? interaction.reactions
    : [interaction && interaction.reaction]
  return [...new Set(values.filter(item => RECIPE_REACTIONS.includes(item)))]
}

async function getRecipeInteractionSummary(recipeId, openid) {
  let result = { data: [] }
  try {
    result = await db.collection('recipe_interactions').where({ recipeId }).limit(1000).get()
  } catch (error) {
    // 新集合尚未部署时，菜谱详情仍可正常打开。
    return { counts: {}, myReactions: [], myReaction: '' }
  }
  const counts = result.data.reduce((map, item) => {
    normalizeInteractionReactions(item).forEach(reaction => {
      map[reaction] = (map[reaction] || 0) + 1
    })
    return map
  }, {})
  const mine = result.data.find(item => item.userId === openid)
  const myReactions = normalizeInteractionReactions(mine)
  return { counts, myReactions, myReaction: myReactions[0] || '' }
}

async function getRecipeInteractions(eventRecipeId, openid) {
  if (!isValidRecipeId(eventRecipeId)) return { success: false, message: '菜谱不存在' }
  const summary = await getRecipeInteractionSummary(eventRecipeId, openid)
  return { success: true, data: summary }
}

async function saveRecipeInteraction(event, openid) {
  const recipeId = String(event.recipeId || '')
  const reaction = String(event.reaction || '')
  if (!isValidRecipeId(recipeId) || !RECIPE_REACTIONS.includes(reaction)) {
    return { success: false, message: '互动内容不正确' }
  }
  const recipeResult = await db.collection('recipes').doc(recipeId).get()
  if (!recipeResult.data) return { success: false, message: '菜谱不存在' }
  if (!recipeResult.data.isPublic && recipeResult.data.creatorId !== openid && !(await areFamilyMembers(openid, recipeResult.data.creatorId))) {
    return { success: false, message: '没有权限互动这道菜' }
  }
  const existing = await db.collection('recipe_interactions').where({ recipeId, userId: openid }).limit(1).get()
  const current = existing.data[0]
  const reactions = normalizeInteractionReactions(current)
  const nextReactions = reactions.includes(reaction)
    ? reactions.filter(item => item !== reaction)
    : [...reactions, reaction]

  if (current && nextReactions.length === 0) {
    await db.collection('recipe_interactions').doc(current._id).remove()
  } else {
    const data = {
      recipeId,
      userId: openid,
      reactions: nextReactions,
      reaction: nextReactions[0] || '',
      updatedAt: new Date()
    }
    if (current) await db.collection('recipe_interactions').doc(current._id).update({ data })
    else await db.collection('recipe_interactions').add({ data: { ...data, createdAt: new Date() } })
  }
  return { success: true, data: await getRecipeInteractionSummary(recipeId, openid) }
}

async function canManageRecipes(openid) {
  const result = await db.collection('users').where({ openid }).limit(1).get()
  const user = result.data[0]
  return Boolean(user && ['chef', 'admin'].includes(user.role))
}

async function requirePrimaryAdmin(openid) {
  let primaryAdminOpenid = PRIMARY_ADMIN_OPENID
  try {
    const config = await db.collection('app_config').doc('family').get()
    primaryAdminOpenid = (config.data && config.data.adminOpenid) || PRIMARY_ADMIN_OPENID
  } catch (error) {}
  if (openid !== primaryAdminOpenid) throw new Error('仅主管理员可以查看菜谱查看者')
}

function isValidRecipeId(recipeId) {
  return typeof recipeId === 'string' && recipeId.length > 0 && recipeId.length <= 64
}

async function validateRecipeImages(images = [], steps = [], openid, ignoredFileIDs = []) {
  const ignored = new Set(ignoredFileIDs)
  const fileIDs = [...images, ...steps.map(step => step.image)].filter(fileID => (
    typeof fileID === 'string' && fileID.startsWith('cloud://') && !ignored.has(fileID)
  ))

  for (const fileID of fileIDs) {
    try {
      const file = await cloud.downloadFile({ fileID })
      const contentType = detectImageContentType(file.fileContent)
      if (!contentType) {
        return { success: false, message: '图片格式暂不支持，请使用 JPG 或 PNG 图片' }
      }

      const checkResult = await cloud.openapi.security.imgSecCheck({
        media: {
          contentType,
          value: file.fileContent
        },
        version: 2,
        scene: 2,
        openid
      })

      const suggestion = checkResult && checkResult.result && checkResult.result.suggest
      if (suggestion && suggestion !== 'pass') {
        console.warn('图片内容安全检测未通过:', fileID, checkResult)
        return { success: false, message: '图片内容未通过安全检测，请更换后重试' }
      }
    } catch (error) {
      console.error('图片内容安全检测接口异常:', fileID, error)
      if (isImageRiskError(error)) {
        return { success: false, message: '图片内容未通过安全检测，请更换后重试' }
      }
      const errorCode = error && (error.errCode || error.errcode || error.code)
      return {
        success: false,
        message: `图片检测异常（${errorCode || 'UNKNOWN'}）`,
        errorCode: errorCode || 'UNKNOWN'
      }
    }
  }

  return { success: true }
}

async function validateRecipeText(name, description, ingredients = [], steps = [], openid, sideIngredients = '', seasonings = '') {
  const content = [
    name,
    description,
    sideIngredients,
    seasonings,
    ...ingredients.map(item => `${item && item.name ? item.name : ''} ${item && item.amount ? item.amount : ''}`),
    ...steps.map(step => step && step.content ? step.content : '')
  ].map(value => String(value || '').trim()).filter(Boolean).join('\n')
  if (!content) return
  const result = await cloud.openapi.security.msgSecCheck({ openid, scene: 2, version: 2, content })
  const suggest = result && result.result && result.result.suggest
  if (suggest && suggest !== 'pass') throw new Error('菜谱文字未通过内容安全检测，请修改后再试')
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

function isImageRiskError(error) {
  const code = Number(error && (error.errCode || error.errcode || error.code))
  const message = String(error && (error.message || error.errMsg || error))
  return code === 87014 || /risky|content contains|内容含有违法违规/i.test(message)
}

async function getChefOpenid() {
  try {
    const result = await db.collection('app_config').doc('family').get()
    if (result.data && result.data.chefOpenid) return result.data.chefOpenid
  } catch (error) {
    // 继续兼容控制台自动生成记录 ID 的配置。
  }
  const existingConfigs = await db.collection('app_config').limit(20).get()
  const existingConfig = existingConfigs.data.find(item => item && item.chefOpenid)
  if (!existingConfig) throw new Error('固定投喂官尚未配置')
  const { _id, ...config } = existingConfig
  await db.collection('app_config').doc('family').set({ data: { ...config, updatedAt: new Date() } })
  return config.chefOpenid
}

async function areFamilyMembers(openid, otherOpenid) {
  if (!openid || !otherOpenid || openid === otherOpenid) return openid === otherOpenid
  const result = await db.collection('friends').where({
    $or: [
      { userOpenid: openid, friendOpenid: otherOpenid },
      { userOpenid: otherOpenid, friendOpenid: openid }
    ],
    status: 'accepted'
  }).limit(1).get()
  return result.data.length > 0
}

// 删除菜谱
async function deleteRecipe(event, openid) {
  const { recipeId } = event
  
  // 检查权限
  const recipeResult = await db.collection('recipes').doc(recipeId).get()
  if (!recipeResult.data || recipeResult.data.creatorId !== openid) {
    return {
      success: false,
      message: '没有权限删除此菜谱'
    }
  }
  
  await db.collection('recipes').doc(recipeId).remove()
  
  return {
    success: true,
    data: {}
  }
}

// 获取推荐菜谱
async function getRecommendRecipes(event, openid) {
  const limit = Math.min(20, Math.max(1, Number(event.limit) || 6))
  const conditions = [{ status: 'published' }]
  let needsFixedFeeder = false
  const userResult = await db.collection('users').where({ openid }).limit(1).get()
  const viewer = userResult.data[0] || null

  if (viewer) {
    if (['chef', 'admin'].includes(viewer.role)) {
      conditions.push({ creatorId: openid })
    } else if (viewer.role === 'consumer') {
      const feederOpenid = viewer.fixedFeederOpenid || ''
      if (!feederOpenid) {
        return {
          success: true,
          data: { recipes: [], needsFixedFeeder: true }
        }
      }
      const isBound = await areFamilyMembers(openid, feederOpenid)
      if (!isBound) {
        return {
          success: true,
          data: { recipes: [], needsFixedFeeder: true }
        }
      }
      conditions.push({ creatorId: feederOpenid })
    } else {
      return {
        success: true,
        data: { recipes: [], needsFixedFeeder: true }
      }
    }
  } else if (event.scope === 'public') {
    conditions.push({ isPublic: true })
  } else {
    return {
      success: true,
      data: { recipes: [], needsFixedFeeder: true }
    }
  }

  const result = await db.collection('recipes')
    .where(_.and(conditions))
    .limit(100)
    .get()
  const preferences = normalizeRecommendationPreferences(viewer && viewer.dietPreferences)
  const recentOrders = await db.collection('orders').where(_.or([{ creatorId: openid }, { assigneeId: openid }])).limit(100).get()
  const recentCounts = {}
  ;(recentOrders.data || []).forEach(order => {
    if (order.status === 'cancelled') return
    ;(order.recipes || []).forEach(item => {
      if (item && item.recipeId) recentCounts[item.recipeId] = (recentCounts[item.recipeId] || 0) + 1
    })
  })
  let interactionResult = { data: [] }
  try {
    interactionResult = await db.collection('recipe_interactions').where({ userId: openid }).limit(100).get()
  } catch (error) {
    interactionResult = { data: [] }
  }
  const interactionMap = (interactionResult.data || []).reduce((map, item) => {
    map[item.recipeId] = normalizeInteractionReactions(item)
    return map
  }, {})
  const recipes = result.data
    .filter(recipe => !hasAllergy(recipe, preferences.allergies) && !isDietExcluded(recipe, preferences.diet))
    .map(recipe => ({
      ...recipe,
      _recommendScore: scoreRecipeRecommendation(recipe, preferences, recentCounts[recipe._id] || 0, interactionMap[recipe._id])
    }))
    .sort((a, b) => b._recommendScore - a._recommendScore || randomTieBreak(a, b))
    .slice(0, limit)
    .map(recipe => { const { _recommendScore, ...clean } = recipe; return clean })

  return {
    success: true,
    data: {
      recipes,
      needsFixedFeeder
    }
  }
}

function normalizeRecommendationPreferences(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    spicy: ['none', 'mild', 'medium', 'hot'].includes(source.spicy) ? source.spicy : 'medium',
    diet: ['none', 'vegetarian', 'low_fat'].includes(source.diet) ? source.diet : 'none',
    likes: normalizePreferenceWords(source.likes),
    dislikes: normalizePreferenceWords(source.dislikes),
    allergies: normalizePreferenceWords(source.allergies)
  }
}

function normalizePreferenceWords(value) {
  return (Array.isArray(value) ? value : []).map(item => String(item).trim().toLowerCase()).filter(Boolean)
}

function recipeSearchText(recipe) {
  return [recipe.name, recipe.description, recipe.ingredient, recipe.ingredientCategory, recipe.sideIngredients, recipe.seasonings, ...(recipe.optionalTags || []), ...(recipe.ingredients || []).map(item => item && item.name)].join(' ').toLowerCase()
}

function hasAllergy(recipe, allergies) {
  const text = recipeSearchText(recipe)
  return allergies.some(word => word && text.includes(word))
}

function isDietExcluded(recipe, diet) {
  if (diet !== 'vegetarian') return false
  return ['meat', 'seafood'].includes(String(recipe.ingredientCategory || '').toLowerCase())
}

function scoreRecipeRecommendation(recipe, preferences, recentCount, reactionList) {
  const text = recipeSearchText(recipe)
  const reactions = Array.isArray(reactionList) ? reactionList : [reactionList].filter(Boolean)
  let score = 50
  preferences.likes.forEach(word => { if (text.includes(word)) score += 12 })
  preferences.dislikes.forEach(word => { if (text.includes(word)) score -= 18 })
  if (preferences.spicy === 'none' && text.includes('spicy')) score -= 20
  if (preferences.spicy === 'hot' && text.includes('spicy')) score += 8
  if (preferences.diet === 'low_fat' && (text.includes('heavy') || text.includes('fried'))) score -= 12
  score -= Math.min(20, recentCount * 7)
  if (reactions.includes('tasty') || reactions.includes('want_again')) score += 24
  if (reactions.includes('less_spicy')) score += text.includes('spicy') ? -5 : 2
  if (reactions.includes('just_right')) score += 8
  const ratingCount = Number(recipe.ratingCount || 0)
  if (ratingCount) score += Math.min(12, Number(recipe.ratingTotal || 0) / ratingCount * 2)
  return score + Math.random() * 8
}

function randomTieBreak() { return Math.random() - 0.5 }

// 搜索菜谱
async function searchRecipes(event) {
  const { keyword, page = 1, pageSize = 10 } = event
  
  const result = await db.collection('recipes')
    .where(_.and([
      {
        isPublic: true
      },
      _.or([
        {
          name: db.RegExp({
            regexp: keyword,
            options: 'i'
          })
        },
        {
          description: db.RegExp({
            regexp: keyword,
            options: 'i'
          })
        }
      ])
    ]))
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  
  return {
    success: true,
    data: {
      recipes: result.data
    }
  }
}

// 获取我的菜谱列表
async function getMyRecipes(event, openid) {
  const { 
    page = 1, 
    pageSize = 10, 
    search, 
    sceneCategories, 
    ingredientCategories,
    optionalTags,
    preparationTime,
    status
  } = event

  const viewerResult = await db.collection('users').where({ openid }).limit(1).get()
  const viewer = viewerResult.data[0] || {}
  const isOwnerView = viewer.role !== 'consumer'
  const ownerOpenid = isOwnerView ? openid : (viewer.fixedFeederOpenid || '')
  if (!ownerOpenid || (!isOwnerView && !(await areFamilyMembers(openid, ownerOpenid)))) {
    return {
      success: true,
      data: { recipes: [], total: 0, needsFixedFeeder: true, readOnly: true }
    }
  }

  let query = db.collection('recipes')

  // 构建筛选条件
  let conditions = []

  conditions.push({ creatorId: ownerOpenid })
  if (!isOwnerView) conditions.push({ status: 'published' })

  // 搜索条件（支持菜谱名称和描述）
  if (search && search.trim()) {
    conditions.push(
      _.or([
        {
          name: db.RegExp({
            regexp: search.trim(),
            options: 'i'
          })
        },
        {
          description: db.RegExp({
            regexp: search.trim(),
            options: 'i'
          })
        }
      ])
    )
  }

  // 场景分类筛选
  if (sceneCategories && sceneCategories.length > 0) {
    conditions.push({
      sceneCategory: _.in(sceneCategories)
    })
  }

  // 食材分类筛选
  if (ingredientCategories && ingredientCategories.length > 0) {
    conditions.push({
      ingredientCategory: _.in(ingredientCategories)
    })
  }

  // 可选标签筛选
  if (optionalTags && optionalTags.length > 0) {
    // 菜谱必须包含至少一个选中的可选标签
    conditions.push({
      optionalTags: _.in(optionalTags)
    })
  }

  // 制作时间筛选
  if (preparationTime) {
    const timeValue = parseInt(preparationTime)
    if (timeValue === 10) {
      // 10分钟
      conditions.push({
        'preparationTime.value': '10'
      })
    } else if (timeValue === 30) {
      // 30分钟
      conditions.push({
        'preparationTime.value': '30'
      })
    } else if (timeValue === 60) {
      // 1小时
      conditions.push({
        'preparationTime.value': '60'
      })
    } else if (timeValue === 120) {
      // 2小时+
      conditions.push({
        'preparationTime.value': '120'
      })
    }
  }

  // 状态筛选
  if (status && isOwnerView) {
    conditions.push({
      status: status
    })
  }

  // 合并所有条件
  let whereCondition = conditions.length > 0 ? _.and(conditions) : {}

  const result = await query
    .where(whereCondition)
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  // 获取创建者信息，添加错误处理
  const recipes = await Promise.all(result.data.map(async (recipe) => {
    try {
      const userResult = await db.collection('users').where({
        openid: recipe.creatorId
      }).get()
      
      const user = userResult.data.length > 0 ? userResult.data[0] : null
      return {
        ...recipe,
        creator: user ? { 
          nickname: user.nickname || '未知用户', 
          avatar: user.avatar || '' 
        } : { nickname: '未知用户', avatar: '' },
        createTime: formatTime(recipe.createdAt)
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
      return {
        ...recipe,
        creator: { nickname: '未知用户', avatar: '' },
        createTime: formatTime(recipe.createdAt)
      }
    }
  }))

  const recipesWithFavorites = await attachFavoriteStats(recipes, isOwnerView)
  const recipesWithStats = await attachSalesStats(recipesWithFavorites)

  return {
    success: true,
    data: {
      recipes: recipesWithStats,
      total: result.data.length,
      needsFixedFeeder: false,
      readOnly: !isOwnerView
    }
  }
}

// 获取好友菜谱列表
async function getFriendRecipes(event, openid) {
  const { 
    page = 1, 
    pageSize = 10, 
    search, 
    sceneCategories, 
    ingredientCategories,
    optionalTags,
    preparationTime
  } = event

  // 先获取好友列表
  const friendResult = await db.collection('friends').where({
    $or: [
      { userOpenid: openid },
      { friendOpenid: openid }
    ],
    status: 'accepted'
  }).get()

  const friendIds = friendResult.data.map(item => 
    item.userOpenid === openid ? item.friendOpenid : item.userOpenid
  )
  
  // 添加自己的ID
  friendIds.push(openid)

  let query = db.collection('recipes')

  // 构建筛选条件
  let conditions = []

  // 已绑定的饭搭子可以查看彼此已发布的非公开菜谱
  conditions.push({
    creatorId: db.command.in(friendIds)
  })
  
  // 只查询已发布的菜谱，排除草稿
  conditions.push({
    status: 'published'
  })

  // 搜索条件（支持菜谱名称和描述）
  if (search && search.trim()) {
    conditions.push(
      _.or([
        {
          name: db.RegExp({
            regexp: search.trim(),
            options: 'i'
          })
        },
        {
          description: db.RegExp({
            regexp: search.trim(),
            options: 'i'
          })
        }
      ])
    )
  }

  // 场景分类筛选
  if (sceneCategories && sceneCategories.length > 0) {
    conditions.push({
      sceneCategory: _.in(sceneCategories)
    })
  }

  // 食材分类筛选
  if (ingredientCategories && ingredientCategories.length > 0) {
    conditions.push({
      ingredientCategory: _.in(ingredientCategories)
    })
  }

  // 可选标签筛选
  if (optionalTags && optionalTags.length > 0) {
    conditions.push({
      optionalTags: _.in(optionalTags)
    })
  }

  // 制作时间筛选
  if (preparationTime) {
    const timeValue = parseInt(preparationTime)
    if (timeValue === 10) {
      conditions.push({
        'preparationTime.value': '10'
      })
    } else if (timeValue === 30) {
      conditions.push({
        'preparationTime.value': '30'
      })
    } else if (timeValue === 60) {
      conditions.push({
        'preparationTime.value': '60'
      })
    } else if (timeValue === 120) {
      conditions.push({
        'preparationTime.value': '120'
      })
    }
  }

  // 合并所有条件
  let whereCondition = conditions.length > 0 ? _.and(conditions) : {}

  const result = await query
    .where(whereCondition)
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  // 获取创建者信息，添加错误处理
  const recipes = await Promise.all(result.data.map(async (recipe) => {
    try {
      const userResult = await db.collection('users').where({
        openid: recipe.creatorId
      }).get()
      
      const user = userResult.data.length > 0 ? userResult.data[0] : null
      return {
        ...recipe,
        creator: user ? { 
          nickname: user.nickname || '未知用户', 
          avatar: user.avatar || '' 
        } : { nickname: '未知用户', avatar: '' },
        createTime: formatTime(recipe.createdAt)
      }
    } catch (error) {
      console.error('获取用户信息失败:', error)
      return {
        ...recipe,
        creator: { nickname: '未知用户', avatar: '' },
        createTime: formatTime(recipe.createdAt)
      }
    }
  }))

  return {
    success: true,
    data: {
      recipes,
      total: result.data.length
    }
  }
}


// 格式化时间
function formatTime(date) {
  const now = new Date()
  const diff = now - date
  const days = Math.floor(diff / (24 * 60 * 60 * 1000))
  
  if (days === 0) {
    return '今天'
  } else if (days === 1) {
    return '昨天'
  } else if (days < 7) {
    return `${days}天前`
  } else {
    return date.toLocaleDateString()
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
