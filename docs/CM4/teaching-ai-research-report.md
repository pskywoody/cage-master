# CM4 Teaching AI 研究总报告（Phase 1 – 14.5）

> 日期：2026-08-16 · 状态：研究链收敛（理论收敛点），**WAITING_FOR_REAL_EVIDENCE**
> 范围：Teaching AI 研究链 Phase 1（Intent Taxonomy）→ Phase 14.5（Event Capture Foundation）
> 前置：Battle AI 研究（`BATTLE_AI_PERSONALITY_VALIDATED` / `BATTLE_AI_CLOSED_LOOP_VALIDATED`）+ TechRater 优化冻结，为本链提供「可研究的 AI 行为」基础。

---

## 1. 研究问题演进

整条链回答的问题一步步收敛：

1. **能不能造一个 AI 教师？**（Phase 1–3：taxonomy / simulator / calibration）
2. **AI 与现有教学流程差在哪？**（Phase 4–7：policy experiment / sensitivity / outcome / causal / robustness）
3. **AI 是否知道何时该介入？**（Phase 8–11：shadow runtime / observation / boundary）
4. **AI 能否可靠识别真实用户的状态？**（Phase 12–13：state identification / uncertainty-aware）
5. **AI 能否在不知道状态时控制介入风险？**（Phase 14：state granularity refinement）

核心结论：**Adaptive Teaching 的瓶颈不是 policy 选择，而是 learner state representation 的粒度。**

---

## 2. 研究链总览

| Phase | 主题 | 关键产出 | 状态 |
|---|---|---|---|
| 1 | Teaching Intent Taxonomy | personality → director intent → teaching intent 映射 | ✅ |
| 2 | Counterfactual Evaluation | Learner Response 模拟器 + counterfactual runner | ✅ `TEACHING_AI_COUNTERFACTUAL_VALIDATED` |
| 3 | Calibration & Evidence Alignment | 假设登记表 + 证据映射 + 重放对齐 | ✅ `TEACHING_AI_CALIBRATION_READY` |
| 4 | Small Offline Policy Experiment | A/B/C 三策略 900 轨迹比较 | ✅ `TEACHING_AI_POLICY_EXPERIMENT_READY` |
| 4.5 | Policy Identifiability & Sensitivity | 奖励结构扰动，A≈C 是 artifact | ✅ `TEACHING_AI_POLICY_SENSITIVE` |
| 5 | Outcome Model Research | 四维 outcome（recovery/hint/transfer/retention） | ✅ 空结果：C 不优于 A |
| 6 | Causal Action Model | 6 动作因果分辨率 + C 在价值维度开始分开 | ✅ |
| 7 | Robustness Study | P(C>A)=5/5，ablation 定位 state-aware 收益 | ✅ PASS（幅度小） |
| 8 | Shadow Runtime | shadow adapter（只预测不执行）+ 回放 | ✅ `TEACHING_AI_SHADOW_READY` |
| 9 | Shadow Observation Loop | disagreement taxonomy + 分析 | ✅ `SHADOW_OBSERVATION_READY` |
| 10 | Shadow Outcome Attribution | counterfactual recovery / hint economy / divergence | ✅ 条件性（8/6/8） |
| 11 | Intervention Boundary | 介入边界图（minimum necessary assistance） | ✅ |
| 12 | Learner State Identification | 真实 LearnerModel 混淆矩阵 | ✅ backoff 侧可靠，intervene 侧粒度不足 |
| 13 | Uncertainty-Aware Policy | UA 降错误介入，但暴露 state 粒度缺口 | ✅ |
| 14 | State Granularity Refinement | struggling 拆三态，UA-v2 双零（over/under） | ✅ 理论收敛点 |
| 14.5 | Event Capture Foundation | 采集器 + 契约 + Gates 1–4 PASS | ✅ `WAITING_FOR_REAL_EVIDENCE` |

---

## 3. 逐阶段详情

### Phase 1 — Teaching Intent Taxonomy
建立 `AI personality state → director intent → teaching intent` 映射：mentor（detect_mistake / reduce_pressure / provide_correction_path）、prober（maintain_challenge / expose_weakness / test_boundary）、expert（demonstrate_optimal_solution / provide_reference_trajectory）；blind/average/reckless 暂标 competition-only。

### Phase 2 — Counterfactual Evaluation
写 `core/teaching-learner-simulator.js`（研究模型，非生产 LearnerModel）+ counterfactual runner：同一 learner 换 policy → 结果不同（mentor 对 struggling 恢复最佳、prober 造成挫败螺旋）。证明「可辨识的 counterfactual 能力」成立。

### Phase 3 — Calibration & Evidence Alignment
逐项把 simulator 假设锚到真实信号（learner-event-taxonomy）：`guided_success → mastery 上升`、`skill_used_correctly → 成功` 方向与真实证据一致（Confirmed）；`fail → surface_mistake` 语义不一致（Weak，只记录）；`personality→gain / engagement` 无真实信号源（Unknown）。

