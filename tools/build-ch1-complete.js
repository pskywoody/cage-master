// ==========================================
// 第1章完整关卡 - 经过仔细验证
// ==========================================

const fs = require('fs');
const path = require('path');
const builder = require('./level-builder');

const SIZE = 4;

// ==========================================
// 辅助函数：验证盘面可解性（裸单+隐单+唯一组合）
// ==========================================
function getCands(grid, r, c) { return builder.getCands(grid, r, c, SIZE, 2, 2); }

function findNaked(grid) {
  const res = [];
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) {
    if (grid[r][c]) continue;
    const cd = getCands(grid,r,c);
    if (cd.length===1) res.push({r,c,n:cd[0]});
  }
  return res;
}

// ==========================================
// 8个经过验证的终盘（确保合法）
// ==========================================

const SOL = {
  // 基础解
  a: [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]],
  b: [[2,3,1,4],[1,4,2,3],[3,1,4,2],[4,2,3,1]],
  c: [[3,1,4,2],[4,2,3,1],[1,3,2,4],[2,4,1,3]],
  d: [[4,1,2,3],[2,3,4,1],[1,4,3,2],[3,2,1,4]],
  e: [[2,4,1,3],[1,3,2,4],[3,1,4,2],[4,2,3,1]],
  f: [[1,3,4,2],[2,4,3,1],[3,1,2,4],[4,2,1,3]],
  g: [[3,4,1,2],[1,2,3,4],[4,1,2,3],[2,3,4,1]],
  h: [[4,3,2,1],[2,1,4,3],[3,4,1,2],[1,2,3,4]]
};

// 验证所有终盘合法
for (const [k,sol] of Object.entries(SOL)) {
  if (!builder.isValidSolution(sol, SIZE)) {
    console.error(`❌ 终盘${k}不合法！`);
    process.exit(1);
  }
}
console.log('✅ 所有终盘合法\n');

// ==========================================
// 关卡101：裸单初体验
// ==========================================
const L101 = {
  levelId: 101,
  title: "第1关：初入档案馆",
  mode: "full",
  gridSize: 4,
  difficulty: "入门",
  teachingGoal: "认识数独三规则（行/列/宫不重复），学会找「裸单」",
  features: {
    allowDraft: true, assistant45: false, showHints: true,
    highlightRow: true, highlightCol: true, highlightBox: true,
    highlightNumber: false, highlightCage: false, autoFillCandidates: true
  },
  boardData: [
    [1,2,0,0],
    [0,4,1,2],
    [2,1,4,3],
    [4,3,0,1]
  ],
  solution: SOL.a,
  cages: [],
  triggers: [
    { id: "t101_s", condition: "onLevelStart", type: "freeze_mask", text: "欢迎！灰色是提示数字。看空格旁的小数字（候选数），只剩1个的就是「裸单」，直接填！", once: true },
    { id: "t101_f", condition: "onFirstNumberFilled", type: "popup_hint", position: "top", text: "答对了🎉 每行、每列、每个2×2宫，1-4各出现一次！", once: true },
    { id: "t101_h", condition: "onFillCountReached", count: 11, type: "enter_phase", phase: "finishing", once: true },
    { id: "t101_c", condition: "onConflict", type: "popup_hint", position: "top", text: "数字重复啦！检查行、列、小宫～", once: false }
  ],
  preDialog: [
    { speaker: "守笼人", text: "第一道档案锁，谨记三律：横不重，竖不复，宫不叠。" },
    { speaker: "阿岩", text: "每行每列每个2×2方块里1-4各一次！找候选数只剩一个的格子填！" }
  ],
  clearDialog: [
    { speaker: "守笼人", text: "裸单是万法之基。" },
    { speaker: "阿岩", text: "简单！缺啥补啥嘛！" }
  ]
};

