/**
 * rebuild-chapters.js
 * 重构第2-7章的关卡数据：
 *  - 添加 mode、autoFillCandidates
 *  - 补全 triggers（onLevelStart / onFirstNumberFilled / onFillCountReached / onStuckForSeconds / onLevelComplete）
 *  - 增加 breakthrough / finishing 三阶段框架
 *  - 增加 antiGuess（onConflict）机制
 *  - 为第3-6章补全 badge 对象，并将 introStory/endingStory 移到 levels 之前
 *  - 保留现有 boardData / cages / solution / preDialog / clearDialog 不变
 *  - 保留现有 triggers 中有价值的内容，仅补充缺失
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'game-src', 'data', 'chapters.json');
const BACKUP = path.join(__dirname, '..', 'game-src', 'data', 'chapters.json.bak-rebuild');

// ---------- 工具函数 ----------

function countPrefilled(boardData) {
  let n = 0;
  for (const row of boardData) for (const c of row) if (c !== 0) n++;
  return n;
}

function totalCells(gridSize) { return gridSize * gridSize; }

/**
 * 计算 breakthrough/finishing 的触发阈值（总填充数，包含预填）
 * breakthrough: 总填充率约45%（即玩家填了约45%的空格）
 * finishing:    总填充率约78%
 */
function phaseCounts(lv) {
  const total = totalCells(lv.gridSize);
  const pre = countPrefilled(lv.boardData || []);
  const toFill = total - pre;
  const breakCount = pre + Math.max(1, Math.floor(toFill * 0.45));
  const finishCount = pre + Math.max(1, Math.floor(toFill * 0.78));
  return { pre, total, toFill, breakCount: Math.min(breakCount, total - 1), finishCount: Math.min(finishCount, total - 1) };
}

function hasTrigger(triggers, condition, phase) {
  return (triggers || []).some(t => {
    if (t.condition !== condition) return false;
    if (phase !== undefined) return t.phase === phase;
    return true;
  });
}

function hasTriggerType(triggers, type) {
  return (triggers || []).some(t => t.type === type);
}

function findTrigger(triggers, condition, phase) {
  return (triggers || []).find(t => t.condition === condition && (phase === undefined || t.phase === phase));
}

/**
 * 为一个关卡补齐通用框架 triggers，保留已有 trigger。
 * @param {object} lv 关卡对象
 * @param {object} opts 选项
 * @param {string} opts.startText           onLevelStart 的开场提示文本（如果已有 freeze_mask 则不覆盖，只补 popup_hint）
 * @param {string} opts.firstFillText       onFirstNumberFilled 文本
 * @param {string} opts.stuckText20s        20秒卡住提示
 * @param {string} opts.stuckText40s        40秒卡住提示（可选）
 * @param {string} opts.breakthroughText    "破局时刻" 提示文本
 * @param {string} opts.finishingText       "收官" 提示文本
 * @param {string} opts.completeText        onLevelComplete 通关祝贺文本
 * @param {string} opts.antiGuessText       onConflict 错误提示（antiGuess机制）
 * @param {boolean} opts.comprehensive      是否是综合关（影响阶段提示语气）
 * @param {string}  opts.badgeIdOnComplete  通关时解锁的badge id（可选）
 */
function buildTriggers(lv, opts) {
  const triggers = Array.isArray(lv.triggers) ? [...lv.triggers] : [];
  const pc = phaseCounts(lv);

  // 确保每个 trigger 都有 id
  triggers.forEach((t, i) => {
    if (!t.id) t.id = `t${lv.levelId}_auto_${i}`;
  });

  // ---------- onLevelStart ----------
  const hasStart = hasTrigger(triggers, 'onLevelStart');
  if (!hasStart && opts.startText) {
    triggers.push({
      id: `t${lv.levelId}_s`,
      condition: 'onLevelStart',
      type: 'popup_hint',
      position: 'top',
      text: opts.startText,
      once: true
    });
  }

  // ---------- onFirstNumberFilled ----------
  if (!hasTrigger(triggers, 'onFirstNumberFilled') && opts.firstFillText) {
    triggers.push({
      id: `t${lv.levelId}_f1`,
      condition: 'onFirstNumberFilled',
      type: 'popup_hint',
      position: 'top',
      text: opts.firstFillText,
      once: true
    });
  }

  // ---------- breakthrough 阶段 ----------
  const hasBreakPhase = triggers.some(t => t.phase === 'breakthrough');
  if (!hasBreakPhase) {
    triggers.push({
      id: `t${lv.levelId}_b`,
      condition: 'onFillCountReached',
      count: pc.breakCount,
      type: 'enter_phase',
      phase: 'breakthrough',
      once: true
    });
  }
  // 破局时刻的 popup 提示
  if (opts.breakthroughText && !triggers.some(t => t.phase === 'breakthrough' && t.type === 'popup_hint')) {
    triggers.push({
      id: `t${lv.levelId}_bt`,
      condition: 'onFillCountReached',
      count: pc.breakCount,
      type: 'popup_hint',
      position: 'top',
      text: opts.breakthroughText,
      once: true,
      delay: 400
    });
  }

  // ---------- onStuckForSeconds 20s ----------
  const hasStuck20 = triggers.some(t => t.condition === 'onStuckForSeconds' && t.seconds <= 22);
  if (!hasStuck20 && opts.stuckText20s) {
    triggers.push({
      id: `t${lv.levelId}_st20`,
      condition: 'onStuckForSeconds',
      seconds: 20,
      type: 'popup_hint',
      position: 'top',
      text: opts.stuckText20s,
      once: false
    });
  }

  // ---------- onStuckForSeconds 40s ----------
  const hasStuck40 = triggers.some(t => t.condition === 'onStuckForSeconds' && t.seconds >= 35 && t.seconds <= 45);
  if (!hasStuck40 && opts.stuckText40s) {
    triggers.push({
      id: `t${lv.levelId}_st40`,
      condition: 'onStuckForSeconds',
      seconds: 40,
      type: 'popup_hint',
      position: 'top',
      text: opts.stuckText40s,
      once: false,
      delay: 300
    });
  }

  // ---------- antiGuess（onConflict） ----------
  if (!hasTrigger(triggers, 'onConflict') && opts.antiGuessText) {
    triggers.push({
      id: `t${lv.levelId}_ag`,
      condition: 'onConflict',
      type: 'popup_hint',
      position: 'top',
      text: opts.antiGuessText,
      once: false
    });
  }

  // ---------- finishing 阶段 ----------
  const hasFinishPhase = triggers.some(t => t.phase === 'finishing');
  if (!hasFinishPhase) {
    triggers.push({
      id: `t${lv.levelId}_fi`,
      condition: 'onFillCountReached',
      count: pc.finishCount,
      type: 'enter_phase',
      phase: 'finishing',
      once: true
    });
  }
  if (opts.finishingText && !triggers.some(t => t.phase === 'finishing' && t.type === 'popup_hint')) {
    triggers.push({
      id: `t${lv.levelId}_fit`,
      condition: 'onFillCountReached',
      count: pc.finishCount,
      type: 'popup_hint',
      position: 'top',
      text: opts.finishingText,
      once: true,
      delay: 400
    });
  }

  // ---------- onLevelComplete ----------
  if (!hasTrigger(triggers, 'onLevelComplete') && opts.completeText) {
    const completeTrigger = {
      id: `t${lv.levelId}_c`,
      condition: 'onLevelComplete',
      type: opts.badgeIdOnComplete ? 'badge_award' : 'popup_hint',
      position: 'top',
      text: opts.completeText,
      once: true
    };
    if (opts.badgeIdOnComplete) {
      completeTrigger.badgeId = opts.badgeIdOnComplete;
      delete completeTrigger.position;
    }
    triggers.push(completeTrigger);
  }

  return triggers;
}

/**
 * 确保 features.autoFillCandidates 存在
 */
function ensureFeatures(lv, autoFill) {
  if (!lv.features) lv.features = {};
  if (lv.features.autoFillCandidates === undefined) {
    lv.features.autoFillCandidates = autoFill;
  }
  return lv.features;
}

/**
 * 确定 mode
 */
function determineMode(lv, isLastInChapter, isEndgame) {
  if (lv.mode) return lv.mode;
  if (isLastInChapter) return 'comprehensive';
  if (isEndgame) return 'endgame';
  return 'full';
}

// ---------- 章节级 badge 定义 ----------
const BADGES = {
  c2: { id: 'badge_c2_45law', name: '星衡学徒', icon: '⚖️', description: '掌握21/45星衡法则，破解行、列、宫的和值谜题，成为星衡学徒。' },
  c3: { id: 'badge_c3_advanced', name: '中级侦探', icon: '🔑', description: '掌握区块排除法与数对技巧，获得深入档案室深层的权限。' },
  c4: { id: 'badge_c4_expert', name: '高级侦探', icon: '📐', description: '精通候选笔记、隐性唯一、笼内排除等进阶技巧，可独立侦破尘封旧案。' },
  c5: { id: 'badge_c5_candidate', name: '精英侦探', icon: '⚡', description: '征服X-Wing、剑鱼、XY-Wing、强制链等高级构型，抵达星辰梭核心。' },
  c6: { id: 'badge_c6_master', name: '大师侦探', icon: '👑', description: '破解嵌套笼、大笼和与设局人谜题，成为真正的杀手数独大师。' }
};

