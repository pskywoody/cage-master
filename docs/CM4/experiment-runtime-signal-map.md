# CM4 Experiment Runtime Signal Map

> 只记录已有信号 → 实验事件映射。不创造信号，只做镜像。

| Source | Existing Signal | Experiment Event |
|---|---|---|
| LessonPlayer | `technique_taught` | exposure |
| LessonPlayer | `guided_start` | exposure |
| LessonPlayer | `guided_success` | behavior |
| LessonPlayer | `fail` | behavior |
| LessonPlayer | `reveal` | intervention |
| LessonPlayer | `semiAuto_hint` | intervention |
| TeachingSystem | `recordEncounter(tech)` | exposure (`skill_encounter`) |
| TeachingSystem | `recordEncounter(tech,true)` | outcome (`skill_used_correctly`) |
| TeachingSystem | mastery 达标 | outcome (`skill_mastery`) |
| HintSystem | `getHint()` hintLevel | intervention (`hint_request`) |
| Puzzle runtime | `_aiRecord.moves/pathMoves` | behavior (`mistake`/`solve_step`) |
| Puzzle runtime | `startedAt/completedAt` | outcome (`solve_time`) |
| Battle AI trace | `decisions.jsonl` (personality/state/strategy/technique) | behavior (`battle_decision`) |

## 分类

- **exposure**：玩家/系统是否暴露于某教学/变体。对应 `lesson_started / skill_encounter / technique_taught / experiment_exposed`。
- **behavior**：实际交互。对应 `guided_success / fail / mistake / attempt / solve_step / battle_decision`。
- **intervention**：外部介入。对应 `hint_request / hint_level / reveal / semiAuto_hint`。
- **outcome**：结果。对应 `solve_success / lesson_complete / solve_time / skill_mastery`。

## 已有数据资产

- `samples/learner-events-sample.jsonl`：Learner 事件样例（可 replay）。
- `data/battle-ai-traces/decisions.jsonl` + `summary.json`：Battle AI 受控探针决策轨迹（`production_logic_changed:false`）。

## 不可创造

本表只登记已存在字段；`hint_followed / hint_ignored` 等派生信号未可靠持久化，不在此登记为非已有信号。