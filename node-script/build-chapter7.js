// ==========================================
// 第7章「秘术档案」构建脚本
// 高级技巧教学章节：显性数对→隐性数对→三链数→X-Wing→Swordfish→大师试炼
// ==========================================

const fs = require('fs');
const path = require('path');
const { generateKillerSudoku, generateCages, generateSolution, generatePuzzle } = require('./seed-generator');
const { validateCages, printGrid, cloneGrid, solve } = require('./puzzle-builder');
const FACT = require('./puzzle-transformer');

// 生成6道高质量谜题
console.log('=== 生成第7章6道高级技巧教学谜题 ===\n');

// 为每关选择不同难度和种子
const levelConfigs = [
  { id: 701, technique: 'naked_pair', difficulty: 'medium', maxGivens: 38, minGivens: 32 },
  { id: 702, technique: 'hidden_pair', difficulty: 'medium', maxGivens: 36, minGivens: 30 },
  { id: 703, technique: 'naked_triple', difficulty: 'medium', maxGivens: 34, minGivens: 28 },
  { id: 704, technique: 'xwing', difficulty: 'hard', maxGivens: 33, minGivens: 27 },
  { id: 705, technique: 'swordfish', difficulty: 'hard', maxGivens: 31, minGivens: 25 },
  { id: 706, technique: 'master_challenge', difficulty: 'hard', maxGivens: 28, minGivens: 22 },
];

const puzzles = [];
for (const cfg of levelConfigs) {
  let best = null;
  for (let attempt = 0; attempt < 50; attempt++) {
    const p = generateKillerSudoku(cfg.difficulty);
    if (p) {
      const givens = p.boardData.flat().filter(v => v > 0).length;
      if (givens <= cfg.maxGivens && givens >= cfg.minGivens) {
        best = p;
        break;
      }
      // 记录最接近目标的
      if (!best) {
        best = p;
      } else {
        const bestGivens = best.boardData.flat().filter(v=>v>0).length;
        const target = (cfg.maxGivens + cfg.minGivens) / 2;
        if (Math.abs(givens - target) < Math.abs(bestGivens - target)) {
          best = p;
        }
      }
    }
  }
  if (best) {
    const givens = best.boardData.flat().filter(v => v > 0).length;
    console.log(`${cfg.id} (${cfg.technique}): ${givens} givens, ${best.cages.length} cages`);
    puzzles.push({ ...best, levelId: cfg.id, technique: cfg.technique });
  }
}

console.log(`\n成功生成 ${puzzles.length} 道谜题`);

// ==========================================
// 构建第7章完整数据
// ==========================================

const chapter7 = {
  chapterId: 7,
  title: "秘术档案",
  subtitle: "大师篇 · 高级技巧",
  icon: "🔮",
  color: "#a855f7",
  description: "守笼人在档案馆最深处发现了设局人留下的六卷秘术手稿，记载着从数对到X-Wing到剑鱼构型的高级推演术。掌握它们，你才能真正理解星辰梭的奥义。",
  badgeId: "badge_c7_master",
  badgeName: "秘术大师",
  unlockRequirement: 6,
  badge: {
    id: "badge_c7_master",
    name: "秘术大师",
    icon: "🔮",
    description: "掌握显性数对、隐性数对、三链数、X-Wing、剑鱼构型五大高级技巧，成为真正的数独秘术大师。"
  },
  introStory: [
    {
      type: "title",
      text: "第七章",
      subtitle: "秘术档案"
    },
    {
      speaker: "旁白",
      text: "终极笼局结束后，你成为了新任守笼人。在整理档案时，你发现了一个被层层封锁的暗格。"
    },
    {
      speaker: "阿岩",
      text: "哇！这是什么？上面写着「秘术档案——非星辰梭传人不得开启」！"
    },
    {
      speaker: "守笼人",
      text: "这是……他当年留下的最后一批手稿。我以为这些东西已经和他一起消失了。"
    },
    {
      speaker: "守笼人",
      text: "数对、三链数、X翼、剑鱼……这些是比星衡法则更高阶的推演术。能掌握它们的人，整个数独界也屈指可数。"
    },
    {
      speaker: "阿岩",
      text: "那我们岂不是第一批看到这些秘术的人？太酷了！快来看看第一卷写了什么！"
    }
  ],
  endingStory: [
    {
      speaker: "设局人（残影）",
      text: "……你终于看到这里了。"
    },
    {
      speaker: "你",
      text: "设局人……不，老师。"
    },
    {
      speaker: "设局人（残影）",
      text: "不必叫我老师。当你能看懂剑鱼构型的那一刻，你已经超越了我当年的水平。"
    },
    {
      speaker: "设局人（残影）",
      text: "但记住——技巧是死的，洞察是活的。星辰梭的真正奥义，从来不是某一种固定的构型，而是在混沌中看见秩序的眼睛。"
    },
    {
      speaker: "阿岩",
      text: "他消失了……但我感觉他一直在看着我们。"
    },
    {
      speaker: "守笼人",
      text: "档案馆的新时代开始了。走吧，新任守笼人——还有无数笼局等待你去破解。"
    }
  ],
  levels: []
};

