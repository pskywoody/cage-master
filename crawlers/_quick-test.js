// Quick test: 3 pages with fixed crawler
const crawler = require('d:/killersudoku/crawlers/lmd-crawler');
crawler.main({ pages: 3, verbose: true }).then(({ seeds, failReasons }) => {
  console.log('\n=== Quick Test Results ===');
  const pure = seeds.filter(s => s.isPure);
  console.log(`Pure killers: ${pure.length}`);
  console.log(`Semi-pure: ${seeds.length - pure.length}`);
  console.log(`Total: ${seeds.length}`);
  console.log('Fail reasons:', failReasons);
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
