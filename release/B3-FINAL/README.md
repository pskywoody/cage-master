# B3-FINAL Release Package

> **状态：RELEASED** · 2026-08-10 · version 3.0
> 生成：`scripts/build-release.cjs`

## 内容

| File | 说明 |
|---|---|
| `manifest.json` | 发布清单（配置/acceptance/来源） |
| `release-pool.json` | 生产兼容 pool（LevelPoolManager 格式），100 关 |
| `acceptance-report.md` | 验收基准快照（Distribution/Quality/Diversity） |
| `config-lock.json` | 生产配置锁（冻结参数） |
| `pool.sha256` | release-pool.json 校验和 |

## 校验

```sh
# 验证 pool 未被篡改
certutil -hashfile release/B3-FINAL/release-pool.json SHA256
# 结果应等于 pool.sha256 中的值
```

## Pool SHA256

`fa094aef3c042a74ce7b7ea3e56e91ed1be0380b0c394c2480fb9227c6bdb413`

## 配置锁（不可改）

- gb = 0.4
- lambda = 25
- W = 0.2
- objective = true
- ratioWeight = 100

> 生产环境不再实时生成。加载 `release/B3-FINAL/release-pool.json`。
> 任何 level drift 都由 pool.sha256 检测。
