// 把第100关添加到chapters.json
const fs = require('fs');
const path = require('path');

const chaptersPath = path.join(__dirname, '..', 'game-src', 'data', 'chapters.json');
const chapters = JSON.parse(fs.readFileSync(chaptersPath, 'utf8'));

// 第100关配置
const L100 = {
  "levelId": 100,
  "title": "第0关：规则初探",
  "mode": "full",
  "gridSize": 4,
  "difficulty": "入门",
  "teachingGoal": "数独三大铁律：每行、每列、每个2×2宫，数字1-4只能出现一次！找唯一能填的数字。",
  "features": {
    "allowDraft": true,
    "assistant45": false,
    "showHints": true,
    "highlightRow": true,
    "highlightCol": true,
    "highlightBox": true,
    "highlightNumber": true,
    "highlightCage": false,
    "autoFillCandidates": true
  },
  "boardData": [
    [1,0,0,3],
    [0,2,0,0],
    [0,0,3,0],
    [2,0,0,4]
  ],
  "solution": [
    [1,4,2,3],
    [3,2,4,1],
    [4,1,3,2],
    [2,3,1,4]
  ],
  "cages": [],
  "triggers": [
    {
      "id": "t100_s",
      "condition": "onLevelStart",
      "type": "freeze_mask",
      "text": "欢迎！数独三大铁律：每行、每列、每个2×2宫，数字1-4不能重复！点一个空格，看看能填什么？",
      "once": true
    },
    {
      "id": "t100_f1",
      "condition": "onFirstNumberFilled",
      "type": "popup_hint",
      "position": "top",
      "text": "太棒了！🎉 你刚刚用了「排除法」——看看行、列、宫里已经有哪些数字，剩下的就是答案！",
      "once": true
    },
    {
      "id": "t100_f2",
      "condition": "onFillCountReached",
      "count": 3,
      "type": "popup_hint",
      "position": "top",
      "text": "继续！选中空格时，同行/列/宫会高亮，帮你快速排除重复数字！",
      "once": true
    },
    {
      "id": "t100_b",
      "condition": "onFillCountReached",
      "count": 6,
      "type": "enter_phase",
      "phase": "breakthrough",
      "once": true
    },
    {
      "id": "t100_st",
      "condition": "onStuckForSeconds",
      "seconds": 25,
      "type": "popup_hint",
      "position": "top",
      "text": "💡 卡住了？看高亮的行和列——已经出现的数字不能再填！候选数里只剩一个的就是答案！",
      "once": false
    },
    {
      "id": "t100_fi",
      "condition": "onFillCountReached",
      "count": 10,
      "type": "enter_phase",
      "phase": "finishing",
      "once": true
    }
  ],
  "preDialog": [
    {
      "speaker": "守笼人",
      "text": "在接触笼格之前，先记住最基本的三条铁律。"
    },
    {
      "speaker": "阿岩",
      "text": "对！就像普通数独一样——每行、每列、每个2×2小方块，1到4都只能出现一次！"
    },
    {
      "speaker": "守笼人",
      "text": "这张盘面上还没有笼子。把它填满，你就掌握了数独的根基。"
    }
  ],
  "clearDialog": [
    {
      "speaker": "守笼人",
      "text": "很好。三条铁律已经刻入你的直觉。"
    },
    {
      "speaker": "阿岩",
      "text": "太简单了！接下来就是杀手数独独有的「笼子」了，准备好！"
    }
  ]
};

// 找到第1章
const ch1 = chapters.find(ch => ch.chapterId === 1);
if (!ch1) {
  console.error('❌ 找不到第1章');
  process.exit(1);
}

// 检查是否已经有100关
const existing = ch1.levels.find(l => l.levelId === 100);
if (existing) {
  console.log('⚠️ 100关已存在，替换...');
  const idx = ch1.levels.indexOf(existing);
  ch1.levels[idx] = L100;
} else {
  // 插入到最前面
  ch1.levels.unshift(L100);
}

// 备份
const backupPath = chaptersPath + '.bak-' + Date.now();
fs.writeFileSync(backupPath, fs.readFileSync(chaptersPath));
console.log('📦 已备份原文件到', path.basename(backupPath));

fs.writeFileSync(chaptersPath, JSON.stringify(chapters, null, 2));
console.log('✅ 第100关已添加到chapters.json！');
console.log(`第1章现在有${ch1.levels.length}关:`, ch1.levels.map(l=>l.levelId).join(', '));
