// ==========================================
// 教学模式引导系统 - GuideManager
// ==========================================
// 功能：
//   1. 触发器判定引擎：根据关卡配置的 triggers 数组，在各种游戏事件中判断是否触发
//   2. freeze_mask 组件：全屏遮罩 + 高亮挖空 + 引导文字
//   3. popup_hint 组件：气泡提示，自动淡出，不打断操作
//   4. calc_panel / badge_award：预留接口
// ==========================================

// ---------- 本地存储 key 前缀 ----------
const GUIDE_STORAGE_PREFIX = 'killersudoku_guide_';

// ==========================================
// FreezeMask 组件：冷冻遮罩
// ==========================================
// 全屏半透明黑色遮罩，目标位置有高亮"挖空"效果，底部有引导文字
// 点击任意位置或"知道了"按钮关闭
class FreezeMask {
  constructor() {
    this.el = null;
    this.spotlightEl = null;
    this.textEl = null;
    this.onCloseCallback = null;
    this._closeTimer = null;
    this._build();
  }

  /**
   * 构建 DOM 结构
   */
  _build() {
    // 遮罩容器
    this.el = document.createElement('div');
    this.el.className = 'guide-freeze-mask';
    this.el.style.display = 'none';

    // 高亮挖空区域（使用 box-shadow 实现"挖空"效果）
    this.spotlightEl = document.createElement('div');
    this.spotlightEl.className = 'guide-freeze-spotlight';

    // 底部引导文字容器
    const textContainer = document.createElement('div');
    textContainer.className = 'guide-freeze-text-wrap';

    this.textEl = document.createElement('div');
    this.textEl.className = 'guide-freeze-text';

    const btn = document.createElement('button');
    btn.className = 'guide-freeze-btn';
    btn.textContent = '知道了';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });

    textContainer.appendChild(this.textEl);
    textContainer.appendChild(btn);

    this.el.appendChild(this.spotlightEl);
    this.el.appendChild(textContainer);

    // 点击遮罩任意位置关闭
    this.el.addEventListener('click', () => {
      this.close();
    });

    document.body.appendChild(this.el);
  }

  /**
   * 显示冷冻遮罩
   * @param {Object} options
   * @param {number} options.targetR - 目标格子行号（0-based）
   * @param {number} options.targetC - 目标格子列号（0-based）
   * @param {string} options.targetType - 'cell' 单格 / 'cage' 笼子 / 'row' 行 / 'box' 宫 / 'full' 全屏无高亮
   * @param {string} options.text - 引导文字
   * @param {string} options.highlightShape - 'circle' 圆形 / 'rect' 方形
   * @param {Object} options.canvas - canvas 元素引用
   * @param {number} options.cellSize - 格子尺寸
   * @param {number} options.padding - canvas 内边距
   * @param {Array}  options.targetCells - 目标格子数组（cage/box 时用）[[r,c], ...]
   * @param {Function} options.onClose - 关闭回调
   */
  show(options) {
    const {
      targetR = 0, targetC = 0,
      targetType = 'cell',
      text = '',
      highlightShape = 'circle',
      canvas = null,
      cellSize = 60,
      padding = 12,
      targetCells = null,
      onClose = null
    } = options;

    this.onCloseCallback = onClose;
    this.textEl.textContent = text;

    // 取消待处理的关闭timer，防止竞态
    if (this._closeTimer) {
      clearTimeout(this._closeTimer);
      this._closeTimer = null;
    }

    // 恢复pointer-events
    this.el.style.pointerEvents = '';

    // 计算高亮位置和大小
    this._positionSpotlight({
      targetR, targetC, targetType,
      highlightShape, canvas, cellSize, padding, targetCells
    });

    this.el.style.display = 'block';
    // 触发重排后加 active 类以启动动画
    requestAnimationFrame(() => {
      this.el.classList.add('active');
    });
  }

  /**
   * 定位高亮挖空区域
   */
  _positionSpotlight({ targetR, targetC, targetType, highlightShape, canvas, cellSize, padding, targetCells }) {
    if (!canvas) {
      this.spotlightEl.style.display = 'none';
      return;
    }

    const rect = canvas.getBoundingClientRect();
    // cellSize 和 padding 已经是 CSS 像素，getBoundingClientRect 也返回 CSS 像素，无需额外缩放
    // 通过 canvas 实际宽高推算盘面大小（支持4x4/6x6/9x9）
    const boardSize = (rect.width - padding * 2) / cellSize;

    let left, top, width, height;

    if (targetType === 'cell') {
      // 单个格子
      const cellX = padding + targetC * cellSize;
      const cellY = padding + targetR * cellSize;
      const w = cellSize;
      const h = cellSize;

      left = rect.left + cellX + w / 2;
      top = rect.top + cellY + h / 2;
      width = w * 0.9;
      height = h * 0.9;

    } else if (targetType === 'cage' && targetCells && targetCells.length > 0) {
      // 笼子：计算包围盒
      let minR = 9, minC = 9, maxR = -1, maxC = -1;
      for (const [r, c] of targetCells) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
      const cellX = padding + minC * cellSize;
      const cellY = padding + minR * cellSize;
      const w = (maxC - minC + 1) * cellSize;
      const h = (maxR - minR + 1) * cellSize;

      left = rect.left + cellX + w / 2;
      top = rect.top + cellY + h / 2;
      width = w + 8;
      height = h + 8;

    } else if (targetType === 'row') {
      // 整行
      const rowW = boardSize * cellSize;
      const rowH = cellSize;
      left = rect.left + padding + rowW / 2;
      top = rect.top + padding + targetR * cellSize + rowH / 2;
      width = rowW;
      height = rowH + 4;

    } else if (targetType === 'box') {
      // 某个宫 - 动态计算宫大小
      const size = Math.round(boardSize);
      const boxW = size === 4 ? 2 : size === 6 ? 3 : 3;
      const boxH = size === 4 ? 2 : size === 6 ? 2 : 3;
      const boxR = Math.floor(targetR / boxH) * boxH;
      const boxC = Math.floor(targetC / boxW) * boxW;
      const bw = boxW * cellSize;
      const bh = boxH * cellSize;
      left = rect.left + padding + boxC * cellSize + bw / 2;
      top = rect.top + padding + boxR * cellSize + bh / 2;
      width = bw + 4;
      height = bh + 4;

    } else {
      // 全屏无高亮
      this.spotlightEl.style.display = 'none';
      return;
    }

    this.spotlightEl.style.display = 'block';
    this.spotlightEl.style.left = left + 'px';
    this.spotlightEl.style.top = top + 'px';

    // 设置形状
    if (highlightShape === 'circle') {
      const size = Math.max(width, height) * 0.7;
      this.spotlightEl.style.width = size + 'px';
      this.spotlightEl.style.height = size + 'px';
      this.spotlightEl.style.borderRadius = '50%';
    } else {
      this.spotlightEl.style.width = width + 'px';
      this.spotlightEl.style.height = height + 'px';
      this.spotlightEl.style.borderRadius = '8px';
    }
  }

  /**
   * 关闭冷冻遮罩
   */
  close() {
    // 立即禁用pointer-events，防止淡出期间拦截用户操作
    this.el.style.pointerEvents = 'none';
    this.el.classList.remove('active');

    if (this._closeTimer) {
      clearTimeout(this._closeTimer);
    }
    this._closeTimer = setTimeout(() => {
      this._closeTimer = null;
      this.el.style.display = 'none';
      if (this.onCloseCallback) {
        const cb = this.onCloseCallback;
        this.onCloseCallback = null;
        cb();
      }
    }, 200);
  }

  /**
   * 销毁组件
   */
  destroy() {
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
  }
}

