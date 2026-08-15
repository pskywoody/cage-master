# Teaching Intent Taxonomy（Battle AI → Teaching AI Phase 1）

> 状态：研究模型（未验证教学有效）· 只读，不改 core/。

## 映射模型

```
AI personality state → director intent → teaching intent
```

依据：已冻结的 `BATTLE_AI_PERSONALITY_VALIDATED` 结论——人格差异集中在 **director intent 层 + action 层**，strategy 层共享。因此教学意图从「director intent」而非「strategy」派生。

## 人格 → 教学意图映射

| Personality | 冻结的 director intent | Teaching intents |
|---|---|---|
| mentor | `test_player_response` / `contest_hub`（低攻击压力） | `detect_mistake` · `reduce_pressure` · `provide_correction_path` |
| prober | `bait_player`（诱导） | `maintain_challenge` · `expose_weakness` · `test_boundary` |
| expert | `contest_hub` / `protect_owned_hubs`（高技巧发现） | `demonstrate_optimal_solution` · `provide_reference_trajectory` |
| blind / average / reckless | `test_player_response` / `contest_hub`（非教学目标） | —（competition-only，暂不映射） |

## 教学意图定义

- `detect_mistake`：识别学生当前错误模式。
- `reduce_pressure`：学生犯错后降低对抗强度。
- `provide_correction_path`：给出可执行的修正路径/提示。
- `maintain_challenge`：保持"够得着"的挑战难度。
- `expose_weakness`：主动暴露学生薄弱点。
- `test_boundary`：试探学生能力边界。
- `demonstrate_optimal_solution`：展示最优解。
- `provide_reference_trajectory`：提供参照轨迹。

## 边界

- 这是**研究假设**的映射模型，不宣称教学有效。
- 映射基于已冻结的人格行为差异，未修改生产 AI 行为。