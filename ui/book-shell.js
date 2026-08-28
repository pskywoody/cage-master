// 书壳全家桶（书架/翻页/扉页/封底/丝线书签/选项页/墨迹留言/设定集）— 重构阶段 1 从 game.html 拆出
// 共享状态经 window.CM；toast/onSelectLevel 由 game.html 挂载到 CM
import { GalleryPanel } from './gallery-panel.js';
import { DataStore } from '../core/data-store.js';
import I18n from '../i18n/i18n.js';

const CM = window.CM || (window.CM = {});

function showBookShell() {
  CM._bookVisible = true;
  // 关前/书壳界面：退出关卡挂载态 → 隐藏 PC 右栏信息产物与棋 45账本
  try { document.body.classList.remove('cm-level-mounted'); } catch (e) {}
  // FIX E（2026-08-21）：打开书壳/章节菜单时同样停止剧情，避免残留对话浮在菜单上
  try { if (window.__cagemaster_pauseStory) window.__cagemaster_pauseStory(); } catch (e) {}
  // 修复：书壳与旧 Start 页互斥——书壳 z 29000 低于 startPage 30000，必须隐藏旧页否则被遮挡
  try { hideStartPage(); } catch (e) {}
  const sh = document.getElementById('bookShell');
  if (!sh) return;
  sh.classList.remove('hidden');
  // 只显示当前目标页
  const pages = sh.querySelectorAll('.book-page');
  pages.forEach((p) => { p.style.display = 'none'; });
  const cur = document.getElementById('page' + capitalize(CM._bookCurPage || 'bookshelf'));
  if (cur) cur.style.display = 'flex';
  document.body.classList.add('book-shell-open');
  // Q13：刷新"返回游戏"按钮显隐（书壳显示时）
  try { refreshBackToGameBtns(); } catch (e) {}
  // P3：设定集书架现身状态随进度刷新
  try { updateArtBook(); } catch (e) {}
}
function hideBookShell() {
  CM._bookVisible = false;
  const sh = document.getElementById('bookShell');
  if (sh) sh.classList.add('hidden');
  document.body.classList.remove('book-shell-open');
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

CM._bookCurPage = 'bookshelf'
// 页面流（方向判断）：书架 → 封面 → 扉页 → 目录 → 章节列表 → 后续页
const PAGE_SEQ = ['bookshelf', 'cover', 'flyleaf', 'directory', 'chapters', 'chapterOpening', 'options', 'ink', 'gallery', 'freeplay', 'endless', 'endpaper'];

// 翻页（回滚版）：直接切换页面显示（无 3D 翻转动画）
function bookFlipTo(pageId) {
  if (pageId === CM._bookCurPage) return;
  // A6：翻页沙沙声（纸张翻动）
  try {
    if (window.AudioService && window.AudioService.sfx) window.AudioService.sfx.play('paper_flip');
  } catch (e) {}
  const oldPage = document.getElementById('page' + capitalize(CM._bookCurPage));
  const newPage = document.getElementById('page' + capitalize(pageId));
  if (!newPage) return;
  if (oldPage && oldPage !== newPage) oldPage.style.display = 'none';
  newPage.style.display = 'flex';
  CM._bookCurPage = pageId;
  // Q13：翻到目录/章节列表时刷新"返回游戏"按钮显隐
  try { if (typeof refreshBackToGameBtns === 'function') refreshBackToGameBtns(); } catch (e) {}
}


function calcRunMark() {
  try {
    if (!CM.lm) return '';
    const chapters = CM.lm.getChapters() || [];
    let total = 0, done = 0;
    chapters.forEach((ch) => { (ch.levelIds || []).forEach((id) => { total++; if (CM.lm.isLevelCompleted(id)) done++; }); });
    if (total === 0) return '';
    if (done >= total * 2) return I18n.t('ui.bookShell.runMark3');
    if (done >= total) return I18n.t('ui.bookShell.runMark2');
    return '';
  } catch (e) { return ''; }
}
// 三周目完成（第 3 轮通关）：完成关卡数 ≥ 总数 × 3 → 书脊"你是第 13 位读者" + 封底
function isThirdRunDone() {
  try {
    if (!CM.lm) return false;
    const chapters = CM.lm.getChapters() || [];
    let total = 0, done = 0;
    chapters.forEach((ch) => { (ch.levelIds || []).forEach((id) => { total++; if (CM.lm.isLevelCompleted(id)) done++; }); });
    return total > 0 && done >= total * 3;
  } catch (e) { return false; }
}

// 通关全部章节（一周目完成）：三书彩蛋门槛（规格：通关后点击）
function allChaptersDone() {
  try {
    if (!CM.lm) return false;
    const chapters = CM.lm.getChapters() || [];
    let total = 0, done = 0;
    chapters.forEach((ch) => { (ch.levelIds || []).forEach((id) => { total++; if (CM.lm.isLevelCompleted(id)) done++; }); });
    return total > 0 && done >= total;
  } catch (e) { return false; }
}

// 书壳交互初始化
(function initBookShell() {
  // 主角书抽书动画 → 封面
  const hero = document.getElementById('heroBook');
  if (hero) {
    hero.addEventListener('click', () => {
      if (hero.classList.contains('pulled')) return;
      hero.classList.add('pulling');
      setTimeout(() => {
        hero.classList.remove('pulling');
        hero.classList.add('pulled');
        setTimeout(() => {
          hero.classList.remove('pulled');
          bookFlipTo('cover');
          // 封面周目标记
          const mark = document.getElementById('coverRunMark');
          if (mark) {
            const m = calcRunMark();
            mark.textContent = m;
            mark.classList.toggle('hidden', !m);
          }
        }, 500);
      }, 800);
    });
  }
  // 环境书：通关后点击显示彩蛋台词（规格：通关全部章节即可，非三周目）
  document.querySelectorAll('.env-book').forEach((b) => {
    b.addEventListener('click', () => {
      const qk = b.dataset.quoteKey || '';
      const quote = qk ? I18n.t(qk) : '';
      if (allChaptersDone()) {
        CM.toast('📖 ' + quote, 2600);
      } else {
        CM.toast(I18n.t('ui.bookShell.lockedBook'), 2200);
      }
    });
  });
  // 三周目完成后显示"第 13 位读者"
  if (isThirdRunDone()) {
    const r13 = document.getElementById('shelfReader13');
    if (r13) r13.classList.add('show');
  }
  // 封面 → 扉页；扉页 → 目录
  const cover = document.getElementById('pageCover');
  if (cover) cover.addEventListener('click', () => bookFlipTo('flyleaf'));
  const flyleaf = document.getElementById('pageFlyleaf');
  if (flyleaf) flyleaf.addEventListener('click', () => bookFlipTo('directory'));
  // 目录菜单
  document.querySelectorAll('#pageDirectory .dir-item').forEach((item) => {
    item.addEventListener('click', () => {
      if (item.classList.contains('dir-soon')) {
        CM.toast(item.dataset.soon || I18n.t('ui.bookShell.soon'), 1800);
        return;
      }
      const target = item.dataset.page;
      if (target === 'chapters') {
        CM.levelSelect.mount(document.getElementById('chapterListBook'));
        bookFlipTo('chapters');
      }
    });
  });
  // 章节列表 → 返回目录
  const back = document.getElementById('btnBackToDir');
  if (back) back.addEventListener('click', () => bookFlipTo('directory'));
  // Q13：书壳内"返回游戏"——从汉堡菜单进入书壳（章节选择）时，目录页/章节列表
  // 必须能返回当前关卡（书壳内没有汉堡体系，旧逻辑只能重新选关，玩家回不去）
  const backGame1 = document.getElementById('btnBackToGame');
  const backGame2 = document.getElementById('btnBackToGame2');
  if (backGame1) backGame1.addEventListener('click', () => backToGameFromBook());
  if (backGame2) backGame2.addEventListener('click', () => backToGameFromBook());
})();

// 返回按钮显隐：
//   _bookFromGame === true  → 显示"返回游戏"（从游戏内进书壳）
//   _bookFromGame === false → 显示"返回封面"（从 Start 页进游戏菜单，需能回封面）
function refreshBackToGameBtns() {
  try {
    const fromGame = CM._bookFromGame === true;
    const b1 = document.getElementById('btnBackToGame');
    const b2 = document.getElementById('btnBackToGame2');
    // 两个按钮均为"返回"入口，按来源切换文案与显隐
    [b1, b2].forEach((b) => {
      if (!b) return;
      b.classList.toggle('hidden', false); // 菜单内始终提供返回入口（回游戏或回封面）
      if (fromGame) {
        b.textContent = I18n.t('ui.book.backToGame');
      } else {
        b.textContent = I18n.t('ui.book.backToCover');
      }
    });
  } catch (e) {}
}

function backToGameFromBook() {
  // V4.4.1：区分来源——从 Start 页进入菜单（_bookFromGame=false）时"返回"回封面；
  // 从游戏内进入（_bookFromGame=true）时返回当前关卡
  if (CM._bookFromGame !== true) {
    try { hideBookShell(); } catch (e) {}
    try { showStartPage(); } catch (e2) {}
    return;
  }
  try { hideBookShell(); } catch (e) {}
  // 恢复棋盘相关 UI（goToChapterList 隐藏过）
  try {
    ['board-container', 'pad', 'statusLine'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = '';
    });
  } catch (e) {}
  // 保险：若游戏仍处于暂停态则恢复
  try {
    if (CM.isGamePaused && CM.pauseManager && typeof CM.pauseManager.hidePauseMenu === 'function') {
      CM.pauseManager.hidePauseMenu();
    }
  } catch (e) {}
  CM._bookFromGame = false;
  try { if (typeof window.layout === 'function') window.layout(); } catch (eL) {}
  try { if (typeof CM.toast === 'function') CM.toast(I18n.t('ui.bookShell.backToGame')); } catch (eT) {}
}

