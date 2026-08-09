# Phase 1 改动清单：Cage Interpretation Framework

> 目标：让 Cage 从"数学限制"升级为"证据容器"，用三主角叙事身份解释同一数学事实。
> 铁律：**零 solver 改动、零 evidence 结构改动、零 TECHNIQUES 新增**。全部落在展示/解释层。
> 日期：2026-08-09

---

## 0. 现状核实（已确认）

| 组件 | 现状 | 位置 |
| --- | --- | --- |
| 模板键控 | `CHARACTER_TEMPLATES[charId].hint[technique]`，charId = ayan/cagekeeper/ying | `expert/expression/character-templates.js` |
| renderHint 签名 | `renderHint(charId, technique, evidence, ctx)`，ctx 仅 `{ num }` | 同上 |
| ctx 来源 | `_tryTemplateDialogue` 里 `ctx = { num: deduction.num }` | `expert/hint-system.js:1047` |
| HintSystem 构造 | `(board, solution, options)`，options 仅有 teachingSystem/preferredTechnique | `expert/hint-system.js:328` |
| 说话人选择 | `_selectCharacter()` 纯随机加权，无 arc 感知 | `expert/hint-system.js:1283` |
| 实例化点 | `new HintSystem(board, solution, { preferredTechnique: poolTech })`，`payload.levelData` 在作用域 | `game.html:5634` |
| **arc 轴** | **完全缺失** ← 本次唯一要新增的结构 | — |

---

## 1. 新增 ctx 结构（确认）

**改前**：`ctx = { num }`

**改后**：
```js
ctx = {
  num: deduction.num,   // 原有
  arc: this.arc,        // 新增：'shenmo' | 'vera' | 'ito' | null
}
```

**模板键控方式（确认）**：双轴，arc 优先，char 兜底。
`renderHint` 解析顺序变为：
1. 若 `ctx.arc` 存在 **且** `ARC_TEMPLATES[arc][technique]` 存在 → 用 arc 词库（叙事身份优先）
2. 否则回退 `CHARACTER_TEMPLATES[charId].hint[technique]`（说话人语气兜底）

理由：词库挂 **arc 轴**（谁的价值观），说话人轴（谁开口）只叠加语气。守笼人在伊藤篇开口应说"档案"话，而不是守笼人自己的措辞。

---

## 2. 逐项改动

### [C1] HintSystem 接收 arc 上下文

- 文件：`expert/hint-system.js`
- 构造器新增 `this.arc = options.arc || null;`
- `_tryTemplateDialogue` 的 ctx 改为 `ctx = { num: deduction.num, arc: this.arc };`
- 影响面：仅两处，无骨架改动。

### [C2] arc 词库层（核心）

- 文件：`expert/expression/character-templates.js`
- 新增 `ARC_TEMPLATES`，按 arc × 技巧键控，占位符沿用 `{num}/{sum}/{placed}`：

| arc | 笼统一词 | rule45 | cageUnique | sealedCage（九格笼触发） |
| --- | --- | --- | --- | --- |
| 沈墨 shenmo | 封锁区 Locked Zone | 星衡法则 | 笼和约束 | 整个区域已经被封锁 |
| 薇拉 vera | 残忆笼 Residual Memory | 双曜平衡 | 记忆约束 | 这段记忆没有留下空白 |
| 伊藤 ito | Archive Cell（不译"笼"） | 记录守恒 | 档案约束 | 档案完整性确认 |

- 扩展 `renderHint`：按上述解析顺序取模板。
- 说明：`rule45`/`cageUnique` 的现有证据（`type:'rule45'`、`type:'cageUnique', cageSum, filledNums`）已能填充占位符，纯模板新增，证据不变。

### [C3] arc 注入（数据源）

- 文件：`game.html:5634`
- `new HintSystem(board, solution, { preferredTechnique: poolTech, arc: resolveArc(payload.levelData) });`
- 新增小函数 `resolveArc(levelData)`：优先读 `levelData.arc`；否则按 chapter/levelId 映射。
- **待确认项**：levelId → arc 的精确映射表（107/201/410/801… 属于哪篇）。建议显式在关卡 JSON 加 `arc` 字段，避免猜映射；或先给主要关卡补 `arc` 元数据。

### [C4] Cage Scope Recognition（九格笼特殊解释）

- 概念：`cage.cells.length === 9` 且覆盖完整 3×3 宫 → 触发 `sealedCage` 特殊文案。
- 实现：**展示层**从现有 `cageCells` 检测（9 格恰好等于某宫 9 格），不新增 solver 字段。
- 触发位置：渲染层/hint 层按 arc 取 `ARC_TEMPLATES[arc].sealedCage`。
- 前置：先让 9×9 关卡能出现九格笼（生成器 `--max-cage 9` 或手动补一关），或用 4×4 现有满宫笼先行演示。

### [C5] Cage 动画突出"关系"（可选，可并入 Phase 1 末）

- 渲染层：对 `rule45` 高亮两个跨宫区域、对 `cageUnique` 高亮笼内关系，读现有 `evidence.cageCells` / rule45 公式即可。
- 零 solver 改动。若时间紧可推 Phase 2。

---

## 3. 明确不做（确认）

- ❌ CageDifferential / TwinCage / BrokenCage 作为 solver 技巧
- ❌ 修改 evidence 核心结构（不加 `type:'cageDifferential'` 等）
- ❌ TECHNIQUES 新增
- ❌ 大改 HintSystem 骨架 / `_selectCharacter`

---

## 4. 验收方式

- 在 board 加载后、hint 触发时，检查 `renderHint` 返回文案是否按当前 arc 的词库生成（如伊藤篇 rule45 出现"记录守恒"而非"星衡法则"）。
- 无 arc 时行为与现状完全一致（回退 char 模板），不回归。