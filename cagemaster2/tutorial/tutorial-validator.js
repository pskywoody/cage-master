/**
 * TutorialValidator - 教学步骤验证器
 * 验证玩家的操作是否符合当前教学步骤的要求
 */
class TutorialValidator {
  /**
   * 验证填数操作
   * @param {Object} validation - 验证配置
   * @param {Object} board - 游戏棋盘
   * @param {number} r - 行
   * @param {number} c - 列
   * @param {number} num - 填入的数字
   * @returns {boolean} 是否验证通过
   */
  static validateFillNumber(validation, board, r, c, num) {
    if (!validation || !validation.cell) return false;
    const [tr, tc] = validation.cell;
    return r === tr && c === tc && num === validation.expected;
  }

  /**
   * 验证候选数设置
   * @param {Object} validation - 验证配置
   * @param {Object} board - 游戏棋盘
   * @param {number} r - 行
   * @param {number} c - 列
   * @param {Set} candidates - 当前候选数集合
   * @returns {boolean} 是否验证通过
   */
  static validateSetCandidates(validation, board, r, c, candidates) {
    if (!validation || !validation.cell) return false;
    const [tr, tc] = validation.cell;
    if (r !== tr || c !== tc) return false;
    
    const expected = new Set(validation.expected);
    if (candidates.size !== expected.size) return false;
    for (const num of candidates) {
      if (!expected.has(num)) return false;
    }
    return true;
  }

  /**
   * 验证任意正确填数
   * @param {Object} validation - 验证配置
   * @param {Object} board - 游戏棋盘
   * @param {number} r - 行
   * @param {number} c - 列
   * @param {number} num - 填入的数字
   * @returns {boolean} 是否验证通过
   */
  static validateFillAnyCorrect(validation, board, r, c, num) {
    if (!validation || !validation.cells) return false;
    
    // 检查是否在允许的格子集合中
    const allowed = validation.cells.some(([tr, tc]) => r === tr && c === tc);
    if (!allowed) return false;
    
    // 检查是否填对了（与solution对比）
    if (board && board.solution) {
      return board.solution[r][c] === num;
    }
    return false;
  }

  /**
   * 验证格子选中
   * @param {Object} validation - 验证配置
   * @param {number} r - 行
   * @param {number} c - 列
   * @returns {boolean} 是否验证通过
   */
  static validateSelectCell(validation, r, c) {
    if (!validation || !validation.cell) return false;
    const [tr, tc] = validation.cell;
    return r === tr && c === tc;
  }

  /**
   * 根据验证类型分发验证
   * @param {Object} step - 当前步骤
   * @param {Object} board - 游戏棋盘
   * @param {Object} eventData - 事件数据
   * @returns {boolean} 是否验证通过
   */
  static validate(step, board, eventData) {
    if (!step || !step.validation) return false;
    
    const v = step.validation;
    switch (v.type) {
      case 'fill_number':
        return this.validateFillNumber(v, board, eventData.r, eventData.c, eventData.num);
      
      case 'set_candidates':
        return this.validateSetCandidates(v, board, eventData.r, eventData.c, eventData.candidates);
      
      case 'fill_any_correct':
        return this.validateFillAnyCorrect(v, board, eventData.r, eventData.c, eventData.num);
      
      case 'select_cell':
        return this.validateSelectCell(v, eventData.r, eventData.c);
      
      case 'custom':
        if (typeof v.fn === 'function') {
          return v.fn(board, eventData);
        }
        return false;
      
      default:
        return false;
    }
  }
}

// 导出到全局
window.TutorialValidator = TutorialValidator;
