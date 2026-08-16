# Teaching Demo Production Report

> 阶段状态：**TEACHING_DEMO_READY**

## 验收门

| 项 | 要求 | 结果 |
|---|---|---|
| auto demo 可生成 | PASS | PASS（35 关 fallback=auto） |
| golden manifest 一致 | PASS | PASS（35 AUTO / 13 MANUAL，与 manifest 对齐） |
| fallback 可解释 | PASS | PASS（每个 manual 都有 fallbackReason） |
| runtime trace 可回放 | PASS | PASS（48 关 trace 写入 `data/teaching-demo-traces/`） |
| 13 manual review 未破坏 | PASS | PASS（13 关仍 fallback=manual） |
| teaching validation 全绿 | PASS | PASS（`validate-teaching-demo.js` 6 Case 全 PASS） |

## 统计

- 教学关总数：48
- auto：35
- manual：13（11 composite + 404 nakedTriplet + 704 xWing）
- auto 中低置信（<0.7）：0
- runtime trace：48 份 + `summary.json`

## 生产产物

- `core/teaching-demo-resolver.js`：生产态 resolver，输出 `{levelId, technique, confidence, demoSteps, fallback, fallbackReason, trace}`。
- `data/teaching-demo-traces/`：48 关 runtime trace + gate summary。
- `scripts/validate-teaching-demo-production.js`：P1 验收门。
- `docs/CM4/teaching-demo-production-baseline.md`：基线冻结（35/13、契约、失败模式）。
- `docs/CM4/teaching-demo-failure-taxonomy.md`：F1–F5 失败分类。

## 边界遵守

未改 Experiment Platform / LearnerModel / Teaching AI policy / solver；未自动改变教学策略；未为 auto 伪造通过结果；35/13 划分未变。

## 下一阶段

P2 Teaching Policy v1（Learner State → Teaching Intent → Action Selection）。