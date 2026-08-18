// AI 填表模板 - 供「复制模板问 AI」使用
// 模板里的可选值全部来自 tagData，改了标签或分类这里会自动同步。
const {
  getSceneCategories,
  getIngredientCategories,
  getCookingMethods,
  getFlavorTypes,
  getPreparationTimes,
  getDifficultyLevels,
  getServingSizes
} = require('./tagData')

const TEMPLATE_KEYS = [
  '菜名',
  '食材分类',
  '场景',
  '食材',
  '配料',
  '调料',
  '步骤',
  '描述',
  '标签',
  '用时',
  '难度',
  '人数',
  '链接'
]

// 空模板：每个字段一行，AI 只需要在冒号后补内容
function buildBlankTemplate() {
  return TEMPLATE_KEYS.map(key => `${key}：`).join('\n')
}

function joinNames(list, key) {
  return list.map(item => item[key || 'name']).join(' / ')
}

// 完整提示词：规则 + 空模板 + 待填信息，用户复制后直接发给 AI
function buildAiPrompt() {
  const sceneNames = joinNames(getSceneCategories(), 'shortName')
  const ingredientNames = joinNames(getIngredientCategories())
  const tagNames = [...getCookingMethods(), ...getFlavorTypes()].map(item => item.name).join('、')
  const timeNames = getPreparationTimes().map(item => item.label).join(' / ')
  const difficultyNames = joinNames(getDifficultyLevels(), 'label')
  const servingNames = joinNames(getServingSizes(), 'label')

  return [
    '请帮我填写下面的菜谱模板，用于录入一个家庭菜谱小程序。',
    '',
    '【填写规则】',
    '1. 只输出填好的模板本身，不要代码块，不要任何解释性文字',
    `2. 「食材分类」只能从这些里选一个：${ingredientNames}`,
    `3. 「场景」只能从这些里选一个：${sceneNames}`,
    `4. 「标签」只能从这些里选，最多 8 个，用顿号分隔：${tagNames}`,
    `5. 「用时」从这些档位里选最接近的：${timeNames}`,
    `6. 「难度」只能是：${difficultyNames}`,
    `7. 「人数」只能是：${servingNames}`,
    '8. 每个食材都要写「名称 用量」，多个食材用分号隔开；实在没有用量就写「适量」',
    '9. 步骤用 1、2、3… 编号，或者用分号隔开',
    '10. 菜名不超过 20 字，描述不超过 100 字，每个步骤不超过 200 字',
    '11. 如果你无法访问我给的链接，必须在「描述」开头注明「（未读取链接）」',
    '',
    '【模板】',
    buildBlankTemplate(),
    '',
    '我要做的菜是：',
    '参考链接：'
  ].join('\n')
}

module.exports = {
  TEMPLATE_KEYS,
  buildBlankTemplate,
  buildAiPrompt
}