// ==========================================
// PopupHint 组件：气泡提示
// ==========================================
// 一个小气泡，类似 NPC 对话气泡，显示3-5秒后自动淡出消失
// 不打断玩家操作，有小尾巴指向目标位置
class PopupHint {
  constructor() {
    this.el = null;
    this.tailEl = null;
    this.textEl = null;
    this._hideTimer = null;
    this._build();
  }

  /**
   * 构建 DOM
   */
  _build() {
    this.el = document.createElement('div');
    this.el.className = 'guide-popup-hint';
    this.el.style.display = 'none';

    this.tailEl = document.createElement('div');
    this.tailEl.className = 'guide-popup-tail';

    this.textEl = document.createElement('div');
    this.textEl.className = 'guide-popup-text';

    this.el.appendChild(this.tailEl);
    this.el.appendChild(this.textEl);

    document.body.appendChild(this.el);
  }

  /**
   * 显示气泡提示
   * @param {Object} options
   * @param {number} options.targetR - 目标行
   * @param {number} options.targetC - 目标列
   * @param {string} options.text - 提示文字
   * @param {string} options.position - 'top' / 'bottom' / 'left' / 'right'
   * @param {number} options.duration - 显示时长（毫秒），默认 3500
   * @param {Object} options.canvas - canvas 元素
   * @param {number} options.cellSize - 格子尺寸
   * @param {number} options.padding - canvas 内边距
   * @param {Function} options.onClose - 关闭回调
   */
  show(options) {
    const {
      targetR = 0, targetC = 0,
      text = '',
      position = 'top',
      duration = 3500,
      canvas = null,
      cellSize = 60,
      padding = 12,
      onClose = null
    } = options;

    this._onClose = onClose;

    // 先设置文字，让浏览器计算尺寸
    this.textEl.textContent = text;

    // 设置尾巴方向
    this.el.className = 'guide-popup-hint tail-' + position + ' show';

    // 显示出来
    this.el.style.display = 'block';
    this.el.style.opacity = '1';

    // 计算位置
    this._positionBubble({ targetR, targetC, position, canvas, cellSize, padding });

    // 自动淡出
    if (this._hideTimer) clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => {
      this.hide();
    }, duration);
  }

  /**
   * 定位气泡
   */
  _positionBubble({ targetR, targetC, position, canvas, cellSize, padding }) {
    if (!canvas) {
      // 没有 canvas 就居中显示在屏幕上
      this.el.style.left = '50%';
      this.el.style.top = '40%';
      this.el.style.transform = 'translate(-50%, -50%)';
      return;
    }

    const rect = canvas.getBoundingClientRect();
    // cellSize 和 padding 为 CSS 像素，getBoundingClientRect 返回 CSS 像素，无需缩放

    // 目标格子中心坐标（页面坐标）
    const cellCenterX = rect.left + padding + (targetC + 0.5) * cellSize;
    const cellCenterY = rect.top + padding + (targetR + 0.5) * cellSize;

    const bubbleW = this.el.offsetWidth;
    const bubbleH = this.el.offsetHeight;
    const tailOffset = 12; // 尾巴偏移量

    let left, top;

    switch (position) {
      case 'top':
        left = cellCenterX - bubbleW / 2;
        top = cellCenterY - bubbleH - tailOffset;
        // 尾巴水平居中
        this.tailEl.style.left = (bubbleW / 2 - 8) + 'px';
        this.tailEl.style.bottom = '-8px';
        this.tailEl.style.top = 'auto';
        this.tailEl.style.right = 'auto';
        break;
      case 'bottom':
        left = cellCenterX - bubbleW / 2;
        top = cellCenterY + tailOffset;
        this.tailEl.style.left = (bubbleW / 2 - 8) + 'px';
        this.tailEl.style.top = '-8px';
        this.tailEl.style.bottom = 'auto';
        this.tailEl.style.right = 'auto';
        break;
      case 'left':
        left = cellCenterX - bubbleW - tailOffset;
        top = cellCenterY - bubbleH / 2;
        this.tailEl.style.top = (bubbleH / 2 - 8) + 'px';
        this.tailEl.style.right = '-8px';
        this.tailEl.style.bottom = 'auto';
        this.tailEl.style.left = 'auto';
        break;
      case 'right':
        left = cellCenterX + tailOffset;
        top = cellCenterY - bubbleH / 2;
        this.tailEl.style.top = (bubbleH / 2 - 8) + 'px';
        this.tailEl.style.left = '-8px';
        this.tailEl.style.bottom = 'auto';
        this.tailEl.style.right = 'auto';
        break;
    }

    // 边界检测：确保气泡不超出视口
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const margin = 10;

    if (left < margin) left = margin;
    if (left + bubbleW > viewportW - margin) left = viewportW - bubbleW - margin;
    if (top < margin) top = margin;
    if (top + bubbleH > viewportH - margin) top = viewportH - bubbleH - margin;

    this.el.style.left = left + 'px';
    this.el.style.top = top + 'px';
    this.el.style.transform = 'none';
  }

  /**
   * 隐藏气泡
   */
  hide() {
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }
    this.el.style.opacity = '0';
    this.el.classList.remove('show');
    setTimeout(() => {
      this.el.style.display = 'none';
      if (this._onClose) {
        const cb = this._onClose;
        this._onClose = null;
        cb();
      }
    }, 300);
  }

  /**
   * 销毁
   */
  destroy() {
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
    }
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
  }
}

