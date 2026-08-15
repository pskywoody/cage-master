# Battle AI 反馈闭环验证报告（CM4 Research Phase 2）

> 状态：**BATTLE_AI_CLOSED_LOOP_VALIDATED**（含策略层门控 caveat）
> 证据：`data/battle-ai-closed-loop-traces/`（phase2 历史对照 + 3 组多回合 trace）

## 方法与口径

只读实验，不改生产逻辑。两套证据：

1. **Same State, Different History**（Phase 2 核心）：同 board、同 progress/hub/isLeading，只注入不同历史（`consecutiveCorrect=2` vs `consecutiveErrors=2`），比较 6 人格的决策签名。
2. **Multi-turn simulation**（Phase 3）：真实推进 board，确定性计算 result（比对 solution），更新 score/streaks/progress/isLeading，记录 `turn → beforeState → decision → action → result → afterState`。

## 逐题回答

**Q1 — Action 是否真正影响 State？** → **YES**
填对/填错/笔记分别确定性地更新 `aiScore/oppScore/consecutiveCorrect/consecutiveErrors/progress`。

**Q2 — State Update 是否影响下一次 Decision？** → **YES（Director intent + action 层），strategy 层有门控**
- Director intent 随历史/比分切换（`contest_hub ↔ test_player_response ↔ protect_owned_hubs ↔ bait_player`）。
- action 层随进度升级技巧（nakedSingle → pointingClaiming/rule45）或注入 guess/misread。
- Solver strategy（attack/defend）在**中性早期回合保持 attack**；其切换需要据点优势/领先/高进度（Phase 1 已证 leading/hot-streak→defend），不是由「连胜/连败历史」单独触发。

**Q3 — 相同 Board、不同历史，是否产生不同 AI 行为？** → **YES（5/6）**
`blind/mentor/prober/average/reckless` 在成功历史 vs 失败历史下决策签名不同（多为 Director intent 或 technique/note 变化）；`expert` 单步样本一致（其策略更稳态）。

**Q4 — 是否存在 Decision → Action → Result 闭环？** → **YES（结构性成立）**
多回合 trace 完整记录了 `decision → action → result → afterState → 下一轮 decision`，且 afterState 反馈回下一次决策（intent/technique 随进度与误差变化）。

## 结论

AI 是**有状态的决策器（A）**，不是一次性选择器（B）。闭环在 Director intent 与 action/technique 层真实成立，历史（连胜/连败）进入决策。

**Caveat（不修，仅记录）**：Solver 四态策略（attack/defend/global/counter）在「中性早期、据点 1:1、低进度」场景下持续保持 `attack`，未观察到策略层随「连续成败历史」切换；其切换由据点优势/领先/高进度门控。这提示「策略状态机对历史反馈的敏感度」低于「导演意图层对历史反馈的敏感度」，属观测事实，不在本阶段修正。