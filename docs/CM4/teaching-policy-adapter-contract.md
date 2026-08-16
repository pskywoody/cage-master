# Teaching Policy Adapter — Contract（P1）

> CM4 PRODUCT VALIDATION PHASE · 第一步（P1）
> 交付物：`core/teaching-policy-adapter.js`（本文件）、`docs/CM4/teaching-policy-adapter-contract.md`（本文件）、`scripts/teaching-policy-adapter-replay.mjs`
> 研究锚点：Phase 12.5 refiner（`core/learner-state-boundary-refiner.js`） + Phase 14 UA-v2（`docs/CM4/teaching-policy-ua-v2-schema.md`），git anchor `f763ff8`

## 0. 定位与边界

P1 是「产品验证阶段」的第一环：**把已冻结的研究层资产，包装成运行时可消费的提案（proposal）**，为后续 P2（Runtime Observation）/ P3（Shadow Candidate）/ P4（小流量实验）提供可直接接入的数据结构。

它被严格定义为 **影子（shadow）组件**：

- 只**产出** `TeachingDecisionProposal`，绝不**执行**任何教学动作。
- 不接 `HintSystem` / `LessonPlayer` / `TeachingSystem` 的运行时；不调用其任何方法。
- 不改 `LearnerModel` / `HintSystem` / `TeachingSystem` / Experiment Platform 的源码或状态。
- 不自动触发教学、不修改 mastery 定义。
- `shadowOnly` 字段**硬编码为 `true`**：提案进入 CM4 数据流 ≠ 教学被执行。

### 与 `teaching-policy-layer.js`（Phase 16）的关系

`core/teaching-policy-layer.js` 是合并上下文中另一 agent 的 WIP（未冻结、未纳入本 P1 提交），它消费 `StateTransitioner` 并输出 `hint_mode` 策略。二者**不互相依赖**：

| 维度 | P1 `teaching-policy-adapter.js`（本文件） | `teaching-policy-layer.js`（Phase 16 WIP） |
|---|---|---|
| 输入 | learner 事件流（原始遥测） | `StateTransitioner.currentState()` 对象 |
| 输出 | `TeachingDecisionProposal`（提案，含 `shadowOnly`） | `decision`（含 `hint_mode` / `intervention` / `serve`） |
| 动作词汇 | UA-v2：`observe`/`question`/`partial_hint`/`teach`/`backoff`/`free_attempt` | `hint_mode`：`none`/`minimal`/`targeted`/`progressive`/`stepwise` |
| 状态来源 | `refineBoundary`（Phase 12.5）+ `LearnerModel` | `StateTransitioner`（Phase 15+） |
| 冻结状态 | **本 P1 冻结** | 未冻结（其他 agent WIP） |

**词汇对账**（供后续 P2/P3 接入时对齐，不影响本 adapter 行为，见 `toPolicyLayerHintMode()`）：

| UA-v2 `suggestedAction` | policy-layer `hint_mode` / `intervention` | 是否介入 |
|---|---|---|
| `observe` | `minimal` / `observe` | 否 |
| `question` | `targeted` / `observe`（轻） | 否 |
| `partial_hint` | `stepwise` / `strong`（或 `progressive`） | 是 |
| `teach` | `stepwise` / `strong` | 是 |
| `backoff` | `none` / `backoff` | 否 |
| `free_attempt` | `none` / `backoff` | 否 |

两层的**介入 / 非介入判定完全一致**：UA-v2 的 `persistent_struggle→partial_hint` 与 policy-layer 的 `persistent_struggle→strong/stepwise` 同为「介入、不错误撤退」；`guided`/`independent→backoff` 与 `→none/backoff` 同为「退后」。这正是 Phase 14 研究的收敛结论。

## 1. 输入

```json
{
  "sessionId": "p1-session-novice_exploration",
  "events": [
    { "technique": "lone_star", "type": "encounter", "ts": 0 },
    { "technique": "lone_star", "type": "error", "ts": 1 },
    { "technique": "lone_star", "type": "correct", "ts": 2, "independent": false },
    { "technique": "lone_star", "type": "correct", "ts": 3, "independent": false }
  ],
  "technique": "lone_star"   // 可选；缺省取事件流最后一条的 technique
}
```

| 字段 | 含义 |
|---|---|
| `sessionId` | 会话标识（必需） |
| `events` | 归一化 learner 遥测事件流（按时间顺序） |
| `technique` | 关注技巧（可选；缺省取 `events` 末条的 `technique`） |

事件类型（`type`）：`encounter` / `correct` / `hint` / `error`。`correct` 可带 `independent`（true=独立做对，false=经脚手架做对）。与 `core/learner-model.js` 的 `observe()` 消费格式一致。

## 2. 处理管线（propose 内部）

```
events
  └─ new LearnerModel() + observe(events)        // 本地影子实例，不碰生产 singleton
       └─ skillState(technique)  → { state, confidence, trend }   // 粗状态
  └─ deriveEvidence(events, technique)           // failures / hints / recoveryAttempts / previousSkillMastery
  └─ coarseForRefiner(model, technique, events)  // LearnerModel 粗词汇 → refiner 期望粗词汇
       │   guided + failures>=2  → 'struggling'   // 防 persistent_struggle 被误透传成 guided
       │   guided + failures<2   → 'guided'        // 真·在推进，透传
       │   independent/mastered  → 'independent'   // 透传
       │   unknown/exposed       → 'novice'        // 进入精修
  └─ refineBoundary({ inferredState, confidence, evidence })   // Phase 12.5 refiner
       └─ { shadowState, confidence, alternatives }
  └─ applyUAv2(shadowState, confidence)          // Phase 14 UA-v2 策略
       └─ { action, reason, risk }
  └─ 组装 TeachingDecisionProposal（shadowOnly:true）
```

