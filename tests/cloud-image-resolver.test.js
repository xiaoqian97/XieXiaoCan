const assert = require('assert')

const fileID = 'cloud://test-env/recipes/test.jpg'
const tempFileURL = 'https://example.com/test.jpg'
const calls = []

global.getApp = () => ({})
global.wx = {
  cloud: {
    getTempFileURL({ fail }) {
      fail(new Error('客户端无权读取'))
    },
    callFunction({ name, data, success }) {
      assert.strictEqual(name, 'recipe')
      assert.strictEqual(data.action, 'resolveImages')
      calls.push(data.fileIDs)
      success({
        result: {
          success: true,
          data: {
            files: data.fileIDs.map(id => ({
              fileID: id,
              tempFileURL: id === fileID ? tempFileURL : `https://example.com/${encodeURIComponent(id)}`
            }))
          }
        }
      })
    }
  }
}

const util = require('../utils/util')

async function run() {
  const result = await util.resolveCloudImage(fileID)
  assert.strictEqual(result, tempFileURL)

  calls.length = 0
  const fileIDs = Array.from({ length: 51 }, (_, index) => `cloud://test-env/recipes/${index}.jpg`)
  const urls = await util.resolveCloudImages(fileIDs)
  assert.strictEqual(urls.length, 51)
  assert.deepStrictEqual(calls.map(batch => batch.length), [50, 1])
  console.log('cloud image resolver: pass')
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
