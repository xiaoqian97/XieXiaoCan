const assert = require('assert')
const fs = require('fs')

const read = file => fs.readFileSync(file, 'utf8')

const recipeForm = read('pages/recipe-form/recipe-form.js')
const recipeFormView = read('pages/recipe-form/recipe-form.wxml')
const recipeFormStyle = read('pages/recipe-form/recipe-form.wxss')
assert(recipeForm.includes("initialLoading: false"))
assert(recipeForm.includes("initialLoadError: ''"))
assert(recipeForm.includes('retryInitialLoad()'))
assert(recipeFormView.includes('form-loading-mask'))
assert(recipeFormView.includes('原来的内容加载完成后才能编辑'))
assert(recipeFormStyle.includes('z-index: 3000'))

const analytics = read('pages/admin-analytics/admin-analytics.js')
const blessings = read('pages/blessings/blessings.js')
const blessingLogs = read('pages/admin-blessing-logs/admin-blessing-logs.js')
assert(analytics.includes('_analyticsRequestId'))
assert(blessings.includes('_blessingRequestId'))
assert(blessings.includes('mode !== this.data.activeTab'))
assert(blessingLogs.includes('_logRequestId'))
assert(blessingLogs.includes('category !== this.data.category'))

for (const page of ['favorites', 'memories', 'wish-list']) {
  const source = read(`pages/${page}/${page}.js`)
  assert(source.includes('onPullDownRefresh()'))
  assert(source.includes('.finally(() => wx.stopPullDownRefresh())'))
  assert(source.includes('return Promise.resolve()'))
}

const friendRequests = read('pages/friend-requests/friend-requests.js')
assert(friendRequests.includes('loadUserProfileSummary'))
assert(friendRequests.includes('Promise.all(['))
assert(friendRequests.includes('this.loadRequestsData()'))

const recipeList = read('pages/recipe-list/recipe-list.js')
assert(recipeList.includes('this.refreshData().finally(() => wx.stopPullDownRefresh())'))
assert(recipeList.includes('return this.loadRecipes()'))

console.log('loading and pull refresh: pass')
