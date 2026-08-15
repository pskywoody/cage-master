# Learner Model Validation Report

> 阶段状态：**LEARNER_MODEL_VALIDATED_PROTOTYPE**
> 方法：离线回放，合成序列建模自真实事件字段名；不接生产，不回放真实玩家数据（当前 LessonPlayer 遥测未落盘）。

## 结果

| Case | 输入序列 | 期望 | 实测 | 通过 |
|---|---|---|---|---|
| 1 | encounter → hint → correct(hint≤L3) → correct(independent) → correct×3 | unknown→exposed→guided→independent→mastered | 完全符合 | ✓ |
| 2 | encounter → hint×2 / error×2 | guided + struggling | guided + struggling | ✓ |
| 3 | 3 次独立成功（14 天前） | 已有期 mastered；长期后 confidence 衰减 | confidence 下降 | ✓ |

## Case 1：技能进阶

真实事件映射后，LearnerModel 能从 `exposed → guided → independent → mastered` 正确过渡：

- 首次 `encounter` → `exposed`
- 提示下正确（hintLevel≥2）→ `guided`
- 无提示独立正确 → `independent`
- 连续独立正确 → `mastered`

## Case 2：挣扎检测

`hint` 与 `error` 高频时：状态稳在 `guided`，趋势判为 `struggling`。这符合"需要帮助且反复出错"的学习信号。

## Case 3：遗忘衰减

`mastery(t)` 随成功时间指数衰减；长期未练后 `skillState` 的 `confidence` 同步下降（乘 `(0.5 + 0.5*mastery)`）。说明模型能表达"曾经会、现在可能生疏"，为后续复测/推荐提供依据。

## 结论

LearnerModel 的输入真实性与推断合理性，在离线合成回放下验证通过。当前不进入生产路径，不改变 LessonPlan / Hint / 推荐 / 难度。

## 仍待后续

- 真实历史事件尚未持久化，离线回放暂以合成序列代替；接 LessonPlayer 前需先有 Event Collector 落盘（Phase 5）。
- `hint_followed` / `hint_ignored` 派生信号缺失，需在同一事件流中结合玩家落子计算。
- 遗忘速率 τ 与状态带阈值需靠 Experiment Platform（方向 7 最小版）校准，当前仅为可解释初值。