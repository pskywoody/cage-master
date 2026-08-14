# B4 Research Log

> **状态：FROZEN / ARCHIVED（2026-08-11）** · 起始：2026-08-10
> **冻结原因**：B4-G1 证明 size4 重定向 + size5 T 抑制均无法突破 65% headRatio，head≈65-67% 为当前 tiling 架构结构性地板。B4 全部方向（birth/selection/size/archetype）已排除，实验闭环。
> 对照基准：`docs/B4/benchmark-baseline.md`
> **B3-FINAL 生产基线全程未动。**

---

## 日志

### 2026-08-10 · B4 Branch 初始化

- 建立 branch skeleton（docs/B4 + experiments/B4 + config/research/B4）。
- 冻结 B3-FINAL benchmark 为唯一对照基准。
- 定义 B4-A/B/C/D 四方向与严格执行顺序。

---

### 2026-08-10 · B4-A1 第一轮：FAIL（记录，不微调）

- 审计：`docs/B4/B4-A1-audit.md` → 设计：`docs/B4/B4-A1-design.md`。
- 机制：shape-template birth（出生时从冻结先验模板库采样形状原型，原子放置，失败回退 greedy）。
- 基准：N=30，seed=20260810，λ=25 冻结，gb=0.4/W=0.2/suppress/objective 冻结。
- 结果（prior ON vs baseline）：

| 指标 | baseline | prior ON | 判定 |
|---|---:|---:|---|
| top4Share | 52.7% | 56.1% | ↑ +3.4pp（目标↓，反了）FAIL |
| entropyH | 2.626 | 2.602 | ↓ -0.024（目标 ≥2.60，勉强过） |
| complexShare | 34.7% | 34.0% | ↓ -0.7pp（目标不下降）FAIL |
| ratio.mean | 21.8% | 22.4% | ↑ +0.6pp（过） |
| avgScore | 530 | 499.2 | ↓ -30.8（±30 边界）FAIL |
| uniqueAll | true | true | 过 |

- **结论：FAIL。** 出生先验不仅没压 top4Share，反而使其 +3.4pp；complex 不升反降。selection 需更多修正（score 下探、耗时增加），与假说相反。
- **失败机制（诊断，供 B4-B/C/D 参考）**：复杂模板笼「碎片化」棋盘——不规则笼侵占格子后，剩余空隙被 greedy 填成更多小 canonical 笼（domino/straight），净 canonical 占比上升；部分模板经 `_balanceByMerging`/`mergeSmallCages` 后未保留 complex 属性（complexShare 反降）。
- **不微调**：按 B4-A1 原则，机制本身未改善即记录失败，不扫 templateBias/权重。
- 产物：`scripts/b4a1-benchmark.cjs`、`data/b4a1-benchmark-n30.json`、`data/b4a1-smoke.json`。

---

### 2026-08-10 · B4-B1.5 单点机制验证：FAIL（Case C，记录，不微调）

- **前提**：B4-B0 假说「能否改变 selection 对 topology basin 的覆盖」；B4-B2 机制 = 在 fitness 加 `canonicalNovelty`（奖励 pool 内稀有 canonical fingerprint），不改生成。
- **B4-B1 初判**：0.05/0.1/0.2 权重全部落在 noise floor（novelty·0.2=0.2 << ranking 信号 30-60），`noveltyRankChanges=0` → 判定为 inert regime（信号太弱），非机制失败。
- **B4-B1.5 修正**：单点机制可见性测试，weight=30（novelty∈[0,1] → 贡献 0-30，进入同量级），只验证机制是否进入有效 selection 路径，不优化指标。
- **基准**：N=30，seed=20260810，λ=25/gb=0.4/W=0.2/suppress/objective 冻结，只变 noveltyW ∈ {0, 30}。
- 结果（baseline vs B4-B w=30）：

| 指标 | baseline | B4-B w=30 | 判定 |
|---|---:|---:|---|
| noveltyRankChanges | 0 | **0** | 机制未启用（Case C root）FAIL |
| top4Share | 52.4% | 53.0% | +0.6pp（≤base+3pp，B3 稳定） |
| entropyH | 2.630 | 2.607 | ↓ -0.023（≤0.03，过） |
| complexShare | 35.2% | 34.5% | ↓ -0.7pp（不下降，FAIL） |
| ratio.mean | 21.1% | 21.3% | +0.2pp（过） |
| avgScore | 528.3 | 521.7 | -6.6（±30，过） |
| uniqueAll | true | true | 过 |
| Hcanonical | 1.988 | 1.983 | ≈不变（未↑）FAIL |

- **结论：Case C（FAIL）。** weight=30 进入同量级后 novelty 仍零翻转，证明 selection-side canonical novelty 在当前 fitness landscape 下无效，问题不在权重而在机制路径。
- **失败机制（诊断，供 B4-C/D 参考）**：`levelCanonicalFingerprint` 为整关 canonical family 拼接串，几乎每关唯一（fp=30/30），novelty=1/(1+poolFreq)≈1.0 对候选恒定 → 候选间 novelty 无差异，无法改变择优。整关级 fingerprint 过粗/过判别，产生不了可区分的新颖度信号。
- **不微调**：按规则不改 fingerprint、不扫权重（会重蹈 B4-A——为指标救机制），直接记录 FAIL。
- **产物**：`scripts/b4b-benchmark.cjs`、`data/b4b-benchmark.json`、`data/b4b-smoke.json`、`data/b4b-smoke2.json`。

---

### 2026-08-10 · B4-D0 candidate topology instrumentation：候选池已丰富，selection 未淘汰 diversity

- **前提**：B4-B 证明整关级 fingerprint novelty 无效（信号恒定）。B4-D 采用③多目标加权并行 + 吸收 per-cage family coverage；验收回 B3-FINAL 口径，不设 noveltyRankChanges gate。
- **机制**：新增 `candidateTopologyProfile(cages)`（per-cage canonical family 粒度：familyCount / entropy / top1 / top4 集中度），在候选择优循环对每个 inRange 候选记录，并标记最终 winner。纯测量，不改 selection、不加权（canonicalNoveltyWeight=0）。
- **基准**：N=30，seed=20260810，λ=25/gb=0.4/W=0.2/suppress/objective 冻结，`canonicalProfile=true`。
- 结果：

| 指标 | 值 | 解读 |
|---|---:|---|
| poolHfamily.mean | 1.695 | 候选池内部 family 分布熵——已丰富 |
| winnerHfamily.mean | 1.688 | winner 与 pool 几乎一致 |
| Δ(pool−winner) | 0.007 | selection 几乎未淘汰 diversity |
| poolHighWinnerLow | 7/29 | 仅 7/29 关出现「pool 高 winner 低」 |
| poolCollapsed | 0 | 候选池从未塌缩 |

