# Cage Density Forensics（Step B2-A）

> 状态：完成（2026-08-10）
> 性质：法医分析，**不改 generator**。用现有 generator 产出 100 个互异样本做笼密度解剖。
> 触发点：B2 之前必须回答"为什么 cage 存在但 solver 不用"，才能决定调参数 / 改 placement / 改 objective / 加 operation。

---

## 0. 一句话结论

generator 的笼结构**对内高度同质**（笼熵一律 ~2.1 bits），且笼熵/笼大小/紧致度与推理率**相关性 ≈ 0**。
推理率真实天花板约 **~37%**（100 关 max 37.3%，≥40% 仍为 0%）。根因不是"笼不够紧"，而是：

> **solver 的 naked single（纯 Sudoku 排他）占 72% 步数，提前消化了几乎所有约束，cage 只在 ~18% 步数里被真正需要。**

---

## 1. 方法

- 工具：`scripts/cage-density-forensics.cjs`
- 样本：`generateBatch(100)`（seed=20260810，`seed + i*1000` 偏移保证互异且可复现）
- 关键修正：**B1 用固定 seed 循环 `generate()` 产出重复样本**，导致 B1 的"ratio 锁死 11-13%"是单关重复 24 次的假象。本步骤改用 `generateBatch` 后样本互异。
- 每关分析：笼格数直方图 / 笼和组合数（n 个互异数字∈[1,9] 和为 S 的方案数）/ 笼熵 `log2(combos)` / tight（combos≤2）/ 求解步归属 / cageUnique·rule45 触发位置。

---

## 2. 关键数据（100 样本）

### 2.1 Cage size 分布

| 指标 | 值 |
|---|---|
| avg_cage_size | 3.23 |
| 单格笼比 | 15.4% |
| 2 格笼比 | 12.2% |
| 3 格笼比 | 27.6% |
| 大笼(4+)比 | 44.7% |
| size 直方图 | 1格:400 / 2格:311 / 3格:693 / 4格:591 / 5+:527 |

### 2.2 Cage sum tightness / entropy

| 指标 | 值 |
|---|---|
| avg_cage_entropy | 2.13 bits（≈均笼 4 组合） |
| tight 笼(combos≤2) | 26.4% |
| 熵分布 | low(≤1):676 / mid(≤3):1203 / high(>3):643 |

### 2.3 Solver step attribution（核心）

| 技术 | 步数占比 |
|---|---|
| nakedSingle（纯 Sudoku） | **72.0%** |
| cageUnique | 14.8% |
| rule45 | 3.3% |
| **cage 推理合计** | **18.1%** |

### 2.4 触发位置

- 100/100 关出现 cage 推理；首次 cage 推理步索引 avg ≈ 5.9（总步数 avg ≈ 72.4）。
- 即 cage 推理**出现得早**，但**不占主导**——问题在密度，不在触发时机。

---

## 3. 决定性发现：笼结构与推理率相关性 ≈ 0

| 自变量（对 cage_reasoning_ratio） | Pearson 相关 |
|---|---|
| avg_cage_entropy | 0.052 |
| tight_cage_ratio | −0.048 |
| avg_cage_size | 0.073 |
| large_cell_ratio | 0.107 |
| single_cell_ratio | −0.036 |
| 难度分 score | −0.067 |

分桶佐证（按推理率分三组，笼特征几乎不随组变化）：

| ratio 组 | n | 熵 | tight | 大笼 | 单格 | 平均步 | 分 |
|---|---|---|---|---|---|---|---|
| 0–15% | 26 | 2.12 | 26% | 44% | 15% | 76 | 502 |
| 15–25% | 64 | 2.12 | 27% | 44% | 16% | 72 | 506 |
| 25–100% | 10 | 2.21 | 23% | 48% | 13% | 64 | 485 |

