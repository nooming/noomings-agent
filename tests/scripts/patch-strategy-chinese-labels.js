/**
 * Unify strategy mermaid Chinese display labels across runtime packages.
 * Does NOT rename node IDs (highlightNodes/Edges stay stable).
 *
 *   node tests/scripts/patch-strategy-chinese-labels.js
 *   node tests/scripts/patch-strategy-chinese-labels.js --dry-run
 *   node tests/scripts/patch-strategy-chinese-labels.js --ids multi-kp,transformer-turns
 *   node tests/scripts/patch-strategy-chinese-labels.js --audit-only
 *
 * Then re-export graphs (optional, default on unless --no-export):
 *   writePriorityGraphFiles for touched packages
 */
const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const {
  parseStrategyMermaidEdges,
  extractStrategyNodeLabels,
} = require('../../packages/shared/strategy-mermaid-parse.js');
const { collapseTrapChainsInChapter } = require('../../packages/shared/collapse-trap-redundant-chains.js');
const {
  collapseOrphanStubsInChapter,
  collectSelectTargets,
  isOrphanStubHubId,
} = require('../../packages/shared/collapse-orphan-strategy-stubs.js');
const { writePriorityGraphFiles } = require('../../packages/generate/export/build-priority-graph-html');
const { getPackagesRoot, getReportsRoot } = require('../../packages/shared/data-paths');

const ROOT = path.resolve(__dirname, '../..');
const PACKAGES = getPackagesRoot();
const YANG = path.join(ROOT, '\u6837\u672chtml');
const REPORT = path.join(getReportsRoot(), 'patch-strategy-chinese-labels.json');

const HAS_ZH = /[\u4e00-\u9fff]/;
const SINGLE_VAR_LABEL_RE = /固定其余|只调|按观察单变量微调|^单变量微调$/;
const MULTI_PARAM_LABEL = '同时调多个参数';
const MULTI_PARAM_SHORT = '多参盲调';

/** IDs that are multi-param / trap hubs — never keep single-var pedagogy text. */
const MULTI_HUB_ID_RE = /^(Trap|TrapStrat|TrapC|Trap2|TrapRoute|MultiTrap|PathTrap|TuneTrap|AdjustBoth|AdjustBothC|AdjustMulti|AdjustAll|Blind|Blind2)$/i;

/** Strategy / route hubs that should show Chinese even when edge already has a label. */
const HUB_ID_RE = /^(Trap|TrapStrat|TrapC|Trap2|TrapRoute|MultiTrap|PathTrap|TuneTrap|ProbeCV|HeightStrat|SpeedStrat|AngleStrat|DistStrat|AdjustBoth|AdjustBothC|AdjustMulti|AdjustAll|Route_main(?:_\w+)?|Route\d+[A-Za-z]*|Route[A-Z]\w*|Path\w+|Tune\w+|Single\w+|Blind\w*|Len|Area|Dist|Mat|FrictionRoute|AngleRoute(?:Challenge)?|LenRoute|MultiParam)$/i;

