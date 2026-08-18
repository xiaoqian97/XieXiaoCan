const TAB_ROUTES = new Set([
  'pages/index/index',
  'pages/recipe-list/recipe-list',
  'pages/diancan/diancan',
  'pages/order-list/order-list',
  'pages/profile/profile'
])
let pendingTargetKey = ''

function splitUrl(url) {
  const value = String(url || '').replace(/^\//, '')
  const [path, query = ''] = value.split('?')
  const params = {}
  query.split('&').filter(Boolean).forEach(pair => {
    const [rawKey, rawValue = ''] = pair.split('=')
    const key = decodeURIComponent(rawKey || '')
    if (key) params[key] = decodeURIComponent(rawValue)
  })
  return { path, params }
}

function pageKey(path, params = {}) {
  const query = Object.keys(params).sort().map(key => (
    `${encodeURIComponent(key)}=${encodeURIComponent(params[key] == null ? '' : params[key])}`
  )).join('&')
  return `${path}${query ? `?${query}` : ''}`
}

function getPageKey(page) {
  return pageKey(page.route, page.options || {})
}

function navigateToTarget(url) {
  const target = splitUrl(url)
  const targetKey = pageKey(target.path, target.params)
  if (!target.path || pendingTargetKey === targetKey) return Promise.resolve()

  pendingTargetKey = targetKey
  let navigation
  if (TAB_ROUTES.has(target.path)) {
    navigation = callWxNavigation('switchTab', { url: `/${target.path}` })
  } else {
    const pages = getCurrentPages()
    const currentIndex = pages.length - 1
    const existingIndex = pages.findIndex(page => getPageKey(page) === targetKey)

    if (existingIndex === currentIndex) navigation = Promise.resolve()
    else if (existingIndex >= 0) {
      navigation = callWxNavigation('navigateBack', { delta: currentIndex - existingIndex })
    } else {
      navigation = callWxNavigation('navigateTo', { url: `/${String(url || '').replace(/^\//, '')}` })
    }
  }
  return navigation.finally(() => {
    if (pendingTargetKey === targetKey) pendingTargetKey = ''
  })
}

function callWxNavigation(method, options) {
  return new Promise((resolve, reject) => {
    wx[method]({ ...options, success: resolve, fail: reject })
  })
}

module.exports = {
  navigateToTarget,
  TAB_ROUTES
}
