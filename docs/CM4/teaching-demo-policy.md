# Teaching Demo Policy

> 教学 demo 必要性的判定与回退策略。核心原则：solver 事实与教学选择解耦，绝不伪造，绝不改 solver 优先级。

## 1. TeachingTechniqueRequirement（四态）

对每个教学关，目标技巧 t 相对当前盘面只可能处于以下状态之一：

- **AVAILABLE** — t 在当前盘面有真实候选（TechRater.findTechniqueCandidates(t) 非空），可以合法应用。
- **EVIDENCED** — t 不仅有候选，且能产生完整、可解释的教学证据（targetCells / eliminated / reasons / scopeType）。
- **NECESSARY** — 在当前教学目标下 t 是"应该演示"的目标（由 LessonPlan 声明，而非数学唯一解）。
- **BLOCKED** — t 在当前盘面不可应用（延迟结构尚未浮现，或该关本就无此结构）。

判定只用前两者做依据；`NECESSARY` 是 LessonPlan 的声明，不是 solver 结论；`BLOCKED` 触发可解释回退。

## 2. 解耦

```
solver:       TechRater 提供真实候选与评分（不改）
teaching:     TeachingDemoResolver 只做"选择与回退"
```

禁止：硬编码某关返回某技巧、跳过 solver、改 TechRater 优先级/评分、把 preferredTechnique 伪装成 solver 结论、伪造 evidence。

## 3. TeachingDemoResolver（生产实现）

实现于 `core/lesson-demo-builder.js` 的 `resolveTeachingDemo({ engine, levelData })`：

1. 读 `lessonPlan.technique` 与 `guied.targetCell`。
2. `HintSystem.getDeductionFor(t, targetCell)` 直接问 TechRater t 是否可用（不走 findNextStep）。
3. 可用 → 用 `hint-adapter.convert` 生成 demo 动作（与 hint 同源证据）。
4. 不可用 → 返回明确 fallback reason，`buildLessonDemoSteps` 回退手写 demo。

## 4. Fallback hierarchy

1. target technique + complete evidence → 选中该技巧。
2. target technique + partial evidence → 仍选该技巧（缺失由手写兜底）。
3. pedagogically compatible technique → 暂不实现，保留给后续需要的手写替代。
4. ordinary hint technique → 不回填教学 demo（避免再次 nakedSingle 抢教学）。
5. no auto demo → 回退 LessonPlan 手写 demo.steps。

fallback 必须可解释：`resolveTeachingDemo` 返回 `fallbackReason` ∈ `no_target_technique | technique_unavailable | no_board_or_solution | error`。

## 5. 证据链一等公民

demo 复用与 hint 同一条事实链：

```
TechRater → (TechRater.findTechniqueCandidates) → HintSystem.getDeductionFor → HintAdapter.convert → lessonPlayer
```

不新建 evidence builder。无 elimination 的技巧（如纯 cageUnique 单格笼）不强行画红叉。