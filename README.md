# 档案侦探 · 笼中密码 v1.1.0

一款**教学型杀手数独（Killer Sudoku）**游戏。以侦探叙事为载体，从 4×4 入门到 9×9 精通，循序渐进地教授杀手数独解题技巧；高级技巧章节配备**可视化交互教程**；每章末设有**「幽灵迷雾」对战Boss战**，玩家与AI在同一张棋盘上竞速填数，在迷雾中探索、抢格子，先填到75%者获胜。

---

## 更新日志

### v1.1.0 (2026-06-29)

**🆕 新增功能**

- **主菜单系统**：全新菜单界面（menu.html），三大游戏模式入口 + 设置入口 + 统计展示
- **自由模式**（free-play.html）：300道精选谜题，简单/中等/困难三种难度，独立计时与存档
- **设置页面**（options.html）：BGM/音效开关、冲突标红、高亮选项、候选自动清除、数据导出/重置
- **第7章「秘术档案」**：高级技巧教学章节，首关「数对之锁」(levelId=701) 教授显性数对（Naked Pair）
- **三层递进提示系统**：
  - 第1层：高亮目标格位置
  - 第2层：显示技巧名称 + 高亮关联区域（行/列/宫/笼）
  - 第3层：可视化教程演示（高级技巧）或直接显示答案
- **三阶段教学状态管理**：开局（opening）→ 破局（breakthrough）→ 收官（finishing），每个阶段有独立视觉反馈和BGM
- **可视化技巧教程**（TechniqueTutorial）：Canvas动画演示Naked Pair、Hidden Pair、Naked Triple、X-Wing、Swordfish等高级技巧的逻辑推导过程
- **显性数对检测算法**：自动识别Naked Pair及其排除效果
- **BGM阶段切换**：开局/破局/收官三阶段动态切换背景音乐，增加紧张感
- **自动填候选数按钮**（🔢）：一键自动填充所有格子的候选数字

**🔧 修复优化**

- 修复卡壳计时器在开局阶段误触发破局的问题（需玩家先填数才开始计时）
- 修复错误填数导致进度计数偏差的问题（仅正确填数才计入进度）
- 修复页面导航链路（所有页面返回按钮完整闭环）
- 修复浏览器缓存导致的旧代码问题（版本号更新 + 服务器no-cache头）
- 修复根路径 `/` 自动重定向到主菜单
- 修复自由模式关卡ID映射（1-300对应三种难度）
- 补充AudioManager缺失的setSfxEnabled/setBgmEnabled/pauseBGM/resumeBGM方法

---

## 核心特色

- **渐进式教学**：7章43+关，从4×4到9×9，从基础规则到高级技巧，每关聚焦一个解题技巧
- **可视化高级技巧教程**：Canvas动画分步演示数对、X-Wing等高级技巧的推导过程
- **三层智能提示**：从位置提示到技巧讲解到答案，层层递进，不剥夺思考乐趣
- **三阶段教学节奏**：开局热身→破局时刻（高级技巧）→收官连锁，符合真实解题体验
- **引导系统**：聚光灯高亮 + 气泡提示 + 实时反馈，新手也能上手
- **幽灵迷雾对战**：同盘竞速、迷雾探索、抢格子、遭遇事件、动态AI难度
- **叙事驱动**：三位角色（阿岩 / 守笼人 / 设局人）贯穿全程，章末Boss战与剧情深度绑定
- **主菜单与多模式**：故事模式、自由模式（300题）、对战模式、设置中心
- **纯前端实现**：HTML5 Canvas + 原生JS，无需框架，可直接打包为APK

---

## 快速开始

### 环境要求

- Node.js 16+
- 现代浏览器（Chrome / Safari / Firefox / Edge）

### 本地运行

```bash
# 克隆项目
git clone https://github.com/pskywoody/cage-master.git
cd cage-master

# 安装依赖
npm install

# 启动本地服务器（端口3001）
npm start
# 或 node server.js
```

然后在浏览器打开：

- 主菜单：http://localhost:3001/
- 故事模式（章节选择）：http://localhost:3001/chapters.html
- 自由模式：http://localhost:3001/free-play.html
- 设置：http://localhost:3001/options.html
- 快速进入关卡701：http://localhost:3001/guide.html?levelId=701&reset=1

### 手机测试

服务器启动后会显示局域网地址（如 `http://192.168.x.x:3001`），手机连同一WiFi即可访问。

---

## 游戏模式

### 主菜单（menu.html）

游戏入口页面，展示统计数据（已通关/徽章/总用时），提供四大入口：
- 📖 **故事模式**：跟随剧情学习杀手数独技巧
- 🧩 **数独谜题**：300道精选谜题，三种难度自由练习
- ⚔️ **迷雾对战**：与AI对战（BETA）
- ⚙️ **设置**：音频、游戏偏好、数据管理

