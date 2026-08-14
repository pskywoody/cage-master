# B4 Experiments

> **状态：ACTIVE** · 创建：2026-08-10
> 对照基准：`docs/B4/benchmark-baseline.md`（B3-FINAL 冻结）

---

## 目录语义

```
experiments/B4/
  ├── archived/    # 已完成的实验（负结果或已采纳，保留复现）
  └── active/      # 当前进行中的实验
```

## 命名规则

- 实验脚本：`B4-*.cjs`（如 `B4-A1-topology-prior.cjs`）
- 数据：`data/b4-*.json`
- 命名空间禁止与 B3 混淆（B3 已 ARCHIVED）

## 状态语义

| 状态 | 含义 |
|---|---|
| 🟡 active | 当前实验 |
| ✅ adopted | 已采纳（候选优于 baseline） |
| ❌ negative | 负结果（回退，保留复现） |

## 对照要求

每个 B4 实验必须：
1. 单变量（只改一个 thing）
2. 对照 `benchmark-baseline.md`
3. 记录 top4 / entropy / complex / unique / score 五维
4. 明确 adopted / negative

---