// ==========================================
// GuideManager：引导管理器
// ==========================================
class GuideManager {
  /**
   * @param {Object} options
   * @param {Array}  options.triggers - 触发器配置数组
   * @param {number} options.levelId - 关卡 ID
   * @param {Object} options.board - 游戏棋盘对象（Board 实例）
   * @param {Object} options.renderer - 渲染器（Renderer 实例）
   * @param {Object} options.canvas - canvas DOM 元素
   */
  constructor(options = {}) {
    this.triggers = this._normalizeTriggers(options.triggers || []);
    this.levelId = options.levelId || 0;
    this.board = options.board || null;
    this.renderer = options.renderer || null;
    this.canvas = options.canvas || null;

    // 已触发的触发器 ID 集合（用于 once: true 的去重）
    this._triggeredIds = new Set();

    // 运行时状态
    this._numberFillCount = 0; // 已填数字计数
    this._stuckTimer = 0;      // 卡壳计时器（秒）
    this._isActive = true;     // 引导系统是否激活

    // UI 组件实例（懒创建）
    this._freezeMask = null;
    this._popupHint = null;

    // 当前正在显示的遮罩（同一时间只显示一个）
    this._currentFreeze = null;

    // 从本地存储加载已触发记录
    this._loadTriggeredRecords();
  }

