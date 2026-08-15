# CM4 Learner Event Taxonomy

> 把 CM4 现有真实信号映射为「Learner Event → Skill Evidence → Learner State」。
> 本清单只登记已存在的信号，不新增埋点。

## 1. 现有真实信号源

| 源 | 信号 | 位置 |
|---|---|---|
| TeachingSystem | encounterCount / masteryLevel / correctCount / lastEncounteredAt | `expert/teaching-system.js` |
| LessonPlayer | `_recordLessonEvent` 事件流 | `core/lesson-player.js` |
| HintSystem | `hintCount`、`getHint()` 的 hintLevel/technique | `expert/hint-system.js` |
| Puzzle/AI record | `startedAt / completedAt / moves / pathMoves` | `ui/main.js` `_aiRecord` |

## 2. Learner Event 词汇表

### 2.1 TeachingSystem 导出的底层事件

| Learner Event | 触发 | 语义 |
|---|---|---|
| `technique_first_seen` | `recordEncounter(tech)` 首次 | 首次接触某技巧 |
| `technique_encounter` | 之后每次 `recordEncounter` | 再次遇到 |
| `technique_used_correctly` | `recordEncounter(tech, true)` | 正确使用该技巧 |
| `technique_mastered` | masteryLevel 达阈值 | 熟练（由 TeachingSystem 内部判定） |

### 2.2 LessonPlayer 已记录事件（`_recordLessonEvent` type）

| Learner 映射 | 原文 type | 关键载荷 |
|---|---|---|
| `guided_start` | `guided_l1_direction` / `guided_l2_technique` | text, phase |
| `guided_prompt` | `guided` | cell, value, hintText, interactionType |
| `guided_success` | 成功路径 `guided` / `watch` correct | cell, num, correct |
| `fail` | `fail` | cell, wrongNum, attempts, maxAttempts, autoReveal |
| `reveal` | `reveal` | interactionType, autoReveal |
| `skip` | `onSkip` → phase 'free' | （由 phase 事件推断） |
| `hint_timeout` | `timeout_hint` | cell, text |
| `technique_taught` | `technique_taught` | technique（guided 成功完成时） |

### 2.3 HintSystem

| Learner 映射 | 触发 | 语义 |
|---|---|---|
| `hint_requested` | `getHint()` hintCount++ | 请求了提示 |
| `hint_level_used` | 返回的 hintLevel | L1/L2/L3 揭示深度 |
| `hint_technique` | 返回的 technique | 提示命中的技巧 |
| `hint_followed` | 提示后目标格正确落子 | 派生信号：提示被采纳 |
| `hint_ignored` | 提示后未在窗口内正确落子 | 派生信号：提示未采纳 |

### 2.4 Puzzle（解题事实）

| Learner 映射 | 来源 | 语义 |
|---|---|---|
| `solve_time` | `completedAt - startedAt` | 完成耗时 |
| `mistakes` | `pathMoves` 中 !correct 计数 | 错误次数 |
| `attempts` | `_guidedAttempts` / ai-record attempts | 尝试次数 |
| `level_completed` | `completedAt` 落值 | 关卡完成 |

## 3. Learner Event → Skill Evidence

| Skill Evidence | 计算来源 |
|---|---|
| `exposure` | `technique_first_seen` ∪ `technique_encounter` |
| `hint_dependence` | `hint_requested` / `hint_level_used` 相对正确次数的比例 |
| `independent_success` | `technique_used_correctly` 且无 `guided_prompt`/L2+ 提示 |
| `struggle` | `fail`/`mistakes` 高、或同 cell/technique 连续 `fail` |
| `recency` | `solve_time`/`lastEncounteredAt` 距 now 的距离 |

## 4. Skill Evidence → Learner State（LearnerModel 映射）

```
exposure        → unknown / exposed
hint_dependence → guided
independent_    → independent / mastered
struggle        → struggling
recency decay   → mastery(t) 回落
```

状态定义见 `learner-model-research.md` 3.1。

## 5. 归一化事件形状（供 LearnerModel.observe）

```
LearnerEvent = {
  ts: number,
  technique: string,
  type: 'encounter' | 'correct' | 'hint' | 'error',
  independent?: boolean,
  hintLevel?: number
}
```

映射规则：

- `technique_first_seen` / `technique_encounter` → `encounter`
- `technique_used_correctly` → `correct`（independent=true）
- `guided_success`(带 L2+) → `correct`（independent=false, hintLevel）
- `fail` / `mistakes` → `error`
- `hint_requested` → `hint`

## 6. 尚未直连的缺口

- `hint_followed` / `hint_ignored` 是派生信号，需在 HintSystem 返回后与玩家落子结合才能可靠计算；当前未持久化，离线回放用合成样本代替。
- LessonPlayer `_lessonEvents` 目前只存内存，未落盘持久化；离线回放以合成序列 + 真实字段名建模。