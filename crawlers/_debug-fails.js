// Debug: why are puzzles failing to decode/validate?
const { fetch, sleep } = require('d:/killersudoku/crawlers/lib');
const crawler = require('d:/killersudoku/crawlers/lmd-crawler');

async function debug() {
  // Get page 1+2 puzzles
  const allPuzzles = [];
  for (let page = 0; page < 2; page++) {
    const puzzles = await crawler.fetchLMDList(page);
    allPuzzles.push(...puzzles);
    await sleep(500);
  }
  
  console.log(`Testing ${allPuzzles.length} puzzles...\n`);
  
  let ok = 0, failHttp = 0, failDecode = 0, failValidation = 0;
  const failReasons = {};
  
  for (let i = 0; i < allPuzzles.length; i++) {
    const p = allPuzzles[i];
    try {
      await crawler.fetchLMDDetail(p);
      await sleep(200);
      
      const links = p.padLinks || [];
      const linkStr = links.map(l => `${l.type}:${l.apiPath.substring(0,25)}`).join(', ');
      
      let puzzleOk = false;
      for (const link of links) {
        try {
          const decoded = await crawler.fetchAndDecode(link.apiPath);
          await sleep(100);
          
          if (decoded) {
            const std = crawler.toStandardFormat(decoded, { title: p.title, author: p.author });
            if (std && std.cageCount >= 8) {
              console.log(`[${i+1}] ✓ ${p.title.substring(0,30).padEnd(30)} cages=${std.cageCount} cov=${std.originalCoverage} via ${link.type}`);
              ok++;
              puzzleOk = true;
              break;
            } else if (std) {
              const reason = std.cageCount < 8 ? 'too few cages' : 'validation fail';
              failValidation++;
              if (!puzzleOk) console.log(`[${i+1}] △ ${p.title.substring(0,30).padEnd(30)} ${reason} (cages=${std.cageCount}, cov=${std.originalCoverage}) via ${link.type}`);
              puzzleOk = true;
              break;
            } else {
              // decoded but toStandardFormat returned null
              const d = decoded.data;
              const size = d.size || (d.cells?.length) || '?';
              const cages = (d.cages || d.killercage || []).length;
              failValidation++;
              if (!puzzleOk) console.log(`[${i+1}] △ ${p.title.substring(0,30).padEnd(30)} decoded but invalid (size=${size}, cages=${cages}) via ${link.type}`);
              puzzleOk = true;
              break;
            }
          } else {
            // decode returned null
          }
        } catch(e) {
          failHttp++;
        }
      }
      
      if (!puzzleOk) {
        console.log(`[${i+1}] ✗ ${p.title.substring(0,30).padEnd(30)} ALL FAIL links=[${linkStr}]`);
        failDecode++;
      }
    } catch(e) {
      console.log(`[${i+1}] ✗ ${p.title.substring(0,30).padEnd(30)} ERROR: ${e.message.substring(0,50)}`);
      failHttp++;
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`OK: ${ok}, HTTP fail: ${failHttp}, Decode null: ${failDecode}, Validation fail: ${failValidation}`);
}

debug().catch(e => { console.error(e); process.exit(1); });
