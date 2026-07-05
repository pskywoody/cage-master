/**
 * ============================================================
 *  DialogueDatabase - 台词数据库与运行时追踪器
 * ============================================================
 *
 *  管理所有角色台词，支持按类型、角色、标签查询，
 *  并追踪已使用的台词，避免重复。
 *
 *  台词类型（DialogueType）：
 *  - direction: 方向性引导（"看那边"）
 *  - strategy: 策略性引导（"试试这个思路"）
 *  - note_guide: 笔记引导（"先标记候选数"）
 *  - eureka: Eureka赞美（"漂亮！"）
 *  - tease: 吐槽/激将
 *  - answer: 直接给答案
 *  - error: 说错版本
 *
 *  使用限制（DialogueUsage）：
 *  - maxPerLevel: 每关最大触发次数
 *  - cooldown: 冷却时间（秒）
 *  - priority: 优先级（1=普通，2=优先，3=强制）
 *
 * ============================================================
 */

// ============================================================
//  类型定义
// ============================================================

/**
 * @typedef {'direction'|'strategy'|'note_guide'|'eureka'|'tease'|'answer'|'error'} DialogueType
 */

/**
 * @typedef {Object} DialogueUsage
 * @property {number} maxPerLevel - 每关最大触发次数
 * @property {number} cooldown - 冷却时间（秒）
 * @property {number} priority - 优先级 1-3
 */

/**
 * @typedef {Object} DialogueLine
 * @property {string} id - 台词ID
 * @property {'ray'|'keeper'|'plotter'} speaker - 说话角色
 * @property {string} text - 台词文本
 * @property {DialogueType} type - 台词类型
 * @property {string[]} tags - 标签
 * @property {DialogueUsage} usage - 使用限制
 * @property {Object} [conditions] - 触发条件
 * @property {string} [errorType] - 错误类型（'position'|'value'|'random'）
 */

// ============================================================
//  内置台词数据
// ============================================================

