// core/experiment-artifacts.js
// 只读研究基础设施：实验产物归档。一次实验的所有材料可复制、归档、重放。
// 目录结构：experiment.json / events.jsonl / analysis.json / report.md / manifest.json

import fs from 'fs';
import path from 'path';

export function writeArtifactPackage(experimentId, { experiment, events, analysis }) {
  const dir = path.join('experiment-artifacts', String(experimentId));
  fs.mkdirSync(dir, { recursive: true });

  const reportMd = buildReportMarkdown(experiment, analysis);

  fs.writeFileSync(path.join(dir, 'experiment.json'), JSON.stringify(experiment, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'analysis.json'), JSON.stringify(analysis, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'report.md'), reportMd);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    experimentId,
    generated_at: new Date().toISOString(),
    files: ['experiment.json', 'events.jsonl', 'analysis.json', 'report.md', 'manifest.json'],
    event_count: events.length,
    variants: (experiment.variants || []).map((v) => v.id),
  }, null, 2) + '\n');

  return dir;
}

function buildReportMarkdown(experiment, analysis) {
  const lines = [`# Experiment Report — ${experiment.experimentId}`, '', `Hypothesis: ${experiment.hypothesis || '-'}`, ''];
  lines.push('## Variants');
  for (const v of experiment.variants) {
    lines.push(`- ${v.id} (${v.label})`);
  }
  lines.push('', '## Metrics');
  for (const [vid, m] of Object.entries(analysis.variants)) {
    lines.push(`### ${vid}`);
    lines.push(`- sessions: ${m.sessions}`);
    lines.push(`- completion_rate: ${m.completion_rate} (95% CI ${m.completion_rate_ci.join(' ~ ')})`);
    lines.push(`- avg_time_ms: ${m.avg_time_ms ?? '-'} (CI ${(m.avg_time_ms_ci || ['-', '-']).join(' ~ ')})`);
    lines.push(`- avg_steps: ${m.avg_steps ?? '-'}`);
    lines.push(`- hint_per_session: ${m.hint_per_session}`);
    lines.push(`- mastery: ${m.mastery}`);
  }
  lines.push('', '## Deltas');
  for (const [k, v] of Object.entries(analysis.deltas)) lines.push(`- ${k}: ${v}`);
  lines.push('', '## Quality');
  lines.push(`- missing_event_rate: ${analysis.missing_event_rate}`);
  lines.push(`- sample_size total: ${analysis.sample_size.total_sessions}`);
  lines.push(`- significance_judged: ${analysis.significance_judged}`);
  lines.push('');
  return lines.join('\n');
}