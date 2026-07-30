/** 评判 bundle 契约字段：inquiryProfile（仅 generic） */

const { VALID_GROUPS, TEACH_GROUP_ALIASES, TEACH_DEFAULT_GROUP } = require('../constants');
const { applyStrategyMermaidSanitize } = require('../strategy/strategy-sanitize');
const { compactStrategyMacroGraph } = require('../strategy/strategy-compact');
const { repairStrategyRouteHighlights } = require('../repair/strategy-route-repair');
const { repairStrategyConfoundVisual } = require('../repair/strategy-confound-visual-repair');
const { ensureTraceMap } = require('../graph/trace-map');
const { normalizeDtBranchPolarity } = require('../repair/dt-branch-normalize');
const { repairCoupledChapter } = require('../repair/coupled-strategy-repair');
const { repairChapterScope } = require('../repair/scope-repair');
const { repairSingleVariableStrategyRoutes } = require('../repair/strategy-single-var-repair');
const { repairStrategyMapsToFromKg } = require('../repair/strategy-mapsTo-repair');
const { repairDtOperationStep, repairDtRetryToOperation } = require('../repair/dt-branch-normalize');
const { repairMinStrategyRoutes } = require('../repair/strategy-min-routes-repair');
const { repairStrategyObserveAdjustCopy } = require('../repair/strategy-observe-adjust-repair');
const { backfillInquiryScript } = require('./inquiry-script-backfill');
const { buildPhysicsModel } = require('./physics-model');
const { sanitizeInquiryScriptChapter } = require('../repair/inquiry-script-sanitize');
const { repairStrategyRouteScores } = require('../repair/strategy-route-score-repair');
const { mergeAnalyzeParseIntoChapter } = require('../../generate/analyze-three-step');
const { buildGameSpec, inferSimHints } = require('../../generate/game-spec');
const { buildTelemetrySpec } = require('../../generate/telemetry-spec');

const ALLOWED_PROFILES = new Set(['generic']);

function inferInquiryProfile(chapter, _gameHints) {
  const p = chapter?.inquiryProfile;
  if (p && ALLOWED_PROFILES.has(p)) return p;
  return 'generic';
}

function defaultKgNodeRadius(node) {
  const n = Number(node?.r);
  if (Number.isFinite(n) && n > 0) return n;
  return node?.group === 'irrelevant' ? 18 : 22;
}

function enrichKgNodeRadii(kg) {
  if (!kg?.nodes || !Array.isArray(kg.nodes)) return kg;
  return {
    ...kg,
    nodes: kg.nodes.map(node => ({ ...node, r: defaultKgNodeRadius(node) })),
  };
}

/**
 * LLM 常把 layer=teach 的 S* 写成 group=teach；归一化为 core。 */
function normalizeKgTeachGroups(kg) {
  if (!kg?.nodes || !Array.isArray(kg.nodes)) return kg;
  return {
    ...kg,
    nodes: kg.nodes.map(node => {
      if (node.layer !== 'teach') return node;
      const g = String(node.group || '').trim();
      if (VALID_GROUPS.has(g)) return node;
      if (TEACH_GROUP_ALIASES.has(g) || !g) {
        return { ...node, group: TEACH_DEFAULT_GROUP };
      }
      return { ...node, group: TEACH_DEFAULT_GROUP };
    }),
  };
}

/**
 * 按 group 规则修正 link tp，与具体游戏无关。 */
