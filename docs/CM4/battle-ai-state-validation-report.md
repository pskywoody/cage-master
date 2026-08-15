# Battle AI 状态化验证报告（CM4 Research Sprint）

> 状态：状态化已验证（BATTLE_AI_STATEFUL_VALIDATED）· 单步受控采样，非全对局闭环
> 证据：`data/battle-ai-traces/decisions.jsonl` + `summary.json`

## 1. 方法

不改生产逻辑，用公开内省面采样：对 level-109，6 个人格 × 5 个受控战局状态 = 30 个探针。每个探针：新建 `HeadlessEngine` board + 新 `AIPlayerCore` + `Director`（激活），`setGameState(state)` → `think()` → 记录 `getStrategy()` / `getDirectorDecision()` / step.technique。刻意用「同状态、新鲜 board」隔离历史，检验「状态 → 决策」因果。

状态集：`leading`（领先+2据地）、`losing`（落后+对方2据地）、`neutral`（持平）、`hot-streak`（连对4）、`cold-streak`（连错4）。

## 2. 发现（状态 → 策略/导演意图）

| 状态 | Solver 策略 | Director 意图 | 备注 |
|---|---|---|---|
| leading | `defend`（expert/mentor/prober/average） | `protect_owned_hubs` / `convert_advantage` | 领先→巩固/收束 |
| losing | `attack`（几乎全人格） | `contest_hub` / `test_player_response` | 落后→争夺 |
| neutral | `attack` | `test_player_response` / `contest_hub` | 相持→试探/争夺 |
| hot-streak | `defend`（expert/mentor） 或 `attack` | `protect_owned_hubs` / `test` | 连对→部分转守 |
| cold-streak | `attack` | `contest_hub` / `test`；prober/reckless/average 出现 `note` | 连错→可写笔记 |

**核心结论**：`isLeading / selfHubCount / progress / consecutiveErrors / consecutiveCorrect` 这些注入状态**确实改变**了 AI 的策略与导演意图。领先→防守/巩固，落后→进攻/争夺，是一致可读的方向性变化。

## 3. 反馈闭环（状态化 + 前序结果）

反馈闭环在此实验里体现为「错误/连对压力 → 决策变化」：`cold-streak`（连错4）下 prober/reckless/average 出现写笔记行为，而 `hot-streak`/`leading` 下不写；策略也从领先的 `defend` 转向落后的 `attack`。说明 AI 的下一步决策**依赖注入的战局状态（含前序结果聚合）**，而非每步独立随机。

## 4. 限制

- 这是**单步受控采样**，只证明「状态→决策」因果；未跑「多步动作→结果→再决策」的完整对局闭环。
- 每 cell 仅 1 次采样，分布结论是方向性的，非统计显著性。

## 5. 结论

**BATTLE_AI_STATEFUL_VALIDATED（结构层 + 单步受控采样层）**。AI 已不是「有状态变量的随机机器人」，其策略与导演意图随领先/落后/连对连错可解释地切换。完整多步闭环与统计显著性留待 Phase 12/13 的 E2E + N≥20 采样补齐。