### Phase 4 — Small Offline Policy Experiment
30 learner × 3 policy（A static / B hint-aligned / C adaptive）× 10 episodes = 900 轨迹。结果：mastery A=C=2.733、B=1.0；唯一差异 C 的 hint_dependency 0.087 vs A 0。

### Phase 4.5 — Policy Identifiability & Sensitivity（SHADOW）
只扰动 masteryDelta：C-A gap 在 `-2.066 / 0 / +2.066` 间翻转（S1 demo-dominant → A 胜；S2 guided-dominant → C 胜）。结论：**A≈C 是 simulator 奖励结构 artifact，不是 policy 事实** → `TEACHING_AI_POLICY_SENSITIVE`。

### Phase 5 — Outcome Model Research
拆出四维 outcome 重跑：B 在 transfer/retention 显著更差（可区分）；**C 仍与 A 完全相同**（recovery/transfer/retention 全等）。空结果：当前 outcome model 无法识别 adaptive 价值。

### Phase 6 — Causal Action Model
扩到 6 动作（reveal/demo/guided/question/partial_hint/free_attempt），动作层具备因果分辨率。C 在 value 维度开始分开：recovery 3.333 vs 3.889、transfer 0.823 vs 0.815。结论：Phase 5 的平铺是「动作空间无表达力」的 artifact。

### Phase 7 — Robustness Study
5 个奖励扰动环境（baseline/easy/hard/high_forgetting/high_hint_sensitivity）下 **P(C>A)=5/5**（方向稳定，幅度 <1%）；ablation：C_full 1.573 > C_no_state 1.496 > C_no_adapt 1.490 > C_random 1.398 → 收益来自 **state-aware action selection**。判定 PASS：Adaptive 值得进入真实实验设计。

### Phase 8 — Shadow Runtime
`core/teaching-ai-shadow-adapter.js`（`shadowRecommend` 只预测 + `projectLearnerState`）+ 回放：disagreement rate 0.857（方向性信号，非结论）。四标准达成 → `TEACHING_AI_SHADOW_READY`。

### Phase 9 — Shadow Observation Loop
disagreement taxonomy（A 一致 / B 更低依赖 / C 更多解释 / D 不同阶段 / E 高置信分歧）。关键分解：**分歧主要来自 Type B（更低依赖）**，集中在 unknown/novice/guided，independent 阶段几乎零分歧（真实 0/1、合成 0/7）。即 0.857 是「shadow 更少提示」，不是「AI 错」。

### Phase 10 — Shadow Outcome Attribution
每 session 双轨（actual vs shadow counterfactual）归因：CaseA 8 / CaseB 6 / CaseC 8（混合）。hint economy：productive 35 / dependency 14。结论：**「少提示」不是无条件更好**——hint/fail 密集 session 里 shadow 更好，reveal 密集 session 出现挫败 tradeoff，干净成功 session 只是风格。

### Phase 11 — Intervention Boundary
三种策略（Always Teach / Minimal Hint / Adaptive）跨状态比较，产出**介入边界图**：

| state | intervene prob | 判断 |
|---|---|---|
| struggling | ~0.25 | 介入（否则 frustration 螺旋） |
| novice | ~0.10 | 轻度介入 |
| guided | 0 | 退后 |
| independent | 0 | 退后 |

核心结论：**minimum necessary assistance**（不是 minimum assistance）——介入边界随掌握度递减。

### Phase 12 — Learner State Identification
用真实 `core/learner-model.js` 做识别实验：accuracy 0.75。**guided/independent 100% 可靠**（退后安全）；**struggling↔guided 混淆=0**（最高风险不存在）；**novice 不可识别（recall 0）**——LearnerModel 无「novice」状态，`exposed+error` 触发 trend=struggling。整体置信低（0.17–0.225）。

### Phase 13 — Uncertainty-Aware Policy
naive vs UA（低置信→question）：novice 过度介入 **0.50 → 0.00**，hint dependency 0 → -0.06；但真 struggling 也被轻化（frustration 0→0.05、mastery 0.55→0.35）。结论：**confidence 是有效控制变量，但 state 粒度不足让 UA 无法「只撤 novice、不撤 struggling」**。

### Phase 14 — State Granularity Refinement
把 struggling 拆成 `novice_exploration / temporary_error / persistent_struggle`，重跑 naive / UA-v1 / UA-v2：

| 指标 | naive | UA-v1(coarse) | UA-v2(fine) |
|---|---|---|---|
| over-intervention | 0.20 | 0.00 | **0.00** |
| under-intervention | 0.00 | 0.20 | **0.00** |

**UA-v2 同时归零两类风险**，达到 Pareto：`persistent→teach / temporary→observe / novice_exploration→explore / guided+independent→backoff`。证明瓶颈是 state representation 粒度，不是 policy。

### Phase 14.5 — Event Capture Foundation
`core/learner-event-collector.js`（session + collect + JSONL 落盘）+ `core/teaching-ai-state-refiner.js`（可复用细化层）+ 最小采集契约 + 四个来源挂接点。**Gates 1–4 全 PASS**（数据能力管线通）；运行时侧接线待工程实施。状态：**WAITING_FOR_REAL_EVIDENCE**。

