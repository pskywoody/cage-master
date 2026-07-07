/**
 * ============================================================
 *  CharacterErrorEngine - 角色说错引擎
 * ============================================================
 *
 *  实现角色"故意说错"的机制，让角色更像真人。
 *
 *  说错概率：
 *  - 阿岩：15%（位置10% + 数字5%）
 *  - 守笼人：0%（永远正确）
 *  - 设局人：5%（故意说错，嘲讽玩家）
 *
 *  错误类型：
 *  - position: 位置说错（说的格是错的）
 *  - value: 数字说错（说的数字是错的）
 *  - random: 完全乱说（不确定的语气）
 *
 *  核心规则：
 *  - 不纠正：说错后系统不自动修正
 *  - 让玩家自己发现
 *  - 错误不影响游戏（是"建议"，不是"指令"）
 *  - 错误不降低评价
 *
 *  边界条件：
 *  - 教学关卡禁用
 *  - 新手保护期：前5次触发说错概率降为5%
 *  - 每局上限：阿岩每局最多说错2次
 *  - Boss战禁用
 *
 * ============================================================
 */

// ============================================================
//  类型定义
// ============================================================

/**
 * @typedef {Object} ErrorConfig
 * @property {number} wrongPosition - 位置说错概率
 * @property {number} wrongValue - 数字说错概率
 * @property {number} totalWrong - 总说错概率
 * @property {number} cooldownAfterError - 说错后冷却延长（秒）
 * @property {number} maxErrorsPerLevel - 每局最多说错次数
 */

/**
 * @typedef {Object} ErrorResult
 * @property {boolean} isError - 是否说错
 * @property {'position'|'value'|'random'|null} errorType - 错误类型
 * @property {number} wrongRow - 错误的行号（位置错时）
 * @property {number} wrongCol - 错误的列号（位置错时）
 * @property {number} wrongValue - 错误的数字（数字错时）
 * @property {string} errorLineId - 错误台词ID
 */

// ============================================================
//  角色说错配置
// ============================================================

const CHARACTER_ERROR_CONFIG = {
  ray: {
    wrongPosition: 0.10,   // 位置说错 10%
    wrongValue: 0.05,      // 数字说错 5%
    totalWrong: 0.15,      // 总计 15%
    cooldownAfterError: 180, // 说错后冷却 180 秒
    maxErrorsPerLevel: 2,   // 每局最多 2 次
  },
  keeper: {
    wrongPosition: 0,
    wrongValue: 0,
    totalWrong: 0,         // 守笼人永远正确
    cooldownAfterError: 0,
    maxErrorsPerLevel: 0,
  },
  plotter: {
    wrongPosition: 0.02,   // 位置说错 2%
    wrongValue: 0.03,      // 数字说错 3%
    totalWrong: 0.05,      // 总计 5%
    cooldownAfterError: 300, // 说错后冷却 300 秒
    maxErrorsPerLevel: 1,   // 每局最多 1 次
  },
};

// ============================================================
//  CharacterErrorEngine 类
// ============================================================

class CharacterErrorEngine {
  // ========================================================
  //  状态
  // ========================================================

  /** @type {number} 本关各角色说错次数 */
  static _errorCounts = { ray: 0, keeper: 0, plotter: 0 };

  /** @type {number} 阿岩总触发次数（用于新手保护期） */
  static _rayTriggerCount = 0;

  /** @type {boolean} 是否教学关卡 */
  static _isTutorialLevel = false;

  /** @type {boolean} 是否Boss战 */
  static _isBossLevel = false;

  /** @type {number} 新手保护期触发次数 */
  static NEWBIE_PROTECTION_COUNT = 5;

  /** @type {number} 新手保护期说错概率倍率 */
  static NEWBIE_ERROR_MULTIPLIER = 1 / 3; // 从15%降到约5%

  // ========================================================
  //  初始化
  // ========================================================

  /**
   * 初始化新关卡
   * @param {Object} options
   * @param {boolean} [options.isTutorial=false] - 是否教学关卡
   * @param {boolean} [options.isBoss=false] - 是否Boss战
   */
  static initNewLevel(options = {}) {
    this._errorCounts = { ray: 0, keeper: 0, plotter: 0 };
    this._isTutorialLevel = options.isTutorial || false;
    this._isBossLevel = options.isBoss || false;
    // 注意：_rayTriggerCount 不重置，因为新手保护期是跨关卡的
  }

