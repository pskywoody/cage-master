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
   * 根据棋盘尺寸和容器宽度计算合适的 cellSize
   */
  recalcCellSize(board) {
    // 以 canvas 的 CSS 宽度为基准计算
    const cssWidth = this.canvas.clientWidth || 400;
    const size = board.size;
    // 减去 padding 的比例（padding 在两侧，所以 * 2）
    // cellSize = (可用宽度 - 2 * padding) / size
    const availableWidth = cssWidth - this.padding * 2;
    this.cellSize = Math.floor(availableWidth / size);
    // 最小 cellSize 保证可读性
    if (this.cellSize < 30) this.cellSize = 30;
  }

  /**
   * 获取宫的尺寸
   */
  getBoxSize(size) {
    if (size === 4) return { boxW: 2, boxH: 2 };
    if (size === 6) return { boxW: 3, boxH: 2 };
    return { boxW: 3, boxH: 3 }; // 9x9 默认
  }

  /**
   * 主渲染入口：按层从下到上绘制
   */
  render(board) {
    // 动态计算 cellSize
    this.recalcCellSize(board);

    const { ctx, cellSize, padding } = this;
    const size = board.size;
    const canvasSize = size * cellSize + padding * 2;

    // 用 devicePixelRatio 提升清晰度
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = canvasSize * dpr;
    this.canvas.height = canvasSize * dpr;
    this.canvas.style.width = canvasSize + 'px';
    this.canvas.style.height = canvasSize + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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
    // 第6层：同行列宫高亮（最浅）
    this._drawRowColBoxHighlight(board);
    // 第7层：同笼高亮
    this._drawCageHighlight(board);
    // 第8层：同数字高亮
    this._drawSameNumberHighlight(board);
    // 第9层：选中格高亮（最深）
    this._drawSelectedCell(board);
    // 第10层：提示格子高亮
    this._drawHintHighlight(board);
    // 第11层：填入数字 & 固定数字
    this._drawNumbers(board);
    // 第12层：候选数
    this._drawCandidates(board);
    // 第13层：提示数字（小角标）
    this._drawHintNumber(board);

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
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 3]);

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

      // 和值绘制：统一画在笼子内部左上角
      // 用蓝色小徽章样式，和格子数字明显区分
      ctx.setLineDash([]);
      const sumFontSize = Math.max(8, Math.floor(cellSize * 0.16));
      ctx.font = `bold ${sumFontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const sumText = String(cage.sum);
      const textWidth = ctx.measureText(sumText).width;
      const badgePadding = Math.max(3, Math.floor(cellSize * 0.04));
      const badgeW = textWidth + badgePadding * 2;
      const badgeH = sumFontSize + badgePadding * 2 - 2;
      const badgeX = minC * cellSize + 2;
      const badgeY = minR * cellSize + 2;
      const badgeR = Math.min(badgeH / 2, 4);

      // 画蓝色圆角徽章背景
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      const bx = badgeX;
      const by = badgeY;
      ctx.moveTo(bx + badgeR, by);
      ctx.lineTo(bx + badgeW - badgeR, by);
      ctx.quadraticCurveTo(bx + badgeW, by, bx + badgeW, by + badgeR);
      ctx.lineTo(bx + badgeW, by + badgeH - badgeR);
      ctx.quadraticCurveTo(bx + badgeW, by + badgeH, bx + badgeW - badgeR, by + badgeH);
      ctx.lineTo(bx + badgeR, by + badgeH);
      ctx.quadraticCurveTo(bx, by + badgeH, bx, by + badgeH - badgeR);
      ctx.lineTo(bx, by + badgeR);
      ctx.quadraticCurveTo(bx, by, bx + badgeR, by);
      ctx.closePath();
      ctx.fill();

      // 画白色文字
      ctx.fillStyle = '#ffffff';
      ctx.fillText(sumText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);
      ctx.setLineDash([5, 3]);
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

  // ---------- 6. 同行列宫高亮 ----------
  _drawRowColBoxHighlight(board) {
    const cells = board.getRowColBoxHighlightCells();
    if (cells.length === 0) return;
    const { ctx, cellSize } = this;

    ctx.fillStyle = 'rgba(230, 241, 255, 0.5)';
    for (const { r, c } of cells) {
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }
  }

  // ---------- 7. 同笼整体高亮 ----------
  _drawCageHighlight(board) {
    const cells = board.getSameCageHighlightCells();
    if (cells.length === 0) return;
    const { ctx, cellSize } = this;

    ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
    for (const { r, c } of cells) {
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }
  }

  // ---------- 8. 同数字高亮 ----------
  _drawSameNumberHighlight(board) {
    const cells = board.getSameNumberHighlightCells();
    if (cells.length === 0) return;
    const { ctx, cellSize } = this;

    ctx.fillStyle = 'rgba(59, 130, 246, 0.18)';
    for (const { r, c } of cells) {
      ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
    }
  }

  // ---------- 9. 选中格高亮（支持多选框选） ----------
  _drawSelectedCell(board) {
    const { ctx, cellSize } = this;
    const size = board.size;
    let hasSelection = false;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.isSelected) {
          hasSelection = true;
          // 选中背景
          ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      }
    }

    if (!hasSelection) return;

    // 只给选区的外边框描边（更美观）
    // 简单处理：每个选中格都描边，但如果是多选，内部边框不重复
    // 先简单实现：每个选中格都描边
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.isSelected) {
          ctx.strokeRect(c * cellSize + 1, r * cellSize + 1, cellSize - 2, cellSize - 2);
        }
      }
    }
  }

  // ---------- 10. 数字渲染 ----------
  _drawNumbers(board) {
    const { ctx, cellSize } = this;
    const size = board.size;

    // 字体大小根据 cellSize 动态调整
    const fontSize = Math.floor(cellSize * 0.45);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        const num = cell.fixedNum || cell.fillNum;
        if (!num) continue;

        ctx.font = cell.fixedNum ? `${fontSize}px sans-serif` : `${fontSize}px sans-serif`;
        if (cell.isError && board.settings.conflictRed) {
          ctx.fillStyle = '#ef4444';
        } else if (cell.fixedNum) {
          ctx.fillStyle = '#94a3b8';  // 给定数字用浅灰色，和玩家填的蓝色区分
        } else {
          ctx.fillStyle = '#3b82f6';
        }
        ctx.fillText(num, c * cellSize + cellSize / 2, r * cellSize + cellSize / 2);
      }
    }
  }

  // ---------- 12. 候选数渲染（根据gridSize动态布局）----------
  _drawCandidates(board) {
    const { ctx, cellSize } = this;
    const size = board.size;
    const { boxW, boxH } = this.getBoxSize(size);

    // 候选数用宫的尺寸来排列子格（4x4用2x2，6x6用3x2，9x9用3x3）
    const subW = cellSize / boxW;
    const subH = cellSize / boxH;

    // 字体大小根据 cellSize 动态调整
    const fontSize = Math.max(8, Math.floor(cellSize * 0.18));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = fontSize + 'px sans-serif';
    ctx.fillStyle = '#94a3b8';

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        // 有正式数字或固定数字时不画候选
        if (cell.fixedNum || cell.fillNum) continue;
        if (cell.candidates.size === 0) continue;

        cell.candidates.forEach(num => {
          const subR = Math.floor((num - 1) / boxW);
          const subC = (num - 1) % boxW;
          const x = c * cellSize + subC * subW + subW / 2;
          const y = r * cellSize + subR * subH + subH / 2;
          ctx.fillText(num, x, y);
        });
      }
    }
  }

  // ---------- 10. 提示格子高亮 ----------
  _drawHintHighlight(board) {
    const { ctx, cellSize } = this;
    const size = board.size;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.isHintCell) {
          // 闪烁的金色高亮边框
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 3;
          ctx.strokeRect(c * cellSize + 2, r * cellSize + 2, cellSize - 4, cellSize - 4);

          // 半透明金色背景
          ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      }
    }
  }

  // ---------- 13. 提示数字（右上角小角标）----------
  _drawHintNumber(board) {
    const { ctx, cellSize } = this;
    const size = board.size;

    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#f59e0b';

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = board.cells[r][c];
        if (cell.isHintCell && cell.hintNumber !== null) {
          ctx.fillText(
            '?' + cell.hintNumber,
            (c + 1) * cellSize - 3,
            r * cellSize + 2
          );
        }
      }
    }
  }
}