function enterBoardFromBook(levelId) {
  hideBookShell();
  document.body.classList.add('book-theme');
  if (levelId != null) CM.onSelectLevel(levelId);
}

// ============ P1：章节扉页 / 封底 / 丝线书签 / 选项页 / 45法则过渡 ============
// 章节扉页数据：标题从 chapters.json 动态取，插画 emoji 按章节主题
CM.CHAPTER_ART = {
  1: '✉️', 2: '🏚️', 3: '🚪', 4: '🔑', 5: '📻', 6: '🕸️', 7: '🗝️', 8: '🌟',
}
CM.CHAPTER_QUOTES = {
  1: '"雨夜来信，封缄处只刻着一道极细的短横。"',
  2: '"父亲从未离开过这座藏书楼。"',
  3: '"你到了。这里是老师留下的第二层。"',
  4: '"解完它，就知道我在哪里。"',
  5: '"三秒一段，五秒之内。"',
  6: '"这条网，他替父亲补完了。"',
  7: '"你留了短横，我留了竖线。"',
  8: '"所有门、所有路、所有痕、所有局，全部闭环圆满。"',
}
CM.ROMAN = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi']
function chapterPageNum(chId) {
  try {
    const chapters = CM.lm.getChapters() || [];
    const idx = chapters.findIndex((c) => c.chapterId === chId);
    return CM.ROMAN[4 + Math.max(0, idx)] || 'iv';
  } catch (e) { return 'iv'; }
}
// 显示章节扉页（左插画 + 右标题），点击后 resolve 继续
function showChapterOpening(chId) {
  return new Promise((resolve) => {
    try {
      const chapters = CM.lm.getChapters() || [];
      const ch = chapters.find((c) => c.chapterId === chId);
      // v2.1：章节标题优先走 i18n 语言包（chapters.{id}.title），缺省回退 chapters.json
      const i18nTitle = I18n.t('chapters.' + chId + '.title');
      const title = (i18nTitle && i18nTitle.indexOf('chapters.') !== 0) ? i18nTitle : (ch && ch.title ? ch.title : I18n.t('ui.bookShell.chapterTitle', { chapter: chId }));
      document.getElementById('choChap').textContent = I18n.t('ui.bookShell.chapterOpening', { chapter: chId });
      document.getElementById('choTitle').textContent = title;
      const quote = I18n.t('ui.bookShell.quote.' + chId);
      document.getElementById('choQuote').textContent = (quote && quote.indexOf('ui.bookShell.quote.') !== 0) ? quote : I18n.t('ui.bookShell.defaultQuote');
      document.getElementById('choIllustration').textContent = CM.CHAPTER_ART[chId] || '🌸';
      document.getElementById('choPageNum').textContent = chapterPageNum(chId);
    } catch (e) {}
    bookFlipTo('chapterOpening');
    const page = document.getElementById('pageChapterOpening');
    const handler = () => { page.removeEventListener('click', handler); resolve(); };
    page.addEventListener('click', handler);
  });
}

