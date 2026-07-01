// Analyze link distribution on LMD detail pages
const { fetch, sleep } = require('d:/killersudoku/crawlers/lib');

async function analyze() {
  // Get page 1 list
  const listUrl = 'https://logic-masters.de/Raetselportal/Suche/erweitert.php?tag_id=9201';
  const listHtml = await fetch(listUrl);
  const regex = /zeigen\.php\?id=([A-Za-z0-9]{4,10})["'][^>]*>([^<]+)</g;
  const puzzles = [];
  let m;
  while ((m = regex.exec(listHtml)) !== null) {
    puzzles.push({ lmdId: m[1].toUpperCase(), title: m[2].trim() });
  }
  console.log(`Page 1: ${puzzles.length} puzzles\n`);

  let hasSudokuPad = 0, hasFPuzzles = 0, hasNeither = 0, hasBoth = 0;

  for (let i = 0; i < puzzles.length; i++) {
    const p = puzzles[i];
    const url = `https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=${p.lmdId}`;
    try {
      const html = await fetch(url);
      const hasSP = /sudokupad\.app/i.test(html);
      const hasFP = /f-puzzles\.com/i.test(html);
      
      if (hasSP && hasFP) hasBoth++;
      else if (hasSP) hasSudokuPad++;
      else if (hasFP) hasFPuzzles++;
      else hasNeither++;
      
      console.log(`[${i+1}] ${p.title.substring(0,35).padEnd(35)} SP=${hasSP?'✓':'✗'} FP=${hasFP?'✓':'✗'}`);
    } catch(e) {
      console.log(`[${i+1}] ${p.title.substring(0,35)} ERROR: ${e.message.substring(0,30)}`);
    }
    await sleep(300);
  }

  console.log(`\n=== Results ===`);
  console.log(`Has SudokuPad only: ${hasSudokuPad}`);
  console.log(`Has f-puzzles only: ${hasFPuzzles}`);
  console.log(`Has both:           ${hasBoth}`);
  console.log(`Has neither:        ${hasNeither}`);
}

analyze().catch(e => { console.error(e); process.exit(1); });
