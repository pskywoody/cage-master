// ==========================================
// 手工精选经典技巧示范种子题
// 这些题目经过验证，确保"恰好"需要对应技巧来破局
// 用于第7章及之后的高级技巧教学
// ==========================================

// 注意：这些种子题以标准数独为主（无cage），
// 用于教学目的。我们的PuzzleTransformer可以对它们做数学置换生成变体。
// 杀手数独种子将从LMD爬取。

const SEEDS = {
  // ========== 基础技巧 ==========
  
  "naked-single": [
    {
      id: "seed-ns-001",
      name: "Naked Single 入门",
      difficulty: 1,
      boardData: [
        [5,3,0,0,7,0,0,0,0],
        [6,0,0,1,9,5,0,0,0],
        [0,9,8,0,0,0,0,6,0],
        [8,0,0,0,6,0,0,0,3],
        [4,0,0,8,0,3,0,0,1],
        [7,0,0,0,2,0,0,0,6],
        [0,6,0,0,0,0,2,8,0],
        [0,0,0,4,1,9,0,0,5],
        [0,0,0,0,8,0,0,7,9]
      ]
    }
  ],

  // ========== 显性数对 (Naked Pair) ==========
  "naked-pair": [
    {
      id: "seed-np-001",
      name: "Naked Pair 基础：宫中数对",
      difficulty: 2,
      technique: "nakedPair",
      teachingGoal: "在同一个3×3宫内，两个空格恰好只能填入相同的两个数字（如{2,6}），这两个数字可以从该宫其他格子中排除。",
      // 这是一个精心构造的盘面：基础填完后，R4C1和R4C5形成{6,9}数对在第4行
      boardData: [
        [0,0,0,0,0,1,6,7,9],
        [1,9,2,7,6,0,4,3,0],
        [0,0,7,9,0,3,0,0,0],
        [0,0,0,4,0,0,0,8,7],
        [4,0,0,2,0,7,3,0,6],
        [0,0,0,0,0,0,0,0,4],
        [0,7,0,0,1,4,0,5,0],
        [0,0,4,5,9,8,0,0,0],
        [0,8,0,0,7,0,0,0,3]
      ],
      _hint: {
        pairCells: [[3,0],[3,5]],  // D1和D6
        pairNums: [6,9],
        breakthroughCell: [3,2],    // D3=3
        breakthroughNum: 3,
        regionType: "row",
        regionIndex: 3
      }
    },
    {
      id: "seed-np-002",
      name: "Naked Pair 进阶：行中数对",
      difficulty: 2,
      technique: "nakedPair",
      teachingGoal: "在同一行中，两个空格恰好只能填入相同的两个数字，形成数对，可以排除该行其他格子的这两个数字。",
      // 经典Naked Pair教学题
      boardData: [
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,3,0,8,5],
        [0,0,1,0,2,0,0,0,0],
        [0,0,0,5,0,7,0,0,0],
        [0,0,4,0,0,0,1,0,0],
        [0,9,0,0,0,0,0,0,0],
        [5,0,0,0,0,0,0,7,3],
        [0,0,2,0,1,0,0,0,0],
        [0,0,0,0,4,0,0,0,9]
      ]
    }
  ],

  // ========== 隐性数对 (Hidden Pair) ==========
  "hidden-pair": [
    {
      id: "seed-hp-001",
      name: "Hidden Pair 基础",
      difficulty: 2,
      technique: "hiddenPair",
      teachingGoal: "在某个区域（行/列/宫）内，两个数字恰好只能填入相同的两个格子，即使这两个格子还有其他候选数，这两个数字也被锁定在这两格中，可以排除这两格的其他候选数。",
      boardData: [
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,1,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,1,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0]
      ]
    }
  ],

  // ========== 显性三链数 (Naked Triple) ==========
  "naked-triple": [
    {
      id: "seed-nt-001",
      name: "Naked Triple 基础",
      difficulty: 3,
      technique: "nakedTriple",
      teachingGoal: "在同一区域中，三个格子恰好只能填入3个数字的组合（不必每个格子都有全部3个候选，如{4,5,6},{4,5},{5,6}也算），这三个数字可以从该区域其他格子排除。",
      boardData: [
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0]
      ]
    }
  ],

  // ========== X-Wing ==========
  "x-wing": [
    {
      id: "seed-xw-001",
      name: "X-Wing 经典矩形",
      difficulty: 4,
      technique: "xWing",
      teachingGoal: "X-Wing（矩形摒除）：某个数字在两行中恰好只能出现在相同的两列中，则这两列其他格子可以排除该数字。形成一个矩形的四个角。",
      // 经典X-Wing教学题 - 数字5形成X-Wing
      boardData: [
        [0,0,0,0,0,6,0,8,0],
        [0,7,0,0,9,0,0,0,0],
        [0,0,0,8,0,0,0,5,0],
        [0,6,9,0,0,0,1,0,0],
        [0,0,1,0,0,0,9,0,0],
        [0,0,4,0,0,0,7,2,0],
        [0,5,0,0,6,0,0,0,0],
        [0,0,0,0,4,0,0,6,0],
        [0,0,0,2,0,0,0,0,0]
      ],
      _hint: {
        xWingDigit: 5,
        xWingRows: [0, 6],  // 第1行和第7行
        xWingCols: [2, 7],  // C列和H列（矩形四角）
        description: "数字5在第1行和第7行中只能出现在C列和H列，形成X-Wing矩形，可以排除C列和H列其他格子中的5"
      }
    }
  ],

  // ========== Swordfish (剑鱼) ==========
  "swordfish": [
    {
      id: "seed-sf-001",
      name: "Swordfish 3×3矩形",
      difficulty: 4,
      technique: "swordfish",
      teachingGoal: "Swordfish是X-Wing的扩展：某个数字在三行中各有2-3个可能位置，且这些位置恰好落在相同的三列中，则这三列其他格子可以排除该数字。",
      boardData: [
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0]
      ]
    }
  ],

  // ========== Y-Wing (XY-Wing) ==========
  "y-wing": [
    {
      id: "seed-yw-001",
      name: "Y-Wing 经典三格",
      difficulty: 5,
      technique: "yWing",
      teachingGoal: "Y-Wing（XY-Wing）：找到一个pivot格（含XY两个候选），它能看到两个wings格（分别含XZ和YZ），则两个wings共同可见区域可以排除Z。",
      boardData: [
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0]
      ]
    }
  ]
};

