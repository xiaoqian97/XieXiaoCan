const assert = require('assert')

let page
global.Page = definition => { page = definition }
require('../pages/admin-data/admin-data.js')

const groups = page.groupOrdersByAssignee([
  { _id: '1', assigneeId: 'chef-a', assigneeName: '小千' },
  { _id: '2', assigneeId: 'chef-b', assigneeName: '小明' },
  { _id: '3', assigneeId: 'chef-a', assigneeName: '小千' }
])

assert.strictEqual(groups.length, 2)
assert.deepStrictEqual(groups[0].orders.map(order => order._id), ['1', '3'])
console.log('admin data grouping: pass')
