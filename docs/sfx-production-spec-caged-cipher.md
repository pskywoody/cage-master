# SFX 生产规格 · 新剧本《笼中密信》(Caged Cipher)

> 配套文档：`docs/audio-reassessment-caged-cipher.md`（§三 SFX 重估，spec 级）
> 范围：把 §三 的 SFX 缺口**落实为可生产的生成规格 + 冻结期登记补丁**。**不改动 `audio/audio-service.js`**（架构冻结，仅记录）。
> 约束：当前**无本地 SFX 合成模型**（IndexTTS 2.5 为 TTS 专用）。本文件产出"即拷即用生成提示 + 引擎登记补丁"，实际音频资源待接入 SFX 管线后生成（见 §5 P0）。
> 中间件约定（GameAudioEngineer）：diegetic 音效走世界空间 3D；短 SFX ≤2s、PCM/wav、解压驻留；长环境流式；voice limit + steal 模式防糊；occlusion 用参数驱动低通。

---

## 〇、现状核对（doc §三 vs 磁盘真实态）

`audio-service.js` 当前 `SFX_DIR = 'assets/audio/sfx/'`，`NEO/` 条目指向 `assets/audio/sfx/NEO/*.mp3`（**已落地、已接线**）。复核后发现两处与 doc §三 不符，先校正：

| doc §三 声称 | 磁盘真实态 | 处置 |
|---|---|---|
| §3.1 `audio_next/sfx/` 已覆盖 `telegraph_key_*` / `radio_static` / `door_*` / `footstep_*` / `typewriter_*` | `assets/audio_next/sfx/` **确有**这些多样本文件 | ✓ 认可，但**未接线**（见 §3.2 补丁） |
| §3.1 称 `audio_next/sfx/` 已覆盖 `paper_unfold/tear` `thunder` `key_unlock` | 这三个**不在** `audio_next/sfx/`；在 `assets/audio/sfx/`（paper_tear.mp3 / thunder.wav / key_unlock.wav） | 校正：§3.1 措辞应为"主 sfx 目录已覆盖"；无需新建 |
| `audio_next/sfx/` 含 `coin_drop` / `distant_siren` / `file_cabinet_*` / `pen_ink` | 真实存在，doc §三 未列 | 补入 §3.2 接线清单（新事件） |
| §3.2 八类新剧本专属 SFX | **磁盘均缺失** | 本文件 §2 给出完整生成规格 = 唯一真缺口 |

> 速查表（doc §五 第 7 行）写"新增 7 类"，但 §3.2 正文列 8 类（含 `tile_place`）。本规格以 §3.2 正文 **8 类** 为准，并修正速查表。

---

## 一、已就绪资产清单（接线即用，待 §3.2 登记）

### 1.1 主目录可复用（无需新建，仅别名/复用）
`click` `hover` `key_unlock` `thunder` `paper_tear` `paper_unfold` `fill_correct` `fill_wrong` `success` `eureka` `electronic_pulse`（≈`telegraph_power` 近似）`seal_*` `door_*`(单样本) `footstep_*`(单样本) `typewriter`(单样本) `NEO/ambient_hall` `NEO/paper_unfold` `NEO/pen_write` `NEO/seal_breaking` `NEO/note_toggle_on/off` `NEO/victory_electric`。

### 1.2 已生成但未接线（staging → 待移到 `assets/audio/sfx/next/` 并登记）
多样本容器（`assets/audio_next/sfx/`）：
- `telegraph_key_01~03.wav`、`radio_static.wav`
- `door_open_01~03` `door_open_light_01~03` `door_stone_open_01~03` `door_final_open_01~03`
- `footstep_hall_01~03` `footstep_run_01~03` `footstep_stone_01~03` `footstep_wood_01~03`
- `typewriter_01~03.wav`
- 新事件：`coin_drop.wav` `distant_siren.wav` `file_cabinet_01~03.wav` `pen_ink.wav`

---

## 二、缺失的 8 类新剧本专属 SFX（核心交付）

> 每项含：触发场景 / 命名 / 规格参数 / 多样本策略 / 中间件约定 / AI-SFX 生成提示（中·英）。
> 文件落地路径统一为 `assets/audio/sfx/next/<name>.wav`（与 §1.2 同目录，统一接线）。

