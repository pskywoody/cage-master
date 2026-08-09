// ==========================================
// EffectRenderer - Canvas 2D 特效渲染层
// ==========================================
// 功能：
//   - 粒子系统（生成、更新、渲染）
//   - 辉光效果（径向渐变）
//   - 热力图叠加（颜色渐变）
//   - X-Wing 视觉效果（矩形连线、闪烁虚线、多米诺排除标记、弹幕飘过）
//   - Swordfish 视觉效果（鱼骨高亮、非相关格变暗、发光线条）
//   - 嵌套笼颜色蒙层
// ==========================================

export class EffectRenderer {
  /**
   * @param {Object} options
   * @param {HTMLCanvasElement} [options.canvas] - 特效层 canvas 元素
   * @param {PerformanceMonitor} [options.performanceMonitor] - 性能监控实例
   */
  constructor(options) {
    options = options || {};

    /** @type {HTMLCanvasElement|null} */
    this._canvas = options.canvas || null;

    /** @type {CanvasRenderingContext2D|null} */
    this._ctx = this._canvas ? this._canvas.getContext('2d') : null;

    /** @type {PerformanceMonitor|null} */
    this._pm = options.performanceMonitor || null;

    /** @type {number} 画布 CSS 像素宽度 */
    this._width = 0;

    /** @type {number} 画布 CSS 像素高度 */
    this._height = 0;

    /** @type {number} 棋盘格数（默认 9） */
    this._gridSize = 9;

    /** @type {number} 每格 CSS 像素大小 */
    this._cellSize = 0;
    // 棋盘外缘留白（与 board-renderer 行列标对齐，2026-08-03）
    this._padL = 0;
    this._padT = 0;

    // ---- 粒子系统 ----
    /** @type {Array<{x:number,y:number,vx:number,vy:number,life:number,maxLife:number,color:string,size:number,alpha:number}>} */
    this._particles = [];

    // ---- 笼子颜色缓存 ----
    /** @type {Map<string,string>} cageId -> HSL color string */
    this._cageColorCache = new Map();

    // ---- 动画帧计数器 ----
    /** @type {number} */
    this._frame = 0;

    // ---- X-Wing 弹幕（浮动文字） ----
    /** @type {Array<{text:string,x:number,y:number,speed:number,alpha:number,life:number}>} */
    this._floatingTexts = [];

    // ---- 上次更新参考时间 ----
    this._lastTime = 0;
  }

  // ================================================================
  //  内部辅助方法
  // ================================================================

  /**
   * 获取当前质量配置
   * @returns {Object}
   * @private
   */
  _getQuality() {
    if (this._pm && typeof this._pm.getQuality === 'function') {
      return this._pm.getQuality();
    }
    return {
      particles: true,
      glow: true,
      heatmap: true,
      maxParticles: 200,
      cageOverlayOpacity: 0.35,
    };
  }

  /**
   * 获取渲染缩放比例
   * @returns {number}
   * @private
   */
  _getRenderScale() {
    if (this._pm && typeof this._pm.getRenderScale === 'function') {
      return this._pm.getRenderScale();
    }
    return (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  }

  /**
   * 从状态对象中提取棋盘信息并更新内部属性
   * @param {Object} state
   * @private
   */
  _syncGridState(state) {
    if (!state) return;
    if (state.size) this._gridSize = state.size;
    else if (state.gridSize) this._gridSize = state.gridSize;

    if (state.cellSize) {
      this._cellSize = state.cellSize;
    } else {
      this._cellSize = Math.min(this._width, this._height) / this._gridSize;
    }
  }

  /**
   * 根据 cage.id 生成稳定的 HSL 颜色
   * @param {string|number} cageId
   * @returns {string} hsla(...)
   * @private
   */
  _getCageColor(cageId) {
    const key = String(cageId);
    if (this._cageColorCache.has(key)) {
      return this._cageColorCache.get(key);
    }

    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash) + key.charCodeAt(i);
      hash = hash & hash;
    }
    hash = Math.abs(hash);

    const hue = (hash % 340 + 20) % 360;
    const sat = 60 + (hash % 21);
    const light = 50 + (hash % 21);

