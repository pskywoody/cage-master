/**
 * ============================================================
 *  ReasoningMonitor - 笔记推理监控系统
 *  迁移自 cagemaster/hint/reasoning-monitor.js（2026-08-03）
 *  适配：cagemaster4 的 board.candidates 为 Set<number>
 * ============================================================
 *
 *  把玩家的笔记行为当作"推理轨迹"来监控，为提示决策提供数据依据。
 *
 *  四层监控架构：
 *  - L1 基础层：笔记频率（次/60秒）→ 判断"在思考"vs"在发呆"
 *  - L2 空间层：笔记分布 → 判断"局部深挖"vs"全局扫视"
 *  - L3 逻辑层：笔记准确率 → 判断"推理清晰"vs"还在摸索"
 *  - L4 预测层：笔记→填数关系 → 判断"确认型"vs"探索型"
 *
 *  注意：自动笔记产生的笔记（source: 'auto'）不计入推理分析。
 *
 *  使用方式：
 *    import { ReasoningMonitor } from './utils/reasoning-monitor.js';
 *
 *    // 记录笔记事件
 *    ReasoningMonitor.recordNote(row, col, value, action, source);
 *
 *    // 记录填数事件
 *    ReasoningMonitor.recordFill(row, col, value, isError);
 *
 *    // 获取当前推理状态
 *    const state = ReasoningMonitor.getReasoningState();
 *
 * ============================================================
 */

// ============================================================
//  类型定义（JSDoc）
// ============================================================

/**
 * @typedef {Object} NoteEvent
 * @property {number} timestamp - 时间戳（毫秒）
 * @property {number} row - 行号（0-8）
 * @property {number} col - 列号（0-8）
 * @property {number} value - 笔记值（1-9）
 * @property {'add'|'remove'|'toggle'} action - 操作类型
 * @property {'manual'|'auto'} source - 来源（手动/自动）
 * @property {string} sessionId - 会话ID
 */

/**
 * @typedef {Object} FillEvent
 * @property {number} timestamp - 时间戳
 * @property {number} row - 行号
 * @property {number} col - 列号
 * @property {number} value - 填入的数字
 * @property {boolean} isError - 是否填错
 */

/**
 * @typedef {Object} PlayerReasoningState
 * @property {number} noteFrequency - 过去60秒内的有效笔记次数（次/60秒）
 * @property {number} noteAccuracy - 当前盘面笔记准确率（0.0 - 1.0）
 * @property {number} errorRate - 填数错误率（错误填数次数 / 总填数次数）
 * @property {string} difficulty - 难度等级
 * @property {boolean} isEureka - 是否刚触发Eureka高光时刻
 * @property {boolean} autoCandidatesOn - 是否开启了自动笔记功能
 * @property {string} playerType - 玩家类型分类
 * @property {number} spatialConcentration - 空间集中度（0-1）
 * @property {number} noteToFillInterval - 笔记到填数的平均间隔（秒）
 * @property {number} totalNotes - 总笔记数
 * @property {number} totalFills - 总填数次数
 */

// ============================================================
//  ReasoningMonitor 类
// ============================================================

class ReasoningMonitor {
  // ========================================================
  //  静态属性
  // ========================================================

  /** @type {NoteEvent[]} 笔记事件历史（滑动窗口，只保留最近300秒） */
  static _noteHistory = [];

  /** @type {FillEvent[]} 填数事件历史 */
  static _fillHistory = [];

  /** @type {number} 最后有效操作时间 */
  static _lastActionTime = Date.now();

  /** @type {number} 总填数次数 */
  static _totalFillCount = 0;

  /** @type {number} 错误填数次数 */
  static _errorFillCount = 0;

  /** @type {string} 当前关卡ID */
  static _currentLevelId = '';

  /** @type {string} 当前章节ID */
  static _currentChapterId = '';

  /** @type {string} 当前难度 */
  static _currentDifficulty = '普通';

