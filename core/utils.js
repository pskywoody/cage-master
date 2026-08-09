// ============================================================
//  utils.js - 坐标系统转换工具（2026-08-03）
//  统一坐标格式：{ row: 'a', col: 3 }
//    行：字母 a~i（4x4: a-d, 6x6: a-f, 9x9: a-i）
//    列：数字 1~9（4x4: 1-4, 6x6: 1-6, 9x9: 1-9）
// ============================================================

'use strict';

/**
 * 行字母 -> 行索引（'a' -> 0, 'i' -> 8）
 * @param {string|number} rowLetter
 * @returns {number} 索引；无效返回 -1
 */
function rowToIndex(rowLetter) {
  if (typeof rowLetter === 'number') {
    return (rowLetter >= 0 && rowLetter < 9) ? rowLetter : -1;
  }
  if (typeof rowLetter === 'string') {
    const u = rowLetter.trim().toUpperCase();
    if (u.length !== 1) return -1;
    const code = u.charCodeAt(0) - 65;
    return (code >= 0 && code < 9) ? code : -1;
  }
  return -1;
}

/**
 * 行索引 -> 行字母（0 -> 'a', 8 -> 'i'）
 * @param {number} idx
 * @returns {string} 字母；无效返回 ''
 */
function indexToRow(idx) {
  if (typeof idx !== 'number' || idx < 0 || idx > 8) return '';
  return String.fromCharCode(97 + idx);
}

/**
 * 列数字 -> 列索引（1 -> 0, 9 -> 8）
 * @param {number|string} col
 * @returns {number} 索引；无效返回 -1
 */
function colToIndex(col) {
  let n = -1;
  if (typeof col === 'number') n = col;
  else if (typeof col === 'string') n = parseInt(col.trim(), 10);
  if (isNaN(n)) return -1;
  return (n >= 1 && n <= 9) ? n - 1 : -1;
}

/**
 * 列索引 -> 列数字（0 -> 1, 8 -> 9）
 * @param {number} idx
 * @returns {number} 列号；无效返回 -1
 */
function indexToCol(idx) {
  if (typeof idx !== 'number' || idx < 0 || idx > 8) return -1;
  return idx + 1;
}

/**
 * 格子坐标键（'a1' 格式）：行字母 + 列数字
 * @param {number} r - 行索引
 * @param {number} c - 列索引
 * @returns {string}
 */
function cellKey(r, c) {
  return indexToRow(r) + String(indexToCol(c));
}

export { rowToIndex, indexToRow, colToIndex, indexToCol, cellKey };
