const assert = require('assert')

let definition
global.Component = value => { definition = value }
require('../components/feeder-switch-dialog/feeder-switch-dialog.js')

const dialog = {
  data: { ...definition.data },
  setData(value) { Object.assign(this.data, value) },
  ...definition.methods
}

async function run() {
  const confirmation = dialog.open({ previousName: '小千', nextName: '小明' })
  assert.strictEqual(dialog.data.visible, true)
  assert.strictEqual(dialog.data.isSwitch, true)
  dialog.confirm()
  assert.strictEqual(await confirmation, true)
  assert.strictEqual(dialog.data.visible, false)
  console.log('feeder switch dialog: pass')
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
