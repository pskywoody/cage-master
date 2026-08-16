# Teaching AI Phase 4 — Freeze Report

> 状态：**TEACHING_AI_POLICY_EXPERIMENT_READY**

## 已验证

- 三种 policy（static / hint-aligned / learner-adaptive）可以运行。
- counterfactual 可比较（同一 learner 三份结果）。
- Experiment artifact 可生成（`assignments.jsonl` / `trajectories.jsonl` / `outcomes.json` / `summary.json` / `learner-population.json`）。

## 未验证

- 真实玩家收益。
- personality 影响。
- 长期 retention。
- engagement（仅 SIMULATED_ONLY）。

## Production Boundary

- 未修改 LessonPlayer / TeachingSystem / HintSystem / LearnerModel / Battle AI / TechRater。
- 未接真实用户 / 在线分流 / 自动推荐 / 自动难度。
- 未调 mastery threshold / decay τ / simulator 参数。

## 意义

CM4 现已具备完整研究闭环：

```
LessonPlan → Hint → Teaching AI Policy → Learner Model → Experiment Platform
```

即第一次具备「教学策略 → 学习结果假设 → 可比较实验」的离线能力。