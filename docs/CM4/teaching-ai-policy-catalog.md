# Teaching AI Policy Catalog（Phase 4）

> 三个离线 teaching policy，供 counterfactual 比较。不接生产、不改教学策略。

## Policy A — Static Lesson（baseline）

固定顺序，不随 learner state 调整：

```
unknown/struggling/novice → demo(show_optimal)
guided → free challenge(pose_challenge)
independent/fluent → verify(edge_case)
```

## Policy B — Hint-Aligned

按当前 evidence 深度给最小必要信息：

```
struggling/novice → explain(show_optimal)
guided → eliminate evidence(reveal)
independent/fluent → verify(pose_challenge)
```

## Policy C — Learner Adaptive（研究目标）

按 LearnerState（skill + errorPattern）选择教学意图：

```
struggling / 猜测/薄弱 → mentor scaffold(ease_hint)
novice → guided(hint_step)
improving(guided) → expert challenge(pose_challenge)
mastered(independent/fluent) → prober transfer(edge_case)
```

## 对应机器可读

`data/teaching-ai-policy-catalog.json`（rules 数组，runner 按 level/errorPattern 取 action）。