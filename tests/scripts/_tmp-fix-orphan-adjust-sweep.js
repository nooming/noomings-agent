/**
 * Sweep unreachable/orphan Adjust* bones + magnetic wire-temp AV→CV semantics.
 * Usage: node tests/scripts/_tmp-fix-orphan-adjust-sweep.js
 */
const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const { writePriorityGraphFiles } = require('../../packages/generate/export/build-priority-graph-html');
const { getPackagesRoot } = require('../../packages/shared/data-paths');
const {
  parseStrategyMermaidEdges,
  extractStrategyNodeLabels,
} = require('../../packages/shared/strategy-mermaid-parse.js');
const { repairStrategyRouteHighlights } = require('../../packages/contract/repair/strategy-route-repair');
const { repairStrategyConfoundVisual } = require('../../packages/contract/repair/strategy-confound-visual-repair');
const { removeNodeMentions } = (() => {
  // reuse private helper via local copy (same logic as collapse-orphan-strategy-stubs)
  function removeNodeMentions(body, nodeId) {
    const esc = nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const lines = String(body).replace(/\r\n/g, '\n').split('\n');
    const kept = lines.filter(raw => {
      const line = raw.trim();
      if (!line) return true;
      if (new RegExp(`^${esc}\\s*[\\[({]`).test(line)) return false;
      if (new RegExp(`\\b${esc}\\b`).test(line) && /(-->|-\.->)/.test(line)) {
        if (new RegExp(`^${esc}\\b`).test(line)) return false;
        if (new RegExp(`(?:-->|-\\.->)\\s*(?:\\|[^|]*\\|\\s*)?${esc}\\b`).test(line)) return false;
        if (new RegExp(`\\b${esc}\\s*(?:-->|-\\.->)`).test(line)) return false;
      }
      return true;
    });
    return kept.join('\n');
  }
  return { removeNodeMentions };
})();

const ROOT = path.resolve(__dirname, '../..');
const PACKAGES = getPackagesRoot();
const YANG = path.join(ROOT, '\u6837\u672chtml');

function dedupeMermaid(mm) {
  const lines = String(mm || '').replace(/\r\n/g, '\n').split('\n');
  const seen = new Set();
  const kept = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      kept.push(line);
      continue;
    }
    if (seen.has(t)) continue;
    seen.add(t);
    kept.push(line);
  }
  let out = kept.join('\n');
  if (!out.endsWith('\n')) out += '\n';
  return out;
}

function scrubRouteNodes(chapter, dropIds) {
  const drop = new Set(dropIds);
  for (const route of chapter.strategy?.routes || []) {
    if (Array.isArray(route.highlightNodes)) {
      route.highlightNodes = route.highlightNodes.filter(n => !drop.has(n));
    }
    if (Array.isArray(route.highlightEdges)) {
      route.highlightEdges = route.highlightEdges.filter(
        e => Array.isArray(e) && e.length >= 2 && !drop.has(e[0]) && !drop.has(e[1]),
      );
    }
  }
}

function removeNodes(chapter, ids) {
  let mm = chapter.strategy.mermaid;
  for (const id of ids) mm = removeNodeMentions(mm, id);
  chapter.strategy.mermaid = dedupeMermaid(mm);
  scrubRouteNodes(chapter, ids);
}

function orphanAdjustIds(mermaid) {
  const edges = parseStrategyMermaidEdges(mermaid);
  const labels = extractStrategyNodeLabels(mermaid);
  const inbound = new Map();
  for (const e of edges) {
    if (!inbound.has(e.to)) inbound.set(e.to, []);
    inbound.get(e.to).push(e.from);
  }
  const nodes = new Set();
  edges.forEach(e => { nodes.add(e.from); nodes.add(e.to); });
  labels.forEach((_, n) => nodes.add(n));
  return [...nodes].filter(n => /^Adjust/i.test(n) && !(inbound.get(n) || []).length);
}