- **结论：分叉「待定」但指向明确。** 候选池内部 family diversity 已丰富（poolH=1.695，零塌缩），且 diff 择优没有淘汰它（Δ≈0）。这**否定了「selection 用难度把 diversity 挤掉」的假设**。
- **关键洞察（供 B4-D1 设计）**：每个候选内部 family 已多样（高 poolH），selection 也保留它（winnerH≈poolH）；但跨 level 的 Hcanonical 在 B4-B 中仅 1.988 且 familyCount 仅 10——已接近 ln(10)=2.30 均匀上限。说明 canonical diversity 已接近该系统饱和，瓶颈不在 selection 单关内，而在**跨 level 的 family 使用频率收敛**（不同关反复用同一批 family）。
- **下一步修正**：B4-D1 的加权不应是「单关内 diversity 税」（单关已多样，无效），而应引入**跨 level 记忆**——per-cage family 的跨关罕见度作为 selection 的 cross-level novelty 项（B4-B 用整关 fingerprint 失败，但 per-cage family 有梯度，poolH 高即证明）。
- **产物**：`scripts/b4d0-benchmark.cjs`、`data/b4d0-benchmark.json`、`data/b4d0-smoke.json`。

---

### 2026-08-10 · B4-D0.5 family frequency distribution：确认 family basin 收敛（Case B）

- **前提**：B4-D0 把瓶颈定位到「跨 level family reuse」，但引入 cross-level memory 前需确认 basin 收敛是否真实存在，先纯测量不引入机制。
- **机制**：复现一致的 canonicalizeShape，统计冻结 benchmark 的全局 family 直方图、top-k 集中度、Hglobal、跨关 new/reuse turnover、family lifespan。纯测量，不加权。
- **基准**：N=30，seed=20260810，λ=25/gb=0.4/W=0.2/suppress/objective 冻结。
- 结果：

| 指标 | 值 | 解读 |
|---|---:|---|
| uniqueFamilyCount | 10 | canonical family 种类仅 10 |
| headFamilyLockCount | 4 | 4 个 family 出现率 ≥80%（30/30, 30/30, 29/30, 27/30）|
| top1/top4/top8 share | 15.8% / 61.1% / 90.5% | 前 4 占 61%，前 8 占 90% |
| Hglobal | 2.197 | vs ln(10)=2.303，接近均匀但被 headLock 掩盖 |
| turnover 前半/后半 avgNew | 0.67 / 0 | 后半段不再产生新 family |
| Hglobal/Huniform | 0.954 | H 对「每关结构性重复」不敏感，不作 basin 判据 |

- **结论：Case B，family basin 收敛确认。** 4 个高概率 family（多为 small canonical：domino、3-cell straight、L 型变体）锁死近每关必现，top4=61%，长尾 6 个 family 稀薄（6~16 次/30），后半段 newFamily=0 证明搜索空间收敛。**瓶颈确为跨 level family reuse**。
- **关键洞察（供 B4-D1-1 设计）**：不是「没有 diversity」，而是「diversity 集中在 4 个 basin」。Hglobal 看似高（0.954×ln10）是因为 10 个 family 都出现，但集中度 top4=61% 才是真实信号——H 熵对头部锁死不敏感，需用 top-k share + headLock 而非 H 作 basin 判据。
- **下一步**：进入 B4-D1-1（跨关 family 罕见度）——只对 family 贡献、不对 cage shape 强制。
- **产物**：`scripts/b4d05-benchmark.cjs`、`data/b4d05-benchmark.json`、`data/b4d05-smoke.json`。

---

### 2026-08-10 · B4-D1-1 cross-level family rarity：机制生效但 diversity 未提升（Review）

- **前提**：B4-D0.5 确认 4-family basin（top4=61%，headLock=4）。B4-D1-1 采用 rarity bonus（奖励稀有 family，不罚不强制），验收回 B3-FINAL 口径。
- **机制**：`familyRarity = Σ_候选内每个canonical family 1/sqrt(1+globalFamilyCount)`，`fitness = baseFitness - familyNoveltyWeight*r familyRarity`；`_familyCounts` 跨关累计（generateBatch 内累积），`_familyRankChanges` 诊断翻转。与 B4-B 整关 fingerprint 不同——per-cage family 维度，信号有梯度。
- **基准**：N=30，seed=20260810，λ=25/gb=0.4/W=0.2/suppress/objective 冻结，只变 familyNoveltyWeight ∈ {0, 3}。
- 结果（baseline vs B4-D1 w=3）：

| 指标 | baseline | B4-D1 | 判定 |
|---|---:|---:|---|
| familyRankChanges | 0 | **1** | 机制进入 selection（略强于 B4-B 的 0）|
| Hcanonical | 2.001 | 1.993 | ≈不变（未 +0.1）FAIL |
| top4FamilyShare | 76.4% | 77.0% | ↑ 0.6pp（未 ↓3pp）FAIL |
| headFamilyLockCount | 4 | 4 | 未解锁 |
| complexShare | 35.1% | 35.0% | ≈（不降）过 |
| ratio.mean | 21.5% | 21.7% | +0.2pp（过） |
| avgScore | 515.8 | 530 | +14.2（±30）过 |
| uniqueAll | true | true | 过 |

- **结论：Review（b3Stable=true，diversityUp=false）。** rarity 确实进入 selection（familyRankChanges=1>0），且 B3 全部稳定，但 Hcanonical/top4 均未达阈值——diversity 未提升。
- **失败机制（诊断，供 B4-C 参考）**：`familyRankChanges=1` 极低，说明候选内 family 组成**高度同质**——候选池几乎只用 headLock 那 4-6 个 basin family 的组合。rarity 只能给「候选里已存在的稀有 family」加分；若候选池根本不含稀有 family，rarity 无从加分。这与 B4-A 结论一致：**selection 层难以补偿 generation 层缺失的 family 多样性**。
- **关键洞察**：B4-D0 显示 poolH=1.695（单关内多样），但那是同一批 basin family 的再组合；跨关看每个候选用同一批 family（headLock=4）。rarity 对同质候选几乎无区分度。
- **下一步选择**：按验证原则不扫权重（familyRankChanges=1 说明即使加大权重，候选内无稀有 family 也无从加分）。瓶颈已三度指向 generation/search → 建议回 B4-C。
- **产物**：`scripts/b4d1-benchmark.cjs`、`data/b4d1-benchmark.json`、`data/b4d1-smoke.json`、`data/b4d1-smoke2.json`。

---

### 2026-08-10 · B4-C0 generation gap quantification：瓶颈在 head concentration，不在 family 数量/组合数

- **前提**：B4-A/B/D1 三次独立失败指向「候选池缺有效 family 维度」，但需量化是「family 数量少」还是「family 组合窄」还是别的。纯测量，不改生成。
- **机制**：扩展 canonicalProfile instrumentation，累计候选池 `_poolFamilyUnion`（family 并集）、`_poolFamilyCombos`（不同组合数）、`_poolFamilyRank`（family 候选出现次数）。
- **基准**：N=30，seed=20260810，λ=25/gb=0.4/W=0.2/suppress/objective 冻结，`canonicalProfile=true`。
- 结果：

