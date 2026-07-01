const { fetch } = require('d:/killersudoku/crawlers/lib');
const LZString = require('lz-string');

async function check() {
  // Try user/puzzle path format
  try {
    const url = 'https://sudokupad.app/api/puzzle/blobz/black-sheep';
    console.log('Fetching:', url);
    const text = await fetch(url);
    console.log('Response length:', text.length, 'starts with:', text.substring(0,20));
    if (text.startsWith('scl') || text.startsWith('fpuz')) {
      const prefix = text.startsWith('scl') ? 3 : 4;
      const jsonStr = LZString.decompressFromBase64(text.substring(prefix));
      const data = JSON.parse(jsonStr);
      const size = data.size || (data.cells?.length);
      const cages = data.cages || data.killercage || [];
      console.log('Decoded! size:', size, 'cages:', cages.length);
      if (cages[0]) console.log('First cage:', JSON.stringify(cages[0]).substring(0,200));
    }
  } catch(e) {
    console.log('Error:', e.message.substring(0,80));
  }
}

check().catch(e => { console.error(e); process.exit(1); });
