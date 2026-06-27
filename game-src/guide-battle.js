/**
 * 教学模式章末Boss战系统
 * 纯竞速模式（MVP版）：AI用回溯秒解后按"从易到难"顺序伪装填数
 * 玩家在自己棋盘上正常解题，AI进度以幽灵数字+进度条显示
 */

const GuideBattle = {
  // 状态
  active: false,
  ended: false,
  result: null, // 'win' | 'lose' | null

  // 对手配置
  opponent: null,
  // { name, avatar, color, speedMin, speedMax, mistakeChance, personality }

  // 棋盘状态
  solution: null,      // 完整正解 2D数组
  initialBoard: null,  // 初始盘面（用于判断哪些是固定数字）
  size: 9,
  fixedMask: null,     // 2D boolean，true表示是题目固定数字

  // AI虚拟棋盘
  aiFilled: null,      // 2D，0=未填，数字=AI已填
  aiFilledCount: 0,
  aiOrder: [],         // AI填数顺序 [{r, c, difficulty}]
  aiIndex: 0,
  aiTimer: null,
  aiStartDelay: 500,   // AI开局前等待时间（由外部倒计时控制，默认很短）
  raceStarted: false,  // 比赛是否正式开始（倒计时结束后）

  // 玩家进度
  playerFilledCount: 0,
  totalEmptyCells: 0,

  // 回调
  onEnd: null,         // 对战结束回调 (result)

  // DOM元素缓存
  dom: null,

  /**
   * 启动Boss战
   * @param {Object} config - { solution, initialBoard, size, opponent, onEnd }
   */
  start(config) {
    if (this.active) {
      console.warn('⚠️ Boss战已在进行中，忽略重复start调用');
      return;
    }

    console.log('⚔️ GuideBattle.start() 被调用', config);

    if (!config.solution || !config.initialBoard) {
      console.error('❌ Boss战启动失败：缺少solution或initialBoard', config);
      return;
    }

    this.active = true;
    this.ended = false;
    this.result = null;
    this.raceStarted = false;

    this.solution = config.solution;
    this.initialBoard = config.initialBoard;
    this.size = config.size || 9;
    this.opponent = Object.assign({
      name: '神秘对手',
      avatar: '📁',
      color: '#ef4444',
      speedMin: 1200,
      speedMax: 2500,
      mistakeChance: 0.03,
      personality: ''
    }, config.opponent || {});
    this.onEnd = config.onEnd || null;

    // 初始化fixedMask
    this.fixedMask = Array(this.size).fill().map(() => Array(this.size).fill(false));
    this.aiFilled = Array(this.size).fill().map(() => Array(this.size).fill(0));
    this.aiFilledCount = 0;
    this.playerFilledCount = 0;
    this.totalEmptyCells = 0;

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const row = this.initialBoard[r];
        if (row && row[c] !== 0 && row[c] !== null && row[c] !== undefined) {
          this.fixedMask[r][c] = true;
        } else {
          this.totalEmptyCells++;
        }
      }
    }

    console.log('⚔️ Boss战初始化完成: size=' + this.size + ', totalEmpty=' + this.totalEmptyCells);

    // 计算AI填数顺序（从易到难）
    this._computeFillOrder();
    this.aiIndex = 0;

    // 创建UI
    try {
      this._createUI();
    } catch (e) {
      console.error('❌ 创建Boss战UI失败:', e);
    }

    // AI在beginRace()调用后才开始（等倒计时结束）
    // this.aiTimer = setTimeout(() => this._aiStep(), this.aiStartDelay);

    // 初始渲染
    this._updateUI();
  },

  /**
   * 正式开始比赛（倒计时结束后调用）
   */
  beginRace() {
    if (!this.active || this.ended || this.raceStarted) return;
    this.raceStarted = true;
    this.aiTimer = setTimeout(() => this._aiStep(), this.aiStartDelay);
    console.log('🏁 Boss战正式开始！');
  },

  /**
   * 停止Boss战（无论是否结束）
   */
  stop() {
    this.active = false;
    this.ended = false;
    this.result = null;
    this.raceStarted = false;
    if (this.aiTimer) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
    this._removeUI();
  },

  /**
   * 玩家填数回调（guide.js中每次填数后调用）
   * @returns {boolean} - 如果对战因此结束返回true
   */
  onPlayerFill(r, c, num, isCorrect) {
    if (!this.active || this.ended) return false;
    if (this.fixedMask[r] && this.fixedMask[r][c]) return false;

    if (isCorrect && num > 0) {
      this.playerFilledCount++;
      this._updateUI();

      // 检查玩家是否赢了
      if (this.playerFilledCount >= this.totalEmptyCells) {
        this._endBattle('win');
        return true;
      }
    }
    return false;
  },

  /**
   * 玩家擦除回调
   */
  onPlayerErase(r, c) {
    if (!this.active || this.ended) return;
    if (this.fixedMask[r] && this.fixedMask[r][c]) return;
    // 擦除不减少计数（只有正确填入才计数，擦除说明填错了，不影响进度）
    // 但我们简化处理：进度只增不减
  },

  /**
   * 绘制AI幽灵数字到canvas
   * 在renderer.render()之后调用
   */
  renderGhostNumbers(ctx, cellSize, padding) {
    if (!this.active) return;
    if (!this.aiFilled) return;

    const cs = cellSize;
    ctx.save();
    ctx.translate(padding, padding);

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const num = this.aiFilled[r][c];
        if (num > 0 && !this.fixedMask[r][c]) {
          // 如果玩家已经填了这个格，不显示幽灵
          if (this._isPlayerFilled(r, c)) continue;

          const x = c * cs;
          const y = r * cs;

          // 幽灵数字背景光晕
          ctx.fillStyle = this.opponent.color + '15';
          ctx.fillRect(x + 2, y + 2, cs - 4, cs - 4);

          // 幽灵数字
          ctx.fillStyle = this.opponent.color + '77';
          ctx.font = `bold ${Math.floor(cs * 0.5)}px "Ma Shan Zheng", "KaiTi", "STKaiti", serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(num), x + cs / 2, y + cs / 2 + 1);
        }
      }
    }

    ctx.restore();
  },

  // ========== 内部方法 ==========

  /**
   * 计算AI填数顺序
   * 策略：按"线索丰富度"排序，线索越多（同行/列/宫已填数越多）的格子越先填
   * 这模拟人类解题：先填容易确定的格子
   */
  _computeFillOrder() {
    const order = [];
    const size = this.size;
    // 根据盘面尺寸计算宫格大小
    let boxH, boxW;
    if (size === 4) { boxH = 2; boxW = 2; }
    else if (size === 6) { boxH = 2; boxW = 3; }
    else { boxH = 3; boxW = 3; } // 9x9

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!this.fixedMask[r][c]) {
          // 计算线索分：同行+同列+同宫的已填固定数字数量
          let clues = 0;

          // 行
          for (let cc = 0; cc < size; cc++) {
            if (this.fixedMask[r][cc]) clues++;
          }
          // 列
          for (let rr = 0; rr < size; rr++) {
            if (this.fixedMask[rr][c]) clues++;
          }
          // 宫（边界检查防止越界）
          const br = Math.floor(r / boxH) * boxH;
          const bc = Math.floor(c / boxW) * boxW;
          for (let dr = 0; dr < boxH; dr++) {
            for (let dc = 0; dc < boxW; dc++) {
              const nr = br + dr, nc = bc + dc;
              if (nr < size && nc < size && this.fixedMask[nr][nc]) clues++;
            }
          }

          order.push({ r, c, clues });
        }
      }
    }

    // 按线索分降序排列（线索越多越先填）
    // 加入随机扰动，让AI每次表现略有不同
    order.sort((a, b) => {
      const diff = b.clues - a.clues;
      if (Math.abs(diff) <= 2) {
        return Math.random() - 0.5; // 线索相近时随机
      }
      return diff;
    });

    this.aiOrder = order;
  },

  /**
   * AI执行一步填数
   */
  _aiStep() {
    if (!this.active || this.ended) return;

    // 找下一个可填的格子
    while (this.aiIndex < this.aiOrder.length) {
      const { r, c } = this.aiOrder[this.aiIndex];
      this.aiIndex++;

      // 检查玩家是否已经填了这个格
      // 注意：我们需要检查外部guideBoard，但为了解耦，用一个钩子
      if (this._isPlayerFilled(r, c)) continue;

      // 填入AI数字（直接从正解取）
      const correctNum = this.solution[r][c];
      let num = correctNum;

      // 低概率"犯错"——但犯错后会在下两步"纠正"（视觉效果）
      // 简化：AI不犯错，保持竞速纯粹性；犯错只在困难模式
      if (Math.random() < this.opponent.mistakeChance) {
        // 犯错：随机填一个错的数字，延迟2步后"擦除重填"
        this.aiFilled[r][c] = this._randomWrongNum(correctNum);
        this.aiFilledCount++;
        this._updateUI();
        // 安排纠错
        setTimeout(() => {
          if (this.active && !this.ended && this.aiFilled[r][c] !== correctNum && !this._isPlayerFilled(r, c)) {
            this.aiFilled[r][c] = correctNum;
            this._updateUI();
          }
        }, this.opponent.speedMax * 2);
      } else {
        this.aiFilled[r][c] = num;
        this.aiFilledCount++;
        this._updateUI();
      }

      // 检查AI是否赢了
      if (this.aiFilledCount >= this.totalEmptyCells) {
        this._endBattle('lose');
        return;
      }

      break;
    }

    // 安排下一步
    if (this.active && !this.ended && this.aiIndex < this.aiOrder.length) {
      const delay = this.opponent.speedMin + Math.random() * (this.opponent.speedMax - this.opponent.speedMin);
      // 随着游戏推进，AI略微加速（紧迫感）
      const progress = this.aiFilledCount / this.totalEmptyCells;
      const accelFactor = 1 - progress * 0.3; // 最快时速度提升30%
      this.aiTimer = setTimeout(() => this._aiStep(), delay * accelFactor);
    }
  },

  /**
   * 检查玩家是否已填某格（通过guideBoard全局引用）
   */
  _isPlayerFilled(r, c) {
    if (typeof guideBoard === 'undefined' || !guideBoard) return false;
    const cell = guideBoard.cells[r]?.[c];
    if (!cell) return false;
    return cell.fillNum !== null && cell.fillNum !== 0;
  },

  /**
   * 生成一个错误数字
   */
  _randomWrongNum(correct) {
    const max = this.size;
    let n;
    do {
      n = Math.floor(Math.random() * max) + 1;
    } while (n === correct);
    return n;
  },

  /**
   * 结束对战
   */
  _endBattle(result) {
    if (this.ended) return;
    this.ended = true;
    this.result = result;
    this.active = false;

    if (this.aiTimer) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }

    this._showResult(result);
  },

  /**
   * 创建UI组件
   */
  _createUI() {
    // 创建Boss状态条
    const bar = document.createElement('div');
    bar.id = 'boss-battle-bar';
    bar.innerHTML = `
      <div class="boss-info">
        <div class="boss-avatar" id="boss-avatar"></div>
        <div class="boss-detail">
          <div class="boss-name" id="boss-name"></div>
          <div class="boss-progress-bar">
            <div class="boss-progress-fill" id="boss-progress-fill"></div>
            <span class="boss-progress-text" id="boss-progress-text">0%</span>
          </div>
        </div>
      </div>
      <div class="player-info">
        <div class="player-detail">
          <div class="player-name">你</div>
          <div class="player-progress-bar">
            <div class="player-progress-fill" id="player-progress-fill"></div>
            <span class="player-progress-text" id="player-progress-text">0%</span>
          </div>
        </div>
        <div class="player-avatar">🔍</div>
      </div>
    `;

    // 创建结果弹窗
    const overlay = document.createElement('div');
    overlay.id = 'boss-result-overlay';
    overlay.style.display = 'none';

    document.body.appendChild(bar);
    document.body.appendChild(overlay);
    this.dom = { bar, overlay };

    // 设置对手信息
    const avatarEl = document.getElementById('boss-avatar');
    const nameEl = document.getElementById('boss-name');
    if (avatarEl) {
      if (this.opponent.avatar && (this.opponent.avatar.endsWith('.png') || this.opponent.avatar.endsWith('.jpg') || this.opponent.avatar.endsWith('.webp'))) {
        avatarEl.innerHTML = `<img src="${this.opponent.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      } else {
        avatarEl.textContent = this.opponent.avatar || '👤';
      }
    }
    if (nameEl) {
      nameEl.textContent = this.opponent.name;
      nameEl.style.color = this.opponent.color;
    }
  },

  /**
   * 更新UI进度条
   */
  _updateUI() {
    const aiPct = Math.min(100, Math.floor((this.aiFilledCount / this.totalEmptyCells) * 100));
    const playerPct = Math.min(100, Math.floor((this.playerFilledCount / this.totalEmptyCells) * 100));

    const aiFill = document.getElementById('boss-progress-fill');
    const aiText = document.getElementById('boss-progress-text');
    const playerFill = document.getElementById('player-progress-fill');
    const playerText = document.getElementById('player-progress-text');

    if (aiFill) {
      aiFill.style.width = aiPct + '%';
      aiFill.style.background = `linear-gradient(90deg, ${this.opponent.color}, ${this.opponent.color}cc)`;
    }
    if (aiText) aiText.textContent = aiPct + '%';
    if (playerFill) playerFill.style.width = playerPct + '%';
    if (playerText) playerText.textContent = playerPct + '%';

    // AI进度超过玩家时，Boss条加警告效果
    const bar = document.getElementById('boss-battle-bar');
    if (bar) {
      if (aiPct > playerPct + 15) {
        bar.classList.add('boss-leading');
      } else {
        bar.classList.remove('boss-leading');
      }
    }
  },

  /**
   * 显示结果弹窗
   */
  _showResult(result) {
    const overlay = document.getElementById('boss-result-overlay');
    if (!overlay) return;

    const isWin = result === 'win';
    overlay.innerHTML = `
      <div class="boss-result-content ${isWin ? 'win' : 'lose'}">
        <div class="boss-result-icon">${isWin ? '🏆' : '💀'}</div>
        <div class="boss-result-title">${isWin ? '胜 利！' : '败 北'}</div>
        <div class="boss-result-sub">
          ${isWin
            ? `你击败了${this.opponent.name}！`
            : `${this.opponent.name}抢先完成了笼局……`}
        </div>
        <div class="boss-result-stats">
          <div class="stat-row">
            <span>你的进度</span>
            <span>${Math.floor((this.playerFilledCount / this.totalEmptyCells) * 100)}%</span>
          </div>
          <div class="stat-row">
            <span>${this.opponent.name}的进度</span>
            <span>${Math.floor((this.aiFilledCount / this.totalEmptyCells) * 100)}%</span>
          </div>
        </div>
        <button class="boss-result-btn" id="boss-result-continue">
          ${isWin ? '继续' : '再试一次'}
        </button>
      </div>
    `;
    overlay.style.display = 'flex';

    const btn = document.getElementById('boss-result-continue');
    if (btn) {
      btn.addEventListener('click', () => {
        overlay.style.display = 'none';
        if (result === 'lose') {
          // 败北：重置关卡重新对战
          this._restartBattle();
        } else {
          // 胜利：通知外部，进入通关流程
          if (this.onEnd) this.onEnd('win');
        }
      });
    }
  },

  /**
   * 重新开始对战（败北重试）
   */
  _restartBattle() {
    // 重置玩家棋盘
    if (typeof guideBoard !== 'undefined' && guideBoard) {
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          const cell = guideBoard.cells[r][c];
          if (!this.fixedMask[r][c]) {
            cell.fillNum = null;
            cell.candidates = new Set();
            cell.isError = false;
          }
        }
      }
      guideBoard.history = [];
      if (typeof refreshBoard === 'function') refreshBoard();
    }

    // 重置AI状态
    this.ended = false;
    this.result = null;
    this.active = true;
    this.raceStarted = false;
    this.aiFilled = Array(this.size).fill().map(() => Array(this.size).fill(0));
    this.aiFilledCount = 0;
    this.playerFilledCount = 0;
    this.aiIndex = 0;
    this._computeFillOrder();
    this._updateUI();

    // 隐藏结果弹窗
    const overlay = document.getElementById('boss-result-overlay');
    if (overlay) overlay.style.display = 'none';

    // 重启AI（短延迟后开始）
    this.raceStarted = true;
    this.aiTimer = setTimeout(() => this._aiStep(), 2000);
  },

  /**
   * 移除UI组件
   */
  _removeUI() {
    if (this.dom) {
      if (this.dom.bar && this.dom.bar.parentNode) {
        this.dom.bar.parentNode.removeChild(this.dom.bar);
      }
      if (this.dom.overlay && this.dom.overlay.parentNode) {
        this.dom.overlay.parentNode.removeChild(this.dom.overlay);
      }
      this.dom = null;
    }
  }
};

