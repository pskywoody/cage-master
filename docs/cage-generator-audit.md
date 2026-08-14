# Cage Generator 审计（Step 3.5 · Step A）

> 状态：**B3-FINAL 已冻结**（2026-08-10）· 常驻化完成（gb=0.4 + λ=25 + W=0.2 + objective enabled）
> 性质：观察层，不改任何生成算法。

---

## 0. 一句话结论

Cage Generator 本身**不是完全失效，而是「生产链路失控」**。
生成器能稳定产出 3 星关，但已发布的 48 关里 47 关是 1 星——**生成能力存在，内容生产没体现**。
这两个问题必须拆开处理，不能混在一起调参数。

---

## 1. Baseline v0（指标契约）

```
dataset:
  shipped_9x9_levels: 48

generator:
  version: v9
  sample_seed: 20260810
  sample_size: 8

metrics:
  cage_size_distribution      笼子格数分布（1/2/3/4/5+）
  operation_distribution      操作分布（+/水/×/÷）
  difficulty_distribution     难度分 + 星档分布
  logic_required              求解路径命中的技巧（去裸单）
  cage_reasoning_rate         笼推理率（cageUnique/rule45 命中步数占比）
```

审计脚本：`scripts/cage-audit.cjs`（`--sample 8` 用固定 seed=20260810 现跑 8 关对比）。
冻结脚本：`scripts/freeze-cage-audit.cjs`（把报告固化为回归文件）。

**回归文件（不可改，只可被新 Baseline 覆盖）：**

```
tests/cage_generator/
  ├── baseline.json        # 精简指标契约（对照用）
  └── audit_snapshot.json  # 完整快照（48 存量 + 8 新生成逐关明细）
```

---

## 2. 审计结果（Baseline v0 实测）

### 2.1 存量 48 关（已发布）

| 指标 | 值 | 判定 |
|---|---|---|
| 笼子格数分布 | 1:164 / 2:377 / 3:439 / 4:267 / 5+:117 | 单格笼 164 个（≈12%） |
| 操作分布 | `+`:100% | ⚠️ 仅加法 |
| 难度分 | avg −15.6, min −50, max 325 | 大量负分 |
| 星档分布 | 1星:47 / 2星:1 / 3星+:0 | 🔴 无难度梯度 |
| 大笼占比(size≥4) | avg 29.8%, passRate 85.4% | ✅ 达标 |
| 笼推理率 | 命中 7 关，avg 2.0% | 🔴 玩家几乎不用 cage |
| 需试错求解 | 5 关（剩余格 4/12/3/2/19） | ⚠️ 非纯演绎 |

### 2.2 新生成样本（seed=20260810, n=8）

| 指标 | 值 | 判定 |
|---|---|---|
| 星档分布 | 3星:8（全部） | ✅ 生成器能出 3 星 |
| 难度分 | avg 500（一致） | ✅ 稳定 |
| 大笼占比 | avg 50.0%, passRate 100% | ✅ |
| 笼推理率 | 命中 8 关，avg 11.3% | ✅ 明显高于存量 |
| 逻辑命中 | hiddenSingle/cageUnique/rule45/hiddenPair 全命中 | ✅ |

### 2.3 核心对比

| 维度 | 存量 48 关 | 新生成样本 | 结论 |
|---|---|---|---|
| 难度梯度 | 47/48 为 1 星 | 8/8 为 3 星 | 生成有，生产无 |
| 笼推理率 | 2.0% | 11.3% | 生成更接近 Killer 本质 |
| 操作变体 | 全 `+` | 全 `+` | 双端都缺（B3 处理） |
| 单格笼 | 164（12%） | 32（16.7%） | 双端都偏高（B2 处理） |

**关键洞察**：大笼占比、难度分、逻辑命中这三项，生成器都远超存量。说明瓶颈不在"能不能生成"，而在"**生成的结果有没有被选进生产库**"。

---

## 3. Red Flags（4 项）

1. 🔴 **操作单一**：仅加法笼，无 `-`/`×`/`÷` 变体，Killer 价值有限 → 归 **Step B3**（大版本）
2. ⚠️ **单格笼 164 个**：纯裸单提示，Sudoku 价值低 → 归 **Step B2**
3. ⚠️ **5 关需试错**：剩 4/12/3/2/19 格，纯演绎推不完 → 需在 acceptance 层拦截
4. 🔴 **难度覆盖不足**：47/48 为 1 星，无中高等梯度 → 归生产链路治理（B1 + 内容选库）

---

## 4. 推进路线（已确认顺序）

> 先固化 A，再进 B。**不允许插队改算法。**

### Step A（已完成，本文档）
- ✅ `docs/cage-generator-audit.md`（本文件）
- ✅ `tests/cage_generator/baseline.json`
- ✅ `tests/cage_generator/audit_snapshot.json`
- ✅ 修复：`cage_reasoning_used/ratio` 未导出到 per_level 的 bug

### Step B1（已完成）：Solver-aware Acceptance
- ✅ `core/solver-aware-acceptance.js` — acceptance 判定层（纯函数，不改 generator）
- ✅ `scripts/acceptance-gate-test.cjs` — 驱动：generator 产出跑 gate，统计通过率
- ✅ 诊断结论见 §5「Step B1 诊断记录」

### Step B2（待做）：单格笼治理
- 目标 `single_cell_ratio <= 5%`
- 或仅保留 tutorial / extreme 约束场景

### Step B3（待做）：Operation 系统（最大工程量，独立大版本）
- schema 从 `{ sum, cells }` 升级为 `{ operation, value, cells }`
- solver / validator / generator 全链路升级

### 当前主线：B3-A Objective Injection（已完成，2026-08-10）
> 替代旧 B2/B3 路线的"cage reasoning density"主线。仅改候选择优，不改 cage builder / solver。

