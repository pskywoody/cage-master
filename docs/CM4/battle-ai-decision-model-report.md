# Battle AI 决策模型报告（CM4 Research Sprint）

> 状态：研究样本 · 日期：2026-08-16 · 只读研究，未改生产逻辑。

## 1. 结论摘要

当前 AI 已经是「**观察战局 → 形成状态 → 选择策略 → 产出动作 → 依据结果调整**」的状态化决策模型，而不是「每步独立调用 solver 的机器人」。它由三层构成：

1. **Tactical Solver 层**：`AIPlayerCore.think()` 委托 `TechRater` 找真实可执行动作。
2. **Strategy State Machine**：`attack / defend / global / counter` 四态，`_determineStrategy()` 每步重估。
3. **Director 叙事层**：`Director.decide()` 输出 `probe / pressure / steal / fortify / gamble / trap / finish` 七类意图，经 `StrategySelector.resolve()` 钳制回 Solver 旋钮。

## 2. 决策链路（当前代码，已核实）

```
think()                                (core/ai-player-core.js)
  → _applyObserverAnalysis()           观察器分析
  → _determineStrategy()               策略状态机（attack/defend/global/counter）
  → _runDirector()                     导演决策 + StrategySelector 调制
  → note decision                      （可选）写笔记
  → _findAllVisibleResults()           TechRater 逐级找解
  → return step                        {fill | note}
```

- `getStrategy()`：返回 `{ strategy, targetHub, label }`（当前策略，可被外部/HUD/研究采样）。
- `getDirectorDecision()`：返回最近一次导演决策（叙事意图）。
- `getGameState()`：返回已注入战局状态（isLeading/hub/进度/连对连错）。

## 3. 各层职责

| 层 | 决策 | 输入 | 输出 |
|---|---|---|---|
| Strategy SM | 进攻/防守/全局/反击 | `_gameState`（领先/落后/据点/进度） + 观察器 | `_currentStrategy` |
| Director | 七类戏剧意图 | `_gameState` + 对手分析 + 当前策略 | `decision`（叙事意图） |
| StrategySelector | 意图→旋钮钳制 | `decision` | `{ targetStrategy, hubWeightMult, stealLevel, noteCadence }` |
| TechRater | 实际可执行的解 | board 候选 | 具体 `technique/move` |

## 4. 关键事实

- 生产路径 `TplBattleController._syncAiState()` 每步构建 `BattleContext` 并 `setGameState(toGameState(ctx))`，AI 每步决策前都能拿到真实战局状态（Phase 0 已核实，非死导入）。
- Director 在生产为**激活调制模式**（`game.html` 传 `directorShadow:false`），不是 shadow。
- TechRater 仍是唯一 solver fact source；AI 只决定「我要进攻/防守/全局」，不重实现解题。

## 5. 结论

决策模型已具备状态化闭环的结构前提；行为层面的状态化验证见 `battle-ai-state-validation-report.md`，人格差异见 `battle-ai-personality-evaluation.md`。