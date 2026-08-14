# CM4 音频制作规格书 · Audio Production Spec (Phase 1)

> **Phase 1 范围**：仅定义"音效制作"的交付规格（清单 / 命名 / 生成提示 / 目录映射）。
> **架构冻结**：`audio/audio-service.js` 在此阶段**不改动**——本文件是生产指南，不是代码重构。
> **优先级**：可玩体验 > 音频中间件。所有条目以"先让游戏能播、播得对、播得稳"为准。

---

## 1. 声音方向（Sonic Direction）

- **基调**：1941 上海谍战 + 笼式数独；阴冷克制、机械精密、暗流涌动。
- **时代感**：BGM 走"老上海 noir / 周璇式抒情 × 悬疑电影配乐"；禁用现代 EDM/合成器主音色（除非 stylized stinger）。
- **SFX**：以木 / 纸 / 石 / 机械打字机 / 风 等有机质感为主，避免电子预设感。
- **约束**：无人声（BGM 纯器乐）；单条 SFX ≤ 2s 优先解码驻留；长 BGM/环境流式。

---

## 2. 命名规范（Naming Convention）

### 2.1 文件命名（磁盘）
```
<category>/<event_name>[_variant].[ext]
```
- `category` ∈ { `bgm`, `sfx`, `sfx/NEO`, `voice/<CHAR>` }
- `event_name`：小写 snake_case，语义优先于来源
- `_variant`：多样本变体用 `_01/_02/_03`（脚步、打字机键、门必须多样本）
- 扩展名：BGM/环境 `.mp3`(128–192k)；短 SFX `.wav`(PCM) 或 `.mp3`；VO `.mp3`(96–128k)

### 2.2 事件命名（代码侧，沿用现有 SFX_MAP）
- 友好名 = 小写 snake_case（如 `fill_correct`、`door_stone_open`），**不写资源路径**
- 层级事件路径（规格目标，非本阶段强改）：`event:/SFX/UI/Click`、`event:/Music/Chapter/3`、`event:/VO/SM/0003`
- VO 文件：`VO_<CHAR>_<####>[variant].mp3`，落在 `voice/<CHAR>/`

### 2.3 角色代码（与现有 VOICE_CHAR_MAP 一致）
`CK`守笼人 `J`莹莹 `N`旁白 `P`设局人 `PS`设局人(残影) `R`阿妍 `RE`残局守护者 `S`系统 `SM`沈墨 `SS`设局人(秘术) `U`你 `W`星辰梭`

---

## 3. 资源目录映射（Asset Directory Mapping）

```
assets/audio/
├── bgm/                 # 背景音乐（流式）
│   ├── intro.mp3
│   ├── chapter_1..7.mp3
│   ├── boss_battle.mp3
│   ├── eureka.mp3
│   ├── hidden_level.wav
│   ├── victory.wav
│   ├── ending_circle1..3.mp3
│   └── ending_true.mp3
├── sfx/                 # 玩法/UI/环境音效（解码驻留）
│   ├── *.wav | *.mp3    # 主样本
│   └── NEO/             # NEO 收集的高音质变体 / 专属音
└── voice/               # 配音（按角色分目录，流式）
    └── <CHAR>/VO_<CHAR>_####.mp3