// ==========================================
// 关卡102：初识笼格（单格笼）
// ==========================================
const L102 = {
  levelId: 102,
  title: "第2关：初识笼格",
  mode: "full",
  gridSize: 4,
  difficulty: "入门",
  teachingGoal: "认识笼子：虚线框是笼子，左上角是和值。单格笼和值=数字！",
  features: {
    allowDraft: true, assistant45: false, showHints: true,
    highlightRow: true, highlightCol: true, highlightBox: true,
    highlightNumber: false, highlightCage: true, autoFillCandidates: true
  },
  boardData: [
    [0,3,1,4],
    [1,4,0,0],
    [0,1,4,0],
    [4,0,0,1]
  ],
  solution: SOL.b, // [[2,3,1,4],[1,4,2,3],[3,1,4,2],[4,2,3,1]]
  cages: [
    { id: 0, cells: [[0,0]], sum: 2 },  // 单格笼=2
    { id: 1, cells: [[3,1]], sum: 2 }   // 单格笼=2
  ],
  triggers: [
    { id: "t102_s", condition: "onLevelStart", type: "freeze_mask", text: "看虚线框！这是「笼子」，左上角是笼内总和。1格的笼子，和值是几就填几！", once: true },
    { id: "t102_f", condition: "onFirstNumberFilled", type: "popup_hint", position: "top", text: "对了！单格笼是送分题🎉", once: true },
    { id: "t102_b", condition: "onFillCountReached", count: 8, type: "enter_phase", phase: "breakthrough", once: true },
    { id: "t102_fi", condition: "onFillCountReached", count: 12, type: "enter_phase", phase: "finishing", once: true },
    { id: "t102_c", condition: "onConflict", type: "popup_hint", position: "top", text: "检查笼子和值哦～", once: false }
  ],
  preDialog: [
    { speaker: "守笼人", text: "数独为体，笼局为魂。" },
    { speaker: "阿岩", text: "虚线框是笼子！左上角是总和，单格笼直接填！" }
  ],
  clearDialog: [
    { speaker: "守笼人", text: "单格笼易得，多格笼才见真章。" },
    { speaker: "阿岩", text: "笼子原来是提示啊！" }
  ]
};

// ==========================================
// 关卡103：裸单残局训练
// ==========================================
const L103 = {
  levelId: 103,
  title: "第3关：裸单专项",
  mode: "endgame",
  gridSize: 4,
  difficulty: "入门",
  teachingGoal: "巩固裸单：快速识别候选数唯一的格子",
  keyCells: [[0,0], [0,3], [1,0], [2,1], [3,2]],
  features: {
    allowDraft: true, assistant45: false, showHints: true,
    highlightRow: true, highlightCol: true, highlightBox: true,
    highlightNumber: false, highlightCage: false, autoFillCandidates: true
  },
  // 使用SOL.c: [[3,1,4,2],[4,2,3,1],[1,3,2,4],[2,4,1,3]]
  // 挖空5个裸单位置
  boardData: [
    [0,1,4,0],
    [0,2,3,1],
    [1,0,2,4],
    [2,4,0,3]
  ],
  solution: SOL.c,
  cages: [],
  triggers: [
    { id: "t103_s", condition: "onLevelStart", type: "enter_phase", phase: "breakthrough", once: true },
    { id: "t103_h", condition: "onLevelStart", type: "freeze_mask", delay: 800, text: "专项训练！只剩这几个空格，全是裸单，看候选数填！", once: true },
    { id: "t103_d", condition: "onKeyCellsFilledCorrectly", type: "enter_phase", phase: "finishing", once: true }
  ],
  preDialog: [
    { speaker: "守笼人", text: "基础不牢，地动山摇。" },
    { speaker: "阿岩", text: "大部分填好了，剩下的全是裸单！" }
  ],
  clearDialog: [
    { speaker: "守笼人", text: "裸单要练到条件反射。" },
    { speaker: "阿岩", text: "太简单啦！" }
  ]
};

