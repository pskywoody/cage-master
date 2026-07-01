// Check why the crawler had such high failure rate
// Let's trace through the exact regex matching on a real LMD detail page
const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(new URL(res.headers.location, url).toString()).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function test() {
  // Test first 5 puzzles from page 1
  const listHtml = await fetch('https://logic-masters.de/Raetselportal/Suche/erweitert.php?tag_id=9201&start=0');
  const puzzleRegex = /zeigen\.php\?id=([A-Za-z0-9]{4,10})/g;
  const ids = [];
  let m;
  while ((m = puzzleRegex.exec(listHtml)) !== null) {
    ids.push(m[1].toUpperCase());
  }
  const uniqueIds = [...new Set(ids)].slice(0, 5);
  
  for (const id of uniqueIds) {
    console.log(`\n=== LMD ID: ${id} ===`);
    const html = await fetch(`https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=${id}`);
    
    // Use the SAME regex patterns as the crawler
    const directRegex = /https?:\/\/(?:www\.)?sudokupad\.app\/(?!puzzle\/)([a-zA-Z0-9]{6,20})(?![a-zA-Z0-9\/])(?:[?#"'<).]|$)/gm;
    const userRegex = /https?:\/\/(?:www\.)?sudokupad\.app\/([a-zA-Z0-9_-]{3,30})\/([a-zA-Z0-9_-]{3,50})(?:[?#"'<).]|$)/gm;
    const fpRegex = /https?:\/\/(?:www\.)?f-puzzles\.com\/\?id=([a-zA-Z0-9]{6,20})/gm;
    
    const direct = [...html.matchAll(directRegex)].map(m => m[1]);
    const user = [...html.matchAll(userRegex)].map(m => `${m[1]}/${m[2]}`);
    const fp = [...html.matchAll(fpRegex)].map(m => m[1]);
    
    // Also find ALL sudokupad.app references
    const allLinks = html.match(/https?:\/\/(?:www\.)?sudokupad\.app\/[^\s"'<>]+/g) || [];
    
    console.log('  All sudokupad links found (raw):');
    allLinks.forEach(l => console.log('   ', l));
    console.log('  Direct regex:', direct);
    console.log('  User regex:', user);
    console.log('  f-puzzles:', fp);
    
    await new Promise(r => setTimeout(r, 500));
  }
}

test().catch(e => console.error(e));