- ✅ **B3-0**：冻结 `tests/cage_generator/baseline-v9-forensics.json`（100 互异样本，修正 B2-A ceiling 判断）
- ✅ **B3-A**：`fitness = difficultyDistance - ratio*ratioWeight` 二级择优。A/B 结果 median 17.3→21.2%（+4pp）、≥20% 32→60%、p90 30.4、≥30% 13.3%，难度稳定。**selection 有效，topology 足够，B3-B 暂不需要。** 详见 `docs/cage-b3a-objective.md`
- ✅ **B3-B0**：Topology Entropy Audit（`scripts/cage-topology-entropy.cjs`）。**Verdict = Topology Skew（非 Collapse）**：uniqueShapes=21 / H=3.643 说明 diversity 存在，但 top10 占 88.1%、singleton 16%、cross-house complex <3% → 分布严重偏斜。**selection 不是唯一瓶颈，builder 的 topology pool 本身偏斜。** 详见以下 §6「B3-B0/B3-B1a 拓扑治理」
- ✅ **B3-B1a**：Singleton Suppression（`suppressSingletons` 开关 + `scripts/b3b1a-singleton-suppression.cjs` A/B）。只抑制 size-1 笼，不引入新 shape bias。**25 样本：singleton 16.8%→3.4%（Gate1 达标）、cross-house complex 26.2%→34.8%、ratio mean 18.0%→20.1%、unique 全过。** 拓扑熵 2.453→2.507 不退化，uniqueShapes 21 不变（确认无新 shape bias）。**已固化为新 baseline（`tests/cage_generator/baseline-v9-b1a-forensics.json`），`suppressSingletons` 默认开启。**
- ✅ **B3-B1b（阶段 1 采纳，阶段 2 负结果）**：
  - **阶段 1**（✅ 采纳 λ=25）：`topologyScore` 并入 candidate ranking（λ=25 甜点）。complexShare 34→38%、ratio 19.4→20.7%，难度不退化。**部分有效**——但 Gate2 top4Share 57→54% 未达 <45%，selection 无法去集中。
  - **阶段 2**（❌ 负结果）：merge-based topology proposal channel（`reshapeToComplex`）**不改变 top4Share**（全 ~55%，与 control 持平）。机制在起作用（singleton/ratio 改善）但不去集中。**供应瓶颈在 `partitionCages` 自身的 canonical 高频形状产出，不在 post-hoc merge。** 已冻结 `B3-B1a + λ=25` 为新基线，丢弃 merge 通道。
- ✅ **B3-B2（growth bias，已完成，Gate B 达成）**：切 `partitionCages` 笼生长过程本身（`growCage` 的 empty frontier 选择加 `topologyBiasWeight` 加权挑，非事后 merge）。**gb=0.4 是甜点：top4Share 55.2→49.2%（Gate B <50% 达成）、complex 36.6→39.9%、ratio 19.0→21.8%、H 2.568→2.707、难度/唯一解全稳定。** 非单调（0.6 反而回退到 57.9%），存在甜点。详见 §6.6。
- ✅ **B3-B3（topology score v1→v2，已完成，负结果）**：只升级 `topologyBiasWeight` 表达力（加 branching/area density/cross-house strength 三特征），gb 保持 0.4。**v2 全面差于 v1**（top4 49.2→52.9、complex 39.9→37.3、H 2.707→2.526）——更强判别器越过甜点触发 collapse。**complexShare 卡 ~40% 的根因是 size 分布（40% 的 size-2/3 笼结构上不可能 complex），不是形状评分。** 回退 v1，gb=0.4 基线不变。详见 §6.7。
- ✅ **B3-B4（crossHouse diversity penalty，已完成，负结果）**：跨宫奖励随局内浓度衰减（方案 B）。**div 全面差于 v1**（top4 49.2→55.0、complex 39.9→36.1、H 2.707→2.597）——衰减跨宫把质量推回 canonical 簇，top4 反升。**双负结果（B3-B3+B3-B4）证实：局部 topology 评分是双模态（复杂跨宫簇 vs canonical 簇），重加权只搬移峰间质量、无法创造中间多样性。** 回退 v1，gb=0.4 基线不变。详见 §6.8。
- ✅ **B3-C1a（measurement，已完成）**：shape histogram 观测（`scripts/b3c1a-shape-histogram.cjs`）。top4 组成 = L(size3,14.9%) + T(size5,14.3%) + domino(size2,11.5%) + straight3(size3,10.9%)。详见 §6.9。
- ✅ **B3-C1b（ranking tax，已完成，负结果）**：shape diversity penalty 并入 candidate fitness（`scripts/b3c1b-shape-diversity.cjs`）。**penalty 饱和**——canonical 总占比 68% 使所有候选被同等惩罚，无 discriminating power。详见 §6.10。
- ✅ **B3-C1c（frontier pressure，已完成，<3pp 接受）**：growCage frontier pick 叠加局级 shape usage soft pressure（`weightedEmptyPick` 1-step lookahead，`1/(1+used*W)`）。**W=0.2 甜点：top4 54.0→51.6%、H 2.62→2.66、comp 保持、ratio 升 24.5%、难度稳定。** 改善 2.4pp < 3pp 阈值 → 落 accept-ceiling 区。详见 §6.11。
- ❌ **B3-C2（sizeWeights shift，已完成，负结果 → architecture ceiling）**：修正 baseline 认知（star=4 实为 `{2:.10,3:.25,4:.30,5:.33}`，size-5 主导 34%），sweep 4 配置。**全部 top4 >53%，无配置 <45%。** s1/s2 深推 size-4 反使 s5 升到 38-41%（T 形态顽固），s3 压 s5 却被 size-2 domino 抵消且 top4 反升至 55.1%。**size 分布非 top4 主因，top4 canonical 集中度由 growCage 形状 birth 概率决定。** 详见 §6.12。
- ✅ **（冻结决策）**：综合 C1c(2.4pp) + C2(全负) → **接受 shape ceiling，freeze generator，不进入架构重写。冻结配置 = C1c W=0.2**（top4 51.6%、H 2.66、comp 保持、ratio 24.5%）。B3-C2 脚本保留可复现，不采纳为默认。
- ⏳ **B3-A+（可选）**：cageReasoningScore 加权，推 median→25%
- ⏳ **B3-C（最终）**：solver capability 扩展

---

## 5. Step B1 诊断记录（Solver-aware Acceptance）

> 目的：不重设计 generator，只加一道「metric gate」，跑现有 generator 产出，
> 回答：**是 acceptance 层缺失，还是 generator 本身不足？**

### 5.1 三档 Gate（从松到严）

| Gate | 判定条件 | 含义 |
|---|---|---|
| G1 基础门槛 | 唯一解 + `cageUnique`/`rule45` 至少命中 1 步 | 玩家**会用到** cage |
| G2 推理率门槛 | 唯一解 + `cage_reasoning_ratio ≥ 20%` | 玩家把 cage 当**主要工具** |
| G3 四星完整规格 | 唯一解 + score 400–600 + `hiddenSingle`/`cageUnique`/`rule45` + `ratio > 40%` | Killer 完整体验 |

（注：TechRater 实际星档为 1星<250 / 2星250–400 / 3星400–525 / 4星525–600 / 5星≥600。）

### 5.2 实测结果（不改 generator）

> ⚠️ **B1 存疑修正**：B1 用固定 seed 循环 `generate()`，Node 下每次重置 seed 从 attempt=1 重跑，产出**重复样本**。故下表"平均推理率 11.3%/12.7%、G2 0%"是**单关重复 24 次**的假象，不代表分布。**真实分布见 §5.3 修正**（B2-A 用 `generateBatch` 互异样本得出）。

