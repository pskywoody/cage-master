/**
 * ============================================================
 *  TeachingSystem - 教学系统（V4 ES Module版）
 * ============================================================
 *
 *  基于角色的教学和技巧百科系统。
 *  追踪玩家学习进度，触发首次遭遇对话，
 *  根据掌握度调整提示强度。
 *
 *  移植自 cagemaster3/expert/teaching-system.js
 *  转换：IIFE → ES Module
 *  localStorage 依赖改为可选的注入方式（options.storage）
 *  添加 try-catch 保护
 *
 * ============================================================
 */

// ========================================================
//  技巧元数据（与 TechRater 对齐，共 10 种技巧）
//  difficulty 与 TechRater 的 level 对齐
//  2026-08-13：新剧本角色——沈墨教基础/苏晚教45法则与数对/薇拉教组合与区块/伊藤教最高阶
// ========================================================
const TECHNIQUE_INFO = {
  nakedSingle: {
    name: '裸单法',
    category: 'basic',
    difficulty: 1,
    teacher: 'shenmo',
    description: '当一个格子只剩一个候选数时，那个数就是答案。',
  },
  cageUnique: {
    name: '笼子唯一组合',
    category: 'killer',
    difficulty: 2,
    teacher: 'shenmo',
    description: '通过笼子的和值与候选约束，确定某个数字只能放在某一格。',
  },
  hiddenSingle: {
    name: '隐单法',
    category: 'basic',
    difficulty: 3,
    teacher: 'shenmo',
    description: '在一行/列/宫中，某个数字只能放在一个格子里。',
  },
  rule45: {
    name: '45法则',
    category: 'killer',
    difficulty: 4,
    teacher: 'suwan',
    description: '每宫数字之和为45，利用跨宫笼子的内外差值推导数字。',
  },
  nakedPair: {
    name: '裸数对',
    category: 'intermediate',
    difficulty: 5,
    teacher: 'suwan',
    description: '同一行/列/宫中，两个格子都只有相同的两个候选数，则这两个数必在这两格，其他格可以排除。',
  },
  hiddenPair: {
    name: '隐数对',
    category: 'intermediate',
    difficulty: 6,
    teacher: 'suwan',
    description: '同一行/列/宫中，两个数字只出现在相同的两个格子里，则这两格只能是这两个数。',
  },
  pointingClaiming: {
    name: '区块排除',
    category: 'intermediate',
    difficulty: 7,
    teacher: 'vera',
    description: '某宫中某数字只出现在同一行/列，则该行/列其他宫的该数字可以排除。',
  },
  nakedTriplet: {
    name: '裸三数组',
    category: 'advanced',
    difficulty: 8,
    teacher: 'vera',
    description: '同一行/列/宫中，三个格子共享三个候选数，则这三个数必在这三格，其他格可以排除。',
  },
  xWing: {
    name: '二连纵横阵',
    category: 'advanced',
    difficulty: 9,
    teacher: 'vera',
    description: '某个数字在两行中只出现在相同的两列（或反之），构成X形，可以排除这两列其他行的该数字。',
  },
  swordfish: {
    name: '三才游鱼阵',
    category: 'advanced',
    difficulty: 10,
    teacher: 'ito',
    description: 'X-Wing的进阶版：某个数字在三行中只出现在相同的三列（或反之），可以排除更多候选。',
  },
};

