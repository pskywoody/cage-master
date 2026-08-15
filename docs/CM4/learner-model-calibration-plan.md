# Learner Model Calibration Plan

> 只记录将来需要验证的参数与验证口径，本阶段不调整参数。所有数值仅是"可解释初值"，不声称精确。

## 1. 状态带阈值

- `guided → independent`：需要多少次"无提示独立正确"？当前初值 `independent >= 1` 即进 independent。
  - 待验证：玩家完成率是否在此阈值附近出现稳定跳变。
- `independent → mastered`：当前初值 `independent >= 2 且近期成功率 >= 0.6`。
  - 待验证：是否过早给"mastered"（样本不足），需要用完成可靠性来校准 N。

## 2. 遗忘速率 τ

- 当前初值 `τ = 7 天`（指数衰减）。
  - 待验证：真实玩家长间隔后，某技巧的复测表现是否按 τ 预测下降。

## 3. confidence 与真实完成率的相关性

- 当前 `confidence` 由样本量 + 近期成功率 + mastery 合成。
  - 待验证：`confidence` 高低是否和"下一关该技巧实际完成率"单调相关；不相关就重设权重。

## 4. 校准所需数据

完成 Phase 3 的 Event Collector 落地后，用真实事件做：

- 按 (student, technique) 聚合的成功率时间序列。
- 长间隔用户的复测结果。
- 推荐命中率与完成率的对照。

## 5. 校准方法

不用手工拍脑袋；走最小 Experiment Platform（`experiment-event-schema.md`）做 A/B 或离线对照，用固定指标（完成率、提示依赖度、复测通过率）验证每一组参数。

## 6. 交付状态

参数以"可解释初值"进入 `core/learner-model.js`，并在这里记录待校准项；未校准前不把 LearnerModel 用于任何自动干预。