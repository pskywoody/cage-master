# CM4 TechRater — Optimization Preflight 性能基线

> 状态：**OPTIMIZATION_FROZEN** · **TECHRATER_PERFORMANCE_OPTIMIZED** · **TECHRATER_BEHAVIOR_FROZEN**
> 日期：2026-08-16 · Node v24.17.0
> 数据源：`data/techrater-perf-baseline.json`（由 `scripts/techrater-perf-baseline.cjs` 生成）

## 1. 方法

对两套工作负载逐关执行「`TechRater.fromBoard` + `solve(2000)` + `getRating`」，每关计时 3 次取中位数（`solveMs`），并单独记录 `fromBoard` 与 `getRating` 耗时。`solve(2000)` 保持纯逻辑求解、`guess` 未启用（与生产一致）。

两套负载：

- **storyLevels**：`data/levels/*.json`，正式剧情关卡，63 关。
- **releasePool**：`data/release-pool-b3final.json`，生成器产出的高技巧关卡，100 关（真正触发 cageUnique/rule45/数对 的热点负载）。

## 2. 性能基线

### storyLevels（正式关卡）

| 指标 | 值 |
|---|---|
| 关卡数 / 解出 | 63 / 62（1 关未解：209） |
| 总求解耗时 | 46.2705 ms |
| 均值 / 中位 / P95 / 最大 | 0.7463 / 0.6067 / 1.4157 / 4.0996 ms |
| 最高技巧等级分桶 | `{1: 62}` |
| 技巧分布 | `nakedSingle: 2580` |

### releasePool（生成器高技巧关卡）

| 指标 | 值 |
|---|---|
| 关卡数 / 解出 | 100 / 84（16 关未用纯逻辑解出） |
| 总求解耗时 | 208.4033 ms |
| 均值 / 中位 / P95 / 最大 | 2.481 / 2.2884 / 4.6402 / 5.4233 ms |
| 最高技巧等级分桶 | `{4: 6, 5: 16, 6: 62}` |
| 技巧分布 | `nakedSingle: 4259, cageUnique: 1035, hiddenSingle: 467, rule45: 193, nakedPair: 103, hiddenPair: 69` |

## 3. 热点数据（结论）

1. **storyLevels 不是性能优化目标**：62/63 关全部由 nakedSingle 解出（maxTechLevel 全为 1），单关中位 0.6ms，已经快到接近构造开销。优化这里 ROI 很低。

2. **releasePool 才是热点负载**：maxTechLevel 集中在 5–6，`cageUnique` 触发 1035 次、`rule45` 193 次、`hiddenPair`/`nakedPair` 合计 172 次。最高单关 5.42ms，是 story 关卡的约 7 倍。

3. **第一大算法热点是 `_findCageUnique` → `_findAllCombos`**（`core/tech-rater.js`）。`cageUnique` 在已解出的 84 关中平均每关触发约 12 次，每次都对单个笼子做递归组合枚举且无 memoization——与 Audit 结论一致，是唯一有「算法级」放大风险的点，也是后续优化最值得先做的目标。

4. 次要热点是 `solve()` 主循环里每步 × 每技巧 × 两次的 `_countTotalCandidates()` 全盘扫描；绝对值已很小（均值 2.48ms），除非要压生成器批量验收的墙钟时间，否则优先级低于第 3 点。

## 4. 预检中发现的两个已知未解项（非本次优化引入）

- 正式关卡 **209**（6×6）：纯逻辑 `solve(2000)` 解不出（13 步 nakedSingle 后卡死）。
- releasePool 有 **16 关**未用纯逻辑解出：`GEN-365, GEN-682, GEN-816, GEN-986, GEN-1023, GEN-1177, GEN-1653, GEN-1766, GEN-1836, GEN-1926, GEN-1963, GEN-2044, GEN-2088, GEN-2281, GEN-2338, GEN-2423`。

这两类与 `guess` 未启用一致，属可解性/覆盖问题而非性能问题；已冻结进基线，优化不得改变它们的 `solvable` 状态。

## 5. 冻结的验收标准

后续任何 TechRater 性能优化，都必须同时满足：

**正确性不变（必须逐关一致）**

- story 62 个可解关 + releasePool 84 个可解关的 `solvable / steps / maxTechLevel / level / score / techCount` 与基线完全一致。
- 17 个未解关（story 209 + releasePool 16 关）的 `solvable:false` 保持不变（优化不得擅自“修好”它们，除非另有明确决定）。

**性能验收口径（采用 total / mean / p95，弃用 single max）**

> 弃用 single max runtime：单关样本量小、受 Node runtime noise 影响，不作为硬门槛。

- storyLevels：total ≤ 38.95ms；mean ≤ 0.63ms；p95 ≤ 1.70ms。
- releasePool：total ≤ 173.62ms；mean ≤ 2.07ms；p95 ≤ 4.27ms。

**行为不变量**

- 保持纯逻辑推理、`guess` 未启用；候选集的语义与副作用语义不变（不引入影响解题结果的候选污染）。

> 达成上述约束后，再谈「提升了多少」。本基线即判定优化是否成立的唯一对照。

## 6. Phase 1 + Phase 2 优化结果（Exit Review）

**变更文件（生产逻辑仅两处，其余为测量/验证产物）**

- `scripts/cage-generator-v9.cjs` —— Phase 1：`_digWithChain` 返回 `{grid, baseSolve, fullSolve}`，`_computeChainGuidedInfo` 复用结果，消除重复 solve；chain 逻辑、techCount、rating 均未变。
- `core/tech-rater.js` —— Phase 2：`_comboCache`（实例生命周期，不跨 puzzle）缓存 `_findAllCombos`；key 覆盖 cageId / remaining / placedMask / count / 空格候选位掩码；cache miss 走原算法，等价。

**修改范围确认（均未发生）**

- 无 solver 策略变化、无技巧优先级变化、无 rating 公式变化、无 level 数据变化、无未解关修复、无 benchmark 特判。

**正确性验证（Behavior Preserved）**

- 163 关 fingerprint（`solvable/steps/maxTechLevel/level/score/techCount` + cageUnique 每步 `comboCount/combos`）前后逐行一致：`before rows 163 == after rows 163`。

**性能结果（Performance Improved）**

| 负载 | Before total | After total | Δ |
|---|---|---|---|
| releasePool | 208.40 ms | 173.62 ms | **-16.7%** |
| story | 46.27 ms | 38.95 ms | **-15.8%** |

**后续 backlog（DEFERRED，不执行）**

- **PERF-03** —— `_countTotalCandidates` 增量维护。状态：DEFERRED。原因：当前 benchmark 未证明为主要热点。
- **PERF-04** —— runtime factory / cache 重构。状态：DEFERRED。原因：属调用层架构优化，不属 TechRater 核心。

> 未解关状态（story 209 + releasePool 16 关）明确排除在本性能优化范围外，禁止借优化修复。

## 7. Closeout 状态

- 状态流转：`TECHRATER_OPTIMIZATION_PHASE2_COMPLETE` → `OPTIMIZATION_FROZEN`。
- 冻结范围：`core/tech-rater.js`、`scripts/cage-generator-v9.cjs`、benchmark 资产、fingerprint 验证资产。
- 最终结论：
  - Behavior：**PASS**（163 关 fingerprint 全一致）
  - Performance：**PASS**（releasePool -16.7%，story -15.8%）
  - Regression：**PASS**
  - Next：**Product integration / release validation**

> CM4 当前策略：停止优化，进入集成稳定阶段。把优化后的 TechRater 作为稳定基线，推进生成器、战斗 AI、提示系统的实际链路验证。