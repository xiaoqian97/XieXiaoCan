const assert = require('assert')
const fs = require('fs')

let definition
global.Component = value => { definition = value }
global.wx = { getStorageSync: () => '', cloud: {} }
require('../components/recipe-item/recipe-item.js')

const item = {
  data: { ...definition.data },
  setData(value) { Object.assign(this.data, value) },
  ...definition.methods
}

// 没图：按食材分类给占位图标
item.updateDisplayImage({ images: [], ingredientCategory: 'vegetable' })
assert.strictEqual(item.data.hasRealImage, false)
assert.strictEqual(item.data.placeholderEmoji, '🥬')
assert.strictEqual(item.data.displayImage, '')

// 通用兜底图等同于没图，不能拿别的菜的照片顶上
item.updateDisplayImage({ images: ['/images/default-recipe.jpg'], ingredientCategory: 'seafood' })
assert.strictEqual(item.data.hasRealImage, false)
assert.strictEqual(item.data.placeholderEmoji, '🐟')

// 真图正常显示
item.updateDisplayImage({ displayImage: 'https://example.com/a.jpg', ingredientCategory: 'meat' })
assert.strictEqual(item.data.hasRealImage, true)
assert.strictEqual(item.data.displayImage, 'https://example.com/a.jpg')

// 分类缺失时兜底到通用图标
item.updateDisplayImage({ images: [], ingredientCategory: '' })
assert.strictEqual(item.data.placeholderEmoji, '🍽️')

const itemView = fs.readFileSync('components/recipe-item/recipe-item.wxml', 'utf8')
const itemStyle = fs.readFileSync('components/recipe-item/recipe-item.wxss', 'utf8')
assert(itemView.includes('wx:if="{{hasRealImage}}"'))
assert(itemView.includes('recipe-image-placeholder'))
assert(itemStyle.includes('.recipe-image-placeholder'))

// 详情页：没图时走占位块，且不再把本地兜底图塞进 recipe.images
const detailPage = fs.readFileSync('pages/recipe-detail/recipe-detail.js', 'utf8')
const detailView = fs.readFileSync('pages/recipe-detail/recipe-detail.wxml', 'utf8')
const detailStyle = fs.readFileSync('pages/recipe-detail/recipe-detail.wxss', 'utf8')
assert(!detailPage.includes("['/images/default-recipe.jpg']"))
assert(detailView.includes('hero-placeholder'))
assert(detailView.includes('ingredientCategoryInfo.emoji'))
assert(detailStyle.includes('.hero-placeholder'))
assert(detailView.includes('detail-loading-mask'))
assert(detailView.includes('正在端上这道菜'))
assert(detailView.includes('retryLoadRecipe'))
assert(detailPage.includes('this.resolveRecipeImages()).then(() =>'))
assert(detailPage.includes('return this.checkFavoriteStatus()'))
assert(detailStyle.includes('z-index: 3000'))

// 馋图不再是必填
const formPage = fs.readFileSync('pages/recipe-form/recipe-form.js', 'utf8')
assert(!formPage.includes("imageRequiredClass: 'required'"))
assert(!formPage.includes('先来一张馋图'))
assert(!formPage.includes('validateForPublish'))

console.log('recipe image placeholder: pass')