### 故事模式（guide.html）

7章剧情关卡，每章末有Boss战：

| 章节 | 名称 | 棋盘 | 关卡数 | 教学目标 | Boss |
|------|------|------|--------|----------|------|
| 第1章 | 初识笼中密码 | 4×4 | 9关 | 基础规则、行列宫排除 | 阿岩 |
| 第2章 | 四十五星衡 | 6×6→9×9 | 8关 | 45法则、行/列/宫唯一格 | 守笼人 |
| 第3章 | 档案室深层 | 9×9 | 7关 | 区块排除法 | 设局人残影 |
| 第4章 | 尘封旧案 | 9×9 | 6关 | 残局逆向推导 | 残局守护者 |
| 第5章 | 星辰梭核心 | 9×9 | 6关 | 高级组合技巧 | 星辰梭 |
| 第6章 | 终局笼局 | 9×9 | 6关 | 综合运用 | 设局人 |
| 第7章 | **秘术档案** | 9×9 | 进行中 | **显性数对/隐性数对/三链数/X-Wing/剑鱼** | 秘术守护者 |

### 自由模式（free-play.html + index.html）

- 300道精选谜题，三种难度（简单1-100/中等101-200/困难201-300）
- 支持计时、最佳成绩记录、平均用时统计
- 候选笔记、45法则计算器、自动填候选等工具齐全
- 支持三层提示系统

### 对战模式（battle.html / guide-battle.js）

独立的对战模式（BETA）。教学模式的章末Boss战使用 `guide-battle.js`。

---

## 三阶段教学框架 v1.0

每个教学关卡（尤其是高级技巧关）遵循三阶段节奏：

```
开局（opening）→ 破局（breakthrough）→ 收官（finishing）→ 通关
```

### 开局阶段（Opening）
- 玩家用基础技巧（裸单/隐单/45法则）填入明显的格子
- BGM：舒缓探索风格
- 视觉：正常盘面
- 触发条件：关卡开始

### 破局时刻（Breakthrough）
- 基础技巧推不动了，需要高级技巧（如Naked Pair）
- BGM切换：紧张悬疑风格
- 视觉：四周暗化（vignette），"⚡破局时刻"指示器
- 触发条件：
  - 脚本触发（onFillCountReached，如填够27格后）
  - 自动检测：无裸单/隐单可填且填数比例≥35%
  - 卡壳超时（20-30秒无进展）

### 收官阶段（Finishing）
- 突破点填入后，基础技巧连锁反应完成剩余格子
- BGM：明快收尾风格
- 视觉：庆祝动画
- 触发条件：破局后连锁开始，空格<15%

---

## 三层提示系统

所有游戏模式（教学/自由/对战）统一使用三层递进提示：

| 点击次数 | 提示内容 | 视觉效果 |
|----------|----------|----------|
| 第1次 | 目标格位置 | 绿色边框高亮目标格 |
| 第2次 | 技巧名称 + 关联区域 | 紫色标记关键格（如数对格）+ 金色高亮关联区域 + 详细文字说明 |
| 第3次 | 答案或教程 | 基础技巧：显示答案数字；高级技巧：启动TechniqueTutorial可视化教程 |

高级技巧的第三层提示会启动全屏Canvas教程，动画演示：
1. 高亮关键格子
2. 展示候选数分布
3. 动画演示数对/构型的识别过程
4. 逐步演示排除逻辑
5. 揭示最终确定的数字

---

## 幽灵迷雾对战规则 v1.0

### 基础玩法

- **同盘竞速**：玩家和AI在同一张棋盘上解题，答案唯一
- **幽灵格**：AI填的格子显示为淡色半透明色块+圆点，**不显示数字**
- **抢格子**：空格子谁先填对归谁；玩家可以填AI已填的格子，填对即抢过来（绿色闪光）
- **填错处理**：格子闪红，不改变归属，不散开迷雾
- **胜负判定**：先填到总空格数 **75%** 的一方获胜

### 迷雾系统

- 玩家只能看到距离自己已填格子（含固定数字）**曼哈顿距离 ≤ 2** 范围内的区域
- 超出范围被迷雾覆盖（深色半透明蒙版），看不到AI是否填了
- 每填对一个格子，周围迷雾散开；擦除后迷雾收回
- 固定数字、玩家填对的格子（含抢来的）都是视野锚点；AI幽灵格**不是**锚点

### 遭遇事件

AI从四个方向接近时触发三档反馈（每个方向每档只触发一次）：

