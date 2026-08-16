# Teaching AI Policy Identifiability & Sensitivity 报告（Phase 4.5）

> 最终状态：**TEACHING_AI_POLICY_SENSITIVE**
> 全部为 SHADOW 实验；未改正式 simulator；未重定义 Phase 4 结论；不代表真实学习效果。

## 核心问题

Phase 4 观察到 `A static (2.733) ≈ C adaptive (2.733)`。本报告判断：这到底来自 policy 本身，还是来自 simulator 的奖励结构。

## 方法

只扰动 `masteryDelta`（正是压平 A/C 的因素），success/frustration 固定，用影子模拟器（不改 `core/teaching-learner-simulator.js`）运行同一组 30 learner × 3 policy × 10 episodes。

变体：

- `B0_formal_like`：复刻正式 simulator 的 masteryDelta 轮廓（demo 与 guided 在低掌握同为 +1）
- `S1_demo_dominant`：guided masteryDelta 全 0
- `S2_guided_dominant`：demo masteryDelta 全 0
- `S3_recovery_bonus`：guided 对 struggling 给 +2
- `S4_transfer_bonus`：challenge 对 independent 给 +2

## 结果

| variant | A static | B hint | C adaptive | C-A gap |
|---|---|---|---|---|
| B0 formal_like | 2.733 | 1.000 | 2.733 | **0** |
| S1 demo_dominant | 2.733 | 1.000 | 0.667 | **-2.066** |
| S2 guided_dominant | 0.667 | 0.133 | 2.733 | **+2.066** |
| S3 recovery_bonus | 2.733 | 1.000 | 2.733 | 0 |
| S4 transfer_bonus | 1.000 | 1.000 | 1.000 | 0 |

## 判读

- **A vs C 的 mastery 差异完全由奖励结构决定**：当奖励偏 demo（S1）→ A > C；偏 guided（S2）→ C > A；两者同 +1（B0/S3）→ 相等。C-A gap 在 `-2.066 / 0 / +2.066` 间翻转。
- **B 是稳健可识别的**：因为其 `reveal` 主导（masteryDelta 恒 0），mastery 始终显著低于 A/C，且 hint 依赖高——这是「重提示依赖」策略，不是「学得更快/更慢」策略。
- 结论：**当前 learner outcome model 不足以在 mastery 维度上识别 adaptive-vs-static 的差异**。A≈C 是 simulator 奖励结构的 artifact，不是「adaptive 无用」的证据，也不是「adaptive 更强」的证据。

## 含义

下一步不应急着把 C 接入生产，而应研究 **Learner Model / outcome model**——尤其是 `recovery`（失败恢复速度）、`hint dependency`（提示依赖）、`transfer`（迁移）这几个奖励维度，因为 Phase 4 已显示 C 在 `hint_dependency` 上与 A 有差异（0.087 vs 0），只是 mastery 维度被压平。

> 所有结果均为 SHADOW / 合成，confidence = LOW；不据此修改任何生产行为或教学策略。