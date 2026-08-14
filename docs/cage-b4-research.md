# Cage Generator B4 研究方向（birth distribution redesign）

> **状态：研究提案（RESEARCH PROPOSAL）** · 创建：2026-08-10
> **前置**：B3-FINAL 已冻结（见 `docs/B3-FINAL-manifest.md`）。B4 是**改变 generator 的分布能力**，不是继续调 B3 参数。

---

## 0. 为什么进入 B4（结论依据）

B3 已确认：

```
λ ↑      有效（B3-B1b，λ=25 甜点）
gb ↑     有效（B3-B2，gb=0.4 甜点）
W ↑      有效（B3-C1c，W=0.2 甜点）
```

但已进入平台：

| 尝试 | top4Share | 结论 |
|---|---|---|
| λ=25 → 50 | 54.3% → 56.3% | 非单调，更高 λ 回退 |
| gb=0.4 → 0.6 | 49.2% → 57.9% | 非单调，回退 |
| W=0.3/0.5 | top4 反升 | 过强偏置触发 collapse |
| sizeWeights 全配置 | >53% | **architecture ceiling** |

**预计继续扫 λ=27/30、W=0.25、gb=0.45 的收益 <1%**，且风险 diversity↓ / entropy↓ / 过拟合 B3 benchmark。因此不值得。

**根因定位**（B2-A + B3-C1a + B3-C2 证据链）：

```
top4Share ~53% 的结构性偏置
    └── 由 growCage 的 shape birth 概率决定
         └── selection / ranking / size / post-hoc merge 都无法去集中
```

**结论**：B3 的杠杆都在「selection 侧」和「生长局部权重」，触及不到 **birth distribution**。要改变 top4 集中度，必须改变笼的「出生分布」，即 B4。

---

## 1. B4 核心问题

> 如何让 generator 从源头减少 canonical 高频形状（L/T/domino/straight3）的偏置？

当前链路：

```
random cage birth
        ↓
selection 修正（B3 已做）
```

B4 目标链路：

```
desired topology distribution（顶层先验）
        ↓
biased birth（源头控制）
        ↓
selection refine（保持不变）
```

---

## 2. 三个候选方向

### 方向 A：生成前先控制 topology prior

```
现在:  random cage birth → selection 修正
改:    desired topology distribution → biased birth → selection refine
```

- 在 `partitionCages` 入口先定义一份「期望的 canonical shape 配额」（如 L≤8%、T≤9%、domino≤10%、straight3≤8%）。
- `growCage` 的 birth 阶段按该配额做硬性/软性约束，让 top4 从源头降。
- **风险**：过度配额可能破坏盘面覆盖/唯一解，需与 `sizeWeights`/`growthBias` 联动。

### 方向 B：canonical-aware generation

```
现在:  optimize level quality
未来:  optimize level quality + canonical uniqueness
```

- 把「canonical 形状是否已在本局大量出现」作为生成目标的一部分，而非仅作为事后 penalty。
- generator 在排布第 2/3 个 T 形状时主动改走其他拓扑。
- **与 B3-C1c 区别**：C1c 是 frontier 局部 soft pressure，B4-B 是全局 canonical budget。

### 方向 C：多目标 Pareto

```
现在:  maximize quality
未来:  maximize { quality, difficulty, novelty, canonical spread }
```

- 建立多目标评价，用 Pareto 前沿选择，而非单一 fitness 标量。
- canonical spread 作为独立目标，与 quality 正交，避免 trade-off 被单值化掩盖。
- **成本最高**：需重写 candidate 评价与选择流程。

---

## 3. 建议的 B4 推进顺序

| 阶段 | 内容 | 验证 Gate |
|---|---|---|
| B4-A | birth distribution 观测（量化 growCage 各 shape 的实际 birth 概率） | 明确 top4 浓度的出生侧占比 |
| B4-B | topology prior 注入（方向 A 最小实现） | top4Share 下降 ≥3pp 且 complex/unique 不退化 |
| B4-C | canonical-aware budget（方向 B） | 与 B4-B 对比，选更优 |
| B4-D | Pareto 多目标（方向 C，可选大版本） | quality × difficulty × spread 前沿覆盖 |

> ⚠️ 每个阶段必须是**单变量实验**，且必须重新跑 B3-FINAL 回归作为对照基线，防止 B4 引入 regression。

---

## 4. 命名规则（防跑偏）

- ❌ 不再出现 `B3-C1d` / `B3-C1e` / `B3-C1f`。
- ✅ B3 实验目录标记为 ARCHIVED（见 `experiments/README-ARCHIVED.md`）。
- ✅ 新实验统一进入 `B4-*` 命名空间。