// 书写 / 擦除动画（4.7.3：钢笔逐笔画出）— 重构阶段 1 从 game.html 拆出
// 共享状态经 window.CM 访问：CM.uiCanvas / CM.lessonActive / CM._canvasCellSize（game.html 挂载）
const CM = window.CM;

// 数字 1-9 的钢笔笔画（归一化坐标，中心原点，y 向上，±0.3）
const WRITE_STROKES = {
  '1': [[[-0.04, 0.30], [-0.04, -0.28]]],
  '2': [[[-0.24, 0.14], [-0.20, 0.28], [0.22, 0.28], [0.26, 0.10], [0.04, -0.10], [-0.24, -0.28], [0.26, -0.28]]],
  '3': [[[-0.22, 0.28], [0.22, 0.28], [0.18, 0.06], [0.02, 0.06], [0.18, 0.06], [0.22, -0.08], [0.14, -0.26], [-0.22, -0.26]]],
  '4': [[[0.20, 0.28], [-0.10, -0.08], [0.24, -0.08]], [[0.06, -0.28], [0.06, 0.28]]],
  '5': [[[-0.24, 0.28], [0.22, 0.28], [0.24, 0.06], [-0.14, 0.04], [-0.24, -0.08], [-0.18, -0.24], [0.22, -0.26]]],
  '6': [[[0.02, -0.28], [-0.12, -0.20], [-0.22, -0.04], [-0.16, 0.20], [-0.02, 0.28], [0.14, 0.20], [0.18, 0.04], [0.02, -0.06], [-0.18, -0.06]]],
  '7': [[[-0.24, 0.28], [0.24, 0.28]], [[0.14, 0.28], [0.00, -0.12], [-0.18, -0.28]]],
  '8': [[[-0.16, 0.22], [-0.02, 0.28], [0.14, 0.22], [0.16, 0.08], [-0.16, -0.08], [-0.18, -0.22], [-0.04, -0.28], [0.14, -0.22], [0.16, -0.06], [-0.14, 0.14], [-0.16, 0.22]]],
  '9': [[[0.14, -0.28], [0.02, -0.20], [0.00, 0.02], [0.14, 0.06], [0.20, -0.06], [0.16, -0.24], [-0.02, -0.28], [-0.18, -0.20], [-0.20, -0.04], [-0.08, 0.20], [0.08, 0.28]]],
};
let _writeAnim = null; // 当前书写动画 { raf, done }
function _strokeLen(s) { let d = 0; for (let i = 1; i < s.length; i++) { d += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); } return d; }
function _strokeTotal(strokes) { return strokes.reduce((a, s) => a + _strokeLen(s), 0); }

/**
 * 逐笔绘制（教学 300~500ms / 自由 150~250ms）；erase=true 逆序擦除（1.5 倍速）
 * @param {number} r - 行
 * @param {number} c - 列
 * @param {number} num - 数字 1-9
 * @param {boolean} [erase] - 擦除模式
 */
export function playWriteAnimation(r, c, num, erase) {
  const strokes = WRITE_STROKES[String(num)];
  if (!strokes) return;
  if (_writeAnim) { cancelAnimationFrame(_writeAnim.raf); _writeAnim = null; }
  const dur = erase ? 150 : (CM.lessonActive ? 420 : 210);
  const total = _strokeTotal(strokes);
  const dpr = window.devicePixelRatio || 1;
  const ctx = CM.uiCanvas.getContext('2d');
  const t0 = performance.now();
  const tick = () => {
    const el = performance.now() - t0;
    const p = Math.min(1, el / dur);
    // 清空本格区域（避免与选中格叠加残留），然后重画当前进度笔画
    const geo = CM._canvasCellSize();
    if (geo.cs <= 0) { _writeAnim = null; return; }
    const padL = geo.padL, padT = geo.padT, cs = geo.cs;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(padL + c * cs, padT + r * cs, cs, cs);
    ctx.save();
    ctx.translate(padL + (c + 0.5) * cs, padT + (r + 0.5) * cs);
    ctx.scale(cs * 0.62, -cs * 0.62);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = 0.16;
    ctx.strokeStyle = erase ? 'rgba(139, 69, 19, 0.75)' : '#1a3a5c';  // 擦除=棕红、书写=钢笔水
    let remain = p * total;
    for (let s = 0; s < strokes.length && remain > 0; s++) {
      const seg = strokes[s];
      for (let i = 1; i < seg.length && remain > 0; i++) {
        const d = Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]);
        if (remain >= d) {
          ctx.beginPath(); ctx.moveTo(seg[i - 1][0], seg[i - 1][1]); ctx.lineTo(seg[i][0], seg[i][1]); ctx.stroke();
          remain -= d;
        } else {
          const t = remain / d;
          ctx.beginPath(); ctx.moveTo(seg[i - 1][0], seg[i - 1][1]);
          ctx.lineTo(seg[i - 1][0] + (seg[i][0] - seg[i - 1][0]) * t, seg[i - 1][1] + (seg[i][1] - seg[i - 1][1]) * t);
          ctx.stroke();
          remain = 0;
        }
      }
    }
    ctx.restore();
    if (p < 1) {
      _writeAnim = { raf: requestAnimationFrame(tick) };
    } else {
      // 定笔闪光 50ms
      ctx.clearRect(padL + c * cs, padT + r * cs, cs, cs);
      if (!erase) {
        const flash = ctx.createRadialGradient(padL + (c + 0.5) * cs, padT + (r + 0.5) * cs, 0, padL + (c + 0.5) * cs, padT + (r + 0.5) * cs, cs * 0.5);
        flash.addColorStop(0, 'rgba(251, 191, 36, 0.5)');
        flash.addColorStop(1, 'rgba(251, 191, 36, 0)');
        ctx.fillStyle = flash;
        ctx.fillRect(padL + c * cs, padT + r * cs, cs, cs);
        setTimeout(() => { ctx.clearRect(padL + c * cs, padT + r * cs, cs, cs); }, 60);
      }
      _writeAnim = null;
    }
  };
  _writeAnim = { raf: requestAnimationFrame(tick) };
}