| seed | 产出星档 | 笼推理命中 | 平均推理率（重复样本，存疑） | G1 | G2 | G3 |
|---|---|---|---|---|---|---|
| 20260810 | 3星 ×24 | 24/24 | 11.3% | **100%** | 0%* | 0% |
| 777 | 4星 ×24 | 24/24 | 12.7% | **100%** | 0%* | 0% |

\* 重复样本才为 0%，互异样本 G2 实际约 30%（见下）。

### 5.3 诊断结论（含 B2-A 修正 + B3-0 逐关复核）

| gate | B1 旧值（重复样本） | B2-A 修正（互异 100 样本） | B3-0 逐关复核 | 判定 |
|---|---|---|---|---|
| G1（出现 cage 推理） | 100% | 100% | 100% | 不变：acceptance 层缺失 |
| G2（ratio≥20%） | 0% | **29.7%** | **32.0%** | 修正：generator 有 ~1/3 产出达标 |
| ratio≥30% | — | **0%** | **3.0%**（3 关） | 修正：非绝对天花板 |
| G3（ratio≥40%） | 0% | 0% | 0% | 不变：结构性不可达 |

**ratio 真实区间（B3-0 逐关复核）：min 7.5% / mean 18.1% / 中位 17.3% / p90 24.7% / max 37.3%**（详见 `docs/cage-density-forensics.md`）。

> ⚠️ **B3-0 修正**：B2-A 文档此前写"max 28%、≥30% 全为 0%"，系聚合均值误推。逐关扫描后真实天花板约 **37%**（3 关 ≥30%，GEN-452 达 37.3%），≥40% 仍为 0%。B3 objective injection 的对照基准见 `tests/cage_generator/baseline-v9-forensics.json`。

**合并结论**：
1. G1 100% → **acceptance 层缺失（生产链路问题）**，加门即可——证据确凿。
2. G2 实际 ~32% → generator 有约三分之一产出达 20%＋，比 B1 判断的好。
3. **ratio 上限 ~37%**（≥40% 仍绝迹）→ **Killer 完整体验（>40%）结构性不可达**，需 generator 算法提升（B3-A objective injection），而非加 rule 或调现笼参数。

### 5.4 产物

- `core/solver-aware-acceptance.js` — acceptance 判定层（纯函数，可复用于任何 candidate）
- `scripts/acceptance-gate-test.cjs` — 驱动：`--count N --target N --seed N`
- `data/acceptance-gate-result.json` — seed 20260810 诊断明细

---

## 6. B3-B0/B3-B1a 拓扑治理

### 6.1 B3-B0 Verdict：Topology Skew（非 Collapse）

`scripts/cage-topology-entropy.cjs --count 100`（seed=20260810，2527 笼）判定：

```
Topology Diversity exists
        ↓
Distribution heavily skewed
        ↓
Low-value topology over-produced
        ↓
High-value topology under-produced
```

| 指标 | 结果 | 含义 |
|---|---|---|
| uniqueShapes = 21 | 正常 | builder 有能力产生多种形状 |
| H = 3.643 | 不低 | 不是单一模板复制 |
| top10 = 88.1% | 异常 | 分布严重倾斜 |
| singleton = 16% | 异常 | 低价值 cage 过量 |
| cross-house complex <3% | 异常 | 高价值 topology 稀缺 |

**结论**：selector（B3-A）已能挑到尾部优质样本，但 builder 产生的 topology pool 本身偏斜。**问题不是 shape diversity，而是 shape distribution。** B3-B1 目标 = 重塑 distribution，而非增加 diversity。

### 6.2 B3-B1a：Singleton Suppression（已完成）

**设计约束**：只处理 size-1 笼（主循环不刻意生成 + 清理阶段把残余单格并入邻笼），不引入任何新 shape bias。这是最干净的因果实验。

**实现**：`cage-generator-v9.cjs` 增加 `suppressSingletons` 开关（**默认 true**，显式传 `false` 回滚 legacy）。开启时 `partitionCages` 按 effMinSize≥2 运行：主循环不生成 size-1、剩余格用 `placeSingleCell` 优先并入邻笼、`mergeSmallCages` 以 effMinSize 兜底清理残余单格。根因是结构漏洞：旧 `mergeSmallCages` 以 `minSize=1` 调用，`size<1` 才合并（永不合并），singleton 全漏网。

**A/B 结果**（`scripts/b3b1a-singleton-suppression.cjs --count 25`，seed=20260810）：

| 指标 | baseline | suppressed | 判定 |
|---|---|---|---|
| singletonRatio | 16.8% | **3.4%** | ✅ Gate1 ≤5% |
| top4Share | 56.7% | 58.0% | ⏳ Gate2 留给 B3-B1b |
| complex cross-house | 26.2% | **34.8%** | ✅ 顺带 +8.6pp |
| crossHouseShare | 39.2% | 50.0% | ✅ +10.8pp |
| entropyH | 2.453 | 2.507 | ✅ 不退化 |
| uniqueShapes | 21 | 21 | ✅ 无新 shape bias |
| ratio.mean | 18.0% | **20.1%** | ✅ Gate4 不退化且提升 |
| ratio.median | 17.6% | 19.7% | ✅ |
| ratio.ge_20 | 40.0% | 48.0% | ✅ |
| avgScore | 503 | 519 | ✅ 难度稳定 |
| uniqueAll | true | true | ✅ |

**结论**：B3-B1a 成功。singleton 从 16.8% 压到 3.4%（远超 5-8% 预期），cross-house complex 顺带提升，cage reasoning ratio 天然上升（mean 18→20%），难度 / 唯一解全部稳定。**因果验证干净：提升全部可归因于 singleton suppression 单一变量。**

### 6.3 Baseline Freeze：B3-B1a = 新 baseline（已完成）

> **verdict 升级**：`Topology Skew (B3-0)` → `Topology Skew (singleton corrected)`
> 含义：不是已解决 skew，而是 **singleton mass 已被清除，剩余 skew 是纯 shape concentration 问题**。

**冻结文件**：`tests/cage_generator/baseline-v9-b1a-forensics.json`（suppress=true，25 样本，seed=20260810）

| 维度 | before | after | 固化 |
|---|---|---|---|
| singleton | 16.8% | 3.4% | ✅ PASS，允许范围 3-5%（不追 0%，避免 merge 过强/人为修形） |
| uniqueShapes | 21 | 21 | ✅ diversity 未变——减少的是低价值结构占比，非删除形状 |
| complex cross-house | 26.2% | 34.8% | ⚠️ 记作**自然副产物**，不计 B3-B1b 功劳 |
| ratio.mean | 18.0% | 20.1% | ✅ 提升 |
| avgScore | 503 | 519 | ✅ 稳定 |
| top4Share | 58% | 58% | ⏳ 残余问题 → B3-B1b |

**新问题定义**（B3-B1a 已切掉第一层噪声）：