### 2.1 `wire_thread` — 铜线穿通风管
- **场景**：408 / 601 发报机天线——铜线穿过通风井接晾衣绳。
- **构成**：1 个过程音 `wire_thread_loop`（铜线被缓缓拉过管壁的连续摩擦，~2.5s，可循环）+ 3 个起始刮擦 `wire_thread_start_01~03`（≤0.6s）。
- **参数**：高频为主 2k–8kHz 带金属谐振峰；宽带摩擦噪声 + 偶发 6–9kHz"叮"（线头刮到管壁接缝）；近距干声、无尾混响（管内空腔极轻）。
- **中间件**：diegetic，世界空间 3D（位置=发报机/通风井）；voice limit 1；steal=oldest；occlusion 低通 ~1.2kHz（隔墙衰减）。
- **生成提示（EN）**：`Thin bare copper wire being pulled slowly through a long metal ventilation duct. Continuous dry metallic scraping and hissing friction, occasional bright high ping as it catches a seam. Close mic, hard dry interior, no reverb tail, 2.5 seconds.`
- **生成提示（ZH）**：`细裸铜线被缓缓拉过金属通风管。连续的干燥金属刮擦与嘶嘶摩擦，偶尔划到接缝发出清亮高音叮声。近距干录，硬质管内，无混响尾，2.5 秒。`

### 2.2 `iron_box` — 铁皮箱开合
- **场景**：409「这道是我补的」铁盒 / B3 铁皮箱。
- **构成**：`iron_box_open_01~03`（铰链吱呀+盖落定，≤1.2s）+ `iron_box_close_01~03`（反向，≤1.0s）。
- **参数**：铰链吱呀 800Hz–2kHz 带谐振；箱体闷响 150–400Hz；旧铁皮轻微共振。开/合两个状态分明。
- **中间件**：diegetic 3D（位置=铁盒）；voice limit 1；steal=oldest。
- **生成提示（EN）**：`Old riveted sheet-iron strongbox. Hinges creak with a dry metallic whine, lid drops and lands with a dull resonant thunk. Aged, slightly rusty, indoor, 1.2 seconds.`
- **生成提示（ZH）**：`旧铆接铁皮保险箱。铰链干涩金属吱呀，箱盖落下伴沉闷共鸣闷响。陈旧微锈，室内，1.2 秒。`

### 2.3 `stone_carve` — 石壁刻痕
- **场景**：209 石室留痕 / 伊藤垂直刻痕 / 第三行第四列锚点。
- **构成**：`stone_carve_01~03`（每样本 3–5 下连击，≤1.5s）+ `stone_carve_single`（单下，≤0.3s，供程序逐下触发）。
- **参数**：宽频噪声瞬态 + 2k–5kHz 脆响（凿尖崩石）；极短 attack；石粉颗粒质感。
- **中间件**：diegetic 3D（位置=石壁）；voice limit 低（同屏 1–2）；steal=oldest。
- **生成提示（EN）**：`A small steel chisel scratching a vertical mark into cold rough stone wall. Short crisp scrap with brittle high flick, three to five rapid strokes, gritty, indoor cellar, 1.5 seconds.`
- **生成提示（ZH）**：`小钢锥在阴冷粗糙石壁上凿出竖直刻痕。短促清脆刮擦带崩裂高音，三至五下连击，砂砾感，地下石室，1.5 秒。`

### 2.4 `lamp_flame` — 煤油灯 / 烛火
- **场景**：雨夜 / 石室感官描写贯穿（微光环境床）。
- **构成**：`lamp_flame_loop`（火焰摇曳燃烧底噪，~10s 可循环，低音量铺底）+ `lamp_flame_flicker`（风过火苗一抖的短噗，≤0.4s，偶发）。
- **参数**：低频燃烧噪声 100–500Hz + 偶发 2k–4kHz 噗声；暖、近距。
- **中间件**：`lamp_flame_loop` 作 ambient bed，**去 3D 用 2D 低增益铺底**（点光源不随听者移动感）；`lamp_flame_flicker` 可 diegetic 3D（灯位置）。occlusion 无关。
- **生成提示（EN）**：`Kerosene lamp flame gently flickering in a still dark room. Soft warm continuous burn hiss with occasional faint pop, intimate close mic, 10 seconds loopable, very low background ambience.`
- **生成提示（ZH）**：`煤油灯火焰在静止暗室中轻轻摇曳。柔和温暖的持续燃烧嘶声，偶发极轻噗声，亲密近录，10 秒可循环，极低背景氛围。`

