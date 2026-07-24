// HintSystem - Enhanced hint system for cagemaster3
// 重构版：底层推理完全基于 TechRater 求解引擎
// 支持三级渐进提示、角色技巧对话、证据链解释
//
// 架构：
//   TechRater（推理核心：算什么、怎么推）
//       ↓
//   HintSystem（提示编排：说什么、分几级说）
//       ↓
//   TeachingSystem（教学适配：根据掌握度调整起始等级）
//       ↓
//   ExpressionDirector（角色表达：谁说、怎么说）

;(function(global) {
  'use strict';

  // ========================================================
  //  角色定义
  // ========================================================
  const HINT_CHARACTERS = [
    { id: 'ayan', name: '阿妍', weight: 0.6 },
    { id: 'cagekeeper', name: '守笼人', weight: 0.3 },
    { id: 'ying', name: '莹莹', weight: 0.1 },
  ];

  // ========================================================
  //  技巧中文名映射（与 TechRater 对齐）
  //  兼容旧名称（向后兼容）
  // ========================================================
  const TECHNIQUE_NAMES = {
    nakedSingle: '裸单法',
    cageUnique: '笼子唯一组合',
    hiddenSingle: '隐单法',
    rule45: '45法则',
    nakedPair: '裸数对',
    hiddenPair: '隐数对',
    pointingClaiming: '区块排除',
    nakedTriplet: '裸三数组',
    xWing: '二连纵横阵',
    swordfish: '三才游鱼阵',
  };

  // 向后兼容：旧技巧ID → 新技巧ID
  const LEGACY_TECH_MAP = {
    pointingPair: 'pointingClaiming',
    cageSumDeduction: 'cageUnique',
    cageSumPair: 'cageUnique',
  };

  // ========================================================
  //  技巧难度顺序（从易到难，与 TechRater 对齐）
  // ========================================================
  const TECHNIQUE_PRIORITY = [
    'nakedSingle',
    'cageUnique',
    'hiddenSingle',
    'rule45',
    'nakedPair',
    'hiddenPair',
    'pointingClaiming',
    'nakedTriplet',
    'xWing',
    'swordfish',
  ];

  // ========================================================
  //  角色对话（基础 + 技巧专属
  // ========================================================
  const HINT_DIALOGUES = {
    ayan: {
      // 基础对话（向后兼容）
      start: '让我看看...',
      target: '这个格子，试试这个数字。',
      wrong: '不对，换个思路。',
      encouragement: '继续，你能行的。',

      // 技巧专属对话
      techniques: {
        nakedSingle: [
          '这一格的候选数已经被排除得只剩一个了。',
          '候选数只剩一个，答案就在眼前。',
          '排除法到了极致——唯一剩下的数字就是答案。',
          '看看这一格的笔记，只剩一种可能。',
          '所有排除都指向同一个数字。',
        ],
        cageUnique: [
          '笼子的和值会告诉你很多秘密。',
          '算算这个笼子还缺多少，答案就缩小了。',
          '笼和约束——剩下的格子只能是这些组合。',
          '和值是笼子的语言，听懂它就能缩小范围。',
          '用笼和反推，候选数会大幅减少。',
        ],
        hiddenSingle: [
          '这一行里，某个数字只有一个容身之处。',
          '隐单——数字在暗中已经确定了位置。',
          '仔细看，这个数字在这一列只能放在那里。',
          '表面上候选很多，实际上某个数字别无选择。',
          '宫的范围里，有一个数字被锁定了。',
        ],
        rule45: [
          '星衡法则——这一宫的和，减去已知的数...',
          '45是九宫的总和，内突外突由此而来。',
          '伸出宫的那格，它的值可以用45法则算出。',
          '这就是星衡法则的奥义：全宫之和为45。',
          '内突之数，笼和减45可得。',
          '外突之数，45减笼和即知。',
        ],
        nakedPair: [
          '两个格子共享两个候选，它们就锁定了这两个数。',
          '裸数对——同行同列中两个格子只剩相同的两个数。',
          '这两个格子互相制约，其他格可以排除这两个数。',
          '数对是数独的基础武器，掌握它事半功倍。',
          '两颗候选、两格之地——答案就在其中。',
        ],
        hiddenPair: [
          '隐数对——两个数字藏在同一组格子里。',
          '表面上候选很多，其实有两个数字被锁定了。',
          '两个数字、两格之地——隐数对的奥义。',
          '把候选数倒过来看，隐数对就会浮现。',
        ],
        pointingClaiming: [
          '某宫中的某个数字被限制在同一行或列。',
          '区块排除——一个数字的位置指向了更大的范围。',
          '这个数字在这一宫里只能出现在这一行。',
          '指对数对：从宫看向行/列，排除就在眼前。',
          '锁定区块，就能排除其他宫的可能。',
        ],
        nakedTriplet: [
          '三个格子共享三个候选数，这就是裸三数组。',
          '三子法——三格三数，锁定了整个区域。',
          '这三格互相制约，其他格可以排除这三个数。',
          '从数对到三数组，进阶的钥匙。',
        ],
        xWing: [
          '二连纵横阵——两行两列，构成一个矩形。',
          'X-Wing的精髓：对角线上的数字互相锁定。',
          '四个格子、两个数字、一个结论。',
          '高级技巧的入门——二连纵横阵。',
        ],
        swordfish: [
          '三才游鱼阵——三行三列的高阶技巧。',
          'Swordfish是X-Wing的进阶，三条鱼游过三行。',
          '三个数字、三列，排除就在其中。',
          '这是高阶技巧——三才游鱼阵。',
        ],
      },
    },

    cagekeeper: {
      // 基础对话（向后兼容）
      start: '观察一下盘面。',
      target: '这里可以确定。',
      wrong: '再想想。',
      encouragement: '基础要打牢。',

      // 技巧专属对话
      techniques: {
        nakedSingle: [
          '这一格，只剩一个可能了。',
          '基础的排除法，做到极致便是裸单。',
          '候选数逐一排除，最后剩下的就是答案。',
          '把笔记做扎实，裸单自然会出现。',
          '这是最基础也最可靠的技巧。',
        ],
        cageUnique: [
          '笼子是有生命的，它的和值在诉说。',
          '看看这个笼子还需要多少，思路就清晰了。',
          '笼和约束是杀手数独的根基。',
          '先算和，再排除，笼子会指引你。',
          '每一个笼子都是一道小算术题。',
        ],
        hiddenSingle: [
          '某一行里，有个数字被藏起来了。',
          '隐单——看起来复杂，其实只有一种可能。',
          '换个角度看，这一列里某个数字别无去处。',
          '不要只盯着单个格子，要看数字的位置。',
          '宫里面，这个数字只能在那格。',
        ],
        rule45: [
          '45法则，是破解牢笼的第一把钥匙。',
          '记住：九宫之和恒为45。',
          '内突外突，皆由45而生。',
          '这一格跨出了宫，它的值可以推导出来。',
          '星衡法则——天平两端，差值即为答案。',
        ],
        nakedPair: [
          '两行两格，共享两数——这便是裸数对。',
          '基础中的进阶：数对排除法。',
          '两个格子，两个候选，排除同行其他格。',
          '掌握数对，你的解题速度会翻倍。',
          '这两个格子互相锁定，其他格可以排除。',
        ],
        hiddenPair: [
          '隐数对藏在候选之间。',
          '两个数字只在两格里出现，它们被锁定了。',
          '表面看不出来，细看候选就会发现——隐数对。',
          '这是进阶的基础：隐数对。',
        ],
        pointingClaiming: [
          '区块排除是进阶的敲门砖。',
          '一个数字在宫内被限制在同一行。',
          '从宫中看向行，答案在排除之外。',
          '指对数对：锁定区块，排除其他。',
          '这是从局部到整体的思维跳跃。',
        ],
        nakedTriplet: [
          '裸三数组是数对的延伸。',
          '三格三数，基础中的进阶。',
          '三个格子共享三个候选，排除其他格。',
          '三子法，是进阶的必经之路。',
        ],
        xWing: [
          '二连纵横阵，是高阶的入门。',
          'X-Wing：两行两列，四个格子。',
          '矩形的四个角，藏着排除的秘密。',
          '这是高阶技巧的起点。',
        ],
        swordfish: [
          '三才游鱼阵，是高阶的技巧。',
          '三行三列，如鱼游其中。',
          'Swordfish：三条线，三个数字。',
          '这是高阶中的高阶技巧。',
        ],
      },
    },

    ying: {
      // 基础对话（向后兼容）
      start: '我来看看！',
      target: '这个格子是这个数！',
      wrong: '诶？不对吗？',
      encouragement: '加油加油！',

      // 技巧专属对话
      techniques: {
        nakedSingle: [
          '哇，这格只剩一个数字了！',
          '答案就写在笔记里，只剩一个啦！',
          '快看快看，这格的候选数只剩一个！',
          '裸单裸单！就是这个数！',
          '排除掉所有不可能，剩下的就是答案~',
        ],
        cageUnique: [
          '算一下笼子还缺多少！',
          '笼子的和值超好用的，能排除好多数！',
          '哇，用笼和一算，候选数少了一半！',
          '这个笼子加起来要等于那个数，所以...',
          '笼和推导大法好！',
        ],
        hiddenSingle: [
          '这个数字只能在这里哦！',
          '嘿嘿，我找到啦，它藏在这一行！',
          '这个数字没地方可去了，只能在这！',
          '隐单！看起来有很多候选，其实这个数被锁定了！',
          '这一列里，这个数只能放那格~',
        ],
        rule45: [
          '45法则好神奇！一下就知道答案了！',
          '哇塞，这就是45法则吗？太酷了！',
          '用45减一减，答案就出来啦！',
          '星衡法则！伸出宫的那个格子可以直接算！',
          '内突外突我都学会啦~',
        ],
        nakedPair: [
          '哇！这两个格子的候选数一模一样！',
          '裸数对好好玩！两个格子锁定两个数字！',
          '嘿嘿，找到啦！这两个格子都是这两个候选！',
          '数对魔法！其他格子都不能有这两个数啦~',
          '两颗双子星！它们就是一个小宇宙！',
        ],
        hiddenPair: [
          '哇！隐数对好神秘！',
          '两个数字藏在两格里，好酷！',
          '嘿嘿，我发现了一对隐藏的数对！',
          '隐数对魔法！它们偷偷锁定了数字~',
          '藏起来的数对也逃不过我的眼睛！',
        ],
        pointingClaiming: [
          '这个数字只能在这一行出现哦！',
          '区块排除好聪明！从宫看到行！',
          '哇，一指就排除了好多数字！',
          '指对数对！像箭一样指向答案！',
          '这个数字被关在这一行里了~',
        ],
        nakedTriplet: [
          '哇！三个格子的候选数都一样！',
          '裸三数组好厉害！三格锁定三个数！',
          '嘿嘿，三子法！三个格子一个小团体！',
          '三数组魔法！其他格子都不能有这三个数啦~',
          '三颗星组成的小宇宙！',
        ],
        xWing: [
          '哇！二连纵横阵听起来好酷！',
          'X-Wing！像个大大的X！',
          '四个格子组成矩形，好神奇！',
          '高阶技巧我也学会啦~',
          '二连纵横！像翅膀一样！',
        ],
        swordfish: [
          '三才游鱼阵！听起来好厉害！',
          '哇塞，Swordfish！像剑鱼一样！',
          '三行三列的大阵法！',
          '这是超级厉害的技巧诶！',
          '游鱼游过三行三列~',
        ],
      },
    },
  };

  // ========================================================
  //  HintSystem 类
  // ========================================================
  class HintSystem {
    constructor(board, solution, options = {}) {
      this.board = board;
      this.solution = solution;
      this.hintCount = 0;
      this.lastHintTime = 0;
      this.cooldownMs = 5000;

      // 教学系统集成（可选）
      this.teachingSystem = options.teachingSystem || null;

      // 三级渐进提示状态
      // key: technique + target cell signature, value: current level (1-3)
      this._hintProgress = new Map();
      this._lastDeduction = null;

      // TechRater 实例缓存（每次 getHint 时重建，因为盘面会变）
      this._techRater = null;
    }

    /**
     * 获取当前选中格子的提示
     * 向后兼容：返回 { character, dialogue, target, hintType }
     * 增强版：包含推导信息
     * @returns {Object|null}
     */
    getHint() {
      if (!this.board || !this.solution) return null;

      // 冷却检查
      const now = Date.now();
      if (now - this.lastHintTime < this.cooldownMs) {
        return null;
      }
      this.lastHintTime = now;
      this.hintCount++;

      // 基于 TechRater 查找下一步推导
      const deduction = this._findNextDeduction();

      if (!deduction) {
        // 降级：找任意空格（原始行为）
        const target = this._findTargetCell();
        if (!target) {
          return {
            character: 'cagekeeper',
            characterName: '守笼人',
            dialogue: HINT_DIALOGUES.cagekeeper.encouragement,
            target: null,
            hintType: 'complete',
            hintLevel: 0,
          };
        }

        const character = this._selectCharacter();
        const dialogues = HINT_DIALOGUES[character.id];

        return {
          character: character.id,
          characterName: character.name,
          dialogue: dialogues.start + ' ' + dialogues.target,
          target,
          hintType: 'target',
          hintLevel: 3,
          technique: 'directAnswer',
        };
      }

      // 渐进式提示：确定等级
      const progressKey = this._makeProgressKey(deduction);
      let currentLevel = this._hintProgress.get(progressKey) || 0;

      // 根据教学系统确定起始提示等级
      let startLevel = 1;
      if (this.teachingSystem) {
        startLevel = this.teachingSystem.getHintLevel(deduction.technique);
      }

      // 升级：每次点击提示按钮，提示等级 +1
      // 到 Level 3 后保持（不升级了）
      // 换一格新提示，等级重置为 Level 1（由 progressKey 不同自然重置）
      currentLevel = Math.min(Math.max(currentLevel + 1, startLevel), 3);
      this._hintProgress.set(progressKey, currentLevel);
      this._lastDeduction = deduction;

      // 记录教学系统遭遇
      let teachingDialog = null;
      if (this.teachingSystem) {
        this.teachingSystem.recordEncounter(deduction.technique);
        if (this.teachingSystem.isFirstEncounter(deduction.technique)) {
          teachingDialog = this.teachingSystem.getTeachingDialog(deduction.technique);
        }
      }

      // 选择角色
      const character = this._selectCharacter();

      // 根据技巧和等级生成角色对话
      const dialogue = this._generateDialogue(character.id, deduction, currentLevel);

      // 根据等级构建目标信息
      const target = this._buildTarget(deduction, currentLevel);

      return {
        character: character.id,
        characterName: character.name,
        dialogue,
        target,
        hintType: 'deduction',
        hintLevel: currentLevel,
        technique: deduction.technique,
        techniqueName: TECHNIQUE_NAMES[deduction.technique] || deduction.technique,
        explanation: deduction.explanation,
        targetCells: deduction.targetCells,
        relatedCages: deduction.relatedCages || [],
        teachingDialog: teachingDialog,
        isFirstEncounter: !!teachingDialog,
        // 证据链（Level 3 可用）
        evidence: deduction.evidence || null,
        eliminationSteps: deduction.eliminationSteps || 0,
      };
    }

    // ========================================================
    //  底层推理：基于 TechRater
    // ========================================================

    /**
     * 从当前盘面状态查找下一步推导
     * 底层使用 TechRater.findNextStep()
     * @returns {Object|null} 统一格式的推导结果
     */
    _findNextDeduction() {
      // 确保候选数是最新的
      if (this.board.updateCandidates) {
        this.board.updateCandidates();
      }

      // 创建 TechRater 实例
      let techRater;
      try {
        if (typeof TechRater !== 'undefined') {
          techRater = new TechRater(this.board);
        } else if (global.TechRater) {
          techRater = new global.TechRater(this.board);
        } else {
          // 降级：返回 null
          return null;
        }
      } catch (e) {
        console.warn('HintSystem: TechRater 初始化失败', e);
        return null;
      }

      const step = techRater.findNextStep();
      if (!step) return null;

      // 将 TechRater 的结果转换为 HintSystem 的 deduction 格式
      return this._convertTechRaterResult(step);
    }

    /**
     * 将 TechRater 的 findNextStep 结果转换为 HintSystem 内部格式
     * @param {Object} step - TechRater.findNextStep() 返回值
     * @returns {Object} deduction 对象
     */
    _convertTechRaterResult(step) {
      const { row, col, num, technique, techniqueName, depth, evidence } = step;

      // 目标格
      const targetCell = { row, col, value: num };

      // 关联笼子
      const relatedCages = this._getCageIdsForCell(row, col);

      // 区域信息（用于 Level 1/2 提示）
      const region = this._buildRegionFromEvidence(evidence, technique, row, col);

      // 解释文本
      const explanation = this._buildExplanation(step, evidence, technique);

      // 目标格子列表（不同技巧有不同数量的目标格）
      const targetCells = this._buildTargetCells(step, evidence, technique);

      return {
        technique,
        techniqueName,
        depth,
        explanation,
        targetCells,
        relatedCages,
        region,
        evidence,
        eliminationSteps: evidence ? (evidence.eliminatedPositions ? evidence.eliminatedPositions.length : 0) : 0,
        // 向后兼容字段
        pairValues: evidence && evidence.pairValues ? evidence.pairValues : null,
        pointingValue: evidence && evidence.pointingValue ? evidence.pointingValue : num,
        pointingDirection: evidence && evidence.pointingDirection ? evidence.pointingDirection : null,
        pointingIndex: evidence && evidence.pointingIndex !== undefined ? evidence.pointingIndex : null,
        pairCombinations: evidence && evidence.combos ? evidence.combos : null,
        allPossibleNums: evidence && evidence.allPossibleNums ? evidence.allPossibleNums : null,
      };
    }

    /**
     * 从证据构建区域信息
     */
    _buildRegionFromEvidence(evidence, technique, row, col) {
      if (!evidence) {
      // 默认：单元格级别
        return { type: 'cell', row, col };
      }

      // 隐单：行/列/宫
      if (technique === 'hiddenSingle' && evidence.scopeType) {
        return {
          type: evidence.scopeType,
          index: evidence.scopeIndex,
        };
      }

      // 45法则：行/列/宫
      if (technique === 'rule45' && evidence.scopeType) {
        return {
          type: evidence.scopeType,
          index: evidence.scopeIndex,
        };
      }

      // 笼子唯一组合：笼子
      if (technique === 'cageUnique' && evidence.cageId !== undefined) {
        return {
          type: 'cage',
          cageId: evidence.cageId,
        };
      }

      // 裸数对 / 隐数对：根据 evidence.pairCells 或默认行
      if (technique === 'nakedPair' || technique === 'hiddenPair') {
        if (evidence.scopeType) {
          return { type: evidence.scopeType, index: evidence.scopeIndex };
        }
        return { type: 'row', index: row };
      }

      // 区块排除：宫
      if (technique === 'pointingClaiming') {
        if (evidence.boxIndex !== undefined) {
          return { type: 'box', index: evidence.boxIndex };
        }
        return { type: 'cell', row, col };
      }

      // 裸三数组
      if (technique === 'nakedTriplet') {
        if (evidence.scopeType) {
          return { type: evidence.scopeType, index: evidence.scopeIndex };
        }
        return { type: 'row', index: row };
      }

      // X-Wing / Swordfish：行级别
      if (technique === 'xWing' || technique === 'swordfish') {
        return { type: 'row', index: row };
      }

      // 默认
      return { type: 'cell', row, col };
    }

    /**
     * 构建解释文本
     */
    _buildExplanation(step, evidence, technique) {
      const { row, col, num } = step;
      const pos = `第${row + 1}行第${col + 1}列`;
      const techName = TECHNIQUE_NAMES[technique] || technique;

      if (!evidence) {
        return `${techName}：${pos} = ${num}`;
      }

      // 根据技巧类型构建不同的解释
      if (technique === 'nakedSingle') {
        const eliminated = evidence.eliminated || [];
        return `${pos}只剩候选数${num}（已排除${eliminated.length}个数字）`;
      }

      if (technique === 'hiddenSingle') {
        const scopeLabel = this._scopeLabel(evidence.scopeType, evidence.scopeIndex);
        return `${scopeLabel}的数字${num}只能在${pos}`;
      }

      if (technique === 'cageUnique') {
        return `笼和为${evidence.cageSum}的笼子有${evidence.comboCount}种组合，数字${num}只能在${pos}`;
      }

      if (technique === 'rule45') {
        const scopeLabel = this._scopeLabel(evidence.scopeType, evidence.scopeIndex);
        const type = evidence.subType === 'innie' ? '内突' : '外突';
        return `${scopeLabel}的${type}：${pos} = ${num}（${evidence.cageSum || '45法则'}）`;
      }

      if (technique === 'nakedPair') {
        const vals = (evidence.pairValues || []).join('和');
        return `裸数对：候选数${vals}锁定了两格`;
      }

      if (technique === 'hiddenPair') {
        const vals = (evidence.pairValues || []).join('和');
        return `隐数对：数字${vals}只出现在两格`;
      }

      if (technique === 'pointingClaiming') {
        const dirLabel = evidence.pointingDirection === 'row'
          ? `第${evidence.pointingIndex + 1}行`
          : `第${evidence.pointingIndex + 1}列`;
        return `区块排除：数字${num}被锁定在${dirLabel}`;
      }

      if (technique === 'nakedTriplet') {
        const vals = (evidence.tripletValues || []).join('、');
        return `裸三数组：候选数${vals}锁定了三格`;
      }

      if (technique === 'xWing') {
        return `二连纵横阵：数字${num}的X-Wing结构`;
      }

      if (technique === 'swordfish') {
        return `三才游鱼阵：数字${num}的Swordfish结构`;
      }

      return `${techName}：${pos} = ${num}`;
    }

    /**
     * 构建目标格子列表
     */
    _buildTargetCells(step, evidence, technique) {
      const { row, col, num } = step;

      // 对于裸数对/隐数对：返回数对的两个格子
      if (technique === 'nakedPair' || technique === 'hiddenPair') {
        if (evidence && evidence.pairCells) {
          return evidence.pairCells.map(([r, c]) => ({
            row: r,
            col: c,
            values: evidence.pairValues || [],
          }));
        }
        // 退化情况：只返回目标格
        return [{ row, col, value: num }];
      }

      // 对于区块排除：返回区块内的格子
      if (technique === 'pointingClaiming') {
        if (evidence && evidence.blockCells) {
          return evidence.blockCells.map(([r, c]) => ({ row: r, col: c }));
        }
        return [{ row, col, value: num }];
      }

      // 对于裸三数组：返回三个格子
      if (technique === 'nakedTriplet') {
        if (evidence && evidence.tripletCells) {
          return evidence.tripletCells.map(([r, c]) => ({
            row: r,
            col: c,
            values: evidence.tripletValues || [],
          }));
        }
        return [{ row, col, value: num }];
      }

      // 默认：单格
      return [{ row, col, value: num }];
    }

    /**
     * 区域标签
     */
    _scopeLabel(scopeType, scopeIndex) {
      if (scopeType === 'row') return `第${scopeIndex + 1}行`;
      if (scopeType === 'col') return `第${scopeIndex + 1}列`;
      if (scopeType === 'box') return `第${scopeIndex + 1}宫`;
      return scopeType;
    }

    // ========================================================
    //  三级渐进提示
    // ========================================================

    /**
     * 生成提示进度的唯一键
     */
    _makeProgressKey(deduction) {
      const cells = deduction.targetCells || [];
      const cellKey = cells.map(c => `${c.row},${c.col}`).sort().join('|');
      return `${deduction.technique}:${cellKey}`;
    }

    /**
     * 根据提示等级构建目标信息
     * Level 1（方向）：只提示区域/相关笼子，不点名技巧
     * Level 2（技巧）：说出技巧名称和思路，不给具体答案
     * Level 3（答案）：完整答案 + 推导过程 + 证据链高亮
     */
    _buildTarget(deduction, level) {
      const technique = deduction.technique;
      const firstCell = deduction.targetCells[0];

      if (level >= 3) {
        // Level 3: 完整答案
        if (technique === 'nakedPair' || technique === 'hiddenPair') {
          return {
            cells: deduction.targetCells.map(c => ({ row: c.row, col: c.col })),
            values: deduction.pairValues || (deduction.evidence && deduction.evidence.pairValues) || [],
            type: 'pair',
          };
        }
        if (technique === 'pointingClaiming') {
          return {
            cells: deduction.targetCells.map(c => ({ row: c.row, col: c.col })),
            value: deduction.pointingValue || (firstCell && firstCell.value),
            type: 'pointing',
            direction: deduction.pointingDirection,
            directionIndex: deduction.pointingIndex,
          };
        }
        if (technique === 'nakedTriplet') {
          return {
            cells: deduction.targetCells.map(c => ({ row: c.row, col: c.col })),
            values: deduction.evidence && deduction.evidence.tripletValues ? deduction.evidence.tripletValues : [],
            type: 'triplet',
          };
        }
        if (technique === 'xWing' || technique === 'swordfish') {
          return {
            cells: deduction.targetCells.map(c => ({ row: c.row, col: c.col })),
            value: firstCell && firstCell.value,
            type: technique,
          };
        }
        if (technique === 'cageUnique') {
          return {
            cells: deduction.targetCells.map(c => ({ row: c.row, col: c.col })),
            value: firstCell && firstCell.value,
            combinations: deduction.pairCombinations || (deduction.evidence && deduction.evidence.combos),
            type: 'cageUnique',
          };
        }
        // 默认：单格带值
        if (firstCell && firstCell.value) {
          return { row: firstCell.row, col: firstCell.col, value: firstCell.value };
        }
        return { row: firstCell.row, col: firstCell.col, value: null };
      }

      if (level === 2) {
        // Level 2: 技巧级别 - 指向区域，不指精确单元格/值
        if (deduction.region) {
          return { region: deduction.region, value: null };
        }
        // 降级：第一个格子不带值
        return { row: firstCell.row, col: firstCell.col, value: null };
      }

      // Level 1: 方向 - 只给区域方向
      if (deduction.region) {
        return { region: deduction.region, value: null, vague: true };
      }
      return { row: firstCell.row, col: firstCell.col, value: null, vague: true };
    }

    // ========================================================
    //  角色对话生成
    // ========================================================

    /**
     * 根据技巧和提示等级生成角色对话
     */
    _generateDialogue(charId, deduction, level) {
      const charData = HINT_DIALOGUES[charId];
      if (!charData) return '';

      const technique = deduction.technique;
      const techniqueLines = charData.techniques && charData.techniques[technique];

      if (level === 1) {
        // Level 1: 模糊方向
        return this._getLevel1Dialogue(charId, deduction);
      }

      if (level === 2) {
        // Level 2: 说出技巧名，给出上下文
        return this._getLevel2Dialogue(charId, deduction, techniqueLines);
      }

      // Level 3: 完整答案 + 技巧解释
      return this._getLevel3Dialogue(charId, deduction, techniqueLines);
    }

    _getLevel1Dialogue(charId, deduction) {
      const charData = HINT_DIALOGUES[charId];
      const region = deduction.region;

      let regionHint = '';
      if (region) {
        if (region.type === 'row') {
          regionHint = `看看第${region.index + 1}行。`;
        } else if (region.type === 'col') {
          regionHint = `注意第${region.index + 1}列。`;
        } else if (region.type === 'box') {
          regionHint = `观察第${region.index + 1}宫。`;
        } else if (region.type === 'cage') {
          regionHint = '留意这个笼子。';
        } else if (region.type === 'cell') {
          regionHint = '仔细看这一格。';
        }
      }

      if (charId === 'ayan') {
        return regionHint ? `${charData.start}${regionHint}` : charData.start;
      }
      if (charId === 'cagekeeper') {
        return regionHint || charData.start;
      }
      if (charId === 'ying') {
        return regionHint ? `嘿！${regionHint}` : charData.start;
      }
      return charData.start;
    }

    _getLevel2Dialogue(charId, deduction, techniqueLines) {
      const charData = HINT_DIALOGUES[charId];
      const technique = deduction.technique;
      const techName = TECHNIQUE_NAMES[technique] || technique;

      // 随机选一条技巧专属对话
      let techLine = '';
      if (techniqueLines && techniqueLines.length > 0) {
        const idx = Math.floor(Math.random() * techniqueLines.length);
        techLine = techniqueLines[idx];
      }

      if (charId === 'ayan') {
        return techLine || `用${techName}来推导。`;
      }
      if (charId === 'cagekeeper') {
        return techLine || `试试${techName}。`;
      }
      if (charId === 'ying') {
        return techLine || `用${techName}试试！`;
      }
      return techLine || charData.target;
    }

    _getLevel3Dialogue(charId, deduction, techniqueLines) {
      const charData = HINT_DIALOGUES[charId];
      const technique = deduction.technique;
      const cell = deduction.targetCells[0];

      if (!cell) return charData.target;

      // 选一条技巧线作为引子
      let leadIn = '';
      if (techniqueLines && techniqueLines.length > 0) {
        const idx = Math.floor(Math.random() * techniqueLines.length);
        leadIn = techniqueLines[idx] + ' ';
      }

      // 处理数对/组技巧
      if (technique === 'nakedPair' || technique === 'hiddenPair') {
        const vals = (deduction.pairValues || (deduction.evidence && deduction.evidence.pairValues) || []).join('和');
        const cells = deduction.targetCells;
        if (cells.length >= 2) {
          const pos1 = `第${cells[0].row + 1}行第${cells[0].col + 1}列`;
          const pos2 = `第${cells[1].row + 1}行第${cells[1].col + 1}列`;
          const pairType = technique === 'nakedPair' ? '裸数对' : '隐数对';
          if (charId === 'ayan') {
            return `${leadIn}${pos1}和${pos2}构成${pairType}，候选数为${vals}。`;
          }
          if (charId === 'cagekeeper') {
            return `${leadIn}${pos1}和${pos2}是${pairType}，数字${vals}只能在这两格。`;
          }
          if (charId === 'ying') {
            return `${leadIn}${pos1}和${pos2}都是${vals}，它们是${pairType}哦！`;
          }
          return `${pairType}：${pos1}和${pos2} = ${vals}`;
        }
      }

      if (technique === 'pointingClaiming') {
        const val = deduction.pointingValue || (cell && cell.value);
        const dirLabel = deduction.pointingDirection === 'row'
          ? `第${deduction.pointingIndex + 1}行`
          : `第${deduction.pointingIndex + 1}列`;
        if (charId === 'ayan') {
          return `${leadIn}数字${val}被锁定在${dirLabel}，可以排除其他位置。`;
        }
        if (charId === 'cagekeeper') {
          return `${leadIn}${dirLabel}的数字${val}只能在这一宫内。`;
        }
        if (charId === 'ying') {
          return `${leadIn}${dirLabel}的${val}被关住啦，其他地方都不能有！`;
        }
        return `区块排除：${dirLabel}的${val}`;
      }

      if (technique === 'nakedTriplet') {
        const vals = (deduction.evidence && deduction.evidence.tripletValues ? deduction.evidence.tripletValues : []).join('、');
        const cells = deduction.targetCells;
        if (cells.length >= 2) {
          const pos1 = `第${cells[0].row + 1}行第${cells[0].col + 1}列`;
          if (charId === 'ayan') {
            return `${leadIn}这三格构成裸三数组，候选数为${vals}。`;
          }
          if (charId === 'cagekeeper') {
            return `${leadIn}三格三数，锁定了这一行。`;
          }
          if (charId === 'ying') {
            return `${leadIn}${pos1}附近有三个格子组成三子法！`;
          }
          return `裸三数组：${vals}`;
        }
      }

      if (technique === 'cageUnique') {
        const combos = (deduction.pairCombinations || (deduction.evidence && deduction.evidence.combos) || []);
        const comboStr = combos.slice(0, 3).map(c => Array.isArray(c) ? c.join('+') : c).join('、');
        const position = `第${cell.row + 1}行第${cell.col + 1}列`;
        const value = cell.value || '?';
        if (charId === 'ayan') {
          return `${leadIn}${position}是${value}（笼子唯一组合）。`;
        }
        if (charId === 'cagekeeper') {
          return `${leadIn}笼和限定了组合，${position}可以确定为${value}。`;
        }
        if (charId === 'ying') {
          return `${leadIn}${position}就是${value}啦！笼子告诉我的~`;
        }
        return `笼子唯一组合：${position} = ${value}`;
      }

      if (technique === 'xWing') {
        const value = cell.value || '?';
        if (charId === 'ayan') {
          return `${leadIn}二连纵横阵，数字${value}的X-Wing结构。`;
        }
        if (charId === 'cagekeeper') {
          return `${leadIn}X-Wing结构，可以排除数字${value}。`;
        }
        if (charId === 'ying') {
          return `${leadIn}哇！二连纵横阵！数字${value}！`;
        }
        return `二连纵横阵：数字${value}`;
      }

      if (technique === 'swordfish') {
        const value = cell.value || '?';
        if (charId === 'ayan') {
          return `${leadIn}三才游鱼阵，数字${value}的Swordfish。`;
        }
        if (charId === 'cagekeeper') {
          return `${leadIn}Swordfish结构，高阶技巧。`;
        }
        if (charId === 'ying') {
          return `${leadIn}哇塞！三才游鱼阵！好厉害！`;
        }
        return `三才游鱼阵：数字${value}`;
      }

      // 默认：单格技巧
      const value = cell.value || '?';
      const position = `第${cell.row + 1}行第${cell.col + 1}列`;

      if (charId === 'ayan') {
        return `${leadIn}${position}是${value}。`;
      }
      if (charId === 'cagekeeper') {
        return `${leadIn}${position}可以确定为${value}。`;
      }
      if (charId === 'ying') {
        return `${leadIn}${position}就是${value}啦！`;
      }
      return `${position} = ${value}`;
    }

    // ========================================================
    //  辅助方法
    // ========================================================

    /**
     * 获取指定格子的笼子ID
     */
    _getCageIdsForCell(r, c) {
      const cell = this.board.cells[r][c];
      if (!cell) return [];
      if (cell.cageIds && cell.cageIds.length > 0) return [...cell.cageIds];
      if (cell.cageId !== null) return [cell.cageId];
      return [];
    }

    /**
     * 查找需要填充的格子（原始方法，保留用于降级）
     */
    _findTargetCell() {
      if (!this.board || !this.solution) return null;

      for (let r = 0; r < this.board.size; r++) {
        for (let c = 0; c < this.board.size; c++) {
          const cell = this.board.cells[r][c];
          if (cell.fixedNum || cell.fillNum) continue;

          const solutionNum = this.solution[r][c];
          if (solutionNum) {
            return { row: r, col: c, value: solutionNum };
          }
        }
      }

      return null;
    }

    /**
     * 按权重选择角色
     */
    _selectCharacter() {
      const rand = Math.random();
      let cumulative = 0;
      for (const char of HINT_CHARACTERS) {
        cumulative += char.weight;
        if (rand < cumulative) return char;
      }
      return HINT_CHARACTERS[0];
    }

    /**
     * 重置提示进度状态（例如新游戏时）
     */
    resetProgress() {
      this._hintProgress.clear();
      this._lastDeduction = null;
      this.hintCount = 0;
    }

    /**
     * 获取当前提示进度
     */
    getHintProgress(deduction) {
      const key = this._makeProgressKey(deduction);
      return this._hintProgress.get(key) || 0;
    }

    /**
     * 获取所有技巧名称映射（静态辅助）
     */
    static getTechniqueName(id) {
      return TECHNIQUE_NAMES[id] || id;
    }

    /**
     * 旧技巧ID转换为新技巧ID
     */
    static normalizeTechniqueId(id) {
      return LEGACY_TECH_MAP[id] || id;
    }
  }

  global.HintSystem = HintSystem;
})(typeof window !== 'undefined' ? window : globalThis);
