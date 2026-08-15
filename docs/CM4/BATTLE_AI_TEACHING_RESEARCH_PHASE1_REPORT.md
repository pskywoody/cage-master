# BATTLE_AI_TEACHING_RESEARCH_PHASE1_REPORT

> 状态：教学转化 Phase 1 基础设施完成 · 未宣称教学有效 · 不改 core/。

## 已验证事实（来自已冻结研究）

- AI 具备状态化闭环决策（`BATTLE_AI_CLOSED_LOOP_VALIDATED`）。
- 6 人格行为可区分，差异集中在 **director intent 层（Cramér's V=0.281）与 action 层（V=0.299）**，strategy 层共享（V=0.070，不显著）（`BATTLE_AI_PERSONALITY_VALIDATED`）。
- Director 意图集：`test_player_response / contest_hub / protect_owned_hubs / convert_advantage / bait_player`。
- TechRater 是唯一 solver fact source。

## 未验证假设（不宣称成立）

- Personality → teaching intent 映射能带来真实学习增益。
- 教学有效性、参与度、修正效率、恢复时间提升。
- 虚拟 learner 的学习更新反映真实学习（本轮均为合成假设）。

## 新增模型 / 研究设施

- `docs/CM4/teaching-intent-taxonomy.md` — personality → director intent → teaching intent 映射。
- `docs/CM4/teaching-action-schema.md` — 非生产 `TeachingActionEvent` schema。
- `scripts/teaching-ai-offline-sim.mjs` — 离线虚拟 learner 模拟（不改 core/）。
- `data/teaching-ai-simulations/trajectories.jsonl` — 48 条模拟轨迹（3 personality × 4 学生态 × 4 步）。
- `docs/CM4/teaching-ai-experiment-design.md` — Personality Policy A/B protocol（仅协议，未运行）。

## 实验设计（仅协议）

- Personality Policy A/B：mentor/prober/expert 教学策略 vs average 对照。
- Primary：learning gain（需真实 LearnerModel，本阶段未接）。
- Secondary：engagement / correction efficiency / recovery time。

## Production Boundary

- 无 `core/` 修改；无生产 AI 行为修改；无 LearnerModel / HintSystem / LessonPlan 修改。
- 仅新增 `scripts/`、`data/teaching-ai-simulations/`、`docs/CM4/` 研究资产。