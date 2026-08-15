# CM4 Learner Model Research — 玩家认知状态模型（第一版）

> 阶段状态：**LEARNER_MODEL_PROTOTYPE_READY**
> 声明：本原型不进入生产路径，不改变 LessonPlan / Hint / 推荐 / 难度。仅作为可观测研究参考，供离线回放验证。

> 目标：在 CM4 已知的"棋盘/技巧/提示/教学目标/战斗状态"之上，补一层轻量的"玩家到底会不会"。
> 原则：不是 AI 大模型，不推倒现有系统，只在已有事实之上做可解释推断。

## 1. 研究问题

当前链路：

```
Puzzle State → Hint → Player action
```

缺中间层：

```
Player mental state（玩家的技能掌握状态）
```

我们需要从已有遥测中推断：某个技巧对某个玩家，当前处于 unknown / exposed / guided / independent / mastered 的哪一档，以及是 struggling 还是 improving。

## 2. 现有地基（可复用，不重复造轮子）

- **TeachingSystem**（`expert/teaching-system.js`）已持久化每个技巧的 `{ encounterCount, masteryLevel, firstEncounteredAt, lastEncounteredAt, correctCount }`，并有 `recordEncounter(technique, usedCorrectly)`、`getHintLevel`、`getLearnedTechniques`。这是 Skill State 的天然底座。
- **LessonPlayer 遥测**（`_lessonEvents` / `_recordLessonEvent`）已产生类型化事件：`phase / bubble / guided / fail / reveal / watch / technique_taught / guided_l1_direction / guided_l2_technique / semiAuto_hint`，每条带 `ts + phase + cell/wrongNum/attempts/level/technique`。
- **HintSystem** 已有 `hintCount`、`lastHintTime`、按技巧的提示历史。
- **DataStore / localStorage** 已提供持久化与四类分类存储。

结论：Learner Model 的关键输入大多已经存在，缺的是"把事件聚合成玩家技能状态"这一层。

## 3. 轻量 Learner Model 设计

### 3.1 Skill State（技能状态）

每个技巧 `t` 的状态机：

```
unknown → exposed → guided → independent → mastered
                         ↘ struggling（反复错/高提示比）
                         ↗ improving（近期成功率上升）
```

判定规则（可解释、可调参）：

- `unknown`：`TeachingSystem` 无该技巧记录。
- `exposed`：`encounterCount ≥ 1`，但尚无一次"独立正确"。
- `guided`：需要在 L2/L3 提示或 guided 阶段才完成正确落子。
- `independent`：至少一次"无提示、无引导"的正确使用该技巧。
- `mastered`：`independent` 且近期连续稳定正确、且经遗忘曲线后仍高于阈值。

动态标签：

- `struggling`：近期错误数/尝试数偏高，或同类错误重复。
- `improving`：近期成功率单调上升。

### 3.2 输入（证据）

| 输入 | 来源 | 含义 |
|---|---|---|
| 使用提示次数 | HintSystem + lesson `semiAuto_hint` 事件 | 依赖度 |
| 完成时间 | 关卡起止时间戳 | 熟练度/卡顿 |
| 错误类型 | lesson `fail` 事件的 wrongNum/attempts | 常见错误 |
| 是否重复犯错 | 同一 cell/technique 的连续 fail | struggling |
| 是否主动使用技巧 | `technique_taught` / 无提示正确落子 | independent |

### 3.3 输出（置信）

不输出布尔，输出置信：

```
hiddenPair.confidence = 0.72
hiddenPair.state = guided
hiddenPair.trend = improving
```

`confidence` 是"当前定位为该档的可信度"，由样本量与近期一致度共同决定，避免小样本地板效应。

## 4. 三块具体研究

### A. 技能掌握推断

把上述输入映射到状态机，产出每个技巧的 `state + confidence`。第一版用规则打分（不用 ML）：

```
skill_score(t) =
  w1 * independent_correct_ratio
+ w2 * (1 - hint_ratio)
- w3 * repeated_error_penalty
```

再映射到状态带。这样每一步都可解释、可调参。

### B. Forgetting Curve

```
mastery(t) = recent_success_history * time_decay
```

用轻量指数衰减：

```
mastery(now) = Σ success_i * e^{ -λ (now - t_i) }
```

`λ` 为遗忘速率（可先取保守值，随后由实验平台校准）。短期高频正确 → 高 mastery；长期未练 → 衰减回落，驱动复测/推荐。

### C. 下一关推荐

从"下一关是什么"升级到"下一关为什么适合这个玩家"：

```
Recommendation = argmin_{level} (distance(skill_state, level_demand) + novelty)
```

输出带理由：例如"该关主考 hiddenPair，你当前 hiddenPair=guided，且已 3 天未练，适合巩固"。

## 5. 三层架构

1. **LearnerState Engine**：消费原始事件 → 更新技能状态/趋势。纯函数、可重放。
2. **Skill Mastery Tracker**：维护 `mastery(t)` 遗忘曲线与持久化。
3. **Recommendation Policy**：技能状态 → 关卡/难度/提示强度建议。

与 LessonPlan / Hint / Goal 的契合：LessonPlan 决定"教什么"，Hint 决定"当下怎么提示"，Learner Model 决定"这个玩家此刻需要什么强度与下一步"。

## 6. 最小实现范围（第一版）

- 新增 `core/learner-model.js`：`observe(event)`、`skillState(technique)`、`mastery(technique, now)`、`recommend(levels)`。
- 只读消费现有 `TeachingSystem` 状态与 `LessonPlayer` 遥测事件，不接 UI 自动改行为。
- 持久化用 DataStore，键 `learner_model_v1`。
- 不进入 solver、不改 hint 分层；先作为可观测层落地产出。

## 7. 验证与度量

- 用现有教学遥测回放，看状态机是否与"逐关技巧弧线"一致。
- 推荐结果与玩家真实表现做离线对照（后续由 Experiment Platform 验证）。
- 目标不是"预测准确率 100%"，而是推荐理由可解释、可被 A/B 证明优于"固定下一关"。

## 8. 风险与边界

- 事件样本在首见关很少，避免过早下 `mastered` 结论（用 confidence 下界）。
- 不把游戏内干预和 Learner Model 耦合；先观测、后决策。
- 遗忘曲线参数必须由实验平台校准，第一版只给可解释初值，不声称精确。