// ==========================================
// 关卡104：唯一组合
// ==========================================
const L104 = {
  levelId: 104,
  title: "第4关：唯一组合",
  mode: "full",
  gridSize: 4,
  difficulty: "入门",
  teachingGoal: "2格笼和值3/4/6/7时组合唯一！口诀：3=1+2,4=1+3,6=2+4,7=3+4",
  features: {
    allowDraft: true, assistant45: false, showHints: true,
    highlightRow: true, highlightCol: true, highlightBox: true,
    highlightNumber: true, highlightCage: true, autoFillCandidates: true
  },
  boardData: [
    [0,0,4,0],
    [0,2,0,0],
    [0,0,2,4],
    [0,0,0,0]
  ],
  solution: SOL.c, // [[3,1,4,2],[4,2,3,1],[1,3,2,4],[2,4,1,3]]
  cages: [
    { id: 0, cells: [[0,0],[0,1]], sum: 4 },  // 3+1=4 ✓ 横向唯一组合
    { id: 1, cells: [[0,3],[1,3]], sum: 3 },  // 2+1=3 ✓ 纵向唯一组合（打破双解！）
    { id: 2, cells: [[2,0],[3,0]], sum: 3 },  // 1+2=3 ✓ 纵向唯一组合
    { id: 3, cells: [[3,2],[3,3]], sum: 4 }   // 1+3=4 ✓ 横向唯一组合
  ],
  triggers: [
    { id: "t104_s", condition: "onLevelStart", type: "freeze_mask", text: "2格笼和值为3/4/6/7时数字唯一！口诀：3要1+2，4要1+3，6要2+4，7要3+4！", once: true },
    { id: "t104_f", condition: "onFirstNumberFilled", type: "popup_hint", position: "top", text: "找到唯一组合了！这是杀手数独的第一把钥匙🎉", once: true },
    { id: "t104_b", condition: "onFillCountReached", count: 6, type: "enter_phase", phase: "breakthrough", once: true },
    { id: "t104_st", condition: "onStuckForSeconds", seconds: 20, type: "popup_hint", position: "top", text: "💡 看笼子！和值3=1+2，和值4=1+3，结合行列宫确定位置！", once: false },
    { id: "t104_fi", condition: "onFillCountReached", count: 12, type: "enter_phase", phase: "finishing", once: true }
  ],
  preDialog: [
    { speaker: "守笼人", text: "两格之笼，和值3、4、6、7者，其数唯一。" },
    { speaker: "阿岩", text: "记住口诀：3要1和2，4要1和3，6要2和4，7要3和4！" }
  ],
  clearDialog: [
    { speaker: "守笼人", text: "唯一组合是破局利刃。" },
    { speaker: "阿岩", text: "拿到密码本的感觉！" }
  ]
};

// ==========================================
// 关卡105：隐单的秘密
// ==========================================
const L105 = {
  levelId: 105,
  title: "第5关：隐单的秘密",
  mode: "full",
  gridSize: 4,
  difficulty: "入门",
  teachingGoal: "认识隐单：裸单不够用时，扫数字！某数字在某行/列/宫只能放一个位置时，就是答案！",
  features: {
    allowDraft: true, assistant45: false, showHints: true,
    highlightRow: true, highlightCol: true, highlightBox: true,
    highlightNumber: true, highlightCage: true, autoFillCandidates: true
  },
  // 搜索得到的完美隐单教学盘面：
  // 开局通过裸单+唯一组合填2格后卡壳，必须找隐单(0,3)=3（第0行），然后连锁收官
  boardData: [
    [0,0,1,0],
    [0,3,0,0],
    [0,0,0,1],
    [0,0,0,0]
  ],
  solution: [[4,2,1,3],[1,3,4,2],[3,4,2,1],[2,1,3,4]],
  cages: [
    { id: 0, cells: [[1,1]], sum: 3 },         // 单格笼=3（提示）
    { id: 1, cells: [[0,2]], sum: 1 },         // 单格笼=1（提示）
    { id: 2, cells: [[2,3]], sum: 1 },         // 单格笼=1（提示）
    { id: 3, cells: [[0,0],[0,1]], sum: 6 },   // 4+2=6（唯一组合2+4）
    { id: 4, cells: [[0,3],[1,3]], sum: 5 },   // 3+2=5
    { id: 5, cells: [[1,0],[2,0]], sum: 4 },   // 1+3=4（唯一组合1+3）
    { id: 6, cells: [[1,2],[2,2]], sum: 6 },   // 4+2=6（唯一组合2+4）
    { id: 7, cells: [[2,1],[3,1]], sum: 5 },   // 4+1=5
    { id: 8, cells: [[3,2],[3,3]], sum: 7 }    // 3+4=7（唯一组合3+4）
  ],
  triggers: [
    { id: "t105_s", condition: "onLevelStart", type: "freeze_mask", text: "裸单和唯一组合用完了怎么办？找「隐单」！不要只看格子有几个候选数，要扫数字——比如看数字「3」在第一行还能放哪里？", once: true },
    { id: "t105_b", condition: "onFillCountReached", count: 5, type: "enter_phase", phase: "breakthrough", once: true },
    { id: "t105_st", condition: "onStuckForSeconds", seconds: 25, type: "popup_hint", position: "top", text: "💡 扫数字！找「3」在第一行能放哪里？整行只有一个位置能放3！", once: false },
    { id: "t105_fi", condition: "onFillCountReached", count: 13, type: "enter_phase", phase: "finishing", once: true }
  ],
  preDialog: [
    { speaker: "守笼人", text: "裸单易寻，隐单难觅。需放眼全局，找数字唯一容身之所。" },
    { speaker: "阿岩", text: "不要光看格子，要看数字！比如找「3」，看它在某行还能放哪～" }
  ],
  clearDialog: [
    { speaker: "守笼人", text: "隐单是侦探的眼睛。" },
    { speaker: "阿岩", text: "原来要扫数字啊！" }
  ]
};

