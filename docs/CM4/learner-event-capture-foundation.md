# Learner Event Capture Foundation（Phase 14.5）

> 状态：采集基础设施就绪（Gates 1–4 PASS on demo pipeline）· **WAITING_FOR_REAL_EVIDENCE**
> 只补采集，不接教学策略；不改 HintSystem/LessonPlayer 行为、不改 LearnerModel 定义。

## 目标

把「真实数据入口」建起来，解除 Phase 15 的最大 blocker：

```
Runtime Signals → LearnerEventCollector → capture-contract.jsonl → Adapter → LearnerModel → State Refiner → UA-v2 shadow
```

## 最小采集契约

```json
{
  "eventId": "string",
  "sessionId": "string",
  "timestamp": "ISO string",
  "source": "LessonPlayer|HintSystem|TeachingSystem|Puzzle",
  "technique": "hiddenPair",
  "action": { "type": "attempt|hint|reveal|guided_success|solve" },
  "outcome": { "success": true|null, "mistakes": 0|null, "solveTime": 0|null }
}
```

优先保证 `fail(attempt success=false) → hint → retry → success` 四类轨迹存在；不追求一次采集完整。

## 新增组件（全部只读/叠加）

- `core/learner-event-collector.js` — `LearnerEventCollector`：session 管理 + `collect(raw)` + append-only JSONL 落盘。
- `core/teaching-ai-state-refiner.js` — 把 Phase 14 的 `classifyFine / coarseState / fineAction / boundaryAction` 抽成可复用模块（供 Phase 15 直接 import）。
- `scripts/learner-event-capture-demo.mjs` — 管线演示（覆盖 Gate 1–4）。
- `data/learner-event-capture/` — demo 输出（capture.jsonl + gates.json）。

## 挂接点（运行时侧待接线，不改行为）

| 来源 | 既有事件点 | 建议挂接 |
|---|---|---|
| LessonPlayer | `_recordLessonEvent(type, …)` | 在其 emit 处调用 `collector.collect(...)`（只读追加） |
| HintSystem | `getHint()` | 返回后调用 `collect({actionType:'hint', …})` |
| TeachingSystem | `recordEncounter(tech, correct)` | 调用 `collect({actionType: correct?'solve':'attempt', …})` |
| Puzzle | 填格/结算 | `attempt/solve` + `outcome.mistakes/solveTime` |

## Gates（demo 结果：全 PASS）

- **Gate 1** 真实 session 能生成 `sessionId + events[]`：✅（6 事件落盘 capture.jsonl）
- **Gate 2** adapter 能消费 capture-contract → LearnerModel：✅（6 observe → skillState=independent, conf 0.42）
- **Gate 3** Phase 14 classifier 能跑：✅（refinedState=guided）
- **Gate 4** shadow loop 能回答「当前路径 vs UA-v2 哪里不同」：✅（实际 [hint, guided_success, hint] vs UA-v2 question → 3 处不同）

## 诚实边界

- Gates 是**数据能力**验证（用 demo 信号跑通管线），不是真实用户效果。
- 运行时侧「在真实事件点调用 collector」尚未接线（需工程侧接入，或提供真实 dataset 路径）。
- 不接 UA-v2 decision；不自动教学；不改任何来源行为。

## 之后

真实 session 事件落地后，Phase 15（Real Session Shadow Validation）可直接执行：喂真实 events → LearnerModel + State Refiner → UA-v2 shadow 对照 → 回答「真实 session 中当前教学路径 vs UA-v2 哪里不同」。