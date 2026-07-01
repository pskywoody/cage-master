// Test actual SudokuPad API with real puzzle IDs
const https = require('https');
const zlib = require('zlib');
const LZString = require('lz-string');

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : require('http');
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://sudokupad.app/',
        'Origin': 'https://sudokupad.app',
        ...options.headers
      },
      timeout: 15000
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(new URL(res.headers.location, url).toString(), options).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let buffer = Buffer.concat(chunks);
        if (res.headers['content-encoding'] === 'gzip') {
          try { buffer = zlib.gunzipSync(buffer); } catch(e) {}
        }
        resolve({ status: res.statusCode, body: buffer.toString('utf-8'), headers: res.headers });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function test() {
  const testIds = ['dtp20mw3e1', 'pjnm7ug2m7', 'blobz/black-sheep'];
  
  for (const id of testIds) {
    console.log(`\n=== Testing ${id} ===`);
    
    // Try /api/puzzle/
    try {
      const r1 = await fetch(`https://sudokupad.app/api/puzzle/${id}`);
      console.log(`  /api/puzzle/: status=${r1.status}, length=${r1.body.length}`);
      if (r1.status === 200) {
        console.log(`  First 100 chars: ${r1.body.substring(0, 100)}`);
        if (r1.body.startsWith('fpuz')) {
          console.log('  Format: fpuz');
          try {
            const dec = LZString.decompressFromBase64(r1.body.substring(4));
            const data = JSON.parse(dec);
            console.log(`  Decoded! title=${data.title}, cages=${(data.killercage||data.cages||[]).length}, size=${data.size}`);
          } catch(e) { console.log('  Decode error:', e.message); }
        } else if (r1.body.startsWith('scl')) {
          console.log('  Format: scl');
          try {
            const dec = LZString.decompressFromBase64(r1.body.substring(3));
            const data = JSON.parse(dec);
            console.log(`  Decoded! title=${data.metadata?.title}, cages=${(data.cages||[]).length}`);
          } catch(e) { console.log('  Decode error:', e.message); }
        } else {
          console.log(`  Unknown format: ${r1.body.substring(0, 50)}`);
        }
      } else {
        console.log(`  Response: ${r1.body.substring(0, 100)}`);
      }
    } catch(e) {
      console.log(`  /api/puzzle/ error: ${e.message}`);
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
}

test().catch(e => console.error(e));