  // ---------- 触发器配置标准化 ----------

  /**
   * 标准化触发器配置，兼容多种格式
   * 支持格式1: { condition: "onLevelStart", type: "freeze_mask", targetCell: [r,c], text: "..." }
   * 支持格式2: { condition: { type: "onLevelStart" }, type: "freeze_mask", config: {...} }
   */
  _normalizeTriggers(triggers) {
    return triggers.map((t, idx) => {
      const result = { ...t };
      result.id = result.id || `trigger_${idx}`;

      // 标准化 condition
      if (typeof result.condition === 'string') {
        const condType = result.condition;
        const condObj = { type: condType };
        // 把同级的条件参数移到 condition 里
        if (result.row !== undefined) condObj.row = result.row;
        if (result.cageSize !== undefined) condObj.cageSize = result.cageSize;
        if (result.cageSum !== undefined) condObj.cageSum = result.cageSum;
        if (result.filledCount !== undefined) condObj.filledCount = result.filledCount;
        if (result.count !== undefined) condObj.count = result.count;
        if (result.box !== undefined) condObj.box = result.box;
        if (result.seconds !== undefined) condObj.seconds = result.seconds;
        result.condition = condObj;
      }

      // 标准化 config
      if (!result.config) {
        result.config = {};
      }
      // targetCell -> targetR/targetC
      if (result.targetCell && Array.isArray(result.targetCell)) {
        result.config.targetR = result.targetCell[0];
        result.config.targetC = result.targetCell[1];
        result.config.targetType = 'cell';
      }
      // highlightCage
      if (result.highlightCage) {
        result.config.targetFromEvent = true;
        result.config.targetType = 'cage';
      }
      // text
      if (result.text && !result.config.text) {
        result.config.text = result.text;
      }
      // position
      if (result.position && !result.config.position) {
        result.config.position = result.position;
      }
      // panelType
      if (result.panelType && !result.config.panelType) {
        result.config.panelType = result.panelType;
      }
      // targetIndex
      if (result.targetIndex !== undefined && result.config.targetIndex === undefined) {
        result.config.targetIndex = result.targetIndex;
      }
      // highlightButton
      if (result.highlightButton && !result.config.highlightButton) {
        result.config.highlightButton = result.highlightButton;
      }
      // badgeId
      if (result.badgeId && !result.config.badgeId) {
        result.config.badgeId = result.badgeId;
      }

      return result;
    });
  }

