/** CLI: node tests/scripts/audit-html-samples-playability.js [--json] */
const fs = require('fs');
const path = require('path');
const { loadAllSamples } = require('../lib/html-samples-manifest');
const { auditHtmlContent, hasTraceHook, hasWinEmit } = require('../../packages/platform/legacy-trace-inject');
const { getPackageGamePath, getPackagesRoot } = require('../../packages/shared/data-paths');

const REPORT_MD = path.join(getPackagesRoot(), 'reports', 'playability-report.md');
const REPORT_JSON = path.join(getPackagesRoot(), 'reports', 'playability-report.json');

function main() {
  const { samples } = loadAllSamples();
  const rows = [];
  let errors = 0;

  for (const sample of samples) {
    const htmlPath = getPackageGamePath(sample.id);
    if (!fs.existsSync(htmlPath)) {
      rows.push({ id: sample.id, topic: sample.topic, error: 'missing_html' });
      errors++;
      continue;
    }
    const html = fs.readFileSync(htmlPath, 'utf8');
    const audit = auditHtmlContent(html, sample);
    const issues = [];
    if (!audit.hasTraceHook) issues.push('no_trace_hook');
    if (!audit.hasWinEmit) issues.push('no_win_emit');
    if (audit.staticOnly) issues.push('motion_static_only');
    if (issues.length) errors += issues.length;
    rows.push({
      ...audit,
      topic: sample.topic,
      legacy: !!sample.existingHtml,
      issues,
    });
  }

  const summary = {
    total: samples.length,
    withTraceHook: rows.filter(r => r.hasTraceHook).length,
    withWinEmit: rows.filter(r => r.hasWinEmit).length,
    withRaf: rows.filter(r => r.hasRaf).length,
    legacyCount: rows.filter(r => r.legacy).length,
    staticMotion: rows.filter(r => r.staticOnly).length,
    issueCount: errors,
  };

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ summary, rows }, null, 2));
  } else {
    console.log(`audit-html-samples-playability: ${samples.length} samples`);
    console.log(`  trace hook: ${summary.withTraceHook}/${summary.total}`);
    console.log(`  win emit:   ${summary.withWinEmit}/${summary.total}`);
    console.log(`  RAF:        ${summary.withRaf}/${summary.total}`);
    console.log(`  static motion: ${summary.staticMotion}`);
    for (const r of rows) {
      if (r.issues?.length) {
        console.log(`  ✗ ${r.id}: ${r.issues.join(', ')}`);
      }
    }
  }

  writeReport(summary, rows);

  if (summary.withTraceHook < summary.total || summary.withWinEmit < summary.total) {
    process.exit(1);
  }
}

function writeReport(summary, rows) {
  fs.mkdirSync(path.dirname(REPORT_MD), { recursive: true });
  const lines = [
    '# HTML 样本集可玩性审计',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    '## 汇总',
    '',
    '| 指标 | 值 |',
    '|------|-----|',
    `| 样本总数 | ${summary.total} |`,
    `| 含 trace hook | ${summary.withTraceHook} |`,
    `| 含 win 埋点 | ${summary.withWinEmit} |`,
    `| 含 RAF 动画 | ${summary.withRaf} |`,
    `| Legacy 条目 | ${summary.legacyCount} |`,
    `| 运动类静态（无 RAF） | ${summary.staticMotion} |`,
    '',
    '## 明细',
    '',
    '| id | topic | legacy | RAF | hook | win | 需发射按钮 | issues |',
    '|----|-------|--------|-----|------|-----|-----------|--------|',
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.id} | ${r.topic || '—'} | ${r.legacy ? '✓' : ''} | ${r.hasRaf ? '✓' : ''} | ${r.hasTraceHook ? '✓' : ''} | ${r.hasWinEmit ? '✓' : ''} | ${r.needsFireButton ? '✓' : ''} | ${(r.issues || []).join(', ') || '—'} |`,
    );
  }
  fs.writeFileSync(REPORT_MD, `${lines.join('\n')}\n`, 'utf8');
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify({ summary, rows }, null, 2)}\n`, 'utf8');
}

module.exports = { auditHtmlContent, hasTraceHook, hasWinEmit };

if (require.main === module) main();