  /** @type {boolean} 是否开启自动笔记 */
  static _autoCandidatesOn = false;

  /** @type {boolean} 是否刚触发Eureka */
  static _isEureka = false;

  /** @type {number} Eureka触发后经过的时间（用于衰减） */
  static _eurekaTimestamp = 0;

  /** @type {string} 会话ID */
  static _sessionId = '';

  /** @type {number} 滑动窗口大小（毫秒） */
  static WINDOW_SIZE = 300 * 1000; // 300秒

  /** @type {number} 频率计算窗口（毫秒） */
  static FREQUENCY_WINDOW = 60 * 1000; // 60秒

  // ========================================================
  //  初始化与关卡切换
  // ========================================================

  /**
   * 初始化新关卡
   * @param {string} levelId - 关卡ID
   * @param {string} chapterId - 章节ID
   * @param {string} difficulty - 难度等级
   * @param {boolean} autoCandidatesOn - 是否开启自动笔记
   */
  static initNewLevel(levelId, chapterId = '', difficulty = '普通', autoCandidatesOn = false) {
    this._currentLevelId = levelId;
    this._currentChapterId = chapterId;
    this._currentDifficulty = difficulty;
    this._autoCandidatesOn = autoCandidatesOn;

    this._noteHistory = [];
    this._fillHistory = [];
    this._lastActionTime = Date.now();
    this._totalFillCount = 0;
    this._errorFillCount = 0;
    this._isEureka = false;
    this._eurekaTimestamp = 0;
    this._sessionId = this._generateSessionId();
  }

  /**
   * 生成会话ID
   * @returns {string}
   */
  static _generateSessionId() {
    return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
  }

  // ========================================================
  //  事件记录
  // ========================================================

  /**
   * 记录笔记事件
   * @param {number} row - 行号（0-8）
   * @param {number} col - 列号（0-8）
   * @param {number} value - 笔记值（1-9）
   * @param {'add'|'remove'|'toggle'} action - 操作类型
   * @param {'manual'|'auto'} source - 来源
   */
  static recordNote(row, col, value, action = 'toggle', source = 'manual') {
    const event = {
      timestamp: Date.now(),
      row,
      col,
      value,
      action,
      source,
      sessionId: this._sessionId,
    };

    this._noteHistory.push(event);
    this._lastActionTime = event.timestamp;

    // 清理过期数据（保持滑动窗口）
    this._cleanupOldData();
  }

  /**
   * 记录填数事件
   * @param {number} row - 行号
   * @param {number} col - 列号
   * @param {number} value - 填入的数字
   * @param {boolean} isError - 是否填错
   */
  static recordFill(row, col, value, isError = false) {
    const event = {
      timestamp: Date.now(),
      row,
      col,
      value,
      isError,
    };

    this._fillHistory.push(event);
    this._lastActionTime = event.timestamp;
    this._totalFillCount++;

    if (isError) {
      this._errorFillCount++;
    }

    // 清理过期数据
    this._cleanupOldData();
  }

  /**
   * 设置自动笔记状态
   * @param {boolean} on - 是否开启
   */
  static setAutoCandidates(on) {
    this._autoCandidatesOn = on;
  }

  /**
   * 标记Eureka时刻
   * @param {boolean} value - 是否触发
   */
  static setEureka(value = true) {
    this._isEureka = value;
    if (value) {
      this._eurekaTimestamp = Date.now();
    }
  }

  /**
   * 更新活动时间（用于沉默时长计算）
   */
  static updateActivity() {
    this._lastActionTime = Date.now();
  }

  // ========================================================
  //  数据清理
  // ========================================================