| 指标 | 值 | 解读 |
|---|---:|---|
| uniqueFamiliesInPool | 10 | 候选池已探索全部 canonical family |
| uniqueFamiliesInWinners | 10 | winner 也用了全部 10 个 family |
| coverage (winners/pool) | **100%** | 不缺 family 数量 |
| uniqueFamilyCombosInPool | 56 | 候选池有 56 种不同 family 组合 |
| uniqueFamilyCombosInWinners | 22 | winner 用了 22 种（比例 39%）|
| headLockPool | **9** | 9/10 family 在候选中出现率 ≥80%（几乎每候选都有）|
| top4FamilyHitShare | 60.5% | 前 4 个 family 占全部候选 family 出现的 60.5% |

- **结论：瓶颈是 head concentration（family 出现频次的头部倾斜），而非 family 数量或组合数。** 候选池有 56 种组合、10 个 family 全覆盖，但几乎每个候选都包含全部 9 个高频 family——family 集合高度重叠，只有尾部有差异。这解释了 D1 的 rarity 为什么只有 1 次翻转：候选间 rarity 分数差异极小（绝大多数 family 都高频）。
- **对后续的启示**：selection 层的 diversity objective 之所以失效，不是因为 generation 缺 family，而是因为**每个候选的 family 构成太相似**——head family 几乎必现，尾部 family 稀有但贡献小。要打破 basin，需要的是「让某些候选**不包含** head family」，而「给稀有 family 加分」做不到这一点。
- **下一步方向**：候选池 family 集合高度同质 → 改 partition/search path（从出生机制上打破 head family 的必现性，而非 selection 端加权）。但 B4-A1 已证明「强行注入复杂 shape」会碎片化反弹，需另寻路径——可能的方向是**动态抑制 head family 的出生概率**（类似 B3-C1c 的 shapeDiversityWeight 但作用在 birth 阶段），而非模板注入。
- **产物**：`scripts/b4c0-benchmark.cjs`、`data/b4c0-benchmark.json`、`data/b4c0-smoke.json`。

---

### 2026-08-10 · B4-C1 cross-level family birth pressure：soft 均匀回避未打破 basin（Review）

- **前提**：B4-C0 定位瓶颈在 head concentration（9/10 family 几乎必现），且 selection 端（B/D）无法打破。用户选择「soft head-family avoidance」——在 growCage/partitionCages 的 frontier pick 阶段对 over-frequent family 做 cross-level soft 衰减，把 head family 从「必然出现」拉向「可被绕开」，而非 hard 禁止或模板注入（B4-A1 碎片化教训）。
- **机制**：`effectiveWeight = baseWeight * (1 - headFamilyPressure)`，`headFamilyPressure = globalFamilyFrequency / targetFrequency`；`targetFrequency = levels / 10`（公平份额）。只在 family 超公平份额时起压，衰减有下限 floor（weight 不归零）。跨关记忆来自 `_familyCounts`（winner 累计）+ `_familyLevels` 关数。新增 `familyBirthPressureWeight`（默认 0 = B3-FINAL 不变），注入 `weightedEmptyPick` 的 1-step lookahead canonical family。
- **基准**：N=30，seed=20260810，λ=25/gb=0.4/W=0.2/suppress/objective 冻结，`canonicalProfile=true`，只变 `familyBirthPressureWeight ∈ {0, 0.4}`（中等单点，不扫描）。
- 结果（baseline vs C1 w=0.4）：

| 指标 | baseline | C1 w=0.4 | 判定 |
|---|---:|---:|---|
| **headLockPool（pool 主指标）** | 10 | 9 | ↓ 仅 1，非「明显下降」Review |
| **poolHfamily（pool 主指标）** | 1.627 | 1.588 | ↓ -0.039 反降 FAIL |
| uniqueCombosInPool | 58 | 53 | ↓ 反降 |
| winner top4FamilyShare | 76.8% | 80.8% | ↑ +4.0pp 集中度反升 |
| winner top1FamilyShare | 21.6% | 26.4% | ↑ +4.8pp |
| Hcanonical | 1.999 | 1.892 | ↓ -0.107 |
| complexShare | 35.5% | 35.7% | 稳定（+0.2pp）过 |
| ratio.mean | 21.5% | 24.2% | +2.7pp 漂移（3pp 内过，但上移） |
| avgScore | 532.5 | 514.2 | -18.3（±30 过） |
| uniqueAll | true | true | 过 |

- **结论：Review（b3Stable=true，但 C1 主指标未达标）。** headLockPool 仅降 1（10→9），poolH 反降，winner top4 集中度反升 +4pp。soft 均匀回避**不足以打破 basin**。
- **失败机制（诊断，供后续）**：对**所有** over-frequent family 施加**均匀** soft 惩罚，只是把「哪个 head family 占优」重新洗牌（domino 30→28、L3 28→30），**不降低 head 总量**——因为所有 head family 被同等衰减，它们的相对吸引 basin 不变。压力只把笼从「某 head shape」推向「另一 head shape」，aggregate top4 反而上升。这与 B4-C0 的「强吸引 basin」判断一致：uniform 出生压力无法打破 basin。
- **判定修正**：初版自动 verdict 误判为 PASS（触发了任意 headLockPool 下降）。已修正 benchmark 的 computeVerdict：通过需 `headLockPool 降 ≥2 且 poolH 不降`，否则 Review。当前结果按严格口径为 Review。
- **下一步方向（供 B4-C2/D 参考）**：要打破 basin，需**非均匀**或**定向**信号——例如对「当前全局 top-1 family」做更强、更特异的抑制（而非对全部 head 均匀），或让世代间交替反选占优 family（anti-head cycling），或提升压力强度到触发 runner；但按实验纪律不扫权重，C1 机制本身在 w=0.4 下未达阈值即记录，不微调。
- **产物**：`scripts/b4c1-benchmark.cjs`、`data/b4c1-benchmark.json`、`data/b4c1-smoke.json`。

---

### 2026-08-10 · B4-C2 basin-level birth pressure：headLock 未下降 → 出生端非控制变量（FAIL 关键负结果）

- **前提**：B4-C1 证明 family 级均匀 pressure 只在 basin 内部「洗牌占优 family」（domino↔L3），不降 head 总量。用户推断 B4 瓶颈是 **basin-level attractor dominance**，建议 C2 改打 **basin signature occupancy** 而非 family identity——把 fine-grained family（canonical shape）聚合成 coarse structural basin（宏观吸引子），惩罚「重复结构占用」。
- **机制**：新增 `basinSignature(cells)`（线性/单折角/分叉/矩形/复杂/singleton 共 6 组，全部基于已有拓扑属性，不引入新 embedding）。与 C1 同机制、同 floor、同跨关累计，仅把 pressure source 从 `_familyCounts` 换成 `_basinCounts`：`effectiveWeight = baseWeight × (1 − basinFreq / targetFreq)`，`targetFreq = levels / BASIN_TARGET_COUNT(=6)`。新增 `basinBirthPressureWeight`。
- **基准**：N=30，seed=20260810，λ=25/gb=0.4/W=0.2/suppress/objective/canonicalProfile 冻结，只变 `basinBirthPressureWeight ∈ {0, 0.4}`（中等单点，与 C1 同强度，不扫权重）。
- 结果（baseline vs C2 w=0.4）：

