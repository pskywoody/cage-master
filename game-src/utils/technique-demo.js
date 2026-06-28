// ==========================================
// TechniqueDemo - 高级技巧可视化教学系统
// ==========================================
// 功能：
//   1. 在游戏Canvas上叠加一层透明Canvas用于绘制教学标注
//   2. 支持高亮多个格子（不同颜色：关键格/排除格/辅助格）
//   3. 支持画连线/箭头/标记（❌🔒✨等）
//   4. 支持分步演示：上一步/下一步/跳过
//   5. 支持自动候选数显示（只显示教学相关的候选数）
// ==========================================

class TechniqueDemo {
  constructor(options = {}) {
    this.gameCanvas = options.canvas || null;
    this.renderer = options.renderer || null;
    this.board = options.board || null;
    this.steps = options.steps || [];
    this.currentStep = 0;
    this.isActive = false;
    this.overlayCanvas = null;
    this.overlayCtx = null;
    this._animFrame = null;
    this._build();
  }

  /**
   * 构建叠加Canvas
   */
  _build() {
    if (!this.gameCanvas) return;

    // 创建与游戏Canvas同尺寸同位置的叠加层
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.style.position = 'absolute';
    this.overlayCanvas.style.top = '0';
    this.overlayCanvas.style.left = '0';
    this.overlayCanvas.style.pointerEvents = 'none'; // 不阻挡游戏操作
    this.overlayCanvas.style.zIndex = '10';
    this.overlayCanvas.style.borderRadius = 'inherit';

    // 确保gameCanvas的父容器是relative定位
    const parent = this.gameCanvas.parentElement;
    if (parent) {
      const pos = window.getComputedStyle(parent).position;
      if (pos === 'static') {
        parent.style.position = 'relative';
      }
      parent.appendChild(this.overlayCanvas);
    }

    this.overlayCtx = this.overlayCanvas.getContext('2d');
    this._resize();

    // 监听窗口大小变化
    this._resizeObserver = new ResizeObserver(() => this._resize());
    if (parent) this._resizeObserver.observe(parent);
  }

