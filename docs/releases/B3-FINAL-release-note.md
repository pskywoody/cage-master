# B3-FINAL Release Note

> **状态：RELEASED** · 2026-08-10 · version 3.0
> 发布包：`release/B3-FINAL/` · 版本标记：`docs/B3-FINAL-manifest.md`

## What shipped

CageMaster 的 Killer Sudoku 关卡生成器结束 B3 参数探索，进入生产稳定态。正式发布一个 100 关的冻结 level pool，作为后续所有 level generation 的不可变对照基准。

- **Release artifact**：`release/B3-FINAL/`（manifest / release-pool / acceptance-report / config-lock / pool.sha256 / README）
- **Pool**：100 关，seed=20260810，`release/B3-FINAL/release-pool.json`（LevelPoolManager 兼容格式）
- **校验**：`pool.sha256 = fa094aef3c042a74ce7b7ea3e56e91ed1be0380b0c394c2480fb9227c6bdb413`
- **生产加载**：`core/production-config.js` 生产模式加载冻结池，开发模式允许生成

## Frozen parameters

| Param | Value | 来源 |
|---|---|---|
| gb (growthBias) | 0.4 | B3-B2 |
| lambda (topologyWeight) | 25 | B3-B1b |
| W (shapeDiversityWeight) | 0.2 | B3-C1c |
| objective | true | B3-A |
| ratioWeight | 100 | B3-A |
| maxCollected | 8 | B3-A |

> 配置锁：`config/production/B3-FINAL.json` 与 `release/B3-FINAL/config-lock.json`。禁止修改，除非进入 B4。

## Acceptance metrics

| Metric | Pool | 100级回归基线 | 判定 |
|---|---|---|---|
| top4Share | 53.3% | 53.0% | ✅ |
| entropyH | 2.609 | 2.619 | ✅ |
| ratio.mean | 21.0% | 23.3% | ✅ |
| complex | 36.2% | 36.7% | ✅ |
| singleton | 4.1% | <5% | ✅ |
| avgScore | 507.3 | 525 | ✅ |
| uniqueAll | true | true | ✅ |

完整验收：`docs/B3-FINAL-acceptance-report.md`（Distribution / Quality / Diversity 三块 benchmark）。

## Known limitations

- **top4Share ~53% 结构性偏置**：L/T/domino/straight3 四种 canonical 形状占比较高，是 generator birth distribution 的固有偏置，B3 参数无法突破（architecture ceiling）。
- **ratio.mean ~21%**：低于理想 25%，G3 四星完整规格（ratio>40%）仍结构性不可达。
- **操作单一**：当前笼全为加法（`+`），无 `-`/`×`/`÷` 变体（早期审计遗留，未在本版本处理）。
- **难度集中在 3-4 星区间**：pool 难度带偏中高，未覆盖低星入门档。

## Next research line (B4)

B4 不再改生产池，而是探索 generation frontier：

```
B4/
 ├── topology prior        生成前控制 topology 分布
 ├── birth distribution    源头改变 canonical shape 出生概率
 ├── canonical diversity   canonical-aware generation
 └── Pareto objective      quality × difficulty × novelty × spread 多目标

B3 = production stability
B4 = generation frontier exploration
```

详见 `docs/cage-b4-research.md`。任何 B4 结论必须与本 release acceptance benchmark 对照。