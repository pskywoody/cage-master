# Teaching AI Uncertainty-Aware Policy 报告（Phase 13）

> SHADOW；用真实 LearnerModel 估计 state+confidence，Phase 6 causal 模型取一步效应。未接生产、未改定义。

## 方法

- 真值状态：`struggling / novice_with_error / novice_clean / guided / independent`，各 60 learner。
- 估计：`LearnerModel.skillState()` → boundary 状态 + confidence。
- **Naive**：`boundaryAction(state)`（struggling→partial_hint；novice→question；guided→question；independent→free_attempt）。
- **Uncertainty-aware**：confidence < 0.4 且 state ∈ {struggling, novice} → 先 `question`（观察），否则用 boundaryAction。

## 结果

| 指标 | Naive | Uncertainty-aware |
|---|---|---|
| unnecessary intervention（全体/novice） | 0.20 / **0.50** | **0.00 / 0.00** |
| hint dependency（全体） | 0.000 | -0.060 |
| frustration（全体 / struggling） | 0.000 / 0.000 | 0.020 / 0.050 |
| mastery 一步增益（全体 / struggling） | 0.65 / 0.55 | 0.57 / 0.35 |

真值→估计：`struggling→struggling`、`novice_clean→novice`、`guided→guided`、`independent→independent` 全对；**`novice_with_error→struggling` 全错**（沿用 Phase 12 的混淆）。

## 关键发现

1. **Uncertainty-aware 把「对 novice 的过度介入」降为 0**（naive 0.50 → ua 0.00），并压低 hint dependency（0 → -0.06）。低置信时先观察，避免把「novice 一次犯错」当作「需要脚手架」。
2. **代价**：UA 也把「真 struggling」稍微轻化了（同样低置信 → question 而非 partial_hint），使 frustration 上升（struggling 0 → 0.05）、一步 mastery 下降（0.55 → 0.35）。
3. 根因不在 policy，而在 **state estimation**：`novice_with_error` 与 `struggling` 无法被 LearnerModel 区分（都低置信 + trend=struggling）。所以 UA 无法只对 novice 撤离、对 struggling 保持介入。

## 结论

「AI 知道自己不知道」这一步是**可行且有安全收益的**：uncertainty-aware 能控制不必要的提示依赖与过度介入；但它会把 state 不确定的代价转嫁到真 struggling 的恢复上。

因此，下一阶段最该做的不是再扩 policy，而是 **State granularity refinement**（把 struggling 拆成 `novice_exploration / temporary_error / persistent_struggle`）——让低置信时只对「novice/临时失误」观察、对「持续挣扎」仍介入。这正是 Phase 10/11 发现的 hint-dependency vs recovery tradeoff 在 state 层的精确落点。

## 边界

- SHADOW / 模型条件结论；一步效应近似；不接生产、不改 LearnerModel/simulator。