# MyMind 备忘录 — 开发文档

## 1. 技术架构

### 技术栈
| 层次 | 技术 |
|------|------|
| 前端框架 | 微信小程序原生（WXML/WXSS/JS） |
| 云开发 | 微信云开发（云函数 + 云数据库 + 云存储） |
| 数据存储 | 云数据库集合（notes、users） |
| 文件存储 | 云存储（图片、音频） |

### 代码风格约束
微信 Summer 编译器对 ES6 支持不完整，必须遵守：
- `var` 声明变量（不用 let/const）
- `.bind(this)` 绑定 this（不用箭头函数）
- `.then/.catch` 处理异步（不用 async/await）
- 完整 `function()` 语法（不用简写方法）

### 架构图
```
┌──────────────────────────────────────┐
│            小程序前端                  │
│  ┌────────┐  ┌───────────────────┐   │
│  │ 登录页 │  │   画布页           │   │
│  └───┬────┘  │ ┌─────┐┌──────┐  │   │
│      │       │ │text ││image │  │   │
│      │       │ │note ││note  │  │   │
│      │       │ ├─────┤├──────┤  │   │
│      │       │ │audio││工具栏│  │   │
│      │       │ │note ││面板  │  │   │
│      │       │ └─────┘└──────┘  │   │
│      │       └───────┬───────────┘   │
└──────┼───────────────┼───────────────┘
       │               │
       ▼               ▼
┌──────────────────────────────────────┐
│            微信云开发                  │
│  ┌──────────┐  ┌─────────────────┐  │
│  │ 云函数    │  │  云数据库        │  │
│  │ · login  │  │  · users        │  │
│  │ · init   │  │  · notes        │  │
│  └──────────┘  └─────────────────┘  │
│  ┌──────────┐                       │
│  │ 云存储    │                       │
│  │ · 图片    │                       │
│  │ · 音频    │                       │
│  └──────────┘                       │
└──────────────────────────────────────┘
```

## 2. 项目结构

```
Mymind/
├── app.js                    # 应用入口，初始化云开发
├── app.json                  # 全局配置（页面路由、窗口样式）
├── app.wxss                  # 全局样式
├── project.config.json       # 项目配置（云函数根目录）
├── sitemap.json              # 小程序索引配置（必须包含至少一条规则）
│
├── pages/
│   ├── login/                # 登录页
│   │   ├── login.js          # 微信授权登录逻辑
│   │   ├── login.json
│   │   ├── login.wxml
│   │   └── login.wxss
│   └── canvas/               # 画布页（核心）
│       ├── canvas.js         # 画布平移/缩放、元素拖拽/选中/菜单、撤销重做
│       ├── canvas.json       # 组件注册
│       ├── canvas.wxml       # 视口+画布层+面板+工具栏+菜单
│       └── canvas.wxss       # 画布样式
│
├── components/
│   ├── text-note/            # 文字纸条组件
│   │   ├── text-note.js      # 编辑/保存/触摸事件传递/删除
│   │   ├── text-note.json
│   │   ├── text-note.wxml
│   │   └── text-note.wxss
│   ├── image-note/           # 图片纸条组件
│   │   ├── image-note.js     # 图片预览/触摸事件/删除
│   │   ├── image-note.json
│   │   ├── image-note.wxml
│   │   └── image-note.wxss
│   └── audio-note/           # 语音条组件
│       ├── audio-note.js     # 播放/暂停/波形动画/触摸事件/删除
│       ├── audio-note.json
│       ├── audio-note.wxml
│       └── audio-note.wxss
│
├── cloudfunctions/           # 云函数
│   ├── login/                # 登录云函数
│   │   ├── index.js          # 获取openid，创建/更新用户
│   │   └── package.json
│   └── init/                 # 数据库初始化云函数
│       ├── index.js          # 自动创建集合（幂等）
│       └── package.json
│
├── utils/
│   └── storage.js            # 云数据库操作封装（CRUD + 文件上传）
│
└── docs/
    ├── design.md             # 设计文档
    └── dev.md                # 开发文档（本文件）
```

## 3. 云函数说明

### login 云函数
- **路径**：`cloudfunctions/login/`
- **触发方式**：`wx.cloud.callFunction({ name: 'login' })`
- **入参**：`{ nickName: String, avatarUrl: String }`
- **返回**：`{ isNew: Boolean, openid: String }`
- **逻辑**：通过 `cloud.getWXContext()` 获取 openid，查询/创建用户记录

