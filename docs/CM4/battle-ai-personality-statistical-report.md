# Battle AI 人格统计报告（CM4 Personality Statistical Evaluation）

> 状态：**BATTLE_AI_PERSONALITY_VALIDATED**
> 证据：`data/battle-ai-personality-evaluation/`（`decisions.jsonl` + `summary.json`）

## Experiment Setup

- 人格：`blind / expert / mentor / prober / average / reckless`（6）
- 场景：`balanced`（平衡）/ `losing`（落后）/ `leading`（领先）（3）
- 次数：每 cell `50` runs → **N = 6 × 3 × 50 = 900 decisions**
- Board：固定 level-109；Scenario 以注入 state 定义；每 run 全新 board + 全新 AI（Director 激活）
- 只读：未改 AI_PERSONALITIES / StrategySelector / Director / TechRater / 规则 / 胜率 / mistake 模型

## Observations（personality 行为特征）

- **blind**：高风险试探——`guess` 40（26.7%）+ `misread` 4；技术仅 `nakedSingle/guess/misread`；intent 偏 `test_player_response/contest_hub`。
- **expert**：高技巧发现——`pointingClaiming` 95（63%）+ `nakedPair` 8；**无** guess/misread；`contest_hub` 最高。
- **mentor**：纯 `nakedSingle`（112），无 guess/misread；note 中等。
- **prober**：唯一诱导者——`bait_player` 51（34%）；note 最低（21）；全 `nakedSingle`。
- **average**：`nakedSingle` 99 + 少量 `misread/guess`；note 46。
- **reckless**：`nakedSingle` 114 + note 36；本样本无 guess/misread（鲁莽更多体现为 note/attack，未表现高 guess）。

## Statistical Result

| 维度 | χ² | df | Cramér's V | 判读 |
|---|---|---|---|---|
| actionClass（solve/guess/misread/note） | 240.96 | 15 | **0.299** | 显著，中等效应 |
| director intent | 284.65 | 20 | **0.281** | 显著，中等效应 |
| strategy（attack/defend/global/counter） | 4.41 | 5 | 0.070 | **不显著** |

（χ² 远大于 α=0.001 临界值，intent/action 层 p < 0.001；strategy 层低于 0.05 临界值，不显著。）

## 回答核心问题

**六人格是否产生稳定、可重复、可解释的行为差异？** → **是**（BATTLE_AI_PERSONALITY_VALIDATED）。

**差异发生在哪一层？**

- **action 层**：强（blind 的高 guess、expert 的高技巧发现、prober 的低 note + 高 bait、reckless 的 note 倾向）。
- **director intent 层**：强（prober 的 `bait_player`、expert 的 `contest_hub`、blind 的 `test_player_response`）。
- **strategy 层**：几乎无差异（所有人格 attack≈88–94%、defend≈6–12%）。

**是否达到统计显著？** → action 与 intent 达到；strategy 未达到。

## Limitations

- 不证明玩家体验更好、不证明某人格更强、不证明胜率优化（本实验仅为「行为分布是否可分」）。
- 单 Board（level-109）、单难度、6×6；结论对 6×6 Boss 场景成立，未覆盖 9×9 与多关卡。
- scenario 为注入 state 的受控采样，非完整对局；`reckless` 的「高 guess」人设在本样本未体现（可能是样本/调参差异，仅记录不修改）。

## 与 Phase 2 caveat 的呼应

Phase 2 发现「Strategy 层对历史连串敏感度低、Director intent/action 层敏感度高」；本统计进一步确认：**人格差异几乎全部集中在 Director intent + action 层，Strategy 层是近似同构的**。据此，若后续要讨论「如何让人格更立体」，优先级在 action 与 director intent 层，而非 strategy 层。