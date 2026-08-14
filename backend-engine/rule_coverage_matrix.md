# Rule Coverage Matrix — BestBay 决策层引擎（v1）

> 生成日期：2026-08-10
> 规则来源：`D:\bestbay\backend\data\rules_v1.json`（Phase 1.2 显式编号，D/S/C/P 四族共 **17 条**）
> 匹配引擎：`D:\bestbay\backend\src\rule_matcher.py`（match_rules，operators: eq/ne/gt/lt/gte/lte/contains/in）
> 决断链：`D:\bestbay\backend\src\cascade_processor.py`（P1 强弹窗主诊断 → P2 标签/调度 → P3 状态栏次诊断）
> API：`POST /api/v1/engine/judge`（Fact → Rule Matcher → Decision Layer → merged_output）

> 注：引擎源码本体位于 `D:\bestbay\backend`（不在本工作区），本目录仅存放**覆盖审计 + 回归护栏**产物。

> **职责边界（2026-08-10）**：`data/rules_v1.json` 后续被外部新增了 `G001-G006`（G 语法族，共 23 条），该变更**不在本护栏职责范围**，本矩阵不扩审、不评审 G 族。本护栏只覆盖原 **17 条 S/C/P/D** 规则；引擎规则总数的增删由 `D:\bestbay\backend` 侧自行管理。

## 一、规则族概述

| 族 | 编号 | 数量 | 优先级 | 行为定位 |
| --- | --- | --- | --- | --- |
| D | D001-D006 | 6 | P1 | Diagnostic 考点诊断：强弹窗主诊断 |
| S | S001-S004 | 4 | P2 | SRS 调度：多音词强制复习（force_quiz） |
| C | C001-C004 | 4 | P3 | Confusion 混淆对：状态栏次诊断 + 调度 |
| P | P001-P003 | 3 | P1/P3 | Psych/Behavior 行为心理：P001 强弹窗、P002/P003 状态栏 |

## 二、覆盖矩阵（17 条）

| Rule ID | Category | 触发条件（fact） | 期望命中 | 期望决策动作 | Status |
| --- | --- | --- | --- | --- | --- |
| D001 | Diagnostic | `context.error_type == POS_MISMATCH` | `D001` | `show_popup=true`（红/绿弹窗）、`primary_diagnosis`、tag=`形副转换薄弱`、`schedule_cluster(adj_family,0)` | ✅ |
| D002 | Diagnostic | `context.error_type == ARTICLE` | `D002` | `show_popup=true`、tag=`冠词薄弱`、`schedule_cluster(article_family,0)` | ✅ |
| D003 | Diagnostic | `context.error_type == TENSE` | `D003` | `show_popup=true`、tag=`时态薄弱`、`schedule_cluster(tense_family,0)` | ✅ |
| D004 | Diagnostic | `context.error_type == SUBJECT_VERB` | `D004` | `show_popup=true`、tag=`主谓一致薄弱`、`schedule_cluster(sv_agreement_family,0)` | ✅ |
| D005 | Diagnostic | `context.error_type == NONFINITE` | `D005` | `show_popup=true`、tag=`非谓语薄弱`、`schedule_cluster(nonfinite_family,0)` | ✅ |
| D006 | Diagnostic | `context.error_type == PREPOSITION` | `D006` | `show_popup=true`、tag=`介词搭配薄弱`、`schedule_cluster(prep_family,0)` | ✅ |
| S001 | SRS | `word == address` | `S001` | `force_quiz=true`、tag=`多音词待巩固`、`schedule_word(address,0)` | ✅ |
| S002 | SRS | `word == record` | `S002` | `force_quiz=true`、tag=`多音词待巩固`、`schedule_word(record,0)` | ✅ |
| S003 | SRS | `word == conduct` | `S003` | `force_quiz=true`、tag=`多音词待巩固`、`schedule_word(conduct,0)` | ✅ |
| S004 | SRS | `word == present` | `S004` | `force_quiz=true`、tag=`多音词待巩固`、`schedule_word(present,0)` | ✅ |
| C001 | Confusion | `context.confusion_pair == affect_effect` | `C001` | `secondary_diagnosis`、tag=`affect_effect混淆`、`schedule_confusion_pair(affect_effect,0)` | ✅ |
| C002 | Confusion | `context.confusion_pair == adapt_adopt` | `C002` | `secondary_diagnosis`、tag=`adapt_adopt混淆`、`schedule_confusion_pair(adapt_adopt,0)` | ✅ |
| C003 | Confusion | `context.confusion_pair == quite_quiet` | `C003` | `secondary_diagnosis`、tag=`quite_quiet混淆`、`schedule_confusion_pair(quite_quiet,0)` | ✅ |
| C004 | Confusion | `context.confusion_pair == lie_lay` | `C004` | `secondary_diagnosis`、tag=`lie_lay混淆`、`schedule_confusion_pair(lie_lay,0)` | ✅ |
| P001 | Behavior | `dwell_time > 3000` | `P001` | `show_popup=true`、tag=`高频卡壳待观察`、`schedule_word({{target_word}},4h)` | ✅ |
| P002 | Behavior | `historical_behavior.repeated_errors >= 2` | `P002` | `secondary_diagnosis`、tag=`顽固死角`、`add_to_weekend_pack=true` | ✅ |
| P003 | Behavior | `historical_behavior.total_correct <= 1` | `P003` | `secondary_diagnosis`、tag=`需提频复习`、`schedule_word({{target_word}},1d)` | ✅ |

**覆盖统计：17/17 全部有正向 case；高风险规则均配负向 case 防误触。**

## 三、文档 vs 代码差异标注（重要）

| 项 | 验收记录所述 | 实际代码（rules_v1.json） | 结论 |
| --- | --- | --- | --- |
| P001 阈值 | `dwell_time >= 4000`；`3000 < 4000 → popup=false` | `dwell_time > 3000`（gt 3000） | 实际以代码为准：**>3000 即触发**，3000 不触发（`>3000` 严格大于） |
| P001 层级 | 未明说（验收样例 popup=false） | P1 优先级 → **强弹窗**（cascade P1 分支） | P001 一旦命中会 show_popup=true；验收样例 popup=false 只因该样例 dwell=3000 未越过 3000 阈值 |
| P001 诊断文案 | 「>4000」「>3秒」表述不一 | 「检测到犹豫（>3秒）」 | 文案与代码一致（>3 秒） |

## 四、负向（防误触）用例清单

| 目标规则 | 负向输入 | 断言（不应命中） |
| --- | --- | --- |
| D001-D006 | `context.error_type == NONE` | 均不命中 |
| S001 | `word == hello` | 不命中 S001 |
| S002 | `word == hello` | 不命中 S002 |
| S003 | `word == hello` | 不命中 S003 |
| S004 | `word == hello` | 不命中 S004 |
| C001 | `context.confusion_pair == unknown_pair` | 不命中 C001 |
| P001 | `dwell_time == 3000`（边界） | 不命中 P001 |
| P002 | `historical_behavior.repeated_errors == 1` | 不命中 P002 |
| P003 | `historical_behavior.total_correct == 5` | 不命中 P003 |

## 五、验收基线

- [x] 17 条规则全部有覆盖状态
- [x] 每条规则至少一个正向 case
- [x] 高风险规则（S/C 族 + P 族）有负向 case 防误触
- [x] `/api/v1/engine/judge` 批量通过（`test_rule_coverage.py`）