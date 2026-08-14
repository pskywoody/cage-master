# B4 Research Branch

> **状态：FROZEN（2026-08-11）** · 创建：2026-08-10
> **前置**：B3-FINAL 已 RELEASED（不可变产品基线，见 `docs/B3-FINAL-manifest.md`）。
> **冻结原因**：B4-G1 证明 size4 重定向 + size5 T 抑制均无法突破 65% headRatio，head≈65-67% 是当前 tiling 架构的结构性地板。B4 全部 soft 杠杆（birth / selection / size budget / archetype 抑制）已排除，实验闭环。**B3-FINAL 生产基线全程未动。**

---

## 分支语义

```
B3 = production stability（已完成，冻结）
B4 = generation frontier exploration（当前）
```

**B4 只研究**：

> 如何改变 level birth distribution，使自然生成空间更接近理想产品分布。

**B4 不做**：

- ❌ 调 λ（=25 冻结）
- ❌ 改 selection ranking
- ❌ 改 production pool
- ❌ 修 B3 acceptance gate
- ❌ 重新定义 baseline

---

## 分支结构

```
B4-research
    ├── topology-prior      (B4-A  ❌)
    ├── canonical-diversity (B4-B  ❌)
    ├── birth-distribution  (B4-C  ❌ CLOSED)
    ├── pareto-objective    (B4-D  ❌)
    ├── objective-landscape (B4-E  ❌)
    └── size/tiling-audit   (B4-F/G ❌ FROZEN)
```

## 子分支

| Code | 主题 | 状态 |
|---|---|---|
| B4-A | Topology Prior | ❌ 已归档（FAIL） |
| B4-B | Canonical Diversity | ❌ 已归档（FAIL/D0 分叉） |
| B4-C | Birth Distribution Redesign | ❌ **CLOSED**（出生端非控制变量，2026-08-11） |
| B4-D | Pareto Objective | ❌ 已归档（D1 Review） |
| B4-E | Objective Landscape | ❌ E1 FAIL（diagnostic success：selection repulsion 非控制变量） |
| B4-F | Candidate Pipeline Audit | ❌ F0：gate 不淘汰 non-head；F1：PASS head=size 函数；F2：PASS size-2/3=star 权重预算 |
| B4-G | Size / Archetype Lever | ❌ G0：Review 可控但 headroom 有限；**G1：Freeze（size4+T 抑制均打不破 65%）** |

**B4 结论**：head family 主导是 tiling 几何不变量（size2/3=100% head、size4=33%、size5=73% 且 T 与 scoring 无关），head≈65-67% 为架构结构性地板，无 soft 杠杆可打破。B4 全部方向已排除，**FROZEN**。

## 执行顺序（严格）

```
B4-A → B4-B → B4-C → B4-D → B4-E
```

- A 最小风险
- B 验证 duplicate 问题
- C 改 birth model（❌ 已证非控制变量）
- D 动 objective（❌ 已证 selection 加权无效）
- E 攻击 objective landscape（当前，E1 objective saturation）

## 关键文档

- `benchmark-baseline.md` — B3-FINAL 冻结 baseline（所有 B4 实验对照基准）
- `research-log.md` — B4 实验日志
- 配置：`config/research/B4/B4-*.json`
- 实验脚本：`experiments/B4/`

## 验收合约（所有 B4 实验）

```
candidate
   |
   compare（对照 benchmark-baseline.md）
   |
B3 baseline
```

目标不是提高 score，而是改善**分布质量**（top4Share / entropy / complex / unique）而不退化难度。