| 指标 | baseline | C2 w=0.4 | 判定 |
|---|---:|---:|---|
| **headLockPool（pool 主指标）** | 10 | 10 | **未下降 → FAIL 关键负结果** |
| **poolHfamily（pool 主指标）** | 1.622 | 1.624 | ≈持平（过） |
| uniqueCombosInPool | 66 | 60 | ↓ 反降 |
| winner top4FamilyShare | 76.4% | 80.3% | ↑ +3.9pp 集中度反升 |
| Hcanonical | 1.989 | 1.937 | ↓ -0.052 |
| complexShare | 36.1% | 34.3% | ↓ -1.8pp 反降 FAIL |
| ratio.mean | 23.8% | 21.9% | -1.9pp（3pp 内过） |
| avgScore | 531.7 | 527.5 | -4.2（±30 过） |
| uniqueAll | true | true | 过 |

- **结论：FAIL（关键负结果）。** headLockPool 完全未下降（10→10），poolH 仅微振（1.622→1.624），complex 与 Hcanonical 反降。C2 的 H2 假说被否定：basin-level pressure 无法降低重复结构占用。
- **失败机制（诊断，供下一层参考）**：与 C1 合并看，**出生端（growCage/partitionCages 的 frontier pick + 跨关频率压力）不是控制变量**。family 级（C1）与 basin 级（C2）pressure 都只能轻微扰动、无法打破 basin，因为 basin 的真正保持者是 selection/objective——候选池里 head structure 天然高分、被择优选中，出生压力改变不了「高分 candidate 必然胜出」这一事实。这印证了用户事前预测的失败分支。
- **B4-C2 已排除的方向（信息量）**：出生端所有 soft 压力（family 级、basin 级、均匀、定向）均无法打破 basin → 出生分布不是瓶颈。C0 的「head concentration」是 selection 在 fitness landscape 上收敛的结果，不是 birth 缺失。
- **下一步方向（供 B4-D / 后续参考）**：既然出生端非控制变量，下一刀应打在 **selection/objective 侧**——objective fitness landscape（改变 head structure 的评分相对性）、selection temperature（软化择优，让次优候选有机会）、或 diversity preservation term。但需注意 B4-B/D0/D1 已证明「selection 加权 rare family」无效（候选池同质、无稀有 family 可加分），故改动应聚焦「让 head basin 的吸引力本身下降」或「候选池真正包含非 head 结构」，而非继续给稀有 family 加分。
- **产物**：`scripts/b4c2-benchmark.cjs`、`data/b4c2-benchmark.json`、`data/b4c2-smoke.json`。

---

### 2026-08-11 · B4-C（birth-side intervention）→ **CLOSED**

- **状态**：B4-C 全部子实验归档，正式关闭。**不是「权重没调好」，而是控制变量已被双向否定。**
- 证据链：
  - **B4-C1（family-level pressure）**：改变的是 **family composition within basin**，不改变 **basin occupancy**（top4 反升 +4pp，headLock 仅 -1）。
  - **B4-C2（basin-level pressure）**：直接攻击 coarse basin occupancy，`headLockPool 10→10` 完全不响应。
  - 叠加 **B4-A1（template injection）** 也 FAIL。
- **排除的命题**：`candidate availability ≠ controlling bottleneck`——head basin lock 不是「出生生成器没提供足够探索」。
- **更符合现象的模型**：birth generator 产生的候选经 objective/selection 后，被**同一个 fitness attractor 吸回**。候选池并非缺 diversity，而是**没有真正竞争 basin 的 alternative**（即便给稀有 family +rarity，A=900 vs B=700 时 selection 仍选 A）。
- **结论（供 B4-E 参考）**：出生端非控制变量 → 停止「制造更多候选」，转向攻击「为什么赢家永远是同一种候选」→ 进入 B4-E（objective landscape）。
- **产物**：`data/b4c1-benchmark.json`、`data/b4c2-benchmark.json`、`data/b4c1-smoke.json`、`data/b4c2-smoke.json`。

---

### 2026-08-11 · B4-E1 objective saturation（explored-head similarity repulsion）：机制激活但未打破 basin（FAIL 关键负结果）

- **前提**：B4-C CLOSED 证明出生端非控制变量。用户提出 B4-E 三假说，推荐优先 E1——**objective 过度奖励 head basin**。E1 不在 birth 端制造候选，而是改 selection 的 fitness landscape，惩罚「候选与历史 winner 的结构相似度」。
- **机制**：`levelFamilyVector(cages)`（per-level canonical family 计数向量）→ `cosineSimilarity` → 候选对每个历史 winner 取最大相似度 `exploredSim` → `fitness = baseFitness + exploredHeadWeight * exploredSim`（fitness 越小越好 → 越像已赢结构越难被选）。跨关记忆 `_winnerFamilyVectors` 累计每个 winner 向量。诊断 `_headSimRankChanges`（翻转择优次数）。
- **与 C1/D1 的关键区别**：C1/D1 惩罚【单个 family 跨关频率】（family identity）；E1 惩罚【候选 level 与历史 winner 的整体结构相似度】（level↔level repulsion）。
- **机制验证（smoke N=15）**：信号有梯度（per-candidate exploredSim min 0.505 / max 0.980 / mean 0.879，80+ 候选非恒定），`headSimFlips=1`（>0）→ repulsion 确实进入 selection 路径，与 B4-B 的恒定 fingerprint 不同。
- **基准**：N=30，seed=20260810，λ=25/gb=0.4/W=0.2/suppress/objective/canonicalProfile 冻结，只变 `exploredHeadWeight ∈ {0, 30}`（机制可见单点，不扫描）。
- 结果（baseline vs E1 w=30）：

| 指标 | baseline | E1 w=30 | 判定 |
|---|---:|---:|---|
| **headSimRankChanges（机制指标）** | 0 | **2** | 机制进入 selection（PASS） |
| **headLockPool（pool 主指标）** | 9 | 9 | **未下降 → FAIL 关键负结果** |
| **poolHfamily（pool 主指标）** | 1.619 | 1.615 | ↓ -0.004 微降 FAIL |
| uniqueCombosInPool | 62 | 63 | ≈持平 |
| Hcanonical | 2.002 | 2.002 | ≈不变 |
| winner top4FamilyShare | 76.3% | 76.3% | ≈不变 |
| headFamilyLockCount | 4 | 4 | 未解锁 |
| complexShare | 35.3% | 36.0% | +0.7pp（过，不降） |
| ratio.mean | 22.5% | 22.3% | -0.2pp（过） |
| avgScore | 531.7 | 530.8 | -0.9（±30 过） |
| uniqueAll | true | true | 过 |

