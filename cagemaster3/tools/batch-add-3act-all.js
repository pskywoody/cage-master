/**
 * 批量为所有章节生成 threeAct 元数据
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const chapters = [2, 3, 4, 5, 6, 7];

console.log('=== 批量生成 threeAct（第2~7章） ===\n');

let totalSuccess = 0;
let totalLevels = 0;

for (const ch of chapters) {
  const chStr = String(ch).padStart(2, '0');
  const inputFile = path.join(__dirname, '..', 'data', 'chapters', `chapter-${chStr}.json`);
  const outputFile = path.join(__dirname, '..', 'data', 'chapters', `chapter-${chStr}-with-3act.json`);

  // 检查输入文件是否存在
  if (!fs.existsSync(inputFile)) {
    console.log(`第${ch}章: ⚠️  输入文件不存在，跳过`);
    continue;
  }

  process.stdout.write(`第${ch}章: 处理中... `);

  try {
    const result = execSync(
      `node "${path.join(__dirname, 'add-threeact-to-levels.js')}" --input "${inputFile}" --output "${outputFile}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    // 解析输出，统计成功数量
    const lines = result.trim().split('\n');
    const lastLine = lines[lines.length - 1];
    const match = lastLine.match(/成功 (\d+)/);
    
    // 读取输出文件，统计关卡数
    const data = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    const levelCount = (data.levels || []).length;
    const withThreeAct = (data.levels || []).filter(l => l.threeAct).length;
    
    totalLevels += levelCount;
    totalSuccess += withThreeAct;
    
    console.log(`✓ ${withThreeAct}/${levelCount} 个关卡`);
  } catch (e) {
    console.log(`✗ 失败: ${e.message}`);
    if (e.stderr) console.log(e.stderr);
  }
}

console.log(`\n=== 完成 ===`);
console.log(`总计: ${totalSuccess}/${totalLevels} 个关卡生成 threeAct`);