  /**
   * 同步叠加层尺寸与游戏Canvas
   */
  _resize() {
    if (!this.overlayCanvas || !this.gameCanvas) return;
    const rect = this.gameCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.overlayCanvas.width = rect.width * dpr;
    this.overlayCanvas.height = rect.height * dpr;
    this.overlayCanvas.style.width = rect.width + 'px';
    this.overlayCanvas.style.height = rect.height + 'px';
    this.overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.isActive) this._draw();
  }

  /**
   * 获取格子绘制参数
   */
  _getCellParams() {
    if (!this.renderer) return { cellSize: 60, padding: 12 };
    return {
      cellSize: this.renderer.cellSize,
      padding: this.renderer.padding
    };
  }

  /**
   * 开始演示
   * @param {Array} steps - 演示步骤数组
   */
  start(steps) {
    if (steps) this.steps = steps;
    this.currentStep = 0;
    this.isActive = true;
    this._showStepPanel();
    this._draw();
  }

  /**
   * 停止演示
   */
  stop() {
    this.isActive = false;
    this._hideStepPanel();
    this._clear();
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
  }

  /**
   * 下一步
   */
  next() {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      this._draw();
      this._updateStepPanel();
    } else {
      this.stop();
    }
  }

  /**
   * 上一步
   */
  prev() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this._draw();
      this._updateStepPanel();
    }
  }

  /**
   * 跳到最后一步并结束
   */
  skip() {
    this.stop();
  }

  /**
   * 清空叠加层
   */
  _clear() {
    if (!this.overlayCtx) return;
    const rect = this.gameCanvas.getBoundingClientRect();
    this.overlayCtx.clearRect(0, 0, rect.width, rect.height);
  }

  /**
   * 绘制当前步骤
   */
  _draw() {
    this._clear();
    if (!this.isActive || !this.steps[this.currentStep]) return;
    const step = this.steps[this.currentStep];
    const { cellSize, padding } = this._getCellParams();
    const ctx = this.overlayCtx;
    const rect = this.gameCanvas.getBoundingClientRect();

    ctx.save();

    // 1. 先画半透明遮罩（让非重点区域变暗）
    if (step.dimOther !== false) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, rect.width, rect.height);
    }

    // 2. 绘制高亮格子
    if (step.highlights) {
      for (const hl of step.highlights) {
        this._drawHighlight(hl, cellSize, padding);
      }
    }

    // 3. 绘制标记（X锁等）
    if (step.marks) {
      for (const mark of step.marks) {
        this._drawMark(mark, cellSize, padding);
      }
    }

    // 4. 绘制连线/箭头
    if (step.lines) {
      for (const line of step.lines) {
        this._drawLine(line, cellSize, padding);
      }
    }

    // 5. 绘制候选数提示
    if (step.candidates) {
      for (const cand of step.candidates) {
        this._drawCandidate(cand, cellSize, padding);
      }
    }

    // 6. 绘制排除效果（红色X+划掉）
    if (step.eliminations) {
      for (const elim of step.eliminations) {
        this._drawElimination(elim, cellSize, padding);
      }
    }

    ctx.restore();
  }

  /**
   * 绘制单个高亮区域
   * @param {Object} hl - {cells:[[r,c]], color:'#ff0', type:'key'|'elim'|'aux', label?:string}
   */
  _drawHighlight(hl, cellSize, padding) {
    const ctx = this.overlayCtx;
    const color = hl.color || this._typeColor(hl.type);
    const alpha = hl.alpha || (hl.type === 'key' ? 0.5 : hl.type === 'elim' ? 0.35 : 0.25);

    for (const [r, c] of hl.cells) {
      const x = padding + c * cellSize;
      const y = padding + r * cellSize;

      // 清除该格子区域的遮罩
      ctx.clearRect(x, y, cellSize, cellSize);

      // 画高亮背景
      ctx.fillStyle = this._hexToRgba(color, alpha);
      ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);

      // 画边框
      ctx.strokeStyle = color;
      ctx.lineWidth = hl.type === 'key' ? 3 : 2;
      ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);

      // 如果有角标标签
      if (hl.label) {
        ctx.fillStyle = color;
        ctx.font = `bold ${Math.floor(cellSize * 0.2)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hl.label, x + cellSize - 12, y + 12);
      }
    }

    // 如果整行/整列/整宫高亮
    if (hl.rows) {
      for (const r of hl.rows) {
        const x = padding;
        const y = padding + r * cellSize;
        ctx.clearRect(x, y, cellSize * 9, cellSize);
        ctx.fillStyle = this._hexToRgba(color, alpha * 0.6);
        ctx.fillRect(x, y, cellSize * 9, cellSize);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, cellSize * 9, cellSize);
      }
    }
    if (hl.cols) {
      for (const c of hl.cols) {
        const x = padding + c * cellSize;
        const y = padding;
        ctx.clearRect(x, y, cellSize, cellSize * 9);
        ctx.fillStyle = this._hexToRgba(color, alpha * 0.6);
        ctx.fillRect(x, y, cellSize, cellSize * 9);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, cellSize, cellSize * 9);
      }
    }
  }

  /**
   * 绘制标记
   * @param {Object} mark - {r,c, type:'lock'|'star'|'arrow', text?:string}
   */
  _drawMark(mark, cellSize, padding) {
    const ctx = this.overlayCtx;
    const x = padding + mark.c * cellSize + cellSize / 2;
    const y = padding + mark.r * cellSize + cellSize / 2;
    const size = cellSize * 0.3;

    ctx.font = `${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const symbols = {
      lock: '🔒',
      star: '⭐',
      key: '🔑',
      eye: '👁️',
      arrow_down: '⬇️',
      arrow_right: '➡️'
    };
    const sym = symbols[mark.type] || mark.text || '?';
    ctx.fillText(sym, x, y);
  }

  /**
   * 绘制连线/箭头
   */
  _drawLine(line, cellSize, padding) {
    const ctx = this.overlayCtx;
    const [r1, c1] = line.from;
    const [r2, c2] = line.to;
    const x1 = padding + c1 * cellSize + cellSize / 2;
    const y1 = padding + r1 * cellSize + cellSize / 2;
    const x2 = padding + c2 * cellSize + cellSize / 2;
    const y2 = padding + r2 * cellSize + cellSize / 2;

    ctx.strokeStyle = line.color || '#fbbf24';
    ctx.lineWidth = line.width || 3;
    ctx.setLineDash(line.dashed ? [6, 4] : []);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 画箭头
    if (line.arrow !== false) {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = cellSize * 0.2;
      ctx.fillStyle = line.color || '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
      ctx.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
    }
  }

  /**
   * 绘制候选数提示
   */
  _drawCandidate(cand, cellSize, padding) {
    const ctx = this.overlayCtx;
    const [r, c] = cand.cell;
    const nums = cand.nums; // [1,2,...] 要显示的候选数
    const color = cand.color || '#fbbf24';
    const x = padding + c * cellSize;
    const y = padding + r * cellSize;
    const cs = cellSize / 3;

    ctx.font = `${Math.floor(cs * 0.7)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;

    for (let i = 1; i <= 9; i++) {
      const dr = Math.floor((i - 1) / 3);
      const dc = (i - 1) % 3;
      const cx = x + dc * cs + cs / 2;
      const cy = y + dr * cs + cs / 2;
      if (nums.includes(i)) {
        ctx.fillText(String(i), cx, cy);
      }
    }
  }

  /**
   * 绘制排除效果（红色X覆盖）
   */
  _drawElimination(elim, cellSize, padding) {
    const ctx = this.overlayCtx;
    const { cells, nums, reason } = elim;
    const color = '#ef4444';

    for (const [r, c] of cells) {
      const x = padding + c * cellSize;
      const y = padding + r * cellSize;

      // 红色半透明覆盖
      ctx.fillStyle = 'rgba(239,68,68,0.15)';
      ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);

      // 红X
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      const m = cellSize * 0.25;
      ctx.beginPath();
      ctx.moveTo(x + m, y + m);
      ctx.lineTo(x + cellSize - m, y + cellSize - m);
      ctx.moveTo(x + cellSize - m, y + m);
      ctx.lineTo(x + m, y + cellSize - m);
      ctx.stroke();

      // 如果指定了排除哪些数字，在格子上画被划掉的数字
      if (nums && nums.length > 0) {
        const cs = cellSize / 3;
        ctx.font = `${Math.floor(cs * 0.6)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        for (const n of nums) {
          const dr = Math.floor((n - 1) / 3);
          const dc = (n - 1) % 3;
          const cx = x + dc * cs + cs / 2;
          const cy = y + dr * cs + cs / 2;
          ctx.fillText(String(n), cx, cy);
          // 划线
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(cx - cs * 0.25, cy);
          ctx.lineTo(cx + cs * 0.25, cy);
          ctx.stroke();
        }
      }
    }
  }

  /**
   * 根据类型返回默认颜色
   */
  _typeColor(type) {
    const colors = {
      key: '#22c55e',     // 绿色 - 关键格
      pair: '#f59e0b',    // 橙色 - 数对格
      elim: '#ef4444',    // 红色 - 排除格
      aux: '#3b82f6',     // 蓝色 - 辅助格
      area: '#8b5cf6',    // 紫色 - 区域
      result: '#06b6d4'   // 青色 - 结果
    };
    return colors[type] || '#fbbf24';
  }

  _hexToRgba(hex, alpha) {
    let r = 255, g = 187, b = 0;
    if (hex.startsWith('#')) {
      const h = hex.slice(1);
      if (h.length === 6) {
        r = parseInt(h.slice(0, 2), 16);
        g = parseInt(h.slice(2, 4), 16);
        b = parseInt(h.slice(4, 6), 16);
      }
    }
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // ========== 步骤面板 UI ==========

  _showStepPanel() {
    if (this._panel) return;
    const panel = document.createElement('div');
    panel.className = 'tech-demo-panel';
    panel.innerHTML = `
      <div class="tech-demo-header">
        <span class="tech-demo-step-indicator" id="td-step-ind">1/1</span>
        <span class="tech-demo-title" id="td-title">技巧演示</span>
      </div>
      <div class="tech-demo-text" id="td-text"></div>
      <div class="tech-demo-controls">
        <button class="td-btn td-prev" id="td-prev">◀ 上一步</button>
        <button class="td-btn td-next" id="td-next">下一步 ▶</button>
        <button class="td-btn td-skip" id="td-skip">我知道了</button>
      </div>
    `;
    document.body.appendChild(panel);
    this._panel = panel;

    // 添加样式
    if (!document.getElementById('tech-demo-style')) {
      const style = document.createElement('style');
      style.id = 'tech-demo-style';
      style.textContent = `
        .tech-demo-panel {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #1e293b, #0f172a);
          color: #f1f5f9;
          border-radius: 16px;
          padding: 16px 20px;
          min-width: 320px;
          max-width: 500px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 2px rgba(168,85,247,0.3);
          z-index: 200;
          font-family: system-ui, sans-serif;
          animation: tdSlideUp 0.3s ease-out;
        }
        @keyframes tdSlideUp {
          from { transform: translateX(-50%) translateY(100px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
        .tech-demo-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }
        .tech-demo-step-indicator {
          background: #a855f7;
          color: white;
          padding: 2px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 700;
        }
        .tech-demo-title {
          font-size: 15px;
          font-weight: 700;
          color: #e9d5ff;
        }
        .tech-demo-text {
          font-size: 14px;
          line-height: 1.7;
          color: #cbd5e1;
          margin-bottom: 12px;
          padding: 8px 12px;
          background: rgba(255,255,255,0.05);
          border-radius: 8px;
          border-left: 3px solid #a855f7;
        }
        .tech-demo-controls {
          display: flex;
          gap: 8px;
          justify-content: center;
        }
        .td-btn {
          padding: 8px 14px;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .td-btn:active { transform: scale(0.95); }
        .td-prev {
          background: #334155;
          color: #cbd5e1;
        }
        .td-prev:hover { background: #475569; }
        .td-prev:disabled { opacity: 0.4; cursor: default; }
        .td-next {
          background: linear-gradient(135deg, #a855f7, #7c3aed);
          color: white;
        }
        .td-next:hover { background: linear-gradient(135deg, #c084fc, #a855f7); }
        .td-skip {
          background: transparent;
          color: #94a3b8;
          border: 1px solid #475569;
        }
        .td-skip:hover { background: rgba(255,255,255,0.05); }
      `;
      document.head.appendChild(style);
    }

    panel.querySelector('#td-prev').addEventListener('click', () => this.prev());
    panel.querySelector('#td-next').addEventListener('click', () => this.next());
    panel.querySelector('#td-skip').addEventListener('click', () => this.skip());

    this._updateStepPanel();
  }

  _updateStepPanel() {
    if (!this._panel) return;
    const step = this.steps[this.currentStep];
    if (!step) return;
    this._panel.querySelector('#td-step-ind').textContent = `${this.currentStep + 1}/${this.steps.length}`;
    this._panel.querySelector('#td-title').textContent = step.title || '技巧演示';
    this._panel.querySelector('#td-text').innerHTML = step.text || '';
    this._panel.querySelector('#td-prev').disabled = this.currentStep === 0;
    const nextBtn = this._panel.querySelector('#td-next');
    if (this.currentStep === this.steps.length - 1) {
      nextBtn.textContent = '✓ 开始练习';
    } else {
      nextBtn.textContent = '下一步 ▶';
    }
  }

  _hideStepPanel() {
    if (this._panel && this._panel.parentNode) {
      this._panel.parentNode.removeChild(this._panel);
    }
    this._panel = null;
  }

  /**
   * 销毁
   */
  destroy() {
    this.stop();
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this.overlayCanvas && this.overlayCanvas.parentNode) {
      this.overlayCanvas.parentNode.removeChild(this.overlayCanvas);
    }
    this.overlayCanvas = null;
    this.gameCanvas = null;
  }
}

// 导出到全局
window.TechniqueDemo = TechniqueDemo;
