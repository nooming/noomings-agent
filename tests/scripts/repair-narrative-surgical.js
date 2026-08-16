/**
 * Surgical narrative cleanup (no full enrich / batch-package-analyze).
 * - Strip pure LoopObserve/LoopAdjust/LoopRetest scaffolding
 * - Replace empty RPref* StrategySelect targets with concrete AV path nodes
 * - Rebuild StrategySelect edge labels from routes (preferred + trap + confound)
 * - Ensure domain Observe→Adjust→Fire feedback loop
 * - Drop Loop* from route highlightNodes
 * - Re-export 图谱.html
 *
 *   node tests/scripts/repair-narrative-surgical.js
 *   node tests/scripts/repair-narrative-surgical.js --id projectile-basic
 *   node tests/scripts/repair-narrative-surgical.js --ids projectile-basic,multi-kp,friction-incline
 */
const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const { extractGameHints } = require('../../packages/generate/hints');
const {
  validateChapter,
  validateChapterQuality,
  hasObservationFeedbackLoop,
} = require('../../packages/contract');
const { applyStrategyMermaidSanitize } = require('../../packages/contract/strategy/strategy-sanitize');
const { repairStrategyRouteHighlights } = require('../../packages/contract/repair/strategy-route-repair');
const { writePriorityGraphFiles } = require('../../packages/generate/export/build-priority-graph-html');
const {
  parseStrategyMermaidEdges,
  extractStrategyNodeLabels,
  isAdjustLikeNodeId,
} = require('../../packages/shared/strategy-mermaid-parse');
const { assessNarrativeCleanliness } = require('../lib/narrative-cleanliness');
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

function isConfound(r) {
  return /混淆|confound|probe/i.test(`${r?.id || ''}${r?.label || ''}`) || r?.warn === 'irrelevant';
}

