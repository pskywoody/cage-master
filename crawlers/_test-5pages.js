// Test: crawl 5 pages and count how many are pure killer (coverage=81)
const crawler = require('d:/killersudoku/crawlers/lmd-crawler');
crawler.main({ pages: 5, verbose: true }).then(({ seeds, failReasons }) => {
  console.log('\n=== Results by purity ===');
  const pure = seeds.filter(s => s.isPure);
  const hybrid = seeds.filter(s => !s.isPure);
  console.log(`Pure killers (>=78 coverage): ${pure.length}`);
  console.log(`Semi-pure (75-77 coverage): ${hybrid.length}`);
  
  // Coverage distribution
  const covDist = {};
  for (const s of seeds) {
    const bucket = Math.floor(s.coverage / 5) * 5;
    covDist[bucket] = (covDist[bucket] || 0) + 1;
  }
  console.log('\nCoverage distribution:', covDist);
  
  // Show all seeds details
  console.log('\n=== All accepted puzzles ===');
  for (const s of seeds) {
    console.log(`  ${s.lmdId} | ${(s.title||'').substring(0,30).padEnd(30)} | cages=${s.cageCount} cov=${s.coverage} givens=${s.givenCount} pure=${s.isPure} diff=${s.difficulty}`);
  }
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