/** Fallback id → Chinese when no StrategySelect edge label is available. */
const DEFAULT_LABELS = {
  Trap: MULTI_PARAM_SHORT,
  TrapC: MULTI_PARAM_SHORT,
  Trap2: MULTI_PARAM_SHORT,
  // Intermediates kept only when shared by Observe loops — prefer short; collapse script removes trap spine dups
  TrapStrat: MULTI_PARAM_SHORT,
  TrapRoute: MULTI_PARAM_SHORT,
  MultiTrap: MULTI_PARAM_SHORT,
  PathTrap: MULTI_PARAM_SHORT,
  TuneTrap: MULTI_PARAM_SHORT,
  AdjustBoth: MULTI_PARAM_LABEL,
  AdjustBothC: MULTI_PARAM_LABEL,
  AdjustMulti: MULTI_PARAM_LABEL,
  AdjustAll: MULTI_PARAM_LABEL,
  Blind: MULTI_PARAM_SHORT,
  Blind2: MULTI_PARAM_SHORT,
  ProbeCV: '拧混淆控件',
  HeightStrat: '单变量·起始高度',
  SpeedStrat: '单变量·初速度',
  AngleStrat: '单变量·发射角',
  DistStrat: '单变量·距离',
  Len: '单变量·摆长',
  Area: '单变量·面积',
  Dist: '单变量·间距',
  Mat: '单变量·介质',
  AngleRoute: '单变量·倾角',
  AngleRouteChallenge: '单变量·倾角',
  FrictionRoute: '单变量·摩擦',
  LenRoute: '单变量·摆长',
  RouteMeter: '单变量·电表内阻',
  RouteR1: '单变量·电阻R1',
  RouteR2: '单变量·电阻R2',
  PathFreq: '单变量·频率',
  PathIntensity: '单变量·光强',
  PathWork: '单变量·逸出功',
  SingleD: '单变量·极板间距',
  SingleE: '单变量·场强',
  SingleQ: '单变量·电荷量',
  SingleMass: '单变量·质量',
  SingleMassC: '单变量·质量',
  SingleTemp: '单变量·温度',
  SingleVel1: '单变量·速度1',
  SingleVel1C: '单变量·速度1',
  SingleVel2: '单变量·速度2',
  SingleVel2C: '单变量·速度2',
};

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function stripPriority(label) {
  return String(label || '')
    .replace(/\s*·\s*优先\d+\s*·\s*[\d.]+$/u, '')
    .replace(/\s*·\s*陷阱\s*·\s*[\d.]+$/u, '')
    .replace(/\s*·\s*旁路\s*·\s*[\d.]+$/u, '')
    .replace(/\s*·\s*优先\d+$/u, '')
    .replace(/\s*·\s*陷阱$/u, '')
    .replace(/\s*·\s*旁路$/u, '')
    .trim();
}

function isChineseLabel(lab) {
  return HAS_ZH.test(String(lab || ''));
}

function patternFallbackLabel(id, selectTargets) {
  // Never invent「路径N」for orphan numbered stubs — cleanup removes them;
  // if still present and not a Select target, skip labeling so they stay invisible as strategy heads.
  if (isOrphanStubHubId(id, selectTargets)) return null;
  if (DEFAULT_LABELS[id]) return DEFAULT_LABELS[id];
  let m = id.match(/^Route(\d+)([A-Za-z]*)$/i);
  if (m) return m[2] ? `路径${m[1]}${m[2]}` : `路径${m[1]}`;
  m = id.match(/^Tune(\d+)$/i);
  if (m) return `调参路径${m[1]}`;
  m = id.match(/^RouteT$/i);
  if (m) return MULTI_PARAM_SHORT;
  m = id.match(/^Path(\w+)$/i);
  if (m) return `路径·${m[1]}`;
  m = id.match(/^Single(\w+)$/i);
  if (m) return `单变量·${m[1]}`;
  m = id.match(/^(\w+)Strat$/i);
  if (m) return `单变量·${m[1]}`;
  m = id.match(/^(\w+)Route$/i);
  if (m) return `路径·${m[1]}`;
  if (/Trap/i.test(id)) return MULTI_PARAM_SHORT;
  if (/Blind/i.test(id)) return MULTI_PARAM_SHORT;
  if (/ProbeCV/i.test(id)) return '拧混淆控件';
  return null;
}

function collectSelectEdgeLabels(edges) {
  const map = new Map();
  for (const e of edges) {
    if (!/StrategySelect/i.test(e.from)) continue;
    const lab = stripPriority(e.label);
    if (lab && isChineseLabel(lab) && e.to) {
      if (!map.has(e.to)) map.set(e.to, lab);
    }
  }
  return map;
}

