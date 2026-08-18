const documents = {
  service: {
    title: '用户服务协议',
    sections: [
      { title: '一、服务说明', content: '谢小馋提供家庭菜谱、饭愿和投喂单管理服务。' },
      { title: '二、账号与内容', content: '你可自主选择填写昵称、头像并发布菜谱内容；请勿发布违法、侵权、色情、暴力或其他不当信息。' },
      { title: '三、服务变更', content: '我们可能为保障服务安全和持续运营更新本协议，并在小程序内公布。' }
    ]
  },
  privacy: {
    title: '隐私政策',
    sections: [
      { title: '一、收集的信息', content: '仅在你主动登录、选择头像、填写昵称、发布菜谱或提交饭愿时，收集相应的昵称、头像、菜谱文字和图片。' },
      { title: '二、使用目的', content: '用于展示你的资料、保存菜谱和饭愿、生成投喂单及保障内容安全。我们不会主动获取手机号或位置信息。' },
      { title: '三、存储与保护', content: '相关信息存储于微信云开发服务。菜谱图片在发布前会进行内容安全检测。' },
      { title: '四、你的权利', content: '你可在小程序内修改或删除已发布的菜谱，并可通过“我的”页面联系运营者处理个人信息相关请求。' }
    ]
  }
}

Page({
  data: {
    title: '',
    sections: []
  },

  onLoad(options) {
    const document = documents[options.type] || documents.service
    this.setData(document)
    wx.setNavigationBarTitle({ title: document.title })
  }
})
