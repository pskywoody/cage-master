# Battle AI 人格统计实验计划（CM4 Research Phase 5 准备）

> 状态：仅准备，不调参数。本计划定义下一阶段「人格统计评估」的执行口径。

## 目标

把 Phase 1/2 的「单遍可解释差异」升级为「统计显著差异」。不要求每局结果不同，只要求决策/策略/风险/笔记/失误的**分布**存在可解释差异。

## 设计

- 样本：6 人格（blind / expert / mentor / prober / average / reckless）× **N ≥ 20** 次 × 同一组场景。
- 场景：`leading / losing / neutral / hot-streak / cold-streak`（Phase 1 已定义）+ 多回合 `consecutiveSuccess / consecutiveFailure / leadingThenLosing`。
- 只读采样：沿用 `getStrategy()/getDirectorDecision()/think()` 返回值，不改人格参数、不改关卡、不改 TechRater。

## 指标（每个指标记录分布，而非单点）

1. **strategy distribution**：`attack/defend/global/counter` 频次（按场景拆）。
2. **risk choice**：`guess` / `misread` 占行动比例（风险行为代理）。
3. **note frequency**：真笔记 vs 假笔记 vs 不写笔记的频次。
4. **mistake type**：错误动作的类别分布（看错行/猜错/防线判断）。
5. **technique discovery**：`nakedSingle/cageUnique/hiddenSingle/rule45/pointingClaiming/…` 的发现频次分布。

## 分析

- 每指标按人格聚合，画 distribution / 卡方或 KS 检验「人格间是否存在显著差异」。
- 重点对比「同状态 + 不同人格 → policy preference 是否可分离」（例如 blind 的 guess/misread 比例显著更高、expert 的 pointingClaiming 显著更高、prober 的 bait intent 显著更高）。

## 交付与约束

- 交付：`docs/CM4/battle-ai-personality-evaluation.md`（统计版）+ `data/battle-ai-traces/` 的 N≥20 采样集。
- 约束：不调人格参数作弊；不改生产逻辑；只新增只读 trace / 统计脚本。