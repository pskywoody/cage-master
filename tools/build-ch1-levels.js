// ==========================================
// 第1章关卡构造器 - 手工设计的教学盘面
// ==========================================

const fs = require('fs');
const path = require('path');
const builder = require('./level-builder');

const SIZE = 4;

// ==========================================
// 关卡101：裸单初体验
// 纯裸单连锁，一路爽填建立信心
// ==========================================
const level101 = {
  levelId: 101,
  title: "第1关：初入档案馆",
  mode: "full",
  gridSize: 4,
  difficulty: "入门",
  teachingGoal: "认识数独规则：每行、每列、每个2×2宫，1-4不重复。学会找「裸单」——候选数只有1个的格子",
  features: {
    allowDraft: true,
    assistant45: false,
    showHints: true,
    perspectiveMode: false,
    highlightRow: true,
    highlightCol: true,
    highlightBox: true,
    highlightNumber: false,
    highlightCage: false,
    autoFillCandidates: true
  },
  boardData: [
    [1, 2, 0, 0],
    [0, 4, 1, 2],
    [2, 1, 4, 3],
    [4, 3, 0, 1]
  ],
  solution: [
    [1, 2, 3, 4],
    [3, 4, 1, 2],
    [2, 1, 4, 3],
    [4, 3, 2, 1]
  ],
  cages: [],
  triggers: [
    {
      id: "t101_start",
      condition: "onLevelStart",
      type: "freeze_mask",
      text: "欢迎来到杀手数独！灰色数字是已填好的提示。仔细看——每个空格旁边都有小数字（候选数），如果候选数只剩1个，直接填！这就是「裸单」。",
      once: true
    },
    {
      id: "t101_first_fill",
      condition: "onFirstNumberFilled",
      type: "popup_hint",
      position: "top",
      text: "太棒了！第一个数字填对了🎉 记住：每行、每列、每个2×2小方格里，1-4每个数字只能出现一次！",
      once: true
    },
    {
      id: "t101_third_fill",
      condition: "onFillCountReached",
      count: 3,
      type: "popup_hint",
      position: "top",
      text: "继续找候选数只有1个的格子，一个一个填～",
      once: true
    },
    {
      id: "t101_half",
      condition: "onFillCountReached",
      count: 11,
      type: "enter_phase",
      phase: "finishing",
      once: true
    },
    {
      id: "t101_conflict",
      condition: "onConflict",
      type: "popup_hint",
      position: "top",
      text: "哎呀，这个数字在同一行/列/宫里已经有啦，换一个试试？",
      once: false
    }
  ],
  preDialog: [
    { speaker: "守笼人", text: "档案馆第一道档案锁，谨记三条铁律：横不可重，竖不可复，宫不可叠。" },
    { speaker: "阿岩", text: "翻译：每行、每列、每个2×2小方块里，1、2、3、4各出现一次！先找候选数只剩一个的格子填就行～" }
  ],
  clearDialog: [
    { speaker: "守笼人", text: "很好。「裸单」是万法之基——再复杂的盘面，最终都要靠裸单收尾。" },
    { speaker: "阿岩", text: "原来这么简单！就是「缺啥补啥」嘛！" }
  ]
};