```
Topology Skew
    |
    +-- top shape concentration        ← B3-B1b Gate2
    |
    +-- insufficient complex topology   ← B3-B1b Gate3
```

**默认值决策**：`suppressSingletons` **默认开启**（`!== false`）。理由：这是 bug-like behavior 修复（让 builder 遵守 min cage intent），非策略性 shape bias。CLI 增加 `--no-suppress-singletons` 保留回滚。

### 6.4 B3-B1b 阶段 1：topologyScore 仅用于 candidate ranking

> **设计**：`topologyScore(candidate) ∈ [0,1]`（复杂 cross-house 拉分、top-4 concentration/singleton 扣分），只并入 candidate ranking（`fitness = diff - ratioWeight·ratio - λ·topologyScore`），**不改 builder**。λ 小，先观察。`ratioWeight=0` 保证单变量（不混入 B3-A ratio 择优）。

**A/B 结果**（`scripts/b3b1b-topology-ranking.cjs --count 20`，collected=4，seed=20260810）：

| λ | top4Share | complex | ratio.mean | avgScore | unique |
|---|---|---|---|---|---|
| control (B3-B1a) | 57.2% | 34.2% | 19.4% | 510 | ✅ |
| 10 | 56.6% | 37.0% | 20.4% | 515 | ✅ |
| **25** | **54.3%** | **38.2%** | **20.7%** | 513.8 | ✅ |
| 50 | 56.3% | 36.3% | 19.6% | 515 | ✅ |

**结论**：selection-only topology ranking 是**部分有效**。
- ✅ **complexShare 34.2→38.2%（+4pp）、ratio 19.4→20.7%（+1.3pp）**，λ=25 为甜点；难度/唯一解全稳定。
- 🔴 **Gate2 未达**：top4Share 57.2%→54.3%，远高于 45% 目标。λ 增大（50）反而回退（非单调），说明高 λ 牺牲难度距离后也换不来更低 concentration。
- **关键洞察**：concentration 是 builder 的 candidate pool 结构问题，**selection 在 pool 内排序无法显著去集中**——候选池里各类 top4 都偏高，挑不出更分散的。这与 B3-A 的 ratio 结论一致：**selection 有杠杆但有限，pool composition 才是 binding constraint。**

**决策**：λ=25 可作小幅净赢（complex/ratio 升、难度不退化）采纳，但**不足以单独达成 Gate2**。要压 top4Share 到 <45%，必须进入 **B3-B1b 阶段 2：builder 级 complex topology 注入**（在 `partitionCages` 的 candidate pool 生成阶段注入 irregular 4-6 格 / multi-box 笼）。

**残余**：top4Share 仍 ~58%（>40%），trivial topology 仍偏多——这是 B3-B1b（complex topology injection）的目标，非 B3-B1a 范围。

### 6.5 B3-B1b 阶段 2：topology proposal channel（已完成，负结果）

> **设计**：不改 `partitionCages` 主逻辑，加一个 supply 侧 proposal 通道。`attempts % proposalEvery` 次尝试走 `reshapeToComplex`（把相邻 <4 格小笼合并为跨宫 4-maxSize 不规则笼，校验跨宫/非直线/无重复解），其余走 normal 路径。保持单变量：仅改 candidate pool composition，不碰 difficulty/rating/uniqueness/selection formula。

**A/B 结果**（`scripts/b3b1b-phase2-proposal.cjs --count 20 --seed 20260810 --ratios 0.1,0.2,0.3 --maxPer 3 --collected 8`）：

| ratio | top4Share | singleton | complex | H | ratioMean | avgScore | unique |
|---|---|---|---|---|---|---|---|
| ctl（λ=25 冻结基线） | 55.4% | 4.1% | 36.6% | 2.560 | 19.2% | 520 | ✅ |
| 0.1 | 55.5% | 3.9% | 36.9% | 2.556 | 19.4% | 526.3 | ✅ |
| 0.2 | 55.8% | 3.2% | 37.3% | 2.536 | 19.4% | 522.5 | ✅ |
| 0.3 | 55.1% | 2.1% | 37.0% | 2.571 | 21.1% | 518.8 | ✅ |

**Gates**：GateA(singleton<5%) ✅；GateB(top4<50%) ❌；GateC(top4<45%) ❌；complex>45% ❌；difficulty ±5% ✅；ratio 不退化 ✅；unique ✅。

**结论（负结果，但因果干净）**：proposal channel **没有改变 top4Share**（全 ~55%，与 control 持平）。complexShare 仅 +0.3~0.7pp。但机制确实在起作用（r=0.3 时 singleton 4.1→2.1%、ratio 19.2→21.1%），说明 proposal 命中了最终关卡，只是**没去集中**。

**机理诊断**：`reshapeToComplex` 是「merge-based」——把相邻小笼拼成跨宫中等笼。它****不产生新的 canonical shape****（合并后的跨宫 L/T/offset 仍归入既有 top-4 形状类别），且 maxPer=3 只改每关少量笼。因此它减少了 trivial 笼数量，却无法把 top-4 **种类**的集中度压下去。**供应瓶颈不在「能否制造跨宫笼」，而在「partitionCages 本身系统性产出 canonical 高频形状」（domino/straight-3/box-4）。** 这印证并细化了用户判断：瓶颈是 candidate topology supply，且 merge 这一刀不够深。

**决策**：冻结 `B3-B1a + λ=25` 为新实验基线（`tests/cage_generator/baseline-v9-b1b-phase1.json`）。**丢弃 merge-based proposal 通道**（不采纳为默认，保留脚本可复现）。下一刀应切 `partitionCages` 的笼生长过程本身（bias 与非凸/不规则生长，而非 post-hoc merge），才能压 top4Share。

### 6.6 B3-B2：growth bias（已完成，Gate B 达成）

> **设计**：保留 builder 主逻辑，只改 `growCage` 的 empty frontier 选择。原 `Math.floor(rng()*frontier.length)` 均匀挑 → 加 `topologyBiasWeight` 加权挑：`weight = (1-s)*1 + s*topo`。`topologyBiasWeight` 对「加入后」笼形状打分——奖励跨宫/转折/非凸，惩罚直线/domino/straight-3/完整矩形。`growthBias=0` 精确复现原行为（RNG 消耗一致，A/B 干净）。单变量：只改 frontier selection probability，不碰 difficulty/rating/uniqueness/selection/λ。

**A/B 结果**（`scripts/b3b2-growth-bias.cjs --count 20 --seed 20260810 --strengths 0.25,0.4,0.6 --collected 8`）：