// ---------- 主流程 ----------

console.log('读取 chapters.json ...');
const raw = fs.readFileSync(SRC, 'utf8');
const data = JSON.parse(raw);

// 备份原文件
fs.copyFileSync(SRC, BACKUP);
console.log('已备份原文件到:', BACKUP);

// ============================================================
// 第2章（chapterId=2）
// ============================================================
const ch2 = data.find(c => c.chapterId === 2);
if (ch2) {
  console.log('处理第2章...');
  ch2.levels.forEach((lv, idx, arr) => {
    const isLast = idx === arr.length - 1;
    lv.mode = determineMode(lv, isLast, false);
    ensureFeatures(lv, false); // 入门章节autoFillCandidates=false
  });

  // 201 行的21法则
  const lv201 = ch2.levels.find(l => l.levelId === 201);
  if (lv201) {
    lv201.triggers = buildTriggers(lv201, {
      firstFillText: '答对了！21法则就是这么简单：行的总和21，减去已知数，剩下的就是答案～列和宫也是一样哦',
      stuckText20s: '💡 卡住了？记住：6×6每行数字之和恒为21，用21减去行内所有已知数字，就能得到空格的值！',
      stuckText40s: '💡 再看一遍这一行——把所有数字加起来：21减去它们，那个唯一的空格就是答案！试试点击右上角的「45」按钮使用计算器～',
      breakthroughText: '⚡ 破局时刻！你已掌握行星衡，继续推进，剩下的空格可以用同样的方法解决！',
      finishingText: '✨ 收官阶段！最后几格了，保持节奏，胜利就在眼前！',
      completeText: '🎉 行星衡已掌握！每行和为21的法则将是你破解笼局的第一把钥匙。',
      antiGuessText: '⚠️ 数字不对哦！检查一下这一行的和是不是21？用排除法再想想~'
    });
  }

  // 202 列的21法则
  const lv202 = ch2.levels.find(l => l.levelId === 202);
  if (lv202) {
    lv202.triggers = buildTriggers(lv202, {
      startText: '欢迎来到第二关！上一关学了行的21法则，这一关——列的和同样是21！找一列只有一个空格的，21减一减！',
      firstFillText: '漂亮！列的21法则和行完全一样——每列6个不重复数字，和永远是21！',
      stuckText20s: '💡 卡住了？别只看行！看看每一列——找只有一个空格的列，21减其他数字就是答案！',
      stuckText40s: '💡 记住星衡法则三要素：行和=21，列和=21，宫和=21。现在找一个空格最少的列试试看？',
      breakthroughText: '⚡ 破局时刻！列的星衡也被你掌握了，行列交叉验证，接下来势如破竹！',
      finishingText: '✨ 收官！最后几格了，用行和列双向验证，确保不犯错！',
      completeText: '🎉 列星衡到手！行和列都是你的武器了，准备好迎接宫的星衡了吗？',
      antiGuessText: '⚠️ 别猜！检查一下列的和是不是21？如果不对，换个数字试试～'
    });
  }

  // 203 宫的21法则+基础笼
  const lv203 = ch2.levels.find(l => l.levelId === 203);
  if (lv203) {
    lv203.triggers = buildTriggers(lv203, {
      startText: '第三关！6×6的每个2×3宫，和也是21！注意那些虚线笼子——笼内数字相加必须等于左上角的和值！',
      firstFillText: '很好！宫和笼子的双重约束，让答案更唯一了！',
      stuckText20s: '💡 卡住了？先看每个2×3宫——宫和21，减一减就能找到单格答案！再看笼子的和值，双管齐下！',
      stuckText40s: '💡 笼子和值是关键！比如和值为3的两格笼一定是1+2，和值为4一定是1+3，再结合宫的21法则排除！',
      breakthroughText: '⚡ 破局时刻！宫星衡+笼格双重推理已启动，你已真正进入杀手数独的领域！',
      finishingText: '✨ 收官！笼子、行、列、宫四重验证，最后几步稳住！',
      completeText: '🎉 宫的星衡和基础笼格都掌握了！你已经学会了杀手数独三大和值武器！',
      antiGuessText: '⚠️ 检查一下！笼子和值对吗？宫里面有没有重复？星衡数字是不会骗人的～'
    });
  }

  // 204 九域星图（9×9入门）
  const lv204 = ch2.levels.find(l => l.levelId === 204);
  if (lv204) {
    lv204.triggers = buildTriggers(lv204, {
      firstFillText: '📜 「很好，你踏入了九域星图。记住——9×9盘面每行每列每宫的和是45。」',
      stuckText20s: '💡 📜 「45是九域的星衡基数。找空格最少的行、列或3×3宫，45减去已知数，答案自现。」',
      stuckText40s: '💡 📜 「莫要急于求成。九域星图讲究纵观全局——先扫一遍所有行/列/宫，找突破口比盲目填数更重要。」',
      breakthroughText: '⚡ 📜 「破局时刻。你已领悟45法则的精髓——从此，九域星图在你眼中不再是谜。」',
      finishingText: '✨ 📜 「收官了。九域星图即将完成，感受45法则的力量吧。」',
      completeText: '🎉 📜 「九域星图已解。你正式成为45法则的传人——继续前行，更大的谜题在等你。」',
      antiGuessText: '⚠️ 📜 「差之毫厘，谬以千里。检查行/列/宫的和是否为45，再思。」'
    });
  }

  // 205 单格差值
  const lv205 = ch2.levels.find(l => l.levelId === 205);
  if (lv205) {
    lv205.triggers = buildTriggers(lv205, {
      startText: '单格推演：45法则最精妙的应用——当笼子刚好"伸出"宫一格时，笼和减45就是那个格子的值！',
      firstFillText: '找到了！这就是「innie/outie」单格差值——笼和减去45，伸出宫外的那个数字瞬间确定！',
      stuckText20s: '💡 卡住了？找那些跨宫的笼子！如果笼子只有一个格子在某宫外，用笼和减45就是那一格的值！',
      stuckText40s: '💡 差值法口诀：笼跨宫，数一数字，差多少就是那个格子。比如一个笼在宫里有8格，和为40，那伸出去的就是5！',
      breakthroughText: '⚡ 破局时刻！差值推理已启动，那些藏在笼中的数字一个接一个现身了！',
      finishingText: '✨ 收官！单格差值全部算出，剩下的就是基础排除了！',
      completeText: '🎉 单格差值已掌握！这是45法则最锋利的匕首，直插谜题的心脏！',
      antiGuessText: '⚠️ 别急！差值算错了会全错——再算一遍笼和与45的差！'
    });
  }

  // 206 多格差值+组合计算器
  const lv206 = ch2.levels.find(l => l.levelId === 206);
  if (lv206) {
    lv206.triggers = buildTriggers(lv206, {
      startText: '多格差值！有些笼子伸出宫外的是两个或三个格子，它们的和可以通过45法则算出，再用组合计算器找出可能的组合！',
      firstFillText: '好！多格差值算出一组数后，点击右上角「45」按钮可以打开黄铜算珠计算器，帮你枚举可能的组合！',
      stuckText20s: '💡 卡住了？先找跨宫笼子，用45减出伸出部分的和值，再用组合计算器看哪些数字组合能凑出这个和！',
      stuckText40s: '💡 组合计算器用法：点击「45」按钮→输入格子数和和值→它会列出所有可能的组合，再结合排除法筛选！',
      breakthroughText: '⚡ 破局时刻！多格差值+组合计算器，双重火力全开！',
      finishingText: '✨ 收官阶段！组合范围越缩越小，最后几格呼之欲出！',
      completeText: '🎉 多格差值与组合计算器双剑合璧！你又多了一件神器！',
      antiGuessText: '⚠️ 填入前先验证——这个数字在组合里吗？行/列/宫有重复吗？'
    });
  }

  // 207 内外笼
  const lv207 = ch2.levels.find(l => l.levelId === 207);
  if (lv207) {
    lv207.triggers = buildTriggers(lv207, {
      startText: '内外玄机（innie/outie）！笼子可以完全包在宫内（innie），也可以伸出宫外（outie）。仔细观察笼子的形状！',
      firstFillText: '眼尖！识别出innie和outie是高级笼局的第一步——完全在宫内的笼直接用宫和45减！',
      stuckText20s: '💡 卡住了？把每个3×3宫里的笼子都看一遍——完全在宫内的笼，笼和加起来应该小于等于45；如果大于45，差值就是伸出的格子！',
      stuckText40s: '💡 Innie技巧：宫内所有笼的和 减去 45 = 所有outie格的和。如果只有一个outie格，直接得到答案！',
      breakthroughText: '⚡ 破局时刻！内外笼的秘密被你揭开了，innies和outies无所遁形！',
      finishingText: '✨ 收官！内笼外笼全部解锁，最后的答案水到渠成！',
      completeText: '🎉 内外笼大法已成！你已经掌握了45法则的全部基础应用！',
      antiGuessText: '⚠️ 小心！笼格归属判断错了，全盘皆错——再看一眼虚线边界！'
    });
  }

  // 208 综合试炼（comprehensive）
  const lv208 = ch2.levels.find(l => l.levelId === 208);
  if (lv208) {
    // 保留原有onHalfFilled trigger但替换为标准三阶段
    // 移除旧的onHalfFilled以避免冲突
    lv208.triggers = (lv208.triggers || []).filter(t => t.condition !== 'onHalfFilled');
    lv208.mode = 'comprehensive';
    lv208.triggers = buildTriggers(lv208, {
      firstFillText: '📜 「好的开始。记住——星衡试炼没有捷径，唯有综合运用你学到的一切。」',
      stuckText20s: '💡 📜 「急躁是推理的大敌。重新审视盘面：行、列、宫、笼、差值——哪个是你漏掉的线索？」',
      stuckText40s: '💡 📜 「退一步，海阔天空。试试从不同的宫/笼入手，有时候换个角度答案就浮现了。善用组合计算器。」',
      breakthroughText: '⚡ 📜 「破局时刻！你找到了关键的突破口——乘胜追击，不要给谜题喘息的机会！」',
      finishingText: '✨ 📜 「收官！答案就在眼前，星衡学徒徽章即将属于你！」',
      completeText: '🎉 恭喜通过星衡试炼！黄铜算珠徽章——「星衡学徒」已解锁！你已具备进入深层档案室的资格。',
      badgeIdOnComplete: 'badge_c2_45law',
      antiGuessText: '⚠️ 📜 「错了。星衡从不说谎——回头检查你的推理链，哪里出了破绽？」'
    });
  }
}