  // ---------- 本地存储 ----------

  /**
   * 存储 key
   */
  _storageKey() {
    return GUIDE_STORAGE_PREFIX + 'triggered_' + this.levelId;
  }

  /**
   * 加载已触发记录
   */
  _loadTriggeredRecords() {
    try {
      const raw = localStorage.getItem(this._storageKey());
      if (raw) {
        const arr = JSON.parse(raw);
        this._triggeredIds = new Set(arr);
      }
    } catch (e) {
      console.warn('GuideManager: 读取引导记录失败', e.message);
    }
  }

  /**
   * 保存已触发记录
   */
  _saveTriggeredRecords() {
    try {
      localStorage.setItem(
        this._storageKey(),
        JSON.stringify(Array.from(this._triggeredIds))
      );
    } catch (e) {
      console.warn('GuideManager: 保存引导记录失败', e.message);
    }
  }

  /**
   * 检查触发器是否已触发过（once: true 的不再触发）
   */
  _hasTriggered(triggerId) {
    return this._triggeredIds.has(triggerId);
  }

  /**
   * 标记触发器为已触发
   */
  _markTriggered(trigger) {
    if (trigger.once && trigger.id) {
      this._triggeredIds.add(trigger.id);
      this._saveTriggeredRecords();
    }
  }

  // ---------- UI 组件懒加载 ----------

  _getFreezeMask() {
    if (!this._freezeMask) {
      this._freezeMask = new FreezeMask();
    }
    return this._freezeMask;
  }

  _getPopupHint() {
    if (!this._popupHint) {
      this._popupHint = new PopupHint();
    }
    return this._popupHint;
  }

  // ---------- 触发器判定核心 ----------

  /**
   * 检查并执行满足条件的触发器
   * @param {string} eventType - 事件类型
   * @param {Object} eventData - 事件数据
   */
  _checkTriggers(eventType, eventData = {}) {
    if (!this._isActive) {
      console.log('🔇 [GuideManager] _isActive=false, 跳过', eventType);
      return;
    }

    for (const trigger of this.triggers) {
      const isOnceSkipped = trigger.once && trigger.id && this._hasTriggered(trigger.id);
      if (isOnceSkipped) continue;

      const matched = this._matchCondition(trigger, eventType, eventData);
      if (matched) {
        this._fireTrigger(trigger, eventData);
        this._markTriggered(trigger);
      }
    }
  }

  /**
   * 判断触发器条件是否匹配
   */
  _matchCondition(trigger, eventType, eventData) {
    const cond = trigger.condition;
    if (!cond) return false;

    let result = false;
    switch (cond.type) {
      case 'onLevelStart':
        result = eventType === 'levelStart';
        break;

      case 'onFirstNumberFilled':
        result = eventType === 'numberFilled' && this._numberFillCount === 1;
        break;

      case 'onCageSelect':
        if (eventType !== 'cageSelect') { result = false; break; }
        result = this._matchCageCondition(cond, eventData.cage);
        break;

      case 'onRowSelect':
        if (eventType !== 'cellSelect') { result = false; break; }
        if (cond.row !== undefined && eventData.r !== cond.row) { result = false; break; }
        result = true;
        break;

      case 'onRowFillProgress':
        if (eventType !== 'numberFilled') { result = false; break; }
        result = this._matchRowFillProgress(cond, eventData);
        break;

      case 'onBoxFillProgress':
        if (eventType !== 'numberFilled') { result = false; break; }
        result = this._matchBoxFillProgress(cond, eventData);
        break;

      case 'onStuckForSeconds':
        if (eventType !== 'stuck') { result = false; break; }
        if (cond.seconds !== undefined && eventData.seconds < cond.seconds) { result = false; break; }
        result = true;
        break;

      case 'onConflict':
        result = eventType === 'conflict';
        break;

      case 'onFillCountReached':
        result = eventType === 'numberFilled' && (cond.count === undefined || this._numberFillCount >= cond.count);
        break;

      case 'onLevelComplete':
        result = eventType === 'levelComplete';
        break;

      // ---------- 最后一格填数相关 ----------
      case 'onBoxLastCellCorrect':
        result = eventType === 'boxLastCellFill' && eventData.isCorrect === true;
        break;

      case 'onBoxLastCellWrong':
        result = eventType === 'boxLastCellFill' && eventData.isCorrect === false;
        break;

      case 'onRowLastCellCorrect':
        result = eventType === 'rowLastCellFill' && eventData.isCorrect === true;
        break;

      case 'onRowLastCellWrong':
        result = eventType === 'rowLastCellFill' && eventData.isCorrect === false;
        break;

      case 'onColLastCellCorrect':
        result = eventType === 'colLastCellFill' && eventData.isCorrect === true;
        break;

      case 'onColLastCellWrong':
        result = eventType === 'colLastCellFill' && eventData.isCorrect === false;
        break;

      default:
        result = false;
    }
    return result;
  }