const BUILTIN_DIALOGUES = [
  // ========================================================
  //  阿岩台词（ray）- 活泼/吐槽型
  // ========================================================

  // --- 方向性引导 (direction) ---
  {
    id: 'ray_dir_001',
    speaker: 'ray',
    text: '喂！那边那个格子空了多久了？你看不见吗？',
    type: 'direction',
    tags: ['casual', 'point'],
    usage: { maxPerLevel: 3, cooldown: 30, priority: 2 },
  },
  {
    id: 'ray_dir_002',
    speaker: 'ray',
    text: '看这里看这里！这一行就剩一个空了！',
    type: 'direction',
    tags: ['casual', 'excited'],
    usage: { maxPerLevel: 3, cooldown: 30, priority: 2 },
  },
  {
    id: 'ray_dir_003',
    speaker: 'ray',
    text: '你在同一行点了五次了！换个地方试试好不好！',
    type: 'direction',
    tags: ['tease', 'casual'],
    usage: { maxPerLevel: 2, cooldown: 45, priority: 1 },
  },
  {
    id: 'ray_dir_004',
    speaker: 'ray',
    text: '那个笼子！就差一个数了！',
    type: 'direction',
    tags: ['cage', 'excited'],
    usage: { maxPerLevel: 3, cooldown: 30, priority: 2 },
  },
  {
    id: 'ray_dir_005',
    speaker: 'ray',
    text: '左下角！左下角你看了吗？',
    type: 'direction',
    tags: ['spatial', 'casual'],
    usage: { maxPerLevel: 2, cooldown: 40, priority: 1 },
  },

  // --- 策略性引导 (strategy) ---
  {
    id: 'ray_strat_001',
    speaker: 'ray',
    text: '先把能确定的都填了，剩下的就简单了！',
    type: 'strategy',
    tags: ['advice', 'casual'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 2 },
  },
  {
    id: 'ray_strat_002',
    speaker: 'ray',
    text: '这个笼子的和是固定的，倒着推试试？',
    type: 'strategy',
    tags: ['cage', 'advice'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 2 },
  },
  {
    id: 'ray_strat_003',
    speaker: 'ray',
    text: '试试45法则！一整行加起来肯定是45嘛！',
    type: 'strategy',
    tags: ['rule45', 'advice'],
    usage: { maxPerLevel: 2, cooldown: 90, priority: 2 },
  },

  // --- 笔记引导 (note_guide) ---
  {
    id: 'ray_note_001',
    speaker: 'ray',
    text: '别光看啊！先把候选数标上！',
    type: 'note_guide',
    tags: ['encourage', 'casual'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 2 },
  },
  {
    id: 'ray_note_002',
    speaker: 'ray',
    text: '好记性不如烂笔头！标记一下嘛！',
    type: 'note_guide',
    tags: ['encourage', 'casual'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 1 },
  },

  // --- Eureka赞美 (eureka) ---
  {
    id: 'ray_eureka_001',
    speaker: 'ray',
    text: '对！就是这样！手感来了别停！',
    type: 'eureka',
    tags: ['praise', 'excited'],
    usage: { maxPerLevel: 99, cooldown: 10, priority: 3 },
  },
  {
    id: 'ray_eureka_002',
    speaker: 'ray',
    text: '漂亮！这一下连锁反应太爽了！',
    type: 'eureka',
    tags: ['praise', 'excited'],
    usage: { maxPerLevel: 99, cooldown: 10, priority: 3 },
  },
  {
    id: 'ray_eureka_003',
    speaker: 'ray',
    text: '卧槽你也太强了吧！',
    type: 'eureka',
    tags: ['praise', 'surprised'],
    usage: { maxPerLevel: 99, cooldown: 15, priority: 3 },
  },
  {
    id: 'ray_eureka_004',
    speaker: 'ray',
    text: '神之一手！这就是神之一手！',
    type: 'eureka',
    tags: ['praise', 'excited'],
    usage: { maxPerLevel: 99, cooldown: 15, priority: 3 },
  },

  // --- 吐槽 (tease) ---
  {
    id: 'ray_tease_001',
    speaker: 'ray',
    text: '不是吧，这一行就剩一个空了，你还能卡住？',
    type: 'tease',
    tags: ['tease', 'casual'],
    usage: { maxPerLevel: 5, cooldown: 45, priority: 1 },
  },
  {
    id: 'ray_tease_002',
    speaker: 'ray',
    text: '喂喂喂，你睡着了吗？',
    type: 'tease',
    tags: ['tease', 'casual'],
    usage: { maxPerLevel: 3, cooldown: 60, priority: 1 },
  },
  {
    id: 'ray_tease_003',
    speaker: 'ray',
    text: '我都快睡着了……',
    type: 'tease',
    tags: ['tease', 'bored'],
    usage: { maxPerLevel: 2, cooldown: 90, priority: 1 },
  },

  // --- 答案 (answer) ---
  {
    id: 'ray_answer_001',
    speaker: 'ray',
    text: '行行行！就是5！快填！别磨蹭！',
    type: 'answer',
    tags: ['impatient', 'casual'],
    usage: { maxPerLevel: 99, cooldown: 0, priority: 1 },
  },
  {
    id: 'ray_answer_002',
    speaker: 'ray',
    text: '我都把答案拍你脸上了！你还能填错？！',
    type: 'answer',
    tags: ['surprised', 'casual'],
    usage: { maxPerLevel: 99, cooldown: 0, priority: 1 },
  },

  // --- 说错版本 (error) - 位置说错 ---
  {
    id: 'ray_err_pos_001',
    speaker: 'ray',
    text: '喂！第5行第4列……哦不对，是第3行第4列！我说顺嘴了！',
    type: 'error',
    tags: ['error_position', 'cute'],
    errorType: 'position',
    usage: { maxPerLevel: 2, cooldown: 120, priority: 2 },
  },
  {
    id: 'ray_err_pos_002',
    speaker: 'ray',
    text: '看那个……嗯……第几行来着？哦对！第7行！',
    type: 'error',
    tags: ['error_position', 'confused'],
    errorType: 'position',
    usage: { maxPerLevel: 2, cooldown: 120, priority: 1 },
  },

  // --- 说错版本 (error) - 数字说错 ---
  {
    id: 'ray_err_val_001',
    speaker: 'ray',
    text: '那个格填3……啊？不是3吗？……哦是5！你当我没说！',
    type: 'error',
    tags: ['error_value', 'cute'],
    errorType: 'value',
    usage: { maxPerLevel: 1, cooldown: 180, priority: 2 },
  },
  {
    id: 'ray_err_val_002',
    speaker: 'ray',
    text: '这一格填……嗯……好像是……算了你自己看！',
    type: 'error',
    tags: ['error_value', 'give_up'],
    errorType: 'random',
    usage: { maxPerLevel: 1, cooldown: 180, priority: 1 },
  },

  // ========================================================
  //  守笼人台词（keeper）- 儒雅/指引型
  // ========================================================

  // --- 方向性引导 (direction) ---
  {
    id: 'keeper_dir_001',
    speaker: 'keeper',
    text: '第3行第4列，尚有未察之数。',
    type: 'direction',
    tags: ['formal', 'point'],
    usage: { maxPerLevel: 3, cooldown: 45, priority: 2 },
  },
  {
    id: 'keeper_dir_002',
    speaker: 'keeper',
    text: '宫内的和已经明确，余数即答案。',
    type: 'direction',
    tags: ['formal', 'box'],
    usage: { maxPerLevel: 3, cooldown: 45, priority: 2 },
  },
  {
    id: 'keeper_dir_003',
    speaker: 'keeper',
    text: '笼子边缘的那一格，或许就是突破口。',
    type: 'direction',
    tags: ['formal', 'cage'],
    usage: { maxPerLevel: 3, cooldown: 45, priority: 2 },
  },
  {
    id: 'keeper_dir_004',
    speaker: 'keeper',
    text: '纵览全局，勿困于一隅。',
    type: 'direction',
    tags: ['formal', 'advice'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 1 },
  },

  // --- 策略性引导 (strategy) ---
  {
    id: 'keeper_strat_001',
    speaker: 'keeper',
    text: '以45为基，行和列和皆可推算。',
    type: 'strategy',
    tags: ['rule45', 'formal'],
    usage: { maxPerLevel: 2, cooldown: 90, priority: 2 },
  },
  {
    id: 'keeper_strat_002',
    speaker: 'keeper',
    text: '数对排除，可收奇效。',
    type: 'strategy',
    tags: ['pair', 'formal'],
    usage: { maxPerLevel: 2, cooldown: 90, priority: 2 },
  },

  // --- 笔记引导 (note_guide) ---
  {
    id: 'keeper_note_001',
    speaker: 'keeper',
    text: '候选数标记，乃推理之基。',
    type: 'note_guide',
    tags: ['formal', 'advice'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 2 },
  },
  {
    id: 'keeper_note_002',
    speaker: 'keeper',
    text: '心算易漏，笔耕不辍。',
    type: 'note_guide',
    tags: ['formal', 'advice'],
    usage: { maxPerLevel: 2, cooldown: 60, priority: 1 },
  },

  // --- Eureka赞美 (eureka) ---
  {
    id: 'keeper_eureka_001',
    speaker: 'keeper',
    text: '妙。此一子，盘活全局。',
    type: 'eureka',
    tags: ['praise', 'formal'],
    usage: { maxPerLevel: 99, cooldown: 15, priority: 3 },
  },
  {
    id: 'keeper_eureka_002',
    speaker: 'keeper',
    text: '你已接近正确。不妨再看一眼。',
    type: 'eureka',
    tags: ['encourage', 'formal'],
    usage: { maxPerLevel: 99, cooldown: 15, priority: 3 },
  },
  {
    id: 'keeper_eureka_003',
    speaker: 'keeper',
    text: '善。思路既通，势如破竹。',
    type: 'eureka',
    tags: ['praise', 'formal'],
    usage: { maxPerLevel: 99, cooldown: 15, priority: 3 },
  },

  // --- 答案 (answer) ---
  {
    id: 'keeper_answer_001',
    speaker: 'keeper',
    text: '第3行第4列，其数为5。',
    type: 'answer',
    tags: ['formal', 'direct'],
    usage: { maxPerLevel: 99, cooldown: 0, priority: 1 },
  },

  // ========================================================
  //  设局人台词（plotter）- 阴冷/嘲讽型
  // ========================================================

  // --- 嘲讽 (tease) ---
  {
    id: 'plotter_tease_001',
    speaker: 'plotter',
    text: '你还在看那片区域？我已经算完三遍了。',
    type: 'tease',
    tags: ['mock', 'cold'],
    usage: { maxPerLevel: 2, cooldown: 120, priority: 1 },
  },
  {
    id: 'plotter_tease_002',
    speaker: 'plotter',
    text: '连孤星都看不清？就是那一个格。',
    type: 'tease',
    tags: ['mock', 'cold'],
    usage: { maxPerLevel: 2, cooldown: 120, priority: 1 },
  },
  {
    id: 'plotter_tease_003',
    speaker: 'plotter',
    text: '等你找到答案，我已经布完下一局了。',
    type: 'tease',
    tags: ['mock', 'pressure'],
    usage: { maxPerLevel: 2, cooldown: 180, priority: 1 },
  },

  // --- 方向性引导 (direction) ---
  {
    id: 'plotter_dir_001',
    speaker: 'plotter',
    text: '你的目光，从未落在正确的地方。',
    type: 'direction',
    tags: ['mock', 'cold'],
    usage: { maxPerLevel: 2, cooldown: 120, priority: 2 },
  },

  // --- Eureka（很少赞美，更多是"有意思"） ---
  {
    id: 'plotter_eureka_001',
    speaker: 'plotter',
    text: '……有点意思。',
    type: 'eureka',
    tags: ['surprised', 'cold'],
    usage: { maxPerLevel: 99, cooldown: 30, priority: 3 },
  },
  {
    id: 'plotter_eureka_002',
    speaker: 'plotter',
    text: '呵。居然走对了。',
    type: 'eureka',
    tags: ['surprised', 'cold'],
    usage: { maxPerLevel: 99, cooldown: 30, priority: 3 },
  },

  // --- 答案 (answer) ---
  {
    id: 'plotter_answer_001',
    speaker: 'plotter',
    text: '5。别再让我等更久了。',
    type: 'answer',
    tags: ['cold', 'direct'],
    usage: { maxPerLevel: 99, cooldown: 0, priority: 1 },
  },
  {
    id: 'plotter_answer_002',
    speaker: 'plotter',
    text: '那格是5。现在可以继续了吗？',
    type: 'answer',
    tags: ['cold', 'impatient'],
    usage: { maxPerLevel: 99, cooldown: 0, priority: 1 },
  },

  // --- 故意说错 (error) ---
  {
    id: 'plotter_err_001',
    speaker: 'plotter',
    text: '那格填7……哦不，是5。我故意说错，看你会不会信。',
    type: 'error',
    tags: ['error_intentional', 'mock'],
    errorType: 'value',
    usage: { maxPerLevel: 1, cooldown: 300, priority: 2 },
  },
  {
    id: 'plotter_err_002',
    speaker: 'plotter',
    text: '我说是3你就填3？你的脑子呢？',
    type: 'error',
    tags: ['error_intentional', 'mock'],
    errorType: 'value',
    usage: { maxPerLevel: 1, cooldown: 300, priority: 2 },
  },
];