function desiredLabelForId(id, labels, selectLabs, selectTargets) {
  // Skip inventing Chinese for orphan RouteN/TuneN stubs (not Select targets)
  if (isOrphanStubHubId(id, selectTargets) && !selectLabs.has(id)) return null;
  const cur = labels.get(id) || '';
  if (MULTI_HUB_ID_RE.test(id) && (!cur || SINGLE_VAR_LABEL_RE.test(cur) || !isChineseLabel(cur))) {
    return DEFAULT_LABELS[id] || MULTI_PARAM_LABEL;
  }
  if (isChineseLabel(cur) && !SINGLE_VAR_LABEL_RE.test(cur)) return null; // keep
  if (isChineseLabel(cur) && !MULTI_HUB_ID_RE.test(id)) return null; // single-var text on single hub OK
  if (selectLabs.has(id)) return selectLabs.get(id);
  if (DEFAULT_LABELS[id]) return DEFAULT_LABELS[id];
  return patternFallbackLabel(id, selectTargets);
}

/** Rewrite Id[oldLabel] / Id([old]) / Id{old} — keep class suffix intact. */
function rewriteExistingLabel(body, id, newLabel) {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let changed = false;
  let out = body;

  // Stadium Id([label]) first so Id[…] does not partially match
  out = out.replace(new RegExp(`\\b(${esc})\\(\\[([^\\]]*)\\]\\)`, 'g'), (full, nodeId, oldLab) => {
    if (String(oldLab) === newLabel) return full;
    changed = true;
    return `${nodeId}([${newLabel}])`;
  });
  out = out.replace(new RegExp(`\\b(${esc})\\[([^\\]]*)\\]`, 'g'), (full, nodeId, oldLab) => {
    // Already handled stadium forms leave no bare Id[ after Id([
    if (String(oldLab) === newLabel) return full;
    changed = true;
    return `${nodeId}[${newLabel}]`;
  });
  out = out.replace(new RegExp(`\\b(${esc})\\{([^}]*)\\}`, 'g'), (full, nodeId, oldLab) => {
    if (String(oldLab) === newLabel) return full;
    changed = true;
    return `${nodeId}{${newLabel}}`;
  });
  return { body: out, changed };
}

function appendStandaloneDef(body, id, label) {
  const line = `${id}[${label}]`;
  if (new RegExp(`\\b${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[\\[({]`).test(body)) {
    return { body, changed: false };
  }
  // Insert before trailing blank lines
  const trimmed = body.replace(/\s+$/, '');
  return { body: `${trimmed}\n${line}\n`, changed: true };
}

function ensureLabel(body, id, label) {
  const labels = extractStrategyNodeLabels(body);
  const cur = labels.get(id) || '';
  if (cur === label) return { body, changed: false };
  if (cur) {
    return rewriteExistingLabel(body, id, label);
  }
  return appendStandaloneDef(body, id, label);
}

function findFireTargetForAdjust(edges, adjustId) {
  const outs = edges.filter(e => e.from === adjustId);
  if (!outs.length) return null;
  // Prefer Fire*/Retest*
  const fire = outs.find(e => /^(Fire|Retest|Launch)/i.test(e.to));
  return (fire || outs[0]).to;
}

function pickMultiAdjustTarget(edges) {
  const preferred = [
    'AdjustMulti', 'AdjustBoth', 'AdjustAll', 'TuneTrap', 'Blind', 'AdjustT', 'MultiTrap',
  ];
  for (const id of preferred) {
    if (edges.some(e => e.from === id || e.to === id)) return id;
  }
  return 'AdjustMulti';
}

/**
 * B3: Trap --> Adjust[单变量…] → Trap --> Fire (or Retest/Launch), not AdjustMulti.
 * Avoid recreating synonym multi-param hops on the trap spine.
 */
