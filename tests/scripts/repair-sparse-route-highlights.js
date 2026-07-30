/**
 * Repair sparse route highlights + confound CV visual + re-export 图谱.html
 * for all yangben packages (or --ids subset).
 *
 *   node tests/scripts/repair-sparse-route-highlights.js
 *   node tests/scripts/repair-sparse-route-highlights.js --ids friction-incline,projectile-basic
 */
const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const { repairStrategyRouteHighlights } = require('../../packages/contract/repair/strategy-route-repair');
const { repairStrategyConfoundVisual } = require('../../packages/contract/repair/strategy-confound-visual-repair');
const { writePriorityGraphFiles } = require('../../packages/generate/export/build-priority-graph-html');
const { getPackagesRoot } = require('../../packages/shared/data-paths');
const { expandRouteHighlight } = require('../../packages/shared/strategy-mermaid-parse.js');

const ROOT = path.resolve(__dirname, '../..');
const YANG = path.join(ROOT, '\u6837\u672chtml');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function auditRoute(route, mermaid) {
  const expanded = expandRouteHighlight(route, mermaid, {});
  const nodes = expanded.highlightNodes || [];
  const hasAdjust = nodes.some(id => /^Adjust/i.test(id));
  const hasFire = nodes.some(id => /^(Fire|Launch|Tune|Retest)/i.test(id));
  const hasObserve = nodes.some(id => /^Observe/i.test(id));
  const hasEntry = nodes.some(id => /Route|Strat|Dist|Mat|Area|Trap|Path|Tune|Single|Adjust/i.test(id)
    && !/StrategySelect/i.test(id));
  const single = /单变量·/.test(route.label || '');
  const confound = route.kind === 'confoundProbe' || /试探混淆/.test(route.label || '');
  const hasProbe = nodes.some(id => /ProbeCV|ObserveCV|BackFromCV/i.test(id));
  const selectHit = /StrategySelect|ModeSelect/i.test(String(route.highlightNodes || []))
    && (route.highlightEdges || []).some(p => Array.isArray(p) && /Select/i.test(p[0]));
  // Legacy graphs with no StrategySelect AV fan-out cannot seed spine (e.g. cyclotron)
  const noSelectFanout = single && !hasFire && !hasEntry;
  return {
    id: route.id,
    label: route.label,
    nodeCount: nodes.length,
    edgeCount: expanded.edgeKeys?.size || 0,
    ok: confound
      ? hasProbe && nodes.length >= 3
      : (!single || (hasFire && hasObserve && (hasAdjust || hasEntry)) || noSelectFanout),
    legacyNoSpine: !!(single && noSelectFanout),
    sample: nodes.slice(0, 12),
    kind: confound ? 'confound' : (single ? 'single' : 'other'),
  };
}

function repairOne(entry) {
  const outDir = path.join(getPackagesRoot(), entry.id);
  const chapterPath = path.join(outDir, 'chapter.json');
  if (!fs.existsSync(chapterPath)) {
    return { id: entry.id, ok: false, error: 'chapter.json missing' };
  }
  let chapter = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
  const before = (chapter.strategy?.routes || []).map(r => ({
    id: r.id,
    nodes: (r.highlightNodes || []).length,
    edges: (r.highlightEdges || []).length,
  }));
  chapter = repairStrategyConfoundVisual(chapter);
  chapter = repairStrategyRouteHighlights(chapter);
  fs.writeFileSync(chapterPath, JSON.stringify(chapter, null, 2), 'utf8');

  const audits = (chapter.strategy?.routes || []).map(r =>
    auditRoute(r, chapter.strategy.mermaid));

  const hasCv = (chapter.inquiryScript?.confoundingVariables || []).some(c => c?.label || c?.controlId);
  const mermaidHasCv = /试探混淆/.test(chapter.strategy?.mermaid || '');
  const routeCv = (chapter.strategy?.routes || []).some(r =>
    r.kind === 'confoundProbe' || /试探混淆/.test(r.label || ''));

  let exportResult = { ok: false };
  try {
    const er = writePriorityGraphFiles({
      chapter,
      title: entry.topic || entry.id,
      runtimeDir: outDir,
      sampleDir: path.join(YANG, entry.dir),
    });
    exportResult = { ok: true, bytes: er.bytes, outs: er.outs };
  } catch (e) {
    exportResult = { ok: false, error: e.message };
  }

  const singleOk = audits.filter(a => a.kind === 'single').every(a => a.ok);
  const confoundOk = !hasCv || (mermaidHasCv && routeCv
    && audits.filter(a => a.kind === 'confound').every(a => a.ok));

  // Keep sample folder to game + 图谱 only
  const sampleDir = path.join(YANG, entry.dir);
  if (fs.existsSync(sampleDir)) {
    for (const name of fs.readdirSync(sampleDir)) {
      if (name === entry.game || name === '\u56fe\u8c31.html') continue;
      try { fs.unlinkSync(path.join(sampleDir, name)); } catch (_) { /* ignore */ }
    }
  }

  return {
    id: entry.id,
    ok: singleOk && confoundOk && exportResult.ok,
    before,
    audits,
    cv: { hasCv, mermaidHasCv, routeCv },
    export: exportResult,
  };
}

function main() {
  const idsArg = argValue('--ids');
  const ids = idsArg
    ? idsArg.split(',').map(s => s.trim()).filter(Boolean)
    : YANG_MAP.map(e => e.id);
  const entries = YANG_MAP.filter(e => ids.includes(e.id));
  const rows = entries.map(repairOne);
  const report = {
    generatedAt: new Date().toISOString(),
    total: rows.length,
    passed: rows.filter(r => r.ok).length,
    rows,
  };
  const out = path.join(getPackagesRoot(), 'reports', 'repair-sparse-route-highlights.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');
  for (const r of rows) {
    console.log(r.ok ? 'OK' : 'FAIL', r.id,
      r.cv?.hasCv ? (r.cv.mermaidHasCv && r.cv.routeCv ? 'CV✓' : 'CV✗') : 'noCV',
      r.export?.ok ? `export ${r.export.bytes}B` : r.export?.error || r.error);
    for (const a of r.audits || []) {
      if (a.kind === 'other') continue;
      console.log('  ', a.ok ? '✓' : '✗', a.kind, a.label, `nodes=${a.nodeCount}`, a.sample?.join(','));
    }
  }
  console.log(`Done ${report.passed}/${report.total} → ${out}`);
}

main();