// ============================================================
//  DialogueRuntimeTracker - 运行时追踪器
// ============================================================

class DialogueRuntimeTracker {
  /** @type {Set<string>} 已使用的台词ID */
  static _usedLines = new Set();

  /** @type {Map<string, number>} 各台词使用次数 */
  static _lineCounts = new Map();

  /** @type {Map<string, number>} 各类型台词使用次数 */
  static _typeCounts = new Map();

  /** @type {Map<string, number>} 最后使用时间（用于冷却） */
  static _lastUsedTime = new Map();

  /** @type {number} 笔记引导台词使用次数【补丁5】 */
  static _noteGuideCount = 0;

  /** @type {boolean} 是否标记为反笔记用户【补丁5】 */
  static _isAntiNoteUser = false;

  /** @type {number} 最后一次笔记引导的时间 */
  static _lastNoteGuideTime = 0;

  // ========================================================
  //  关卡重置
  // ========================================================

  /**
   * 重置为新关卡状态
   */
  static resetForNewLevel() {
    this._usedLines.clear();
    this._lineCounts.clear();
    this._typeCounts.clear();
    this._lastUsedTime.clear();
    this._noteGuideCount = 0;
    this._isAntiNoteUser = false;
    this._lastNoteGuideTime = 0;
  }

  // ========================================================
  //  使用记录
  // ========================================================

