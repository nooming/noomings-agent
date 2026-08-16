/**
 * Deterministic repair for all yangben catalog chapters after Stage-3 findings:
 * - domain-aware AV labels (no capacitor/projectile bleed)
 * - CV out of AV + demote CV in traceMap
 * - rebuild per-AV routes + scores
 * - re-export Strategy-first 图谱.html
 *
 *   node tests/scripts/repair-yangben-graph-quality.js
 *   node tests/scripts/repair-yangben-graph-quality.js --id projectile-cannon
 */
const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const { extractGameHints } = require('../../packages/generate/hints');
const { runAnalyzeThreeStep } = require('../../packages/generate/analyze-three-step');
const { enrichChapterContract } = require('../../packages/contract/enrich');
const { validateChapter, validateChapterQuality } = require('../../packages/contract');
const { repairSingleVariableStrategyRoutes } = require('../../packages/contract/repair/strategy-single-var-repair');
const { repairStrategyRouteHighlights } = require('../../packages/contract/repair/strategy-route-repair');
const { repairStrategyRouteScores } = require('../../packages/contract/repair/strategy-route-score-repair');
const { repairMinStrategyRoutes } = require('../../packages/contract/repair/strategy-min-routes-repair');
const { applyStrategyMermaidSanitize } = require('../../packages/contract/strategy/strategy-sanitize');
const { writePriorityGraphFiles } = require('../../packages/generate/export/build-priority-graph-html');
const { resolveAvLabel } = require('../../packages/generate/control-label');
const { detectDomain } = require('../../packages/contract/repair/inquiry-script-sanitize');
const { getPackagesRoot, getPackageGamePath, getReportsRoot } = require('../../packages/shared/data-paths');

const ROOT = path.resolve(__dirname, '../..');
const YANG = path.join(ROOT, '\u6837\u672chtml');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function isTrap(r) {
  return r?.tier === 'suboptimal' || /trap|盲调|多参|多滑/i.test(`${r?.id || ''}${r?.label || ''}`);
}

/** Rewrite StrategySelect |edge| labels to match cleaned routes (ordered). */
function syncMermaidSelectEdges(chapter) {
  const mermaid = chapter?.strategy?.mermaid;
  const routes = chapter?.strategy?.routes || [];
  if (!mermaid || !routes.length) return chapter;
  const preferred = routes.filter(r => !isTrap(r) && r.warn !== 'irrelevant');
  const traps = routes.filter(isTrap);
  const labels = [
    ...preferred.map(r => r.label),
    ...traps.map(r => r.label),
  ];
  if (!labels.length) return chapter;

  let i = 0;
  const next = mermaid.replace(
    /(StrategySelect[^\n]*?(?:-->|-\.->)\s*)\|([^|]+)\|/g,
    (full, prefix) => {
      const lab = labels[i] || labels[labels.length - 1];
      i += 1;
      return `${prefix}|${lab}|`;
    },
  );
  return {
    ...chapter,
    strategy: { ...chapter.strategy, mermaid: next },
  };
}

function relabelRoutesFromAv(chapter, gameHints) {
  const domain = detectDomain(chapter, gameHints);
  const avs = chapter?.inquiryScript?.adjustmentVariables || [];
  const routes = (chapter?.strategy?.routes || []).map(r => {
    if (isTrap(r)) return { ...r, label: '多参盲调' };
    const m = String(r.label || '').match(/单变量·(.+)$/);
    if (!m) {
      // Force single-var style if AV exists
      return r;
    }
    const oldName = m[1].trim();
    const hit = avs.find(a => a.label === oldName
      || String(r.id || '').includes(String(a.controlId || ''))
      || oldName === a.controlId);
    if (hit) {
      return { ...r, label: `单变量·${resolveAvLabel(hit, domain)}` };
    }
    // Cross-domain pollution in label
    if (/极板|介质材料|发射角度|发射高度/.test(oldName) && domain !== 'capacitor'
      && !(domain === 'projectile' && /发射|初速度/.test(oldName))) {
      // Drop — will be rebuilt by single-var repair
      return r;
    }
    return r;
  });
  return {
    ...chapter,
    strategy: { ...chapter.strategy, routes },
  };
}