### 2.5 `rain_night` — 雨夜
- **场景**：序章窗台 / 珍珠港前冷雨逼近（全局氛围床）。
- **构成**：`rain_night_loop`（中雨打窗/青砖/伞面，~18s 可循环）+ `rain_night_thunder`（远处零星雷，复用主 sfx `thunder.wav` 或新做远程闷雷 ≤2s）。
- **参数**：宽带噪声 500Hz–8kHz 带时间起伏（雨势不均）；偶发 40–80Hz 远处隆隆。
- **中间件**：**2D ambient bed（全局）**，不 3D；随场景 intensity 参数调增益（冷雨逼近时微升）。
- **生成提示（EN）**：`Steady moderate rain at night on a Shanghai lane, hitting tiled roof and a shuttered window, distant occasional thunder rumble. Calm noir urban rain, 18 seconds loopable, natural ambience.`
- **生成提示（ZH）**：`夜雨落在上海里弄，打在瓦顶与紧闭的窗扉，远处偶有闷雷。沉静的黑色电影式都市雨声，18 秒可循环，自然氛围。`

### 2.6 `telegraph_power` — 发报机电源指示
- **场景**：电源指示灯冷白亮起（微光刺破黑暗的瞬间）。
- **构成**：`telegraph_power_on`（电子管预热"嗡"起 + 继电器吸合"嗒" + 指示灯高频微鸣，≤0.8s）+ `telegraph_power_hum`（灯丝交流哼声 50/100Hz 低幅，~3s 循环，供持续通电态）。
- **参数**：50Hz 工频嗡鸣 + 2–4kHz 极轻高频哨（指示灯）；继电器 click 可复用主 sfx `click`。注：主 sfx `electronic_pulse.mp3` 为近似，新建更贴切"通电瞬间+指示灯"。
- **中间件**：diegetic 3D（位置=发报机）；voice limit 1；与 `telegraph_key` 共用声场。
- **生成提示（EN）**：`Vintage tube radio transmitter powering on: a low 50 Hz mains hum swells, a relay clicks shut, a tiny cold high whistle from the indicator lamp. Electrical, intimate, 0.8 seconds.`
- **生成提示（ZH）**：`老式电子管发报机通电：低频 50Hz 工频嗡鸣渐起，继电器吸合一响，指示灯发出极轻冰冷高频微哨。电器感，亲密，0.8 秒。`

### 2.7 `direction_finder_near` — 测向车逼近（★ climax 协同）
- **场景**：电章 climax 601–609，测向车由远及近（配合 `bgm_defuse`，doc §四.2）。
- **构成**：`direction_finder_near`（持续逼近 loop，~8s 可循环，增益/滤波随 proximity 联动）+ `direction_finder_pass`（由近及远扫过，≤2s）。
- **参数**：军用引擎隆隆 40–120Hz + 旋转测向天线周期"呜——"扫频 300Hz–1.2kHz + 车载电台脉冲（质感近似 `telegraph_key`）。
- **中间件**：**diegetic 3D 关键**——世界空间，位置=测向车；随 `AntagonistProximity` 参数联动**增益 + 低通**（越远越闷越轻）；voice limit 1（climax 唯一）；steal=**none**（高压节点不可被抢）。
- **协同**：叠在 `bgm_defuse` 上 → "边发报边躲侦测"复合高压（doc §四.2 已定）。
- **生成提示（EN）**：`Japanese radio direction-finding truck approaching through a 1941 Shanghai night. Low military engine rumble, a rotating antenna sweeping a hollow wail (300 Hz to 1.2 kHz), faint onboard telegraph pulses. Menacing, distance-variable, 8 seconds loopable.`
- **生成提示（ZH）**：`日军无线电测向车在 1941 上海夜色中逼近。低频军用引擎隆隆，旋转天线发出空洞扫频呜声（300Hz 至 1.2kHz），隐约车载电报脉冲。压迫感，距离可变，8 秒可循环。`

