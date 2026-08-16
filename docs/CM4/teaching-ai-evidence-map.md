# Teaching AI Evidence Map

> 把 simulator 的教学信号映射到 CM4 已存在的真实信号（`learner-event-schema.md` / `learner-event-taxonomy.md`）。

## Simulator 教学动作 → 真实信号

| Simulator 动作 | 真实信号（source） | LearnerEvent type |
|---|---|---|
| `show_optimal` / `show_trajectory` / `demo` | LessonPlayer `guided_l2_technique` / `technique_taught`（neutral） | `encounter` |
| `guided_question` / `hint_step` / `ease_hint` | LessonPlayer `guided_success`（success，hintLevel=L2+） | `correct`(independent=false) |
| `reveal` | LessonPlayer `reveal`（neutral） | `hint` |
| `surface_mistake` / `detect_mistake` | LessonPlayer `fail`（error）/ Puzzle `mistake` | `error` |
| `pose_challenge` / `probe_weakness` / `edge_case` | TeachingSystem `technique_encounter` + Puzzle `attempt`/`mistake` | `encounter` / `error` |

## Simulator 期望效果 → 真实 skill evidence

| Simulator 期望 | 真实 skill evidence（taxonomy §3） |
|---|---|
| mastery 上升 | `independent_success`（无提示正确） |
| hint 依赖/不上升（reveal） | `hint_dependence`（hint 请求/揭示比例） |
| frustration 上升（challenge/连续失败） | `struggle`（fail/mistakes 高） |
| 恢复（guided on struggling） | `guided_success` 后转 `skill_used_correctly` |

## 尚无可观测信号的缺口（诚实标注）

- simulator 的 `engagementSignal` 无对应真实埋点（CM4 现有事件不含 engagement）；不应声明已对齐。
- `personality → learning_gain` 无真实证据（现有 learner 事件不记录 personality）；标 Unknown。

## 约束

- 不新增埋点；只用 taxonomy 已登记的信号。
- `hint_followed`/`hint_ignored` 是派生信号，未可靠持久化，离线回放用合成样本代替。