function redirectTrapAwayFromSingleAdjust(body, edges, labels) {
  const notes = [];
  const highlightPatches = [];
  let out = body;
  const singleAdjustIds = new Set();
  for (const [id, lab] of labels) {
    if (/^Adjust$/i.test(id) && SINGLE_VAR_LABEL_RE.test(lab || '单变量微调')) {
      singleAdjustIds.add(id);
    }
  }
  if (edges.some(e => e.to === 'Adjust' || e.from === 'Adjust')) {
    const lab = labels.get('Adjust') || '';
    if (!lab || SINGLE_VAR_LABEL_RE.test(lab) || lab === '单变量微调' || /按观察单变量/.test(lab)) {
      singleAdjustIds.add('Adjust');
    }
  }

  const trapSources = edges.filter(e =>
    /^(Trap|TrapC|Trap2)$/i.test(e.from) && singleAdjustIds.has(e.to));
  if (!trapSources.length) return { body: out, highlightPatches, notes };

  for (const edge of trapSources) {
    const fireTo = findFireTargetForAdjust(edges, edge.to)
      || findFireTargetForAdjust(edges, edge.from)
      || 'Fire';

    const escFrom = edge.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escTo = edge.to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const edgeRe = new RegExp(`\\b(${escFrom})\\s*(-->|-\\.->)\\s*(?:\\|[^|]*\\|\\s*)?${escTo}\\b`, 'g');
    const before = out;
    out = out.replace(edgeRe, `$1 $2 ${fireTo}`);
    if (out !== before) {
      highlightPatches.push({ from: edge.from, to: edge.to, newTo: fireTo });
      notes.push(`redirect ${edge.from} --> ${edge.to} ⇒ ${fireTo}`);
    } else if (!parseStrategyMermaidEdges(out).some(e => e.from === edge.from && e.to === fireTo)) {
      out = out.replace(/\s+$/, '') + `\n${edge.from} --> ${fireTo}\n`;
      highlightPatches.push({ from: edge.from, to: edge.to, newTo: fireTo });
      notes.push(`add ${edge.from} --> ${fireTo} (was ${edge.to})`);
    }
  }
  return { body: out, highlightPatches, notes };
}

/**
 * Rewrite copy-paste bugs:
 * - Any「固定其余，只调…」→ multi-param (never correct pedagogy text)
 * - Multi hubs with「按观察单变量微调」→ multi-param
 */
function rewriteContradictionLabels(body) {
  let out = body;
  const notes = [];
  const labels = extractStrategyNodeLabels(out);

  for (const [id, lab] of labels) {
    if (/固定其余/.test(lab)) {
      const r = ensureLabel(out, id, MULTI_PARAM_LABEL);
      out = r.body;
      if (r.changed) notes.push(`fix-固定其余 ${id} → ${MULTI_PARAM_LABEL}`);
      continue;
    }
    if (MULTI_HUB_ID_RE.test(id) && /按观察单变量微调|单变量微调/.test(lab)) {
      const want = DEFAULT_LABELS[id] || MULTI_PARAM_LABEL;
      const r = ensureLabel(out, id, want);
      out = r.body;
      if (r.changed) notes.push(`fix-multi-hub ${id} → ${want}`);
    }
  }
  return { body: out, notes };
}

