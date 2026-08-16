# Teaching AI Outcome Model（Phase 5）

> 目的：把 learner outcome 从单一 `mastery_gain` 拆成四维，避免 reward 结构把 policy 差异压平。
> 全部在影子评估层计算（不改正式 `teaching-learner-simulator.js`），标 SIMULATED_ONLY。

## 四维 outcome

### 1. Recovery（恢复）
- 定义：从 `struggling/novice` 首次到 `guided` 及以上所需的 episode 数。
- 计算：`recovery_episode = 首次 level>=guided 的 episode`；越早越好。

### 2. Hint Dependency（提示依赖）
- 指标：`hint_dependency = hint 类动作数 / 总 episode`。
- `reveal_ratio = reveal 动作数 / 总 episode`。
- `independent_completion_rate = 独立(挑战类)成功数 / 总成功数`（无提示独立完成比例）。
- 来源：action 类型（demo/guided/reveal/challenge）历史，非 mastery level。

### 3. Transfer（迁移）
- 影子定义（SIMULATED_ONLY）：
  `transfer_index = 0.6 * clamp(finalLevel/4) + 0.4 * clamp(独立成功数/episode)`。
- 含义：既看掌握等级，也看「独立练习」占比——被一路提示喂到 guided 的人迁移更差。

### 4. Retention（保留）
- 影子定义（SIMULATED_ONLY）：`retention_index = transfer_index * (finalLevel>=independent ? 0.9 : 0.7)`。
- 含义：独立/熟练等级保留更高，guided 以下衰减更快。

## 为什么这样拆

Phase 4.5 证明 mastery_gain 会被 demo/guided 同为 +1 的 reward 压平。四维 outcome 里，`recovery / hint_dependency / transfer / retention` 直接来自 action 历史与独立性，因此比单看 mastery 更能区分「被提示带会」vs「独立掌握」。