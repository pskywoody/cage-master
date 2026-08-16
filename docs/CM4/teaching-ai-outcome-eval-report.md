# Teaching AI Outcome Eval 报告（Phase 5）

> SHADOW / SIMULATED_ONLY；未改正式 simulator；不宣称真实学习效果。

## 方法

把 learner outcome 拆成四维（`recovery / hint_dependency / transfer / retention`，见 `teaching-ai-outcome-model.md`），用正式 `stepLearner` 做单步、影子层算四维指标，同一组 30 learner × 3 policy × 10 episodes 重跑。

## 结果

| Policy | mastery_gain | recovery_ep↓ | hint_dep | reveal_ratio | indep_completion | transfer | retention |
|---|---|---|---|---|---|---|---|
| A static | 2.733 | 1.444 | 0.000 | 0.000 | 0.913 | 0.965 | 0.869 |
| B hint_aligned | 1.000 | 1.444 | 0.780 | 0.780 | 0.133 | 0.393 | 0.302 |
| C adaptive | 2.733 | 1.444 | 0.087 | 0.000 | 0.913 | 0.965 | 0.869 |

## 判读（诚实空结果）

- **四维 outcome 能区分 B**：reveal 主导的 B 在 `transfer(0.393)`、`retention(0.302)`、`independent_completion(0.133)` 上都显著低于 A/C，hint_dependency/reveal_ratio 显著更高。这说明「拆到四维」本身有效，比单看 mastery 更信息。
- **C 没有稳定胜出 A**：recovery / transfer / retention / independent_completion 全部与 A **完全相同**（2.733 / 1.444 / 0.965 / 0.869 / 0.913）；唯一差异是 `hint_dependency`（C 0.087 vs A 0），且是 C 略高（更多提示依赖，方向偏负）。

## 关键结论

**在当前 learner outcome model + policy catalog 下，`C learner-adaptive` 不比 `A static` 更优。** 只有 `B hint-aligned` 稳定更差。

这有两种可能（均为研究信号，不是产品结论）：

1. **当前 C 的 policy 实际并未真正「自适应」**：它只是把 A 的 `demo` 换成了 `ease_hint/hint_step`，两类在 simulator 里对低掌握 learner 的 mastery_delta 同为 +1，最终路径一样 → 结果一样。
2. **simulator 的 reward 结构仍无法表达 adaptive 的潜在价值**（少依赖、恢复更快、迁移更好）：这些价值没有被建模成「demo vs hint」的差异化下游后果。

## 结论的一句话

「adaptive teaching 是否值得」目前**无法被当前 outcome model 判定为值得**——所以下一步应该做的是把 `recovery / transfer / less-hint-dependence` 做成**可测量的 outcome 目标**并让 learner model 对「demo vs guided」产生差异化下游效应，而不是把 C 接入生产。

**除非走出上面这两步，「adaptive AI 有用」只是未验证假设，不能作为产品决策依据。**