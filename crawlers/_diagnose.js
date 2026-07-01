// Quick crawler diagnostics
const { fetch } = require('d:/killersudoku/crawlers/lib');

async function diagnose() {
  console.log('=== Step 1: Test list page (page 0, no seite param) ===');
  const url0 = 'https://logic-masters.de/Raetselportal/Suche/erweitert.php?tag_id=9201';
  const html0 = await fetch(url0);
  console.log('Page length:', html0.length);

  // Test regex from original crawler
  const origRegex = /zeigen\.php\?id=([A-Z0-9]{6})[^>]*>([^<]+)</g;
  let m, cnt = 0;
  const ids = [];
  while ((m = origRegex.exec(html0)) !== null) {
    cnt++;
    ids.push(m[1]);
  }
  console.log('Original regex matches:', cnt);
  if (ids.length > 0) console.log('Sample IDs:', ids.slice(0, 5));

  // Check if the issue is lowercase letters in IDs
  const looseRegex = /zeigen\.php\?id=([A-Za-z0-9]+)["'][^>]*>([^<]+)</g;
  cnt = 0;
  const ids2 = [];
  while ((m = looseRegex.exec(html0)) !== null) {
    cnt++;
    ids2.push({ id: m[1], title: m[2].trim().substring(0, 40) });
  }
  console.log('Loose regex matches:', cnt);
  console.log('First 5:', JSON.stringify(ids2.slice(0, 5), null, 2));

  // Check pagination
  console.log('\n=== Step 2: Test pagination ===');
  const navMatch = html0.match(/rp_navigation[\s\S]*?<\/div>/);
  if (navMatch) console.log('Navigation:', navMatch[0].substring(0, 600));

  // Check page 2 with start parameter
  console.log('\n=== Step 3: Test page 2 (start=20) ===');
  const url2 = 'https://logic-masters.de/Raetselportal/Suche/erweitert.php?tag_id=9201&start=20';
  const html2 = await fetch(url2);
  const ids3 = [];
  while ((m = looseRegex.exec(html2)) !== null) {
    ids3.push({ id: m[1], title: m[2].trim().substring(0, 40) });
  }
  console.log('Page 2 matches:', ids3.length);
  console.log('First 3:', JSON.stringify(ids3.slice(0, 3), null, 2));

  // Check detail page for SudokuPad links
  console.log('\n=== Step 4: Test detail page SudokuPad link extraction ===');
  if (ids2.length > 0) {
    const testId = ids2[0].id;
    const detailUrl = `https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=${testId}`;
    console.log('Fetching detail for', testId, ':', ids2[0].title);
    const detailHtml = await fetch(detailUrl);

    // Look for all sudokupad links in the HTML
    const allPadLinks = [];
    const linkRegex = /href=["']([^"']*sudokupad[^"']*)["']/gi;
    while ((m = linkRegex.exec(detailHtml)) !== null) {
      allPadLinks.push(m[1]);
    }
    console.log('All sudokupad links in HTML:', allPadLinks);

    // Also check for f-puzzles links
    const fpLinks = [];
    const fpRegex = /href=["']([^"']*f-puzzles[^"']*)["']/gi;
    while ((m = fpRegex.exec(detailHtml)) !== null) {
      fpLinks.push(m[1]);
    }
    console.log('All f-puzzles links:', fpLinks);

    // Check for any embedded puzzle applets
    const appletRegex = /(sudokupad|f-puzzles|penpa-edit|puzzlink)\S{0,100}/gi;
    const applets = [];
    while ((m = appletRegex.exec(detailHtml)) !== null) {
      applets.push(m[0].substring(0, 100));
    }
    console.log('Applet references:', applets.slice(0, 10));

    // Test SudokuPad API
    for (const link of allPadLinks) {
      const pathMatch = link.match(/sudokupad\.app\/([a-zA-Z0-9_-]+)/);
      if (pathMatch) {
        const padId = pathMatch[1];
        console.log('\nExtracted pad ID:', padId, '(length:', padId.length, ')');
        try {
          const apiUrl = 'https://sudokupad.app/api/puzzle/' + padId;
          console.log('Fetching:', apiUrl);
          const padData = await fetch(apiUrl);
          console.log('Pad response length:', padData.length);
          console.log('Pad response first 100 chars:', padData.substring(0, 100));
        } catch(e) {
          console.log('Pad fetch error:', e.message);
        }
      }
    }
  }
}

diagnose().catch(e => { console.error(e); process.exit(1); });
