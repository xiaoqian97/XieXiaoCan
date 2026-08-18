const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'cloudfunctions', 'blessing', 'index.js'), 'utf8')
const view = fs.readFileSync(path.join(root, 'pages', 'admin-blessing-logs', 'admin-blessing-logs.wxml'), 'utf8')
const page = fs.readFileSync(path.join(root, 'pages', 'admin-blessing-logs', 'admin-blessing-logs.js'), 'utf8')

assert(source.includes("case 'getAdminLogs'"))
assert(source.includes("case 'getAdminLogDetail'"))
assert(source.includes('requirePrimaryAdmin(openid)'))
assert(source.includes("type = category === 'festival' ? 'festival' : 'custom'"))
assert(source.includes("item.status === 'sent' && !item.readAt && !item.dismissedAt"))
assert(page.includes('节日祝福'))
assert(page.includes('好友送出'))
assert(view.includes('祝福详情'))

console.log('blessing admin logs: pass')
