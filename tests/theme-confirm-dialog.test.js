const assert = require('assert')

let definition
global.Component = value => { definition = value }
require('../components/theme-confirm-dialog/theme-confirm-dialog.js')

const dialog = {
  data: { ...definition.data },
  setData(value) { Object.assign(this.data, value) },
  ...definition.methods
}

async function run() {
  const confirmation = dialog.open({ title: '删除菜谱', tone: 'danger', confirmText: '删除' })
  assert.strictEqual(dialog.data.visible, true)
  assert.strictEqual(dialog.data.tone, 'danger')
  dialog.confirm()
  assert.strictEqual(await confirmation, true)
  assert.strictEqual(dialog.data.visible, false)

  global.getCurrentPages = () => [{ selectComponent: () => dialog }]
  const util = require('../utils/util.js')
  const sharedConfirmation = util.showConfirm('确定退出吗？', '退出登录')
  dialog.cancel()
  assert.strictEqual(await sharedConfirmation, false)
  console.log('theme confirm dialog: pass')
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