// ========================================================
//  Character teaching dialogues
//  3 levels: first encounter, review, proficient
//  2026-08-13：新剧本角色——沈墨/苏晚/薇拉/伊藤
// ========================================================
const TEACHING_DIALOGUES = {
  // ---- 沈墨：沉稳内敛，老师口吻，教基础 ----
  shenmo: {
    nakedSingle: {
      first: [
        { speaker: '沈墨', text: '这是「裸单法」——当一个格子的候选数被排除到只剩一个时，那个数字就是答案。' },
        { speaker: '沈墨', text: '这是最基础也最可靠的技巧。把笔记做扎实，裸单自然会出现。' },
        { speaker: '沈墨', text: '记住：每行、每列、每宫的数字都不重复，所以排除法是一切的根基。' },
      ],
      review: [
        { speaker: '沈墨', text: '还记得裸单法吗？看看这一格的笔记。' },
        { speaker: '沈墨', text: '基础要打牢——试试用裸单法解这道题。' },
      ],
      proficient: [
        { speaker: '沈墨', text: '这里可以用裸单法。' },
      ],
    },
    hiddenSingle: {
      first: [
        { speaker: '沈墨', text: '这是「隐单法」——有时候一个格子看起来有很多候选，但换个角度看，某个数字别无去处。' },
        { speaker: '沈墨', text: '不要只盯着单个格子，要看数字在行、列、宫里的位置。' },
        { speaker: '沈墨', text: '如果一个数字在某一行只能放在一个格子里，那它就被「藏」在那里了。' },
      ],
      review: [
        { speaker: '沈墨', text: '还记得隐单法吗？换个角度看这一行。' },
        { speaker: '沈墨', text: '试试用隐单法——某个数字被锁定了位置。' },
      ],
      proficient: [
        { speaker: '沈墨', text: '这里可以用隐单法。' },
      ],
    },
    cageUnique: {
      first: [
        { speaker: '沈墨', text: '这是「笼子唯一组合」——杀手数独独有的基础技巧。' },
        { speaker: '沈墨', text: '每个笼子都有固定的和值，算算还缺多少，再看看有多少种数字组合能凑出这个和。' },
        { speaker: '沈墨', text: '当某个数字在所有可能的组合中都必须出现，而且只能放在一个格子里时，那个格子的答案就确定了。' },
        { speaker: '沈墨', text: '笼子是有生命的，它的和值在诉说——仔细听，你就能找到答案。' },
      ],
      review: [
        { speaker: '沈墨', text: '还记得笼子唯一组合吗？看看这个笼子还缺多少。' },
        { speaker: '沈墨', text: '用笼和反推组合，试试这个笼子。' },
      ],
      proficient: [
        { speaker: '沈墨', text: '这里可以用笼子唯一组合。' },
      ],
    },
    cageSumDeduction: {
      first: [
        { speaker: '沈墨', text: '这是「笼和推导」——笼子的和值会告诉你很多秘密。' },
        { speaker: '沈墨', text: '算算笼子里还缺多少，再看看哪些数字组合能凑出这个和，候选数就会大幅减少。' },
        { speaker: '沈墨', text: '和值是笼子的语言，听懂它，就能缩小范围。' },
      ],
      review: [
        { speaker: '沈墨', text: '还记得笼和推导吗？算一下这个笼子还缺多少。' },
        { speaker: '沈墨', text: '用笼和反推，候选数会少很多。' },
      ],
      proficient: [
        { speaker: '沈墨', text: '这里可以用笼和推导。' },
      ],
    },
    cageSumPair: {
      first: [
        { speaker: '沈墨', text: '这是「笼和数对」——两个格子的笼子，和值往往只有很少几种组合。' },
        { speaker: '沈墨', text: '比如和为17的两格笼，只能是8加9；和为3的，只能是1加2。' },
        { speaker: '沈墨', text: '小笼子的和值藏着大线索，学会用它，解题会快很多。' },
      ],
      review: [
        { speaker: '沈墨', text: '还记得笼和数对吗？看看这个两格笼。' },
        { speaker: '沈墨', text: '用和值反推组合，试试这个笼子。' },
      ],
      proficient: [
        { speaker: '沈墨', text: '这里可以用笼和数对。' },
      ],
    },
  },

  // ---- 苏晚：温柔知性，循循善诱，教45法则与数对 ----
  suwan: {
    rule45: {
      first: [
        { speaker: '苏晚', text: '这是「45法则」，也叫星衡法则。记住：每一宫的数字之和恒为45。' },
        { speaker: '苏晚', text: '当一个笼子跨出了宫，伸出宫的那格（外突）或留在宫里的那格（内突），都可以用45法则算出来。' },
        { speaker: '苏晚', text: '内突之数，笼和减45可得；外突之数，45减笼和即知。这是破解牢笼的第一把钥匙。' },
      ],
      review: [
        { speaker: '苏晚', text: '还记得45法则吗？看看这一宫的和。' },
        { speaker: '苏晚', text: '试试用星衡法则——这个笼子跨出了宫。' },
      ],
      proficient: [
        { speaker: '苏晚', text: '这里可以用45法则。' },
      ],
    },
    nakedPair: {
      first: [
        { speaker: '苏晚', text: '这是「裸数对」——同一行里有两个格子，它们的候选数一模一样，都是两个数字。' },
        { speaker: '苏晚', text: '这就意味着，这两个数字只能在这两格里，其他格子都可以排除它们。' },
        { speaker: '苏晚', text: '就像一对双胞胎，它们互相锁定了对方的命运。' },
      ],
      review: [
        { speaker: '苏晚', text: '还记得裸数对吗？找找看有没有两个候选数一样的格子。' },
        { speaker: '苏晚', text: '数对魔法——看看这一行有没有双子星。' },
      ],
      proficient: [
        { speaker: '苏晚', text: '这里有裸数对。' },
      ],
    },
    hiddenPair: {
      first: [
        { speaker: '苏晚', text: '这是「隐数对」——裸数对的双胞胎姐妹，只是藏得更深。' },
        { speaker: '苏晚', text: '同一行里，有两个数字只出现在相同的两个格子里。虽然这两个格子还有其他候选，但这两个数字只能放这儿。' },
        { speaker: '苏晚', text: '所以这两个格子的其他候选都可以排除啦，就像找到了隐藏的双子星。' },
      ],
      review: [
        { speaker: '苏晚', text: '还记得隐数对吗？找找看哪两个数字只出现在两格里。' },
        { speaker: '苏晚', text: '隐藏的数对魔法——倒过来看候选数。' },
      ],
      proficient: [
        { speaker: '苏晚', text: '这里有隐数对。' },
      ],
    },
  },

  // ---- 薇拉：白俄女子，直率明快，教组合与区块 ----
  vera: {
    pointingClaiming: {
      first: [
        { speaker: '薇拉', text: '接下来是「区块排除」，也叫指对数对！这个技巧超酷的。' },
        { speaker: '薇拉', text: '想象一下：在一个宫里，某个数字只能出现在同一行。那是不是意味着——那一行其他宫里的这个数字，就都可以排除了！' },
        { speaker: '薇拉', text: '就像箭一样指过去，从宫里看向行/列，答案就在排除之外。' },
      ],
      review: [
        { speaker: '薇拉', text: '还记得区块排除吗？看看这个宫里的数字。' },
        { speaker: '薇拉', text: '找找看哪个数字被关在一行里了。' },
      ],
      proficient: [
        { speaker: '薇拉', text: '这里可以用区块排除。' },
      ],
    },
    nakedTriplet: {
      first: [
        { speaker: '薇拉', text: '接下来是「裸三数组」，也叫三子法！数对的进阶版。' },
        { speaker: '薇拉', text: '裸数对是两格两数，那裸三数组就是三格三数！' },
        { speaker: '薇拉', text: '同一行里有三个格子，它们的候选数都来自相同的三个数字。这三个数字就被锁定在这三格里了！' },
        { speaker: '薇拉', text: '其他格子的这三个数字就都可以排除啦。三子成团，威力加倍！' },
      ],
      review: [
        { speaker: '薇拉', text: '还记得裸三数组吗？找找看三个候选数差不多的格子。' },
        { speaker: '薇拉', text: '三子法——看看这一行有没有三胞胎。' },
      ],
      proficient: [
        { speaker: '薇拉', text: '这里有裸三数组。' },
      ],
    },
    xWing: {
      first: [
        { speaker: '薇拉', text: '这是「二连纵横阵」，也叫X-Wing——高阶技巧的入门。' },
        { speaker: '薇拉', text: '想象一下：某个数字在两行中，恰好都只能出现在相同的两列。' },
        { speaker: '薇拉', text: '这四个格子构成一个矩形，像一对翅膀。这个数字要么在左上和右下，要么在右上和左下。' },
        { speaker: '薇拉', text: '无论哪种情况，这两列其他行的这个数字都可以排除。这就是二连纵横阵的奥义。' },
      ],
      review: [
        { speaker: '薇拉', text: '还记得二连纵横阵吗？找找看有没有X形的结构。' },
        { speaker: '薇拉', text: '试试X-Wing——两行两列的矩形结构。' },
      ],
      proficient: [
        { speaker: '薇拉', text: '这里可以用二连纵横阵。' },
      ],
    },
  },

  // ---- 伊藤：严肃冷静，精准简洁，教最高阶 ----
  ito: {
    swordfish: {
      first: [
        { speaker: '伊藤', text: '「三才游鱼阵」，Swordfish。高阶之巅。' },
        { speaker: '伊藤', text: '二连纵横阵是两条线，此技为三条线，游过三行三列。' },
        { speaker: '伊藤', text: '某数字在三行中，恰好都只能出现在相同的三列。三列如网，数字被困其中。' },
        { speaker: '伊藤', text: '锁定此阵，三列其他行的该数字皆可排除。能发现它，你的观察力已属上乘。' },
      ],
      review: [
        { speaker: '伊藤', text: '三才游鱼阵。找三行三列的结构。' },
        { speaker: '伊藤', text: 'Swordfish——三条线的轨迹。' },
      ],
      proficient: [
        { speaker: '伊藤', text: '此处可用三才游鱼阵。' },
      ],
    },
  },
};

