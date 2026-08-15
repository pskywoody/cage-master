# Teaching Demo Effectiveness Report

> 48 教学关自动 demo 覆盖率评估（TeachingDemoResolver v1 实测）。

## 结果总览

| 状态 | 数量 | 关 |
|---|---|---|
| target 技巧可自动演示 | 35 | 见下表 |
| 综合关（无单一目标技巧，保留手写） | 11 | 109/306/307/406/505/506/603/604/605/606/706 |
| 延迟结构（开局不可用，保留手写） | 2 | 404 nakedTriplet、704 xWing |

非综合关的自动演示成功率 = 35 / 37 = 94.6%。

## 48 关明细

```
101 nakedSingle     N  证据✓
102 nakedSingle     N  证据✓
103 cageUnique      N  证据✓
104 nakedSingle     N  证据✓
105 cageUnique      N  证据✓
106 hiddenSingle    N  证据✓
107 cageUnique      N  证据✓
108 rule45          N  证据✓
109 composite       Y  no_target_technique
201 rule45          N  证据✓
202 rule45          N  证据✓
203 rule45          N  证据✓
204 rule45          N  证据✓
205 rule45          N  证据✓
206 rule45          N  证据✓
207 rule45          N  证据✓
208 rule45          N  证据✓
301 pointingClaiming N  证据✓
302 pointingClaiming N  证据✓
303 pointingClaiming N  证据✓
304 rule45          N  证据✓
305 nakedPair       N  证据✓
306 composite       Y  no_target_technique
307 composite       Y  no_target_technique
401 nakedSingle     N  证据✓
402 hiddenSingle    N  证据✓
403 hiddenPair      N  证据✓
404 nakedTriplet    Y  technique_unavailable
405 cageUnique      N  证据✓
406 composite       Y  no_target_technique
501 cageUnique      N  证据✓
502 cageUnique      N  证据✓
503 cageUnique      N  证据✓
504 rule45          N  证据✓
505 composite       Y  no_target_technique
506 composite       Y  no_target_technique
601 cageUnique      N  证据✓
602 cageUnique      N  证据✓
603 composite       Y  no_target_technique
604 composite       Y  no_target_technique
605 composite       Y  no_target_technique
606 composite       Y  no_target_technique
701 nakedPair       N  证据✓
702 hiddenPair      N  证据✓
703 nakedTriplet    N  证据✓
704 xWing           Y  technique_unavailable
705 swordfish       N  证据✓
706 composite       Y  no_target_technique
```

## 十个关键问题的回答

1. **preferredTechnique 为什么被 nakedSingle 抢走？** HintSystem 用"无目标技巧解不出 → 目标技巧才必要"作判定；大多数教学高阶技巧并非解题唯一路径，被判定"非必要"后走了 `findNextStep()`（最低技巧=nakedSingle）。

2. **新 necessity model 如何解决？** 新增 `TeachingDemoResolver`（`resolveTeachingDemo`），直接调用 `TechRater.findTechniqueCandidates(technique)` 问"目标技巧当前是否可用"，不经过 findNextStep 的最低技巧排序。

3. **solver 与 teaching selection 如何解耦？** 新增 `TechRater.findTechniqueCandidates`（只读暴露既有 `_findAllByTechnique`）与 `HintSystem.getDeductionFor`（从指定技巧的候选构建 deduction），教学选择只消费这些真实事实。

4. **48 关多少可自动演示？** 35 关。

5. **fallback 有多少？** 13 关（11 综合关 + 2 延迟结构）。

6. **fallback 主要原因？** ① 综合关无单一目标技巧（composite）；② 三子法/X-Wing 是"延迟结构"，开局盘面该技巧尚未浮现。

7. **evidence completeness？** 35 个成功关全部拿到真实 TechRater evidence（eliminated/reasons/scope）。

8. **哪些仍需手写？** 11 个 composite 综合关 + 404/704 两个延迟结构关。

9. **红叉是否基于真实 evidence 自动生成？** 是——复用 `hint-adapter.convert` 的 eliminate 路径；无 elimination 的技巧不造假红叉。

10. **lessonPlan 哪些可变薄？** 35 个可自动演示关的 demo 可逐步变薄；intro/successText 等叙事与 13 个手写关继续保留。

## 结论状态

`TEACHING_DEMO_PARTIALLY_READY`

- 生产实现已落地：`TechRater.findTechniqueCandidates` + `HintSystem.getDeductionFor` + `resolveTeachingDemo`；`buildLessonDemoSteps` 已改走 resolver（不再是旧 preferredTechnique 逻辑）。
- `demo.auto` 尚未全局开启（按策略先评估、再决定 AUTO_SAFE / AUTO_WITH_AUTHOR_TEXT / KEEP_HAND_AUTHORED）。