// Check scl coordinate system (0-indexed vs 1-indexed)
const { fetch } = require('d:/killersudoku/crawlers/lib');
const LZString = require('lz-string');

async function inspect() {
  // "Ranked Japanese Sum Cages" - coverage=97 means cells overlap or 1-indexed
  const padId = '2kyuzdqxgw';
  const text = await fetch('https://sudokupad.app/api/puzzle/' + padId);
  const jsonStr = LZString.decompressFromBase64(text.substring(3));
  const data = JSON.parse(jsonStr);
  
  console.log(`Title: ${data.metadata.title}`);
  console.log(`Cages count: ${data.cages.length}`);
  console.log(`Cells rows: ${data.cells.length}, cols: ${data.cells[0].length}`);
  
  // Show first 3 cages with cell coordinates
  for (let i = 0; i < Math.min(5, data.cages.length); i++) {
    const cage = data.cages[i];
    console.log(`\nCage ${i}: value=${cage.value}, cells=${JSON.stringify(cage.cells.slice(0,5))}`);
  }
  
  // Check if coordinates use 1-indexing (max r,c values)
  let maxR = 0, maxC = 0;
  const allCells = new Set();
  let overlap = 0;
  for (const cage of data.cages) {
    for (const [r, c] of cage.cells) {
      if (r > maxR) maxR = r;
      if (c > maxC) maxC = c;
      const key = r * 100 + c;
      if (allCells.has(key)) overlap++;
      allCells.add(key);
    }
  }
  console.log(`\nMax R: ${maxR}, Max C: ${maxC}, Unique cells: ${allCells.size}, Overlaps: ${overlap}`);
  
  // Check the known-good one for comparison
  console.log('\n=== Mirror Flaw (known good, coverage=81) ===');
  const padId2 = 'soynij0h56';
  const text2 = await fetch('https://sudokupad.app/api/puzzle/' + padId2);
  const jsonStr2 = LZString.decompressFromBase64(text2.substring(3));
  const data2 = JSON.parse(jsonStr2);
  let maxR2 = 0, maxC2 = 0;
  const all2 = new Set();
  for (const cage of data2.cages) {
    for (const [r, c] of cage.cells) {
      if (r > maxR2) maxR2 = r;
      if (c > maxC2) maxC2 = c;
      all2.add(r*100+c);
    }
  }
  console.log(`Cages: ${data2.cages.length}, Max R: ${maxR2}, Max C: ${maxC2}, Unique: ${all2.size}`);
  console.log(`First 3 cages:`, JSON.stringify(data2.cages.slice(0,3).map(c => ({v:c.value, cells:c.cells.slice(0,4)}))));
}

inspect().catch(e => { console.error(e); process.exit(1); });
