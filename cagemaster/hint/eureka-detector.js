/**
 * ============================================================
 *  EurekaDetector - Eureka时刻检测模块
 * ============================================================
 *
 *  捕捉玩家"神之一手"的高光时刻——在长时间沉默后，
 *  一子落下引发盘面连锁反应。
 *
 *  触发条件（三重锁定）：
 *  1. 长时沉顿：最后有效操作 ≥ 60 秒
 *  2. 高崩塌势能：落子后新增孤星数 ≥ 4 格
 *  3. 无提示盲解：落子前 180 秒内无提示/角色触发
 *
 *  【补丁1】判定时机扩展：
 *  - 填数（fill）时触发
 *  - 删除笔记导致笔记收敛为1 + 连锁坍塌 ≥4格 时触发
 *
 *  使用方式：
 *    import { EurekaDetector } from './utils/eureka-detector.js';
 *
 *    // 在填数时检查
 *    const result = EurekaDetector.checkOnFill(row, col, value, board);
 *    if (result.isEureka) { ... }
 *
 *    // 在删除笔记时检查
 *    const result = EurekaDetector.checkOnNoteRemove(row, col, value, board);
 *    if (result.isEureka) { ... }
 *
 * ============================================================
 */

// ============================================================
//  类型定义
// ============================================================

/**
 * @typedef {Object} EurekaResult
 * @property {boolean} isEureka - 是否触发Eureka
 * @property {number} silenceDuration - 沉默时长（毫秒）
 * @property {number} cascadeCount - 连锁坍塌数量
 * @property {string} technique - 使用的技巧
 * @property {{row: number, col: number, value: number}} target - 目标格
 * @property {Array<{row: number, col: number}>} cascadeCells - 连锁格列表
 */

// ============================================================
//  EurekaDetector 类
// ============================================================

class EurekaDetector {
  // ========================================================
  //  配置常量
  // ========================================================

  /** 最小沉默时长（毫秒） */
  static MIN_SILENCE_DURATION = 60 * 1000; // 60秒

  /** 最小连锁坍塌数量 */
  static MIN_CASCADE_COUNT = 4;

  /** 无提示窗口期（毫秒）- 落子前多久没有提示才算盲解 */
  static NO_HINT_WINDOW = 180 * 1000; // 180秒

  // ========================================================
  //  状态
  // ========================================================

  /** @type {number} 最后一次提示/角色触发的时间 */
  static _lastHintTime = 0;

  /** @type {number} 最后一次有效操作时间（填数或笔记删除） */
  static _lastActionTime = Date.now();

  /** @type {Array<Object>} Eureka事件记录 */
  static _eurekaHistory = [];

  /** @type {number} 本关Eureka次数 */
  static _eurekaCountInLevel = 0;

  // ========================================================
  //  初始化
  // ========================================================

  /**
   * 初始化新关卡
   */
  static initNewLevel() {
    this._lastHintTime = 0;
    this._lastActionTime = Date.now();
    this._eurekaHistory = [];
    this._eurekaCountInLevel = 0;
  }

  // ========================================================
  //  状态更新
  // ========================================================

  /**
   * 记录提示触发（用于判断是否"盲解"）
   */
  static recordHintTriggered() {
    this._lastHintTime = Date.now();
  }

  /**
   * 更新最后操作时间
   */
  static updateActivity() {
    this._lastActionTime = Date.now();
  }

  // ========================================================
  //  核心检测：填数时
  // ========================================================

  /**
   * 填数时检测Eureka
   * @param {number} row - 行号
   * @param {number} col - 列号
   * @param {number} value - 填入的数字
   * @param {Object} board - 棋盘对象（需要有 cells[][] 和 cages）
   * @returns {EurekaResult}
   */
  static checkOnFill(row, col, value, board) {
    const now = Date.now();
    const silenceDuration = now - this._lastActionTime;

    // 条件1：沉默时长
    if (silenceDuration < this.MIN_SILENCE_DURATION) {
      this._lastActionTime = now;
      return this._noEurekaResult(silenceDuration, 0, row, col, value);
    }

    // 条件3：无提示盲解
    if (now - this._lastHintTime < this.NO_HINT_WINDOW) {
      this._lastActionTime = now;
      return this._noEurekaResult(silenceDuration, 0, row, col, value);
    }

    // 条件2：计算连锁坍塌数量
    const cascadeResult = this._calculateCascade(row, col, value, board);
    const cascadeCount = cascadeResult.count;

    if (cascadeCount < this.MIN_CASCADE_COUNT) {
      this._lastActionTime = now;
      return this._noEurekaResult(silenceDuration, cascadeCount, row, col, value);
    }

    // 三重条件都满足，触发Eureka！
    this._lastActionTime = now;
    return this._eurekaResult(
      silenceDuration,
      cascadeCount,
      row,
      col,
      value,
      cascadeResult.cells,
      cascadeResult.technique
    );
  }