// Q3：丝线书签已移除（positionSilkBookmark / initSilkBookmark / calcProgressPct 删除）

// 4.11 封底：三周目通关（完成 ≥2 轮）后展示通关数据；合上书本回书架
function maybeShowEndpaper() {
  try {
    if (!isThirdRunDone()) return;
    if (localStorage.getItem('cagemaster4_endpaper_seen')) return;
    localStorage.setItem('cagemaster4_endpaper_seen', '1');
    // 通关数据（三周目完成 = 完成 3 轮）
    const total = (() => { const cs = CM.lm.getChapters() || []; let t = 0; cs.forEach((c) => { t += (c.levelIds || []).length; }); return t; })();
    const pct = 100; // 三周目通关 = 100%
    const maxCombo = (window.comboSystem && CM.comboSystem.maxCombo) ? CM.comboSystem.maxCombo : 0;
    document.getElementById('endProgress').textContent = pct + '%';
    document.getElementById('endCombo').textContent = String(maxCombo);
    document.getElementById('endArt').textContent = '15 / 24';
    // 通关时间：无真实记录时显示 —
    document.getElementById('endTime').textContent = '—:—:—';
    // 显示封底（盖住棋盘）
    CM._bookCurPage = 'endpaper';
    showBookShell();
  } catch (e) {}
}
// 合上书本：缩放动画 → 放回书架
function closeBookAndReturn() {
  const sh = document.getElementById('bookShell');
  if (!sh) return;
  sh.classList.add('closing');
  setTimeout(() => {
    sh.classList.remove('closing');
    CM._bookCurPage = 'bookshelf';
    showBookShell();
    // 刷新封面周目标记
    const mark = document.getElementById('coverRunMark');
    if (mark) { const m = calcRunMark(); mark.textContent = m; mark.classList.toggle('hidden', !m); }
    // 三周目完成后显示"第 13 位读者"
    const r13 = document.getElementById('shelfReader13');
    if (r13) r13.classList.toggle('show', isThirdRunDone());
    CM.toast(I18n.t('ui.bookShell.bookReturned'));
  }, 800);
}

