// Check what "blobz" actually points to
const { fetch } = require('d:/killersudoku/crawlers/lib');
const LZString = require('lz-string');

async function check() {
  // Try blobz
  try {
    const text = await fetch('https://sudokupad.app/api/puzzle/blobz');
    console.log('blobz response length:', text.length, 'starts with:', text.substring(0, 20));
    if (text.startsWith('scl') || text.startsWith('fpuz')) {
      const jsonStr = text.startsWith('scl') ? LZString.decompressFromBase64(text.substring(3)) : LZString.decompressFromBase64(text.substring(4));
      const data = JSON.parse(jsonStr);
      console.log('Decoded! size:', data.size || (data.cells?.length), 'cages:', (data.cages||[]).length);
    }
  } catch(e) {
    console.log('blobz error:', e.message.substring(0,60));
  }
  
  // Try 27alezpc
  try {
    const text = await fetch('https://sudokupad.app/api/puzzle/27alezpc');
    console.log('\n27alezpc response length:', text.length, 'starts with:', text.substring(0,20));
  } catch(e) {
    console.log('27alezpc error:', e.message.substring(0,60));
  }
  
  // Check a 5-char ID to see if valid
  // Let's also check the actual HTML around the link for 000T78
  const html = await fetch('https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000T78');
  const idx = html.indexOf('sudokupad.app');
  console.log('\nContext around sudokupad.app in 000T78:');
  console.log(html.substring(Math.max(0,idx-50), idx+100));
}

check().catch(e => { console.error(e); process.exit(1); });
