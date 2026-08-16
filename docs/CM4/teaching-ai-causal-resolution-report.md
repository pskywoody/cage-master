# Teaching AI Causal Resolution 报告（Phase 6）

> SHADOW / SIMULATED_ONLY；未改生产、未改正式 simulator。

## 关键实验 1：同一 learner（guided）只换 Teaching Action

| action | masteryΔ | hintΔ | independent | transfer 贡献 |
|---|---|---|---|---|
| reveal | 0.10 | +0.20 | 0.10 | 0.355 |
| demo | 0.45 | +0.05 | 0.15 | 0.427 |
| guided | 0.55 | +0.15 | 0.28 | 0.494 |
| question | 0.70 | -0.05 | 0.46 | 0.589 |
| partial_hint | 0.45 | +0.10 | 0.36 | 0.511 |
| free_attempt | 0.75 | -0.10 | 0.62 | 0.660 |

→ **action space 已具备因果分辨率**：6 个动作在 mastery / hint / transfer 上产生可区分后果。

## 关键实验 2：A / B / C（30 learner × 10 episodes）

| Policy | mastery_gain | recovery_ep↓ | hint_dep | indep_compl | transfer | retention |
|---|---|---|---|---|---|---|
| A static | 2.733 | 3.889 | 0.000 | 0.539 | 0.815 | 0.734 |
| B hint_aligned | 1.633 | 3.889 | 1.000 | 0.145 | 0.493 | 0.388 |
| C adaptive | 2.733 | 3.333 | 0.027 | 0.557 | 0.823 | 0.740 |

## 判读（诚实）

- 在 richer 因果模型下，**A 与 C 不再完全重合**：C 在 `recovery（3.333 vs 3.889，快约 0.56 episode）`、`independent_completion（0.557 vs 0.539）`、`transfer（0.823 vs 0.815）`、`retention（0.740 vs 0.734）` 上小幅更优。
- **mastery 仍持平**（2.733），因为两者都在 10 episode 内触顶 fluent——mastery 是天花板受限指标，分辨不了高段的策略差异。
- **B 稳健更差**：reveal 主导 → hint_dependency 饱和到 1.0，transfer/retention 大幅下滑。
- 结论：Phase 5 的 A≈C 平铺，是旧模型「demo/guided 同为 +1、action space 无表达力」导致的 artifact；换上具备分辨率的动作空间后，C 的「少依赖、恢复快、迁移好」方向开始显现。

## Confidence 与边界

- 全部 SHADOW；C 的优势幅度小、且来自我设计的影子规则，**不是真实学习效果**。
- 仅单次 30×10 样本；错误模式/奖励结构未做鲁棒性扫描。
- 因此下一步是 Phase 7（Policy Identifiability / Counterfactual Replication），验证 C 的优势是否在不同 learner 状态、episode、reward 假设下稳定出现，而不是某一组参数的产物。**不进入 Production Bridge。**