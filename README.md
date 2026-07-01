# 档案侦探 · 笼中密码 v1.2.0

一款**教学型杀手数独（Killer Sudoku）**游戏，同时支持**抖音小程序**与独立APK运行。以侦探叙事为载体，从 4×4 入门到 9×9 精通，循序渐进地教授杀手数独解题技巧；高级技巧章节配备**可视化交互教程**；每章末设有**「幽灵迷雾」对战Boss战**，玩家与AI在同一张棋盘上竞速填数，在迷雾中探索、抢格子，先填到75%者获胜。

---

## 更新日志

### v1.2.0 (2026-07-01)

**🆕 新增功能**

- **500道杀手数独速度谜题**：5个难度各100道（入门/简单/中等/困难/地狱），基于LMD社区高质量种子 + 数学变换生成
- **谜题质量评估报告**：全面盘查了3大模式849道谜题的数据完整性，产出HTML评估文档
- **增量更新API规划**：设计了完整的v2 API方案（SQLite数据库+版本化+增量加载）

**🐛 修复**

- **修复速度谜题空白棋盘问题**：`levels-killer.json`中255关全0占位数据被替换为500道有效题
- **修复教学关卡loading逻辑**：移除对旧版全0测试数据文件（`teaching-levels-*.json`）的依赖
- **关卡数据校验增强**：添加boardData非0数字检查，防止空白题
- **降级策略改进**：数据加载失败时优先重定向章节选择，不再显示假关卡

**🔧 优化**

- 杀手数独题库数据完整性自动化验证（笼覆盖/和值匹配/cells一致性）
- 教学关卡所有新旧数据源归并清理
- 缓存版本号统一更新（避免用户使用旧缓存）

---

## 三大游戏模式

### 📖 故事模式（guide.html）

7章剧情关卡，从4×4零基础到9×9高级技巧，每章末有Boss战：

| 章节 | 名称 | 棋盘 | 关卡数 | 教学目标 | Boss |
|------|------|------|--------|----------|------|
| 第1章 | 初识笼中密码 | 4×4 | 10关 | 基础规则、行/列/宫排除、裸单/隐单 | 阿岩 |
| 第2章 | 四十五星衡 | 6×6→9×9 | 8关 | 45法则、行/列/宫唯一格 | 守笼人 |
| 第3章 | 档案室深层 | 9×9 | 7关 | 区块排除法 | 设局人残影 |
| 第4章 | 尘封旧案 | 9×9 | 6关 | 候选笔记、隐性数对、三链数 | 残局守护者 |
| 第5章 | 星辰梭核心 | 9×9 | 6关 | 嵌套笼、异形笼、复合笼组合 | 星辰梭 |
| 第6章 | 终局笼局 | 9×9 | 6关 | 大笼分析、深度推理、设局人谜题 | 设局人 |
| 第7章 | 秘术档案 | 9×9 | 6关 | 显性数对/隐性数对/三链数/X-Wing/剑鱼 | 秘术守护者 |

### 🧩 速度谜题（index.html?mode=killer）

500道精选杀手数独题，5个难度各100道，独立计时与存档：

| 难度 | 题量 | 提示数范围 | 平均提示数 |
|------|------|-----------|-----------|
| 🌱 入门 | 100 | 40-50 | ~45 |
| 🌿 简单 | 100 | 33-39 | ~36 |
| 🌳 中等 | 100 | 27-32 | ~30 |
| 🔥 困难 | 100 | 20-26 | ~23 |
| 💀 地狱 | 100 | 1-19 | ~10 |

### 🧩 经典数独（free-play.html）

300道标准数独题，三种难度（简单/中等/困难），含全部工具（候选笔记、45法则、自动填候选）。

---

## 特色系统

### 🎯 三阶段教学框架

```
开局（opening）→ 破局（breakthrough）→ 收官（finishing）→ 通关
```

- **开局**：用基础技巧（裸单/隐单/45法则）填入明显格子，舒缓BGM
- **破局**：基础技巧卡壳，触发高级技巧教学，BGM切换紧张风格
- **收官**：突破后连锁反应完成剩余格子，明快收尾BGM

### 💡 三层提示系统

| 点击次数 | 提示内容 | 视觉效果 |
|----------|----------|----------|
| 第1次 | 目标格位置 | 绿色边框高亮 |
| 第2次 | 技巧名称 + 关联区域 | 紫色高亮关键格+金色关联区域 |
| 第3次 | 答案或全屏可视化教程 | 基础技巧显示数字；高级技巧启动动画教程 |

### 👻 幽灵迷雾对战（Boss战）

- **同盘竞速**：玩家与AI在同一棋盘上填数竞争
- **迷雾系统**：曼哈顿距离≤2可见，超范围被迷雾覆盖
- **抢格子**：空格子先填对归谁，AI的格子可抢夺
- **遭遇事件**：AI接近时触发三档距离反馈
- **6个AI对手**：从阿岩（易）到设局人（极难），各有独特风格

