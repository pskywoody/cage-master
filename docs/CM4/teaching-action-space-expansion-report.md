# Teaching Action Space Expansion 报告（ACTION_SPACE_EXPANSION_REPORT）

> 状态：**ACTION_SPACE_EXPANSION_READY**
> 只扩充 shadow 可观测动作空间，不执行 AI 动作、不改生产教学行为、不改 Goal Engine policy、不改实验协议。

## 1. 完成项

- **TP-1 Teaching Action Schema v1**：`docs/schemas/teaching-action.v1.json`，统一动作对象 `{action, target, intensity, reason, expected_outcome}`，动作枚举 7 类（hint/demo/guided/question/partial_hint/difficulty_down/difficulty_up）。
- **TP-2 Question action shadow generator**：`generateQuestion()`，按 errorPattern 产出苏格拉底式提问（如「哪个约束最先被违反？」），只生成文本、不执行不显示。
- **TP-3 Partial hint ladder**：`partialHint(level)`，level0→3（提醒目标/指出方向/局部信息/完整步骤），分级信息量。
- **TP-4 Action coverage analyzer + Shadow policy ranking v2**：输出每动作 `shadow_can_generate / observed_system_evidence / status / uncertainty`，覆盖型排序（非胜负）。
- **TP-5 接 BB 实验平台契约**：仅记录桥接契约（见 §5），不跨仓接线、不改实验协议。

## 2. 产物

- `core/teaching-action-space.js`（动作枚举 + question/partial_hint/difficulty 生成器）
- `scripts/teaching-action-expansion.mjs`（接入现有 Shadow Evidence Accumulation 的 runner）
- `docs/schemas/teaching-action.v1.json`
- `data/teaching-action-space/`：`action-records.v1.jsonl`、`action-coverage.json`、`shadow-policy-ranking-v2.json`、`summary.json`

## 3. 校验结果

- 记录自校验：**116 / 116 valid，0 invalid**。
- `affectsUserBehavior=false`（shadow-only）。
- **动作空间覆盖率：0.429（3/7 可观测）**。
- 每动作证据（observed system action）：

| action | shadow_can_generate | observed evidence | uncertainty |
|---|---|---|---|
| demo | true | 22 | low |
| hint | true | 22 | low |
| guided | true | 21 | low |
| partial_hint | true | 0 | null |
| question | true | 0 | null |
| difficulty_down | true | 0 | null |
| difficulty_up | true | 0 | null |

说明：shadow 现在**能生成全部 7 类动作**（`shadow_can_generate=true`），但生产系统在现有真实+合成数据中只实际出现过 demo/hint/guided 三类；question/partial_hint/difficulty_down/difficulty_up 仍是 `no_system_evidence`。

## 4. Blocked

- 动作空间覆盖不足：4 类新动作无系统证据（数据缺口，非代码缺口），需真实 session 且系统动作空间展开后重跑。
- 真实样本极小（n=9）。
- 保持不动：`FROZEN_DATA_SOURCE`（KG 真实词库）、`FROZEN_EXTERNAL`（Chaquopy 网络）。

## 5. 下一决策点 / TP-5 桥接契约

- BB 实验平台将来消费的输入契约（仅记录，不接线）：由 `data/teaching-action-space/action-records.v1.jsonl` 提供 `session_id + learner_snapshot + action + outcome` 级别的单元观测，供多策略 shadow replay 与候选策略排序；实验协议与 Goal Engine policy 不在此处改动。
- 建议下一步：等真实 session（动作空间覆盖 question/partial_hint/difficulty_* 后）重跑 ranking v2，否则 `coverage_completeness` 无法超过 0.429。
- 小对齐项（待 PO）：现有观测里的 `free`、`reveal` 是 v1 canonical 枚举之外的 legacy 类别，是否并入 7 类或保持 legacy，需 PO 定夺。