// ============================================================
// 第3章（chapterId=3）
// ============================================================
const ch3Index = data.findIndex(c => c.chapterId === 3);
const ch3 = data[ch3Index];
if (ch3) {
  console.log('处理第3章...');
  // 补全 badge
  if (!ch3.badge) ch3.badge = BADGES.c3;

  ch3.levels.forEach((lv, idx, arr) => {
    const isLast = idx === arr.length - 1;
    lv.mode = determineMode(lv, isLast, false);
    ensureFeatures(lv, true); // 进阶章节autoFillCandidates=true
  });

  // 修正304的teachingGoal
  const lv304 = ch3.levels.find(l => l.levelId === 304);
  if (lv304) {
    lv304.teachingGoal = '9×9盘面45法则复习与巩固：综合运用行、列、宫的45法则及差值技巧。';
  }

  // 301 区块排除(row)
  const lv301 = ch3.levels.find(l => l.levelId === 301);
  if (lv301) {
    lv301.teachingGoal = '区块排除法（行区块）：当某数字在某宫内只能出现在同一行时，可排除该行其他位置的该数字。';
    lv301.title = '第1关：行区块';
    lv301.triggers = buildTriggers(lv301, {
      startText: '欢迎来到档案室深层！第一关：行区块排除。当某个数字在一个3×3宫里只能出现在同一行时，这行其他格子就不可能是那个数字了！',
      firstFillText: '对了！这就是区块排除——当数字在这个宫里只能出现在这一行时，整行其他位置都排除掉！',
      stuckText20s: '💡 卡住了？找一个数字，看它在某个3×3宫里的可能位置——如果这些位置恰好在同一行，那整行其他位置都排除掉！',
      stuckText40s: '💡 行区块口诀：「宫看行，行删余」。打开候选数笔记（✏️），标记所有候选，区块就会自己跳出来！',
      breakthroughText: '⚡ 破局时刻！你找到了关键的行区块排除，连锁反应开始了！',
      finishingText: '✨ 收官！区块排除的余波扫清了最后的障碍，继续冲刺！',
      completeText: '🎉 行区块排除已掌握！这是所有进阶技巧的基石。',
      antiGuessText: '⚠️ 猜数字是行不通的！找到区块证据再填——如果候选数没标记，先标上！'
    });
  }

  // 302 区块排除(col)
  const lv302 = ch3.levels.find(l => l.levelId === 302);
  if (lv302) {
    lv302.teachingGoal = '区块排除法（列区块）：当某数字在某宫内只能出现在同一列时，可排除该列其他位置的该数字。';
    lv302.title = '第2关：列区块';
    lv302.triggers = buildTriggers(lv302, {
      startText: '第二关：列区块！上一关学了行方向的区块排除，这一关是列方向——原理一样，方向变了！',
      firstFillText: '漂亮！列区块和行区块是双胞胎——宫内看列，列删余！',
      stuckText20s: '💡 卡住了？竖着看！找一个数字，看它在某个宫里只能出现在哪一列，那整列其他格子都排除！',
      stuckText40s: '💡 别忘记45法则依然可用！有时候用45法则先锁定一个数字，区块自然就出现了。',
      breakthroughText: '⚡ 破局时刻！列区块排除启动，盘面上的数字开始连锁填入！',
      finishingText: '✨ 收官！行列区块都用上了，最后几格轻松拿下！',
      completeText: '🎉 列区块到手！行和列的双向排除你都掌握了！',
      antiGuessText: '⚠️ 别急着填！确定这一列其他地方都不能放这个数字了吗？再检查一遍~'
    });
  }

  // 303 区块排除(box)
  const lv303 = ch3.levels.find(l => l.levelId === 303);
  if (lv303) {
    lv303.teachingGoal = '区块排除法（宫区块）：当某数字在某行/列中只能出现在同一个3×3宫时，可排除宫内其他位置的该数字。';
    lv303.title = '第3关：宫区块';
    lv303.triggers = buildTriggers(lv303, {
      startText: '第三关：宫区块！方向反过来——如果某个数字在一整行里只能出现在同一个宫，那宫里其他格子排除掉它！',
      firstFillText: '很好！宫区块是反向推理：从行/列看宫，而不是从宫看行/列！',
      stuckText20s: '💡 卡住了？换个方向扫：看某一行里某个数字能放的所有位置——如果它们都在同一个3×3宫里，宫内其他格就排除！',
      stuckText40s: '💡 宫区块口诀：「行看宫，宫删余」。候选数标记是你的好帮手，记得打开✏️按钮！',
      breakthroughText: '⚡ 破局时刻！宫区块被你发现了，排除一大片候选数！',
      finishingText: '✨ 收官！行列宫三种区块都能灵活运用了，最后几步稳了！',
      completeText: '🎉 宫区块已掌握！区块排除法三方向全部通关！',
      antiGuessText: '⚠️ 再仔细看看——这个数字在行里的位置真的都在同一个宫吗？'
    });
  }

  // 304 9×9复习
  if (lv304) {
    lv304.title = '第4关：九域复习';
    lv304.triggers = buildTriggers(lv304, {
      startText: '九域复习关！综合运用45法则和区块排除法，巩固前面学到的一切。',
      firstFillText: '不错！基础功扎实，继续保持！',
      stuckText20s: '💡 卡住了？不要忘记已经学过的武器：45法则（行/列/宫）、差值、区块排除——总有一个能用上！',
      stuckText40s: '💡 换个思路：先扫一遍所有笼子和差值，再找区块，不要死磕一个地方！',
      breakthroughText: '⚡ 破局时刻！关键线索找到了，盘面开始松动！',
      finishingText: '✨ 收官！复习关即将完成，你已经准备好了迎接新的技巧！',
      completeText: '🎉 九域复习完成！基础已经打牢，准备好学习数对了吗？',
      antiGuessText: '⚠️ 不要猜！回到已学的技巧，寻找确定的推理链！'
    });
  }

  // 305 数对入门(naked pair)
  const lv305 = ch3.levels.find(l => l.levelId === 305);
  if (lv305) {
    lv305.teachingGoal = '显性数对（Naked Pair）入门：同一行/列/宫内两个格子恰好只能填相同的两个数字，可排除区域内其他格子的这两个数字。';
    lv305.title = '第5关：数对初探';
    lv305.triggers = buildTriggers(lv305, {
      startText: '新技巧：显性数对！如果一行里有两个空格都恰好只能填相同的两个数字（比如3和7），那这两个格子就占了3和7，同行其他格子可以排除3和7！',
      firstFillText: '好眼力！你发现了第一个数对！这就是「Naked Pair」——两个格子赤裸裸地只可能是两个数！',
      stuckText20s: '💡 卡住了？打开✏️候选数笔记，标记所有空格的可能数字，然后找那些恰好有两个相同候选数的格子对！',
      stuckText40s: '💡 数对不一定在同行——同列或同宫也可以！只要在同一个区域（行/列/宫）里，两个格子恰有相同两个候选数就是数对！',
      breakthroughText: '⚡ 破局时刻！数对排除了大片候选数，盘面豁然开朗！',
      finishingText: '✨ 收官！数对的力量让最后的数字一一浮现！',
      completeText: '🎉 显性数对已掌握！这是高阶推理的第一块多米诺骨牌！',
      antiGuessText: '⚠️ 数对判断要谨慎——两个格子必须恰好只有这两个候选数，多一个都不算！'
    });
  }

  // 306 组合运用
  const lv306 = ch3.levels.find(l => l.levelId === 306);
  if (lv306) {
    lv306.teachingGoal = '组合运用：区块排除法与显性数对的结合使用，加上45法则，多技巧联合解题。';
    lv306.title = '第6关：组合运用';
    lv306.triggers = buildTriggers(lv306, {
      startText: '组合运用关！这一关需要你同时使用区块排除和数对——技巧之间会互相触发，连锁反应！',
      firstFillText: '不错！第一个突破点找到了，接下来的连锁反应会越来越顺！',
      stuckText20s: '💡 卡住了？先找数对锁定候选，再用区块排除删除更多候选，交替使用两种技巧！',
      stuckText40s: '💡 别忘了45法则和笼子组合！基础技巧永远不过时，它们经常是连锁的起点！',
      breakthroughText: '⚡ 破局时刻！数对+区块的组合拳打出了效果，盘面开始崩塌！',
      finishingText: '✨ 收官！多技巧协同作战，最后几格尽收囊中！',
      completeText: '🎉 组合运用纯熟！你已经可以灵活切换多种推理技巧了！',
      antiGuessText: '⚠️ 一步错步步错！每填入一个数字前，确认它通过了所有约束条件！'
    });
  }

  // 307 综合测试（comprehensive）
  const lv307 = ch3.levels.find(l => l.levelId === 307);
  if (lv307) {
    lv307.teachingGoal = '第三章综合测试：45法则、区块排除（行/列/宫）、显性数对，综合运用所有进阶基础技巧。';
    lv307.title = '第7关：深层试炼';
    lv307.mode = 'comprehensive';
    lv307.triggers = buildTriggers(lv307, {
      startText: '📜 深层档案室试炼！综合运用45法则、区块排除、显性数对，证明你有资格继续深入！',
      firstFillText: '好的开始！设局人的谜题虽然狡猾，但你已经有了破解它的武器！',
      stuckText20s: '💡 卡住了？深呼吸，从头扫一遍：先填裸单→45法则找差值→找数对→找区块，按部就班！',
      stuckText40s: '💡 设局人喜欢把线索藏在最显眼的地方——有没有漏掉哪个简单的45法则？有没有笼子和值很特殊？',
      breakthroughText: '⚡ 破局时刻！你撕开了设局人谜题的第一道防线，乘胜追击！',
      finishingText: '✨ 收官！徽章就在眼前，不要在最后一步失误！',
      completeText: '🎉 恭喜通过深层试炼！中级侦探徽章已解锁！档案室更深处的尘封旧案等你揭开！',
      badgeIdOnComplete: 'badge_c3_advanced',
      antiGuessText: '⚠️ 设局人的陷阱！这个数字看似合理，但违反了某个约束——再仔细检查！'
    });
  }

  // 重排键顺序：构建新对象替换数组中的旧对象，确保 badge/introStory/endingStory 在 levels 之前
  data[ch3Index] = {
    chapterId: ch3.chapterId,
    title: ch3.title,
    subtitle: ch3.subtitle,
    icon: ch3.icon,
    color: ch3.color,
    description: ch3.description,
    badgeId: ch3.badgeId || BADGES.c3.id,
    badgeName: ch3.badgeName || BADGES.c3.name,
    unlockRequirement: ch3.unlockRequirement,
    badge: ch3.badge || BADGES.c3,
    introStory: ch3.introStory,
    endingStory: ch3.endingStory,
    levels: ch3.levels
  };
}

