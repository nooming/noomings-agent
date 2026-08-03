/**
 * Collapse duplicate StrategySelect* diamonds that share the same
 * 「选择调参策略?」label into a single canonical StrategySelect hub.
 *
 * Correct shape (series-parallel style):
 *   ExploreMode/ChallengeMode --> StrategySelect{选择调参策略?}:::stratCond
 * with all |途径| fan-out edges hanging only on StrategySelect.
 *
 * Does NOT merge intentional multi-fork hubs with distinct labels
 * (e.g. fixture StrategySelect2{选择策略2?}).
 */
const {
  parseStrategyMermaidEdges,
  extractStrategyNodeLabels,
} = require('./strategy-mermaid-parse.js');

const CANONICAL = 'StrategySelect';
const SELECT_LABEL_RE = /选择调参策略\s*\?/;
const SELECT_ID_RE = /^StrategySelect[A-Za-z0-9]*$/i;

function collectSelectIds(mermaidBody) {
  const ids = new Set();
  const labels = extractStrategyNodeLabels(mermaidBody);
  labels.forEach((_, id) => {
    if (SELECT_ID_RE.test(id)) ids.add(id);
  });
  for (const e of parseStrategyMermaidEdges(mermaidBody)) {
    if (SELECT_ID_RE.test(e.from)) ids.add(e.from);
    if (SELECT_ID_RE.test(e.to)) ids.add(e.to);
  }
  const body = String(mermaidBody || '');
  for (const m of body.matchAll(/\b(StrategySelect[A-Za-z0-9]*)\b/g)) {
    ids.add(m[1]);
  }
  return ids;
}

/**
 * Aliases are StrategySelect* nodes (not exactly StrategySelect) whose label
 * is the canonical 「选择调参策略?」chooser. Dead-end aliases with empty labels
 * that sit beside a labeled StrategySelect are also collapsed.
 */
function findDuplicateSelectAliases(mermaidBody) {
  const mm = String(mermaidBody || '');
  const labels = extractStrategyNodeLabels(mm);
  const edges = parseStrategyMermaidEdges(mm);
  const ids = collectSelectIds(mm);
  if (ids.size <= 1) return [];

  const labeledChooser = [...ids].filter(id => SELECT_LABEL_RE.test(labels.get(id) || ''));
  if (labeledChooser.length <= 1) {
    // Dead-end StrategySelect2/C/Challenge with no label but sibling labeled hub
    const hasCanonicalLabel = SELECT_LABEL_RE.test(labels.get(CANONICAL) || '');
    if (!hasCanonicalLabel) return [];
    return [...ids].filter(id => {
      if (id === CANONICAL) return false;
      if (!SELECT_ID_RE.test(id)) return false;
      const lab = labels.get(id) || '';
      if (lab && !SELECT_LABEL_RE.test(lab)) return false;
      const outs = edges.filter(e => e.from === id);
      return outs.length === 0;
    });
  }

  // Prefer collapsing every non-canonical chooser with the same label
  return labeledChooser.filter(id => id !== CANONICAL);
}

function escapeRe(id) {
  return String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const EXPLORE_MODE_RE = /^(Explore|ModeExplore|ExploreMode|ExploreCore)\b/i;
const SELECT_DEF = 'StrategySelect{选择调参策略?}:::stratCond';
const CHOOSER_INLINE_RE = /\bStrategySelect\s*\{[^}]*选择调参策略[^}]*\}(?:\s*:::\w+)?/;

function stripSelectShape(seg) {
  return String(seg)
    .replace(/\bStrategySelect\s*\{[^}]*\}\s*(?:::strat\w+)?/g, 'StrategySelect')
    .replace(/\bStrategySelect\s*:::(?:strat\w+)/g, 'StrategySelect');
}

function isSelectTargetEdge(line) {
  return /(?:-->|-\.->)\s*(?:\|[^|]*\|\s*)?StrategySelect\b/.test(line);
}

/**
 * After renaming aliases → StrategySelect, keep a single inline diamond def.
 * Prefer Explore* → StrategySelect when multiple chooser defs exist; otherwise
 * keep the first existing def in place (no-op for already-clean packages).
 */