// ========================================================
//  向后兼容：旧技巧ID → 新技巧ID映射
// ========================================================
const LEGACY_TECH_MAP = {
  pointingPair: 'pointingClaiming',
  cageSumDeduction: 'cageUnique',
  cageSumPair: 'cageUnique',
};

function normalizeTechId(tech) {
  return LEGACY_TECH_MAP[tech] || tech;
}

// ========================================================
//  Storage key
// ========================================================
const STORAGE_KEY = 'cagemaster3_teaching_progress';

// ========================================================
//  TeachingSystem class
// ========================================================
export class TeachingSystem {
  constructor(options = {}) {
    this.storageKey = options.storageKey || STORAGE_KEY;
    this.enablePersistence = options.enablePersistence !== false;

    // 可注入的 storage 对象（支持 localStorage 接口：getItem, setItem, removeItem）
    // 默认使用全局 localStorage（如果可用）
    this._storage = options.storage || null;

    // Technique encounter data
    // key: technique name, value: { encounterCount, masteryLevel, firstEncounteredAt, lastEncounteredAt }
    this._techniques = {};

    // Player level (affects starting hint intensity)
    this._playerLevel = 1;

    // Track if current encounter is the first one
    this._justFirstEncountered = new Set();

    // Teaching AI Phase 14.5-GateA：可选只读事件钩子（TeachingSystem 来源）。
    // 缺省 null → 不采集，零行为改变。由 RuntimeEventBridge 注入。
    this.eventHook = options.eventHook || null;

    // Load saved progress
    if (this.enablePersistence) {
      this.load();
    }
  }

