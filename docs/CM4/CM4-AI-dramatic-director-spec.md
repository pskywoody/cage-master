# CM4-D1 · 对抗戏剧导演引擎设计规格（v2，含 D2 策略池）

> **Code**：CM4-D1 / CM4-D2 · **状态**：规格定稿（待实现）
> **版本**：v2 — 折叠 Director Strategy Pool 为导演层具体实现
> **日期**：2026-08-11
> **对象**：`core/battle-manager.js` 之 `AIPlayerCore` / `OpponentObserver`，`core/three-point-line-manager.js`，`core/tpl-battle-controller.js`，`scripts/duel-ai-tpl.mjs`
> **基线约束**：B3-FINAL 生成链路不可变（对战斗 AI 不适用）；本规格只改 AI 决策层，不改 TPL 规则判定

---

## 1. 定位

三点连线 Boss 战的 AI 价值不在解数独，而在让玩家在「看懂、拦截、反超、绝杀」四个动作里反复品尝自己的聪明。AI 因此不是求解器，而是**会下棋的对抗戏剧导演**——它认真想赢，只是把「赢」的路径选得更可读、更有张力。

导演大脑（Director）决定「为什么走」，战术求解器（Tactical Solver）决定「怎么走」。现有 `_determineStrategy` / `_selectStep` / `_calcHumanLikeScore` 与 `TechRater` 已构成 Solver 层；本规格新增的是其上的 Director 层。

## 2. 目标层级

AI 不追求最大化胜率，也不追求最大化戏剧，而是遵循三级约束。戏剧只能在「胜率几乎等价」的动作间生效，否则就退化成陪玩机器人。

| 层 | 目标 | 类型 | 约束强度 |
|---|---|---|---|
| L0 | 不送大礼：不主动下臭棋、不故意露破绽 | 硬约束 | 不可违反 |
| L1 | 赢：追求胜率最大、惩罚玩家失误 | 硬目标 | 主目标 |
| L2 | 赢得好玩：可读、有张力、有戏剧弧线 | 软偏好 | 仅在 ε 等价动作间生效 |

**ε 等价定义**：ε 取模型自身分辨率（约 2–3pp）。胜率差异低于 ε 的动作视为统计不可分（噪声），Drama 有完全自由；高于 ε 的差异视为真实差距，Drama 无权干涉。随机放水因超出 ε，不在 Drama 的触及范围内。

## 3. 四层结构

```
AIPlayerCore
      |
      v
Director
      |
      |-- Phase Detector（剧情状态机）
      |-- Strategy Pool（七条战术意图模板）
      |-- Personality Bias（人格 → 策略权重：选枚举，非新增数值轴）
      |-- ε Gate（两级：策略级粗 / 候选级精确）
      |-- 策略锁（3–8 步 + 打破条件）
      v
Tactical Solver（现有层）
      |
      v
TechRater
```

Director 不直接选格，只输出「选哪条策略意图 + 锁多久」。策略是**数据化意图**，不是代码分支；Solver 为实现意图自选落子、抢格、笔记等手段。

Design axiom：Director 不改变棋局，只改变玩家看到棋局的方式。它在真实竞争空间中选择最具戏剧价值的胜利路径。

## 4. Director Strategy Pool

策略不是动作，是意图。每条策略 = 对现有 Solver 旋钮的参数化意图（`targetHub`、`stealPriority`、`hubOwnership` 方向等），**禁止 `switch(name)` 行为分支**。

| # | 策略 | intent | 触发 | 玩家感觉 |
|---|---|---|---|---|
| 1 | Probe 试探 | test_player_response | Opening | 它在正常下棋 |
| 2 | Pressure 施压 | contest_hub | Development/Crisis | 它要拿这里，我拦得住 |
| 3 | Steal 夺取 | capture_enemy_error | 玩家犯错 | 你露破绽，我利用 |
| 4 | Fortify 巩固 | protect_owned_hubs | AI 领先 | 它很稳 |
| 5 | Gamble 赌博 | create_high_variance | 莹莹·落后 | 她赌输了 |
| 6 | Trap 诱导 | bait_player | 沈墨 | 我不知道她下一步想干什么 |
| 7 | Finish 收束 | convert_advantage | 优势明显 | 它要结束了 |

