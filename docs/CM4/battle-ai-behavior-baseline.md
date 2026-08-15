# Battle AI 行为基线（Phase 0 冻结）

> 状态：**BATTLE_AI_BEHAVIOR_BASELINE** · 日期：2026-08-16
> 方法：运行现有 `scripts/duel-ai-tpl.mjs`（生产 TPL 双 AI 驱动），未修改任何代码。
> 关联：`docs/CM4/battle-ai-current-runtime-map.md`

## 1. 基线产物（冻结）

| 文件 | 说明 | sha256 前 16 |
|---|---|---|
| `data/battle-ai-baseline/duel-tpl-109x8-directorActive.json` | 8 局 · `--directorActive`（=生产 directorShadow:false，导演激活）汇总 | `a57fce06b89020d7` |
| `data/battle-ai-baseline/duel-tpl-109x1-trace.txt` | 1 局 · 逐事件 trace（可观测行为序列） | `a176767722254b0a` |
| `data/battle-ai-baseline/duel-tpl-109x8.json` | 8 局 · 默认（导演未激活）对照 | `3df12254eb508f57` |

## 2. 代表值（`--directorActive`，8 局，player=ying vs boss=yan）

- 胜负：player 4 / boss 4 / draw 0
- 胜负路径：three_point_line 1 / full_board 7 / force_settle 0
- 填数：player 70 填 70 对（100%）notes 13 fakeNotes 2；boss 68 填 68 对（100%）notes 12 fakeNotes 1
- thinkNull：boss `noCandidates` 5（其余 0）
- 关键事件：cell_occupied 138、cell_error 28、ghost_appeared 27、cell_steal_success 21、hub_dim_occupied 53、hub_occupied 11、line_ready 8
- 戏剧指标：climaxDensity 0.63、decisiveEventsPerRound 2.5、threatReadability player 0.378 / boss 0.625
- 状态：avgOwned player 8.5 / boss 8.5；avgHubs player 1.4 / boss 0.0
- **策略激活**：player `enabled=true / activations=111 / fallbacks=0`；boss `enabled=true / activations=86 / fallbacks=0`

## 3. 覆盖与缺口

已覆盖：双 AI 对局、AI 决策产生的可观测事件序列、notes/fakeNotes/mistakes（cell_error）、score/归属转移（perRound + avgOwned）、状态转移（hub_revealed/occupied/dim、line_ready、game_end）、战略激活聚合（activations/fallbacks）。

缺口（留待 Phase 12/13 的专门 E2E/personality 测试补齐）：**逐回合 strategy identity 序列**与**每步 TechRater technique**。现有 duel harness 只输出聚合 strategicActivation 与事件，不输出每步「这是哪个策略 / 哪个技巧」；要捕获这两项需要给 `AIPlayerCore` / duel harness 加轻量记录（属后续阶段测试基建，不在 Phase 0 做）。

## 4. 冻结用途

本基线是 Phase 1（纯结构拆分）起的回归对照：拆分后重跑相同命令，摘要字段与 sha256 必须一致（`generatedAt`/时间戳类字段除外时以字段级 diff 为准）。