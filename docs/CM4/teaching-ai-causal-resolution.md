# Teaching AI Causal Resolution Model（Phase 6）

> 影子模型（SIMULATED_ONLY）。目的：把「Teaching Action → Learner Response → Outcome」的因果分辨率做出来，
> 检验 Phase 5 的 A≈C 是否源于 action space 不够表达。不改正式 simulator。

## 动作空间（6）

`reveal` / `demo` / `guided` / `question` / `partial_hint` / `free_attempt`

## Learner Response（影子期望值，非真实概率）

每个动作 → 期望的：
- `mastery` 贡献（0..1/步）
- `hint_dependency` 贡献
- `independent_share`（独立完成占比，驱动 transfer）

| action | mastery | hint | independent |
|---|---|---|---|
| reveal | +0.10 | +0.20 | 0.10 |
| demo | +0.45 | +0.05 | 0.15 |
| guided | +0.55 | +0.15 | 0.28 |
| question | low +0.35 / high +0.70 | -0.05 | 0.46 |
| partial_hint | +0.45~0.55 | +0.10 | 0.36 |
| free_attempt | low +0.20 / high +0.75 | -0.10 | 0.62 |

## Outcome（四维）

- `mastery`：累计 mastery 贡献。
- `hint_dependency`：累计 hint 贡献。
- `transfer`：`0.6*clamp(mastery/4) + 0.4*independent_share`。
- `retention`：`transfer * (mastery >= independent ? 0.9 : 0.7)`。

## 为什么这样能让 C 有机会胜出

`reveal`/`demo` 偏向 guided 成功（低独立、高依赖）；`question`/`free_attempt` 偏向独立完成（高独立、低依赖、transfer 高）。C（adaptive）在对的阶段用 `question/free_attempt`，才会与 A（demo 为主）在 transfer/retention/dependency 上分开。