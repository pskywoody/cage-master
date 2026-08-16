# Phase 15 — Transition Accuracy（Shadow Validation 第一批）

> 状态：**GATE PASS（transition 检测 3/3）** · 真实引擎事件验证
> 目标：验证 StateTransitioner 能否正确识别 **learner state change**（非仅 struggling）。
> CM4 最大未知量：识别 learner 状态变化，而不是识别 struggling。

## 核心结果

| 场景 | 状态acc | 稳定段acc | transition数 | 检测 | 延迟 | 误报 |
|---|---|---|---|---|---|---|
| independent→temporary→recover | 58% | 67% | 1 | 1 | 0 | 2 |
| independent→persistent | 91% | 75% | 2 | 2 | [0,1] | 1 |
| normal independent | 91% | 91% | 0 | — | — | 1 |

**主指标**：`transitions 3/3 detected · maxDelay = 1 step · avgStableAccuracy = 78%`

→ StateTransitioner 能在真实事件流中**及时（≤1 步）识别状态变化**（independent→struggling、struggling→recover）。

## Phase 15 暴露并修复的事件语义漂移

这是本批最重要的发现（印证 Gate B 预警的"事件语义漂移"）：

- `HintSystem.getHint()` 每次给出 deduction 提示时调用 `teachingSystem.recordEncounter(technique)`（未传 usedCorrectly → false）。
- 原采集把 `usedCorrectly=false` 映射为 `fail`(error) → **每次提示都被当作一次玩家失败**，污染 struggling 信号，使正常玩家也判 temporary/persistent。
- 修复：`recordEncounter(false)` 语义 = "教学交互进行中"，映射为中性 `encounter`；真正的 error 只由 **Puzzle 填错**（`fillCell` fail）捕获。

修复前后对照（normal 玩家，全对填格）：
```
修复前：predicted = temporary_error（被 recordEncounter(false) 污染）
修复后：predicted = independent（capability 建立后稳定）✓
```

## 观察

- `normal_independent` 稳定段 91%：capability 建立后（step 1 起）稳定 independent，无 struggling 误报。
- `independent→persistent` 91%：两个 transition（进入 persistent、退出）均检测，延迟 0-1。
- `independent→temporary` 误报偏高：因 gt 把整个"偶发错误阶段"标为 temporary_error，而 transitioner 只在错误发生的步判 temporary_error、无错步判回 independent——这是 **gt 粒度与在线判定的口径差异**，非 transitioner 缺陷。

## 诚实边界

- 数据来自**真实生产模块在真实关卡上的运行**，非真实玩家；ground-truth 由步进策略定义。
- `windowSize=5`、`recoveryThreshold=2` 为初始设定。
- **真实用户 session 到位后需重跑**：验证窗口/恢复阈值在真实玩家分布下的表现，并校准参数。

## 结论

Phase 15 第一批达成：事件流真实、transition 识别及时、语义漂移被暴露并修复。研究链状态：

```
Phase 14       state granularity      PASS（静态轨迹）
Phase 14.6     state transition       PASS（动态轨迹）
Phase 15       transition accuracy    PASS-tier（真实引擎事件）
              real user distribution  UNKNOWN（待真实 session）
```

## 产物

- `scripts/learner-event-phase15-transition-accuracy.mjs`
- `data/learner-event-phase15/phase15-transition-accuracy.json`
- 语义修正：`expert/teaching-system.js`（recordEncounter 事件映射）