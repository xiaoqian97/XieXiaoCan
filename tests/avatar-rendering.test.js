const assert = require('assert')
const fs = require('fs')

const requestPage = fs.readFileSync('pages/friend-requests/friend-requests.js', 'utf8')
const analyticsPage = fs.readFileSync('pages/admin-analytics/admin-analytics.js', 'utf8')

assert(requestPage.includes("util.resolveCloudImages(pendingRequests.map(item => item.avatar), '/images/default-avatar.png')"))
assert(requestPage.includes("util.resolveCloudImages(receivedHistoryRequests.map(item => item.avatar), '/images/default-avatar.png')"))
assert(requestPage.includes("util.resolveCloudImages(sentRequests.map(item => item.avatar), '/images/default-avatar.png')"))
assert(requestPage.includes('this.loadRequestsData()'))
assert(analyticsPage.includes('util.resolveCloudImages(users.map(item => item.avatar), util.DEFAULT_AVATAR)'))
assert(analyticsPage.includes('util.resolveCloudImages(chefs.map(chef => chef.avatar), util.DEFAULT_AVATAR)'))

console.log('avatar rendering: pass')
