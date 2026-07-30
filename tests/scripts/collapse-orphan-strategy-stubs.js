/**
 * Remove orphan RouteN / TuneN / Path* strategy stubs across runtime packages.
 *
 *   node tests/scripts/collapse-orphan-strategy-stubs.js
 *   node tests/scripts/collapse-orphan-strategy-stubs.js --dry-run
 *   node tests/scripts/collapse-orphan-strategy-stubs.js --ids transformer-turns,rc-circuit
 *   node tests/scripts/collapse-orphan-strategy-stubs.js --no-export
 *
 * Then writes 图谱.html (runtime + 样本html) unless --no-export.
 */
const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const {
  collapseOrphanStubsInChapter,
  collectSelectTargets,
  ORPHAN_HUB_RE,
} = require('../../packages/shared/collapse-orphan-strategy-stubs.js');
const { repairStrategyRouteHighlights } = require('../../packages/contract/repair/strategy-route-repair.js');
const { writePriorityGraphFiles } = require('../../packages/generate/export/build-priority-graph-html');
const { getPackagesRoot } = require('../../packages/shared/data-paths');
const {
  parseStrategyMermaidEdges,
  extractStrategyNodeLabels,
} = require('../../packages/shared/strategy-mermaid-parse.js');

const ROOT = path.resolve(__dirname, '../..');
const PACKAGES = getPackagesRoot();
const YANG = path.join(ROOT, '\u6837\u672chtml');
const REPORT = path.join(PACKAGES, 'reports', 'collapse-orphan-strategy-stubs.json');

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

function auditOrphanHubs(mermaid) {
  const edges = parseStrategyMermaidEdges(mermaid);
  const labels = extractStrategyNodeLabels(mermaid);
  const selectTargets = collectSelectTargets(edges);
  const nodes = new Set();
  edges.forEach(e => { nodes.add(e.from); nodes.add(e.to); });
  labels.forEach((_, id) => nodes.add(id));
  const orphans = [];
  for (const id of nodes) {
    if (!ORPHAN_HUB_RE.test(id)) continue;
    if (selectTargets.has(id)) continue;
    const incoming = edges.filter(e => e.to === id);
    if (incoming.some(e => /StrategySelect\d*/i.test(e.from))) continue;
    orphans.push({
      id,
      label: labels.get(id) || '',
      outs: edges.filter(e => e.from === id).map(e => e.to),
    });
  }
  return orphans;
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

  const rows = [];
  const removedByPkg = {};

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

    const before = auditOrphanHubs(raw.strategy.mermaid);
    const collapsed = collapseOrphanStubsInChapter(raw);
    let chapter = collapsed.chapter;
    if (collapsed.changed) {
      chapter = repairStrategyRouteHighlights(chapter);
    }
    const after = auditOrphanHubs(chapter.strategy?.mermaid || '');

    let exported = null;
    if (collapsed.changed && !dry) {
      fs.writeFileSync(chapterPath, `${JSON.stringify(chapter, null, 2)}\n`, 'utf8');
      if (!noExport) exported = exportOne(id, chapter);
    }

    if (collapsed.removedNodes?.length) {
      removedByPkg[id] = collapsed.removedNodes;
    }

    const row = {
      id,
      changed: collapsed.changed,
      orphanHubs: collapsed.orphanHubs,
      removedNodes: collapsed.removedNodes,
      before,
      after,
      exported,
    };
    rows.push(row);
    const tag = collapsed.changed ? (dry ? 'DRY' : 'OK') : 'SKIP';
    console.log(
      tag,
      id,
      `hubs=${(collapsed.orphanHubs || []).length}`,
      `removed=${(collapsed.removedNodes || []).length}`,
      before.length ? `before:[${before.map(o => o.id).join(',')}]` : 'before:clean',
      after.length ? `after:[${after.map(o => o.id).join(',')}]` : 'after:clean',
    );
  }

  const summary = {
    dry,
    packageCount: ids.length,
    touched: rows.filter(r => r.changed).map(r => r.id),
    removedByPkg,
    residualOrphans: rows.filter(r => (r.after || []).length).map(r => ({
      id: r.id,
      after: r.after,
    })),
    rows,
  };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(summary, null, 2), 'utf8');
  console.log('\nSummary');
  console.log('  touched:', summary.touched.length, summary.touched.join(', ') || '(none)');
  for (const [pkg, nodes] of Object.entries(removedByPkg)) {
    console.log(`  ${pkg}: ${nodes.length} → ${nodes.join(', ')}`);
  }
  console.log('  residual orphan hubs:', summary.residualOrphans.length);
  console.log('  report:', REPORT);
}

main();
