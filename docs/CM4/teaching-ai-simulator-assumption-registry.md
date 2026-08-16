# Teaching AI Simulator Assumption Registry

> 目的：防止 Phase 2 的 simulator 变成黑盒。逐项登记参数、来源与校准状态。
> 对应实现：`core/teaching-learner-simulator.js`。

| Simulator 参数 | 来源 | 当前状态 |
|---|---|---|
| `successProbability`（demo/guided/challenge 规则） | synthetic rule（Phase 2 手写） | 未校准 |
| `frustrationRisk`（challenge 高难度、连续失败累加） | synthetic rule（Phase 2 手写） | 未校准 |
| `engagementSignal` | synthetic rule（Phase 2 手写） | 未校准 |
| `masteryDelta`（guided→+1、demo→+1 等） | 对齐 `learner-event-taxonomy.md` 的状态机（exposure/hint_dependence/independent/struggle） | 待验证 |
| `recoveryProbability`（struggling + guided → guided） | 教学假设（LessonPlayer `guided_success` + `fail` 恢复） | 待验证 |

## 关键声明

- `guided` 动作的 mastery 上升方向，与 LearnerEvent taxonomy 里 `guided_success → correct(independent=false) → hint_dependence → guided` 方向一致（**已对齐方向**，量级未校准）。
- `challenge` 对低掌握者 frustration 上升，与 taxonomy 中 `fail/mistake → struggle` 方向一致（**已对齐方向**）。
- `demo/reveal` 不促进真实掌握（reveal 成功但 mastery 持平），与 taxonomy 中 `reveal → hint`（hint 依赖，不产生 independent）一致。

## 校准声明

所有数值仍是合成规则，未用真实 learner 数据拟合；本表只追踪「方向是否与已存在证据一致」，不做量级校准声明。