### 2.8 `tile_place` — 落子反馈
- **场景**：每关落子反馈（doc §3.2：原 `hidden`/`click` 复用亦可，专属给更"棋子"质感）。
- **构成**：`tile_place_01~03`（各 ≤0.25s，极短清脆"哒"，带轻微棋盘共鸣）。
- **参数**：瞬态 1k–4kHz 木质/石质脆响 + 200–500Hz 箱体共鸣；无尾。
- **中间件**：**2D UI 反馈**（落子为抽象交互，非具象物体，不走 3D）；voice limit 高（连续落子）；steal=latest（取最新，旧的可被覆盖）。
- **生成提示（EN）**：`A wooden number tile dropped onto a board, a short clean tap with a tiny resonant body thunk, no tail, crisp but not harsh, 0.25 seconds.`
- **生成提示（ZH）**：`木质数字棋子落上棋盘，短促清亮一嗒带极轻箱体共鸣，无尾，清脆不刺耳，0.25 秒。`

---

## 三、冻结期登记补丁（记录，待 Phase 2 解冻接入）

> 仅记录。接入动作（移动文件 + 改 `SFX_MAP`/`sfxToPreload`）在架构解冻后执行。
> **前置动作**：把 `assets/audio_next/sfx/*` 整体移入 `assets/audio/sfx/next/`，使其与 §2 新文件同目录、统一用 `next/` 前缀接线（沿用 `NEO/` 的相对路径机制，无需改 `SFX_DIR`）。

### 3.1 引擎小改（解冻时一并做）：多样本随机选取
当前 `play(name)` 取 `SFX_MAP[name]` 单值。建议：若值为**数组**，随机取其一。这样多样本容器一行登记即可随机。
```js
// audio-service.js play() 内，解析 file 处
const entry = SFX_MAP[name] || name;
const file = Array.isArray(entry) ? entry[Math.floor(Math.random()*entry.length)] : entry;
```

### 3.2 `SFX_MAP` 新增条目（追加到现有对象尾部）
```js
// ===== 新剧本《笼中密信》SFX（Phase 2 解冻接入）=====
// 多样本容器（来自 assets/audio/sfx/next/）
'door_open':           ['next/door_open_01.wav','next/door_open_02.wav','next/door_open_03.wav'],
'door_open_light':     ['next/door_open_light_01.wav','next/door_open_light_02.wav','next/door_open_light_03.wav'],
'door_stone_open':     ['next/door_stone_open_01.wav','next/door_stone_open_02.wav','next/door_stone_open_03.wav'],
'door_final_open':     ['next/door_final_open_01.wav','next/door_final_open_02.wav','next/door_final_open_03.wav'],
'footstep_hall':       ['next/footstep_hall_01.wav','next/footstep_hall_02.wav','next/footstep_hall_03.wav'],
'footstep_run_light':  ['next/footstep_run_01.wav','next/footstep_run_02.wav','next/footstep_run_03.wav'],
'footstep_stone':      ['next/footstep_stone_01.wav','next/footstep_stone_02.wav','next/footstep_stone_03.wav'],
'footstep_wood':       ['next/footstep_wood_01.wav','next/footstep_wood_02.wav','next/footstep_wood_03.wav'],
'typewriter':          ['next/typewriter_01.wav','next/typewriter_02.wav','next/typewriter_03.wav'],
'telegraph_key':       ['next/telegraph_key_01.wav','next/telegraph_key_02.wav','next/telegraph_key_03.wav'],
'file_cabinet':        ['next/file_cabinet_01.wav','next/file_cabinet_02.wav','next/file_cabinet_03.wav'],
'radio_static':        'next/radio_static.wav',
'coin_drop':           'next/coin_drop.wav',        // 薇拉窗台硬币信号 / 702 纸条
'distant_siren':       'next/distant_siren.wav',    // 远处警笛（搜捕氛围）
'pen_ink':             'next/pen_ink.wav',          // 笔尖落墨，替代 pen_write_fast
// 八类新剧本专属（§2）
'wire_thread':         'next/wire_thread_loop.wav',
'wire_thread_start':   ['next/wire_thread_start_01.wav','next/wire_thread_start_02.wav','next/wire_thread_start_03.wav'],
'iron_box_open':       ['next/iron_box_open_01.wav','next/iron_box_open_02.wav','next/iron_box_open_03.wav'],
'iron_box_close':      ['next/iron_box_close_01.wav','next/iron_box_close_02.wav','next/iron_box_close_03.wav'],
'stone_carve':         ['next/stone_carve_01.wav','next/stone_carve_02.wav','next/stone_carve_03.wav'],
'stone_carve_single':  'next/stone_carve_single.wav',
'lamp_flame':          'next/lamp_flame_loop.wav',
'lamp_flame_flicker':  'next/lamp_flame_flicker.wav',
'rain_night':          'next/rain_night_loop.wav',
'rain_night_thunder':  'thunder.wav',               // 复用主 sfx
'telegraph_power':     'next/telegraph_power_on.wav',
'telegraph_power_hum': 'next/telegraph_power_hum.wav',
'direction_finder_near':'next/direction_finder_near.wav',
'direction_finder_pass':'next/direction_finder_pass.wav',
'tile_place':          ['next/tile_place_01.wav','next/tile_place_02.wav','next/tile_place_03.wav'],
```

