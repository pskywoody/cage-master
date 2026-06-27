/**
 * 教学模式章末Boss战系统 — 幽灵迷雾 v1.0
 *
 * 核心规则：
 * - 同盘竞速：玩家和AI在同一棋盘上解题
 * - 幽灵格：AI填的格子显示为淡色色块（不显示数字）
 * - 抢格子：玩家可以填AI已填的格子，抢过来变成自己的
 * - 迷雾系统：玩家只能看到距离自己已填格子≤2（曼哈顿距离）范围内的AI幽灵
 * - 胜负判定：先填到总空格数75%的赢
 * - 终局预警：到60%时屏幕边缘发红+角色台词
 * - 遭遇事件：AI从四个方向接近时触发不同强度的反馈
 */

const GuideBattle = {
  // ========== 状态 ==========
  active: false,
  ended: false,
  result: null,       // 'win' | 'lose' | null
  raceStarted: false,

  // 对手配置
  opponent: null,

  // 棋盘基础数据
  solution: null,
  initialBoard: null,
  size: 9,
  fixedMask: null,    // 题目预填数字（不算任何一方）

  // 归属：谁填了哪个格子
  aiOwned: null,      // 2D: 0=未被AI填, 数字=AI填了且未被抢
  playerOwned: null,  // 2D: 0=玩家没填, 数字=玩家填了（包括抢来的）
  aiCount: 0,
  playerCount: 0,
  totalEmpty: 0,
  winTarget: 0,       // 75%的格子数

  // AI填数顺序
  aiOrder: [],
  aiIndex: 0,
  aiTimer: null,
  aiStartDelay: 500,

  // 迷雾系统
  visionRange: 2,     // 视野范围（曼哈顿距离）
  visible: null,      // 2D boolean: 该格子是否在玩家视野内
  fogOpacity: null,   // 2D float: 迷雾透明度（动画用，0=清晰，1=全雾）

  // 抢格子动画
  stealFlash: null,   // 2D float: 抢格子闪光动画进度（0=无，1=最亮）
  stealFlashTime: 400, // ms

  // 60%预警
  warning60Shown: { ai: false, player: false },
  warningEdge: null,  // DOM元素：屏幕边缘红光

  // 遭遇事件系统
  encounterTriggered: null, // 2D: 每个方向每个距离档是否已触发 {up:{far,mid,near}, down:..., left:..., right:...}
  lastEncounterCheck: 0,    // 上次检测遭遇的时间戳

  // 回调
  onEnd: null,
  onEvent: null,      // 事件回调 (type, data) — 用于遭遇事件、预警等通知guide.js播台词/震动

  // DOM缓存
  dom: null,

  // ========== 启动 ==========
  start(config) {
    if (this.active) {
      console.warn('⚠️ Boss战已在进行中');
      return;
    }

    if (!config.solution || !config.initialBoard) {
      console.error('❌ Boss战启动失败：缺少solution或initialBoard');
      return;
    }

    this.active = true;
    this.ended = false;
    this.result = null;
    this.raceStarted = false;
    this.warning60Shown = { ai: false, player: false };
    this.encounterTriggered = {
      up: { far: false, mid: false, near: false },
      down: { far: false, mid: false, near: false },
      left: { far: false, mid: false, near: false },
      right: { far: false, mid: false, near: false }
    };
    this.lastEncounterCheck = 0;

    this.solution = config.solution;
    this.initialBoard = config.initialBoard;
    this.size = config.size || 9;
    this.opponent = Object.assign({
      name: '神秘对手',
      avatar: '👤',
      color: '#ef4444',
      speedMin: 3500,
      speedMax: 6000,
      mistakeChance: 0,
      personality: 'normal', // 'random'|'normal'|'surround' 对应三种AI风格
      fillStyle: 'normal'
    }, config.opponent || {});
    this.onEnd = config.onEnd || null;
    this.onEvent = config.onEvent || null;

    // 初始化归属与迷雾数组
    this.fixedMask = Array(this.size).fill().map(() => Array(this.size).fill(false));
    this.aiOwned = Array(this.size).fill().map(() => Array(this.size).fill(0));
    this.playerOwned = Array(this.size).fill().map(() => Array(this.size).fill(0));
    this.visible = Array(this.size).fill().map(() => Array(this.size).fill(false));
    this.fogOpacity = Array(this.size).fill().map(() => Array(this.size).fill(1)); // 初始全雾
    this.stealFlash = Array(this.size).fill().map(() => Array(this.size).fill(0));
    this.aiCount = 0;
    this.playerCount = 0;
    this.totalEmpty = 0;

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const row = this.initialBoard[r];
        if (row && row[c] !== 0 && row[c] != null) {
          this.fixedMask[r][c] = true;
        } else {
          this.totalEmpty++;
        }
      }
    }

    // 75%胜利阈值（至少1格）
    this.winTarget = Math.max(1, Math.ceil(this.totalEmpty * 0.75));

    console.log(`⚔️ Boss战启动: ${this.opponent.name} | size=${this.size} | 总空格=${this.totalEmpty} | 目标=${this.winTarget}(75%)`);

    // 计算AI填数顺序（根据AI风格）
    this._computeFillOrder();
    this.aiIndex = 0;

    // 初始视野（固定数字为锚点）
    this._updateVisibility();
    // 迷雾动画初始化：视野内立即清晰，视野外保持迷雾
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        this.fogOpacity[r][c] = this.visible[r][c] ? 0 : 1;
      }
    }

    // 创建UI
    try {
      this._createUI();
      this._createWarningEdge();
    } catch (e) {
      console.error('❌ 创建Boss战UI失败:', e);
    }

    this._updateUI();
    this._startFogAnimation();
  },

  /**
   * 倒计时结束，正式开赛
   */
  beginRace() {
    if (!this.active || this.ended || this.raceStarted) return;
    this.raceStarted = true;
    this.aiTimer = setTimeout(() => this._aiStep(), this.aiStartDelay);
    console.log('🏁 幽灵迷雾对战开始！');
  },

  /**
   * 停止并清理
   */
  stop() {
    this.active = false;
    this.ended = false;
    this.result = null;
    this.raceStarted = false;
    if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    if (this._fogAnimFrame) { cancelAnimationFrame(this._fogAnimFrame); this._fogAnimFrame = null; }
    this._removeWarningEdge();
    this._removeUI();
  },

  // ========== 玩家操作回调 ==========

  /**
   * 玩家填数
   * @returns {boolean} 对战是否因此结束
   */
  onPlayerFill(r, c, num, isCorrect) {
    if (!this.active || this.ended) return false;
    if (this.fixedMask[r] && this.fixedMask[r][c]) return false;

    if (isCorrect && num > 0) {
      // 抢格子：如果AI已经填了这格，抢过来
      const wasAi = this.aiOwned[r][c] > 0;
      if (wasAi) {
        this.aiOwned[r][c] = 0;
        this.aiCount--;
        this.stealFlash[r][c] = 1; // 触发抢格子闪光
        if (this.onEvent) this.onEvent('steal', { r, c });
      }

      this.playerOwned[r][c] = num;
      this.playerCount++;

      // 更新视野（新填的格子也是视野锚点）
      this._updateVisibility();

      // 检测遭遇事件
      this._checkEncounters();

      this._updateUI();

      // 检查60%预警
      this._checkWarning();

      // 检查玩家是否赢了
      if (this.playerCount >= this.winTarget) {
        this._endBattle('win');
        return true;
      }
    } else if (!isCorrect && num > 0) {
      // 填错闪红（由renderer处理，这里只触发事件）
      if (this.onEvent) this.onEvent('wrong', { r, c });
    }
    // 填错不散雾、不计入
    return false;
  },

  /**
   * 玩家擦除
   */
  onPlayerErase(r, c) {
    if (!this.active || this.ended) return;
    if (this.fixedMask[r] && this.fixedMask[r][c]) return;

    // 如果擦除的是玩家已填正确的格子，需要归还视野
    if (this.playerOwned[r][c] > 0) {
      this.playerOwned[r][c] = 0;
      this.playerCount--;
      // 擦除后视野收缩
      this._updateVisibility();
    }
  },

  // ========== 迷雾视野系统 ==========

  /**
   * 更新视野可见性：收集所有玩家锚点，计算每个空格到最近锚点的曼哈顿距离
   */
  _updateVisibility() {
    // 收集锚点：固定数字 + 玩家已填正确格子（抢来的也算）
    const anchors = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.fixedMask[r][c] || this.playerOwned[r][c] > 0) {
          anchors.push({ r, c });
        }
      }
    }

    // 没有锚点（极端情况）时全雾
    if (anchors.length === 0) {
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          this.visible[r][c] = false;
        }
      }
      return;
    }

    // 对每个格子计算最近锚点距离
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        let minDist = Infinity;
        for (const a of anchors) {
          const d = Math.abs(r - a.r) + Math.abs(c - a.c);
          if (d < minDist) minDist = d;
        }
        this.visible[r][c] = (minDist <= this.visionRange);
      }
    }
  },

  /**
   * 迷雾动画：每帧渐变fogOpacity向目标值靠近
   */
  _startFogAnimation() {
    const animate = () => {
      if (!this.active) return;
      let needsRender = false;
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          const target = this.visible[r][c] ? 0 : 0.75; // 迷雾透明度75%
          const cur = this.fogOpacity[r][c];
          if (Math.abs(cur - target) > 0.01) {
            this.fogOpacity[r][c] = cur + (target - cur) * 0.12; // 渐变速率
            needsRender = true;
          } else {
            this.fogOpacity[r][c] = target;
          }

          // 抢格子闪光衰减
          if (this.stealFlash[r][c] > 0) {
            this.stealFlash[r][c] -= 16 / this.stealFlashTime;
            if (this.stealFlash[r][c] < 0) this.stealFlash[r][c] = 0;
            needsRender = true;
          }
        }
      }
      if (needsRender && typeof refreshBoard === 'function') {
        refreshBoard();
      }
      this._fogAnimFrame = requestAnimationFrame(animate);
    };
    this._fogAnimFrame = requestAnimationFrame(animate);
  },

  // ========== 遭遇事件系统 ==========

  /**
   * 检测AI与玩家区域的遭遇（四个方向）
   * 规则：
   * - 找玩家已填格子的"前沿"（边界）
   * - 找视野边缘附近的AI格子
   * - 按方向判定远(3-4格)/中(2格)/近(1格)遭遇
   */
  _checkEncounters() {
    const now = Date.now();
    if (now - this.lastEncounterCheck < 800) return; // 节流，避免频繁触发
    this.lastEncounterCheck = now;

    if (!this.raceStarted) return;

    const size = this.size;

    // 找玩家区域的边界中心（用于判定方向）
    let playerMinR = size, playerMaxR = -1, playerMinC = size, playerMaxC = -1;
    let playerCenterR = 0, playerCenterC = 0, playerCountTemp = 0;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (this.playerOwned[r][c] > 0 || this.fixedMask[r][c]) {
          playerMinR = Math.min(playerMinR, r);
          playerMaxR = Math.max(playerMaxR, r);
          playerMinC = Math.min(playerMinC, c);
          playerMaxC = Math.max(playerMaxC, c);
          playerCenterR += r;
          playerCenterC += c;
          playerCountTemp++;
        }
      }
    }

    if (playerCountTemp === 0) return;
    playerCenterR = Math.round(playerCenterR / playerCountTemp);
    playerCenterC = Math.round(playerCenterC / playerCountTemp);

    // 找所有视野内/边缘的AI格子，计算到玩家区域的距离
    const aiCells = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (this.aiOwned[r][c] > 0 && this.playerOwned[r][c] === 0) {
          // 计算这个AI格子到最近玩家锚点的距离
          let minDist = Infinity;
          for (let pr = 0; pr < size; pr++) {
            for (let pc = 0; pc < size; pc++) {
              if (this.playerOwned[pr][pc] > 0 || this.fixedMask[pr][pc]) {
                const d = Math.abs(r - pr) + Math.abs(c - pc);
                if (d < minDist) minDist = d;
              }
            }
          }
          if (minDist <= 4) { // 只关注4格以内的
            aiCells.push({ r, c, dist: minDist });
          }
        }
      }
    }

    // 对每个方向找最近的AI格子
    const directions = ['up', 'down', 'left', 'right'];
    for (const dir of directions) {
      let closestDist = Infinity;
      let closestCell = null;

      for (const cell of aiCells) {
        let inDir = false;
        switch (dir) {
          case 'up':    inDir = cell.r < playerCenterR - 0 && Math.abs(cell.c - playerCenterC) <= 2; break;
          case 'down':  inDir = cell.r > playerCenterR + 0 && Math.abs(cell.c - playerCenterC) <= 2; break;
          case 'left':  inDir = cell.c < playerCenterC - 0 && Math.abs(cell.r - playerCenterR) <= 2; break;
          case 'right': inDir = cell.c > playerCenterC + 0 && Math.abs(cell.r - playerCenterR) <= 2; break;
        }
        if (inDir && cell.dist < closestDist) {
          closestDist = cell.dist;
          closestCell = cell;
        }
      }

      if (!closestCell) continue;

      // 判定距离档位并触发（每个方向每个档只触发一次）
      let level = null;
      let lineKey = null;
      if (closestDist === 1 && !this.encounterTriggered[dir].near) {
        level = 'near';
        this.encounterTriggered[dir].near = true;
        this.encounterTriggered[dir].mid = true; // 近距触发时中距也算触发过
        this.encounterTriggered[dir].far = true;
      } else if (closestDist === 2 && !this.encounterTriggered[dir].mid) {
        level = 'mid';
        this.encounterTriggered[dir].mid = true;
        this.encounterTriggered[dir].far = true;
      } else if (closestDist >= 3 && closestDist <= 4 && !this.encounterTriggered[dir].far) {
        level = 'far';
        this.encounterTriggered[dir].far = true;
      }

      if (level && this.onEvent) {
        const dirNames = { up: '上', down: '下', left: '左', right: '右' };
        this.onEvent('encounter', {
          direction: dir,
          dirName: dirNames[dir],
          level: level,
          distance: closestDist,
          cell: closestCell
        });
      }
    }
  },

  // ========== 60%终局预警 ==========
  _checkWarning() {
    const aiPct = this.aiCount / this.totalEmpty;
    const playerPct = this.playerCount / this.totalEmpty;

    if (aiPct >= 0.6 && !this.warning60Shown.ai) {
      this.warning60Shown.ai = true;
      this._flashWarningEdge();
      if (this.onEvent) this.onEvent('warning', { who: 'ai', pct: aiPct });
    }
    if (playerPct >= 0.6 && !this.warning60Shown.player) {
      this.warning60Shown.player = true;
      // 玩家到60%时不震自己，但可以有正向提示
      if (this.onEvent) this.onEvent('warning', { who: 'player', pct: playerPct });
    }
  },

  _flashWarningEdge() {
    if (!this.warningEdge) return;
    this.warningEdge.style.opacity = '1';
    this.warningEdge.style.animation = 'none';
    // 触发重排
    void this.warningEdge.offsetWidth;
    this.warningEdge.style.animation = 'boss-warning-pulse 0.6s ease-out 4';
    setTimeout(() => {
      if (this.warningEdge) this.warningEdge.style.opacity = '0';
    }, 2800);
  },

  _createWarningEdge() {
    const edge = document.createElement('div');
    edge.id = 'boss-warning-edge';
    document.body.appendChild(edge);
    this.warningEdge = edge;
  },

  _removeWarningEdge() {
    if (this.warningEdge && this.warningEdge.parentNode) {
      this.warningEdge.parentNode.removeChild(this.warningEdge);
    }
    this.warningEdge = null;
  },

  // ========== Canvas渲染 ==========

  /**
   * 在数字下层渲染：玩家格子深蓝色底色
   * 必须在guideRenderer.render()之前调用
   */
  renderPlayerOwned(ctx, cellSize, padding) {
    if (!this.active) return;
    const cs = cellSize;
    ctx.save();
    ctx.translate(padding, padding);

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.fixedMask[r][c]) continue;
        if (this.playerOwned[r][c] > 0) {
          const x = c * cs;
          const y = r * cs;
          ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
          ctx.fillRect(x, y, cs, cs);
        }
      }
    }

    ctx.restore();
  },

  /**
   * 在数字上层渲染：幽灵格+迷雾+抢格子闪光
   * 必须在guideRenderer.render()之后调用
   */
  renderFogAndGhosts(ctx, cellSize, padding) {
    if (!this.active) return;

    const cs = cellSize;
    ctx.save();
    ctx.translate(padding, padding);

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.fixedMask[r][c]) continue;

        const x = c * cs;
        const y = r * cs;
        const isAi = this.aiOwned[r][c] > 0;
        const isPlayerOwned = this.playerOwned[r][c] > 0;
        const fog = this.fogOpacity[r][c];

        // 1. 幽灵格：视野内的AI格子 → 淡色色块+圆点（不显示数字）
        if (isAi && !isPlayerOwned && fog < 0.5) {
          // 幽灵格底色（对手色半透明）
          ctx.fillStyle = this.opponent.color + '33';
          this._roundRect(ctx, x + 2, y + 2, cs - 4, cs - 4, 4);
          ctx.fill();

          // 幽灵格边框
          ctx.strokeStyle = this.opponent.color + '66';
          ctx.lineWidth = 1.5;
          this._roundRect(ctx, x + 2, y + 2, cs - 4, cs - 4, 4);
          ctx.stroke();

          // 幽灵格中心圆点标记（表示AI占据）
          ctx.fillStyle = this.opponent.color + 'aa';
          ctx.beginPath();
          ctx.arc(x + cs / 2, y + cs / 2, cs * 0.1, 0, Math.PI * 2);
          ctx.fill();
        }

        // 2. 迷雾层：覆盖在格子上的暗色蒙版
        if (fog > 0.01) {
          ctx.fillStyle = `rgba(15, 23, 42, ${fog * 0.7})`;
          ctx.fillRect(x, y, cs, cs);

          // 迷雾纹理：淡淡的噪点效果
          if (fog > 0.3) {
            ctx.fillStyle = `rgba(100, 116, 139, ${fog * 0.08})`;
            ctx.beginPath();
            ctx.moveTo(x, y + cs * 0.3);
            ctx.lineTo(x + cs * 0.3, y);
            ctx.lineTo(x + cs, y + cs * 0.7);
            ctx.lineTo(x + cs * 0.7, y + cs);
            ctx.closePath();
            ctx.fill();
          }
        }

        // 3. 抢格子闪光
        const flash = this.stealFlash[r][c];
        if (flash > 0) {
          ctx.fillStyle = `rgba(34, 197, 94, ${flash * 0.5})`;
          ctx.fillRect(x, y, cs, cs);
          ctx.strokeStyle = `rgba(34, 197, 94, ${flash})`;
          ctx.lineWidth = 2 + flash * 3;
          ctx.strokeRect(x + 1, y + 1, cs - 2, cs - 2);
        }
      }
    }

    ctx.restore();
  },

  /**
   * 工具：圆角矩形
   */
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  // ========== AI逻辑 ==========

  /**
   * 根据AI风格计算填数顺序
   * - random（阿岩）：跳着填，东一榔头西一棒子，随机打乱
   * - normal（守笼人）：从左到右从上到下，规规矩矩按线索数填
   * - surround（设局人）：从四周往中间包抄
   */
  _computeFillOrder() {
    const order = [];
    const size = this.size;
    let boxH, boxW;
    if (size === 4) { boxH = 2; boxW = 2; }
    else if (size === 6) { boxH = 2; boxW = 3; }
    else { boxH = 3; boxW = 3; }

    const style = this.opponent.fillStyle || 'normal';
    const center = (size - 1) / 2;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!this.fixedMask[r][c]) {
          let clues = 0;
          for (let cc = 0; cc < size; cc++) {
            if (this.fixedMask[r][cc]) clues++;
          }
          for (let rr = 0; rr < size; rr++) {
            if (this.fixedMask[rr][c]) clues++;
          }
          const br = Math.floor(r / boxH) * boxH;
          const bc = Math.floor(c / boxW) * boxW;
          for (let dr = 0; dr < boxH; dr++) {
            for (let dc = 0; dc < boxW; dc++) {
              const nr = br + dr, nc = bc + dc;
              if (nr < size && nc < size && this.fixedMask[nr][nc]) clues++;
            }
          }

          // 计算优先级分数
          let priority = clues; // 基础：线索越多越先填

          if (style === 'surround') {
            // 从四周往中间包抄：距离中心越远越先填
            const distToCenter = Math.abs(r - center) + Math.abs(c - center);
            priority += distToCenter * 3;
          } else if (style === 'random') {
            // 随机风格：加入大量随机扰动
            priority += Math.random() * 20 - 10;
          }
          // normal风格：按线索数+轻微随机

          order.push({ r, c, clues, priority });
        }
      }
    }

    order.sort((a, b) => {
      const diff = b.priority - a.priority;
      if (Math.abs(diff) <= 2) return Math.random() - 0.5;
      return diff;
    });

    this.aiOrder = order;
  },

  _aiStep() {
    if (!this.active || this.ended || !this.raceStarted) return;

    while (this.aiIndex < this.aiOrder.length) {
      const { r, c } = this.aiOrder[this.aiIndex];
      this.aiIndex++;

      // 玩家已填（包括抢来的）就跳过
      if (this.playerOwned[r][c] > 0) continue;
      // AI已经填了也跳过
      if (this.aiOwned[r][c] > 0) continue;

      // AI偶尔"失误"（不填，跳过，但不算错）— 模拟阿岩的风格
      if (this.opponent.mistakeChance > 0 && Math.random() < this.opponent.mistakeChance) {
        // 失误：把这格放到队列末尾，晚些再填
        this.aiOrder.push({ r, c, clues: 0, priority: -100 });
        continue;
      }

      const num = this.solution[r][c];
      this.aiOwned[r][c] = num;
      this.aiCount++;

      // 检测遭遇事件
      this._checkEncounters();

      this._updateUI();
      this._checkWarning();

      if (this.aiCount >= this.winTarget) {
        this._endBattle('lose');
        return;
      }
      break;
    }

    if (this.active && !this.ended && this.aiIndex < this.aiOrder.length) {
      const baseDelay = this.opponent.speedMin + Math.random() * (this.opponent.speedMax - this.opponent.speedMin);
      // AI动态速度曲线：开局慢30%，中期正常，后期快20%
      const progress = this.aiCount / this.totalEmpty;
      let speedMul = 1;
      if (progress < 0.25) speedMul = 1.3;     // 开局慢（delay变大）
      else if (progress > 0.75) speedMul = 0.8; // 后期快（delay变小）
      this.aiTimer = setTimeout(() => this._aiStep(), baseDelay * speedMul);
    }
  },

  // ========== UI ==========

  _createUI() {
    const bar = document.createElement('div');
    bar.id = 'boss-battle-bar';
    bar.innerHTML = `
      <div class="boss-info">
        <div class="boss-avatar" id="boss-avatar"></div>
        <div class="boss-detail">
          <div class="boss-name" id="boss-name"></div>
          <div class="boss-progress-bar">
            <div class="boss-progress-fill" id="boss-progress-fill"></div>
          </div>
        </div>
        <span class="boss-progress-text" id="boss-progress-text">0%</span>
      </div>
      <div class="vs-divider">VS</div>
      <div class="player-info">
        <span class="player-progress-text" id="player-progress-text">0%</span>
        <div class="player-detail">
          <div class="player-name">你</div>
          <div class="player-progress-bar">
            <div class="player-progress-fill" id="player-progress-fill"></div>
          </div>
        </div>
        <div class="player-avatar">🔍</div>
      </div>
    `;

    const overlay = document.createElement('div');
    overlay.id = 'boss-result-overlay';
    overlay.style.display = 'none';

    document.body.appendChild(bar);
    document.body.appendChild(overlay);
    this.dom = { bar, overlay };

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

  _updateUI() {
    const aiPct = Math.min(100, Math.floor((this.aiCount / this.winTarget) * 100));
    const playerPct = Math.min(100, Math.floor((this.playerCount / this.winTarget) * 100));

    const aiFill = document.getElementById('boss-progress-fill');
    const aiText = document.getElementById('boss-progress-text');
    const playerFill = document.getElementById('player-progress-fill');
    const playerText = document.getElementById('player-progress-text');

    if (aiFill) aiFill.style.width = Math.min(100, aiPct) + '%';
    if (aiFill) aiFill.style.background = `linear-gradient(90deg, ${this.opponent.color}, ${this.opponent.color}cc)`;
    if (aiText) aiText.textContent = Math.floor(this.aiCount / this.totalEmpty * 100) + '%';
    if (playerFill) playerFill.style.width = Math.min(100, playerPct) + '%';
    if (playerText) playerText.textContent = Math.floor(this.playerCount / this.totalEmpty * 100) + '%';

    const bar = document.getElementById('boss-battle-bar');
    if (bar) {
      if (aiPct > playerPct + 20) {
        bar.classList.add('boss-leading');
      } else {
        bar.classList.remove('boss-leading');
      }
    }
  },

  _showResult(result) {
    const overlay = document.getElementById('boss-result-overlay');
    if (!overlay) return;

    const isWin = result === 'win';
    const aiFinalPct = Math.floor((this.aiCount / this.totalEmpty) * 100);
    const playerFinalPct = Math.floor((this.playerCount / this.totalEmpty) * 100);

    overlay.innerHTML = `
      <div class="boss-result-content ${isWin ? 'win' : 'lose'}">
        <div class="boss-result-icon">${isWin ? '🏆' : '💀'}</div>
        <div class="boss-result-title">${isWin ? '胜 利！' : '败 北'}</div>
        <div class="boss-result-sub">
          ${isWin
            ? `你击败了${this.opponent.name}！`
            : `${this.opponent.name}抢先达到了75%……`}
        </div>
        <div class="boss-result-stats">
          <div class="stat-row">
            <span>你的进度</span>
            <span style="color:#2563eb;font-weight:700;">${playerFinalPct}%</span>
          </div>
          <div class="stat-row">
            <span>${this.opponent.name}的进度</span>
            <span style="color:${this.opponent.color};font-weight:700;">${aiFinalPct}%</span>
          </div>
        </div>
        <button class="boss-result-btn" id="boss-result-continue">
          ${isWin ? '继续剧情' : '再试一次'}
        </button>
      </div>
    `;
    overlay.style.display = 'flex';

    const btn = document.getElementById('boss-result-continue');
    if (btn) {
      btn.addEventListener('click', () => {
        overlay.style.display = 'none';
        if (result === 'lose') {
          this._restartBattle();
        } else {
          if (this.onEnd) this.onEnd('win');
        }
      });
    }
  },

  _endBattle(result) {
    if (this.ended) return;
    this.ended = true;
    this.result = result;
    this.active = false;
    if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    if (this._fogAnimFrame) { cancelAnimationFrame(this._fogAnimFrame); this._fogAnimFrame = null; }
    this._showResult(result);
  },

  _restartBattle() {
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

    this.ended = false;
    this.result = null;
    this.active = true;
    this.raceStarted = false;
    this.warning60Shown = { ai: false, player: false };
    this.encounterTriggered = {
      up: { far: false, mid: false, near: false },
      down: { far: false, mid: false, near: false },
      left: { far: false, mid: false, near: false },
      right: { far: false, mid: false, near: false }
    };
    this.aiOwned = Array(this.size).fill().map(() => Array(this.size).fill(0));
    this.playerOwned = Array(this.size).fill().map(() => Array(this.size).fill(0));
    this.visible = Array(this.size).fill().map(() => Array(this.size).fill(false));
    this.fogOpacity = Array(this.size).fill().map(() => Array(this.size).fill(1));
    this.stealFlash = Array(this.size).fill().map(() => Array(this.size).fill(0));
    this.aiCount = 0;
    this.playerCount = 0;
    this.aiIndex = 0;

    this._computeFillOrder();
    this._updateVisibility();
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        this.fogOpacity[r][c] = this.visible[r][c] ? 0 : 1;
      }
    }
    this._updateUI();

    const overlay = document.getElementById('boss-result-overlay');
    if (overlay) overlay.style.display = 'none';
    this._removeWarningEdge();
    this._createWarningEdge();

    this._startFogAnimation();

    // 2秒后AI开始
    setTimeout(() => this.beginRace(), 2000);
  },

  _removeUI() {
    if (this.dom) {
      if (this.dom.bar && this.dom.bar.parentNode) this.dom.bar.parentNode.removeChild(this.dom.bar);
      if (this.dom.overlay && this.dom.overlay.parentNode) this.dom.overlay.parentNode.removeChild(this.dom.overlay);
      this.dom = null;
    }
  }
};

