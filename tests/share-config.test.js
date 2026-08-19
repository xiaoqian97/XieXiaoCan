const assert = require('assert')
const fs = require('fs')
const share = require('../utils/share')

const recipe = share.getRecipeShare({
  _id: 'recipe-1',
  name: '红烧肉',
  images: ['https://example.com/recipe.jpg']
})
assert(recipe.title.includes('红烧肉'))
assert(recipe.path.includes('recipe-1'))
assert.strictEqual(recipe.imageUrl, 'https://example.com/recipe.jpg')

const order = share.getOrderShare({
  _id: 'order-1',
  status: 'pending',
  creatorName: '小千',
  mealTypeLabel: '晚餐',
  recipes: [{ displayImage: 'https://example.com/order.jpg' }]
})
assert(order.title.includes('小千'))
assert(order.path.includes('order-1'))
assert.strictEqual(order.imageUrl, 'https://example.com/order.jpg')

const wish = share.getWishShare({
  _id: 'wish-1',
  name: '糖醋排骨',
  submitterName: '她'
}, '/pages/recipe-form/recipe-form?mode=acceptWish&wishId=wish-1')
assert(wish.title.includes('糖醋排骨'))
assert(wish.path.includes('wish-1'))

assert.strictEqual(share.getRecipeShare({}).imageUrl, share.BRAND_SHARE_IMAGE)

const appConfig = JSON.parse(fs.readFileSync('app.json', 'utf8'))
const orderPage = fs.readFileSync('pages/diancan/diancan.js', 'utf8')
const wishPage = fs.readFileSync('pages/recipe-form/recipe-form.js', 'utf8')
const shareDialog = fs.readFileSync('components/post-create-share-dialog/post-create-share-dialog.wxml', 'utf8')
const shareDialogLogic = fs.readFileSync('components/post-create-share-dialog/post-create-share-dialog.js', 'utf8')
assert.strictEqual(appConfig.usingComponents['post-create-share-dialog'], '/components/post-create-share-dialog/post-create-share-dialog')
assert(orderPage.includes('_postCreateOrderShare'))
assert(wishPage.includes('_postCreateWishShare'))
assert(shareDialog.includes('open-type="share"'))
assert(shareDialogLogic.includes("value: '分享给投喂官'"))
console.log('share config: pass')