- **结论：FAIL（关键负结果）。** b3Stable=true 且机制激活（headSimRankChanges=2>0），但 headLockPool 9→9 不动、poolH/top4 均不变。objective 对「已探索 head 的相似度」施加 repulsion 后，**没有非 head 候选可被 repulsion 选中**。
- **判定修正：FAIL (diagnostic success)。** E1 不是「普通失败」——它完成了一个重要排除：**selection repulsion 不是控制变量**（类似 C2 的「出生端非控制变量」）。E1 证明 repulsion 只能在 head variant A/B/C 之间重排，无法选中 non-head candidate，因为 pool 里没有。
- **失败机制（诊断，供 E2/E3 参考）**：E1 的 repulsion 只产生 2 次翻转——候选池 family 组成高度同质（全部包含 head family），repulsion 只能在「同为 head 变体」间重排，找不到真正不依赖 head 的 alternative 去提升。这与 B4-C0 的「head concentration」、B4-D1 的「候选同质无稀有可加分」完全一致。
- **关键推论（收敛点）**：现在 birth 端（A1/C1/C2）与 selection 端（B/D1/E1）**六次独立失败**都指向同一结论——**head family 的「必现性」既不在出生端、也不在 selection 加权端被打破，因为生成器产出的候选本质上都包含 head family**。候选池有 62 种组合（D0），但组合内 head family 恒定存在，只有尾部差异。根因是「非 head 结构不通过 inRange 难度关卡」——即 **difficulty objective 与 head structure 的耦合**，而非单点干预可解。
- **下一步方向（C 已定，不沿 selection 轴堆机制）**：**暂停 E2/E3**。E2（softmax）解决的是「winner monopoly」，但当前问题是「pool monopoly」（90 候选 head 90 / non-head 0）——softmax 只会让 head 更随机，仍是 head。转 **B4-F0 纯测量审计**：在 generator→pool 之间埋点，验证 non-head candidate 是否在 candidate pipeline 中被 difficulty/inRange 淘汰（F0-1 候选 family 分布 / F0-2 filter attrition / F0-3 score 分解）。
- **产物**：`scripts/b4e1-benchmark.cjs`、`data/b4e1-benchmark.json`、`data/b4e1-smoke.json`。

---

### 2026-08-11 · B4-F0 measurement audit（计划）：审计 candidate pipeline，验证「non-head 是否在 generator→pool 途中死亡」

- **前提**：E1 (diagnostic success) 证明 selection repulsion 非控制变量，瓶颈可能不在 candidate pool 后半段，而在 **generator → pool** 之间。用户建议**纯测量，不引入任何机制**，验证 non-head alternative 是否被 difficulty/inRange 淘汰。
- **升级后的因果链假设**：
  ```
  generator → candidate distribution → difficulty scoring / inRange filter → candidate pool → selection
  ```
  B4 之前主要攻击 `candidate pool 后半段`（selection），现在证据指向 **`generator → pool` 之间**。
- **产物设计（F0-1/2/3）**：
  - **F0-1 Candidate family distribution**：不加 pressure，记录进入 pool 前的 generated candidates 的 head family % vs non-head family %。
  - **F0-2 Filter attrition**：逐阶段 raw generated → difficulty valid → inRange → selection pool，统计 head vs non-head retention rate。若 head 80% / non-head 5% → difficulty gate bias 成立。
  - **F0-3 Score decomposition**：拆 score = difficulty component + structure component + novelty component，观察 head 优势来自哪个分量。

---

### 2026-08-11 · B4-F0 measurement audit（执行）：difficulty/inRange gate 不淘汰 non-head（假说被否定，head 优势是出生结构不变量）

- **实现**：generator 新增 `candidateAudit` 纯测量模式（默认关闭，行为逐字节不变）。三段埋点记录每个候选的 `candidateStructuralProfile`（head=canonical L/T/domino/straight；nonHead=其余）。`getCandidateAudit()` 聚合三分段 headRatio/retention/score 分解。
- **协议**：N=30，seed=20260810，λ=25/gb=0.4/W=0.2/objective/canonicalProfile 冻结，仅 `candidateAudit=true`。单臂无对照（F0 是测量不是机制实验）。
- 结果（三分段 head vs non-head）：
  - **raw（出生）**：16151 笼，head=0.699 / nonHead=0.301。complex=4160（25.8%），crossHouseComplex=5653（35%）。
  - **valid（difficulty-valid）**：headRatio=0.699 / 0.301，retention head=1.0 / nonHead=1.0（dig/unique 整布局过/不过，不选择性淘汰）。
  - **inRange（进入 pool）**：headRatio=0.693 / 0.307，retention head=0.214 / nonHead=0.221，ΔheadRatio(raw→inRange)=**-0.006**。
  - **hitRate raw→pool = 0.217**（仅 21.7% raw 布局进入 pool，但对 head/non-head 几乎等比例）。
- **核心结论：F0-2 假说被否定。** 用户假说「head retention 80% vs non-head retention 5%」──**实测 head 21.4% vs non-head 22.1%，几乎相同**。difficulty/inRange gate 对 head 与 non-head 施加相同淘汰率，ΔheadRatio 全程 = -0.006 ≈ 0。
- **F0-1 确认**：head 优势**产生于出生阶段**（raw 已 69.9% head），管线从头到尾保持 ~70:30 不变。non-head 不是「出生即死」，而是「出生即占少数」（30%）。
- **F0-3 确认**：inRange 池 headRatio(0.693)≈raw(0.699)，难度分 score 与候选 head 含量**无耦合**。non-head 进入 pool 的候选与出生分布一致，未被难度分排斥。
- **机制解释（为何 C1/C2 失败）**：`headLockPool=10` 是 **family 出现率**指标——70% 笼是 head，每关 ~15 个 head 笼，10 个 head family 几乎必然全部出现。软出生压力（C1/C2）只降 family 的 **count**，无法让一个 family 在候选里**缺席**。要打破 headLock（family 在 ≥20% 候选缺席）需硬结构改变出生 tiling，而非软权重。
- **对整个 B4 的收敛意义**：六次失败（A1/C1/C2/B/D1/E1）+ F0 = **所有软杠杆**（出生权重、birth pressure、selection 加权、repulsion、pipeline filter）都无法改变 head 主导。head 主导是 **tiling 算法的结构不变量（~70%），且难度 gate 不歧视 non-head**。
- **对「难度↔head 耦合」因果的判定**：F0 否定了「difficulty gate bias」这根因假设。真正的耦合点在 **generator 的 tiling 本身**——出生即产生 70% head 小笼，这是 partitionCages 填盘的自然几何结果，selective 与 filter 都只是忠实保留这一比例。
- **下一步方向（供决策）**：F0 证明 non-head 在 pool 里占比 30% 且存活等比例，但 winner 仍 headLock。这意味着「改变分布」需攻击**出生 70:30 的 tiling 比例本身**（硬结构），而非任何软调参。候选方向：hard 约束改变 partitionCages 的笼尺寸/形状自然分布，或接受「当前架构 head 主导有 ~70% 下限」而重新定义理想分布。见 B4-F0 判定，交用户决策。
- **产物**：`scripts/b4f0-audit.cjs`、`data/b4f0-audit.json`、`data/b4f0-smoke.json`。

