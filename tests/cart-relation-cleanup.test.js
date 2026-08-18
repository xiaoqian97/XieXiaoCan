const assert = require('assert')

const storage = Object.create(null)
global.getApp = () => ({ globalData: { openid: 'diner-a' } })
global.wx = {
  getStorageSync: key => storage[key],
  setStorageSync: (key, value) => { storage[key] = value },
  removeStorageSync: key => { delete storage[key] }
}

const cartManager = require('../utils/cartManager')
cartManager.saveCartData({
  cartItems: [
    { recipeId: '1', authorId: 'chef-old', isSelected: true },
    { recipeId: '2', authorId: 'chef-new', isSelected: false }
  ]
})

assert.strictEqual(cartManager.removeByAuthor('chef-old'), true)
const cart = cartManager.getCartData()
assert.deepStrictEqual(cart.cartItems.map(item => item.recipeId), ['2'])
assert.strictEqual(cart.totalCount, 1)
assert.strictEqual(cart.selectedCount, 0)
console.log('cart relation cleanup: pass')
