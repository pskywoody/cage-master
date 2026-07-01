// Check actual detail page HTML for pad links
const { fetch } = require('d:/killersudoku/crawlers/lib');

async function checkDetail(lmdId) {
  const url = `https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=${lmdId}`;
  const html = await fetch(url);
  
  // Find all anchor tags
  const anchorRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  let m;
  while ((m = anchorRegex.exec(html)) !== null) {
    const href = m[1];
    const text = m[2].trim();
    if (href.match(/sudokupad|f-puzzles|fpuzzles|ctc|app/i) || text.match(/sudoku\s*pad|f-?puzzles|play online|online spielen/i)) {
      console.log(`  Link: text="${text.substring(0,40)}" href="${href.substring(0,120)}"`);
    }
  }
  
  // Also find iframes
  const iframeRegex = /<iframe[^>]*src=["']([^"']+)["'][^>]*>/gi;
  while ((m = iframeRegex.exec(html)) !== null) {
    console.log(`  Iframe: src="${m[1].substring(0,120)}"`);
  }
  
  // Also look for "SudokuPad" text anywhere
  const padMentions = [];
  const padRegex = /sudokupad[^<]{0,100}/gi;
  while ((m = padRegex.exec(html)) !== null) {
    padMentions.push(m[0].substring(0,150));
  }
  if (padMentions.length > 0) {
    console.log(`  SudokuPad mentions in HTML:`);
    padMentions.slice(0,5).forEach(p => console.log(`    ${p}`));
  }
  
  // Also f-puzzles
  const fpMentions = [];
  const fpRegex = /f-?puzzles[^<]{0,100}/gi;
  while ((m = fpRegex.exec(html)) !== null) {
    fpMentions.push(m[0].substring(0,150));
  }
  if (fpMentions.length > 0) {
    console.log(`  f-puzzles mentions:`);
    fpMentions.slice(0,5).forEach(p => console.log(`    ${p}`));
  }
}

async function main() {
  const testIds = ['000TDQ', '000RLY', '000TCH', '000TBG', '000TAV'];
  for (const id of testIds) {
    console.log(`\n=== ${id} ===`);
    try {
      await checkDetail(id);
    } catch(e) {
      console.log('  Error:', e.message.substring(0,80));
    }
    await new Promise(r => setTimeout(r, 800));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
