// ==========================================
// ink-text.js - 涂黑文字叙事系统（13处手稿）
// ==========================================
// 负责：
//   - 13 句沈墨/老师/伊藤手稿的定义与解锁
//   - 按章节完成触发解锁（单周目：新剧本《笼局·三岔口》）
//   - 笔迹视觉效果（老师/伊藤/双笔迹/第三色/铅笔擦痕）
//   - 渲染墨迹留言页面
// ==========================================

'use strict';

import { DataStore } from '../core/data-store.js';
import I18n from '../i18n/i18n.js';

const CATEGORY = DataStore.INK_TEXT || 'ink_text';

const SENTENCES = [
  {
    id: 1, text: '这本书不是写给所有人看的。',
    speaker: 'teacher', appearance: 'pen_clear',
    trigger: { cycle: 1, chapter: 1 },
    cssClass: 'ink-teacher', color: '#1a3a5c', weight: 600,
    desc: '老师 · 笔迹清晰'
  },
  {
    id: 2, text: '父亲从未离开过这座藏书楼。',
    speaker: 'teacher', appearance: 'ink_bleed',
    trigger: { cycle: 1, chapter: 2 },
    cssClass: 'ink-teacher ink-bleed', color: '#1a3a5c', weight: 600,
    desc: '老师 · 开始渗墨'
  },
  {
    id: 3, text: '父亲把自己关起来，不是为了写书，是为了藏一样东西。',
    speaker: 'teacher', appearance: 'chaotic',
    trigger: { cycle: 1, chapter: 3 },
    cssClass: 'ink-teacher ink-chaotic', color: '#1a3a5c', weight: 600,
    desc: '老师 · 字迹变乱'
  },
  {
    id: 4, text: '伊藤是第一个读懂这些痕迹的人，也是唯一一个。',
    speaker: 'ito', appearance: 'annotate',
    trigger: { cycle: 1, chapter: 4 },
    cssClass: 'ink-ito', color: '#8b4513', weight: 400, skew: 2,
    desc: '伊藤 · 批注开始'
  },
  {
    id: 5, text: '他们之间的关系，比你想象的更近。',
    speaker: 'ito', appearance: 'emotional',
    trigger: { cycle: 1, chapter: 5 },
    cssClass: 'ink-ito ink-emotional', color: '#8b4513', weight: 400, skew: 2,
    desc: '伊藤 · 情绪化'
  },
  {
    id: 6, text: '父亲离开的那一天，伊藤开始留下竖线。',
    speaker: 'ito', appearance: 'murmur',
    trigger: { cycle: 1, chapter: 6 },
    cssClass: 'ink-ito ink-murmur', color: '#8b4513', weight: 400, skew: 2,
    desc: '伊藤 · 自言自语'
  },
  {
    id: 7, text: '你留了短横，我留了竖线——三代人，三种刻法。',
    speaker: 'double', appearance: 'intertwine',
    trigger: { cycle: 1, chapter: 7 },
    cssClass: 'ink-double', color: '#1a3a5c', weight: 600,
    desc: '双笔迹交织'
  },
  {
    id: 8, text: '你读完了。但你没有读完。',
    speaker: 'fading', appearance: 'vanish',
    trigger: { cycle: 1, chapter: 7 },
    cssClass: 'ink-fading', color: '#1a3a5c', weight: 400,
    desc: '笔迹消失'
  },
  {
    id: 9, text: '父亲没有消失。他换了一种方式继续写。',
    speaker: 'teacher', appearance: 'ink_heavy',
    trigger: { cycle: 1, chapter: 2 },
    cssClass: 'ink-teacher ink-bleed ink-bleed-heavy', color: '#1a3a5c', weight: 600,
    desc: '老师 · 渗墨加重'
  },
  {
    id: 10, text: '伊藤留下的每一条竖线，都是父亲想对自己说的话。',
    speaker: 'ito', appearance: 'pen_deep',
    trigger: { cycle: 1, chapter: 4 },
    cssClass: 'ink-ito ink-deep', color: '#6b3010', weight: 700, skew: 2,
    desc: '伊藤 · 笔迹加深'
  },
  {
    id: 11, text: '这条路上有三代人，但只有一个人走完了全程。',
    speaker: 'double', appearance: 'merge',
    trigger: { cycle: 1, chapter: 7 },
    cssClass: 'ink-double ink-merge', color: '#1a3a5c', weight: 600,
    desc: '双笔迹重合'
  },
  {
    id: 12, text: '你是最后一个读者。',
    speaker: 'third', appearance: 'warm_gray',
    trigger: { cycle: 3, chapter: 0 }, // 三周目进入游戏时触发
    cssClass: 'ink-third', color: '#4a3a2a', weight: 300,
    desc: '暖灰色（第三色）'
  },
  {
    id: 13, text: '你读完了，但你没有读完。',
    speaker: 'pencil', appearance: 'etch',
    trigger: { cycle: 3, chapter: -1 }, // 三周目全部完成后触发
    cssClass: 'ink-pencil', color: '#d4c8b0', weight: 100,
    desc: '铅笔擦痕（极淡）'
  },
];