  // ========================================================
  //  核心：检查是否说错
  // ========================================================

  /**
   * 检查角色这次是否会说错
   * @param {string} character - 角色ID
   * @param {Object} target - 正确目标 {row, col, value}
   * @param {Object} [board] - 棋盘对象（用于生成合理的错误答案）
   * @returns {ErrorResult}
   */
  static checkError(character, target, board = null) {
    const config = CHARACTER_ERROR_CONFIG[character];

    // 守笼人永远不说错
    if (!config || config.totalWrong === 0) {
      return this._noErrorResult();
    }

    // 教学关卡禁用说错
    if (this._isTutorialLevel) {
      return this._noErrorResult();
    }

    // Boss战禁用说错
    if (this._isBossLevel) {
      return this._noErrorResult();
    }

    // 达到每局上限
    if (this._errorCounts[character] >= config.maxErrorsPerLevel) {
      return this._noErrorResult();
    }

    // 计算实际说错概率（考虑新手保护期）
    let actualProbability = config.totalWrong;

    if (character === 'yan' && this._rayTriggerCount < this.NEWBIE_PROTECTION_COUNT) {
      actualProbability *= this.NEWBIE_ERROR_MULTIPLIER;
    }

    // 随机判定是否说错
    if (Math.random() >= actualProbability) {
      return this._noErrorResult();
    }

    // 决定错误类型
    const errorType = this._decideErrorType(config);

    // 生成错误内容
    const errorResult = this._generateError(errorType, target, board);

    if (errorResult) {
      this._errorCounts[character]++;
    }

    return errorResult || this._noErrorResult();
  }

  /**
   * 记录角色触发（用于新手保护期计数）
   * @param {string} character
   */
  static recordTrigger(character) {
    if (character === 'yan') {
      this._rayTriggerCount++;
    }
  }

  // ========================================================
  //  错误类型决策
  // ========================================================

  /**
   * 决定错误类型
   * @param {ErrorConfig} config
   * @returns {'position'|'value'|'random'}
   */
  static _decideErrorType(config) {
    const rand = Math.random();

    // 按比例分配
    const posRatio = config.wrongPosition / config.totalWrong;
    const valRatio = config.wrongValue / config.totalWrong;

    if (rand < posRatio) {
      return 'position';
    } else if (rand < posRatio + valRatio) {
      return 'value';
    } else {
      return 'random'; // 剩下的是"完全乱说"
    }
  }

  // ========================================================
  //  错误内容生成
  // ========================================================

  /**
   * 生成错误内容
   * @param {string} errorType
   * @param {Object} target - 正确目标
   * @param {Object} board - 棋盘对象
   * @returns {ErrorResult|null}
   */
  static _generateError(errorType, target, board) {
    switch (errorType) {
      case 'position':
        return this._generatePositionError(target, board);
      case 'value':
        return this._generateValueError(target, board);
      case 'random':
        return this._generateRandomError(target, board);
      default:
        return null;
    }
  }

  /**
   * 生成位置错误
   * 从同行/同列/同宫中选一个空格子，不能是正确答案格
   * @param {Object} target
   * @param {Object} board
   * @returns {ErrorResult}
   */
  static _generatePositionError(target, board) {
    const candidates = [];
    const { row, col } = target;
    const size = 9;

    // 收集同行空格
    if (board && board.cells) {
      for (let c = 0; c < size; c++) {
        if (c !== col) {
          const cell = board.cells[row][c];
          if (cell && !cell.fillNum && !cell.fixedNum) {
            candidates.push({ row, col: c });
          }
        }
      }

      // 收集同列空格
      for (let r = 0; r < size; r++) {
        if (r !== row) {
          const cell = board.cells[r][col];
          if (cell && !cell.fillNum && !cell.fixedNum) {
            candidates.push({ row: r, col });
          }
        }
      }

      // 收集同宫空格
      const boxR = Math.floor(row / 3) * 3;
      const boxC = Math.floor(col / 3) * 3;
      for (let r = boxR; r < boxR + 3; r++) {
        for (let c = boxC; c < boxC + 3; c++) {
          if (r !== row || c !== col) {
            const cell = board.cells[r]?.[c];
            if (cell && !cell.fillNum && !cell.fixedNum) {
              // 避免重复
              const exists = candidates.some(ca => ca.row === r && ca.col === c);
              if (!exists) {
                candidates.push({ row: r, col: c });
              }
            }
          }
        }
      }
    }

    // 如果没有候选（不应该发生），返回偏移1-2格的错误
    if (candidates.length === 0) {
      const wrongRow = Math.min(8, Math.max(0, row + (Math.random() > 0.5 ? 1 : -1)));
      const wrongCol = Math.min(8, Math.max(0, col + (Math.random() > 0.5 ? 1 : -1)));
      return {
        isError: true,
        errorType: 'position',
        wrongRow,
        wrongCol,
        wrongValue: target.value,
        errorLineId: '',
      };
    }

    // 随机选一个
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];

