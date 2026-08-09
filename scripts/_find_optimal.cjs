// 分析 data.js / scan-output.json 的 80 格矩阵，定位全局最优格
// 甜区带（硬边界）：
//   interceptRate 20-30 | parryRate 40-60 | stealRate 60-80
//   hotPotato*100 30-60 | deathblowRoundsPct 80-100 | deathblowComplete 50-80 | winMargin 3-8
const fs = require('fs');
const path = require('path');

function load(srcPath) {
  let s = fs.readFileSync(srcPath, 'utf8');
  s = s.replace(/^window\.DASH_DATA\s*=\s*/, '').replace(/;\s*$/, '');
  return JSON.parse(s);
}

const src = process.argv[2];
const data = load(src);
const m = data.matrix;

function bands(c) {
  return {
    intercept: c.interceptRateMean >= 20 && c.interceptRateMean <= 30,
    parry: c.parryRateMean >= 40 && c.parryRateMean <= 60,
    steal: c.stealRateMean >= 60 && c.stealRateMean <= 80,
    hot: c.hotPotatoAvg * 100 >= 30 && c.hotPotatoAvg * 100 <= 60,
    kill: c.deathblowRoundsPct >= 80 && c.deathblowRoundsPct <= 100,
    comp: c.deathblowCompleteAvg != null && c.deathblowCompleteAvg >= 50 && c.deathblowCompleteAvg <= 80,
    margin: c.winMarginAvg >= 3 && c.winMarginAvg <= 8,
  };
}

let cells = [];
for (const cd of Object.keys(m))
  for (const sm of Object.keys(m[cd]))
    for (const fg of Object.keys(m[cd][sm])) {
      const c = m[cd][sm][fg];
      const b = bands(c);
      const inBands = Object.values(b).filter(Boolean).length;
      cells.push({ cd: +cd, sm: +sm, fg: +fg, total: c.fun.total, inBands, b, c });
    }

// 排序：① 全落带内优先 ② total 高优先 ③ 落带数多优先
cells.sort((a, z) => {
  const aAll = a.inBands === 7 ? 1 : 0, zAll = z.inBands === 7 ? 1 : 0;
  if (aAll !== zAll) return zAll - aAll;
  if (z.total !== a.total) return z.total - a.total;
  return z.inBands - a.inBands;
});

const best = cells[0];
console.log('=== 全局最优格（优先全落带内，其次 total） ===');
console.log(JSON.stringify({
  cooldown: best.cd, siegeMs: best.sm, focusGain: best.fg,
  fun: best.c.fun, total: best.total, inBands: best.inBands + '/7',
  bands: best.b,
  metrics: {
    interceptRateMean: best.c.interceptRateMean, interceptRateStd: best.c.interceptRateStd,
    parryRateMean: best.c.parryRateMean, stealRateMean: best.c.stealRateMean,
    hotPotatoAvg: best.c.hotPotatoAvg, winMarginAvg: best.c.winMarginAvg,
    deathblowRoundsPct: best.c.deathblowRoundsPct, deathblowCompleteAvg: best.c.deathblowCompleteAvg,
    deathblowPerRound: best.c.deathblowPerRound,
    win: best.c.win,
  }
}, null, 1));

console.log('\n=== total 排名前 8 ===');
for (const x of cells.slice(0, 8)) {
  console.log(`cd=${x.cd} siege=${x.sm} fg=${x.fg} total=${x.total} inBands=${x.inBands}/7 ` +
    `intercept=${x.c.interceptRateMean} parry=${x.c.parryRateMean} steal=${x.c.stealRateMean} ` +
    `hot=${(x.c.hotPotatoAvg*100).toFixed(0)} kill%=${x.c.deathblowRoundsPct} comp=${x.c.deathblowCompleteAvg} margin=${x.c.winMarginAvg}`);
}

console.log('\n=== 全落带内(all 7) 的格子数:', cells.filter(x => x.inBands === 7).length, '===');
for (const x of cells.filter(x => x.inBands === 7).slice(0, 10)) {
  console.log(`cd=${x.cd} siege=${x.sm} fg=${x.fg} total=${x.total}`);
}
