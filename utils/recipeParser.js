// AI 填好的模板文本 -> 表单字段
// 输入来自剪贴板，格式不可控，所有分支都要能兜住脏数据。
const {
  getSceneCategories,
  getIngredientCategories,
  getCookingMethods,
  getFlavorTypes,
  getPreparationTimes,
  getDifficultyLevels,
  getServingSizes
} = require('./tagData')

const MAX_INPUT_LENGTH = 10000

const LIMITS = {
  name: 20,
  description: 100,
  sideIngredients: 100,
  seasonings: 100,
  ingredientName: 15,
  ingredientAmount: 10,
  stepContent: 200,
  ingredientCount: 20,
  stepCount: 20,
  tagCount: 8,
  url: 200
}

const FIELD_ALIASES = {
  name: ['菜名', '菜品名称', '菜谱名称', '菜品名', '菜谱名', '名称'],
  ingredientCategory: ['食材分类', '主要食材', '主角食材', '分类'],
  sceneCategory: ['适合场景', '场景'],
  ingredients: ['所需材料', '主料', '食材', '用料', '材料'],
  sideIngredients: ['配料', '辅料', '小料'],
  seasonings: ['调味料', '调料', '料汁', '酱汁'],
  steps: ['制作步骤', '烹饪步骤', '制作过程', '步骤', '做法'],
  description: ['馋点备注', '菜品描述', '描述', '简介', '备注'],
  optionalTags: ['口味标签', '标签'],
  preparationTime: ['制作时间', '用时', '耗时', '时间'],
  difficulty: ['难易度', '难度'],
  servingSize: ['适合人数', '人数', '份量', '分量'],
  xiaohongshuUrl: ['小红书链接', '原文链接', '参考链接', '小红书', '链接']
}

// 长别名优先，避免「食材」抢走「食材分类」
const ALIAS_ENTRIES = Object.keys(FIELD_ALIASES)
  .reduce((list, field) => list.concat(FIELD_ALIASES[field].map(alias => ({ field: field, alias: alias }))), [])
  .sort((a, b) => b.alias.length - a.alias.length)

const SCENE_ALIASES = { 日常: 'daily', 家常: 'daily', 随便: 'daily', 宴客: 'guest', 待客: 'guest', 请客: 'guest', 好菜: 'guest', 快手: 'quick', 清淡: 'light', 养生: 'light', 重口: 'heavy' }
const INGREDIENT_ALIASES = { 海鲜: 'seafood', 河鲜: 'seafood', 水产: 'seafood', 鱼: 'seafood', 肉: 'meat', 肉类: 'meat', 蛋: 'egg', 鸡蛋: 'egg', 素菜: 'vegetable', 青菜: 'vegetable', 蔬菜: 'vegetable', 主食: 'staple', 面食: 'staple' }
const DIFFICULTY_ALIASES = { 简单: 1, 容易: 1, 新手: 1, 中等: 2, 一般: 2, 普通: 2, 困难: 3, 复杂: 3, 高难: 3 }

