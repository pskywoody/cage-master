// Inspect actual scl data structure
const { fetch } = require('d:/killersudoku/crawlers/lib');
const LZString = require('lz-string');

async function inspect() {
  // Test: Half Past Seven (scl, 16 cages, size=undefined)
  const padId = '9zc1kkssww';
  const text = await fetch('https://sudokupad.app/api/puzzle/' + padId);
  const jsonStr = LZString.decompressFromBase64(text.substring(3));
  const data = JSON.parse(jsonStr);
  
  console.log('=== Top-level keys ===');
  console.log(Object.keys(data));
  
  console.log('\n=== metadata ===');
  console.log(JSON.stringify(data.metadata, null, 2).substring(0, 1500));
  
  console.log('\n=== cells structure ===');
  if (data.cells) {
    console.log('cells is array?', Array.isArray(data.cells));
    console.log('cells length:', data.cells.length);
    if (data.cells.length > 0) {
      console.log('cells[0] length:', data.cells[0].length);
      console.log('cells[0][0]:', JSON.stringify(data.cells[0][0]).substring(0,200));
    }
  }
  
  console.log('\n=== cages[0] ===');
  if (data.cages && data.cages[0]) {
    console.log(JSON.stringify(data.cages[0], null, 2).substring(0, 500));
  }
  
  // Check where size is
  console.log('\n=== size search ===');
  for (const key of Object.keys(data)) {
    if (key === 'size') console.log('top-level size:', data.size);
  }
  if (data.metadata) {
    for (const key of Object.keys(data.metadata)) {
      if (key.toLowerCase().includes('size') || key.toLowerCase().includes('grid') || key.toLowerCase().includes('dim')) {
        console.log(`metadata.${key}:`, data.metadata[key]);
      }
    }
  }
  
  // Try to infer size from cells
  if (data.cells && Array.isArray(data.cells)) {
    console.log('Inferred size from cells:', data.cells.length);
  }
}

inspect().catch(e => { console.error(e); process.exit(1); });
