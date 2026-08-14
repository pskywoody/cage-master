# B4-A1 代码审计：birth pipeline 拓扑决策点

> 日期：2026-08-10
> 分支：B4-A（Topology Prior）
> 目标：找到 candidate birth 的**结构注入点**，验证「改变出生先验 → selection 是否需要更少修正」。
> 原则冻结：**不是加 topologyWeight 扫权重**。不改 λ / score formula / selection / acceptance。

---

## 1. Birth pipeline 全链路

文件：`scripts/cage-generator-v9.cjs`

```
generate()                                        (1562)
  └─ while attempts < maxAttempts
       └─ _generateOne()                          (1668)
            ├─ generateFullSolution()             (130)   真空解
            └─ partitionCages()                   (412)   ← 拓扑出生主战场
                 ├─ findRandomStart()             (457)   种子格：均匀随机
                 ├─ growCage()                    (609)   形状出生
                 │    ├─ weightedEmptyPick()      (560)   frontier 逐格扩张
                 │    │    ├─ topologyBiasWeight / V2  (480/521)  局部拓扑评分
                 │    │    └─ shapeDiversityWeight 1-step lookahead (564)  ← B3-C1c
                 │    └─ useAbsorb 决策           (655)   rng()>0.2 吸收邻笼
                 ├─ _balanceByMerging()           (821)   后处理分布平衡
                 └─ mergeSmallCages()             (816)   单格清理
            ├─ [proposal channel] reshapeToComplex()  (1700)  supply 侧注入
            └─ computeCageSums() → 挖洞 → rating → uniqueness
Selection (generate() 内)                          (1598)
  fitness = diff - ratio*ratioWeight
                  - topo * topologyWeight(λ=25)
                  - shapePenalty * shapeDiversityWeight
```

---

## 2. 三个审计问题的结论

### Q1：cage topology 在哪里决定？

**拓扑形状在 `growCage()` 内「逐格扩张」时局部决定**，没有全局形状模板。

- 每个笼 = 1 个种子格（`findRandomStart`，**纯均匀随机**）+ 后续每次 frontier pick。
- 形状是「贪心链式扩张」的自然产物：种子扩散邻格 → 连成 Domino / Straight / L / 不规则。
- 每次扩张的选择由 `weightedEmptyPick` 决定，混合 `(1-growthBias)*1 + growthBias*topoScore`。

### Q2：哪些随机选择影响最终 topology？

| 随机点 | 位置 | 当前行为 | 对拓扑影响 |
|---|---|---|---|
| 种子格选择 | `findRandomStart` (467) | 均匀随机 | 决定笼的起点位置，弱影响形状 |
| 每次扩张选格 | `weightedEmptyPick` (569-671) | 局部拓扑评分加权 | **强影响形状**（决定链式方向） |
| 是否吸收邻笼 | `useAbsorb` (655-662) | `rng()>0.2` 概率进入吸收分支 | 中等（合并已成笼） |
| 吸收哪只邻笼 | (679) | 均匀随机 | 弱 |

**主要拓扑控制点 = `weightedEmptyPick` 的扩张选择。**

### Q3：B3-C1c 是否已影响同一区域？

**是，已影响 `weightedEmptyPick` 内部。** (564-568)

`shapeDiversityWeight` 对 1-step lookahead 的 canonical shape 按局内已用次数做 soft 惩罚：
```
w *= 1 / (1 + used * shapeDiversityWeight)
```

但它与 `growthBias` 都是**扩张过程中的局部修正**，属于「生长期微调」，不是「出生先验」。

---

## 3. 关键洞察（决定注入点）

当前 birth 已有**两层修正**，但都聚焦在「扩张期」：

1. `growthBias`（0.4）：局部复杂评分，偏爱转折/跨宫/分支。
2. `shapeDiversityWeight`（0.2）：**反应式**重复惩罚——只压低「本局已出现」的 canonical shape，**不主动推动稀有 shape**。

这两层都**没改变出生先验本身**：
- 种子格出生是**纯均匀随机**（对形状无先验）。
- 扩张是「局部贪心 + 反应式惩罚」，natural（pre-selection）分布仍偏向 Domino/Straight 链。

**B4-A1 的结构注入点，不是再叠加一个局部权重，而是：在种子格出生时，从固定的目标 shape 先验采样一个「出生原型」，让 `growCage` 朝该原型生长。** 这是对「出生概率分布」的写死改变，与 selection（λ=25）完全解耦。

---

## 4. 判定：B4-A invariant 是否成立

| 冻结项 | 审计确认 |
|---|---|
| λ = 25 | 冻结于 `objective.topologyWeight` (1518)，B4-A 不动 |
| ranking formula | (1598) 不动 |
| objective / acceptance | `_starToScoreMin/Max` (1570-1571) 不动 |
| seed protocol | 同 seed 同 RNG 序列，不动 |
| growthBias | 冻结 0.4，B4-A **新增先验独立实现**，不覆盖既有 lever |

**结论：出生先验可作为独立新机制注入，与既有 B3 lever 正交。**

---

## 5. 下一步

- A1-1：设计 topology prior 的出生原型采样机制（见设计稿）。
- A1-2：第一轮 benchmark（N=100，λ=25 冻结，B3-FINAL baseline vs B4-A prior ON）。