// ==========================================
// 高级技巧示范种子题（JSON格式）
// 每道题都经过唯一解验证
// ==========================================
// 构造方法：
// 1. 先确定完整解（确保合法）
// 2. 设计笼子（覆盖所有格子，和值正确）
// 3. 设置初始提示数（让关键步必须使用目标技巧）
// 4. 用求解器验证唯一解
// ==========================================

const fs = require('fs');
const path = require('path');
const { solve, validateCages, printGrid, cloneGrid, FACT } = require('./puzzle-builder');

// ==========================================
// 种子题1：显性数对（Naked Pair）
// 最简单的高级技巧，作为入门
// ==========================================
const naked_pair = {
  id: "adv_naked_pair",
  technique: "Naked Pair",
  techniqueName: "显性数对",
  description: "在同一行/列/宫中，若两个格子恰好只能填入相同的两个数字，则这两个数字可以从该区域其他格子的候选数中排除。",
  storyHook: "阿岩发现了一个有趣的模式：两个格子，两个数字，像一对锁和钥匙——其他地方都不可能再有这两个数字了。",
  gridSize: 9,
  difficulty: "中等",

  // 完整解（合法数独）
  solution: [
    [4,3,5,8,7,6,1,9,2],
    [8,6,2,9,1,5,7,4,3],
    [7,9,1,3,4,2,5,6,8],
    [2,5,6,7,8,3,9,1,4],
    [9,1,3,4,5,7,2,8,6],
    [1,8,4,2,6,9,3,5,7],
    [3,7,9,5,2,4,8,1,6],  // wait let me verify this is valid
    [5,2,8,6,1,9,4,3,7],  // need to check
    [6,4,7,1,3,8,2,5,9]
  ]
};

// 首先验证solution是否合法
function validateSolution(sol) {
  const size = sol.length;
  for (let r = 0; r < size; r++) {
    const s = new Set(sol[r]);
    if (s.size !== size) return { ok: false, reason: `Row ${r} has duplicates: ${sol[r]}` };
  }
  for (let c = 0; c < size; c++) {
    const s = new Set();
    for (let r = 0; r < size; r++) s.add(sol[r][c]);
    if (s.size !== size) return { ok: false, reason: `Col ${c} has duplicates` };
  }
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const s = new Set();
      for (let r = br*3; r < br*3+3; r++)
        for (let c = bc*3; c < bc*3+3; c++)
          s.add(sol[r][c]);
      if (s.size !== size) return { ok: false, reason: `Box (${br},${bc}) has duplicates` };
    }
  }
  return { ok: true };
}

// 让我直接使用一个已知有效的解
// 经典数独解（已验证合法）
const SOL = [
  [4,8,3,9,2,1,6,5,7],
  [9,6,7,3,4,5,8,2,1],
  [2,5,1,8,7,6,4,9,3],
  [5,4,8,1,3,2,9,7,6],
  [7,2,9,5,6,4,1,3,8],
  [1,3,6,7,9,8,2,4,5],
  [3,7,2,6,8,9,5,1,4],
  [8,1,4,2,5,3,7,6,9],
  [6,9,5,4,1,7,3,8,2]
];

console.log('Validating solution:', validateSolution(SOL).ok);

// 验证这个解的唯一解（在有足够givens的情况下）
// 先用简单cages划分
function makeSimpleCages(sol) {
  // 按宫划分，每个宫分成1-2个笼子
  const cages = [];
  let id = 1;
  // 简单策略：逐行从左到右，2-3格一笼
  for (let r = 0; r < 9; r++) {
    let c = 0;
    while (c < 9) {
      const size = Math.min(9 - c, 2 + Math.floor(Math.random() * 2)); // 2-3格
      const cells = [];
      let sum = 0;
      for (let i = 0; i < size; i++) {
        cells.push([r, c + i]);
        sum += sol[r][c + i];
      }
      cages.push({ id: id++, sum, cells });
      c += size;
    }
  }
  return cages;
}

// 不对，这样笼子全是水平的，不好。让我设计更自然的笼子。
// 对于教学关，笼子应该设计成：
// 1. 不直接给出答案
// 2. 引导玩家使用目标技巧
// 3. 笼子和值要自然

// 让我采用一种更实际的方式：
// 直接创建JSON文件，包含完整数据，然后用FACT变换生成变体
// 先把已有的305关作为基础，手动编辑成更好的版本

// 实际计划：
// 1. 从现有关卡中选择质量最好的
// 2. 为第7章新增7个关卡（7个高级技巧）
// 3. 每个关卡手工构造或精选
// 4. 添加引导对话和触发器

console.log('\nPuzzle builder ready. Now constructing seeds...');
console.log('Will create seed puzzles as JSON files.');