function unreachableFromStart(mermaid, idRe) {
  const edges = parseStrategyMermaidEdges(mermaid);
  const labels = extractStrategyNodeLabels(mermaid);
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }
  const nodes = new Set();
  edges.forEach(e => { nodes.add(e.from); nodes.add(e.to); });
  labels.forEach((_, n) => nodes.add(n));
  const reach = new Set();
  const q = [...nodes].filter(n => /^Start$/i.test(n));
  for (const s of q) reach.add(s);
  while (q.length) {
    const u = q.shift();
    for (const v of adj.get(u) || []) {
      if (!reach.has(v)) {
        reach.add(v);
        q.push(v);
      }
    }
  }
  return [...nodes].filter(n => !reach.has(n) && idRe.test(n));
}

function fixCircular(chapter) {
  const drop = ['AdjustOmega', 'AdjustRadius', 'AdjustTilt'];
  removeNodes(chapter, drop);
  return `removed orphan ${drop.join(',')}`;
}

function fixHeat(chapter) {
  const drop = ['AdjustA', 'AdjustDT'];
  removeNodes(chapter, drop);
  chapter.strategy.mermaid = dedupeMermaid(chapter.strategy.mermaid);
  return `removed orphan ${drop.join(',')}; deduped edges`;
}

function fixMagnetic(chapter) {
  // 1) orphan AdjustB/AdjustT
  removeNodes(chapter, ['AdjustB', 'AdjustT']);

  // 2) wire-temp is UI-only (F=BIL ignores T) → demote AV→CV, drop fake single-var route
  const avs = chapter.inquiryScript?.adjustmentVariables || [];
  const wireAv = avs.find(a => a.controlId === 's-wire-temp');
  chapter.inquiryScript.adjustmentVariables = avs.filter(a => a.controlId !== 's-wire-temp');
  // renumber priorityRank
  chapter.inquiryScript.adjustmentVariables.forEach((a, i) => {
    a.priorityRank = i + 1;
    if (!a.id) a.id = `AV${i + 1}`;
    else a.id = `AV${i + 1}`;
  });

  const cvs = chapter.inquiryScript.confoundingVariables || [];
  const hasWireCv = cvs.some(c => c.controlId === 's-wire-temp');
  if (!hasWireCv) {
    // replace null 无关控件 or append
    const nullCv = cvs.find(c => !c.controlId && /无关/.test(c.label || ''));
    if (nullCv) {
      nullCv.controlId = 's-wire-temp';
      nullCv.label = '导线温度';
      nullCv.reason = '仅改示意温度读数，不进入 F=BIL，对托力无增益';
    } else {
      cvs.push({
        id: 'CV1',
        controlId: 's-wire-temp',
        label: '导线温度',
        reason: '仅改示意温度读数，不进入 F=BIL，对托力无增益',
      });
    }
  }
  chapter.inquiryScript.confoundingVariables = cvs;

  // inquiryFlow: drop AV3 wire, keep CV
  if (Array.isArray(chapter.inquiryScript.inquiryFlow)) {
    chapter.inquiryScript.inquiryFlow = chapter.inquiryScript.inquiryFlow
      .filter(x => x !== 'AV3')
      .map(x => x);
    if (!chapter.inquiryScript.inquiryFlow.includes('CV1')) {
      chapter.inquiryScript.inquiryFlow.push('CV1');
    }
  }

  // mermaid: remove wire-temp single-var fan-out; retarget ProbeCV label
  let mm = chapter.strategy.mermaid;
  mm = mm
    .replace(/\nStrategySelect -->\|单变量·导线温度\| Route_main_s_wire_temp\n/g, '\n')
    .replace(/\nRoute_main_s_wire_temp --> Adjust\n/g, '\n')
    .replace(/\nRoute_main_s_wire_temp\[[^\]]*\]\n/g, '\n');
  mm = mm.replace(
    /StrategySelect -\.->\|试探混淆·无关控件\| ProbeCV/,
    'StrategySelect -.->|试探混淆·导线温度| ProbeCV',
  );
  mm = mm.replace(
    /ProbeCV\[试探混淆·无关控件\]/,
    'ProbeCV[试探混淆·导线温度（示意无效）]',
  );
  chapter.strategy.mermaid = dedupeMermaid(mm);

  // drop route main_s-wire-temp; retarget confound label
  chapter.strategy.routes = (chapter.strategy.routes || []).filter(r => r.id !== 'main_s-wire-temp');
  for (const r of chapter.strategy.routes) {
    if (r.kind === 'confoundProbe' || /confound/i.test(r.id || '')) {
      r.label = '试探混淆·导线温度';
      r.controlId = 's-wire-temp';
      scrubRouteNodes({ strategy: { routes: [r] } }, ['Route_main_s_wire_temp']);
    }
    if (Array.isArray(r.highlightNodes)) {
      r.highlightNodes = r.highlightNodes.filter(n => n !== 'Route_main_s_wire_temp');
    }
    if (Array.isArray(r.highlightEdges)) {
      r.highlightEdges = r.highlightEdges.filter(
        e => Array.isArray(e) && e[0] !== 'Route_main_s_wire_temp' && e[1] !== 'Route_main_s_wire_temp',
      );
    }
  }

  // traceMap / priority / controls
  if (chapter.traceMap?.controls?.['s-wire-temp']) {
    chapter.traceMap.controls['s-wire-temp'] = { kgId: 'I1', role: 'irrelevant' };
  }
  if (Array.isArray(chapter.priority?.controls)) {
    // leave as-is if structure unknown
  }
  if (wireAv) {
    // ensure KG I1 mentions temperature if present
    const i1 = chapter.kg?.nodes?.find(n => n.id === 'I1');
    if (i1) {
      i1.label = i1.label || '导线温度（示意）';
      if (!/温度|F\s*=\s*BIL|无增益/.test(i1.desc || '')) {
        i1.desc = '导线温度滑条仅改示意读数，不进入 F=BIL，对托力无增益';
      }
    }
  }

  // confoundingUi: ensure s-wire-temp listed
  if (Array.isArray(chapter.inquiryScript.confoundingUi)) {
    const has = chapter.inquiryScript.confoundingUi.some(c => c.controlId === 's-wire-temp' || c.id === 's-wire-temp');
    if (!has) {
      chapter.inquiryScript.confoundingUi.unshift({
        controlId: 's-wire-temp',
        label: '导线温度',
        reason: '仅改示意温度读数，不进入 F=BIL',
      });
    }
  }

  return 'removed AdjustB/AdjustT; demoted s-wire-temp AV→CV; ProbeCV→导线温度';
}

