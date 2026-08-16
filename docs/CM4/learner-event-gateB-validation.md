# Learner Event Gate B — Shadow Validation（H1 + H2）

> 状态：**GATE B 运行 · 结论：H1 待真实数据，H2 暴露分类边界**（CM4 最高价值点）
> 范围：真实事件经 adapter → LearnerModel → state-refiner 的分布与可区分性验证。
> 前置：Gate A（Runtime Event Wiring）已打通真实事件流。

## 数据边界（诚实声明）

本验证数据来自**真实生产模块（HintSystem/TeachingSystem/HeadlessEngine）在真实关卡上的运行**，非合成注入；但**非真实玩家**：
- H1 为"AI 正常玩家（按解填格）"运行快照，不构成真实玩家分布。
- H2 为"真实引擎驱动不同玩家策略"产生的真实事件序列，验证分类可区分性。

真实玩家 session 数据仍缺失（工程侧待接真实用户流量）。

## H1 — State Distribution

| 关卡 | fine | coarse | UA-v2 | observe | solved |
|---|---|---|---|---|---|
| 101 | independent | independent | free_attempt | 30 | ✓ |
| 102 | independent | independent | free_attempt | 33 | ✓ |
| 103 | independent | independent | free_attempt | 33 | ✓ |
| 104 | independent | independent | free_attempt | 36 | ✓ |
| 105 | independent | independent | free_attempt | 36 | ✓ |

分布：`{ independent: 5 }`。bySource：TeachingSystem 56 / HintSystem 56 / Puzzle 56。

**结论**：AI 正常玩家（按解填格、无错误）在 AI 教学下全部独立完成。**真实玩家中 novice_exploration / temporary_error / persistent_struggle 的占比仍完全未知**——需真实 session 积累才能回答 H1。

## H2 — persistent_struggle vs temporary_error 区分

### 真实驱动

| 玩家策略 | errors | correct | hintThenFail | maxConsecErr | fine |
|---|---|---|---|---|---|
| persistent（始终填错） | 60 | 0 | 30 | 60 | **persistent_struggle** ✓ |
| temporary（偶发失败） | 18 | 10 | 4 | 3 | independent |

featureGap：errors +42 / maxConsecErr +57 / hintThenFail +26 → 特征分离清晰。

### 分类边界审计（轨迹模板）

| 轨迹 | 期望 | 实际 | 结果 |
|---|---|---|---|
| hint→error×3 | persistent_struggle | persistent_struggle | OK |
| error→guided_success×2 | temporary_error | temporary_error | OK |
| error | novice_exploration | novice_exploration | OK |
| guided_success | guided | guided | OK |
| correct→correct | independent | independent | OK |
| **correct→correct→error** | **temporary_error** | **independent** | ✗ GAP |
| **correct→correct→hint→error×2** | **persistent_struggle** | **independent** | ✗ GAP |

### 核心发现（CM4 最高价值点）

`core/teaching-ai-state-refiner.js` 的 `classifyFine` 第 27 行 `if (indep >= 2) return 'independent'` 是**无条件提前返回**，忽略其后所有错误。

后果：**一旦玩家先建立 ≥2 次独立成功，再陷入困境（persistent 或 temporary），分类器会把整段轨迹误判为 independent**——两个 struggling 子状态都不可见。

即：Phase 14 声称的"persistent_struggle 对 temporary_error 100% 分离"**只在无独立成功先例的纯净轨迹上成立**；在真实常见的"**先成功后困**"轨迹上不成立。

## 结论

- H1：测量管线就绪，真实分布待真实数据。
- H2：persistent_struggle 在真实驱动下可稳定识别；但 **temporary_error 与 persistent_struggle 的区分在"先独立成功≥2 再犯错"的轨迹上失效**，被判 independent。
- 这直接回答用户关切：**H2 的判别是 CM4 最高价值点，当前在真实轨迹的"先成功后困"场景不可达**。

## 建议（待确认，尚未改动）

`classifyFine` 的 `indep>=2` 提前返回应改为条件化——例如"indep≥2 **且** 无近期错误（errors 没有发生在最近 N 步）"才判 independent。这会改变 Phase 14 的判定边界，属于研究结论修正，需确认后实施。

## 产物

- `scripts/learner-event-gateB-validation.mjs`
- `data/learner-event-gateB/gateB-report.json`
- `data/learner-event-gateB/gateB-separation.json`