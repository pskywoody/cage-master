# B3 实验目录 · ARCHIVED（研究记录，非开发入口）

> **状态：ARCHIVED** · 归档时间：2026-08-10
> 这些脚本是 B3 阶段的研究记录，**不是继续开发入口**。
> B3 问题已解决并冻结（`docs/B3-FINAL-manifest.md`）。不再 reopen。

---

## 归档清单

本目录不再作为开发入口，历史 B3 实验脚本保留在 `scripts/`（原位，仅标记归档）：

```
scripts/
 ├─ b3a-objective-comparison.cjs          B3-A  客观择优（采纳）
 ├─ b3b1a-singleton-suppression.cjs       B3-B1a singleton 抑制（采纳）
 ├─ b3b1b-topology-ranking.cjs            B3-B1b 阶段1 topology ranking（λ=25 采纳）
 ├─ b3b1b-phase2-proposal.cjs             B3-B1b 阶段2 merge channel（负结果，丢弃）
 ├─ b3b2-growth-bias.cjs                  B3-B2  growth bias（gb=0.4 采纳）
 ├─ b3b3-topology-v2.cjs                  B3-B3  topology v2（负结果，回退）
 ├─ b3b4-crosshouse-diversity.cjs         B3-B4  crossHouse penalty（负结果，回退）
 ├─ b3c1a-shape-histogram.cjs             B3-C1a shape 观测（采纳为测量）
 ├─ b3c1b-shape-diversity.cjs             B3-C1b ranking tax（负结果）
 ├─ b3c1c-shape-pressure.cjs              B3-C1c frontier pressure（W=0.2 采纳）
 ├─ b3c2-size-shift.cjs                   B3-C2  size shift（负结果 → architecture ceiling）
 └─ b3-final-regression.cjs               B3-FINAL 冻结回归（保留为回归守卫）
```

## 状态语义

| 脚本 | 结果 | 状态 |
|---|---|---|
| b3-final-regression.cjs | 100 级回归通过 | ✅ **保留为回归守卫（生产）** |
| b3c1a-shape-histogram.cjs | 观测 | 📌 保留为测量工具 |
| 其余 b3*-*.cjs | 采纳 / 负结果 / 丢弃 | 🔒 ARCHIVED，仅供复现 |

## 新研究入口

> 以后新实验必须进入 **`B4-*`** 命名空间（见 `docs/cage-b4-research.md`）。
> 禁止继续出现 `B3-C1d` / `B3-C1e` / `B3-C1f`。