**选择逻辑**：Win Need 与 Drama Need 双过滤 → ε Gate 淘汰明显送死 → Drama 在等价策略间挑选。人格通过 `strategyBias`（对各策略的权重）偏向，例如莹莹 `{gamble:2, steal:1.5}`、阿妍 `{fortify:2, pressure:1.5}`、沈墨 `{trap:2}`。

**策略锁**：锁定 3–8 步制造「它在执行计划」的连贯感，并定义打破条件（据点归属翻转、玩家失误尖峰、目标据点数突变）以便提前解锁，避免锁住后对变化视而不见。

### 策略级硬约束

- **Trap 假目标 ε 等价**：fakeTargetHub 与 realTargetHub 胜率必须等价，否则是披着心理战外衣的输棋。
- **Gamble 只调激进度不调正确性**：提高抢格激进度可以，降低承诺阈值不可以；「赌输了」来自高风险抢格失败，不来自算错。
- **Finish 近硬优先级**：优势明确时覆盖戏剧选择（L1 硬目标），不是七选一的平等选项。
- **信息公平**：所有策略只能观察玩家公开行为（filled / mistakes / occupied hubs / visible notes），不得读取玩家未来候选、隐藏意图、solver 状态。

## 5. 剧情状态机

状态由对局指标**推导**（`step%` / `hubDiff` / `wrongCount`），可复现、可测试。

| 状态 | 触发条件 | 导演动作 | 玩家情绪 |
|---|---|---|---|
| Opening | step < 15% | 轻压力，不抢核心据点，展示能力 | 学会规则 |
| Development | 15%–50% | 主动争夺一个据点，但意图可读 | 我看懂了它、我阻止了它 |
| Crisis | 50%–80% | 抢据点、建立连线威胁、制造幽灵格 | 我要输了 |
| Climax | 80%+ | 领先则制造「最后机会」；落后则进入 desperation | 差一点输了 / 它拼命了 |

`escape_window` 是 Drama 度量而非运行时约束：它记录每局玩家发现威胁、改变局势、反击的次数，用于**评价**，不限制 AI。简单局 window≈5、困难局 window≈1、高手局 window=0 均可成立。

## 5. 双轴错误模型

单一 `baseErrorRate` 太粗。拆成两个正交纬度：

- **Accuracy（正确性）**：对不确定动作的承诺阈值 + 人味失误。实质是「在无强候选时敢不敢 commit 一个猜测/低把握格」，不是「引擎会不会算错」。六人格共享同一 TechRater，真实解题能力平等，差异只在「敢不敢在不确定上下注」。
- **Aggression（激进度）**：愿不愿承担风险。不新增参数，而是 Director 对现有旋钮的调制信号。

**Aggression 调制现有旋钮**：

| Aggression | 调制 | 失败形态（读作） |
|---|---|---|
| ↑ | `stealPriority`↑、`stealErrorRatePenalty`↑ | 抢格失败 → 格恢复空白（它赌输了） |
| ↑ | `hubWeight`↑ 冲据点 | 冒进被幽灵化 |
| ↑ | `misreadChance`↑ | 看错行 → 填到邻格（它急了） |

**错误必须来自决策空间**：禁止随机错误。AI 选高风险动作（抢格、冲敏据点）后因风险失败，读作「我选择了风险」，不读作「我不知道」。失败成本全部由 TPL/行为层现成承担（抢格失败恢复、看错行），Director 无需新写失败生成代码，只提高 Aggression 让 AI 更常去选那个会失败的高风险动作。

## 7. 据点 = 剧情舞台

据点不是「收益最高的胜利资源」，而是「在哪里制造冲突」的舞台（左翼 / 中央 / 右翼）。AI 不追问哪个据点收益最高，而追问哪个据点能针对玩家当前打法制造张力。玩家连守左翼时，AI 转中央突袭，让玩家感到「它在针对我的打法」。

