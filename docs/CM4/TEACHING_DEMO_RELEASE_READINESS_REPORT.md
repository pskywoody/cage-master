# TEACHING_DEMO_RELEASE_READINESS_REPORT

## 1. 当前状态

**PARTIAL**（生产链路 READY，但 auto 启用是需 PO 决策的产品选择）

已稳定达成：resolver 选择正确、48 关评估完成、manifest 一致、全量校验通过、E2E 通过。唯一阻断"release ready"的动作是产品侧决定何时/如何把 35 个 AUTO_ENABLED 关卡的 `demo.auto` 打开。

## 2. AUTO_ENABLED 数量

**35 关**（详见 `reports/golden-demo-manifest.json`）

覆盖满足 Phase 1 要求：

- 单元格技巧：nakedSingle / hiddenSingle / cageUnique
- 候选消除技巧：nakedSingle / hiddenSingle / pointingClaiming
- pair / group 技巧：nakedPair(305/701)、hiddenPair(403/702)、nakedTriplet(703)
- 高阶技巧：rule45(201–208/304/504)、pointingClaiming(301/302/303)、swordfish(705)
- 不同难度：覆盖 1–7 章

## 3. MANUAL_REVIEW 数量

**13 关**

- 11 关 composite 综合关（无单一目标技巧，保留手写叙事）：109/306/307/406/505/506/603/604/605/606/706
- 2 关 delayed structure（开局结构未浮现，保留手写）：404 nakedTriplet、704 xWing

## 4. Golden demo 覆盖

35 个 AUTO_ENABLED 均满足：

- target technique 稳定生成（resolveTeachingDemo fallback=false）
- evidence 完整（evidenceComplete=true）
- demo 步骤已最小化（`minimizeDemoSteps` 去掉纯聚光灯与重复高亮）
- eliminate→strikeNote、success→concludeCell 语义统一

## 5. 剩余风险

1. **auto 未启用**：生产仍用手写 demo；resolver 已就绪但未接入 `demo.auto`（等待产品 rollout 决策）。
2. **气泡字符颜色（Phase 9）未做**：格子字符与数字字符未分色，属展示层收尾，不阻塞教学正确性。
3. **404/704 延迟结构**：当前策略为保留手写；若未来要自动化，需 multi-technique planner（见 Phase 4 决策 B），不在本阶段实施。
4. **回放可复现性为静态验证**：resolver 由盘面确定性推导，已通过 manifest 一致性；浏览器端逐帧回放需在开启 auto 的小批试点中人工确认。

## 6. 发布前唯一剩余动作

由 PO（或用户）做一次不可逆产品选择：是否为 35 个 AUTO_ENABLED 关卡放开 `demo.auto`（建议先每章挑 1 关小批试点）。在此之前，生产链路零变更、手写 demo 不受影响，处于稳定可发布状态。

## 附：验收结果

- validate-levels: 63/63，0 错误
- validate-chapter-arc: 0 error，1 warning（401 语义门，既有）
- validate-teaching-demo: 6 Case 全 PASS
- golden manifest: AUTO_ENABLED 35 / MANUAL_REVIEW 13，一致