  /**
   * 笼子选择条件匹配
   */
  _matchCageCondition(cond, cage) {
    if (!cage) return false;

    // 笼子大小过滤
    if (cond.cageSize !== undefined) {
      if (cage.cells.length !== cond.cageSize) return false;
    }

    // 笼子和值过滤
    if (cond.cageSum !== undefined) {
      if (cage.sum !== cond.cageSum) return false;
    }

    // 笼子 ID 过滤
    if (cond.cageId !== undefined) {
      if (cage.id !== cond.cageId) return false;
    }

    return true;
  }

  /**
   * 行填数进度条件匹配
   */
  _matchRowFillProgress(cond, eventData) {
    if (!this.board) return false;

    const row = cond.row !== undefined ? cond.row : eventData.r;
    const targetCount = cond.filledCount || 1;

    // 统计该行已填数字数量
    let count = 0;
    for (let c = 0; c < this.board.size; c++) {
      const cell = this.board.cells[row][c];
      if (cell.fixedNum || cell.fillNum) count++;
    }

    return count === targetCount;
  }

  /**
   * 宫填数进度条件匹配
   */
  _matchBoxFillProgress(cond, eventData) {
    if (!this.board) return false;
    const size = this.board.size;
    // 动态计算宫尺寸：4x4=2x2, 6x6=3x2(每宫3行2列), 9x9=3x3
    const boxRows = size <= 4 ? 2 : 3;
    const boxCols = size <= 6 ? (size === 4 ? 2 : 3) : 3;
    const boxesPerRow = size / boxCols;

    let boxR, boxC;
    if (cond.box !== undefined) {
      boxR = Math.floor(cond.box / boxesPerRow) * boxRows;
      boxC = (cond.box % boxesPerRow) * boxCols;
    } else if (cond.boxRow !== undefined) {
      boxR = cond.boxRow;
      boxC = cond.boxCol || 0;
    } else {
      boxR = Math.floor(eventData.r / boxRows) * boxRows;
      boxC = Math.floor(eventData.c / boxCols) * boxCols;
    }

    const targetCount = cond.filledCount || 1;

    let count = 0;
    for (let r = boxR; r < boxR + boxRows; r++) {
      for (let c = boxC; c < boxC + boxCols; c++) {
        if (r >= size || c >= size) continue;
        const cell = this.board.cells[r][c];
        if (cell.fixedNum || cell.fillNum) count++;
      }
    }

    return count === targetCount;
  }

  // ---------- 触发执行 ----------

  /**
   * 执行触发器：调用对应的 UI 组件
   */
  _fireTrigger(trigger, eventData) {
    const type = trigger.type;
    const config = trigger.config || {};
    const delay = trigger.delay || 0;

    console.log(`🔥 [GuideManager] 触发: ${trigger.id} type=${type} condition=${trigger.condition?.type} delay=${delay}ms`, config);

    const doFire = () => {
      switch (type) {
        case 'freeze_mask':
          this._showFreezeMask(trigger, config, eventData);
          break;

        case 'popup_hint':
          this._showPopupHint(trigger, config, eventData);
          break;

        case 'calc_panel':
          // 预留接口：计算器面板
          this._showCalcPanel(trigger, config, eventData);
          break;

        case 'badge_award':
          // 预留接口：徽章奖励
          this._showBadgeAward(trigger, config, eventData);
          break;

        default:
          console.warn('GuideManager: 未知触发器类型', type);
      }
    };

    if (delay > 0) {
      setTimeout(doFire, delay);
    } else {
      doFire();
    }
  }