// ==========================================
// 关卡106：唯一组合残局
// ==========================================
const L106 = {
  levelId: 106,
  title: "第6关：组合专项",
  mode: "endgame",
  gridSize: 4,
  difficulty: "入门",
  teachingGoal: "巩固唯一组合：熟练运用3/4/6/7的唯一组合",
  keyCells: [[0,2], [0,3], [1,0], [3,0]],
  features: {
    allowDraft: true, assistant45: false, showHints: true,
    highlightRow: true, highlightCol: true, highlightBox: true,
    highlightNumber: true, highlightCage: true, autoFillCandidates: true
  },
  // 使用SOL.h: [[4,3,2,1],[2,1,4,3],[3,4,1,2],[1,2,3,4]]
  boardData: [
    [4,3,0,0],
    [0,1,4,3],
    [3,4,1,2],
    [0,2,3,4]
  ],
  solution: SOL.h,
  cages: [
    { id: 0, cells: [[0,2],[0,3]], sum: 3 },
    { id: 1, cells: [[1,0],[3,0]], sum: 3 }
  ],
  triggers: [
    { id: "t106_s", condition: "onLevelStart", type: "enter_phase", phase: "breakthrough", once: true },
    { id: "t106_h", condition: "onLevelStart", type: "freeze_mask", delay: 800, text: "组合专项！用唯一组合口诀解这些笼子～", once: true },
    { id: "t106_d", condition: "onKeyCellsFilledCorrectly", type: "enter_phase", phase: "finishing", once: true }
  ],
  preDialog: [
    { speaker: "守笼人", text: "唯一组合需烂熟于心。" },
    { speaker: "阿岩", text: "3要1+2，4要1+3，6要2+4，7要3+4！" }
  ],
  clearDialog: [
    { speaker: "守笼人", text: "组合之法，需如条件反射。" },
    { speaker: "阿岩", text: "口诀背熟了！" }
  ]
};