  /**
   * 清理过期数据（滑动窗口）
   */
  static _cleanupOldData() {
    const now = Date.now();
    const cutoff = now - this.WINDOW_SIZE;

    // 清理笔记历史
    while (this._noteHistory.length > 0 && this._noteHistory[0].timestamp < cutoff) {
      this._noteHistory.shift();
    }

    // 填数历史保留全部（用于错误率统计）
    // 但如果数据量太大，可以考虑限制
    if (this._fillHistory.length > 500) {
      this._fillHistory = this._fillHistory.slice(-500);
    }
  }

  // ========================================================
  //  L1 基础层：笔记频率
  // ========================================================

  /**
   * 计算笔记频率（过去60秒内的有效笔记次数）
   * 每次实时计算，不使用缓存值
   * @returns {number} 次/60秒
   */
  static getNoteFrequency() {
    const now = Date.now();
    const cutoff = now - this.FREQUENCY_WINDOW;

    // 只计算手动笔记，排除自动笔记产生的
    const validNotes = this._noteHistory.filter(
      e => e.timestamp >= cutoff && e.source === 'manual'
    );

    // 统计 add 和 toggle 操作（remove 不计入频率）
    const activeNotes = validNotes.filter(
      e => e.action === 'add' || e.action === 'toggle'
    );

    return activeNotes.length;
  }

  /**
   * 获取沉默时长（距最后一次有效操作的秒数）
   * @returns {number} 秒
   */
  static getSilenceDuration() {
    return (Date.now() - this._lastActionTime) / 1000;
  }

  // ========================================================
  //  L2 空间层：笔记分布
  // ========================================================

  /**
   * 计算空间集中度（0-1）
   * 值越高说明笔记越集中在少数区域（局部深挖）
   * 值越低说明笔记越分散（全局扫视）
   * @returns {number} 0-1
   */
  static getSpatialConcentration() {
    const manualNotes = this._noteHistory.filter(e => e.source === 'manual');
    if (manualNotes.length < 5) return 0.5; // 数据不足，返回默认值

    // 按宫统计笔记数量
    const boxCounts = new Array(9).fill(0);
    for (const note of manualNotes) {
      const box = Math.floor(note.row / 3) * 3 + Math.floor(note.col / 3);
      boxCounts[box]++;
    }

    // 计算赫芬达尔-赫希曼指数（HHI）作为集中度
    const total = manualNotes.length;
    let hhi = 0;
    for (const count of boxCounts) {
      const share = count / total;
      hhi += share * share;
    }

    // HHI 范围：1/9（均匀分布）~ 1（完全集中）
    // 归一化到 0-1
    const minHHI = 1 / 9;
    const normalized = (hhi - minHHI) / (1 - minHHI);

    return Math.max(0, Math.min(1, normalized));
  }

  /**
   * 计算扩散速度（最近60秒内涉及的宫数）
   * @returns {number} 涉及的宫数（1-9）
   */
  static getSpatialSpread() {
    const now = Date.now();
    const cutoff = now - this.FREQUENCY_WINDOW;

    const recentNotes = this._noteHistory.filter(
      e => e.timestamp >= cutoff && e.source === 'manual'
    );

    const boxes = new Set();
    for (const note of recentNotes) {
      const box = Math.floor(note.row / 3) * 3 + Math.floor(note.col / 3);
      boxes.add(box);
    }

    return boxes.size;
  }

  // ========================================================
  //  L3 逻辑层：笔记准确率
  // ========================================================

  /**
   * 计算笔记准确率
   * 玩家标记的笔记中属于终盘答案的比例
   *
   * 需要传入当前盘面的正确答案（如果有）
   * @param {number[][]} solution - 终盘答案（可选，没有则返回最近的估计值）
   * @returns {number} 0.0 - 1.0
   */
  static getNoteAccuracy(solution = null) {
    // 如果有答案，精确计算
    if (solution && this._noteHistory.length > 0) {
      return this._calcAccuracyWithSolution(solution);
    }

    // 没有答案时，使用启发式估计
    return this._estimateAccuracy();
  }

