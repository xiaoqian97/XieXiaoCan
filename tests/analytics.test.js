const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const cloudSource = fs.readFileSync(path.join(root, 'cloudfunctions', 'analytics', 'index.js'), 'utf8')
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
const adminView = fs.readFileSync(path.join(root, 'pages', 'admin', 'admin.wxml'), 'utf8')
const analyticsView = fs.readFileSync(path.join(root, 'pages', 'admin-analytics', 'admin-analytics.wxml'), 'utf8')
const analyticsPage = fs.readFileSync(path.join(root, 'pages', 'admin-analytics', 'admin-analytics.js'), 'utf8')
const recipeDetail = fs.readFileSync(path.join(root, 'pages', 'recipe-detail', 'recipe-detail.wxml'), 'utf8')
const rules = JSON.parse(fs.readFileSync(path.join(root, 'database.rules.json'), 'utf8'))

assert(cloudSource.includes("case 'startSession'"))
assert(cloudSource.includes("case 'trackEvent'"))
assert(cloudSource.includes('requirePrimaryAdmin(openid)'))
assert(cloudSource.includes("transaction.collection('analytics_daily_stats')"))
assert(appSource.includes("require('./utils/analytics').startSession()"))
assert(adminView.includes('wx:if="{{isPrimaryAdmin}}"'))
assert(analyticsView.includes('recipe.displayImage'))
assert(analyticsPage.includes('readonly=1'))
assert(recipeDetail.includes('!readOnly'))
assert(fs.readFileSync(path.join(root, 'pages', 'recipe-detail', 'recipe-detail.js'), 'utf8').includes('this.loadRecipeDetail(!readOnly)'))
assert(fs.readFileSync(path.join(root, 'pages', 'recipe-detail', 'recipe-detail.js'), 'utf8').includes('/pages/friend-recipes/friend-recipes?friendId='))
for (const collection of ['analytics_sessions', 'analytics_events', 'analytics_daily_stats']) {
  assert.deepStrictEqual(rules[collection], { read: false, write: false })
}

console.log('analytics: pass')
