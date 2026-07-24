/**
 * 将 threeAct 数据合并到原始章节文件中
 * 1. 备份原始文件为 .bak
 * 2. 将 with-3act 版本的 threeAct 字段写入原始文件
 */

const fs = require('fs');
const path = require('path');

const chapters = [1, 2, 3, 4, 5, 6, 7, 8];
const chaptersDir = path.join(__dirname, '..', 'data', 'chapters');

console.log('=== 合并 threeAct 到原始章节文件 ===\n');

let totalLevels = 0;
let totalWithThreeAct = 0;

for (const ch of chapters) {
  const chStr = String(ch).padStart(2, '0');
  const origFile = path.join(chaptersDir, `chapter-${chStr}.json`);
  const threeActFile = path.join(chaptersDir, `chapter-${chStr}-with-3act.json`);
  const backupFile = path.join(chaptersDir, `chapter-${chStr}.bak.json`);

  if (!fs.existsSync(origFile)) {
    console.log(`第${ch}章: ⚠️  原始文件不存在，跳过`);
    continue;
  }
  if (!fs.existsSync(threeActFile)) {
    console.log(`第${ch}章: ⚠️  threeAct 文件不存在，跳过`);
    continue;
  }

  process.stdout.write(`第${ch}章: `);

  try {
    // 读取两个文件
    const origData = JSON.parse(fs.readFileSync(origFile, 'utf-8'));
    const threeActData = JSON.parse(fs.readFileSync(threeActFile, 'utf-8'));

    // 备份原始文件
    if (!fs.existsSync(backupFile)) {
      fs.writeFileSync(backupFile, JSON.stringify(origData, null, 2), 'utf-8');
    }

    // 合并 threeAct
    const origLevels = origData.levels || [];
    const taLevels = threeActData.levels || [];
    
    let added = 0;
    for (let i = 0; i < Math.min(origLevels.length, taLevels.length); i++) {
      if (taLevels[i].threeAct) {
        origLevels[i].threeAct = taLevels[i].threeAct;
        added++;
      }
    }

    totalLevels += origLevels.length;
    totalWithThreeAct += added;

    // 写回原始文件
    fs.writeFileSync(origFile, JSON.stringify(origData, null, 2), 'utf-8');
    
    console.log(`✓ ${added}/${origLevels.length} 个关卡添加 threeAct`);
  } catch (e) {
    console.log(`✗ 失败: ${e.message}`);
  }
}

console.log(`\n=== 完成 ===`);
console.log(`总计: ${totalWithThreeAct}/${totalLevels} 个关卡添加 threeAct`);
console.log(`原始文件已备份为 .bak.json`);
