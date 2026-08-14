/**
 * ============================================================
 *  b4d05-benchmark.cjs — B4-D0.5 Family Frequency Distribution
 * ============================================================
 *
 *  目的：在引入任何 cross-level memory 之前，确认 family basin 收敛是否真实存在。
 *  B4-D0 已证明：单关内 family diversity 已存在（poolH 高），selection 保留它（winnerH≈poolH）。
 *  现在怀疑瓶颈在「跨 level 的 family 使用频率收敛」——不同关反复用同一批 family。
 *  本实验纯测量，不改变任何逻辑、不加权。
 *
 *  输出（冻结 benchmark N=30）：
 *    1. 全局 family histogram          family -> 出现次数
 *    2. 集中度指标                       top1/top4/top8 share，Hglobal vs ln(uniqueFamilyCount)
 *    3. family turnover（关键）          每关 newFamilyCount / reusedFamilyCount
 *    4. family lifespan                   firstSeen / lastSeen / appearanceCount / 连续占关最大段
 *
 *  触发判定：
 *    Case A：Hglobal 接近均匀、top4Share 低、newFamily 稳定
 *            → 不做 cross-level novelty（问题可能不是 family reuse）
 *    Case B：top4Share 高、Hglobal << ln(uniqueCount)、newFamily 下降
 *            → 确认 basin 收敛，进入 B4-D1-1（跨关 family 罕见度）
 *
 *  用法:
 *    node scripts/b4d05-benchmark.cjs --count 30 --seed 20260810
 *  输出: data/b4d05-benchmark.json
 * ============================================================
 */
const path = require('path');
const fs = require('fs');

// 与 cage-generator-v9.cjs 完全一致的 canonicalize（保证 family ID 可比）
function canonicalize(cells) {
  if (!cells || cells.length === 0) return '';
  const pts = cells.map((x) => [Number(x[0]), Number(x[1])]);
  const transforms = [
    (r, c) => [r, c], (r, c) => [c, -r], (r, c) => [-r, -c], (r, c) => [-c, r],
    (r, c) => [-r, c], (r, c) => [c, r], (r, c) => [r, -c], (r, c) => [-c, -r],
  ];
  let best = null;
  for (const t of transforms) {
    const out = pts.map(([r, c]) => t(r, c));
    const minR = Math.min(...out.map((p) => p[0]));
    const minC = Math.min(...out.map((p) => p[1]));
    const norm = out.map(([r, c]) => [r - minR, c - minC]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const key = norm.map(([r, c]) => r + ',' + c).join('|');
    if (best === null || key.localeCompare(best) < 0) best = key;
  }
  return best;
}

function classifyArchetype(cells) {
  if (!cells || cells.length === 0) return 'singleton';
  const pts = cells.map(([r, c]) => [Number(r), Number(c)]);
  const n = pts.length;
  if (n === 1) return 'singleton';
  const rows = new Set(pts.map((p) => p[0]));
  const cols = new Set(pts.map((p) => p[1]));
  const straight = rows.size === 1 || cols.size === 1;
  const fullRect = rows.size * cols.size === n;
  let maxDeg = 0, turns = 0;
  for (const [r, c] of pts) {
    let deg = 0;
    const adjs = [];
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (pts.some(([pr, pc]) => pr === r + dr && pc === c + dc)) { deg++; adjs.push([dr, dc]); }
    }
    maxDeg = Math.max(maxDeg, deg);
    if (deg === 2 && adjs[0][0] * adjs[1][0] + adjs[0][1] * adjs[1][1] === 0) turns++;
  }
  if (n === 2) return 'domino';
  if (straight) return 'straight';
  if (fullRect) return 'rect';
  if (maxDeg >= 4) return 'cross';
  if (maxDeg >= 3) return 'T';
  if (n === 3) return 'L';
  if (turns >= 2) return 'zigzag';
  if (turns >= 1) return 'hook';
  return 'irregular';
}
const CANONICAL_SHAPE_SET = new Set(['L', 'T', 'domino', 'straight']);

function parseArgs() {
  const args = process.argv.slice(2);
  const o = { count: 30, seed: 20260810, output: null, verbose: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') o.count = parseInt(args[++i], 10) || o.count;
    else if (args[i] === '--seed') o.seed = parseInt(args[++i], 10);
    else if (args[i] === '--verbose') o.verbose = true;
    else if (args[i] === '-o' || args[i] === '--output') o.output = args[++i];
  }
  return o;
}