function stripMechanicalLoopScaffold(mm) {
  return String(mm || '')
    .split(/\n/)
    .filter(line => !/\b(LoopObserve|LoopAdjust|LoopRetest)\b/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function stripEmptyRPrefNodes(mm) {
  // Drop RPref* node declarations and edges; StrategySelect will be rebuilt
  return String(mm || '')
    .split(/\n/)
    .filter(line => !/\bRPref\d*\b/.test(line))
    .join('\n');
}

function ensureAdjustLabels(mm) {
  let out = String(mm || '');
  out = out.replace(/\b(Adjust\w*)\[调节([^\]]*)\]/g, (_, id, rest) => `${id}[调整${rest}]`);
  // Bare Adjust used in edges without declaration
  const edges = parseStrategyMermaidEdges(out);
  const labels = extractStrategyNodeLabels(out);
  const adjustIds = new Set();
  for (const e of edges) {
    if (isAdjustLikeNodeId(e.from, labels) || isAdjustLikeNodeId(e.to, labels)) {
      if (/^Adjust\w*$/i.test(e.from)) adjustIds.add(e.from);
      if (/^Adjust\w*$/i.test(e.to)) adjustIds.add(e.to);
    }
  }
  for (const id of adjustIds) {
    if (!labels.has(id) || !String(labels.get(id) || '').trim()) {
      if (!new RegExp(`\\b${id}\\s*\\[`).test(out)) {
        out += `\n${id}[按观察单变量微调]\n`;
      }
    }
  }
  return out;
}

function ensureDomainFeedbackLoop(mm) {
  let out = ensureAdjustLabels(stripMechanicalLoopScaffold(mm));
  if (hasObservationFeedbackLoop(out)) return out;

  const observeId = (out.match(/\b(Observe[A-Za-z0-9_]*)\s*[\[{]/) || [])[1] || 'Observe';
  const fireId = (out.match(/\b((?:Fire|Launch|Test|QuickFire)[A-Za-z0-9_]*)\s*[\[{]/) || [])[1] || 'Fire';
  let adjustId = (out.match(/\b(Adjust[A-Za-z0-9_]*)\s*\[/) || [])[1];
  if (!adjustId) {
    out += '\nAdjust[按观察单变量微调]\n';
    adjustId = 'Adjust';
  }
  if (!new RegExp(`\\b${observeId}\\s*-->\\s*(\\|[^|]*\\|\\s*)?${adjustId}\\b`).test(out)) {
    out += `\n${observeId} -->|未达标| ${adjustId}\n`;
  }
  if (!new RegExp(`\\b${adjustId}\\s*-->\\s*${fireId}\\b`).test(out)) {
    out += `\n${adjustId} --> ${fireId}\n`;
  }
  if (!new RegExp(`\\b${fireId}\\s*-->\\s*${observeId}\\b`).test(out)) {
    out += `\n${fireId} --> ${observeId}\n`;
  }
  return out;
}

/** Find concrete path entry nodes already linked toward Adjust/Fire (excluding ProbeCV/Trap). */
function discoverPathNodes(mermaid) {
  const edges = parseStrategyMermaidEdges(mermaid);
  const labels = extractStrategyNodeLabels(mermaid);
  const outEdges = edges.filter(e => /StrategySelect/i.test(e.from));
  const existing = [];
  for (const e of outEdges) {
    if (/^Probe|^Trap|^RPref|^RTrap|^BackFrom|^Route_/i.test(e.to)) continue;
    existing.push({ id: e.to, label: e.label, dotted: e.dotted });
  }
  const candidates = [];
  const seenCand = new Set();
  function addCand(id, lab) {
    if (seenCand.has(id)) return;
    if (/^(Start|Win|Retry|Fire|Observe|Adjust|Mode|Env|StrategySelect|Challenge|Explore|BackFrom|Probe|Trap|Loop|Route_)/i.test(id)) {
      return;
    }
    if (/Strat$|Route$|^Tune\d*$|^Path|^Single|^Angle|^Height|^Speed|^Friction|^Mass|^Freq|^Work|^Intensity/i.test(id)
      || /调|单变量/.test(lab || '')) {
      seenCand.add(id);
      candidates.push({ id, lab: lab || '' });
    }
  }
  labels.forEach((lab, id) => addCand(id, lab));
  // Edge-only Strat/Tune/Path nodes (no [...] declaration) still count
  for (const e of edges) {
    for (const id of [e.from, e.to]) {
      if (!labels.has(id)) addCand(id, '');
    }
  }
  // Prefer candidates that already feed an Adjust*
  const adj = new Map();
  edges.forEach(e => {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  });
  candidates.sort((a, b) => {
    const aAdj = (adj.get(a.id) || []).some(t => /^Adjust/i.test(t)) ? 1 : 0;
    const bAdj = (adj.get(b.id) || []).some(t => /^Adjust/i.test(t)) ? 1 : 0;
    return bAdj - aAdj;
  });
  return { existing, candidates, labels, edges };
}

function stripOrphanRouteSynth(mm) {
  const edges = parseStrategyMermaidEdges(mm);
  const referenced = new Set();
  edges.forEach(e => {
    referenced.add(e.from);
    referenced.add(e.to);
  });
  // Keep Route_* only if StrategySelect still points at them
  const selectTargets = new Set(
    edges.filter(e => /StrategySelect/i.test(e.from)).map(e => e.to),
  );
  return String(mm || '')
    .split(/\n/)
    .filter(line => {
      const m = line.match(/\b(Route_[A-Za-z0-9_]+)\b/);
      if (!m) return true;
      return selectTargets.has(m[1]);
    })
    .join('\n');
}

function rebuildStrategySelectFanout(chapter) {
  let mermaid = chapter.strategy?.mermaid || '';
  const routes = chapter.strategy?.routes || [];
  if (!routes.length) return chapter;

  const preferred = routes.filter(r => !isTrap(r) && !isConfound(r));
  const traps = routes.filter(isTrap);
  const confounds = routes.filter(isConfound);

  // Discover path targets BEFORE stripping fan-out edges
  const discovered = discoverPathNodes(mermaid);

  // Remove ALL StrategySelect* fan-out edges (including StrategySelectChallenge copies)
  mermaid = mermaid
    .split(/\n/)
    .filter(line => !(/StrategySelect\w*\s*(-->|-\.->)\s*\|/.test(line)))
    .join('\n');

  mermaid = stripEmptyRPrefNodes(mermaid);

  const labels = extractStrategyNodeLabels(mermaid);
  const { existing, candidates } = discovered;

  const edgesNow = parseStrategyMermaidEdges(mermaid);
  const adjMap = new Map();
  edgesNow.forEach(e => {
    if (!adjMap.has(e.from)) adjMap.set(e.from, []);
    adjMap.get(e.from).push(e.to);
  });
  const labelNow = extractStrategyNodeLabels(mermaid);
  // fill edge-only
  edgesNow.forEach(e => {
    if (!labelNow.has(e.from)) labelNow.set(e.from, '');
    if (!labelNow.has(e.to)) labelNow.set(e.to, '');
  });

  function downstreamText(id, depth = 2) {
    const parts = [labelNow.get(id) || '', id];
    const seen = new Set([id]);
    let frontier = [id];
    for (let d = 0; d < depth; d += 1) {
      const next = [];
      for (const cur of frontier) {
        for (const nxt of adjMap.get(cur) || []) {
          if (seen.has(nxt)) continue;
          seen.add(nxt);
          parts.push(labelNow.get(nxt) || '', nxt);
          next.push(nxt);
        }
      }
      frontier = next;
    }
    return parts.join(' ');
  }

  const usedTargets = new Set();
  function norm(s) {
    return String(s || '').replace(/\s+/g, '').toLowerCase();
  }
  function pickTarget(route) {
    const lab = String(route.label || '');
    const key = lab.replace(/^单变量[·•.]/, '').replace(/^试探混淆[·•.]/, '').trim();
    const controlHint = String(route.id || '')
      .replace(/^main_?/i, '')
      .replace(/^confound_?/i, '');

    const scoreNode = (id) => {
      let s = 0;
      const blob = norm(downstreamText(id));
      const nk = norm(key);
      const nodeLab = labelNow.get(id) || '';
      if (nk && blob.includes(nk)) s += 8;
      if (nk && norm(nodeLab).includes(nk)) s += 4;
      if (controlHint) {
        const ch = norm(controlHint).replace(/-/g, '');
        if (ch && (norm(id).includes(ch) || blob.includes(ch))) s += 6;
      }
      // Latin hints from common AV words
      if (/速度|初速|v0|speed/i.test(key) && /speed|vel|v0/i.test(id + blob)) s += 5;
      if (/角度|倾角|angle/i.test(key) && /angle|theta|倾/i.test(id + blob)) s += 5;
      if (/高度|height/i.test(key) && /height|高/i.test(id + blob)) s += 5;
      if (/摩擦|friction|mu/i.test(key) && /friction|mu|摩擦/i.test(id + blob)) s += 5;
      if (/质量|mass/i.test(key) && /mass|质量/i.test(id + blob)) s += 5;
      if (/频率|freq/i.test(key) && /freq|频率/i.test(id + blob)) s += 5;
      if (/Strat$|Route$|^Tune|^Path|^Single/i.test(id)) s += 1;
      if (/Challenge$/i.test(id)) s -= 2;
      if (/^Probe|^Trap|^RPref|^Win|^Retry|^Fire|^Observe|^Adjust|^Mode|^Env|^Start|^BackFrom|^Route_/i.test(id)) s -= 10;
      return s;
    };

    let best = null;
    let bestScore = 0;
    const pool = [
      ...existing.map(e => e.id),
      ...candidates.map(c => c.id),
    ];
    for (const id of pool) {
      if (usedTargets.has(id)) continue;
      const sc = scoreNode(id);
      if (sc > bestScore) {
        bestScore = sc;
        best = id;
      }
    }
    if (best && bestScore > 0) {
      usedTargets.add(best);
      return best;
    }
    const synthId = `Route_${String(route.id || key || 'X').replace(/[^\w]/g, '_').slice(0, 24)}`;
    if (!labelNow.has(synthId) && !new RegExp(`\\b${synthId}\\[`).test(mermaid)) {
      mermaid += `\n${synthId}[控制变量：只改${key || '一项'}]\n`;
      labelNow.set(synthId, `控制变量：只改${key || '一项'}`);
    }
    usedTargets.add(synthId);
    return synthId;
  }

  const lines = [];
  if (!/StrategySelect\{/.test(mermaid) && !/StrategySelect\[/.test(mermaid)) {
    mermaid += '\nStrategySelect{选择调参策略?}:::stratCond\n';
  }

  for (const r of preferred) {
    const to = pickTarget(r);
    lines.push(`StrategySelect -->|${r.label}| ${to}`);
  }
  // Only one trap fan-out edge (never reuse preferred Angle*/Route* as trap)
  if (traps[0]) {
    let trapId = [...labelNow.keys()].find(id => /^Trap\w*$/i.test(id));
    if (!trapId) {
      trapId = 'Trap';
      if (!/\bTrap\[/.test(mermaid)) mermaid += '\nTrap[同时调多个参数]\n';
      labelNow.set('Trap', '同时调多个参数');
    }
    usedTargets.add(trapId);
    lines.push(`StrategySelect -->|${traps[0].label}| ${trapId}`);
  }
  for (const r of confounds) {
    let probeId = [...labelNow.keys()].find(id => /^ProbeCV\w*$/i.test(id));
    if (!probeId) {
      probeId = 'ProbeCV';
      if (!/\bProbeCV\[/.test(mermaid)) mermaid += '\nProbeCV[拧混淆控件]:::stratInvalid\n';
    }
    lines.push(`StrategySelect -.->|${r.label}| ${probeId}`);
  }

  // Dedupe fan-out by label (keep first)
  const seenLab = new Set();
  const deduped = [];
  for (const line of lines) {
    const m = line.match(/\|([^|]+)\|/);
    const lab = m ? m[1] : line;
    if (seenLab.has(lab)) continue;
    seenLab.add(lab);
    deduped.push(line);
  }

  mermaid += `\n${deduped.join('\n')}\n`;
  mermaid = stripOrphanRouteSynth(mermaid);

  // Ensure preferred path nodes reach an Adjust*
  const edges = parseStrategyMermaidEdges(mermaid);
  const adj = new Map();
  edges.forEach(e => {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  });
  const adjustIds = [...extractStrategyNodeLabels(mermaid).keys()].filter(id => /^Adjust\w*$/i.test(id));
  const fireId = [...extractStrategyNodeLabels(mermaid).keys()].find(id => /^(Fire|Launch)\w*$/i.test(id)) || 'Fire';

  function reachesAdjust(start) {
    const seen = new Set([start]);
    const q = [start];
    while (q.length) {
      const id = q.shift();
      if (/^Adjust\w*$/i.test(id)) return true;
      for (const nxt of adj.get(id) || []) {
        if (seen.has(nxt)) continue;
        seen.add(nxt);
        q.push(nxt);
      }
    }
    return false;
  }

  for (const r of preferred) {
    const edge = deduped.find(l => l.includes(`|${r.label}|`));
    const to = (edge || '').split('|').pop()?.trim().split(/\s+/)[0];
    if (!to || reachesAdjust(to)) continue;
    const avKey = String(r.label || '').replace(/^单变量[·•.]/, '');
    let adjustHit = adjustIds.find(id => {
      const lab = extractStrategyNodeLabels(mermaid).get(id) || '';
      return lab.includes(avKey);
    }) || adjustIds[0];
    if (!adjustHit) {
      adjustHit = `Adjust_${to}`;
      mermaid += `\n${adjustHit}[调整${avKey || '参数'}]\n${adjustHit} --> ${fireId}\n`;
    }
    mermaid += `\n${to} --> ${adjustHit}\n`;
  }

  return { ...chapter, strategy: { ...chapter.strategy, mermaid } };
}

function cleanHighlightNodes(chapter) {
  const mermaid = chapter.strategy?.mermaid || '';
  const edges = new Set(parseStrategyMermaidEdges(mermaid).map(e => e.key));
  const nodeIds = new Set(extractStrategyNodeLabels(mermaid).keys());

  const routes = (chapter.strategy?.routes || []).map(r => {
    let hn = (r.highlightNodes || []).filter(n =>
      !/^(LoopObserve|LoopAdjust|LoopRetest|RPref\d*)$/i.test(n)
      && (nodeIds.has(n) || n === 'Start' || n === 'Win'),
    );
    // Confound routes should not claim domain Observe→Adjust→Fire spine
    if (isConfound(r)) {
      hn = hn.filter(n => !/^(Observe|Fire|Launch|Adjust)\w*$/i.test(n) || /^ObserveCV|^Probe|^BackFrom/i.test(n));
      if (!hn.includes('ProbeCV') && nodeIds.has('ProbeCV')) hn.push('ProbeCV');
      if (!hn.includes('ObserveCV') && nodeIds.has('ObserveCV')) hn.push('ObserveCV');
      if (!hn.includes('BackFromCV') && nodeIds.has('BackFromCV')) hn.push('BackFromCV');
    }
    const he = (r.highlightEdges || []).filter(pair => {
      if (!Array.isArray(pair) || pair.length < 2) return false;
      const [a, b] = pair;
      return edges.has(`${a}->${b}`) || edges.has(`${b}->${a}`);
    });
    const next = { ...r, highlightNodes: hn, highlightEdges: he };
    if (isConfound(r) && next.warn == null) next.warn = 'irrelevant';
    return next;
  });
  return { ...chapter, strategy: { ...chapter.strategy, routes } };
}

function repairOne(entry) {
  const chapterPath = path.join(getPackagesRoot(), entry.id, 'chapter.json');
  if (!fs.existsSync(chapterPath)) return { id: entry.id, ok: false, error: 'missing chapter' };

  const before = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
  const cleanBefore = assessNarrativeCleanliness(before);

  const gamePath = getPackageGamePath(entry.id);
  const html = gamePath && fs.existsSync(gamePath) ? fs.readFileSync(gamePath, 'utf8') : '';
  const hints = html ? extractGameHints([{ path: 'game.html', content: html }]) : {};

  let chapter = structuredClone(before);
  let mm = chapter.strategy?.mermaid || '';
  mm = stripMechanicalLoopScaffold(mm);
  mm = ensureDomainFeedbackLoop(mm);
  chapter = { ...chapter, strategy: { ...chapter.strategy, mermaid: mm } };
  chapter = rebuildStrategySelectFanout(chapter);
  chapter = cleanHighlightNodes(chapter);
  chapter = applyStrategyMermaidSanitize(chapter);
  mm = ensureDomainFeedbackLoop(chapter.strategy?.mermaid || '');
  chapter = { ...chapter, strategy: { ...chapter.strategy, mermaid: mm } };
  chapter = applyStrategyMermaidSanitize(chapter);
  chapter = repairStrategyRouteHighlights(chapter);
  chapter = cleanHighlightNodes(chapter);

  const validation = validateChapter(chapter, hints);
  const quality = validateChapterQuality(chapter, hints);
  const cleanAfter = assessNarrativeCleanliness(chapter);

  fs.writeFileSync(chapterPath, JSON.stringify(chapter, null, 2), 'utf8');

  const metaPath = path.join(getPackagesRoot(), entry.id, 'meta.json');
  const prevMeta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
  fs.writeFileSync(metaPath, JSON.stringify({
    ...prevMeta,
    id: entry.id,
    narrativeSurgicalAt: new Date().toISOString(),
    narrativeBaseline: 'narrative-v2',
    narrativeCleanBefore: cleanBefore.score,
    narrativeCleanAfter: cleanAfter.score,
  }, null, 2), 'utf8');

  const sampleDir = path.join(YANG, entry.dir);
  let exportOk = true;
  let exportErr = null;
  try {
    writePriorityGraphFiles({
      chapter,
      title: prevMeta.title || chapter.kg?.title || entry.topic || entry.id,
      runtimeDir: path.join(getPackagesRoot(), entry.id),
      sampleDir: fs.existsSync(sampleDir) ? sampleDir : undefined,
    });
  } catch (e) {
    exportOk = false;
    exportErr = e.message;
  }

  return {
    id: entry.id,
    ok: validation.ok && quality.ok && cleanAfter.score > cleanBefore.score,
    validationOk: validation.ok,
    qualityOk: quality.ok,
    qualityErrors: quality.errors || [],
    qualityWarnings: (quality.warnings || []).filter(w => /LoopObserve|mechanical/i.test(w)),
    cleanBefore: cleanBefore.score,
    cleanAfter: cleanAfter.score,
    dirtyAfter: cleanAfter.dirty,
    issuesAfter: cleanAfter.issues,
    exportOk,
    exportErr,
  };
}

function main() {
  const filterId = argValue('--id');
  const idsArg = argValue('--ids');
  let entries = YANG_MAP;
  if (filterId) entries = YANG_MAP.filter(e => e.id === filterId);
  else if (idsArg) {
    const set = new Set(idsArg.split(/[,\s]+/).filter(Boolean));
    entries = YANG_MAP.filter(e => set.has(e.id));
  }

  const rows = [];
  for (const entry of entries) {
    const row = repairOne(entry);
    rows.push(row);
    const mark = row.ok ? 'OK' : (row.qualityOk ? 'SOFT' : 'FAIL');
    console.log(
      mark,
      row.id,
      `clean ${row.cleanBefore}→${row.cleanAfter}`,
      row.qualityOk ? 'quality✓' : `quality✗ ${(row.qualityErrors || []).slice(0, 2).join('; ')}`,
      row.exportOk ? '' : `export✗ ${row.exportErr}`,
    );
  }

  const reportDir = getReportsRoot();
  fs.mkdirSync(reportDir, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    baseline: 'narrative-v2',
    note: 'surgical narrative cleanup; no full enrich; hand-authored expert graphs untouched',
    rows,
    summary: {
      total: rows.length,
      ok: rows.filter(r => r.ok).length,
      qualityOk: rows.filter(r => r.qualityOk).length,
      cleanImproved: rows.filter(r => r.cleanAfter > r.cleanBefore).length,
      meanCleanBefore: avg(rows.map(r => r.cleanBefore)),
      meanCleanAfter: avg(rows.map(r => r.cleanAfter)),
    },
  };
  fs.writeFileSync(path.join(reportDir, 'repair-narrative-surgical.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report.summary, null, 2));
  if (rows.some(r => !r.qualityOk)) process.exitCode = 1;
}

function avg(xs) {
  if (!xs.length) return null;
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000;
}

main();