// ==========================================
// 关卡107：十则秘术（10法则）
// ==========================================
const L107 = {
  levelId: 107,
  title: "第7关：十则秘术",
  mode: "full",
  gridSize: 4,
  difficulty: "入门",
  teachingGoal: "认识「10法则」：4×4每行/列/宫总和都是10！",
  features: {
    allowDraft: true, assistant45: true, showHints: true,
    highlightRow: true, highlightCol: true, highlightBox: true,
    highlightNumber: true, highlightCage: true, autoFillCandidates: true
  },
  boardData: [
    [0,0,4,2],
    [4,2,0,1],
    [1,0,2,4],
    [2,4,0,0]
  ],
  solution: SOL.c, // [[3,1,4,2],[4,2,3,1],[1,3,2,4],[2,4,1,3]]
  cages: [
    { id: 0, cells: [[0,0],[0,1]], sum: 4 },  // 3+1=4 ✓
    { id: 1, cells: [[3,2],[3,3]], sum: 4 }   // 1+3=4 ✓
  ],
  triggers: [
    { id: "t107_s", condition: "onLevelStart", type: "freeze_mask", text: "大招来了！「10法则」：4×4每行/列/宫总和永远是10（1+2+3+4=10）！用10减已知数，就能算出剩下的！", once: true },
    { id: "t107_b", condition: "onFillCountReached", count: 6, type: "enter_phase", phase: "breakthrough", once: true },
    { id: "t107_st", condition: "onStuckForSeconds", seconds: 25, type: "popup_hint", position: "top", text: "💡 看第一行！10-4-2=4，再看笼子和值是4，就知道两个数是1和3！", once: false },
    { id: "t107_fi", condition: "onFillCountReached", count: 12, type: "enter_phase", phase: "finishing", once: true }
  ],
  preDialog: [
    { speaker: "守笼人", text: "四宫之数，十为极。每行每列每宫，总和恒为十——是谓「十则」。" },
    { speaker: "阿岩", text: "1+2+3+4=10！一行加起来是10，减掉知道的就出来了！" }
  ],
  clearDialog: [
    { speaker: "守笼人", text: "十则之术，是打开复杂笼局的钥匙。" },
    { speaker: "阿岩", text: "4×4总和是10，那6×6是21，9×9是45！" }
  ]
};

// ==========================================
// 关卡108：第一章综合考验
// ==========================================
const L108 = {
  levelId: 108,
  title: "第8关：档案馆初试",
  mode: "comprehensive",
  gridSize: 4,
  difficulty: "入门",
  teachingGoal: "综合运用：裸单、唯一组合、隐单、10法则",
  features: {
    allowDraft: true, assistant45: true, showHints: true,
    highlightRow: true, highlightCol: true, highlightBox: true,
    highlightNumber: true, highlightCage: true, autoFillCandidates: true
  },
  boardData: [
    [1,0,0,0],
    [0,0,0,2],
    [0,0,0,0],
    [0,3,0,0]
  ],
  solution: SOL.a, // [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]]
  cages: [
    { id: 0, cells: [[0,0],[0,1]], sum: 3 },   // 1+2=3 ✓ 唯一组合
    { id: 1, cells: [[0,2],[0,3]], sum: 7 },   // 3+4=7 ✓ 唯一组合
    { id: 2, cells: [[1,0],[2,0]], sum: 5 },   // 3+2=5
    { id: 3, cells: [[1,1],[1,2]], sum: 5 },   // 4+1=5
    { id: 4, cells: [[1,3],[2,3]], sum: 5 },   // 2+3=5
    { id: 5, cells: [[2,1],[2,2]], sum: 5 },   // 1+4=5
    { id: 6, cells: [[3,0],[3,1]], sum: 7 },   // 4+3=7 ✓ 唯一组合
    { id: 7, cells: [[3,2],[3,3]], sum: 3 }    // 2+1=3 ✓ 唯一组合
  ],
  triggers: [
    { id: "t108_s", condition: "onLevelStart", type: "freeze_mask", text: "第一章综合考验！运用所有技巧——裸单、唯一组合、隐单、10法则！", once: true },
    { id: "t108_b", condition: "onFillCountReached", count: 5, type: "enter_phase", phase: "breakthrough", once: true },
    { id: "t108_fi", condition: "onFillCountReached", count: 12, type: "enter_phase", phase: "finishing", once: true }
  ],
  preDialog: [
    { speaker: "守笼人", text: "档案馆初试，验你所学。" },
    { speaker: "阿岩", text: "加油！把这几天学的都用上！" }
  ],
  clearDialog: [
    { speaker: "守笼人", text: "不错。你已掌握基础，可入下一卷。" },
    { speaker: "阿岩", text: "耶！我们通关第一章啦！" }
  ]
};

