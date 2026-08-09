#!/usr/bin/env node

/**
 * ============================================================
 *  migrate-v3-to-v4.js
 *  Convert V3 chapter JSON format to V4 individual level files with lessonPlan.
 *
 *  Usage:
 *    node scripts/migrate-v3-to-v4.js [options]
 *
 *  Options:
 *    --input-dir <path>   V3 chapter JSON directory (default: ../cagemaster3/data/chapters)
 *    --output-dir <path>  V4 level output directory (default: ./data/levels)
 *    --report <path>      Migration report path (default: ./data/migration-report.json)
 *    --dry-run            Preview only, no files written
 *    --force              Overwrite existing level files
 *    --no-infer           Skip trigger-to-lessonPlan inference
 *    --verbose            Detailed logging
 * ============================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
//  CLI Argument Parsing
// ============================================================
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    inputDir: path.resolve(__dirname, '..', '..', 'cagemaster3', 'data', 'chapters'),
    outputDir: path.resolve(__dirname, '..', 'data', 'levels'),
    report: path.resolve(__dirname, '..', 'data', 'migration-report.json'),
    dryRun: false,
    force: false,
    infer: true,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input-dir':
        opts.inputDir = path.resolve(args[++i]);
        break;
      case '--output-dir':
        opts.outputDir = path.resolve(args[++i]);
        break;
      case '--report':
        opts.report = path.resolve(args[++i]);
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--force':
        opts.force = true;
        break;
      case '--no-infer':
        opts.infer = false;
        break;
      case '--verbose':
        opts.verbose = true;
        break;
      default:
        console.warn('[warn] Unknown argument: ' + args[i]);
    }
  }

  return opts;
}

// ============================================================
//  Logger
// ============================================================
function log(verbose) {
  if (verbose) {
    const args = Array.prototype.slice.call(arguments, 1);
    console.log('[migrate]', ...args);
  }
}

// ============================================================
//  Utilities
// ============================================================

function readJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[error] Failed to read file: ' + filePath + ' - ' + err.message);
    return null;
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function inferSkillName(teachingGoal) {
  if (!teachingGoal) return 'New Skill';
  const colonIdx = teachingGoal.indexOf('\uFF1A');
  if (colonIdx > 0 && colonIdx < 20) {
    return teachingGoal.substring(0, colonIdx).trim();
  }
  return teachingGoal.length > 12 ? teachingGoal.substring(0, 12) + '...' : teachingGoal;
}

function inferSkillId(teachingGoal, levelId) {
  if (!teachingGoal) return 'skill_' + levelId;
  const map = {
    '\u884C': 'row_rule',
    '\u5217': 'col_rule',
    '\u5BAB': 'box_rule',
    '\u7B3C': 'cage_rule',
    '\u661F\u8861': 'rule45',
    '\u533A\u5757': 'pointing_claiming',
    '\u6570\u5BF9': 'naked_pair',
    '\u9690': 'hidden_pair',
    '\u4E09': 'naked_triplet',
    '\u4E8C\u8FDE': 'x_wing',
    '\u4E09\u624D': 'swordfish',
    '\u8BD5\u6570': 'guess',
  };
  for (const key in map) {
    if (teachingGoal.indexOf(key) !== -1) return map[key];
  }
  return 'skill_' + levelId;
}

// ============================================================
//  Core: trigger -> lessonPlan conversion
// ============================================================

function tutorialToPhases(tutorialData, teachingGoal) {
  if (!tutorialData || !tutorialData.steps || tutorialData.steps.length === 0) {
    return null;
  }

  const steps = tutorialData.steps;
  const phases = { intro: null, demo: null, guided: null };

  let introText = '';
  let dialogueSpeaker = '\u5B88\u7B3C\u4EBA';
  let demoSteps = [];
  let guidedTargetCell = null;
  let guidedCorrectValue = null;
  let guidedHintText = '';
  let guidedMaxAttempts = 3;
  let guidedFailHint = '';
  let guidedAutoRevealAfter = 10000;
  let guidedSuccessText = '';

  for (let si = 0; si < steps.length; si++) {
    const step = steps[si];
    switch (step.type) {
      case 'dialogue': {
        if (step.lines && step.lines.length > 0) {
          const line = step.lines[0];
          if (line.text) {
            introText = line.text;
            if (line.speaker) dialogueSpeaker = line.speaker;
          }
        }
        break;
      }

      case 'highlight_cells': {
        const cells = step.cells || [];
        if (cells.length > 0) {
          if (step.highlightRow !== undefined) {
            demoSteps.push({
              action: 'highlightRow',
              target: step.highlightRow,
              duration: 1000,
            });
          }
          if (step.highlightCol !== undefined) {
            demoSteps.push({
              action: 'highlightCol',
              target: step.highlightCol,
              duration: 1000,
            });
          }
          for (let ci = 0; ci < cells.length; ci++) {
            demoSteps.push({
              action: 'focusCell',
              target: [cells[ci][0], cells[ci][1]],
              duration: step.delay || 800,
            });
          }
        }
        break;
      }

      case 'prompt_fill': {
        const cells = step.cells || [];
        if (cells.length > 0) {
          guidedTargetCell = [cells[0][0], cells[0][1]];
        }
        guidedCorrectValue = step.number !== undefined ? step.number : null;
        if (step.validation && step.validation.expected !== undefined) {
          guidedCorrectValue = step.validation.expected;
        }
        guidedHintText = teachingGoal
          ? '\u8BD5\u8BD5\u770B\uFF1A' + teachingGoal
          : '\u8FD9\u4E2A\u683C\u5B50\u5E94\u8BE5\u586B\u4EC0\u4E48\u6570\u5B57\uFF1F';
        if (step.validation && step.validation.cell) {
          guidedFailHint = '\u518D\u60F3\u60F3\uFF0C\u770B\u770B\u884C\u548C\u5217\u91CC\u5DF2\u7ECF\u6709\u54EA\u4E9B\u6570\u5B57\u4E86\u3002';
        }
        if (step.number !== undefined) {
          guidedSuccessText = '\u5BF9\u4E86\uFF01\u586B ' + step.number + ' \u662F\u6B63\u786E\u7684\u3002';
        }
        break;
      }

      case 'dialogue_after_fill': {
        if (step.lines && step.lines.length > 0) {
          const line = step.lines[0];
          if (line.text) {
            guidedSuccessText = line.text;
          }
        }
        break;
      }
    }
  }

  if (introText) {
    phases.intro = { text: introText, speaker: dialogueSpeaker, duration: 3000 };
  }
  if (demoSteps.length > 0) {
    phases.demo = { steps: demoSteps };
  }
  if (guidedTargetCell && guidedCorrectValue !== null) {
    phases.guided = {
      targetCell: guidedTargetCell,
      correctValue: guidedCorrectValue,
      interactionType: 'NUMBER',
      hintText: guidedHintText || '\u770B\u770B\u884C\u548C\u5217\uFF0C\u7F3A\u5C11\u54EA\u4E2A\u6570\u5B57\uFF1F',
      maxAttempts: guidedMaxAttempts,
      failHint: guidedFailHint || '\u518D\u89C2\u5BDF\u4E00\u4E0B\u884C\u548C\u5217\u4E2D\u7684\u6570\u5B57\u3002',
      successText: guidedSuccessText || '\u6B63\u786E\uFF01',
      autoRevealAfter: guidedAutoRevealAfter,
    };
  }

  if (!phases.intro && !phases.demo && !phases.guided) {
    return null;
  }
  return phases;
}

function inferSemiAuto(triggers) {
  if (!triggers || triggers.length === 0) {
    return { enabled: false, targetCount: 0, hintText: '', watchCells: [] };
  }

  const firstFillHints = [];
  const fillCountHints = [];
  for (let ti = 0; ti < triggers.length; ti++) {
    const t = triggers[ti];
    if (t.type === 'popup_hint' && t.condition === 'onFirstNumberFilled') {
      firstFillHints.push(t);
    }
    if (t.type === 'popup_hint' && t.condition === 'onFillCountReached') {
      fillCountHints.push(t);
    }
  }

  if (firstFillHints.length > 0) {
    const hintText = firstFillHints[0].text || '\u7EE7\u7EED\u7528\u540C\u6837\u7684\u65B9\u6CD5\u586B\u6570\u5427\u3002';
    let targetCount = 2;
    if (fillCountHints.length > 0 && fillCountHints[0].count !== undefined) {
      targetCount = fillCountHints[0].count;
    }
    return {
      enabled: true,
      targetCount: Math.min(targetCount, 5),
      hintText: hintText,
      watchCells: [],
    };
  }

  return { enabled: false, targetCount: 0, hintText: '', watchCells: [] };
}

function inferFree(triggers) {
  const finishingTriggers = [];
  if (triggers) {
    for (let ti = 0; ti < triggers.length; ti++) {
      const t = triggers[ti];
      if (t.type === 'enter_phase' && t.phase === 'finishing') {
        finishingTriggers.push(t);
      }
    }
  }
  return {
    enabled: true,
    unlockText: finishingTriggers.length > 0
      ? '\u73B0\u5728\u81EA\u7531\u586B\u6570\u5427\uFF0C\u8FDB\u5165\u6536\u5B98\u9636\u6BB5\uFF01'
      : '\u7EE7\u7EED\u81EA\u7531\u586B\u6570\u5427',
  };
}

function inferLessonPlan(triggers, teachingGoal, levelId) {
  let tutorialTrigger = null;
  if (triggers) {
    for (let ti = 0; ti < triggers.length; ti++) {
      if (triggers[ti].type === 'tutorial') {
        tutorialTrigger = triggers[ti];
        break;
      }
    }
  }

  const phases = {
    intro: { text: '', speaker: '\u5B88\u7B3C\u4EBA', duration: 3000 },
    demo: { steps: [] },
    guided: null,
    semiAuto: inferSemiAuto(triggers),
    free: inferFree(triggers),
  };

  if (tutorialTrigger && tutorialTrigger.tutorial) {
    const tutorialPhases = tutorialToPhases(tutorialTrigger.tutorial, teachingGoal);
    if (tutorialPhases) {
      if (tutorialPhases.intro) phases.intro = tutorialPhases.intro;
      if (tutorialPhases.demo) phases.demo = tutorialPhases.demo;
      if (tutorialPhases.guided) phases.guided = tutorialPhases.guided;
    }
  }

  if (!phases.guided && teachingGoal) {
    let freezeMask = null;
    if (triggers) {
      for (let ti = 0; ti < triggers.length; ti++) {
        const t = triggers[ti];
        if (t.type === 'freeze_mask' && (t.targetCell || (t.targetR !== undefined && t.targetC !== undefined))) {
          freezeMask = t;
          break;
        }
      }
    }
    if (freezeMask) {
      const targetCell = freezeMask.targetCell || [freezeMask.targetR, freezeMask.targetC];
      phases.guided = {
        targetCell: targetCell,
        correctValue: null,
        interactionType: 'NUMBER',
        hintText: teachingGoal,
        maxAttempts: 3,
        failHint: '\u518D\u89C2\u5BDF\u4E00\u4E0B\u884C\u548C\u5217\u4E2D\u7684\u6570\u5B57\u3002',
        successText: '\u6B63\u786E\uFF01',
        autoRevealAfter: 10000,
      };
    }
  }

  return {
    newSkill: inferSkillId(teachingGoal, levelId),
    skillName: inferSkillName(teachingGoal),
    skippable: true,
    phases: phases,
  };
}

// ============================================================
//  Level Conversion
// ============================================================

function convertLevel(level, opts) {
  const v4 = {
    levelId: level.levelId,
    title: level.title,
    gridSize: level.gridSize,
    difficulty: level.difficulty,
    boardData: level.boardData,
    solution: level.solution,
    cages: level.cages || [],
    features: level.features || {},
  };

  if (level.lessonPlan) {
    v4.lessonPlan = level.lessonPlan;
    log(opts.verbose, '  [level ' + level.levelId + '] Using existing lessonPlan');
  } else if (opts.infer) {
    v4.lessonPlan = inferLessonPlan(level.triggers, level.teachingGoal, level.levelId);
    log(opts.verbose, '  [level ' + level.levelId + '] Inferred lessonPlan from triggers');
  } else {
    v4.lessonPlan = {
      newSkill: 'skill_' + level.levelId,
      skillName: inferSkillName(level.teachingGoal),
      skippable: true,
      phases: {
        intro: { text: '', speaker: '\u5B88\u7B3C\u4EBA', duration: 3000 },
        demo: { steps: [] },
        guided: null,
        semiAuto: { enabled: false, targetCount: 0, hintText: '', watchCells: [] },
        free: { enabled: true, unlockText: '\u7EE7\u7EED\u81EA\u7531\u586B\u6570\u5427' },
      },
    };
    log(opts.verbose, '  [level ' + level.levelId + '] Skipped inference, created empty lessonPlan placeholder');
  }

  if (level.preDialog) v4.preDialog = level.preDialog;
  if (level.clearDialog) v4.clearDialog = level.clearDialog;
  if (level.threeAct) v4.threeAct = level.threeAct;
  if (level.isTrueEnding) v4.isTrueEnding = true;
  if (level.allowPartialCages) v4.allowPartialCages = true;

  return v4;
}

// ============================================================
//  Report
// ============================================================

function createReport() {
  return {
    migrationVersion: '3-to-4',
    timestamp: new Date().toISOString(),
    summary: {
      totalChapters: 0,
      totalLevels: 0,
      converted: 0,
      skipped: 0,
      errors: 0,
      existingLessonPlan: 0,
      inferredLessonPlan: 0,
      overwritten: 0,
    },
    details: {
      chapters: [],
      errors: [],
    },
  };
}

// ============================================================
//  Main
// ============================================================

function main() {
  const opts = parseArgs();
  const report = createReport();

  console.log('========================================');
  console.log('  V3 -> V4 Migration Script');
  console.log('========================================');
  console.log('  input:  ' + opts.inputDir);
  console.log('  output: ' + opts.outputDir);
  console.log('  dry-run: ' + opts.dryRun);
  console.log('  force:  ' + opts.force);
  console.log('  infer:  ' + opts.infer);
  console.log('========================================\n');

  // 1. Read chapters-index.json
  const indexPath = path.join(opts.inputDir, 'chapters-index.json');
  log(opts.verbose, 'Reading index: ' + indexPath);
  const indexData = readJSON(indexPath);
  if (!indexData) {
    console.error('[error] Cannot read chapters-index.json, check --input-dir');
    process.exit(1);
  }

  const chapters = indexData.chapters || [];
  report.summary.totalChapters = chapters.length;
  const chapterIndexMap = [];

  // 2. Process each chapter
  for (let ci = 0; ci < chapters.length; ci++) {
    const chapterInfo = chapters[ci];
    const chapterPath = path.join(opts.inputDir, chapterInfo.file);
    log(opts.verbose, '\nProcessing chapter: ' + chapterInfo.title + ' (' + chapterInfo.file + ')');

    const chapterData = readJSON(chapterPath);
    if (!chapterData) {
      report.summary.errors++;
      report.details.errors.push({
        chapter: chapterInfo.file,
        error: 'Failed to read or parse JSON',
      });
      continue;
    }

    const levels = chapterData.levels || [];
    const chapterIndexEntry = {
      chapterId: chapterData.chapterId,
      title: chapterData.title,
      description: chapterData.description || '',
      theme: chapterData.theme !== undefined ? chapterData.theme : 0,
      unlockCondition: chapterData.unlockCondition || {},
      levelIds: [],
    };

    // 3. Process each level
    for (let li = 0; li < levels.length; li++) {
      const level = levels[li];
      const levelId = level.levelId;
      report.summary.totalLevels++;

      const levelFileName = 'level-' + levelId + '.json';
      const levelFilePath = path.join(opts.outputDir, levelFileName);
      const fileExists = fs.existsSync(levelFilePath);

      if (fileExists && !opts.force) {
        log(opts.verbose, '  [level ' + levelId + '] Skipped (file exists, use --force to overwrite)');
        report.summary.skipped++;
        chapterIndexEntry.levelIds.push(levelId);
        continue;
      }

      try {
        const v4Level = convertLevel(level, opts);

        if (level.lessonPlan) {
          report.summary.existingLessonPlan++;
        } else if (opts.infer) {
          report.summary.inferredLessonPlan++;
        }

        if (!opts.dryRun) {
          ensureDir(opts.outputDir);
          fs.writeFileSync(levelFilePath, JSON.stringify(v4Level, null, 2), 'utf-8');
          log(opts.verbose, '  [level ' + levelId + '] Written: ' + levelFileName);
        } else {
          log(opts.verbose, '  [level ' + levelId + '] (dry-run) Preview: ' + levelFileName);
        }

        if (fileExists && opts.force) {
          report.summary.overwritten++;
        }
        report.summary.converted++;
        chapterIndexEntry.levelIds.push(levelId);
      } catch (err) {
        console.error('[error] Convert level ' + levelId + ' failed: ' + err.message);
        report.summary.errors++;
        report.details.errors.push({
          chapter: chapterInfo.file,
          levelId: levelId,
          error: err.message,
        });
      }
    }

    chapterIndexMap.push(chapterIndexEntry);
    report.details.chapters.push(chapterIndexEntry);
  }

  report.summary.skipped = report.summary.totalLevels - report.summary.converted;

  // 4. Generate chapters.json
  if (!opts.dryRun) {
    const chaptersJsonPath = path.resolve(opts.outputDir, '..', 'chapters.json');
    ensureDir(path.dirname(chaptersJsonPath));
    const chaptersJson = {
      version: 4,
      totalChapters: chapterIndexMap.length,
      chapters: chapterIndexMap,
    };
    fs.writeFileSync(chaptersJsonPath, JSON.stringify(chaptersJson, null, 2), 'utf-8');
    log(opts.verbose, '\nWritten chapters.json: ' + chaptersJsonPath);
  }

  // 5. Output summary
  console.log('\n========================================');
  console.log('  Migration Complete');
  console.log('========================================');
  console.log('  Total chapters:      ' + report.summary.totalChapters);
  console.log('  Total levels:        ' + report.summary.totalLevels);
  console.log('  Converted:           ' + report.summary.converted);
  console.log('  Skipped:             ' + report.summary.skipped);
  console.log('  Errors:              ' + report.summary.errors);
  console.log('  Overwritten:         ' + report.summary.overwritten);
  console.log('  Existing lessonPlan: ' + report.summary.existingLessonPlan);
  console.log('  Inferred lessonPlan: ' + report.summary.inferredLessonPlan);
  console.log('========================================');

  if (opts.dryRun) {
    console.log('\n[dry-run] No files were written. Run without --dry-run to execute.');
  }

  // 6. Write report
  if (!opts.dryRun) {
    ensureDir(path.dirname(opts.report));
    fs.writeFileSync(opts.report, JSON.stringify(report, null, 2), 'utf-8');
    console.log('\nMigration report: ' + opts.report);
  }
}

main();