  /**
   * 使用终盘答案精确计算笔记准确率（兼容旧接口）
   * @param {number[][]} solution
   * @returns {number}
   */
  static _calcAccuracyWithSolution(solution) {
    const manualNotes = this._noteHistory.filter(e => e.source === 'manual');
    if (manualNotes.length === 0) return 0.5;

    // 统计每格的当前笔记状态
    const cellCandidates = this._buildCurrentNoteState();

    // 计算准确率：笔记包含正确答案的格子比例
    let cellsWithNotes = 0;
    let cellsWithCorrectCandidate = 0;
    for (const key in cellCandidates) {
      const [row, col] = key.split(',').map(Number);
      const correctNum = solution && solution[row] ? solution[row][col] : null;
      if (!correctNum) continue;
      cellsWithNotes++;
      if (cellCandidates[key].has(correctNum)) {
        cellsWithCorrectCandidate++;
      }
    }
    if (cellsWithNotes === 0) return 0.5;
    return cellsWithCorrectCandidate / cellsWithNotes;
  }

  /**
   * 2026-08-03 新增：以引擎候选数为基准的笔记准确率。
   * 玩家笔记中属于"当前盘面理论候选数"的比例——比终盘答案更贴合推理中途状态。
   * @param {Board} board - cagemaster4 Board 实例（cell.candidates 为 Set）
   * @returns {number} 0.0 - 1.0
   */
  static getNoteAccuracyVsCandidates(board) {
    if (!board) return this.getNoteAccuracy();
    const manualNotes = this._noteHistory.filter(e => e.source === 'manual');
    if (manualNotes.length === 0) return 0.5;

    // 保证候选数为最新
    try { if (typeof board.updateCandidates === 'function') board.updateCandidates(); } catch (e) {}

    const cellCandidates = this._buildCurrentNoteState();
    let total = 0;
    let correct = 0;
    for (const key in cellCandidates) {
      const [row, col] = key.split(',').map(Number);
      const cell = board.cells && board.cells[row] ? board.cells[row][col] : null;
      if (!cell || cell.fixedNum || cell.fillNum) continue;
      const engineSet = cell.candidates || new Set();
      if (engineSet.size === 0) continue; // 无法判定的格子跳过
      for (const cand of cellCandidates[key]) {
        total++;
        if (engineSet.has(cand)) correct++;
      }
    }
    if (total === 0) return 0.5;
    return correct / total;
  }

  /**
   * 从笔记历史重建每格当前笔记状态
   * @returns {Object<string, Set<number>>}
   * @private
   */
  static _buildCurrentNoteState() {
    const cellCandidates = {};
    const manualNotes = this._noteHistory.filter(e => e.source === 'manual');
    for (const note of manualNotes) {
      const key = note.row + ',' + note.col;
      if (!cellCandidates[key]) cellCandidates[key] = new Set();
      if (note.action === 'add') {
        cellCandidates[key].add(note.value);
      } else if (note.action === 'remove') {
        cellCandidates[key].delete(note.value);
      } else if (note.action === 'toggle') {
        if (cellCandidates[key].has(note.value)) cellCandidates[key].delete(note.value);
        else cellCandidates[key].add(note.value);
      }
    }
    return cellCandidates;
  }

  /**
   * 启发式估计准确率（没有答案时）
   * 基于：笔记数量变化趋势、删除频率等
   * @returns {number}
   */
  static _estimateAccuracy() {
    const manualNotes = this._noteHistory.filter(e => e.source === 'manual');
    if (manualNotes.length === 0) return 0.5;

    // 简单启发：删除操作占比高 → 准确率低（在摸索）
    const addCount = manualNotes.filter(e => e.action === 'add').length;
    const removeCount = manualNotes.filter(e => e.action === 'remove').length;
    const toggleCount = manualNotes.filter(e => e.action === 'toggle').length;

    // 如果删除很多，说明在不断试错
    const total = addCount + removeCount + toggleCount;
    if (total === 0) return 0.5;

    const removeRatio = removeCount / total;

    // 删除比例越高，估计准确率越低
    // 0% 删除 → 0.8 准确率
    // 50% 删除 → 0.5 准确率
    // 100% 删除 → 0.2 准确率
    const estimated = 0.8 - removeRatio * 0.6;

    return Math.max(0.1, Math.min(0.95, estimated));
  }

