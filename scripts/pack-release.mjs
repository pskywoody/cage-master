// ============================================================
//  pack-release.mjs - 生成 Web Release 发布包（单一源 → Web/EXE/APK 三载体）
// ============================================================
//  只复制游戏运行时真实依赖到 release/web/，隔离研究/临时产物：
//    INCLUDE: 入口 html + core(去suzhou)/renderer/ui/story/content/expert/
//             i18n/config/assets/{audio,images} + data/{levels,scripts,free_mode_levels}
//    EXCLUDE: node_modules build dist samples test docs scripts
//             assets/{audio_next,archive} data/*研究子目录 根目录手稿
//  产物: release/web/MANIFEST.json
//  用: node scripts/pack-release.mjs [--out release/web]
// ============================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_FLAG = process.argv.indexOf('--out');
const OUT = OUT_FLAG !== -1 ? path.resolve(ROOT, process.argv[OUT_FLAG + 1]) : path.join(ROOT, 'release', 'web');

const DIRS = ['core', 'renderer', 'ui', 'story', 'content', 'expert', 'i18n', 'config', 'audio', 'assets/audio', 'assets/images'];
const DATA_SUBS = ['levels', 'scripts', 'free_mode_levels'];
// 运行时需要的 data/ 顶层文件（精确列入，避免把 b3/b4/suzhou/gen_batch 等研究产物带进发布包）
const DATA_TOP_FILES = ['chapters.json', 'script-data.js'];
const ENTRIES = ['game.html', 'index.html', 'replay.html', 'ai-debug.html'];
const EXCLUDE_SEG = new Set(['suzhou', 'archive', 'audio_next', '__pycache__']);

function ok(rel) { return rel.split(path.sep).every((s) => !EXCLUDE_SEG.has(s)); }

function copy(src, dst, base) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dst, { recursive: true });
  let n = 0;
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const rel = base ? path.join(base, ent.name) : ent.name;
    if (!ok(rel)) continue;
    const s = path.join(src, ent.name), d = path.join(dst, ent.name);
    if (ent.isDirectory()) n += copy(s, d, rel);
    else { fs.copyFileSync(s, d); n++; }
  }
  return n;
}

function sha(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 12); }

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let n = 0;
for (const e of ENTRIES) {
  const s = path.join(ROOT, e);
  if (fs.existsSync(s)) { fs.copyFileSync(s, path.join(OUT, e)); n++; }
}
for (const d of DIRS) n += copy(path.join(ROOT, d), path.join(OUT, d), d);
for (const sub of DATA_SUBS) n += copy(path.join(ROOT, 'data', sub), path.join(OUT, 'data', sub), path.join('data', sub));
for (const f of DATA_TOP_FILES) {
  const s = path.join(ROOT, 'data', f);
  if (fs.existsSync(s)) { fs.copyFileSync(s, path.join(OUT, 'data', f)); n++; }
}

// 汇总 + MANIFEST
let total = 0, bytes = 0;
const files = [];
(function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else { total++; bytes += fs.statSync(p).size; files.push(path.relative(OUT, p).split(path.sep).join('/')); }
  }
})(OUT);

let gitRev = 'n/a';
try {
  try { gitRev = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).toString().trim(); }
  catch (e) { gitRev = execSync('git rev-parse --short HEAD 2>/dev/null', { cwd: ROOT, encoding: 'utf8' }).toString().trim(); }
} catch (e) { /* ignore */ }

let version = '1.0.0';
try { version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch (e) {}

// 入口各写 sha（便于三载体校验）
const entryShas = {};
for (const e of ENTRIES) { const p = path.join(OUT, e); if (fs.existsSync(p)) entryShas[e] = sha(p); }

const manifest = {
  name: 'cagemaster4-web-release',
  version,
  generatedAt: new Date().toISOString(),
  gitRevision: gitRev,
  entries: entryShas,
  stats: { files: total, bytes, mb: Math.round(bytes / 1048576 * 10) / 10 },
  carrier: {
    web: '静态托管 ' + OUT,
    exe: '用该目录包一层 WebView/Electron 壳生成 Windows EXE',
    apk: '用该目录作为 Android WebView 资源，入口 game.html 打包为 APK',
  },
};
fs.writeFileSync(path.join(OUT, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(OUT, '.git-version.txt'), `${version} @ ${gitRev}\n`);

console.log('√ Web Release 打包完成 → ' + OUT);
console.log(`  文件 ${total} | 大小 ${manifest.stats.mb} MB | 版本 ${version} | rev ${gitRev}`);
console.log(`  入口: ${ENTRIES.filter((e) => entryShas[e]).join(', ')}`);
console.log(`  MANIFEST: ${path.join(OUT, 'MANIFEST.json')}`);