### init 云函数（数据库初始化）
- **路径**：`cloudfunctions/init/`
- **触发方式**：`wx.cloud.callFunction({ name: 'init' })`
- **入参**：无
- **返回**：`{ code: 0, data: { users: 'created'|'already_exists', notes: 'created'|'already_exists' } }`
- **逻辑**：自动创建 `users` 和 `notes` 集合（幂等，已存在则跳过）
- **调用时机**：登录页 `onLoad` 时自动调用（通过 `db_initialized` 缓存标记，仅首次执行）
- **注意**：集合创建后，权限仍需在云开发控制台手动设置（见第 6 节）

### 部署步骤
1. 在微信开发者工具中右键 `cloudfunctions/login` → "上传并部署：云端安装依赖"
2. 右键 `cloudfunctions/init` → "上传并部署：云端安装依赖"
3. 首次打开登录页时，`init` 云函数会自动创建 `users` 和 `notes` 集合
4. 在云开发控制台手动设置集合权限（见第 6 节）

## 4. 组件 API

### 通用属性（所有组件共有）
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| itemId | String | '' | 元素文档 ID（_id），**不可用 `id`，与 WXML 内置属性冲突** |
| x | Number | 0 | 画布 X 坐标 |
| y | Number | 0 | 画布 Y 坐标 |
| dragging | Boolean | false | 是否正在拖拽 |
| selected | Boolean | false | 是否选中 |
| zIndex | Number | 1 | 图层顺序 |
| locked | Boolean | false | 是否锁定 |

### text-note 专有属性
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| title | String | '' | 标题 |
| content | String | '' | 文字内容 |
| width | Number | 200 | 纸条宽度 |

### image-note 专有属性
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| title | String | '' | 标题 |
| src | String | '' | 图片 cloud fileID |
| width | Number | 200 | 图片宽度 |
| height | Number | 200 | 图片高度 |

### audio-note 专有属性
| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| title | String | '' | 标题 |
| src | String | '' | 音频 cloud fileID |
| duration | Number | 0 | 时长（秒） |

### 通用事件（所有组件共有）
| 事件 | detail | 说明 |
|------|--------|------|
| itemtouchstart | `{ id, clientX, clientY }` | 触摸开始（**不用 touchstart，与原生事件冲突**） |
| itemtouchmove | `{ id, clientX, clientY }` | 触摸移动 |
| itemtouchend | `{ id }` | 触摸结束 |
| delete | `{ id }` | 删除元素 |
| update | `{ id, field, value }` | 内容更新 |

### text-note 专有事件
| 事件 | detail | 说明 |
|------|--------|------|
| resizestart | `{ id, clientX, clientY }` | 缩放开始 |
| resizemove | `{ id, clientX, clientY }` | 缩放移动 |
| resizeend | `{ id }` | 缩放结束 |

### image-note 专有事件
| 事件 | detail | 说明 |
|------|--------|------|
| resizestart | `{ id, clientX, clientY }` | 缩放开始 |
| resizemove | `{ id, clientX, clientY }` | 缩放移动 |
| resizeend | `{ id }` | 缩放结束 |

### audio-note 专有事件
| 事件 | detail | 说明 |
|------|--------|------|
| playaudio | `{ id }` | 播放音频（可用于互斥控制） |

## 5. 云数据库操作（utils/storage.js）

| 方法 | 参数 | 返回 | 说明 |
|------|------|------|------|
| loadItems() | 无 | `Promise<Array>` | 加载当前用户所有 notes（limit 100） |
| createItem(item) | `{type,x,y,...}` | `Promise<{_id}>` | 新建元素 |
| updateItem(id, data) | `String, Object` | `Promise` | 更新元素（自动加 updatedAt） |
| deleteItem(id) | `String` | `Promise` | 删除元素 |
| batchUpdate(items) | `Array` | `Promise` | 批量更新位置 |
| saveCloudFile(tempPath) | `String` | `Promise<fileID>` | 上传文件到云存储 |

## 6. 关键实现细节

### 手势分离
- **画布平移**：canvas.wxml 外层 view 绑定 `bindtouchstart/move/end`
- **元素拖拽**：组件内部用 `catchtouchstart/move/end` 阻止冒泡，同时 `triggerEvent('itemtouchstart/move/end')` 向父页面传递坐标
- **拖拽模式进入**：手指移动 > 10px 后自动进入拖拽模式（不要求长按）
- **长按检测**：500ms `setTimeout`，触发后 `wx.vibrateShort` 反馈 + 弹出上下文菜单
- **选中**：短按元素（未进入拖拽模式且长按未触发）

