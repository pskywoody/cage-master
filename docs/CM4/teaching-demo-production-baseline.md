# Teaching Demo Production Baseline

> P1 入口基线。冻结当前教学 demo 资产，不因优化扩大 auto 范围。

## golden_demo_manifest 状态

- 文件：`data/golden-demo-manifest.json`（机器生成，不可手改）
- `AUTO_ENABLED = 35`
- `MANUAL_REVIEW = 13`

## AUTO_ENABLED（35）

101,102,103,104,105,106,107,108,201,202,203,204,205,206,207,208,301,302,303,304,305,401,402,403,405,501,502,503,504,601,602,701,702,703,705

## MANUAL_REVIEW（13）

- composite 综合关（11）：109,306,307,406,505,506,603,604,605,606,706
- delayed structure（2）：404 nakedTriplet, 704 xWing

## resolver 输入输出契约

输入：`{ levelId, engine(HeadlessEngine), levelData }`

输出：`{ plannedTechnique, targetCell, resolvedTechnique, fallback, fallbackReason, evidenceComplete, deduction, actions }`

生产层（P1 增强）再包装为：`{ levelId, technique, confidence, demoSteps, fallback }`

## 已知失败模式

- `no_target_technique`：composite 关无单一目标技巧 → 手写。
- `technique_unavailable`：404/704 延迟结构开局不可用 → 手写。
- 低样本关的 confidence 不宜过高（慢下 mastered 结论）。

## 约束

- 不改变 35/13 划分。
- 不扩大 auto 范围。
- 不改 solver / Experiment Platform / LearnerModel / Teaching AI policy。