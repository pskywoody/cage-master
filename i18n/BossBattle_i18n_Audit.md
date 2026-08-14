# BossBattle i18n Audit Report

> 角色：R8 i18n 工作流 · BossBattle 内容审核 Agent
> 资产来源（唯一权威，禁止重新翻译）：`术语对照表_中英日韩.md` + 本报告中引用的固定对照表
> 项目阶段：R6.5 Battle Presentation Layer 已完成 → 进入 R7 内容生产
> 范围约束：**只做内容资产审核，不改写文件、不做架构/核心/测试审计**

---

## 1. 总体评价

**内容是否适合国际化：基本适合，且已具备“可直接落地的固定资产”。**

最大资产已经就绪：你提供的三张固定表（结算行 / Boss 角色名 / 章节映射）已经是以 `level-id` 为主键、四语齐备、零歧义的 locale-ready 数据。它们不需要任何翻译，直接生成 `boss/battle.json` 即可。

**最大风险（按严重度）：**
1. **单一来源尚未确立。** 当前 Boss 战文本分散在：① 固定对照表（结算行，已锁定）② 中文母本脚本的「反馈/对话/结算」层（序章~终章 7 个 Boss 关，仍以内联散文存在）③ EN/JA/KO 三语脚本（pre‑Boss战，完全缺失 Boss 战内容）。若让 i18n agent 从脚本“重新翻译”，会立刻回到审核死循环。→ **结论：以固定表为母表，脚本里的 Boss 战内联文本一律视为“待提取的资产草稿”，不是翻译源。**
2. **中文母本里的 `Boss 击败：xxx` 内联行已删除**（按你的决策 1，本次已从桌面母本与 i18n 副本各移除 7 行，备份见 `*.bak_before_strip`）。该内容现在只活在固定表里，避免脚本与资产双源 diverge。
3. **日/韩/英脚本缺 Boss 战全量内容**，但这是“待生成”而非“待审核”——由 locale 资产正向灌入，不反向补译。

---

## 2. 章节问题

| 章节 / Level | 问题 | 严重度 | 建议 |
|---|---|---|---|
| 序章 level‑109 | 结算行已锁定为固定资产；脚本内联 `Boss 击败` 行已删除，但其后叙事行（“——他给了你一个入局的位置…”）仍在脚本 | 低 | 该行属“胜利反馈”资产，建议抽为 `boss.short_stroke.victory.01`，不要留在脚本散文 |
| 第二章 level‑209 | 同上；父·沈世安为剧情向 Boss，对话层含大量回忆叙事 | 中 | 回忆叙事拆为 `boss.shenshian.lore.*` 与 `boss.shenshian.crisis.*` 两类，lore 不进战斗反馈 |
| 第三章 level‑309 | 伊藤第一次交锋；脚本反馈层偏“观察/存在性否定”语气 | 低 | 与伊藤篇语音规范一致（软声、制度分析），日译勿加主动 |
| 第四章 level‑409 | 山田特高课；脚本含“威胁提升/污染预警”系统提示 | 中 | 系统提示归 `System Feedback` 类，须用统一术语，勿文学化 |
| 第五章 level‑509 | 日军无线电测向队；含“测向/方位”机制名词 | 中 | 机制名按术语表翻译；方位词日译用「方位」而非直译 |
| 第六章 level‑609 | 山田课长（最终交锋）；压迫感对白密度高 | 中 | 对白归 `Battle Dialogue`，按山田人设做日译压迫感改写 |
| 终章 level‑809 | 中文有独立「终章」；JA/KO/EN 将终幕并入第七章。固定表结算行已对齐 level‑809 | 中 | 章节映射表**缺 한국어 列**（见 §5 发现）；locale key 用 `level-809` 锚定，不受章节标签差异影响 |
| 章节映射表（你提供版） | 只有 中文/English/日本語 三列，**无 한국어** | 高 | 补 KO 列：序章=서장 / 第二章=제2장·방들 / 第三章=제3장·문들 / 第四章=제4장·실 / 第五章=제5장·흐름 / 第六章=제6장·그물 / 第七章=제7장·종막·납호 / 终章=제7장·종막（全書·完） |

---

## 3. Key 设计建议

目标结构（locale/boss/battle.json，四语各一份）：

```
boss.{boss_id}.{phase}.{idx}
```

**phase 绑定（Director 按战况选择）：**
`opening` → `development` → `crisis` → `climax` → `victory` / `defeat`

**boss_id 建议映射（按固定表）：**

