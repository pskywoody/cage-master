# CM4 Learner Event Schema

> 把已有学习信号统一成研究事件流。只读，不创造事实，不接生产教学。

## 1. 统一事件形状

```json
{
  "eventId": "string（唯一）",
  "timestamp": 0,
  "source": "TeachingSystem | LessonPlayer | HintSystem | Puzzle",
  "sessionId": "string",
  "technique": "string|null",
  "action": "string",
  "outcome": "success|error|neutral|null",
  "metadata": {}
}
```

## 2. Source → action 映射（只使用已有来源）

### TeachingSystem

| 原始信号 | action | outcome | technique |
|---|---|---|---|
| recordEncounter(tech) 首见 | `skill_encounter` | neutral | tech |
| recordEncounter(tech,true) | `skill_used_correctly` | success | tech |
| masteryLevel 达标 | `skill_mastery` | success | tech |

### LessonPlayer

| 原始信号 | action | outcome | technique（来源） |
|---|---|---|---|
| `guided_l1_direction`/`guided_l2_technique` | `guided_start` | neutral | metadata.technique |
| 成功落子（guided） | `guided_success` | success | metadata.technique |
| `fail` | `fail` | error | metadata.technique |
| `reveal` | `reveal` | neutral | metadata.technique |
| `technique_taught` | `technique_taught` | neutral | technique |
| 跳过教学 | `lesson_skip` | neutral | metadata.technique |

### HintSystem

| 原始信号 | action | outcome | technique |
|---|---|---|---|
| getHint() | `hint_requested` | neutral | hint.technique |
| getHint() 返回 hintLevel | `hint_level` | neutral | hint.technique（metadata.hintLevel） |
| 提示后目标格正确落子 | `hint_followed` | success | hint.technique |
| 提示后未在窗口内正确落子 | `hint_ignored` | neutral | hint.technique |

### Puzzle

| 原始信号 | action | outcome | technique |
|---|---|---|---|
| 关卡完成 | `solve_complete` | success | null（metadata.levelId,duration） |
| 填错（pathMoves !correct） | `mistake` | error | null（metadata.cell） |
| 尝试（attempts） | `attempt` | neutral | null |
| 完成耗时 | `duration` | neutral | null（metadata.ms） |

## 3. LearnerEvent → LearnerModel.observe 映射

| action | LearnerModel type | 附加 |
|---|---|---|
| `skill_encounter` | `encounter` | — |
| `skill_used_correctly` | `correct` | independent=true |
| `skill_mastery` | `correct` | independent=true |
| `guided_success` | `correct` | independent=false，hintLevel=metadata.hintLevel |
| `fail` | `error` | — |
| `reveal` | `hint` | hintLevel=metadata.hintLevel |
| `technique_taught` | `encounter` | — |
| `hint_requested` | `hint` | — |
| `hint_level` | `hint` | hintLevel=metadata.hintLevel |
| `hint_followed` | `correct` | independent=false |
| `mistake` | `error` | — |
| `solve_complete` | — | 跳过（无技巧粒度） |

## 4. 约束

- 不新增埋点；`hint_followed`/`hint_ignored` 属派生信号，需结合玩家落子与提示窗口计算，未可靠持久化前标记为派生。
- `source` 只取四个已知来源；不伪造事件。