  /**
   * 标记台词已使用
   * @param {DialogueLine} line - 台词对象
   */
  static markUsed(line) {
    if (!line || !line.id) return;

    const now = Date.now();

    this._usedLines.add(line.id);

    // 计数
    const count = this._lineCounts.get(line.id) || 0;
    this._lineCounts.set(line.id, count + 1);

    // 类型计数
    const typeCount = this._typeCounts.get(line.type) || 0;
    this._typeCounts.set(line.type, typeCount + 1);

    // 最后使用时间
    this._lastUsedTime.set(line.id, now);

    // 笔记引导计数【补丁5】
    if (line.type === 'note_guide') {
      this._noteGuideCount++;
      this._lastNoteGuideTime = now;
    }
  }

  // ========================================================
  //  查询方法
  // ========================================================

  /**
   * 台词是否已使用过
   * @param {string} lineId
   * @returns {boolean}
   */
  static isUsed(lineId) {
    return this._usedLines.has(lineId);
  }

  /**
   * 获取台词使用次数
   * @param {string} lineId
   * @returns {number}
   */
  static getCount(lineId) {
    return this._lineCounts.get(lineId) || 0;
  }

  /**
   * 获取某类型台词使用次数
   * @param {string} type
   * @returns {number}
   */
  static getTypeCount(type) {
    return this._typeCounts.get(type) || 0;
  }

