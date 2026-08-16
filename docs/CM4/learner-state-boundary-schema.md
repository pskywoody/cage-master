# Learner State Boundary Schema

> Phase 12.5：Shadow State Boundary Refinement Layer。
> 只读；不改 `core/learner-model.js` 的推断定义；不接政策；不进入生产。

## 分层

```
LearnerModel state (coarse)
        |
        v
Boundary classifier (shadow)
        |
        +-- novice_exploration
        +-- temporary_error
        +-- persistent_struggle
        +-- guided
        +-- independent
```

## 输入（refiner）

```json
{
  "inferredState": "struggling",
  "confidence": 0.25,
  "evidence": {
    "failures": 2,
    "hints": 1,
    "recoveryAttempts": 1,
    "previousSkillMastery": true
  }
}
```

## 输出（refiner）

```json
{
  "shadowState": "temporary_error",
  "confidence": 0.78,
  "alternatives": [
    { "state": "persistent_struggle", "probability": 0.22 }
  ]
}
```

## 状态语义

| shadowState | 含义 |
|---|---|
| `novice_exploration` | 新人/探索期：错误少、恢复快、不依赖提示 |
| `temporary_error` | 临时失误：有旧能力，偶发错后自行恢复 |
| `persistent_struggle` | 持续挣扎：反复同类错 + 提示依赖上升 |
| `guided` | 已在提示下推进（LearnerModel 已有，透传） |
| `independent` | 独立正确（透传） |

## 约束

- 这是 shadow layer，不修改 LearnerModel。
- 不影响教学决策（不接 Policy、不自动介入）。
- guided/independent 透传，保持 Phase 12 已证可靠性不变。