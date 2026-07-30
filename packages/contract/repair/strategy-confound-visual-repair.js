/**
 * Ensure confounding variables appear on the strategy Mermaid as a low-score
 * side branch (试探混淆), plus a confoundProbe route. Never assigns priorityRank
 * that competes with AV 单变量 paths.
 *
 * Also collapses redundant ModeOff / 条件下误操作 misconception islands when a
 * structured 试探混淆·{CV} bypass already teaches the same “拧无关量” idea.
 */
const { parseStrategyMermaidEdges } = require('../../shared/strategy-mermaid-parse.js');

const CONFOUND_PROBE_SCORE = 0.15;
const CONFOUND_LABEL_RE = /试探混淆/;
const MISCONCEPTION_NODE_RE = /CheckMisconception|InvalidMisconception/;
const MISCONCEPTION_LINE_RE = /CheckMisconception|InvalidMisconception|条件下误操作|是否误调无效参数|关态误调无效参数/;

function listConfoundingVariables(chapter) {
  const cvs = chapter?.inquiryScript?.confoundingVariables || [];
  return cvs.filter(c => c && (c.label || c.controlId));
}

function shortCvLabel(cv) {
  const raw = String(cv.label || cv.controlId || '混淆量').trim();
  return raw.replace(/极板/g, '').slice(0, 12) || '混淆量';
}

function confoundRouteLabel(cv) {
  return `试探混淆·${shortCvLabel(cv)}`;
}

function primaryStrategySelectId(mermaid) {
  const edges = parseStrategyMermaidEdges(mermaid);
  const selectIds = [...new Set(
    edges.filter(e => /StrategySelect/i.test(e.from)).map(e => e.from),
  )];
  let best = null;
  let bestN = -1;
  for (const id of selectIds) {
    const n = edges.filter(e => e.from === id && !CONFOUND_LABEL_RE.test(e.label || '')).length;
    if (n > bestN) {
      best = id;
      bestN = n;
    }
  }
  if (best && bestN > 0) return best;
  // No AV fan-out on StrategySelect — hang probe on ModeSelect / Env hub instead
  if (edges.some(e => e.from === 'ModeSelect')) return 'ModeSelect';
  if (edges.some(e => e.from === 'Env')) return 'Env';
  if (selectIds.includes('StrategySelect')) return 'StrategySelect';
  return selectIds[0] || 'StrategySelect';
}

function hasConfoundSelectEdge(mermaid) {
  return /(?:StrategySelect|ModeSelect|Env)[^\n]*-(?:\.->|->)\s*\|[^|]*试探混淆/i.test(String(mermaid || ''));
}

function nodeIdExists(mermaid, id) {
  const re = new RegExp(`\\b${id}\\b`);
  return re.test(String(mermaid || ''));
}

function pickUniqueId(mermaid, base) {
  if (!nodeIdExists(mermaid, base)) return base;
  for (let i = 2; i < 20; i++) {
    const id = `${base}${i}`;
    if (!nodeIdExists(mermaid, id)) return id;
  }
  return `${base}X`;
}

/**
 * ModeOff (or equivalent) is a real mode/env watershed, not an orphan island id.
 */
function modeOffIsRealWatershed(mermaid) {
  const mm = String(mermaid || '');
  if (/ModeOff\[[^\]]*(模式|探究|竞赛|关态|无效|理想|锁定)[^\]]*\]/.test(mm)) return true;
  const edges = parseStrategyMermaidEdges(mm);
  return edges.some(e =>
    e.to === 'ModeOff'
    && !MISCONCEPTION_NODE_RE.test(e.from)
    && e.from !== 'ModeOff',
  );
}

function hasMisconceptionLoop(mermaid) {
  const mm = String(mermaid || '');
  return MISCONCEPTION_LINE_RE.test(mm)
    || (/InvalidMisconception/.test(mm) && /CheckMisconception/.test(mm));
}

/**
 * When a CV probe exists (or will), drop the duplicate 条件下误操作环.
 * Keeps a real ModeOff mode hub; removes only Check/Invalid cycle edges.
 * Orphan ModeOff (no watershed role) is removed entirely with the cycle.
 */
