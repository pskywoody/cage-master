# 笼中密信：上海1941 · 立绘 / CG 资源清单与编号规范

> 更新日期：2026-08-13
> 适用范围：`assets/images/` 下全部角色立绘、CG、背景资源
> 统一美术规范：**国风厚涂**（Chinese-style thick painting）· 立绘站位**脸朝左**

---

## 1. 编号规范

### 1.1 立绘（Portrait）

```
{角色ID}_{情绪}_{版本}.png
```

- 角色 ID 采用英文小写（见下表），情绪为英文小写，版本可选（`v2` 等）。
- 存放目录：`assets/images/portraits/`
- 引擎加载固定追加 `.png` 后缀，**必须为 PNG**。
- 构图：胸像（bust-up）· 脸朝左（three-quarter 左向）。
- 背景：**透明底（RGBA）**，已用 rembg 去除背景（2026-08-13）。

### 1.2 CG（全屏插图）

```
CG-{章节}-{序号}_{场景英文名}.jpg
```

- 存放目录：`assets/images/chapter{章节}/cg/`
- 引擎/画廊以完整 `.jpg` 路径引用，**必须为 JPEG**。
- 画幅：16:9 横版全屏。

### 1.3 背景（Background）

```
BG-{章节}-{序号}_{场景英文名}.jpg
```

- 存放目录：`assets/images/chapter{章节}/backgrounds/`

---

## 2. 角色立绘清单

### 2.1 主角

| 角色ID | 角色 | 差分 | 文件 | 状态 |
|:---|:---|:---|:---|:---|
| `shenmo` | 沈墨 | 默认/微笑/严肃 | `ch1_shenmo_default/smile/serious` | ✅ 已有 |
| `vera` | 薇拉（白俄） | 默认/微笑/严肃 | `ch1_vera_default/smile/serious` | ✅ 已有（人种正确） |

### 2.2 新角色（2026-08-13 新增专属立绘）

| 角色ID | 角色 | 差分 | 文件 | 状态 |
|:---|:---|:---|:---|:---|
| `suwan` | 苏晚 | 默认/严肃/微笑 | `suwan_default/serious/smile` | ✅ 新增 |
| `zhou_taotai` | 周太太 | 默认/严肃/微笑 | `zhou_taotai_default/serious/smile` | ✅ 新增 |
| `pan_hanian` | 潘汉年 | 默认/严肃/微笑 | `pan_hanian_default/serious/smile` | ✅ 新增 |
| `ito` | 伊藤 | 默认/严肃 | `ito_default/serious` | ✅ 新增 |
| `yamada` | 山田 | 默认/严肃/愤怒 | `yamada_default/serious/angry` | ✅ 新增 |
| `father` | 沈世安（父） | 默认/严肃/微笑 | `father_default/serious/smile` | ✅ 新增 |

> 说明：以上 6 位此前全部复用沈墨立绘占位，现已替换为专属立绘，并已在 `story/story-engine.js` 的 `PORTRAIT_MAP` 中完成映射。

### 2.3 待补角色

| 角色ID | 角色 | 说明 |
|:---|:---|:---|
| `teacher` | 老师（留声/回忆） | 仍复用沈墨占位，待专属美术 |

---

## 3. CG 清单（第一章）

| 文件 | 场景 | 状态 |
|:---|:---|:---|
| `CG-CH1-01_letter_closeup.jpg` | 信特写 | ✅ 已有 |
| `CG-CH1-02_shenmo_reading_letter.jpg` | 沈墨读信 | ✅ 已有 |
| `CG-CH1-03_bookstore_first_meeting.jpg` | 书店初次见面（薇拉·白俄） | ✅ **2026-08-13 重做** |
| `CG-CH1-04_alley_iron_gate_unlock.jpg` | 弄堂铁门解锁 | ✅ 已有 |
| `CG-CH1-05_bookstore_passed.jpg` | 书店经过（薇拉·白俄） | ✅ **2026-08-13 重做** |
| `CG-CH1-06_xiafei_road_walking.jpg` | 霞飞路行走 | ✅ 已有 |
| `CG-CH1-07_handwritten_puzzle.jpg` | 手写谜题 | ✅ 已有 |

> 重做说明：`CG-CH1-03` 与 `CG-CH1-05` 原文件损坏（二进制被 UTF-8 双重编码，无法解码），且薇拉形象人种错误。已按白俄人设（金发蓝眼、穿旗袍）重做，文件头已验证为有效 JPEG。

---

## 4. 引用位置

| 资源 | 引用文件 |
|:---|:---|
| 立绘映射 | `story/story-engine.js` → `PORTRAIT_MAP` |
| 画廊 CG | `ui/gallery-panel.js` |
| 关卡剧情 CG | `data/levels/level-102.json`（CG-CH1-03）、`data/levels/level-109.json`（CG-CH1-05） |
