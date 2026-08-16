# Learner Event Runtime Bridge（Phase 14.5-Gate A）

> 状态：**GATE A PASS（Event Flow Enablement 达成）** · 冒烟验证通过
> 范围：把真实运行时事件从四个生产来源接入 CM4 research pipeline。
> 前置：Phase 14.5（learner-event-collector + state-refiner 基础设施）已就绪。

## 目标

证明真实运行时事件可以进入 research pipeline，形成：

```
raw runtime event (四来源)
        ↓ RuntimeEventBridge（只读，委托已有 LearnerEventCollector）
capture-contract JSONL
        ↓ learner-event-adapter
LearnerModel
        ↓ teaching-ai-state-refiner
Phase 15 observation dataset
```

限制（Gate A 边界）：不改事件语义 · 不改变教学行为 · 不启用 UA-v2 decision · 不影响用户体验。

## 四个挂接点（只读，缺省 no-op）

| 来源 | 既有事件点 | 改动位置 | 采集信号 |
|---|---|---|---|
| LessonPlayer | `_recordLessonEvent(type, data)`（统一汇聚，AI 遥测） | `core/lesson-player.js`：构造读 `options.eventHook`；`_recordLessonEvent` 末尾镜像采集 | guided / guided_l1/2 / reveal / fail / watch / technique_taught |
| HintSystem | `getHint()` 三级渐进提示 | `expert/hint-system.js`：构造读 `options.eventHook`；getHint 三处 return 前 `_emitHintEvent` | hint request + hintLevel + technique |
| TeachingSystem | `recordEncounter(technique, usedCorrectly)` | `expert/teaching-system.js`：构造读 `options.eventHook`；方法内采集 | teaching interaction / guided success |
| Puzzle | `HeadlessEngine.fillCell(r,c,num)` | `core/headless-engine.js`：构造加 `this.eventHook`；fillCell 结果点 `_emitPuzzleEvent` | attempt/solve + mistake + solve 完成信号 |

所有挂接点均通过**可选注入的 `eventHook` 回调**触发，缺省为 `null` → 完全不采集、零行为改变。回调内部 try/catch 包裹，异常不影响来源。

## 采集契约（capture-contract）

```json
{
  "source": "LessonPlayer|HintSystem|TeachingSystem|Puzzle",
  "technique": "nakedSingle",
  "action": { "type": "attempt|hint|hint_level|reveal|guided_success|solve|fail" },
  "outcome": { "success": true|null, "mistakes": 0|null, "solveTime": 0|null },
  "metadata": { "hintLevel": 3 }
}
```

优先保证 `fail(attempt success=false) → hint → retry → success` 四类轨迹存在。

## 新增/接入组件

- `core/learner-event-runtime-bridge.js` — `RuntimeEventBridge`：统一 `attachAll()` 注入四来源；**委托已有 `core/learner-event-collector.js`（LearnerEventCollector）** 聚合 + JSONL 落盘；`toJSONL()` 导出。
- `core/learner-event-collector.js` — 已有，仅接入（bridge 复用其 `collect/getSession/finalize`）。
- `scripts/learner-event-live-smoke.mjs` — 真实 session 冒烟：真实生产模块 + HeadlessEngine 驱动真实关卡，注入 bridge，落盘 → adapter → LearnerModel → state-refiner → UA-v2 shadow 对照 → observation report。
- `data/learner-event-live-smoke/live-session.jsonl` — 冒烟落盘 JSONL（33 事件，四来源）。
- `data/learner-event-live-smoke/live-observation-report.json` — 冒烟 observation report。
- `data/learner-event-live-smoke/live-gateA.json` — Gate A 验收结果。

## 验收结果（冒烟，level-101）

```
Gate A PASS: true
  realSessionProducedEvents: true   (33 事件：Teaching 10 / Hint 10 / Puzzle 11 / LessonPlayer 2)
  hasSessionId: true                (rt-s101)
  jsonlWritten: true
  skillStateComputed: true          (nakedSingle → exposed, conf 0.4)
  fineStateComputed: true           (coarse guided / fine guided / UA-v2 → question)
  observationReportWritten: true
  allSourcesWired: true             (四来源均有事件流入)
  eventTypeCoverage（验收事件类型）:
    fail: true   hint: true   reveal: true
    guided_success: true   solve: true
    mistake: true   solve_time: true
```

事件类型覆盖含故意填错场景（`wrongNumber` 演示），触发 `fail`/`mistake` 事件，随后擦除重填进入 `solve`，满足验收对 fail/mistake/solve_time 的要求。

回归：`scripts/ai-teach-loop.js --levels 101` → 通过率 100%，提示流程与 headless 行为未受影响。

## 诚实边界

- 冒烟是**数据能力 + 接线正确性**验证：事件来自真实生产模块在真实关卡上的运行，但 LessonPlayer 的技能事件由真实事件点（`_recordLessonEvent`）在引导阶段触发，非完整交互式播放。
- 未验证真实玩家效果；不接 Policy；不启用 UA-v2 decision；不自动教学。
- 浏览器侧落盘为内存 + localStorage + `toJSONL()` 导出，尚未接入 game.html（后续 Phase 16 小流量实验时接）。

## 之后

真实事件已可流入 → **Gate B（Phase 15 Real Session Shadow Validation）** 可执行：
- H1 真实状态分布（novice_exploration / temporary_error / persistent_struggle / guided / independent 比例）
- H2 LearnerModel 边界（persistent_struggle 是否仍能区分 temporary_error——CM4 最高价值点）
- H3 shadow divergence（actual teaching path vs UA-v2 shadow：是否减少无效 hint / 避免过早撤退 / 改善 recovery）