function repairOne(entry) {
  const gamePath = getPackageGamePath(entry.id);
  if (!gamePath || !fs.existsSync(gamePath)) {
    return { id: entry.id, ok: false, error: 'game.html missing' };
  }
  const chapterPath = path.join(getPackagesRoot(), entry.id, 'chapter.json');
  if (!fs.existsSync(chapterPath)) {
    return { id: entry.id, ok: false, error: 'chapter.json missing' };
  }

  const html = fs.readFileSync(gamePath, 'utf8');
  const sources = [{ path: 'game.html', content: html }];
  const gameHints = extractGameHints(sources);
  const threeStep = runAnalyzeThreeStep({ sources, gameHints });
  const hints = { ...gameHints, analyzeParse: threeStep.analyzeParse };

  let chapter = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
  chapter = enrichChapterContract(chapter, hints, sources);
  chapter = relabelRoutesFromAv(chapter, hints);
  chapter = repairSingleVariableStrategyRoutes(chapter, hints);
  chapter = repairMinStrategyRoutes(chapter, hints);
  chapter = applyStrategyMermaidSanitize(chapter);
  chapter = repairStrategyRouteHighlights(chapter);
  chapter = repairStrategyRouteScores(chapter, hints);
  chapter = syncMermaidSelectEdges(chapter);
  chapter = applyStrategyMermaidSanitize(chapter);

  const validation = validateChapter(chapter, hints);
  const quality = validation.ok
    ? validateChapterQuality(chapter, hints)
    : { ok: false, errors: validation.errors, score: 0, checklist: {} };

  const outDir = path.join(getPackagesRoot(), entry.id);
  fs.writeFileSync(chapterPath, JSON.stringify(chapter, null, 2), 'utf8');

  const metaPath = path.join(outDir, 'meta.json');
  const prevMeta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
  const meta = {
    ...prevMeta,
    id: entry.id,
    title: entry.topic || prevMeta.title || entry.id,
    repairedAt: new Date().toISOString(),
    validation,
    quality,
    repair: 'yangben-graph-quality-v2',
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

  let exportResult = { ok: false };
  try {
    exportResult = writePriorityGraphFiles({
      chapter,
      title: meta.title,
      runtimeDir: outDir,
      sampleDir: path.join(YANG, entry.dir),
    });
    exportResult = { ok: true, bytes: exportResult.bytes };
  } catch (e) {
    exportResult = { ok: false, error: e.message };
  }

  const avs = (chapter.inquiryScript?.adjustmentVariables || []).map(a => a.label);
  const routes = (chapter.strategy?.routes || []).map(r => `${r.label}@${r.score}`);
  return {
    id: entry.id,
    ok: !!(validation.ok && quality.ok),
    validationOk: validation.ok,
    qualityOk: quality.ok,
    qualityScore: quality.score,
    errors: [...(validation.errors || []), ...(quality.errors || [])].slice(0, 5),
    avs,
    routes,
    export: exportResult,
  };
}

function main() {
  const filterId = argValue('--id');
  const entries = filterId ? YANG_MAP.filter(e => e.id === filterId) : YANG_MAP;
  const rows = [];
  for (const entry of entries) {
    try {
      const row = repairOne(entry);
      rows.push(row);
      console.log(
        row.ok ? 'OK' : 'FAIL',
        entry.id,
        `q=${row.qualityScore ?? '-'}`,
        `AV=[${(row.avs || []).join(',')}]`,
        row.export?.ok ? `export ${row.export.bytes}B` : `export FAIL ${row.export?.error}`,
        (row.errors || []).slice(0, 1).join('; '),
      );
    } catch (e) {
      rows.push({ id: entry.id, ok: false, error: e.message });
      console.error('FAIL', entry.id, e.message);
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    total: rows.length,
    passed: rows.filter(r => r.ok).length,
    exportPassed: rows.filter(r => r.export?.ok).length,
    rows,
  };
  const out = path.join(getReportsRoot(), 'repair-yangben-graph-quality.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Done: ${report.passed}/${report.total} quality; export ${report.exportPassed}/${report.total}`);
  console.log('Wrote', out);
}

main();
