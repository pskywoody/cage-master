# Experiment Platform Phase 2 Report

> 阶段状态：**EXPERIMENT_PLATFORM_PHASE2_READY**
> 目标：补齐实验操作系统，而不是做一个孤立实验。

## 完成项

1. **实验注册层** `core/experiment-registry.js`：register/get/list，元数据可归档。
2. **随机分流层** `core/experiment-assigner.js`：FNV-1a 确定性分流，同一 subject 恒落同一 variant；`assignmentBalance` 输出分流平衡。
3. **实验分析层** `core/experiment-analyzer.js`：exposure/behavior/outcome 指标 + completion/time/steps 的 95% CI + sample size + missing event rate + variant balance；**不做显著性自动判决**（`significance_judged:false`）。
4. **产物归档层** `core/experiment-artifacts.js`：一次实验写出 `experiment.json / events.jsonl / analysis.json / report.md / manifest.json`，可复制、可重放。
5. **虚拟 E2E Demo** `scripts/experiment-e2e-demo.js`：REGISTER → ASSIGN → EVENT GENERATE → ANALYZE → REPORT 完整跑通。

## 新增文件

- `core/experiment-registry.js`
- `core/experiment-assigner.js`
- `core/experiment-analyzer.js`
- `core/experiment-artifacts.js`
- `scripts/experiment-e2e-demo.js`
- `experiment-artifacts/hint_policy_v2/`（demo 产物，示例归档）

## Artifact 示例

`experiment-artifacts/hint_policy_v2/` 包含完整 5 件套：

- `experiment.json`（实验元数据 + variants）
- `events.jsonl`（合成事件流）
- `analysis.json`（指标 + CI + 质量）
- `report.md`（可读报告）
- `manifest.json`（归档清单）

## Demo 结果

- 12 个 subject，variant 比重 A:B = 6:6（平衡）。
- Deltas（B-A）：`completion_rate_delta +0.333`、`avg_time_ms_delta -56833`、`avg_steps_delta -4.58`、`hint_per_session_delta -1.83`、`mastery_delta 0`。
- `missing_event_rate 0`。

说明：本次合成样本 mastery_delta=0 是因为两组的成功次数都已达到 mastery 归一化的 3 次饱和（`min(1, decayed/3)`），不代表 mastery 通路无效——LearnerModel 的 mastery/confidence 衰减已在 `validate-learner-model.js` 单独覆盖。后续做真实实验时应关注"未饱和前"的学习增益。

## 当前能力边界

- 全部离线、只读、synthetic，不接真实用户。
- CI 用 Wilson（比例）/ normal（连续）近似；不做显著性自动判决。
- 分流是确定性哈希，非在线服务。
- 仍缺：真实事件接入层、在线分流、实验停止规则、多臂自适应。

## 下一阶段建议

- A：把 Event Collector（`learner-event-adapter`）与 Experiment 事件流打通，形成"真实事件 → 实验分析"闭环（Phase 3 的 Runtime Bridge，但不事先接生产）。
- B：Learner Model Calibration（用真实事件校准 τ/阈值）。
- C：Auto Demo Experiment（用本实验操作系统验证 lessonPlan 自动化）。