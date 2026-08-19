/**
 * 格式化时间
 */
const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

/**
 * 格式化日期
 */
const formatDate = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()

  return `${[year, month, day].map(formatNumber).join('-')}`
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

const DEFAULT_RECIPE_IMAGE = '/images/default-recipe.jpg'
const DEFAULT_AVATAR = '/images/default-avatar.png'
const cloudImageCache = Object.create(null)
const cloudImageCacheAt = Object.create(null)
// 云存储临时地址有有效期，内存中只短时复用，避免小程序长时间停留后继续使用旧地址。
const CLOUD_IMAGE_CACHE_TTL = 30 * 60 * 1000

const isCloudFile = url => typeof url === 'string' && url.indexOf('cloud://') === 0

const getCachedCloudImage = fileID => {
  if (!cloudImageCache[fileID]) return ''
  if (Date.now() - Number(cloudImageCacheAt[fileID] || 0) < CLOUD_IMAGE_CACHE_TTL) {
    return cloudImageCache[fileID]
  }
  delete cloudImageCache[fileID]
  delete cloudImageCacheAt[fileID]
  return ''
}

const cacheCloudImages = urlMap => {
  const now = Date.now()
  Object.keys(urlMap || {}).forEach(fileID => {
    if (!urlMap[fileID]) return
    cloudImageCache[fileID] = urlMap[fileID]
    cloudImageCacheAt[fileID] = now
  })
}

const invalidateCloudImage = fileID => {
  if (!fileID) return
  delete cloudImageCache[fileID]
  delete cloudImageCacheAt[fileID]
}

const resolveCloudImagesByFunction = fileIDs => {
  const batches = []
  for (let index = 0; index < fileIDs.length; index += 50) {
    batches.push(fileIDs.slice(index, index + 50))
  }

  return Promise.all(batches.map(batch => callCloudFunction('recipe', {
    action: 'resolveImages',
    fileIDs: batch
  }))).then(results => {
    const urlMap = {}
    results.forEach(res => {
      ;((res.data && res.data.files) || []).forEach(file => {
        if (file.fileID && file.tempFileURL) urlMap[file.fileID] = file.tempFileURL
      })
    })
    return urlMap
  }).catch(() => ({}))
}

const resolveCloudImages = (images = [], fallback = DEFAULT_RECIPE_IMAGE) => {
  const list = (Array.isArray(images) ? images : [images]).map(item => item || fallback)
  if (!list.length) return Promise.resolve([])
  const cloudFiles = [...new Set(list.filter(item => isCloudFile(item) && !getCachedCloudImage(item)))]

  if (!cloudFiles.length) {
    return Promise.resolve(list.map(item => isCloudFile(item) ? (getCachedCloudImage(item) || fallback) : item))
  }

  const finish = clientUrlMap => {
    const missingFiles = cloudFiles.filter(fileID => !clientUrlMap[fileID])
    cacheCloudImages(clientUrlMap)
    const mergeUrls = serverUrlMap => {
      cacheCloudImages(serverUrlMap)
      return list.map(item => (
        isCloudFile(item) ? (getCachedCloudImage(item) || fallback) : item
      ))
    }

    if (!missingFiles.length) return Promise.resolve(mergeUrls({}))
    return resolveCloudImagesByFunction(missingFiles).then(mergeUrls)
  }

  if (!wx.cloud || !wx.cloud.getTempFileURL) return finish({})

  return new Promise(resolve => {
    wx.cloud.getTempFileURL({
      fileList: cloudFiles,
      success: res => {
        const urlMap = {}
        ;(res.fileList || []).forEach(file => {
          if (file.fileID && file.tempFileURL) {
            urlMap[file.fileID] = file.tempFileURL
          }
        })
        finish(urlMap).then(resolve)
      },
      fail: () => finish({}).then(resolve)
    })
  })
}

const resolveCloudImage = (image, fallback = DEFAULT_RECIPE_IMAGE) => {
  return resolveCloudImages([image], fallback).then(list => list[0])
}

/**
 * 显示加载提示
 */
const showLoading = (title = '加载中...') => {
  wx.showLoading({
    title,
    mask: true
  })
}

/**
 * 隐藏加载提示
 */
const hideLoading = () => {
  wx.hideLoading()
}

/**
 * 显示成功提示
 */
const showSuccess = (title = '操作成功') => {
  wx.showToast({
    title,
    icon: 'success',
    duration: 2000
  })
}

