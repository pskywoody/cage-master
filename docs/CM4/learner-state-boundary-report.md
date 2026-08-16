# Learner State Boundary Refinement Report

> Phase 12.5：novice / struggling 边界的 shadow 精修。只读；不改 LearnerModel；不接 Policy。

## 成功标准

- novice vs struggling 边界 confidence：0.17–0.30 → **>0.7**
- 同时保持 `struggling → guided = 0`、`guided → struggling = 0`

## 结果

**PASS**

- `boundaryConfidence = 0.993`（>0.7 ✅）
- `falseInterventionRisk = 0`
- `falseBackoffRisk = 0`
- `strugglingToGuided = 0`
- `guidedToStruggling = 0`

## 混淆矩阵（true 行 × predicted 列，每类 N=120）

| true \ predicted | novice_exploration | temporary_error | persistent_struggle |
|---|---|---|---|
| novice_exploration | **120** | 0 | 0 |
| temporary_error | 0 | **120** | 0 |
| persistent_struggle | 0 | 0 | **120** |

## 置信分布

- novice_exploration：mean 1.0（min 1.0 / max 1.0）
- temporary_error：mean 1.0（min 1.0 / max 1.0）
- persistent_struggle：mean 0.98（min 0.94 / max 1.0）

## 结论

用三条可观测信号（recovery trajectory / hint elasticity / technique transfer，经 `previousSkillMastery` 表达）能在 shadow 层把 novice/struggling 边界清晰分开，边界置信从低值提升到 >0.7，且不产生误介入/误退后风险；guided/independent 透传不受影响。

## 交付物

- `docs/CM4/learner-state-boundary-schema.md`（边界 schema）
- `core/learner-state-boundary-refiner.js`（shadow refiner）
- `scripts/learner-state-boundary-eval.mjs`（评估运行器）
- `data/learner-state-boundary/`（混淆矩阵 / 置信分布 / summary）
- `docs/CM4/learner-state-boundary-report.md`（本报告）

## 边界

- 不改 LearnerModel、不新增 production state、不接教学决策、不进入生产。