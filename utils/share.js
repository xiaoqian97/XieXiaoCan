const BRAND_SHARE_IMAGE = '/images/xie-xiaochan-logo.png'

function firstImage(items = []) {
  const item = items.find(image => typeof image === 'string' && image)
  return item || BRAND_SHARE_IMAGE
}

function getRecipeShare(recipe = {}) {
  if (!recipe._id) return getBrandShare()
  const name = recipe.name || recipe.title || '这道拿手菜'
  return {
    title: `「${name}」看起来太下饭了，快来一起点菜`,
    path: `/pages/recipe-detail/recipe-detail?id=${recipe._id}&from=share`,
    imageUrl: firstImage([...(recipe.images || []), recipe.displayImage, recipe.image])
  }
}

function getRecipeTimelineShare(recipe = {}) {
  if (!recipe._id) {
    const config = getBrandShare()
    return { title: config.title, imageUrl: config.imageUrl }
  }
  const name = recipe.name || recipe.title || '这道拿手菜'
  return {
    title: `今天想吃「${name}」｜谢小馋`,
    query: `id=${recipe._id}&from=timeline`,
    imageUrl: firstImage([...(recipe.images || []), recipe.displayImage, recipe.image])
  }
}

function getOrderShare(order = {}, orderId = '') {
  const creatorName = order.creatorName || (order.creator && order.creator.nickname) || '饭搭子'
  const mealName = order.mealTypeLabel || '今日'
  const statusTitles = {
    pending: `${creatorName}点好菜啦，等你来接这张${mealName}投喂单`,
    processing: `${creatorName}正在等开饭，来看看今天吃什么`,
    completed: `这一顿吃得好满足，来看看我们的${mealName}菜单`,
    cancelled: `这张投喂单先收好，下次再约一顿`
  }
  const recipes = order.recipes || []
  const images = recipes.reduce((result, recipe) => {
    result.push(recipe.displayImage, recipe.image)
    return result
  }, [])

  return {
    title: statusTitles[order.status] || `${creatorName}给你发来一张${mealName}投喂单`,
    path: `/pages/order-detail/order-detail?orderId=${order._id || orderId}&from=share`,
    imageUrl: firstImage(images)
  }
}

function getWishShare(wish = {}, path = '/pages/index/index') {
  const name = wish.name || '这道想吃的菜'
  const submitterName = wish.submitterName || 'TA'
  return {
    title: `${submitterName}想吃「${name}」，快来帮TA安排上桌`,
    path,
    imageUrl: firstImage([wish.displayCoverImage, wish.coverImage])
  }
}

function getBrandShare() {
  return {
    title: '今天吃什么？来谢小馋一起点菜吧',
    path: '/pages/index/index?from=share',
    imageUrl: BRAND_SHARE_IMAGE
  }
}

module.exports = {
  BRAND_SHARE_IMAGE,
  getRecipeShare,
  getRecipeTimelineShare,
  getOrderShare,
  getWishShare,
  getBrandShare
}
