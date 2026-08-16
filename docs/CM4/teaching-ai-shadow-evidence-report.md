# Teaching AI Shadow Evidence Accumulation 报告（Phase 10）

> 状态：**SHADOW_EVIDENCE_READY**（承接 Phase 8 shadow adapter、Phase 9 shadow observation）
> 只观察、只记录、不执行；不改 LessonPlan / HintSystem / TeachingSystem / LearnerModel / Experiment core。

## 1. 完成项

- **Shadow dataset schema v2**：`docs/schemas/shadow-dataset.v2.json`（`schema_version=2`，新增结构化 `disagreement` 与 `observed_outcome`）。
- **Outcome tracking**：每条 shadow 决策后记录观察到的后续结果 `observed_outcome`（recovered / failure_count / hint_count / recovery_latency_events）。
- **Recovery measurement**：按 disagreement 类型 A/B/C/D/N 的描述性 recovery 率（非因果）。
- **Counterfactual replay**：每 session 输出 `actual_sequence` vs `shadow_sequence` 的完整轨迹对照。
- **Policy candidate ranking**：候选策略的**关联性**优先级（非因果、不声明更优）。

## 2. 产物

- `scripts/teaching-ai-shadow-evidence.mjs`（Phase 10 主 loop）
- `docs/schemas/shadow-dataset.v2.json`（schema v2）
- `data/teaching-ai-shadow-evidence/`：
  - `shadow-events.v2.jsonl`
  - `outcome-tracking.json`
  - `recovery-measurement.json`
  - `counterfactual-trajectories.json`
  - `policy-candidate-ranking.json`
  - `summary.json`

## 3. 校验结果

- schema 自校验：**116 / 116 valid，0 invalid**。
- 确定性：真实样本 n=9（2 session）、合成样本 n=107（20 session），`source` 标注 `REAL` / `SYNTHETIC` 隔离。
- `affectsUserBehavior=false`（只读、不执行）。
- 描述性观察（**非因果**）：
  - outcome recovered_rate：REAL 0.444；SYNTHETIC 0.626。
  - recovery by disagreement：A=0(n=8)、B=0.69(n=71)、D=0.381(n=21)、N=0.875(n=16)、C=无数据。
  - category recovery：guided=1.0、reveal=1.0、hint=0.636、demo=0.364、free=0.276。

## 4. Blocked（数据缺口，非代码缺口）

- `question` 与 `partial_hint` 两个动作类别在现有真实+合成数据中**从未作为 system action 被观测到**，导致对应候选策略（always_question / always_scaffold）无法打分（steps_scored=0）。
- 真实样本极小（n=9）。
- 无真实长期 session 数据。

## 5. 下一决策点

- 需要真实 session 且 system 动作空间覆盖 `question` / `partial_hint` 后重跑，才能给候选策略有意义的描述性排序。
- 仍不做因果推断、不自动执行、不替换教学策略。等待真实数据，或 PO 决定是否进入 Teaching Policy v1 / 小流量 shadow 挂载。