function stripRedundantMisconceptionLoop(mermaid) {
  let mm = String(mermaid || '').replace(/\r\n/g, '\n');
  if (!hasMisconceptionLoop(mm)) return mm;

  const keepModeOff = modeOffIsRealWatershed(mm);
  mm = mm.split('\n').filter(line => {
    const t = line.trim();
    if (!t) return true;
    if (MISCONCEPTION_LINE_RE.test(t)) return false;
    if (!keepModeOff && /\bModeOff\b/.test(t)) {
      // Drop orphan ModeOff edges/defs that only served the misconception island
      return false;
    }
    return true;
  }).join('\n');

  // Clean blank runs
  return mm.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Inject StrategySelect -.->|试探混淆·L| ProbeCV → ObserveCV → back to select.
 */
function injectConfoundMermaidBranch(mermaid, cv) {
  let mm = String(mermaid || '').replace(/\r\n/g, '\n').trim();
  if (!mm) return mm;
  if (hasConfoundSelectEdge(mm)) return mm;

  const selectId = primaryStrategySelectId(mm);
  const probeId = pickUniqueId(mm, 'ProbeCV');
  const observeId = pickUniqueId(mm, 'ObserveCV');
  const backId = pickUniqueId(mm, 'BackFromCV');
  const label = confoundRouteLabel(cv);
  const probeLabel = `拧混淆·${shortCvLabel(cv)}`;

  const block = [
    `${selectId} -.->|${label}| ${probeId}[${probeLabel}]:::stratInvalid`,
    `${probeId} --> ${observeId}{观察有无增益?}:::stratCond`,
    `${observeId} -->|无增益| ${backId}[回到主策略]:::stratCore`,
    `${backId} --> ${selectId}`,
  ].join('\n');

  return `${mm}\n${block}`;
}

function buildConfoundProbeRoute(cv, selectId, mermaid) {
  const label = confoundRouteLabel(cv);
  // Resolve actual node ids from mermaid after inject (may have been uniquified)
  const edges = parseStrategyMermaidEdges(mermaid);
  const out = edges.find(e =>
    e.from === selectId && CONFOUND_LABEL_RE.test(e.label || ''),
  );
  const probeId = out?.to || 'ProbeCV';
  const fromProbe = edges.filter(e => e.from === probeId);
  const observeId = fromProbe[0]?.to || 'ObserveCV';
  const fromObs = edges.filter(e => e.from === observeId);
  const backId = fromObs.find(e => /无增益|回到/.test(e.label || ''))?.to
    || fromObs[0]?.to
    || 'BackFromCV';

  const highlightNodes = [...new Set([selectId, probeId, observeId, backId].filter(Boolean))];
  const highlightEdges = [
    [selectId, probeId],
    [probeId, observeId],
    [observeId, backId],
    [backId, selectId],
  ].filter(([a, b]) => a && b);

  return {
    id: `confound_${cv.controlId || cv.id || 'cv1'}`.replace(/[^A-Za-z0-9_]/g, '_'),
    label,
    tier: 'suboptimal',
    kind: 'confoundProbe',
    mapsTo: [],
    warn: '拧混淆量通常无增益，应回到单变量主路径；勿抬成高优策略',
    score: CONFOUND_PROBE_SCORE,
    weight: CONFOUND_PROBE_SCORE,
    // Explicitly no priorityRank — must not compete with AV 单变量
    highlightNodes,
    highlightEdges,
    highlightFailureBranches: false,
  };
}

function ensureConfoundProbeRoute(routes, probeRoute) {
  const list = Array.isArray(routes) ? [...routes] : [];
  const idx = list.findIndex(r =>
    r.kind === 'confoundProbe'
    || CONFOUND_LABEL_RE.test(r.label || '')
    || r.id === probeRoute.id,
  );
  if (idx >= 0) {
    const prev = list[idx];
    list[idx] = {
      ...prev,
      ...probeRoute,
      highlightNodes: (probeRoute.highlightNodes?.length >= (prev.highlightNodes || []).length)
        ? probeRoute.highlightNodes
        : (prev.highlightNodes || probeRoute.highlightNodes),
      highlightEdges: (probeRoute.highlightEdges?.length >= (prev.highlightEdges || []).length)
        ? probeRoute.highlightEdges
        : (prev.highlightEdges || probeRoute.highlightEdges),
    };
    // Drop accidental priorityRank on confound routes
    delete list[idx].priorityRank;
    return list;
  }
  list.push(probeRoute);
  return list;
}

/**
 * Demote any CV-looking route that was wrongly given a high priorityRank as 单变量.
 * (Does not rename AV routes; only clears priorityRank on kind=confoundProbe.)
 */
function stripConfoundPriorityRanks(routes) {
  return (routes || []).map(r => {
    if (r.kind === 'confoundProbe' || CONFOUND_LABEL_RE.test(r.label || '')) {
      const next = { ...r, kind: 'confoundProbe', score: Math.min(Number(r.score) || CONFOUND_PROBE_SCORE, CONFOUND_PROBE_SCORE) };
      delete next.priorityRank;
      return next;
    }
    return r;
  });
}

function scrubMisconceptionFromRoutes(routes, keepModeOff) {
  return (routes || []).map(r => {
    const highlightNodes = (r.highlightNodes || []).filter(id => {
      if (MISCONCEPTION_NODE_RE.test(id)) return false;
      if (!keepModeOff && id === 'ModeOff') return false;
      return true;
    });
    const highlightEdges = (r.highlightEdges || []).filter(p => {
      if (!Array.isArray(p) || p.length < 2) return false;
      if (MISCONCEPTION_NODE_RE.test(p[0]) || MISCONCEPTION_NODE_RE.test(p[1])) return false;
      if (!keepModeOff && (p[0] === 'ModeOff' || p[1] === 'ModeOff')) return false;
      return true;
    });
    return { ...r, highlightNodes, highlightEdges };
  });
}

function removeOrphanConfoundBranch(mermaid) {
  let mm = String(mermaid || '').replace(/\r\n/g, '\n');
  const edges = parseStrategyMermaidEdges(mm);
  const selectIds = [...new Set(edges.filter(e => /StrategySelect/i.test(e.from)).map(e => e.from))];
  for (const id of selectIds) {
    const outs = edges.filter(e => e.from === id);
    const nonCv = outs.filter(e => !CONFOUND_LABEL_RE.test(e.label || ''));
    const cvOuts = outs.filter(e => CONFOUND_LABEL_RE.test(e.label || ''));
    if (nonCv.length === 0 && cvOuts.length > 0) {
      // Drop orphan StrategySelect-only confound lines so we can rehang on ModeSelect
      mm = mm.split('\n').filter(line => {
        if (/试探混淆|ProbeCV|ObserveCV|BackFromCV/i.test(line)) return false;
        return true;
      }).join('\n');
      return mm;
    }
  }
  return mm;
}

/**
 * Drop unreachable ModeOff/条件下误操作 islands (no watershed role).
 * Does not touch a real ModeOff hub that still needs a coupled misconception cycle.
 */
function stripOrphanMisconceptionIsland(mermaid) {
  const mm = String(mermaid || '');
  if (!hasMisconceptionLoop(mm)) return mm;
  if (modeOffIsRealWatershed(mm)) return mm;
  return stripRedundantMisconceptionLoop(mm);
}

function repairStrategyConfoundVisual(chapter) {
  if (!chapter?.strategy) return chapter;
  const cvs = listConfoundingVariables(chapter);
  let mermaid = String(chapter.strategy.mermaid || '');

  if (!cvs.length) {
    mermaid = stripOrphanMisconceptionIsland(mermaid);
    return {
      ...chapter,
      strategy: {
        ...chapter.strategy,
        mermaid,
        routes: scrubMisconceptionFromRoutes(
          stripConfoundPriorityRanks(chapter.strategy.routes),
          modeOffIsRealWatershed(mermaid),
        ),
      },
    };
  }

  const primary = cvs[0];
  const keepModeOff = modeOffIsRealWatershed(mermaid);
  // CV probe supersedes duplicate 条件下误操作 / ModeOff 迷思环
  mermaid = stripRedundantMisconceptionLoop(mermaid);
  mermaid = removeOrphanConfoundBranch(mermaid);
  mermaid = injectConfoundMermaidBranch(mermaid, primary);
  const selectId = primaryStrategySelectId(mermaid);
  const probeRoute = buildConfoundProbeRoute(primary, selectId, mermaid);
  let routes = ensureConfoundProbeRoute(chapter.strategy.routes, probeRoute);
  routes = stripConfoundPriorityRanks(routes);
  routes = scrubMisconceptionFromRoutes(routes, keepModeOff);
  // Drop ProbeCV bleed from AV routes
  routes = routes.map(r => {
    if (r.kind === 'confoundProbe' || CONFOUND_LABEL_RE.test(r.label || '')) return r;
    const highlightNodes = (r.highlightNodes || []).filter(id => !/^(ProbeCV|ObserveCV|BackFromCV)/i.test(id));
    const highlightEdges = (r.highlightEdges || []).filter(p => {
      if (!Array.isArray(p) || p.length < 2) return false;
      if (/^(ProbeCV|ObserveCV|BackFromCV)/i.test(p[0])) return false;
      if (/^(ProbeCV|ObserveCV|BackFromCV)/i.test(p[1])) return false;
      return true;
    });
    return { ...r, highlightNodes, highlightEdges };
  });

  return {
    ...chapter,
    strategy: {
      ...chapter.strategy,
      mermaid,
      routes,
    },
  };
}

module.exports = {
  CONFOUND_PROBE_SCORE,
  listConfoundingVariables,
  confoundRouteLabel,
  injectConfoundMermaidBranch,
  buildConfoundProbeRoute,
  repairStrategyConfoundVisual,
  hasConfoundSelectEdge,
  stripRedundantMisconceptionLoop,
  stripOrphanMisconceptionIsland,
  modeOffIsRealWatershed,
  hasMisconceptionLoop,
};
