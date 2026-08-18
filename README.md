# 谢小馋小程序

两个人用的家庭投喂小程序，基于微信小程序云开发。

## 项目结构

```
Food-wxapp/
├── pages/                  # 页面目录
│   ├── index/             # 首页
│   ├── recipe-list/       # 菜谱列表
│   ├── recipe-detail/     # 菜谱详情
│   ├── recipe-form/       # 添加/编辑菜谱
│   ├── search/            # 搜索页面
│   ├── diancan/           # 饭篮
│   ├── order/             # 投喂单兜底页
│   ├── order-list/        # 投喂单列表
│   ├── wish-list/         # 饭愿列表
│   ├── notifications/     # 通知中心
│   └── profile/           # 个人中心
├── components/            # 组件目录
├── utils/                 # 工具函数
├── cloudfunctions/        # 云函数目录
│   ├── login/            # 用户登录
│   ├── user/             # 用户管理
│   ├── recipe/           # 菜谱管理
│   ├── order/            # 投喂单管理
│   ├── wish/             # 饭愿管理
│   └── notification/     # 站内通知
├── app.js                # 小程序入口文件
├── app.json              # 小程序配置文件
├── app.wxss              # 全局样式文件
└── project.config.json   # 项目配置文件
```

## 开发步骤

### 1. 环境准备

1. 下载并安装微信开发者工具
2. 用微信开发者工具打开此项目目录
3. 在微信开发者工具中开通云开发环境

### 2. 云开发配置

1. 在微信开发者工具中，点击"云开发"按钮
2. 开通云开发环境，记住环境ID
3. 修改 `app.js` 中的环境ID：
   ```javascript
   wx.cloud.init({
     env: 'your-env-id', // 替换为你的环境ID
     traceUser: true,
   })
   ```

### 3. 云函数部署

1. 右键点击 `cloudfunctions/login` 目录
2. 选择"上传并部署：云端安装依赖"
3. 重复以上步骤部署全部云函数：`login`、`user`、`recipe`、`order`、`wish`、`notification`、`friend`、`favorite`、`cart`、`admin`、`feedback`、`blessing`、`analytics`
4. `login`、`user`、`recipe`、`blessing` 需要内容安全接口权限；`order`、`blessing`、`friend` 需要订阅消息发送权限，请保留各目录下的 `config.json`
5. 上传 `blessing` 时选择“上传并部署：云端安装依赖”，并确认其 `blessingScheduler` 定时触发器已经创建；该触发器每 5 分钟处理一次到期祝福

### 4. 数据库初始化

在云开发控制台中创建以下集合：
- `users` - 用户信息、身份，以及每位点菜人唯一的 `fixedFeederOpenid`
- `recipes` - 菜谱数据
  - 备菜内容包括 `ingredients`（食材及用量）、`sideIngredients`（配料文本）、`seasonings`（调料文本）；`steps` 可为空
- `recipe_views` - 按菜谱与查看者汇总的浏览记录，仅主管理员可查询查看者
- `orders` - 投喂单记录
- `wishes` - 饭愿数据
- `notifications` - 站内通知
- `friends` - 已确认的绑定关系和双方备注
- `friend_requests` - 绑定申请
- `favorites` - 用户收藏
- `carts` - 按 OpenID 保存的云端饭篮
- `feeding_stats` - 按投喂官与点饭人预聚合的统计数据
- `app_config` - 管理员、默认投喂官身份、订阅消息等集中配置
- `admin_logs` - 管理员身份和固定投喂关系的操作日志
- `feedbacks` - 用户提交的反馈、建议及相关图片
- `blessings` - 节日祝福、自定义祝福和定时发送状态
- `analytics_sessions` - 每次进入小程序的会话与停留时长
- `analytics_events` - 用户使用核心功能的事件明细
- `analytics_daily_stats` - 按用户、日期预聚合的访问与功能统计
- `recipe_interactions` - 每位用户对每道菜的多选口味反馈（好吃、下次还想吃、少辣一点、分量刚好）

### 数据库权限与云存储

1. 在云开发控制台的“数据库 → 权限管理”中切换到自定义安全规则
2. 如果控制台支持整份规则导入，选择项目根目录的 `database.rules.json`；如果只能逐集合配置，则为上述每个集合分别设置 `{ "read": false, "write": false }`
3. 本项目的数据库操作全部经过云函数，因此禁止小程序端直接读写不会影响正常功能，且可防止绕过业务权限
4. 免费套餐无需修改云存储权限；`recipe` 云函数会为其他用户生成临时图片地址
5. 修改图片访问逻辑后，重新上传并部署 `recipe` 云函数