    const color = 'hsla(' + hue + ', ' + sat + '%, ' + light + '%, ';
    this._cageColorCache.set(key, color);
    return color;
  }

  /**
   * 将数值 0-1 映射为热力图颜色（蓝 -> 绿 -> 红）
   * @param {number} t 0-1
   * @returns {string} rgba(...)
   * @private
   */
  _heatmapColor(t) {
    const v = Math.max(0, Math.min(1, t));

    let r, g, b;
    if (v < 0.5) {
      const p = v / 0.5;
      r = Math.round(0 + p * 0);
      g = Math.round(0 + p * 255);
      b = Math.round(255 - p * 255);
    } else {
      const p = (v - 0.5) / 0.5;
      r = Math.round(0 + p * 255);
      g = Math.round(255 - p * 255);
      b = Math.round(0 + p * 0);
    }

    return 'rgba(' + r + ', ' + g + ', ' + b + ', 0.4)';
  }

  // ================================================================
  //  粒子系统
  // ================================================================

  /**
   * 在指定格子位置生成粒子
   * @param {number} cellX - 格子列索引（0-based）
   * @param {number} cellY - 格子行索引（0-based）
   * @param {string} color - CSS 颜色字符串
   * @param {number} count - 粒子数量
   */
  spawnParticles(cellX, cellY, color, count) {
    try {
      const quality = this._getQuality();
      if (!quality.particles || quality.maxParticles <= 0) return;

      const cx = cellX * this._cellSize + this._cellSize / 2;
      const cy = cellY * this._cellSize + this._cellSize / 2;

      const remaining = Math.max(0, quality.maxParticles - this._particles.length);
      const spawnCount = Math.min(count, remaining);

      for (let i = 0; i < spawnCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 20 + Math.random() * 60;
        const life = 0.5 + Math.random() * 1.0;

        this._particles.push({
          x: cx + (Math.random() - 0.5) * this._cellSize * 0.3,
          y: cy + (Math.random() - 0.5) * this._cellSize * 0.3,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: life,
          maxLife: life,
          color: color,
          size: 2 + Math.random() * 4,
          alpha: 1.0,
        });
      }
    } catch (e) {
      console.error('[EffectRenderer] spawnParticles error:', e);
    }
  }

  /**
   * V4.3.23（Spec v1.2）：得分飘字——格子正上方上飘 0.8s 淡出
   * @param {number} col - 列（棋盘格坐标）
   * @param {number} row - 行（棋盘格坐标）
   * @param {string} text - 飘字内容（如 "+3 暴击!"）
   * @param {string} color - 飘字颜色
   */
  spawnFloatingText(col, row, text, color) {
    try {
      if (!text) return;
      this._floatingTexts.push({
        text: text,
        x: (col + 0.5) * this._cellSize,
        y: row * this._cellSize - 2,
        speed: 46,
        alpha: 1.0,
        life: 0.8,
        color: color || '#93c5fd',
      });
    } catch (e) {
      console.error('[EffectRenderer] spawnFloatingText error:', e);
    }
  }

  /**
   * 更新所有粒子位置和透明度
   * @param {number} deltaTime - 帧间隔时间（秒）
   */
  updateParticles(deltaTime) {
    try {
      const quality = this._getQuality();
      if (!quality.particles || this._particles.length === 0) return;

      const dt = Math.min(deltaTime, 0.05);

      for (let i = this._particles.length - 1; i >= 0; i--) {
        const p = this._particles[i];

        p.life -= dt;
        if (p.life <= 0) {
          this._particles.splice(i, 1);
          continue;
        }

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        p.vx *= 0.98;
        p.vy *= 0.98;

        p.alpha = Math.max(0, p.life / p.maxLife);
      }
    } catch (e) {
      console.error('[EffectRenderer] updateParticles error:', e);
    }
  }

  /**
   * 绘制所有粒子
   */
  renderParticles() {
    try {
      const quality = this._getQuality();
      if (!quality.particles || this._particles.length === 0) return;

      const ctx = this._ctx;
      if (!ctx) return;

      const scale = this._getRenderScale();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      for (let i = 0; i < this._particles.length; i++) {
        const p = this._particles[i];

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } catch (e) {
      console.error('[EffectRenderer] renderParticles error:', e);
    }
  }

  // ================================================================
  //  辉光效果
  // ================================================================

  /**
   * 绘制径向渐变辉光
   * @param {number} x - 中心 x 坐标（像素）
   * @param {number} y - 中心 y 坐标（像素）
   * @param {number} radius - 辉光半径（像素）
   * @param {string} color - CSS 颜色
   * @param {number} intensity - 强度 0-1
   */
  renderGlow(x, y, radius, color, intensity) {
    try {
      const quality = this._getQuality();
      if (!quality.glow) return;

      const ctx = this._ctx;
      if (!ctx) return;

      const scale = this._getRenderScale();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      const r = Math.max(1, radius * intensity);

      let baseR = 255, baseG = 200, baseB = 50;
      if (color) {
        const match = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (match) {
          baseR = parseInt(match[1], 10);
          baseG = parseInt(match[2], 10);
          baseB = parseInt(match[3], 10);
        }
      }

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, 'rgba(' + baseR + ', ' + baseG + ', ' + baseB + ', ' + (0.8 * intensity) + ')');
      gradient.addColorStop(0.4, 'rgba(' + baseR + ', ' + baseG + ', ' + baseB + ', ' + (0.4 * intensity) + ')');
      gradient.addColorStop(1, 'rgba(' + baseR + ', ' + baseG + ', ' + baseB + ', 0)');

      ctx.save();
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } catch (e) {
      console.error('[EffectRenderer] renderGlow error:', e);
    }
  }

  // ================================================================
  //  热力图叠加
  // ================================================================

  /**
   * 根据格子数据绘制热力图
   * @param {Object} gridData - { cells: number[][] } 每个格子数值 0-1
   */
  renderHeatmap(gridData) {
    try {
      const quality = this._getQuality();
      if (!quality.heatmap) return;

      const ctx = this._ctx;
      if (!ctx || !gridData || !gridData.cells) return;

      const scale = this._getRenderScale();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      const cells = gridData.cells;
      const size = Math.min(cells.length, this._gridSize);

      for (let r = 0; r < size; r++) {
        const row = cells[r];
        if (!row) continue;
        for (let c = 0; c < Math.min(row.length, this._gridSize); c++) {
          const value = row[c];
          if (value === null || value === undefined) continue;

          const x = c * this._cellSize;
          const y = r * this._cellSize;

          ctx.fillStyle = this._heatmapColor(value);
          ctx.fillRect(x, y, this._cellSize, this._cellSize);
        }
      }
    } catch (e) {
      console.error('[EffectRenderer] renderHeatmap error:', e);
    }
  }

  // ================================================================
  //  X-Wing 视觉效果
  // ================================================================

  /**
   * 绘制 X-Wing 矩形连线
   * @param {number[]} rows - 两行的行号数组 [r1, r2]
   * @param {number[]} cols - 两列的列号数组 [c1, c2]
   * @param {string} color - CSS 颜色
   */
  renderXWingEffect(rows, cols, color) {
    try {
      const ctx = this._ctx;
      if (!ctx || !rows || !cols || rows.length < 2 || cols.length < 2) return;

      const scale = this._getRenderScale();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      const r1 = rows[0], r2 = rows[1];
      const c1 = cols[0], c2 = cols[1];
      const cs = this._cellSize;

      const x1 = c1 * cs;
      const y1 = r1 * cs;
      const x2 = (c2 + 1) * cs;
      const y2 = (r2 + 1) * cs;
      const rectW = x2 - x1;
      const rectH = y2 - y1;

      // ---- 闪烁的虚线边框 ----
      const phase = (Math.sin(this._frame * 0.1) + 1) / 2;
      const alpha = 0.3 + 0.7 * phase;

      ctx.save();
      ctx.strokeStyle = color || '#ff6b6b';
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = -this._frame * 2;
      ctx.strokeRect(x1, y1, rectW, rectH);
      ctx.restore();

      // ---- 四角标记 ----
      ctx.save();
      ctx.fillStyle = color || '#ff6b6b';
      ctx.globalAlpha = 0.8;
      const dotSize = 4;
      const corners = [
        [x1, y1], [x2, y1],
        [x1, y2], [x2, y2]
      ];
      for (let i = 0; i < corners.length; i++) {
        ctx.beginPath();
        ctx.arc(corners[i][0], corners[i][1], dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ---- 行/列标记 ----
      ctx.save();
      ctx.strokeStyle = color || '#ff6b6b';
      ctx.globalAlpha = 0.3 + 0.3 * phase;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(0, r1 * cs, this._gridSize * cs, cs);
      ctx.strokeRect(0, r2 * cs, this._gridSize * cs, cs);
      ctx.strokeRect(c1 * cs, 0, cs, this._gridSize * cs);
      ctx.strokeRect(c2 * cs, 0, cs, this._gridSize * cs);
      ctx.restore();

      // ---- 多米诺排除标记（红叉） ----
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 50, 50, 0.5)';
      ctx.lineWidth = 2;

      const drawX = function (ctx, gx, gy, size) {
        const pad = size * 0.3;
        ctx.beginPath();
        ctx.moveTo(gx + pad, gy + pad);
        ctx.lineTo(gx + size - pad, gy + size - pad);
        ctx.moveTo(gx + size - pad, gy + pad);
        ctx.lineTo(gx + pad, gy + size - pad);
        ctx.stroke();
      };

      for (let c = 0; c < this._gridSize; c++) {
        if (c === c1 || c === c2) continue;
        drawX(ctx, c * cs, r1 * cs, cs);
      }
      for (let c = 0; c < this._gridSize; c++) {
        if (c === c1 || c === c2) continue;
        drawX(ctx, c * cs, r2 * cs, cs);
      }
      for (let r = 0; r < this._gridSize; r++) {
        if (r === r1 || r === r2) continue;
        drawX(ctx, c1 * cs, r * cs, cs);
      }
      for (let r = 0; r < this._gridSize; r++) {
        if (r === r1 || r === r2) continue;
        drawX(ctx, c2 * cs, r * cs, cs);
      }
      ctx.restore();

      // ---- 口诀弹幕效果 ----
      if (this._floatingTexts.length > 0) {
        ctx.save();
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let i = this._floatingTexts.length - 1; i >= 0; i--) {
          const ft = this._floatingTexts[i];
          ft.life -= 0.016;
          ft.y -= ft.speed * 0.016;
          ft.alpha = Math.max(0, ft.life);

          if (ft.life <= 0) {
            this._floatingTexts.splice(i, 1);
            continue;
          }

          ctx.save();
          ctx.globalAlpha = ft.alpha * 0.8;
          ctx.fillStyle = ft.color || '#ff6b6b'; // V4.3.23：用每条飘字自己的颜色
          ctx.fillText(ft.text, ft.x, ft.y);
          ctx.restore();
        }
        ctx.restore();
      }
    } catch (e) {
      console.error('[EffectRenderer] renderXWingEffect error:', e);
    }
  }

  // ================================================================
  //  Swordfish 视觉效果
  // ================================================================

  /**
   * 绘制 Swordfish 鱼骨高亮
   * @param {number[]} rows - 三行的行号数组 [r1, r2, r3]
   * @param {number[]} cols - 三列的列号数组 [c1, c2, c3]
   * @param {string} color - CSS 颜色
   */
  renderSwordfishEffect(rows, cols, color) {
    try {
      const ctx = this._ctx;
      if (!ctx || !rows || !cols || rows.length < 3 || cols.length < 3) return;

      const scale = this._getRenderScale();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      const cs = this._cellSize;
      const gridPx = this._gridSize * cs;
      const phase = (Math.sin(this._frame * 0.08) + 1) / 2;

      // ---- 降噪滤镜：非相关格子变暗 ----
      const relevantSet = new Set();
      for (let ri = 0; ri < rows.length; ri++) {
        for (let ci = 0; ci < cols.length; ci++) {
          relevantSet.add(rows[ri] + ',' + cols[ci]);
        }
      }

      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      for (let r = 0; r < this._gridSize; r++) {
        for (let c = 0; c < this._gridSize; c++) {
          if (!relevantSet.has(r + ',' + c)) {
            ctx.fillRect(c * cs, r * cs, cs, cs);
          }
        }
      }
      ctx.restore();

      // ---- 鱼骨高亮 ----
      const lineColor = color || '#4fc3f7';

      ctx.save();
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        ctx.fillStyle = 'rgba(79, 195, 247, ' + (0.08 + 0.06 * phase) + ')';
        ctx.fillRect(0, r * cs, gridPx, cs);

        ctx.fillStyle = lineColor;
        ctx.globalAlpha = 0.5 + 0.3 * phase;
        ctx.fillRect(0, r * cs + cs * 0.2, 3, cs * 0.6);
        ctx.fillRect(gridPx - 3, r * cs + cs * 0.2, 3, cs * 0.6);
      }
      ctx.restore();

      ctx.save();
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        ctx.fillStyle = 'rgba(79, 195, 247, ' + (0.08 + 0.06 * phase) + ')';
        ctx.fillRect(c * cs, 0, cs, gridPx);

        ctx.fillStyle = lineColor;
        ctx.globalAlpha = 0.5 + 0.3 * phase;
        ctx.fillRect(c * cs + cs * 0.2, 0, cs * 0.6, 3);
        ctx.fillRect(c * cs + cs * 0.2, gridPx - 3, cs * 0.6, 3);
      }
      ctx.restore();

      // ---- 交点发光标记 ----
      ctx.save();
      for (let ri = 0; ri < rows.length; ri++) {
        for (let ci = 0; ci < cols.length; ci++) {
          const cx = cols[ci] * cs + cs / 2;
          const cy = rows[ri] * cs + cs / 2;

          const glowRadius = cs * 0.4 * (0.7 + 0.3 * phase);
          const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
          gradient.addColorStop(0, 'rgba(79, 195, 247, 0.6)');
          gradient.addColorStop(0.5, 'rgba(79, 195, 247, 0.2)');
          gradient.addColorStop(1, 'rgba(79, 195, 247, 0)');

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // ---- 连接线 ----
      ctx.save();
      ctx.strokeStyle = 'rgba(79, 195, 247, ' + (0.2 + 0.15 * phase) + ')';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);

      for (let ri = 0; ri < rows.length; ri++) {
        for (let ci = 0; ci < cols.length; ci++) {
          const cx = cols[ci] * cs + cs / 2;
          const cy = rows[ri] * cs + cs / 2;

          if (ri < rows.length - 1) {
            const nextY = rows[ri + 1] * cs + cs / 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy + cs / 2);
            ctx.lineTo(cx, nextY - cs / 2);
            ctx.stroke();
          }

          if (ci < cols.length - 1) {
            const nextX = cols[ci + 1] * cs + cs / 2;
            ctx.beginPath();
            ctx.moveTo(cx + cs / 2, cy);
            ctx.lineTo(nextX - cs / 2, cy);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    } catch (e) {
      console.error('[EffectRenderer] renderSwordfishEffect error:', e);
    }
  }

  // ================================================================
  //  嵌套笼颜色蒙层
  // ================================================================

  /**
   * 绘制笼子颜色蒙层
   * @param {Object[]} cages - 笼子数组，每个 cage 有 id 和 cells
   * @param {number} opacity - 蒙层透明度 0-1
   */
  renderCageOverlay(cages, opacity) {
    try {
      const ctx = this._ctx;
      if (!ctx || !cages || !Array.isArray(cages) || cages.length === 0) return;

      const quality = this._getQuality();
      const baseOpacity = opacity !== undefined ? opacity : quality.cageOverlayOpacity;
      if (baseOpacity <= 0) return;

      const scale = this._getRenderScale();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      const cs = this._cellSize;

      for (let ci = 0; ci < cages.length; ci++) {
        const cage = cages[ci];
        if (!cage || !cage.cells || !Array.isArray(cage.cells) || cage.cells.length === 0) continue;

        const cageId = cage.id !== undefined ? cage.id : ci;
        const colorPrefix = this._getCageColor(cageId);
        const fillColor = colorPrefix + baseOpacity + ')';

        ctx.save();
        ctx.fillStyle = fillColor;

        for (let i = 0; i < cage.cells.length; i++) {
          const cellCoord = cage.cells[i];
          if (!Array.isArray(cellCoord) || cellCoord.length < 2) continue;
          const cr = cellCoord[0];
          const cc = cellCoord[1];
          if (cr < 0 || cr >= this._gridSize || cc < 0 || cc >= this._gridSize) continue;

          const x = cc * cs;
          const y = cr * cs;
          ctx.fillRect(x, y, cs, cs);
        }

        ctx.restore();
      }
    } catch (e) {
      console.error('[EffectRenderer] renderCageOverlay error:', e);
    }
  }

  // ================================================================
  //  公共方法
  // ================================================================

  /**
   * 根据 state.effects 渲染所有特效
   * @param {Object} state - 状态对象，包含 effects 和棋盘信息
   *
   * state.effects 结构：
   * {
   *   particles: [{ cellX, cellY, color, count }],
   *   glow: [{ x, y, radius, color, intensity }],
   *   heatmap: { cells: number[][] },
   *   xwing: { rows: [r1,r2], cols: [c1,c2], color, floatingTexts },
   *   swordfish: { rows: [r1,r2,r3], cols: [c1,c2,c3], color },
   *   cageOverlay: { cages: [], opacity }
   * }
   */
  renderEffects(state) {
    if (!this._ctx || !this._canvas) return;

    try {
      this._syncGridState(state);
      this._frame++;
      this.clear();

      const effects = state && state.effects;
      if (!effects) return;

      // 棋盘区域坐标偏移（与 board-renderer 行列标对齐）
      this._ctx.save();
      this._ctx.translate(this._padL, this._padT);

      // 1. 笼子颜色蒙层
      if (effects.cageOverlay) {
        this.renderCageOverlay(
          effects.cageOverlay.cages || (state.cages || null),
          effects.cageOverlay.opacity
        );
      }

      // 2. 热力图
      if (effects.heatmap) {
        this.renderHeatmap(effects.heatmap);
      }

      // 3. 粒子系统
      if (effects.particles && Array.isArray(effects.particles)) {
        for (let i = 0; i < effects.particles.length; i++) {
          const p = effects.particles[i];
          this.spawnParticles(p.cellX, p.cellY, p.color, p.count);
        }
      }

      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      if (this._lastTime === 0) this._lastTime = now;
      const deltaTime = (now - this._lastTime) / 1000;
      this._lastTime = now;

      this.updateParticles(deltaTime);
      this.renderParticles();

      // 4. X-Wing 效果
      if (effects.xwing) {
        const xw = effects.xwing;
        if (xw.floatingTexts && Array.isArray(xw.floatingTexts)) {
          for (let i = 0; i < xw.floatingTexts.length; i++) {
            this._floatingTexts.push({
              text: xw.floatingTexts[i],
              x: (xw.cols[0] + xw.cols[1] + 1) / 2 * this._cellSize,
              y: (xw.rows[1] + 1) * this._cellSize + this._cellSize * 0.5,
              speed: 40 + Math.random() * 20,
              alpha: 1.0,
              life: 3.0,
            });
          }
        }
        this.renderXWingEffect(xw.rows, xw.cols, xw.color);
      }

      // 5. Swordfish 效果
      if (effects.swordfish) {
        const sw = effects.swordfish;
        this.renderSwordfishEffect(sw.rows, sw.cols, sw.color);
      }

      this._ctx.restore();

      // 6. 辉光效果（像素坐标，不参与棋盘偏移）
      if (effects.glow && Array.isArray(effects.glow)) {
        for (let i = 0; i < effects.glow.length; i++) {
          const g = effects.glow[i];
          this.renderGlow(g.x, g.y, g.radius, g.color, g.intensity);
        }
      }

      if (this._pm && typeof this._pm.recordFrame === 'function') {
        this._pm.recordFrame();
      }
    } catch (e) {
      console.error('[EffectRenderer] renderEffects error:', e);
    }
  }

  /**
   * 清除特效层画布
   */
  clear() {
    try {
      if (!this._ctx || !this._canvas) return;
      this._ctx.clearRect(0, 0, this._width, this._height);
    } catch (e) {
      console.error('[EffectRenderer] clear error:', e);
    }
  }

  /**
   * 调整画布大小
   * @param {number} width  - CSS 像素宽度
   * @param {number} height - CSS 像素高度
   */
  resize(width, height) {
    try {
      this._width = width;
      this._height = height;
      if (!this._canvas) return;

      const scale = this._getRenderScale();
      this._canvas.width = Math.round(width * scale);
      this._canvas.height = Math.round(height * scale);
      this._canvas.style.width = width + 'px';
      this._canvas.style.height = height + 'px';

      const innerW = width - this._padL - 10;
      const innerH = height - this._padT - 10;
      this._cellSize = Math.max(10, Math.min(innerW, innerH)) / this._gridSize;
    } catch (e) {
      console.error('[EffectRenderer] resize error:', e);
    }
  }

  /**
   * 设置棋盘外缘留白（与 board-renderer 行列标对齐）
   * @param {{left:number, top:number}} pad
   */
  setBoardPadding(pad) {
    if (!pad) return;
    this._padL = pad.left || 0;
    this._padT = pad.top || 0;
  }

  /**
   * 更新性能监控引用
   * @param {PerformanceMonitor} pm
   */
  setPerformanceMonitor(pm) {
    try {
      this._pm = pm;
    } catch (e) {
      console.error('[EffectRenderer] setPerformanceMonitor error:', e);
    }
  }

  /**
   * 清除所有粒子
   */
  clearParticles() {
    try {
      this._particles = [];
    } catch (e) {
      console.error('[EffectRenderer] clearParticles error:', e);
    }
  }

  /**
   * 清除浮动文字
   */
  clearFloatingTexts() {
    try {
      this._floatingTexts = [];
    } catch (e) {
      console.error('[EffectRenderer] clearFloatingTexts error:', e);
    }
  }

  /**
   * 重置所有动画状态
   */
  resetAnimation() {
    try {
      this._frame = 0;
      this._lastTime = 0;
      this._particles = [];
      this._floatingTexts = [];
    } catch (e) {
      console.error('[EffectRenderer] resetAnimation error:', e);
    }
  }
}

export default EffectRenderer;
