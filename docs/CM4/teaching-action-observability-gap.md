# Teaching Action Observability Gap Analysis（Phase 13）

> 状态：**OBSERVABILITY_GAP_READY**
> 结论：Policy 的上限受限于 Action Space 的可观测性，而不是算法复杂度。
> shadow/research only；不改生产教学、不改实验协议、不扩展 Goal Engine。

## 0. 核心发现

当前 canonical 动作空间 7 类里，shadow 已经能生成全部 7 类，但系统真实运行时证据只有 3 类（demo/hint/guided），覆盖率 `3 / 7 = 0.429`。缺的不是「生成能力」，而是「运行时证据字段」。

## 1. 缺口总表

| action | schema | generator | runtime evidence | missing |
|---|---|---|---|---|
| demo | ✅ | ✅ | ✅（22） | — |
| hint | ✅ | ✅ | ✅（22） | — |
| guided | ✅ | ✅ | ✅（21） | — |
| question | ✅ | ✅ | ❌（0） | event fields |
| partial_hint | ✅ | ✅ | ❌（0） | event fields |
| difficulty_down | ✅ | ✅ | ❌（0） | event fields |
| difficulty_up | ✅ | ✅ | ❌（0） | event fields |

## 2. Missing Evidence Map（采集字段契约）

真实 session 接入前，先确认这些字段有采集点，否则「有数据、无字段」。

### question

缺：`question_generated`（是否生成提问）、`question_answered`（是否回答）、`question_helpful`（提问后是否促成独立正确/恢复）。

### partial_hint

缺：`hint_granularity`（给出 hint level 0..3）、`hint_consumption`（是否按 hint 推进）、`recovery_after_hint`（hint 后是否恢复独立解题）。

### difficulty（down / up）

缺：`puzzle_adjustment`（是否发生难度调整）、`failure_rate_before`（调整前失败率）、`failure_rate_after`（调整后失败率）。

机器可读版本：`docs/schemas/teaching-evidence-registry.v1.json`；确定性生成脚本：`scripts/teaching-action-observability-gap.mjs` → `data/teaching-action-observability/gap-map.json`。

## 3. Legacy action 不合并（冻结决定）

`free` 与 `reveal` 保持为 Legacy Observed Action，**不并入** canonical 7 类。理由：

- `reveal` 可能是「动作方式 + 教学意图失败 fallback」，不是教学策略本身。
- `free` 更像「learner opportunity」，不是 intervention。
- 现在合并会污染未来 Policy 学习（模型可能误学「reveal 是一种教学策略」）。

## 4. 为什么先做这个

真实 session 之前最危险的不是「没有数据」，而是「数据来了但没采集字段」，那会浪费真实实验窗口。这份缺口地图把「缺什么字段」先钉死。

## 5. 冻结建议

- 形成 `TEACHING_ACTION_SPACE_READY`。
- **不进入 Teaching Policy v1**。原因：
  ```
  Policy = f(state, action space, outcome)
    state        ⚠️ partial（Learner State Identification 未到 confidence）
    action space ✅ ready
    outcome      ✅ ready
  ```
  还缺 state confidence。

下一决策点：等真实 session（动作空间覆盖 question/partial_hint/difficulty）同时补上 §2 的采集字段；在此之前不做 Policy。