  // ========================================================
  //  Public API
  // ========================================================

  /**
   * Record that the player encountered a technique.
   * @param {string} technique - technique identifier
   * @param {boolean} [usedCorrectly=false] - whether the player used it correctly
   */
  recordEncounter(technique, usedCorrectly = false) {
    try {
      technique = normalizeTechId(technique);
      if (!TECHNIQUE_INFO[technique]) return;

      // Phase 14.5-GateA：只读采集（teaching interaction：成功=solve，失败=fail，均带 technique）
      if (this.eventHook) {
        try {
          this.eventHook({
            source: 'TeachingSystem',
            technique,
            actionType: usedCorrectly ? 'solve' : 'fail',
            success: usedCorrectly ? true : false,
            mistakes: null,
            metadata: {},
          });
        } catch (e) { /* 只读采集，忽略异常 */ }
      }

      const now = Date.now();
      const isFirst = !this._techniques[technique];

      if (isFirst) {
        this._techniques[technique] = {
          encounterCount: 1,
          masteryLevel: 1,
          correctCount: usedCorrectly ? 1 : 0,
          firstEncounteredAt: now,
          lastEncounteredAt: now,
        };
        this._justFirstEncountered.add(technique);
      } else {
        const data = this._techniques[technique];
        data.encounterCount++;
        data.lastEncounteredAt = now;
        if (usedCorrectly) {
          data.correctCount++;
        }
        // Update mastery level based on usage
        this._updateMastery(technique);
      }

      // Update overall player level
      this._updatePlayerLevel();

      // Auto-save
      if (this.enablePersistence) {
        this.save();
      }
    } catch (e) {
      console.warn('TeachingSystem.recordEncounter 异常:', e);
    }
  }

