// 解码scl格式（SudokuPad自有格式）
const { fetch } = require('./lib');
const LZString = require('lz-string');
const zlib = require('zlib');
const fs = require('fs');

async function decodeScl(id) {
  const url = `https://sudokupad.app/api/puzzle/${id}`;
  const resp = await fetch(url);
  console.log(`Response starts with: ${resp.substring(0, 10)}`);
  
  fs.writeFileSync(`crawlers/debug-scl-${id}.txt`, resp);
  
  if (resp.startsWith('scl')) {
    // scl格式：scl + 压缩数据
    // 可能是LZ-string或者其他压缩方式
    const after = resp.substring(3);
    console.log(`After scl prefix (first 100): ${after.substring(0, 100)}`);
    
    // 尝试各种LZ-string方法
    const methods = [
      ['decompressFromBase64', () => LZString.decompressFromBase64(after)],
      ['decompress', () => LZString.decompress(after)],
      ['decompressFromUTF16', () => LZString.decompressFromUTF16(after)],
      ['decompressFromEncodedURIComponent', () => LZString.decompressFromEncodedURIComponent(after)],
      ['decompressFromUint8Array (as binary)', () => {
        const uint8 = new Uint8Array(Buffer.from(after, 'binary'));
        return LZString.decompressFromUint8Array(uint8);
      }],
    ];
    
    for (const [name, fn] of methods) {
      try {
        const result = fn();
        if (result && result.length > 10) {
          console.log(`\n✓ ${name} succeeded! Length: ${result.length}`);
          console.log(`First 300 chars: ${result.substring(0, 300)}`);
          fs.writeFileSync(`crawlers/debug-scl-${id}-decoded.json`, result);
          
          // 尝试解析JSON
          try {
            const data = JSON.parse(result);
            console.log(`JSON keys: ${Object.keys(data).join(', ')}`);
            return data;
          } catch(e) {
            console.log('Not valid JSON');
          }
        }
      } catch(e) {
        console.log(`  ${name}: ${e.message}`);
      }
    }
    
    // 尝试base64 -> zlib
    try {
      const buf = Buffer.from(after, 'base64');
      console.log(`\nbase64 decoded: ${buf.length} bytes`);
      console.log('First bytes hex:', buf.slice(0, 20).toString('hex'));
      
      try {
        const d = zlib.inflateSync(buf);
        console.log(`zlib.inflate: ${d.toString('utf-8').substring(0, 200)}`);
      } catch(e) {}
      
      try {
        const d = zlib.inflateRawSync(buf);
        console.log(`zlib.inflateRaw: ${d.toString('utf-8').substring(0, 200)}`);
      } catch(e) {}
      
      try {
        const d = zlib.gunzipSync(buf);
        console.log(`zlib.gunzip: ${d.toString('utf-8').substring(0, 200)}`);
      } catch(e) {}
      
      try {
        const d = zlib.brotliDecompressSync(buf);
        console.log(`zlib.brotli: ${d.toString('utf-8').substring(0, 200)}`);
      } catch(e) {}
      
      // pako
      try {
        const pako = require('pako');
        const d = pako.inflate(buf, { to: 'string' });
        console.log(`pako.inflate: ${d.substring(0, 200)}`);
      } catch(e) {}
      
    } catch(e) {
      console.log('base64 decode failed:', e.message);
    }
  }
}

decodeScl('udl8m83mqt').catch(console.error);
