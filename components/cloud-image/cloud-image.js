const util = require('../../utils/util')

Component({
  externalClasses: ['custom-class'],
  properties: {
    src: { type: String, value: '' },
    originalSrc: { type: String, value: '' },
    fallback: { type: String, value: '/images/default-recipe.jpg' },
    mode: { type: String, value: 'aspectFill' },
    lazyLoad: { type: Boolean, value: true },
    showMenuByLongpress: { type: Boolean, value: false }
  },
  data: {
    displaySrc: '',
    retryCount: 0
  },
  observers: {
    'src, originalSrc, fallback': function(src, originalSrc, fallback) {
      const source = originalSrc || src
      this.setData({ displaySrc: src || fallback, retryCount: 0 })
      if (source && source.startsWith('cloud://')) this.resolveSource(source, fallback)
    }
  },
  methods: {
    onTap(event) {
      this.triggerEvent('tap', event.detail || {}, { bubbles: true, composed: true })
    },
    resolveSource(source, fallback) {
      return util.resolveCloudImage(source, fallback).then(url => {
        if (url) this.setData({ displaySrc: url })
      }).catch(() => this.setData({ displaySrc: fallback }))
    },
    onImageError() {
      const source = this.data.originalSrc || this.data.src
      const fallback = this.data.fallback
      if (this.data.retryCount > 0 || !source || !source.startsWith('cloud://')) {
        this.setData({ displaySrc: fallback })
        this.triggerEvent('error', { src: source })
        return
      }
      util.invalidateCloudImage(source)
      this.setData({ retryCount: 1 })
      this.resolveSource(source, fallback)
    }
  }
})
