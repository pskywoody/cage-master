# CM4 Teaching AI Research Chain — Final Status

> 日期：2026-08-16 · 状态：**CM4 = CLOSED**
> 定位：研究链收口。后续 learner state 应用 / 教学策略接入属**产品集成任务**，不再属于本 research chain。

---

## 1. 目标

回答一个问题链：

1. **能不能造一个 AI 教师？**（Phase 1–3：taxonomy / simulator / calibration）
2. **AI 与现有教学流程差在哪？**（Phase 4–7：policy / outcome / causal / robustness）
3. **AI 是否知道何时该介入？**（Phase 8–11：shadow runtime / observation / boundary）
4. **AI 能否可靠识别真实用户状态？**（Phase 12–13：state identification / uncertainty-aware）
5. **AI 能否在不知道状态时控制介入风险？**（Phase 14：granularity refinement）

**核心结论**：Adaptive Teaching 的瓶颈不是 policy 选择，而是 **learner state representation 的粒度**。

---

## 2. 已完成能力

| 能力 | 模块 / 产出 | 状态 |
|---|---|---|
| 教学意图分类 | personality → director intent → teaching intent 映射 | ✅ |
| Counterfactual 评估 | `teaching-learner-simulator.js` + counterfactual runner | ✅ |
| 假设登记与证据对齐 | 假设登记表 + 证据映射 + 重放对齐 | ✅ |
| Policy 实验 | A/B/C 三策略、敏感性与鲁棒性（P(C>A)=5/5） | ✅ |
| Outcome / Causal 模型 | 四维 outcome、6 动作因果分辨率 | ✅ |
| Shadow Runtime | `teaching-ai-shadow-adapter.js`（只预测不执行） | ✅ |
| 介入边界 | minimum necessary assistance，随掌握度递减 | ✅ |
| Learner 状态识别 | 真实 `core/learner-model.js` 混淆矩阵 | ✅ |
| Uncertainty-Aware | confidence 控制过度介入 | ✅ |
| 状态粒度细化 | struggling → novice/temporary/persistent，UA-v2 双零 | ✅ |
| 事件采集 | `learner-event-collector.js` + RuntimeEventBridge（4 只读挂接点） | ✅ |
| 状态迁移 | `teaching-ai-state-transitioner.js`（current signal × capability + recovery） | ✅ |

---

## 3. 验证结果

### 理论层（synthetic / shadow）

| 项 | 结果 |
|---|---|
| Policy 动作因果分辨率 | 6 动作具备（Phase 6） |
| Adaptive 方向稳健性 | P(C>A) = 5/5，幅度 <1%（Phase 7） |
| 状态粒度细化 | UA-v2 同时归零 over- / under-intervention（Phase 14） |
| StateTransitioner | 修复 prior mastery bias；2/2 真实轨迹 + 4/4 审计（Phase 14.6） |
| Transition Accuracy | 3/3 状态变化检测、maxDelay=1、稳定段 78%（Phase 15.0） |

### 工程层（真实事件流）

| 项 | 结果 |
|---|---|
| Event Wiring（Gate A） | 四来源 → JSONL → skillState/fineState 消费，冒烟 PASS |
| 边界发现（Gate B） | classifyFine prior mastery bias；persistent 可区分、先成功后困失效 |
| 语义修正 | `recordEncounter(false)`(getHint) ≠ 玩家失败，改中性 encounter（已提交） |

---

## 4. 已知边界

- 全部结果为 **shadow / synthetic / counterfactual**；simulator 参数未经真实数据校准。
- **无真实用户 session**：真实状态分布、struggling 三态真实覆盖率未知。
- `windowSize=5`、`recoveryThreshold=2` 为初始值，**未校准**。
- 未验证：真实玩家收益、personality 影响、长期 retention、engagement（仅 SIMULATED_ONLY）。
- **未实现 production teaching policy**；未接 UA-v2 decision；未自动教学。
- 生产 LearnerModel 定义、LessonPlan、HintSystem、TeachingSystem 行为未改变（仅只读 eventHook 挂接）。

---

## 5. 后续消费者接口（产品集成参考，非研究任务）

产品层（BestBay / LessonPlayer）如需消费研究产出，接入点如下：

### 5.1 实时 learner state（struggling 细分）

```js
import { StateTransitioner } from 'core/teaching-ai-state-transitioner.js';
const ts = new StateTransitioner({ windowSize: 5, recoveryThreshold: 2 }); // 阈值待真实数据校准
// 每来一条 observation（adapter 归一化后）：
ts.push(observation);
const { state, capability } = ts.currentState();
// state ∈ novice_exploration | temporary_error | persistent_struggle | guided | independent
```

### 5.2 原始事件接入（只读叠加）

```js
import { RuntimeEventBridge } from 'core/learner-event-runtime-bridge.js';
const bridge = new RuntimeEventBridge({ sessionId });
bridge.attachAll({ lessonPlayer, hintSystem, teachingSystem, engine }); // 四只读挂接点
// 事件追加到 data/learner-event-*/ JSONL（append-only），不改变来源行为
```

### 5.3 教学介入建议（研究态，未接 production）

- 介入边界：`struggling≈0.25 / novice≈0.10 / guided=0 / independent=0`（minimum necessary assistance）。
- UA-v2 建议：`persistent→teach / temporary→observe / novice_exploration→explore / guided+independent→backoff`。
- shadow 建议通过 `teaching-ai-shadow-adapter.js` 获取，**只推荐不执行**。

> 上述仅作参考。接入 production 前需：真实数据校准阈值 → Transition Accuracy 真实重跑 → 小流量受控实验（Phase 16/17 协议）。

---

## 结论

```
CM4 Teaching AI Research Chain：RESEARCH COMPLETE · MODEL READY
INTEGRATION READY · PRODUCTION POLICY NOT IMPLEMENTED
CM4 = CLOSED
```

研究链贡献：证明 Adaptive Teaching 瓶颈是 **state granularity**（非 policy），提供可消费的 state transition 层与事件采集基础设施，并诚实标注所有 synthetic 边界。后续为主导产品服务的能力接入属产品集成任务。