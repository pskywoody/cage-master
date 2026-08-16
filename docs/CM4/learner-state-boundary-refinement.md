# Learner State Boundary Refinement

> Phase 12.5：只解决 novice vs struggling 边界，不重做 LearnerModel，不改 mastery 定义，不接生产。
> 目标：把 novice/struggling 分界 confidence 从 0.17–0.30 提升到 >0.7，同时保住 guided/independent 的可靠识别与 struggling↔guided=0 的安全性质。

## 1. 问题

Phase 12 显示：`novice` 没有独立的可观测状态，`exposed + error` 会被 LearnerModel 判为 `struggling`（novice recall=0）。这会让"新人"被过度当作"挣扎"，触发过早介入，可能培养依赖、压缩探索。这是效率问题，不是安全问题。

## 2. 原则

- 只 shadow、只读；不改 `core/learner-model.js` 的推断定义。
- 不追求全状态 accuracy，只追求 **novice/struggling boundary confidence**。
- 新增的区分信号只来自已有可观测事实（fail/hint/mistake/time/mastery 及其派生）。

## 3. 三个区分信号

### 3.1 Recovery Trajectory（失败后的恢复轨迹）

- **novice**：失败 → 继续尝试 → 成功（错误后仍能爬回来）。
- **struggling**：失败 → 重复同类错误 → 依赖提示。

测量：某 session 内 `fail` 事件之后的下一个 outcome。若 `fail → correct(不 via hint)` → novice 证据；若 `fail → fail/hint` → struggling 证据。

### 3.2 Hint Elasticity（提示弹性）

- **novice**：给一次 hint 后，后续 hint 请求减少（一点就通）。
- **struggling**：给一次 hint 后，hint 请求仍上升（提示也不解决问题）。

测量：以第一个 `hint_requested` 为界，比较前后的 hint 密度。前高后低 → novice；前低后高/持平 → struggling。

### 3.3 Technique Transfer（技巧迁移）

- **novice**：旧技能基础弱（`skill_encounter` 少、`skill_used_correctly` 少）。
- **struggling**：学过但无法迁移（有 `skill_used_correctly` 历史，却在本目标技巧上反复 `fail`）。

测量：该 learner 在其他技巧上的 `correct`/`mastery` 与目标技巧 `fail`/`hint` 的对比。有历史能力但当前卡壳 → struggling。

## 4. 边界置信函数（Shadow Boundary Refiner）

不修改 LearnerModel，在其输出之上叠加一个只由三个信号驱动的置信函数：

```
boundary_confidence = f(recovery, hintElasticity, transferEvidence)
```

输出 `novice_confidence` / `struggling_confidence`（互补，二者之和 ≈ 1，允许低证据区间 = 观察）。

判定规则（初版、可解释）：

- recovery=success-after-fail 且 hintElasticity=down → `novice` 置信高。
- recovery=repeat-error 或 hintElasticity=up → `struggling` 置信高。
- transferEvidence 高且当前 fail 多 → 加强 `struggling`。
- 三个信号冲突/样本不足 → 保守输出低置信，Policy 应"少动作/继续观察"。

## 5. Shadow-only 评估

- 用合成 shadow 序列生成 `novice` 与 `struggling` 的成对轨迹（含多步以暴露 recovery/elasticity 差异）。
- 指标：novice/struggling 的 boundary AUC + 分界置信均值（目标 >0.7）+ `struggling↔guided` 混淆保持 =0。
- 不碰 LearnerModel；只评估这个 shadow refiner 是否把边界置信拉高。

## 6. 产出与边界

- 产出：`docs/CM4/learner-state-boundary-refinement.md`（本文件）。
- 后续（若可）：`scripts/learner-state-boundary-refiner.mjs` 作为 shadow-only 参考实现。
- 不做：不改 LearnerModel、不接生产、不进入 P2 Policy。

## 7. 结论

current bottleneck 不是 Policy，而是 state estimation 的 novice/struggling 边界置信。Phase 12.5 用三个可观测信号（recovery / hint elasticity / technique transfer）在 LearnerModel 之上做影子精修，把该边界的置信从低值提升到可驱动策略的 >0.7，再谈 P2。