  /**
   * 显示冷冻遮罩
   */
  _showFreezeMask(trigger, config, eventData) {
    const mask = this._getFreezeMask();

    // 计算目标信息
    let targetR = config.targetR;
    let targetC = config.targetC;
    let targetType = config.targetType || 'cell';
    let targetCells = null;

    // 如果配置了从事件数据获取目标
    if (config.targetFromEvent) {
      if (eventData.r !== undefined) targetR = eventData.r;
      if (eventData.c !== undefined) targetC = eventData.c;
      if (eventData.cage) {
        targetCells = eventData.cage.cells;
      }
    }

    // 如果是笼子但没有 targetCells，从 board 查找
    if (targetType === 'cage' && !targetCells && this.board) {
      const cell = this.board.cells[targetR]?.[targetC];
      if (cell && cell.cageId !== null) {
        const cage = this.board.cages.find(c => c.id === cell.cageId);
        if (cage) targetCells = cage.cells;
      }
    }

    mask.show({
      targetR,
      targetC,
      targetType,
      targetCells,
      text: config.text || '',
      highlightShape: config.highlightShape || 'circle',
      canvas: this.canvas,
      cellSize: this.renderer ? this.renderer.cellSize : 60,
      padding: this.renderer ? this.renderer.padding : 12,
      onClose: () => {
        this._currentFreeze = null;
        if (config.onCloseAction === 'resumeGame') {
          // 游戏继续（暂停状态由外部控制，这里只触发回调）
        }
        if (trigger.onCloseEvent) {
          // 触发自定义事件（预留扩展）
        }
      }
    });

    this._currentFreeze = trigger.id;
  }

  /**
   * 显示气泡提示
   */
  _showPopupHint(trigger, config, eventData) {
    const popup = this._getPopupHint();

    let targetR = config.targetR;
    let targetC = config.targetC;

    // 从事件数据获取目标
    if (config.targetFromEvent) {
      if (eventData.r !== undefined) targetR = eventData.r;
      if (eventData.c !== undefined) targetC = eventData.c;
    }

    popup.show({
      targetR,
      targetC,
      text: config.text || '',
      position: config.position || 'top',
      duration: config.duration || 3500,
      canvas: this.canvas,
      cellSize: this.renderer ? this.renderer.cellSize : 60,
      padding: this.renderer ? this.renderer.padding : 12
    });
  }

  /**
   * 预留接口：计算器面板
   */
  _showCalcPanel(trigger, config, eventData) {
    // TODO: 后续实现计算器面板
    console.log('[GuideManager] calc_panel 触发器触发（待实现）', trigger.id, config);
  }

  /**
   * 预留接口：徽章奖励
   */
  _showBadgeAward(trigger, config, eventData) {
    // TODO: 后续实现徽章奖励
    console.log('[GuideManager] badge_award 触发器触发（待实现）', trigger.id, config);
  }

  // ---------- 外部 API ----------

  /**
   * 关卡开始时调用
   */
  onLevelStart() {
    this._numberFillCount = 0;
    this._stuckTimer = 0;
    this._checkTriggers('levelStart');
  }

  /**
   * 玩家填数时调用
   * @param {number} r - 行
   * @param {number} c - 列
   * @param {number} num - 填入的数字
   */
  onNumberFilled(r, c, num) {
    this._numberFillCount++;
    this._stuckTimer = 0;
    console.log(`[GuideManager] onNumberFilled ${r},${c}=${num}  (第${this._numberFillCount}次填数)`);
    this._checkTriggers('numberFilled', { r, c, num });
  }

  /**
   * 玩家选中格子时调用
   * @param {number} r - 行
   * @param {number} c - 列
   */
  onCellSelect(r, c) {
    console.log(`[GuideManager] onCellSelect ${r},${c}`);
    this._checkTriggers('cellSelect', { r, c });
  }

  /**
   * 玩家选中笼子时调用
   * @param {Object} cage - 笼子对象 { id, sum, cells: [[r,c]] }
   */
  onCageSelect(cage) {
    this._checkTriggers('cageSelect', { cage });
  }

  /**
   * 关卡通关时调用
   */
  onLevelComplete() {
    this._isActive = false;
    this._checkTriggers('levelComplete');
  }

