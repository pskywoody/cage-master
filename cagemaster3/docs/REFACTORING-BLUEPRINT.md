# Caged Cipher · cagemaster3 重构业务蓝图

> 以专家系统架构为核心，从零重建游戏代码

---

## 一、项目定位

**cagemaster3** 是 cagemaster2 的完全重写版。目标：
- 以专家系统（5层架构）为核心驱动游戏
- 消除 cagemaster2 的编码腐蚀、文件臃肿、系统重叠
- 模块化、可维护、单一数据源

**对比**：

| 指标 | cagemaster2 | cagemaster3 |
|------|-------------|-------------|
| JS 文件数 | 50+ | 16 |
| 总代码行数 | 15,000+ | ~2,000 |
| 编码腐蚀 | 200+ 行 | 0 |
| 专家系统 | 有代码未接入 | 完整接入 |
| 音频系统 | 5个重叠系统 | 1个 AudioService |
| 数据源 | chapters.json + story-scenes.json（死数据） | chapters.json（单一源） |

---

## 二、当前完成状态

### 2.1 已完成 ✅

| 模块 | 文件 | 状态 | 说明 |
|------|------|------|------|
| **基础层** | | | |
| EventBus | core/event-bus.js | ✅ | 事件总线 |
| Logger | core/logger.js | ✅ | 日志 |
| EventLogger | core/event-logger.js | ✅ | 事件记录 |
| **专家系统** | | | |
| PlayerStateMonitor | expert/perception/ | ✅ | 感知层：卡关/焦虑/心流检测 |
| DecisionEngine | expert/decision/ | ✅ | 决策层：9条规则+冷却 |
| ExpressionDirector | expert/expression/ | ✅ | 表达层：优先级队列 |
| LearningSystem | expert/learning/ | ✅ | 学习层：玩家画像 |
| BeatQuantizer | expert/timing/ | ✅ | 节拍对齐 |
| ExpertSystem | expert/expert-system.js | ✅ | 五层门面 |
| HintSystem | expert/hint-system.js | ✅ | 简化版提示 |
| **音频** | | | |
| AudioService | audio/audio-service.js | ✅ | 统一入口：SFX/VO/BGM |
| **剧情** | | | |
| StoryEngine | story/story-engine.js | ✅ | 打字机+立绘+背景+道具 |
| **游戏** | | | |
| Board | game/board.js | ✅ | 棋盘逻辑（从cagemaster2复制） |
| Renderer | game/renderer.js | ✅ | 渲染器（从cagemaster2复制） |
| **页面** | | | |
| Guide.js | pages/guide.js | ✅ | 主控制器+工具栏 |
| Guide.html | guide.html | ✅ | 入口页面 |
| **数据** | | | |
| chapters.json | data/ | ✅ | 7章48关完整数据 |
| **样式** | | | |
| style.css | assets/css/ | ✅ | 基础样式 |

### 2.2 已验证的功能

| 功能 | 状态 | 验证结果 |
|------|------|---------|
| 楔子演出 | ✅ | 标题卡→场景1+沈墨→K734→旁白→沈墨台词→场景2+守笼人→... |
| BGM | ✅ | intro.mp3 播放（需首次点击解锁） |
| SFX | ✅ | 开门声/脚步声/打字机声 |
| 打字机效果 | ✅ | 45ms/字，每3字播放音效 |
| 立绘 | ✅ | 280x420，沈墨左侧，其他右侧 |
| 背景切换 | ✅ | scene1→scene2 |
| 棋盘渲染 | ✅ | 4x4 网格，不透明背景 |
| 数字输入 | ✅ | 键盘+数字键+点击 |
| 工具栏 | ✅ | 撤销/擦除/笔记/提示 |
| 笔记模式 | ✅ | Space切换，标记候选数 |
| 提示系统 | ✅ | HintSystem 找空格→角色提示 |
| 专家系统 | ✅ | 感知+决策+表达层接入 |
| PreDialog | ✅ | 关卡前教学对话 |
| ClearDialog | ✅ | 关卡后通关对话 |
| 结算画面 | ✅ | 用时/错误数/专家评语 |
| EventLogger | ✅ | 自动记录所有事件 |

---

## 三、待完成功能

### 3.1 P0 — 核心功能

| 功能 | 说明 | 优先级 |
|------|------|--------|
| Ch2-7 语音ID补全 | story-scenes.json 有正确 ID，需导入 chapters.json | P0 |
| 音色统一 | Ayan(R_001格式) vs SM/CK/J(VO_XX_xx格式) | P0 |
| 笔记视觉显示 | 棋盘上显示小数字候选数 | P0 |

