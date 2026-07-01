// 模拟玩家开局能填多少裸单，验证破局点是否明确
const builder = require('./level-builder');
const SIZE = 4;

// 105关
const boardData = [
  [1,0,4,0],
  [0,4,0,1],
  [3,0,2,4],
  [0,2,0,3]
];
const cages = [
  { id: 0, cells: [[0,1],[0,3]], sum: 5 },
  { id: 1, cells: [[1,0],[2,0]], sum: 5 },
  { id: 2, cells: [[3,0],[3,2]], sum: 5 }
];

console.log('🧪 模拟105关人类解题流程（只用裸单/隐单/唯一组合）:\n');

let grid = builder.cloneGrid(boardData);
let filled = 0;
let step = 1;

// 简单模拟：反复找裸单和唯一组合
while (true) {
  let progress = false;
  
  // 找裸单
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] !== 0) continue;
      const cands = builder.getCands(grid, r, c, SIZE, 2, 2);
      if (cands.length === 1) {
        console.log(`  步骤${step}: 裸单 (${r},${c}) = ${cands[0]}`);
        grid[r][c] = cands[0];
        filled++;
        step++;
        progress = true;
      }
    }
  }
  if (progress) continue;
  
  // 找唯一组合（2格笼和值3/4/6/7）
  for (const cage of cages) {
    if (cage.cells.length !== 2) continue;
    const [a, b] = cage.cells;
    if (grid[a[0]][a[1]] !== 0 || grid[b[0]][b[1]] !== 0) continue;
    const uniq = {3:[1,2],4:[1,3],6:[2,4],7:[3,4]};
    if (uniq[cage.sum]) {
      // 检查行列宫是否允许这两个数字
      const [n1, n2] = uniq[cage.sum];
      const ca = builder.getCands(grid, a[0], a[1], SIZE, 2, 2);
      const cb = builder.getCands(grid, b[0], b[1], SIZE, 2, 2);
      if (ca.includes(n1) && ca.includes(n2) && cb.includes(n1) && cb.includes(n2)) {
        // 两个格子都能放这两个数字，还需要进一步约束
        // 但如果某一格只能放其中一个，就能确定
        if (ca.length === 2 && cb.length === 2 && ca[0]===n1 && ca[1]===n2 && cb[0]===n1 && cb[1]===n2) {
          // 还需要隐单才能确定，卡壳了
        }
      }
    }
  }
  
  break;
}

console.log(`\n📊 开局裸单可填: ${filled}个`);
console.log('当前盘面:');
builder.printGrid(grid, SIZE);

// 数空格
let empty = 0;
for (let r = 0; r < SIZE; r++)
  for (let c = 0; c < SIZE; c++)
    if (grid[r][c] === 0) empty++;
console.log(`剩余空格: ${empty}个`);

if (empty <= 3) {
  console.log('\n⚠️  问题：开局裸单就能几乎填满，隐单破局点不明显！');
} else {
  console.log('\n✅ 破局点存在，需要用隐单');
}
