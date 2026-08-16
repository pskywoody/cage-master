# Teaching Policy UA-v2 Schema

> Phase 14：UA-v2 Policy Re-evaluation（shadow / offline）。
> 只读 `core/learner-state-boundary-refiner.js`；不接生产、不改 LearnerModel / HintSystem / LessonPlayer / TeachingSystem / Experiment Platform、不自动触发教学、不改 mastery 定义。
> 本文件定义 UA-v2 的输入/输出契约与三套策略的判定映射。

## 1. 输入（refiner 输出，即 Phase 12.5 资产）

```json
{
  "learnerState": "persistent_struggle",
  "confidence": 0.93,
  "alternatives": ["temporary_error", "novice_exploration"]
}
```

| 字段 | 含义 |
|---|---|
| `learnerState` | Phase 12.5 refiner 输出的细粒度 shadow 状态 |
| `confidence` | refiner 置信（细粒度后 0.94–1.0；透传类 >= 0.85） |
| `alternatives` | 次可能状态（供 reason 解释） |

细粒度状态空间（BOUNDARY_STATES）：
`novice_exploration` / `temporary_error` / `persistent_struggle` / `guided` / `independent`

## 2. 输出（policy 决策）

```json
{
  "policy": "UA-v2",
  "action": "partial_hint",
  "reason": "persistent_struggle_high_confidence",
  "risk": {
    "false_backoff": false,
    "dependency_risk": "low"
  }
}
```

| 字段 | 含义 |
|---|---|
| `policy` | 固定 `"UA-v2"` |
| `action` | 教学动作（见 §4 动作空间） |
| `reason` | 决策依据（状态 + 置信档） |
| `risk.false_backoff` | 是否会「错误撤退」（对持续挣扎却不介入） |
| `risk.dependency_risk` | 提示依赖风险档（low/med/high） |

## 3. 三套策略定义（用于对照）

### Policy A — Naive（复刻 Phase 13 Naive）
仅用 **coarse 状态**（LearnerModel 粗状态：struggling / novice / guided / independent），无置信门控：

```
struggling    → partial_hint
novice        → question
guided        → question
independent    → free_attempt
```

### Policy B — UA-v1（复刻 Phase 13 Uncertainty-aware）
用 **coarse 状态 + coarse 置信**（Phase 13 输入）；低置信且模糊类 → 先观察：

```
if coarseConfidence < 0.4 and coarseState ∈ {struggling, novice}:
    → question          // 先观察，不介入
else:
    → boundaryAction(coarseState)   // 同 Naive 映射
```

### Policy C — UA-v2（本阶段，用细粒度状态）
用 **refined 状态 + refined 置信**（Phase 12.5 输出）；低置信安全兜底 → question：

```
if refinedConfidence < 0.4:
    → question          // 不确定时只观察
else:
    novice_exploration  → observe        // 让探索，不脚手架
    temporary_error      → question        // 轻推自纠
    persistent_struggle  → partial_hint    // 介入（不撤退）
    guided               → backoff         // 已在推进，退后
    independent          → backoff         // 放其自由
```

> 对齐说明：spec Step 2 形式化示例为 `persistent_struggle → partial_hint`；Step 3 决策图为 `→ teach`。二者语义一致（均为「对持续挣扎介入、不错误撤退」）。本 schema 以 Step 2 的 IO 契约为准，采用 `partial_hint`；`teach` 同样满足「介入」要求，不影响 false_backoff 判定。

## 4. 动作空间

| action | 语义 | 是否「介入」(intervention) |
|---|---|---|
| `observe` | 仅观察 / 让探索 | 否 |
| `question` | 提问（轻量观察） | 否 |
| `partial_hint` | 给部分提示（脚手架） | 是 |
| `teach` | 完整讲解（脚手架） | 是 |
| `backoff` | 退后（停止辅助） | 否 |
| `free_attempt` | 自由尝试 | 否 |

## 5. 期望动作（用于 Boundary Alignment & 验收）

| 真值状态 | expected action |
|---|---|
| `novice_exploration` | `observe` |
| `temporary_error` | `question` |
| `persistent_struggle` | `partial_hint` |
| `guided` | `backoff` |
| `independent` | `backoff` |

## 6. 指标口径

- **false_intervention_rate**：对「明显不该脚手架」的学习者（`novice_exploration` / `independent`）仍给出 intervention 动作（partial_hint / teach）的比例。
- **false_backoff_rate**：对 `persistent_struggle` 未给出 intervention 动作（question / backoff / free_attempt / observe）的比例——即「错误撤退 / 放任挫败」。
- **recovery_time**：模型化 proxy（越低越好），按 (truth, action) 查表；明确非真实学员证据、非因果增益。
- **hint_dependency**：模型化 proxy（越低越好，可为负）；过度脚手架 `novice_exploration` 增依赖，退后 `guided`/`independent` 减依赖。
- **transfer / retention**：模型化 proxy（越高越好）；经 explore/question 自得技能增益，经脚手架得手减益。
- **state_action_confusion_matrix.json**：每真值状态 × 每策略 → 实际动作 / 期望 / 是否匹配。

## 7. 验收（TEACHING_POLICY_UA_V2_VALIDATED）

全部满足方通过：

```
false_intervention_rate(UA-v2) <= false_intervention_rate(UA-v1)
false_backoff_rate(UA-v2)      <= false_backoff_rate(UA-v1)
recovery_persistent(UA-v2)     <= recovery_persistent(UA-v1)     // 持续挣扎恢复不恶化
hint_dependency(UA-v2)         <= hint_dependency(UA-v1)          // 提示依赖不增
```

## 8. 明确未证明（保留）

- ❌ not real learner evidence（全为 synthetic / shadow）
- ❌ not production validation（未接生产）
- ❌ not causal learning gain（learning 指标为模型化 proxy）
