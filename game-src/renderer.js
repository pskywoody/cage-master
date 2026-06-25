// ==========================================
// Canvas 渲染器
// ==========================================

class Renderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.cellSize = 60;
    this.padding = 12; // 四周内边距，顶部预留和值标签空间
  }

  /**
   * 主渲染入口：按层从下到上绘制
   */
  render(board) {
    const { ctx, cellSize, padding } = this;
    const size = board.size;
    const canvasSize = size * cellSize + padding * 2;

    this.canvas.width = canvasSize;
    this.canvas.height = canvasSize;

    ctx.clearRect(0, 0, canvasSize, canvasSize);

    // 坐标系整体偏移，所有绘制自动加上内边距
    ctx.save();
    ctx.translate(padding, padding);

    // 第1层：内部网格细线
    this._drawInnerGrid(size);
    // 第2层：内部粗宫线
    this._drawInnerBoxLines(size);
    // 第3层：圆角外边框
    this._drawRoundOuterBorder(size);
    // 第4层：笼子虚线外框 + 外移和值
    this._drawCages(board);
    // 第5层：45法则高亮蒙版
    this._drawHighlightMask(board);
    // 第6层：同笼整体高亮
    this._drawCageHighlight(board);
    // 第7层：选中格高亮
    this._drawSelectedCell(board);
    // 第8层：填入数字 & 固定数字
    this._drawNumbers(board);
    // 第9层：候选数
    this._drawCandidates(board);

    ctx.restore();
  }

  // ---------- 1. 内部网格细线 ----------
  _drawInnerGrid(size) {
    const { ctx, cellSize } = this;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;

    for (let i = 1; i < size; i++) {
      // 竖线
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, size * cellSize);
      ctx.stroke();
      // 横线
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(size * cellSize, i * cellSize);
      ctx.stroke();
    }
  }

  // ---------- 2. 内部粗宫线 ----------
  _drawInnerBoxLines(size) {
    const { ctx, cellSize } = this;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;

    let boxW = 3, boxH = 3;
    if (size === 6) { boxW = 3; boxH = 2; }
    if (size === 4) { boxW = 2; boxH = 2; }

    // 竖宫线
    for (let i = boxW; i < size; i += boxW) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, size * cellSize);
      ctx.stroke();
    }
    // 横宫线
    for (let i = boxH; i < size; i += boxH) {
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(size * cellSize, i * cellSize);
      ctx.stroke();
    }
  }

  // ---------- 3. 圆角外边框 ----------
  _drawRoundOuterBorder(size) {
    const { ctx, cellSize } = this;
    const w = size * cellSize;
    const h = size * cellSize;
    const radius = 8;

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(w - radius, 0);
    ctx.quadraticCurveTo(w, 0, w, radius);
    ctx.lineTo(w, h - radius);
    ctx.quadraticCurveTo(w, h, w - radius, h);
    ctx.lineTo(radius, h);
    ctx.quadraticCurveTo(0, h, 0, h - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.stroke();
  }

  // ---------- 4. 笼子渲染（和值外移，不占用格子内部）----------
  _drawCages(board) {
    const { ctx, cellSize } = this;
    const size = board.size;
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);

    board.cages.forEach(cage => {
      const cellSet = new Set(cage.cells.map(([r, c]) => `${r},${c}`));

      // 自动计算笼子最左上角格子
      let minR = size, minC = size;
      cage.cells.forEach(([r, c]) => {
        if (r < minR) { minR = r; minC = c; }
        else if (r === minR && c < minC) { minC = c; }
      });

      // 绘制笼子外轮廓虚线（最外圈不画，统一用黑色外边框）
      cage.cells.forEach(([r, c]) => {
        const x = c * cellSize;
        const y = r * cellSize;

        // 上边
        if (!cellSet.has(`${r - 1},${c}`) && r !== 0) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + cellSize, y);
          ctx.stroke();
        }
        // 下边
        if (!cellSet.has(`${r + 1},${c}`) && r !== size - 1) {
          ctx.beginPath();
          ctx.moveTo(x, y + cellSize);
          ctx.lineTo(x + cellSize, y + cellSize);
          ctx.stroke();
        }
        // 左边
        if (!cellSet.has(`${r},${c - 1}`) && c !== 0) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + cellSize);
          ctx.stroke();
        }
        // 右边
        if (!cellSet.has(`${r},${c + 1}`) && c !== size - 1) {
          ctx.beginPath();
            ctx.moveTo(x + cellSize, y);
            ctx.lineTo(x + cellSize, y + cellSize);
            ctx.stroke();
        }
      });

      // 和值绘制在笼子顶部边框外侧（不占用格子内部，彻底避免与候选数重叠）
      ctx.setLineDash([]);
      ctx.fillStyle = '#64748b';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(cage.sum, minC * cellSize + 2, minR * cellSize - 2);
      ctx.setLineDash([4, 3]);
    });

    ctx.setLineDash([]);
  }

  // ---------- 5. 高亮蒙版（45法则动画用）----------
  _drawHighlightMask(board) {
    const { ctx, cellSize } = this;
    const size = board.size;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.isHighlightMask) {
          ctx.fillStyle = `rgba(100, 180, 255, ${cell.highlightOpacity})`;
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      }
    }
  }

  // ---------- 6. 同笼整体高亮 ----------
  _drawCageHighlight(board) {
    if (!board.selectedCageId) return;
    const { ctx, cellSize } = this;
    const size = board.size;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.cageId === board.selectedCageId) {
          ctx.fillStyle = 'rgba(59, 130, 246, 0.07)';
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      }
    }
  }

  // ---------- 7. 选中格高亮 ----------
  _drawSelectedCell(board) {
    if (!board.selectedCell) return;
    const { ctx, cellSize } = this;
    const { r, c } = board.selectedCell;

    // 选中背景
    ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
    ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);

    // 选中边框
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(c * cellSize + 1, r * cellSize + 1, cellSize - 2, cellSize - 2);
  }

  // ---------- 8. 数字渲染 ----------
  _drawNumbers(board) {
    const { ctx, cellSize } = this;
    const size = board.size;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        const num = cell.fixedNum || cell.fillNum;
        if (!num) continue;

        ctx.font = cell.fixedNum ? 'bold 26px sans-serif' : '26px sans-serif';
        if (cell.isError) {
          ctx.fillStyle = '#ef4444';
        } else {
          ctx.fillStyle = cell.fixedNum ? '#1e293b' : '#3b82f6';
        }
        ctx.fillText(num, c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
      }
    }
  }

  // ---------- 9. 候选数渲染（3×3九宫格布局）----------
  _drawCandidates(board) {
    const { ctx, cellSize } = this;
    const size = board.size;
    const subSize = cellSize / 3;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#94a3b8';

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        // 有正式数字或固定数字时不画候选
        if (cell.fixedNum || cell.fillNum) continue;
        if (cell.candidates.size === 0) continue;

        cell.candidates.forEach(num => {
          const subR = Math.floor((num - 1) / 3);
          const subC = (num - 1) % 3;
          const x = c * cellSize + subC * subSize + subSize / 2;
          const y = r * cellSize + subR * subSize + subSize / 2;
          ctx.fillText(num, x, y);
        });
      }
    }
  }
}