# Teaching AI Shadow Observation 报告（Phase 9）

> 状态：**SHADOW_OBSERVATION_READY**
> 只采集、只比较、不执行；未改 LessonPlan/HintSystem/TeachingSystem/LearnerModel。

## 构建内容

- `scripts/teaching-ai-shadow-observation.mjs`：session 事件流 → `projectLearnerState` → `shadowRecommend` → Shadow Event Record（disagreement taxonomy + recovery 探测器 + 离线分析）。
- 产物：`data/teaching-ai-shadow-observation/`（shadow-events.jsonl + analysis.json）。
- 契约：`docs/teaching-ai-shadow-dataset.md`（schema / privacy / sampling / analysis rule）。

## 验收（SHADOW_OBSERVATION_READY）

| 标准 | 结果 |
|---|---|
| shadow events 可持续记录 | ✅ 任意 session 事件流可跑（真实样本 + 20 合成 session 均产出记录） |
| replay 可复现 | ✅ 确定性 runner |
| analysis 可运行 | ✅ 输出 disagreement rate / by-state / by-error / high-conf / recovery |
| production behavior unchanged | ✅ 只读、不执行 |

## 离线分析

**真实样本（9 事件、2 session）**：disagreement_rate = 0.857，by_type：**B=5、D=1、A=1、N=2**；high-confidence disagreement = 4；recovery opportunity = 8；独立状态（independent）0/1 分歧。

**合成样本（107 事件、20 session，SYNTHETIC）**：disagreement_rate = 0.925，by_type：**B=66、D=20、A=7、N=14**；high-confidence = 40；recovery opportunity = 100；independent 0/7 分歧。

## 关键分解（回答「0.857 到底是什么」）

- 分歧**主要来自 Type B**（shadow 推荐更低依赖教学）：真实 5/7、合成 66/93。
- 分歧**集中在 unknown / novice / guided**（尚未掌握阶段），**independent 阶段几乎零分歧**（真实 0/1、合成 0/7）。
- 即：Phase 8 的 0.857 不是「AI 错」，而是「**shadow C 策略比当前脚手架流程更少提示、更苏格拉底**」，且系统性发生在「学习者还没掌握」的阶段；一旦 independent，两边一致。

## 边界（必须遵守）

- 真实样本极小（n=9）；合成样本仅为演示 pipeline。
- recovery opportunity / follow-up 是**描述性**统计，禁止解释为因果。
- 本阶段只证明「shadow observation 系统可用、差异可分解」，不证明任何策略更优。

## 停止

不进入真实教学策略替换，不开启自动执行。等待 PO 决定下一阶段（是否做 Teaching Policy v1 / 是否接入小流量 shadow 观察）。