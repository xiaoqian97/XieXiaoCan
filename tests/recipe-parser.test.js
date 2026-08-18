const assert = require('assert')
const fs = require('fs')
const parser = require('../utils/recipeParser')
const template = require('../utils/recipeTemplate')
const tagData = require('../utils/tagData')

// 1. 标准模板：字段全部命中
const standard = [
  '菜名：红烧肉',
  '食材分类：肉类',
  '场景：随便',
  '食材：带皮五花肉 500g；生姜 20g',
  '配料：大葱 30g；八角 2个',
  '调料：冰糖 30g；生抽 30ml',
  '步骤：1、五花肉切块冷水下锅焯水；2、锅中炒糖色，倒入肉块裹匀；3、加热水小火焖50分钟',
  '描述：色泽红亮，软糯入味',
  '标签：炖菜、家常味、甜味',
  '用时：50分钟',
  '难度：中等',
  '人数：3-4人',
  '链接：http://xhslink.com/abc'
].join('\n')

const base = parser.parseRecipeTemplate(standard)
assert.strictEqual(base.ok, true)
assert.deepStrictEqual(base.warnings, [])
assert.strictEqual(base.fields.name, '红烧肉')
assert.strictEqual(base.fields.ingredientCategory, 'meat')
assert.strictEqual(base.fields.sceneCategory, 'daily')
assert.deepStrictEqual(base.fields.ingredients, [
  { id: 'ing_1', name: '带皮五花肉', amount: '500g' },
  { id: 'ing_2', name: '生姜', amount: '20g' }
])
assert.strictEqual(base.fields.sideIngredients, '大葱 30g；八角 2个')
assert.strictEqual(base.fields.seasonings, '冰糖 30g；生抽 30ml')
assert.strictEqual(base.fields.steps.length, 3)
assert.strictEqual(base.fields.steps[0].content, '五花肉切块冷水下锅焯水')
assert.strictEqual(base.fields.steps[2].content, '加热水小火焖50分钟')
assert.deepStrictEqual(base.fields.optionalTags, ['stew', 'home_style', 'sweet'])
assert.strictEqual(base.fields.preparationTime, '50')
assert.strictEqual(base.fields.difficulty, 2)
assert.strictEqual(base.fields.servingSize, '3-4')
assert.strictEqual(base.fields.xiaohongshuUrl, 'http://xhslink.com/abc')

// 2. AI 输出污染：前言、代码围栏、markdown 强调都要能剥掉
const polluted = [
  '好的，已经帮你填好了：',
  '```',
  '**菜名**：番茄炒蛋',
  '- **食材分类**：蛋类',
  '**场景**：快手',
  '**食材**：番茄 2个；鸡蛋 3个',
  '**步骤**：1. 番茄切块，鸡蛋打散。2. 炒熟鸡蛋盛出。3. 炒番茄出汁，倒入鸡蛋翻匀。',
  '```',
  '希望你喜欢！'
].join('\n')

const dirty = parser.parseRecipeTemplate(polluted)
assert.strictEqual(dirty.ok, true)
assert.strictEqual(dirty.fields.name, '番茄炒蛋')
assert.strictEqual(dirty.fields.ingredientCategory, 'egg')
assert.strictEqual(dirty.fields.sceneCategory, 'quick')
assert.strictEqual(dirty.fields.steps.length, 3)
assert.strictEqual(dirty.fields.steps[1].content, '炒熟鸡蛋盛出')

// 3. 别名、换行式食材、顿号步骤不被切碎
const aliased = [
  '菜品名称：清蒸鲈鱼',
  '主要食材：海鲜',
  '适合场景：宴客',
  '用料：',
  '鲈鱼 1条',
  '生姜：15g',
  '做法：',
  '1. 鱼身两面改刀，抹盐和料酒腌10分钟',
  '2. 水开后上锅，加入姜片、葱段、香菜梗一起蒸8分钟',
  '耗时：15分钟',
  '份量：2人'
].join('\n')

const alias = parser.parseRecipeTemplate(aliased)
assert.strictEqual(alias.fields.ingredientCategory, 'seafood')
assert.strictEqual(alias.fields.sceneCategory, 'guest')
assert.deepStrictEqual(alias.fields.ingredients, [
  { id: 'ing_1', name: '鲈鱼', amount: '1条' },
  { id: 'ing_2', name: '生姜', amount: '15g' }
])
assert.strictEqual(alias.fields.steps.length, 2)
assert.strictEqual(alias.fields.steps[1].content, '水开后上锅，加入姜片、葱段、香菜梗一起蒸8分钟')
assert.strictEqual(alias.fields.preparationTime, '15')
assert.strictEqual(alias.fields.servingSize, '1-2')

// 4. 枚举写错：字段留空并给出提示，不静默瞎填
const wrongEnum = parser.parseRecipeTemplate([
  '菜名：乱写的菜',
  '食材分类：预制菜',
  '场景：深夜食堂',
  '食材：随便 适量',
  '标签：炒菜、分子料理'
].join('\n'))
assert.strictEqual(wrongEnum.fields.ingredientCategory, undefined)
assert.strictEqual(wrongEnum.fields.sceneCategory, undefined)
assert.deepStrictEqual(wrongEnum.fields.optionalTags, ['stir_fry'])
assert.strictEqual(wrongEnum.warnings.filter(item => item.indexOf('食材分类') >= 0).length, 1)
assert.strictEqual(wrongEnum.warnings.filter(item => item.indexOf('场景') >= 0).length, 1)
assert.strictEqual(wrongEnum.warnings.filter(item => item.indexOf('分子料理') >= 0).length, 1)