---

### 2026-08-11 · B4-F1 tiling source audit：head 来源 = cage size 分布（size-2/3 小笼天生 head）→ **Case A**

- **目的**：纯测量，验证 70% headRatio 是否由 cage size / shape 分布决定。不改 partitionCages、不调 weight、不接 objective/selection。逐笼计算 size + archetype + canonical + head，跨 30 关聚合。
- **协议**：N=30，seed=20260810，λ=25/gb=0.4/W=0.2/suppress/objective 冻结，与 B3-FINAL/F0 完全一致（单臂纯测量）。
- 结果（size 桶 / count / headRatio / P(head|size)）：

| size | count | headRatio | P(head\|size) | archetypeShare |
|---|---:|---:|---:|---|
| 1 | 22 | 0 | 0 | singleton 1.0 |
| 2 | 88 | **1.0** | **1.0** | domino 1.0 |
| 3 | 161 | **1.0** | **1.0** | L 0.609 / straight 0.391 |
| 4 | 171 | 0.263 | 0.263 | hook 0.374 / rect 0.234 / T 0.146 / zigzag 0.129 / straight 0.117 |
| 5 | 213 | 0.7 | 0.7 | T 0.676 / zigzag 0.174 / hook 0.113 / straight 0.023 / cross 0.014 |
| 全部 | 655 | 0.676 | — | T 0.258 / L 0.15 / hook 0.134 / straight 0.134 / domino 0.134 / zigzag 0.09 / rect 0.061 / singleton 0.034 / cross 0.005 |

- **head 来源分解（head 笼按 size 桶占比）**：size=2 → 19.9%，size=3 → 36.3%，size>=4 → 43.8%。即 **size-2+3 小笼贡献 56.2% 的 head 质量**。
- **non-head 来源**：size=2 / size=3 均为 **0**——non-head 只出现在 size>=4（89.6%）与抑制后残留的 singleton。**尺寸 ≤3 的笼在几何上不容许任何 non-head archetype**（2 格只能是 domino，3 格只能是 L/straight，全为 canonical）。
- **核心结论：Case A —— head 来源明确来自 cage size 分布，head 是 size 的确定性函数。**
  - `P(head|size=2)=1.0`、`P(head|size=3)=1.0`：小笼【天生 head】，非偏好、非权重，是 classifyArchetype 的硬几何约束。
  - non-head 只能生长在 size>=4，其 headRatio 仅 0.505（size-5 因 T 占 67.6% 拉高到 0.7，size-4 仅 0.263）。
  - 聚合 headRatio 0.676 ≈ 56%（强制 head 的小笼） + 44%（size>=4 中约半为 T/straight）。
- **最大单点 head 贡献**：size-3 L（98 笼，占 head 22.1%）、size-5 T（89 笼，占 head 20.1%）、size-2 domino（88 笼，19.9%）。
- **因果判断（为何所有软杠杆失败）**：head 主导不是「shape 偏好被选择放大」，而是 **tiling 的 cage size 分布**——partitionCages 产出 38% 的 size-2/3 小笼，这些笼在几何上只能是 head。软压力（C1/C2/birth pressure）只改 family 的 count，改不了「小笼 = head」的确定性关系；selection 加权只在 size>=4 才有余地。**要降 headRatio，唯一杠杆是硬性改变 cage size 分布（更少小笼 / 更大笼），或改 size>=4 的 archetype 构成（少 T 多 hook/zigzag）**——两者都是硬结构约束，非软调参可达。
- **判定：Case A（head 来源明确来自某类 tiling——cage size 分布）。** 按用户约定，下一步自然是「设计最小硬约束实验」（如约束 size-2/3 笼数量上限，或 size>=4 的 T 占比上限），但本阶段只回报测量与因果，不做改造。
- **判定修正：PASS — Root cause localized。** F1 把「head 被偏爱」的猜测升级为硬约束事实：`P(head|size=2)=1`、`P(head|size=3)=1`。head family 是 cage size distribution 的确定性函数，不是 shape 偏好。这回答了「head 为什么多」（大量小笼 + 小笼必然 canonical），但尚未回答「partitionCages 为什么产生这么多 size=2/3」→ 进入 B4-F2。
- **产物**：`scripts/b4f1-tiling-audit.cjs`、`data/b4f1-tiling-audit.json`、`data/b4f1-smoke.json`。

---

### 2026-08-11 · B4-F2 partition growth termination audit：size-2/3 是 star 权重预算的自然 bias（Case A）→ **F2 PASS**

- **目的**：纯测量，解释 size=2/3 小笼的来源。F1 已证 `P(head|size=2)=1`、`P(head|size=3)=1`（小笼天生 head），但未回答「partitionCages 为什么产生这么多 size=2/3」。本阶段用 generator 的 `partitionTrace` 仪器（默认关闭、不改行为）逐笼采集 growCage 生命周期，判定 A（算法自然 bias）/ B（为满足约束被迫停止）/ C（共同）。
- **实现**：generator 新增 `partitionTrace` 纯测量模式。每次 growCage 记录 `{targetSize, finalSize, stopReason, loop, accepted}`；stopReason 分类 `reached_target`(达成本要尺寸) / `no_valid_neighbor`(frontier 耗尽提前停) / `absorb_exhausted`(吸收耗尽) / `template`(模板出生)；loop 标定 `main`(主循环) / `remaining`(剩余格) / `required`(指定大笼)。脚本逐关重置 trace，配对 growth 事件 + accept 事件。
- **协议**：N=30，seed=20260810，λ=25/gb=0.4/W=0.2/suppress/objective 冻结，与 B3-FINAL/F0/F1 完全一致（单臂纯测量，不改 weight、不接 objective/selection）。共 19453 次 growCage 尝试（跨 30 关全部候选布局）。
- **关键修正**：验算 weight bias 时发现实际权重来自 `_getCageSizeWeights(targetStar=4)` = `{1:0.02, 2:0.10, 3:0.25, 4:0.30, 5:0.33}`（大笼偏置，size4+size5=0.63），**非** partitionCages 内部 `defaultWeights`（size2+3=0.60）。star=4 的 targetCounts = `{2:4, 3:6, 4:5, 5:5}`，size2+3 预算格子 32.1%。
- 结果（size=2/3 成因分解，跨 19453 次尝试中 accepted 的笼）：

