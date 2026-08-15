# Battle AI 当前运行时地图（Phase 0 基线）

> 状态：Phase 0 产出 · 日期：2026-08-16 · 只读追踪，未改任何代码
> 方法：只以当前源码为准，逐条核对 `game.html` / `core/` / `scripts/`，不采信旧审计结论。

## 0. 结论摘要

- 生产单机 Boss 战的入口是 `game.html` 的 `startBossBattle`（`game.html:4556`），它 **只 `new TplBattleController`**（`game.html:4573`），**不实例化 `BattleManager`**（`new BattleManager` 在 game.html 中 grep 为 0）。
- `BattleManager` 类在生产路径已停用，当前只作为宿主文件被复用三类：`AIPlayerCore`（决策引擎）、`BOSS_CONFIGS`、`BATTLE_EVENTS`。
- 真正驱动生产 AI 的是 **`TplBattleController` 包装 + `AIPlayerCore.think()`**；`battle-context.js` 是活代码，由控制器每步构建统一上下文并投影回 AI。

## 1. 生产入口链路

```
handleEvent 'levelLoaded' (game.html:6273)
  → isBossLevelId && startBossBattle (game.html:6343-6344)
  → startBossBattle (game.html:4556)
      config = BOSS_CONFIGS[chapterId]              (game.html:4559)
      new TplBattleController({directorShadow:false}) (game.html:4573)   ← 关键：导演激活
      controller.start(...)                          (game.html:4580)
TplBattleController.start (core/tpl-battle-controller.js:112)
  new ThreePointLineManager :120
  new AIPlayerCore          :140
  new Director + setDirector(director, false)  :153-156
  _scheduleAiMove          :215
```

## 2. 十个「谁」的对照表

| 问题 | 答案 | file:line | 路径 |
|---|---|---|---|
| 谁创建 AI | `TplBattleController.start` 内 `new AIPlayerCore`；legacy/duel/test 各另有 8 处 | `tpl-battle-controller.js:140`；`battle-manager.js:2844`；`duel-ai*.mjs`；test | production + legacy + duel/test |
| 谁调用 think() | TPL 自定时循环：`_scheduleAiMove`→`_aiMove`→`think()` | `tpl-battle-controller.js:646/681/722`；think 定义 `battle-manager.js:1715` | production |
| 谁调用 setGameState | `_syncAiState()` 每步构建上下文后注入 | `tpl-battle-controller.js:508-510` | **production 可达** |
| 谁调用 updateObserver | `onPlayerFill` 内 | `tpl-battle-controller.js:259-262` | **production 可达** |
| 谁 setOwnershipGrids | start 后 + `_syncAiState` 内 | `tpl-battle-controller.js:142-143, 472-473` | production |
| 谁 setHotspotPriority | **仅 legacy** `_initAiPlayer` | `battle-manager.js:2850` | **仅 legacy**（production 恒默认 0，抢关键格分支不触发） |
| 谁执行 AI 落子 | production 直接 `_aiMove`→`_tpl.onAIFill` 仲裁 + 写 `isAiFilled`，**不走** `execute()`/`_applyAiMove()` | `tpl-battle-controller.js:769-782`；仲裁 `three-point-line-manager.js:294-373` | production |
| 谁消费 AI note | 四条路径都正确处理（气泡 + 重新调度/落候选） | `tpl-battle-controller.js:742-750`；`battle-manager.js:3760-3781`；`duel-ai*.mjs` | 全路径（已修复，不再静默丢弃） |
| 谁更新 _moveCount | 2 处自增：`execute()`、`syncFromBoard()`；production 靠落子后二次同步自增 | `battle-manager.js:2007, 2154`；读 `1348/2316/1022/1707` | 全路径共享 |
| 谁更新 score/归属 | `ThreePointLineManager._processFill` 写归属/维度/据点；控制器 `getScoreProgress()` 映射得分 | `three-point-line-manager.js:289-451, 476-569`；`tpl-battle-controller.js:315-328` | production |

