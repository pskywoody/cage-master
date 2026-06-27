# 档案侦探 · 笼中密码

一款**教学型杀手数独（Killer Sudoku）**游戏。以侦探叙事为载体，从 4×4 入门到 9×9 精通，循序渐进地教授杀手数独解题技巧；每章末设有**「幽灵迷雾」对战Boss战**，玩家与AI在同一张棋盘上竞速填数，在迷雾中探索、抢格子，先填到75%者获胜。

---

## 核心特色

- **渐进式教学**：6章42关，从4×4到9×9，每关聚焦一个解题技巧
- **引导系统**：聚光灯高亮 + 气泡提示 + 实时反馈，新手也能上手
- **幽灵迷雾对战**：同盘竞速、迷雾探索、抢格子、遭遇事件、动态AI难度
- **叙事驱动**：三位角色（阿岩 / 守笼人 / 设局人）贯穿全程，章末Boss战与剧情深度绑定
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

# 启动本地服务器（端口3000）
node server.js
```

然后在浏览器打开：

- 首页（自由模式）：http://localhost:3000
- 章节选择：http://localhost:3000/chapters.html
- 教学模式入口：http://localhost:3000/chapter-levels.html?id=1

### 手机测试

服务器启动后会显示局域网地址（如 `http://192.168.x.x:3000`），手机连同一WiFi即可访问。

---

## 游戏模式

### 教学模式（guide.html）

6章剧情关卡，每章末有Boss战：

| 章节 | 名称 | 棋盘 | 关卡数 | 教学目标 | Boss |
|------|------|------|--------|----------|------|
| 第1章 | 初识笼中密码 | 4×4 | 9关 | 基础规则、行列宫排除 | 阿岩 |
| 第2章 | 四十五星衡 | 6×6→9×9 | 8关 | 45法则、行/列/宫唯一格 | 守笼人 |
| 第3章 | 档案室深层 | 9×9 | 7关 | 区块排除法 | 设局人残影 |
| 第4章 | 尘封旧案 | 9×9 | 6关 | 残局逆向推导 | 残局守护者 |
| 第5章 | 星辰梭核心 | 9×9 | 6关 | 高级组合技巧 | 星辰梭 |
| 第6章 | 终局笼局 | 9×9 | 6关 | 综合运用 | 设局人 |

### 自由模式（index.html / main.js）

随机题库练习，支持难度分级、计时、候选笔记、45法则计算器等工具。

### 对战模式（battle.html / battle.js）

独立的对战模式（开发中）。教学模式的章末Boss战使用 `guide-battle.js`。

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

### 终局预警

任意一方达到60%进度时：
- AI到60%：屏幕边缘红色脉冲光 + 角色警告台词 + 强震动
- 玩家到60%：正向鼓励提示

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
├── server.js                    # Express本地服务器
├── game-src/                    # 前端源码
│   ├── index.html               # 自由模式入口
│   ├── guide.html               # 教学模式入口
│   ├── battle.html              # 对战模式入口
│   ├── chapters.html            # 章节目录页
│   ├── chapter-levels.html      # 关卡选择页
│   ├── levels.html              # 自由模式关卡页
│   ├── main.js                  # 自由模式核心逻辑
│   ├── guide.js                 # 教学模式核心逻辑
│   ├── game.js                  # 数独棋盘数据模型
│   ├── renderer.js              # Canvas渲染引擎
│   ├── guide-battle.js          # 幽灵迷雾对战引擎（Boss战）
│   ├── battle.js                # 独立对战模式
│   ├── guide-manager.js         # 教学引导系统（聚光灯/气泡/触发）
│   ├── story.js                 # 剧情对话系统
│   ├── ui.js                    # UI交互辅助
│   ├── utils/
│   │   ├── storage.js           # 本地存档
│   │   ├── audio.js             # 音效管理
│   │   ├── audio-manager.js     # 音效管理器
│   │   └── i18n.js              # 国际化
│   ├── assets/
│   │   ├── css/style.css        # 全局样式（含对战UI动画）
│   │   └── images/              # 角色头像等图片资源
│   └── data/
│       ├── chapters.json        # 教学关卡数据（6章42关）
│       ├── levels.json          # 自由模式题库
│       └── chapters/            # 分章关卡数据
├── node-script/
│   ├── solver-rater.js          # 杀手数独求解器 + 难度评级
│   └── human-simulator.js       # 人类解题模拟器
├── generate-levels.js           # 关卡生成脚本
└── CageMaster-debug.apk         # 安卓测试包
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