### 3.3 `sfxToPreload` 追加（在现有数组后）
```js
// 新剧本常用 + climax 关键
sfxToPreload.push(
  'tile_place', 'telegraph_key', 'radio_static', 'door_open', 'footstep_hall',
  'iron_box_open', 'stone_carve', 'lamp_flame', 'rain_night', 'telegraph_power',
  'direction_finder_near'   // 电章 climax 必预载
);
// 电章 climax（levelData.climax / levelData.defuse）额外
if (levelData && (levelData.climax || levelData.defuse)) {
  sfxToPreload.push('direction_finder_near','direction_finder_pass','telegraph_power_hum','bgm_defuse');
}
```

---

## 四、与 `bgm_defuse` / 解码乐协同（引 reassessment §四）

- `direction_finder_near` + `telegraph_key`（三秒电文）+ `telegraph_power_hum` **叠在 `bgm_defuse` 上** = 电章"边发报边躲侦测"复合高压（doc §四.2 已定，SFX 侧本文件落实）。
- `bgm_decode` 成功反馈接 `eureka`；SFX 侧无需新增，仅确保 `eureka` 已预载（现有）。
- `stone_carve` / `iron_box` / `wire_thread` 为"破译/布置"过程音，与 `bgm_decode` 时段可并存，不抢 `bgm_defuse` 高压声场。

---

## 五、生产管线与 P0 缺口

- **P0（阻塞实际音频生成）**：当前环境**无本地 SFX 合成模型**。IndexTTS 2.5 为 TTS 专用，不能生成 SFX。需接入 SFX 管线之一：
  - 本地开源：AudioLDM2 / Stable Audio Open（需 torch + 显卡，RTX 4060 8GB 可跑较小模型）；
  - 商用 API：ElevenLabs SFX / 阿里云/腾讯云音效生成（需授权链，走商用合规）；
  - 或外包录制（老上海实物：铁皮箱/煤油灯/打字机/电报键可实物采样，质感最佳）。
- **生成提示即用**：§2 每项的 EN/ZH 提示可直接喂上述任一文本→SFX 模型；输出按 `assets/audio/sfx/next/` 命名落地。
- **规格校验**：短 SFX ≤2s / wav-PCM；长环境（lamp_flame/rain_night/direction_finder_near/telegraph_power_hum）流式、可循环无缝；多样本 _01/_02/_03 必须齐备后再接线。
- **参考音缺口（同 VO）**：实物采样需真实道具；无本地样本前，AI 生成提示为唯一来源。

---

## 六、下一步（待拍板）

1. **选 SFX 管线**：本地开源模型 / 商用 API / 实物采样——决定 P0 解锁方式。
2. **生成 8 类 + 移入 `next/`**：按 §2 提示出 8 类，并把 `audio_next/sfx/*` 移入 `assets/audio/sfx/next/`。
3. **解冻后接线**：§3.1 引擎小改 + §3.2/§3.3 登记（架构冻结期仅记录）。
4. **盲听 A/B**：`tile_place`/`iron_box` 与既有 `click`/`door_*` 盲听，确认质感不冲突。
5. **联动 `bgm_defuse`**：climax 关实测 `direction_finder_near` × `bgm_defuse` 复合层。

> 本文件为 SFX 生产规格（spec 级），不生成音频资源、不改动引擎代码。与 `audio-reassessment-caged-cipher.md` §三 配套，闭合 SFX 工作流。