| gb | top4Share | singleton | complex | H | ratioMean | avgScore | unique |
|---|---|---|---|---|---|---|---|
| 0（control） | 55.2% | 3.7% | 36.6% | 2.568 | 19.0% | 525 | ✅ |
| 0.25 | 53.0% | 2.8% | 37.6% | 2.617 | 21.7% | 498.8 | ✅ |
| **0.4** | **49.2%** | 3.5% | **39.9%** | **2.707** | 21.8% | 518.8 | ✅ |
| 0.6 | 57.9% | 3.4% | 37.4% | 2.526 | 21.5% | 497.5 | ✅ |

**Gates**：GateA(singleton<5%) ✅；**GateB(top4<50%) ✅（gb=0.4 → 49.2%）**；GateC(top4<45%) ❌；complex>45% ❌；difficulty ±5% ✅；ratio 不退化 ✅；unique ✅。

**结论（正结果，因果干净）**：growth bias **有效**。gb=0.4 把 top4Share 压到 49.2%（Gate B 达成），complex 36.6→39.9%，ratio 19.0→21.8%，熵 2.568→2.707（更多形状多样性），难度/唯一解全稳定。**这证实用户判断：supply 瓶颈可被生长偏置解决，而非 merge。** 与 Phase 2 形成鲜明对照——同样是"增加复杂笼"，改**生长概率**（supply 根源）有效，事后再**拼装**（post-hoc）无效。

**非单调诊断**：gb 0.25→0.4 改善，0.6 反而回退（top4 57.9%、H 2.526）。过强偏置让生长概率质量过度集中到被过度惩罚的形状补偿路径，导致 accept/selection 反向选择、形状多样性崩掉。**存在甜点 gb=0.4。**

**决策**：采纳 **gb=0.4** 为 B3-B2 甜点，作为 Gate B 里程碑。**未达 Gate C**（top4 49.2%>45%、complex 39.9%<45%）。下一步：在 gb=0.4 基础上，可微调 `topologyBiasWeight` 的奖励/惩罚系数或非线性 strength 曲线，向 Gate C 推进；或先冻结 gb=0.4 为新基线再做独立变量。

### 6.7 B3-B3：topology score v1→v2（已完成，负结果）

> **设计**：冻结 gb=0.4，只升级 `topologyBiasWeight` 表达力。v2 在 v1 基础上加三个维度：1) branching（内部 degree>=3 的 T/cross 结点，×1+0.6·branch）；2) area inefficiency（bounding box density = n/(w·h)，`1.5-density` 取代粗糙 `rows*cols==n` 矩形判断）；3) cross-house strength（houseSpread 分层 2 宫 1.4 / 3 宫 1.8 / 4+ 宫 2.2，取代单一跨宫 1.4）。单变量：v1→v2，gb 皆 0.4。不碰其它 lever。

**A/B 结果**（`scripts/b3b3-topology-v2.cjs --count 20 --seed 20260810 --collected 8`）：

| ver | top4Share | singleton | complex | H | ratioMean | avgScore | unique |
|---|---|---|---|---|---|---|---|
| v1（control，gb=0.4 冻结基线） | **49.2%** | 3.5% | **39.9%** | **2.707** | 21.8% | 518.8 | ✅ |
| v2（gb=0.4） | 52.9% | 4.3% | 37.3% | 2.526 | 20.9% | 526.3 | ✅ |

**Gates**：目标 top4<47% ❌、complex>42% ❌。**v2 全面差于 v1**：top4 升（49.2→52.9）、complex 降（39.9→37.3）、H 降（2.707→2.526）、ratio 略降。难度/唯一解稳定。

**机理诊断（重点）**：v2 是**更强的判别器**——跨宫/分支奖励更高、密度惩罚更陡。在 gb=0.4 混合下，等效有效偏置强度高于 v1，**越过甜点触发与 gb=0.6 相同的 collapse**：每个笼被强推往同一类"最复杂"形状，跨笼多样性反降（H 2.526），top-4 集中度回升。**结论：评分函数做"温和多样化"而非"最大化单笼复杂度"。加更多特征/更强奖励≠帮助，只会 overshoot。**

**结构性洞察（complexShare 的天花板）**：`complex = crossHouse && size>=4`。当前 size 分布 2:14.5% / 3:25.7% / 4:24.5% / 5:31.9%——**约 40% 的笼（size 2/3）结构上不可能 complex**。topologyBiasWeight 只重塑"笼生长路径"，不改变"有多少 size-4/5 笼"。**complexShare 卡在 ~40% 的根因是 size 分布，不是形状评分。** 要突破 complex>45%，杠杆在 sizeWeights（更多 size-4/5、更少 size-2/3），而非 topology 评分——但那是另一个独立变量，且需防难度漂移。

**决策**：**v2 不采纳，回退 v1（gb=0.4 冻结基线不变）。** 向 Gate C 的下一步两条路：A) 换杠杆到 size distribution（sizeWeights 单变量实验，防难度漂移）；B) 若坚持评分为主，需重扫 gb 让 v2 落在更弱强度——但违反"不扫 gb"纪律，暂不推荐。

### 6.8 B3-B4：crossHouse diversity penalty（已完成，负结果）

> **设计**：采纳用户「方案 B」——crossHouse 奖励随局内已放置的 crossHouse 浓度衰减（`1.4 * (1 - 0.5*min(share,0.8))`，share 0→1.4、0.8+→0.84），抑制"每笼都追 crossHouse"的 mode-seeking。单变量：control(v1) vs crossHouseDiversity=true，gb 皆 0.4、topologyScoreVersion 皆 1。不碰 solver/rule45/merge/λ/growthBias/sizeWeights/selection。

**A/B 结果**（`scripts/b3b4-crosshouse-diversity.cjs --count 20 --seed 20260810 --collected 8`）：

| arm | top4Share | complex | H | singleton | ratioMean | avgScore | unique |
|---|---|---|---|---|---|---|---|
| control（v1，div=false） | **49.2%** | **39.9%** | **2.707** | 3.5% | 21.8% | 522.5 | ✅ |
| div=true | 55.0% | 36.1% | 2.597 | 1.9% | 19.3% | 497.5 | ✅ |

**Gates**：目标 H≥2.75 ❌、top4≤48 ❌、complex≥40 ❌。**div 全面差于 v1**：top4 升、complex 降、H 降、ratio 降。

**机理诊断（关键修正）**：跨宫衰减**反而把概率质量推回 canonical 吸引子**。当某个笼拿不到跨宫满额奖励时，"释放"的偏好落回非跨宫空间——而那正是被 v1 弱惩罚的 domino/straight/box canonical 簇。衰减跨宫奖励 ≠ 增加中间多样性，而是**让 canonical 簇更占主导** → top4 升、H 降。**这修正了"跨宫 mode-seeking → 衰减可提 H"的假设：非跨宫空间本身就不多样，减少跨宫只是把质量移向更集中的 canonical 簇。**

