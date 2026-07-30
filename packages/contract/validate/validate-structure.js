const { VALID_GROUPS, VALID_LAYERS, VALID_LINK_TP } = require('../constants');
const { hasInvalidStrategyMermaidSyntax } = require('../../shared/strategy-mermaid-parse.js');
const { walkDt } = require('../graph/play-graph');

function validateChapter(chapter) {
  const errors = [];
  if (!chapter || typeof chapter !== 'object') {
    errors.push('chapter must be an object');
    return { ok: false, errors };
  }
  for (const key of ['mapping', 'kg', 'dt', 'winSync']) {
    if (chapter[key] == null) errors.push(`missing ${key}`);
  }
  if (typeof chapter.mapping !== 'string' || !chapter.mapping.trim()) {
    errors.push('mapping must be non-empty string');
  }

  const kg = chapter.kg;
  const nodes = kg?.nodes;
  const links = kg?.links;
  if (!Array.isArray(nodes) || nodes.length < 3) errors.push('kg.nodes need >= 3');
  if (!Array.isArray(links)) errors.push('kg.links must be array');

  const ids = new Set();
  if (Array.isArray(nodes)) {
    nodes.forEach(n => {
      if (!n.id) errors.push('node missing id');
      else ids.add(n.id);
      if (!VALID_LAYERS.has(n.layer)) errors.push(`node ${n.id}: invalid layer`);
      if (!VALID_GROUPS.has(n.group)) errors.push(`node ${n.id}: invalid group`);
      if (/^O\d/.test(n.id) && n.group !== 'operation') errors.push(`node ${n.id}: O* must be operation`);
      if (/^O\d/.test(n.id) && n.layer !== 'play') errors.push(`node ${n.id}: O* must be play layer`);
    });

    const playOps = nodes.filter(n => n.group === 'operation' && n.layer === 'play');
    const playConstraints = nodes.filter(n => n.group === 'constraint' && n.layer === 'play');
    const result = nodes.find(n => n.id === 'R1' || (n.group === 'result' && n.layer === 'play'));
    if (!playOps.length) errors.push('play layer needs at least one operation node');
    if (!playConstraints.length) errors.push('play layer needs constraint nodes');
    if (!result) errors.push('play layer needs result node (R1)');

    if (nodes.length > 25) errors.push('too many nodes �?avoid enumerating slider combinations');
  }

  if (Array.isArray(links)) {
    links.forEach((l, i) => {
      if (!VALID_LINK_TP.has(l.tp)) errors.push(`link ${i}: invalid tp`);
      if (!ids.has(l.s) || !ids.has(l.t)) errors.push(`link ${i}: invalid s/t reference`);
    });
    const irrelevant = nodes.filter(n => n.group === 'irrelevant');
    irrelevant.forEach(n => {
      const out = links.filter(l => l.s === n.id);
      if (out.length > 0) errors.push(`irrelevant node ${n.id} should be isolated (no outgoing links)`);
    });
  }

  const tree = chapter.dt?.tree;
  if (!tree) errors.push('dt.tree missing');
  else {
    let results = 0, retries = 0, decisions = 0;
    walkDt(tree, n => {
      if (n.t === 'result') results++;
      if (n.t === 'retry') retries++;
      if (n.t === 'decision') {
        decisions++;
        (n.children || []).forEach(c => {
          if (c._e == null || c._e === '') errors.push(`decision "${n.n}" child missing _e`);
        });
      }
    });
    if (results < 1) errors.push('dt needs at least 1 result');
    if (retries < 1) errors.push('dt needs at least 1 retry branch');
    if (decisions < 1) errors.push('dt needs at least 1 decision');
  }

  if (!chapter.winSync?.title) errors.push('winSync.title missing');

  const traceMap = chapter.traceMap;
  if (!traceMap || typeof traceMap !== 'object') {
    errors.push('traceMap missing');
  } else {
    const controls = traceMap.controls;
    if (!controls || typeof controls !== 'object' || !Object.keys(controls).length) {
      errors.push('traceMap.controls must be non-empty object');
    } else if (Array.isArray(nodes)) {
      Object.entries(controls).forEach(([ctrl, spec]) => {
        if (!spec?.kgId || !ids.has(spec.kgId)) {
          errors.push(`traceMap.controls.${ctrl}: invalid kgId ${spec?.kgId}`);
        }
        if (!['operation', 'irrelevant'].includes(spec?.role)) {
          errors.push(`traceMap.controls.${ctrl}: invalid role`);
        }
      });
    }
    const legacy = traceMap.legacyTypes;
    if (legacy != null && typeof legacy !== 'object') {
      errors.push('traceMap.legacyTypes must be object when present');
    }
  }

  const strat = chapter.strategy;
  if (strat != null && typeof strat === 'object') {
    if (!strat.mermaid || !String(strat.mermaid).trim()) {
      errors.push('strategy.mermaid missing or empty');
    } else if (hasInvalidStrategyMermaidSyntax(strat.mermaid)) {
      errors.push(
        'strategy.mermaid: invalid syntax (:::class placement or unquoted ()/: in labels �?use Node["label"]:::stratClass then newline NodeId --> target)',
      );
    }
    if (!Array.isArray(strat.routes)) errors.push('strategy.routes must be array');
    else {
      strat.routes.forEach((r, i) => {
        if (!r?.id) errors.push(`strategy.routes[${i}]: missing id`);
        if (!r?.label) errors.push(`strategy.routes[${i}]: missing label`);
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { validateChapter };