```
> 现状：bgm 16 条、sfx 根 56 + NEO 31、voice 12 角色共 1241 条。

---

## 4. BGM 清单（BGM List）

| ID | 文件 | 场景 | 情绪 | BPM | 循环 | 时长 |
|----|------|------|------|-----|------|------|
| BGM_INTRO | intro.mp3 | 标题/序章 | 悬疑铺陈、老上海夜色 | 96 | 是 | 60–90s |
| BGM_CH1 | chapter_1.mp3 | 第1章·书房 | 克制、纸墨、微张力 | 100 | 是 | 90–120s |
| BGM_CH2 | chapter_2.mp3 | 第2章·房门 | 略紧、木石质感 | 105 | 是 | 90–120s |
| BGM_CH3 | chapter_3.mp3 | 第3章·门道 | 推进、锁链感 | 108 | 是 | 90–120s |
| BGM_CH4 | chapter_4.mp3 | 第4章·丝线 | 缠绕、低频暗涌 | 112 | 是 | 90–120s |
| BGM_CH5 | chapter_5.mp3 | 第5章·暗流 | 流动、危机临近 | 116 | 是 | 90–120s |
| BGM_CH6 | chapter_6.mp3 | 第6章·罗网 | 收紧、网罗感 | 120 | 是 | 90–120s |
| BGM_CH7 | chapter_7.mp3 | 第7章·终幕·纳戸 | 终局、冷峻收束 | 124 | 是 | 90–120s |
| BGM_BOSS | boss_battle.mp3 | BOSS 战 | 高压、脉冲、打击感 | 132 | 是 | 90–120s |
| BGM_EUREKA | eureka.mp3 | 顿悟瞬间 | 明亮释放（一次性，可循环段） | 128 | 否 | 15–30s |
| BGM_HIDDEN | hidden_level.wav | 隐藏关 | 神秘、非常规调式 | — | 是 | 60–90s |
| BGM_VICTORY | victory.wav | 通关 | 释然、主题再现 | — | 否 | 20–40s |
| BGM_END_C1 | ending_circle1.mp3 | 圆环结局·一 | 余韵、慢板 | 90 | 否 | 60–90s |
| BGM_END_C2 | ending_circle2.mp3 | 圆环结局·二 | 递进、希望 | 88 | 否 | 60–90s |
| BGM_END_C3 | ending_circle3.mp3 | 圆环结局·三 | 展开、宽慰 | 92 | 否 | 60–90s |
| BGM_END_TRUE | ending_true.mp3 | 真结局 | 主题全奏、平静 | 84 | 否 | 90–120s |

> 调用接口（现有）：`audioService.bgm.play(chapterId)` / `playFile(name)` / `playBoss(id)` / `transition(intensity)` / `setLowPass(freq)`。

### BGM 生成提示（Generation Prompts）
统一前缀（每首追加"instrumentation / era / no vocal / seamless loop / 192k mp3"）：
- **通用**：*"1941 Shanghai noir film score, restrained tension, acoustic strings + piano + brushed percussion, era-authentic (no modern synth), cinematic underscore, seamless loop, instrumental only, 192k mp3."*

- **INTRO**：*"…slow-building suspense, distant erhu-like melody over low piano, rainy Shanghai night, 96 BPM, 60–90s loop."*
- **CH1–CH7**：*"…chapter N mood: <from table>; gradually tightening, wood/stone texture, BPM <from table>, 90–120s loop."* （CH7 改"cold resolution, theme fragments, 124 BPM"）
- **BOSS**：*"…high-pressure combat underscore, driving pulse, staccato strings + taiko-ish hits, 132 BPM, 90–120s loop, no vocal."*
- **EUREKA**：*"…bright major-resolution sting, shimmering celesta + strings swell, 128 BPM, 15–30s, single hit or short loop."*
- **HIDDEN**：*"…mysterious, off-key pentatonic, music-box + drone, unconventional mode, 60–90s loop."*
- **VICTORY / END_TRUE**：*"…thematic recapitulation, warm resolved major, full string ensemble, <ending_true 84 BPM>, 90–120s, emotional closure."*
- **END_C1–C3**：*"…epilogue elegy, slow rubato, solo piano to soft ensemble, 88–92 BPM, 60–90s each, ascending hope across the three."*

---

## 5. SFX 清单（SFX List）

> 分类 → 事件名（SFX_MAP 友好名）→ 文件 → 触发/用途 → 变体需求 → 生成提示。

### 5.1 核心玩法（Core Gameplay）
| 事件 | 文件 | 触发 | 变体 | 生成提示 |
|------|------|------|------|----------|
| click | click.wav | 通用点击 | — | soft UI tick, wood/plastic, 30ms |
| select | click.wav | 选中 | — | 同 click（别名）|
| fill_correct | fill_correct.mp3 | 填入正确 | — | bright confirmation chime, bell+click, 120ms |
| fill_wrong | fill_wrong.mp3 | 填入错误 | — | dull thud + low buzz, 150ms |
| erase | erase.wav | 擦除 | — | short scratch/undo, 80ms |
| note_toggle | note_toggle.mp3 | 笔记标记 | on/off 双 | tiny paper tap, 60ms |
| hint | hint.wav | 提示 | — | gentle shimmer, 200ms |
| hover / cage_highlight | hover.wav | 悬停 | — | faint ui breath, 40ms |
| dialog_advance | dialog_advance.wav | 对话推进 | — | paper页轻响, 70ms |

### 5.2 进阶反馈（Progression & Reward）
| 事件 | 文件 | 触发 | 变体 | 生成提示 |
|------|------|------|------|----------|
| success | success.mp3 | 过关 | — | rising arpeggio, warm, 300ms |
| error | error.wav | 系统错 | — | low deny buzz, 200ms |
| eureka | eureka.wav | 顿悟 | — | sparkle + chime swell, 400ms |
| breakthrough | breakthrough.wav | 突破 | — | ascending riser+crack, 500ms |
| victory_short | victory_short.mp3 | 小胜 | — | short fanfare, 600ms |
| victory_full | victory_full.mp3 | 大胜 | — | fuller fanfare, 1.2s |
| victory_true | victory_true.mp3 | 真结局胜 | — | thematic full, 1.5s |
| achievement | achievement.wav | 成就 | — | badge ding, 300ms |
| notification | notification.wav | 通知 | — | soft two-note ping, 200ms |
| reveal | reveal.wav | 揭示 | — | reverse whoosh + tone, 400ms |

### 5.3 三幕引导 / 连击（Act & Combo）
| 事件 | 文件 | 触发 | 变体 | 生成提示 |
|------|------|------|------|----------|
| act_open | (合成/待补) | 幕开启 | — | synth swell, 500ms |
| act_breakthrough | (合成/待补) | 幕突破 | — | riser+impact, 600ms |
| avalanche_start | (合成/待补) | 雪崩启动 | — | cascade noise, 800ms |
| combo_1..3 | combo_1..3.wav | 连击 1–3 | — | pitch-rising ticks, 100/120/140ms |
| combo_max | combo_max.wav | 满连击 | — | bright burst, 300ms |

### 5.4 UI 与翻页（UI & Transition）
| 事件 | 文件 | 触发 | 变体 | 生成提示 |
|------|------|------|------|----------|
| paper_flip | paper_flip.mp3 | 翻纸 | — | paper rustle flip, 150ms |
| book_flip | book_flip.wav | 翻书 | — | book page turn, 200ms |
| book_open | book_open.mp3 | 开书 | — | cover open creak-soft, 300ms |
| paper_fold | paper_fold.mp3 | 折纸 | — | fold crisp, 120ms |
| paper_tear | paper_tear.mp3 | 撕纸 | — | tear rip, 200ms |
| paper_unfold | NEO/paper_unfold.mp3 | 展开 | — | unfold brush, 300ms |
| seal_unlock | seal_unlock.mp3 | 解印 | — | wax click+release, 200ms |
| seal_stamp | seal_stamp.mp3 | 盖印 | — | thud stamp, 150ms |
| seal_glow | seal_glow.mp3 | 印发光 | — | airy glow, 300ms |
| seal_breaking | NEO/seal_breaking.mp3 | 印碎 | — | crack+shatter, 400ms |
| key_unlock | key_unlock.wav | 钥匙开 | — | key turn click, 150ms |
| chain_pop | chain_pop.wav | 锁链 | — | metal pop, 100ms |
| portrait_tap | portrait_tap.wav | 立绘点 | — | soft tap, 60ms |
| portrait_slam | portrait_slam.wav | 立绘砸 | — | hard slam, 200ms |

### 5.5 环境 / 机械 / 脚步（Environment & Footstep）
> **脚步与打字机必须多样本（_01/_02/_03）**，否则听感重复（见 Phase 1 设计差距①）。
| 事件 | 文件 | 触发 | 变体 | 生成提示 |
|------|------|------|------|----------|
| door_open | door_open.mp3 | 开门 | +NEO 变体 | wooden door open creak, 400ms |
| door_open_light | door_open_light.mp3 | 轻门 | — | light latch, 250ms |
| door_stone_open | door_stone_open.mp3 | 石门 | — | heavy stone grind, 600ms |
| door_final_open | door_final_open.mp3 | 终门 | — | monumental open, 900ms |
| footstep | footstep.wav | 脚步(默认) | 3+ | generic step, 90ms |
| footstep_wood | footstep_wood.mp3 | 木地 | 3+ | wood step, 90ms |
| footstep_stone | footstep_stone.mp3 | 石地 | 3+ | stone step, 100ms |
| footstep_hall | footstep_hall.mp3 | 廊道 | 3+ | hall echo step, 110ms |
| footstep_hall_2 | footstep_hall_2.mp3 | 廊道2 | 3+ | alt hall step, 110ms |
| footstep_fading | footstep_fading.mp3 | 远去 | — | receding steps, 400ms |
| footstep_run_light | footstep_run_light.mp3 | 轻跑 | 3+ | light run, 80ms×seq |
| chair_move | chair_move.mp3 | 移椅 | +NEO | wood scrape, 300ms |
| typewriter | typewriter.mp3 | 打字(长) | 3+ | typewriter sequence, loop |
| typewriter_key | click.wav(别名) | 打字键 | 3+ | single keystrike, 40ms |
| pen_write_fast | pen_write_fast.mp3 | 笔尖 | +NEO | pen scribble, 200ms |
| pen_write | NEO/pen_write.mp3 | 笔写 | — | pen on paper, 250ms |
| ambient_wind | ambient_wind.mp3 | 风(外) | +NEO loop | distant wind, loop |
| ambient_hall | NEO/ambient_hall.mp3 | 厅堂 | — | room tone, loop |
| thunder | thunder.wav | 雷 | — | distant thunder, 800ms |
| lamp_click | lamp_click.mp3 | 灯 | — | switch click, 50ms |
| electronic_pulse | electronic_pulse.mp3 | 电子脉冲 | +NEO | tech blip, 120ms |

### 5.6 情绪 / 评级 / 其他（Emotion / Rating / Misc）
| 事件 | 文件 | 触发 | 变体 | 生成提示 |
|------|------|------|------|----------|
| emotion_angry | emotion_angry.wav | 怒 | — | tense sting, 200ms |
| emotion_sad | emotion_sad.wav | 悲 | — | soft descending, 300ms |
| emotion_smirk | emotion_smirk.wav | 嘲 | — | sly tick, 150ms |
| emotion_surprise | emotion_surprise.wav | 惊 | — | quick sting, 150ms |
| rating_s/a/b/c | rating_*.wav | 评级 | — | grade chime (S bright→C dull) |
| thinking | thinking.wav | 思考 | — | muffled hum, 400ms |
| sigh | sigh.wav | 叹息 | — | breath sigh, 300ms |
| victory_electric | NEO/victory_electric.mp3 | 电系胜 | — | electric zap fanfare, 800ms |

> 合成类（WAV，建议保留程序生成或重采）：click, erase, hint, hover, achievement, notification, dialog_advance, combo_1..3/max, emotion_*, rating_*, reveal, key_unlock, chain_pop, portrait_*, thinking, sigh, thunder, book_flip, hidden_level, victory, eureka, footstep.

---

## 6. 配音（VO）映射

- 目录：`voice/<CHAR>/VO_<CHAR>_<####>[variant].mp3`（现有 12 角色 / 1241 条，数据驱动，不在此逐条列）。
- 生成提示模板（按角色情绪给）：
  *"1941 Shanghai Mandarin/Cantonese period dialogue, character <NAME> (<persona>), <emotion>, intimate close-mic, low room tone, no reverb tail, clean take, 96–128k mp3."*