**为何 `coarseForRefiner` 要把「hint 多且失败多」的 guided 翻成 struggling？**
LearnerModel 的 `guided` 仅表示「独立度=0 且 hint 占比>0.2」，不区分「真在脚手架推进」还是「一直错一直要 hint」。`teaching-ai-uncertainty-aware-report.md`（Phase 13 根因）指出：把「持续挣扎却一直要 hint」误判为 `guided` 会触发 `backoff`，即 **false_backoff**（错误撤退）。Phase 14 用 refiner 证据（`failures>=2` + 无 recovery）把这类翻回 `struggling` → 精修成 `persistent_struggle` → UA-v2 `partial_hint`（介入）。`coarseForRefiner` 在 adapter 内复刻了这一关键映射，保证研究收敛结论在运行时提案中不被破坏。

## 3. 输出（TeachingDecisionProposal）

```json
{
  "sessionId": "p1-session-persistent_struggle",
  "learnerState": "persistent_struggle",
  "confidence": 0.94,
  "suggestedAction": "partial_hint",
  "reason": "persistent_struggle(conf=0.94) via UA-v2 → partial_hint; evidence(f=2,h=1,r=0,prev=true); coarse=guided",
  "risk": { "false_backoff": false, "dependency_risk": "low" },
  "policyVersion": "UA-v2@2026-08-16",
  "shadowOnly": true,
  "technique": "lone_star",
  "alternatives": [],
  "coarseState": "guided",
  "evidence": { "failures": 2, "hints": 1, "recoveryAttempts": 0, "previousSkillMastery": true }
}
```

| 字段 | 必含 | 含义 |
|---|---|---|
| `sessionId` | ✅ | 会话标识 |
| `learnerState` | ✅ | 精修后的细粒度 shadow 状态（BOUNDARY_STATES） |
| `confidence` | ✅ | 精修置信（0..1） |
| `suggestedAction` | ✅ | UA-v2 动作（见 §4） |
| `reason` | ✅ | 可解释决策依据（状态+置信档+证据+粗状态） |
| `risk` | ✅ | `{ false_backoff:bool, dependency_risk:'low'|'med'|'high' }` |
| `policyVersion` | ✅ | 固定 `UA-v2@2026-08-16` |
| `shadowOnly` | ✅ | **硬编码 `true`** |
| `technique` | 扩展 | 关注技巧（可解释性） |
| `alternatives` | 扩展 | refiner 次可能状态（可解释性） |
| `coarseState` | 扩展 | LearnerModel 粗状态（可解释性） |
| `evidence` | 扩展 | 推导证据（可解释性） |

## 4. UA-v2 策略映射（suggestedAction）

| learnerState | confidence | suggestedAction | 介入？ |
|---|---|---|---|
| `novice_exploration` | ≥0.4 | `observe` | 否 |
| `temporary_error` | ≥0.4 | `question` | 否 |
| `persistent_struggle` | ≥0.4 | `partial_hint` | 是 |
| `guided` | ≥0.4 | `backoff` | 否 |
| `independent` | ≥0.4 | `backoff` | 否 |
| 任意 | <0.4 | `question`（安全兜底：只观察） | 否 |

动作空间语义（与 Phase 14 schema §4 一致）：`observe`=仅观察/`question`=提问轻推/`partial_hint`=部分提示脚手架/`teach`=完整讲解/`backoff`=退后/`free_attempt`=自由尝试。

## 5. 风险字段口径

- `risk.false_backoff`：当且仅当 `learnerState==='persistent_struggle'` 且 `suggestedAction` 非介入类时为 `true`。UA-v2 把 `persistent_struggle` 映射为 `partial_hint`（介入），故**恒为 `false`**——这正是 Phase 14 消除 false_backoff 根因的运行时体现。
- `risk.dependency_risk`：`teach`→`high`；`partial_hint`→`low`（仅部分脚手架，与 schema §2 示例一致）；其余→`low`。UA-v2 不产生 `teach`，故实际恒为 `low`。

## 6. 验收（TEACHING_POLICY_ADAPTER_READY）

由 `scripts/teaching-policy-adapter-replay.mjs` 跑 5 类合成场景（每类对应一个 BOUNDARY_STATE），断言：

```
∀ truth ∈ BOUNDARY_STATES:
    proposal.learnerState === truth
    proposal.suggestedAction === EXPECTED[truth]   // §4 映射
    proposal.shadowOnly === true
```

全部满足 ⇒ `TEACHING_POLICY_ADAPTER_READY = true`。

**重要区分**：`TEACHING_POLICY_ADAPTER_READY` ≠ `TEACHING_AI_ENABLED`。
- 前者 = 「研究层→运行时提案的影子适配器已就绪、可重放验证」。
- 后者 = 「教学 AI 已接入生产、可真实执行教学」——本阶段**不触发**，须待 P2/P3/P4 通过且显式开启。

## 7. 明确未证明（保留）

- ❌ not real learner evidence：replay 为合成事件，非真实学员遥测。
- ❌ not production validation：未接入生产、未执行教学。
- ❌ not causal learning gain：动作效果为 Phase 14 模型化 proxy，非因果增益。
- ❌ not coupled to teaching-policy-layer.js：后者为独立 WIP，本 adapter 不依赖、不保证与其同步。