function fixMomentum(chapter) {
  const drop = ['SingleTemp', 'SingleVel1', 'SingleVel2'];
  removeNodes(chapter, drop);
  return `removed unreachable explore stubs ${drop.join(',')}`;
}

function fixRc(chapter) {
  // dead Observe/Adjust/Retest island (live spine is Adjust1/Fire1/Observe1 + AdjustT trap)
  const drop = [];
  const unreach = unreachableFromStart(chapter.strategy.mermaid, /^(Adjust|Observe|Retest)$/i);
  for (const id of unreach) drop.push(id);
  // Also remove Adjust if orphan
  for (const id of orphanAdjustIds(chapter.strategy.mermaid)) {
    if (!drop.includes(id)) drop.push(id);
  }
  // Keep Adjust1/AdjustT
  const safe = drop.filter(id => !/^Adjust[1T]/i.test(id) && !/^Observe[1T]/i.test(id) && !/^Fire/i.test(id));
  removeNodes(chapter, safe);
  return `removed dead island ${safe.join(',') || '(none)'}`;
}

function fixCapEra2(chapter) {
  // dead Observe/Adjust/Retest (live is AdjustFB/RetestFB/ObserveFB; trap uses AdjustT/FireT/ObserveT)
  let mm = chapter.strategy.mermaid;
  // ensure preferred spine can Win
  if (!/ObserveFB -->\|达标\| Win/.test(mm) && /ObserveFB/.test(mm)) {
    mm = mm.replace(
      /ObserveFB -->\|未达标\| AdjustFB/,
      'ObserveFB -->|未达标| AdjustFB\nObserveFB -->|达标| Win[过关]:::stratResult',
    );
  }
  chapter.strategy.mermaid = mm;
  const drop = unreachableFromStart(chapter.strategy.mermaid, /^(Adjust|Observe|Retest)$/);
  // don't drop AdjustFB / ObserveFB / RetestFB / AdjustT...
  const safe = drop.filter(id => /^(Adjust|Observe|Retest)$/.test(id));
  removeNodes(chapter, safe);
  return `wired ObserveFB→Win; removed dead ${safe.join(',') || '(none)'}`;
}