let _unlocked = []; // 已解锁的 id 数组

// ==========================================
//  初始化 / 持久化
// ==========================================

function _load() {
  try {
    const arr = DataStore.get('unlocked', CATEGORY, []);
    _unlocked = Array.isArray(arr) ? arr.slice() : [];
  } catch (e) {
    console.warn('[InkText] load failed:', e);
    _unlocked = [];
  }
}

function _save() {
  try {
    DataStore.set('unlocked', _unlocked, CATEGORY);
  } catch (e) {
    console.warn('[InkText] save failed:', e);
  }
}

// ==========================================
//  公开 API
// ==========================================

const InkText = {
  /**
   * 获取所有句子定义
   */
  getAll() {
    return SENTENCES;
  },

  /**
   * 获取已解锁的 id 数组
   */
  getUnlocked() {
    return _unlocked.slice();
  },

  /**
   * 判断某句是否已解锁
   * @param {number} id
   */
  isUnlocked(id) {
    return _unlocked.includes(id);
  },

  /**
   * 获取已解锁的句子对象列表
   */
  getUnlockedSentences() {
    return SENTENCES.filter(s => _unlocked.includes(s.id));
  },

  /**
   * 获取解锁数量
   */
  getCount() {
    return _unlocked.length;
  },

  /**
   * 初始化（从 DataStore 加载）
   */
  init() {
    _load();
    return this;
  },

  /**
   * 按周目+章节检测并解锁
   * @param {number} cycle  - 当前周目 (1/2/3)
   * @param {number} chapter - 当前完成的章节 (1-8)
   * @returns {Object|null} 新解锁的句子，若无则 null
   */
  checkAndUnlock(cycle, chapter) {
    // 特殊：第12句由 story-orchestrator 在进入三周目时手动调用 unlock(12)
    // 特殊：第13句由 story-orchestrator 在三周目全部完成后手动调用 unlock(13)
    // 其他 1-11 句按 cycle+chapter 自动匹配
    let unlocked = null;
    for (const s of SENTENCES) {
      if (s.id > 11) continue; // 12-13 由外部手动触发
      if (_unlocked.includes(s.id)) continue;
      if (s.trigger.cycle === cycle && s.trigger.chapter === chapter) {
        _unlocked.push(s.id);
        unlocked = s;
      }
    }
    if (unlocked) {
      _save();
      // 确保数组排序
      _unlocked.sort((a, b) => a - b);
    }
    return unlocked;
  },

  /**
   * 手动解锁指定 id（用于第12/13句）
   * @param {number} id
   * @returns {Object|null} 解锁的句子，若已解锁则 null
   */
  unlock(id) {
    if (_unlocked.includes(id)) return null;
    const s = SENTENCES.find(x => x.id === id);
    if (!s) return null;
    _unlocked.push(id);
    _unlocked.sort((a, b) => a - b);
    _save();
    return s;
  },

  /**
   * 重置所有解锁状态（用于测试/重置）
   */
  reset() {
    _unlocked = [];
    _save();
  },

  /**
   * 渲染墨迹留言列表
   * @param {HTMLElement} container - #inkList 元素
   */
  renderList(container) {
    if (!container) return;
    let html = '';
    for (const s of SENTENCES) {
      const unlocked = _unlocked.includes(s.id);
      if (unlocked) {
        // 根据 appearance 选择渲染方式
        const textHtml = _renderText(s);
        html += '<div class="ink-row unlocked ' + s.cssClass + '" data-id="' + s.id + '">' +
          '<span class="ink-no">' + s.id + '</span>' +
          '<span class="ink-text">' + textHtml + '</span>' +
          '</div>';
      } else {
        // 未解锁：涂黑墨块
        const showQ = s.id <= 13; // 全部显示问号
        html += '<div class="ink-row locked" data-id="' + s.id + '">' +
          '<span class="ink-no">' + s.id + '</span>' +
          '<span class="ink-text">' + (showQ ? '' : '') + '</span>' +
          '</div>';
      }
    }
    container.innerHTML = html;
  },

  /**
   * 在章节完成时弹出涂黑文字提示
   * @param {Object} sentence - 新解锁的句子
   * @param {Function} [onDone] - 动画完成回调
   */
  showReveal(sentence, onDone) {
    if (!sentence) { if (onDone) onDone(); return; }
    // 检查是否已存在弹窗
    let overlay = document.getElementById('inkReveal');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'inkReveal';
    overlay.className = 'ink-reveal-overlay ' + sentence.cssClass;

    const inner = document.createElement('div');
    inner.className = 'ink-reveal-inner';

    const label = document.createElement('div');
    label.className = 'ink-reveal-label';
    label.textContent = I18n.t('ui.inkText.desc.' + sentence.id);

    const text = document.createElement('div');
    text.className = 'ink-reveal-text';
    // 对需要逐字渲染的，使用 _renderChars
    if (sentence.appearance === 'chaotic' || sentence.appearance === 'intertwine' || sentence.appearance === 'merge') {
      text.innerHTML = _renderChars(I18n.t('ui.inkText.sentence.' + sentence.id), sentence);
    } else {
      text.textContent = I18n.t('ui.inkText.sentence.' + sentence.id);
    }

    const hint = document.createElement('div');
    hint.className = 'ink-reveal-hint';
    hint.textContent = I18n.t('ui.inkText.revealHint');

    inner.appendChild(label);
    inner.appendChild(text);
    inner.appendChild(hint);
    overlay.appendChild(inner);
    document.body.appendChild(overlay);

    // 3秒后自动消除
    setTimeout(() => {
      overlay.classList.add('ink-reveal-out');
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.remove();
        if (onDone) onDone();
      }, 600);
    }, 3000);
  },
};

