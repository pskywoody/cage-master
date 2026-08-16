# Teaching Demo Failure Taxonomy

> P1 的可解释失败分类。仅在 demo 生产链失败时记录，不为之自动伪造通过。

## F1 — NO_VALID_STEP

含义：Solver 找不到目标技巧的教学步骤（目标技巧在当前盘面无可演示候选）。

示例 fallbackReason：`technique_unavailable`（404 nakedTriplet、704 xWing）。

处置：fallback `manual`，保留手写 demo；不改 solver。

## F2 — UNRENDERABLE_TECHNIQUE

含义：技巧存在、resolver 选中，但动作/动画层无法表达（缺少 action 支持）。

处置：fallback `manual`，同时在动作层补能力（如 showNote/strikeNote）；本阶段不硬编码绕过。

## F3 — DEMO_TOO_COMPLEX

含义：生成步骤过长（超过阈值），教学价值下降。

处置：交由 `minimizeDemoSteps` 精简；仍过长则 `manual`。

## F4 — LOW_CONFIDENCE

含义：技巧可用但证据不完整，confidence 低于可发布阈值。

处置：`fallbackReason=LOW_CONFIDENCE`，标记 manual review；不强行 auto。

## F5 — MANUAL_CONFLICT

含义：auto 生成结果与人工 lessonPlan 的 guided 目标/技巧不一致。

处置：以人工 lessonPlan 为准，`fallbackReason=MANUAL_CONFLICT`，不覆盖手写。

## 原则

- 每个 fallback 必须带 `fallbackReason`，可解释。
- 不为满足 auto 覆盖而伪造证据或改 solver。
- MANUAL_REVIEW（13）不受 P1 影响。