function normalizeCanonicalSelectDefs(mermaidBody) {
  let mm = String(mermaidBody || '').replace(/\r\n/g, '\n');
  const lines = mm.split('\n');

  const chooserEdgeIdxs = [];
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (!t || !/(-->|-\.->)/.test(t)) continue;
    if (CHOOSER_INLINE_RE.test(t) && isSelectTargetEdge(t)) chooserEdgeIdxs.push(i);
  }

  // Also count bare StrategySelect:::stratCond leftovers from alias rewrite
  const bareClassIdxs = [];
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (!t || !/(-->|-\.->)/.test(t)) continue;
    if (/\bStrategySelect\s*:::\w+/.test(t) && isSelectTargetEdge(t) && !CHOOSER_INLINE_RE.test(t)) {
      bareClassIdxs.push(i);
    }
  }

  // Only rewrite when duplicate inline chooser defs or bare :::stratCond leftovers exist.
  // Standalone StrategySelect{…} alone is left untouched (common clean shape).
  const needsWork = chooserEdgeIdxs.length > 1 || bareClassIdxs.length > 0;

  if (!needsWork) return mm;

  // Pick def owner: Explore* edge if present among chooser/target edges, else first chooser
  let defIdx = -1;
  for (const i of chooserEdgeIdxs) {
    if (EXPLORE_MODE_RE.test(lines[i].trim())) {
      defIdx = i;
      break;
    }
  }
  if (defIdx < 0 && chooserEdgeIdxs.length) defIdx = chooserEdgeIdxs[0];
  if (defIdx < 0) {
    for (let i = 0; i < lines.length; i += 1) {
      const t = lines[i].trim();
      if (isSelectTargetEdge(t) && EXPLORE_MODE_RE.test(t)) {
        defIdx = i;
        break;
      }
    }
  }
  if (defIdx < 0) {
    for (let i = 0; i < lines.length; i += 1) {
      if (isSelectTargetEdge(lines[i].trim())) {
        defIdx = i;
        break;
      }
    }
  }

  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      out.push(lines[i]);
      continue;
    }
    if (/^StrategySelect\s*[\[({:]/.test(trimmed) && !/(-->|-\.->)/.test(trimmed)) {
      continue;
    }
    if (!/\bStrategySelect\b/.test(trimmed) || !/(-->|-\.->)/.test(trimmed)) {
      out.push(lines[i]);
      continue;
    }
    if (!isSelectTargetEdge(trimmed) && !CHOOSER_INLINE_RE.test(trimmed)
      && !/\bStrategySelect\s*:::\w+/.test(trimmed)) {
      out.push(lines[i]);
      continue;
    }
    let next = stripSelectShape(trimmed);
    if (i === defIdx) {
      next = next.replace(
        /((?:-->|-\.->)\s*(?:\|[^|]*\|\s*)?)StrategySelect\b/,
        `$1${SELECT_DEF}`,
      );
    }
    out.push(next);
  }

  return out.join('\n');
}

function dedupeMermaidEdgeLines(mermaidBody) {
  const lines = String(mermaidBody || '').replace(/\r\n/g, '\n').split('\n');
  const seen = new Set();
  const out = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) {
      out.push(raw);
      continue;
    }
    if (/(-->|-\.->)/.test(t)) {
      // Normalize whitespace for dedupe key; keep first occurrence
      const key = t.replace(/\s+/g, ' ');
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(raw);
  }
  return out.join('\n');
}

/**
 * @returns {{ mermaid: string, changed: boolean, aliases: string[] }}
 */
function collapseDuplicateStrategySelect(mermaidBody) {
  let mm = String(mermaidBody || '').replace(/\r\n/g, '\n');
  if (!mm.trim()) {
    return { mermaid: mm, changed: false, aliases: [] };
  }

  const original = mm;
  const aliases = findDuplicateSelectAliases(mm);
  const ordered = [...aliases].sort((a, b) => b.length - a.length);

  if (!ordered.length) {
    // No alias merge — only touch bodies that still have duplicate/bare chooser defs
    const normalized = normalizeCanonicalSelectDefs(mm);
    if (normalized === mm) {
      return { mermaid: mm, changed: false, aliases: [] };
    }
    mm = dedupeMermaidEdgeLines(normalized);
    mm = mm.replace(/\n{3,}/g, '\n\n');
    if (!mm.endsWith('\n')) mm += '\n';
    return { mermaid: mm, changed: mm !== original, aliases: [] };
  }

  for (const alias of ordered) {
    const esc = escapeRe(alias);
    mm = mm.replace(new RegExp(`\\b${esc}\\b`, 'g'), CANONICAL);
  }

  mm = normalizeCanonicalSelectDefs(mm);
  mm = dedupeMermaidEdgeLines(mm);
  mm = mm.replace(/\n{3,}/g, '\n\n');
  if (!mm.endsWith('\n')) mm += '\n';

  return {
    mermaid: mm,
    changed: mm !== original,
    aliases: ordered,
  };
}

/**
 * Remap highlightNodes / highlightEdges: alias ids → StrategySelect.
 */