// ==========================================
// 为每关配置教学内容
// ==========================================

const teachingContent = {
  701: {
    title: "第1关：数对之锁",
    teachingGoal: "学习显性数对（Naked Pair）：当同一区域两个格子恰好只能填入相同的两个数字时，这两个数字可以从该区域其他格子中排除。",
    preDialog: [
      {
        speaker: "守笼人",
        text: "第一卷：「数对之锁」。这是最基础的高阶技巧，也是一切后续推演的根基。"
      },
      {
        speaker: "守笼人",
        text: "仔细观察——当某一行、列或宫中，有两个格子恰好都只能填入相同的两个数字时，这两个格子就形成了一把「锁」。"
      },
      {
        speaker: "阿岩",
        text: "我明白了！比如两个格子都只能是3和7，那这两个格子一个填3一个填7，只是不知道哪个是哪个——但不管怎样，这一行的其他格子都不可能是3或7了！"
      },
      {
        speaker: "守笼人",
        text: "正是如此。这就是「显性数对」——它像一把锁，锁住了那两个数字，让你可以安全地从其他候选中排除它们。"
      }
    ],
    clearDialog: [
      {
        speaker: "阿岩",
        text: "太妙了！找到数对之后，排除掉那些不可能的数字，盘面一下子就清晰了！"
      },
      {
        speaker: "守笼人",
        text: "数对是所有高阶技巧的基础。掌握它，你就迈出了通往星辰梭的第一步。第二卷更加精妙——"
      }
    ],
    triggers: [
      {
        condition: "onLevelStart",
        type: "freeze_mask",
        highlight: "full",
        text: "提示：观察盘面中候选数恰好只有两个数字的格子对——它们就是「数对」。找到数对后，可以排除同行/列/宫中其他格子的这两个数字。",
        once: true
      },
      {
        condition: "onStuckForSeconds",
        seconds: 30,
        type: "popup_hint",
        position: "top",
        text: "💡 试试用候选数笔记标记每个空格的可能数字，数对会自然浮现。",
        delay: 500
      }
    ]
  },
  702: {
    title: "第2关：隐性之钥",
    teachingGoal: "学习隐性数对（Hidden Pair）：当两个数字在某区域内只能出现在相同的两个格子中时，这两个格子只可能是这两个数字，可以排除其他候选。",
    preDialog: [
      {
        speaker: "守笼人",
        text: "第二卷：「隐性之钥」。显性数对是两个格子被两个数字锁住，而隐性数对更加隐蔽——它藏在众多候选之中。"
      },
      {
        speaker: "守笼人",
        text: "想象一下：某个数字在一行中只能出现在两个格子里，另一个数字恰好也只能出现在这相同的两个格子里。"
      },
      {
        speaker: "阿岩",
        text: "也就是说，虽然这两个格子看起来有很多候选数，但实际上它们只能填这两个数字？"
      },
      {
        speaker: "守笼人",
        text: "没错！这就是「隐性数对」——这两个格子被那两个数字「暗中标定」了，格子里的其他候选都可以排除。"
      }
    ],
    clearDialog: [
      {
        speaker: "守笼人",
        text: "隐性数对比显性数对更难发现，但一旦找到，往往能打开局面。这就是「钥匙」的含义——它能打开看似无解的死局。"
      },
      {
        speaker: "阿岩",
        text: "原来如此！显性数对是「看格子排除数字」，隐性数对是「看数字锁定格子」！"
      }
    ],
    triggers: [
      {
        condition: "onLevelStart",
        type: "freeze_mask",
        highlight: "full",
        text: "提示：隐性数对不容易直接看到。尝试逐个数字检查——某个数字在该行/列/宫中只出现在两个位置？如果另一个数字也恰好只在这两个位置，那就是隐性数对！",
        once: true
      },
      {
        condition: "onStuckForSeconds",
        seconds: 35,
        type: "popup_hint",
        position: "top",
        text: "💡 隐性数对的关键：不是看格子有什么候选，而是看数字能去哪里。",
        delay: 500
      }
    ]
  },
  703: {
    title: "第3关：三链之阵",
    teachingGoal: "学习三链数（Naked Triple）：同一区域内三个格子恰好只包含3个不同数字的组合，可以排除该区域其他格子中的这3个数字。",
    preDialog: [
      {
        speaker: "守笼人",
        text: "第三卷：「三链之阵」。数对的概念可以扩展——两个数字两把锁，三个数字就是三链数。"
      },
      {
        speaker: "守笼人",
        text: "在同一区域中，如果三个格子合起来恰好只包含三个不同的数字（比如三个格子分别是{1,5}、{5,8}、{1,8}），那这三个数字就被这三个格子占据了。"
      },
      {
        speaker: "阿岩",
        text: "等等，不是每个格子都要有三个候选吗？像{1,5,8}、{1,5,8}、{1,5,8}那样？"
      },
      {
        speaker: "守笼人",
        text: "好问题！不需要。只要这三个格子合起来的候选总数恰好是3个就行——{1,5}、{5,8}、{1,8}也是三链数，因为1、5、8这三个数字必须填在这三个格子里。"
      }
    ],
    clearDialog: [
      {
        speaker: "守笼人",
        text: "三链数是数对的进阶。同理还有四链数（四个格子四个数字），但在实战中三链数已经足够应对大部分局面。"
      },
      {
        speaker: "阿岩",
        text: "数对和三链数都是「锁定排除」——锁住几个格子，排除其他位置。下一掌是什么？"
      }
    ],
    triggers: [
      {
        condition: "onLevelStart",
        type: "freeze_mask",
        highlight: "full",
        text: "提示：三链数的标志是三个格子，它们的候选数合起来恰好只有3个不同的数字。常见模式：{a,b},{b,c},{a,c} 或 {a,b,c},{a,b},{a,c} 等。",
        once: true
      },
      {
        condition: "onStuckForSeconds",
        seconds: 40,
        type: "popup_hint",
        position: "top",
        text: "💡 寻找三链数时，关注候选数较少的格子（2-3个候选），看看它们的「集合」是否恰好3个数字。",
        delay: 500
      }
    ]
  },
  704: {
    title: "第4关：X翼构型",
    teachingGoal: "学习X-Wing（X翼构型）：若某个数字在两行中都仅可能出现在相同的两列，则这两列其他位置可排除该数字。",
    preDialog: [
      {
        speaker: "守笼人",
        text: "第四卷：「X翼构型」。这是星辰梭的核心技巧之一，也是设局人当年最引以为傲的发现。"
      },
      {
        speaker: "守笼人",
        text: "假设数字7在第2行中只能出现在第3列和第7列，同时在第8行中也只能出现在第3列和第7列——"
      },
      {
        speaker: "阿岩",
        text: "这四个格子形成了一个矩形！像一个X的四个角！"
      },
      {
        speaker: "守笼人",
        text: "正是。无论7最终填在(2,3)+(8,7)还是(2,7)+(8,3)，第3列和第7列的其他位置都不可能再有7了。这就是X-Wing——矩形对角线，两种可能，排除一切。"
      },
      {
        speaker: "守笼人",
        text: "当年，我就是用X-Wing为基础，推演出了第一套星辰梭笼局模型。"
      }
    ],
    clearDialog: [
      {
        speaker: "阿岩",
        text: "太厉害了！X-Wing不像数对那样在一个区域里，它跨越了两行两列，像一个飞翔的翅膀！"
      },
      {
        speaker: "守笼人",
        text: "X-Wing之所以强大，是因为它跳出了单个行/列/宫的局限，看到了全局的矩形模式。而剑鱼构型——就是X-Wing的三维展开。"
      }
    ],
    triggers: [
      {
        condition: "onLevelStart",
        type: "freeze_mask",
        highlight: "full",
        text: "提示：寻找X-Wing的方法——逐数字检查：选一个数字，看它在每行中能去的位置。如果发现有两行，这个数字都只能去相同的两列，X-Wing就找到了！",
        once: true
      },
      {
        condition: "onStuckForSeconds",
        seconds: 45,
        type: "popup_hint",
        position: "top",
        text: "💡 X-Wing检查清单：①选一个数字 ②逐行标记该数字能填的位置 ③找两行共享相同两列 ④排除这两列其他位置。也可以从列出发找行。",
        delay: 500
      }
    ]
  },
  705: {
    title: "第5关：剑鱼构型",
    teachingGoal: "学习Swordfish（剑鱼构型）：X-Wing的三行三列推广——若某个数字在三行中都仅可能出现在相同的三列，则这些列其他位置可排除该数字。",
    preDialog: [
      {
        speaker: "守笼人",
        text: "第五卷：「剑鱼构型」。这是星辰梭最锋利的武器——X-Wing是两行两列的矩形，剑鱼则是三行三列的交错。"
      },
      {
        speaker: "守笼人",
        text: "如果一个数字在三行中，每行都只出现在2-3个位置，且这些位置恰好分布在相同的三列中——这三列就形成了剑鱼的「鱼鳍」。"
      },
      {
        speaker: "阿岩",
        text: "等等，每行不一定三个位置？像{2,5,8}、{2,5}、{5,8}这样也行吗？"
      },
      {
        speaker: "守笼人",
        text: "很好的问题。剑鱼允许每行只有2个候选——正如三链数不需要每个格子都有3个候选。关键是：这三行的候选位置合起来恰好覆盖三列，不多不少。"
      },
      {
        speaker: "守笼人",
        text: "剑鱼构型极其罕见，也极其强大。能在实战中发现剑鱼的人，已经是数独界的顶尖高手。"
      }
    ],
    clearDialog: [
      {
        speaker: "阿岩",
        text: "我终于看到了！三行三列交错排列，像一把剑鱼的骨架！这……这就是星辰梭的真正形态吗？"
      },
      {
        speaker: "守笼人",
        text: "剑鱼之上还有更强的构型（水母、彩色链等），但对于实战来说，掌握到剑鱼已经足以破解几乎所有杀手数独。最后一卷——是他留下的终极试炼。"
      }
    ],
    triggers: [
      {
        condition: "onLevelStart",
        type: "freeze_mask",
        highlight: "full",
        text: "提示：剑鱼是X-Wing的三行版。找法：选一个数字→看每行的候选位置→如果三行的候选恰好分布在三列中→排除这三列其他位置的该数字。",
        once: true
      },
      {
        condition: "onStuckForSeconds",
        seconds: 50,
        type: "popup_hint",
        position: "top",
        text: "💡 剑鱼比X-Wing更难找。建议用草稿纸逐行记录候选位置，寻找三行三列的覆盖模式。别灰心——这是最难的技巧之一！",
        delay: 500
      }
    ]
  },
  706: {
    title: "第6关：秘术大师",
    teachingGoal: "综合运用所有高级技巧（数对、三链数、X-Wing、剑鱼构型）破解设局人留下的终极秘术笼局。",
    preDialog: [
      {
        speaker: "设局人（残影）",
        text: "你来了。"
      },
      {
        speaker: "你",
        text: "这最后一卷……"
      },
      {
        speaker: "设局人（残影）",
        text: "这不是教学卷。这是我三十年前为自己设下的终极考验——一道需要同时运用数对、三链数、X-Wing和剑鱼才能解开的笼局。"
      },
      {
        speaker: "设局人（残影）",
        text: "我花了三天三夜才解开它。如果你能独立完成——你就不再是我的学生，而是与我并列的设局者。"
      },
      {
        speaker: "阿岩",
        text: "三天三夜？！这也太难了吧……"
      },
      {
        speaker: "设局人（残影）",
        text: "不必害怕。你已经掌握了所有武器。现在，让我看看——你是否配得上「秘术大师」的称号。"
      }
    ],
    clearDialog: [
      {
        speaker: "设局人（残影）",
        text: "……你做到了。"
      },
      {
        speaker: "设局人（残影）",
        text: "星辰梭的奥义，从来不是某一种构型、某一条规则。它是一种信念——在混沌的数字迷雾中，永远存在着秩序，等待被发现。"
      },
      {
        speaker: "设局人（残影）",
        text: "从今以后，你就是新的设局人。档案馆、星辰梭、还有这六卷秘术——都交给你了。"
      },
      {
        speaker: "阿岩",
        text: "他走了……但我觉得他很欣慰。"
      },
      {
        speaker: "守笼人",
        text: "恭喜你，秘术大师。七章全部完成。"
      }
    ],
    triggers: [
      {
        condition: "onLevelStart",
        type: "freeze_mask",
        highlight: "full",
        text: "终极试炼：这道题需要综合运用你学到的所有高级技巧。从简单技巧开始（显单→隐单→数对→三链数→X-Wing→剑鱼），一步步推进。不要急，仔细观察。",
        once: true
      },
      {
        condition: "onStuckForSeconds",
        seconds: 60,
        type: "popup_hint",
        position: "top",
        text: "💡 遇到瓶颈时，回头检查是否漏掉了数对或三链数。高级技巧往往藏在基础排除之后。",
        delay: 500
      }
    ]
  }
};

