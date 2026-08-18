const assert = require('assert')
const fs = require('fs')

const orderSource = fs.readFileSync('cloudfunctions/order/index.js', 'utf8')
const loginSource = fs.readFileSync('pages/login/login.js', 'utf8')

assert(/status === 'completed'\s*\? await sendOrderSubscribeMessage\('orderStatus'/.test(orderSource))
assert(orderSource.includes("createOrderNotification('created'"))
assert(orderSource.includes('createOrderNotification(status'))
assert(loginSource.includes('if (res.isNewUser)'))
assert(loginSource.includes('subscribe.requestAll()'))

console.log('subscribe strategy: pass')