// ============================================================
// 第4章（chapterId=4）
// ============================================================
const ch4Index = data.findIndex(c => c.chapterId === 4);
const ch4 = data[ch4Index];
if (ch4) {
  console.log('处理第4章...');
  if (!ch4.badge) ch4.badge = BADGES.c4;

  ch4.levels.forEach((lv, idx, arr) => {
    const isLast = idx === arr.length - 1;
    lv.mode = determineMode(lv, isLast, false);
    ensureFeatures(lv, true);
  });

  // 401 候选笔记
  const lv401 = ch4.levels.find(l => l.levelId === 401);
  if (lv401) {
    lv401.teachingGoal = '候选笔记系统化：学会使用✏️按钮系统标记候选数，这是所有高级技巧的基础。';
    lv401.title = '第1关：候选笔记';
    lv401.triggers = buildTriggers(lv401, {
      startText: '欢迎来到尘封旧案！第一关：候选笔记。高级技巧的基础是候选数标记——点击✏️按钮开始标记每个空格的可能数字吧！',
      firstFillText: '好！候选数标记能帮你看到肉眼容易忽略的规律，坚持标记！',
      stuckText20s: '💡 卡住了？打开✏️候选数笔记，把每个空格的可能数字都标出来——高级技巧全靠候选数！',
      stuckText40s: '💡 标记技巧：先扫每个数字1-9，用排除法在每个空格标上可能的数字，再找规律！可以点击右上角「45」打开计算器辅助！',
      breakthroughText: '⚡ 破局时刻！候选数标记到位后，隐藏的规律开始显现！',
      finishingText: '✨ 收官！候选数帮你锁定了最后的答案！',
      completeText: '🎉 候选笔记已成为你的本能！从此高级技巧不再遥不可及！',
      antiGuessText: '⚠️ 不要凭感觉填！看候选数——如果有多个候选，就需要进一步推理，不能猜！'
    });
  }

  // 402 隐性唯一(Hidden Single)
  const lv402 = ch4.levels.find(l => l.levelId === 402);
  if (lv402) {
    lv402.teachingGoal = '隐性唯一（Hidden Single）进阶：在某个行/列/宫中，某个数字只有一个位置可填，即使该格有其他候选数。';
    lv402.title = '第2关：隐性唯一';
    lv402.triggers = buildTriggers(lv402, {
      startText: '第二关：隐性唯一（Hidden Single）！有时候一个格子有好几个候选数，但某个数字在整行/列/宫里只有这一个位置能放——它就是Hidden Single！',
      firstFillText: '找到了！这就是隐性唯一——虽然格子上有多个候选数，但数字5在这一行只有这里能放！',
      stuckText20s: '💡 卡住了？别只看候选数少的格子！逐数字扫描（1到9），看每个数字在每行/列/宫里有几个可能位置！',
      stuckText40s: '💡 Hidden Single经常藏在候选数多的格子里！裸单看格，隐单看数——换个角度扫数字！',
      breakthroughText: '⚡ 破局时刻！你发现了关键的隐单，连锁排除开始了！',
      finishingText: '✨ 收官！隐单和裸单交替使用，最后几格毫无悬念！',
      completeText: '🎉 隐性唯一已掌握！「裸单看格，隐单看数」——八字真言记牢！',
      antiGuessText: '⚠️ 确认这个数字在整行/列/宫真的只有这一个位置？再扫一遍！'
    });
  }

  // 403 数对占位(Hidden Pair + Naked Pair巩固)
  const lv403 = ch4.levels.find(l => l.levelId === 403);
  if (lv403) {
    lv403.teachingGoal = '数对占位：隐性数对（Hidden Pair）——两个数字在某区域内只能出现在相同两个格子，这两格排除其他候选。';
    lv403.title = '第3关：数对占位';
    lv403.triggers = buildTriggers(lv403, {
      startText: '第三关：数对占位（隐性数对）！上一章学了显性数对，这一关学它的反面——两个数字只能在两个格子里，即使这两个格子还有其他候选！',
      firstFillText: '聪明！隐性数对被你发现了——虽然这两格有多个候选，但数字2和6只能在它们之中，其他候选全部删除！',
      stuckText20s: '💡 卡住了？找两个数字，看它们在某行/列/宫里的可能位置——如果恰好落在相同的两个格子，那就是隐性数对！',
      stuckText40s: '💡 隐性数对比显性数对更难发现，要逐对数字扫描！数字1和4、2和7、3和8……耐心找！',
      breakthroughText: '⚡ 破局时刻！隐性数对浮出水面，删除了大量多余候选！',
      finishingText: '✨ 收官！显性+隐性数对双剑合璧，最后答案一目了然！',
      completeText: '🎉 隐性数对已掌握！数对的两种形态都被你征服了！',
      antiGuessText: '⚠️ 确证这两个数字真的只在这两个格子里吗？别漏了第三个可能位置！'
    });
  }

  // 404 三数连锁(Naked Triple)
  const lv404 = ch4.levels.find(l => l.levelId === 404);
  if (lv404) {
    lv404.teachingGoal = '三链数（Naked Triple）：同一区域内三个格子恰好只包含3个不同数字，可排除区域内其他格子的这3个数字。';
    lv404.title = '第4关：三数连锁';
    lv404.triggers = buildTriggers(lv404, {
      startText: '第四关：三数连锁（Naked Triple）！数对是两个格子两个数，三链数是三个格子三个数——规模升级，威力更大！',
      firstFillText: '好的开始！三链数是数对的升级版——三个格子、三个数字，锁定答案！',
      stuckText20s: '💡 卡住了？找三个格子，它们的候选数合起来恰好是三个不同数字（比如2、5、8）——这就是三链数！',
      stuckText40s: '💡 三链数不要求每个格子都有三个候选数！比如{2,5}{5,8}{2,8}也是三链数，合起来恰好三个数就行。善用计算器工具！',
      breakthroughText: '⚡ 破局时刻！三链数被你锁定，一排候选数被清扫！',
      finishingText: '✨ 收官！从数对到三链数，你的推理武器越来越丰富了！',
      completeText: '🎉 三链数已掌握！数对→三链数的推广让你的推理能力大幅提升！',
      antiGuessText: '⚠️ 三链数判断：三个格子的候选数合起来必须恰好三个数字，多一个都不算！'
    });
  }

  // 405 笼内排除
  const lv405 = ch4.levels.find(l => l.levelId === 405);
  if (lv405) {
    lv405.teachingGoal = '笼内排除法：利用笼子和值约束和组合限制，排除笼子内格子的不可能候选数。';
    lv405.title = '第5关：笼内排除';
    lv405.triggers = buildTriggers(lv405, {
      startText: '第五关：笼内排除！杀手数独的独有技巧——利用笼子的和值和组合限制，直接排除笼内格子的候选数！',
      firstFillText: '漂亮！笼子组合本身就是强大的排除工具——和值为17的两格笼只能是8+9！',
      stuckText20s: '💡 卡住了？看大笼子！和值大、格子多的笼子往往有唯一组合。比如4格和值为10只能是1+2+3+4！',
      stuckText40s: '💡 使用组合计算器（「45」按钮）！输入笼格数和和值，它会列出所有可能组合，帮你快速排除！',
      breakthroughText: '⚡ 破局时刻！关键笼子的唯一组合被你发现了，一大批数字确定！',
      finishingText: '✨ 收官！笼子组合的威力完全释放，最后的空格寥寥无几！',
      completeText: '🎉 笼内排除已精通！你开始像真正的杀手数独高手一样思考了！',
      antiGuessText: '⚠️ 填入前确认：这个数字在笼子的可能组合里吗？笼内有重复吗？和值对吗？'
    });
  }

  // 406 十字交叉（comprehensive）
  const lv406 = ch4.levels.find(l => l.levelId === 406);
  if (lv406) {
    lv406.teachingGoal = '第四章综合测试：候选笔记、隐性唯一、隐性数对、三链数、笼内排除、45法则——全技巧综合运用。';
    lv406.title = '第6关：十字交叉';
    lv406.mode = 'comprehensive';
    lv406.triggers = buildTriggers(lv406, {
      startText: '📜 尘封旧案最终考验！十字交叉——这里融合了本章所有技巧：候选数、隐单、隐对、三链数、笼内排除！',
      firstFillText: '不错！每一个正确的填入都是通向真相的一步！',
      stuckText20s: '💡 卡住了？系统排查：先填所有裸单→扫隐单→找数对→看笼子组合→三链数，按顺序来！',
      stuckText40s: '💡 善用候选数笔记和组合计算器！高级盘面前期标记越细致，后期越轻松。不要跳步！',
      breakthroughText: '⚡ 破局时刻！多重技巧交叉碰撞，你找到了最关键的那个突破口！',
      finishingText: '✨ 收官！高级侦探徽章触手可及，坚持到最后！',
      completeText: '🎉 恭喜通过尘封旧案！高级侦探徽章已解锁！星辰梭核心的秘密在前方等你！',
      badgeIdOnComplete: 'badge_c4_expert',
      antiGuessText: '⚠️ 旧案迷局中的陷阱——一个错误数字将导致满盘皆输，务必三思！'
    });
  }

  // 重排键顺序
  data[ch4Index] = {
    chapterId: ch4.chapterId,
    title: ch4.title,
    subtitle: ch4.subtitle,
    icon: ch4.icon,
    color: ch4.color,
    description: ch4.description,
    badgeId: ch4.badgeId || BADGES.c4.id,
    badgeName: ch4.badgeName || BADGES.c4.name,
    unlockRequirement: ch4.unlockRequirement,
    badge: ch4.badge || BADGES.c4,
    introStory: ch4.introStory,
    endingStory: ch4.endingStory,
    levels: ch4.levels
  };
}