// ==========================================
// 关卡102：初识笼格
// 引入单格笼（和值=格子数字，直接提示）
// ==========================================
const level102 = {
  levelId: 102,
  title: "第2关：初识笼格",
  mode: "full",
  gridSize: 4,
  difficulty: "入门",
  teachingGoal: "认识「笼子」：虚线围起来的格子叫笼子，左上角数字是笼内数字之和。单格笼的和值就是格子里的数字！",
  features: {
    allowDraft: true,
    assistant45: false,
    showHints: true,
    perspectiveMode: false,
    highlightRow: true,
    highlightCol: true,
    highlightBox: true,
    highlightNumber: false,
    highlightCage: true,
    autoFillCandidates: true
  },
  boardData: [
    [1, 2, 0, 0],
    [0, 4, 1, 2],
    [2, 1, 4, 3],
    [4, 3, 0, 1]
  ],
  solution: [
    [1, 2, 3, 4],
    [3, 4, 1, 2],
    [2, 1, 4, 3],
    [4, 3, 2, 1]
  ],
  cages: [
    { id: 0, cells: [[1,0]], sum: 3 },
    { id: 1, cells: [[3,2]], sum: 2 }
  ],
  triggers: [
    {
      id: "t102_start",
      condition: "onLevelStart",
      type: "freeze_mask",
      text: "看到那些虚线围起来的格子了吗？这就是「笼子」！左上角的小数字是笼内数字之和。只有1格的笼子，和值就是那个数字——直接填！",
      once: true
    },
    {
      id: "t102_first_cage",
      condition: "onFirstNumberFilled",
      type: "popup_hint",
      position: "top",
      text: "对了！单格笼最直接，和值是几就填几🎉 这是杀手数独独有的提示哦！",
      once: true
    },
    {
      id: "t102_half",
      condition: "onFillCountReached",
      count: 10,
      type: "enter_phase",
      phase: "finishing",
      once: true
    },
    {
      id: "t102_conflict",
      condition: "onConflict",
      type: "popup_hint",
      position: "top",
      text: "注意笼子的和值哦！填错了加起来不对～",
      once: false
    }
  ],
  preDialog: [
    { speaker: "守笼人", text: "数独为体，笼局为魂。这一卷，你将见到杀手数独的核心——「笼格」。" },
    { speaker: "阿岩", text: "就是那些虚线框！左上角的数字是笼里数字的总和。只有一个格子的笼子最简单，是几就填几！" }
  ],
  clearDialog: [
    { speaker: "守笼人", text: "单格笼是送分题，但多格笼才见真章。" },
    { speaker: "阿岩", text: "原来笼子是提示啊！我还以为是障碍呢～" }
  ]
};

// ==========================================
// 关卡103：裸单残局训练
// ==========================================
const level103 = {
  levelId: 103,
  title: "第3关：裸单专项训练",
  mode: "endgame",
  gridSize: 4,
  difficulty: "入门",
  teachingGoal: "巩固裸单：快速识别候选数只有1个的格子",
  keyCells: [[0,2], [0,3], [1,0]],
  features: {
    allowDraft: true,
    assistant45: false,
    showHints: true,
    perspectiveMode: false,
    highlightRow: true,
    highlightCol: true,
    highlightBox: true,
    highlightNumber: false,
    highlightCage: false,
    autoFillCandidates: true
  },
  boardData: [
    [1, 2, 0, 0],
    [0, 4, 1, 2],
    [2, 1, 4, 3],
    [4, 3, 2, 1]
  ],
  solution: [
    [1, 2, 3, 4],
    [3, 4, 1, 2],
    [2, 1, 4, 3],
    [4, 3, 2, 1]
  ],
  cages: [],
  triggers: [
    {
      id: "t103_start",
      condition: "onLevelStart",
      type: "enter_phase",
      phase: "breakthrough",
      once: true
    },
    {
      id: "t103_highlight",
      condition: "onLevelStart",
      type: "freeze_mask",
      text: "专项训练！只剩这3个空格了，它们全是裸单——看候选数，直接填！",
      delay: 800,
      once: true
    },
    {
      id: "t103_complete",
      condition: "onKeyCellsFilledCorrectly",
      type: "enter_phase",
      phase: "finishing",
      once: true
    }
  ],
  preDialog: [
    { speaker: "守笼人", text: "基础不牢，地动山摇。来做一组裸单专项。" },
    { speaker: "阿岩", text: "这关超简单！大部分都填好了，剩下的全是裸单，看小数字直接填～" }
  ],
  clearDialog: [
    { speaker: "守笼人", text: "裸单是肌肉记忆，要练到条件反射。" },
    { speaker: "阿岩", text: "嘿嘿，我已经能一秒找到裸单了！" }
  ]
};

