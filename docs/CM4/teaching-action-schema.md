# Teaching Action Schema（Battle AI → Teaching AI Phase 1）

> 非生产事件 schema。不接真实 LearnerModel，`expected_effect` 为模拟假设。

## TeachingActionEvent

```json
{
  "experiment_id": "string",
  "agent_personality": "mentor | prober | expert | blind | average | reckless",
  "teaching_intent": "detect_mistake | reduce_pressure | provide_correction_path | maintain_challenge | expose_weakness | test_boundary | demonstrate_optimal_solution | provide_reference_trajectory",
  "student_state": {
    "mastery": "number 0..1",
    "error_pattern": "omission | misread | guess | weak",
    "frustration": "number 0..1"
  },
  "action": "surface_mistake | ease_hint | hint_step | pose_challenge | probe_weakness | edge_case | show_optimal | show_trajectory",
  "expected_effect": {
    "mastery_delta": "number",
    "frustration_delta": "number",
    "hypothesis": "string — simulated hypothesis, not measured learning gain"
  }
}
```

## personity → action 的示意（用于离线模拟）

- mentor：`detect_mistake→surface_mistake`，`reduce_pressure→ease_hint`，`provide_correction_path→hint_step`
- prober：`maintain_challenge→pose_challenge`，`expose_weakness→probe_weakness`，`test_boundary→edge_case`
- expert：`demonstrate_optimal_solution→show_optimal`，`provide_reference_trajectory→show_trajectory`

## 边界

`expected_effect` 是纯模拟假设，不代表真实学习增益，不用于产品有效性声明。