// ============================================================
// 第5章（chapterId=5）
// ============================================================
const ch5Index = data.findIndex(c => c.chapterId === 5);
const ch5 = data[ch5Index];
if (ch5) {
  console.log('处理第5章...');
  if (!ch5.badge) ch5.badge = BADGES.c5;

  ch5.levels.forEach((lv, idx, arr) => {
    const isLast = idx === arr.length - 1;
    lv.mode = determineMode(lv, isLast, false);
    ensureFeatures(lv, true);
  });

  // 注意：用户需求中第5章是"嵌套笼/异形笼"，但现有标题是X-Wing/剑鱼/XY-Wing等
  // 用户明确描述：501嵌套笼入门，502异形笼，503复合笼组合，504 45法则高级应用，505综合笼局，506 comprehensive
  // 我们按用户需求更新teachingGoal和title，但保留boardData/cages/solution不变

  // 501 嵌套笼入门
  const lv501 = ch5.levels.find(l => l.levelId === 501);
  if (lv501) {
    lv501.teachingGoal = '嵌套笼入门：笼子可以包含其他笼子，利用大笼和减去小笼和，推导中间层格子的值。';
    lv501.title = '第1关：嵌套笼入门';
    lv501.difficulty = '中等';
    lv501.triggers = buildTriggers(lv501, {
      startText: '欢迎来到星辰梭核心！第一关：嵌套笼。注意观察盘面——有些笼子完全包含在另一个笼子里面，这就是嵌套结构！',
      firstFillText: '对了！大笼和减去小笼和，就能算出中间层的数字！这是嵌套笼的基本推理方式！',
      stuckText20s: '💡 卡住了？找那些一个套一个的笼子——大笼和值减去里面小笼的和值，差就是大笼独有的那些格子的和！',
      stuckText40s: '💡 嵌套笼技巧：先算最内层，再一层层向外推。就像剥洋葱，每一层都给你新的线索！',
      breakthroughText: '⚡ 破局时刻！嵌套笼的一层被你剥开，连锁反应开始了！',
      finishingText: '✨ 收官！层层嵌套全部解开，最后的数字就在眼前！',
      completeText: '🎉 嵌套笼入门完成！你开始理解星辰梭的复杂结构了！',
      antiGuessText: '⚠️ 嵌套结构判断要仔细——确认哪些格子属于大笼但不属于小笼，数错了全盘皆错！'
    });
  }

  // 502 异形笼
  const lv502 = ch5.levels.find(l => l.levelId === 502);
  if (lv502) {
    lv502.teachingGoal = '异形笼：笼子形状不规则，可能跨越多个宫的边界，需要灵活运用45法则和组合分析。';
    lv502.title = '第2关：异形笼';
    lv502.difficulty = '中等';
    lv502.triggers = buildTriggers(lv502, {
      startText: '第二关：异形笼！这一关的笼子形状不规则，像蜿蜒的蛇一样穿过多个宫——关键是拆分它们！',
      firstFillText: '好！异形笼虽然看起来复杂，但拆分成几段后，每段都可以用45法则或组合分析！',
      stuckText20s: '💡 卡住了？异形笼不要整体看！用3×3宫的边界把异形笼切成几段，每段分别用45法则算差值！',
      stuckText40s: '💡 长笼技巧：格子多的笼子组合数反而可能很少——比如5格和值为15只能是1+2+3+4+5！用计算器查组合！',
      breakthroughText: '⚡ 破局时刻！异形笼被你拆分成可计算的段，关键数字浮现！',
      finishingText: '✨ 收官！异形笼的每一段都被你攻克，最后几步轻松！',
      completeText: '🎉 异形笼已驯服！再奇怪的笼形也吓不倒你了！',
      antiGuessText: '⚠️ 注意笼子边界！异形笼的虚线边界容易看错，填入前确认格子属于哪个笼！'
    });
  }

  // 503 复合笼组合
  const lv503 = ch5.levels.find(l => l.levelId === 503);
  if (lv503) {
    lv503.teachingGoal = '复合笼组合：多个笼子交叉重叠，利用它们共享的格子作为桥梁，联立方程求解。';
    lv503.title = '第3关：复合笼组合';
    lv503.difficulty = '中等';
    lv503.triggers = buildTriggers(lv503, {
      startText: '第三关：复合笼组合！多个笼子交叉在一起，共享一些格子——把它们的和值关系列出来，像解方程一样！',
      firstFillText: '漂亮！两个笼子的和值关系被你发现了——共享格子是关键的桥梁！',
      stuckText20s: '💡 卡住了？找两个有重叠格子的笼子，把它们的和值加加减减，往往能消掉共享格子，算出独立部分！',
      stuckText40s: '💡 复合笼数学：笼A和=X，笼B和=Y，它们共享k个格子（和为S），则笼A独有+S=X，笼B独有+S=Y，两式相减消去S！',
      breakthroughText: '⚡ 破局时刻！复合笼的方程组被你解出，关键数字确定！',
      finishingText: '✨ 收官！复合体被你拆解完毕，所有笼格水落石出！',
      completeText: '🎉 复合笼组合已掌握！你开始用数学思维看待笼局了！',
      antiGuessText: '⚠️ 共享格子数清楚了吗？加减消元时算错一个数就全错了！'
    });
  }

  // 504 45法则高级应用（多宫）
  const lv504 = ch5.levels.find(l => l.levelId === 504);
  if (lv504) {
    lv504.teachingGoal = '45法则高级应用：同时考虑多行、多列、多宫的和值关系（比如两行两宫的90法则、三行的135法则）。';
    lv504.title = '第4关：多宫星衡';
    lv504.difficulty = '中等';
    lv504.triggers = buildTriggers(lv504, {
      startText: '第四关：多宫星衡！单行单列的45法则你已精通，这一关要同时看多个宫——两宫和为90，三宫和为135！',
      firstFillText: '对了！把两个宫合起来看和值90，差值范围更大，能找到单宫看不到的线索！',
      stuckText20s: '💡 卡住了？试试把相邻的两个宫或两行当作一个整体来看，和值是45×N！差值法同样适用！',
      stuckText40s: '💡 多宫技巧口诀：「看大不看小」。如果单宫找不到突破口，把视野扩大到2×2宫、三宫、三行！',
      breakthroughText: '⚡ 破局时刻！多宫联合的45法则发挥了威力，看似不可能的谜题迎刃而解！',
      finishingText: '✨ 收官！星衡法则从单宫扩展到全域，最后的答案再无悬念！',
      completeText: '🎉 多宫星衡已掌握！45法则的所有层次都被你穷尽了！',
      antiGuessText: '⚠️ 多宫计算要仔细——90还是135？是哪几个宫的合？边界格子归谁算？'
    });
  }

  // 505 综合笼局
  const lv505 = ch5.levels.find(l => l.levelId === 505);
  if (lv505) {
    lv505.teachingGoal = '综合笼局：嵌套笼、异形笼、复合笼、多宫45法则的综合运用。';
    lv505.title = '第5关：综合笼局';
    lv505.difficulty = '中等偏难';
    lv505.triggers = buildTriggers(lv505, {
      startText: '第五关：综合笼局！嵌套、异形、复合、多宫——星辰梭核心的所有笼型都出现在这里了！',
      firstFillText: '好！保持冷静，把每种笼型的技巧都调动起来！',
      stuckText20s: '💡 卡住了？先从最内层的嵌套笼或最明显的差值入手，不要直接攻最复杂的复合笼！',
      stuckText40s: '💡 综合笼局策略：①标记所有候选数 ②算所有单宫差值 ③找嵌套笼 ④拆异形笼 ⑤解复合笼 ⑥收尾，按部就班！',
      breakthroughText: '⚡ 破局时刻！一种笼型的突破带动了其他笼型的连锁解谜！',
      finishingText: '✨ 收官！星辰梭的核心秘密即将全部揭开！',
      completeText: '🎉 综合笼局已破解！你具备了挑战最高难度的实力！',
      antiGuessText: '⚠️ 高难度盘面一步错满盘输！每一步都要有确凿的证据！'
    });
  }

  // 506 comprehensive
  const lv506 = ch5.levels.find(l => l.levelId === 506);
  if (lv506) {
    lv506.teachingGoal = '第五章综合测试：嵌套笼、异形笼、复合笼、多宫45法则+之前所有技巧的终极考验。';
    lv506.title = '第6关：星辰梭试炼';
    lv506.difficulty = '中等偏难';
    lv506.mode = 'comprehensive';
    lv506.triggers = buildTriggers(lv506, {
      startText: '📜 星辰梭核心试炼！这是设局人留下的核心谜题——所有笼型技巧的终极考验！',
      firstFillText: '勇敢的第一步！星辰梭的转动从这里开始！',
      stuckText20s: '💡 卡住了？回到基础——45法则、数对、区块、笼组合，它们永远是最可靠的武器！',
      stuckText40s: '💡 深呼吸，从另一个角落重新开始。有时候盘面最难的部分恰恰不是突破口，简单处才是入口！',
      breakthroughText: '⚡ 破局时刻！星辰梭的核心齿轮开始转动，谜题一层层瓦解！',
      finishingText: '✨ 收官！精英侦探徽章就在前方，最后一步不要松懈！',
      completeText: '🎉 恭喜征服星辰梭核心！精英侦探徽章已解锁！终局笼局——设局人最后的谜题在等着你！',
      badgeIdOnComplete: 'badge_c5_candidate',
      antiGuessText: '⚠️ 设局人在核心设下了陷阱——这个数字看似正确，但在全局中会导致矛盾！'
    });
  }

  // 重排键顺序
  data[ch5Index] = {
    chapterId: ch5.chapterId,
    title: ch5.title,
    subtitle: ch5.subtitle,
    icon: ch5.icon,
    color: ch5.color,
    description: ch5.description,
    badgeId: ch5.badgeId || BADGES.c5.id,
    badgeName: ch5.badgeName || BADGES.c5.name,
    unlockRequirement: ch5.unlockRequirement,
    badge: ch5.badge || BADGES.c5,
    introStory: ch5.introStory,
    endingStory: ch5.endingStory,
    levels: ch5.levels
  };
}

