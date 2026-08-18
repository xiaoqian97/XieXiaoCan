const assert = require('assert')

const calls = []
global.wx = {
  switchTab(options) { calls.push(['switchTab', options]); options.success() },
  navigateBack(options) { calls.push(['navigateBack', options]); options.success() },
  navigateTo(options) { calls.push(['navigateTo', options]); options.success() }
}

const navigation = require('../utils/navigation')

async function run() {
  global.getCurrentPages = () => [{ route: 'pages/profile/profile', options: {} }]
  await navigation.navigateToTarget('/pages/order-list/order-list')
  assert.strictEqual(calls.pop()[0], 'switchTab')

  global.getCurrentPages = () => [
    { route: 'pages/notifications/notifications', options: {} },
    { route: 'pages/order-detail/order-detail', options: { orderId: '1' } },
    { route: 'pages/profile/profile', options: {} }
  ]
  await navigation.navigateToTarget('/pages/order-detail/order-detail?orderId=1')
  const backCall = calls.pop()
  assert.strictEqual(backCall[0], 'navigateBack')
  assert.strictEqual(backCall[1].delta, 1)

  global.getCurrentPages = () => [{ route: 'pages/notifications/notifications', options: {} }]
  await navigation.navigateToTarget('/pages/blessing-detail/blessing-detail?id=2')
  assert.strictEqual(calls.pop()[0], 'navigateTo')

  console.log('navigation: pass')
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