## 8. 观察器升级

现有 `OpponentObserver` 看玩家填哪里；升级为看玩家**连续行为意图**：

```
playerIntent: { attackingHub, defendingHub, chasingLine, riskLevel }
```

例：玩家疯狂抢据点 → AI 判定「你想争据点」→ 故意放弃外围 → 诱导玩家深入 → 反抢中心。玩家体验为「它在跟我斗智」。

## 9. 人格 = 导演风格

人格不是难度，是导演风格；强度（难度）与风格正交。玩家调难度只改基础能力（解题速度、思考时间、基础错误率），不换性格。

| 角色 | 风格 | Accuracy / Aggression | 玩家感觉 |
|---|---|---|---|
| 莹莹 | 冒险型 | 0.80 / 0.85 | 我能预测她 |
| 阿妍 | 冷静型 | 0.95 / 0.25 | 她一直压着我 |
| 沈墨 | 心理型 | 0.90 / 动态 | 我不知道她下一步想干什么 |

## 9. 笔记 = 导演语言

笔记不是辅助，是 AI 的表演语言。真笔记表示「我认真推理」，假笔记表示「我在骗你」。导演态调制 `noteCadence`：

| 状态 | 笔记策略 |
|---|---|
| Opening | 大量真笔记，建立可信度 |
| Crisis | 增加假笔记，制造心理压力 |
| Climax | 突然停止笔记，制造「它准备好了吗」 |

此模块依赖笔记系统地基修复（见 §12）。

## 11. Drama Score 指标

不以 AI 胜率为唯一判据，补充戏剧质量指标：

- **Threat Readability**：玩家能否发现 AI 意图
- **Comeback Window**：每局是否存在反击窗口（`escape_window_count`）
- **Climax Density**：后期高潮比例
- **Emotional Swing**：领先变化（玩家领先 → AI 施压 → 玩家反超）

AI vs AI 只能测结构代理（窗口存在性、领先摆动），测不出「玩家觉得爽」，需真人试玩采样补一块。

## 12. 依赖地基（先修再建）

笔记与观察器模块依赖以下修复，否则建在失效地上：

| 依赖 | 问题 | 对应 CM4-A2 |
|---|---|---|
| 笔记频率 | 脚本驱动 `_moveCount` 冻结 → 整局最多 1 条笔记 | I2 |
| 笔记可见 | 单机 `_applyAiMove` 静默丢弃笔记步骤 | I3 |
| 双向笔记 | AI 笔记覆盖玩家手记（`candidates` 被整体替换） | C4 |
| 观察器生效 | 单机/tpl 不注入 `setGameState`/`updateObserver` | I1 |

## 12. 实施顺序与依赖

```
修地基（CM4-A2 I1/I2/I3 + 笔记 C4）  纯修复，无戏剧风险
        |
        v
Director Shadow Mode（探针，不改行为） 记录 Director 建议 vs Solver 实际，校准双级 ε
        |
        v
建导演层（Phase Detector + Strategy Pool）  输出策略意图，注入 Solver
        |
        v
接笔记导演语言（探索/承诺/误导三态）   依赖地基 + 意图化目标
        |
        v
埋戏剧指标（含 Authenticity）          在 duel harness 埋 per-step 焦点采样
        |
        v
真人试玩采样                          校准情绪指标
```

Director Shadow Mode 是实施第一步：不碰 AI 行为，每步记录「Director 会建议哪条策略 vs Solver 实际走什么 vs 差异」，跑 1000 局 AI vs AI，回答三个问题——双级 ε 该取多少、导演层发现多少有价值选择、会不会出现「导演想干预但全部超 ε」的真空。

## 14. 硬性禁令

- 不主动制造「会让 AI 输」的动作（Climax-A 禁止人工留机会）。
- 不做戏剧性随机错误（`dramaModifier` 不得放大「随机填错明显数字」这类正确性退化）。
- 不改 TPL 规则判定，只改 AI 决策层。
- 不另起一套与 `hubWeight`/`stealPriority`/`selectionStrategy` 平行的权重轴；Aggression 只调制现有旋钮。