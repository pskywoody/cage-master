# Experiment Report — hint_policy_v2

Hypothesis: 新提示策略相比旧提示策略，提高完成率/降低提示依赖/提升技能掌握。

## Variants
- A (control)
- B (treatment)

## Metrics
### A
- sessions: 6
- completion_rate: 0.667 (95% CI 0.3 ~ 0.903)
- avg_time_ms: 156000 (CI 148493.8 ~ 163506.2)
- avg_steps: 10.75
- hint_per_session: 1.83
- mastery: 1
### B
- sessions: 6
- completion_rate: 1 (95% CI 0.61 ~ 1)
- avg_time_ms: 99166.7 (CI 93277.6 ~ 105055.7)
- avg_steps: 6.17
- hint_per_session: 0
- mastery: 1

## Deltas
- completion_rate_delta: 0.333
- avg_time_ms_delta: -56833.3
- avg_steps_delta: -4.58
- hint_per_session_delta: -1.83
- mastery_delta: 0

## Quality
- missing_event_rate: 0
- sample_size total: 12
- significance_judged: false
