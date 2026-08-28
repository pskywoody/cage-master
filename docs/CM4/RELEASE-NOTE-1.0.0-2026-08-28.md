# 《笼中密信：上海1941》 Release Note — v1.0.0 (2026-08-28)

## 一句话
单一 **Web Release** 已封板，产出喂三种载体的静态发布包：**Web / Windows EXE / Android APK**。

## Release 门禁（封板时实测）
`npm test`（scripts/test-suite.mjs）**15/15 通过**；`npm test:quick` 1.4s。门禁含：
- levels / chapter-arc / i18n / references / solvability（63 关唯一解·可解·笼和·boardData↔solution）/ teaching-demo / boss-solutions / learner-state / experiment / replay

## 发布包
- 生成命令：`npm run release:pack`（`scripts/pack-release.mjs`）
- 产物目录：`release/web/`（已 gitignore，不跟踪）
- 内容：**710 文件 / 231.2 MB / rev 780b440**
- 入口：`game.html`（主）、`index.html`、`replay.html`、`ai-debug.html`
- 清单：`release/web/MANIFEST.json`（文件数/大小/入口 sha256/版本），`.git-version.txt`
- 只打包运行时真实依赖：core(去 suzhou)/renderer/ui/story/content/expert + i18n + config + data/{levels,scripts,free_mode_levels} + assets/{audio,images}。研究/临时产物（40+ data 研究子目录、audio_next、archive、docs、scripts、samples、build、dist）全部排除。
- 核验：发布包内无代码级悬空引用（无指向被排除目录的 404）；离线可玩（唯一网络项是 Google Fonts preconnect）。

## 三载体消费方式
| 载体 | 方式 |
|---|---|
| Web | 静态托管 `release/web/`（任意静态服务器 / dev-server） |
| Windows EXE | 用 `release/web/` 包一层 WebView/Electron 壳，入口 `game.html` |
| Android APK | 将 `release/web/` 作为 WebView 资源打包，入口 `game.html` |

## 已知项 / 记账（不阻塞，但须知悉）
1. **核心逻辑测试层(2) 与浏览器冒烟层(3) 尚未做**：当前只有 Layer-1 数据/规则测试。L2(Layer 2)/L3 建议作为 v1.0 之后的工作。
2. **离线字体降级**：`game.html` 引用 Google Fonts（Caveat/Fira Code/ZCOOL 晓蔚）。离线载体无本地字体文件，走本地兜底（楷体/苹方/雅黑/Comic Sans MS 等）。需要像素级一致时，应把字体打进 assets 并本地 `@font-face`。
3. **冻结文件被改动记录**：`core/battle-manager.js`（项目规则要求冻结 6379 行只读）工作区含 V4.3.41「教学引导格保护」改动（+28/-3，`git diff` 可查）。封板基线 = 当前已测 15/15 通过态，此改动已计入。若要严格维持冻结，需单独评估回退或正式豁免。
4. **apt 级数据漂移（旧报告曾言）**：本次封板以当前 master 工作区为准；未处理既有 44 关 uncommitted 改动与 freeze manifest 的差异，作为已知放开。
5. **i18n 已完成缺口修复**：本次修复 teaching-demo Case4（204→203）、补 308 teachingGoal 四语、补 en/ja/ko 约 30 键。

## 下一步（交接给封装方）
1. 按需把字体本地化（离线一致渲染）——可选
2. 三个壳各自用 `release/web/` 生成 EXE / APK / Web 部署
3. 建议给 build 产物打 release tag；如需，可执行：
   `git tag v1.0.0 && git push origin v1.0.0`（封板标记，不含 release/ 大文件，因已 gitignore）