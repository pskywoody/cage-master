# Boss 战调参结果（基于 scan.mjs 参数扫描）

> 生成于 2026-08-09。扫描器已修复并跑通当前代码（1600 局模拟，level=109，player=average）。

## 一、扫描器修复（重要）

`scripts/scan.mjs` 在**当前代码下原本会崩溃**：
- 崩溃点：`playOnce` 的 AI 回合 `bm.playerOwned[step.row][step.col]`，`step.row` 为 `undefined`。
- 根因：`AIPlayerCore.think()` 现会返回笔记操作 `{type:'note', r, c, ...}`（新增的"写笔记"特性），而旧版扫描器只认 `{row, col}` 的填数 step。即代码"还在改"导致扫描器脱节。
- 修复：在 `scan.mjs` 玩家/AI 两个分支里跳过 `type==='note'` 的 step（模拟中不计填数）。现已可正常跑完。

## 二、全局最优格（当前代码）

| 扫描轴 | 最优值 | FunScore |
|---|---|---|
| cooldown（拦截冷却，回合制） | **1** | tempo 95 |
| siegeMs（围攻时长） | **5000** | risk 80 |
| focusGain（专注增益） | **5** | climax 100 |
| | | **total = 91** |

> 旧 data.js（2026-08-04）同格为 total 89；当前代码 risk 升至 80、climax 满 100。

## 三、甜区带符合度：4/7，无全落带内格

| 指标 | 最优格实测 | 甜区带 | 状态 |
|---|---|---|---|
| interceptRate（AI 围攻频率） | 18.8% | 20–30% | 🔴 略低 |
| parryRate（玩家反制围攻） | 71.7% | 40–60% | 🔴 偏高（Boss 围攻太好反制） |
| stealRate（Boss 抢格成功率） | 89.8% | 60–80% | 🔴 偏高（抢太狠） |
| hotPotato（易手率） | 45 | 30–60 | 🟢 |
| deathblowRoundsPct（忍杀触发局占比） | 100% | 80–100% | 🟢 |
| deathblowComplete（忍杀完成度） | 64.7 | 50–80 | 🟢 |
| winMargin（胜方领先） | 6.9 | 3–8 | 🟢 |

**结论**：三维扫描只能把 tempo/risk/climax 拉满，**但 intercept/parry/steal 三项是从 AI 行为涌现的，不在被扫三维内**，所以没有任何一格能做到 7 项全落带内。要补这三项必须调 AI 人格旋钮（见第四节）。

## 四、写回 BOSS_CONFIGS / PERSONALITIES 的改动

### 4.1 三维扫描轴 → 配置映射（已落地）

| 扫描轴 | 映射到 | 改动 |
|---|---|---|
| COOLDOWNS=1（越低越好） | `BOSS_CONFIGS[*].battleTuning.interceptCooldown` | Ch1/Ch2 由 `8000` → `3000`（其余章本就用默认 3000） |
| FOCUS_GAINS=5 | `BOSS_CONFIGS[*].battleTuning.focusGain` | 七章全部新增 `focusGain: 5` |
| FOCUS_GAINS=5（接线） | `BattleManager` 读取 | `baseGain` 改为 `options.focusGain ?? opponent.battleTuning.focusGain ?? 3` |
| SIEGE_MS=5000 | `AI_PERSONALITIES[*].siegeTime` | mentor 6000→5000、prober 7000→5000、expert 8000→5000、steady/surround 补 5000（blind 本就 5000） |

> ⚠️ 单位/语境差异：`scan.mjs` 的 cooldown 是**回合制计数器**，而游戏内 `interceptCooldown` 是**毫秒实时值**。扫描证明"越低越好"，但 `cd=1` 不能直接抄成 `1ms`。当前先统一降到 3000ms（内部默认值），精确毫秒数需按真实对局节奏再校准。

### 4.2 补三项没落带指标的保守人格微调（已落地）

| 人格 | 旋钮 | 改动 | 目的 |
|---|---|---|---|
| blind（莹莹） | interceptProbability | 0.15 → 0.25 | 抬 AI 主动围攻频率 |
| mentor（守笼人） | interceptProbability | 0.25 → 0.35 | 同上 |
| prober（沈墨） | interceptProbability | 0.2 → 0.3 | 同上 |
| surround（设局人系） | stealPriority / stealErrorRatePenalty | 0.8→0.55 / 0.1→0.2 | 压低抢格成功率 |
| expert（阿妍） | stealPriority / stealErrorRatePenalty | 0.7→0.55 / 0.05→0.15 | 压低抢格成功率 |

新鲜矩阵已可见 `stealRate` 从 92.4% 降到 89.8%、`parryRate` 从 76.7% 降到 71.7%——方向正确。

## 五、必须知道的局限（避免误判）

1. **扫描只用 `yan/expert` 人格 + `average` 玩家**，不是真实各 Boss 人格（莹莹=blind、守笼人=mentor、设局人=surround…）。最优格是"该匹配"的结论，方向可推广，但数值需按真实人格复扫。
2. **intercept/parry/steal 三项扫描器扫不到**，只能靠 4.2 的人格旋钮手动补，且未经扫描验证。
3. **早期 Boss（莹莹/守笼人）是否也要 focusGain=5** 值得商榷——教学章可能想降低忍杀频率保节奏，建议 Ch1/Ch2 用 `focusGain: 3`。

## 六、建议的下一步

- **按章复扫**：改造 `scan.mjs`，把硬编码的 `opponent.id='yan'` 换成真实 Boss id（莹莹/守笼人/设局人…），并对 `interceptProbability`/`stealPriority` 也加扫描轴，才能真正确认"全落带内"的可达参数。
- **真实对局校准**：把 `interceptCooldown` 的 3000ms 按真人对局节奏微调（太低会变"每帧拦截"的骚扰）。
- `scripts/_find_optimal.cjs` 可复用：对任意矩阵 JSON 输出最优格与甜区带符合度。
