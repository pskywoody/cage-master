// ==========================================
// 技巧识别反馈系统 (TechniqueFeedback) - P0
// ==========================================
// 智能识别玩家填数时使用的数独技巧，并触发守笼人反馈台词
// 检测顺序：孤星 → 隐曜 → 星衡法则 → 并蒂锁
// 特性：全局冷却 / 同类冷却 / 首次例外 / 连击检测
// ==========================================

(function(global) {
  'use strict';

  // ---------- 常量 ----------
  const STORAGE_KEY = 'killersudoku_tech_firstused';

  // 技巧优先级（数值越大越高级）
  const TECH_PRIORITY = {
    nakedSingle: 1,
    hiddenSingle: 2,
    rule45: 3,
    nakedPair: 4
  };

  // 高级技巧（参与连击检测）
  const ADVANCED_TECHS = ['hiddenSingle', 'rule45', 'nakedPair'];

  // 同类冷却时间（毫秒）
  const GLOBAL_COOLDOWN_MS = 5000;    // 全局冷却：任何反馈后 5 秒
  const TECH_COOLDOWN_MS = 30000;     // 同类冷却：同一技巧 30 秒
  const COMBO_THRESHOLD = 3;           // 连击阈值

  // ---------- 模块对象 ----------
  const TechniqueFeedback = {

    // ---------- 状态 ----------
    _board: null,                    // board 引用
    _beforeState: null,            // 填数前状态快照
    _globalCooldownUntil: 0,          // 全局冷却截止时间戳
    _techniqueCooldowns: {},          // 各技巧冷却截止时间戳
    _firstTimeUsed: {},              // 各技巧是否首次使用
    _comboCount: {},              // 各技巧连续使用次数
    _lastTechnique: null,           // 上一次识别的技巧
    _enabled: true,               // 是否启用

    // ==========================================
    // 功能1：初始化与状态持久化
    // ==========================================

    /**
     * 初始化技巧反馈系统
     * @param {Object} board - 游戏棋盘对象
     */
    init(board) {
      this._board = board;
      this._beforeState = null;
      this._globalCooldownUntil = 0;
      this._techniqueCooldowns = {};
      this._comboCount = {};
      this._lastTechnique = null;
      this._enabled = true;

      // 初始化所有技巧的冷却和连击计数
      for (const tech of Object.keys(TECH_PRIORITY)) {
        this._techniqueCooldowns[tech] = 0;
        this._comboCount[tech] = 0;
      }

      // 从 localStorage 加载首次使用标记
      this._loadFirstTimeUsed();
    },

    /**
     * 从 localStorage 加载首次使用标记
     */
    _loadFirstTimeUsed() {
      this._firstTimeUsed = {};
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const data = JSON.parse(raw);
            for (const tech of Object.keys(TECH_PRIORITY)) {
              this._firstTimeUsed[tech] = !!data[tech];
            }
          }
        }
      } catch (e) {
        // 读取失败时默认全部未使用
        for (const tech of Object.keys(TECH_PRIORITY)) {
          this._firstTimeUsed[tech] = false;
        }
      }
    },

    /**
     * 保存首次使用标记到 localStorage
     */
    _saveFirstTimeUsed() {
      try {
        if (typeof localStorage !== 'undefined') {
          const data = {};
          for (const tech of Object.keys(TECH_PRIORITY)) {
            data[tech] = !!this._firstTimeUsed[tech];
          }
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
      } catch (e) {
        // 静默失败
      }
    },

    /**
     * 记录填数前的状态快照（在填数操作之前调用）
     * 保存目标格笔记、当前 hint 等信息
     * @param {Object} board - 游戏棋盘
     */
    recordBeforeState(board) {
      if (!this._enabled) return;
      const b = board || this._board;
      if (!b) return;

      const state = {
        candidates: {},   // "r,c" → 笔记组
        hint: null,       // getNextHint() 返回值
        timestamp: Date.now()
      };

      // 记录所有空格的笔记（用于星衡法则等检测）
      for (let r = 0; r < b.size; r++) {
        for (let c = 0; c < b.size; c++) {
          const cell = b.cells[r][c];
          if (!cell.fixedNum && !cell.fillNum) {
            const cands = b.getCandidates(r, c, true);
            state.candidates[`${r},${c}`] = cands;
          }
        }
      }

      // 记录当前 hint（填数前的 hint 状态）
      if (typeof b.getNextHint === 'function') {
        try {
          state.hint = b.getNextHint();
        } catch (e) {
          state.hint = null;
        }
      }

      this._beforeState = state;
    },

    /**
     * 获取填数后调用，执行检测+反馈
     * @param {Object} board - 游戏棋盘
     * @param {number} r - 行
     * @param {number} c - 列
     * @param {number} num - 填入的数字
     */
    onNumberFilled(board, r, c, num) {
      if (!this._enabled) return;
      const b = board || this._board;
      if (!b) return;

      // 检测使用的技巧
      const technique = this.detectTechnique(b, r, c, num);
      if (!technique) return;

      // 更新连击计数
      this._updateCombo(technique);

      // 调度反馈
      this.triggerFeedback(technique, r, c, num);
    },

    /**
     * 启用/禁用反馈系统
     */
    setEnabled(enabled) {
      this._enabled = !!enabled;
    },

    // ==========================================
    // 功能2：技巧检测器
    // ==========================================

    /**
     * 检测玩家这一步使用了什么技巧
     * 检测顺序从简单到复杂，返回置信度最高的匹配
     * @param {Object} board - 游戏棋盘
     * @param {number} r - 行
     * @param {number} c - 列
     * @param {number} num - 填入的数字
     * @returns {string|null} 技巧名称或 null
     */
    detectTechnique(board, r, c, num) {
      const before = this._beforeState;
      if (!before) return null;

      const key = `${r},${c}`;

      // --- 1. 孤星（Naked Single）：填数前该格笔记只有1个
      const beforeCands = before.candidates[key];
      if (beforeCands && beforeCands.length === 1 && beforeCands[0] === num) {
        return 'nakedSingle';
      }

      // --- 2. 隐曜（Hidden Single）：该数字在所在行/列/宫/笼中只出现在这一格
      // 复用 board 的 getNextHint 逻辑：如果填数前的 hint 是 hiddenSingle 且匹配 (r,c,num)
      if (before.hint && before.hint.technique === 'hiddenSingle' &&
          before.hint.r === r && before.hint.c === c && before.hint.num === num) {
        return 'hiddenSingle';
      }

      // 如果 hint 可能是更高级的技巧但填出的数也可能是隐曜，额外做一次隐曜检测
      // 检查该数字在所在行/列/宫/笼中是否只出现在这一格
      if (this._isHiddenSingle(board, r, c, num, before)) {
        return 'hiddenSingle';
      }

      // --- 3. 星衡法则（Rule of 45）：笼子剩余和值唯一匹配
      if (this._isRuleOf45(board, r, c, num, before)) {
        return 'rule45';
      }

      // --- 4. 并蒂锁（Naked Pair）：两个格子构成数对
      if (before.hint && before.hint.technique === 'nakedPair' &&
          before.hint.r === r && before.hint.c === c &&
          before.hint.num === num) {
        return 'nakedPair';
      }

      return null;
    },

    /**
     * 辅助检测：判断是否为隐曜
     * 检查填入的数字在所在行/列/宫/笼中是否只出现在这一格
     */
    _isHiddenSingle(board, r, c, num, before) {
      // 行检查：num 在第 r 行中是否只出现在第 c 列
      let count = 0;
      for (let cc = 0; cc < board.size; cc++) {
        const k = `${r},${cc}`;
        const cands = before.candidates[k];
        if (cands && cands.includes(num)) count++;
        if (count > 1) break;
      }
      if (count === 1) return true;

      // 列检查：num 在第 c 列中是否只出现在第 r 行
      count = 0;
      for (let rr = 0; rr < board.size; rr++) {
        const k = `${rr},${c}`;
        const cands = before.candidates[k];
        if (cands && cands.includes(num)) count++;
        if (count > 1) break;
      }
      if (count === 1) return true;

      // 宫检查
      const { boxW, boxH } = board.getBoxSize();
      const br = Math.floor(r / boxH) * boxH;
      const bc = Math.floor(c / boxW) * boxW;
      count = 0;
      for (let dr = 0; dr < boxH; dr++) {
        for (let dc = 0; dc < boxW; dc++) {
          const rr = br + dr;
          const cc = bc + dc;
          const k = `${rr},${cc}`;
          const cands = before.candidates[k];
          if (cands && cands.includes(num)) count++;
          if (count > 1) break;
        }
        if (count > 1) break;
      }
      if (count === 1) return true;

      // 笼检查
      const cell = board.cells[r][c];
      if (cell.cageId !== null && board.cageIdToCells && board.cageIdToCells[cell.cageId]) {
        count = 0;
        for (const [cr, cc] of board.cageIdToCells[cell.cageId]) {
          const k = `${cr},${cc}`;
          const cands = before.candidates[k];
          if (cands && cands.includes(num)) count++;
          if (count > 1) break;
        }
        if (count === 1) return true;
      }

      return false;
    },

    /**
     * 辅助检测：判断是否为星衡法则
     * 笼子剩余未填格的笔记之和是否唯一等于剩余和值
     * P0 仅支持剩余2格的情况
     */
    _isRuleOf45(board, r, c, num, before) {
      const cell = board.cells[r][c];
      const cageId = cell.cageId;
      if (cageId === null) return false;
      if (!board.cageIdToCells || !board.cageIdToCells[cageId]) return false;

      // 找到笼子
      const cage = board.cages.find(cg => cg.id === cageId);
      if (!cage || !cage.sum) return false;

      const cageCells = board.cageIdToCells[cageId];

      // 找出笼子中填数前的所有未填格及其候选
      const unfilled = [];
      let filledSum = 0;
      for (const [cr, cc] of cageCells) {
        const k = `${cr},${cc}`;
        const cands = before.candidates[k];
        if (cands) {
          // 填数前未填
          unfilled.push({ r: cr, c: cc, cands });
        } else {
          // 填数前已填（固定数或已填数）
          const ccCell = board.cells[cr][cc];
          const val = ccCell.fixedNum || ccCell.fillNum;
          if (val) filledSum += val;
        }
      }

      // 剩余格数
      const remaining = unfilled.length;
      if (remaining <= 1) return false;  // 1格就是孤星了，跳过
      if (remaining > 2) return false;   // P0 不检测大于2格的情况，P1 再加

      // 剩余和
      const remainingSum = cage.sum - filledSum;

      // 剩余2格：统计所有候选组合中等于剩余和的组合数
      const cell1 = unfilled.find(u => u.r === r && u.c === c);
      if (!cell1 || !cell1.cands.includes(num)) return false;

      const other = unfilled.find(u => !(u.r === r && u.c === c));
      if (!other) return false;

      // 统计有多少对组合满足 n1 + n2 = remainingSum 且 n1 != n2
      let validPairs = 0;
      for (const n1 of cell1.cands) {
        for (const n2 of other.cands) {
          if (n1 + n2 === remainingSum && n1 !== n2) {
            validPairs++;
            if (validPairs > 1) break;
          }
        }
        if (validPairs > 1) break;
      }

      // 唯一组合 → 星衡法则成立
      return validPairs === 1;
    },

    // ==========================================
    // 功能3：反馈调度器
    // ==========================================

    /**
     * 调度反馈
     * 规则：
     * - 全局冷却：任何反馈后 5 秒内不触发下一次
     * - 同类冷却：同一技巧 30 秒内不重复
     * - 首次例外：首次使用某技巧时无视冷却，强制触发
     * - 优先级：首次使用 > 高级技巧 > 低级技巧
     * @param {string} technique - 技巧名称
     * @param {number} r - 行
     * @param {number} c - 列
     * @param {number} num - 数字
     */
    triggerFeedback(technique, r, c, num) {
      const now = Date.now();
      const isFirst = !this._firstTimeUsed[technique];
      const isCombo = ADVANCED_TECHS.includes(technique) &&
                      this._comboCount[technique] >= COMBO_THRESHOLD;

      // 首次使用：无视所有冷却，强制触发
      if (isFirst) {
        this._firstTimeUsed[technique] = true;
        this._saveFirstTimeUsed();
        this._showFeedback(technique, 'first', r, c, num);
        this._globalCooldownUntil = now + GLOBAL_COOLDOWN_MS;
        this._techniqueCooldowns[technique] = now + TECH_COOLDOWN_MS;
        return;
      }

      // 连击触发：高级技巧连续3次，无视冷却触发连击台词
      if (isCombo) {
        this._showFeedback(technique, 'combo', r, c, num);
        this._globalCooldownUntil = now + GLOBAL_COOLDOWN_MS;
        this._techniqueCooldowns[technique] = now + TECH_COOLDOWN_MS;
        // 连击后重置计数
        this._comboCount[technique] = 0;
        return;
      }

      // 检查全局冷却
      if (now < this._globalCooldownUntil) return;

      // 检查同类冷却
      if (this._techniqueCooldowns[technique] && now < this._techniqueCooldowns[technique]) return;

      // 正常触发
      this._showFeedback(technique, 'normal', r, c, num);
      this._globalCooldownUntil = now + GLOBAL_COOLDOWN_MS;
      this._techniqueCooldowns[technique] = now + TECH_COOLDOWN_MS;
    },

    // ==========================================
    // 功能4：连击检测
    // ==========================================

    /**
     * 更新连击计数
     * 连续使用同一技巧计数+1，换技巧则重置对应计数
     * @param {string} technique - 当前技巧
     */
    _updateCombo(technique) {
      if (this._lastTechnique === technique) {
        this._comboCount[technique] = (this._comboCount[technique] || 0) + 1;
      } else {
        // 换技巧：重置上一个技巧的连击计数
        if (this._lastTechnique) {
          this._comboCount[this._lastTechnique] = 0;
        }
        this._comboCount[technique] = 1;
        this._lastTechnique = technique;
      }
    },

    /**
     * 获取当前连击数
     * @param {string} technique - 技巧名称
     * @returns {number} 连击次数
     */
    getComboCount(technique) {
      return this._comboCount[technique] || 0;
    },

    // ==========================================
    // 功能5：反馈触发
    // ==========================================

    /**
     * 显示反馈
     * 从 i18n 读取对应台词，调用 StoryEngine 或 ComedySystem 显示
     * @param {string} technique - 技巧名称
     * @param {string} type - 类型：first / normal / combo
     * @param {number} r - 行
     * @param {number} c - 列
     * @param {number} num - 数字
     */
    _showFeedback(technique, type, r, c, num) {
      // 从 i18n 获取台词
      const lines = this._t(`comedy.keeper.tech_${technique}_${type}`);
      if (!lines || !Array.isArray(lines) || lines.length === 0) return;

      // 随机选一句
      const text = lines[Math.floor(Math.random() * lines.length)];
      if (!text) return;

      // 情绪映射
      const emotionMap = {
        first: 'surprised',
        normal: 'smile',
        combo: 'smirk'
      };
      const emotion = emotionMap[type] || 'default';

      // 优先使用 StoryEngine 环境台词（立绘+打字机）
      if (typeof global.StoryEngine !== 'undefined' &&
          global.StoryEngine &&
          typeof global.StoryEngine.sayAmbient) {
        try {
          global.StoryEngine.sayAmbient('cagekeeper', emotion, text);
          return;
        } catch (e) {
          // 失败则降级
        }
      }

      // 降级到 ComedySystem._showBubble
      if (typeof global.ComedySystem !== 'undefined' &&
          global.ComedySystem &&
          typeof global.ComedySystem._showBubble === 'function') {
        try {
          global.ComedySystem._showBubble(
            '守笼人',
            text,
            'linear-gradient(135deg,#6366f1,#4f46e5)',
            '🧙',
            emotion
          );
        } catch (e) {
          // 静默失败
        }
      }
    },

    /**
     * i18n 辅助：获取原始翻译消息（支持数组）
     * @param {string} key - 翻译键
     * @returns {*} 翻译结果
     */
    _t(key) {
      try {
        if (typeof global.I18N !== 'undefined' && global.I18N) {
          if (typeof global.I18N.getRaw === 'function') {
            return global.I18N.getRaw(key);
          }
          if (global.I18N.messages) {
            // 手动深度查找
            const parts = key.split('.');
            let obj = global.I18N.messages;
            for (const part of parts) {
              if (obj && typeof obj === 'object' && part in obj) {
                obj = obj[part];
              } else {
                return null;
              }
            }
            return obj;
          }
        }
        // 兼容全局 t 函数（t 对数组返回 key，不适合此处）
      } catch (e) {
        // 静默失败
      }
      return null;
    },

    // ==========================================
    // 工具方法
    // ==========================================

    /**
     * 重置所有状态（不重置首次使用标记）
     */
    reset() {
      this._beforeState = null;
      this._globalCooldownUntil = 0;
      this._lastTechnique = null;
      for (const tech of Object.keys(TECH_PRIORITY)) {
        this._techniqueCooldowns[tech] = 0;
        this._comboCount[tech] = 0;
      }
    },

    /**
     * 清除首次使用记录（调试用）
     */
    clearFirstTimeRecords() {
      for (const tech of Object.keys(TECH_PRIORITY)) {
        this._firstTimeUsed[tech] = false;
      }
      this._saveFirstTimeUsed();
    },

    /**
     * 获取当前是否首次使用某技巧
     * @param {string} technique - 技巧名称
     * @returns {boolean}
     */
    isFirstTime(technique) {
      return !this._firstTimeUsed[technique];
    },

    /**
     * 销毁，释放引用
     */
    destroy() {
      this._board = null;
      this._beforeState = null;
    }
  };

  // ---------- 导出到全局 ----------
  global.TechniqueFeedback = TechniqueFeedback;

})(typeof window !== 'undefined' ? window : this);
