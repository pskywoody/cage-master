// Check coverage of known-good puzzles
const { fetch } = require('d:/killersudoku/crawlers/lib');
const crawler = require('d:/killersudoku/crawlers/lmd-crawler');

async function test() {
  // These were the successful ones from page 1 earlier
  const padIds = ['dtp20mw3e1', 'bkyup2gjw6', 'udl8m83mqt', 'tf2wk77enk', 'soynij0h56', 'et4mh85g07', '3hhvz1o3t1', 'hqq5d71lcb', '2kyuzdqxgw', 'bg4272vqth'];
  for (const padId of padIds) {
    try {
      const text = await fetch('https://sudokupad.app/api/puzzle/' + padId);
      const decoded = crawler.decodeSudokuPad(text);
      if (decoded) {
        const std = crawler.toStandardFormat(decoded, { title: 'test', author: 'test' });
        if (std) {
          console.log(`${padId}: cages=${std.cageCount} coverage=${std.coverage} givens=${std.givenCount} pure=${std.isPure}`);
        } else {
          const d = decoded.data;
          const size = d.size || (d.cells ? d.cells.length : '?');
          const cages = d.cages || d.killercage || [];
          // Compute coverage manually
          const covered = new Set();
          for (const cage of cages) {
            if (!cage.cells) continue;
            for (const cc of cage.cells) {
              const [r,c] = Array.isArray(cc) ? cc : [cc.r, cc.c];
              covered.add(r*9+c);
            }
          }
          console.log(`${padId}: FAIL cages=${cages.length} coverage=${covered.size} format=${decoded.format}`);
        }
      }
    } catch(e) {
      console.log(`${padId}: error - ${e.message.substring(0,40)}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
}

test().catch(e => { console.error(e); process.exit(1); });
