# CM4 Experiment Event Schema（方向 7 最小版）

> 不是完整实验平台；只定义统一事件口径，让后续 Hint A/B、Demo auto pilot、Learner Model 校准、AI Coach 实验都能挂到同一条日志上。

## 1. 最小事件形状

```json
{
  "experiment": "string（实验 id）",
  "variant": "string（分组/变体）",
  "event": "string（事件名）",
  "metric": "string（指标名，可空）",
  "timestamp": 0,
  "user": "string|null",
  "session": "string|null",
  "value": 0
}
```

## 2. 字段语义

| 字段 | 说明 |
|---|---|
| experiment | 实验唯一 id（如 `hint_policy_v1`） |
| variant | 变体名（如 `control`/`l1_first`） |
| event | 发生的行为事件（如 `lesson_demo_completed`） |
| metric | 本次事件对应的指标（可空，事件自行携带 value） |
| timestamp | epoch ms |
| user / session | 去标识身份（null 表示匿名） |
| value | 数值型结果（完成 1/0、耗时 ms、mastery 等） |

## 3. 复用统一 Learner Event

实验事件可与 `Learner Event`（见 `learner-event-schema.md`）联动：一条 learner event 在实验语境下只需增加 `experiment + variant`，其余字段不变。这样 Learner Model、Hint A/B、Demo pilot 共用同一条事实流。

## 4. 当前只做口径，不做工程

现在只定义 schema，不在生产写入；未来接 Experiment Platform 时，再决定存储与分流（DataStore / 独立 JSONL / 后端）。