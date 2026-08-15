# B3-FINAL Release Acceptance Report

> **状态：RELEASE CANDIDATE** · 生成：2026-08-10T15:13:20.944Z
> Version Marker：`B3-FINAL`（`docs/B3-FINAL-manifest.md`）
> Pool：`D:\killersudoku\cagemaster4\data\release-pool-b3final.json` · 100 关 · seed=20260810 · 耗时 23.8 min

## 0. 生效配置（默认构造验证）

| 旋钮 | 值 |
|---|---|
| growthBias (gb) | 0.4 |
| shapeDiversityWeight (W) | 0.2 |
| objective.enabled | true |
| topologyWeight (λ) | 25 |
| ratioWeight | 100 |
| maxCollected | 8 |

## 1. Distribution

| Metric | Pool | 100级回归基线 | 判定 |
|---|---|---|---|
| top4Share | 53.3% | 53.0% | ✅ stable |
| entropyH | 2.609 | 2.619 | ✅ |
| ratio.mean | 21.0% | 23.3% | ✅ |
| ratio.median | 20.5% | — | — |
| score (avg) | 507.3 | 525 | ✅ |
| complexShare | 36.2% | 36.7% | ✅ |

## 2. Quality

| Metric | Pool | 目标 | 判定 |
|---|---|---|---|
| singleton% | 4.1% | <5% | ✅ |
| complex% | 36.2% | 保持 | ✅ |
| invalid% (unique=false) | 0.0% | 0% | ✅ |
| uniqueAll | true | true | ✅ |
| retry rate | 单关 14.27s（1426.7 次尝试内） | 稳定 | ✅ |
| generation time | 23.8 min / 100 关 | — | ✅ |

## 3. Diversity

| Metric | Pool | 含义 | 判定 |
|---|---|---|---|
| uniqueShapes | 21 | canonical 形状种数 | ✅ |
| duplicate topology density | 99.0% | 1 − unique/cages | 观察 |
| canonical overlap (top4) | 53.3% | top4 集中度 | 接受（architecture ceiling） |
| top10Share | 84.1% | 前 10 集中度 | 观察 |
| size distribution | size-1: 4% / size-2: 13% / size-3: 26% / size-4: 26% / size-5: 32% | 笼大小分布 | 观察 |

## 4. Gate 判定（对照 100 级回归基线）

| Gate | 条件 | 实测 | 判定 |
|---|---|---|---|
| top4 稳定 | |pool − regression| ≤ 1pp | 53.3% vs 53.0% | ✅ |
| entropy 不塌缩 | ≥ regression − 0.02 | 2.609 vs 2.619 | ✅ |
| complex 不退化 | ≥ regression − 0.02 | 36.2% vs 36.7% | ✅ |
| ratio 不退化 | ≥ regression − 0.03 | 21.0% vs 23.3% | ✅ |
| 难度稳定 | score ∈ regression ± 30 | 507.3 vs 525 | ✅ |
| singleton | < 5% | 4.1% | ✅ |
| 唯一解 | 全 true | true | ✅ |

### 4.1 内置 gates（唯一验收源）

| Gate | 判定 |
|---|---|
| top4_50_53 | ❌ FAIL |
| entropy_ge_26 | ✅ PASS |
| complex_not_down | ✅ PASS |
| ratio_not_below_baseline | ❌ FAIL |
| difficulty_stable | ✅ PASS |
| singleton_lt_05 | ✅ PASS |
| unique | ✅ PASS |

> 未通过：top4_50_53、ratio_not_below_baseline。此表是 release 与 manifest 的唯一 PASS/FAIL 依据。

## 5. 结论

❌ **RELEASE CANDIDATE 未通过**：内置 gates 有 2 项失败（top4_50_53、ratio_not_below_baseline）。需回到 B3-FINAL 冻结配置复核，或明确放宽阈值。

> 本报告是以后每次改 generator 都能比较的 **acceptance benchmark**。
> 任何 B4 实验结论必须与本报告对照。