| level | boss_id | 示例 key |
|---|---|---|
| 109 | short_stroke | `boss.short_stroke.opening.01` / `boss.short_stroke.victory.01` |
| 209 | shenshian（父·沈世安） | `boss.shenshian.crisis.01` / `boss.shenshian.lore.01` |
| 309 | ito_1（伊藤·第一次） | `boss.ito_1.crisis.01` |
| 409 | yamada_tokko（山田特高课） | `boss.yamada_tokko.threat.01` |
| 509 | df_unit（测向队） | `boss.df_unit.development.01` |
| 609 | yamada_chief（山田课长） | `boss.yamada_chief.climax.01` |
| 809 | ito_final（伊藤·最终） | `boss.ito_final.climax.01` / `boss.ito_final.victory.01` |

**文本类型分类标注（每条资产必须带 type 字段）：**
- `A. Battle Dialogue`：Boss 台词 / 嘲讽 / 压迫感对白
- `B. System Feedback`：策略改变 / 威胁提升 / 污染预警
- `C. Tutorial / Coaching`：玩家行为分析 / 建议
- `D. Lore / Atmosphere`：世界观 / 回忆叙事

> 例（序章 victory 反馈，抽自母本 296 行后叙事）：
> ```json
> {
>   "boss.short_stroke.victory.01": {
>     "type": "A",
>     "zh-CN": "他给了你一个入局的位置。你拒了。你划掉了他的标记，留下了自己的。",
>     "ja-JP": "彼は君に入局の位置を与えた。君は拒み、その印を消し、自分の印を残した。",
>     "en-US": "He offered you a place in the game. You refused—crossed out his mark, left your own."
>   }
> }
> ```

---

## 4. 翻译注意事项

**必须保持英文/不翻译的术语（TPL 专有 + 架构名）：**
- `TPL` / `Director` / `StrategySelector` / `IntentObserver` / `DramaEventManager`
- `Ghost` / `Hub` / `Heat` / `Threat`
- 状态/策略名若已在术语表锁定，引用表而非重译

**需要文化改写的句子（日译重点）：**
- Boss 台词勿机械直译中文。例：中文「左边很安全，对吗？」→ 勿作「左側は安全ですね？」→ 改「左は安泰だとでも思った？」（按 Boss 人设调压迫感 / 冷笑 / 官僚味）。
- 伊藤（官僚/档案/条件语气）：日译用被动·条件形，避免第一人称主动（与伊藤篇语音规范一致）。
- 山田（压迫感）：日译短、硬、居高临下。
- 沈墨（冷峻/判断句）：日译主动、短句、主语「私たち/僕ら」。

**需要重新设计的 Boss 台词：**
- 脚本散文中过长、带环境描写的叙述句（如“铁门背面，锈迹深处，刻着一道短横…”）→ 不属于 battle 资产，拆为 `Lore` 或留在章节剧情，勿塞进 `boss.xxx.opening`。
- 任何“第N关·X 完成”式进度播报 → 归 `System Feedback`，与战斗对白分离。

---

## 5. 审核发现（CONFLICT / GAP 标记）

```
GAP:
source: 章节映射表（用户提供）
target: 한국어 列缺失
recommended: 补 KO 列（见 §2 末行）。其余三语已齐备，不影响 level-id 锚定。
```

```
NOTE:
source: 中文母本 反馈/对话/结算层（7 个 Boss 关）
target: 仍为内联散文
recommended: 抽为 locale key（§3）。其中叙事/lore 类可保留章节剧情，仅战斗反馈/对白/系统提示进 battle.json。
```

```
LOCKED:
隐曜 双义：标准技巧 = Hidden Radiance / 核心机制 = Hidden Luminary（已写入术语对照表 §4，按你的决策 2 “案对照表”）。
EN 文件现机制义仍作 Hidden Radiance，落地时改 Hidden Luminary。
```

---

## 6. 不要做（禁止项）

- ❌ 架构审计 / core 检查 / 测试体系检查
- ❌ 大规模重写剧情 / 修改战斗规则 / 修改系统名称
- ❌ 为日语自然而改变机制含义
- ❌ 让 i18n agent 从脚本重新翻译（固定表是唯一母表）
- ❌ 把 lore/环境描写当 battle 台词塞进 locale key

---

## 最终目标（管线连接）

```
Boss 内容资产（固定表 + 脚本抽取）
        ↓
locale/boss/battle.json（zh-CN / ja-JP / en-US / ko-KR）
        ↓
多语言 BossBattle
        ↓
Director / UI / Dialogue / DramaEventManager 消费
```

R7 内容生产只需按 §3 的 key 结构把 7 个 Boss 关的 反馈/对话/结算 抽成资产；R8 直接吃固定表 + 资产，不再“分析项目”。
