// 自由模式（随机/计时/每日/无尽 + 全部关卡列表）— 重构阶段 1 从 game.html 拆出
// 共享状态经 window.CM；壳层函数 import 自 ./book-shell.js
import { bookFlipTo, showBookShell, hideBookShell, openGalleryInBook } from './book-shell.js';

const CM = window.CM || (window.CM = {});

// —— freeplay 列表（4.9 附录-2）——
function renderFreeplayList() {
  const box = document.getElementById('freeplayListBook');
  if (!box || !CM.lm) return;
  const ids = CM.lm.getAllLevelIds() || [];
  let html = '';
  ids.forEach((id) => {
    const done = CM.lm.isLevelCompleted(id);
    const unlocked = CM.lm.isLevelUnlocked(id);
    const status = done ? '✅' : (unlocked ? '➜' : '🔒');
    html += '<div class="fp-level-row' + (unlocked ? '' : ' locked') + '" data-id="' + id + '">' +
      '<span class="fp-lv-status">' + status + '</span>' +
      '<span>关卡 #' + id + '</span></div>';
  });
  box.innerHTML = html;
  box.querySelectorAll('.fp-level-row').forEach((row) => {
    row.addEventListener('click', () => {
      const id = parseInt(row.dataset.id, 10);
      if (!CM.lm.isLevelUnlocked(id)) { CM.toast('该关卡尚未解锁', 1800); return; }
      enterFreeplayLevel(id, 'random');
    });
  });
}

// —— 进入自由关卡（统一入口）——
function enterFreeplayLevel(levelId, mode) {
  CM._freeplayMode = mode;
  try { hideBookShell(); } catch (e) {}
  document.body.classList.add('book-theme');
  if (mode === 'timed') { startTimedMode(); }
  if (mode === 'endless') { startEndlessMode(); }
  CM.gameApp.startLevel(levelId).then((res) => {
    if (res && !res.success) CM.toast('自由模式关卡启动失败');
  }).catch(() => {});
}

// —— 随机挑战：优先 X-Wing 池随机，池未就绪用现有关卡随机 ——
function startRandomChallenge() {
  if (CM.poolManager && CM.poolManager.isLoaded()) {
    const entry = CM.poolManager.getRandomLevel();
    if (entry) {
      const levelData = CM.poolManager.toLevelData(entry);
      CM._freeplayMode = 'random';
      try { hideBookShell(); } catch (e) {}
      document.body.classList.add('book-theme');
      CM.gameApp.startLevelFromData(levelData.levelId, levelData);
      return;
    }
  }
  // 兜底：现有关卡随机
  const ids = CM.lm.getAllLevelIds() || [];
  if (!ids.length) { CM.toast('无可用关卡'); return; }
  const id = ids[Math.floor(Math.random() * ids.length)];
  enterFreeplayLevel(id, 'random');
}

