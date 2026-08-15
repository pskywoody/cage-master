# Teaching AI Counterfactual Evaluation 报告（Phase 2）

> 状态：**TEACHING_AI_COUNTERFACTUAL_VALIDATED**
> 仅离线合成数据，不接真实 LearnerModel / 真实用户。

## 方法

- `core/teaching-learner-simulator.js`：Learner Response Model（研究模拟器，非生产 LearnerModel）。规则可解释：demo 对 novice 提升成功率、guided 对 struggling 促恢复、challenge 对低掌握者升高挫败、连续失败累积挫败。
- `scripts/teaching-ai-counterfactual-eval.mjs`：同一 learner 分别跑 mentor / expert / prober 三种策略，各 4 步，记录 before/after 与指标。

## 结果（4 learner × 3 policy）

| learner(初始) | mentor | expert | prober |
|---|---|---|---|
| L001 struggling | gain 3, frust -0.19, 恢复 | gain 2, frust -0.15 | **gain 0, frust +0.50, 未恢复** |
| L002 novice | gain 2, frust -0.22 | gain 1, frust -0.25 | **gain 0, frust +0.70** |
| L003 guided | gain 1 | gain 0 | gain 2, frust +0.10 |
| L004 independent | gain 0 | gain 0 | gain 1（edge_case → fluent） |

## 已验证（在模拟环境内）

- **同一 learner 状态，换教学策略，产生不同学习结果**（counterfactual 可辨识性成立）。
- mentor（guided）对 struggling/novice learner 提升恢复并降低挫败。
- prober（challenge）对 struggling/novice 是挫败螺旋（gain 0、frustration 上升）；对 guided/independent 是适度挑战（L003 gain 2、L004 gain 1）。
- expert（demo）稳定降挫败、中等增益。

## 未验证（必须写明）

- 不代表真实玩家学习效果。
- 不代表线上收益。
- simulator 参数未经真实数据校准（纯可解释规则）。
- 未接真实 LearnerModel / HintSystem / LessonPlan / 用户数据。

## 为什么这一步有意义

至此 CM4 补上了「Agent Action → Learner Response Model → Learning Outcome Hypothesis」这一缺环，具备离线研究「哪种 AI 教学策略让 learner 学得更快」的能力下限；后续接入真实 LearnerModel 时才可做线上验证。