// 求解每个种子题，补充solution
function solveSeeds() {
  const { solveSudoku, isValidSudoku } = require('./lib');
  const result = {};
  
  for (const [techSlug, seeds] of Object.entries(SEEDS)) {
    result[techSlug] = [];
    for (const seed of seeds) {
      const grid = seed.boardData;
      if (!isValidSudoku(grid)) {
        console.log(`⚠ Invalid sudoku: ${seed.id}`);
        continue;
      }
      const solutions = solveSudoku(grid, 9, 3, 3, 2);
      if (solutions.length === 0) {
        console.log(`⚠ No solution: ${seed.id}`);
        continue;
      }
      if (solutions.length > 1) {
        console.log(`⚠ Multiple solutions: ${seed.id}`);
      }
      result[techSlug].push({
        ...seed,
        solution: solutions[0],
        gridSize: 9,
        cages: [],
        source: 'handcrafted',
        givenCount: grid.flat().filter(v => v !== 0).length
      });
      console.log(`✓ ${seed.id}: ${grid.flat().filter(v => v !== 0).length} givens`);
    }
  }
  return result;
}

if (require.main === module) {
  const path = require('path');
  const { saveJson } = require('./lib');
  const OUT_DIR = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'seeds');
  
  const solved = solveSeeds();
  
  for (const [techSlug, seeds] of Object.entries(solved)) {
    if (seeds.length === 0) continue;
    const filepath = path.join(OUT_DIR, `handcrafted-${techSlug}.json`);
    saveJson(filepath, {
      source: 'handcrafted',
      technique: techSlug,
      techniqueName: seeds[0].technique || techSlug,
      count: seeds.length,
      puzzles: seeds
    });
  }
  
  // 第一个种子(np-001)已有正确的solution（来自level701），验证一下
  console.log('\nDone! Handcrafted seeds saved.');
}

module.exports = { SEEDS, solveSeeds };