  /**
   * Check if this is the first time the player encounters this technique.
   * @param {string} technique
   * @returns {boolean}
   */
  isFirstEncounter(technique) {
    try {
      technique = normalizeTechId(technique);
      return this._justFirstEncountered.has(technique);
    } catch (e) {
      return false;
    }
  }

  /**
   * Acknowledge the first encounter (clear the "just encountered" flag).
   * @param {string} technique
   */
  acknowledgeFirstEncounter(technique) {
    try {
      technique = normalizeTechId(technique);
      this._justFirstEncountered.delete(technique);
    } catch (e) {
      console.warn('TeachingSystem.acknowledgeFirstEncounter 异常:', e);
    }
  }

  /**
   * Get teaching dialogue for a technique.
   * Returns an array of dialogue lines based on mastery level.
   * @param {string} technique
   * @returns {Array<{speaker: string, text: string}>}
   */
  getTeachingDialog(technique) {
    try {
      technique = normalizeTechId(technique);
      const info = TECHNIQUE_INFO[technique];
      if (!info) return [];

      const teacher = info.teacher;
      const dialogues = TEACHING_DIALOGUES[teacher] && TEACHING_DIALOGUES[teacher][technique];
      if (!dialogues) return [];

      const data = this._techniques[technique];
      if (!data) return dialogues.first || [];

      // Select dialogue based on mastery level
      if (data.masteryLevel <= 1) {
        return dialogues.first || [];
      } else if (data.masteryLevel <= 3) {
        return dialogues.review || dialogues.first || [];
      } else {
        return dialogues.proficient || dialogues.review || dialogues.first || [];
      }
    } catch (e) {
      console.warn('TeachingSystem.getTeachingDialog 异常:', e);
      return [];
    }
  }

  /**
   * Get the starting hint level for a technique (1-3).
   * Beginners get more detailed hints (start at level 2-3).
   * Masters get more subtle hints (start at level 1).
   * @param {string} technique
   * @returns {number} hint level (1-3)
   */
  getHintLevel(technique) {
    try {
      technique = normalizeTechId(technique);
      const data = this._techniques[technique];

      // 从未见过：从 Level 1 开始（三步式渐进）
      if (!data) {
        return 1;
      }

      // Mastery-based progression
      const mastery = data.masteryLevel;
      if (mastery <= 2) {
        // 初学者：从 Level 1 开始，三步渐进式引导
        return 1;
      } else if (mastery <= 4) {
        // 进阶者：从 Level 2 开始，直接给排除级提示
        return 2;
      } else {
        // 熟练者：从 Level 1 开始，相信玩家自己推导
        return 1;
      }
    } catch (e) {
      return 1;
    }
  }

  /**
   * Get list of all learned techniques.
   * @returns {Array<{technique: string, name: string, masteryLevel: number, encounterCount: number}>}
   */
  getLearnedTechniques() {
    try {
      const result = [];
      for (const [tech, data] of Object.entries(this._techniques)) {
        const info = TECHNIQUE_INFO[tech];
        if (info) {
          result.push({
            technique: tech,
            name: info.name,
            category: info.category,
            difficulty: info.difficulty,
            teacher: info.teacher,
            masteryLevel: data.masteryLevel,
            encounterCount: data.encounterCount,
            correctCount: data.correctCount,
            description: info.description,
          });
        }
      }
      // Sort by difficulty
      result.sort((a, b) => a.difficulty - b.difficulty);
      return result;
    } catch (e) {
      console.warn('TeachingSystem.getLearnedTechniques 异常:', e);
      return [];
    }
  }

  /**
   * Get technique encyclopedia entry.
   * @param {string} technique
   * @returns {Object|null}
   */
  getTechniqueInfo(technique) {
    try {
      const info = TECHNIQUE_INFO[technique];
      if (!info) return null;

      const data = this._techniques[technique];
      return {
        ...info,
        masteryLevel: data ? data.masteryLevel : 0,
        encounterCount: data ? data.encounterCount : 0,
        correctCount: data ? data.correctCount : 0,
        learned: !!data,
      };
    } catch (e) {
      console.warn('TeachingSystem.getTechniqueInfo 异常:', e);
      return null;
    }
  }