## 3. Director / Drama / Strategy / 下一步

- **Director 生产为激活调制模式**：`game.html:4575` 传 `directorShadow:false` → `setDirector(director,false)`（`battle-manager.js:960-965`）→ `_runDirector()` 真正 `director.decide()` 并 `_applyDirectorParams()` 下发旋钮（`battle-manager.js:1017-1068`）。文件里「默认 shadow」的注释已过时。
- **Drama**：`DramaEventManager` 由控制器实例化，`_drivePollutionGhost()` 在玩家落子（`:271`）与 AI 落子（`:799`）后触发污染幽灵；`DramaPlanner` 经 `IntentObserver.infer` 喂玩家意图（`tpl-battle-controller.js:499-505`）。`drama-metrics.js` 的 `DramaTracker` 仅 duel harness 使用，未接生产。
- **Strategy**：`AIPlayerCore` 构造 `new StrategySelector()`；Director 叙事层 `probe/pressure/steal/fortify/gamble/trap/finish`，Solver 实际层 `_currentStrategy ∈ {attack, defend, global, counter}`（`_determineStrategy` 每步重估，`battle-manager.js:1138-1197`）；两者经 `StrategySelector.resolve` 互译。
- **下一步 AI decision**：自定时循环（`_scheduleAiMove`→`_aiMove`→末尾 re-arm，`tpl-battle-controller.js:807`），**不是事件驱动**；玩家落子不 re-arm，`GAME_END`→`_finish()` 清定时器。

## 4. 三条运行路径

### production（单机主线，真正在用）
```
startBossBattle → new TplBattleController → start
  玩家落子: ui/main.js 'cellFill' → game.html onPlayerFill → tpl.onPlayerFill
  AI 循环: tpl._scheduleAiMove → _aiMove → _ai.think()
  AI 落子: tpl._tpl.onAIFill → three-point-line-manager
  结算: tpl._finish → game.html onBattleEnd
```

### legacy（BattleManager 兼容层，生产不再走）
```
仅测试/脚本: scripts/duel-ai.mjs:101 new BattleManager → bm.start
  BattleManager._initAiPlayer:2844 new AIPlayerCore（legacy 也复用 AIPlayerCore）
  _scheduleAiMove:4276 → _aiMove:3696 → _aiMoveWithRater:3719 → think
  _applyAiMove:3754
```

### duel/test（双 AI / 测试）
```
duel-ai-tpl.mjs:197 playOnce → new ThreePointLineManager + new AIPlayerCore×2 + Director
  while(!tpl.isEnded()): setGameState / think / updateObserver …
duel-ai.mjs:93 playOnce → new BattleManager（阿妍）+ new AIPlayerCore(ying)
```

## 5. 相对旧审计结论的更正（以当前代码为准）

| 旧结论 | 当前事实 | 处理 |
|---|---|---|
| 单机主线不注入 `setGameState`/`updateObserver` | 生产已在 `_syncAiState`/`onPlayerFill` 注入，BattleContext 是活代码 | 已修复，不要重复修 |
| AI note 被 `_applyAiMove` 静默丢弃 | 四条路径均已正确处理 note | 已修复，不要重复修 |
| Director 「已激活」存疑 / 默认 shadow | 生产显式 `directorShadow:false`，导演为调制模式 | 已接通 |
| `_moveCount` 恒 0 导致笔记节流锁死 | production 靠落子后二次 `syncFromBoard` 自增，基本工作 | 仍建议 Phase 6 验证生命周期 |
| `BattleManager` 是主线 vs TPL 并存 | `BattleManager` 类生产不实例化，仅复用 `AIPlayerCore`+常量 | Phase 1 拆分时据此认定 |
| 六人格/动态难度整体失效 | 状态注入已通，策略/导演已接；但仍有一条缺口：`setHotspotPriority` 仅 legacy 调用，生产抢关键格分支不触发 | 留待 Phase 3/4 处理 |