# CM4 Phase · Battle & AI Audit

> **状态：ACTIVE（2026-08-11）**
> **前置**：B4 research 已 FROZEN/ARCHIVED（head≈65-67% 为 tiling 架构结构性地板，见 `docs/B4/README.md`）。**B3-FINAL 生产基线不可变。**
> **触发**：B4 关闭后，CM4 转向生产系统审计——BattleManager 与 AIBot 两大核心对战组件。

---

## 阶段语义

```
B3 = production baseline（不可变）
B4 = generation frontier research（FROZEN，已归档）
CM4 = 生产系统审计（当前）
```

**CM4 只做**：

> 审计生产级核心组件的正确性、健壮性、可维护性与一致性，产出可执行的修复清单。**不改 B3-FINAL 生成链路。**

**CM4 不做**：

- ❌ 改 cage generator / selection / objective（B4 已闭环）
- ❌ 改 B3-FINAL 冻结参数
- ❌ 引入新玩法机制（除非作为独立审计项）

---

## 审计对象

| Code | 组件 | 文件 | 状态 |
|---|---|---|---|
| CM4-A1 | BattleManager | `core/battle-manager.js` | ✅ 完成（2 P1 + 一批 P2） |
| CM4-A2 | AIBot（AIPlayerCore） | `core/battle-manager.js`（AIPlayerCore 类） | ✅ 完成（3 P1 接口契约一致性） |
| CM4-A3 | Audio Service / 资产 | `audio/audio-service.js` + `assets/audio/` | ✅ 完成（voice_index 缺 13 个被引用变体） |

## 并行执行

- **Audio Audit（CM4-A3）**：与 A1/A2 并行，围绕 `docs/audio-production-spec.md` 的交付规格核对资产现状。
- **Battle 审计（CM4-A1）**：A2 完成后衔接，聚焦棋盘归属转移、补偿逻辑、Boss 机制。
- **AI 审计（CM4-A2）**：聚焦 AIPlayerCore 决策链、六人格差异化、观察器。

---

## 关键文档

- `audio-production-spec.md` — 音频制作规格（Phase 1 交付口径）
- `B3-FINAL-manifest.md` — 不可变生产基线
- 审计产出：`docs/CM4/CM4-A1-battlemanager-audit.md`、`docs/CM4/CM4-A2-aiplayer-audit.md`、`docs/CM4/CM4-A3-audio-audit.md`