### 🎨 主题皮肤系统

6套章节主题皮肤，盘面颜色跟随剧情切换（温暖侦探风→星辰蓝调→终局暗红等）。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | HTML5 Canvas + 原生 JavaScript + CSS3 |
| **后端** | Node.js + Express（静态文件 + API） |
| **音频** | Web Audio API（程序生成） |
| **打包** | Capacitor（APK） |
| **题库来源** | LMD社区爬虫 + 手工构造 + 数学变换 |
| **难度评级** | HumanSimulator 人类解法模拟器 |

---

## 项目结构

```
killersudoku/
├── server.js                    # Express本地服务器（端口3001）
├── package.json                 # 项目配置（v1.2.0）
├── README.md                    # 本文档
├── game-src/                    # 前端源码
│   ├── menu.html                # 主菜单入口
│   ├── index.html               # 速度谜题/经典数独游戏页
│   ├── guide.html               # 故事模式入口
│   ├── battle.html              # 对战模式入口
│   ├── free-play.html           # 经典数独选关页
│   ├── chapters.html            # 章节目录页
│   ├── chapter-levels.html      # 关卡选择页
│   ├── options.html             # 设置页面
│   ├── main.js                  # 速度谜题/经典数独核心逻辑
│   ├── guide.js                 # 故事模式核心逻辑（三阶段+三层提示）
│   ├── game.js                  # 数独棋盘数据模型
│   ├── renderer.js              # Canvas渲染引擎
│   ├── guide-battle.js          # 幽灵迷雾对战引擎
│   ├── guide-manager.js         # 教学引导系统（触发器/聚光灯/气泡）
│   ├── story.js                 # 剧情对话系统
│   ├── utils/
│   │   ├── storage.js           # 本地存档
│   │   ├── audio.js             # 音效管理（BGM阶段切换）
│   │   └── technique-tutorial.js # 高级技巧可视化教程
│   ├── assets/
│   │   ├── css/style.css        # 全局样式
│   │   ├── images/portraits/    # 角色头像（JPG/PNG双格式）
│   │   └── audio/midi/          # MIDI BGM文件
│   └── data/
│       ├── chapters.json        # 教学关卡数据（7章49关）
│       ├── levels.json          # 经典数独题库（300关）
│       ├── levels-killer.json   # 杀手数独题库（500关 ✅ 新）
│       └── puzzles/             # 爬虫种子+变体
├── crawlers/                    # 谜题爬虫与生成管线
├── node-script/                 # Node.js后端工具
│   ├── solver-rater.js          # 杀手数独求解器 + 难度评级
│   └── human-simulator.js       # 人类解题模拟器
├── puzzle-evaluation/           # 谜题质量评估报告 ✅ 新
├── android/                     # Capacitor Android打包
└── docs/                        # 设计文档
```

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
```

### 访问入口

| 页面 | 地址 |
|------|------|
| 主菜单 | http://localhost:3001/ |
| 故事模式 | http://localhost:3001/chapters.html |
| 速度谜题（杀手） | http://localhost:3001/index.html?mode=killer&id=1 |
| 经典数独 | http://localhost:3001/free-play.html |
| 设置 | http://localhost:3001/options.html |
| 快速进关卡701 | http://localhost:3001/guide.html?levelId=701&reset=1 |

### 手机测试

```bash
# 手机连同一WiFi后访问
# 服务器启动时会显示：http://192.168.x.x:3001
```

---

## 开发指南

### 添加新教学关卡

1. 设计盘面：确保初始裸单3-5个，基础连锁后卡壳，卡壳点存在目标高级技巧
2. 在 `game-src/data/chapters.json` 对应章节的 `levels` 数组中添加关卡数据
3. 配置 triggers 实现三阶段节奏控制
4. 若有新技巧，在 `utils/technique-tutorial.js` 添加可视化教程配置
5. 使用 URL 参数 `?levelId=XXX&reset=1` 测试

### 运行爬虫

```bash
# 爬取LMD杀手数独种子
node crawlers/lmd-crawler.js

# 批量生成变体
node crawlers/pipeline.js

# 重新生成杀手题库（500道）
node c:\Users\pskyw\.trae-cn\work\6a3cfaed3a6e5ba0f8caeca4\build_killer_db.js
```

### 生成谜题评估报告

```bash
# 打开以下HTML文件查看报告
d:\killersudoku\puzzle-evaluation\puzzle-evaluation.html
```

---

## 抖音小程序支持

本项目可打包为**抖音小程序**（适配小游戏容器）或**独立APK**（通过Capacitor）。详见后续体系化建设规划。

---

## Git仓库

https://github.com/pskywoody/cage-master

---

## License

MIT
