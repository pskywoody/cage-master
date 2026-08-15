// core/experiment-assigner.js
// 只读研究基础设施：确定性随机分流层。
// 同一 (experimentId, seed, subjectId) 永远落到同一 variant；不接生产、不改任何产品行为。

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 稳定分流：把 subjectId 分到某个 variant（可复现）。
 * @param {string} experimentId
 * @param {string} subjectId
 * @param {Array<{id:string}>} variants
 * @param {number} [seed]
 * @returns {string} variantId
 */
export function assignVariant(experimentId, subjectId, variants, seed = 0) {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  const key = `${experimentId}::${seed}::${subjectId}`;
  return variants[fnv1a(key) % variants.length].id;
}

/**
 * 分流平衡报告：各 variant 的被分配 subject 数与占比。
 * @returns {Array<{variantId, count, share, expectedShare}>}
 */
export function assignmentBalance(subjectIds, assignFn) {
  const counts = new Map();
  for (const sid of subjectIds) {
    const v = assignFn(sid);
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  const total = subjectIds.length || 1;
  return Array.from(counts.entries()).map(([variantId, count]) => ({
    variantId,
    count,
    share: Number((count / total).toFixed(3)),
  }));
}