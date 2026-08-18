const assert = require('assert')
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
console.log('share config: pass')