  // ========================================================
  //  L4 预测层：笔记→填数关系
  // ========================================================

  /**
   * 计算笔记到填数的平均间隔
   * @returns {number} 平均间隔（秒）
   */
  static getNoteToFillInterval() {
    if (this._fillHistory.length === 0 || this._noteHistory.length === 0) {
      return 30; // 默认值
    }

    // 找出每次填数前最后一次笔记的时间间隔
    const intervals = [];

    for (const fill of this._fillHistory) {
      // 找到这次填数前最近的一次手动笔记
      let lastNoteTime = null;
      for (let i = this._noteHistory.length - 1; i >= 0; i--) {
        const note = this._noteHistory[i];
        if (note.timestamp < fill.timestamp && note.source === 'manual') {
          lastNoteTime = note.timestamp;
          break;
        }
      }

      if (lastNoteTime !== null) {
        const interval = (fill.timestamp - lastNoteTime) / 1000;
        if (interval < 300) { // 只考虑5分钟内的
          intervals.push(interval);
        }
      }
    }

    if (intervals.length === 0) return 30;

    // 返回中位数
    intervals.sort((a, b) => a - b);
    const mid = Math.floor(intervals.length / 2);
    return intervals[mid];
  }

  /**
   * 判断玩家类型
   * @returns {'systematic'|'intuitive'|'cautious'|'adventurous'|'novice'}
   */
  static getPlayerType() {
    const freq = this.getNoteFrequency();
    const accuracy = this.getNoteAccuracy();
    const concentration = this.getSpatialConcentration();
    const totalNotes = this._noteHistory.filter(e => e.source === 'manual').length;
    const errorRate = this.getErrorRate();

    // 新手型：笔记少、准确率低、错误率高
    if (totalNotes < 10 && errorRate > 0.3) {
      return 'novice';
    }

    // 系统型：笔记规律、覆盖全面、准确率高
    if (freq >= 3 && accuracy > 0.7 && concentration < 0.6) {
      return 'systematic';
    }

    // 直觉型：笔记少、跳跃性强、集中度高
    if (freq < 2 && concentration > 0.7) {
      return 'intuitive';
    }

    // 谨慎型：笔记多、反复验证、删除多
    if (freq >= 4 && accuracy > 0.6) {
      return 'cautious';
    }

    // 冒险型：笔记少、填数快、错误率高
    if (freq < 2 && errorRate > 0.2) {
      return 'adventurous';
    }

    // 默认
    return 'systematic';
  }

  // ========================================================
  //  错误率
  // ========================================================

  /**
   * 获取填数错误率
   * @returns {number} 0.0 - 1.0
   */
  static getErrorRate() {
    if (this._totalFillCount === 0) return 0;
    return this._errorFillCount / this._totalFillCount;
  }

  /**
   * 获取总填数次数
   * @returns {number}
   */
  static getTotalFillCount() {
    return this._totalFillCount;
  }

  /**
   * 获取总笔记数（手动）
   * @returns {number}
   */
  static getTotalNoteCount() {
    return this._noteHistory.filter(e => e.source === 'manual').length;
  }

  // ========================================================
  //  综合状态输出
  // ========================================================