  /**
   * Get all available technique IDs.
   * @returns {string[]}
   */
  getAllTechniques() {
    try {
      return Object.keys(TECHNIQUE_INFO);
    } catch (e) {
      return [];
    }
  }

  /**
   * Get player level (1-5) based on overall progress.
   * @returns {number}
   */
  getPlayerLevel() {
    try {
      return this._playerLevel;
    } catch (e) {
      return 1;
    }
  }

  // ========================================================
  //  Persistence
  // ========================================================

  /**
   * Save progress to localStorage.
   * @returns {boolean} success
   */
  save() {
    try {
      const data = {
        version: 1,
        techniques: this._techniques,
        playerLevel: this._playerLevel,
      };
      const json = JSON.stringify(data);

      const storage = this._getStorage();
      if (storage) {
        storage.setItem(this.storageKey, json);
      }
      return true;
    } catch (e) {
      console.warn('TeachingSystem save failed:', e);
      return false;
    }
  }

  /**
   * Load progress from localStorage.
   * @returns {boolean} success
   */
  load() {
    try {
      let json = null;
      const storage = this._getStorage();
      if (storage) {
        json = storage.getItem(this.storageKey);
      }
      if (!json) return false;

      const data = JSON.parse(json);
      if (data.techniques) {
        // 向后兼容：将旧技巧ID转换为新ID
        const normalized = {};
        for (const [tech, techData] of Object.entries(data.techniques)) {
          const normalizedId = normalizeTechId(tech);
          if (TECHNIQUE_INFO[normalizedId]) {
            normalized[normalizedId] = techData;
          }
        }
        this._techniques = normalized;
      }
      if (data.playerLevel) {
        this._playerLevel = data.playerLevel;
      }
      return true;
    } catch (e) {
      console.warn('TeachingSystem load failed:', e);
      return false;
    }
  }

  /**
   * Reset all progress.
   */
  reset() {
    this._techniques = {};
    this._playerLevel = 1;
    this._justFirstEncountered.clear();
    if (this.enablePersistence) {
      try {
        const storage = this._getStorage();
        if (storage) {
          storage.removeItem(this.storageKey);
        }
      } catch (e) {}
    }
  }

  /**
   * 获取可用的 storage 对象。
   * 优先级：注入的 options.storage > 全局 localStorage
   * @returns {Object|null}
   */
  _getStorage() {
    if (this._storage) {
      return this._storage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
    return null;
  }

  // ========================================================
  //  Internal methods
  // ========================================================

  /**
   * Update mastery level for a technique based on usage statistics.
   * Mastery levels 1-5:
   *   1 - 初次见面 (first encounter)
   *   2 - 略有印象 (2-4 encounters)
   *   3 - 基本掌握 (5-9 encounters, >50% correct)
   *   4 - 熟练运用 (10+ encounters, >60% correct)
   *   5 - 融会贯通 (20+ encounters, >70% correct)
   */
  _updateMastery(technique) {
    const data = this._techniques[technique];
    if (!data) return;

    const count = data.encounterCount;
    const correctRate = count > 0 ? data.correctCount / count : 0;

    let level = 1;
    if (count >= 20 && correctRate >= 0.7) {
      level = 5;
    } else if (count >= 10 && correctRate >= 0.6) {
      level = 4;
    } else if (count >= 5 && correctRate >= 0.5) {
      level = 3;
    } else if (count >= 2) {
      level = 2;
    }

    data.masteryLevel = level;
  }

  /**
   * Update overall player level based on number of mastered techniques.
   */
  _updatePlayerLevel() {
    const learned = Object.keys(this._techniques).length;
    const mastered = Object.values(this._techniques).filter(
      t => t.masteryLevel >= 3
    ).length;

    if (mastered >= 5) {
      this._playerLevel = 5;
    } else if (mastered >= 3) {
      this._playerLevel = 4;
    } else if (learned >= 4) {
      this._playerLevel = 3;
    } else if (learned >= 2) {
      this._playerLevel = 2;
    } else {
      this._playerLevel = 1;
    }
  }
}