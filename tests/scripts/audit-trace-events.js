/**
 * Audit trace-event contract across 23 yangben game HTML files.
 * Checks for mode switch, tuning, fire/attempt instrumentation patterns.
 *
 *   node tests/scripts/audit-trace-events.js
 */
const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const { getPackagesRoot } = require('../../packages/shared/data-paths');

const ROOT = path.resolve(__dirname, '../..');
const YANG = path.join(ROOT, '样本html');
const REPORTS = path.join(getPackagesRoot(), 'reports');

const CHECKS = [
  {
    id: 'platform_trace_or_game_trace',
    re: /PlatformTrace|GameTrace|__gameTrace|record\s*\(\s*['"]tuning|ingestTrace/i,
    severity: 'error',
    label: '轨迹桥接（PlatformTrace / GameTrace）',
  },
  {
    id: 'tuning_event',
    re: /tuning|recordTuning|type:\s*['"]tuning['"]/i,
    severity: 'warn',
    label: '控件调节事件',
  },
  {
    id: 'fire_or_action',
    re: /btn-fire|btn_fire|type:\s*['"]action['"]|type:\s*['"]snapshot['"]|发射|recordFire|launch/i,
    severity: 'warn',
    label: '发射/尝试边界',
  },
  {
    id: 'mode_switch',
    re: /modeSelect|phase_change|currentPhase|explore|challenge|竞赛|探究模式/i,
    severity: 'info',
    label: '模式切换痕迹',
  },
];

function loadHtml(entry) {
  const pkgGame = path.join(getPackagesRoot(), entry.id, 'game.html');
  const sampleGame = path.join(YANG, entry.dir, entry.game);
  const p = fs.existsSync(pkgGame) ? pkgGame : sampleGame;
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

function auditOne(entry) {
  const html = loadHtml(entry);
  if (html == null) return { id: entry.id, ok: false, error: 'html_missing' };
  const results = CHECKS.map(c => ({
    id: c.id,
    label: c.label,
    severity: c.severity,
    pass: c.re.test(html),
  }));
  const gaps = results.filter(r => !r.pass && r.severity !== 'info');
  return {
    id: entry.id,
    ok: true,
    results,
    gapCount: gaps.length,
    gaps: gaps.map(g => g.id),
  };
}

function main() {
  const rows = YANG_MAP.map(auditOne);
  const withGaps = rows.filter(r => r.ok && r.gapCount > 0);
  const payload = {
    generatedAt: new Date().toISOString(),
    contract: {
      events: ['tuning', 'action', 'snapshot', 'win', 'explore_success', 'phase_change', 'mode'],
      note: '学生端 PlatformTraceAdapter 统一上报；游戏内可挂 GameTrace 桥。缺桥接时教师看板只能看到壳层事件。explore_success=探究达成；win=竞赛通关。',
    },
    summary: {
      covered: rows.filter(r => r.ok).length,
      withGaps: withGaps.length,
    },
    rows,
  };
  fs.mkdirSync(REPORTS, { recursive: true });
  fs.writeFileSync(path.join(REPORTS, 'trace-event-audit.json'), JSON.stringify(payload, null, 2), 'utf8');
  const md = [
    '# 埋点事件契约审计（23 样本）',
    '',
    `生成时间：${payload.generatedAt}`,
    '',
    '## 关键事件',
    '',
    '- `tuning`：控件调节',
    '- `action` / `snapshot`：发射或尝试边界',
    '- `phase_change` / `mode`：探究↔竞赛',
    '- `explore_success`：探究达成（不计竞赛通关）',
    '- `win`：竞赛通关',
    '',
    `有缺口样本：**${withGaps.length}** / ${payload.summary.covered}`,
    '',
    '| id | 桥接 | tuning | fire/action | mode | 缺口 |',
    '| --- | :---: | :---: | :---: | :---: | --- |',
  ];
  for (const r of rows) {
    if (!r.ok) {
      md.push(`| ${r.id} | — | — | — | — | ${r.error} |`);
      continue;
    }
    const m = Object.fromEntries(r.results.map(x => [x.id, x.pass ? '✓' : '✗']));
    md.push(`| ${r.id} | ${m.platform_trace_or_game_trace} | ${m.tuning_event} | ${m.fire_or_action} | ${m.mode_switch} | ${(r.gaps || []).join(', ') || '—'} |`);
  }
  fs.writeFileSync(path.join(REPORTS, 'trace-event-audit.md'), md.join('\n'), 'utf8');
  console.log(md.join('\n'));
}

main();
