# CM4-A1 · BattleManager 审计

> **Code**：CM4-A1 · **状态**：✅ 完成（只读审计）
> **审计时间**：2026-08-11
> **对象**：`core/battle-manager.js` — `export class BattleManager`（约 2210–6211 行）
> **性质**：只读研究，未修改任何文件

---

## 1. 结论摘要

架构整体清晰：统一事件出口 `_emit`（try-catch 包裹）、降级路径完善（TechRater 缺失→`_aiMoveLegacy`、`think()` 返回 null→回退、WeightedScore Adapter 缺失→格子计数）、`_endBattle`/`_recordBattleStats` 收尾完整、注释多带 V4.x 版本标记。

存在 **2 处 P1 功能性隐患**（必杀技空结果卡死 AI、`_applyAiMove` 无异常兜底导致 `_aiThinking` 永久卡死）及一批 P2 计分一致性 / 暂停清理 / 宫格判定问题。**无 P0（崩溃/数据损坏）级问题。**

---

## 2. 逐项发现

### A. 正确性

| ID | 级别 | 位置 | 问题 |
|---|---|---|---|
| C1 | **P1** | `_skillQuanTao`(3173-3202)、`_skillTianDao`(3302-3336) | 必杀技先置 `_aiThinking=true`，只有**末位** step 回调才复位。`useQuanTao` 在 `!this._rater` 或无解时返回 `[]` → forEach 零回调 → `_aiThinking` 永 true → `_aiMove` 开头 `if(this._aiThinking) return` → **AI 整局僵死** |
| C2 | **P1** | `_aiMoveWithRater` setTimeout 回调(3539-3553)、`onPlayerFocusCell`(2958-2967) | 回调内 `_applyAiMove(step)` 无 try-catch，内部抛异常（solution 越界/execute 抛错）则 `_aiThinking` 不复位，AI 永久卡死 |
| C3 | P2 | `useQuanTao`(1964) 与 `_applyAiMove`(3646/3680) | 必杀技 step 被 `execute`（内部 `_fillCell`）**双重调用**，同一格推理状态可能错乱 |
| C4 | P2 | `onPlayerFill`(2752) vs `_applyAiMove`(3613-3617/3653-3657) | 抢格计分不对称：玩家抢回 AI 格 `aiScore-=weight`，但 AI 抢玩家格不 `playerScore-=weight`，玩家方占优 |
| C5 | P2 | `onPlayerUndo`(2902-2914) | 撤销只退回 `weight`，不退回暴击 `pts`；可"填→撤→再填"刷 pts；且未重置 `_combo.count`、未 `syncFromBoard` |
| C6 | P2 | `getScoreBreakdown`(4962-5014) | breakdown 按 `_cellCategories` 权重求和，**不含** `_calcFillPoints` 的 pts 暴击分，与实时 `playerScore` 不一致 |
| C7 | P2 | `_isCellNoteImpossible`(4784-4804) | 用 `Math.round(Math.sqrt(size))` 作宫边长，6×6 得 2，查重仅覆盖 2×2，漏检同宫其他格 |
| C9 | P3 | `_pickWrongNum`(3713-3723) | 注释称"跳过同行/列/宫已有固定数"，实际仅 `if(n===correctValue) continue`，注释误导 |
| C10 | P3 | `tryAccuseFakeCell`(5461) | 非幻影格返回 `{success:true,isFake:false}`，语义矛盾（失败却 success） |

### B. 健壮性

| ID | 级别 | 位置 | 问题 |
|---|---|---|---|
| R1 | P2 | `_scheduleAiMove`(4060)、`_aiMoveLegacy`(3959) | 解构 `this.opponent` 未防御；`start()` 仅强校验 board/solution，未强校验 opponent，缺失时抛 TypeError |
| R2 | P2 | `stop()`(2692-2723) | 大量未跟踪 setTimeout 未清理：`_stunPlayer`、`_triggerDeathblow`、`_triggerComboStun`、`_skillGuanJu`、`_skillShiJianHuanLiu`、`_onAiMistake`、`_doFakeMoves`、`_checkComedyAchievements`。多数回调检查 `active/ended` 危害有限，但 `_playerStunned`/`_deathblowAnimating`/`speedMultiplier` 等在 stop 后仍改写状态 |
| R3 | P2 | `setPaused`(4027-4042)、`_aiMoveWithRater`(3539) | 思考中落子 setTimeout 未检查 `_paused` 且未存入 `_aiTimer`，暂停不彻底 |
| R4 | P2 | 构造函数(2275)、`start()`(2455)、`stop()`(2692) | `_paused` 仅构造初始化，教学暂停后 stop→start 新战斗残留 `true`，新战斗 AI 永不行动 |
| R5 | P2 | `_initBossMechanisms`(5070-5091)、`stop()` | 幻影格改写 `cell.fixedNum/fillNum` 并备份 `_originalFixedNum`，但 `stop()` 不恢复；同一 board 二次 start 重复套用假数字，污染关卡数据 |
| R6 | P3 | `start()`(2492) | 用 `clearInterval` 清理 `setTimeout` 句柄（浏览器 no-op），二次 start 旧假动作定时器未取消 |

