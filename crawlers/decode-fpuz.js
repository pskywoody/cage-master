// 测试fpuz格式解码
const LZString = require('lz-string');
const fs = require('fs');

// 读取之前保存的原始响应
const raw = fs.readFileSync('crawlers/debug-pad-golq795apl.bin', 'utf-8').trim();
console.log('Raw response starts with:', raw.substring(0, 20));
console.log('Total length:', raw.length);

// fpuz格式：fpuz + LZ-string压缩的JSON
if (raw.startsWith('fpuz')) {
  const compressed = raw.substring(4); // 去掉fpuz前缀
  console.log('Compressed data (first 50):', compressed.substring(0, 50));
  
  // 尝试LZ-string的各种解压方法
  try {
    const decompressed = LZString.decompress(compressed);
    console.log('\n✓ LZString.decompress succeeded!');
    console.log('Result length:', decompressed.length);
    console.log('First 500 chars:', decompressed.substring(0, 500));
    fs.writeFileSync('crawlers/debug-pad-decoded.json', decompressed);
    
    const data = JSON.parse(decompressed);
    console.log('\nJSON keys:', Object.keys(data));
    if (data.grid) console.log('Grid size:', data.grid.length);
    if (data.cages) console.log('Cages:', data.cages.length);
    if (data.killercages) console.log('KillerCages:', data.killercages.length);
  } catch(e) {
    console.log('LZString.decompress failed:', e.message);
  }
  
  try {
    const decompressed = LZString.decompressFromBase64(compressed);
    if (decompressed) {
      console.log('\n✓ LZString.decompressFromBase64 succeeded!');
      console.log('First 500 chars:', decompressed.substring(0, 500));
    }
  } catch(e) {
    console.log('decompressFromBase64 failed:', e.message);
  }
  
  try {
    const decompressed = LZString.decompressFromUTF16(compressed);
    if (decompressed) {
      console.log('\n✓ LZString.decompressFromUTF16 succeeded!');
      console.log('First 500 chars:', decompressed.substring(0, 500));
    }
  } catch(e) {
    console.log('decompressFromUTF16 failed:', e.message);
  }
}