function normalizeKgLinkTypes(kg) {
  if (!kg?.links || !Array.isArray(kg.links)) return kg;
  const nodeById = new Map((kg.nodes || []).map(n => [n.id, n]));
  const links = kg.links.map(link => {
    const s = nodeById.get(link.s);
    const t = nodeById.get(link.t);
    if (!s || !t) return link;
    let tp = link.tp;
    if (s.layer === 'play' && t.layer === 'play') {
      if ((s.group === 'premise' || s.group === 'operation') && t.group === 'constraint' && tp !== 'premise') {
        tp = 'premise';
      }
      if (s.group === 'constraint' && t.group === 'result' && tp === 'premise') {
        tp = 'core';
      }
    }
    if (
      s.layer === 'teach'
      && (s.group === 'core' || s.group === 'method')
      && t.group === 'operation'
      && t.layer === 'play'
    ) {
      const alreadyVerify = kg.links.some(l => l.s === link.s && l.t === link.t && l.tp === 'verify');
      if (!alreadyVerify && tp !== 'verify') tp = 'verify';
    }
    return tp === link.tp ? link : { ...link, tp };
  });
  return { ...kg, links };
}

function enrichDtTree(dt) {
  if (!dt?.tree) return dt;
  return { ...dt, tree: normalizeDtBranchPolarity(dt.tree) };
}

function enrichChapterContract(chapter, gameHints, sources) {
  if (!chapter || typeof chapter !== 'object') return chapter;
  let base = applyStrategyMermaidSanitize(ensureTraceMap(chapter, gameHints, sources));
  base = repairSingleVariableStrategyRoutes(base, gameHints);
  base = compactStrategyMacroGraph(base, gameHints);
  base = repairMinStrategyRoutes(base, gameHints);
  base = applyStrategyMermaidSanitize(base);
  const inquiryProfile = inferInquiryProfile(base, gameHints);
  let kg = enrichKgNodeRadii(normalizeKgTeachGroups(base.kg));
  kg = normalizeKgLinkTypes(kg);
  const dt = base.dt ? enrichDtTree(base.dt) : base.dt;
  let result = {
    ...base,
    inquiryProfile,
    ...(kg ? { kg } : {}),
    ...(dt ? { dt } : {}),
  };
  result = repairCoupledChapter(result, gameHints);
  result = repairChapterScope(result, gameHints);
  result = repairDtOperationStep(result);
  result = repairDtRetryToOperation(result, gameHints);
  if (result.kg) {
    result = { ...result, kg: normalizeKgLinkTypes(result.kg) };
  }
  result = repairStrategyMapsToFromKg(result, gameHints);
  result = repairStrategyObserveAdjustCopy(result, gameHints);
  result = repairStrategyConfoundVisual(result);
  result = repairStrategyRouteHighlights(result);
  result = applyStrategyMermaidSanitize(result);
  result = backfillInquiryScript(result, gameHints);
  if (gameHints?.analyzeParse) {
    result = mergeAnalyzeParseIntoChapter(result, gameHints.analyzeParse);
  }
  // Deterministic post-sanitize: formulas / OV / hollow labels / AV semantics / narrative
  result = sanitizeInquiryScriptChapter(result, gameHints);
  result = repairStrategyRouteScores(result, gameHints);
  const generationMode = gameHints?.designMode ? 'design' : 'analyze';
  // Re-build physicsModel from cleaned inquiryScript; never re-merge dirty scrape cores
  const physicsModel = buildPhysicsModel(
    result.inquiryScript,
    {
      ...(result.physicsModel || {}),
      formulas: result.physicsModel?.formulas || [],
      core: result.physicsModel?.core
        ? { ...result.physicsModel.core, formulas: result.physicsModel.formulas || [] }
        : undefined,
    },
  );
  const enrichedHints = {
    ...gameHints,
    needsContinuousSim: gameHints?.needsContinuousSim
      || !!inferSimHints(result)?.needsContinuousSim,
  };
  result = {
    ...result,
    physicsModel,
    gameSpec: buildGameSpec(result, enrichedHints),
    telemetrySpec: result.telemetrySpec || buildTelemetrySpec(result),
    meta: {
      ...(result.meta && typeof result.meta === 'object' ? result.meta : {}),
      generationMode,
    },
  };
  return result;
}

module.exports = {
  enrichChapterContract,
  inferInquiryProfile,
  normalizeKgTeachGroups,
  normalizeKgLinkTypes,
};
