# Teaching AI Calibration Report（Phase 3）

> 状态：**TEACHING_AI_CALIBRATION_READY**
> 只读；未接生产 TeachingSystem / LessonPlan / AI personality / 推荐策略；未拟合参数。

## 方法

用现有真实（样本）信号 `samples/learner-events-sample.jsonl`（9 事件、2 session），经 `teaching-ai-evidence-map.md` 映射为 simulator 教学动作，重放比较「模拟预测方向 vs 观察状态」。数值仍为合成规则，不做量级校准。

## 结果概览

- 方向性成功对齐：`directionalSuccessAlignment = 0.6`（5 个非 neutral 事件里 3 个对齐）。
- `masteryUpCount = 5`（9 事件中 5 次预测掌握方向上升，均来自 encounter/hint/guided 引导路径）。

## Confirmed（方向一致）

- `guided_success` → simulator `ease_hint` 预测成功、且 mastery 方向与 taxonomy `guided_success → correct(independent=false) → guided` 一致：**已对齐**。
- `skill_used_correctly` / `skill_mastery` → simulator 预测成功，观察 outcome=success：**已对齐**（独立成功/精通 = 成功）。

## Weak evidence（弱证据 / 需注意）

- `hintLevel 降低 ↔ independent`：样本缺少 hintLevel 变化序列，只能与 taxonomy §3 的 `hint_dependence` 弱对标，**未实测**。
- `fail → surface_mistake` 语义**不一致**：当前 simulator 把 `surface_mistake` 归入 `guided`（预测成功），但真实 `fail` 事件是 `error`。本次对齐中 2 个 `fail` 均被判为「预测成功 vs 观察 error = 未对齐」。**只记录，不在此阶段修改 simulator**。

## Unknown（尚无真实证据）

- `personality → learning_gain`：现有 learner 事件不记录 personality，无证据。
- `engagementSignal`：CM4 现有事件不含 engagement 信号源，无法对证。

## 结论

simulator 的「引导促进掌握」「独立成功/精通=成功」两条方向，与已存在的 LearnerEvent 证据**方向一致**，具备数据基础；而「失误/挫败」「engagement」「personality」三条尚无真实证据或存在语义不一致。**因此当前是「方向性 calibration-ready」，不是「数值校准完成」。**

## 不做什么（本阶段已遵守）

- 不接生产 TeachingSystem；不自动选择 mentor/prober；不改 LessonPlan；不改 AI personality；不改推荐策略；不拟合 simulator 参数。