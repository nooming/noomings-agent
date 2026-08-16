/**
 * Collapse redundant trap-path synonym chains across runtime packages.
 *
 *   node tests/scripts/collapse-trap-redundant-chains.js
 *   node tests/scripts/collapse-trap-redundant-chains.js --dry-run
 *   node tests/scripts/collapse-trap-redundant-chains.js --ids multi-kp,efield-charge
 *   node tests/scripts/collapse-trap-redundant-chains.js --no-export
 *
 * Then writes 图谱.html (runtime + 样本html) unless --no-export.
 */
const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const { collapseTrapChainsInChapter } = require('../../packages/shared/collapse-trap-redundant-chains.js');
const { repairStrategyRouteHighlights } = require('../../packages/contract/repair/strategy-route-repair.js');
const { writePriorityGraphFiles } = require('../../packages/generate/export/build-priority-graph-html');
const { getPackagesRoot, getReportsRoot } = require('../../packages/shared/data-paths');
const {
  parseStrategyMermaidEdges,
  extractStrategyNodeLabels,
} = require('../../packages/shared/strategy-mermaid-parse.js');

const ROOT = path.resolve(__dirname, '../..');
const PACKAGES = getPackagesRoot();
const YANG = path.join(ROOT, '\u6837\u672chtml');
const REPORT = path.join(getReportsRoot(), 'collapse-trap-redundant-chains.json');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function listPackageIds() {
  return fs.readdirSync(PACKAGES, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(PACKAGES, d.name, 'chapter.json')))
    .map(d => d.name)
    .sort();
}

function auditTrapSpine(mermaid) {
  const edges = parseStrategyMermaidEdges(mermaid);
  const labels = extractStrategyNodeLabels(mermaid);
  const selectTraps = edges
    .filter(e => /StrategySelect/i.test(e.from) && /^(Trap|TrapC|Trap2|TrapRoute)$/i.test(e.to))
    .map(e => e.to);
  const issues = [];
  for (const trapId of [...new Set(selectTraps)]) {
    const outs = edges.filter(e => e.from === trapId);
    for (const o of outs) {
      const lab = labels.get(o.to) || '';
      if (/TrapStrat|AdjustBoth|AdjustMulti|AdjustAll|TuneTrap|Blind/i.test(o.to)
        || /多参盲调|同时调多个/.test(lab)) {
        issues.push(`${trapId}-->${o.to}`);
      }
    }
    const lab = labels.get(trapId) || '';
    if (lab && lab !== '多参盲调') issues.push(`${trapId}label=${lab}`);
  }
  // Orphan synonym bridges
  for (const e of edges) {
    if (/TrapStrat/i.test(e.from) || /TrapStrat/i.test(e.to)) {
      issues.push(`orphan-bridge ${e.from}->${e.to}`);
    }
  }
  return issues;
}

function exportOne(id, chapter) {
  const entry = YANG_MAP.find(e => e.id === id);
  const pkgDir = path.join(PACKAGES, id);
  const metaPath = path.join(pkgDir, 'meta.json');
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
  const title = meta.title || chapter.kg?.title || chapter.strategy?.title || entry?.topic || id;
  const sampleDir = entry ? path.join(YANG, entry.dir) : null;
  try {
    const result = writePriorityGraphFiles({
      chapter,
      title,
      runtimeDir: pkgDir,
      sampleDir: sampleDir && fs.existsSync(path.dirname(sampleDir)) ? sampleDir : pkgDir,
    });
    return { ok: true, bytes: result.bytes };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function main() {
  const dry = hasFlag('--dry-run');
  const noExport = hasFlag('--no-export');
  const filter = argValue('--ids');
  const ids = filter
    ? filter.split(',').map(s => s.trim()).filter(Boolean)
    : listPackageIds();

  const totals = {
    collapsed: 0,
    labelOnly: 0,
    removedHops: 0,
    patterns: {
      trapStratBridge: 0,
      trapToAdjustMulti: 0,
      trapToBlindTune: 0,
      orphanMultiTrap: 0,
      other: 0,
    },
  };
  const rows = [];

  for (const id of ids) {
    const chapterPath = path.join(PACKAGES, id, 'chapter.json');
    if (!fs.existsSync(chapterPath)) {
      rows.push({ id, ok: false, error: 'missing chapter.json' });
      continue;
    }
    const raw = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
    if (!raw.strategy?.mermaid) {
      rows.push({ id, ok: true, skipped: true });
      continue;
    }

    const beforeIssues = auditTrapSpine(raw.strategy.mermaid);
    const collapsed = collapseTrapChainsInChapter(raw);
    let chapter = collapsed.chapter;
    // Re-run highlight repair so spines stay consistent after topology change
    if (collapsed.changed) {
      chapter = repairStrategyRouteHighlights(chapter);
    }
    const afterIssues = auditTrapSpine(chapter.strategy?.mermaid || '');

    if (collapsed.stats) {
      totals.collapsed += collapsed.stats.collapsed || 0;
      totals.labelOnly += collapsed.stats.labelOnly || 0;
      totals.removedHops += collapsed.stats.removedHops || 0;
      for (const k of Object.keys(totals.patterns)) {
        totals.patterns[k] += collapsed.stats.patterns?.[k] || 0;
      }
    }

    let exported = null;
    if (collapsed.changed && !dry) {
      fs.writeFileSync(chapterPath, `${JSON.stringify(chapter, null, 2)}\n`, 'utf8');
      if (!noExport) exported = exportOne(id, chapter);
    }

    const row = {
      id,
      changed: collapsed.changed,
      stats: collapsed.stats,
      removedNodes: collapsed.removedNodes,
      beforeIssues,
      afterIssues,
      exported,
    };
    rows.push(row);
    const tag = collapsed.changed ? (dry ? 'DRY' : 'OK') : 'SKIP';
    console.log(
      tag,
      id,
      `collapsed=${collapsed.stats?.collapsed || 0}`,
      `hops=${collapsed.stats?.removedHops || 0}`,
      beforeIssues.length ? `before:[${beforeIssues.slice(0, 3).join(';')}]` : 'before:clean',
      afterIssues.length ? `after:[${afterIssues.slice(0, 3).join(';')}]` : 'after:clean',
    );
  }

  const summary = {
    dry,
    packageCount: ids.length,
    totals,
    residualIssues: rows.filter(r => (r.afterIssues || []).length).map(r => ({
      id: r.id,
      afterIssues: r.afterIssues,
    })),
    touched: rows.filter(r => r.changed).map(r => r.id),
    rows,
  };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(summary, null, 2), 'utf8');
  console.log('\nSummary');
  console.log('  patterns:', totals.patterns);
  console.log('  collapsed entries:', totals.collapsed, 'removed hops:', totals.removedHops);
  console.log('  touched:', summary.touched.length, summary.touched.join(', ') || '(none)');
  console.log('  residual:', summary.residualIssues.length);
  console.log('  report:', REPORT);
}

main();