// 把谜题和教学内容组合成关卡
for (let i = 0; i < puzzles.length; i++) {
  const p = puzzles[i];
  const cfg = levelConfigs[i];
  const content = teachingContent[cfg.id];
  
  const level = {
    levelId: cfg.id,
    title: content.title,
    gridSize: 9,
    difficulty: cfg.id === 706 ? "困难" : (cfg.id <= 703 ? "中等" : "中等偏难"),
    teachingGoal: content.teachingGoal,
    features: {
      allowDraft: true,
      assistant45: true,
      showHints: true,
      perspectiveMode: true,
      highlightRow: true,
      highlightCol: true,
      highlightBox: true,
      highlightNumber: true,
      highlightCage: true
    },
    triggers: content.triggers,
    boardData: p.boardData,
    cages: p.cages,
    solution: p.solution,
    preDialog: content.preDialog,
    clearDialog: content.clearDialog,
    isBoss: cfg.id === 706
  };
  
  chapter7.levels.push(level);
}

// ==========================================
// 读取现有关卡数据，添加第7章
// ==========================================

const chaptersPath = path.join(__dirname, '..', 'game-src', 'data', 'chapters.json');
let chapters = JSON.parse(fs.readFileSync(chaptersPath, 'utf-8'));

// 检查是否已有第7章，如果有则替换
const existingIdx = chapters.findIndex(ch => ch.chapterId === 7);
if (existingIdx >= 0) {
  chapters[existingIdx] = chapter7;
  console.log('\n替换了已有的第7章');
} else {
  chapters.push(chapter7);
  console.log('\n添加了新的第7章');
}

fs.writeFileSync(chaptersPath, JSON.stringify(chapters, null, 2), 'utf-8');
console.log(`chapters.json已更新，共${chapters.length}章`);
console.log(`第7章包含${chapter7.levels.length}个关卡`);

// 同时保存种子题副本
const seedsPath = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'chapter7-seeds.json');
fs.writeFileSync(seedsPath, JSON.stringify(chapter7.levels.map(l => ({
  levelId: l.levelId,
  technique: l.teachingGoal,
  boardData: l.boardData,
  solution: l.solution,
  cages: l.cages
})), null, 2));
console.log(`种子题已保存到 ${seedsPath}`);

console.log('\n=== 第7章构建完成！===');
