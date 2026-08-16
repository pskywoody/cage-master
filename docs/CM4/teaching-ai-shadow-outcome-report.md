# Teaching AI Shadow Outcome Attribution 报告（Phase 10）

> SHADOW / 模型条件结论；只分析历史/合成轨迹，不执行、不替换、不接生产。

## 方法

对每 session 建立两条确定性轨迹：**actual track**（按真实事件语义推进 mastery/hint/frustration）与 **shadow-counterfactual track**（每一步用 `shadowRecommend` 推荐动作 + Phase 6/7 causal 效应推进），比较三组指标：

1. **Counterfactual recovery estimation**：actual vs shadow 到达 independent 的步数 + 失败/恢复方向。
2. **Hint economy**：实际轨迹中，hint 后 2 步内独立完成 = `productive`；连续 ≥2 hint 才成功 = `dependency`。
3. **Trajectory divergence**：actual vs shadow 的最终 mastery / hintDependency / frustration。

## 结果（22 sessions = 2 real + 20 synthetic）

| verdict | 数量 | 说明 |
|---|---|---|
| CaseA_shadow_better | 8 | shadow 少提示 + 恢复更快 + 掌握不差（hint/fail 重的 session） |
| CaseB_tradeoff | 6 | 少提示但 frustration 更高（reveal 重 session） |
| CaseC_style_only | 8 | 差异仅在风格（干净成功 session） |

Hint economy：`productive = 35`，`dependency = 14`（历史轨迹中，单次 hint→独立完成 占多数，但存在 14 次连续依赖）。

## 判读（诚实，条件性）

- **「少提示」不是无条件更好**：归因结果是 **mixed（8/6/8）**。
- 在 **hint/fail 密集**的 session 里，shadow 归因更好（Case A：更少依赖 + 更快恢复）。
- 在 **reveal 密集**的 session 里，出现 tradeoff（Case B：少提示但 frustration 上升）。
- 在**干净成功**的 session 里，只是风格差异（Case C）。
- 因此结论是**条件性**：既不足以判定「shadow policy candidate」（Case A 未一致），也不足以判定「停止」（Case C 未一致）——更接近「需要 policy refinement（Case B 的挫败问题）+ 更多真实数据」。

## 边界

- 全部为模型条件结论（shadow causal model 驱动），**不是因果证据**。
- 20/22 为合成 session（3 种确定性 pattern），Case 分布主要由 pattern 决定。
- 不执行、不替换、不接生产；未改任何生产组件。

## 下一步（未执行）

- 对「reveal 密集」session 检查 shadow 策略的 frustration 控制（Case B 修正方向）。
- 收集真实 session 数据以替换合成样本。
- 暂不进入 Policy v1 候选。