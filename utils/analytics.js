let currentSession = null
let heartbeatTimer = null

const callAnalytics = data => {
  const app = getApp()
  if (!app || !app.isLoggedIn || !app.isLoggedIn() || app.globalData.isPreviewMode) return Promise.resolve()
  return wx.cloud.callFunction({ name: 'analytics', data }).catch(() => {})
}

const startSession = () => {
  if (currentSession) return Promise.resolve(currentSession.sessionId)
  const app = getApp()
  if (!app || !app.isLoggedIn || !app.isLoggedIn() || app.globalData.isPreviewMode) return Promise.resolve('')
  const sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  currentSession = { sessionId, startedAt: Date.now() }
  heartbeatTimer = setInterval(() => updateSession(false), 30000)
  return callAnalytics({
    action: 'startSession',
    sessionId,
    appVersion: app.globalData.version || '',
    envVersion: app.globalData.envVersion || ''
  }).then(() => sessionId)
}

const updateSession = ended => {
  if (!currentSession) return Promise.resolve()
  const session = currentSession
  const durationSeconds = Math.max(1, Math.round((Date.now() - session.startedAt) / 1000))
  if (ended) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
    currentSession = null
  }
  return callAnalytics({
    action: 'updateSession',
    sessionId: session.sessionId,
    durationSeconds,
    ended: Boolean(ended)
  })
}

const trackEvent = (eventName, metadata = {}) => {
  if (!eventName) return
  callAnalytics({ action: 'trackEvent', eventName, metadata })
}

module.exports = { startSession, updateSession, trackEvent }
