# B4 Benchmark Baseline（对照基准）

> **状态：FROZEN** · 来源：B3-FINAL RELEASE（`docs/B3-FINAL-acceptance-report.md`）
> B3-FINAL 是不可变产品基线。本文件是**所有 B4 实验的唯一对照基准**。

---

## 冻结 Baseline

| Metric | B3-FINAL | 单位/说明 |
|---|------:|---|
| top4Share | 53.0% | canonical top4 集中度（L/T/domino/straight3） |
| entropyH | 2.619 | 拓扑熵（越高越多样） |
| ratio.mean | 23.3% | 笼推理率均值 |
| complex | 36.7% | 复杂跨宫笼占比 |
| singleton | <5% | 单格笼占比（实测 4.1%） |
| uniqueAll | true | 全部唯一解 |
| score | 507~525 | 平均难度分（稳定区间） |

> 注：baseline 同时记录 100 级回归值（上表）与 release pool 实测值
> （top4 53.3% / H 2.609 / ratio 21.0% / complex 36.2% / score 507.3），
> 两者同一量级，实验对照建议用回归值（更稳定）。

## 对照方式

每个 B4 候选必须与 baseline 做**单变量 diff**：

| Gate | 条件 |
|---|---|
| top4Share | ↓ 且不高于 baseline + 容差 |
| entropyH | ≥ 2.60（不塌缩） |
| complexShare | ≥ baseline − 0.02 |
| uniqueAll | true |
| score | baseline ± 30 |

## 判定语义

- `top4Share ↓` 且其余不退化 → 分布更理想，可推进
- `top4Share ↓` 但 entropy/complex 退化 → 牺牲多样性换集中度，不采纳
- 任何 categorical 退化 → 记 negative result，回退

## B4 各方向的 baseline 关注点

| 方向 | 核心指标 | 允许牺牲 |
|---|---|---|
| B4-A topology prior | top4Share ↓ | 无 |
| B4-B canonical diversity | entropyH ↑ | 无 |
| B4-C birth redesign | difficulty 分布 | 无 |
| B4-D pareto | 多目标前沿 | 明确 trade-off |