function stripOrphanBareAdjust(chapter) {
  const orphans = orphanAdjustIds(chapter.strategy.mermaid);
  // only strip bare Adjust (not AdjustE/Adjust1…) when truly orphan
  const bare = orphans.filter(id => /^Adjust$/i.test(id));
  if (!bare.length) return null;
  removeNodes(chapter, bare);
  return `removed orphan bare Adjust`;
}

function exportPkg(id, chapter) {
  const entry = YANG_MAP.find(e => e.id === id);
  const pkgDir = path.join(PACKAGES, id);
  const metaPath = path.join(pkgDir, 'meta.json');
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
  const title = meta.title || chapter.kg?.title || chapter.strategy?.title || entry?.topic || id;
  const sampleDir = entry ? path.join(YANG, entry.dir) : null;
  const result = writePriorityGraphFiles({
    chapter,
    title,
    runtimeDir: pkgDir,
    sampleDir: sampleDir && fs.existsSync(path.dirname(sampleDir)) ? sampleDir : pkgDir,
  });
  return { ok: true, bytes: result.bytes };
}

function main() {
  const jobs = [
    ['circular-motion', fixCircular],
    ['heat-conduction', fixHeat],
    ['magnetic-force', fixMagnetic],
    ['momentum-collision', fixMomentum],
    ['rc-circuit', fixRc],
    ['capacitor-era-ch2', fixCapEra2],
    // bare Adjust stubs
    ['capacitor-confound-ui', stripOrphanBareAdjust],
    ['efield-charge', stripOrphanBareAdjust],
    ['multi-kp', stripOrphanBareAdjust],
    ['pendulum-clock', stripOrphanBareAdjust],
    ['projectile-basic', stripOrphanBareAdjust],
    ['projectile-cannon', stripOrphanBareAdjust],
  ];

  const report = [];
  for (const [id, fn] of jobs) {
    const p = path.join(PACKAGES, id, 'chapter.json');
    let chapter = JSON.parse(fs.readFileSync(p, 'utf8'));
    const note = fn(chapter);
    if (!note) {
      report.push({ id, skipped: true });
      console.log('SKIP', id);
      continue;
    }
    chapter = repairStrategyConfoundVisual(chapter);
    chapter = repairStrategyRouteHighlights(chapter);
    fs.writeFileSync(p, `${JSON.stringify(chapter, null, 2)}\n`, 'utf8');
    const exp = exportPkg(id, chapter);
    const orphans = orphanAdjustIds(chapter.strategy.mermaid);
    const unreach = unreachableFromStart(
      chapter.strategy.mermaid,
      /^(Adjust|Observe|Fire|Launch|Single|Route_main_s_wire|Tune\d|Path)/i,
    );
    report.push({ id, note, orphans, unreach, export: exp });
    console.log('OK', id, '—', note, `| residual orphans=[${orphans}] unreach=[${unreach}]`);
  }

  // final sweep audit all packages
  const ids = fs.readdirSync(PACKAGES, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(PACKAGES, d.name, 'chapter.json')))
    .map(d => d.name)
    .sort();
  const residual = [];
  for (const id of ids) {
    const ch = JSON.parse(fs.readFileSync(path.join(PACKAGES, id, 'chapter.json'), 'utf8'));
    const o = orphanAdjustIds(ch.strategy?.mermaid || '');
    const u = unreachableFromStart(
      ch.strategy?.mermaid || '',
      /^(Adjust|Observe|Fire|Launch|SingleTemp|SingleVel[12]$)/i,
    );
    if (o.length || u.length) residual.push({ id, orphans: o, unreach: u });
  }

  const out = path.join(PACKAGES, 'reports', 'tmp-orphan-adjust-sweep.json');
  fs.writeFileSync(out, `${JSON.stringify({ at: new Date().toISOString(), report, residual }, null, 2)}\n`);
  console.log('\nResidual packages with orphan/unreach:', residual.length);
  for (const r of residual) console.log(' ', r.id, r);
  console.log('report →', out);
}

main();
