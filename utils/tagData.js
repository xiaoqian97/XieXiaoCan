// 菜谱数据配置文件 - 家庭版
// 用于创建菜谱、菜谱列表等多个页面的统一数据

// 场景分类（必选）
const sceneCategories = [
  {
    id: 'daily',
    shortName: '随便',
    name: '随便吃点',
    emoji: '📅',
    description: '平时也要好好吃',
    color: 'blue',
    gradient: 'linear-gradient(135deg, #E85D4A, #D94A3A)'
  },
  {
    id: 'quick',
    shortName: '快手',
    name: '马上开饭',
    emoji: '🚀',
    description: '不让肚子等太久',
    color: 'orange',
    gradient: 'linear-gradient(135deg, #f59e0b, #d97706)'
  },
  {
    id: 'guest',  
    shortName: '好菜',
    name: '今天吃点好的',
    emoji: '🎉',
    description: '值得认真安排',
    color: 'purple',
    gradient: 'linear-gradient(135deg, #8b5cf6, #7c3aed)'
  },
  {
    id: 'light',
    shortName: '清淡',
    name: '清淡养生',
    emoji: '🥗',
    description: '舒服不负担',
    color: 'cyan',
    gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)'
  },
  {
    id: 'heavy',
    shortName: '重口',
    name: '重口快乐',
    emoji: '🔥',
    description: '米饭要遭殃',
    color: 'red',
    gradient: 'linear-gradient(135deg, #ef4444, #dc2626)'
  }
]

// 食材分类（必选）
const ingredientCategories = [
  {
    id: 'meat',
    name: '肉类',
    emoji: '🥩',
    color: 'red'
  },
  {
    id: 'seafood',
    name: '水产',
    emoji: '🐟',
    color: 'blue'
  },
  {
    id: 'egg',
    name: '蛋类',
    emoji: '🥚',
    color: 'yellow'
  },
  {
    id: 'vegetable',
    name: '蔬菜',
    emoji: '🥬',
    color: 'green'
  },
  {
    id: 'staple',
    name: '主食',
    emoji: '🍚',
    color: 'amber'
  }
]

// 烹饪方式（可选标签）
const cookingMethods = [
  { id: 'stir_fry', name: '炒菜', emoji: '🔥' },
  { id: 'steam', name: '蒸菜', emoji: '💨' },
  { id: 'stew', name: '炖菜', emoji: '🍲' },
  { id: 'cold_mix', name: '凉拌', emoji: '🥗' },
  { id: 'soup', name: '汤品', emoji: '🍜' },
  { id: 'fry', name: '油炸', emoji: '🍤' },
  { id: 'grill', name: '烧烤', emoji: '🔥' },
  { id: 'boil', name: '水煮', emoji: '💧' }
]

// 口味特色（可选标签）
const flavorTypes = [
  { id: 'sichuan', name: '川菜', emoji: '🌶️' },
  { id: 'cantonese', name: '粤菜', emoji: '🦐' },
  { id: 'home_style', name: '家常味', emoji: '🏠' },
  { id: 'light', name: '清淡', emoji: '🌿' },
  { id: 'spicy', name: '麻辣', emoji: '🔥' },
  { id: 'sweet', name: '甜味', emoji: '🍯' },
  { id: 'sour', name: '酸味', emoji: '🍋' },
  { id: 'fresh', name: '鲜香', emoji: '✨' }
]

// 制作时间选项
const preparationTimes = [
  { value: '5', label: '5分钟' },
  { value: '10', label: '10分钟' },
  { value: '15', label: '15分钟' },
  { value: '20', label: '20分钟' },
  { value: '25', label: '25分钟' },
  { value: '30', label: '30分钟' },
  { value: '40', label: '40分钟' },
  { value: '50', label: '50分钟' },
  { value: '60', label: '1小时' },
  { value: '120', label: '2小时+' }
]

// 难度等级选项
const difficultyLevels = [
  { value: 1, label: '简单', color: 'green' },
  { value: 2, label: '中等', color: 'yellow' },
  { value: 3, label: '困难', color: 'red' }
]

// 适合人数选项
const servingSizes = [
  { value: '1-2', label: '1-2人' },
  { value: '3-4', label: '3-4人' },
  { value: '5-6', label: '5-6人' },
  { value: '6+', label: '6人以上' }
]

// 餐次时间选项
const mealTimes = [
  { value: 'breakfast', label: '早餐', emoji: '🌅' },
  { value: 'lunch', label: '午餐', emoji: '🌞' },
  { value: 'dinner', label: '晚餐', emoji: '🌙' }
]

