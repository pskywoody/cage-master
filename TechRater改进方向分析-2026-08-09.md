# TechRater 改进方向分析 — CageMaster4
> 分析时间：2026-08-09 ｜ 对象：`core/tech-rater.js`(3167行) + `reports/tech-verify-report.json`(2026-08-03)
> 方法：通读求解主循环、10 项技巧实现、评级与三阶段剧本、公共 API；对照 tech-verify 实测数据。
> 结论：**TechRater 架构扎实（bitmask 候选、最低可用技巧策略、证据链归一、影响力评分、三阶段剧本齐全），但存在「正确性硬伤 + 评级/教学错位 + 招牌技巧缺位」三类可量化问题。其中多项已被 tech-verify 数据证实，不是猜测。**

---

## 一、已验证的优势（先说好的，避免误改）

- **bitmask 候选表示**：9 位二进制 + Brian Kernighan popcount（L91-99），空格/排除操作都是位运算，快且不易错。
- **"最低可用技巧"策略**：`_findAllByTechnique` 按 `TECH_PRIORITY_9/6/4` 顺序取最易技巧，排除一步即 break 重扫（L397-478），贴近人类解题心理。
- **证据链归一完整**：`elimination` 步骤记录 `eliminatedCells/row/col/num`（L411-427、L722-754），红叉动画与热力图不丢坐标。
- **大技巧的副作用处理正确**：`_findXWing/_findSwordfish` 用 `_cloneCandidates/_restoreCandidates` 快照恢复（L2244/2251、L2512/2518），扫描不污染盘。
- **公开 API 齐全**：`findNextStep / findAllCurrentSteps / getInfluence / applyMove / hasConflict / getCandidatesGrid`，hint 系统取数方便。

---

## 二、问题清单（按影响力排序，均附代码定位）

### 【P0-高】1. `guess` 技巧是空壳，含试数的关卡会被误判不可解
【位置】`TECHNIQUES` 定义 `guess`(L46, level 11)，但 `_findAllByTechnique` 的 switch（L760-801）**无 `guess` 分支** → 落到 `default: return []`。
【后果】`solve()` 走到死胡同时直接 `break` 返回 `solvable:false`，**没有回溯**。若某关只有"试数"一条路（部分 Killer 题确实如此），TechRater 会判定它不可解 → 关卡校验误报、hint 直接返回 null（即前次扫描发现的 Level-3 静默降级根因之一）。
【修复方向】实现受限回溯求解器（`solveWithGuess(maxDepth)`：在候选≥2 的格取最小候选分支，失败回溯，限制深度防爆炸），或至少新增 `estimateNeedsGuess()` 显式标记"本关需试数"，让校验/hint 区分"真不可解"与"需猜测"。

### 【P0-高】2. 三个"找技巧"方法有未文档化的候选副作用
【位置】`_findNakedPair`(L1477 改 `this.candidates` 无 restore，L1604 box 分支直接 `return result.nakedSingleResult`)、`_findHiddenPair`(L1655 改无 restore)、`_findNakedTriplet`(L1982 改无 restore)。
【对比】xWing/swordfish 都做了 snapshot/restore，这三者没有 → **行为不一致**。
【风险】`findNextStep`(L672) 直接调用这些方法且**不恢复候选**。若 HintSystem 复用同一 TechRater 实例（非每次新建），每次取 hint 都会把消除结果"吃"进实时盘，导致 hint 漂移/盘面与渲染不同步。需先确认 HintSystem 是否每次 `new TechRater(board)`；若是，则仅影响 solve 内的副作用（可控），若否则是真实 bug。
【修复方向】统一为纯函数：`_findAll*` 全部 snapshot→scan→restore，需要回传的消除量通过返回值/`_lastEliminationEvidence` 表达（xWing 已是范本）。