function patchHighlights(routes, patches) {
  if (!patches.length || !Array.isArray(routes)) return { routes, changed: false };
  let changed = false;
  const next = routes.map(route => {
    let nodes = route.highlightNodes ? [...route.highlightNodes] : null;
    let edges = route.highlightEdges ? route.highlightEdges.map(p => Array.isArray(p) ? [...p] : p) : null;
    let rChanged = false;
    for (const p of patches) {
      // Only rewrite Trap→Adjust style edges in highlights
      if (edges) {
        for (const pair of edges) {
          if (Array.isArray(pair) && pair[0] === p.from && pair[1] === p.to) {
            pair[1] = p.newTo;
            rChanged = true;
          }
        }
      }
      if (nodes && nodes.includes(p.from) && nodes.includes(p.to) && !nodes.includes(p.newTo)) {
        // trap route likely — swap Adjust for multi adjust
        const isTrapRoute = /trap|盲调|多参/i.test(`${route.id || ''}${route.label || ''}`)
          || route.tier === 'suboptimal';
        if (isTrapRoute) {
          nodes = nodes.map(n => (n === p.to ? p.newTo : n));
          if (!nodes.includes(p.newTo)) nodes.push(p.newTo);
          rChanged = true;
        }
      }
    }
    if (!rChanged) return route;
    changed = true;
    return {
      ...route,
      ...(nodes ? { highlightNodes: nodes } : {}),
      ...(edges ? { highlightEdges: edges } : {}),
    };
  });
  return { routes: next, changed };
}

function auditMermaid(mermaid) {
  const edges = parseStrategyMermaidEdges(mermaid);
  const labels = extractStrategyNodeLabels(mermaid);
  const nodes = new Set();
  edges.forEach(e => { nodes.add(e.from); nodes.add(e.to); });

  const bare = [];
  for (const n of nodes) {
    if (!HUB_ID_RE.test(n) && !/Strat$|Route|Path|Tune|Single|Blind|Trap|ProbeCV/i.test(n)) continue;
    if (/^(Start|Win|Fire|Observe|Adjust|Explore|Challenge|ModeSelect|StrategySelect|Retry|BackFrom|Continue|Env|Mode)/i.test(n)
      && !/Trap|Both|Multi|All|Blind|Strat|Route|Path|Tune|Single|Probe/i.test(n)) continue;
    // Keep Adjust* that aren't multi hubs out of "bare hub" unless bare English
    if (/^Adjust/i.test(n) && !MULTI_HUB_ID_RE.test(n)) continue;
    const lab = labels.get(n) || '';
    if (!lab || lab === n || !isChineseLabel(lab)) bare.push({ id: n, label: lab || null });
  }

  const contradictions = [];
  for (const e of edges) {
    const fromLab = labels.get(e.from) || '';
    const toLab = labels.get(e.to) || '';
    const fromMulti = MULTI_HUB_ID_RE.test(e.from)
      || /多参盲调|同时调多个|盲调|多参/.test(fromLab)
      || /多参盲调|同时调/.test(e.label || '');
    if (fromMulti && SINGLE_VAR_LABEL_RE.test(toLab)) {
      contradictions.push({ kind: 'edge', from: e.from, to: e.to, toLabel: toLab });
    }
  }
  for (const [id, lab] of labels) {
    if (MULTI_HUB_ID_RE.test(id) && SINGLE_VAR_LABEL_RE.test(lab)) {
      contradictions.push({ kind: 'self', id, label: lab });
    }
  }

  // B3 remaining: Trap → Adjust with single-var label
  const b3 = [];
  for (const e of edges) {
    if (!/^(Trap|TrapC|Trap2)$/i.test(e.from)) continue;
    if (!/^Adjust$/i.test(e.to)) continue;
    const lab = labels.get(e.to) || '';
    if (!lab || SINGLE_VAR_LABEL_RE.test(lab)) {
      b3.push({ from: e.from, to: e.to, toLabel: lab || '(bare)' });
    }
  }

  return { bare, contradictions, b3 };
}

