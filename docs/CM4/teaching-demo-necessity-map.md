# Teaching Demo Necessity Map

> Phase 0 只读梳理结果。不修改代码，只记录真实调用链与断点。

## 1. 真实调用链

```
lessonPlan.technique (关卡物化，48 关都有)
  ↓
buildLessonDemoSteps(engine, levelData)   [core/lesson-demo-builder.js]
  ↓ (旧实现)
new HintSystem(board, solution, { preferredTechnique })
  ↓
hintSystem.getHint() × 3 催到 L3
  ↓
HintSystem._findNextDeduction()
  ↓
preferredTechnique 逻辑
  ↓
TechRater.findNextStep()   ← 最低技巧优先
  ↓
hint-adapter.convert(hint) → actions
  ↓
lessonPlayer（demo 动画）
```

## 2. preferredTechnique 在哪里产生、被谁消费

- 产生：`game.html` 原来用 `poolMeta.technique`，之后 lessonPlan 物化了 `lessonPlan.technique`；`buildLessonDemoSteps` 把它作为 `preferredTechnique` 传给 HintSystem。
- 消费：`HintSystem._findNextDeduction()` 里的"教学目标技巧优先"分支。

## 3. 为什么它只是 preference，不是 teaching constraint

`_findNextDeduction` 的判定是：

```
用"无目标技巧的白名单" solve：
  如果解不出 → 目标技巧"必要" → 全量 solve 里找目标技巧步骤
  如果解得 出 → 目标技巧"非必要" → 走 findNextStep()（最低技巧）
```

即：只有目标技巧在数学上"没有它这题就解不出"时才展示它；否则被 nakedSingle 抢走。这是"数学必要性"判定，不是"教学必要性"判定——大多数教学关的高阶技巧（数对/隐曜/区块/星衡等）都不是解题唯一路径，因此普遍 fallback 到 nakedSingle。

## 4. auto demo 何时 fallback、fallback 后用什么

- fallback 时机：`_findNextDeduction` 判定目标技巧"非必要/不可用" → `techRater.findNextStep()`。
- fallback 结果：起始盘面几乎总是 `nakedSingle`。

## 5. 301/302/303 为什么已有完整 note + red-X evidence

因为这三关是手工按 `docs/教学动画显示规则-2026-08-15.md` 重排的（手写 showNote/strikeNote/concludeCell 步骤），不是 auto 生成。

## 6. 其余 47 关缺什么

缺"让 auto demo 选中目标技巧"的能力：旧 `preferredTechnique` 被 nakedSingle 抢走，auto demo 无法稳定产出目标技巧的证据链。

## 7. TechRater 现有能力

- `findNextStep()`：按 `techPriority` 取最低技巧的结果——只给一个。
- `_findAllByTechnique(techId)`：对指定技巧取全部候选（本任务新增了公开只读入口 `findTechniqueCandidates(techId)`）。
- 因此 TechRater 已能判断：某技巧**是否可用（有候选）**、**证据链内容**（`evidence` 含 eliminated/eliminatedCells/scopeType 等）、**使用后的 eliminations**。

## 8. 根因结论

`preferredTechnique` 被 nakedSingle 抢占的直接原因是：HintSystem 把"数学必要性"当成了"教学必要性"。解法不是改成 `requiredTechnique`，而是把 solver 的事实排序与教学演示选择解耦——新增 TeachingDemoResolver 直接问 TechRater"目标技巧当前是否可用"。