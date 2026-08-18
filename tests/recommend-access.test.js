const assert = require('assert')
const fs = require('fs')

const cloudSource = fs.readFileSync('cloudfunctions/recipe/index.js', 'utf8')
const pageSource = fs.readFileSync('pages/index/index.js', 'utf8')
const pageStyle = fs.readFileSync('pages/index/index.wxss', 'utf8')

assert(cloudSource.includes("const viewer = userResult.data[0] || null"))
assert(cloudSource.includes("} else if (event.scope === 'public') {"))
assert(cloudSource.includes("data: { recipes: [], needsFixedFeeder: true }"))
assert(pageSource.includes('this.data.isDataLoaded && identityChanged'))
assert(pageSource.includes("this.setData({ recommendRecipes: [], recommendNeedsFixedFeeder: false })"))
assert(pageStyle.includes('.recipe-card {\n  display: flex;'))
assert(pageStyle.includes('width: 208rpx;\n  height: 208rpx;'))
assert(pageStyle.includes('flex-wrap: wrap;'))

console.log('recommend access: pass')