  /**
   * 检查台词是否在冷却中
   * @param {DialogueLine} line
   * @returns {boolean}
   */
  static isInCooldown(line) {
    if (!line.usage || !line.usage.cooldown) return false;

    const lastUsed = this._lastUsedTime.get(line.id) || 0;
    const elapsed = (Date.now() - lastUsed) / 1000;

    return elapsed < line.usage.cooldown;
  }

  /**
   * 检查台词是否达到每关上限
   * @param {DialogueLine} line
   * @returns {boolean}
   */
  static isMaxedOut(line) {
    if (!line.usage || !line.usage.maxPerLevel) return false;

    const count = this.getCount(line.id);
    return count >= line.usage.maxPerLevel;
  }

  // ========================================================
  //  【补丁5】封口计数器
  // ========================================================

  /**
   * 获取笔记引导使用次数
   * @returns {number}
   */
  static getNoteGuideCount() {
    return this._noteGuideCount;
  }

  /**
   * 是否为反笔记用户
   * @returns {boolean}
   */
  static isAntiNoteUser() {
    return this._isAntiNoteUser;
  }

  /**
   * 标记为反笔记用户（封口）
   */
  static markAntiNote() {
    this._isAntiNoteUser = true;
  }

  /**
   * 检查是否应该封口笔记引导
   * 规则：引导笔记台词已触发2次，且180秒内无笔记操作
   * @param {number} lastNoteTime - 最后一次笔记操作时间（时间戳）
   * @returns {boolean}
   */
  static shouldSealNoteGuide(lastNoteTime) {
    if (this._isAntiNoteUser) return true;
    if (this._noteGuideCount < 2) return false;

    const elapsed = (Date.now() - lastNoteTime) / 1000;
    return elapsed > 180; // 180秒无笔记操作
  }
}

// ============================================================
//  DialogueDatabase - 台词数据库
// ============================================================

class DialogueDatabase {
  /** @type {DialogueLine[]} 台词库 */
  static _lines = [...BUILTIN_DIALOGUES];

  // ========================================================
  //  台词管理
  // ========================================================

  /**
   * 添加自定义台词
   * @param {DialogueLine[]} lines - 台词数组
   */
  static addLines(lines) {
    if (!Array.isArray(lines)) return;
    this._lines.push(...lines);
  }

  /**
   * 获取所有台词
   * @returns {DialogueLine[]}
   */
  static getAllLines() {
    return [...this._lines];
  }

  // ========================================================
  //  查询引擎
  // ========================================================

