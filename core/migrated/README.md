# core/migrated/ - 待接线迁移库

本目录存放从 cagemaster3 迁移但**尚未接入 V4 主运行链路**的纯逻辑模块。

## 接线状态说明

> **重要**：这些模块目前**不参与任何工作**，仅作为候选库保留。
> 迁移完成后由人工确认"是否需要"、"如何接线"，再逐个移回 `core/` 并接入依赖。
> 已迁出：what-if-manager.js 已于 2026-08-03 迁至 core/what-if-manager.js 并接入 game.html 主链路。

| 模块 | V3 来源 | 功能 | 接线状态 |
|---|---|---|---|
| `event-bus.js` | core/event-bus.js | 全局事件总线 | ⏳ 未接线 |
| `game-timer.js` | game/game-timer.js | 计时器 + 暂停 | ⏳ 未接线 |
| `rule45.js` | game/rule45.js | 星衡法则数学 | ⏳ 未接线 |
| `combo-system.js` | game/combo-system.js | 连击系统 | ⏳ 未接线 |
| `note-system.js` | game/note-system.js | 三视角呼吸态笔记 | ⏳ 未接线 |
| `three-act-engine.js` | game/ThreeActEngine.js | 三幕节奏引擎 | ❌ 已评估，不迁移 |
| `game-context.js` | core/GameContext.js | 中央状态 | ⏳ 未接线 |

## 接线前需评估的重叠风险

| 迁移模块 | 可能重叠的 V4 现有能力 | 建议 |
|---|---|---|
| `rule45.js` | `tech-rater.js` 内含笼组合枚举（_getPossibleNumbers） | 若 tech-rater 已覆盖，rule45 可弃用 |
| `note-system.js` | `board.js` 内建笔记（candidates Set + autoFillCandidates） | 三视角呼吸态是 UI 层增强，接 UI 时评估 |
| `three-act-engine.js` | 关卡数据 `threeAct` 结构 + lesson-player 阶段机 | 演出层增强，接 renderer 时评估 | ❌ **已评估：不迁移**（V4.3.32 定稿 tpl 三点连线 Boss 战规则 v2.0 取代三幕节奏引擎的演出需求；lesson-player 已覆盖教学阶段机） |
| `combo-system.js` | lesson-player 无连击概念 | 接 UI 时评估 |
| `game-context.js` | headless-engine 自持状态 | 多模块共享状态时评估 |
| `event-bus.js` | 模块间直接调用为主 | 需要解耦时评估 |
| `what-if-manager.js` | 无对应 | 功能模块，接 UI 时评估 |

> 注：`data-store.js` 已接线（ui/settings、ui/gallery 使用），保留在 `core/` 主目录。
> 它与 `level-manager.js` 自带的进度存储并存，后续建议统一存储入口。

## 验证记录

迁移时已通过 Node 冒烟测试（9/9 通过），语法正确。移入本目录不影响主链路。
