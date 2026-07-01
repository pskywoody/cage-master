// Test multiple detail pages to find failure modes
const { fetch } = require('d:/killersudoku/crawlers/lib');
const LZString = require('lz-string');

function decodeSudokuPad(rawText) {
  const text = rawText.trim();
  if (text.startsWith('fpuz')) {
    try {
      const jsonStr = LZString.decompressFromBase64(text.substring(4));
      if (jsonStr) return { format: 'fpuz', data: JSON.parse(jsonStr) };
    } catch(e) { console.log('  fpuz decode error:', e.message); }
  }
  if (text.startsWith('scl')) {
    try {
      const jsonStr = LZString.decompressFromBase64(text.substring(3));
      if (jsonStr) return { format: 'scl', data: JSON.parse(jsonStr) };
    } catch(e) { console.log('  scl decode error:', e.message); }
  }
  try { return { format: 'json', data: JSON.parse(text) }; } catch(e) {}
  return null;
}

async function testAll20() {
  // Get page 1 list
  const url0 = 'https://logic-masters.de/Raetselportal/Suche/erweitert.php?tag_id=9201';
  const html0 = await fetch(url0);
  const looseRegex = /zeigen\.php\?id=([A-Za-z0-9]+)["'][^>]*>([^<]+)</g;
  let m;
  const puzzles = [];
  while ((m = looseRegex.exec(html0)) !== null) {
    puzzles.push({ lmdId: m[1], title: m[2].trim() });
  }
  console.log(`Found ${puzzles.length} puzzles on page 1\n`);

  let success = 0, noLink = 0, decodeFail = 0, noCages = 0;
  for (let i = 0; i < puzzles.length; i++) {
    const p = puzzles[i];
    const detailUrl = `https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=${p.lmdId}`;
    try {
      const detailHtml = await fetch(detailUrl);

      // Extract sudokupad links (improved regex)
      const padIds = new Set();
      // Match: sudokupad.app/XXXXXX or f-puzzles.com/?id=XXXXXX
      const padRegex = /https?:\/\/(?:www\.)?(?:sudokupad\.app\/(?:puzzle\/)?|f-puzzles\.com\/\?id=)([a-zA-Z0-9_-]{6,})/gi;
      let pm;
      while ((pm = padRegex.exec(detailHtml)) !== null) {
        padIds.add(pm[1]);
      }

      // Also check for embedded iframes or other formats
      const iframeRegex = /src=["']https?:\/\/(?:www\.)?(sudokupad\.app|f-puzzles\.com)\/([^"']+)["']/gi;
      while ((pm = iframeRegex.exec(detailHtml)) !== null) {
        const id = pm[2].replace(/^[?/]/, '').replace(/^id=/, '');
        if (id.length >= 6) padIds.add(id.split('?')[0]);
      }

      if (padIds.size === 0) {
        console.log(`[${i+1}] ${p.title.substring(0,40).padEnd(40)} ⚠ NO SUDOKUPAD LINK`);
        noLink++;
        continue;
      }

      let got = false;
      for (const padId of padIds) {
        try {
          const apiUrl = 'https://sudokupad.app/api/puzzle/' + padId;
          const padText = await fetch(apiUrl);
          const decoded = decodeSudokuPad(padText);
          if (decoded) {
            // Check for cages
            let cages = null;
            if (decoded.format === 'fpuz') {
              cages = decoded.data.killercage || decoded.data.cages || decoded.data.killercages;
            } else if (decoded.format === 'scl') {
              cages = decoded.data.cages;
            }
            const size = decoded.data.size || 9;
            console.log(`[${i+1}] ${p.title.substring(0,40).padEnd(40)} ✓ ${decoded.format} size=${size} cages=${cages ? cages.length : 0} padId=${padId}`);
            if (cages && cages.length > 0) {
              success++;
              got = true;
              break;
            } else {
              console.log(`  -> No cages found in puzzle data`);
              noCages++;
              got = true;
              break;
            }
          } else {
            console.log(`[${i+1}] ${p.title.substring(0,40).padEnd(40)} ✗ DECODE FAIL padId=${padId}`);
          }
        } catch(e) {
          console.log(`[${i+1}] ${p.title.substring(0,40).padEnd(40)} ✗ API error: ${e.message.substring(0,30)}`);
        }
        await new Promise(r => setTimeout(r, 200));
      }
      if (!got) decodeFail++;
    } catch(e) {
      console.log(`[${i+1}] ${p.title.substring(0,40).padEnd(40)} ✗ Detail fetch error: ${e.message.substring(0,30)}`);
      decodeFail++;
    }
    await new Promise(r => setTimeout(r, 400));
  }

  console.log(`\n=== Results ===`);
  console.log(`Success: ${success}, NoLink: ${noLink}, DecodeFail: ${decodeFail}, NoCages: ${noCages}`);
}

testAll20().catch(e => { console.error(e); process.exit(1); });