function patchChapter(chapter) {
  const notes = [];
  let mermaid = chapter.strategy?.mermaid;
  if (!mermaid) return { chapter, changed: false, notes, auditBefore: null, auditAfter: null };

  const auditBefore = auditMermaid(mermaid);
  let edges = parseStrategyMermaidEdges(mermaid);
  let labels = extractStrategyNodeLabels(mermaid);
  const selectLabs = collectSelectEdgeLabels(edges);
  const selectTargets = collectSelectTargets(edges);

  // 1) Ensure Chinese labels on hubs / select targets
  const nodeIds = new Set();
  edges.forEach(e => { nodeIds.add(e.from); nodeIds.add(e.to); });
  // Also label nodes that appear only in select fan-out
  for (const id of nodeIds) {
    if (!HUB_ID_RE.test(id) && !selectLabs.has(id) && !/Strat$|Route|Path|Tune|Single|Blind|Trap|ProbeCV/i.test(id)) {
      continue;
    }
    if (/^Adjust$/i.test(id)) continue; // leave single Adjust alone
    if (/^Adjust[A-Z]/i.test(id) && !MULTI_HUB_ID_RE.test(id) && !selectLabs.has(id)) {
      // AdjustH etc. usually already labeled; skip unless bare hub pattern
      const lab = labels.get(id) || '';
      if (isChineseLabel(lab)) continue;
    }
    const want = desiredLabelForId(id, labels, selectLabs, selectTargets);
    if (!want) continue;
    const cur = labels.get(id) || '';
    if (cur === want) continue;
    // Don't overwrite good Chinese single-var labels with fallback
    if (isChineseLabel(cur) && !SINGLE_VAR_LABEL_RE.test(cur) && !MULTI_HUB_ID_RE.test(id)) continue;
    if (isChineseLabel(cur) && SINGLE_VAR_LABEL_RE.test(cur) && !MULTI_HUB_ID_RE.test(id)) continue;
    const r = ensureLabel(mermaid, id, want);
    if (r.changed) {
      mermaid = r.body;
      notes.push(`label ${id} → ${want}`);
      labels = extractStrategyNodeLabels(mermaid);
    }
  }

  // 2) Contradiction rewrites (固定其余 / multi-hub 单变量文案)
  const forced = rewriteContradictionLabels(mermaid);
  mermaid = forced.body;
  notes.push(...forced.notes);

  // 3) B3 redirect Trap→Adjust → Trap→Fire (safe)
  edges = parseStrategyMermaidEdges(mermaid);
  labels = extractStrategyNodeLabels(mermaid);
  const redirected = redirectTrapAwayFromSingleAdjust(mermaid, edges, labels);
  mermaid = redirected.body;
  notes.push(...redirected.notes);

  let routes = chapter.strategy.routes;
  const hl = patchHighlights(routes, redirected.highlightPatches);
  routes = hl.routes;

  // Normalize newlines
  mermaid = mermaid.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  if (!mermaid.endsWith('\n')) mermaid += '\n';

  let nextChapter = {
    ...chapter,
    strategy: {
      ...chapter.strategy,
      mermaid,
      ...(routes ? { routes } : {}),
    },
  };

  // 4) Collapse Trap→TrapStrat→Adjust* / Trap→AdjustMulti synonym spines to Trap→Fire
  const collapsed = collapseTrapChainsInChapter(nextChapter);
  if (collapsed.changed) {
    nextChapter = collapsed.chapter;
    notes.push(
      `collapse-trap hops=${collapsed.stats?.removedHops || 0}`
      + ` patterns=${JSON.stringify(collapsed.stats?.patterns || {})}`,
    );
  }

  // 5) Drop orphan RouteN / TuneN stubs not targeted by StrategySelect
  const orphans = collapseOrphanStubsInChapter(nextChapter);
  if (orphans.changed) {
    nextChapter = orphans.chapter;
    notes.push(`collapse-orphan stubs=${(orphans.removedNodes || []).join(',')}`);
  }

  const auditAfter = auditMermaid(nextChapter.strategy.mermaid);
  const changed = nextChapter.strategy.mermaid !== chapter.strategy.mermaid
    || hl.changed
    || collapsed.changed
    || orphans.changed;

  return {
    chapter: nextChapter,
    changed,
    notes,
    auditBefore,
    auditAfter,
    highlightPatches: redirected.highlightPatches,
  };
}

