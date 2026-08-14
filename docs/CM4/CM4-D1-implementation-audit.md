# CM4-D1 · 对抗戏剧导演引擎 实施审计报告

> **Code**：CM4-D1（步骤 1-5）· **状态**：已实现并审计通过
> **日期**：2026-08-11 · **对象**：`core/director.js`、`core/battle-manager.js`、`core/drama-metrics.js`、`scripts/duel-ai-tpl.mjs`
> **基线约束**：只改 AI 决策层，不改 TPL 规则判定（CM4-D1 §14）

---

## 1. 验收标准（自定）与达成状态

| # | 验收标准 | 判定 | 验证方式 |
|---|---|---|---|
| A1 | Director 核心单元测试全绿（Phase/ε Gate/策略锁/人格/Shadow/回退/锁释放） | ✅ 25/25 | `test-director.mjs` |
| A2 | 步骤4 笔记导演语言：phase 三态 noteCadence 解析 + 调制模式下发 + Shadow 不干预 | ✅ 11/11 | `test-note-modulation.mjs` |
| A3 | 步骤5 戏剧指标：DramaTracker 四指标正确计算 + 空轨迹安全 | ✅ 19/19 | `test-note-drama.mjs` |
| A4 | 集成无回归：AI vs AI 多局无崩溃、胜负正常、`dramaAvg` 填充 | ✅ 3 局通过 | `duel-ai-tpl.mjs 109 3 --directorShadow` |
| A5 | 审计修复不引入新错误，全部测试回归通过 | ✅ 55/55 | 三脚本连跑 |

---

## 2. 实施范围（步骤 1-5）

### 步骤 1 · 地基修复（CM4-A2 I1/I2/I3 + C4）
由用户在前期完成，本阶段未改动，作为 Shadow Mode 的依赖地基。

### 步骤 2 · Director Shadow Mode（探针）
`core/director.js` 内建 `enableShadow()` / `_shadowLog` / `summarizeShadow()`；`core/battle-manager.js` 的 `setDirector()` 默认 shadow=true，`_runDirector()` 在 Shadow 下只记录建议不改行为。`duel-ai-tpl.mjs` 注入双方 Director 并输出 `directorShadow` 校准报告（建议 vs 实际差异率、策略分布、phase 分布）。

### 步骤 3 · 建导演层（Phase Detector + Strategy Pool + Personality Bias + ε Gate + 策略锁）
- `detectPhase()`：进度四相位 + hubDiff 精调。
- `STRATEGY_POOL`：7 条数据化意图（probe/pressure/steal/fortify/gamble/trap/finish）。
- `PERSONALITY_STRATEGY_BIAS`：人格 → 策略加权（选枚举，非新增轴）。
- `_passGate()`：策略级 ε 粗过滤 + finish 近硬优先级。
- 策略锁：3-8 步 + 打破条件（selfHubCount 翻转 / 失误尖峰）。

### 步骤 4 · 接笔记导演语言（探索/承诺/误导三态）
- `PHASE_NOTE_CADENCE`：Opening 高真笔记 / Development 中真 / Crisis 增假笔记 / Climax 停止。
- `resolveNoteCadence()`：phase 三态基线 + 策略级覆盖（如 trap 只覆盖 fakeRate）。
- `battle-manager._applyDirectorParams()` 在调制模式下下发 `_tempNoteRate/_tempFakeRate`；`_shouldWriteNote/_isFakeNote` 优先读取；Shadow 模式不下发（null=合用人格默认）。

### 步骤 5 · 埋戏剧指标（Drama Score 结构代理）
新增 `core/drama-metrics.js` 的 `DramaTracker`，在 `duel-ai-tpl.mjs` 每步采样：
- **Threat Readability**：据点格集中度 maxHub/total。
- **Comeback Window**：落后方追平次数（escape_window 结构代理）。
- **Climax Density**：决定性事件（HUB_OCCUPIED/MIGRATED/LINE_READY/THREE_POINT_LINE）在 progress≥0.8 占比。
- **Emotional Swing**：hubDiff 符号翻转次数。

---

## 3. 审计发现的错误与修复

### E1（真 bug）`_eligibleStrategies` 的 `'always'` 触发永不匹配
`probe` 的 `trigger:'always'` 用 `t.includes(phase)` 判断，而 `'always'` 不含任何 phase 子串，导致 **probe 在任何 phase 都不入选**，ε Gate 回退与最小干预机制失效。
修复：`if (t === 'always') return true;` 显式放行。

### E2（真 bug）`_shouldReleaseLock` 用 `'boss'` 标签计数，玩家侧锁恒失效
原逻辑 `hubOwnership.filter(o => o === 'boss').length` 对比 `prevDecision.selfHubCount`。对玩家侧，`selfHubCount` 统计的是 `'player'` 据点，`'boss'` 是对手——两者常量不相等，导致**玩家侧策略锁每步都被误判为翻转而释放**，连贯性失效。
修复：改用 `gameState.selfHubCount` 与 `prevDecision.selfHubCount` 直接对比（侧别无关）。

### E3（真 bug）`_buildDecision` 的 `released` 标志语义反转
原 `released: _active.lockLeft === lockLen - 1`：锁保持路径（lockLeft 已递减）算出 `true`，释放并重选路径算出 `false`，**完全颠倒**。
修复：`released` 由 `decide` 用局部 `released` 变量显式写入，`_buildDecision` 不再推导。

### E4（清理）死代码 `elseHits`
`_eligibleStrategies` 中 `const elseHits = observer.analysis.isBeingTargeted` 从未被引用，已删除。

### E5（潜在）ε 边界浮点精度
`gamble.risk(0.20) - probe.risk(0.05) = 0.15000000000000002 > ε(0.15)`，恰在边界被拒。当前与"gamble 为高风险策略应被 gate"的意图一致，保留为设计语义，不作改动。

---

## 4. 决策关键点

- **Shadow 优先**：Director 默认只记录建议不改行为，双级 ε 需先校准再启用调制，避免戏剧在真实差距（超 ε）上干预。
- **调制只映射现有旋钮**：`_applyDirectorParams` 只改 `_currentStrategy/_tempHubWeight/_tempDefenseWeight/_tempNoteRate/_tempFakeRate`，不引入平行权重轴，符合 §14 禁令。
- **戏剧指标是结构代理**：AI vs AI 只能测窗口存在性、领先摆动、集中度，测不出"玩家觉得爽"，需真人试玩补一块（§11）。

## 5. 产物

- `core/director.js` —— Director 引擎（含 E1-E4 修复）
- `core/drama-metrics.js` —— DramaTracker 戏剧指标
- `core/battle-manager.js` —— 步骤4 笔记基调下发 + 调制集成
- `scripts/duel-ai-tpl.mjs` —— Shadow 校准输出 + 每步戏剧采样
- 测试：`test-director.mjs`（25）、`test-note-drama.mjs`（19）、`test-note-modulation.mjs`（11）