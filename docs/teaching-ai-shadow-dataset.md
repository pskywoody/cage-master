# Teaching AI Shadow Observation — Dataset Contract（Phase 9）

> 目标：定义 shadow observation 数据集的 event schema、隐私边界、采样规则与分析规则。只读、不执行。

## 1. Event Schema（Shadow Event Record）

```json
{
  "session_id": "string（匿名）",
  "timestamp": 0,
  "learner_snapshot": {
    "mastery": { "hiddenPair": "guided" },
    "hintDependency": 0.3,
    "frustration": 0.3,
    "errorPattern": "omission|misread|guess|weak",
    "consecutiveFailures": 0
  },
  "current_teaching_action": "guided_success|reveal|hint_level|...",
  "current_cat": "guided|reveal|hint|demo|free|null",
  "shadow_recommendation": "partial_hint|question|free_attempt|...",
  "confidence": 0.85,
  "reason": "explainable string",
  "disagreement_type": "A|B|C|D|N",
  "high_confidence_disagree": false,
  "recovery_followup": { "fails": 0, "hints": 0, "independent": false }
}
```

## 2. Disagreement Taxonomy

- **A**：shadow 与当前教学一致。
- **B**：shadow 推荐更低依赖教学（shadow ∈ question/free，当前 ∈ hint/guided/reveal/demo）。
- **C**：shadow 推荐更多解释（shadow ∈ demo/partial_hint/guided，当前 ∈ question/free）。
- **D**：shadow 推荐不同教学阶段（其余不一致）。
- **E**：confidence > 0.8 且路径不同（以 `high_confidence_disagree` 记录，可叠加）。
- **N**：当前无教学动作（如 fail，学生响应），不参与 disagreement rate。

## 3. Privacy Boundary

- 无个人身份信息；`session_id` 匿名化；数据本地存储，不外传。
- 影子模式对用户路径零改动（不执行教学动作、不自动推荐）。
- 合成数据一律标 `source: "SYNTHETIC"`，与分析数据隔离。

## 4. Sampling Rule

- 真实会话：全量 shadow 挂载（只记录 `{event, learner_snapshot, shadow_decision}`），无抽样子集。
- 合成会话：确定性生成、可复现，仅用于演示 pipeline 与压测分析。

## 5. Analysis Rule

- disagreement / recovery 均为**描述性**统计。
- 禁止把 recovery 观察解释为因果；禁止依据 shadow 输出修改用户路径；禁止自动执行教学动作。