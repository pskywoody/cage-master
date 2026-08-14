# B3-FINAL 版本标记（Version Marker）

> **状态：不可变（IMMUTABLE）** · 打标时间：2026-08-10
> 说明：本环境无 git CLI，故以本文件作为 B3-FINAL 的不可变版本标记，等价于 `git tag B3-FINAL`。
> 冻结后任何参数改动都必须先撤销本标记，否则视为违规。

---

## 1. 冻结配置（Frozen Defaults）

生成链路默认值（`cage-generator-v9.cjs` 构造默认，全部可 override 但不得作为生产入口）：

```text
generator defaults frozen
  objective.enabled            = true      // B3-A 客观择优
  objective.ratioWeight        = 100
  objective.topologyWeight     = 25        // λ（B3-B1b 采纳）
  objective.maxCollected       = 8
  growthBias                   = 0.4       // gb（B3-B2 采纳）
  shapeDiversityWeight         = 0.2       // W（B3-C1c 采纳）
  topologyScoreVersion         = 1         // v1（B3-B3 v2 负结果回退）
  suppressSingletons           = true      // B3-B1a
  sizeWeights                  = targetStar=4 默认（B3-C2 判非主因，不调）
  selection / uniqueness       = 不动
```

## 2. 冻结基线（Frozen Baseline Metrics）

| Metric | Baseline | 判定 |
|---|---|---|
| top4Share | 51.6% | ✅ 接受（<45% 不可达，见 architecture ceiling） |
| entropyH | 2.66 | ✅ 不退化 |
| complexShare | 37.4% | ✅ 保持 |
| ratio.mean | 24.5% | ✅ 提升 |
| avgScore | 528.8 | ✅ 难度稳定 |
| singleton | 2.8% | ✅ <5% |
| uniqueAll | true | ✅ |

## 3. Regression 记录（B3-FINAL 验证）

100 级回归（`scripts/b3-final-regression.cjs`，默认构造验证 regionalization 生效）：

| Metric | Baseline(20级) | Regression(100级) | Result |
|---|---|---|---|
| top4Share | 51.6% | 53.0% | ✅ stable |
| entropyH | 2.66 | 2.619 | ✅ pass |
| complex | 37.4% | 36.7% | ✅ no regression |
| ratio.mean | 24.5% | 23.3% | ✅ stable |
| score | 528.8 | 525 | ✅ within range |
| singleton | 2.8% | 4.1% | ✅ <5% |
| uniqueAll | true | true | ✅ |

## 4. 冻结边界（Frozen Boundaries）

- ❌ 不再做局部参数扫（λ>25、gb>0.4、W>0.2 预计收益 <1%，且 risk diversity/entropy 下降 + 过拟合）。
- ❌ 不再 reopen B3-B3（merge channel）、B3-B4（crossHouse penalty）、B3-C2（size shift）。
- ✅ 冻结后进入产品化：生成 pool → acceptance → release。
- ✅ 新研究只能进入 B4（改变 birth distribution），禁止 B3-C1d/e/f 命名。

## 5. 语义

> B3 = 把 generator 调到稳定生产态（已完成并冻结）。
> B4 = 改变 generator 的分布能力（未来研究，见 `docs/cage-b4-research.md`）。