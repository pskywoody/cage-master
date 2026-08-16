# Learner State Transition Refinement（Phase 14.6）

> 状态：**Phase 14.6 PASS（transition 层验证通过）** · 新增模块，未改 classifyFine/LearnerModel/生产
> 前置：Gate B（Phase 15）暴露 prior mastery bias → 本阶段定义 transition 规则

## 问题（Gate B 发现）

`core/teaching-ai-state-refiner.js` 的 `classifyFine` 中 `if (indep >= 2) return 'independent'` 无条件提前返回，隐含假设"一旦独立成功就不会再陷入困境"。真实学习轨迹不成立（mastery regression / relapse）：

```
independent ──failure spike──▶ temporary_error ──recovery──▶ independent
temporary_error ──repeated failure + hint dependency──▶ persistent_struggle
```

旧分类把"先独立成功≥2 再犯错"的轨迹误判为 independent，两个 struggling 子状态不可见。

## 方案：新增 transition 层（不修改旧分类器）

`core/teaching-ai-state-transitioner.js` — `StateTransitioner`：
- **current signal**：滑动窗口（默认 5）内的错误/hint→fail/连续错误。
- **historical capability**：整段独立/引导成功历史。
- **state = current signal × historical capability**，而不是"最高能力状态获胜"。
- **recovery 规则**：窗口内最后一个 error 之后连续正确达阈值（默认 2）且无新 error → 视为已恢复，状态反映历史能力。

## 验证结果

### 真实轨迹（先独立成功 8 步 → 后陷入困境，真实引擎驱动）

| 轨迹 | 错误 | 正确 | hint | 旧 classifyFine | 新 StateTransitioner | 修复 |
|---|---|---|---|---|---|---|
| prior_mastery_temp | 12 | 10 | 11 | independent | **temporary_error** | ✓ |
| prior_mastery_persist | 52 | 8 | 30 | independent | **persistent_struggle** | ✓ |

2/2 修复 prior mastery bias。

### 纯轨迹审计（Gate B GAP 回归 + recovery）

| 轨迹 | 期望 | 旧 | 新 | 结果 |
|---|---|---|---|---|
| correct→correct→error | temporary_error | independent | temporary_error | ✓ |
| correct→correct→hint→error×2 | persistent_struggle | independent | persistent_struggle | ✓ |
| correct→correct→error→correct→correct | independent | independent | independent | ✓ |
| correct→correct | independent | independent | independent | ✓ |

audit：旧 2/4 → 新 **4/4**。

## 对 Phase 14 结论的修正（不推翻）

原：

> struggling 拆三态后，UA-v2 双零。

修正为：

> struggling 拆三态后，在**无 prior mastery history 的轨迹**中 UA-v2 双零；真实轨迹中需处理 mastery regression / relapse（independent→struggling 过渡）。

Phase 14 解决的是 `novice vs struggling ambiguity`；Phase 14.6 补齐 `independent → struggling transition`。

## 边界

- **未修改** `classifyFine`、`LearnerModel`、任何生产模块的判定行为。
- `StateTransitioner` 为新增 shadow 层，当前仅研究验证用，未接任何 decision。
- recovery 阈值（默认 2）与窗口大小（默认 5）为初始设定，需真实数据校准。

## 产物

- `core/teaching-ai-state-transitioner.js`
- `scripts/learner-event-phase14-6.mjs`
- `data/learner-event-phase14-6/phase14-6-report.json`

## 下一步

Phase 15 真实 session validation（H1 真实分布 / H3 shadow divergence），transition 层可作 shadow 对照；真实数据到位后校准窗口与 recovery 阈值。