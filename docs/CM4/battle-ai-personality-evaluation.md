# Battle AI 人格行为评估（CM4 Research Sprint）

> 状态：单遍采样 · 日期：2026-08-16 · 证据：`data/battle-ai-traces/decisions.jsonl` + `summary.json`

## 1. 方法与口径

对 level-109，6 个人格（blind / expert / mentor / prober / average / reckless）× 5 个受控状态（leading / losing / neutral / hot-streak / cold-streak）各采样 1 次（共 30 次），记录 Solver 策略、Director 意图、step.technique、是否写笔记。**不改人格参数、不改关卡、不改 TechRater**。

目标不是「每局结果不同」，而是检验「同状态 + 不同人格 → 不同的策略/风险/笔记偏好是否存在可解释差异」。

## 2. 可解释差异（单遍样本）

- **blind（薇拉·试探布局）**：`neutral → guess`、`cold-streak → misread`。表现为低把握猜测/看错，符合「盲试探」人格。
- **expert（山田·全局控场）**：稳定 `pointingClaiming`，且在 `leading/hot-streak` 转 `defend + protect_owned_hubs`。表现为高技巧发现 + 领先巩固。
- **mentor / prober / average**：`leading/hot-streak → defend + protect_owned_hubs`；`losing → attack`。三点连线人格在领先时收束。
- **prober（试探）**：`neutral → bait_player`（Trap 诱导），`losing/cold → note`。表现为诱导 + 压力下写笔记。
- **reckless（鲁莽）**：`losing → note`、几乎恒 `attack`。表现为激进 + 落后时仍进攻并写笔记。

## 3. 结论

六人格在**单一受控状态下**已产生可解释的决策/策略/笔记差异（blind→guess/misread、expert→pointingClaiming、prober→bait、reckless/average→note under pressure），不是纯随机数差异。人格通过 `AI_PERSONALITIES`（baseErrorRate/discoveryRate/thinkTime/fakeNoteRate 等）+ `PERSONALITY_STRATEGY_BIAS`（导演层）进入决策。

## 4. 限制

- 每 cell 仅 1 次采样，无法做分布/显著性。
- 「每局结果不同」非本实验目标；要量化策略分布/风险/笔记分布差异，需 Phase 13 的 N≥20 重复采样。

## 5. 建议

Phase 13 做 6 人格 × 同一场景 × N≥20 的决策分布对比，并记录 `getStrategy()` / `getDirectorDecision()` / note/fakeNote/mistake 的频分布，用卡方/KS 判可解释差异；本报告只证明「差异存在且方向可读」。