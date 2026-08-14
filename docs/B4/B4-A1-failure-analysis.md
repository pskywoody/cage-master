# B4-A1 失败分析：shape-template birth

> 日期：2026-08-10
> 状态：FAIL（已归档，不微调）
> 数据：`data/b4a1-benchmark-n30.json`

---

## 1. 结论

**假设被证伪**：在 candidate birth 阶段注入 topology prior（shape-template birth），不仅没有降低 top4Share，反而使其 **+3.4pp（52.7%→56.1%）**，complexShare 反降，score 下探出 ±30 边界。selection 需要更多修正，与「先验使 selection 更轻松」的假说相反。

---

## 2. 失败机制（诊断）

### 2.1 碎片化 → canonical filler 反弹

复杂模板笼（zigzag/hook/cross/irregular）在出生时侵占了不规则的格子集合，把棋盘「碎片化」。剩余空隙被后续 greedy 生长填成**更多小 canonical 笼**（domino/straight），净效应 canonical 占比不降反升。

```
复杂模板笼（-1 个 canonical）
  +
  greedy 填补空隙产生 2~3 个小 canonical 笼（+2~3）
  = 净 canonical 占比 ↑
```

### 2.2 模板 complex 属性未保留

`complexShare`（crossHouse && size≥4）反降 0.7pp，说明部分模板出生笼经 `_balanceByMerging` / `mergeSmallCages` 后：
- 被并入更大笼（失去独立 complex 形状）；
- 或模板本身落位后未跨宫（orientation/锚点导致单宫放置），不满足 `crossHouse`。

### 2.3 第 2 层 selection 压力增加

prior ON 时 score 下探（499 vs 530）、耗时增加（452s vs 414s），说明出生形状扰动后，挖洞/评级为满足难度 acceptance 需要更多尝试——selection 被「反向修正」，工作更重。

---

## 3. 对 B4-B/C/D 的启示

| 方向 | 启示 |
|---|---|
| **B4-B Canonical Diversity** | 出生期注入 complex 形状会碎片化 → 应在**布局后**（post-partition）做 canonical 去重/替换，避免生长期副作用。 |
| **B4-C Birth Distribution Redesign** | 单独改出生分布不动 selection 证明不足；需与 selection 的修正负担联动衡量，且避免「碎片化后 canonical filler 反弹」。 |
| **B4-D Pareto Objective** | 出生空间偏斜是结构性的，靠出生端单点干预会反弹；多目标（quality+diversity+bias）需在 selection 端联合优化。 |

**核心教训**：笼分布是**总量守恒**的系统——一处压 canonical，会让别处反弹 canonical。单独在出生端注入 complex 形状，不如在布局级控制整体 canonical 占比。

---

## 4. 产物

- `scripts/cage-generator-v9.cjs`：`topologyPrior` 默认 OFF（B3-FINAL 生产路径不变）。
- `scripts/b4a1-benchmark.cjs`：基准脚本（可复跑）。
- `data/b4a1-benchmark-n30.json`：N=30 完整数据。
- `docs/B4/B4-A1-audit.md` / `B4-A1-design.md`：审计+设计。
- `config/research/B4/B4-A.json`：已归档（status=archived）。