### 【P0-高】3. 评级失真：求解路径被孤星级联主导，高级技巧从未进入难度度量
【证据】`tech-verify-report.json`：9x9 关卡 `techDistribution` 几乎全是 `{ nakedSingle: 49 }`（如 L201/L202/.../L703 全部），即 **49 步填充全是孤星**；`passRate` 仅 **0.0667**（30 个目标关仅 2 个 `foundInSolvePath=true`），但 `stepDetectableRate=1`。
【根因】`getRating()`(L2693) 用 `maxLevel*100` 作基础分，而最低可用技巧策略永远先吃孤星，于是 `maxLevel` 恒为 1 → 星级偏低（"入门"），但 `teachingGoal` 却标着 困难/专家、rule45/并蒂锁。
【修复方向】改用**"必要技巧集"度量**：临时屏蔽 `nakedSingle` 捷径（或要求每步必须用到非平凡技巧），求"解出该关实际所需的最低技巧深度"，以此定难度。这才是人类感知的难度，而非"恰好有更简单的路可走"。

### 【P0-高】4. 教学技巧与求解路径脱节，hint 可能讲 A 引擎却只给 B
【证据】同上 verify：`reviewTechsFound` 里 `rule45/nakedPair/hiddenPair/nakedTriplet` 的 `found` 几乎全为 `false`（如 L208 rule45 found:false、L307 nakedPair found:false）。
【后果】关卡 intended 教"星衡法则"，但 `findNextStep` 只会吐孤星步骤 → 教学提示自相矛盾（文字说用法则，高亮却指向一个孤星格）。`targetTechId` 字段闲置。
【修复方向】hint 选取逻辑优先返回 `level.targetTechId` 对应的步骤（复用 `findAllByTechnique(targetTechId)`，已在引擎内），其次才回退"全局最简单"。教学关应保证目标技巧确实在路径中（见 #6 复跑验证）。

### 【P1-中】5. 招牌技巧「星衡法则」严重缺位（只处理单格 outie/innie）
【位置】`_findRule45`/`_rule45ForScope`(L1270-1452)：L1370 `if (outsideEmpty.length === 1)`、L1425 `if (innieEmpty.length === 1)` —— **仅当外突/内突恰好 1 个空格才触发**。
【问题】真实 Killer 数独的 45 法则威力在于"多格外突推和小值""两行两宫 90 法则"等；本作只覆盖退化情形，导致 verify 中 rule45 `found:false` 遍布。这是核心卖点技巧却几乎打不出。
【修复方向】扩展 `_findRule45` 支持：多格外突求和约束（outside 全空格时推出"这些格的数字集合"用于排除）、跨 scope 组合（两行/两宫）。这是提升"像玩真正 Killer Sudoku"体验的关键。

### 【P1-中】6. 缺唯一解校验，多解关卡检不出
【位置】`solve()`(L391) 只求首解，无 `countSolutions`。
【问题】良构 Killer 题必须唯一解；若作者手滑做出多解关，当前引擎照常"解出"，校验/稳定性扫描（bugscan）也只查字段不查解唯一性 → 静默放过设计 bug。
【修复方向】新增 `countSolutions(limit=2)`：递归+回溯统计解数，达到 2 即停；关卡校验要求 `===1`。可接入 `validate-levels.js`。

### 【P1-中】7. 笼子和值枚举暴力无剪枝，大笼可能组合爆炸
【位置】`_combosHelper`(L354-367) / `_getPossibleNumbers`(L348) / `_findAllCombos`(L1042)：纯 `O(C(n,count))` 枚举，未用每格候选 bitmask 剪枝。
【问题】6+ 格大笼 × 9x9（如 L602"大笼迷踪"、L604/605 设局人谜题）枚举量陡增；虽 `solve` 有 maxSteps=500 兜底，但单步卡顿/超时风险在浏览器 hint 实时调用时放大。
【修复方向】枚举时用每空格候选做交集剪枝（某数不在任一空格候选即跳过），或对笼子组合结果做备忘录。

### 【P2-低】8. 影响力评分权重是拍脑袋且与教学无关
【位置】`_calcInfluence`(L545-611)：`cage*0.35 + empty*0.25 + cand*0.15 + cageCross*0.15 + rule45*0.10`。
【问题】权重无依据；且它只选"全局最推动盘面"的格，不关心"当前这关该练哪个技巧"（与 #4 同源）。
【修复方向】若实现 #4 的 targetTech 优先，本函数退为次级排序，权重之争自然弱化；否则建议用线上埋点（玩家实际填哪格）反推权重。

