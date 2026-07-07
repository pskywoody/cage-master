/**
 * ============================================================
 *  CharacterizedHintRouter - 双模态提示路由器
 * ============================================================
 * 
 * 双模提示系统：
 * - 被动心流模式（不点击）：角色局部教学，走 RAHS 推理监控
 * - 主动绝杀模式（点击提示）：上帝视角 Solver 点杀核心格，触发级联坍塌
 * 
 * 与 TechnicalPurityValidator 配合使用：
 * - 纯净度残局有 coreMove 和 cascadeSequence
 * - 普通关卡走原有三层提示
 */

(function(global) {
  'use strict';

  // 角色台词库（被动教学模式）
  const PASSIVE_DIALOGUES = {
    ayan: {
      nakedSingle: '阿岩：盯紧这一宫，好像有个漏网之鱼你没看到！',
      cageUnique: '阿岩：这个笼子里的数字好像只能放在那个位置？',
      hiddenSingle: '阿岩：这一行/列里，某个数字好像只剩一个去处了……',
      rule45: '阿岩：你看看这一行的和，45减一下是不是能直接推出个数字？',
      nakedPair: '阿岩：那两个格子的笔记互相抱团了，你发现没有？',
      hiddenPair: '阿岩：有些数字藏得深，别光看表面啊。',
      pointingClaiming: '阿岩：这个区块里的数字是不是都挤在同一行/列？',
      nakedTriplet: '阿岩：三个格子的笔记绕来绕去，像个三角恋……',
      xWing: '阿岩：这地方太绕了……不过你看，这两列的笔记好像连成了一个框，是不是能删掉别的？',
    },
    cagekeeper: {
      nakedSingle: '守笼人：瞎子都能看出来的送分格，你还要在这耗多久？',
      cageUnique: '守笼人：笼子的边界就是铁律，还看不明白？',
      hiddenSingle: '守笼人：行有行规，列有列矩，这数字只能待在那。',
      rule45: '守笼人：四十五乃天道之数，减一减就出来了，动脑子。',
      nakedPair: '守笼人：那两个位置已经结盟了，你在外围使什么劲？',
      hiddenPair: '守笼人：水底下的暗流你看不到，活该被困死在这。',
      pointingClaiming: '守笼人：区块如城，城中之兵必守其门，门外的都得滚。',
      nakedTriplet: '守笼人：三足鼎立，互相牵制，你在外头瞎晃没用。',
      xWing: '守笼人：（不耐烦地敲铁条）底子不错，但眼界太窄。看看那两列纵横交错的势头，画出翅膀没有？',
    },
    plotter: {
      nakedSingle: '设局人：庸人自扰，大道至简，一扫即除。',
      cageUnique: '设局人：笼中乾坤，数各有位，此乃定数。',
      hiddenSingle: '设局人：隐于九野，定于一尊，此数非彼莫属。',
      rule45: '设局人：天道四九，遁去其一，减而得之。',
      nakedPair: '设局人：虚实相生，这两格的明牌，就是局眼。',
      hiddenPair: '设局人：藏木于林，你只看到了林，却漏了那一株关键的树。',
      pointingClaiming: '设局人：势之所趋，如水之就下，此数必归于彼方。',
      nakedTriplet: '设局人：三气周流，循环无端，破局只在一点。',
      xWing: '设局人：两仪相生，死死扣锁。这个 X 字形的死穴，你当真看不破？',
    },
  };

  // 主动绝杀模式的台词（级联坍塌后触发）
  const ACTIVE_DIALOGUES = {
    ayan: [
      '阿岩：卧槽！原来点开这一格全盘就活了！',
      '阿岩：这……这连锁反应也太夸张了吧！',
      '阿岩：原来关键在这一步！我怎么就没想到呢！',
    ],
    cagekeeper: [
      '守笼人：哼，总算开窍了。一子落，全盘活。',
      '守笼人：记住这感觉——破局只在一瞬。',
      '守笼人：这才像样，别总跟个无头苍蝇似的。',
    ],
    plotter: [
      '设局人：破局之钥，系于一子。你看到了吗？',
      '设局人：骨牌已倒，大势已去，此局休矣。',
      '设局人：牵一发而动全身，此乃局之精妙。',
    ],
  };

  class CharacterizedHintRouter {

    // 当前关卡数据（纯净度残局才有 coreMove）
    static _currentPuzzle = null;
    // 当前角色
    static _currentCharacter = 'yan';
    // 级联动画是否在播放中
    static _isCascading = false;
    // 回调
    static _onCascadeStart = null;
    static _onCascadeStep = null;
    static _onCascadeEnd = null;
    static _onPassiveHint = null;

    /**
     * 初始化
     */
    static init(options = {}) {
      if (options.character) this._currentCharacter = options.character;
      if (options.onCascadeStart) this._onCascadeStart = options.onCascadeStart;
      if (options.onCascadeStep) this._onCascadeStep = options.onCascadeStep;
      if (options.onCascadeEnd) this._onCascadeEnd = options.onCascadeEnd;
      if (options.onPassiveHint) this._onPassiveHint = options.onPassiveHint;
    }

    /**
     * 设置当前关卡（如果是纯净度残局，传入 coreMove）
     */
    static setPuzzle(puzzle) {
      this._currentPuzzle = puzzle;
    }

    /**
     * 设置当前角色
     */
    static setCharacter(character) {
      this._currentCharacter = character;
    }

    /**
     * 判断当前关卡是否为纯净度残局
     */
    static isPureEndgame() {
      return !!(this._currentPuzzle && this._currentPuzzle.coreMove);
    }

    /**
     * 获取当前关卡的目标技巧
     */
    static getTargetSkill() {
      if (!this._currentPuzzle) return null;
      return this._currentPuzzle.targetSkill || null;
    }

    /**
     * 被动模式：触发教学提示（角色台词 + 局部高亮）
     * 由 RAHS 动态阈值或玩家长按触发
     */
    static triggerPassiveHint(character, targetSkill, coreMove) {
      const char = character || this._currentCharacter;
      const skill = targetSkill || (this._currentPuzzle && this._currentPuzzle.targetSkill);
      const move = coreMove || (this._currentPuzzle && this._currentPuzzle.coreMove);

      if (!skill) return null;

      // 获取台词
      const charDialogues = PASSIVE_DIALOGUES[char];
      const dialogue = charDialogues ? (charDialogues[skill] || '……') : '……';

      // 高亮信息（核心格的坐标，用于前端高亮）
      let highlight = null;
      if (move) {
        highlight = {
          row: move.row,
          col: move.col,
          type: 'passive', // 被动模式：只高亮位置，不显示数字
          skill: skill,
        };
      }

      const result = {
        mode: 'passive',
        character: char,
        skill: skill,
        skillName: (SKILL_NAMES_CN && SKILL_NAMES_CN[skill]) || skill,
        dialogue: dialogue,
        highlight: highlight,
      };

      if (this._onPassiveHint) {
        this._onPassiveHint(result);
      }

      return result;
    }

    /**
     * 主动模式：点击提示按钮，触发绝杀级联坍塌
     */
    static triggerActiveHint(board, cages) {
      if (this._isCascading) return null;

      const coreMove = this._currentPuzzle && this._currentPuzzle.coreMove;
      
      // 纯净度残局：走级联坍塌路线
      if (coreMove && coreMove.cascadeSequence) {
        return this._triggerCascade(coreMove);
      }

      // 普通关卡：回退到原有三层提示
      // 这里返回 null，由上层调用原有提示逻辑
      return null;
    }

    /**
     * 触发级联坍塌动画
     */
    static _triggerCascade(coreMove) {
      this._isCascading = true;

      const sequence = coreMove.cascadeSequence;
      const char = this._currentCharacter;

      // 开始回调
      if (this._onCascadeStart) {
        this._onCascadeStart({
          coreCell: { row: coreMove.row, col: coreMove.col, value: coreMove.value },
          totalCascade: sequence.length,
        });
      }

      // 播放级联动画（每100ms一格）
      let step = 0;
      const totalSteps = sequence.length;

      const playStep = () => {
        if (step >= totalSteps) {
          // 结束
          this._isCascading = false;
          
          // 随机选一句台词
          const charLines = ACTIVE_DIALOGUES[char];
          const line = charLines ? charLines[Math.floor(Math.random() * charLines.length)] : '……';

          if (this._onCascadeEnd) {
            this._onCascadeEnd({
              character: char,
              dialogue: line,
              totalFilled: totalSteps + 1, // 核心格 + 级联格
            });
          }
          return;
        }

        const move = sequence[step];
        if (this._onCascadeStep) {
          this._onCascadeStep({
            index: step,
            total: totalSteps,
            row: move.row,
            col: move.col,
            value: move.value,
            skill: move.skill,
          });
        }

        step++;
        setTimeout(playStep, 100); // 每100ms一格
      };

      // 延迟一点开始，让核心格的"黄金落定"动画先播放
      setTimeout(playStep, 400);

      return {
        mode: 'active',
        coreMove: coreMove,
        cascadeSequence: sequence,
        isPlaying: true,
      };
    }

    /**
     * 取消级联动画（如果需要）
     */
    static cancelCascade() {
      this._isCascading = false;
    }

    /**
     * 是否正在播放级联动画
     */
    static isCascading() {
      return this._isCascading;
    }

    /**
     * 获取角色的被动台词
     */
    static getPassiveDialogue(character, skill) {
      const charDialogues = PASSIVE_DIALOGUES[character];
      if (!charDialogues) return '……';
      return charDialogues[skill] || '……';
    }

    /**
     * 获取角色的主动台词
     */
    static getActiveDialogue(character) {
      const charLines = ACTIVE_DIALOGUES[character];
      if (!charLines || charLines.length === 0) return '……';
      return charLines[Math.floor(Math.random() * charLines.length)];
    }
  }

  // 导出
  global.CharacterizedHintRouter = CharacterizedHintRouter;

})(typeof window !== 'undefined' ? window : global);
