/**
 * Preferred-path Observe→Adjust copy: observation on edges, single-param adjust on nodes.
 */
const {
  parseStrategyMermaidEdges,
  extractStrategyNodeLabels,
} = require('../../shared/strategy-mermaid-parse.js');
const { sliderParamLabel } = require('../../generate/strategy-route-plan');
const { isMethodTrapLabel } = require('../../generate/strategy-route-plan');

const DUAL_PARAM_ADJUST_RE = /同时|二者|两个参数|两参|多参一起|\S+\s*或\s*\S+.*(?:增大|减小|调整|调)/i;
const OBSERVATION_EDGE_RE = /^偏近|偏远|偏高|偏低|未命中|不足|偏多|偏少|未达标|未进洞|偏差大|偏转|未击中$/;

function firstSliderLabel(gameHints) {
  const id = (gameHints?.sliderControlIds || [])[0];
  return id ? sliderParamLabel(id) : '该参数';
}

function repairAdjustNodeLabels(mermaidBody, gameHints, preferredOnly) {
  const nodeLabels = extractStrategyNodeLabels(mermaidBody);
  const param = firstSliderLabel(gameHints);
  const fixLabel = (id, label) => {
    if (!preferredOnly && /Invalid|误区|Trap/i.test(id)) return label;
    if (!DUAL_PARAM_ADJUST_RE.test(label)) return label;
    if (/偏差大|同时/.test(label)) {
      return `固定其余，只调${param}`;
    }
    return `只调${param}`;
  };

  let mm = mermaidBody;
  for (const [id, label] of nodeLabels) {
    if (!/Adjust|Tune|微调/i.test(id) && !/调整|微调|增大|减小/.test(label)) continue;
    const next = fixLabel(id, label);
    if (next === label) continue;
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    mm = mm.replace(new RegExp(`(${id}\\[[^\\]]*?)${escaped}([^\\]]*\\])`, 'g'), `$1${next}$2`);
    mm = mm.replace(new RegExp(`(${id}\\{[^}]*?)${escaped}([^}]*\\})`, 'g'), `$1${next}$2`);
  }
  return mm;
}

function repairObserveEdgeLabels(mermaidBody) {
  return mermaidBody.replace(
    /-->\s*\|([^|]+)\|/g,
    (full, label) => {
      const trimmed = label.trim();
      if (!/(增大|减小|调整|同时|或)/.test(trimmed)) return full;
      const obs = trimmed.replace(/(?:增大|减小|调整).*/g, '').trim();
      const short = OBSERVATION_EDGE_RE.test(obs)
        ? obs
        : (obs.match(/偏近|偏远|偏差大|未命中|不足|偏高|偏低/) || ['观察'])[0];
      return `-->|${short}|`;
    },
  );
}

function repairStrategyObserveAdjustCopy(chapter, gameHints) {
  const strat = chapter?.strategy;
  if (!strat?.mermaid) return chapter;

  let mermaid = repairObserveEdgeLabels(strat.mermaid);
  mermaid = repairAdjustNodeLabels(mermaid, gameHints, true);

  const routes = Array.isArray(strat.routes) ? strat.routes.map(r => {
    if (isMethodTrapLabel(`${r.id}${r.label}`) || r.tier === 'suboptimal') return r;
    return r;
  }) : strat.routes;

  return {
    ...chapter,
    strategy: { ...strat, mermaid, routes },
  };
}

module.exports = { repairStrategyObserveAdjustCopy };