### 5. 初始化家庭配置

在 `app_config` 集合中新建记录，记录 ID 必须为 `family`：

```json
{
  "adminOpenid": "",
  "chefOpenid": "",
  "chefNickname": "",
  "miniprogramState": "formal",
  "subscribeTemplates": {
    "orderCreated": {
      "templateId": "新投喂单提醒模板 ID",
      "page": "pages/order-detail/order-detail",
      "fields": {
        "name8": "dinerName",
        "thing21": "dishes",
        "time18": "mealTime"
      }
    },
    "orderStatus": {
      "templateId": "投喂状态提醒模板 ID",
      "page": "pages/order-detail/order-detail",
      "fields": {
        "phrase3": "status",
        "thing10": "dishes",
        "thing5": "remark"
      }
    },
    "friendRequest": {
      "templateId": "好友申请提醒模板 ID",
      "page": "pages/friend-requests/friend-requests",
      "fields": {
        "name1": "senderName",
        "thing2": "message",
        "time3": "requestTime"
      }
    },
    "blessingReceived": {
      "templateId": "收到祝福提醒模板 ID",
      "page": "pages/blessing-detail/blessing-detail",
      "fields": {
        "name1": "senderName",
        "phrase5": "title",
        "thing3": "summary",
        "time11": "sendTime"
      }
    }
  },
  "festivalDates": {
    "2031": {
      "spring_festival": "MM-DD",
      "qixi": "MM-DD",
      "mid_autumn": "MM-DD"
    }
  }
}
```

> 微信订阅消息的 `phrase` 字段最多展示 5 个汉字。祝福模板中“事项主题”固定
> 显示“TA的祝福”，“提醒事项”展示用户填写的祝福标题。现有
> `phrase5: title`、`thing3: summary` 配置可以继续使用，无需修改数据库。

`fields` 左侧必须换成微信模板中实际的字段名。投喂模板右侧可使用：`dinerName`、`dishes`、`mealTime`、`status`、`remark`；好友申请模板可使用：`senderName`、`message`、`requestTime`；祝福模板可使用：`senderName`、`title`、`summary`、`sendTime`。如果暂时没有对应模板，站内通知仍可正常使用，只是不发送微信服务通知。

好友申请微信提醒还需要重新部署 `friend` 云函数，并在上传时选择“云端安装依赖”。接收方必须提前在首次登录引导或“我的 → 补充微信提醒次数”中允许该模板；微信一次性订阅每允许一次只能发送一次，次数用完后需要再次补充。由于微信单次最多申请 3 个模板，客户端会优先申请好友申请、新投喂单和投喂状态模板。

春节、七夕和中秋的内置日期覆盖 2026～2030 年。2031 年起可按上例在 `festivalDates` 中补充公历月日，不需要修改节日主题代码。

如果 `app_config/family` 不存在，`login` 会使用代码中的默认管理员 OpenID 创建基础配置。生成后仍需在云开发控制台补充订阅消息模板。

### 6. 数据库索引

至少创建以下索引，排序方向与实际查询保持一致：

- `friends`：`userOpenid + status`、`friendOpenid + status`、`userOpenid + friendOpenid + status`
- `friend_requests`：`targetOpenid + status + createTime(desc)`、`fromOpenid + status + createTime(desc)`
- `orders`：`creatorId + createdAt(desc)`、`assigneeId + createdAt(desc)`、`creatorId + status + createdAt(desc)`、`assigneeId + status + createdAt(desc)`、`status + createdAt(desc)`
- `wishes`：`creatorId + createdAt(desc)`、`assigneeId + createdAt(desc)`、`creatorId + assigneeId + createdAt(desc)`
- `favorites`：`userId + createdAt(desc)`、`userId + recipeId`、`recipeId + createdAt(desc)`
- `carts`：`userId`
- `feeding_stats`：`chefId`、`dinerId`
- `notifications`：`recipientId + createdAt(desc)`、`recipientId + read + createdAt(desc)`
- `users`：`role + createTime(desc)`、`isAdmin + createTime(desc)`、`fixedFeederOpenid`
- `admin_logs`：`adminOpenid + createdAt(desc)`、`targetOpenid + createdAt(desc)`
- `feedbacks`：`createdAt(desc)`、`type + createdAt(desc)`
- `blessings`：`recipientId + status + createdAt(desc)`、`senderId + createdAt(desc)`、`status + sendAt(asc)`、`type + createdAt(desc)`
- `analytics_sessions`：`userId + startedAt(desc)`、`dateKey + startedAt(desc)`
- `analytics_events`：`userId + createdAt(desc)`、`eventName + createdAt(desc)`、`dateKey + createdAt(desc)`
- `analytics_daily_stats`：`dateKey`、`userId + dateKey(desc)`
- `recipe_interactions`：`recipeId + userId`（唯一反馈查询）、`userId + updatedAt(desc)`、`recipeId + updatedAt(desc)`
- `recipe_views`：`recipeId + viewCount(desc)`，用于主管理员查看每道菜浏览次数前 20 位用户

