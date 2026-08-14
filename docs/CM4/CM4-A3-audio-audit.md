# CM4-A3 · Audio Audit

> **Code**：CM4-A3 · **状态**：⏳ 完成盘点，待人工复核
> **审计时间**：2026-08-11
> **对照口径**：`docs/audio-production-spec.md`（Phase 1 交付规格）

---

## 1. 资产盘点（Inventory）

| 类别 | 规格要求 | 实际 | 判定 |
|---|---|---|---|
| BGM | 16 条 | **16** | ✅ 齐 |
| SFX（根） | — | 62 | ✅ 存在 |
| SFX（NEO） | — | 32 | ✅ 存在 |
| Voice（配音） | 12 角色 | **12** 角色 / 1240 文件 | ✅ |
| voice_index.json | 覆盖全部 VO | 1226 条目 | ⚠️ 见 §3 |

角色分布：

| 角色 | 代码 | 文件数 | 角色 | 代码 | 文件数 |
|---|---:|---|---|---:|
| 阿妍 | R | 339 | 守笼人 | CK | 300 |
| 莹莹 | J | 264 | 设局人 | P | 111 |
| 沈墨 | SM | 99 | 设局人(秘术) | SS | 34 |
| 旁白 | N | 51 | 星辰梭 | W | 13 |
| 设局人(残影) | PS | 15 | 残局守护者 | RE | 8 |
| 系统 | S | 5 | 你 | U | 1 |

---

## 2. BGM BPM 元数据一致性

`audio/audio-service.js` 的 `BGM_BPM_MAP`（14 首）与规格表 BPM 完全一致：

| BGM | BPM | BGM | BPM |
|---|---|---|---|
| intro | 96 | chapter_6 | 120 |
| chapter_1–7 | 100→124 | boss_battle | 132 |
| eureka | 128 | ending_c1–c3 | 90/88/92 |
| ending_true | 84 | — | — |

✅ 无偏移。`hidden_level.wav` / `victory.wav` 未列入 BPM 表（规格亦标"—"，一致）。

---

## 3. voice_index.json 覆盖率缺口（⚠️ 发现项）

- **规格**：`voice_index.json` 应覆盖全部 VO 资产（供 duration 查询与预加载）。
- **实际**：`voice_index` 1226 条，磁盘 **1240** 个 VO——**14 个变体文件未入索引**：

```
CK   VO_CK_0107b/c/d      J    VO_J_0072b, VO_J_0095b, VO_J_0107b
P    VO_P_0019b/c         R    VO_R_0061b, VO_R_0105b/c
SM   VO_SM_0054b, VO_SM_0080b, VO_SM_0081b
```

- **影响（已确认）**：这 14 个 `_b/_c/_d` 变体**无法通过 `audioService.voice.play()` 播放**（`_loadVoiceBuffer` 依赖 voice_index 的 file 路径解析）。**关键：其中 13 个已被生产剧情脚本 `data/scripts/scripts.json` 引用**，仅 `VO_J_0072b` 未在脚本中命中。被引用的变体会触发**静默播放失败**（VO 缺失）。
  - 已确认被引用：`VO_R_0061b`、`VO_SM_0054b`、`VO_P_0019b/c`、`VO_SM_0080b`、`VO_J_0095b`、`VO_R_0105b/c`、`VO_SM_0081b`、`VO_CK_0107b/c/d`、`VO_J_0107b`。
  - 未引用：`VO_J_0072b`。
- **建议**：将 scripts.json 引用的 13 个变体补入 `voice_index.json`（含 file/char/duration），否则对应剧情 VO 静默缺失；`VO_J_0072b` 若为废弃重录音则归档清理。

---

## 4. 命名规范一致性

- 磁盘命名：`<category>/<event>[_variant].[ext]` ✅ 全部符合 snake_case。
- VO 命名：`VO_<CHAR>_####[variant].mp3` ✅ 符合。
- 扩展名：BGM `.mp3`/`.wav`、SFX `.wav`/`.mp3`、VO `.mp3` ✅ 符合。
- **SFX 根/NEO 重复**：`sfx/` 根与 `sfx/NEO/` 存在同名胜样本（如 `fill_correct.mp3`、`door_open.mp3`、`footstep_hall.mp3` 等）。按规格，NEO 为"高音质变体/专属音"，需确认加载路径是否优先取 NEO，避免双目录歧义。

---

## 5. 结论

- **资产完整度**：BGM 齐、SFX 充足、VO 全量到位（12 角色 1240 条）。
- **主要发现（已确认）**：① **voice_index 缺 14 个 `_b/_c/_d` 变体，其中 13 个被 `data/scripts/scripts.json` 引用 → 对应剧情 VO 静默缺失（高优先级修复）**；② SFX 根/NEO 双目录 25 个同名样本，需确认加载优先级（NEO 应优先）。
- **次要不一致**：无其余规格偏差。

> 待复核项：NEO 双目录加载优先级。voice_index 补录为明确修复项（见 CM4-A3 修复清单）。