// 4.12 选项页：藏书票滑块（声音→AudioService 主音量 / 画面·手感→localStorage）
function initOptionsPage() {
  try {
    const snd = document.getElementById('optSound');
    const vis = document.getElementById('optVisual');
    const hap = document.getElementById('optHaptic');
    if (snd) {
      snd.value = parseInt(localStorage.getItem('cagemaster4_opt_sound') || '80', 10);
      snd.addEventListener('input', () => {
        const v = parseInt(snd.value, 10);
        document.getElementById('optSoundVal').textContent = String(v);
        try { localStorage.setItem('cagemaster4_opt_sound', String(v)); } catch (e) {}
        try { if (typeof window.AudioService !== 'undefined' && window.AudioService.setVolume) AudioService.setVolume('master', v / 100); } catch (e) {}
      });
    }
    if (vis) {
      vis.value = parseInt(localStorage.getItem('cagemaster4_opt_visual') || '100', 10);
      vis.addEventListener('input', () => {
        const v = parseInt(vis.value, 10);
        document.getElementById('optVisualVal').textContent = String(v);
        try { localStorage.setItem('cagemaster4_opt_visual', String(v)); } catch (e) {}
      });
    }
    if (hap) {
      hap.value = parseInt(localStorage.getItem('cagemaster4_opt_haptic') || '70', 10);
      hap.addEventListener('input', () => {
        const v = parseInt(hap.value, 10);
        document.getElementById('optHapticVal').textContent = String(v);
        try { localStorage.setItem('cagemaster4_opt_haptic', String(v)); } catch (e) {}
      });
    }
    const back = document.getElementById('btnBackFromOptions');
    if (back) back.addEventListener('click', () => bookFlipTo('directory'));
  } catch (e) {}
}

// 目录"选项"启用 + 丝线书签 + 封底按钮
(function initP1Shell() {
  // V4.4.0：目录"选项"→ 直接打开游戏内设置面板（与汉堡菜单/暂停菜单同一 SettingsPanel），
  // 不再翻到独立藏书票滑块页（旧 pageOptions 仅 4 个滑块，与完整设置不一致）
  const optItem = document.querySelector('#pageDirectory .dir-item[data-page="options"]');
  if (optItem) {
    optItem.classList.remove('dir-soon');
    optItem.querySelector('.dir-soon-tag')?.remove();
    optItem.querySelector('.dir-arrow')?.setAttribute('style', 'margin-left:auto;color:var(--color-ink-muted);');
    optItem.addEventListener('click', () => {
      try {
        if (window.CM && CM.settings && typeof CM.settings.toggle === 'function') CM.settings.toggle();
        else bookFlipTo('options'); // 降级：设置面板不可用时仍可翻到旧选项页
      } catch (e) { bookFlipTo('options'); }
    });
  }
  initOptionsPage();
  const closeBtn = document.getElementById('btnCloseBook');
  if (closeBtn) closeBtn.addEventListener('click', closeBookAndReturn);
})();