  // ========================================================
  //  核心检测：删除笔记时
  // ========================================================

  /**
   * 删除笔记时检测Eureka
   * 当删除笔记导致某格笔记收敛为1，且引发连锁坍塌时触发
   *
   * @param {number} row - 行号
   * @param {number} col - 列号
   * @param {number} value - 删除的笔记
   * @param {Object} board - 棋盘对象
   * @returns {EurekaResult}
   */
  static checkOnNoteRemove(row, col, value, board) {
    const now = Date.now();
    const silenceDuration = now - this._lastActionTime;

    // 条件1：沉默时长
    if (silenceDuration < this.MIN_SILENCE_DURATION) {
      return this._noEurekaResult(silenceDuration, 0, row, col, value);
    }

    // 条件3：无提示盲解
    if (now - this._lastHintTime < this.NO_HINT_WINDOW) {
      return this._noEurekaResult(silenceDuration, 0, row, col, value);
    }

    // 检查删除笔记后该格是否收敛为单候选
    const cell = board.cells?.[row]?.[col];
    if (!cell || !cell.candidates) {
      return this._noEurekaResult(silenceDuration, 0, row, col, value);
    }

    // 模拟删除后的笔记
    const remainingCandidates = [...cell.candidates].filter(c => c !== value);

    // 如果删除后只剩1个笔记，计算连锁
    if (remainingCandidates.length !== 1) {
      return this._noEurekaResult(silenceDuration, 0, row, col, value);
    }

    const newValue = remainingCandidates[0];

    // 条件2：计算连锁坍塌
    const cascadeResult = this._calculateCascade(row, col, newValue, board);
    const cascadeCount = cascadeResult.count;

    if (cascadeCount < this.MIN_CASCADE_COUNT) {
      return this._noEurekaResult(silenceDuration, cascadeCount, row, col, newValue);
    }

    // 三重条件都满足
    return this._eurekaResult(
      silenceDuration,
      cascadeCount,
      row,
      col,
      newValue,
      cascadeResult.cells,
      cascadeResult.technique
    );
  }

  // ========================================================
  //  连锁坍塌计算
  // ========================================================

  /**
   * 计算在某格填入数字后会产生多少连锁孤星
   * @param {number} row - 行号
   * @param {number} col - 列号
   * @param {number} value - 填入的数字
   * @param {Object} board - 棋盘对象
   * @returns {{count: number, cells: Array, technique: string}}
   */
  static _calculateCascade(row, col, value, board) {
    if (!board || !board.cells) {
      return { count: 0, cells: [], technique: 'unknown' };
    }

    const cascadeCells = [];
    const size = 9;

    // 模拟填入后的影响
    // 收集所有会被影响的格子（同行、同列、同宫、同笼）
    const affectedCells = new Set();

    // 同行
    for (let c = 0; c < size; c++) {
      if (c !== col) affectedCells.add(`${row},${c}`);
    }

    // 同列
    for (let r = 0; r < size; r++) {
      if (r !== row) affectedCells.add(`${r},${col}`);
    }

    // 同宫
    const boxR = Math.floor(row / 3) * 3;
    const boxC = Math.floor(col / 3) * 3;
    for (let r = boxR; r < boxR + 3; r++) {
      for (let c = boxC; c < boxC + 3; c++) {
        if (r !== row || c !== col) affectedCells.add(`${r},${c}`);
      }
    }

    // 同笼（如果有笼子数据）
    if (board.cages && board.cageIdToCells) {
      const cellCageIds = this._getCellCageIds(row, col, board);
      for (const cageId of cellCageIds) {
        const cageCells = board.cageIdToCells[cageId];
        if (cageCells) {
          for (const [cr, cc] of cageCells) {
            if (cr !== row || cc !== col) affectedCells.add(`${cr},${cc}`);
          }
        }
      }
    }

    // 检查每个受影响的格子，填入该数字后是否会变成孤星
    for (const key of affectedCells) {
      const [r, c] = key.split(',').map(Number);
      const cell = board.cells[r]?.[c];

      if (!cell) continue;
      if (cell.fillNum || cell.fixedNum) continue; // 已经有数字的格子跳过

      // 计算当前笔记
      let candidates = cell.candidates ? [...cell.candidates] : [];

      // 移除填入的数字
      candidates = candidates.filter(c => c !== value);

      // 如果移除后只剩1个候选，算"孤星"
      if (candidates.length === 1) {
        cascadeCells.push({ row: r, col: c, value: candidates[0] });
      }
    }

    // 判断技巧类型
    const technique = this._detectTechnique(row, col, value, board);

    return {
      count: cascadeCells.length,
      cells: cascadeCells,
      technique,
    };
  }