| 指标 | size=2 | size=3 |
|---|---:|---:|
| accepted 数 | 3300 | 5291 |
| **intended（本就要 2/3，reached_target）** | **0.68** | **0.988** |
| premature（从更大 target 提前停） | 0.32 | 0.012 |
| byGrowthReason | reached_target 0.68 / no_valid_neighbor 0.32 | reached_target 0.988 / no_valid_neighbor 0.012 |
| byLoop | main 0.779 / remaining 0.221 | main 0.672 / remaining 0.328 |
| byTargetSize | 2:0.68 / 3:0.298 / 4:0.02 / 5:0.002 | 3:0.988 / 4:0.011 / 5:0.001 |

- **最终 size 分布（30 关，655 笼）**：size1 3.2% / size2 13.7% / size3 24% / size4 27% / size5 32.1%，与 F1 一致（size2 13% / size3 25% / size4 26% / size5 33%）。
- **核心结论：Case A —— size=2/3 是算法自然 bias，根因是 star 权重预算。**
  - size-3 的 **98.8% 是 `reached_target`**：生成器被 `_getCageSizeWeights(4)` 明确要求产出 size-3（weight 0.25 → targetCount 6/关），growCage 稳定达成。这是**显式预算**，不是隐藏约束。
  - size-2 的 **68% 是 `reached_target`**（weight 0.10 → targetCount 4/关）；其余 32% 是从 target=3 提前停止的 `no_valid_neighbor`（frontier 耗尽），为次要效应。
  - stopReason 分类中 `absorb_exhausted` / `template` 对 size-2/3 贡献 ≈ 0；`no_valid_neighbor`（仅 size-2 的 32%）是唯一「约束压力」成分，且不是主导。
- **根因定位（控制变量）**：size-2/3 的数量**直接由 `_getCageSizeWeights(targetStar)` 的权重预算决定**（star=4 明确要 4 个 size-2 + 6 个 size-3），并经 remaining-loop（残余格 target 2/3）与 mergeSmallCages 后处理叠加。**这不是生成机制的不变量，而是参数选择层的显式配置**——改变 size 分布的杠杆就在 `_getCageSizeWeights()`。
- **判定：Case A（F2 PASS — size=2/3 是算法自然 bias）。** 与 F1 合并，完整因果链闭合为：`star 权重预算 → targetCounts(size2=4,size3=6) → growCage 稳定达成小 target → 38% 笼是 size-2/3 → 小笼几何必然 head → head family 主导`。控制 head 分布的唯一干净杠杆 = 改 `_getCageSizeWeights()` 的 size 预算（或 remaining-loop 的 target 上限），这是硬结构层，非任何软调参。
- **对 B4 的收敛意义**：F2 补全了「打哪里」（F1）→「为什么那里形成」（F2）的因果追问。B4 已把 head 主导从「玄学」收敛为一条可定位、可在参数层控制的链。是否进入「改 size 预算的硬实验」属于产品决策（会改变 B3-FINAL 基线难度/分布），留待用户判断。
- **产物**：`scripts/b4f2-partition-audit.cjs`、`data/b4f2-partition-audit.json`。

---

### 2026-08-11 · B4-G0 size budget sensitivity：旋钮可控但 headroom 有限（headLock 结构性持久）→ **G0 Review（可控性部分确认）**

- **目的**：F2 完成因果定位（size=2/3 是 `_getCageSizeWeights(star=4)` 的显式预算），G0 验证**可控性**——size2/3 budget ↓ 是否按预期压 headRatio、complexity/uniqueness 是否承受得住。**纯实验臂，不改 baseline、不入生产、不接 selection、不改 B3-FINAL。**
- **实现**：脚本内实例级覆写 `gen._getCageSizeWeights = () => weights`（零生产代码改动），把 size2/3 权重减半转移到 size5（大笼），保持 sum=1。四臂：baseline / G0-A(size2↓) / G0-B(size3↓) / G0-C(双降，上限测试)。
- **机制验证**：sizeShare 确实按预算位移（G0-C: size3 0.248→0.107、size5 0.327→0.506），确认覆写生效、生成成功（unique 全程 true，无 retry 爆炸）。
- **协议**：N=30，seed=20260810，λ=25/gb=0.4/W=0.2/suppress/objective/canonicalProfile 冻结，只变 size weights。四臂约 23min。
- 结果（arm / sizeShare(2,3,4,5) / headRatio / headLockPool / top4Win / comp / ratio / score / singleton）：

| arm | sizeShare(2,3,4,5) | headRatio | headLockPool | top4Win | complexShare | ratio | score | singleton | uniq |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| baseline | .13/.25/.26/.33 | **67.5%** | 10 | 76.6% | 35.4% | 22.8% | 531.7 | 2.9% | ✓ |
| G0-A（size2↓） | .11/.22/.24/.38 | **66.6%** | 10 | 73.7% | 38.0% | 24.4% | 540.8 | 5.4% | ✓ |
| G0-B（size3↓） | .11/.15/.19/.46 | **65.3%** | 10 | 69.2% | 43.0% | 23.4% | 515.8 | 9.1% | ✓ |
| G0-C（双降） | .12/.11/.18/.51 | **65.5%** | 10 | 69.4% | 44.7% | 22.2% | 542.5 | 8.8% | ✓ |

- **核心结论：可控但饱和（G0 Review）。**
  - **headRatio 确实响应 budget**：baseline 67.5% → 最大降幅仅 **-2.2pp（G0-B 65.3%）**。size3 是比 size2 更强的杠杆（-2.2pp vs -0.9pp）。
  - **饱和原因（关键洞察）**：被释放的权重转移到 **size-5**，而 size-5 本身 **70% head（T 主导）**。把 size2/3 换成 size-5，只是把「小笼的 head」换成「大笼的 head」，故 headRatio 压不破 ~65%。**head 不只是小笼现象——size-5 T 笼同样是 head。**
  - **headLockPool 结构性持久**：全部三臂 headLockPool **恒为 10**——10 个 canonical family 在候选池出现率 ≥80% 不受 budget 影响。仅 G0-C 的 winner 侧 headFamilyLockCount 4→2（winner 不再全程锁同 4 family），但 pool 级 presence 锁死不变。
  - **分布质量改善是真实的**：top4Win 76.6%→69-74%（集中度下降）、complexShare 35.4%→38-44.7%（复杂上升）、Hcanonical≈2.0。B3 稳定性全程成立（unique 真、score ±30、ratio ≤3pp、complex 不降）。
  - **代价**：singleton 随大笼化上升（2.9%→5.4-9.1%）。G0-B/C 超过 baseline 的 <5% 指导线——过度大笼化会制造残余单格，是硬约束的显性成本。
