const FESTIVAL_THEMES = {
  'new-year': { name: '元旦烟花', emoji: '🎆', className: 'theme-new-year' },
  valentine: { name: '心动情书', emoji: '💌', className: 'theme-valentine' },
  spring: { name: '新春灯火', emoji: '🏮', className: 'theme-spring' },
  labor: { name: '暖阳假日', emoji: '☀️', className: 'theme-labor' },
  children: { name: '童心气球', emoji: '🎈', className: 'theme-children' },
  qixi: { name: '七夕星河', emoji: '🌌', className: 'theme-qixi' },
  'mid-autumn': { name: '中秋月夜', emoji: '🌕', className: 'theme-mid-autumn' },
  national: { name: '金色假期', emoji: '✨', className: 'theme-national' }
}

const CUSTOM_TEMPLATES = [
  { key: 'missing-you', themeKey: 'missing-you', name: '想你了', emoji: '💭', title: '今天有一点想你', content: '想和你一起吃饭，也想听听你今天发生的事。' },
  { key: 'hard-day', themeKey: 'warm-hug', name: '辛苦了', emoji: '🫶', title: '今天辛苦啦', content: '忙完记得好好吃饭，你已经做得很棒了。' },
  { key: 'good-morning', themeKey: 'morning', name: '早安', emoji: '🌤️', title: '早安，今天也要开心', content: '新的一天开始啦，记得吃早餐，也记得想我。' },
  { key: 'good-night', themeKey: 'night', name: '晚安', emoji: '🌙', title: '晚安，做个好梦', content: '把今天的疲惫放下，明天醒来又是新的一天。' },
  { key: 'anniversary', themeKey: 'anniversary', name: '纪念日', emoji: '💞', title: '属于我们的纪念日', content: '谢谢你陪我把普通的日子，过成值得纪念的时光。' },
  { key: 'birthday', themeKey: 'birthday', name: '生日', emoji: '🎂', title: '生日快乐', content: '愿你的每个愿望都有回应，每一岁都有我陪着。' },
  { key: 'make-up', themeKey: 'warm-hug', name: '和好抱抱', emoji: '🤗', title: '我们和好吧', content: '比起争对错，我更在乎你。给你一个抱抱，好不好？' },
  { key: 'eat-well', themeKey: 'eat-well', name: '记得吃饭', emoji: '🍚', title: '再忙也要记得吃饭', content: '胃要好好照顾，等你有空，我们再一起吃点喜欢的。' },
  { key: 'waiting-home', themeKey: 'waiting-home', name: '等你回家', emoji: '🏠', title: '等你回家吃饭', content: '饭菜和想念都准备好了，路上慢一点，我等你。' },
  { key: 'custom', themeKey: 'custom', name: '自定义', emoji: '✍️', title: '', content: '' }
]

const CUSTOM_THEMES = {
  'missing-you': { emoji: '💭', className: 'theme-missing-you' },
  'warm-hug': { emoji: '🫶', className: 'theme-warm-hug' },
  morning: { emoji: '🌤️', className: 'theme-morning' },
  night: { emoji: '🌙', className: 'theme-night' },
  anniversary: { emoji: '💞', className: 'theme-anniversary' },
  birthday: { emoji: '🎂', className: 'theme-birthday' },
  'eat-well': { emoji: '🍚', className: 'theme-eat-well' },
  'waiting-home': { emoji: '🏠', className: 'theme-waiting-home' },
  custom: { emoji: '💌', className: 'theme-custom' }
}

function getTheme(themeKey) {
  return FESTIVAL_THEMES[themeKey] || CUSTOM_THEMES[themeKey] || CUSTOM_THEMES.custom
}

module.exports = {
  FESTIVAL_THEMES,
  CUSTOM_TEMPLATES,
  CUSTOM_THEMES,
  getTheme
}
