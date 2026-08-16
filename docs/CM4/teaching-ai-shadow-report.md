# Teaching AI Shadow Runtime 报告（Phase 8）

> 最终状态：**TEACHING_AI_SHADOW_READY**
> 只预测、不执行；不改 LessonPlan / HintSystem / TeachingSystem；不影响用户行为。

## 构建内容

- `core/teaching-ai-shadow-adapter.js`：`shadowRecommend({learnerState, technique, difficulty, history}) → {recommendedAction, confidence, reason}` + `projectLearnerState(events)`（复用 learner-event-taxonomy 投影）。
- `scripts/teaching-ai-shadow-replay.mjs`：把 `samples/learner-events-sample.jsonl` 逐事件投影 → snapshot + shadow decision，并与 lesson 实际动作做 agreement 分析。
- 产物：`data/teaching-ai-shadow/`（shadow-decisions.jsonl + summary.json）。

## 成功标准验证（TEACHING_AI_SHADOW_READY）

| 标准 | 结果 |
|---|---|
| Learner state 可以实时生成 | ✅ `projectLearnerState` 逐事件投影（mastery/hintDependency/frustration 演化） |
| AI decision 可以解释 | ✅ 每个推荐带 `reason` |
| 不影响用户行为 | ✅ 影子只读，不执行 |
| 可进入未来小流量实验 | ✅ adapter 已就绪（挂 shadow 观察即可） |

## Shadow Agreement 分析（9 事件、2 session，极小样本）

- comparable = 7，**disagreement rate = 0.857**（6/7）。
- **high-confidence disagreement = 4**（adapter confidence > 0.8 且与 lesson 不一致）。
- **recovery opportunity = 2**（sess2 两个 `fail`，adapter 均给出支持性推荐）。
- 分布：adapter 在本样本里大量推荐 `question`（苏格拉底式），而当前 lesson 走 `demo → hint → guided → free` 脚手架更重 —— 这是「当前 LessonPlan 比 shadow C 更提示依赖」的方向性信号。

## 诚实边界

- 样本仅 9 事件，disagreement 是方向性信号，**不代表 AI 比 LessonPlan 更懂玩家**。
- adapter 偏好 `question` 源于影子策略设定；`consecutiveFailures` 尚未进推荐（连续失败时仍推荐 question 而非降难度，属影子模型缺口，仅记录）。
- 本阶段证明的是「**影子系统可用**」，不是「C 策略正确」。

## 下一步（未执行）

小流量 shadow 观察：挂 `projectLearnerState + shadowRecommend` 到实验桥（只记录 `{event, learner_snapshot, shadow_decision}`），对比真实会话中的 disagreement/recovery，仍不执行教学动作。