// —— 每日一题：YYYYMMDD 种子选关 ——
function startDailyChallenge() {
  const d = new Date();
  const seed = parseInt(d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'), 10);
  const ids = CM.lm.getAllLevelIds() || [];
  if (!ids.length) { CM.toast('无可用关卡'); return; }
  const id = ids[seed % ids.length];
  CM.toast('📊 今日一题 · 关卡 #' + id, 2000);
  enterFreeplayLevel(id, 'daily');
}

// —— 计时模式：进入关卡开始计时，完成记录最佳 ——
function startTimedMode() {
  CM._timedStartTs = Date.now();
  if (CM._timedTicker) clearInterval(CM._timedTicker);
  updateEndlessHud();
  CM._timedTicker = setInterval(updateEndlessHud, 1000);
  showEndlessHud(true);
}
function stopTimedMode() {
  if (CM._timedTicker) { clearInterval(CM._timedTicker); CM._timedTicker = null; }
  showEndlessHud(false);
}
function timedElapsedSec() {
  return CM._timedStartTs ? Math.floor((Date.now() - CM._timedStartTs) / 1000) : 0;
}

// —— 无尽模式（4.10：书最后一页）——
function startEndlessMode() {
  if (CM._endlessTicker) clearInterval(CM._endlessTicker);
  CM._endlessRun = 0;
  CM._endlessMoves = 0;
  CM._timedStartTs = Date.now();
  updateEndlessHud();
  CM._endlessTicker = setInterval(updateEndlessHud, 1000);
  showEndlessHud(true);
}
function stopEndlessMode() {
  if (CM._endlessTicker) { clearInterval(CM._endlessTicker); CM._endlessTicker = null; }
  showEndlessHud(false);
}
function showEndlessHud(on) {
  const h = document.getElementById('endlessHud');
  if (h) h.classList.toggle('show', !!on);
}
function updateEndlessHud() {
  const sec = timedElapsedSec();
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  const t = document.getElementById('ehTime');
  const m = document.getElementById('ehMoves');
  const r = document.getElementById('ehRun');
  if (t) t.textContent = mm + ':' + ss;
  if (m) m.textContent = String(CM._endlessMoves);
  if (r) r.textContent = CM._freeplayMode === 'endless' ? ('第 ' + (CM._endlessRun + 1) + ' 局') : '计时中';
  // 同步无尽页状态栏
  const pt = document.getElementById('endlessTime');
  const pm = document.getElementById('endlessMoves');
  const pr = document.getElementById('endlessRun');
  const pb = document.getElementById('endlessBest');
  if (pt) pt.textContent = mm + ':' + ss;
  if (pm) pm.textContent = String(CM._endlessMoves);
  if (pr) pr.textContent = String(CM._endlessRun);
  if (pb) pb.textContent = String(getEndlessBest());
}
function getEndlessBest() {
  try { return parseInt(localStorage.getItem('cagemaster4_endless_best') || '0', 10); } catch (e) { return 0; }
}
function saveEndlessBest() {
  try {
    const best = Math.max(getEndlessBest(), CM._endlessRun);
    localStorage.setItem('cagemaster4_endless_best', String(best));
  } catch (e) {}
}
// 无尽模式下一局：随机取关
function nextEndlessLevel() {
  if (CM.poolManager && CM.poolManager.isLoaded()) {
    const entry = CM.poolManager.getRandomLevel();
    if (entry) {
      const levelData = CM.poolManager.toLevelData(entry);
      CM.gameApp.startLevelFromData(levelData.levelId, levelData);
      return;
    }
  }
  const ids = CM.lm.getAllLevelIds() || [];
  if (!ids.length) { stopEndlessMode(); CM._freeplayMode = 'none'; return; }
  CM.gameApp.startLevel(ids[Math.floor(Math.random() * ids.length)]);
}
// 无尽完成一局
function handleEndlessComplete() {
  CM._endlessRun++;
  CM._endlessMoves = 0;
  saveEndlessBest();
  updateEndlessHud();
  // 纸面痕迹：局数越多越深（规格 4.10：opacity = 0.05 × 局数/50 = 0.001×局数，封顶 0.35）
  try {
    const trace = document.getElementById('endlessTrace');
    if (trace) {
      trace.classList.add('show');
      trace.style.opacity = String(Math.min(0.35, CM._endlessRun * 0.001));
    }
  } catch (e) {}
  CM.toast('🏆 第 ' + CM._endlessRun + ' 局完成！', 1600);
  // 600ms 后自动下一局（新棋盘覆盖旧棋盘）
  setTimeout(() => { if (CM._freeplayMode === 'endless') nextEndlessLevel(); }, 600);
}

// —— 自由模式完成（非无尽）：停表 → 记录最佳 → 回自由模式页 ——
function handleFreeplayComplete() {
  stopTimedMode();
  if (CM._freeplayMode === 'timed') {
    const sec = timedElapsedSec();
    try {
      const best = parseInt(localStorage.getItem('cagemaster4_best_timed') || '999999', 10);
      if (sec < best) localStorage.setItem('cagemaster4_best_timed', String(sec));
      CM.toast('⏱ 用时 ' + sec + 's' + (sec < best ? ' · 新纪录！' : ''), 2200);
    } catch (e) {}
  } else {
    CM.toast('🏆 完成！', 1500);
  }
  const mode = CM._freeplayMode;
  CM._freeplayMode = 'none';
  stopEndlessMode();
  // Q2：书脊已移除（spineBack 隐藏逻辑删除）
  // 回自由模式页
  setTimeout(() => {
    try {
      CM._bookCurPage = mode === 'endless' ? 'endless' : 'freeplay';
      showBookShell();
    } catch (e) {}
  }, 900);
}

// —— 书脊返回按钮 + 各页面按钮绑定 ——
(function initP2Shell() {
  // 目录启用「画廊」「自由模式」
  const gItem = document.querySelector('#pageDirectory .dir-item[data-page="gallery"]');
  if (gItem) {
    gItem.classList.remove('dir-soon');
    const tag = gItem.querySelector('.dir-soon-tag'); if (tag) tag.remove();
    gItem.addEventListener('click', () => { openGalleryInBook(); bookFlipTo('gallery'); });
  }
  const fItem = document.querySelector('#pageDirectory .dir-item[data-page="freeplay"]');
  if (fItem) {
    fItem.classList.remove('dir-soon');
    const tag = fItem.querySelector('.dir-soon-tag'); if (tag) tag.remove();
    // 规格 4.9：自由模式 = 翻几十页进入（1.5s 页码跳动 + 沙沙声）
    fItem.addEventListener('click', () => {
      try { if (window.AudioService && window.AudioService.sfx) window.AudioService.sfx.play('paper_flip'); } catch (e) {}
      bookFlipTo('freeplay');
      // 页码快速跳动 iii → iv → ... → 附录-1
      setTimeout(() => {
        const pg = document.querySelector('#pageFreeplay .page-number');
        if (!pg) return;
        const seq = ['iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
        let i = 0;
        const iv = setInterval(() => {
          if (i < seq.length) { pg.textContent = seq[i]; i++; }
          else { clearInterval(iv); pg.textContent = '附录-1'; }
        }, 150);
      }, 700);
    });
  }
  // 画廊返回
  const gb = document.getElementById('btnBackFromGallery');
  if (gb) gb.addEventListener('click', () => { if (CM.galleryBook) CM.galleryBook.close(); bookFlipTo('directory'); });
  // 自由模式返回
  const fb = document.getElementById('btnBackFromFreeplay');
  if (fb) fb.addEventListener('click', () => bookFlipTo('directory'));
  // 自由模式菜单项
  document.querySelectorAll('#pageFreeplay .fp-item').forEach((item) => {
    item.addEventListener('click', () => {
      const act = item.dataset.act;
      if (act === 'random') startRandomChallenge();
      else if (act === 'timed') {
        const ids = CM.lm.getAllLevelIds() || [];
        if (!ids.length) { CM.toast('无可用关卡'); return; }
        enterFreeplayLevel(ids[Math.floor(Math.random() * ids.length)], 'timed');
      } else if (act === 'daily') startDailyChallenge();
      else if (act === 'endless') bookFlipTo('endless');
      else if (act === 'list') {
        const box = document.getElementById('freeplayListBook');
        const hidden = box.classList.contains('hidden');
        box.classList.toggle('hidden', !hidden);
        if (hidden) renderFreeplayList();
      }
    });
  });
  // 无尽页按钮
  const se = document.getElementById('btnStartEndless');
  if (se) se.addEventListener('click', () => {
    const ids = CM.lm.getAllLevelIds() || [];
    if (!ids.length) { CM.toast('无可用关卡'); return; }
    enterFreeplayLevel(ids[Math.floor(Math.random() * ids.length)], 'endless');
  });
  const be = document.getElementById('btnBackFromEndless');
  if (be) be.addEventListener('click', () => bookFlipTo('freeplay'));
  // 书脊返回（自由/无尽模式退出）——Q2：书脊已移除，退出走暂停菜单/其他入口
})();

export {
  enterFreeplayLevel, startRandomChallenge, startDailyChallenge,
  handleEndlessComplete, handleFreeplayComplete, renderFreeplayList,
};
