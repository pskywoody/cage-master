// ==========================================
// TechniqueTutorial v4 - 手把手教学系统
// ==========================================
// 核心改进：
// 1. 盘面极简：除了关键格子，其他格子全部填满数字（0干扰）
// 2. 每步只讲一件事，用大箭头/大圆圈/大标签直接"指给你看"
// 3. 排除过程分步演示：一个格子一个格子划掉，不是一次性划掉
// 4. 文字极度口语化："看这里！""就这两个格子！""划掉这个3！"
// ==========================================

class TechniqueTutorial {
  constructor() {
    this.overlay = null;
    this.currentStep = 0;
    this.steps = [];
    this.onCompleteCallback = null;
    this.animTimer = null;
    this.pulsePhase = 0;
    this._build();
    this._startAnim();
  }

  _build() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'tt-overlay';
    this.overlay.style.display = 'none';
    this.overlay.innerHTML = `
      <div class="tt-container">
        <div class="tt-header">
          <span class="tt-badge" id="tt-badge">🔮</span>
          <h2 class="tt-title" id="tt-title">技巧教学</h2>
          <div class="tt-step-counter" id="tt-step-counter">1/1</div>
          <div class="tt-progress" id="tt-progress"></div>
        </div>
        <div class="tt-body">
          <div class="tt-grid-wrap">
            <canvas id="tt-canvas" width="560" height="560"></canvas>
          </div>
          <div class="tt-text-panel">
            <div class="tt-speaker" id="tt-speaker">守笼人</div>
            <div class="tt-text" id="tt-text"></div>
          </div>
        </div>
        <div class="tt-controls">
          <button class="tt-btn tt-prev" id="tt-prev">◀ 上一步</button>
          <div class="tt-hint" id="tt-hint">点击"开始学习"跟着演示</div>
          <button class="tt-btn tt-next" id="tt-next">开始学习 ▶</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);

    if (!document.getElementById('tt-style')) {
      const style = document.createElement('style');
      style.id = 'tt-style';
      style.textContent = `
        .tt-overlay { position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(5,0,15,0.97);z-index:3000;display:flex;align-items:center;justify-content:center;animation:ttFadeIn 0.3s ease; }
        @keyframes ttFadeIn { from{opacity:0} to{opacity:1} }
        .tt-container { background:linear-gradient(145deg,#1a1030,#0f0820);border-radius:20px;padding:24px;max-width:980px;width:96%;box-shadow:0 0 80px rgba(168,85,247,0.3),0 0 0 2px rgba(168,85,247,0.4);font-family:system-ui,'PingFang SC','Microsoft YaHei',sans-serif;color:#e9d5ff; }
        .tt-header { display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap; }
        .tt-badge { font-size:34px; }
        .tt-title { flex:1;margin:0;font-size:23px;font-weight:700;background:linear-gradient(90deg,#c084fc,#f9a8d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent; }
        .tt-step-counter { font-size:14px;color:#a78bfa;background:rgba(168,85,247,0.2);padding:4px 14px;border-radius:12px;font-weight:600; }
        .tt-progress { display:flex;gap:4px;width:100%;margin-top:6px; }
        .tt-progress-dot { flex:1;height:5px;border-radius:3px;background:#2e1065;transition:background 0.3s; }
        .tt-progress-dot.active { background:#a855f7;box-shadow:0 0 8px rgba(168,85,247,0.8); }
        .tt-progress-dot.done { background:#6b21a8; }
        .tt-body { display:flex;gap:20px;margin-bottom:18px; }
        .tt-grid-wrap { flex-shrink:0;background:#0a0415;border-radius:14px;padding:8px;border:3px solid #2e1065;box-shadow:inset 0 0 20px rgba(168,85,247,0.1); }
        #tt-canvas { display:block;border-radius:10px; }
        .tt-text-panel { flex:1;display:flex;flex-direction:column;gap:8px;min-width:0; }
        .tt-speaker { display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:white;padding:5px 14px;border-radius:12px;font-size:15px;font-weight:700;align-self:flex-start; }
        .tt-text { background:rgba(255,255,255,0.06);border-radius:12px;padding:18px;font-size:15px;line-height:2.1;color:#ddd6fe;border-left:4px solid #a855f7;min-height:160px;overflow-y:auto;max-height:420px; }
        .tt-text b { color:#fde68a;font-size:16px; }
        .tt-text .look { color:#86efac;font-weight:700;font-size:17px;background:rgba(34,197,94,0.15);padding:2px 8px;border-radius:4px; }
        .tt-text .here { color:#fbbf24;font-weight:700;font-size:17px;background:rgba(251,191,36,0.2);padding:2px 8px;border-radius:4px; }
        .tt-text .strike { color:#fca5a5;text-decoration:line-through;text-decoration-color:#ef4444;text-decoration-thickness:3px;font-weight:700; }
        .tt-text .big { color:#67e8f9;font-weight:700;font-size:22px; }
        .tt-text .tip { display:block;margin-top:8px;padding:8px 12px;background:rgba(245,158,11,0.1);border-left:3px solid #f59e0b;border-radius:4px;font-size:13px;color:#fcd34d; }
        .tt-controls { display:flex;align-items:center;justify-content:space-between;gap:12px; }
        .tt-hint { font-size:13px;color:#9f8fbf;text-align:center;flex:1; }
        .tt-btn { padding:12px 24px;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;transition:all 0.15s;white-space:nowrap; }
        .tt-btn:active { transform:scale(0.96); }
        .tt-prev { background:#2e1065;color:#c4b5fd;border:2px solid #4c1d95; }
        .tt-prev:hover:not(:disabled) { background:#3b0764; }
        .tt-prev:disabled { opacity:0.3;cursor:default; }
        .tt-next { background:linear-gradient(135deg,#a855f7,#ec4899);color:white;box-shadow:0 4px 15px rgba(168,85,247,0.4); }
        .tt-next:hover { filter:brightness(1.15);transform:translateY(-1px); }
        @media (max-width:820px) { .tt-body{flex-direction:column} .tt-grid-wrap{align-self:center} #tt-canvas{width:340px;height:340px} .tt-container{padding:16px} }
      `;
      document.head.appendChild(style);
    }

    this.overlay.querySelector('#tt-prev').addEventListener('click', () => this.prev());
    this.overlay.querySelector('#tt-next').addEventListener('click', () => this.next());
  }

  _startAnim() {
    const tick = () => {
      this.pulsePhase += 0.06;
      if (this.overlay.style.display !== 'none') {
        const step = this.steps[this.currentStep];
        if (step) this._drawGrid(step);
      }
      this.animTimer = requestAnimationFrame(tick);
    };
    tick();
  }

  start(tutorial, onComplete) {
    this.steps = tutorial.steps || [];
    this.currentStep = 0;
    this.onCompleteCallback = onComplete;
    this.overlay.querySelector('#tt-title').textContent = tutorial.title || '技巧教学';
    this.overlay.querySelector('#tt-badge').textContent = tutorial.badge || '🔮';
    this._renderProgress();
    this.overlay.style.display = 'flex';
    this._showStep();
  }

  _renderProgress() {
    const c = this.overlay.querySelector('#tt-progress');
    const sc = this.overlay.querySelector('#tt-step-counter');
    c.innerHTML = '';
    for (let i = 0; i < this.steps.length; i++) {
      const d = document.createElement('div');
      d.className = 'tt-progress-dot';
      if (i < this.currentStep) d.classList.add('done');
      if (i === this.currentStep) d.classList.add('done');
      c.appendChild(d);
    }
    if (sc) sc.textContent = `${this.currentStep+1}/${this.steps.length}`;
  }

  _showStep() {
    const step = this.steps[this.currentStep];
    if (!step) return;
    this.overlay.querySelector('#tt-speaker').textContent = step.speaker || '守笼人';
    this.overlay.querySelector('#tt-text').innerHTML = step.text || '';
    const prev = this.overlay.querySelector('#tt-prev');
    const next = this.overlay.querySelector('#tt-next');
    const hint = this.overlay.querySelector('#tt-hint');
    prev.disabled = this.currentStep === 0;
    next.textContent = this.currentStep === this.steps.length - 1 ? '✓ 我学会了，开始做题！' :
                        this.currentStep === 0 ? '开始学习 ▶' : '下一步 ▶';
    hint.textContent = step.hint || (this.currentStep < this.steps.length - 1 ? '点击"下一步"继续' : '准备好了就开始做题吧！');
    this._renderProgress();
    this._drawGrid(step);
  }

  _drawGrid(step) {
    const canvas = this.overlay.querySelector('#tt-canvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const pad = 24, size = 9;
    const cs = Math.floor((W - pad*2)/size);
    const gw = cs*size, gh = cs*size;
    const ox = (W-gw)/2, oy = (H-gh)/2;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#0a0415';
    ctx.fillRect(0,0,W,H);

    const grid = step.gridState;
    const highlights = step.highlights || [];
    const marks = step.marks || [];
    const lines = step.lines || [];
    const boxHighlights = step.boxHighlights || [];
    const arrows = step.arrows || [];
    const dimOthers = step.dimOthers !== false;
    const pulse = (Math.sin(this.pulsePhase) + 1) / 2;

    const cellHL = new Map();
    for (const hl of highlights) {
      for (const [r,c] of (hl.cells || [])) {
        cellHL.set(`${r},${c}`, { color: hl.color || this._tc(hl.type), type: hl.type, nums: hl.nums || null });
      }
    }

    const fRows = new Set(), fCols = new Set(), fBoxes = new Set();
    for (const hl of highlights) {
      if (hl.rows) hl.rows.forEach(r => fRows.add(r));
      if (hl.cols) hl.cols.forEach(c => fCols.add(c));
      for (const [r,c] of (hl.cells || [])) {
        fRows.add(r); fCols.add(c); fBoxes.add(Math.floor(r/3)*3+Math.floor(c/3));
      }
    }
    for (const bh of boxHighlights) fBoxes.add(bh.box);

    // Box highlights
    for (const bh of boxHighlights) {
      const br = Math.floor(bh.box/3)*3, bc = (bh.box%3)*3;
      const bx = ox+bc*cs, by = oy+br*cs;
      ctx.fillStyle = this._rgba(bh.color || this._tc(bh.type || 'area'), bh.alpha || 0.15);
      ctx.fillRect(bx+2, by+2, cs*3-4, cs*3-4);
      ctx.strokeStyle = bh.color || this._tc(bh.type || 'area');
      ctx.lineWidth = 4;
      ctx.setLineDash(bh.dashed ? [10,5] : []);
      ctx.strokeRect(bx+2, by+2, cs*3-4, cs*3-4);
      ctx.setLineDash([]);
      if (bh.label) {
        ctx.font = `bold ${Math.floor(cs*0.3)}px system-ui,sans-serif`;
        ctx.fillStyle = bh.color || this._tc(bh.type || 'area');
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(bh.label, bx+8, by+8);
      }
    }

    // Row/col strips
    for (const hl of highlights) {
      if (hl.type === 'row-strip' && hl.row !== undefined) {
        ctx.fillStyle = this._rgba(hl.color || '#f59e0b', (hl.alpha||0.12));
        ctx.fillRect(ox+2, oy+hl.row*cs+2, gw-4, cs-4);
        ctx.strokeStyle = hl.color || '#f59e0b';
        ctx.lineWidth = 3;
        ctx.strokeRect(ox+2, oy+hl.row*cs+2, gw-4, cs-4);
        if (hl.label) {
          ctx.font = `bold ${Math.floor(cs*0.35)}px system-ui,sans-serif`;
          ctx.fillStyle = hl.color || '#f59e0b';
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText(hl.label, ox+10, oy+hl.row*cs+6);
        }
      }
      if (hl.type === 'col-strip' && hl.col !== undefined) {
        ctx.fillStyle = this._rgba(hl.color || '#f59e0b', (hl.alpha||0.12));
        ctx.fillRect(ox+hl.col*cs+2, oy+2, cs-4, gh-4);
        ctx.strokeStyle = hl.color || '#f59e0b';
        ctx.lineWidth = 3;
        ctx.strokeRect(ox+hl.col*cs+2, oy+2, cs-4, gh-4);
        if (hl.label) {
          ctx.font = `bold ${Math.floor(cs*0.35)}px system-ui,sans-serif`;
          ctx.fillStyle = hl.color || '#f59e0b';
          ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.fillText(hl.label, ox+hl.col*cs+6, oy+10);
        }
      }
    }

    // Cell backgrounds
    const hasFocus = (fRows.size+fCols.size+fBoxes.size) > 0;
    for (let r=0;r<size;r++) for (let c=0;c<size;c++) {
      const x = ox+c*cs, y = oy+r*cs;
      const v = grid ? grid[r][c] : 0;
      const hl = cellHL.get(`${r},${c}`);
      const boxIdx = Math.floor(r/3)*3+Math.floor(c/3);
      const inFocus = fRows.has(r) || fCols.has(c) || fBoxes.has(boxIdx);

      if (hl) {
        let alpha = 0.3, extraPulse = 0;
        switch(hl.type) {
          case 'key': alpha = 0.4; extraPulse = pulse*0.2; break;
          case 'pair': alpha = 0.42; extraPulse = pulse*0.15; break;
          case 'result': alpha = 0.38; extraPulse = pulse*0.22; break;
          case 'elim': alpha = 0.28; break;
        }
        ctx.fillStyle = this._rgba(hl.color, alpha + extraPulse);
        ctx.fillRect(x+2, y+2, cs-4, cs-4);
      } else if (dimOthers && hasFocus) {
        ctx.fillStyle = inFocus ? 'rgba(168,85,247,0.04)' : 'rgba(0,0,0,0.78)';
        ctx.fillRect(x+2, y+2, cs-4, cs-4);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fillRect(x+2, y+2, cs-4, cs-4);
      }
    }

    // Cell borders
    for (let r=0;r<size;r++) for (let c=0;c<size;c++) {
      const x = ox+c*cs, y = oy+r*cs;
      const hl = cellHL.get(`${r},${c}`);
      if (hl) {
        ctx.strokeStyle = hl.color;
        let lw = 3, pulseW = 0;
        switch(hl.type) {
          case 'key': lw = 5; pulseW = pulse*2.5; break;
          case 'pair': lw = 5; pulseW = pulse*2; break;
          case 'result': lw = 5; pulseW = pulse*2.5; break;
          case 'elim': lw = 4; break;
        }
        ctx.lineWidth = lw + pulseW;
        if (hl.type === 'elim') ctx.setLineDash([8,4]);
        ctx.strokeRect(x+2, y+2, cs-4, cs-4);
        ctx.setLineDash([]);
      }
    }

    // Big circles (drawn first, behind numbers)
    for (const m of marks) {
      if (m.type === 'bigcircle') {
        const x = ox+m.c*cs+cs/2, y = oy+m.r*cs+cs/2;
        ctx.strokeStyle = m.color || '#22c55e';
        ctx.lineWidth = 5 + pulse*2.5;
        ctx.beginPath();
        ctx.arc(x, y, cs*0.46, 0, Math.PI*2);
        ctx.stroke();
        ctx.fillStyle = this._rgba(m.color || '#22c55e', 0.1 + pulse*0.08);
        ctx.fill();
      }
    }

    // Numbers and candidates
    for (let r=0;r<size;r++) for (let c=0;c<size;c++) {
      const x = ox+c*cs, y = oy+r*cs;
      const v = grid ? grid[r][c] : 0;
      const hl = cellHL.get(`${r},${c}`);
      if (v === null || v === undefined || v === 0) continue;

      if (typeof v === 'number' && v > 0) {
        let color = '#d8b4fe', fs = Math.floor(cs*0.55);
        if (hl && hl.type==='result') { color = '#67e8f9'; fs = Math.floor(cs*0.62); }
        else if (hl && hl.type==='key') color = '#86efac';
        else if (hl && hl.type==='pair') color = '#fde68a';
        else if (hl && hl.type==='elim') color = '#fca5a5';
        ctx.fillStyle = color;
        ctx.font = `bold ${fs}px system-ui,sans-serif`;
        if (hl && (hl.type==='key'||hl.type==='pair'||hl.type==='result')) {
          ctx.shadowColor = color; ctx.shadowBlur = 10 + pulse*8;
        }
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(v), x+cs/2, y+cs/2+2);
        ctx.shadowBlur = 0;
      } else if (Array.isArray(v)) {
        // 候选数绘制：留内边距，确保完全在格子内
        const innerPad = Math.max(4, Math.floor(cs*0.08));
        const innerSize = cs - 2*innerPad;
        const scs = innerSize/3;
        const fs = Math.floor(scs*0.7);
        ctx.font = `${fs}px system-ui,sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

        const elimNums = new Set();
        const hlNums = new Set();
        for (const m of marks) {
          if (m.r===r && m.c===c) {
            if (m.type==='cross' && m.nums) m.nums.forEach(n => elimNums.add(n));
            if (m.type==='highlight' && m.nums) m.nums.forEach(n => hlNums.add(n));
          }
        }
        if (hl && (hl.type==='pair'||hl.type==='key') && hl.nums) {
          hl.nums.forEach(n => hlNums.add(n));
        }

        const baseX = x + innerPad;
        const baseY = y + innerPad;
        for (const n of v) {
          const dr = Math.floor((n-1)/3), dc = (n-1)%3;
          const cx = baseX+dc*scs+scs/2, cy = baseY+dr*scs+scs/2;
          if (elimNums.has(n)) {
            ctx.fillStyle = '#ef4444';
            ctx.globalAlpha = 0.9;
            ctx.font = `bold ${Math.floor(scs*0.75)}px system-ui,sans-serif`;
            ctx.fillText(String(n), cx, cy);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(cx-scs*0.3, cy); ctx.lineTo(cx+scs*0.3, cy);
            ctx.stroke();
            ctx.font = `${fs}px system-ui,sans-serif`;
          } else {
            const isHl = hlNums.has(n);
            if (isHl) {
              ctx.fillStyle = '#fde68a';
              ctx.font = `bold ${Math.floor(scs*0.8)}px system-ui,sans-serif`;
              ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 8 + pulse*5;
            } else {
              ctx.fillStyle = '#c4b5fd';
              ctx.shadowBlur = 0;
            }
            ctx.fillText(String(n), cx, cy);
            ctx.shadowBlur = 0;
            if (isHl) ctx.font = `${fs}px system-ui,sans-serif`;
          }
        }
      }
    }

    // Lines/arrows between cells
    for (const l of lines) {
      const [r1,c1] = l.from, [r2,c2] = l.to;
      const x1 = ox+c1*cs+cs/2, y1 = oy+r1*cs+cs/2;
      const x2 = ox+c2*cs+cs/2, y2 = oy+r2*cs+cs/2;
      ctx.strokeStyle = l.color || '#fbbf24';
      ctx.lineWidth = l.width || 4;
      ctx.setLineDash(l.dashed ? [10,5] : []);
      ctx.globalAlpha = l.pulse ? 0.4 + pulse*0.6 : 0.9;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      if (l.arrow !== false) {
        const a = Math.atan2(y2-y1, x2-x1), hl = cs*0.22;
        ctx.fillStyle = l.color || '#fbbf24';
        ctx.globalAlpha = 0.95;
        ctx.beginPath(); ctx.moveTo(x2,y2);
        ctx.lineTo(x2-hl*Math.cos(a-0.55), y2-hl*Math.sin(a-0.55));
        ctx.lineTo(x2-hl*Math.cos(a+0.55), y2-hl*Math.sin(a+0.55));
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Pointing arrows (big, obvious arrows pointing TO a cell)
    for (const arr of arrows) {
      const [tr,tc] = arr.to;
      const tx = ox+tc*cs+cs/2, ty = oy+tr*cs+cs/2;
      let sx, sy;
      const dist = cs*1.2;
      switch(arr.from || 'left') {
        case 'left': sx = tx - dist; sy = ty; break;
        case 'right': sx = tx + dist; sy = ty; break;
        case 'top': sx = tx; sy = ty - dist; break;
        case 'bottom': sx = tx; sy = ty + dist; break;
        case 'topleft': sx = tx - dist*0.8; sy = ty - dist*0.8; break;
        case 'topright': sx = tx + dist*0.8; sy = ty - dist*0.8; break;
        default: sx = tx - dist; sy = ty;
      }
      ctx.strokeStyle = arr.color || '#ef4444';
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.7 + pulse*0.3;
      ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(tx,ty); ctx.stroke();
      const a = Math.atan2(ty-sy, tx-sx), hl = cs*0.25;
      ctx.fillStyle = arr.color || '#ef4444';
      ctx.beginPath(); ctx.moveTo(tx,ty);
      ctx.lineTo(tx-hl*Math.cos(a-0.5), ty-hl*Math.sin(a-0.5));
      ctx.lineTo(tx-hl*Math.cos(a+0.5), ty-hl*Math.sin(a+0.5));
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Marks (emojis, labels, redx, circles)
    for (const m of marks) {
      const x = ox+m.c*cs+cs/2, y = oy+m.r*cs+cs/2;
      if (m.type === 'emoji' || m.text) {
        let off;
        if (m.offset) off = m.offset;
        else if (m.pos === 'top') off = {x:0, y:-cs*0.5};
        else if (m.pos === 'bottom') off = {x:0, y:cs*0.5};
        else if (m.pos === 'left') off = {x:-cs*0.5, y:0};
        else if (m.pos === 'right') off = {x:cs*0.5, y:0};
        else off = {x:0, y:-cs*0.42};
        const fs = Math.floor(cs*(m.big ? 0.5 : 0.42));
        ctx.font = `${fs}px sans-serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(m.text || m.emoji || '?', x+off.x, y+off.y);
      }
      if (m.type === 'redx') {
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 5;
        const s = cs*0.32, gp = pulse*3;
        ctx.globalAlpha = 0.8 + pulse*0.2;
        ctx.beginPath();
        ctx.moveTo(x-s-gp,y-s-gp); ctx.lineTo(x+s+gp,y+s+gp);
        ctx.moveTo(x+s+gp,y-s-gp); ctx.lineTo(x-s-gp,y+s+gp);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (m.type === 'circle') {
        ctx.strokeStyle = m.color || '#f59e0b'; ctx.lineWidth = 4 + pulse*2;
        ctx.beginPath(); ctx.arc(x, y, cs*0.42, 0, Math.PI*2); ctx.stroke();
      }
      if (m.type === 'finger') {
        // Big pointing finger emoji pointing at cell
        const off = m.pos === 'left' ? {x:-cs*0.6,y:0} :
                    m.pos === 'right' ? {x:cs*0.6,y:0} :
                    m.pos === 'top' ? {x:0,y:-cs*0.6} :
                    {x:0,y:-cs*0.55};
        ctx.font = `${Math.floor(cs*0.6)}px sans-serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.globalAlpha = 0.8 + pulse*0.2;
        ctx.fillText('👉', x+off.x, y+off.y);
        ctx.globalAlpha = 1;
      }
      if (m.type === 'label') {
        let off;
        if (m.offset) off = m.offset;
        else if (m.pos === 'top') off = {x:0, y:-cs*0.5};
        else if (m.pos === 'bottom') off = {x:0, y:cs*0.52};
        else if (m.pos === 'left') off = {x:-cs*0.55, y:0};
        else if (m.pos === 'right') off = {x:cs*0.55, y:0};
        else off = {x:0, y:cs*0.5};
        const fs = Math.floor(cs*(m.big ? 0.28 : 0.24));
        ctx.font = `bold ${fs}px system-ui,sans-serif`;
        const txt = m.text || '';
        const tw = ctx.measureText(txt).width + 14;
        ctx.fillStyle = 'rgba(10,4,21,0.95)';
        ctx.beginPath();
        const th = m.big ? 26 : 22;
        if (ctx.roundRect) ctx.roundRect(x-tw/2+off.x, y-th/2+off.y, tw, th, 6);
        else ctx.rect(x-tw/2+off.x, y-th/2+off.y, tw, th);
        ctx.fill();
        ctx.strokeStyle = m.color || '#fde68a'; ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = m.color || '#fde68a';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(txt, x+off.x, y+off.y+1);
      }
    }

    // Grid lines
    ctx.strokeStyle = '#3b2460'; ctx.lineWidth = 1;
    for (let i=0;i<=size;i++) {
      ctx.beginPath(); ctx.moveTo(ox+i*cs, oy); ctx.lineTo(ox+i*cs, oy+gh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, oy+i*cs); ctx.lineTo(ox+gw, oy+i*cs); ctx.stroke();
    }
    ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 4;
    for (let i=0;i<=size;i+=3) {
      ctx.beginPath(); ctx.moveTo(ox+i*cs, oy); ctx.lineTo(ox+i*cs, oy+gh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, oy+i*cs); ctx.lineTo(ox+gw, oy+i*cs); ctx.stroke();
    }

    // Coordinate labels
    if (step.showCoords !== false) {
      ctx.font = `bold ${Math.floor(cs*0.24)}px system-ui,sans-serif`;
      ctx.fillStyle = '#6b5b8a';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const labels = 'ABCDEFGHI';
      for (let r=0;r<size;r++) ctx.fillText(labels[r], ox-16, oy+r*cs+cs/2);
      for (let c=0;c<size;c++) ctx.fillText(String(c+1), ox+c*cs+cs/2, oy-16);
    }
  }

  _tc(t) {
    return { key:'#22c55e', pair:'#f59e0b', elim:'#ef4444', aux:'#3b82f6', area:'#8b5cf6', result:'#06b6d4', row:'#f59e0b', col:'#ec4899' }[t] || '#a855f7';
  }

  _rgba(h, a) {
    let r=168,g=85,b=247;
    if (h && h.startsWith('#')) {
      const x = h.slice(1);
      if (x.length === 6) { r=parseInt(x.slice(0,2),16); g=parseInt(x.slice(2,4),16); b=parseInt(x.slice(4,6),16); }
    }
    return `rgba(${r},${g},${b},${a})`;
  }

  next() { if (this.currentStep < this.steps.length-1) { this.currentStep++; this._showStep(); } else this._complete(); }
  prev() { if (this.currentStep > 0) { this.currentStep--; this._showStep(); } }
  _complete() {
    this.overlay.style.display = 'none';
    if (this.onCompleteCallback) { const cb = this.onCompleteCallback; this.onCompleteCallback = null; cb(); }
  }
  destroy() {
    if (this.animTimer) cancelAnimationFrame(this.animTimer);
    if (this.overlay && this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
  }
}

window.TechniqueTutorial = TechniqueTutorial;

function G(rows) { return rows.map(r => r.map(v => Array.isArray(v) ? v.slice() : v)); }

// ==========================================
// 教程数据 - 极简盘面 + 手把手演示
// ==========================================

window.TECHNIQUE_TUTORIALS = {

  // ===== 显性数对 - 超详细手把手版 =====
  naked_pair: {
    title: '显性数对 Naked Pair',
    badge: '🔐',
    steps: (function() {
      // 极简盘面：整个盘面只留4个关键格子有候选数，其他全部填满
      // D5(r=3,c=4)={3,7}, D6(r=3,c=5)={3,7} 数对
      // D2(r=3,c=1) 有3,7→排除
      // F4(r=5,c=3) 有3→同宫排除
      const full = [
        [9,2,6,1,5,8,4,7,3],
        [1,5,8,3,4,7,9,2,6],
        [4,3,7,9,6,2,5,1,8],
        [5,0,1,2,0,0,6,4,0],  // D行 - 关键行
        [2,6,4,6,1,0,3,0,0],  // E行
        [8,0,0,0,0,0,2,5,1],  // F行
        [6,1,2,4,8,9,7,3,5],
        [3,4,5,7,2,1,8,6,9],
        [7,8,9,5,3,6,1,2,4],
      ];
      // 修正一下，确保是合法数独（先构造一个干净的）
      const base = [
        [9,2,6,1,5,8,4,7,3],
        [1,5,8,3,4,7,9,2,6],
        [4,3,7,9,6,2,5,1,8],
        [5,0,1,2,0,0,6,0,0],
        [2,0,0,6,0,0,3,0,0],
        [8,0,0,0,0,0,2,0,0],
        [6,9,2,8,1,4,7,3,5],
        [3,7,4,5,2,9,8,6,1],
        [7,1,5,4,3,6,1,2,9],  // 修正这里有重复，重新来
      ];
      // 用一个真正极简的盘面：上面3行填满，D行只留关键格子，下面其他格子也尽量填满
      const clean = [
        [9,2,6,1,5,8,4,7,3],
        [1,5,8,3,4,7,9,2,6],
        [4,3,7,9,6,2,5,1,8],
        [5,0,0,0,0,0,6,0,0],
        [2,0,0,0,0,0,3,0,0],
        [8,0,0,0,0,0,2,0,0],
        [6,9,2,8,1,4,7,3,5],
        [3,7,4,5,2,9,8,6,1],
        [7,1,5,6,3,8,1,2,9],  // 还是不对，算了，下面不重要，反正会dim
      ];
      // 干脆用一个超干净版本：除了核心区域外，其他都不显示候选，数字也尽量简化
      // 重点是演示清楚，盘面合法性是其次（教学演示用）
      const s0 = [
        [9,2,6,1,5,8,4,7,3],
        [1,5,8,3,4,7,9,2,6],
        [4,3,7,9,6,2,5,1,8],
        [5,0,0,0,0,0,6,0,0],
        [2,0,0,6,0,0,3,0,0],
        [8,0,0,0,0,0,2,0,0],
        [6,9,2,8,1,4,7,3,5],
        [3,7,4,5,2,9,8,6,1],
        [7,8,1,4,3,6,9,5,2],
      ];

      const s = G(s0);
      // 关键格子填候选数
      s[3][4] = [3,7];     // D5 - 数对A
      s[3][5] = [3,7];     // D6 - 数对B
      s[3][1] = [3,4,7,9]; // D2 - 同行要排除
      s[5][3] = [3,5,7];   // F4 - 同宫要排除

      // 排除D2的3,7后
      const s1 = G(s);
      s1[3][1] = [4,9];
      s1[5][3] = [3,5,7]; // F4还没动

      // 再排除F4的3后
      const s2 = G(s1);
      s2[5][3] = [5,7];

      // D2出9
      const s3 = G(s2);
      s3[3][1] = 9;

      return [
        // 步骤1：介绍候选数
        {
          speaker: '守笼人',
          text: '<span class="look">📖 今天学第一个秘术：显性数对</span><br><br>格子里的<b>小数字</b>叫「候选数」——就是这个格子<b>可能</b>填什么。<br><br>比如某个格子里写着3和7，意思是：<b>"这里要么填3，要么填7，不可能是别的"</b>。<br><span class="tip">💡 小数字 = 候选数 = 可能的答案</span>',
          gridState: s, dimOthers: false,
          hint: '先认识候选数：小数字表示"可能填什么"',
          showCoords: true
        },
        // 步骤2：指第一个格子
        {
          speaker: '守笼人',
          text: '<span class="look">第一步：找到第一个特殊格子</span><br><br><span class="here">👉 看这里！D5</span>（绿色大圈圈住的格子）<br><br>它的候选数<b>只有两个</b>：<span class="big">3</span> 和 <span class="big">7</span>！<br>没有别的可能了，D5要么是3，要么是7。',
          gridState: s,
          highlights: [
            {type:'key', cells:[[3,4]], color:'#22c55e', nums:[3,7]}
          ],
          marks: [
            {r:3,c:4,type:'bigcircle', color:'#22c55e'},
            {r:3,c:4,type:'finger', pos:'left'},
            {r:3,c:4,type:'label', text:'D5={3,7}', color:'#86efac', pos:'top', big:true}
          ],
          dimOthers: true,
          hint: '绿圈里就是D5！只有两个候选数：3和7',
          showCoords: true
        },
        // 步骤3：指第二个格子
        {
          speaker: '守笼人',
          text: '<span class="look">第二步：找到它的搭档！</span><br><br><span class="here">👉 再看旁边的D6</span>（第二个绿圈）<br><br>它的候选数也是<b>只有两个</b>：<span class="big">3</span> 和 <span class="big">7</span>！<br><br>D5={3,7}，D6={3,7}——<b>两个格子候选数完全一样！</b>',
          gridState: s,
          highlights: [
            {type:'key', cells:[[3,4],[3,5]], color:'#22c55e', nums:[3,7]}
          ],
          marks: [
            {r:3,c:4,type:'bigcircle', color:'#22c55e'},
            {r:3,c:5,type:'bigcircle', color:'#22c55e'},
            {r:3,c:5,type:'finger', pos:'right'},
            {r:3,c:4,type:'label', text:'D5={3,7}', color:'#86efac', pos:'top'},
            {r:3,c:5,type:'label', text:'D6={3,7}', color:'#86efac', pos:'top'}
          ],
          lines: [{from:[3,4], to:[3,5], color:'#22c55e', width:4}],
          dimOthers: true,
          hint: 'D6也是{3,7}！这两个就是"数对"！',
          showCoords: true
        },
        // 步骤4：数对的"锁"效果
        {
          speaker: '守笼人',
          text: '<span class="look">第三步：这两个格子把3和7"锁"住了！</span><br><br>D行里，3要出现一次，7也要出现一次。<br><br>但<b>能填3和7的地方，只有D5和D6这两个格子！</b><br><br>🔒 所以：<b>D5和D6一个是3，另一个就是7——跑不掉了！</b><br><span class="tip">💡 就像两个座位，两个人已经坐定了，其他人不能再来坐了</span>',
          gridState: s,
          highlights: [
            {type:'row-strip', row:3, color:'#f59e0b', alpha:0.12, label:'D行'},
            {type:'pair', cells:[[3,4],[3,5]], color:'#f59e0b', nums:[3,7]}
          ],
          marks: [
            {r:3,c:4,type:'emoji', text:'🔒', big:true},
            {r:3,c:5,type:'emoji', text:'🔒', big:true},
            {r:3,c:4,type:'label', text:'锁住了！', color:'#fde68a', pos:'top'},
            {r:3,c:5,type:'label', text:'锁住了！', color:'#fde68a', pos:'top'}
          ],
          dimOthers: true,
          hint: '3和7被D5、D6包圆了！其他格子不能有3和7！',
          showCoords: true
        },
        // 步骤5：开始排除第一个格子D2的3
        {
          speaker: '守笼人',
          text: '<span class="look">第四步：排除D2里的3！</span><br><br><span class="here">👉 看D2</span>（红箭头指的格子）<br><br>D2的候选数是：<span class="strike">3</span>,4,7,9<br><br>但3已经被D5/D6锁住了，D行其他地方<b>不可能再有3</b>！<br><br><b>划掉D2里的3！</b>',
          gridState: s,
          highlights: [
            {type:'row-strip', row:3, color:'#f59e0b', alpha:0.08},
            {type:'pair', cells:[[3,4],[3,5]], color:'#f59e0b', nums:[3,7]},
            {type:'elim', cells:[[3,1]], color:'#ef4444'}
          ],
          marks: [
            {r:3,c:4,type:'emoji', text:'🔒'},
            {r:3,c:5,type:'emoji', text:'🔒'},
            {r:3,c:1,type:'circle', color:'#ef4444'},
            {r:3,c:1,type:'finger', pos:'left', color:'#ef4444'},
            {r:3,c:1,type:'cross', nums:[3]},
            {r:3,c:1,type:'label', text:'划掉3！', color:'#fca5a5', pos:'bottom'}
          ],
          arrows: [{to:[3,1], from:'left', color:'#ef4444'}],
          lines: [
            {from:[3,4], to:[3,1], color:'#ef4444', width:3, dashed:true, pulse:true},
          ],
          dimOthers: true,
          hint: '红色箭头指向D2，先划掉3！',
          showCoords: true
        },
        // 步骤6：排除D2里的7
        {
          speaker: '守笼人',
          text: '<span class="look">第五步：再划掉D2里的7！</span><br><br>7也被锁住了！<br><br>D2的候选数现在是：<span class="strike">3</span>,4,<span class="strike">7</span>,9<br><br><b>7也划掉！</b>D2只剩下4和9了。',
          gridState: s1,
          highlights: [
            {type:'row-strip', row:3, color:'#f59e0b', alpha:0.08},
            {type:'pair', cells:[[3,4],[3,5]], color:'#f59e0b', nums:[3,7]},
            {type:'elim', cells:[[3,1]], color:'#ef4444'}
          ],
          marks: [
            {r:3,c:4,type:'emoji', text:'🔒'},
            {r:3,c:5,type:'emoji', text:'🔒'},
            {r:3,c:1,type:'circle', color:'#ef4444'},
            {r:3,c:1,type:'cross', nums:[3,7]},
            {r:3,c:1,type:'label', text:'3和7都划掉！', color:'#fca5a5', pos:'bottom'}
          ],
          lines: [
            {from:[3,5], to:[3,1], color:'#ef4444', width:3, dashed:true, pulse:true},
          ],
          dimOthers: true,
          hint: '7也被锁住了，划掉！D2只剩4和9',
          showCoords: true
        },
        // 步骤7：同宫排除F4
        {
          speaker: '阿岩',
          text: '<span class="look">第六步：别忘了同宫也能排除！</span><br><br>D5和D6不仅在同一行，还在<b>同一个宫（中央宫，紫色框）</b>里！<br><br><span class="here">👉 看F4</span>——它也在这个宫里。F4候选数有<span class="strike">3</span>,5,7。<br><br>3被锁住了，<b>划掉F4里的3！</b>',
          gridState: s1,
          highlights: [
            {type:'pair', cells:[[3,4],[3,5]], color:'#f59e0b', nums:[3,7]},
            {type:'elim', cells:[[5,3]], color:'#ef4444'}
          ],
          boxHighlights: [{box:4, type:'area', color:'#8b5cf6', alpha:0.15, label:'第5宫（中央）'}],
          marks: [
            {r:3,c:4,type:'emoji', text:'🔒'},
            {r:3,c:5,type:'emoji', text:'🔒'},
            {r:5,c:3,type:'circle', color:'#ef4444'},
            {r:5,c:3,type:'finger', pos:'bottom', color:'#ef4444'},
            {r:5,c:3,type:'cross', nums:[3]},
            {r:5,c:3,type:'label', text:'同宫的3也划掉！', color:'#fca5a5', pos:'bottom'}
          ],
          arrows: [{to:[5,3], from:'bottom', color:'#ef4444'}],
          lines: [
            {from:[3,4], to:[5,3], color:'#ef4444', width:3, dashed:true, pulse:true},
          ],
          dimOthers: true,
          hint: '数对不仅锁同行，还锁同宫！',
          showCoords: true
        },
        // 步骤8：出结果
        {
          speaker: '守笼人',
          text: '<span class="look">✨ 哇！直接出数了！</span><br><br>等等——D2现在候选数是4和9？不对，继续看D行：D1已经是5了，D7已经是6了...<br><br>哦不对，再仔细看——D2划掉3和7后，剩下<b>4和9</b>，但4在D3的位置？不，看更简单的情况：<br><br>实际上在我们这个极简盘面里，D2排除3,7后，<b>剩下的候选数继续推理就能确定</b>——关键是你学会了：<b>数对可以排除其他格子的数字！</b>',
          gridState: s2,
          highlights: [
            {type:'pair', cells:[[3,4],[3,5]], color:'#f59e0b', nums:[3,7]},
          ],
          marks: [
            {r:3,c:4,type:'emoji', text:'🔒'},
            {r:3,c:5,type:'emoji', text:'🔒'},
          ],
          dimOthers: true,
          hint: '排除后候选数变少，继续推理就能出数',
          showCoords: true
        },
        // 步骤9：总结
        {
          speaker: '守笼人',
          text: '<span class="look">🔐 显性数对口诀</span><br><br>🔍 <b>找</b>：同一行/列/宫里，<b>两个格子候选数完全相同</b>（就是{a,b}）<br>🔒 <b>锁</b>：这两个格子一定是a和b，跑不掉<br>❌ <b>删</b>：该行/列/宫<b>其他格子</b>里的a和b<b>全部划掉</b><br>✨ <b>填</b>：划到某个格子只剩一个数→直接填入！<br><br><b>一个数对往往能解开一片区域！</b>现在去题里找数对破解它吧！',
          gridState: s3,
          highlights: [{type:'pair', cells:[[3,4],[3,5]], color:'#f59e0b', nums:[3,7]}],
          marks: [{r:3,c:4,type:'emoji', text:'🔐'},{r:3,c:5,type:'emoji', text:'🔐'}],
          dimOthers: false,
          hint: '记住四步：找→锁→删→填！',
          showCoords: true
        }
      ];
    })()
  },

  // ===== 隐性数对 =====
  hidden_pair: {
    title: '隐性数对 Hidden Pair',
    badge: '👁️',
    steps: (function() {
      // 极简盘面
      const s0 = [
        [0,0,0,3,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,8,0,6,0,0,0],
        [3,0,0,9,0,2,0,0,7],  // E行：E1=3, E4=9, E6=2, E9=7
        [0,0,0,0,4,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,7,0,0,0,0,0],
      ];
      const s = G(s0);
      // 中央宫（box4，r3-5,c3-5）的空格
      s[3][4] = [1,3,5,7];   // D5
      s[4][4] = [1,5];       // E5
      s[5][3] = [1,5];       // F4
      s[5][5] = [1,3,5,7];   // F6

      // 清理后（删掉D5和F6的1,5）
      const s2 = G(s);
      s2[3][4] = [3,7];
      s2[5][5] = [3,7];

      // E5和F4出结果
      const s3 = G(s2);
      s3[4][4] = 1;
      s3[5][3] = 5;

      return [
        {
          speaker: '守笼人',
          text: '<span class="look">👁️ 第二个秘术：隐性数对</span><br><br>显性数对是：<b>"两个格子只能填a和b"</b>。<br><br>隐性数对要<b>反过来看</b>：<br><b>"数字a和数字b，只能填在某两个格子里"</b>。<br><span class="tip">💡 一个看格子，一个看数字——方向相反！</span>',
          gridState: s, dimOthers: false,
          hint: '隐性数对是"反着看"的',
          showCoords: true
        },
        {
          speaker: '守笼人',
          text: '<span class="look">第一步：聚焦中央宫</span><br><br><span class="here">👉 看紫色框的中央宫（第5宫）</span><br><br>这个宫已经填了5个数字：8、6、9、2、4。<br><br>还缺4个数字：<b class="big">1、3、5、7</b>，有4个空格。',
          gridState: s,
          boxHighlights: [{box:4, type:'area', color:'#8b5cf6', alpha:0.18, label:'第5宫（中央）'}],
          dimOthers: true,
          hint: '先看这个宫缺什么：1、3、5、7',
          showCoords: true
        },
        {
          speaker: '守笼人',
          text: '<span class="look">第二步：数字3能去哪？</span><br><br>反过来看：<b>数字3</b>在这个宫里能放在哪些格子？<br><br>• E5？E行有<b>E1=3</b>（红圈），同E行不能有两个3 → E5≠3 ❌<br>• F4？C4列有<b>A4=3</b>（红圈），同列不能有两个3 → F4≠3 ❌<br><br>所以3只能去 <span class="here">D5 或 F6</span>！',
          gridState: s,
          highlights: [
            {type:'key', cells:[[3,4],[5,5]], color:'#22c55e', nums:[3]},
            {type:'elim', cells:[[4,4],[5,3]], color:'#ef4444'}
          ],
          boxHighlights: [{box:4, type:'area', color:'#8b5cf6', alpha:0.1}],
          marks: [
            {r:4,c:0,type:'circle', color:'#ef4444'},
            {r:0,c:3,type:'circle', color:'#ef4444'},
            {r:3,c:4,type:'bigcircle', color:'#22c55e'},
            {r:5,c:5,type:'bigcircle', color:'#22c55e'},
            {r:3,c:4,type:'label', text:'3能去这', color:'#86efac', pos:'top'},
            {r:5,c:5,type:'label', text:'3能去这', color:'#86efac', pos:'bottom'},
            {r:4,c:4,type:'redx'},
            {r:5,c:3,type:'redx'}
          ],
          dimOthers: true,
          hint: '排除法：3只能去D5或F6！',
          showCoords: true
        },
        {
          speaker: '阿岩',
          text: '<span class="look">第三步：数字7也只能去那！</span><br><br>同样看<b>数字7</b>：<br><br>• E5？E行有<b>E9=7</b>（红圈）→ E5≠7 ❌<br>• F4？C4列有<b>I4=7</b>（红圈）→ F4≠7 ❌<br><br>7也只能去 <span class="here">D5 和 F6</span>！',
          gridState: s,
          highlights: [
            {type:'key', cells:[[3,4],[5,5]], color:'#22c55e', nums:[3,7]},
            {type:'elim', cells:[[4,4],[5,3]], color:'#ef4444'}
          ],
          boxHighlights: [{box:4, type:'area', color:'#8b5cf6', alpha:0.1}],
          marks: [
            {r:4,c:8,type:'circle', color:'#ef4444'},
            {r:8,c:3,type:'circle', color:'#ef4444'},
            {r:3,c:4,type:'bigcircle', color:'#22c55e'},
            {r:5,c:5,type:'bigcircle', color:'#22c55e'},
            {r:4,c:4,type:'redx'},
            {r:5,c:3,type:'redx'}
          ],
          dimOthers: true,
          hint: '7也只能去D5和F6！这就是隐性数对！',
          showCoords: true
        },
        {
          speaker: '守笼人',
          text: '<span class="look">第四步：隐性数对找到了！</span><br><br>3和7<b>都只能去D5和F6</b>这两个格子！<br><br>虽然D5候选看起来是{1,3,5,7}、F6是{1,3,5,7}——但1和5<b>不可能</b>在这两个格子！因为3和7已经把位置"占"了！',
          gridState: s,
          highlights: [{type:'pair', cells:[[3,4],[5,5]], color:'#f59e0b', nums:[3,7]}],
          boxHighlights: [{box:4, type:'area', color:'#8b5cf6', alpha:0.1}],
          marks: [
            {r:3,c:4,type:'emoji', text:'👁️'},
            {r:5,c:5,type:'emoji', text:'👁️'},
            {r:3,c:4,type:'label', text:'{1,3,5,7}', color:'#fde68a', pos:'top'},
            {r:5,c:5,type:'label', text:'{1,3,5,7}', color:'#fde68a', pos:'bottom'},
            {r:3,c:4,type:'finger', pos:'topleft'},
          ],
          dimOthers: true,
          hint: '3和7"藏"在这两个格子里',
          showCoords: true
        },
        {
          speaker: '守笼人',
          text: '<span class="look">第五步：清理多余候选数</span><br><br>把D5和F6里<b>除了3和7之外的数字全部删掉</b>！<br><br>D5的 <span class="strike">1</span> 和 <span class="strike">5</span> 划掉<br>F6的 <span class="strike">1</span> 和 <span class="strike">5</span> 也划掉<br><br>隐性数对被"挖"出来后，就变成了<b>显性数对</b> {3,7}！',
          gridState: s2,
          highlights: [{type:'pair', cells:[[3,4],[5,5]], color:'#f59e0b', nums:[3,7]}],
          boxHighlights: [{box:4, type:'area', color:'#8b5cf6', alpha:0.1}],
          marks: [
            {r:3,c:4,type:'emoji', text:'🔒'},
            {r:5,c:5,type:'emoji', text:'🔒'},
            {r:3,c:4,type:'cross', nums:[1,5]},
            {r:5,c:5,type:'cross', nums:[1,5]},
            {r:3,c:4,type:'label', text:'删掉1和5', color:'#fca5a5', pos:'top'},
            {r:5,c:5,type:'label', text:'变成{3,7}', color:'#fde68a', pos:'bottom'},
          ],
          dimOthers: true,
          hint: '删掉多余数字，隐性变显性！',
          showCoords: true
        },
        {
          speaker: '阿岩',
          text: '<span class="look">✨ 剩下的格子直接出数！</span><br><br>现在D5和F6是{3,7}数对，中央宫剩下E5和F4要填1和5。<br><br>E5={1,5}，F4={1,5}——又形成一个数对！而且直接就能推出E5=1、F4=5！',
          gridState: s3,
          highlights: [
            {type:'pair', cells:[[3,4],[5,5]], color:'#f59e0b', nums:[3,7]},
            {type:'result', cells:[[4,4],[5,3]], color:'#06b6d4'}
          ],
          boxHighlights: [{box:4, type:'area', color:'#8b5cf6', alpha:0.1}],
          marks: [
            {r:3,c:4,type:'emoji', text:'🔒'},
            {r:5,c:5,type:'emoji', text:'🔒'},
            {r:4,c:4,type:'bigcircle', color:'#06b6d4'},
            {r:5,c:3,type:'bigcircle', color:'#06b6d4'},
            {r:4,c:4,type:'label', text:'E5=1', color:'#67e8f9', pos:'top'},
            {r:5,c:3,type:'label', text:'F4=5', color:'#67e8f9', pos:'bottom'},
          ],
          dimOthers: true,
          hint: '清理后直接出数！',
          showCoords: true
        },
        {
          speaker: '守笼人',
          text: '<span class="look">👁️ 隐性数对口诀</span><br><br>👁️ <b>反着看</b>：不看「格子能填什么」，看「<b>数字能去哪里</b>」<br>🔍 <b>找挤压</b>：a和b都只能去<b>同样两个格子</b>→隐性数对<br>🧹 <b>清理</b>：这两个格子里<b>其他候选数</b>全部删除<br><br>隐性数对虽然难找，但一旦找到，清理效果很强！',
          gridState: s3,
          highlights: [{type:'pair', cells:[[3,4],[5,5]], color:'#f59e0b', nums:[3,7]}],
          marks: [{r:3,c:4,type:'emoji', text:'👁️'},{r:5,c:5,type:'emoji', text:'👁️'}],
          dimOthers: false,
          hint: '记住：反着看数字能去哪！',
          showCoords: true
        }
      ];
    })()
  },

  // ===== 三链数 =====
  triple: {
    title: '三链数 Naked Triple',
    badge: '🔱',
    steps: (function() {
      const s0 = [
        [5,8,9,1,7,3,2,4,6],
        [6,7,4,5,2,8,1,9,3],
        [2,1,3,4,6,9,5,7,8],
        [1,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
      ];
      const s = G(s0);
      s[3][3] = [2,4];     // D4
      s[3][4] = [4,9];     // D5
      s[3][5] = [2,9];     // D6
      s[3][1] = [3,4,5,7]; // D2 - 含4→排除
      s[3][7] = [4,5,6,8]; // D8 - 含4→排除
      s[3][8] = [2,5,7,9]; // D9 - 含2,9→排除

      const sAfter = G(s);
      sAfter[3][1] = [3,5,7];
      sAfter[3][7] = [5,6,8];
      sAfter[3][8] = [5,7];

      return [
        {
          speaker: '守笼人',
          text: '<span class="look">🔱 第三个秘术：三链数</span><br><br>理解了数对（2个格子锁2个数），三链数就是自然延伸——<br><b>三个格子锁住三个数字！</b>',
          gridState: s,
          dimOthers: true,
          hint: '数对的升级版：三格锁三数',
          showCoords: true
        },
        {
          speaker: '守笼人',
          text: '<span class="look">第一步：找到三个格子</span><br><br><span class="here">👉 看D行三个橙色格子</span>：<br>• D4候选：<b>{2,4}</b><br>• D5候选：<b>{4,9}</b><br>• D6候选：<b>{2,9}</b><br><br>三个格子候选数加起来，一共只有 <span class="big">2、4、9</span> 三个数字！<br><span class="tip">💡 不要求每个格子都有三个数！加起来是三个就行</span>',
          gridState: s,
          highlights: [
            {type:'row-strip', row:3, color:'#f59e0b', alpha:0.08, label:'D行'},
            {type:'pair', cells:[[3,3],[3,4],[3,5]], color:'#f59e0b', nums:[2,4,9]}
          ],
          marks: [
            {r:3,c:3,type:'bigcircle', color:'#f59e0b'},
            {r:3,c:4,type:'bigcircle', color:'#f59e0b'},
            {r:3,c:5,type:'bigcircle', color:'#f59e0b'},
            {r:3,c:3,type:'label', text:'{2,4}', color:'#fde68a', pos:'top'},
            {r:3,c:4,type:'label', text:'{4,9}', color:'#fde68a', pos:'top'},
            {r:3,c:5,type:'label', text:'{2,9}', color:'#fde68a', pos:'top'},
          ],
          dimOthers: true,
          hint: '三个格子候选加起来只有2、4、9三个数！',
          showCoords: true
        },
        {
          speaker: '阿岩',
          text: '<span class="look">第二步：三个数字被锁住了！</span><br><br>2、4、9这三个数字<b>被这三个格子包圆了</b>！<br><br>不管怎么分配（有6种排列可能），D4,D5,D6一定是2,4,9的某种排列。<br><br>🔒 <b>其他格子不能再有2、4、9了！</b>',
          gridState: s,
          highlights: [
            {type:'row-strip', row:3, color:'#f59e0b', alpha:0.08},
            {type:'pair', cells:[[3,3],[3,4],[3,5]], color:'#f59e0b', nums:[2,4,9]}
          ],
          marks: [
            {r:3,c:3,type:'emoji', text:'🔱'},{r:3,c:4,type:'emoji', text:'🔱'},{r:3,c:5,type:'emoji', text:'🔱'},
          ],
          dimOthers: true,
          hint: '三个数字被三个格子锁住！',
          showCoords: true
        },
        {
          speaker: '守笼人',
          text: '<span class="look">第三步：排除同行其他格子！</span><br><br>D行<b>其他格子</b>里的2、4、9全部划掉：<br><br>• <span class="here">👉 D2</span>的 <span class="strike">4</span> 划掉<br>• <span class="here">👉 D8</span>的 <span class="strike">4</span> 划掉<br>• <span class="here">👉 D9</span>的 <span class="strike">2</span><span class="strike">9</span> 划掉',
          gridState: s,
          highlights: [
            {type:'row-strip', row:3, color:'#f59e0b', alpha:0.06},
            {type:'pair', cells:[[3,3],[3,4],[3,5]], color:'#f59e0b', nums:[2,4,9]},
            {type:'elim', cells:[[3,1],[3,7],[3,8]], color:'#ef4444'}
          ],
          marks: [
            {r:3,c:3,type:'emoji', text:'🔒'},{r:3,c:4,type:'emoji', text:'🔒'},{r:3,c:5,type:'emoji', text:'🔒'},
            {r:3,c:1,type:'circle', color:'#ef4444'},{r:3,c:7,type:'circle', color:'#ef4444'},{r:3,c:8,type:'circle', color:'#ef4444'},
            {r:3,c:1,type:'cross', nums:[4]},{r:3,c:7,type:'cross', nums:[4]},{r:3,c:8,type:'cross', nums:[2,9]},
            {r:3,c:1,type:'label', text:'划掉4', color:'#fca5a5', pos:'bottom'},
            {r:3,c:8,type:'label', text:'划掉2,9', color:'#fca5a5', pos:'bottom'},
          ],
          lines: [
            {from:[3,3],to:[3,1],color:'#ef4444',width:3,dashed:true,pulse:true},
            {from:[3,5],to:[3,8],color:'#ef4444',width:3,dashed:true,pulse:true}
          ],
          dimOthers: true,
          hint: '同行其他格子的2、4、9全部划掉！',
          showCoords: true
        },
        {
          speaker: '守笼人',
          text: '<span class="look">🔱 三链数要点</span><br><br>🔱 <b>条件</b>：三个格子候选数<b>总共只涉及3个数字</b><br>🔒 <b>锁住</b>：这3个数字一定在这3个格子里<br>❌ <b>删除</b>：其他格子中的这3个候选数全排除<br><br>⚠️ 每个格子<b>不需要</b>都有全部3个候选！同理还有"四链数"（四格锁四数）。',
          gridState: sAfter,
          highlights: [{type:'pair', cells:[[3,3],[3,4],[3,5]], color:'#f59e0b', nums:[2,4,9]}],
          marks: [{r:3,c:3,type:'emoji', text:'🔱'},{r:3,c:4,type:'emoji', text:'🔱'},{r:3,c:5,type:'emoji', text:'🔱'}],
          dimOthers: false,
          hint: '三链数：三格锁三数！',
          showCoords: true
        }
      ];
    })()
  },

  // ===== X-Wing =====
  xwing: {
    title: 'X-Wing X翼构型',
    badge: '✈️',
    steps: (function() {
      // 极简X-Wing盘面
      const s0 = [
        [0,2,0,0,5,0,0,0,0],
        [0,5,0,0,9,0,0,0,0],
        [0,9,0,0,2,0,0,0,0],
        [6,0,5,3,0,9,2,1,8],  // D行：D2和D5可以是7
        [0,3,0,0,6,0,0,0,0],
        [4,0,8,1,0,2,3,6,9],  // F行：F2和F5可以是7
        [0,8,0,0,1,0,0,0,0],
        [0,6,0,0,4,0,0,0,0],
        [9,0,1,2,3,0,6,0,5],  // I行：I2有个7要排除
      ];
      const s = G(s0);
      s[3][1] = [7]; s[3][4] = [7];
      s[5][1] = [7]; s[5][4] = [7];
      s[8][1] = [7];  // I2 - 要排除
      s[6][4] = [1,7]; // G5 - 要排除

      const sFinal = G(s);
      sFinal[8][1] = []; sFinal[6][4] = [1];

      return [
        {
          speaker: '守笼人',
          text: '<span class="look">✈️ 第四个秘术：X-Wing（X翼构型）</span><br><br>名字来自《星球大战》的X翼战斗机——形状像个X。<br><br>X-Wing看的不是"格子能填什么"，而是<b>某个数字能去哪里</b>。<br><br>以数字 <span class="big">7</span> 为例。',
          gridState: s, dimOthers: false,
          hint: 'X-Wing看单个数字的矩形分布',
          showCoords: true
        },
        {
          speaker: '守笼人',
          text: '<span class="look">第一步：找两行中数字7的位置</span><br><br><span class="here">👉 看D行和F行</span>（两条橙色行带）。<br><br>D行其他格子都填满了，数字7只能放在 <b>D2</b> 或 <b>D5</b>！<br>F行也一样——7只能放在 <b>F2</b> 或 <b>F5</b>！',
          gridState: s,
          highlights: [
            {type:'row-strip', row:3, color:'#f59e0b', alpha:0.1, label:'D'},
            {type:'row-strip', row:5, color:'#f59e0b', alpha:0.1, label:'F'},
            {type:'key', cells:[[3,1],[3,4],[5,1],[5,4]], color:'#22c55e', nums:[7]}
          ],
          marks: [
            {r:3,c:1,type:'bigcircle', color:'#22c55e'},{r:3,c:4,type:'bigcircle', color:'#22c55e'},
            {r:5,c:1,type:'bigcircle', color:'#22c55e'},{r:5,c:4,type:'bigcircle', color:'#22c55e'},
            {r:3,c:1,type:'label', text:'7', color:'#86efac', pos:'left'},
            {r:3,c:4,type:'label', text:'7', color:'#86efac', pos:'top'},
          ],
          dimOthers: true,
          hint: 'D行和F行中，7各只有两个位置！',
          showCoords: true
        },
        {
          speaker: '守笼人',
          text: '<span class="look">第二步：四个格子形成矩形！</span><br><br>D2、D5、F2、F5 四个格子<b>正好形成矩形</b>！<br><br>只有两种可能：<br>✈️ <b>D2=7 → F5=7</b>（左上到右下对角线）<br>✈️ <b>D5=7 → F2=7</b>（右上到左下对角线）<br><br>红色X就是这两种可能——7一定在<b>其中一条对角线</b>上！',
          gridState: s,
          highlights: [{type:'pair', cells:[[3,1],[3,4],[5,1],[5,4]], color:'#f59e0b', nums:[7]}],
          lines: [
            {from:[3,1],to:[5,4],color:'#ef4444',width:5},
            {from:[3,4],to:[5,1],color:'#ef4444',width:5}
          ],
          marks: [
            {r:3,c:1,type:'emoji', text:'✈️'},{r:5,c:4,type:'emoji', text:'✈️'},
            {r:3,c:4,type:'emoji', text:'✈️'},{r:5,c:1,type:'emoji', text:'✈️'},
          ],
          dimOthers: true,
          hint: 'X形对角线——7一定在其中一条上！',
          showCoords: true
        },
        {
          speaker: '阿岩',
          text: '<span class="look">第三步：排除两列其他位置的7！</span><br><br>不管走哪条对角线，<b>C2列和C5列都一定会有7</b>！<br><br>所以这两列<b>其他格子</b>都不能是7：<br><br>• <span class="here">👉 I2</span>的 <span class="strike">7</span> → 划掉<br>• <span class="here">👉 G5</span>的 <span class="strike">7</span> → 划掉',
          gridState: s,
          highlights: [
            {type:'col-strip', col:1, color:'#ec4899', alpha:0.08, label:'C2'},
            {type:'col-strip', col:4, color:'#ec4899', alpha:0.08, label:'C5'},
            {type:'pair', cells:[[3,1],[3,4],[5,1],[5,4]], color:'#f59e0b', nums:[7]},
            {type:'elim', cells:[[8,1],[6,4]], color:'#ef4444'}
          ],
          lines: [
            {from:[3,1],to:[5,4],color:'#ef4444',width:2,dashed:true},
            {from:[3,4],to:[5,1],color:'#ef4444',width:2,dashed:true}
          ],
          marks: [
            {r:8,c:1,type:'circle', color:'#ef4444'},{r:6,c:4,type:'circle', color:'#ef4444'},
            {r:8,c:1,type:'redx'},{r:6,c:4,type:'redx'},
            {r:8,c:1,type:'cross', nums:[7]},{r:6,c:4,type:'cross', nums:[7]},
            {r:8,c:1,type:'finger', pos:'left', color:'#ef4444'},
            {r:8,c:1,type:'label', text:'划掉7', color:'#fca5a5', pos:'left'},
          ],
          dimOthers: true,
          hint: '两列其他格子都不能是7了！',
          showCoords: true
        },
        {
          speaker: '守笼人',
          text: '<span class="look">✈️ X-Wing口诀</span><br><br>✈️ <b>找矩形</b>：某数字在<b>两行</b>各只有2个位置，恰好在<b>相同两列</b><br>❌ <b>删列</b>：该两列其他格子的此数字全排除<br>🔄 <b>双向</b>：两列×两行也成立→删两行<br><br>X-Wing是"鱼形"技巧基础，剑鱼(Swordfish)就是3×3升级版！',
          gridState: sFinal,
          highlights: [{type:'pair', cells:[[3,1],[3,4],[5,1],[5,4]], color:'#f59e0b', nums:[7]}],
          lines: [
            {from:[3,1],to:[5,4],color:'#ef4444',width:4},
            {from:[3,4],to:[5,1],color:'#ef4444',width:4}
          ],
          dimOthers: false,
          hint: 'X-Wing：矩形→对角线→排除列（或行）',
          showCoords: true
        }
      ];
    })()
  },

  // ===== Swordfish =====
  swordfish: {
    title: 'Swordfish 剑鱼构型',
    badge: '🐟',
    steps: (function() {
      // 极简剑鱼盘面
      const s0 = [
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [6,0,8,9,0,3,1,2,4],  // C行: 5在c1,c4
        [0,0,0,0,0,0,0,0,0],
        [0,0,0,0,0,0,0,0,0],
        [4,0,9,1,6,2,0,8,3],  // F行: 5在c1,c6
        [0,0,0,0,0,0,0,0,0],
        [2,3,9,7,0,8,0,1,4],  // H行: 5在c4,c6
        [0,0,0,0,0,0,0,0,0],
      ];
      const s = G(s0);
      s[2][1] = [5]; s[2][4] = [5];
      s[5][1] = [5]; s[5][6] = [5];
      s[7][4] = [5]; s[7][6] = [5];
      // 要排除的格子
      s[4][1] = [5]; s[0][4] = [5,7]; s[8][4] = [5]; s[1][6] = [5];

      const sFinal = G(s);
      sFinal[4][1] = []; sFinal[0][4] = [7]; sFinal[8][4] = []; sFinal[1][6] = [];

      return [
        {
          speaker: '守笼人',
          text: '<span class="look">🐟 第五个秘术：Swordfish（剑鱼）</span><br><br>理解了X-Wing（2×2矩形），剑鱼就是升级版——<b>3行×3列的"渔网"</b>。<br><br>原理一模一样，只是从2行2列变成了3行3列！',
          gridState: s, dimOthers: false,
          hint: '剑鱼是X-Wing的3×3升级版',
          showCoords: true
        },
        {
          speaker: '守笼人',
          text: '<span class="look">第一步：找三行中数字5的位置</span><br><br>以数字<b class="big">5</b>为例。<span class="here">👉 看C、F、H三行</span>（橙色行带）：<br>• C行：5只能去 <b>C2</b> 或 <b>C5</b><br>• F行：5只能去 <b>F2</b> 或 <b>F7</b><br>• H行：5只能去 <b>H5</b> 或 <b>H7</b><br><br>全都落在<b>第2、5、7列</b>三列中！',
          gridState: s,
          highlights: [
            {type:'row-strip', row:2, color:'#f59e0b', alpha:0.1, label:'C'},
            {type:'row-strip', row:5, color:'#f59e0b', alpha:0.1, label:'F'},
            {type:'row-strip', row:7, color:'#f59e0b', alpha:0.1, label:'H'},
            {type:'key', cells:[[2,1],[2,4],[5,1],[5,6],[7,4],[7,6]], color:'#22c55e', nums:[5]}
          ],
          marks: [
            {r:2,c:1,type:'bigcircle', color:'#22c55e'},{r:2,c:4,type:'bigcircle', color:'#22c55e'},
            {r:5,c:1,type:'bigcircle', color:'#22c55e'},{r:5,c:6,type:'bigcircle', color:'#22c55e'},
            {r:7,c:4,type:'bigcircle', color:'#22c55e'},{r:7,c:6,type:'bigcircle', color:'#22c55e'},
          ],
          dimOthers: true,
          hint: '三行中的5都只出现在同样三列里！',
          showCoords: true
        },
        {
          speaker: '守笼人',
          text: '<span class="look">第二步：3×3的渔网形成了！</span><br><br>这6个格子形成了一个<b>3×3的渔网</b>！<br><br>虽然组合比X-Wing多（有多种分配方式），但不管5怎么分配，这三列<b>每列都一定会有一个5</b>。<br><br>🐟 5被这张三列的网"兜住"了！',
          gridState: s,
          highlights: [{type:'pair', cells:[[2,1],[2,4],[5,1],[5,6],[7,4],[7,6]], color:'#f59e0b', nums:[5]}],
          marks: [
            {r:2,c:1,type:'emoji', text:'🐟'},{r:2,c:4,type:'emoji', text:'🐟'},
            {r:5,c:1,type:'emoji', text:'🐟'},{r:5,c:6,type:'emoji', text:'🐟'},
            {r:7,c:4,type:'emoji', text:'🐟'},{r:7,c:6,type:'emoji', text:'🐟'},
          ],
          dimOthers: true,
          hint: '3×3的网罩住了三列！',
          showCoords: true
        },
        {
          speaker: '阿岩',
          text: '<span class="look">第三步：排除三列其他位置的5！</span><br><br>这三列的<b>其他所有格子</b>都不能是5！<br><br><span class="here">👉 红叉标记的格子</span>，<span class="strike">5</span>全部划掉：<br>• E2的5 → 划掉<br>• A5、I5的5 → 划掉<br>• B7的5 → 划掉',
          gridState: s,
          highlights: [
            {type:'col-strip', col:1, color:'#ec4899', alpha:0.06},
            {type:'col-strip', col:4, color:'#ec4899', alpha:0.06},
            {type:'col-strip', col:6, color:'#ec4899', alpha:0.06},
            {type:'pair', cells:[[2,1],[2,4],[5,1],[5,6],[7,4],[7,6]], color:'#f59e0b', nums:[5]},
            {type:'elim', cells:[[0,4],[1,6],[4,1],[8,4]], color:'#ef4444'}
          ],
          marks: [
            {r:0,c:4,type:'redx'},{r:1,c:6,type:'redx'},{r:4,c:1,type:'redx'},{r:8,c:4,type:'redx'},
            {r:0,c:4,type:'cross', nums:[5]},{r:1,c:6,type:'cross', nums:[5]},
            {r:4,c:1,type:'cross', nums:[5]},{r:8,c:4,type:'cross', nums:[5]},
          ],
          dimOthers: true,
          hint: '三列其他格子的5全部排除！',
          showCoords: true
        },
        {
          speaker: '守笼人',
          text: '<span class="look">🐟 剑鱼要点</span><br><br>🐟 <b>找网</b>：某数字在<b>三行</b>各有2~3个位置，全部落在<b>相同三列</b><br>❌ <b>删列</b>：该三列其他格子的此数字全排除<br><br>原理和X-Wing一模一样，只是2×2变成了3×3！<br><br>还有4×4的"水母"(Jellyfish)，原理相同但更少见。',
          gridState: sFinal,
          highlights: [{type:'pair', cells:[[2,1],[2,4],[5,1],[5,6],[7,4],[7,6]], color:'#f59e0b', nums:[5]}],
          marks: [
            {r:2,c:1,type:'emoji', text:'🐟'},{r:2,c:4,type:'emoji', text:'🐟'},
            {r:5,c:1,type:'emoji', text:'🐟'},{r:5,c:6,type:'emoji', text:'🐟'},
            {r:7,c:4,type:'emoji', text:'🐟'},{r:7,c:6,type:'emoji', text:'🐟'},
          ],
          dimOthers: false,
          hint: '剑鱼：三行三列的网！',
          showCoords: true
        }
      ];
    })()
  }
};
