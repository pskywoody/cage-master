# Teaching AI Phase 4.5 — Freeze Report

> 最终状态：**TEACHING_AI_POLICY_SENSITIVE**

## 结论一句话

A static 与 C adaptive 的 mastery 差异取决于 simulator 的 masteryDelta 奖励结构；在合理扰动下 C-A gap 在 `-2.066 / 0 / +2.066` 间翻转，因此当前 learner outcome model 无法在 mastery 维度上识别 adaptive-vs-static 的差异。B（reveal 主导）反而稳健可识别为「低 mastery + 高 hint 依赖」。

## 已验证

- 三种 policy 可运行、可 counterfactual 比较。
- A vs C 的 mastery 差异对奖励结构高度敏感（S1/S2 翻转）。
- B 的 reveal 倾向稳健地产生「低 mastery / 高 hint 依赖」。

## 未验证 / 不成立

- 未证明 adaptive 有用或无用。
- 未证明真实玩家收益。
- 未在 mastery 维度上识别出 A vs C 的稳定差异（SENSITIVE）。

## 严格边界（已遵守）

- 未修改正式 `core/teaching-learner-simulator.js`。
- 未修改 Phase 4 数据 / 结论。
- 全部为 SHADOW 实验（`data/teaching-ai-policy-sensitivity/`）。
- 未接生产、未接真实用户、未调参后重定义 Phase 4 结论。

## 下一步建议（不执行）

进入 Learner Model / outcome model 研究，聚焦 `recovery / hint_dependency / transfer` 三个维度，判断 adaptive teaching 的价值是否在「少依赖、恢复快、迁移好」而非「学得更快」。