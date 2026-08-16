# Teaching AI Intervention Boundary 报告（Phase 11）

> SHADOW / counterfactual only；不接生产、不改 simulator。输出 **Intervention Boundary Map**（不是 winner）。

## 方法

三种介入策略 × 4 learner state × 100 learner × 10 episodes：

- **A Always Teach**：每步 `guided`（总是介入）
- **B Minimal Hint**：每步 `free_attempt`（尽量退后）
- **C Adaptive Boundary**：struggling→partial_hint；novice→question（guess/weak→partial_hint）；guided→question；independent→free_attempt

指标 `value = transfer + (1 - frustration) + (1 - hint_dependency)`（高=好）。介入动作 = reveal/demo/guided/partial_hint。

## 结果（state × policy）

| state | A value(frust/hint/transfer) | B value(frust/hint/transfer) | C value(frust/hint/transfer) |
|---|---|---|---|
| struggling | 1.512 (0.2/1/0.712) | 1.713 (**1.0**/0/0.713) | **2.609** (0.2/0/0.809) |
| novice | 1.512 (0.2/1/0.712) | 2.198 (0.65/0/0.848) | **2.625** (0.2/0/0.825) |
| guided | 1.512 (0.2/1/0.712) | **2.648** (0.2/0/0.848) | 2.642 (0.2/0/0.842) |
| independent | 1.512 (0.2/1/0.712) | **2.648** (0.2/0/0.848) | 2.648 (0.2/0/0.848) |

## Intervention Boundary Map

| learner state | intervene probability | 边界判断 |
|---|---|---|
| struggling | ~0.25（前期脚手架） | **介入**：否则 `free_attempt` → frustration 打到 1.0、恢复 10 步 |
| novice | ~0.10 | **轻度介入**：`question` 即可；`free_attempt` 仍有 frust 0.65 |
| guided | 0 | **退后**：介入只增加 hint 依赖，不增 transfer |
| independent | 0 | **退后**：介入弊大于利（依赖↑、transfer 不涨） |

## 核心结论

**不是「最少提示」，而是「最少必要帮助」（minimum necessary assistance）。**

- 在 `struggling / novice`，介入的价值是**防挫败螺旋 + 加速恢复**（B 的 frustration 高、恢复慢）。
- 在 `guided / independent`，介入的代价是**培养依赖**（A 的 hint_dependency=1、transfer 0.712），退后反而 transfer 更高（0.848）。
- 因此介入边界随掌握度**递减**：`struggling > novice > guided ≈ independent ≈ 0`。

这张 map 就是未来 Teaching Policy v1 的「何时教 / 何时退后」核心依据。

## 边界

- SHADOW / 模型条件结论；`value` 权重是我为演示设定的组合，非校准。
- 不接生产、不改 simulator、不自动执行教学动作。