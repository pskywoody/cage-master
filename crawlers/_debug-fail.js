// Debug decode failures on page 2
const { fetch, sleep } = require('d:/killersudoku/crawlers/lib');
const crawler = require('d:/killersudoku/crawlers/lmd-crawler');

async function debug() {
  // Get page 2 puzzles
  const puzzles = await crawler.fetchLMDList(1); // page 1 (0-indexed) = start=20
  console.log(`Page 2 has ${puzzles.length} puzzles\n`);

  let details = 0;
  for (let i = 0; i < Math.min(puzzles.length, 10); i++) {
    const p = puzzles[i];
    console.log(`\n[${i+1}] ${p.title} (${p.lmdId})`);
    
    try {
      await crawler.fetchLMDDetail(p);
      console.log(`  padIds: [${p.padIds.join(', ')}]`);
      console.log(`  author: ${p.author}, diff: ${p.difficulty}`);
      
      for (const padId of p.padIds) {
        try {
          const text = await fetch('https://sudokupad.app/api/puzzle/' + padId);
          console.log(`  padId=${padId}: response length=${text.length}, starts with=${text.substring(0,10)}`);
          
          const decoded = crawler.decodeSudokuPad(text);
          if (decoded) {
            const std = crawler.toStandardFormat(decoded, { title: p.title, author: p.author });
            if (std) {
              console.log(`    -> FORMAT=${decoded.format}, cages=${std.cageCount}, coverage=${std.coverage}, givens=${std.givenCount}`);
            } else {
              console.log(`    -> decoded but toStandardFormat returned null (format=${decoded.format})`);
              // Print some info
              const d = decoded.data;
              console.log(`    -> size=${d.size}, hasCages=${!!(d.cages || d.killercage || d.killercages)}, cagesLen=${(d.cages||d.killercage||d.killercages||[]).length}`);
            }
          } else {
            console.log(`    -> decodeSudokuPad returned null`);
          }
        } catch(e) {
          console.log(`  padId=${padId}: HTTP ERROR ${e.message.substring(0,50)}`);
        }
        await sleep(200);
      }
    } catch(e) {
      console.log(`  Detail fetch error: ${e.message.substring(0,60)}`);
    }
    await sleep(400);
  }
}

debug().catch(e => { console.error(e); process.exit(1); });
