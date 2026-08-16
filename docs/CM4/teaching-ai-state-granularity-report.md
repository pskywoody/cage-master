# Teaching AI State Granularity Refinement 报告（Phase 14）

> SHADOW-only；不改生产 LearnerModel/simulator；不接生产。

## 状态拆分（shadow 分类，加在 LearnerModel 之上）

把原来单一的 `struggling` 拆成三子状态：

| 子状态 | 规则（shadow `classifyFine`） |
|---|---|
| `novice_exploration` | 新技能 + 仅 1 次失败、无独立正确、无 hint 后失败 |
| `temporary_error` | 已有正确 + 偶发失误 + 可恢复 |
| `persistent_struggle` | hint 后仍失败（≥1 且 总错≥2）或 总错≥3 或 连续错≥3 |

## 三种 policy 对比（naive / UA-v1 coarse / UA-v2 fine）

| 指标 | naive | UA-v1（coarse+低置信退） | UA-v2（fine） |
|---|---|---|---|
| **over-intervention**（novice_exploration 被过度教） | 0.20 | 0.00 | **0.00** |
| **under-intervention**（persistent_struggle 被放弃） | 0.00 | 0.20 | **0.00** |
| hint dependency | -0.01 | -0.07 | -0.05 |
| frustration | 0.00 | 0.02 | 0.03 |
| mastery（一步） | 0.66 | 0.58 | 0.59 |
| persistent_struggle 介入率 | 1.0（fr 0 / m 0.55） | 0.0（fr 0.05 / m 0.35） | **1.0（fr 0 / m 0.55）** |

## 核心结论

- **naive** 过度教 novice（0.20），造成不必要的 hint 依赖。
- **UA-v1** 修掉了 over-intervention（0），却把 `persistent_struggle` 也当低置信退出了（under-intervention 0.20）——正是 Phase 13 暴露的「低置信 → 无差别减少介入」缺陷。
- **UA-v2（细粒度状态）同时把 over 和 under 都降为 0**：既不过度教 novice_exploration，也不放弃 persistent_struggle（介入率 1.0、frust 0、mastery 0.55）。

## Pareto（达到目标）

```
persistent_struggle  → teach（partial_hint）
temporary_error      → observe/question
novice_exploration   → explore（free_attempt/退后）
guided               → backoff
independent          → backoff
```

## 意义

这证明了 **Phase 13 的根因是 state granularity，不是 policy**。把 `struggling` 拆开后，同一个 uncertainty-aware 思路（UA-v2）就能同时避免两类风险。至此，CM4 具备进入真实小流量实验的**理论基础**：在细粒度状态下，介入决策可以同时控制「过度帮助」与「错误撤退」。

## 边界

- SHADOW 分类；一步效应近似；不接生产、不改 LearnerModel 定义（细分类是叠加的 shadow 层）。