### 【P2-低】9. 三阶段剧本破局点取"最深 depth 步"，叙事易头重脚轻
【位置】`getTriPhaseScript`(L2813-2825)：`breakPointIndex` = `maxDepth` 步。
【问题】最低可用技巧下，最深技巧可能出现在第 40 步，于是"开局"塞进 30+ 个 trivial 步，叙事失衡。
【修复方向】改为取**首个 depth>阈值**的步，或"之后裸星级联最多"的步作为破局点。

### 【P2-低】10. 高亮轴线几何 fallback 是错误猜测
【位置】`_calcSkillHighlightAxes`(L2951-2955)：xwing fallback `axes.rows=[row,(row+3)%size]`、`cols=[col,(col+4)%size]`。
【问题】这是硬编码猜测，对非常规尺寸/非 3×3 宫完全错误。好消息是 xWing/swordfish 的 evidence 已带 `rows/cols`（L2293-2300、L2560-2567），`evidence.rows && evidence.cols` 提前 return（L2921）会让正常路径避开 fallback。
【修复方向】删除 fallback，缺 evidence 时退化为 `{rows:[row], cols:[col]}` 而非错误几何。

### 【P2-低】11. 死局只返回 solvable:false，无"为何卡住"诊断
【位置】`solve()`(L488-493) 失败仅返 `remainingCells`。
【问题】作者修关时不知道卡在"某格无候选"还是"某笼和不可达"。
【修复方向】失败时记录首个 `_countEmptyCells>0 但 findNextStep()===null` 的卡点快照（矛盾格/笼），随 getRating 一并返回 `stuckReason`。

### 【P2-低】12. tech-verify 报告陈旧且仅覆盖 cycle1
【位置】`reports/tech-verify-report.json` 时间戳 2026-08-03，仅 50 关（全是沈墨 cycle1）。
【问题】薇拉/伊藤新路线、缺失关卡（409/509/709/803/809）完全未验证；6.7% 的 `foundInSolvePath` 率是否因"关卡设计本身未强制目标技巧"还是"引擎不会用"无从区分。
【修复方向】复跑并纳入校验流程；目标把 #3/#4 对齐后的 `foundInSolvePath` 率提到合理区间，反向修订关卡设计或引擎。

---

## 三、落地优先级建议

| 优先级 | 项 | 一句话价值 |
|---|---|---|
| **P0** | #1 guess/回溯 | 修"误判不可解→hint 静默降级"硬伤 |
| **P0** | #2 find 副作用 | 防 hint 污染实时盘（先确认 HintSystem 用法） |
| **P0** | #3 评级用"必要技巧集" | 让难度星级反映真实人类难度 |
| **P0** | #4 hint 按 targetTechId 定向 | 教学提示不再"讲 A 给 B" |
| **P1** | #5 星衡法则多格 outie/innie | 招牌技巧真正可用 |
| **P1** | #6 唯一解校验 | 拦住多解设计 bug |
| **P1** | #7 笼子枚举剪枝 | 大笼关不卡顿 |
| **P2** | #8~#12 | 体验打磨与工程化 |

**最高杠杆的两步**：先做 #3（必要技巧集度量）和 #4（hint 按 targetTechId 定向）——它们直接解决 verify 报告里 `passRate 6.7%` 与"教学/求解脱节"的核心矛盾，且改动局限在评级与 hint 选取，不碰技巧实现本体，风险低、收益显。

## 四、待确认后再动手的点
- **#2 是否真 bug**：取决于 HintSystem 是否复用 TechRater 实例。需读 `expert/hint-system.js` 的 `getHint()` 确认实例化方式。
- **#3/#4 的取舍**：改评级逻辑会影响全部 51+ 关的星级显示与关卡池匹配；建议先在独立脚本跑"必要技巧集"度量，对比现有星级，确认方向后再合入。