// 5. 超长内容按表单上限截断
const longName = '一二三四五六七八九十一二三四五六七八九十一二三'
const longIngredient = '低筋面粉过筛后再称重的那一小份备用 一大勺半再加一点点儿最后'
const longStep = '把' + '所有食材切好'.repeat(50)
const overflow = parser.parseRecipeTemplate([
  '菜名：' + longName,
  '食材：' + longIngredient,
  '步骤：' + longStep,
  '标签：炒菜、蒸菜、炖菜、凉拌、汤品、油炸、烧烤、水煮、川菜'
].join('\n'))
assert.strictEqual(overflow.fields.name.length, 20)
assert.strictEqual(overflow.fields.ingredients[0].name.length, 15)
assert.strictEqual(overflow.fields.ingredients[0].amount.length, 10)
assert.strictEqual(overflow.fields.steps[0].content.length, 200)
assert.strictEqual(overflow.fields.optionalTags.length, 8)
assert.strictEqual(overflow.warnings.filter(item => item.indexOf('标签最多') >= 0).length, 1)

// 6. AI 先回显空模板再给填好的：取非空的那一份
const echoed = parser.parseRecipeTemplate([
  template.buildBlankTemplate(),
  '',
  '菜名：麻婆豆腐',
  '食材：嫩豆腐 400g'
].join('\n'))
assert.strictEqual(echoed.fields.name, '麻婆豆腐')
assert.strictEqual(echoed.fields.ingredients.length, 1)

// 7. 没有用量时补「适量」，保证必填校验能过
const noAmount = parser.parseRecipeTemplate('菜名：白灼菜心\n食材：菜心；蚝油')
assert.deepStrictEqual(noAmount.fields.ingredients, [
  { id: 'ing_1', name: '菜心', amount: '适量' },
  { id: 'ing_2', name: '蚝油', amount: '适量' }
])
assert.deepStrictEqual(tagData.validateRequiredFields({
  name: noAmount.fields.name,
  sceneCategory: 'daily',
  ingredientCategory: 'vegetable',
  ingredients: noAmount.fields.ingredients
}), [])

// 8. 非模板内容不误判
assert.strictEqual(parser.isTemplateText('今天天气不错，晚上吃点啥'), false)
assert.strictEqual(parser.isTemplateText(standard), true)
const notTemplate = parser.parseRecipeTemplate('今天天气不错，晚上吃点啥')
assert.strictEqual(notTemplate.ok, false)
assert.strictEqual(notTemplate.warnings.length, 1)

// 9. 空输入与超长输入
assert.strictEqual(parser.parseRecipeTemplate('').ok, false)
assert.strictEqual(parser.parseRecipeTemplate('  ').warnings[0], '剪贴板是空的')
const huge = parser.parseRecipeTemplate('菜名：撑爆\n' + '啊'.repeat(parser.MAX_INPUT_LENGTH))
assert.strictEqual(huge.ok, false)
assert(huge.warnings[0].indexOf('太长') >= 0)

// 10. 提示词模板与 tagData 保持同步
const prompt = template.buildAiPrompt()
tagData.getIngredientCategories().forEach(item => assert(prompt.indexOf(item.name) >= 0))
tagData.getSceneCategories().forEach(item => assert(prompt.indexOf(item.shortName) >= 0))
tagData.getCookingMethods().concat(tagData.getFlavorTypes()).forEach(item => assert(prompt.indexOf(item.name) >= 0))
tagData.getPreparationTimes().forEach(item => assert(prompt.indexOf(item.label) >= 0))
template.TEMPLATE_KEYS.forEach(key => assert(prompt.indexOf(key + '：') >= 0))

// 11. 页面接线：入口、复制、剪贴板、三选一弹窗
const formPage = fs.readFileSync('pages/recipe-form/recipe-form.js', 'utf8')
const formView = fs.readFileSync('pages/recipe-form/recipe-form.wxml', 'utf8')
const dialogView = fs.readFileSync('components/theme-confirm-dialog/theme-confirm-dialog.wxml', 'utf8')
const formStyle = fs.readFileSync('pages/recipe-form/recipe-form.wxss', 'utf8')
assert(formView.includes('class="ai-fab'))
assert(formView.includes('showTemplateEntry'))
assert(formView.includes('catchtouchmove="onFabTouchMove"'))
assert(formView.includes('style="left: {{fabLeft}}px; top: {{fabTop}}px;"'))
assert(formStyle.includes('.ai-fab'))
assert(formStyle.includes('position: fixed'))
assert(formPage.includes("require('../../utils/recipeTemplate')"))
assert(formPage.includes("require('../../utils/recipeParser')"))
assert(formPage.includes('wx.getClipboardData'))
assert(formPage.includes('recipe_ai_template_copied_at'))
assert(formPage.includes('recipe_ai_fab_position'))
assert(formPage.includes('openAiPanel'))
assert(formPage.includes('applyParsedRecipe'))
assert(dialogView.includes('extraText'))

console.log('recipe parser: pass')
