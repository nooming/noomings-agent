/**
 * Collapse duplicate StrategySelect* 「选择调参策略?」 hubs across runtime packages.
 *
 *   node tests/scripts/collapse-duplicate-strategy-select.js
 *   node tests/scripts/collapse-duplicate-strategy-select.js --dry-run
 *   node tests/scripts/collapse-duplicate-strategy-select.js --ids magnetic-force,circular-motion
 *   node tests/scripts/collapse-duplicate-strategy-select.js --no-export
 *
 * Then writes 图谱.html (runtime + 样本html) unless --no-export.
 */
const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const {
  collapseDuplicateSelectInChapter,
  auditDuplicateSelectHubs,
} = require('../../packages/shared/collapse-duplicate-strategy-select.js');
const { repairStrategyRouteHighlights } = require('../../packages/contract/repair/strategy-route-repair.js');
const { writePriorityGraphFiles } = require('../../packages/generate/export/build-priority-graph-html');
const { getPackagesRoot } = require('../../packages/shared/data-paths');
const { parseStrategyMermaidEdges } = require('../../packages/shared/strategy-mermaid-parse.js');

const ROOT = path.resolve(__dirname, '../..');
const PACKAGES = getPackagesRoot();
const YANG = path.join(ROOT, '\u6837\u672chtml');
const REPORT = path.join(PACKAGES, 'reports', 'collapse-duplicate-strategy-select.json');

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

function verifySingleHub(mermaid) {
  const audit = auditDuplicateSelectHubs(mermaid);
  const edges = parseStrategyMermaidEdges(mermaid);
  const selectIds = new Set();
  for (const e of edges) {
    if (/^StrategySelect/i.test(e.from)) selectIds.add(e.from);
    if (/^StrategySelect/i.test(e.to)) selectIds.add(e.to);
  }
  const fanOutFrom = [...new Set(
    edges.filter(e => /^StrategySelect/i.test(e.from) && e.label).map(e => e.from),
  )];
  const modeIns = edges
    .filter(e => /^StrategySelect$/i.test(e.to))
    .map(e => e.from)
    .filter(id => /Explore|Challenge|Mode/i.test(id));
  return {
    selectIds: [...selectIds],
    aliasesLeft: audit.aliases,
    fanOutFrom,
    modeIns,
    ok: selectIds.size <= 1 && audit.aliases.length === 0
      && fanOutFrom.every(id => id === 'StrategySelect'),
  };
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

    const before = auditDuplicateSelectHubs(raw.strategy.mermaid);
    const collapsed = collapseDuplicateSelectInChapter(raw);
    let chapter = collapsed.chapter;
    if (collapsed.changed) {
      chapter = repairStrategyRouteHighlights(chapter);
    }
    const after = auditDuplicateSelectHubs(chapter.strategy?.mermaid || '');
    const verify = verifySingleHub(chapter.strategy?.mermaid || '');

    // Count highlight remaps for report
    const hlRewrites = [];
    if (collapsed.changed && collapsed.aliases?.length) {
      for (const route of chapter.strategy?.routes || []) {
        const staleN = (route.highlightNodes || []).filter(n =>
          collapsed.aliases.some(a => a === n));
        const staleE = (route.highlightEdges || []).filter(p =>
          Array.isArray(p) && collapsed.aliases.some(a => a === p[0] || a === p[1]));
        if (staleN.length || staleE.length) {
          hlRewrites.push({ route: route.id, staleN, staleE });
        }
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
      aliases: collapsed.aliases,
      before,
      after,
      verify,
      hlRewrites,
      exported,
    };
    rows.push(row);
    const tag = collapsed.changed ? (dry ? 'DRY' : 'OK') : 'SKIP';
    console.log(
      tag,
      id,
      collapsed.aliases?.length ? `aliases:[${collapsed.aliases.join(',')}]` : 'aliases:none',
      before.aliases.length ? `before:[${before.aliases.join(',')}]` : 'before:clean',
      after.aliases.length ? `after:[${after.aliases.join(',')}]` : 'after:clean',
      verify.ok ? 'verify:ok' : `verify:FAIL ids=${verify.selectIds.join(',')}`,
      exported?.ok ? `export:${exported.bytes}` : (exported ? `exportFail:${exported.error}` : ''),
    );
  }

  const summary = {
    dry,
    packageCount: ids.length,
    touched: rows.filter(r => r.changed).map(r => r.id),
    aliasByPkg: Object.fromEntries(
      rows.filter(r => r.changed).map(r => [r.id, r.aliases || []]),
    ),
    residualDuplicates: rows.filter(r => (r.after?.aliases || []).length).map(r => ({
      id: r.id,
      after: r.after,
    })),
    verifyFails: rows.filter(r => r.changed && r.verify && !r.verify.ok).map(r => ({
      id: r.id,
      verify: r.verify,
    })),
    rows,
  };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(summary, null, 2), 'utf8');
  console.log('\nSummary');
  console.log('  touched:', summary.touched.length, summary.touched.join(', ') || '(none)');
  for (const [pkg, aliases] of Object.entries(summary.aliasByPkg)) {
    console.log(`  ${pkg}: ${aliases.join(', ')} → StrategySelect`);
  }
  console.log('  residual duplicates:', summary.residualDuplicates.length);
  console.log('  verify fails:', summary.verifyFails.length);
  console.log('  report:', REPORT);
  if (summary.verifyFails.length) process.exitCode = 1;
}

main();