const STEP_NUMBER = /^\s*(?:\d+\s*[.、)．:：]|[（(]\s*\d+\s*[）)]|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|第[一二三四五六七八九十百零\d]+步[:：、.]?)\s*/
const URL_PATTERN = /https?:\/\/[^\s，。；;、"'）)】]+/
const CODE_FENCE = /^\s*`{3}/

function truncate(text, limit) {
  const value = String(text == null ? '' : text).trim()
  return value.length > limit ? value.slice(0, limit) : value
}

// 剥掉 AI 常见的包装：代码围栏、markdown 强调、列表符号
function cleanupText(raw) {
  return String(raw || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter(line => !CODE_FENCE.test(line))
    .map(line => line
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      .replace(/^\s*#{1,6}\s*/, '')
      .replace(/^\s*[-*•]\s+/, '')
      .replace(/^\s*[【[]\s*/, '')
      .replace(/\s*[】\]]\s*[:：]/, '：')
      .trimEnd())
    .join('\n')
}

function matchFieldLine(line) {
  const text = line.trim()
  if (!text) return null
  for (let i = 0; i < ALIAS_ENTRIES.length; i++) {
    const entry = ALIAS_ENTRIES[i]
    if (text.indexOf(entry.alias) !== 0) continue
    const rest = text.slice(entry.alias.length)
    const separator = rest.match(/^\s*[：:]\s*/)
    if (!separator) continue
    return { field: entry.field, value: rest.slice(separator[0].length) }
  }
  return null
}

// AI 常在模板后面补一句「希望你喜欢」，这类闲话会被续行逻辑吞进最后一个字段。
// 食材要求像条目（带用量或分隔符），步骤在已经用编号的前提下要求也带编号。
function acceptsContinuation(field, line, currentValue) {
  if (field === 'steps') {
    const numbered = /(?:^|[\s。，])\d+\s*[.、)．]/.test(currentValue || '')
    return numbered ? STEP_NUMBER.test(line) : true
  }
  if (field === 'ingredients') return /[\s：:|｜—]/.test(line) || /\d/.test(line)
  return true
}

// 按字段名切段，未带字段名的行归属上一个字段（食材、步骤经常换行写）
function splitFields(text) {
  const fields = {}
  let current = null
  text.split('\n').forEach(line => {
    const matched = matchFieldLine(line)
    if (matched) {
      current = matched.field
      const value = matched.value.trim()
      // 重复出现时以非空的后一份为准：AI 常常先回显空模板再给填好的
      if (value || !fields[current]) fields[current] = value
      return
    }
    const trimmed = line.trim()
    if (!trimmed) return
    if (/^[【[].*[】\]]$/.test(trimmed)) {
      current = null
      return
    }
    if (!current) return
    if (!acceptsContinuation(current, trimmed, fields[current])) return
    fields[current] = fields[current] ? fields[current] + '\n' + trimmed : trimmed
  })
  return fields
}

function splitList(value) {
  return String(value || '')
    .split(/[\n；;、]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

// 步骤不能按顿号拆（「姜片、葱段」会被切碎），只认换行和分号；
// 整段挤在一行时再按「1. 2. 3.」这类序号切开。
function splitSteps(value) {
  const marker = /(?:^|[\s。，])\d+\s*[.、)．]/g
  const parts = String(value || '').split(/[\n；;]+/).map(item => item.trim()).filter(Boolean)
  const expanded = []
  parts.forEach(part => {
    const hits = part.match(marker) || []
    if (hits.length < 2) {
      expanded.push(part)
      return
    }
    part.split(/(?=(?:^|[\s。，])\d+\s*[.、)．])/)
      .map(item => item.replace(/^[\s。，、]+/, '').trim())
      .filter(Boolean)
      .forEach(item => expanded.push(item))
  })
  return expanded
}

function parseIngredientLine(line) {
  const text = line.replace(STEP_NUMBER, '').trim()
  if (!text) return null
  const separated = text.match(/^(.+?)\s*(?:[：:|｜]|——|—)\s*(.+)$/)
  const spaced = separated ? null : text.match(/^(\S+)[\s　]+(.+)$/)
  const pair = separated || spaced
  const name = truncate(pair ? pair[1] : text, LIMITS.ingredientName)
  const amount = truncate(pair ? pair[2] : '适量', LIMITS.ingredientAmount)
  if (!name) return null
  return { name: name, amount: amount || '适量' }
}

function matchEnum(value, list, aliases, keys) {
  const text = String(value || '').trim()
  if (!text) return ''
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (keys.some(key => item[key] && item[key] === text)) return item.id
  }
  if (aliases[text]) return aliases[text]
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (keys.some(key => item[key] && (text.indexOf(item[key]) >= 0 || item[key].indexOf(text) >= 0))) return item.id
  }
  const aliasKey = Object.keys(aliases).find(key => text.indexOf(key) >= 0)
  return aliasKey ? aliases[aliasKey] : ''
}

function parseMinutes(value) {
  const text = String(value || '').trim()
  if (!text) return 0
  const hour = text.match(/(\d+(?:\.\d+)?)\s*(?:小时|个小时|h|H)/)
  const minute = text.match(/(\d+(?:\.\d+)?)\s*(?:分钟|分|min)/)
  if (hour) return Math.round(Number(hour[1]) * 60) + (minute ? Number(minute[1]) : 0)
  if (minute) return Number(minute[1])
  const plain = text.match(/\d+(?:\.\d+)?/)
  return plain ? Number(plain[0]) : 0
}

function nearestPreparationTime(minutes) {
  if (!minutes) return ''
  const options = getPreparationTimes()
  let best = options[0]
  let gap = Math.abs(Number(best.value) - minutes)
  options.forEach(option => {
    const diff = Math.abs(Number(option.value) - minutes)
    if (diff < gap) {
      best = option
      gap = diff
    }
  })
  return best.value
}

function parseServingSize(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const options = getServingSizes()
  const exact = options.find(option => option.label === text || option.value === text)
  if (exact) return exact.value
  const numbers = (text.match(/\d+/g) || []).map(Number)
  if (!numbers.length) return ''
  const people = Math.max.apply(null, numbers)
  if (people <= 2) return '1-2'
  if (people <= 4) return '3-4'
  if (people <= 6) return '5-6'
  return '6+'
}

function parseTags(value, warnings) {
  const names = String(value || '').split(/[\n、，,；;/\s]+/).map(item => item.trim()).filter(Boolean)
  const all = getCookingMethods().concat(getFlavorTypes())
  const ids = []
  const unknown = []
  names.forEach(name => {
    const matched = all.find(item => item.name === name || item.id === name)
      || all.find(item => name.indexOf(item.name) >= 0)
    if (!matched) {
      unknown.push(name)
      return
    }
    if (ids.indexOf(matched.id) < 0) ids.push(matched.id)
  })
  if (unknown.length) warnings.push('标签「' + unknown.join('、') + '」不在可选范围，已跳过')
  if (ids.length > LIMITS.tagCount) {
    warnings.push('标签最多 ' + LIMITS.tagCount + ' 个，已保留前 ' + LIMITS.tagCount + ' 个')
    return ids.slice(0, LIMITS.tagCount)
  }
  return ids
}

// 剪贴板内容像不像填好的模板：至少命中两个字段名
function isTemplateText(raw) {
  return Object.keys(splitFields(cleanupText(raw))).length >= 2
}

function parseRecipeTemplate(raw) {
  const warnings = []
  const source = String(raw || '')
  if (!source.trim()) {
    return { ok: false, fields: {}, filledLabels: [], warnings: ['剪贴板是空的'] }
  }
  if (source.length > MAX_INPUT_LENGTH) {
    return { ok: false, fields: {}, filledLabels: [], warnings: ['内容太长了，只支持 1 万字以内'] }
  }

  const raws = splitFields(cleanupText(source))
  const fields = {}
  const filledLabels = []

  const name = truncate(String(raws.name || '').replace(/#\S+/g, ''), LIMITS.name)
  if (name) {
    fields.name = name
    filledLabels.push('菜名')
  }

  const description = truncate(raws.description, LIMITS.description)
  if (description) {
    fields.description = description
    filledLabels.push('描述')
  }

  if (raws.ingredientCategory) {
    const id = matchEnum(raws.ingredientCategory, getIngredientCategories(), INGREDIENT_ALIASES, ['name', 'id'])
    if (id) {
      fields.ingredientCategory = id
      filledLabels.push('食材分类')
    } else {
      warnings.push('没认出食材分类「' + raws.ingredientCategory + '」，请手动选择')
    }
  }

  if (raws.sceneCategory) {
    const id = matchEnum(raws.sceneCategory, getSceneCategories(), SCENE_ALIASES, ['shortName', 'name', 'id'])
    if (id) {
      fields.sceneCategory = id
      filledLabels.push('场景')
    } else {
      warnings.push('没认出场景「' + raws.sceneCategory + '」，请手动选择')
    }
  }

  if (raws.ingredients) {
    let items = splitList(raws.ingredients).map(parseIngredientLine).filter(Boolean)
    if (items.length > LIMITS.ingredientCount) {
      warnings.push('食材最多 ' + LIMITS.ingredientCount + ' 条，已保留前 ' + LIMITS.ingredientCount + ' 条')
      items = items.slice(0, LIMITS.ingredientCount)
    }
    if (items.length) {
      fields.ingredients = items.map((item, index) => ({ id: 'ing_' + (index + 1), name: item.name, amount: item.amount }))
      filledLabels.push('食材')
    }
  }

  const sideIngredients = truncate(String(raws.sideIngredients || '').replace(/\n/g, '；'), LIMITS.sideIngredients)
  if (sideIngredients) {
    fields.sideIngredients = sideIngredients
    filledLabels.push('配料')
  }

  const seasonings = truncate(String(raws.seasonings || '').replace(/\n/g, '；'), LIMITS.seasonings)
  if (seasonings) {
    fields.seasonings = seasonings
    filledLabels.push('调料')
  }

  if (raws.steps) {
    let contents = splitSteps(raws.steps)
      .map(item => truncate(item.replace(STEP_NUMBER, ''), LIMITS.stepContent))
      .filter(Boolean)
    if (contents.length > LIMITS.stepCount) {
      warnings.push('步骤最多 ' + LIMITS.stepCount + ' 步，已保留前 ' + LIMITS.stepCount + ' 步')
      contents = contents.slice(0, LIMITS.stepCount)
    }
    if (contents.length) {
      fields.steps = contents.map((content, index) => ({ id: 'step_' + (index + 1), content: content, image: '' }))
      filledLabels.push('步骤')
    }
  }

  if (raws.optionalTags) {
    const tags = parseTags(raws.optionalTags, warnings)
    if (tags.length) {
      fields.optionalTags = tags
      filledLabels.push('标签')
    }
  }

  if (raws.preparationTime) {
    const value = nearestPreparationTime(parseMinutes(raws.preparationTime))
    if (value) {
      fields.preparationTime = value
      filledLabels.push('用时')
    }
  }

  if (raws.difficulty) {
    const text = String(raws.difficulty).trim()
    const aliasKey = Object.keys(DIFFICULTY_ALIASES).find(key => text.indexOf(key) >= 0)
    const level = aliasKey ? DIFFICULTY_ALIASES[aliasKey] : 0
    const matched = getDifficultyLevels().find(item => item.value === level)
    if (matched) {
      fields.difficulty = matched.value
      filledLabels.push('难度')
    }
  }

  if (raws.servingSize) {
    const value = parseServingSize(raws.servingSize)
    if (value) {
      fields.servingSize = value
      filledLabels.push('人数')
    }
  }

  if (raws.xiaohongshuUrl) {
    const matched = String(raws.xiaohongshuUrl).match(URL_PATTERN)
    if (matched) {
      fields.xiaohongshuUrl = truncate(matched[0], LIMITS.url)
      filledLabels.push('链接')
    }
  }

  const ok = Boolean(fields.name || fields.ingredients)
  if (!ok) warnings.push('没认出菜名和食材，确认下复制的是填好的模板')
  return { ok: ok, fields: fields, filledLabels: filledLabels, warnings: warnings }
}

module.exports = {
  LIMITS: LIMITS,
  MAX_INPUT_LENGTH: MAX_INPUT_LENGTH,
  isTemplateText: isTemplateText,
  parseRecipeTemplate: parseRecipeTemplate
}