// ==========================================
// 关卡104：唯一组合
// 2格笼和值唯一组合：3=1+2, 4=1+3, 6=2+4, 7=3+4
// ==========================================
const level104 = {
  levelId: 104,
  title: "第4关：唯一组合",
  mode: "full",
  gridSize: 4,
  difficulty: "入门",
  teachingGoal: "认识「唯一组合」：2格笼的和值如果是3、4、6、7，里面的两个数字是确定的！",
  features: {
    allowDraft: true,
    assistant45: false,
    showHints: true,
    perspectiveMode: false,
    highlightRow: true,
    highlightCol: true,
    highlightBox: true,
    highlightNumber: true,
    highlightCage: true,
    autoFillCandidates: true
  },
  boardData: [
    [0, 0, 4, 0],
    [0, 2, 0, 0],
    [0, 0, 2, 4],
    [0, 0, 0, 0]
  ],
  solution: [
    [3, 1, 4, 2],
    [4, 2, 3, 1],
    [1, 3, 2, 4],
    [2, 4, 1, 3]
  ],
  cages: [
    { id: 0, cells: [[0,0], [0,1]], sum: 4 },  // 3+1=4
    { id: 1, cells: [[1,2], [1,3]], sum: 4 },  // 3+1=4
    { id: 2, cells: [[2,0], [3,0]], sum: 3 },  // 1+2=3
    { id: 3, cells: [[3,2], [3,3]], sum: 4 }   // 1+3=4
  ],
  triggers: [
    {
      id: "t104_start",
      condition: "onLevelStart",
      type: "freeze_mask",
      text: "2格笼的和值如果是3、4、6、7，那两个数字是确定的！这叫「唯一组合」。口诀：3要1和2，4要1和3，6要2和4，7要3和4！",
      once: true
    },
    {
      id: "t104_first_combo",
      condition: "onFirstNumberFilled",
      type: "popup_hint",
      position: "top",
      text: "太棒了！唯一组合是杀手数独的第一把钥匙——看到和值就知道里面是什么数字🎉",
      once: true
    },
    {
      id: "t104_opening_done",
      condition: "onFillCountReached",
      count: 6,
      type: "enter_phase",
      phase: "breakthrough",
      once: true
    },
    {
      id: "t104_stuck",
      condition: "onStuckForSeconds",
      seconds: 20,
      type: "popup_hint",
      position: "top",
      text: "💡 看看笼子！和值3只能是1+2，和值4只能是1+3——结合行/列/宫排除，确定哪个格放哪个数！",
      once: false
    },
    {
      id: "t104_finishing",
      condition: "onFillCountReached",
      count: 12,
      type: "enter_phase",
      phase: "finishing",
      once: true
    },
    {
      id: "t104_conflict",
      condition: "onConflict",
      type: "popup_hint",
      position: "top",
      text: "加起来不对哦！再看看笼子的和值和唯一组合～",
      once: false
    }
  ],
  preDialog: [
    { speaker: "守笼人", text: "笼之妙，在于「和值」。两格之笼，和值为3、4、6、7者，其数唯一。" },
    { speaker: "阿岩", text: "记住口诀：3要1和2，4要1和3，6要2和4，7要3和4！看到这几个和值，直接锁定两个数字！" }
  ],
  clearDialog: [
    { speaker: "守笼人", text: "唯一组合是破局的利刃——看到笼子先算和值，是杀手数独的第一直觉。" },
    { speaker: "阿岩", text: "原来笼子这么有用！感觉像拿到了密码本～" }
  ]
};

// ==========================================
// 主函数
// ==========================================
function main() {
  console.log('========================================');
  console.log('  第1章关卡构造器（手工设计教学盘面）');
  console.log('========================================\n');
  
  const levels = [level101, level102, level103, level104];
  
  // 验证每一关
  console.log('🔍 验证关卡...\n');
  let allValid = true;
  for (const lv of levels) {
    console.log(`─── ${lv.title} ───`);
    builder.printGrid(lv.boardData, SIZE);
    console.log(`教学目标：${lv.teachingGoal}`);
    if (lv.cages && lv.cages.length > 0) {
      console.log(`笼子：${lv.cages.map(c => `和值${c.sum}(${c.cells.length}格)`).join(', ')}`);
    }
    if (lv.mode === 'endgame') {
      console.log(`类型：残局教学关，关键格：${JSON.stringify(lv.keyCells)}`);
    }
    
    const valid = builder.isValidSolution(lv.solution, SIZE);
    const cagesOk = builder.verifyCages(lv.solution, lv.cages);
    console.log(`  ✅ 终盘合法: ${valid}`);
    console.log(`  ✅ 笼子和值正确: ${cagesOk}`);
    if (!valid || !cagesOk) allValid = false;
    console.log();
  }
  
  if (!allValid) {
    console.error('❌ 部分关卡验证失败！');
    process.exit(1);
  }
  
  // 保存
  const outPath = path.join(__dirname, '..', 'game-src', 'data', 'ch1-levels-partial.json');
  fs.writeFileSync(outPath, JSON.stringify(levels, null, 2), 'utf8');
  console.log(`💾 已保存前4关到: ${outPath}`);
  console.log('\n✅ 前4关构建完成！');
}

main();
