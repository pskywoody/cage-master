# B4-A1 设计：Topology Prior（shape-template birth）

> 日期：2026-08-10
> 分支：B4-A
> 前置：A1-0 审计（`docs/B4/B4-A1-audit.md`）
> 原则冻结：**不是加 topologyWeight 扫权重**。只改变出生先验分布，不动 λ / score / selection / acceptance。

---

## 1. 设计目标

把「出生先验」从 `uniform random birth` 改成 `topology-aware birth`：

```
当前（B3）：
  choose cell（均匀随机种子）
    ↓
  expand via greedy + local score（growthBias/shapeDiversityWeight 逐格修正）
    ↓
  finish cage
    ↓
  selection 用 λ=25 事后修正 distribution

B4-A（prior ON）：
  choose cell
    ↓
  【出生时采样目标 shape 原型（冻结先验）】
    ↓
  尝试按原型出生；失败回退 greedy
    ↓
  finish cage
    ↓
  selection 只需更少修正
```

**关键：先验是「写死的分布」，不是可扫的权重。** 跑且只跑一轮基准，不微调。

---

## 2. 机制：shape-template birth

在 `growCage` 出生时，以冻结概率 `templateBias` 尝试「按形状模板出生」：

1. 按当前 `targetSize` 选出该尺寸的模板库。
2. 从模板库按**冻结先验权重**采样一个模板（含 archetype 标签）。
3. 对模板施加随机 8-变换（旋转/镜像）并锚定到种子格。
4. 校验：全部格在界内、全部未占用、笼内无重复数字。
5. 通过 → 直接生成为该形状；失败 → 回退原 greedy 生长。

**只影响出生概率分布，不触碰 selection / difficulty / uniqueness / ranking。**

### 良构性要求
- 模板出生结果为**精确 targetSize**，主循环 `cells.length < 0.5*targetSize` 判定天然通过。
- 复用 `assigned` 网格，与 greedy 路径共用，无冲突。
- 失败时**零副作用**（原子校验通过后才标记 assigned），RNG 消耗与 greedy 路径不同属正常（B4-A 为独立 seed 序列）。

---

## 3. 模板库 + 冻结先验

### 3.1 模板（按尺寸，相对坐标模式）

`classifyArchetype` taxonomy：`domino / straight / rect / cross / T / L / zigzag / hook / irregular`。

| size | 模板 | archetype | 先验权重 |
|---|---|---|---|
| 4 | `[[0,0],[0,1],[0,-1],[1,0]]` | T | 0.10 |
| 4 | `[[0,0],[1,0],[1,1],[2,1]]` | zigzag | 0.22 |
| 4 | `[[0,0],[0,1],[0,2],[1,0]]` | hook | 0.17 |
| 4 | `[[0,0],[0,1],[1,0],[1,1]]` | rect | 0.10 |
| 4 | `[[0,0],[0,1],[0,2],[0,3]]` | straight | 0.05 |
| 5 | `[[0,0],[0,1],[0,-1],[1,0],[2,0]]` | T | 0.10 |
| 5 | `[[0,0],[0,1],[0,-1],[1,0],[-1,0]]` | cross | 0.14 |
| 5 | `[[0,0],[1,0],[1,1],[2,1],[2,2]]` | zigzag | 0.22 |
| 5 | `[[0,0],[0,1],[0,2],[1,0],[1,1]]` | hook | 0.17 |
| 5 | `[[0,0],[0,1],[1,1],[2,1],[2,2]]` | irregular | 0.14 |
| 6 | `[[0,0],[1,0],[1,1],[2,1],[2,2],[3,2]]` | zigzag | 0.22 |
| 6 | `[[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]]` | rect | 0.10 |
| 6 | `[[0,0],[0,1],[0,-1],[1,0],[2,0],[3,0]]` | T | 0.10 |
| 6 | `[[0,0],[0,1],[1,1],[1,2],[2,2],[2,3]]` | irregular | 0.14 |

> size 2/3 无可用的 non-canonical 复杂形状，跳过模板出生（回退 greedy），避免无收益地消耗 RNG。

### 3.2 冻结先验 = 模板权重（归一化）

| 聚合 | 先验质量合计 |
|---|---|
| **complex non-top4**（zigzag/cross/hook/irregular） | **0.87** |
| T（complex 但属 top4） | 0.20 |
| rect | 0.20 |
| **canonical top4**（straight/domino/L） | **0.05** |

> 目标：把出生先验从「Domino/Straight 链主导」改为「zigzag/hook/irregular/cross 主导」，从源头压 top4Share。

---

## 4. 注入点与冻结判定

| 项 | 位置 | B4-A 动作 |
|---|---|---|
| `partitionCages` | (412) | 新增 `topologyPrior` 分支，默认 OFF（B3 路径字节不变） |
| `growCage` | (609) | 出生时先尝试模板出生，失败回退 greedy |
| `objective.topologyWeight` | (1518) | **不动**（λ=25 冻结） |
| ranking formula | (1598) | **不动** |
| growthBias / shapeDiversityWeight | (1539/1549) | **不动**（0.4 / 0.2 冻结） |
| acceptance | (1570-1571) | **不动** |

**B3-FINAL 不可变**：`topologyPrior.enabled` 默认 `false`，生产路径逐字节不变。

---

## 5. A1-2 第一轮基准协议

| 项 | 值 |
|---|---|
| 对比 | B3-FINAL baseline vs B4-A prior ON |
| N | 100 |
| λ | 25（冷冻） |
| ranking / objective / acceptance | unchanged |
| seed protocol | 同 seed 列表（`seed + i*1000`） |
| 指标 | top4Share↓ / entropyH≥2.60 / complex 不降 / ratio.mean 不恶化 / score±30 / uniqueAll |

**判定**：若 prior ON 使 top4Share 下降且 entropy 提升、complex/ratio/难度不退化 → 出生先验是有效瓶颈，selection 修正负担降低。否则记录失败，不微调。

---

## 6. 明确禁止

```
❌ topologyWeight 0.1/0.15/0.2 sweep
❌ 改 λ
❌ 改 score formula
❌ 改 selection / acceptance
❌ 微调 templateBias 找甜点
```
第一轮只用**单一冻结先验**，成则记录，败则归档。