  /**
   * 获取当前推理状态快照
   * @param {number[][]} [solution] - 终盘答案（可选，用于精确计算准确率）
   * @returns {PlayerReasoningState}
   */
  static getReasoningState(solution = null, board = null) {
    // Eureka 状态在 5 秒后自动衰减
    const eurekaDuration = Date.now() - this._eurekaTimestamp;
    const isEureka = this._isEureka && eurekaDuration < 5000;

    return {
      noteFrequency: this.getNoteFrequency(),
      noteAccuracy: this.getNoteAccuracy(solution),
      errorRate: this.getErrorRate(),
      difficulty: this._currentDifficulty,
      isEureka: isEureka,
      autoCandidatesOn: this._autoCandidatesOn,
      playerType: this.getPlayerType(),
      spatialConcentration: this.getSpatialConcentration(),
      noteToFillInterval: this.getNoteToFillInterval(),
      totalNotes: this.getTotalNoteCount(),
      totalFills: this._totalFillCount,
      silenceDuration: this.getSilenceDuration(),
    };
  }

  // ========================================================
  //  数据导出（用于回放和数据回收）
  // ========================================================

  /**
   * 获取笔记事件历史（用于回放）
   * @returns {NoteEvent[]}
   */
  static getNoteHistory() {
    return [...this._noteHistory];
  }

  /**
   * 获取填数事件历史（用于回放）
   * @returns {FillEvent[]}
   */
  static getFillHistory() {
    return [...this._fillHistory];
  }

  /**
   * 获取推理摘要（用于数据回收）
   * @param {number[][]} [solution] - 终盘答案
   * @returns {Object} 匿名化的推理摘要
   */
  static getReasoningSummary(solution = null) {
    const state = this.getReasoningState(solution);

    // 计算推理路径（主导的推理模式序列）
    const reasoningPath = this._extractReasoningPath();

    return {
      levelId: this._currentLevelId,
      chapterId: this._currentChapterId,
      noteFrequency: Math.round(state.noteFrequency * 10) / 10,
      noteAccuracy: Math.round(state.noteAccuracy * 100) / 100,
      errorRate: Math.round(state.errorRate * 100) / 100,
      spatialConcentration: Math.round(state.spatialConcentration * 100) / 100,
      playerType: state.playerType,
      reasoningPath: reasoningPath,
      totalTime: 0, // 由外部填充
      totalNotes: state.totalNotes,
      totalFills: state.totalFills,
    };
  }

  /**
   * 提取推理路径（玩家主要使用的推理模式序列）
   * @returns {string[]}
   */
  static _extractReasoningPath() {
    // 简化实现：根据笔记分布特征推断
    const path = [];
    const concentration = this.getSpatialConcentration();
    const freq = this.getNoteFrequency();

    if (concentration > 0.6) {
      path.push('box'); // 宫优先
    } else if (concentration < 0.3) {
      path.push('row'); // 行/列优先
    }

    if (freq >= 4) {
      path.push('cage'); // 笼子分析多
    }

    if (path.length === 0) {
      path.push('mixed');
    }

    return path;
  }

  // ========================================================
  //  调试方法
  // ========================================================

  /**
   * 打印当前状态（调试用）
   */
  static debugPrint() {
    const state = this.getReasoningState();
    console.log('=== ReasoningMonitor State ===');
    console.log(`  笔记频率: ${state.noteFrequency.toFixed(1)} 次/60秒`);
    console.log(`  笔记准确率: ${(state.noteAccuracy * 100).toFixed(1)}%`);
    console.log(`  错误率: ${(state.errorRate * 100).toFixed(1)}%`);
    console.log(`  空间集中度: ${(state.spatialConcentration * 100).toFixed(1)}%`);
    console.log(`  玩家类型: ${state.playerType}`);
    console.log(`  沉默时长: ${state.silenceDuration.toFixed(1)} 秒`);
    console.log(`  自动笔记: ${state.autoCandidatesOn ? '开启' : '关闭'}`);
    console.log(`  总笔记数: ${state.totalNotes}`);
    console.log(`  总填数: ${state.totalFills}`);
    console.log('==============================');
  }
}

// ============================================================
//  导出
// ============================================================

if (typeof window !== 'undefined') {
  window.ReasoningMonitor = ReasoningMonitor;
}
