# Teaching AI Policy Robustness 报告（Phase 7）

> SHADOW / SIMULATED_ONLY；不改 policy、只扰动 learner response 参数；未接生产。

## 实验矩阵

- Learner state sweep：`struggling / novice / exposed / guided / independent / near_mastery` × 20 = 120 learner/环境。
- Reward perturbation（只改 learner response 参数）：`baseline / easy / hard / high_forgetting / high_hint_sensitivity`。
- 指标：`value = transfer + retention`（0..2），另记录 mastery / recovery / hint_dependency。
- Ablation（baseline）：`C_full / C_no_state / C_no_adaptation / C_random`。

## P(C>A) — 排名稳定性

| env | C-A value | C 胜 A |
|---|---|---|
| baseline | +0.009 | ✅ |
| easy | +0.014 | ✅ |
| hard | +0.006 | ✅ |
| high_forgetting | +0.009 | ✅ |
| high_hint_sensitivity | +0.009 | ✅ |

**P(C>A) = 5/5（方向稳定）**，但幅度小（<1%）。

## env × policy（关键行）

| env | A value | B value | C value | C recovery | A recovery |
|---|---|---|---|---|---|
| baseline | 1.564 | 0.954 | 1.573 | 3.167 | 3.667 |
| easy | 1.585 | 0.969 | 1.599 | 2.833 | 3.667 |
| hard | 1.521 | 0.881 | 1.527 | 3.167 | 3.667 |
| high_forgetting | 1.481 | 0.890 | 1.490 | 3.167 | 3.667 |
| high_hint_sensitivity | 1.564 | 0.846 | 1.573 | 3.167 | 3.667 |

- C 在**全部 5 个环境**的 recovery（更快）、transfer、retention 上一致略高于 A；mastery 两者触顶持平；hint_dependency 都接近 0。
- B 在所有环境稳定最差（value 0.85–0.97，hint_dependency 饱和 1.0）。

## Ablation（哪部分创造收益）

| variant | value | transfer | recovery |
|---|---|---|---|
| C_full（自适应） | 1.573 | 0.828 | 3.167 |
| C_no_state（固定序列） | 1.496 | 0.787 | 3.000 |
| C_no_adaptation（恒定 question） | 1.490 | 0.784 | 2.667 |
| C_random（随机动作） | 1.398 | 0.736 | 3.600 |

→ **state-aware action selection 创造主要收益**（C_full 比两种非自适应高 ~5%），随机动作明显更差。

## 结论（按 Phase 7 成功标准）

**PASS（方向稳定；幅度小）**：

- C 在多个 learner 状态（6 态覆盖）与 5 个 reward 扰动环境下都保持优势 → **不依赖单一参数**。
- 优势主要来自 `recovery / transfer / retention`，且由 **state-aware action selection**（非随机、非固定序列）产生。
- 判定：**Adaptive Teaching 值得进入真实实验（Production Bridge 决策点）**。

诚实标注：

- 优势幅度 <1%（composite），且全部来自 SHADOW 影子模型，不是真实学习效果。
- 需要真实 LearnerModel/用户数据验证后才能谈产品结论。

## 禁止事项（保持）

❌ 未接 LearnerModel runtime；未改 LessonPlan / HintSystem；未自动推荐教学动作；未把 C 放生产。