function measure(batch) {
  // 全局 family 直方图（只统计 canonical family）与 lifespan
  const familyHist = new Map(); // family -> count
  const lifespan = new Map();   // family -> {first, last, appearances, blocks}
  const perLevel = [];          // 每关 {families:Set, newCount, reuseCount}
  const seenSoFar = new Set();

  for (let li = 0; li < batch.length; li++) {
    const lv = batch[li];
    const fams = new Set();
    for (const cage of lv.cages || []) {
      const cells = cage.cells || [];
      const a = classifyArchetype(cells);
      if (!CANONICAL_SHAPE_SET.has(a)) continue;
      const fam = canonicalize(cells);
      fams.add(fam);
    }
    let newCount = 0, reuseCount = 0;
    for (const fam of fams) {
      familyHist.set(fam, (familyHist.get(fam) || 0) + 1);
      const ls = lifespan.get(fam) || { first: li, last: li, appearances: 0, blocks: [] };
      ls.last = li;
      ls.appearances++;
      lifespan.set(fam, ls);
      if (!seenSoFar.has(fam)) { newCount++; seenSoFar.add(fam); }
      else reuseCount++;
    }
    perLevel.push({ level: li + 1, newFamilyCount: newCount, reusedFamilyCount: reuseCount, uniqueFamiliesInLevel: fams.size });
  }

  // lifespan blocks（连续占关最大段）
  for (const [fam, ls] of lifespan) {
    let cur = 1, best = 1;
    // lifespan 已按 first..last 顺序记录 appearances，但需按批序重建段
  }
  // 重建：逐关记录每 family 是否出现，算最大连续段
  const appearByLevel = new Map(); // family -> array of level indexes
  for (let li = 0; li < batch.length; li++) {
    const lv = batch[li];
    const famsIn = new Set();
    for (const cage of lv.cages || []) {
      const a = classifyArchetype(cage.cells || []);
      if (CANONICAL_SHAPE_SET.has(a)) famsIn.add(canonicalize(cage.cells || []));
    }
    for (const fam of famsIn) {
      if (!appearByLevel.has(fam)) appearByLevel.set(fam, []);
      appearByLevel.get(fam).push(li);
    }
  }
  for (const [fam, idxs] of appearByLevel) {
    let cur = 1, best = 1;
    for (let i = 1; i < idxs.length; i++) {
      if (idxs[i] === idxs[i - 1] + 1) { cur++; best = Math.max(best, cur); }
      else cur = 1;
    }
    const ls = lifespan.get(fam);
    ls.maxConsecutiveLevels = best;
  }

  // 集中度
  const counts = [...familyHist.values()].sort((a, b) => b - a);
  const totalFamAppearances = counts.reduce((a, b) => a + b, 0);
  const top1 = counts[0] || 0;
  let top4 = 0, top8 = 0;
  for (let i = 0; i < Math.min(4, counts.length); i++) top4 += counts[i];
  for (let i = 0; i < Math.min(8, counts.length); i++) top8 += counts[i];

  // Hglobal
  let H = 0;
  for (const c of counts) { const p = c / totalFamAppearances; H -= p * Math.log(p); }
  const uniqueCount = counts.length;
  const Huniform = Math.log(uniqueCount);

  // turnover 趋势：前半 vs 后半 avg newFamily
  const half = Math.floor(perLevel.length / 2);
  const firstHalf = perLevel.slice(0, half);
  const secondHalf = perLevel.slice(half);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const newFirst = avg(firstHalf.map((p) => p.newFamilyCount));
  const newSecond = avg(secondHalf.map((p) => p.newFamilyCount));

  // lifespan 统计
  const lifespanArr = [...lifespan.entries()].map(([fam, ls]) => ({ fam, ...ls })).sort((a, b) => b.appearances - a.appearances);

  // 头部 family 锁死判据：出现率 >=80% 的 family 数量（每关结构性重复信号）
  let headLock = 0;
  for (const ls of lifespanArr) {
    if (ls.appearances / batch.length >= 0.8) headLock++;
  }

  return {
    levels: batch.length,
    uniqueFamilyCount: uniqueCount,
    headFamilyLockCount: headLock, // 出现率>=80% 的 family 数
    familyHistogram: Object.fromEntries([...familyHist].sort((a, b) => b[1] - a[1])),
    concentration: {
      top1FamilyShare: Math.round(top1 / totalFamAppearances * 1000) / 1000,
      top4FamilyShare: Math.round(top4 / totalFamAppearances * 1000) / 1000,
      top8FamilyShare: Math.round(top8 / totalFamAppearances * 1000) / 1000,
    },
    entropy: {
      Hglobal: Math.round(H * 1000) / 1000,
      Huniform: Math.round(Huniform * 1000) / 1000,
      ratio_H_to_Huniform: Math.round((H / (Huniform || 1)) * 1000) / 1000,
    },
    turnover: {
      perLevel,
      avgNewFamily_FirstHalf: Math.round(newFirst * 100) / 100,
      avgNewFamily_SecondHalf: Math.round(newSecond * 100) / 100,
      newFamilyDeclining: newSecond < newFirst,
    },
    lifespan: lifespanArr,
  };
}

