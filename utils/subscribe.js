const util = require('./util')

let templates = {}
let loadingPromise = null

function preload(force = false) {
  if (!force && Object.keys(templates).length) return Promise.resolve(templates)
  if (loadingPromise) return loadingPromise
  loadingPromise = util.callCloudFunction('notification', { action: 'getSubscribeConfig' })
    .then(res => {
      templates = (res.data && res.data.templates) || {}
      return templates
    })
    .catch(() => templates)
    .finally(() => {
      loadingPromise = null
    })
  return loadingPromise
}

function requestNext(kind) {
  const templateId = templates[kind]
  if (!templateId || !wx.requestSubscribeMessage) {
    return Promise.resolve({ requested: false })
  }

  return new Promise(resolve => {
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: result => resolve({
        requested: true,
        accepted: ['accept', 'acceptWithAudio'].includes(result[templateId])
      }),
      fail: error => resolve({ requested: true, accepted: false, error })
    })
  })
}

function requestAll() {
  const templateIds = [...new Set(Object.values(templates).filter(Boolean))].slice(0, 3)
  if (!templateIds.length || !wx.requestSubscribeMessage) {
    return Promise.resolve({ requested: false, acceptedCount: 0 })
  }

  return new Promise(resolve => {
    wx.requestSubscribeMessage({
      tmplIds: templateIds,
      success: result => resolve({
        requested: true,
        acceptedCount: templateIds.filter(id => ['accept', 'acceptWithAudio'].includes(result[id])).length
      }),
      fail: error => resolve({ requested: true, acceptedCount: 0, error })
    })
  })
}

module.exports = {
  preload,
  requestNext,
  requestAll
}