- **判定：G0 Review（可控性 PARTIAL）。** size budget 是**真实旋钮**（headRatio/top4/complex 均响应且 B3 稳定），但 **headroom 有限（~2pp）** 且 **headLock 无法借此打破**。回答用户的问题：size2/3 budget ↓ **能**按预期降 headRatio（微弱），complexity/unique **能**保持（complex 反而升），但旋钮的收益在 ~65% 处封顶。
- **对后续的启示（若继续同一旋钮）**：要真正压 head 到 65% 以下，不能只「换到 size-5」——需改为：
  1. 释放权重转向 **size-4**（headRatio 最低 0.263，而非 size-5 的 0.7），或
  2. 同时抑制 **size-5 的 T archetype**（T 是 size-5 的 head 主力，占 67.6%），或
  3. 接受「size budget 只能到 ~65% 的 head 下限」，把 head 作为该架构的结构性地板。
- **产物**：`scripts/b4g0-benchmark.cjs`、`data/b4g0-benchmark.json`。

---

### 2026-08-11 · B4-G1 size4 重定向 + size5 T archetype 抑制：两大未测杠杆均打不破 65% → **G1 Freeze（B4 自动冻结）**

- **目的**：G0 证明 size budget 收益在 ~65% 封顶，且原因指向「释放权重转给 size-5，而 size-5 本身 T-heavy」。G1 换 G0 未测的两个杠杆：
  - **G1-A：size→size4 重定向**（size2/3 释放权重转 size4，而非 size5）——验证 size4 是否低-head sink。
  - **G1-B：size5 T/cross archetype 抑制**——保持 size 预算，打掉 size5 T 的成形偏好，验证 T 是否 size5 head 瓶颈。
  - **G1-C：组合**（size4 增权 + size5 T 抑制）——测理论上限。
- **机制（cage-generator-v9.cjs 新增钩子，默认 0 生产不变）**：新增 `size5BranchSuppress` 参数。**审计发现**：生产/基准路径（`topologyScoreVersion=1`）用的是 `topologyBiasWeight`（v1），**无 branch 加分**——size5 T 的成形靠 v1 的 **turn 加分 `1+0.25*turns`**（T 的臂关节是 turn 结点）。故钩子加在 v1：`w *= 1 + 0.25*turns*(1 - s*g)`，其中 `g = (n>=5 && branch>0) ? 1 : 0`（只在「笼达 size5 且含 T/cross 结点」时削弱 turn 加分，size2/3/4 的不规则 L/hook/zigzag 笼完全不受影响）。size weights 仍用 G0 的实例级覆写。s=0 → 生产行为位级不变。
- **协议**：N=30，seed=20260810，λ=25/gb=0.4/W=0.2/suppress/objective/canonicalProfile 冻结，与 G0 完全一致。三臂（G1-A/B/C），对照基准 = G0 baseline（frozen reference：headRatio 0.675 / headLockPool 10 / comp 0.354 / ratio 0.2276 / score 531.7）。
- 结果（arm / weights(2,3,4,5) / suppress / **headRatio** / headLockPool / top4Win / comp / ratio / score / size5head / size5Tcross / elapsed）：
  - 权重：baseline {2:.10,3:.25,4:.30,5:.33}；G1-A/C {2:.05,3:.15,4:.45,5:.33}；G1-B 用 baseline 权重。

| arm | weights(2,3,4,5) | suppress | **headRatio** | headLockPool | top4Win | complexShare | ratio | score | size5head | size5Tcross | elapsed |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| **baseline(G0)** | .10/.25/.30/.33 | 0 | **67.5%** | 10 | 76.6% | 35.4% | 22.8% | 531.7 | — | — | 342s |
| G1-A（→size4） | .05/.15/.45/.33 | 0 | **66.1%** | 10 | 73.2% | 44.3% | 20.1% | 543.3 | 73.4% | 72.9% | 301s |
| G1-B（T 抑制） | .10/.25/.30/.33 | 1 | **69.1%** | 10 | 74.9% | 39.5% | 23.3% | 538.3 | 73.1% | 71.3% | 334s |
| G1-C（组合） | .05/.15/.45/.33 | 1 | **67.4%** | 10 | 73.1% | 41.2% | 21.3% | 541.7 | 78.7% | 78.7% | **2233s** |

- **核心结论：Freeze（无臂突破 65%，B4 自动冻结）。**
  - **G1-A（size→size4）**：headRatio 67.5→66.1%（-1.4pp），但 **size4 并非低-head sink**——sizeBreakdown 显示 size4 headRatio=0.332（L/straight-4/T 仍 head），size5 仍 73.4% head。把权重推给 size4 只换来 complexShare 大涨（35%→44%），head 仅微降。**head 是跨所有 size 的结构性现象，不是某一 size 专属。**
  - **G1-B（size5 T 抑制，关键负结果）**：headRatio 反升到 **69.1%（+1.6pp）**，且 size5 T/cross 占比仅 72.9→71.3%（-1.6pp，噪声级）。**钩子确实进入代码路径（suppress 生效，G1-A/C 分离），但打不掉 size5 T**——证明 **size5 T 是 tiling 几何必然，不是 scoring 偏爱**。frontier 扩张无论有无 turn 加分都会铺出 T 形笼。这与 F1「P(head|size=2/3)=1 几何必然」同一性质，只是扩展到 size5。
  - **G1-C（组合）**：headRatio 67.4%（-0.1pp，无收益），size5 head 反升到 78.7%，且耗时 2233s（G1-A 的 7.4 倍，retry 爆炸）。组合既不有效又昂贵。
  - **headLockPool 恒 10**（三臂全部不变）：pool 级 head family presence 锁死，对 size 导向与 T 抑制完全无响应。
- **判定：FREEZE_B4（满足用户停止条件「若 G1 无明显收益，自动 Freeze B4」）。** 三臂 headRatio 66.1/69.1/67.4%，无一突破 65%；G1-B 甚至更差。B3 稳定性全程成立（unique 真、score ±30、ratio ≤3pp、complex 不降），但目标 head 未达成。
- **因果闭环（B4 最终结论）**：head family 主导是**生成器 tiling 的几何不变量**，横跨全部 size：
  - size2/3：P(head|size)=1（F1，几何必然）
  - size4：33% head（L/straight-4/T）
  - size5：73% head（T 主导），且 T 成形与 scoring 无关（G1-B 证明）
  - 已排除的全部杠杆：出生端（A1 模板、C1 family 压力、C2 basin 压力）、selection 端（B/D1 rarity、E1 repulsion）、size budget（G0，~2pp 封顶）、size4 重定向 + size5 T 抑制（G1，无收益）。
  - **结论：head≈65-67% 是当前 ktiling 架构的结构性地板，无法通过任何 soft 杠杆打破。**
- **产品决策点（留给用户）**：接受 head≈65-67% 为架构特征（保留 B3-FINAL），或做**硬结构改造**（如强制 larger cage / 改变 tiling 算法本身的连通偏好），后者需承担 G0-B/C 已显示的 singleton 上升与 retry 爆炸代价。
- **产物**：`scripts/b4g1-benchmark.cjs`、`data/b4g1-benchmark.json`、`data/b4g1-smoke.json`。

---