// ============================================================
// 第6章（chapterId=6）
// ============================================================
const ch6Index = data.findIndex(c => c.chapterId === 6);
const ch6 = data[ch6Index];
if (ch6) {
  console.log('处理第6章...');
  if (!ch6.badge) ch6.badge = BADGES.c6;

  ch6.levels.forEach((lv, idx, arr) => {
    const isLast = idx === arr.length - 1;
    lv.mode = determineMode(lv, isLast, false);
    ensureFeatures(lv, true);
  });

  // 601 嵌套笼
  const lv601 = ch6.levels.find(l => l.levelId === 601);
  if (lv601) {
    lv601.teachingGoal = '终局笼局·一：深度嵌套笼与大笼和综合，多层嵌套结构的高级推理。';
    lv601.title = '第1关：终局入口';
    lv601.difficulty = '中等';
    lv601.triggers = buildTriggers(lv601, {
      startText: '📜 「你终于来到了终局。这里的每一个笼局都是我亲手布下——不要期望轻易通过。」——设局人',
      firstFillText: '第一格填对了，但这仅仅是开始。设局人的谜题层层设防！',
      stuckText20s: '💡 终局笼局难度陡增，但技巧不变——先算所有能算的差值和唯一组合，耐心积累优势！',
      stuckText40s: '💡 设局人的风格：前期线索极少，一旦突破势如破竹。坚持标记候选数，突破口一定会出现！',
      breakthroughText: '⚡ 破局时刻！你找到了设局人留下的第一道裂缝，冲进去！',
      finishingText: '✨ 收官！终局第一道防线被你攻破！',
      completeText: '🎉 终局第一关已破！设局人的谜题并非不可战胜！',
      antiGuessText: '⚠️ 设局人的陷阱无处不在——一个猜测就可能让你前功尽弃，用推理说话！'
    });
  }

  // 602 大笼和
  const lv602 = ch6.levels.find(l => l.levelId === 602);
  if (lv602) {
    lv602.teachingGoal = '终局笼局·二：大笼和分析——超大笼子（6格以上）的组合枚举与交叉约束。';
    lv602.title = '第2关：大笼迷踪';
    lv602.difficulty = '中等';
    lv602.triggers = buildTriggers(lv602, {
      startText: '📜 「大笼和——当笼子比宫还大，你还能看清真相吗？」',
      firstFillText: '好！大笼虽然格子多，但和值范围是有限的，组合数比想象中少！',
      stuckText20s: '💡 卡住了？大笼不要慌——用组合计算器枚举所有可能组合，再用行/列/宫约束逐一排除！',
      stuckText40s: '💡 大笼技巧：如果大笼里已经有确定的数字，从和值中减去它们，剩下来的子笼组合范围就小多了！',
      breakthroughText: '⚡ 破局时刻！大笼的唯一组合被你锁定，盘面瞬间打开！',
      finishingText: '✨ 收官！大笼的迷雾散去，答案就在眼前！',
      completeText: '🎉 大笼和已被你驾驭！再大的笼子也困不住你的推理！',
      antiGuessText: '⚠️ 大笼里填错一个数，后面所有组合都会错——务必确证！'
    });
  }

  // 603 极限推理
  const lv603 = ch6.levels.find(l => l.levelId === 603);
  if (lv603) {
    lv603.teachingGoal = '终局笼局·三：极限推理——需要45法则+组合+数对+区块的多步连锁推理。';
    lv603.title = '第3关：极限推理';
    lv603.difficulty = '中等偏难';
    lv603.triggers = buildTriggers(lv603, {
      startText: '📜 「极限推理——这一关需要你把学过的所有技巧串联成一条完整的推理链。」',
      firstFillText: '好！第一个环节打通了，继续延伸你的推理链！',
      stuckText20s: '💡 卡住了？这一关需要长链条推理——填完一个数后立即检查它打开了哪些新可能！',
      stuckText40s: '💡 极限推理策略：每确定一个数字，就更新它所在行/列/宫/笼的所有候选数，新的裸单/隐单/数对随时可能出现！',
      breakthroughText: '⚡ 破局时刻！推理链条上最关键的一环被你扣上了，后面一马平川！',
      finishingText: '✨ 收官！极限推理的长链已经到了最后一环！',
      completeText: '🎉 极限推理成功！你的逻辑链条已经无懈可击！',
      antiGuessText: '⚠️ 长链推理中一个错误会让后面全部崩塌——如果发现矛盾，立刻回到最近的确定点！'
    });
  }

  // 604 设局人谜题·一
  const lv604 = ch6.levels.find(l => l.levelId === 604);
  if (lv604) {
    lv604.teachingGoal = '设局人谜题·一：设局人亲手设计的高难度笼局，融合多种高级技巧。';
    lv604.title = '第4关：设局人谜题·一';
    lv604.difficulty = '困难';
    lv604.triggers = buildTriggers(lv604, {
      startText: '📜 「第一道谜题。我花了三天三夜设计它——看看你需要多久。」——设局人',
      firstFillText: '不错的开始。但设局人的谜题不会这么简单就让你看穿！',
      stuckText20s: '💡 设局人风格：他喜欢把最明显的线索藏在最复杂的笼子旁边——有没有被你忽略的简单45法则？',
      stuckText40s: '💡 这道题需要多次迭代：第一次扫描找到3-5个数字，第二次扫描基于新数字再找3-5个，耐心迭代！',
      breakthroughText: '⚡ 破局时刻！设局人的第一层伪装被你撕开了！',
      finishingText: '✨ 收官！设局人第一道谜题即将被你破解！',
      completeText: '🎉 设局人谜题·一已解！他的谜题并非不可破解——继续！',
      antiGuessText: '⚠️ 「你确定吗？再想想。」——设局人仿佛在看着你。每一步都要问自己：这是推理还是猜测？'
    });
  }

  // 605 设局人谜题·二
  const lv605 = ch6.levels.find(l => l.levelId === 605);
  if (lv605) {
    lv605.teachingGoal = '设局人谜题·二：更难的设局人笼局，需要极其敏锐的观察力和多技巧协同。';
    lv605.title = '第5关：设局人谜题·二';
    lv605.difficulty = '困难';
    lv605.triggers = buildTriggers(lv605, {
      startText: '📜 「第二道。比第一道更难。如果你在这里放弃，我不会怪你——大多数人都在这里止步。」——设局人',
      firstFillText: '勇气可嘉。但这道题的深度远超你的想象。',
      stuckText20s: '💡 卡住了？这道题的突破口不在笼子里，而在笼子与笼子之间的关系——仔细观察共享格子和重叠区域！',
      stuckText40s: '💡 设局人第二题的关键：多宫联合差值。单个宫找不到线索，试试两个宫甚至三个宫合起来看！',
      breakthroughText: '⚡ 破局时刻！你找到了设局人都觉得隐蔽的突破口！',
      finishingText: '✨ 收官！设局人第二道谜题即将倒下，最后的终极笼局在等着你！',
      completeText: '🎉 设局人谜题·二已解！你已经超越了绝大多数侦探，终极笼局就在前方！',
      antiGuessText: '⚠️ 「接近了，但还不够。」——这个错误会让你在最后阶段陷入死局，回头是岸！'
    });
  }

  // 606 终局试炼（comprehensive）
  const lv606 = ch6.levels.find(l => l.levelId === 606);
  if (lv606) {
    lv606.teachingGoal = '终局试炼：设局人最终谜题，全技巧最高难度综合挑战。';
    lv606.title = '第6关：终极笼局';
    lv606.difficulty = '困难';
    lv606.mode = 'comprehensive';
    // 保留原有badge_award trigger
    const existingComplete = (lv606.triggers || []).find(t => t.condition === 'onLevelComplete');
    lv606.triggers = (lv606.triggers || []).filter(t => t.condition !== 'onLevelComplete');
    lv606.triggers = buildTriggers(lv606, {
      startText: '📜 「终极笼局。我毕生所学的结晶。如果你能解开它——你就有资格知道我和守笼人之间到底发生了什么。」——设局人',
      firstFillText: '第一步已落子。这是你和设局人最后的对弈！',
      stuckText20s: '💡 终极笼局包罗万象——深呼吸，从零开始：①标记候选数 ②扫所有45法则差值 ③找唯一组合笼 ④数对/三链数 ⑤区块排除 ⑥迭代！',
      stuckText40s: '💡 「推理到绝境时，回到最初的规则。」——三条铁律（行/列/宫不重复）永远是最后的武器。有没有违反铁律的候选数被你忽略了？',
      breakthroughText: '⚡ 破局时刻！终极笼局的核心被你击中，整个谜题开始崩塌！',
      finishingText: '✨ 收官！大师侦探徽章就在眼前，设局人的真相即将揭晓！',
      completeText: existingComplete ? existingComplete.text : '🎉 恭喜毕业！你已成为真正的杀手数独大师！设局人的秘密终于要揭开了！',
      badgeIdOnComplete: 'badge_c6_master',
      antiGuessText: '⚠️ 终极考验中不允许猜测！如果你需要猜，说明你还没有找到正确的推理路径——继续搜索！'
    });
  }

  // 重排键顺序
  data[ch6Index] = {
    chapterId: ch6.chapterId,
    title: ch6.title,
    subtitle: ch6.subtitle,
    icon: ch6.icon,
    color: ch6.color,
    description: ch6.description,
    badgeId: ch6.badgeId || BADGES.c6.id,
    badgeName: ch6.badgeName || BADGES.c6.name,
    unlockRequirement: ch6.unlockRequirement,
    badge: ch6.badge || BADGES.c6,
    introStory: ch6.introStory,
    endingStory: ch6.endingStory,
    levels: ch6.levels
  };
}