- 角色人格速记：SM 沈墨(冷峻克制/短句主动)、J 莹莹(俄语思维镜像)、R 阿妍、CK 守笼人、P/PS/SS 设局人(多面)、N 旁白、U 你、W 星辰梭、RE 残局守护者、S 系统。

---

## 7. 生成提示使用指南（How to Use Prompts）

1. **工具无关**：提示可直接喂 AI 音乐/SFX 生成器，或作为真人音效师 brief。
2. **统一后缀**（每条约加）：`instrumental only / no vocal`(BGM)、`seamless loop`(循环曲)、`192k mp3`(BGM/环境)、`PCM wav <2s`(短SFX)、`period-authentic, avoid modern synth`。
3. **批次**：先生成 BGM 16 条 → 再核心玩法/UI SFX → 最后补多样本（脚步/打字机/门各 3 变体）。
4. **落盘即播**：生成后即按 §3 目录落盘，文件名严格匹配 §4/§5，无需改 `audio-service.js`（SFX_MAP 已覆盖）。

---

## 8. Phase 1 待补 / 缺口（Gap Notes）

- ⚠️ 多样本变体：脚步(5事件)、打字机、门(4事件) 当前多为单样本 → 需各补 2–3 变体消除重复听感（**不做代码改动**，仅补资源）。
- ⚠️ 三幕引导音 `act_open / act_breakthrough / avalanche_start` 在 SFX_MAP 注释中提及但**无对应文件** → 标记待生产（合成 WAV 或生成）。
- ⚠️ `NEO/` 为高质量变体集，建议优先用于替换根目录同名低质样本（如 `door_open`、`fill_correct`）。
- 不在本阶段：空间化/遮蔽/混响总线、连续 Tension 分层、复音预算（属设计文档 Phase 2–3，架构冻结故不改）。

---

*Spec v1.0 — Phase 1 (production-only). audio-service.js frozen. Playable-first.*