**综合诊断（B3-B3 + B3-B4 双负结果）**：拓扑评分的偏好空间本质是**双模态**——"复杂跨宫簇" vs "canonical 簇"。任何在这两个簇之间重加权（v2 过度奖励复杂、B3-B4 衰减跨宫）都只是**在两峰间搬移质量，无法创造中间多样性**。这从两个相反方向证实用户的架构判断：**局部 per-step topology 评分无法修复整局 shape distribution（H/top4）。** 需要的是**局级 diversity controller**（跟踪本局已用 shape，主动避免重复），而非继续调局部评分。

**决策**：**B3-B4 不采纳，回退 v1（gb=0.4 基线不变）。** 下一刀方向：实现局级 diversity controller（shape 使用计数反馈进 growCage），直接优化 H/top4；这与用户"cage-level diversity controller"判断一致。

### 6.9 B3-C1a：Shape Histogram 观测（已完成，观察型）

> **设计**：局级 diversity controller 的第一层——**观察**，不改生成。对每个 cage 做 canonicalize（dihedral 归一）+ archetype 分类（domino/straight/rect/L/T/cross/zigzag/hook/irregular/singleton），聚合整批样本，回答用户问题："top4 到底由什么组成？是 domino 过量，还是 straight3 过量？"

**⚠️ 方法论修正**：v1 脚本用 `gen.generate({})` 循环，seed 不推进 → 100 样本全是同一关重复（所有 shape count 均为 100 的整数倍）。已修正为复刻 `generateBatch` 的 `seed+i*1000` 推进，重跑互异样本。

**结果**（`scripts/b3c1a-shape-histogram.cjs --count 50 --seed 20260810 --collected 8`，互异样本）：

| 指标 | control(gb0.4 冻结) | B3-C1a(50关互异) |
|---|---|---|
| top4Share | 49.2% | **51.5%** |
| complexShare | 39.9% | 37.3% |
| entropyH | 2.707 | **2.644** |
| singletonRatio | 3.5% | 3.3% |
| ratioMean | 21.8% | 20.5% |
| avgScore | 518.8 | 533 |
| uniqueAll | ✅ | ✅ |

> 注：B3-C1a 用 50 关大样本，与 20 关冻结基线的数值天然有统计波动（top4 49→51.5、H 2.707→2.644），**不代表基线漂移**，仅作本节分布观察的原始样本。

**top4 composition（回答用户 A/B 假设）**：

| rank | shapeID | archetype | share |
|---|---|---|---|
| 1 | `0,0|0,1|1,0` | **L（3格拐角）** | 14.9% |
| 2 | `0,0|0,1|0,2|1,0|1,1` | **T（5格）** | 14.3% |
| 3 | `0,0|0,1` | **domino** | 11.5% |
| 4 | `0,0|0,1|0,2` | **straight-3** | 10.9% |

**archetype 分布**：T 25.4% / straight 16.3% / L 14.9% / hook 13.6% / domino 11.5% / zigzag 8.1% / rect 6.3% / singleton 3.3% / cross 0.6%。

**诊断结论（关键）**：用户假设的两种可能（A: domino 18%+straight3 15%+rect4 10%；B: domino 30%+straight3 12%+rect4 7%）**都不成立**。真实 top4 是 **L 三格拐角 + T 五格 + domino + straight-3** 四类各占 ~11-15%，**没有单一 archetype 占绝对主导**（最大 T 也只 25%）。但注意：**L 三格拐角（14.9%）和 T 五格（14.3%）是"简单紧凑形"而非 trivial**——它们能进 top4 说明 canonical 簇的主力不是纯 domino/straight，而是**中等紧凑形**。zigzag 仅 8.1%、cross 仅 0.6%，高复杂度骨架仍稀缺。

**B3-C1a 对 diversity controller 的启示**：
1. top4 是**四类近似均分**，不是单峰 → 软 diversity pressure 不能只针对单一 shape，需对 canonical 簇（L/T/domino/straight）整体施加。
2. L/T 是"简单紧凑形"，惩罚过度会伤 complexShare（与 B3-C1c"只罚 canonical、不罚 complex"一致）。
3. 高频 canonical shape 集中在 **size 3-5** → diversity controller 应结合 size 维度，避免只对形状加税而漏掉 size 分布天花板（§6.7 结构性洞察）。
4. zigzag/cross 稀缺 → 单纯"鼓励已用越少越优先"可能继续生产 L/T 变体而非真正非凸形，需在 B3-C1b 中验证是"分散 canonical"还是"引向复杂骨架"。

**产物**：`scripts/b3c1a-shape-histogram.cjs` + `data/b3c1a-shape-histogram.json`（50 关互异原始）。**下一步**：B3-C1b soft diversity pressure（shape 使用计数反馈进 growCage，`weight *= 1/(1+usage*alpha)`，只对 canonical 簇加税，不禁止、不新建 shape）。

### 6.10 B3-C1b：Ranking-side Shape Diversity Tax（已完成，负结果）

> **设计**：采纳用户「B3-C1b 切入点 = candidate ranking 层，而非 cage builder」判断。在 `fitness` 注入 `- shapePenalty * W`：
> ```
> fitness = diff - ratio*100 - topo*25 - shapePenalty*W，W ∈ {0,5,10,15,20}
> ```
> `shapePenalty = canonical 簇（L/T/domino/straight）占比集中度惩罚 ∈ [0,1]`：`(canonicalShare - 0.45) * 5`，clamp 到 [0,1]，超 45% 基线起罚。只对 canonical 簇加税（B3-C1c 原则），不罚 complex/rect，不改 builder。单变量：仅 `shapeDiversityWeight`，generator 冻结 v1+gb0.4+λ25+suppress+proposal off。

**A/B 结果**（`scripts/b3c1b-shape-diversity.cjs --count 20 --seed 20260810 --weights 0,5,10,15,20 --collected 8`）：

| W | top4Share | complex | H | singleton | ratioMean | score | meanShapePenalty | unique |
|---|---|---|---|---|---|---|---|---|
| 0（control） | **54.0%** | 37.4% | **2.620** | 3.9% | 24.2% | 520 | 0.815 | ✅ |
| 5 | 54.9% | 37.5% | 2.621 | 3.7% | 24.2% | 523.8 | 0.815 | ✅ |
| 10 | 54.6% | 38.7% | 2.597 | 3.7% | 24.3% | 550 | 0.858 | ✅ |
| 15 | 55.7% | 37.4% | 2.569 | 3.2% | 24.0% | 523.8 | 0.871 | ✅ |
| 20 | 55.4% | 37.2% | 2.586 | 3.2% | 23.9% | 523.8 | 0.871 | ✅ |

**Gates**：目标 top4<48 ❌（全部 54-55%）、H>2.75 ❌（全部 <2.63）、complex 保持 ✅、singleton<5 ✅、难度±5% ✅、unique ✅。**tax 全面无去集中效果，top4 甚至微升。**

