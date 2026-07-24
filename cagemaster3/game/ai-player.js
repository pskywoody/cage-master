/**
 * ============================================================
 *  AIPlayer - 基于TechRater的推理型对战AI
 * ============================================================
 *
 *  设计原则：
 *    - AI不是从答案里挑格子，而是用TechRater真的在"推理"
 *    - AI有认知局限：技巧上限、发现概率、选择偏好
 *    - AI有性格：冒失型、稳健型、包围型
 *    - 所有"失误"都是合理的（没看出来/想错了），不是故意放水
 *
 *  公共API:
 *    - new AIPlayer(board, personality)  创建AI玩家
 *    - aiPlayer.think()                  思考下一步，返回 {row, col, num, technique, thinkTime} 或 null
 *    - aiPlayer.execute(step)            执行一步（更新AI的棋盘状态）
 *    - aiPlayer.syncFromBoard(board)     从主棋盘同步状态（玩家填数后）
 *    - aiPlayer.getInfluence(r, c)       计算单格影响力
 *
 * ============================================================
 */

(function(global) {

  'use strict';

  // ========================================================
  //  三种性格预设
  // ========================================================

  const PERSONALITIES = {
    // 冒失型：阿妍 - 观局者，拦截欲望低
    reckless: {
      name: 'reckless',
      displayName: '冒失型',
      // 技巧上限：只会基础到中级技巧
      maxTechLevel: 5,
      // 发现概率：越难的技巧越容易"没看出来"
      discoveryRate: {
        1: 1.0,    // 孤星：100%看到
        2: 0.95,   // 唯一组合：95%
        3: 0.85,   // 隐曜：85%
        4: 0.7,    // 星衡法则：70%
        5: 0.5,    // 并蒂锁：50%
      },
      // 选择策略：认知惯性评分（人类风格决策）
      selectionStrategy: 'humanLike',
      // 基础失误率（填错的概率，虽然不显示数字但占着格子）
      baseErrorRate: 0.12,
      // 拦截欲望：低 - 阿妍喜欢自己解题不抢
      interceptProbability: 0.25,
      // 速度曲线：不稳定，时快时慢
      speedCurve: 'erratic',
      // 速度倍率（相对于标准时间）
      speedMultiplier: { min: 0.6, max: 1.5 },
      // 基础思考时间（毫秒），按技巧等级递增
      // 注意：这是"原始"时间，会再乘以速度倍率和棋盘大小修正
      baseThinkTime: {
        1: 80,
        2: 140,
        3: 220,
        4: 360,
        5: 520,
      },
    },

    // 稳健型：守笼人 - 稳健者，中等拦截欲望
    steady: {
      name: 'steady',
      displayName: '稳健型',
      maxTechLevel: 10,
      discoveryRate: {
        1: 1.0,
        2: 1.0,
        3: 1.0,
        4: 0.98,
        5: 0.95,
        6: 0.9,
        7: 0.85,
        8: 0.8,
        9: 0.7,
        10: 0.6,
      },
      // 选择策略：认知惯性评分（人类风格决策）
      selectionStrategy: 'humanLike',
      baseErrorRate: 0.02,
      // 拦截欲望：中 - 守笼人稳中带攻
      interceptProbability: 0.4,
      speedCurve: 'steady',
      speedMultiplier: { min: 0.8, max: 1.2 },
      baseThinkTime: {
        1: 60,
        2: 110,
        3: 180,
        4: 280,
        5: 400,
        6: 560,
        7: 720,
        8: 920,
        9: 1200,
        10: 1500,
      },
    },

    // 包围型：设局人
    surround: {
      name: 'surround',
      displayName: '包围型',
      maxTechLevel: 8,
      discoveryRate: {
        1: 1.0,
        2: 0.98,
        3: 0.95,
        4: 0.9,
        5: 0.85,
        6: 0.8,
        7: 0.75,
        8: 0.7,
      },
      // 选择策略：认知惯性评分（人类风格决策）
      selectionStrategy: 'humanLike',
      baseErrorRate: 0.06,
      // 拦截欲望：高 - 设局人爱读心抢格子
      interceptProbability: 0.65,
      speedCurve: 'accelerating',
      speedMultiplier: { min: 0.6, max: 1.4 },
      baseThinkTime: {
        1: 70,
        2: 130,
        3: 210,
        4: 320,
        5: 460,
        6: 640,
        7: 840,
        8: 1080,
      },
    },
  };

  // ========================================================
  //  技巧等级映射（技巧ID → 等级数字）
  // ========================================================

  const TECH_LEVEL_MAP = {
    nakedSingle: 1,
    cageUnique: 2,
    hiddenSingle: 3,
    rule45: 4,
    nakedPair: 5,
    hiddenPair: 6,
    pointingClaiming: 7,
    nakedTriplet: 8,
    xWing: 9,
    swordfish: 10,
  };

  // ========================================================
  //  AIPlayer 类
  // ========================================================

  class AIPlayer {

    /**
     * @param {Board} board  棋盘引用
     * @param {string|object} personality  性格ID或自定义性格配置
     */
    constructor(board, personality = 'steady') {
      this._board = board;
      this._size = board.size;

      // 解析性格配置
      if (typeof personality === 'string') {
        this._personality = PERSONALITIES[personality] || PERSONALITIES.steady;
      } else {
        // 合并自定义配置到默认
        this._personality = Object.assign({}, PERSONALITIES.steady, personality);
      }

      // AI自己的TechRater实例（独立推理）
      this._rater = null;

      // AI的移动计数（用于速度曲线计算）
      this._moveCount = 0;

      // 上一步思考的结果（用于调试和日志）
      this._lastStep = null;

      // 热力图适配器（三色系统联动）
      this._heatmapAdapter = null;

      // 三色加权开关（默认启用）
      this._colorWeightEnabled = true;

      // 初始化
      this._initRater();
    }

    // ======================================================
    //  初始化
    // ======================================================

    _initRater() {
      if (typeof TechRater === 'undefined' || !TechRater.fromBoard) {
        console.error('[AIPlayer] TechRater not found!');
        return;
      }
      this._rater = TechRater.fromBoard(this._board);
    }

    // ======================================================
    //  公共API
    // ======================================================

    /**
     * 思考下一步（只思考，不执行）
     * @returns {Object|null} { row, col, num, technique, techniqueName, thinkTime, isMistake } 或 null（没找到可填的）
     */
    think() {
      if (!this._rater) {
        console.warn('[AIPlayer] TechRater not initialized');
        return null;
      }

      // 获取所有可用的结果（按技巧级别分组）
      const allResultsByLevel = this._findAllVisibleResults();

      if (allResultsByLevel.length === 0) {
        // 没有找到可填的（可能题目太难，或者已经填完了）
        console.warn('[AIPlayer] No moves found - AI is stuck!');
        return null;
      }

      // 从最低级别的技巧中选（人类总是先找简单的）
      const lowestLevel = allResultsByLevel[0].level;
      const lowestResults = allResultsByLevel.filter(r => r.level === lowestLevel);

      // 根据性格选择具体填哪个
      const chosen = this._selectStep(lowestResults);

      // 获取选中格的三色分类
      const chosenCategory = this._getCellCategory(chosen.row, chosen.col);

      // 计算思考时间（三色适配：gate 格思考时间 × 1.5）
      let thinkTime = this._calcThinkTime(lowestLevel);
      if (chosenCategory) {
        thinkTime *= this._getColorThinkTimeWeight(chosenCategory);
      }

      // 判断是否"失误"（三色适配：gate 格失误率降低 50%）
      let errorRate = this._personality.baseErrorRate;
      if (chosenCategory) {
        errorRate *= this._getColorErrorWeight(chosenCategory);
      }
      const isMistake = Math.random() < errorRate;

      const result = {
        row: chosen.row,
        col: chosen.col,
        num: chosen.num,
        technique: chosen.technique,
        techniqueName: chosen.techniqueName,
        techLevel: lowestLevel,
        thinkTime: thinkTime,
        isMistake: isMistake,
      };

      // 与三色系统联动：携带该格的分类信息
      if (chosenCategory) {
        result.category = chosenCategory;
      }

      this._lastStep = result;

      if (window.DEBUG_AI) {
        console.log(`[AI思考] 填(${result.row},${result.col})=${result.num} 技巧:${result.techniqueName}(Lv.${result.techLevel}) 思考:${Math.round(result.thinkTime)}ms 失误:${result.isMistake}`);
      }

      return result;
    }

    /**
     * 执行一步（更新AI自己的推理状态）
     * @param {Object} step think()返回的结果
     */
    execute(step) {
      if (!step || !this._rater) return;

      const { row, col, num, isMistake } = step;

      if (isMistake) {
        // 失误：填了一个错误的数字（但AI自己不知道，还以为是对的）
        // 在AI的rater中填入错误数字，会导致后续推理出错
        // 注意：这里只影响AI自己的推理，不影响真实棋盘
        if (this._rater._fillCell) {
          this._rater._fillCell(row, col, num);
        }
      } else {
        // 正常填数
        if (this._rater._fillCell) {
          this._rater._fillCell(row, col, num);
        }
      }

      this._moveCount++;
    }

    /**
     * 尝试对玩家凝视的格子进行拦截
     * 检查该格是否在AI的可推理列表中，若是则按拦截概率抢占
     * 三色适配：gate 格拦截概率 ×2 失误率 ×0.5 思考时间 ×1.5；simple 格拦截概率 ×0.5
     * @param {number} row - 玩家凝视的行
     * @param {number} col - 玩家凝视的列
     * @returns {Object|null} 拦截成功返回step，否则返回null
     */
    tryIntercept(row, col) {
      if (!this._rater) return null;

      // 获取目标格的三色分类
      const targetCategory = this._getCellCategory(row, col);

      // 1. 概率判定：根据性格的拦截欲望 × 三色拦截权重
      let interceptProb = this._personality.interceptProbability ?? 0.3;
      if (targetCategory) {
        interceptProb *= this._getColorInterceptWeight(targetCategory);
      }
      // 拦截概率上限 0.95（避免100%必拦）
      interceptProb = Math.min(interceptProb, 0.95);

      if (Math.random() > interceptProb) {
        return null;
      }

      // 2. 验证该格是否可被AI推理出来（防假拦截）
      const allResults = this._findAllVisibleResults();
      const target = allResults.find(r => r.row === row && r.col === col);

      if (!target) {
        return null;
      }

      // 3. ⚠️ 同频判定（核心新增）
      // 高难度格：AI 也需要"思考时间"，拦截概率大幅降低
      const techLevel = target.level || 1;
      const personalityName = this._personality.name;

      // 包围型对高难度格的容忍度更高（Lv.4以下都能快速反应）
      // 其他性格只有 Lv.3 以下才能快速反应
      const levelTolerance = personalityName === 'surround' ? 4 : 3;

      if (techLevel > levelTolerance) {
        // 高难度格：AI 也需要"反应时间"，只有 20% 概率能拦截
        if (Math.random() > 0.2) {
          return null; // AI 没反应过来，拦截失败
        }
      }

      // 4. 拦截成功，返回快速思考的结果（拦截前摇更短）
      // 三色适配：gate 格失误率再降低 50%
      let errorRate = this._personality.baseErrorRate * 0.5; // 拦截时失误率减半
      if (targetCategory) {
        errorRate *= this._getColorErrorWeight(targetCategory);
      }
      const isMistake = Math.random() < errorRate;

      // 三色适配：gate 格思考时间 × 1.5（更认真）
      let thinkTime = Math.max(120, this._calcThinkTime(target.level) * 0.4); // 拦截更快
      if (targetCategory) {
        thinkTime *= this._getColorThinkTimeWeight(targetCategory);
      }

      const step = {
        row: target.row,
        col: target.col,
        num: target.num,
        technique: target.technique,
        techniqueName: target.techniqueName,
        techLevel: target.level,
        thinkTime: thinkTime,
        isMistake: isMistake,
        isIntercept: true,
      };

      // 携带分类信息
      if (targetCategory) {
        step.category = targetCategory;
      }

      return step;
    }

    // ======================================================
    //  必杀技系统
    // ======================================================

    /**
     * 阿妍必杀技：「观局」
     * 找出全盘所有唯一可填格（裸单+隐曜），只返回不填数
     * @returns {Array<Object>} 可填格列表 [{row, col, num, techniqueName}]
     */
    useGuanJu() {
      if (!this._rater) return [];
      const targets = [];

      // 找 nakedSingle (Lv.1) 和 hiddenSingle (Lv.3)
      const naked = this._rater._findAllByTechnique('nakedSingle') || [];
      const hidden = this._rater._findAllByTechnique('hiddenSingle') || [];

      [...naked, ...hidden].forEach(item => {
        targets.push({
          row: item.row,
          col: item.col,
          num: item.num,
          techniqueName: TechRater.getTechniqueName(item.technique || 'nakedSingle'),
        });
      });

      return targets;
    }

    /**
     * 守笼人必杀技：「定式」
     * 直接推导出指定格子的正确答案并填入（稳准狠）
     * @param {number} r - 目标行
     * @param {number} c - 目标列
     * @returns {Object|null} 填数结果
     */
    useDingShi(r, c) {
      if (!this._rater) return null;

      // 尝试用所有技巧推导这个格子
      const techIds = this._getTechPriority();
      for (const techId of techIds) {
        const level = TECH_LEVEL_MAP[techId];
        if (level > this._personality.maxTechLevel) continue;

        const allResults = this._rater._findAllByTechnique(techId);
        if (allResults && allResults.length > 0) {
          const target = allResults.find(x => x.row === r && x.col === c);
          if (target) {
            const step = {
              row: r,
              col: c,
              num: target.num,
              technique: 'dingShi',
              techniqueName: '守笼人·定式',
              techLevel: level,
              thinkTime: 0,
              isMistake: false,
              isSkill: true,
            };
            this.execute(step);
            return step;
          }
        }
      }

      // 如果推不出来，返回null
      return null;
    }

    /**
     * 设局人必杀技：「圈套」
     * 从边缘向中心瞬间抢占多个幽灵格，制造包围圈
     * @param {number} count - 抢占数量，默认3
     * @returns {Array<Object>} 抢占的格子列表
     */
    useQuanTao(count = 3) {
      if (!this._rater) return [];

      const allResults = this._findAllVisibleResults();
      if (allResults.length === 0) return [];

      // 按离中心距离从远到近排序（边缘优先）
      const center = (this._size - 1) / 2;
      const sorted = [...allResults].sort((a, b) => {
        const distA = Math.abs(a.row - center) + Math.abs(a.col - center);
        const distB = Math.abs(b.row - center) + Math.abs(b.col - center);
        return distB - distA;
      });

      const trappedSteps = sorted.slice(0, Math.min(count, sorted.length)).map(item => {
        const step = {
          row: item.row,
          col: item.col,
          num: item.num,
          technique: 'quanTao',
          techniqueName: '设局人·圈套',
          techLevel: item.level,
          thinkTime: 0,
          isMistake: Math.random() < this._personality.baseErrorRate * 0.3,
          isSkill: true,
        };
        this.execute(step);
        return step;
      });

      return trappedSteps;
    }

    /**
     * 从主棋盘同步状态（玩家填数后，AI需要"看到"玩家填的数字）
     * v2.0 优化：增量同步，只填充玩家新填的格子，不全量重建TechRater
     * @param {Board} board
     */
    syncFromBoard(board) {
      this._board = board;

      // 首次同步：必须全量初始化
      if (!this._rater) {
        this._initRater();
        return;
      }

      // 增量同步：遍历棋盘，把AI rater中没有的、但主棋盘已填的格子补上
      // 这样AI就能"看到"玩家新填的数字，而不需要重建整个rater
      if (!this._rater._fillCell) {
        // 没有增量填充方法，只能全量重建（fallback）
        this._initRater();
        return;
      }

      const size = board.size;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const boardCell = board.cells[r][c];
          const num = boardCell.fixedNum || boardCell.userNum;
          if (num > 0) {
            // 检查AI的rater中这格是否已填
            const raterValue = this._rater.grid[r][c];
            if (raterValue === 0 || raterValue !== num) {
              this._rater._fillCell(r, c, num);
            }
          }
        }
      }
    }

    /**
     * 计算单格的影响力（用于拦截判断等）
     */
    getInfluence(r, c) {
      if (!this._rater || !this._rater._calcInfluence) return 0;
      return this._rater._calcInfluence(r, c);
    }

    /**
     * 获取当前性格配置
     */
    getPersonality() {
      return this._personality;
    }

    /**
     * 设置三色热力图适配器（用于三色系统联动）
     * 适配器需要提供 getCellCategory(r, c) 方法，或包含 heatmap.gridMeta[r][c].category
     * @param {Object} adapter - 热力图适配器实例
     */
    setHeatmapAdapter(adapter) {
      this._heatmapAdapter = adapter;
    }

    /**
     * 启用/禁用三色加权功能
     * 禁用后 AI 选格和拦截都不会受格子颜色（gate/core/simple）影响
     * @param {boolean} enabled - 是否启用
     */
    setColorWeightEnabled(enabled) {
      this._colorWeightEnabled = !!enabled;
    }

    /**
     * 获取已走步数
     */
    getMoveCount() {
      return this._moveCount;
    }

    // ======================================================
    //  内部方法：寻找所有"AI能看到"的结果
    // ======================================================

    _findAllVisibleResults() {
      const results = [];

      // 遍历所有技巧，按级别从低到高
      const techIds = this._getTechPriority();

      for (const techId of techIds) {
        const level = TECH_LEVEL_MAP[techId];
        if (level > this._personality.maxTechLevel) continue;

        // 发现概率检测
        const discoveryRate = this._personality.discoveryRate[level] ?? 1.0;
        if (Math.random() > discoveryRate) {
          // AI没看出来这个技巧，跳过
          continue;
        }

        const allResults = this._rater._findAllByTechnique(techId);
        if (allResults && allResults.length > 0) {
          for (const r of allResults) {
            results.push({
              row: r.row,
              col: r.col,
              num: r.num,
              technique: techId,
              techniqueName: TechRater.getTechniqueName(techId),
              level: level,
              evidence: r.evidence || null,
            });
          }
          // 找到了最低级别的可用技巧，不再往上找
          // （人类总是先用最简单的方法）
          break;
        }
      }

      return results;
    }

    /**
     * 获取可用的技巧优先级列表
     */
    _getTechPriority() {
      if (this._size === 4) {
        return ['nakedSingle', 'hiddenSingle', 'nakedPair'];
      } else if (this._size === 6) {
        return ['nakedSingle', 'cageUnique', 'hiddenSingle', 'rule45', 'nakedPair', 'hiddenPair', 'pointingClaiming', 'nakedTriplet'];
      } else {
        return ['nakedSingle', 'cageUnique', 'hiddenSingle', 'rule45', 'nakedPair', 'hiddenPair', 'pointingClaiming', 'nakedTriplet', 'xWing', 'swordfish'];
      }
    }

    // ======================================================
    //  内部方法：选择策略
    // ======================================================

    _selectStep(candidates) {
      if (candidates.length === 0) return null;
      if (candidates.length === 1) return candidates[0];

      const strategy = this._personality.selectionStrategy;

      switch (strategy) {
        case 'random':
          return this._selectRandom(candidates);
        case 'influence':
          return this._selectByInfluence(candidates);
        case 'perimeter':
          return this._selectByPerimeter(candidates);
        case 'humanLike':
          return this._selectByHumanLikeScore(candidates);
        default:
          return candidates[0];
      }
    }

    _selectRandom(candidates) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    _selectByInfluence(candidates) {
      let best = candidates[0];
      let bestScore = this._rater._calcInfluence(best.row, best.col);

      for (let i = 1; i < candidates.length; i++) {
        const score = this._rater._calcInfluence(candidates[i].row, candidates[i].col);
        // 加入一点随机性，避免AI每局完全一样
        const jitter = (Math.random() - 0.5) * 0.1;
        if (score + jitter > bestScore) {
          bestScore = score;
          best = candidates[i];
        }
      }

      return best;
    }

    _selectByPerimeter(candidates) {
      const center = (this._size - 1) / 2;

      let best = candidates[0];
      let bestDist = this._manhattanDist(best.row, best.col, center, center);

      for (let i = 1; i < candidates.length; i++) {
        const dist = this._manhattanDist(candidates[i].row, candidates[i].col, center, center);
        // 距离中心越远优先级越高
        const jitter = (Math.random() - 0.5) * 0.5;
        if (dist + jitter > bestDist) {
          bestDist = dist;
          best = candidates[i];
        }
      }

      return best;
    }

    _manhattanDist(r1, c1, r2, c2) {
      return Math.abs(r1 - r2) + Math.abs(c1 - c2);
    }

    // ======================================================
    //  三色系统辅助方法
    // ======================================================

    /**
     * 获取格子的三色分类
     * @param {number} r - 行
     * @param {number} c - 列
     * @returns {string|null} 'gate' | 'core' | 'simple' 或 null
     */
    _getCellCategory(r, c) {
      if (!this._heatmapAdapter) return null;

      // 优先使用 getCellCategory 方法
      if (typeof this._heatmapAdapter.getCellCategory === 'function') {
        const cat = this._heatmapAdapter.getCellCategory(r, c);
        if (cat && cat.category) return cat.category;
      }

      // 备选：直接访问 gridMeta
      if (this._heatmapAdapter.heatmap &&
          this._heatmapAdapter.heatmap.gridMeta &&
          this._heatmapAdapter.heatmap.gridMeta[r] &&
          this._heatmapAdapter.heatmap.gridMeta[r][c]) {
        return this._heatmapAdapter.heatmap.gridMeta[r][c].category || null;
      }

      return null;
    }

    /**
     * 获取三色选格权重（用于 _selectStep 评分加权）
     * 🔴 gate: 2.0, 🟡 core: 1.5, 🟢 simple: 1.0
     * @param {string|null} category
     * @returns {number}
     */
    _getColorSelectWeight(category) {
      if (!this._colorWeightEnabled || !category) return 1.0;

      switch (category) {
        case 'gate':   return 2.0;
        case 'core':   return 1.5;
        case 'simple': return 1.0;
        default:       return 1.0;
      }
    }

    /**
     * 获取三色拦截权重（用于 tryIntercept 概率调整）
     * 🔴 gate: 2.0, 🟡 core: 1.0, 🟢 simple: 0.5
     * @param {string|null} category
     * @returns {number}
     */
    _getColorInterceptWeight(category) {
      if (!this._colorWeightEnabled || !category) return 1.0;

      switch (category) {
        case 'gate':   return 2.0;
        case 'core':   return 1.0;
        case 'simple': return 0.5;
        default:       return 1.0;
      }
    }

    /**
     * 获取三色失误率权重
     * 🔴 gate: 0.5（降低50%）, 其他: 1.0
     * @param {string|null} category
     * @returns {number}
     */
    _getColorErrorWeight(category) {
      if (!this._colorWeightEnabled || !category) return 1.0;

      switch (category) {
        case 'gate': return 0.5;
        default:     return 1.0;
      }
    }

    /**
     * 获取三色思考时间权重
     * 🔴 gate: 1.5（更认真）, 其他: 1.0
     * @param {string|null} category
     * @returns {number}
     */
    _getColorThinkTimeWeight(category) {
      if (!this._colorWeightEnabled || !category) return 1.0;

      switch (category) {
        case 'gate': return 1.5;
        default:     return 1.0;
      }
    }

    // ======================================================
    //  认知惯性评分（人类风格决策）
    // ======================================================

    /**
     * 基于认知惯性评分选择下一步
     * 核心公式：influence * difficultyPenalty * personalityBias * colorWeight + jitter
     */
    _selectByHumanLikeScore(candidates) {
      let best = candidates[0];
      let bestScore = -Infinity;

      for (let i = 0; i < candidates.length; i++) {
        const cand = candidates[i];
        let score = this._calcHumanLikeScore(cand);

        // 三色加权：在人性化评分之后应用
        if (this._heatmapAdapter && this._colorWeightEnabled) {
          const category = this._getCellCategory(cand.row, cand.col);
          const colorWeight = this._getColorSelectWeight(category);
          score *= colorWeight;
        }

        if (score > bestScore) {
          bestScore = score;
          best = cand;
        }
      }

      return best;
    }

    /**
     * 认知惯性评分计算
     * @param {Object} candidate - {row, col, num, technique, level}
     * @returns {number} 评分（越高越优先）
     */
    _calcHumanLikeScore(candidate) {
      const influence = this._rater._calcInfluence(candidate.row, candidate.col);
      const techLevel = candidate.level || 1;

      // 1. 难度衰减：越难的技巧越不"直觉"
      // Lv.1 → 1.0, Lv.3 → 0.59, Lv.5 → 0.41
      const difficultyPenalty = 1 / (1 + (techLevel - 1) * 0.35);

      // 2. 性格偏置
      const personalityBias = this._getPersonalityBias(techLevel, influence);

      // 3. 视觉直觉抖动（让人味更足）
      const jitter = (Math.random() - 0.5) * 0.12;

      return (influence * difficultyPenalty * personalityBias) + jitter;
    }

    /**
     * 性格差异化偏置
     * 不同性格对难度和影响力的偏好不同
     */
    _getPersonalityBias(techLevel, influence) {
      const personalityName = this._personality.name;

      switch (personalityName) {
        case 'steady':
          // 稳健型：极度偏好低难度格，扫光简单格再攻坚
          // 低难度加成高，高难度加成低
          return 0.8 + (1 / (1 + (techLevel - 1) * 0.2)) * 0.6;

        case 'surround':
          // 包围型：偏好高难度、高影响力格，追求一击破局
          return 0.6 + (techLevel / 8) * 0.6 + influence * 0.3;

        case 'reckless':
        default:
          // 冒失型：视觉随机流，局部密集区优先
          return 0.7 + Math.random() * 0.4;
      }
    }

    // ======================================================
    //  内部方法：思考时间计算
    // ======================================================

    _calcThinkTime(techLevel) {
      const baseTime = this._personality.baseThinkTime[techLevel] || 1000;
      const speedCurve = this._personality.speedCurve;
      const speedMult = this._personality.speedMultiplier;

      // 基础随机波动
      let multiplier = speedMult.min + Math.random() * (speedMult.max - speedMult.min);

      // 根据速度曲线调整
      const progress = this._moveCount / Math.max(this._countEmptyCells(), 1);

      switch (speedCurve) {
        case 'erratic':
          // 不稳定：额外叠加随机波动
          multiplier *= 0.7 + Math.random() * 0.8;
          break;
        case 'steady':
          // 稳定：基本不变，后期微加速
          if (progress > 0.6) {
            multiplier *= 0.85; // 后期变快15%
          }
          break;
        case 'accelerating':
          // 加速型：越往后越快
          // 开局慢30%，后期快30%
          const speedFactor = 1.3 - progress * 0.6;
          multiplier *= speedFactor;
          break;
      }

      // 棋盘大小修正（小棋盘更快）
      if (this._size === 4) {
        multiplier *= 0.5;
      } else if (this._size === 6) {
        multiplier *= 0.7;
      }

      // 最少40ms（让快的技巧真的很快）
      return Math.max(40, baseTime * multiplier);
    }

    _countEmptyCells() {
      let count = 0;
      for (let r = 0; r < this._size; r++) {
        for (let c = 0; c < this._size; c++) {
          const cell = this._board.cells[r][c];
          if (!cell.fixedNum && !cell.fillNum) {
            count++;
          }
        }
      }
      return count;
    }
  }

  // ========================================================
  //  导出
  // ========================================================

  global.AIPlayer = AIPlayer;
  global.AI_PERSONALITIES = PERSONALITIES;

})(window);