// ========== Boss配置表 ==========
const BOSS_CONFIGS = {
  // 第1章：阿岩（新手，跳着填，偶尔失误）
  109: {
    name: '阿岩',
    avatar: '👦',
    color: '#22c55e',
    speedMin: 6000,
    speedMax: 11000,
    mistakeChance: 0.15,
    fillStyle: 'random',
    personality: '新手侦探，东一榔头西一棒子',
    preDialog: [
      { speaker: '阿岩', text: '等等！这关学完你就要离开第一章了，先和我比一场再说！' },
      { speaker: '阿岩', text: '规则很简单——我们解同一道题，谁先填到75%谁赢！迷雾中你只能看到自己周围哦，小心我偷偷超车！' }
    ],
    winDialog: [
      { speaker: '阿岩', text: '哇！你好快！我还有好多格子没填呢……' },
      { speaker: '守笼人', text: '基本功扎实，速度也不错。你已经准备好进入第二章了。' }
    ],
    warningLines: [
      '他快赢了！加油啊！',
      '不好，阿岩要超了！'
    ],
    encounterLines: {
      far:  { text: '嗯？那边好像有动静……', intensity: 'light' },
      mid:  { text: '那边发现阿岩的踪迹！', intensity: 'medium' },
      near: { text: '糟了，脸贴脸了！', intensity: 'strong' }
    }
  },
  // 第2章：守笼人（稳扎稳打，从左到右）
  208: {
    name: '守笼人',
    avatar: '🧙',
    color: '#6366f1',
    speedMin: 3500,
    speedMax: 6000,
    mistakeChance: 0.05,
    fillStyle: 'normal',
    personality: '档案馆守护者，稳扎稳打',
    preDialog: [
      { speaker: '守笼人', text: '星衡法已全部教完。按照传统，结业需与守笼人对弈一局。' },
      { speaker: '阿岩', text: '加油！守笼人平时看起来慢吞吞的，其实解题可快了！注意迷雾里他的动向！' }
    ],
    winDialog: [
      { speaker: '守笼人', text: '……不错。你的星衡法已超越我预期。' },
      { speaker: '设局人', text: '哼，这就满足了？真正的挑战还在档案室深层等着你。' }
    ],
    warningLines: [
      '守笼人推进很快，集中注意力！'
    ],
    encounterLines: {
      far:  { text: '……有股熟悉的气息。', intensity: 'light' },
      mid:  { text: '守笼人来了，做好准备。', intensity: 'medium' },
      near: { text: '他就在眼前！', intensity: 'strong' }
    }
  },
  // 第3章：设局人残影（从四周包抄）
  307: {
    name: '设局人残影',
    avatar: '👤',
    color: '#ef4444',
    speedMin: 2500,
    speedMax: 4500,
    mistakeChance: 0.03,
    fillStyle: 'surround',
    personality: '冷酷精准的残影，从四周包抄',
    preDialog: [
      { speaker: '设局人', text: '区块排除学得不错嘛。但在迷雾中，你还能找到方向吗？' },
      { speaker: '设局人', text: '让我看看——你到底是真的懂了，还是只是在照猫画虎。' }
    ],
    winDialog: [
      { speaker: '设局人', text: '……你的区块逻辑，确实比我预想的要纯熟。' },
      { speaker: '守笼人', text: '不要得意。第四章的残局逆向推导，才是真正的考验。' }
    ],
    warningLines: [
      '残影推进极快，不能再犹豫了！'
    ],
    encounterLines: {
      far:  { text: '有什么东西……在雾里移动。', intensity: 'light' },
      mid:  { text: '残影包围过来了！', intensity: 'medium' },
      near: { text: '小心！他就在旁边！', intensity: 'strong' }
    }
  },
  // 第4章：残局守护者
  406: {
    name: '残局守护者',
    avatar: '📜',
    color: '#f97316',
    speedMin: 2000,
    speedMax: 3800,
    mistakeChance: 0.02,
    fillStyle: 'normal',
    personality: '旧笔记残留意念',
    preDialog: [
      { speaker: '阿岩', text: '笔记上的字迹在发光……这是怎么回事？！' },
      { speaker: '守笼人', text: '这是当年对决的残留意念。在迷雾中它不会手下留情。' }
    ],
    winDialog: [
      { speaker: '阿岩', text: '（笔记上的字迹慢慢褪去）「……后来者，你比当年的他更有勇气。」' },
      { speaker: '守笼人', text: '你看到了当年的真相。但星辰梭的秘密，还在更深的地方。' }
    ],
    warningLines: [
      '守护者的速度越来越快了！'
    ],
    encounterLines: {
      far:  { text: '笔记上的字……在颤动。', intensity: 'light' },
      mid:  { text: '守护者逼近了！', intensity: 'medium' },
      near: { text: '它来了！', intensity: 'strong' }
    }
  },
  // 第5章：星辰梭（冰冷推演机器，从四周包抄）
  506: {
    name: '星辰梭',
    avatar: '⚙️',
    color: '#a855f7',
    speedMin: 1500,
    speedMax: 2800,
    mistakeChance: 0.01,
    fillStyle: 'surround',
    personality: '冰冷的推演机器',
    preDialog: [
      { speaker: '设局人', text: '你走到了星辰梭的核心。它会自动迎击任何入侵者。' },
      { speaker: '阿岩', text: '它……它不是人？那它解题岂不是——' },
      { speaker: '守笼人', text: '星辰梭推演笼局的速度远超人类。在迷雾中你几乎看不到它的动向，必须全神贯注。' }
    ],
    winDialog: [
      { speaker: '设局人', text: '你居然赢过了星辰梭的自动推演……有意思。' },
      { speaker: '守笼人', text: '最后一章，终局笼局。设局人在那里等你。' }
    ],
    warningLines: [
      '星辰梭推演速度惊人，快！'
    ],
    encounterLines: {
      far:  { text: '……机械运转声。', intensity: 'light' },
      mid:  { text: '星辰梭锁定了你的方向！', intensity: 'medium' },
      near: { text: '推演已到眼前！', intensity: 'strong' }
    }
  },
  // 第6章：设局人本体（终局之敌，四面包抄）
  606: {
    name: '设局人',
    avatar: '🎭',
    color: '#dc2626',
    speedMin: 1000,
    speedMax: 2000,
    mistakeChance: 0.005,
    fillStyle: 'surround',
    personality: '终局之敌，笼局已布下',
    preDialog: [
      { speaker: '设局人', text: '你来了。三十年来，你是第一个走到这里的人。' },
      { speaker: '守笼人', text: '……' },
      { speaker: '阿岩', text: '最后一战了吧？来吧！' },
      { speaker: '设局人', text: '终局笼局，二十三提示数。迷雾中你什么也看不清——让我看看，你到底值不值得我等这三十年。' }
    ],
    winDialog: null,
    warningLines: [
      '设局人已经快到终局了！拼了！'
    ],
    encounterLines: {
      far:  { text: '「笼局已成。」', intensity: 'light' },
      mid:  { text: '「你逃不掉的。」', intensity: 'medium' },
      near: { text: '「来，做个了断吧。」', intensity: 'strong' }
    }
  }
};