### 点击检测（真机兼容）
组件外层有 `catchtouchstart`，真机上**框架不生成 `tap` 事件**，因此子元素的 `catchtap` 无效。所有交互按钮（删除、图片预览、播放）使用 **touch 手动检测**：

```js
_onDeleteTouchStart: function (e) {
  var touch = e.touches[0];
  this._delTapTime = Date.now();
  this._delTapX = touch.clientX;
  this._delTapY = touch.clientY;
},
_onDeleteTouchEnd: function (e) {
  var touch = e.changedTouches[0];
  var dt = Date.now() - this._delTapTime;
  var dx = Math.abs(touch.clientX - this._delTapX);
  var dy = Math.abs(touch.clientY - this._delTapY);
  if (dt < 300 && dx < 15 && dy < 15) {
    // 视为点击
  }
}
```

### 乐观删除
删除操作采用"先删 UI 再删云端"策略，即使云数据库超时也不影响用户体验：
```js
// 先从 UI 移除
var items = self.data.items.filter(function (i) { return i._id !== id; });
self.setData({ items: items, ... });
// 再异步删云端（不阻塞 UI）
storage.deleteItem(id).catch(function (err) { console.error('云端删除失败:', err); });
```

### 撤销/重做
- 每次操作后调用 `_pushHistory()` 保存快照
- 最多保存 50 步
- 撤销/重做时恢复快照并清空选中状态
- **已知限制**：撤销/重做不同步到云端，刷新后恢复旧状态

### 拖拽 Ghost
拖拽时在元素原位置显示虚线轮廓（Ghost），帮助用户感知位移量。Ghost 的样式随元素类型变化（黄色=文字，蓝色=图片，紫色=语音）。

### 云数据库权限
- `users` 集合：所有用户可读，仅创建者可写
- `notes` 集合：仅创建者可读写（`_openid` 自动注入）
- **云存储**：默认"仅创建者可读写"，无需额外配置

### 文件上传流程
```
选择图片/录音 → 本地临时路径 → wx.cloud.uploadFile → 云存储 fileID → 存入 notes 集合
```

## 7. 部署流程

### 前置条件
1. 微信开发者工具 1.02.19+
2. 基础库 2.10.0+（`wx.chooseMedia` 需要 2.10.0+）
3. 已开通微信云开发

### 步骤
1. 打开微信开发者工具，导入项目目录
2. 点击"云开发"按钮，创建云开发环境，记下环境 ID
3. 修改 `app.js` 中 `env: 'your-env-id'` 为实际环境 ID
4. 在 `project.config.json` 中填写小程序 appid
5. 右键 `cloudfunctions/login` 和 `cloudfunctions/init` → "上传并部署：云端安装依赖"
6. 编译运行，登录页会自动创建数据库集合
7. 在云开发控制台手动设置集合权限（见第 6 节）
8. 测试登录和画布功能

### 注意事项
- 首次使用需点击"云开发"开通（免费额度足够个人使用）
- 云函数部署后需等待几秒生效
- `sitemap.json` 必须包含至少一条规则，否则真机报 -80055 错误

## 8. 真机开发踩坑记录

### P0 — 必须遵守，否则功能完全失效

| 坑 | 表现 | 解法 |
|----|------|------|
| 组件 property 禁用 `id` | `this.data.id` 始终为空 | 用 `itemId` 替代 |
| 自定义事件名与原生重名 | `triggerEvent('touchstart')` 父页面收不到 | 用 `itemtouchstart` 等区分 |
| 外层 `catchtouchstart` 阻断子元素 `tap` | 子元素 `catchtap` 真机不触发 | 用 touch 手动检测点击（时间 < 300ms + 位移 < 15px） |

### P1 — 容易遗漏

| 坑 | 表现 | 解法 |
|----|------|------|
| 云数据库 `.get()` 默认 20 条 | 数据多了加载不全 | 显式加 `.limit(N)` |
| `setData` 动态 key 内联拼接 | Summer 编译器崩溃 | 先构建对象再传入 |
| `sitemap.json` 空 rules | 真机 -80055 错误 | 添加 `{ action: 'allow', page: '*' }` |

### P2 — 代码规范

| 坑 | 解法 |
|----|------|
| let/const/箭头函数/简写方法 | 全部用 var/function()/.bind(this)/.then/.catch |