**机理诊断（关键，饱和失效）**：canonical 簇（L/T/domino/straight）在每位候选里稳定占 **~68%**（远超 45% 基线），`(0.68-0.45)*5 = 1.15` clamp 后 **sp 几乎恒为 0.81-0.87**（control 0.815 已接近饱和）。**penalty 对"所有候选"都近乎相等 → 在 fitness 里是常数偏置，无 discriminating power** → 无法改变候选间相对排序 → selection 依然由 diff 主导，top4 不动（微升属噪声）。这直接印证并细化你的判断：**selection 层对 pool 内排序的杠杆已耗尽（B3-B1b Phase1 已证），现在连对 canonical 的惩罚也因"所有候选都高 canonical"而无法区分。**

**综合结论（B3-C1b 与 B3-B3/B3-B4 归并）**：三次独立负结果从三个方向收敛到同一架构结论：
1. B3-B3（更强复杂评分）→ 双模态 mode collapse；
2. B3-B4（跨宫衰减）→ canonical 簇占主导；
3. B3-C1b（ranking 层罚 canonical）→ penalty 饱和，无法区分候选。
**局部评分（无论放 topology 权重还是 shape 权重）都无法修复整局 shape distribution。** selection 只能"在 pool 内排序"，而 pool 内所有样本的 canonical 浓度都高，ranking 无从下手。**唯一已证有效的供应杠杆仍是 B3-B2 growth bias（直接改 growCage 的 frontier 选择）。**

**决策**：**B3-C1b 不采纳，回退 v1（gb=0.4 基线不变，`shapeDiversityWeight` 默认 0 保持关闭）。** 下一步方向收敛为：**B3-C1c 局级 soft diversity pressure**——把 shape usage 计数反馈进 `growCage`（supply 层，与 B3-B2 同杠杆），`weight *= 1/(1+usage*alpha)`，只对 canonical 簇加税、不禁止不新建。这与用户"cage-level diversity controller"原始判断及 B3-C1b 失败共同指向：**必须改 supply 的局部生长，而非 selection 的全局排序。**

### 6.11 B3-C1c：Growth-time Shape Usage Pressure（已完成，<3pp 接受）

> **设计**：采纳用户「C1c 唯一合理入口 = growCage frontier selection，做 shape usage soft pressure」判断。在 `growCage()` 的 `weightedEmptyPick` 内：
> ```
> w = (1-gb)*1 + gb*topologyScore(cell)          // growthBias 正交层
> w *= 1/(1 + used*W)                            // 叠加 shape usage soft pressure
> ```
> `used = 局级 shapeUsage[canonicalizeShape(cageCells + candidate)]`（1-step lookahead），W ∈ {0,0.1,0.2,0.3,0.5}。**只对已重复的 canonical shape 减吸引，不禁止、不新建**。单变量：仅 `shapeDiversityWeight`，generator 冻结 v1+gb0.4+λ25+suppress+proposal off。

**A/B 结果**（`scripts/b3c1c-shape-pressure.cjs --count 20 --seed 20260810 --weights 0,0.1,0.2,0.3,0.5 --collected 8`）：

| W | top4Share | complex | H | singleton | ratioMean | score | unique |
|---|---|---|---|---|---|---|---|
| 0（control） | 54.0% | 37.4% | 2.620 | 3.9% | 23.9% | 525 | ✅ |
| 0.1 | 53.4% | 37.2% | 2.652 | 3.4% | 24.0% | 516.3 | ✅ |
| **0.2** | **51.6%** | **37.4%** | **2.660** | 2.8% | **24.5%** | 528.8 | ✅ |
| 0.3 | 52.3% | 34.0% | 2.616 | 3.0% | 23.3% | 525 | ✅ |
| 0.5 | 54.1% | 34.2% | 2.578 | 3.0% | 20.5% | 530 | ✅ |

**Gates**：top4<48 ❌（W=0.2 仅 51.6%）、H>2.75 ❌（最高 2.66）、complex 保持 ✅、ratio 不退化 ✅、难度/唯一解 ✅。**W=0.2 有效但 <3pp。**

**机理诊断**：frontier 压力只能在「同为 canonical 的候选」之间搬移质量，或把少量非 top-4 候选推高。它位移的是 top-4 canonical 之间的相对权重，却无法批量制造非 canonical 形状——**天花板由 size-2/3/5 的结构性 canonical 覆盖决定**（size-2=domino、size-3=straight/L、size-5=T 均为 top-4）。压力有效（54→51.6）但饱和于 ~51%。

**决策**：W=0.2 为**唯一净赢**，记为冻结候选（top4 51.6%、H 2.66、comp 保持、ratio 24.5%）。但按用户判据（改善 <3pp → 接受 shape ceiling），C1c 落在 accept-ceiling 区，不足以单独达成 Gate C。下一刀判断 size 分布是否为主因 → B3-C2。

### 6.12 B3-C2：SizeWeights Distribution Shift（已完成，负结果 → architecture ceiling）

> **背景修正**：`_getCageSizeWeights()` 按 targetStar 返回，star=4 实为 `{2:.10, 3:.25, 4:.30, 5:.33}`（size-4+5 已占 0.63）。实测 size 分布 s2=12 / s3=25 / s4=26 / **s5=34**——**size-5 主导，非 size-2/3**。top-4 canonical 覆盖 domino=size2、L/straight=size3、T=size5。故降 top4 杠杆应为压低 2/3/5、提高 4。
>
> **设计**：纯实验 shim——构造后覆盖实例 `_getCageSizeWeights()`，不改源码。单变量：仅 sizeWeights，`shapeDiversityWeight=0`（隔离 size 效应）。`scripts/b3c2-size-shift.cjs --count 20 --seed 20260810 --collected 8`。

**A/B 结果**（4 配置，每 20 级）：

| cfg | 改动 | top4 | comp | H | ratio | score | size 分布 |
|---|---|---|---|---|---|---|---|
| control | star=4 baseline | 54.0% | 37.4% | 2.620 | 23.9% | 525 | s2=12 s3=25 s4=26 s5=34 |
| s1 | 压2/3推4（温和） | 53.0% | **43.7%** | 2.619 | 24.2% | 545 | s5=38 |
| s2 | 深推4（激进） | 54.0% | 43.9% | 2.627 | **20.3%** | 536.3 | s5=41 |
| s3 | 用户参考配置 | 55.1% | 35.5% | 2.518 | 22.3% | 526.3 | s5=26 |

**Gates**：**无一配置 top4<48（53-55%）**。s1/s2 complex 升到 44%（跨宫复杂笼增加）但 top4 不动；s2 ratio 退化；s3 压 s5 成功但 top4 反升。

