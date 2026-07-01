// Test API success rate with real IDs from page 1
const https = require('https');
const zlib = require('zlib');
const LZString = require('lz-string');

function fetch(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : require('http');
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Referer': 'https://sudokupad.app/',
      },
      timeout: 15000
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(new URL(res.headers.location, url).toString()).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8') });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function decode(rawText) {
  const text = (rawText || '').trim();
  if (!text) return null;
  if (text.startsWith('fpuz')) {
    try {
      const jsonStr = LZString.decompressFromBase64(text.substring(4));
      if (jsonStr) return { format: 'fpuz', data: JSON.parse(jsonStr) };
    } catch(e) {}
  }
  if (text.startsWith('scl')) {
    try {
      const jsonStr = LZString.decompressFromBase64(text.substring(3));
      if (jsonStr) return { format: 'scl', data: JSON.parse(jsonStr) };
    } catch(e) {}
  }
  try { return { format: 'json', data: JSON.parse(text) }; } catch(e) {}
  return null;
}

async function test() {
  // First, collect ALL puzzle links from 5 pages
  const allLinks = [];
  for (let page = 0; page < 5; page++) {
    const listHtml = await fetch(`https://logic-masters.de/Raetselportal/Suche/erweitert.php?tag_id=9201&start=${page*20}`);
    const puzzleRegex = /zeigen\.php\?id=([A-Za-z0-9]{4,10})/g;
    const ids = [...new Set([...listHtml.matchAll(puzzleRegex)].map(m => m[1].toUpperCase()))];
    
    for (const id of ids) {
      await new Promise(r => setTimeout(r, 300));
      const html = await fetch(`https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=${id}`);
      
      // All sudokupad links
      const directRegex = /https?:\/\/(?:www\.)?sudokupad\.app\/(?!puzzle\/)([a-zA-Z0-9]{6,20})(?![a-zA-Z0-9\/])(?:[?#"'<).]|$)/gm;
      const userRegex = /https?:\/\/(?:www\.)?sudokupad\.app\/([a-zA-Z0-9_-]{3,30})\/([a-zA-Z0-9_-]{3,50})(?:[?#"'<).]|$)/gm;
      
      const direct = [...html.matchAll(directRegex)].map(m => ({type:'direct', path:m[1]}));
      const user = [...html.matchAll(userRegex)].map(m => ({type:'user', path:`${m[1]}/${m[2]}`}));
      
      for (const link of [...direct, ...user]) {
        allLinks.push({ lmdId: id, ...link });
      }
    }
    console.log(`Page ${page+1}: collected ${allLinks.length} total links so far`);
  }
  
  console.log(`\nTotal links to test: ${allLinks.length}`);
  
  // Now test each one
  let ok = 0, notFound = 0, decodeErr = 0, noCages = 0, serverError = 0;
  for (let i = 0; i < allLinks.length; i++) {
    const link = allLinks[i];
    try {
      const r = await fetch(`https://sudokupad.app/api/puzzle/${link.path}`);
      if (r.status === 404) {
        notFound++;
      } else if (r.status >= 500) {
        serverError++;
      } else if (r.status === 200) {
        const dec = decode(r.body);
        if (!dec) {
          decodeErr++;
          console.log(`  [${i+1}] DECODE FAIL: ${link.path} (${r.body.substring(0,30)}...)`);
        } else {
          const cages = dec.format === 'fpuz' ? (dec.data.killercage||dec.data.cages||[]) : (dec.data.cages||[]);
          if (cages.length < 8) {
            noCages++;
          } else {
            ok++;
            const title = dec.format === 'fpuz' ? dec.data.title : dec.data.metadata?.title;
            console.log(`  [${i+1}] OK: ${link.path} -> "${title}" cages=${cages.length} fmt=${dec.format}`);
          }
        }
      } else {
        serverError++;
        console.log(`  [${i+1}] HTTP ${r.status}: ${link.path}`);
      }
    } catch(e) {
      serverError++;
    }
    await new Promise(r => setTimeout(r, 200 + Math.random()*200));
  }
  
  console.log(`\n=== Results (${allLinks.length} links) ===`);
  console.log(`  OK (cages>=8): ${ok}`);
  console.log(`  Too few cages: ${noCages}`);
  console.log(`  404 Not found: ${notFound}`);
  console.log(`  Decode error: ${decodeErr}`);
  console.log(`  Server/network error: ${serverError}`);
}

test().catch(e => console.error(e));
