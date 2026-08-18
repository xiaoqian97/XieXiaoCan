const assert = require('assert')
const fs = require('fs')

const orderCloud = fs.readFileSync('cloudfunctions/order/index.js', 'utf8')
const orderPage = fs.readFileSync('pages/order-detail/order-detail.js', 'utf8')
const memories = fs.readFileSync('pages/memories/memories.wxml', 'utf8')

assert(orderCloud.includes("case 'saveMemoryNote'"))
assert(orderCloud.includes('memoryNoteUpdatedAt'))
assert(orderCloud.includes("event === 'memoryNote'"))
assert(orderPage.includes('openMemoryModal'))
assert(orderPage.includes("action: 'saveMemoryNote'"))
assert(memories.includes('item.memoryNote'))

console.log('memory note: pass')
