const assert = require('assert')
const fs = require('fs')

const cloud = fs.readFileSync('cloudfunctions/recipe/index.js', 'utf8')

// 删除菜谱要级联清理引用，否则统计虚高、饭篮留钉子
assert(cloud.includes('await cleanupRecipeReferences(recipeId)'))
assert(cloud.includes('async function cleanupRecipeReferences('))
assert(cloud.includes("['favorites', db.collection('favorites').where({ recipeId })]"))
assert(cloud.includes("['recipe_interactions', db.collection('recipe_interactions').where({ recipeId })]"))
assert(cloud.includes("['recipe_views', db.collection('recipe_views').where({ recipeId })]"))
assert(cloud.includes('cartItems: _.elemMatch({ recipeId })'))
assert(cloud.includes('item.recipeId !== recipeId'))

// 清理失败不能把删除整体带崩：每个清理都要单独兜住
const cleanup = cloud.slice(cloud.indexOf('async function cleanupRecipeReferences('))
assert(cleanup.slice(0, cleanup.indexOf('\n}\n')).split('catch').length - 1 >= 2)

// 作者信息批量查询，替代每条菜谱查一次 users
assert(cloud.includes('async function attachCreators('))
assert(cloud.includes('openid: _.in(creatorIds)'))
assert.strictEqual(cloud.split('const recipes = await attachCreators(result.data)').length - 1, 3)
// 详情页只查一条，保留单次查询是合理的；列表函数不应再出现逐条查询作者的写法
const listFunctions = ['getRecipeList', 'getMyRecipes', 'getFriendRecipes']
listFunctions.forEach(name => {
  const start = cloud.indexOf('async function ' + name + '(')
  assert(start > 0, name + ' 不存在')
  const body = cloud.slice(start, cloud.indexOf('\n}\n', start))
  assert(!body.includes('openid: recipe.creatorId'), name + ' 仍在逐条查询作者')
})

console.log('recipe cleanup and creators: pass')