    return {
      isError: true,
      errorType: 'position',
      wrongRow: chosen.row,
      wrongCol: chosen.col,
      wrongValue: target.value,
      errorLineId: '',
    };
  }

  /**
   * 生成数字错误
   * 从笔记中选一个不是正确答案的
   * @param {Object} target
   * @param {Object} board
   * @returns {ErrorResult}
   */
  static _generateValueError(target, board) {
    const { row, col, value } = target;
    const wrongCandidates = [];

    // 从笔记中找错误的
    if (board && board.cells) {
      const cell = board.cells[row]?.[col];
      if (cell && cell.candidates) {
        for (const cand of cell.candidates) {
          if (cand !== value) {
            wrongCandidates.push(cand);
          }
        }
      }
    }

    // 如果没有笔记，随机选一个1-9中不是正确答案的
    if (wrongCandidates.length === 0) {
      for (let n = 1; n <= 9; n++) {
        if (n !== value) {
          wrongCandidates.push(n);
        }
      }
    }

    const wrongValue = wrongCandidates[Math.floor(Math.random() * wrongCandidates.length)];

    return {
      isError: true,
      errorType: 'value',
      wrongRow: row,
      wrongCol: col,
      wrongValue,
      errorLineId: '',
    };
  }

  /**
   * 生成完全乱说的错误
   * @param {Object} target
   * @param {Object} board
   * @returns {ErrorResult}
   */
  static _generateRandomError(target, board) {
    // 随机说一个数字，可能对也可能错
    const randomValue = Math.floor(Math.random() * 9) + 1;

    return {
      isError: true,
      errorType: 'random',
      wrongRow: target.row,
      wrongCol: target.col,
      wrongValue: randomValue,
      errorLineId: '',
    };
  }

  // ========================================================
  //  结果构造
  // ========================================================

  /**
   * 构造无错误结果
   * @returns {ErrorResult}
   */
  static _noErrorResult() {
    return {
      isError: false,
      errorType: null,
      wrongRow: -1,
      wrongCol: -1,
      wrongValue: 0,
      errorLineId: '',
    };
  }

  // ========================================================
  //  查询方法
  // ========================================================

  /**
   * 获取某角色本关说错次数
   * @param {string} character
   * @returns {number}
   */
  static getErrorCount(character) {
    return this._errorCounts[character] || 0;
  }

  /**
   * 获取阿岩总触发次数
   * @returns {number}
   */
  static getRayTriggerCount() {
    return this._rayTriggerCount;
  }

  /**
   * 是否在新手保护期
   * @returns {boolean}
   */
  static isInNewbieProtection() {
    return this._rayTriggerCount < this.NEWBIE_PROTECTION_COUNT;
  }

  /**
   * 获取角色说错配置
   * @param {string} character
   * @returns {ErrorConfig|null}
   */
  static getConfig(character) {
    return CHARACTER_ERROR_CONFIG[character] || null;
  }

  /**
   * 获取说错后的冷却时间
   * @param {string} character
   * @param {boolean} [hadError=false] - 这次是否说错了
   * @returns {number} 冷却时间（秒）
   */
  static getCooldown(character, hadError = false) {
    const config = CHARACTER_ERROR_CONFIG[character];
    if (!config) return 60;

    if (hadError && config.cooldownAfterError) {
      return config.cooldownAfterError;
    }

    // 默认冷却
    const defaultCooldowns = {
      ray: 120,
      keeper: 180,
      plotter: 300,
    };

    return defaultCooldowns[character] || 120;
  }
}

// ============================================================
//  导出
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CharacterErrorEngine,
    CHARACTER_ERROR_CONFIG,
  };
}

if (typeof window !== 'undefined') {
  window.CharacterErrorEngine = CharacterErrorEngine;
  window.CHARACTER_ERROR_CONFIG = CHARACTER_ERROR_CONFIG;
}
