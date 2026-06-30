// 正确解码fpuz格式
const LZString = require('lz-string');
const fs = require('fs');

const raw = fs.readFileSync('crawlers/debug-pad-golq795apl.bin', 'utf-8').trim();

if (raw.startsWith('fpuz')) {
  const compressed = raw.substring(4);
  const jsonStr = LZString.decompressFromBase64(compressed);
  const data = JSON.parse(jsonStr);
  
  console.log('Title:', data.title);
  console.log('Author:', data.author);
  console.log('Size:', data.size);
  console.log('Ruleset:', data.ruleset?.substring(0, 100));
  console.log('\nAll keys:', Object.keys(data));
  
  // Grid格式分析
  console.log('\n--- Grid Analysis ---');
  console.log('Grid type:', typeof data.grid, Array.isArray(data.grid) ? 'array' : '');
  console.log('Grid[0][0]:', JSON.stringify(data.grid[0][0]));
  console.log('Grid[0][1]:', JSON.stringify(data.grid[0][1]));
  
  // Cages
  console.log('\n--- Cages ---');
  if (data.cages) {
    console.log('Cages count:', data.cages.length);
    console.log('First cage:', JSON.stringify(data.cages[0]));
  }
  if (data.killercages) {
    console.log('Killercages count:', data.killercages.length);
    console.log('First killercage:', JSON.stringify(data.killercages[0]));
  }
  
  // 提取given digits
  console.log('\n--- Given Digits ---');
  let givenCount = 0;
  const boardData = [];
  for (let r = 0; r < 9; r++) {
    boardData[r] = [];
    for (let c = 0; c < 9; c++) {
      const cell = data.grid[r][c];
      if (typeof cell === 'object' && cell !== null) {
        boardData[r][c] = cell.value || 0;
      } else {
        boardData[r][c] = cell || 0;
      }
      if (boardData[r][c] !== 0) givenCount++;
    }
  }
  console.log('Given count:', givenCount);
  console.log('Board:');
  for (const row of boardData) console.log(row.join(' '));
  
  // 保存完整解码数据
  fs.writeFileSync('crawlers/debug-pad-decoded.json', JSON.stringify(data, null, 2));
  console.log('\nFull JSON saved to crawlers/debug-pad-decoded.json');
}