function remapSelectAliasHighlights(routes, aliases) {
  if (!Array.isArray(routes) || !aliases?.length) {
    return { routes, changed: false };
  }
  const aliasSet = new Set(aliases);
  let changed = false;

  const next = routes.map(route => {
    let nodes = route.highlightNodes ? [...route.highlightNodes] : null;
    let hlEdges = route.highlightEdges
      ? route.highlightEdges.map(p => (Array.isArray(p) ? [...p] : p))
      : null;
    let rChanged = false;

    if (nodes) {
      const seen = new Set();
      const filtered = [];
      for (const id of nodes) {
        const mapped = aliasSet.has(id) ? CANONICAL : id;
        if (mapped !== id) rChanged = true;
        if (seen.has(mapped)) {
          rChanged = true;
          continue;
        }
        seen.add(mapped);
        filtered.push(mapped);
      }
      if (rChanged || filtered.length !== nodes.length) {
        nodes = filtered;
        rChanged = true;
      }
    }

    if (hlEdges) {
      const seen = new Set();
      const rebuilt = [];
      for (const p of hlEdges) {
        if (!Array.isArray(p) || p.length < 2) continue;
        const a = aliasSet.has(p[0]) ? CANONICAL : p[0];
        const b = aliasSet.has(p[1]) ? CANONICAL : p[1];
        if (a !== p[0] || b !== p[1]) rChanged = true;
        const k = `${a}->${b}`;
        if (seen.has(k)) {
          rChanged = true;
          continue;
        }
        seen.add(k);
        rebuilt.push([a, b]);
      }
      if (rChanged || rebuilt.length !== hlEdges.length) {
        hlEdges = rebuilt;
        rChanged = true;
      }
    }

    if (!rChanged) return route;
    changed = true;
    return {
      ...route,
      ...(nodes ? { highlightNodes: nodes } : {}),
      ...(hlEdges ? { highlightEdges: hlEdges } : {}),
    };
  });

  return { routes: next, changed };
}

/**
 * Collapse mermaid + remap route highlights on a chapter.
 */
function collapseDuplicateSelectInChapter(chapter) {
  const strat = chapter?.strategy;
  if (!strat?.mermaid) {
    return { chapter, changed: false, aliases: [] };
  }
  const result = collapseDuplicateStrategySelect(strat.mermaid);
  if (!result.changed) {
    // Still rewrite stale highlights if aliases linger in routes only
    const ghostAliases = new Set();
    for (const route of strat.routes || []) {
      for (const id of route.highlightNodes || []) {
        if (SELECT_ID_RE.test(id) && id !== CANONICAL) ghostAliases.add(id);
      }
      for (const p of route.highlightEdges || []) {
        if (!Array.isArray(p) || p.length < 2) continue;
        if (SELECT_ID_RE.test(p[0]) && p[0] !== CANONICAL) ghostAliases.add(p[0]);
        if (SELECT_ID_RE.test(p[1]) && p[1] !== CANONICAL) ghostAliases.add(p[1]);
      }
    }
    // Only remap ghosts that match chooser label / known dead aliases in current body
    const liveAliases = findDuplicateSelectAliases(strat.mermaid);
    const toRemap = [...new Set([...ghostAliases].filter(id => {
      // If mermaid no longer has the alias, still rewrite highlights pointing at it
      // when label would have been a chooser (StrategySelect2/C/Challenge pattern)
      return /^(StrategySelect2|StrategySelectC|StrategySelectChallenge)$/i.test(id)
        || liveAliases.includes(id);
    }))];
    if (!toRemap.length) {
      return { chapter, changed: false, aliases: [] };
    }
    const remapped = remapSelectAliasHighlights(strat.routes, toRemap);
    if (!remapped.changed) {
      return { chapter, changed: false, aliases: toRemap };
    }
    return {
      chapter: {
        ...chapter,
        strategy: { ...strat, routes: remapped.routes },
      },
      changed: true,
      aliases: toRemap,
    };
  }

  const remapped = remapSelectAliasHighlights(strat.routes, result.aliases);
  return {
    chapter: {
      ...chapter,
      strategy: {
        ...strat,
        mermaid: result.mermaid,
        ...(remapped.routes ? { routes: remapped.routes } : {}),
      },
    },
    changed: true,
    aliases: result.aliases,
  };
}

/**
 * Audit helper: list StrategySelect* chooser hubs in a mermaid body.
 */
function auditDuplicateSelectHubs(mermaidBody) {
  const mm = String(mermaidBody || '');
  const labels = extractStrategyNodeLabels(mm);
  const edges = parseStrategyMermaidEdges(mm);
  const ids = [...collectSelectIds(mm)];
  const hubs = ids.map(id => ({
    id,
    label: labels.get(id) || '',
    ins: edges.filter(e => e.to === id).map(e => e.from),
    outs: edges.filter(e => e.from === id).map(e => `${e.label || ''}→${e.to}`),
  }));
  const aliases = findDuplicateSelectAliases(mm);
  return { hubs, aliases, duplicate: aliases.length > 0 };
}

module.exports = {
  CANONICAL,
  SELECT_LABEL_RE,
  collapseDuplicateStrategySelect,
  collapseDuplicateSelectInChapter,
  remapSelectAliasHighlights,
  findDuplicateSelectAliases,
  auditDuplicateSelectHubs,
  normalizeCanonicalSelectDefs,
};