  /**
   * 玩家出现冲突时调用（填错数字）
   */
  onConflict() {
    this._stuckTimer = 0;
    console.log('⚠️ [GuideManager] onConflict 触发');
    this._checkTriggers('conflict');
  }

  /**
   * 宫格只剩最后一格时填数调用
   * @param {number} r - 行
   * @param {number} c - 列
   * @param {number} num - 填入的数字
   * @param {boolean} isCorrect - 是否填对
   */
  onBoxLastCellFill(r, c, num, isCorrect) {
    console.log(`📦 [GuideManager] onBoxLastCellFill ${r},${c}=${num} correct=${isCorrect}`);
    this._checkTriggers('boxLastCellFill', { r, c, num, isCorrect });
  }

  /**
   * 行只剩最后一格时填数调用
   * @param {number} r - 行
   * @param {number} c - 列
   * @param {number} num - 填入的数字
   * @param {boolean} isCorrect - 是否填对
   */
  onRowLastCellFill(r, c, num, isCorrect) {
    console.log(`➡️ [GuideManager] onRowLastCellFill ${r},${c}=${num} correct=${isCorrect}`);
    this._checkTriggers('rowLastCellFill', { r, c, num, isCorrect });
  }

  /**
   * 列只剩最后一格时填数调用
   * @param {number} r - 行
   * @param {number} c - 列
   * @param {number} num - 填入的数字
   * @param {boolean} isCorrect - 是否填对
   */
  onColLastCellFill(r, c, num, isCorrect) {
    console.log(`⬇️ [GuideManager] onColLastCellFill ${r},${c}=${num} correct=${isCorrect}`);
    this._checkTriggers('colLastCellFill', { r, c, num, isCorrect });
  }

  /**
   * 每帧/每秒更新（用于卡壳计时等）
   * @param {number} deltaTime - 经过的时间（秒）
   */
  update(deltaTime) {
    if (!this._isActive) return;

    this._stuckTimer += deltaTime;

    // 检查卡壳触发器
    for (const trigger of this.triggers) {
      if (!trigger.condition || trigger.condition.type !== 'onStuckForSeconds') continue;
      if (trigger.once && trigger.id && this._hasTriggered(trigger.id)) continue;

      const seconds = trigger.condition.seconds || 30;
      if (this._stuckTimer >= seconds) {
        this._fireTrigger(trigger, { seconds: this._stuckTimer });
        this._markTriggered(trigger);
      }
    }
  }

  /**
   * 重置所有引导状态（不清除本地存储的 once 记录）
   */
  reset() {
    this._numberFillCount = 0;
    this._stuckTimer = 0;
    this._isActive = true;
    this._currentFreeze = null;

    // 关闭正在显示的 UI
    if (this._freezeMask) {
      this._freezeMask.close();
    }
    if (this._popupHint) {
      this._popupHint.hide();
    }
  }

  /**
   * 清除当前关卡的所有引导记录（用于调试或重玩教学）
   */
  clearAllRecords() {
    this._triggeredIds.clear();
    try {
      localStorage.removeItem(this._storageKey());
    } catch (e) {}
  }

  /**
   * 手动触发某个触发器（用于调试）
   * @param {string} triggerId
   */
  triggerById(triggerId) {
    const trigger = this.triggers.find(t => t.id === triggerId);
    if (trigger) {
      this._fireTrigger(trigger, {});
    }
  }

  /**
   * 关闭所有引导 UI
   */
  closeAll() {
    if (this._freezeMask) {
      this._freezeMask.close();
    }
    if (this._popupHint) {
      this._popupHint.hide();
    }
    this._currentFreeze = null;
  }

  /**
   * 销毁 GuideManager，清理 DOM 和事件
   */
  destroy() {
    this.closeAll();
    if (this._freezeMask) {
      this._freezeMask.destroy();
      this._freezeMask = null;
    }
    if (this._popupHint) {
      this._popupHint.destroy();
      this._popupHint = null;
    }
    this.triggers = [];
    this.board = null;
    this.renderer = null;
    this.canvas = null;
  }
}

// 导出到全局
window.GuideManager = GuideManager;
window.FreezeMask = FreezeMask;
window.PopupHint = PopupHint;