埋点数据由 `analytics` 云函数写入，数据库规则禁止小程序直接读写。工作台中的用户活跃、常用功能和投喂官菜谱运营查询会再次核验 `app_config/family.adminOpenid`，只有主管理员可以读取，普通管理员无法通过直接调用云函数绕过权限。

菜谱索引继续参考 `cloudfunctions/recipe/database-indexes.md`。管理员菜品明细还需要在 `recipes` 集合增加 `status + createdAt(desc)` 索引。
首页按账号推荐还需要在 `recipes` 集合增加 `creatorId + status + createdAt(desc)` 和 `isPublic + status + createdAt(desc)` 索引。

### 7. 升级后的数据迁移

1. 先部署全部云函数并创建新增集合、索引和安全规则。
2. 固定投喂官重新登录一次，确认 `app_config/family` 已存在。
3. 在云开发控制台测试 `order` 云函数，传入 `{ "action": "rebuildStatistics" }`，为历史订单重建 `feeding_stats`。
4. 所有用户重新进入一次小程序，旧本地饭篮会迁移到当前 OpenID 的独立缓存并同步到 `carts`。
5. 用户在“我的 → 开启微信消息提醒”中授权；订阅消息通常为一次性授权，用完后需要再次点击授权。
6. 在微信公众平台的用户隐私保护指引中声明头像、昵称和图片选择能力，然后重新提交审核。

### 8. 新增体验功能

- “我的 → 饮食偏好与忌口”保存辣度、饮食方式、喜欢/不喜欢及过敏食材；首页推荐会按这些偏好过滤和排序，并结合历史点单、评分及口味反馈。
- 菜谱详情底部提供轻量口味反馈，不会覆盖原有评分；每个用户每道菜使用一条记录保存多个已选反馈标签。
- 投喂完成后，订单双方都可以添加一句“吃饭记忆”，内容会同步显示在“投喂记忆”的最近投喂区域。
- 部署时请新建 `recipe_interactions` 集合并创建上方索引；然后重新上传 `user`、`recipe`、`order` 云函数和小程序代码。
- 部署查看者功能时，请新建 `recipe_views` 集合及其索引，并重新上传 `recipe` 云函数、小程序代码和 `database.rules.json`。历史浏览量无法反推出具体查看者，新部署后开始记录。

## 功能特性

- ✅ 微信登录
- ✅ 菜谱管理（增删改查）
- ✅ 菜谱搜索和分类
- ✅ 饭愿提交和安排上桌
- ✅ 饭篮和投喂单
- ✅ 投喂单管理
- ✅ 站内通知
- ✅ 节日祝福与自定义祝福
- ✅ 祝福立即发送、定时发送和微信提醒
- ✅ 祝福富文本、拆信动画及送达/收起/查看状态
- ✅ 云存储图片上传

## 技术栈

- **前端**: 微信小程序原生开发
- **后端**: 微信云开发
- **数据库**: 云数据库（MongoDB）
- **存储**: 云存储
- **函数**: 云函数（Node.js）

## 开发注意事项

1. 确保小程序基础库版本 >= 2.2.3
2. 云函数中的环境ID要与小程序中保持一致
3. 测试时需要在真机上测试云开发功能
4. 图片上传需要配置云存储权限

## 部署上线

1. 在微信开发者工具中点击"上传"
2. 填写版本号和项目备注
3. 在微信公众平台提交审核
4. 审核通过后发布上线
