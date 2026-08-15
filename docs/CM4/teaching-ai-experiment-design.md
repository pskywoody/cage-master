# Teaching AI Experiment Design（Personality Policy A/B）

> 状态：只定 protocol，不运行。本阶段不接真实 LearnerModel。

## 目标

未来验证「AI 对手是否能成为老师」，但**本阶段不运行、不宣称有效**。

## 设计

- 类型：Personality Policy A/B
- 处理组：`mentor / prober / expert` 教学策略
- 对照组：`average`（基础对抗）
- 主指标（Primary）：`learning gain`（学习增益）——需真实 LearnerModel 才可实测，本阶段仅定义口径
- 次指标（Secondary）：`engagement`（参与度）、`correction efficiency`（修正效率）、`recovery time`（从错误恢复的时间）

## Protocol

1. 同 board pool / 同 difficulty / 同 turn budget / 同 director setting（固定变量）。
2. 变量：agent personality → teaching policy。
3. 采样：每 arm 目标 N ≥ 30 名虚拟 learner，按基线 mastery 分层。
4. 记录 TeachingActionEvent 序列（见 `teaching-action-schema.md`）。
5. 分析：learning gain 的组间差异 + 次指标，effect size + 显著性。

## 边界

- 只写协议，不运行实验。
- 不宣称「教学有效」「提升体验」「人格更强」。