### 渲染引擎（renderer.js）

- Canvas 2D 渲染，自适应屏幕尺寸
- 支持高DPI屏幕
- 笼子和值标签、候选数字、选中高亮、错误标记、同数字高亮等视觉反馈

### 引导系统（guide-manager.js）

- 触发器系统：`onLevelStart` / `onCellSelect` / `onNumberFilled` / `onConflict` / `onBoxLastCellFill` 等
- 聚光灯遮罩（freeze mask）引导玩家操作
- 气泡提示指向特定UI元素
- 透视面板：实时显示所选格子所在行/列/宫已用数字

### 对战引擎（guide-battle.js）

- 状态机：等待倒计时 → 竞速中 → 结束
- 迷雾视野：曼哈顿距离计算 + 渐变动画
- AI调度：按风格排序填数顺序 + 动态间隔 + 失误模拟
- 遭遇检测：四方向×三档距离，节流防重复
- UI组件：双方进度条、倒计时、结果弹窗、胜负重试

---

## 数据格式

### 教学关卡（chapters.json）

```json
{
  "levelId": 109,
  "title": "第9关：结业考核",
  "gridSize": 4,
  "difficulty": "简单",
  "teachingGoal": "综合运用4×4基础技巧",
  "boardData": [[1,0,0,4],[0,0,0,0],[0,0,0,0],[4,0,0,1]],
  "cages": [
    { "id": 1, "sum": 5, "cells": [[0,0],[0,1],[1,0]] }
  ],
  "solution": [[1,2,3,4],[3,4,1,2],[2,3,4,1],[4,1,2,3]],
  "triggers": []
}
```

### Boss配置（guide-battle.js 中 BOSS_CONFIGS）

```js
109: {
  name: '阿岩',
  avatar: '👦',
  color: '#22c55e',
  speedMin: 6000,        // 最小间隔(ms)
  speedMax: 11000,      // 最大间隔(ms)
  mistakeChance: 0.15,  // 失误概率
  fillStyle: 'random',  // random | normal | surround
  preDialog: [...],     // 赛前对话
  winDialog: [...],     // 胜利对话
  warningLines: [...],  // 60%警告台词
  encounterLines: {     // 遭遇事件台词
    far:  { text: '...', intensity: 'light' },
    mid:  { text: '...', intensity: 'medium' },
    near: { text: '...', intensity: 'strong' }
  }
}
```

---

## 开发指南

### 添加新关卡

1. 在 `game-src/data/chapters.json` 对应章节的 `levels` 数组中添加关卡数据
2. 确保 `solution` 是唯一解，`cages` 覆盖所有非固定格子
3. 若为章末Boss关（每章最后一关），在 `guide-battle.js` 的 `BOSS_CONFIGS` 中添加对应配置
4. 可使用 `generate-levels.js` 脚本辅助生成有效关卡

### 调试技巧

- URL参数 `?levelId=XXX` 直接跳转到指定关卡
- URL参数 `?story=0` 跳过开场剧情
- 浏览器控制台可访问全局对象 `guideBoard`、`guideRenderer`、`GuideBattle` 进行调试
- 设置页有 🐛 调试按钮（如已启用）

### 代码规范

- 纯原生JS，无构建工具、无依赖
- 前端模块通过全局对象通信（`const GuideBattle = {...}`）
- CSS类名使用 kebab-case，JS变量使用 camelCase
- 中文注释

---

## 技术栈

- **前端**：HTML5 Canvas / 原生 JavaScript / CSS3（Flexbox + 动画）
- **后端**：Node.js + Express（仅用于本地静态文件服务和关卡生成）
- **打包**：Capacitor（可打包为Android/iOS APK）
- **版本控制**：Git + GitHub

---

## Git仓库

https://github.com/pskywoody/cage-master

---

## License

MIT
