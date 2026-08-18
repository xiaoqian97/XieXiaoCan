const util = require('../../utils/util')

Page({
  data: {
    loading: true,
    saving: false,
    spicyOptions: [{ value: 'none', label: '不辣' }, { value: 'mild', label: '微辣' }, { value: 'medium', label: '适中' }, { value: 'hot', label: '重辣' }],
    dietOptions: [{ value: 'none', label: '不限制' }, { value: 'vegetarian', label: '偏素食' }, { value: 'low_fat', label: '少油少盐' }],
    preferences: { spicy: 'medium', diet: 'none', likes: [], dislikes: [], allergies: [] },
    likesText: '',
    dislikesText: '',
    allergiesText: ''
  },

  onLoad() {
    if (!util.requireLogin('设置饮食偏好需要登录')) {
      this.setData({ loading: false })
      return
    }
    util.callCloudFunction('user', { action: 'getPreferences' }).then(res => {
      const preferences = res.data && res.data.preferences
      if (!preferences) return this.setData({ loading: false })
      this.setData({ preferences, likesText: preferences.likes.join('、'), dislikesText: preferences.dislikes.join('、'), allergiesText: preferences.allergies.join('、'), loading: false })
    }).catch(error => {
      this.setData({ loading: false })
      util.showError(error.message || '偏好加载失败')
    })
  },

  selectSpicy(e) { this.setData({ 'preferences.spicy': e.currentTarget.dataset.value }) },
  selectDiet(e) { this.setData({ 'preferences.diet': e.currentTarget.dataset.value }) },
  inputText(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }) },

  save() {
    if (this.data.saving) return
    const split = value => [...new Set(String(value || '').split(/[、,，\s]+/).map(item => item.trim()).filter(Boolean))].slice(0, 20)
    const preferences = { ...this.data.preferences, likes: split(this.data.likesText), dislikes: split(this.data.dislikesText), allergies: split(this.data.allergiesText) }
    this.setData({ saving: true })
    util.callCloudFunction('user', { action: 'updatePreferences', preferences }).then(() => {
      this.setData({ saving: false, preferences })
      util.showSuccess('偏好已保存')
      setTimeout(() => wx.navigateBack(), 600)
    }).catch(error => {
      this.setData({ saving: false })
      util.showError(error.message || '偏好保存失败')
    })
  }
})