function computeVerdict(m) {
  const top4 = m.concentration.top4FamilyShare;
  const headLock = m.headFamilyLockCount;
  const declining = m.turnover.newFamilyDeclining;
  // Hglobal/Huniform 对「每关结构性重复」不敏感（10 个 family 都出现但集中度高），
  // 不作为 basin 判据。basin 判据 = 头部 family 锁死数 + top4 占比 + turnover 下降。
  if (top4 > 0.5 && headLock >= 3 && declining) {
    return `Case B：family basin 收敛确认（top4=${top4} >50%，头部 family 锁死数=${headLock}（出现率≥80%），newFamily 后半段下降）→ 进入 B4-D1-1（跨关 family 罕见度）。`;
  }
  if (headLock <= 2 && top4 < 0.5) {
    return `Case A：无显著 family basin（头部锁死=${headLock} 低，top4=${top4}）→ 不做 cross-level novelty，问题可能不是 family reuse。`;
  }
  return `Case 待定：需人工复核（top4=${top4}，头部锁死=${headLock}，newFamily${declining ? '下降' : '稳定'}）。`;
}

function main() {
  const opts = parseArgs();
  console.log(`=== B4-D0.5 Family Frequency Distribution (纯测量) ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  λ=25  gb=0.4  W=0.2  objective=true  NO weight\n`);

  const { CageFixer } = require('./cage-generator-v9.cjs');
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    objective: { canonicalNoveltyWeight: 0 },
  });
  const t0 = Date.now();
  const batch = gen.generateBatch(opts.count, { prefix: 'B4D05' });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const m = measure(batch);

  console.log(`耗时 ${elapsed}s，${m.levels} 关，uniqueFamily=${m.uniqueFamilyCount}`);
  console.log(`\n[集中度] top1=${m.concentration.top1FamilyShare}  top4=${m.concentration.top4FamilyShare}  top8=${m.concentration.top8FamilyShare}`);
  console.log(`[熵] Hglobal=${m.entropy.Hglobal}  Huniform(ln${m.uniqueFamilyCount})=${m.entropy.Huniform}  ratio=${m.entropy.ratio_H_to_Huniform}`);
  console.log(`[turnover] 前半 avgNew=${m.turnover.avgNewFamily_FirstHalf}  后半 avgNew=${m.turnover.avgNewFamily_SecondHalf}  ${m.turnover.newFamilyDeclining ? '下降' : '稳定'}`);
  console.log(`\nfamily histogram:`);
  for (const [fam, c] of Object.entries(m.familyHistogram)) {
    console.log(`  ${fam}  x${c}`);
  }
  console.log(`\nlifespan (top appearances):`);
  for (const ls of m.lifespan.slice(0, 10)) {
    console.log(`  ${ls.fam}  appear=${ls.appearances}  first=${ls.first + 1}  last=${ls.last + 1}  maxConsec=${ls.maxConsecutiveLevels}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, elapsedSeconds: Number(elapsed) },
    frozen: { lambda: 25, growthBias: 0.4, shapeDiversityWeight: 0.2, objective: 'enabled', suppressSingletons: true },
    variable: { none: 'measurement only' },
    result: m,
    verdict: computeVerdict(m),
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b4d05-benchmark.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nVerdict: ${report.verdict}`);
  console.log(`\n已保存: ${outPath}`);
}

if (require.main === module) {
  main();
}