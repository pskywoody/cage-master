# Teaching AI Shadow Adapter（Phase 8）

> 影子组件：只预测，不执行教学动作。研究用，不改生产。

## 接口

```json
输入 {
  learnerState: { mastery: {tech: level}, hintDependency, frustration, errorPattern },
  technique,
  difficulty,
  history
}
输出 {
  recommendedAction,   // partial_hint | question | free_attempt | ...
  confidence,          // 0..1
  reason               // 可解释字符串
}
```

## 推荐规则（与 Phase 6/7 的 C 策略一致，但带解释）

| learner 状态 | recommendedAction | reason |
|---|---|---|
| struggling | partial_hint | 先脚手架再独立尝试 |
| novice + guess/weak | partial_hint | 降低难度优先 |
| novice | question | 苏格拉底式提问建立独立 |
| guided | question | 升级到独立推理 |
| independent/near_mastery | free_attempt | 自由练习促进迁移 |
| frustration > 0.7 | partial_hint（覆盖） | 降压力 |

## Learner snapshot 投影

`projectLearnerState(events)` 复用 `learner-event-taxonomy.md`：
`encounter→exposed / hint→guided / guided_success→guided / skill_used_correctly→independent / skill_mastery→fluent / fail→struggling`，并估计 `hintDependency / frustration / errorPattern`。

## 边界

- 不执行教学动作；不接 LessonPlan/HintSystem/TeachingSystem runtime；不自动推荐；不影响玩家行为。