/**
 * 显示错误提示
 */
const showError = (title = '操作失败') => {
  wx.showToast({
    title,
    icon: 'none',
    duration: 2000
  })
}

/**
 * 显示确认对话框
 */
const showConfirm = (content, title = '提示') => {
  const pages = getCurrentPages()
  const page = pages[pages.length - 1]
  const dialog = page && page.selectComponent && page.selectComponent('#themeConfirmDialog')
  if (dialog) return dialog.open({ title, content })

  return new Promise((resolve, reject) => {
    wx.showModal({
      title,
      content,
      success: res => {
        if (res.confirm) {
          resolve(true)
        } else {
          resolve(false)
        }
      },
      fail: reject
    })
  })
}

const isLoggedIn = () => {
  const app = getApp()
  return !!(app && app.isLoggedIn && app.isLoggedIn())
}

const requireLogin = (content = '该功能需要登录后使用') => {
  if (isLoggedIn()) return true

  const pages = getCurrentPages()
  const page = pages[pages.length - 1]
  const prompt = page && page.selectComponent && page.selectComponent('#loginPrompt')
  if (prompt && prompt.show) prompt.show(content)
  return false
}

/**
 * 调用云函数
 */
const callCloudFunction = (name, data = {}) => {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data,
      success: res => {
        if (res.result && res.result.success) {
          reportBusinessEvent(name, data)
          resolve(res.result)
        } else {
          reject(new Error(res.result?.message || '操作失败'))
        }
      },
      fail: reject
    })
  })
}

const BUSINESS_EVENT_MAP = {
  'recipe:list': 'recipe_list_view',
  'recipe:myRecipes': 'recipe_list_view',
  'recipe:friendRecipes': 'recipe_list_view',
  'recipe:detail': 'recipe_detail_view',
  'recipe:search': 'recipe_search',
  'recipe:create': 'recipe_create',
  'recipe:update': 'recipe_update',
  'order:getOrderList': 'order_list_view',
  'order:createOrder': 'order_submit',
  'order:updateOrderStatus': 'order_status_update',
  'order:rateOrder': 'order_rate',
  'wish:listMine': 'wish_view',
  'wish:listFriend': 'wish_view',
  'wish:listPool': 'wish_view',
  'wish:create': 'wish_create',
  'wish:accept': 'wish_process',
  'wish:acceptAsRecipe': 'wish_process',
  'wish:reject': 'wish_process',
  'favorite:list': 'favorite_view',
  'favorite:listFriend': 'favorite_view',
  'favorite:toggle': 'favorite_toggle',
  'blessing:list': 'blessing_view',
  'blessing:detail': 'blessing_view',
  'blessing:create': 'blessing_create',
  'friend:getFriendList': 'friend_view',
  'friend:sendFriendRequest': 'friend_request',
  'friend:handleFriendRequest': 'friend_request',
  'friend:setFixedFeeder': 'fixed_feeder_change',
  'friend:clearFixedFeeder': 'fixed_feeder_change',
  'feedback:submit': 'feedback_submit',
  'notification:list': 'notification_view'
}

const reportBusinessEvent = (name, data) => {
  if (name === 'analytics') return
  const eventName = BUSINESS_EVENT_MAP[`${name}:${data.action || ''}`]
  if (!eventName) return
  const metadata = {}
  ;['recipeId', 'orderId', 'wishId', 'mode'].forEach(key => {
    if (data[key] !== undefined) metadata[key] = data[key]
  })
  require('./analytics').trackEvent(eventName, metadata)
}

/**
 * 上传文件到云存储
 */
const uploadFile = (filePath, cloudPath) => {
  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: resolve,
      fail: reject
    })
  })
}

/**
 * 生成唯一ID
 */
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

/**
 * 防抖函数
 */
const debounce = (func, wait) => {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

/**
 * 节流函数
 */
const throttle = (func, limit) => {
  let inThrottle
  return function() {
    const args = arguments
    const context = this
    if (!inThrottle) {
      func.apply(context, args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

module.exports = {
  formatTime,
  formatDate,
  resolveCloudImage,
  resolveCloudImages,
  invalidateCloudImage,
  DEFAULT_RECIPE_IMAGE,
  DEFAULT_AVATAR,
  showLoading,
  hideLoading,
  showSuccess,
  showError,
  showConfirm,
  isLoggedIn,
  requireLogin,
  callCloudFunction,
  uploadFile,
  generateId,
  debounce,
  throttle
}
