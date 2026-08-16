# Teaching Policy UA-v2 Report（Phase 14）

> SHADOW / offline / synthetic。只读 `core/learner-state-boundary-refiner.js`，未改任何生产文件、未接生产、未自动触发教学、未改 mastery 定义。
> 目标：验证 Phase 12.5 的 Learner State Boundary Refinement 是否真正解决 Phase 13 暴露的问题——
> 细粒度 learner state 是否能让 uncertainty-aware policy **同时**降低「过度介入」与「错误撤退」。

## 方法

- 真值状态（Phase 12.5 refined）：`novice_exploration / temporary_error / persistent_struggle / guided / independent`，各 120 learner（N=600）。
- 每个 learner：生成可观测证据 → 得到 coarse 状态 + coarse 置信（Phase 13 输入，**模糊类低置信 0.25**，根因所在）→ 经 `refineBoundary` 得到 refined 状态 + refined 置信（细粒度后 0.94–1.0）。
- 三策略对照：
  - **Policy A — Naive**：coarse 状态 → 直接动作（复刻 Phase 13 Naive）。
  - **Policy B — UA-v1**：coarse 状态 + coarse 置信；低置信且模糊类 → 先 `question` 观察（复刻 Phase 13 Uncertainty-aware）。
  - **Policy C — UA-v2**：refined 状态 + refined 置信 → 粒度映射（本阶段）。

## 结果

### 指标（N=600）

| 指标 | Naive (A) | UA-v1 (B) | UA-v2 (C) | 说明 |
|---|---|---|---|---|
| false_intervention_rate | 0.00 | 0.00 | **0.00** | 对探索期/独立仍脚手架的比例 |
| false_backoff_rate | 0.00 | 0.20 | **0.00** | 对持续挣扎未介入的比例（错误撤退） |
| recovery_time（persistent） | 4 | 7 | **4** | 持续挣扎恢复时长（越低越好） |
| recovery_time（mean） | 3.0 | 3.6 | **2.6** | 全体平均 |
| hint_dependency（mean） | −0.04 | −0.10 | **−0.20** | 越低越好，可为负 |
| transfer（mean） | 0.10 | 0.40 | 0.40 | 自得技能迁移 |
| retention（mean） | 0.08 | 0.32 | 0.32 | 技能保持 |
| match_rate（对 expected） | 0.20 | 0.20 | **1.00** | 5 状态全部命中 |

### Boundary Alignment（真值 → 实际动作）

| 真值 \ 策略 | Naive | UA-v1 | UA-v2 |
|---|---|---|---|
| novice_exploration | question | question | **observe** ✅ |
| temporary_error | partial_hint | question ✅ | question ✅ |
| persistent_struggle | partial_hint ✅ | question ❌ | **partial_hint** ✅ |
| guided | question | question | **backoff** ✅ |
| independent | free_attempt | free_attempt | **backoff** ✅ |

## 已证明（Proven）

1. **UA-v2 消除了 Phase 13 的核心代价**：UA-v1 因 coarse `novice_with_error`/`struggling` 都低置信被误并，对真 struggling 也「先观察」（`question`），导致 false_backoff = 0.20、persistent 恢复 7→恶化。UA-v2 用 refined 状态后，`persistent_struggle` 获得高 refined 置信（0.94–1.0），稳定给出 `partial_hint` 介入，**false_backoff 降为 0.00**，persistent 恢复回到 4（不恶化）。
2. **过度介入未回升**：UA-v2 的 false_intervention_rate = 0.00，与 UA-v1 持平（≤ UA-v1），`novice_exploration` 改为 `observe` 让其探索，未引入新依赖。
3. **hint dependency 不增反降**：−0.20 ≤ −0.10（UA-v1），因 UA-v2 对 guided/independent 正确 `backoff`，不再像 Naive/UA-v1 那样持续 `question`。
4. **match_rate 1.00**：5 个边界状态全部映射到 expected 动作，证明细粒度状态使 policy 决策与「该介入/该退后」预期完全一致。

→ **结论：Phase 12.5 的 Learner State Boundary Refinement 确实解决了 Phase 13 暴露的根因**——UA-v2 能「只对 novice/临时失误观察、对 persistent_struggle 持续介入」，不再互相拖累。

## 未证明（明确保留）

- ❌ **not real learner evidence**：全部为 synthetic / shadow 数据，沿用 Phase 12.5「合成 4×50 / 5×120」方法论，未接入真实学员。
- ❌ **not production validation**：未接生产 `LearnerModel`/`TeachingSystem`/`HintSystem`/`LessonPlayer`/`Experiment Platform`，仅 shadow 评估。
- ❌ **not causal learning gain**：recovery_time / hint_dependency / transfer / retention 为**模型化 proxy**（按 (truth, action) 查表），非因果学习增益，仅用于相对比较。

## 验收

```
TEACHING_POLICY_UA_V2_VALIDATED = true
  false_intervention_rate(UA-v2)=0.00 <= UA-v1(0.00)  ✅
  false_backoff_rate(UA-v2)=0.00     <= UA-v1(0.20)  ✅
  recovery_persistent(UA-v2)=4       <= UA-v1(7)     ✅
  hint_dependency(UA-v2)=-0.20       <= UA-v1(-0.10) ✅
```

## 下一步决策点

- **Phase 14 PASS** → `Teaching Policy v1` 成为 **Shadow Candidate**（可在 shadow 层承接 learner state → policy decision → action 链路）。
- **Phase 14 FAIL** → 重新审视 state / action boundary（本次未触发）。

## 本阶段交付物

- `docs/CM4/teaching-policy-ua-v2-schema.md`（策略契约与三套映射）
- `scripts/teaching-policy-ua-v2-eval.mjs`（shadow runner，只读 refiner）
- `data/teaching-policy-ua-v2/metrics.json`
- `data/teaching-policy-ua-v2/state_action_confusion_matrix.json`
- `data/teaching-policy-ua-v2/summary.json`
- 本报告

> 按执行纪律：**完成后停止等待**，不进入 Production Bridge / Real Session / Online Experiment。是否 freeze 并进入「Teaching Policy v1 Shadow Candidate」由你判断。
