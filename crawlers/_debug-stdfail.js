// Debug: why are 52/60 puzzles failing toStandardFormat?
const { fetch, sleep } = require('d:/killersudoku/crawlers/lib');
const { decodeSudokuPad, toStandardFormat, fetchLMDList, fetchLMDDetail } = require('d:/killersudoku/crawlers/lmd-crawler');

const SUDOKUPAD_API = 'https://sudokupad.app/api/puzzle/';

async function debug() {
  const puzzles = await fetchLMDList(0);
  console.log(`Testing ${puzzles.length} puzzles from page 1...\n`);
  
  let ok = 0, decodeNull = 0, stdNull = 0, tooFew = 0;
  const stdNullReasons = {};
  
  for (let i = 0; i < puzzles.length; i++) {
    const p = puzzles[i];
    await fetchLMDDetail(p);
    await sleep(300);
    
    if (!p.padLinks || p.padLinks.length === 0) {
      console.log(`[${i+1}] ${p.title.substring(0,30)} - no links`);
      continue;
    }
    
    for (const link of p.padLinks) {
      try {
        const text = await fetch(SUDOKUPAD_API + link.apiPath, {
          accept: '*/*',
          referer: `https://sudokupad.app/${link.apiPath}`,
          headers: { 'Origin': 'https://sudokupad.app' }
        });
        
        const dec = decodeSudokuPad(text);
        if (!dec) {
          decodeNull++;
          console.log(`[${i+1}] ${p.title.substring(0,25).padEnd(25)} DECODE_NULL first20=${text.substring(0,20)}`);
          break;
        }
        
        // Try toStandardFormat and capture why it returns null
        const std = toStandardFormat(dec, { title: p.title, author: p.author });
        if (!std) {
          stdNull++;
          // Determine why
          const data = dec.data;
          let reason = 'unknown';
          const size = data.size || (dec.format === 'scl' ? (data.cells?.length || 9) : (data.grid?.length || 9));
          
          if (size !== 9) reason = `size=${size}`;
          else {
            const cages = dec.format === 'fpuz' ? (data.killercage||data.cages||data.killercages||[]) : (data.cages||[]);
            if (!cages || cages.length === 0) reason = 'no cages field';
            else if (cages.length < 8) reason = `few cages: ${cages.length}`;
            else {
              // Check coverage
              const covered = new Set();
              let overlap = false, oob = false;
              for (const cage of cages) {
                for (const cell of cage.cells) {
                  let r, c;
                  if (typeof cell === 'string') {
                    const m = cell.match(/R(\d+)C(\d+)/i);
                    if (!m) continue;
                    r = parseInt(m[1])-1; c = parseInt(m[2])-1;
                  } else if (Array.isArray(cell)) { r = cell[0]; c = cell[1]; }
                  else if (cell && typeof cell === 'object') { r = cell.r; c = cell.c; }
                  else continue;
                  if (r < 0 || r >= 9 || c < 0 || c >= 9) { oob = true; break; }
                  const key = r*9+c;
                  if (covered.has(key)) { overlap = true; break; }
                  covered.add(key);
                }
                if (oob || overlap) break;
              }
              if (oob) reason = 'cage out of bounds';
              else if (overlap) reason = 'cage overlap';
              else if (covered.size < 60) reason = `low coverage: ${covered.size}/81`;
              else reason = `cov=${covered.size} but rejected (other issue)`;
            }
          }
          stdNullReasons[reason] = (stdNullReasons[reason]||0)+1;
          console.log(`[${i+1}] ${p.title.substring(0,25).padEnd(25)} STD_NULL reason=${reason} fmt=${dec.format} cages=${(dec.format==='fpuz'?(data.killercage||data.cages||[]):(data.cages||[])).length}`);
          break;
        } else {
          if (std.cageCount >= 8) {
            ok++;
            console.log(`[${i+1}] ${p.title.substring(0,25).padEnd(25)} OK cages=${std.cageCount} cov=${std.originalCoverage} pure=${std.isPure}`);
          } else {
            tooFew++;
            console.log(`[${i+1}] ${p.title.substring(0,25).padEnd(25)} TOO_FEW cages=${std.cageCount}`);
          }
          break;
        }
      } catch(e) {
        console.log(`[${i+1}] ${p.title.substring(0,25).padEnd(25)} HTTP_ERROR ${e.message.substring(0,40)}`);
      }
      await sleep(300);
    }
  }
  
  console.log(`\n=== Results ===`);
  console.log(`OK: ${ok}, Too few cages: ${tooFew}`);
  console.log(`Decode null: ${decodeNull}`);
  console.log(`toStandardFormat null: ${stdNull}`);
  console.log(`\nRejection reasons:`);
  for (const [r,c] of Object.entries(stdNullReasons).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${r}: ${c}`);
  }
}

debug().catch(e => console.error(e));