// ============================================================
// 第7章（chapterId=7）
// ============================================================
const ch7 = data.find(c => c.chapterId === 7);
if (ch7) {
  console.log('处理第7章...');
  ch7.levels.forEach((lv, idx, arr) => {
    // 第7章用户要求所有关卡mode="endgame"（残局教学关）
    lv.mode = 'endgame';
    ensureFeatures(lv, true);
  });

  // 701 保持现有三阶段框架，只补充缺失
  const lv701 = ch7.levels.find(l => l.levelId === 701);
  if (lv701) {
    // 701已有onLevelStart, breakthrough(c27), stuck20s→breakthrough, stuck30s, finishing(c60)
    // 需要补充：onFirstNumberFilled（可选，残局关不一定有），onLevelComplete，onConflict
    // 还需要stuck 40s
    const triggers = [...(lv701.triggers || [])];
    triggers.forEach((t, i) => { if (!t.id) t.id = `t701_auto_${i}`; });

    const pc = phaseCounts(lv701);

    // onLevelComplete
    if (!hasTrigger(triggers, 'onLevelComplete')) {
      triggers.push({
        id: 't701_c',
        condition: 'onLevelComplete',
        type: 'popup_hint',
        position: 'top',
        text: '🎉 数对之锁已解！显性数对成为你 repertory 中的第一件秘术武器。下一卷：隐性之钥。',
        once: true
      });
    }
    // antiGuess
    if (!hasTrigger(triggers, 'onConflict')) {
      triggers.push({
        id: 't701_ag',
        condition: 'onConflict',
        type: 'popup_hint',
        position: 'top',
        text: '⚠️ 秘术档案中的错误尤其致命——确认这个数字真的被数对排除了吗？',
        once: false
      });
    }
    // 40s stuck (if not already have one between 35-45)
    if (!triggers.some(t => t.condition === 'onStuckForSeconds' && t.seconds >= 35 && t.seconds <= 50 && t.type === 'popup_hint')) {
      triggers.push({
        id: 't701_st40',
        condition: 'onStuckForSeconds',
        seconds: 40,
        type: 'popup_hint',
        position: 'top',
        text: '💡 再提示：数对的关键是「两个格子，恰好两个候选数，在同一个区域」。先找到所有只有两个候选数的格子，再看它们的候选数是否完全相同！',
        once: false
      });
    }
    // breakthrough 提示文本（如果没有popup_hint for breakthrough）
    if (!triggers.some(t => t.phase === 'breakthrough' && t.type === 'popup_hint')) {
      triggers.push({
        id: 't701_bt',
        condition: 'onFillCountReached',
        count: pc.breakCount,
        type: 'popup_hint',
        position: 'top',
        text: '⚡ 破局时刻！你找到了关键的数对，排除生效后盘面开始加速！',
        once: true,
        delay: 400
      });
    }
    // finishing 提示文本
    if (!triggers.some(t => t.phase === 'finishing' && t.type === 'popup_hint')) {
      triggers.push({
        id: 't701_fit',
        condition: 'onFillCountReached',
        count: pc.finishCount,
        type: 'popup_hint',
        position: 'top',
        text: '✨ 收官！数对排除的余波扫清了最后的障碍！',
        once: true,
        delay: 400
      });
    }
    lv701.triggers = triggers;
  }

  // 702 隐性之钥（Hidden Pair）
  const lv702 = ch7.levels.find(l => l.levelId === 702);
  if (lv702) {
    // 保留现有onLevelStart和onStuckForSeconds:35s，补充三阶段框架
    lv702.triggers = buildTriggers(lv702, {
      firstFillText: '对了！隐性数对被你发现了——虽然格子有多个候选，但2和7只能在这两格！',
      stuckText20s: '💡 卡住了？隐性数对要「看数字不看格」：找两个数字，看它们在某行/列/宫里的可能位置，如果恰好是相同两格，就是隐性数对！',
      stuckText40s: '💡 隐性数对比显性数对更隐蔽：这两个格子上可能还有其他候选数，但那些数字可以被删除！善用候选数笔记！',
      breakthroughText: '⚡ 破局时刻！隐性数对被你揪出，多余候选一扫而空！',
      finishingText: '✨ 收官！隐性之钥打开了通往答案的最后一道门！',
      completeText: '🎉 隐性数对已掌握！「显看格，隐看数」——数对的两种形态尽在掌握！',
      antiGuessText: '⚠️ 隐性数对要确认这两个数字真的只在这两个格子里——漏掉一个位置就会错删候选！'
    });
  }

  // 703 三链之阵（Naked Triple）
  const lv703 = ch7.levels.find(l => l.levelId === 703);
  if (lv703) {
    lv703.triggers = buildTriggers(lv703, {
      firstFillText: '找到了！三个格子恰好包含三个数字——三链数锁定！',
      stuckText20s: '💡 卡住了？找三个格子，它们的候选数合起来恰好是三个不同的数字（比如{3,5,8}的各种组合）！',
      stuckText40s: '💡 三链数不要求每格都有三个候选！{3,5}{5,8}{3,8}也是有效的三链数，关键是三个格子合起来恰好三个数字！',
      breakthroughText: '⚡ 破局时刻！三链数被锁定，三个数字从同区域其他格子中全部排除！',
      finishingText: '✨ 收官！三链之阵已破，最后的数字自然浮现！',
      completeText: '🎉 三链数已精通！从数对到三链，你的模式识别能力更上一层楼！',
      antiGuessText: '⚠️ 三链数判断：如果三个格子合起来有四个或更多不同候选数，就不是三链数！'
    });
  }

  // 704 X翼构型（X-Wing）
  const lv704 = ch7.levels.find(l => l.levelId === 704);
  if (lv704) {
    lv704.triggers = buildTriggers(lv704, {
      firstFillText: '好！X-Wing的矩形顶点被你标记出来了——这是构型推理的起点！',
      stuckText20s: '💡 卡住了？X-Wing找法：选一个数字，找两行中这个数字都恰好只能出现在相同两列的位置——这四个格子形成矩形！',
      stuckText40s: '💡 X-Wing口诀：「两行两列四顶点，矩形对角必选二；同列其他皆可删，X翼展翅破迷局。」逐数字扫描1-9！',
      breakthroughText: '⚡ 破局时刻！X-Wing的翅膀展开了，同列其他位置的该数字被全部排除！',
      finishingText: '✨ 收官！X翼构型的威力完全释放，最后几格一览无余！',
      completeText: '🎉 X-Wing已掌握！你正式进入了构型推理的领域！',
      antiGuessText: '⚠️ X-Wing要求这两行里这个数字只能出现在这两列（不能有第三列），否则就不是X-Wing！'
    });
  }

  // 705 剑鱼构型（Swordfish）
  const lv705 = ch7.levels.find(l => l.levelId === 705);
  if (lv705) {
    lv705.triggers = buildTriggers(lv705, {
      firstFillText: '好眼力！剑鱼的三行三列轮廓开始显现了！',
      stuckText20s: '💡 卡住了？剑鱼是X-Wing的三行版：找一个数字，在三行中都只能出现在相同的三列里——九个格子形成网状！',
      stuckText40s: '💡 剑鱼不要求每一行都有三个位置——每行只要有2-3个，且全部落在相同三列内即可！逐数字耐心扫描！',
      breakthroughText: '⚡ 破局时刻！剑鱼构型被你发现，三列中其他位置的该数字被全部清除！',
      finishingText: '✨ 收官！剑鱼入海，最后的谜题随之瓦解！',
      completeText: '🎉 剑鱼构型已征服！你掌握了最强大的高级构型之一！',
      antiGuessText: '⚠️ 剑鱼构型复杂——确认这三行中该数字的所有可能位置确实都在这三列里，一个都不能漏到第四列！'
    });
  }

  // 706 秘术大师（endgame comprehensive，但用户说endgame）
  const lv706 = ch7.levels.find(l => l.levelId === 706);
  if (lv706) {
    lv706.triggers = buildTriggers(lv706, {
      firstFillText: '秘术终极挑战的第一步！数对、三链、X-Wing、剑鱼——全部用上！',
      stuckText20s: '💡 卡住了？按系统顺序排查：裸单→隐单→显性数对→隐性数对→三链数→X-Wing→剑鱼，层层递进！',
      stuckText40s: '💡 秘术大师的提示：高级盘面前期最容易遗漏的是隐单（Hidden Single）！在找构型之前，先确保所有隐单都已填出！',
      breakthroughText: '⚡ 破局时刻！五大秘术技巧协同发力，终极谜题开始崩塌！',
      finishingText: '✨ 收官！秘术大师徽章即将加冕，最后的真相就在眼前！',
      completeText: '🎉 恭喜成为秘术大师！五大高级技巧——显性数对、隐性数对、三链数、X-Wing、剑鱼——全部掌握！',
      badgeIdOnComplete: 'badge_c7_master',
      antiGuessText: '⚠️ 秘术终极考验容不得半点猜测！每一个构型都要严格验证，否则差之毫厘谬以千里！'
    });
  }
}

