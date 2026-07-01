// Full crawl: 50 pages = 1000 puzzles
const crawler = require('d:/killersudoku/crawlers/lmd-crawler');
crawler.main({ pages: 50, verbose: true }).then(({ seeds, failReasons }) => {
  console.log('\n=== Final Results ===');
  const pure = seeds.filter(s => s.isPure);
  const filled = seeds.filter(s => !s.isPure);
  console.log(`Pure killers (0 givens, full coverage): ${pure.length}`);
  console.log(`Semi-pure (with auto-fill): ${filled.length}`);
  console.log(`Total usable: ${seeds.length}`);
  
  const byDiff = {};
  for (const s of seeds) {
    const d = s.difficulty || 0;
    byDiff[d] = (byDiff[d] || 0) + 1;
  }
  console.log('\nBy LMD difficulty stars:', byDiff);
  
  const byCov = {};
  for (const s of seeds) {
    const bucket = Math.floor(s.originalCoverage / 10) * 10;
    byCov[bucket] = (byCov[bucket] || 0) + 1;
  }
  console.log('By original coverage:', byCov);
  
  // Save pure killers separately
  const fs = require('fs');
  const path = require('path');
  if (pure.length > 0) {
    const outPath = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'seeds', 'lmd-pure-killers.json');
    fs.writeFileSync(outPath, JSON.stringify({
      source: 'lmd-sudokupad',
      type: 'killer-sudoku',
      count: pure.length,
      crawledAt: new Date().toISOString(),
      puzzles: pure
    }, null, 2));
    console.log(`\nSaved ${pure.length} pure killers to lmd-pure-killers.json`);
  }
  
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
