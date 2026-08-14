/**
 * ============================================================
 *  production-config.js — R4 Production loader switch
 * ============================================================
 *
 *  生产/开发加载开关：
 *    if production:  load frozen pool（release/B3-FINAL/release-pool.json）
 *    else:           allow generation（data/pool-xwing-001.json 或实时生成）
 *
 *  生产环境不再实时生成。读取 config/production/B3-FINAL.json 判定。
 *
 *  使用：
 *    import { getProductionConfig, isProduction, resolvePoolUrl } from './production-config.js';
 *    const poolUrl = resolvePoolUrl();   // 生产 → release pool；否则 → 开发 pool
 * ============================================================
 */

// 生产配置（默认锁定 B3-FINAL）。也可由构建期注入覆盖。
const DEFAULT_PRODUCTION = {
  production: true,
  release: 'B3-FINAL',
  version: '3.0',
  params: { gb: 0.4, lambda: 25, W: 0.2, objective: true, ratioWeight: 100, maxCollected: 8 },
  poolSource: 'release/B3-FINAL/release-pool.json',
};

// 开发回退 pool（允许实时生成路径）
const DEV_POOL_URL = 'data/pool-xwing-001.json';

let _config = DEFAULT_PRODUCTION;

/**
 * 加载生产配置（可注入，便于测试切换）
 * @param {Object} cfg - 覆盖默认生产配置
 */
export function loadProductionConfig(cfg) {
  if (cfg) _config = cfg;
  return _config;
}

export function getProductionConfig() {
  return _config;
}

export function isProduction() {
  return !!(_config && _config.production);
}

/**
 * 解析 pool 加载路径：
 *  生产 → 不可变 release pool；开发 → 允许生成/开发 pool
 * @returns {string} poolUrl
 */
export function resolvePoolUrl() {
  if (isProduction() && _config.poolSource) {
    return _config.poolSource;
  }
  return DEV_POOL_URL;
}

export default {
  loadProductionConfig,
  getProductionConfig,
  isProduction,
  resolvePoolUrl,
};