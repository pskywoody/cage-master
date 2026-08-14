// ============================================================
//  boss-line-selector.js - Boss 台词选择器（CM4-R7 内容生产层）
// ============================================================
//  定位：从 Boss 内容包里，按"事件 + 阶段 + 策略 + 语言"挑一句台词。
//  纯函数、确定性输出文本；配合游标避免连续重复同一句。
//
//  池解析规则：
//    event 'phase'      → pack.phaseLines[phase]
//    event 'strategy'   → pack.strategyLines[strategy]
//    event 'pollution'  → pack.eventLines.pollution
//    event 'pressure'   → pack.eventLines.pressure_incoming
//    event 'line_win'   → pack.eventLines.line_win
//    event 'line_steal' → pack.eventLines.line_steal
//    event 'playerWin'  → pack.feedback.playerWin
//    event 'playerLose' → pack.feedback.playerLose
//    event 'draw'       → pack.feedback.draw
//
//  多语言：行对象 { key, zh, ja, en }；请求语言缺失时回退 zh-CN。
//  无 DOM、可 headless 测试。
// ============================================================

import { DEFAULT_LOCALE } from '../content/boss-content.js';

// locale → 行对象语言键映射（行对象用 zh/ja/en，locale 用 zh-CN/ja-JP/en-US）
const LOCALE_TO_LANG = Object.freeze({
  'zh-CN': 'zh', 'zh': 'zh',
  'ja-JP': 'ja', 'ja': 'ja',
  'en-US': 'en', 'en': 'en',
});

/** 归一化语言标识（未知语言回退默认）；返回行对象语言键 */
export function resolveLocale(locale) {
  const key = (locale && typeof locale === 'string') ? locale : DEFAULT_LOCALE;
  return LOCALE_TO_LANG[key] || LOCALE_TO_LANG[DEFAULT_LOCALE] || 'zh';
}

/**
 * 从台词池挑一句（游标轮转，避免连续重复）。
 * @param {Array<{key:string, zh:string, ja?:string, en?:string}>|null} pool
 * @param {Object} opts
 * @param {string} [opts.locale='zh-CN']
 * @param {number} [opts.cursor=0] - 下一条应取的索引（round-robin）
 * @returns {{ key:string, text:string, index:number, next:number }|null}
 */
export function pickLine(pool, { locale = DEFAULT_LOCALE, cursor = 0 } = {}) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const loc = resolveLocale(locale);
  const len = pool.length;
  const index = ((cursor % len) + len) % len;
  const line = pool[index];
  return {
    key: line.key,
    text: line[loc] || line[DEFAULT_LOCALE] || line.zh || '',
    index,
    next: (index + 1) % len,
  };
}

/**
 * 解析事件 → 台词池。
 * @param {Object} pack - Boss 内容包
 * @param {string} event
 * @param {Object} [opts] - { phase, strategy }
 * @returns {Array|null}
 */
export function poolFor(pack, event, { phase, strategy } = {}) {
  if (!pack) return null;
  switch (event) {
    case 'phase':
      return (pack.phaseLines && pack.phaseLines[phase]) || null;
    case 'strategy':
      return (pack.strategyLines && pack.strategyLines[strategy]) ? [pack.strategyLines[strategy]] : null;
    case 'pollution':
      return (pack.eventLines && pack.eventLines.pollution) || null;
    case 'pressure':
      return (pack.eventLines && pack.eventLines.pressure_incoming) || null;
    case 'line_win':
      return (pack.eventLines && pack.eventLines.line_win) || null;
    case 'line_steal':
      return (pack.eventLines && pack.eventLines.line_steal) || null;
    case 'playerWin':
      return (pack.feedback && pack.feedback.playerWin) || null;
    case 'playerLose':
      return (pack.feedback && pack.feedback.playerLose) || null;
    case 'draw':
      return (pack.feedback && pack.feedback.draw) || null;
    default:
      return null;
  }
}

/**
 * 组合入口：按 Boss 包 + 事件挑一句台词。
 * @param {Object} params
 * @param {Object} params.pack - Boss 内容包
 * @param {string} params.event - 'phase'|'strategy'|'pollution'|'pressure'|'line_win'|'line_steal'|'playerWin'|'playerLose'|'draw'
 * @param {string} [params.phase] - 阶段（event='phase' 时必填）
 * @param {string} [params.strategy] - 策略（event='strategy' 时必填）
 * @param {string} [params.locale='zh-CN']
 * @param {Object} [params.cursors] - 各事件游标（round-robin 去重）
 * @returns {{ key:string, text:string, nextCursor:number }|null}
 */
export function selectBossLine({ pack, event, phase, strategy, locale = DEFAULT_LOCALE, cursors = {} }) {
  const pool = poolFor(pack, event, { phase, strategy });
  const cursor = cursors[event] || 0;
  const picked = pickLine(pool, { locale, cursor });
  if (!picked) return null;
  return { key: picked.key, text: picked.text, nextCursor: picked.next };
}

export default { pickLine, poolFor, selectBossLine, resolveLocale };