// ============ P3：涂黑文字（13 处手稿）—— 委托给 ui/ink-text.js ============
// 渲染墨迹留言页（委托 InkText 模块）
function renderInkList() {
  const box = document.getElementById('inkList');
  if (!box) return;
  if (CM.inkText && CM.inkText.renderList) {
    CM.inkText.renderList(box);
  }
}
// 设定集：三周目完成后书架现身（预留位）
function updateArtBook() {
  const ab = document.getElementById('artBook');
  if (!ab) return;
  const revealed = isThirdRunDone();
  ab.classList.toggle('revealed', revealed);
  ab.title = revealed ? I18n.t('ui.bookShell.artBookRevealed') : I18n.t('ui.bookShell.artBookPlaceholder');
}

// 目录"墨迹留言" + 设定集交互
(function initP3Shell() {
  const inkItem = document.querySelector('#pageDirectory .dir-item[data-page="ink"]');
  if (inkItem) {
    inkItem.addEventListener('click', () => { renderInkList(); bookFlipTo('ink'); });
  }
  const inkBack = document.getElementById('btnBackFromInk');
  if (inkBack) inkBack.addEventListener('click', () => bookFlipTo('directory'));
  const artBook = document.getElementById('artBook');
  if (artBook) {
    artBook.addEventListener('click', () => {
      if (!artBook.classList.contains('revealed')) return;
      CM.toast(I18n.t('ui.bookShell.artBookToast'), 2400);
    });
  }
  updateArtBook();
})();

// ============ P2：画廊 / 自由模式 / 无尽模式 ============
CM.galleryBook = null                       // 书壳内嵌画廊实例（懒创建）
CM._freeplayMode = 'none'                   // none | random | timed | daily | endless
CM._timedStartTs = 0; CM._timedTicker = null
CM._endlessRun = 0; CM._endlessMoves = 0; CM._endlessTicker = null

// —— 书壳内嵌画廊（4.8：翻半本书进入）——
function openGalleryInBook() {
  try {
    if (!CM.galleryBook) {
      const mount = document.getElementById('galleryBookMount');
      if (!mount) return;
      CM.galleryBook = new GalleryPanel({ container: mount, dataStore: DataStore });
      window.galleryBook = CM.galleryBook;
    }
    CM.galleryBook.open();
  } catch (e) { console.warn('[GalleryBook] open:', e); }
}

// Q2：updateBookSpine 已移除（书脊删除）

function showStartPage(force) {
  // 就绪守卫（2026-08-27）：启动数据未完成(__bootReady!==true)时禁止露出菜单页，
  // 让玩家始终停留在加载页（bootSplash + 进度条），加载完成才放行菜单，杜绝"菜单先出现但不可交互"。
  if (window.CM && window.CM.__bootReady !== true && !force) return;
  // FIX E（2026-08-21）：返回 Start 页前强制停止剧情，防止 bootGuard 超时后
  // sayLines 仍在打字，对话气泡浮在菜单之上；也避免章节 BGM 持续播放
  try { if (window.__cagemaster_pauseStory) window.__cagemaster_pauseStory(); } catch (e) {}
  window.__startPageVisible = true;
  const sp = document.getElementById('startPage');
  if (sp) sp.classList.remove('hidden');
  // Start 页上下文：无存档时隐藏"继续游戏"（按钮显隐依赖进度，须在菜单露出时刷新）
  try { if (window.__applyStartPageContext) window.__applyStartPageContext(); } catch (e) {}
  // 关前（Start 页）退出关卡挂载态 → 隐藏 PC 右栏信息产物与 45账本
  try { document.body.classList.remove('cm-level-mounted'); } catch (e) {}
}
function hideStartPage() {
  window.__startPageVisible = false;
  const sp = document.getElementById('startPage');
  if (sp) sp.classList.add('hidden');
}

export {
  showBookShell, hideBookShell, bookFlipTo, showChapterOpening,
  maybeShowEndpaper, closeBookAndReturn, enterBoardFromBook,
  renderInkList, updateArtBook, openGalleryInBook,
  showStartPage, hideStartPage,
};
