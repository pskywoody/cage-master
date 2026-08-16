# Teaching AI Policy Experiment 报告（Phase 4）

> 状态：**TEACHING_AI_POLICY_EXPERIMENT_READY**（非 TEACHING_AI_VALIDATED）
> 离线合成数据；simulator 由未校准假设驱动；confidence = LOW。

## Experiment Setup

- learner profiles：30（确定性合成，skill × errorPattern × frustration/engagement）
- policies：`A_static_lesson` / `B_hint_aligned` / `C_learner_adaptive`
- episodes：10 per (learner × policy) → **900 trajectories**
- 指标：Primary `skill_gain = mastery_after - mastery_before`；Secondary `hint_dependency = hint_count/solved`、`recovery`（fail→success 步）、`engagement proxy`（SIMULATED_ONLY）

## Counterfactual 结果（模拟均值）

| Policy | mean skill_gain | mean hint_dependency | engagementΔ (SIM_ONLY) |
|---|---|---|---|
| A static | 2.733 | 0.000 | +0.357 |
| B hint_aligned | 1.000 | 0.780 | -0.023 |
| C learner_adaptive | 2.733 | 0.087 | +0.357 |

按初始 skill 分层：

| Policy | low（struggling/novice，n=18） | high（guided/independent，n=12） |
|---|---|---|
| A | gain 3.444 / hint 0.000 | gain 1.667 / hint 0.000 |
| B | gain 1.444 / hint 0.856 | gain 0.333 / hint 0.667 |
| C | gain 3.444 / hint 0.144 | gain 1.667 / hint 0.000 |

## Difference Observed（只报告差异，不宣布赢家）

- **A vs C**：在当前 simulator 规则下 **mastery gain 完全相同**（demo 与 guided 对 low learner 的 mastery_delta 同为 +1）；差异仅在 `hint_dependency`（C 对 struggling/guess/weak 用 ease_hint → 0.087 vs A=0）。
- **B（reveal 倾向）**：mastery gain 明显更低（1.0），hint_dependency 显著更高（0.78），engagement 接近持平/微降 —— 因为 `reveal` 提高本步成功率但不促进掌握。
- 结论方向：在模拟环境中，**teaching policy 能在不同 learner state 上产生可预测的上/下游差异（mastery vs hint dependence）**。

## Confidence

- LOW：结果完全由 `teaching-learner-simulator.js` 的未校准假设产生。

## 未验证

- 真实玩家收益；personality 影响；长期 retention；engagement（仅 SIMULATED_ONLY）。

> recovery_episode 已逐 learner×policy 记录在 `outcomes.json`，未做 headline 汇总。