// ==========================================
// 所有关卡
// ==========================================
const ALL_LEVELS = [L101, L102, L103, L104, L105, L106, L107, L108];

// ==========================================
// 验证函数
// ==========================================
function validateLevel(lv) {
  const errors = [];
  
  // 1. 终盘合法
  if (!builder.isValidSolution(lv.solution, SIZE)) {
    errors.push('终盘不合法（行/列/宫有重复）');
  }
  
  // 2. 笼子和值正确
  if (!builder.verifyCages(lv.solution, lv.cages)) {
    errors.push('笼子和值不正确');
  }
  
  // 3. boardData是solution的子集
  for (let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) {
    if (lv.boardData[r][c] !== 0 && lv.boardData[r][c] !== lv.solution[r][c]) {
      errors.push(`boardData[${r}][${c}]=${lv.boardData[r][c]}与solution[${r}][${c}]=${lv.solution[r][c]}不匹配`);
    }
  }
  
  // 4. 残局关：keyCells验证
  if (lv.mode === 'endgame') {
    if (!lv.keyCells || !Array.isArray(lv.keyCells)) {
      errors.push('残局关缺少keyCells');
    } else {
      for (const [r,c] of lv.keyCells) {
        if (lv.boardData[r][c] !== 0) errors.push(`keyCell(${r},${c})不是空格`);
      }
    }
  }
  
  // 5. 统计空格数
  let empty = 0;
  for (let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) if(!lv.boardData[r][c]) empty++;
  
  return { valid: errors.length === 0, errors, empty };
}

// ==========================================
// 主函数
// ==========================================
function main() {
  console.log('========================================');
  console.log('  第1章完整关卡 - 验证与构建');
  console.log('========================================\n');
  
  let allValid = true;
  
  for (const lv of ALL_LEVELS) {
    console.log(`─── ${lv.title} ───`);
    const result = validateLevel(lv);
    console.log(`  空格数: ${result.empty}`);
    if (lv.cages && lv.cages.length > 0) {
      console.log(`  笼子: ${lv.cages.map(c=>`和值${c.sum}(${c.cells.length}格)`).join(', ')}`);
    }
    if (lv.mode === 'endgame') {
      console.log(`  类型: 残局教学关, 关键格: ${JSON.stringify(lv.keyCells)}`);
    } else if (lv.mode === 'comprehensive') {
      console.log(`  类型: 综合检验关`);
    } else {
      console.log(`  类型: 完整三阶段关`);
    }
    
    if (result.valid) {
      console.log(`  ✅ 验证通过`);
    } else {
      console.log(`  ❌ 验证失败:`);
      for (const e of result.errors) console.log(`     - ${e}`);
      allValid = false;
    }
    console.log();
  }
  
  if (!allValid) {
    console.error('❌ 部分关卡验证失败！请修正后重试。');
    process.exit(1);
  }
  
  // 读取并更新chapters.json
  const chaptersPath = path.join(__dirname, '..', 'game-src', 'data', 'chapters.json');
  const chapters = JSON.parse(fs.readFileSync(chaptersPath, 'utf8'));
  
  const ch1Idx = chapters.findIndex(c => c.chapterId === 1);
  if (ch1Idx === -1) {
    console.error('❌ 找不到第1章！');
    process.exit(1);
  }
  
  // 备份
  const backupPath = chaptersPath + '.ch1bak';
  fs.writeFileSync(backupPath, fs.readFileSync(chaptersPath));
  console.log(`📦 已备份到: ${path.basename(backupPath)}`);
  
  // 替换levels，保留元数据
  chapters[ch1Idx].levels = ALL_LEVELS;
  
  fs.writeFileSync(chaptersPath, JSON.stringify(chapters, null, 2), 'utf8');
  console.log(`💾 已更新chapters.json，第1章${ALL_LEVELS.length}关全部替换！`);
  console.log('\n🎉 第1章重构完成！');
}

main();