function listPackageIds() {
  return fs.readdirSync(PACKAGES, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(PACKAGES, d.name, 'chapter.json')))
    .map(d => d.name)
    .sort();
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
  const auditOnly = hasFlag('--audit-only');
  const noExport = hasFlag('--no-export');
  const filter = argValue('--ids');
  const ids = filter
    ? filter.split(',').map(s => s.trim()).filter(Boolean)
    : listPackageIds();

  const rows = [];
  let bareBefore = 0;
  let bareAfter = 0;
  let contrBefore = 0;
  let contrAfter = 0;
  let barePkgsBefore = 0;
  let barePkgsAfter = 0;
  let contrPkgsBefore = 0;
  let contrPkgsAfter = 0;
  let b3After = 0;

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

    if (auditOnly) {
      const a = auditMermaid(raw.strategy.mermaid);
      if (a.bare.length) barePkgsBefore += 1;
      if (a.contradictions.length) contrPkgsBefore += 1;
      bareBefore += a.bare.length;
      contrBefore += a.contradictions.length;
      rows.push({ id, bare: a.bare, contradictions: a.contradictions, b3: a.b3 });
      continue;
    }

    const result = patchChapter(raw);
    const { auditBefore: ab, auditAfter: aa } = result;
    if (ab.bare.length) barePkgsBefore += 1;
    if (ab.contradictions.length) contrPkgsBefore += 1;
    if (aa.bare.length) barePkgsAfter += 1;
    if (aa.contradictions.length) contrPkgsAfter += 1;
    bareBefore += ab.bare.length;
    bareAfter += aa.bare.length;
    contrBefore += ab.contradictions.length;
    contrAfter += aa.contradictions.length;
    b3After += aa.b3.length;

    let exported = null;
    if (result.changed && !dry) {
      fs.writeFileSync(chapterPath, JSON.stringify(result.chapter, null, 2), 'utf8');
      if (!noExport) exported = exportOne(id, result.chapter);
    }

    rows.push({
      id,
      changed: result.changed,
      notes: result.notes,
      bareBefore: ab.bare.map(b => b.id),
      bareAfter: aa.bare.map(b => b.id),
      contrBefore: ab.contradictions.length,
      contrAfter: aa.contradictions.length,
      b3After: aa.b3,
      exported,
    });
    const tag = result.changed ? (dry ? 'DRY' : 'OK') : 'SKIP';
    console.log(tag, id,
      `bare ${ab.bare.length}→${aa.bare.length}`,
      `contr ${ab.contradictions.length}→${aa.contradictions.length}`,
      result.notes.slice(0, 4).join('; ') + (result.notes.length > 4 ? '…' : ''));
  }

  const summary = {
    dry,
    auditOnly,
    packageCount: ids.length,
    bareHubInstances: { before: bareBefore, after: auditOnly ? bareBefore : bareAfter },
    bareHubPackages: { before: barePkgsBefore, after: auditOnly ? barePkgsBefore : barePkgsAfter },
    contradictionInstances: { before: contrBefore, after: auditOnly ? contrBefore : contrAfter },
    contradictionPackages: { before: contrPkgsBefore, after: auditOnly ? contrPkgsBefore : contrPkgsAfter },
    b3Remaining: auditOnly ? null : b3After,
    touched: rows.filter(r => r.changed).map(r => r.id),
    rows,
  };

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(summary, null, 2), 'utf8');
  console.log('\nSummary');
  console.log('  bare hubs (instances):', summary.bareHubInstances);
  console.log('  bare hub packages:', summary.bareHubPackages);
  console.log('  contradictions (instances):', summary.contradictionInstances);
  console.log('  contradiction packages:', summary.contradictionPackages);
  if (!auditOnly) console.log('  B3 remaining (Trap→Adjust):', b3After);
  console.log('  touched:', summary.touched.length, summary.touched.join(', ') || '(none)');
  console.log('  report:', REPORT);
}

main();
