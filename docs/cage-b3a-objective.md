# Cage Generator B3-A：Objective Injection（2026-08-10）

> 状态：**完成，selection 有效**（2026-08-10）
> 性质：只改 generator 的候选择优目标，**不改 cage builder / solver**。
> 前置：B3-0 baseline 已冻结（`tests/cage_generator/baseline-v9-forensics.json`）。

---

## 0. 一句话结论

**selection 有效，瓶颈不在 topology。** 只靠"在同类难度下偏好高 cage 推理候选"这一项，median ratio 从 17.3% 移到 21.2%（+4pp）、≥20% 通过率从 32% 翻到 60%。说明 generator 的 cage topology 分布已经足够，问题在**候选择优没选中优质样本**，而非 cage builder。

---

## 1. B3-A 实现（最小变量）

在 `scripts/cage-generator-v9.cjs`：

- `_rateWithTechRater`：在同一求解上统计 `cageReasoningRatio = (cageUnique + rule45) / totalSteps`，附加到 rating（不额外求解）。
- `_generateOne`：把 `difficultyScore` / `cageReasoningRatio` / `cageReasoningCount` 暴露到 `result._objective`。
- `generate()`：二级择优 `fitness = difficultyDistance - ratio * ratioWeight`（默认 objective 关闭，fitness===diff，行为与旧版完全一致）。objective 开启时收集 `maxCollected` 个 inRange 候选后返回 fitness 最优者，而非 `diff<60` 即返回。

```js
// 构造开关
{ objective: { enabled: true, ratioWeight: 100, maxCollected: 8 } }
```

**难度为主项（不破坏难度分布），ratio 为次项（同类难度下偏好高笼推理）。** 默认关闭，不污染既有生产。

---

## 2. A/B 结果（N=30，seed=20260810，weight=100，maxCollected=8）

驱动：`scripts/b3a-objective-comparison.cjs`。原始数据：`data/b3a-objective-comparison.json`。

### 2.1 cageReasoningRatio 分布

| 指标 | baseline（off） | objective（on） | Δ |
|---|---|---|---|
| median | 17.5% | **21.2%** | +3.7pp |
| mean | 17.8% | 21.5% | +3.7pp |
| p90 | 23.7% | **30.4%** | +6.7pp |
| max | 32.4% | 37.5% | +5.1pp |
| ≥20% | 36.7% | **60.0%** | +23.3pp |
| ≥30% | 3.3% | **13.3%** | +10.0pp |
| ≥40% | 0% | 0% | 0pp |

### 2.2 difficulty（保持 ±5%）

| | baseline | objective |
|---|---|---|
| avg score | 507.5 | 522.5 |
| range | [225, 550] | [225, 550] |

objective avg 522.5 反而更贴近 4星 目标 562，难度未降级。

### 2.3 对照冻结 baseline

| 指标 | baseline-v9-forensics | B3-A objective |
|---|---|---|
| median | 17.3% | 21.2% |
| p90 | 24.7% | 30.4% |
| ≥20% | 32.0% | 60.0% |
| ≥30% | 3.0% | 13.3% |

---

## 3. 判定（对应用户决策树）

```
ratio ↑ (17.3 → 21.2)  →  selection 问题已解决，topology 足够 ✅
```

- **median +4pp（≥3pp 阈值）** → selection 有效。
- **p90 30.4 达标（≥30）**、**≥30% 13.3%（＞10%）** 均达标。
- 你之前的架构判断被印证：GEN-452 那类高 ratio 样本本来就存在，objective 把它们的选中概率从 3.3% 提到 13.3%。**不需要创造新 cage 类型**。

**结论**：瓶颈是"没选中优质候选"，不是"生成不出优质候选"。B3-B（cage builder entropy injection）**此阶段不需要**。

---

## 4. 成本与权衡

| | baseline | objective |
|---|---|---|
| 生成耗时/30关 | 84s（2.8s/关） | 252s（8.4s/关） |
| 倍率 | — | 3.0x |

`maxCollected=8` 需多收集 inRange 候选，成本 3x。production 若接受，可用 `maxCollected=4~6` 折中；若不可接受，可改用"高 ratio 候选优先"的贪心提前返回。

---

## 5. 下一步（B3-A+ 强化，可选）

当前 median 21.2%，未达 25%。可选强化路径（保持 selection 变量，仍不改 cage builder）：

1. **加大 selection 压力**：`ratioWeight` 100→150，或 `maxCollected` 8→12，观察 median 是否上探 25%。
2. **cageReasoningScore 加权**（用户提议）：把 metric 从二分 `cageReasoningRatio` 升级为加权贡献分：
   - Cage single candidate 1.0 / Innies-Outies 1.5 / 45 subtraction 2.0 / Cage intersection 2.0 / Subset cage 2.5
   - fitness = difficulty + α * cageReasoningScore
   - 用于区分"高价值推理事件"与"低价值 45 笼确认"，避免体重度退化成 box/row/column 笼。
3. **topology entropy 审计（B3-B，仅当 selection 失效时）**：shape signature → 旋转归一化 → shapeID → `H=-Σp·log p`，判断 generator 是否重复同一种笼型。

> 注意：`cageReasoningScore` 是 B3-A 验证 success 之后的**强化版**，不应与 B3-A 混在一起改，否则污染 selection 判定。

---

## 6. 产物

- `scripts/cage-generator-v9.cjs` — objective 开关（默认关，不污染生产）
- `scripts/b3a-objective-comparison.cjs` — A/B 驱动（`--count --seed --weight --maxCollected`）
- `data/b3a-objective-comparison.json` — N=30 对照原始数据
- 关联：`tests/cage_generator/baseline-v9-forensics.json`（B3-0 冻结基线）、`docs/cage-density-forensics.md`（B2-A）