  /**
   * 获取格子所属的笼子ID列表
   * @param {number} row
   * @param {number} col
   * @param {Object} board
   * @returns {number[]}
   */
  static _getCellCageIds(row, col, board) {
    const ids = [];
    if (!board.cages) return ids;

    for (const cage of board.cages) {
      if (cage.cells) {
        for (const [cr, cc] of cage.cells) {
          if (cr === row && cc === col) {
            ids.push(cage.id);
            break;
          }
        }
      }
    }

    return ids;
  }

  /**
   * 检测使用的技巧类型
   * @param {number} row
   * @param {number} col
   * @param {number} value
   * @param {Object} board
   * @returns {string}
   */
  static _detectTechnique(row, col, value, board) {
    // 简化实现：根据格子笔记和周围情况推断
    const cell = board.cells?.[row]?.[col];
    if (!cell) return 'unknown';

    const candidates = cell.candidates ? cell.candidates.size : 0;

    if (candidates === 1) {
      return 'nakedSingle'; // 孤星
    }

    // 检查是否是笼子唯一组合
    const cageIds = this._getCellCageIds(row, col, board);
    if (cageIds.length > 0) {
      return 'rule45'; // 简化为星衡法则
    }

    return 'hiddenSingle'; // 隐曜
  }

  // ========================================================
  //  结果构造
  // ========================================================

  /**
   * 构造Eureka结果
   * @param {number} silenceDuration
   * @param {number} cascadeCount
   * @param {number} row
   * @param {number} col
   * @param {number} value
   * @param {Array} cascadeCells
   * @param {string} technique
   * @returns {EurekaResult}
   */
  static _eurekaResult(silenceDuration, cascadeCount, row, col, value, cascadeCells, technique) {
    const result = {
      isEureka: true,
      silenceDuration,
      cascadeCount,
      technique,
      target: { row, col, value },
      cascadeCells,
      timestamp: Date.now(),
    };

    // 记录历史
    this._eurekaHistory.push(result);
    this._eurekaCountInLevel++;

    return result;
  }

  /**
   * 构造非Eureka结果
   * @param {number} silenceDuration
   * @param {number} cascadeCount
   * @param {number} row
   * @param {number} col
   * @param {number} value
   * @returns {EurekaResult}
   */
  static _noEurekaResult(silenceDuration, cascadeCount, row, col, value) {
    return {
      isEureka: false,
      silenceDuration,
      cascadeCount,
      technique: 'none',
      target: { row, col, value },
      cascadeCells: [],
    };
  }

  // ========================================================
  //  统计查询
  // ========================================================

  /**
   * 获取本关Eureka次数
   * @returns {number}
   */
  static getEurekaCount() {
    return this._eurekaCountInLevel;
  }

  /**
   * 获取最大连锁数
   * @returns {number}
   */
  static getMaxCascade() {
    if (this._eurekaHistory.length === 0) return 0;
    return Math.max(...this._eurekaHistory.map(e => e.cascadeCount));
  }

  /**
   * 获取Eureka历史
   * @returns {Array<EurekaResult>}
   */
  static getEurekaHistory() {
    return [...this._eurekaHistory];
  }
}

// ============================================================
//  导出
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EurekaDetector };
}

if (typeof window !== 'undefined') {
  window.EurekaDetector = EurekaDetector;
}