// ========== 章末Boss配置表 ==========
const BOSS_CONFIGS = {
  // 第1章最后一关：阿岩（新手对战，很弱）
  109: {
    name: '阿岩',
    avatar: '👦',
    color: '#22c55e',
    speedMin: 5000,
    speedMax: 9000,
    mistakeChance: 0.2,
    personality: '新手侦探，速度慢还经常犯错',
    preDialog: [
      { speaker: '阿岩', text: '等等！这关学完你就要离开第一章了，先和我比一场再说！' },
      { speaker: '阿岩', text: '规则很简单——我们解同一道题，看谁先填完！我可是很厉害的，做好准备哦！' }
    ],
    winDialog: [
      { speaker: '阿岩', text:'哇！你好快！我还有好几个格子没填呢……' },
      { speaker: '守笼人', text:'基本功扎实，速度也不错。你已经准备好进入第二章了。' }
    ],
    loseDialog: null // 败北可以重试，不需要额外对话
  },
  // 第2章最后一关：守笼人
  208: {
    name: '守笼人',
    avatar: '🧙',
    color: '#6366f1',
    speedMin: 1800,
    speedMax: 3000,
    mistakeChance: 0.05,
    personality: '档案馆守护者，稳扎稳打',
    preDialog: [
      { speaker: '守笼人', text:'星衡法已全部教完。按照传统，结业需与守笼人对弈一局。' },
      { speaker: '阿岩', text:'加油！守笼人平时看起来慢吞吞的，其实解题可快了！' }
    ],
    winDialog: [
      { speaker: '守笼人', text:'……不错。你的星衡法已超越我预期。' },
      { speaker: '设局人', text:'哼，这就满足了？真正的挑战还在档案室深层等着你。' }
    ]
  },
  // 第3章最后一关：设局人残影
  307: {
    name: '设局人残影',
    avatar: '👤',
    color: '#ef4444',
    speedMin: 1200,
    speedMax: 2200,
    mistakeChance: 0.03,
    personality: '设局人留下的残影，冷酷精准',
    preDialog: [
      { speaker: '设局人', text:'区块排除学得不错嘛。但你以为这样就能通过深层档案室？' },
      { speaker: '设局人', text:'让我看看——你到底是真的懂了，还是只是在照猫画虎。' }
    ],
    winDialog: [
      { speaker: '设局人', text:'……你的区块逻辑，确实比我预想的要纯熟。' },
      { speaker: '守笼人', text:'不要得意。第四章的残局逆向推导，才是真正的考验。' }
    ]
  },
  // 第4章最后一关：残局守护者
  406: {
    name: '残局守护者',
    avatar: '📜',
    color: '#f97316',
    speedMin: 1000,
    speedMax: 1800,
    mistakeChance: 0.02,
    personality: '旧笔记中浮现的对弈残影',
    preDialog: [
      { speaker: '阿岩', text:'笔记上的字迹在发光……这是怎么回事？！' },
      { speaker: '守笼人', text:'这是当年对决的残留意念。它要和你下完那盘未竟之局。' }
    ],
    winDialog: [
      { speaker: '阿岩', text:'（笔记上的字迹慢慢褪去）「……后来者，你比当年的他更有勇气。」' },
      { speaker: '守笼人', text:'你看到了当年的真相。但星辰梭的秘密，还在更深的地方。' }
    ]
  },
  // 第5章最后一关：星辰梭傀儡
  506: {
    name: '星辰梭',
    avatar: '⚙️',
    color: '#a855f7',
    speedMin: 700,
    speedMax: 1300,
    mistakeChance: 0.01,
    personality: '星辰梭核心自动推演机制，冰冷无情',
    preDialog: [
      { speaker: '设局人', text:'你走到了星辰梭的核心。它会自动迎击任何入侵者。' },
      { speaker: '阿岩', text:'它……它不是人？那它解题岂不是——' },
      { speaker: '守笼人', text:'星辰梭推演笼局的速度远超人类。你必须全神贯注。' }
    ],
    winDialog: [
      { speaker: '设局人', text:'你居然赢过了星辰梭的自动推演……有意思。' },
      { speaker: '守笼人', text:'最后一章，终局笼局。设局人在那里等你。' }
    ]
  },
  // 第6章最后一关：设局人本体
  606: {
    name: '设局人',
    avatar: '🎭',
    color: '#dc2626',
    speedMin: 500,
    speedMax: 900,
    mistakeChance: 0.005,
    personality: '设局人本体，毕生巅峰水准',
    preDialog: [
      { speaker: '设局人', text:'你来了。三十年来，你是第一个走到这里的人。' },
      { speaker: '守笼人', text:'……' },
      { speaker: '阿岩', text:'最后一战了吧？来吧！' },
      { speaker: '设局人', text:'这道终局笼局，二十三提示数。让我看看——你到底值不值得我等这三十年。' }
    ],
    winDialog: null // 通关后直接播终局剧情
  }
};
