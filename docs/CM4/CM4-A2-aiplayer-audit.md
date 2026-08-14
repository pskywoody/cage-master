# CM4-A2 · AIPlayerCore / AIBot 审计

> **Code**：CM4-A2 · **状态**：✅ 完成（只读审计）
> **审计时间**：2026-08-11
> **对象**：`core/battle-manager.js` — `AIPlayerCore`（约 821–2205 行）、`AI_PERSONALITIES` 六人格（403–661 行）、`OpponentObserver`（682–813 行）
> **性质**：只读研究，未修改任何文件

---

## 1. 结论摘要

决策链主流程正确（笔记→盲盒→找解→逐级回退→hotspot→心理战→失误→看错行），`_rater` 空降级、board 越界、`_selectStep` 空输入防护到位；观察器 `_applyObserverAnalysis` 六临时变量全部被下游消费，无"算而不消费"；`stealPriority`/`stealErrorRatePenalty` 均被实际消费。

**核心风险集中在接口契约一致性**：单机 `BattleManager` 从不注入 `setGameState`/`updateObserver`（六人格三点连线与动态难度失效）；脚本驱动从不调用 `execute`（笔记系统被节流锁死）；单机 `_applyAiMove` 静默丢弃笔记步骤。**同套人格系统在三套运行环境下表现迥异。无 P0 级问题。**

---

## 2. 逐项发现

### 决策链正确性

| ID | 级别 | 位置 | 问题 |
|---|---|---|---|
| D1 | P2 | `think()` 1669/1645/1659 | hotspot/笔记高关注格覆盖 `chosen` 后，`targetLevel`/`thinkTime` 未随 `chosen.technique` 更新，思考时间与实际技巧等级不一致 |
| D2 | P3 | — | `_selectStep` 空输入返回 null、`think()` 提前 return，防御足够 |

### 六人格差异化

| ID | 级别 | 位置 | 问题 |
|---|---|---|---|
| P1 | P2 | `_getPersonalityBias`(2125-2136) | `switch` 仅区分 `steady/surround/reckless`，六人 `blind/expert/mentor/prober/average` 全落 `default`，差异化层对六人格是**死代码**（实际仅靠 baseErrorRate/discoveryRate/thinkTime 等间接体现） |
| P2 | P1 | 见 §3.1 | `hubWeight`/`castlePreference`/`hubStrategy`/`leadErrorMult`/`behindErrorMult`/`burst*` 全部经 `_gameState` 生效，单机主路径不注入 → 全部失效 |
| P3 | ✓ | — | `stealPriority`/`stealErrorRatePenalty` 均被实际消费，无失效 |

### 接口契约一致性（核心）

| ID | 级别 | 位置 | 问题 |
|---|---|---|---|
| I1 | **P1** | `setGameState` 仅定义(939)从不被主类调用 | 单机 Boss 战 `_gameState` 恒为默认：`_calcDynamicErrorRate` 领先/落后/连对/连错调节全失效；`_getHubWeightFactor` 因 `hubBlocks=[]` 失效；`_determineStrategy` 退化为恒"进攻"；prober 恒置 `observeOnly`。**三点连线/动态难度/策略状态机体系在正式玩法近乎失效** |
| I2 | **P1** | `_moveCount` 仅 `execute()`(1849) 自增 | 脚本驱动全程用 `syncFromBoard`(1970-1993) 不自增 → `_moveCount=0` 恒为 0 → `_shouldWriteNote` 节流 `0-0<3` 恒成立 → **每个 AI 整局最多 1 条笔记**（设局人假笔记/沈墨钓鱼名存实亡）；`_calcThinkTime` 进度曲线冻结 |
| I3 | **P1** | `_aiMoveWithRater`(3528) → `_applyAiMove`(3564) | 单机 `think()` 返回 `{type:'note',r,c}`，`_applyAiMove` 解构 `{row,col,num}` → undefined → 静默丢弃。**单机 Boss 战 AI 笔记不可见**（tpl/duel 正确处理了该分支） |
| I4 | ✓ | — | `setOwnershipGrids`/`setHotspotPriority` 在三条路径均正确调用 |

### 观察器

| ID | 级别 | 位置 | 问题 |
|---|---|---|---|
| O1 | P3 | `updateObserver` 仅 duel 调用 | 单机/tpl 路径 `_observer` 恒空，观察器四维度在多数路径空转 |
| O2 | P2 | 1726 | `_tempIgnoreHubPenalty` 为死变量（置 false 后无读取） |
| O3 | P2 | 各人格分支 | 差异化参数多为 `lerp(1.x,1.0)` 小幅浮动，叠加缺数据/缺状态，实际几乎无感知差异 |
| O4 | ✓ | 771-797 | 观察器内部边界/除零防护齐全 |

### 一致性补充

| ID | 级别 | 位置 | 问题 |
|---|---|---|---|
| C2 | P2 | `_getHubWeightFactor`(1391-1460)→`_calcHumanLikeScore`(2114) | 返回乘法性质因子却以**加法**并入评分，语义错位，权重影响力随对局波动 |
| C3 | P2 | `think()` 1655/1662 | 笔记 40% 抢占/30% 回避为全人格统一概率，无差异化门控 |
| C4 | P2 | `_writeNote`(1369-1380) | 将 `cell.candidates` 整体替换为 AI 笔记，**覆盖玩家已写候选数**，缺合并/隔离 |
| C5 | P3 | 1781/1784 | 默认分支冗余赋值 |

---

## 3. 修复建议（按优先级）

**P1（优先，功能性）**
1. **I1**：单机 `BattleManager` AI 走棋循环中周期性调用 `setGameState`（复用 `tpl-battle-controller._syncAiState` 的构建逻辑：hubBlocks/castleHubIdx/hubOwnership/playerDefense/hubCounts/progress/isLeading），并接入 `updateObserver` 反馈对手移动。
2. **I2**：脚本驱动改用/补充 `execute()`，或在 `syncFromBoard` 内同步递增 `_moveCount`，修复笔记节流与思考时间进度冻结。
3. **I3**：`_applyAiMove` 增加 `step.type==='note'||step.isNote` 分支（对齐 tpl 427-435），避免 note step 被 `{row,col}` 解构静默丢弃。

**P2（建议）**
4. **P1**：为六人格补 `_getPersonalityBias` 分支，或收敛到 `_calcHumanLikeScore` 权重系数。
5. **D1**：覆盖 `chosen` 后同步刷新 `targetLevel`（取 `chosen.techLevel`）与 `thinkTime`。
6. **C4**：`_writeNote` 改合并策略或加 `cell._aiNote` 渲染层隔离，避免覆盖玩家候选。
7. **O2/C5**：删除死代码 `_tempIgnoreHubPenalty` 与默认分支冗余赋值。
8. **C3**：笔记心理战抢占/回避加人格门控（surround 高误导、expert 高抢占）。
9. **C2**：`_getHubWeightFactor` 返回因子改对评分做乘法或重命名收敛量级。

---

## 4. 交叉引用

- 与 CM4-A1 共享 `battle-manager.js`；I1/I2/I3 修复涉及 BattleManager 走棋循环改造，与 A1 的 C3（useQuanTao 双重 execute）/ R2（计时器治理）可协同。
- `tpl-battle-controller.js` 与 `duel-ai-tpl.mjs` 是正确消费路径的参考范本。
- 修复须遵守 `B3-FINAL` 不可变基线（不改生成链路）。