  /**
   * 查询台词
   * @param {Object} query - 查询条件
   * @param {DialogueType|DialogueType[]} [query.type] - 台词类型
   * @param {string|string[]} [query.speaker] - 说话角色
   * @param {string|string[]} [query.tags] - 标签（包含任一即可）
   * @param {string[]} [query.excludeTags] - 排除标签
   * @param {boolean} [query.excludeUsed=false] - 是否排除已使用
   * @param {number} [query.minPriority] - 最低优先级
   * @param {boolean} [query.respectCooldown=true] - 是否遵守冷却
   * @param {boolean} [query.respectMaxPerLevel=true] - 是否遵守每关上限
   * @returns {DialogueLine|null}
   */
  static findLine(query = {}) {
    let candidates = [...this._lines];

    // 按类型过滤
    if (query.type) {
      const types = Array.isArray(query.type) ? query.type : [query.type];
      candidates = candidates.filter(l => types.includes(l.type));
    }

    // 按角色过滤
    if (query.speaker) {
      const speakers = Array.isArray(query.speaker) ? query.speaker : [query.speaker];
      candidates = candidates.filter(l => speakers.includes(l.speaker));
    }

    // 按标签过滤（包含任一）
    if (query.tags) {
      const tags = Array.isArray(query.tags) ? query.tags : [query.tags];
      candidates = candidates.filter(l =>
        tags.some(t => l.tags && l.tags.includes(t))
      );
    }

    // 排除标签
    if (query.excludeTags) {
      candidates = candidates.filter(l =>
        !query.excludeTags.some(t => l.tags && l.tags.includes(t))
      );
    }

    // 排除已使用
    if (query.excludeUsed) {
      candidates = candidates.filter(l => !DialogueRuntimeTracker.isUsed(l.id));
    }

    // 最低优先级
    if (query.minPriority !== undefined) {
      candidates = candidates.filter(l =>
        l.usage && l.usage.priority >= query.minPriority
      );
    }

    // 遵守冷却
    if (query.respectCooldown !== false) {
      candidates = candidates.filter(l => !DialogueRuntimeTracker.isInCooldown(l));
    }

    // 遵守每关上限
    if (query.respectMaxPerLevel !== false) {
      candidates = candidates.filter(l => !DialogueRuntimeTracker.isMaxedOut(l));
    }

    if (candidates.length === 0) {
      return null;
    }

    // 按优先级排序，同优先级随机
    candidates.sort((a, b) => (b.usage?.priority || 1) - (a.usage?.priority || 1));
    const topPriority = candidates[0].usage?.priority || 1;
    const topCandidates = candidates.filter(l => (l.usage?.priority || 1) === topPriority);

    const selected = topCandidates[Math.floor(Math.random() * topCandidates.length)];

    return selected;
  }

  /**
   * 查询多条台词
   * @param {Object} query - 查询条件（同 findLine）
   * @param {number} [limit=5] - 返回数量上限
   * @returns {DialogueLine[]}
   */
  static findLines(query = {}, limit = 5) {
    let candidates = [...this._lines];

    if (query.type) {
      const types = Array.isArray(query.type) ? query.type : [query.type];
      candidates = candidates.filter(l => types.includes(l.type));
    }

    if (query.speaker) {
      const speakers = Array.isArray(query.speaker) ? query.speaker : [query.speaker];
      candidates = candidates.filter(l => speakers.includes(l.speaker));
    }

    if (query.tags) {
      const tags = Array.isArray(query.tags) ? query.tags : [query.tags];
      candidates = candidates.filter(l =>
        tags.some(t => l.tags && l.tags.includes(t))
      );
    }

    if (query.excludeUsed) {
      candidates = candidates.filter(l => !DialogueRuntimeTracker.isUsed(l.id));
    }

    if (query.respectCooldown !== false) {
      candidates = candidates.filter(l => !DialogueRuntimeTracker.isInCooldown(l));
    }

    if (query.respectMaxPerLevel !== false) {
      candidates = candidates.filter(l => !DialogueRuntimeTracker.isMaxedOut(l));
    }

    // 按优先级排序
    candidates.sort((a, b) => (b.usage?.priority || 1) - (a.usage?.priority || 1));

    return candidates.slice(0, limit);
  }

  /**
   * 根据ID获取台词
   * @param {string} id
   * @returns {DialogueLine|undefined}
   */
  static getLineById(id) {
    return this._lines.find(l => l.id === id);
  }

  // ========================================================
  //  统计
  // ========================================================

  /**
   * 获取台词总数
   * @returns {number}
   */
  static getTotalCount() {
    return this._lines.length;
  }

  /**
   * 按角色统计
   * @returns {Object}
   */
  static getStatsBySpeaker() {
    const stats = {};
    for (const line of this._lines) {
      if (!stats[line.speaker]) {
        stats[line.speaker] = { total: 0, byType: {} };
      }
      stats[line.speaker].total++;
      stats[line.speaker].byType[line.type] = (stats[line.speaker].byType[line.type] || 0) + 1;
    }
    return stats;
  }
}

// ============================================================
//  导出
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DialogueDatabase,
    DialogueRuntimeTracker,
    BUILTIN_DIALOGUES,
  };
}

if (typeof window !== 'undefined') {
  window.DialogueDatabase = DialogueDatabase;
  window.DialogueRuntimeTracker = DialogueRuntimeTracker;
}