---

## 4. 核心结论链

1. 教学动作具有**可识别因果差异**（Phase 6）。
2. Adaptive policy 在 richer outcome model 下产生**潜在优势**，方向稳定（Phase 7，P(C>A)=5/5）。
3. Shadow policy 的优势集中在 **hint economy / recovery**（Phase 9–10）。
4. **过度减少提示会产生 frustration tradeoff**（Phase 10）→ 精确化为**介入边界随掌握度递减**（Phase 11）。
5. LearnerModel 能可靠识别 **backoff 所需状态**，但介入侧内部（struggling/novice）粒度不足（Phase 12）。
6. **Uncertainty-aware 可以控制过度介入，但需要细粒度状态才能同时避免错误撤退**（Phase 13）。
7. **State granularity refinement 同时解决 over- 与 under-intervention**（Phase 14）——Adaptive Teaching 的核心瓶颈是 state representation，不是 policy。
8. 下一步进入真实证据积累（Phase 14.5 已备好数据入口），**不把 synthetic PASS 当用户效果**。

---

## 5. 关键交付物

**研究脚本**（`scripts/`）：teaching-ai-offline-sim、teaching-ai-counterfactual-eval、teaching-ai-replay-alignment、teaching-ai-policy-experiment、teaching-ai-policy-sensitivity、teaching-ai-outcome-eval、teaching-ai-causal-resolution、teaching-ai-robustness、teaching-ai-shadow-replay、teaching-ai-shadow-observation、teaching-ai-shadow-outcome、teaching-ai-intervention-boundary、learner-state-identification、teaching-ai-uncertainty-aware、teaching-ai-state-granularity、learner-event-capture-demo

**研究模块**（`core/`）：teaching-learner-simulator.js、teaching-ai-shadow-adapter.js、learner-event-collector.js、teaching-ai-state-refiner.js

**文档**（`docs/CM4/`）：teaching-intent-taxonomy、teaching-action-schema、teaching-ai-experiment-design、teaching-ai-counterfactual-report、teaching-ai-simulator-assumption-registry、teaching-ai-evidence-map、teaching-ai-calibration-report、teaching-ai-policy-catalog、teaching-ai-policy-experiment-report、teaching-ai-policy-identifiability-report、teaching-ai-phase4.5-freeze-report、teaching-ai-outcome-model、teaching-ai-outcome-eval-report、teaching-ai-causal-resolution(+report)、teaching-ai-robustness-report、teaching-ai-shadow-adapter(+report)、teaching-ai-shadow-observation-report、teaching-ai-shadow-outcome-report、teaching-ai-intervention-boundary-report、learner-state-identification-report、teaching-ai-uncertainty-aware-report、teaching-ai-state-granularity-report、learner-event-capture-foundation、teaching-ai-shadow-dataset

**数据**（`data/`）：teaching-ai-counterfactual、teaching-ai-calibration、teaching-ai-policy-experiment、teaching-ai-policy-sensitivity、teaching-ai-outcome-evaluation、teaching-ai-causal-resolution、teaching-ai-robustness、teaching-ai-shadow、teaching-ai-shadow-observation、teaching-ai-shadow-outcome、teaching-ai-intervention-boundary、learner-state-classification、teaching-ai-uncertainty-aware、teaching-ai-state-granularity、learner-event-capture

**Commit 链**（Teaching AI 段）：`038f317` → `2519bae` → `8e20163` → `502393d` → `4a6d055` → `1eb1ae0` → `6eed73f` → `d5f7dff` → `e19360e` → `cbe7bf3` → `507088c` → `f5dd80a` → `57e376c` → `e03db08` → `2331f5f` → `1271a31`

---

## 6. 边界与未验证项

- 全部为 **shadow / synthetic / counterfactual**；simulator 参数未经真实数据校准。
- 未验证：真实玩家收益、personality 影响、长期 retention、engagement（仅 SIMULATED_ONLY）。
- 未做：真实 session validation（Phase 15）——**缺真实 learner-event 数据**（Phase 14.5 已建数据入口，待运行时接线）。
- 未修改：生产 LearnerModel 定义、LessonPlan、HintSystem、TeachingSystem 行为；未接 UA-v2 decision；未自动教学。

---

## 7. 当前状态与下一步

```
TEACHING_AI_RESEARCH_CONVERGED
  synthetic counterfactual      PASS
  shadow policy comparison      PASS
  state uncertainty handling    PASS
  state granularity refinement  PASS
  real learner session events   MISSING（blocker）
```

路径：Phase 15 真实 session shadow validation → Phase 16 小流量实验协议 → Phase 17 受控 production experiment。

Phase 14 是理论收敛点，Phase 14.5 解除了最大 blocker 的「数据入口」侧；剩下的关键一步是工程侧把真实运行时信号接到 `LearnerEventCollector`（或提供真实 dataset 路径），之后整条链即可进入真实证据阶段。
