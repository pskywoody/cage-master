// Debug fpuz cages
const { fetch } = require('d:/killersudoku/crawlers/lib');
const LZString = require('lz-string');

async function debug() {
  // Test Entrothermia 2 (fpuz, cages=0)
  const padId = 'zsvudz6q3a';
  const text = await fetch('https://sudokupad.app/api/puzzle/' + padId);
  console.log('Raw starts with:', text.substring(0, 10));
  const jsonStr = LZString.decompressFromBase64(text.substring(4));
  const data = JSON.parse(jsonStr);
  console.log('Top-level keys:', Object.keys(data));
  console.log('size:', data.size);
  
  // Check all possible cage fields
  console.log('\nkillercage:', data.killercage ? data.killercage.length : 'undefined');
  console.log('cages:', data.cages ? data.cages.length : 'undefined');
  console.log('killercages:', data.killercages ? data.killercages.length : 'undefined');
  
  // Check for other cage-related fields
  for (const key of Object.keys(data)) {
    if (key.toLowerCase().includes('cage') || key.toLowerCase().includes('killer')) {
      const val = data[key];
      console.log(`Field "${key}": type=${typeof val}, isArray=${Array.isArray(val)}${Array.isArray(val) ? ', length='+val.length : ''}`);
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
        console.log('  First item keys:', Object.keys(val[0]));
        if (val[0].cells) console.log('  First item cells sample:', JSON.stringify(val[0].cells.slice(0,3)));
        if (val[0].value !== undefined) console.log('  First item value:', val[0].value);
        if (val[0].sum !== undefined) console.log('  First item sum:', val[0].sum);
      }
    }
  }
  
  // Also check under "regions" or other common f-puzzles keys
  if (data.regions) console.log('\nregions:', data.regions.length, 'first:', JSON.stringify(data.regions[0]).substring(0,200));
  
  // Check if there's a "killer" or "cage" in the ruleset
  if (data.ruleset) console.log('\nruleset:', data.ruleset.substring(0, 200));
  if (data.title) console.log('title:', data.title);
}

debug().catch(e => { console.error(e); process.exit(1); });