// ============================================================
// 第1章保持不变（chapterId=1）
// ============================================================

// ============================================================
// 写回文件
// ============================================================
console.log('写入新的 chapters.json ...');
const output = JSON.stringify(data, null, 2);
fs.writeFileSync(SRC, output, 'utf8');
console.log('✅ 完成！新的 chapters.json 已写入:', SRC);
console.log('原文件备份在:', BACKUP);

// 验证
const verify = JSON.parse(fs.readFileSync(SRC, 'utf8'));
console.log('\n=== 验证结果 ===');
for (const ch of verify) {
  if (ch.chapterId < 2 || ch.chapterId > 7) continue;
  console.log(`\n第${ch.chapterId}章: ${ch.title}`);
  console.log(`  badge: ${ch.badge ? '✓' : '✗'}`);
  console.log(`  introStory/endingStory 位置: ${Object.keys(ch).indexOf('introStory') < Object.keys(ch).indexOf('levels') ? '✓ 在levels前' : '✗ 在levels后'}`);
  for (const lv of ch.levels) {
    const triggers = lv.triggers || [];
    const hasStart = hasTrigger(triggers, 'onLevelStart');
    const hasFirstFill = hasTrigger(triggers, 'onFirstNumberFilled');
    const hasStuck20 = triggers.some(t => t.condition === 'onStuckForSeconds' && t.seconds <= 25);
    const hasStuck40 = triggers.some(t => t.condition === 'onStuckForSeconds' && t.seconds >= 35);
    const hasBreak = triggers.some(t => t.phase === 'breakthrough');
    const hasFinish = triggers.some(t => t.phase === 'finishing');
    const hasComplete = hasTrigger(triggers, 'onLevelComplete');
    const hasConflict = hasTrigger(triggers, 'onConflict');
    const autoFill = lv.features ? lv.features.autoFillCandidates : undefined;
    const marks = [
      `mode=${lv.mode}`,
      `autoFill=${autoFill}`,
      `start=${hasStart ? '✓' : '✗'}`,
      `firstFill=${hasFirstFill ? '✓' : '✗'}`,
      `stuck20=${hasStuck20 ? '✓' : '✗'}`,
      `stuck40=${hasStuck40 ? '✓' : '✗'}`,
      `break=${hasBreak ? '✓' : '✗'}`,
      `finish=${hasFinish ? '✓' : '✗'}`,
      `complete=${hasComplete ? '✓' : '✗'}`,
      `antiGuess=${hasConflict ? '✓' : '✗'}`
    ].join(' ');
    console.log(`  L${lv.levelId}: ${marks}`);
  }
}