**结论**：不同推理率的关卡，笼结构几乎一模一样。生成器每关都产出 ~2.1 bits 熵、~26% tight、~44% 大笼，从不造更紧的笼。因此笼结构不是推理率差异的来源。

---

## 4. 推理率存在硬性天花板

| gate | B1 旧值（重复样本） | B2-A 修正值（互异 100 样本） | B3-0 逐关复核 |
|---|---|---|---|
| G1（出现 cage 推理） | 100% | 100% | 100% |
| G2（ratio≥20%） | 0% ❌ | **29.7%** ✅ | **32.0%** ✅ |
| ratio≥30% | — | **0%** | **3.0%**（3 关：32.4/34.5/37.3） |
| G3（ratio≥40%） | 0% | 0% | 0% |

**ratio 真实区间（B3-0 逐关复核）：min 7.5% / mean 18.1% / 中位 17.3% / p90 24.7% / max 37.3%**。

> ⚠️ **B3-0 修正记录**：B2-A 文档此前写"max 28%、≥30% 全为 0%"，系由聚合均值（mean 18.1%）误推，未逐关扫描 per_level。逐关复核后，真实分布 discrete 尾部有 3 关 ≥30%（GEN-036 32.4% / GEN-293 34.5% / GEN-452 37.3%），≥40% 仍为 0%。**真实天花板约 37%，而非 30%。**

修正并强化的结论：
1. **G1 100% 不变** → acceptance 层缺失（生产链路问题）依然成立。
2. **G2 实际约 32%**（非 B1 的 0%）→ generator 有约三分之一产出可达 20%＋。B1"generator 密度不足"的结论夸大，但方向仍对。
3. **ratio 上限 ~37%**（≥40% 仍绝迹）→ **Killer 完整体验（>40%）结构性不可达**，这是真正的算法天花板，但比 B2-A 文档判断的 30% 略高。

---

## 5. 根因回答

> **为什么 cage 明明存在，但 solver 不需要用它？**

1. **笼约束过弱且同质**：avg 笼熵 2.13 bits ≈ 均笼 4 组合。多数笼的 `sum` 与行/列/宫约束**冗余**，不提供额外判别力。
2. **naked single 主导**：solver 72% 步数靠纯 Sudoku 排他完成，把笼决策点提前消化。cage 只在 ~18% 步数里成为"唯一决定因素"。
3. **紧致度不随关卡变化**：generator 从不为某关造更紧的笼（tight 恒 ~26%），所以笼熵与推理率零相关。
4. **天花板根源**：只要 naked single 仍能消化大部分格子，cage 推理率就被压在 ~37% 以下（大部分关在 7–28%）。想突破必须让笼约束**在 solving path 的关键节点成为必要前提**，而非事后冗余。

---

## 6. 对 B3（objective injection）的指引

不能靠"调现笼参数"突破（笼结构已同质且与推理率无关）。改 objective 应瞄准：

1. **降低 naked single 主导**：让 generator 的难度不靠"裸单多"体现，而靠 cage 决策链体现。
2. **造真正紧的笼**：提高 low-entropy（≤1 bit，即 ≤2 组合）笼比例，尤其大笼 + 限制性 sum（如 4 格 sum 10），而非更多中等紧度的笼。
3. **cage placement 与 solve path 耦合**：把紧笼放在 solver 前期必须求 cage 的位置，使 cageUnique/rule45 成为路径主干而非点缀。
4. **目标函数注入 cage 贡献**：把 `cage_reasoning_ratio` 作为生成目标（而非仅 unique+difficulty），否则自然产出"Sudoku difficulty ↑, Killer reasoning ↓"。

---

## 7. 产物

- `scripts/cage-density-forensics.cjs` — 法医分析脚本（`--count 100-500`）
- `data/cage-density-forensics.json` — 100 样本逐关明细 + 聚合
- 关联：`core/solver-aware-acceptance.js`（B1，gate 判定）、`docs/cage-generator-audit.md`（B1 结论在本文件 §5 已修正）