**机理诊断（锁定根因）**：
1. **size-5 是顽固 top-4 来源（T 形态）**——s1/s2 深推 size-4 时补偿系统（s5:1.2）+ 生长动力学反使实际 s5 升到 38-41%，top4 卡死 53-54%。
2. s3 是唯一真压 s5（34→26%）配置，top4 却反升至 55.1%——压 s5 的收益被同时抬高的 size-2 domino（16%）抵消。
3. size-4 增加确实制造更多跨宫复杂笼（comp 37→44%），但**不降低 top4 canonical 集中度**——释放的质量流进 size-5 T，而非流入非 canonical 形状。

**结论**：**size 分布不是 top4 canonical 集中度的主因**。无论 size 桶怎么洗牌，top4 都卡在 53-55%，因为 canonical 形状（尤其 size-5 T）由 `growCage` 的形状 **birth 概率**决定，不随 size 权重迁移。**判定 architecture ceiling。**

**综合冻结决策**：C1c（2.4pp）+ C2（全负）收敛 → **接受 shape ceiling，freeze generator，不进入架构重写**（"换 generator architecture"仅当出现可量化收益缺口时才立项，当前顶 4 集中度的玩家感知已通过 C1c W=0.2 改善）。**冻结配置 = C1c W=0.2**（top4 51.6%、H 2.66、comp 保持、ratio 24.5%）。B3-C2 的 s1/s2 虽有 comp 提升，但 top4 未改善且 s2 ratio 退化，**不采纳为默认**，脚本保留可复现。

### 6.13 B3-FINAL：常驻化 + 冻结（已完成，2026-08-10）

> **阶段切换**：experiment phase → productionization + regression lock + quality monitoring。不再开新实验（不碰 B3-C3，已有充分证据证明剩余 gap 属 generator shape prior，是 architecture redesign 项目而非参数问题）。

**常驻化**（`cage-generator-v9.cjs` 构造默认，全部可 override）：完整冻结配置已设为默认，生产路径（CLI / `generate-pool.cjs`）无需显式传参即生效：

```js
objective.enabled        = true     // B3-A 择优（默认开启）
objective.ratioWeight    = 100
objective.topologyWeight = 25       // λ（B3-FINAL 冻结）
objective.maxCollected   = 8
growthBias               = 0.4      // B3-B2（冻结）
shapeDiversityWeight     = 0.2      // B3-C1c（冻结）
topologyScoreVersion     = 1        // v1（B3-B3 v2 负结果，回退）
suppressSingletons       = true     // B3-B1a
sizeWeights              = targetStar=4 默认（B3-C2 判非主因，不调）
selection / uniqueness   = 不动
```

**生效校验**（`scripts/b3-final-regression.cjs` 默认构造打印）：`growthBias=0.4, shapeDiversityWeight=0.2, objective.enabled=true, topologyWeight=25, ratioWeight=100, maxCollected=8` ✅

**冻结回归**（100 级，seed 推进互异，默认构造，`data/b3-final-regression.json`）：

| 指标 | 冻结基线(20级) | 回归(100级) | 判定 |
|---|---|---|---|
| top4Share | 51.6% | **53.0%** | ✅ [50,53]% |
| entropyH | 2.66 | **2.619** | ✅ ≥2.60 |
| complex | 37.4% | **36.7%** | ✅ 不降>2pp |
| ratio.mean | 24.5% | **23.3%** | ✅ 不退化 |
| score | 528.8 | **525** | ✅ ±30 |
| singleton | 2.8% | **4.1%** | ✅ <5% |
| uniqueAll | true | **true** | ✅ |

**7/7 gate PASS**。51.6% vs 53.0% 差异为样本量方差（20 vs 100 级），同区间稳定，确认 C1c 收益非 sample noise。

**冻结的"不要碰"清单**：λ 不再调（saturation 已证）；W 不再调（0.2 甜点，>0.2 无增益/退化）；sizeWeights 不再调（非 binding constraint）；selection/solver 不改（那是另一项目）；`reshapeToComplex` 不 reopen（历史诊断样本）。

**最终架构结论**：B3 系列已将参数空间探索到边界。剩余 top4 canonical 集中度（~53%）属 generator shape prior / birth distribution 的结构性偏置，不值得继续用局部参数挖。这是完整 research loop 的结束点。

---

## 7. 回归纪律

**任何 generator / production 改动，都必须回答：**

> 是真的提升，还是只是随机波动？

判定方式：
1. 用固定 seed 重跑 `cage-audit.cjs --sample 8`
2. 与 `baseline.json` 逐项对比（星档分布、笼推理率、难度分、操作分布）
3. 只有当指标**系统性**改善（非 ±1 波动）才可出新的 Baseline v1
4. 新 Baseline 需更新本文件 + 覆盖 `baseline.json` / `audit_snapshot.json`

---

## 8. 关联文件

- `scripts/cage-audit.cjs`        — 观察层（审计脚本）
- `scripts/freeze-cage-audit.cjs` — 基线冻结脚本
- `scripts/cage-generator-v9.cjs` — 当前生成器（v9）
- `scripts/cage-topology-entropy.cjs` — B3-B0 拓扑熵审计
- `scripts/b3b1a-singleton-suppression.cjs` — B3-B1a A/B 验证
- `data/cage-topology-entropy-v9.json` — B3-B0 audit 原始输出
- `data/b3b1a-singleton-suppression.json` — B3-B1a A/B 原始输出
- `core/solver-aware-acceptance.js` — Step B1 acceptance 判定层
- `scripts/acceptance-gate-test.cjs` — Step B1 诊断驱动
- `data/cage-audit-report.json`   — 最近一次审计报告（原始输出）
- `data/acceptance-gate-result.json` — Step B1 诊断明细
- `tests/cage_generator/*`        — 冻结的回归基线
- `scripts/b3c1a-shape-histogram.cjs` — B3-C1a shape 直方图观测
- `data/b3c1a-shape-histogram.json` — B3-C1a 50 关互异原始输出
- `scripts/b3c1b-shape-diversity.cjs` — B3-C1b ranking-side shape diversity tax A/B
- `data/b3c1b-shape-diversity.json` — B3-C1b 负结果原始输出
- `scripts/b3c1c-shape-pressure.cjs` — B3-C1c growCage frontier shape usage pressure A/B
- `data/b3c1c-shape-pressure.json` — B3-C1c 结果（W=0.2 冻结候选）
- `scripts/b3c2-size-shift.cjs` — B3-C2 sizeWeights distribution shift A/B（负结果，保留可复现）
- `data/b3c2-size-shift.json` — B3-C2 负结果原始输出
- `scripts/b3-final-regression.cjs` — B3-FINAL 常驻化回归（默认构造验证 + 100 级 sanity）
- `data/b3-final-regression.json` — B3-FINAL 冻结回归结果（7/7 gate PASS）