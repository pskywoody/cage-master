# CM4 Experiment Runtime Bridge Report

> 阶段状态：**EXPERIMENT_RUNTIME_BRIDGE_READY**
> 定义：已能消费 CM4 已存在的真实事件源，并转换成实验事件格式；不改变任何产品行为。

## 完成项

1. **真实事件源盘点** `docs/CM4/experiment-runtime-signal-map.md`：只登记已有信号（LessonPlayer/TeachingSystem/HintSystem/Puzzle/Battle AI），并映射为 exposure/behavior/intervention/outcome。
2. **运行时事件收集器** `core/experiment-event-collector.js`：`record({source,eventType,payload})` → 统一实验事件（实验镜像，非业务事件）。
3. **运行时桥** `core/experiment-runtime-bridge.js`：连接 `learner-event-adapter` 与 `experiment-event-collector`；`raw → normalize → experiment event → jsonl`；并支持 Battle AI decision 镜像。
4. **离线回放验证** `scripts/experiment-runtime-replay.js`：消费真实 learner 样例 + battle ai traces，输出实验事件 jsonl 与回放报告，校验 event count / subject / timestamp / source 保留。

## 验证结果

- 9 条 learner 事件全部 consume，0 跳过。
- 30 条 Battle AI 决策全部 consume。
- 共产出 39 条实验事件。
- `event_count preserved: true`、`subject preserved: true`、`timestamp preserved: true`。
- 来源可见：`TeachingSystem / HintSystem / LessonPlayer / BattleAI`。

## 新增文件

- `docs/CM4/experiment-runtime-signal-map.md`
- `core/experiment-event-collector.js`
- `core/experiment-runtime-bridge.js`
- `scripts/experiment-runtime-replay.js`
- `docs/CM4/experiment-runtime-bridge-report.md`（本文件）

## 验收标准对照

1. CM4 已有事件可以进入 Experiment Platform：✅（adapter → bridge → collector）
2. 没有修改生产行为：✅（仅新增 adapter/collector/bridge/replay/docs）
3. 分析层可以消费真实格式：✅（统一 experiment event 格式）
4. 归档五件套仍然成立：✅（本层产出 events.jsonl，可继续交给 `analyzeExperiment` + `writeArtifactPackage`）

## 当前能力边界

- 全离线 replay；不是线上事件流。
- Battle AI trace 无时间戳，由桥按序合成单调时间。
- 尚未接入 Experiment Platform 的 ASSIGN（本层只做镜像，不做分流）。

## 下一阶段（不在此阶段执行）

Phase 4 — 真实用户实验 / 在线分流：把 collector 挂到真实 runtime、AB 分流、在线停止规则。这一步需要产品侧部署决策，本阶段不做。