| 距离 | 反馈 | 体感 |
|------|------|------|
| 3~4格 | 灰色气泡 + 轻震 | "嗯？那边好像有动静" |
| 2格 | 橙色气泡 + 中震 | "左边发现AI踪迹！" |
| 1格（接壤） | 红色气泡 + 强震 + 屏震 | "糟了，脸贴脸了！" |

### AI对手

| 对手 | 速度 | 填数风格 | 特点 |
|------|------|----------|------|
| 阿岩 | 6~11秒/步 | 随机跳填，15%概率"失误"跳格 | 活泼冒失，轻松赢 |
| 守笼人 | 3.5~6秒/步 | 按线索数从易到难，规规矩矩 | 沉稳导师，有来有回 |
| 设局人残影 | 2.5~4.5秒/步 | 从四周往中间包抄 | 冷酷精准 |
| 残局守护者 | 2~3.8秒/步 | 规矩填数 | 残留意念，不手软 |
| 星辰梭 | 1.5~2.8秒/步 | 从四周包抄 | 推演机器，极快 |
| 设局人 | 1~2秒/步 | 从四周包抄 | 终局之敌，最快 |

所有AI都有**动态速度曲线**：开局（0~25%）慢30%给玩家探索时间，后期（75%~100%）快20%制造冲刺紧张感。

---

## 项目结构

```
killersudoku/
├── server.js                    # Express本地服务器（端口3001）
├── package.json                 # 项目配置（v1.1.0）
├── README.md                    # 本文档
├── game-src/                    # 前端源码
│   ├── menu.html                # 🆕 主菜单入口
│   ├── index.html               # 自由模式游戏页
│   ├── guide.html               # 教学模式入口
│   ├── battle.html              # 对战模式入口
│   ├── free-play.html           # 🆕 自由模式选关页
│   ├── options.html             # 🆕 设置页面
│   ├── chapters.html            # 章节目录页
│   ├── chapter-levels.html      # 关卡选择页
│   ├── levels.html              # 旧版关卡页
│   ├── main.js                  # 自由模式核心逻辑
│   ├── guide.js                 # 教学模式核心逻辑（三阶段管理+三层提示）
│   ├── game.js                  # 数独棋盘数据模型（含Naked Pair检测）
│   ├── renderer.js              # Canvas渲染引擎（阶段视觉效果）
│   ├── guide-battle.js          # 幽灵迷雾对战引擎（Boss战）
│   ├── battle.js                # 独立对战模式
│   ├── guide-manager.js         # 教学引导系统（触发器/聚光灯/气泡）
│   ├── story.js                 # 剧情对话系统
│   ├── utils/
│   │   ├── storage.js           # 本地存档
│   │   ├── audio.js             # 音效管理（BGM阶段切换）
│   │   └── technique-tutorial.js # 🆕 高级技巧可视化教程系统
│   ├── assets/
│   │   ├── css/style.css        # 全局样式（含对战UI动画/菜单样式）
│   │   └── images/              # 角色头像等图片资源
│   └── data/
│       ├── chapters.json        # 教学关卡数据（7章43+关）
│       └── levels.json          # 自由模式题库（300关）
├── tools/                       # 🆕 开发工具
│   ├── puzzle-validator.js      # 教学关卡验证器
│   ├── build-701v5.js           # 关卡701生成脚本
│   └── level701-final.json      # 关卡701最终数据
├── node-script/
│   ├── solver-rater.js          # 杀手数独求解器 + 难度评级
│   └── human-simulator.js       # 人类解题模拟器
├── android/                     # Capacitor Android打包
└── docs/                        # 设计文档
```

---

## 核心模块说明

### 棋盘模型（game.js）

- 支持 4×4 / 6×6 / 9×9 三种尺寸
- 笼子（Cage）数据结构：和值 + 格子坐标列表
- 候选笔记系统
- 撤销/重做历史栈
- 冲突检测（行列宫重复 + 笼子和值超限）
- 45法则辅助计算
- **三层提示系统**：showHint(level) 支持 level=1/2/3
- **显性数对检测**：_findNakedPairHint() 自动识别Naked Pair

### 渲染引擎（renderer.js）

- Canvas 2D 渲染，自适应屏幕尺寸
- 支持高DPI屏幕
- 笼子和值标签、候选数字、选中高亮、错误标记、同数字高亮
- **阶段视觉效果**：破局阶段暗角、阶段指示器动画
- 提示高亮：目标格（绿）、数对格（紫）、关联区域（金）

### 引导系统（guide-manager.js）

- 触发器系统：`onLevelStart` / `onCellSelect` / `onNumberFilled` / `onConflict` / `onStuckForSeconds` / `onFillCountReached` / `onBoxLastCellFill` 等
- 聚光灯遮罩（freeze mask）引导玩家操作
- 气泡提示指向特定UI元素
- 透视面板：实时显示所选格子所在行/列/宫已用数字
- **卡壳计时器**：仅在玩家填过数字后开始累积，支持minFillCount条件
- **阶段转换触发**：enter_phase动作触发开局→破局→收官转换

