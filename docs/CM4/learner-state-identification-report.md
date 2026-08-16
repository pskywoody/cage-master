# Learner State Identification 报告（Phase 12）

> offline / shadow；用真实 `core/learner-model.js` 做识别实验，不改其定义。

## 方法

合成 ground truth（4 个 intervention-boundary 状态 × 50 learner）→ 发射 observe 事件（encounter/hint/correct/error）→ `LearnerModel.skillState()` → 映射到 boundary 状态 → 混淆矩阵与不确定性。

LearnerModel 状态映射：`trend='struggling'→struggling`；`state ∈ {unknown, exposed}→novice`；`guided→guided`；`independent/mastered→independent`。

## 结果

Confusion Matrix（true 行 × predicted 列，N=50/状态）：

| true \ predicted | struggling | novice | guided | independent |
|---|---|---|---|---|
| struggling | **50** | 0 | 0 | 0 |
| novice | **50** | 0 | 0 | 0 |
| guided | 0 | 0 | **50** | 0 |
| independent | 0 | 0 | 0 | **50** |

- accuracy = **0.75**（唯一错：novice 全部被识别为 struggling）。
- precision/recall：struggling recall 1.0 / precision 0.5；novice recall 0；guided 1/1；independent 1/1。
- mean confidence（不确定性，越低越不确定）：struggling 0.175、guided 0.225、independent 0.225。

## 关键发现

1. **guided / independent 识别 100% 可靠** → 介入边界的「退后」分支是数据可靠的。
2. **novice 不可识别（recall 0）**：LearnerModel 没有独立的「novice」状态；`exposed + error` 会让 `trend='struggling'` 触发 → 被归为 struggling。intervention boundary 的 `novice` 桶当前无法作为独立状态被识别。
3. **struggling 是可识别的，但 precision=0.5**：一半被标 struggling 的其实是我的「novice（犯错）」——即 struggling 与 novice 混淆，不是 struggling 与 guided 混淆。
4. **你最担心的 `struggling ↔ guided` 混淆 = 0**：`struggling` 从未被误判为 `guided`。因此「struggling → AI 退后 → frustration 螺旋」这一最高风险，**不会**由状态混淆产生。
5. **整体置信低（0.17–0.225）**：模型基于少量事件打分，证据不足时 confidence 弱，边界决策应据此保守。

## 对 Intervention Boundary 的含义

- 可安全依赖：`guided` / `independent`（退后分支）。
- 需谨慎：`struggling` / `novice` 无法被当前 LearnerModel 分离——但两者在 Phase 11 的边界里**同属「介入」侧**（struggling ~0.25、novice ~0.10），所以这个混淆不会造成「该介入却没介入」的危险；它造成的是「novice 被过度当作 struggling」的轻微过度介入。
- 建议（未执行）：若要精确 `novice` 桶，需给 LearnerModel 增加「exposed-with-error」vs「struggling」的区分，或把边界收敛为 `intervene(struggling+novice) / backoff(guided+independent)` 两档。

## 结论

LearnerModel 能可靠识别**退后所需状态（guided/independent）**，但不足以区分**介入侧内部的 struggling vs novice**（且无独立 novice 状态）。就安全而言这是可接受的（不产生挫败螺旋风险），但在数据上不支持「novice 独立桶」。这是 CM4 进入 Product Validation 前需要补的 state estimation 能力。