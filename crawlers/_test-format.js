// Test toStandardFormat after fix
const { fetch, sleep } = require('d:/killersudoku/crawlers/lib');
const crawler = require('d:/killersudoku/crawlers/lmd-crawler');

async function test() {
  const padIds = ['pmn4txt1gn', '4addscv8up', '9zc1kkssww', 'rq8hdyfg1n', '4hahvecawx', 'oqxu4ojt4d'];
  for (const padId of padIds) {
    try {
      const text = await fetch('https://sudokupad.app/api/puzzle/' + padId);
      const decoded = crawler.decodeSudokuPad(text);
      if (decoded) {
        const std = crawler.toStandardFormat(decoded, { title: 'test', author: 'test' });
        if (std) {
          console.log(`${padId}: OK cages=${std.cageCount} coverage=${std.coverage} givens=${std.givenCount} hasSol=${!!std.solution}`);
        } else {
          const d = decoded.data;
          const size = d.size || (d.cells ? d.cells.length : '?');
          const cages = d.cages || d.killercage || [];
          console.log(`${padId}: FAIL format=${decoded.format} size=${size} cages=${cages.length}`);
          if (cages.length > 0) {
            // Check coverage
            const covered = new Set();
            let outOfBounds = false;
            for (const cage of cages) {
              if (!cage.cells) continue;
              for (const cc of cage.cells) {
                const [r,c] = Array.isArray(cc) ? cc : [cc.r, cc.c];
                if (r >= size || c >= size) outOfBounds = true;
                covered.add(r*9+c);
              }
            }
            console.log(`  coverage=${covered.size}, outOfBounds=${outOfBounds}`);
          }
        }
      } else {
        console.log(`${padId}: decode failed (starts with ${text.substring(0,10)})`);
      }
    } catch(e) {
      console.log(`${padId}: HTTP error - ${e.message.substring(0,60)}`);
    }
    await sleep(200);
  }
}

test().catch(e => { console.error(e); process.exit(1); });