// ==========================================
//  内部渲染辅助
// ==========================================

/**
 * 渲染句子的文字部分（含笔迹效果）
 */
function _renderText(s) {
  const cls = s.cssClass || '';
  const t = I18n.t('ui.inkText.sentence.' + s.id);
  if (s.appearance === 'chaotic' || s.appearance === 'intertwine' || s.appearance === 'merge') {
    return _renderChars(t, s);
  }
  return '<span class="ink-text-inner">' + _escapeHtml(t) + '</span>';
}

/**
 * 逐字渲染（用于字迹变乱、双笔迹交织等效果）
 */
function _renderChars(text, s) {
  const chars = text.split('');
  let html = '';
  let doubleColor = '#8b4513';
  if (s.appearance === 'merge') {
    // 双笔迹重合：每个字用两个颜色叠加
    for (let i = 0; i < chars.length; i++) {
      const rot = (Math.sin(i * 7.3) * 6).toFixed(1);
      html += '<span class="ink-char ink-char-double" style="' +
        '--rot:' + rot + 'deg;' +
        '--color-a:' + s.color + ';' +
        '--color-b:' + doubleColor + ';">' +
        _escapeHtml(chars[i]) + '</span>';
    }
  } else if (s.appearance === 'intertwine') {
    // 双笔迹交织：交替颜色
    for (let i = 0; i < chars.length; i++) {
      const col = i % 2 === 0 ? s.color : doubleColor;
      const rot = (Math.sin(i * 5.1) * 4).toFixed(1);
      html += '<span class="ink-char" style="' +
        '--rot:' + rot + 'deg;color:' + col + ';">' +
        _escapeHtml(chars[i]) + '</span>';
    }
  } else {
    // 字迹变乱：每个字随机旋转
    for (let i = 0; i < chars.length; i++) {
      const rot = (Math.sin(i * 11.7 + 3.1) * 8).toFixed(1);
      const delay = (Math.sin(i * 2.3) * 0.15 + 0.15).toFixed(2);
      html += '<span class="ink-char" style="' +
        '--rot:' + rot + 'deg;--delay:' + delay + 's;">' +
        _escapeHtml(chars[i]) + '</span>';
    }
  }
  return html;
}

function _escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ==========================================
//  导出
// ==========================================

export { InkText, SENTENCES };