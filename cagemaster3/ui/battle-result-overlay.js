/**
 * BattleResultOverlay - 对战结算面板独立 UI 组件
 *
 * 功能：
 *  - 胜负标题 + 图标（🏆胜利 / 💔失败 / 🤝平局）
 *  - 对手名称和头像
 *  - 双方得分对比条（玩家绿色 vs AI 红色，50% 中线）
 *  - 三色得分明细（简单/核心/胜负手），带进度条
 *  - 对战时长
 *  - 按钮组：「再来一局」+ 「继续/返回」
 *  - 数字滚动动画 + 进度条展开动画
 *  - 胜利金色发光脉动 / 失败灰度抖动特效
 *  - StoryEngine 对话集成
 *  - 胜利时 victory_short 音效，失败时 error 音效
 *
 * 不依赖 guide.js 内部变量，可独立工作。
 * 引用 storyEngine / AudioService 时做存在性检查。
 */
(function (global) {
  'use strict';

  // ============================================================
  //  内部状态
  // ============================================================
  let _overlay = null;
  let _card = null;
  let _options = null;
  let _visible = false;
  let _animTimers = [];
  let _escHandler = null;

  // ============================================================
  //  CSS 样式（动态注入）
  // ============================================================
  const STYLE_ID = 'battle-result-overlay-style';

  const CSS = `
/* ===== 对战结算浮层 ===== */
#battle-result-overlay {
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 100%;
  background: rgba(0, 0, 0, 0.85);
  z-index: 20001;
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 200ms ease;
}
#battle-result-overlay.show {
  opacity: 1;
}

/* 卡片容器 */
.bro-card {
  width: 90%;
  max-width: 440px;
  background: rgba(15, 23, 42, 0.95);
  border-radius: 16px;
  padding: 32px 24px 28px;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  transform: scale(0.95);
  opacity: 0;
  transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
#battle-result-overlay.show .bro-card {
  transform: scale(1);
  opacity: 1;
}

/* 胜负图标 */
.bro-icon {
  font-size: 56px;
  margin-bottom: 12px;
  line-height: 1;
}

/* 胜负标题 */
.bro-title {
  font-size: 32px;
  font-weight: 900;
  margin: 0 0 8px;
  letter-spacing: 2px;
}
.bro-title.win {
  color: #fbbf24;
}
.bro-title.lose {
  color: #f87171;
}
.bro-title.draw {
  color: #94a3b8;
}

/* 对手信息 */
.bro-opponent {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 24px;
  font-size: 14px;
  color: #94a3b8;
}
.bro-portrait {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

/* 得分对比条 */
.bro-score-compare {
  margin-bottom: 24px;
}
.bro-score-labels {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 6px;
}
.bro-score-bar-wrap {
  position: relative;
  height: 24px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  overflow: hidden;
}
.bro-score-bar-player {
  position: absolute;
  left: 0; top: 0;
  height: 100%;
  background: linear-gradient(90deg, #22c55e, #4ade80);
  border-radius: 12px 0 0 12px;
  width: 0%;
  transition: width 600ms cubic-bezier(0.22, 1, 0.36, 1);
}
.bro-score-bar-ai {
  position: absolute;
  right: 0; top: 0;
  height: 100%;
  background: linear-gradient(90deg, #ef4444, #f87171);
  border-radius: 0 12px 12px 0;
  width: 0%;
  transition: width 600ms cubic-bezier(0.22, 1, 0.36, 1);
}
.bro-score-midline {
  position: absolute;
  left: 50%;
  top: 0;
  height: 100%;
  width: 2px;
  background: rgba(255, 255, 255, 0.3);
  transform: translateX(-50%);
}
.bro-score-numbers {
  display: flex;
  justify-content: space-between;
  font-size: 16px;
  font-weight: 700;
  margin-top: 6px;
  font-variant-numeric: tabular-nums;
}
.bro-score-numbers .player { color: #4ade80; }
.bro-score-numbers .ai { color: #f87171; }

/* 三色得分明细 */
.bro-breakdown {
  text-align: left;
  margin-bottom: 24px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
}
.bro-breakdown-title {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 12px;
  letter-spacing: 1px;
}
.bro-breakdown-row {
  margin-bottom: 10px;
}
.bro-breakdown-row:last-child {
  margin-bottom: 0;
}
.bro-breakdown-header {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 4px;
}
.bro-breakdown-header .name { font-weight: 500; }
.bro-breakdown-header .name.simple { color: #86efac; }
.bro-breakdown-header .name.core   { color: #fde047; }
.bro-breakdown-header .name.gate   { color: #fca5a5; }
.bro-breakdown-header .value { color: #cbd5e1; }
.bro-breakdown-bar {
  display: flex;
  gap: 4px;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
}
.bro-breakdown-bar .player-seg {
  width: 0%;
  transition: width 500ms cubic-bezier(0.22, 1, 0.36, 1);
}
.bro-breakdown-bar .ai-seg {
  width: 0%;
  transition: width 500ms cubic-bezier(0.22, 1, 0.36, 1);
}
.bro-breakdown-bar.simple .player-seg { background: #22c55e; }
.bro-breakdown-bar.simple .ai-seg     { background: #ef4444; }
.bro-breakdown-bar.core   .player-seg { background: #eab308; }
.bro-breakdown-bar.core   .ai-seg     { background: #ef4444; }
.bro-breakdown-bar.gate   .player-seg { background: #dc2626; }
.bro-breakdown-bar.gate   .ai-seg     { background: #ef4444; }

/* 对战时长 */
.bro-duration {
  font-size: 13px;
  color: #94a3b8;
  margin-bottom: 28px;
}
.bro-duration span {
  color: #e2e8f0;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

/* 按钮组 */
.bro-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
.bro-btn {
  padding: 12px 28px;
  font-size: 15px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.15s;
  border: none;
  font-family: inherit;
}
.bro-btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.bro-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateY(-1px);
}
.bro-btn-secondary:active { transform: translateY(0); }

.bro-btn-primary {
  background: #fbbf24;
  color: #0f172a;
}
.bro-btn-primary:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}
.bro-btn-primary:active { transform: translateY(0); }

/* 对话区域 */
.bro-dialog {
  width: 90%;
  max-width: 440px;
  margin-top: 16px;
  min-height: 60px;
  padding: 14px 18px;
  background: rgba(15, 23, 42, 0.9);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
  font-size: 14px;
  line-height: 1.6;
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity 250ms ease, transform 250ms ease;
}
.bro-dialog.show {
  opacity: 1;
  transform: translateY(0);
}
.bro-dialog-speaker {
  font-weight: 700;
  color: #fbbf24;
  margin-bottom: 4px;
  font-size: 13px;
  letter-spacing: 1px;
}

/* ============================================================
   胜负特效
   ============================================================ */

/* 胜利：金色发光脉动 + 边框渐变 */
@keyframes broWinGlow {
  0%, 100% {
    text-shadow:
      0 0 20px rgba(251, 191, 36, 0.6),
      0 0 40px rgba(251, 191, 36, 0.4),
      0 0 60px rgba(251, 191, 36, 0.2);
  }
  50% {
    text-shadow:
      0 0 30px rgba(251, 191, 36, 0.9),
      0 0 60px rgba(251, 191, 36, 0.6),
      0 0 90px rgba(251, 191, 36, 0.3);
  }
}
.bro-title.win.pulse {
  animation: broWinGlow 1.8s ease-in-out infinite;
}

@keyframes broWinBorder {
  0%   { border-color: rgba(251, 191, 36, 0.3); box-shadow: 0 0 20px rgba(251, 191, 36, 0.1); }
  50%  { border-color: rgba(251, 191, 36, 0.8); box-shadow: 0 0 40px rgba(251, 191, 36, 0.3); }
  100% { border-color: rgba(251, 191, 36, 0.3); box-shadow: 0 0 20px rgba(251, 191, 36, 0.1); }
}
.bro-card.win-border {
  animation: broWinBorder 2.2s ease-in-out infinite;
}

/* 失败：整体轻微灰度 + 慢抖一下 */
@keyframes broLoseShake {
  0%, 100% { transform: translateX(0); }
  15%      { transform: translateX(-4px); }
  30%      { transform: translateX(4px); }
  45%      { transform: translateX(-3px); }
  60%      { transform: translateX(3px); }
  75%      { transform: translateX(-1px); }
  90%      { transform: translateX(1px); }
}
.bro-card.lose-shake {
  animation: broLoseShake 700ms ease-out;
}
.bro-card.lose-gray {
  filter: grayscale(0.4) brightness(0.85);
  transition: filter 400ms ease;
}
`;

  // ============================================================
  //  工具函数
  // ============================================================
  function _injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function _el(tag, className, html) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function _clearTimers() {
    _animTimers.forEach(t => clearTimeout(t));
    _animTimers = [];
  }

  function _setTimeout(fn, ms) {
    const t = setTimeout(() => {
      _animTimers = _animTimers.filter(x => x !== t);
      fn();
    }, ms);
    _animTimers.push(t);
    return t;
  }

  function _formatDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // 数字滚动动画
  function _animateNumber(el, target, duration) {
    duration = duration || 600;
    const start = 0;
    const startTime = Date.now();
    const isFloat = target % 1 !== 0;
    const step = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = start + (target - start) * easeOut;
      el.textContent = isFloat ? current.toFixed(1) : Math.round(current);
      if (progress < 1) requestAnimationFrame(step);
    };
    step();
  }

  // ============================================================
  //  DOM 构建
  // ============================================================
  function _ensureDOM() {
    // 优先使用 guide.html 中已有的 #battle-result-overlay
    let overlay = document.getElementById('battle-result-overlay');
    if (overlay) {
      // 清空旧内容，用组件内的新结构替换
      overlay.innerHTML = '';
    } else {
      overlay = document.createElement('div');
      overlay.id = 'battle-result-overlay';
      document.body.appendChild(overlay);
    }
    _overlay = overlay;
    return overlay;
  }

  function _buildCard(opts) {
    const card = _el('div', 'bro-card');
    _card = card;

    // --- 图标 ---
    const icon = _el('div', 'bro-icon');
    const iconMap = { win: '🏆', lose: '💔', draw: '🤝' };
    icon.textContent = iconMap[opts.result] || '🏆';
    card.appendChild(icon);

    // --- 标题 ---
    const title = _el('h2', 'bro-title ' + opts.result);
    const titleMap = { win: '胜利', lose: '失败', draw: '平局' };
    title.textContent = titleMap[opts.result] || '对战结束';
    card.appendChild(title);

    // --- 对手信息 ---
    const opponent = _el('div', 'bro-opponent');
    if (opts.bossPortrait) {
      const img = _el('img', 'bro-portrait');
      img.src = opts.bossPortrait;
      img.alt = opts.bossName || '对手';
      opponent.appendChild(img);
    }
    const vsText = _el('span');
    vsText.textContent = `VS ${opts.bossName || '对手'}`;
    opponent.appendChild(vsText);
    card.appendChild(opponent);

    // --- 得分对比条 ---
    const compare = _el('div', 'bro-score-compare');

    const labels = _el('div', 'bro-score-labels');
    labels.innerHTML = '<span>你</span><span>对手</span>';
    compare.appendChild(labels);

    const barWrap = _el('div', 'bro-score-bar-wrap');
    const playerBar = _el('div', 'bro-score-bar-player');
    const aiBar = _el('div', 'bro-score-bar-ai');
    const midline = _el('div', 'bro-score-midline');
    barWrap.appendChild(playerBar);
    barWrap.appendChild(aiBar);
    barWrap.appendChild(midline);
    compare.appendChild(barWrap);

    const numbers = _el('div', 'bro-score-numbers');
    numbers.innerHTML =
      '<span class="player" id="bro-player-score">0</span>' +
      '<span class="ai" id="bro-ai-score">0</span>';
    compare.appendChild(numbers);
    card.appendChild(compare);

    // --- 三色得分明细 ---
    if (opts.isWeighted && opts.scoreBreakdown) {
      const breakdown = _el('div', 'bro-breakdown');
      breakdown.innerHTML = '<div class="bro-breakdown-title">得分明细</div>';

      const rows = [
        { key: 'simple', label: '🟢 简单格', weight: '×1' },
        { key: 'core',   label: '🟡 核心格', weight: '×1.5' },
        { key: 'gate',   label: '🔴 胜负手', weight: '×2' },
      ];

      rows.forEach(row => {
        const p = opts.scoreBreakdown.player[row.key];
        const a = opts.scoreBreakdown.ai[row.key];
        const pCount = p.count !== undefined ? p.count : p;
        const aCount = a.count !== undefined ? a.count : a;
        const pScore = p.score !== undefined ? p.score : p;
        const aScore = a.score !== undefined ? a.score : a;

        const rowEl = _el('div', 'bro-breakdown-row');
        const header = _el('div', 'bro-breakdown-header');
        header.innerHTML =
          `<span class="name ${row.key}">${row.label}</span>` +
          `<span class="value">你 ${pCount} / 对手 ${aCount}  ${row.weight}</span>`;
        rowEl.appendChild(header);

        const barEl = _el('div', `bro-breakdown-bar ${row.key}`);
        const pSeg = _el('div', 'player-seg');
        pSeg.dataset.score = pScore;
        const aSeg = _el('div', 'ai-seg');
        aSeg.dataset.score = aScore;
        barEl.appendChild(pSeg);
        barEl.appendChild(aSeg);
        rowEl.appendChild(barEl);

        breakdown.appendChild(rowEl);
      });

      card.appendChild(breakdown);
    }

    // --- 对战时长 ---
    const duration = _el('div', 'bro-duration');
    const sec = opts.duration != null ? opts.duration : 0;
    duration.innerHTML = `对战时长：<span>${_formatDuration(sec)}</span>`;
    card.appendChild(duration);

    // --- 按钮组 ---
    const actions = _el('div', 'bro-actions');

    const retryBtn = _el('button', 'bro-btn bro-btn-secondary', '再来一局');
    retryBtn.id = 'btn-battle-retry';
    retryBtn.addEventListener('click', () => {
      if (typeof opts.onRetry === 'function') opts.onRetry();
    });
    actions.appendChild(retryBtn);

    const primaryBtn = _el('button', 'bro-btn bro-btn-primary');
    primaryBtn.id = 'btn-battle-back';
    if (opts.result === 'win') {
      primaryBtn.textContent = '继续';
      primaryBtn.addEventListener('click', () => {
        if (typeof opts.onContinue === 'function') opts.onContinue();
      });
    } else {
      primaryBtn.textContent = '返回关卡';
      primaryBtn.addEventListener('click', () => {
        if (typeof opts.onBackToLevel === 'function') opts.onBackToLevel();
      });
    }
    actions.appendChild(primaryBtn);
    card.appendChild(actions);

    return card;
  }

  function _buildDialogBox() {
    const dlg = _el('div', 'bro-dialog');
    dlg.id = 'bro-dialog-box';
    dlg.innerHTML =
      '<div class="bro-dialog-speaker" id="bro-dialog-speaker"></div>' +
      '<div class="bro-dialog-text" id="bro-dialog-text"></div>';
    return dlg;
  }

  // ============================================================
  //  动画与特效
  // ============================================================
  function _playResultAnimations(opts) {
    const playerScore = opts.playerScore != null ? opts.playerScore : 0;
    const aiScore = opts.aiScore != null ? opts.aiScore : 0;
    const winTarget = opts.winTarget || 1;
    const maxScore = Math.max(playerScore + aiScore, winTarget, 1);

    // 主进度条 + 数字滚动
    _setTimeout(() => {
      const playerBar = _overlay.querySelector('.bro-score-bar-player');
      const aiBar = _overlay.querySelector('.bro-score-bar-ai');
      const playerNum = _overlay.querySelector('.bro-score-numbers .player');
      const aiNum = _overlay.querySelector('.bro-score-numbers .ai');

      const playerPct = Math.min((playerScore / maxScore) * 100, 100);
      const aiPct = Math.min((aiScore / maxScore) * 100, 100);

      if (playerBar) playerBar.style.width = playerPct + '%';
      if (aiBar) aiBar.style.width = aiPct + '%';
      if (playerNum) _animateNumber(playerNum, playerScore);
      if (aiNum) _animateNumber(aiNum, aiScore);
    }, 250);

    // 三色明细进度条
    if (opts.isWeighted && opts.scoreBreakdown) {
      _setTimeout(() => {
        const rows = _overlay.querySelectorAll('.bro-breakdown-row');
        rows.forEach(row => {
          const pSeg = row.querySelector('.player-seg');
          const aSeg = row.querySelector('.ai-seg');
          if (!pSeg || !aSeg) return;
          const p = parseFloat(pSeg.dataset.score) || 0;
          const a = parseFloat(aSeg.dataset.score) || 0;
          const total = p + a || 1;
          pSeg.style.width = (p / total * 100) + '%';
          aSeg.style.width = (a / total * 100) + '%';
        });
      }, 500);
    }

    // 胜负特效
    if (opts.result === 'win') {
      _setTimeout(() => {
        const title = _overlay.querySelector('.bro-title');
        const card = _overlay.querySelector('.bro-card');
        if (title) title.classList.add('pulse');
        if (card) card.classList.add('win-border');
      }, 600);
    } else if (opts.result === 'lose') {
      _setTimeout(() => {
        const card = _overlay.querySelector('.bro-card');
        if (card) {
          card.classList.add('lose-gray');
          card.classList.add('lose-shake');
        }
      }, 400);
    }
  }

  // ============================================================
  //  StoryEngine 对话集成
  // ============================================================
  function _playDialog(dialogLines, callback) {
    if (!dialogLines || !dialogLines.length) {
      if (typeof callback === 'function') callback();
      return;
    }

    // 检查 storyEngine 是否存在
    const se = global.storyEngine;
    if (!se || typeof se.sayLines !== 'function') {
      // 降级：逐行显示在面板下方
      _playDialogFallback(dialogLines, callback);
      return;
    }

    // 创建对话显示区
    const dialogBox = _buildDialogBox();
    _overlay.appendChild(dialogBox);

    // 强制重排后显示
    requestAnimationFrame(() => {
      dialogBox.classList.add('show');
    });

    const speakerEl = dialogBox.querySelector('#bro-dialog-speaker');
    const textEl = dialogBox.querySelector('#bro-dialog-text');

    // 构造 sayLines 的回调：每一句都同步到对话框
    // 由于 storyEngine.sayLines 是整组播放，结束时才调用 callback，
    // 我们通过包装 lines 来监听每一句的变化。
    // 这里采用简化策略：先显示第一句，再调用 sayLines，结束时隐藏。
    if (dialogLines[0]) {
      speakerEl.textContent = dialogLines[0].speaker || '';
      textEl.textContent = dialogLines[0].text || '';
    }

    try {
      se.sayLines(dialogLines, () => {
        // 对话结束，渐隐对话框
        dialogBox.classList.remove('show');
        _setTimeout(() => {
          if (dialogBox.parentNode) dialogBox.parentNode.removeChild(dialogBox);
        }, 300);
        if (typeof callback === 'function') callback();
      });
    } catch (e) {
      console.warn('[BattleResultOverlay] sayLines error:', e);
      dialogBox.classList.remove('show');
      if (typeof callback === 'function') callback();
    }
  }

  function _playDialogFallback(dialogLines, callback) {
    if (!dialogLines || !dialogLines.length) {
      if (typeof callback === 'function') callback();
      return;
    }
    const dialogBox = _buildDialogBox();
    _overlay.appendChild(dialogBox);
    requestAnimationFrame(() => dialogBox.classList.add('show'));

    const speakerEl = dialogBox.querySelector('#bro-dialog-speaker');
    const textEl = dialogBox.querySelector('#bro-dialog-text');
    let idx = 0;

    const showNext = () => {
      if (idx >= dialogLines.length) {
        dialogBox.classList.remove('show');
        _setTimeout(() => {
          if (dialogBox.parentNode) dialogBox.parentNode.removeChild(dialogBox);
        }, 300);
        if (typeof callback === 'function') callback();
        return;
      }
      const line = dialogLines[idx];
      speakerEl.textContent = line.speaker || '';
      textEl.textContent = line.text || '';
      idx++;
      _setTimeout(showNext, 2500);
    };
    showNext();
  }

  // ============================================================
  //  音效
  // ============================================================
  function _playSfx(result) {
    const as = global.AudioService;
    if (!as || !as.sfx || typeof as.sfx.play !== 'function') return;
    try {
      if (result === 'win') {
        as.sfx.play('victory_short');
      } else if (result === 'lose') {
        as.sfx.play('error');
      }
    } catch (e) {
      console.warn('[BattleResultOverlay] sfx error:', e);
    }
  }

  // ============================================================
  //  ESC 处理
  // ============================================================
  function _setupEscHandler(opts) {
    _escHandler = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', _escHandler);
        _escHandler = null;
        if (opts.result === 'win' && typeof opts.onContinue === 'function') {
          opts.onContinue();
        } else if (opts.result !== 'win' && typeof opts.onBackToLevel === 'function') {
          opts.onBackToLevel();
        }
      }
    };
    document.addEventListener('keydown', _escHandler);
  }

  // ============================================================
  //  公共 API
  // ============================================================
  const BattleResultOverlay = {
    /**
     * 显示对战结算面板
     * @param {Object} options
     * @param {'win'|'lose'|'draw'} options.result
     * @param {string} [options.bossName]
     * @param {string} [options.bossPortrait]
     * @param {number} [options.playerScore]
     * @param {number} [options.aiScore]
     * @param {number} [options.winTarget]
     * @param {boolean} [options.isWeighted]
     * @param {Object} [options.scoreBreakdown]
     * @param {number} [options.duration] - 秒
     * @param {Array} [options.dialog] - [{ speaker, text, voiceId? }]
     * @param {Function} [options.onRetry]
     * @param {Function} [options.onContinue]
     * @param {Function} [options.onBackToLevel]
     */
    show(options) {
      _options = options || {};
      const opts = _options;

      // 注入样式
      _injectStyle();

      // 确保 DOM
      _ensureDOM();

      // 构建卡片
      const card = _buildCard(opts);
      _overlay.appendChild(card);

      // 显示浮层（直接操作 style 覆盖内联样式）
      _overlay.style.display = 'flex';
      // 强制设置 opacity，确保覆盖内联样式中的 opacity:0
      // 使用双重保险：先立即设置，再在下一帧确认
      _overlay.style.opacity = '1';
      _overlay.classList.add('show');
      // 额外保险：下一帧再次确认
      requestAnimationFrame(() => {
        if (_overlay) {
          _overlay.style.opacity = '1';
          _overlay.classList.add('show');
        }
      });
      _visible = true;

      // 播放音效
      _playSfx(opts.result);

      // 启动结果动画
      _playResultAnimations(opts);

      // 对话集成（面板显示后播放）
      if (opts.dialog && opts.dialog.length > 0) {
        _setTimeout(() => {
          _playDialog(opts.dialog);
        }, 800);
      }

      // ESC 关闭
      _setupEscHandler(opts);

      // 点击背景
      const bgClick = (e) => {
        if (e.target === _overlay) {
          _overlay.removeEventListener('click', bgClick);
          if (opts.result === 'win' && typeof opts.onContinue === 'function') {
            opts.onContinue();
          } else if (opts.result !== 'win' && typeof opts.onBackToLevel === 'function') {
            opts.onBackToLevel();
          }
        }
      };
      _overlay.addEventListener('click', bgClick);
    },

    /**
     * 隐藏对战结算面板
     */
    hide() {
      if (!_overlay || !_visible) return;
      _overlay.style.opacity = '0';
      _overlay.classList.remove('show');
      _clearTimers();
      if (_escHandler) {
        document.removeEventListener('keydown', _escHandler);
        _escHandler = null;
      }
      const t = setTimeout(() => {
        if (_overlay) {
          _overlay.style.display = 'none';
          _overlay.innerHTML = '';
        }
        _visible = false;
        _card = null;
        _options = null;
      }, 250);
      _animTimers.push(t);
    },

    /**
     * 是否可见
     * @returns {boolean}
     */
    isVisible() {
      return _visible;
    },
  };

  // 导出
  global.BattleResultOverlay = BattleResultOverlay;

})(window);