### C. 一致性

| ID | 级别 | 位置 | 问题 |
|---|---|---|---|
| S1 | P2 | `_checkWarningTriggers`(3417-3439) vs `_aiMoveLegacy`(3980-3986) | 双套预警系统：legacy 硬编码 0.6 忽略 `battleTuning.warningPhase1At/2At`，两路径行为不一致 |
| S2 | P3 | 构造函数(2276-2278)、`start()`(2484-2486) | `_warningTriggered` vs `_warning60/70Triggered` 三标志职责重叠 |
| S3 | P3 | `EVENT_PRIORITY`(2215-2226)、`_queueEvent`(4153-4164) | 优先级常量几乎未被引用（统一 INTERCEPT_LINE 或显式 5），优先级体系名存实亡 |
| S4 | P3 | `onPlayerFill`(2875) | `isCorrect:null/undefined` 时 `!isCorrect` 为真被当作填错，缺防御 |

### D. 可维护性

| ID | 级别 | 位置 | 问题 |
|---|---|---|---|
| M1 | P2 | `onPlayerFill`(2728-2897 ~170行)、`_applyAiMove`(3561-3702 ~140行)、`_initBossMechanisms`(5024-5180 ~156行) | 巨型方法，建议按职责拆分 |
| M2 | P2 | 多处 | 大量裸魔法数字（连击2/3、震慑1500/2000/800/500、专注±3/20/25、忍杀3500/2500/800、胜率0.75/0.6/0.7 等）未成常量体系 |
| M3 | P3 | `_skillQuanTao`/`_skillTianDao`、计分、fixed/fillNum 判定 | 结构几乎一致，可抽公共私有方法 |
| M4 | P3 | 4395/4664/4835 | BattleManager 直接读 `_aiPlayer._rater`/`_noteAttentionMap`/`_personality` 私有字段，跨类耦合脆弱 |

---

## 3. 修复建议（按优先级）

**P1（优先，阻断级）**
1. **C1**：`_skillQuanTao`/`_skillTianDao` 在 `results.length===0` 时同步复位 `_aiThinking=false` 并 `_scheduleAiMove()`；或先判空再置 `_aiThinking`。
2. **C2**：落子回调的 `_applyAiMove` 包 try-catch，`finally { _aiThinking=false }` 并兜底 `_scheduleAiMove`。

**P2（建议）**
3. **C3**：取消 `useQuanTao` 内部 `execute`，统一由 `_applyAiMove` 执行；或 step 加 `executed` 去重。
4. **C4**：AI 抢玩家格对称 `playerScore -= weight`。
5. **C5**：`onPlayerUndo` 退回 `weight+pts`、重置 `_combo.count`、`syncFromBoard`。
6. **C6**：统一计分来源——`getScoreBreakdown` 增加 pts 汇总或由 `playerScore` 反推。
7. **C7**：宫格判定改用 `board.boxH/boxW`（勿用 `Math.sqrt`）。
8. **R3/R4**：`setPaused` 取消/标记思考中落子；`start()` 重置 `_paused`。
9. **R5**：`stop()` 恢复 `_originalFixedNum`/`fillNum`，或禁止同一 board 二次 start。
10. **R2**：引入统一计时器登记表，`stop()` 统一清理；或为无 active 守卫的定时器补 `active/ended` 检查。
11. **S1**：合并预警系统，统一走 `_checkWarningTriggers` 并尊重 `battleTuning`。

**P3（可优化）**
12. **C9/C10/R6/S2/S3/S4/M2/M3/M4**：修注释、规范返回语义、统一 clear、归并标志位、`isCorrect` 类型校验、抽魔法常量与公共方法、加公开 getter。

---

## 4. 交叉引用

- 与 CM4-A2（AIPlayerCore 审计）共享主文件；C3 涉及 `useQuanTao` 的双重 execute，与 A2 的 `_moveCount` 治理可合并处理。
- 修复须遵守 `B3-FINAL` 不可变基线（仅修核心系统健壮性，不改生成链路）。