### 可视化教程（technique-tutorial.js）🆕

- Canvas全屏动画演示高级技巧
- 支持的教程：Naked Pair、Hidden Pair、Naked Triple、X-Wing、Swordfish
- 分步动画：高亮关键格→展示候选→演示排除→揭示结果
- 脉冲效果、渐变动画、文字解说
- 可扩展：通过TECHNIQUE_TUTORIALS配置添加新教程

### 对战引擎（guide-battle.js）

- 状态机：等待倒计时 → 竞速中 → 结束
- 迷雾视野：曼哈顿距离计算 + 渐变动画
- AI调度：按风格排序填数顺序 + 动态间隔 + 失误模拟
- 遭遇检测：四方向×三档距离，节流防重复
- UI组件：双方进度条、倒计时、结果弹窗、胜负重试

### 音频系统（audio.js）

- Web Audio API生成BGM和音效
- 三阶段BGM：开局（舒缓）→破局（紧张）→收官（明快）
- setSfxEnabled/setBgmEnabled/pauseBGM/resumeBGM方法供设置页调用
- _bgmPausedByUser标志跟踪用户暂停状态

---

## 数据格式

### 教学关卡（chapters.json）

```json
{
  "levelId": 701,
  "title": "第1关：数对之锁",
  "gridSize": 9,
  "difficulty": "中等",
  "teachingGoal": "学习显性数对（Naked Pair）",
  "features": {
    "allowDraft": true,
    "assistant45": true,
    "showHints": true,
    "autoFillCandidates": true
  },
  "triggers": [
    {
      "condition": "onLevelStart",
      "type": "freeze_mask",
      "text": "开场引导文字...",
      "once": true
    },
    {
      "condition": "onFillCountReached",
      "count": 27,
      "type": "enter_phase",
      "phase": "breakthrough",
      "once": true
    },
    {
      "condition": "onStuckForSeconds",
      "seconds": 30,
      "type": "popup_hint",
      "text": "提示文字..."
    }
  ],
  "boardData": [[0,0,0,...], ...],
  "cages": [{"id":1,"sum":45,"cells":[[0,0],...]}],
  "solution": [[3,4,5,...], ...]
}
```

### Boss配置（guide-battle.js 中 BOSS_CONFIGS）

```js
{
  name: '阿岩',
  avatar: '👦',
  color: '#22c55e',
  speedMin: 6000,
  speedMax: 11000,
  mistakeChance: 0.15,
  fillStyle: 'random',
  preDialog: [...],
  winDialog: [...],
  warningLines: [...],
  encounterLines: {
    far:  { text: '...', intensity: 'light' },
    mid:  { text: '...', intensity: 'medium' },
    near: { text: '...', intensity: 'strong' }
  }
}
```

---

## 开发指南

### 添加新教学关卡

1. 设计盘面：确保初始裸单3-5个，基础连锁后卡壳，卡壳点存在目标高级技巧
2. 使用 `tools/puzzle-validator.js` 验证盘面有效性
3. 在 `game-src/data/chapters.json` 对应章节的 `levels` 数组中添加关卡数据
4. 配置triggers实现三阶段节奏控制
5. 若有新技巧，在 `utils/technique-tutorial.js` 添加可视化教程配置
6. 若为章末Boss关，在 `guide-battle.js` 的 `BOSS_CONFIGS` 中添加对应配置

### 调试技巧

- URL参数 `?levelId=XXX` 直接跳转到指定关卡
- URL参数 `?levelId=XXX&reset=1` 清除存档重新开始
- URL参数 `?story=0` 跳过开场剧情
- 浏览器右下角🐛按钮打开调试面板查看日志
- 浏览器控制台可访问全局对象 `guideBoard`、`guideManager`、`guideRenderer` 进行调试
- `guideManager._numberFillCount` 查看正确填数次数
- `guideManager._stuckTimer` 查看卡壳计时
- `gamePhase()` 查看当前阶段

### 代码规范

- 纯原生JS，无构建工具、无框架
- 前端模块通过全局对象通信
- CSS类名使用 kebab-case，JS变量使用 camelCase
- 中文注释

---

## 技术栈

- **前端**：HTML5 Canvas / 原生 JavaScript / CSS3（Flexbox + 动画）
- **后端**：Node.js + Express（仅用于本地静态文件服务和API）
- **音频**：Web Audio API（程序生成BGM和音效）
- **打包**：Capacitor（可打包为Android/iOS APK）
- **版本控制**：Git + GitHub

---

## Git仓库

https://github.com/pskywoody/cage-master

---

## License

MIT