// 订单状态枚举
const orderStatuses = [
  {
    value: 'pending',
    label: '待投喂',
    emoji: '⏳',
    color: 'orange',
    bgColor: '#fef3c7',
    textColor: '#f59e0b',
    description: '等投喂官接单'
  },
  {
    value: 'processing',
    label: '投喂中',
    emoji: '👨‍🍳',
    color: 'blue',
    bgColor: '#FFF1D6',
    textColor: '#E85D4A',
    description: '正在安排上桌'
  },
  {
    value: 'completed',
    label: '已投喂',
    emoji: '✅',
    color: 'green',
    bgColor: '#d1fae5',
    textColor: '#10b981',
    description: '投喂完成'
  },
  {
    value: 'cancelled',
    label: '已取消',
    emoji: '❌',
    color: 'red',
    bgColor: '#fee2e2',
    textColor: '#ef4444',
    description: '投喂单已取消'
  }
]

// 订单状态筛选选项（用于订单列表页）
const orderStatusTabs = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待投喂' },
  { value: 'processing', label: '投喂中' },
  { value: 'completed', label: '已投喂' },
  { value: 'cancelled', label: '已取消' }
]

// 获取场景分类
function getSceneCategories() {
  return sceneCategories
}

// 获取食材分类
function getIngredientCategories() {
  return ingredientCategories
}

// 获取烹饪方式
function getCookingMethods() {
  return cookingMethods
}

// 获取口味特色
function getFlavorTypes() {
  return flavorTypes
}

// 获取制作时间选项
function getPreparationTimes() {
  return preparationTimes
}

// 获取难度等级选项
function getDifficultyLevels() {
  return difficultyLevels
}

// 获取适合人数选项
function getServingSizes() {
  return servingSizes
}

// 获取餐次时间选项
function getMealTimes() {
  return mealTimes
}

// 获取订单状态枚举
function getOrderStatuses() {
  return orderStatuses
}

// 获取订单状态筛选选项
function getOrderStatusTabs() {
  return orderStatusTabs
}

// 根据状态值获取状态信息
function getOrderStatusByValue(value) {
  return orderStatuses.find(status => status.value === value)
}

// 获取状态标签
function getOrderStatusLabel(value) {
  const status = getOrderStatusByValue(value)
  return status ? status.label : '未知'
}

// 获取状态样式
function getOrderStatusStyle(value) {
  const status = getOrderStatusByValue(value)
  return status ? {
    color: status.textColor,
    bg: status.bgColor
  } : {
    color: '#8C7770',
    bg: '#F5ECE6'
  }
}

// 根据ID获取场景分类
function getSceneCategoryById(id) {
  return sceneCategories.find(cat => cat.id === id)
}

// 根据ID获取食材分类
function getIngredientCategoryById(id) {
  return ingredientCategories.find(cat => cat.id === id)
}

// 获取所有可选标签
function getOptionalTags() {
  return [...cookingMethods, ...flavorTypes]
}

// 验证必填字段
function validateRequiredFields(data) {
  const errors = []
  
  if (!data.name || data.name.trim() === '') {
    errors.push('这道菜还没起名')
  }
  
  if (!data.sceneCategory) {
    errors.push('选一下这道菜适合什么时候吃')
  }
  
  if (!data.ingredientCategory) {
    errors.push('选一下主角食材')
  }
  
  const hasIngredient = Array.isArray(data.ingredients) && data.ingredients.some(item => (
    item && String(item.name || '').trim() && String(item.amount || '').trim()
  ))
  if (!hasIngredient) {
    errors.push('请补上备菜清单')
  }
  
  return errors
}

// 导出函数（小程序环境）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sceneCategories,
    ingredientCategories,
    cookingMethods,
    flavorTypes,
    preparationTimes,
    difficultyLevels,
    servingSizes,
    mealTimes,
    orderStatuses,
    orderStatusTabs,
    getSceneCategories,
    getIngredientCategories,
    getCookingMethods,
    getFlavorTypes,
    getPreparationTimes,
    getDifficultyLevels,
    getServingSizes,
    getMealTimes,
    getOrderStatuses,
    getOrderStatusTabs,
    getOrderStatusByValue,
    getOrderStatusLabel,
    getOrderStatusStyle,
    getSceneCategoryById,
    getIngredientCategoryById,
    getOptionalTags,
    validateRequiredFields
  }
}

// 导出函数（浏览器环境）
if (typeof window !== 'undefined') {
  window.TagData = {
    sceneCategories,
    ingredientCategories,
    cookingMethods,
    flavorTypes,
    preparationTimes,
    difficultyLevels,
    servingSizes,
    mealTimes,
    orderStatuses,
    orderStatusTabs,
    getSceneCategories,
    getIngredientCategories,
    getCookingMethods,
    getFlavorTypes,
    getPreparationTimes,
    getDifficultyLevels,
    getServingSizes,
    getMealTimes,
    getOrderStatuses,
    getOrderStatusTabs,
    getOrderStatusByValue,
    getOrderStatusLabel,
    getOrderStatusStyle,
    getSceneCategoryById,
    getIngredientCategoryById,
    getOptionalTags,
    validateRequiredFields
  }
}
