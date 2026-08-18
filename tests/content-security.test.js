const assert = require('assert')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const feedbackSource = fs.readFileSync(path.join(root, 'cloudfunctions', 'feedback', 'index.js'), 'utf8')
const feedbackConfig = JSON.parse(fs.readFileSync(path.join(root, 'cloudfunctions', 'feedback', 'config.json'), 'utf8'))
const recipeConfig = JSON.parse(fs.readFileSync(path.join(root, 'cloudfunctions', 'recipe', 'config.json'), 'utf8'))

assert(feedbackSource.includes('security.imgSecCheck'))
assert(feedbackSource.includes('security.msgSecCheck'))
assert(feedbackSource.includes('validateFeedbackImages(images, openid)'))
assert(feedbackSource.includes('checkTextSecurity(openid, description)'))
for (const config of [feedbackConfig, recipeConfig]) {
  assert(config.permissions.openapi.includes('security.imgSecCheck'))
  assert(config.permissions.openapi.includes('security.msgSecCheck'))
}

console.log('content security: pass')
