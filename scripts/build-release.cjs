/**
 * ============================================================
 *  build-release.cjs — R1+R3 Release artifact 打包
 * ============================================================
 *
 *  把 B3-FINAL 发布对象从「一个 JSON」升级为可审计 release artifact：
 *
 *  release/B3-FINAL/
 *    ├── manifest.json          # 发布清单（版本/配置/acceptance）
 *    ├── release-pool.json      # 生产兼容 pool（LevelPoolManager 格式）
 *    ├── acceptance-report.md   # 验收基准快照
 *    ├── config-lock.json       # 生产配置锁（R2 同步）
 *    ├── pool.sha256            # 校验和（R3）
 *    └── README.md              # 说明
 *
 *  用法:
 *    node scripts/build-release.cjs
 * 依赖:
 *    data/release-pool-b3final.json（generate-release-pool.cjs 产物）
 *    docs/B3-FINAL-acceptance-report.md
 * ============================================================
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'release', 'B3-FINAL');
const SRC_POOL = path.join(ROOT, 'data', 'release-pool-b3final.json');
const SRC_ACCEPT = path.join(ROOT, 'docs', 'B3-FINAL-acceptance-report.md');

const STAR_LABEL = { '1星': '入门', '2星': '进阶', '3星': '高手', '4星': '专家', '5星': '大师' };

function main() {
  const pool = JSON.parse(fs.readFileSync(SRC_POOL, 'utf-8'));
  const acceptMarkdown = fs.readFileSync(SRC_ACCEPT, 'utf-8');
  const s = pool.stats;
  const failedGates = Object.entries(pool.gates || {}).filter(([, v]) => !v).map(([k]) => k);
  const acceptance = failedGates.length === 0 ? 'PASS' : 'FAIL';

  // ---- 转成 LevelPoolManager 兼容的 pool 条目 ----
  const prodPool = {
    metadata: {
      release: 'B3-FINAL',
      generator: 'CageMaster',
      version: '3.0',
      poolSize: pool.levels.length,
      seed: pool.config.seed,
      generatedAt: pool.generatedAt,
      acceptance,
      failedGates,
      stats: {
        top4Share: s.top4Share, entropyH: s.entropyH, complexShare: s.complexShare,
        ratioMean: s.ratioMean, avgScore: s.avgScore, singletonRatio: s.singletonRatio,
        uniqueAll: s.uniqueAll, sizeShare: s.sizeShare,
      },
    },
    pool: pool.levels.map((lv) => ({
      levelId: lv.levelId,
      gridSize: 9,
      difficulty: STAR_LABEL[lv.star] || '高手',
      boardData: lv.boardData,
      solution: lv.solution,
      cages: lv.cages,
      difficultyInfo: { level: lv.star, score: lv.score },
      releaseMeta: {
        index: lv.index, score: lv.score, star: lv.star,
        cageReasoningRatio: lv.cageReasoningRatio, unique: lv.unique,
      },
    })),
  };

  // ---- manifest.json ----
  const manifest = {
    release: 'B3-FINAL',
    version: '3.0',
    poolSize: pool.levels.length,
    generator: 'CageMaster',
    config: {
      gb: pool.defaultsApplied.growthBias,
      lambda: pool.defaultsApplied.objective.topologyWeight,
      W: pool.defaultsApplied.shapeDiversityWeight,
      objective: pool.defaultsApplied.objective.enabled,
      ratioWeight: pool.defaultsApplied.objective.ratioWeight,
      maxCollected: pool.defaultsApplied.objective.maxCollected,
    },
    acceptance,
    failedGates,
    gates: pool.gates,
    created: '2026-08-10',
    sourcePool: 'data/release-pool-b3final.json',
    seed: pool.config.seed,
  };

  // ---- config-lock.json（R2 落盘） ----
  const configLock = {
    lock: 'B3-FINAL',
    frozen: true,
    params: {
      gb: 0.4, lambda: 25, W: 0.2, objective: true, ratioWeight: 100, maxCollected: 8,
    },
    immutable: true,
    note: '生产参数已锁定。禁止修改 gb/λ/W/objective/fitness，除非进入 B4。',
  };

  fs.mkdirSync(RELEASE_DIR, { recursive: true });

  // 写文件
  fs.writeFileSync(path.join(RELEASE_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(RELEASE_DIR, 'release-pool.json'), JSON.stringify(prodPool, null, 2));
  fs.writeFileSync(path.join(RELEASE_DIR, 'acceptance-report.md'), acceptMarkdown);
  fs.writeFileSync(path.join(RELEASE_DIR, 'config-lock.json'), JSON.stringify(configLock, null, 2));

  // ---- R3: SHA256 ----
  const prodPoolRaw = fs.readFileSync(path.join(RELEASE_DIR, 'release-pool.json'));
  const sha = crypto.createHash('sha256').update(prodPoolRaw).digest('hex');
  fs.writeFileSync(path.join(RELEASE_DIR, 'pool.sha256'), sha + '  release-pool.json\n');

  // ---- README ----
  const readme = `# B3-FINAL Release Package

> **状态：RELEASED** · 2026-08-10 · version 3.0
> 生成：\`scripts/build-release.cjs\`

## 内容

| File | 说明 |
|---|---|
| \`manifest.json\` | 发布清单（配置/acceptance/来源） |
| \`release-pool.json\` | 生产兼容 pool（LevelPoolManager 格式），${pool.levels.length} 关 |
| \`acceptance-report.md\` | 验收基准快照（Distribution/Quality/Diversity） |
| \`config-lock.json\` | 生产配置锁（冻结参数） |
| \`pool.sha256\` | release-pool.json 校验和 |

## 校验

\`\`\`sh
# 验证 pool 未被篡改
certutil -hashfile release/B3-FINAL/release-pool.json SHA256
# 结果应等于 pool.sha256 中的值
\`\`\`

## Pool SHA256

\`${sha}\`

## 配置锁（不可改）

- gb = 0.4
- lambda = 25
- W = 0.2
- objective = true
- ratioWeight = 100

> 生产环境不再实时生成。加载 \`release/B3-FINAL/release-pool.json\`。
> 任何 level drift 都由 pool.sha256 检测。
`;
  fs.writeFileSync(path.join(RELEASE_DIR, 'README.md'), readme);

  console.log('Release package 已生成: ' + RELEASE_DIR);
  console.log('  manifest.json / release-pool.json / acceptance-report.md / config-lock.json / pool.sha256 / README.md');
  console.log('  pool size = ' + manifest.poolSize);
  console.log('  sha256 = ' + sha);
}

if (require.main === module) {
  main();
}