### 3.2 P1 — 体验优化

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 棋盘美化 | 从 cagemaster2 移植完整主题系统 | P1 |
| 笼子显示 | 显示笼子边框和和值 | P1 |
| 选中格高亮 | 同行/列/宫/笼高亮 | P1 |
| 填数动画 | 正确/错误视觉反馈 | P1 |

### 3.3 P2 — 完整功能

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 45法则面板 | 行/列/宫/笼 和值计算 | P2 |
| 教学系统 | 关卡特定教学引导 | P2 |
| 多周目支持 | Route 2/3 剧情分支 | P2 |
| 隐藏关卡 | 801-805 设局人五关 | P2 |
| 真结局 | 父女重逢 | P2 |

---

## 四、架构设计

### 4.1 模块依赖图

```
guide.js (主控制器)
  ├── ExpertSystem (专家系统门面)
  │     ├── PlayerStateMonitor (感知)
  │     ├── DecisionEngine (决策)
  │     ├── ExpressionDirector (表达)
  │     ├── LearningSystem (学习)
  │     ├── BeatQuantizer (节拍)
  │     └── HintSystem (提示)
  ├── AudioService (音频)
  │     ├── sfx (音效)
  │     ├── voice (配音)
  │     └── bgm (背景音乐)
  ├── StoryEngine (剧情)
  │     ├── 打字机效果
  │     ├── 立绘管理
  │     ├── 背景切换
  │     └── 道具展示
  ├── Board (棋盘)
  └── Renderer (渲染)
```

### 4.2 数据流

```
玩家操作 → Board → PlayerStateMonitor → DecisionEngine → ExpressionDirector → AudioService/StoryEngine
     ↑                                    ↑
     └── Solution验证 ←────────────────────┘
```

### 4.3 事件流

```
GlobalBus.emit('game:fill', {row, col, num})
  → ExpertSystem.onFillCorrect/Wrong()
  → PlayerStateMonitor 更新状态
  → DecisionEngine.decide() 生成指令
  → ExpressionDirector.enqueue() 排队
  → AudioService/StoryEngine 执行
```

---

## 五、实施路线图

### Phase 1：语音系统修复（1天）
- [ ] Ch2-7 语音ID从 story-scenes.json 导入 chapters.json
- [ ] 统一语音文件格式（R_xxx.wav → VO_R_xx.wav）
- [ ] 验证所有语音播放正常

### Phase 2：棋盘美化（2天）
- [ ] 从 cagemaster2 移植主题系统（CHAPTER_THEMES）
- [ ] 笼子边框和和值显示
- [ ] 选中格高亮（同行/列/宫/笼）
- [ ] 填数动画反馈

### Phase 3：笔记视觉化（1天）
- [ ] 棋盘上显示小数字候选数
- [ ] 笔记模式视觉指示

### Phase 4：完整关卡体验（2天）
- [ ] 所有关卡的 PreDialog/ClearDialog 完善
- [ ] 章节开场/结尾完整演出
- [ ] 结算画面专家评语

### Phase 5：高级功能（3天）
- [ ] 45法则面板
- [ ] 教学系统
- [ ] 多周目支持

**总计：约 9 天**

---

## 六、关键决策记录

| 决策 | 理由 |
|------|------|
| 新建 cagemaster3 而非改 cagemaster2 | 用户要求"干净清爽，决不允许大规模重复" |
| 专家系统作为核心 | 用户明确要求"以专家系统架构为核心重构" |
| 单一数据源 chapters.json | 用户要求"我不想再出现任何旧版剧情" |
| 五层架构不动 | 架构设计正确，只改执行层实现 |
| AudioService 统一入口 | 消除 5 个音频系统重叠 |
| 打字机效果每3字播放 | 参考 cagemaster2 原始实现 |

---

## 七、风险与缓解

| 风险 | 概率 | 缓解 |
|------|------|------|
| 语音文件格式不匹配 | 高 | 用 story-scenes.json 作为唯一语音ID源 |
| 棋盘渲染回归 | 中 | 从 cagemaster2 复制已验证的 renderer |
| 浏览器 autoplay 阻止 | 高 | AudioService.unlock() 延迟播放模式 |
| 编码腐蚀复发 | 高 | 强制 ASCII 注释规则 |
| 专家系统集成遗漏 | 中 | 每步用 EventLogger 验证事件流 |

---

*文档版本：2026-07-20*
