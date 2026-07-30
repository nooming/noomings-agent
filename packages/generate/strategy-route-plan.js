const TRAP_WARN = '同时调节多个滑条效率低、难归因，不如每次只动一个变量';
const MAIN_WARN = '每次只改一个参数，避免多变量混调难归因';

/** Short labels for StrategySelect |path| edges and routes[].label (≤28 chars). */
const MAIN_METHOD_LABEL = '控制变量：每次只改一项';
const TRAP_METHOD_LABEL = '多参盲调';

/** Canonical mermaid entry ids — prefer Route_main / Route_main_s_* / Trap, never Route1..N parallel stubs. */
const ENTRY_IDS = ['Route_main', 'Trap'];

const LEGACY_MAIN_LABEL_RE = /控制变量法|固定其余滑条|观察反馈再迭代|单变量·|观察反馈法/i;
const METHOD_MAIN_RE = /控制变量|每次只改|单变量|迭代调参/i;
const METHOD_TRAP_RE = /盲调|多滑|多参|^trap$/i;

function sliderCount(gameHints) {
  return gameHints?.variableKindSummary?.sliderCount
    ?? (gameHints?.sliderControlIds || []).length;
}

function sliderParamLabel(controlId) {
  const id = String(controlId || '');
  const m = id.match(/^input[-_](.+)$/i);
  if (m) return m[1];
  return id.replace(/^input/i, '') || id;
}

function buildControlVarLabel(_gameHints) {
  return MAIN_METHOD_LABEL;
}

function defaultMapsTo(chapter) {
  const nodes = chapter?.kg?.nodes || [];
  const play = nodes.filter(n => n.layer === 'play');
  const ids = ['P1'];
  const o = play.find(n => n.group === 'operation');
  if (o) ids.push(o.id);
  play.filter(n => n.group === 'constraint').slice(0, 2).forEach(n => ids.push(n.id));
  const r = play.find(n => n.group === 'result');
  if (r) ids.push(r.id);
  const out = [...new Set(ids)];
  return out.length >= 2 ? out : ['P1', 'O1', 'C1', 'R1'];
}

/** Preferred single-var scores by priorityRank; trap always lowest. */
const ROUTE_SCORE_BY_RANK = { 1: 1.0, 2: 0.85, 3: 0.7, 4: 0.55 };
const ROUTE_TRAP_SCORE = 0.2;
/** Confound probe side-branch — below trap; never gets priorityRank. */
const ROUTE_CONFOUND_PROBE_SCORE = 0.15;
const CONFOUND_PROBE_WARN = '拧混淆量通常无增益，应回到单变量主路径；勿抬成高优策略';

function buildConfoundProbePlanRoutes(chapter) {
  const cvs = chapter?.inquiryScript?.confoundingVariables || [];
  const primary = cvs.find(c => c && (c.label || c.controlId));
  if (!primary) return [];
  const short = String(primary.label || primary.controlId || '混淆量')
    .replace(/极板/g, '')
    .slice(0, 12) || '混淆量';
  const id = `confound_${primary.controlId || primary.id || 'cv1'}`.replace(/[^A-Za-z0-9_]/g, '_');
  return [{
    id,
    label: `试探混淆·${short}`,
    tier: 'suboptimal',
    kind: 'confoundProbe',
    mapsTo: [],
    warn: CONFOUND_PROBE_WARN,
    score: ROUTE_CONFOUND_PROBE_SCORE,
    weight: ROUTE_CONFOUND_PROBE_SCORE,
    highlightNodes: ['StrategySelect', 'ProbeCV', 'ObserveCV', 'BackFromCV'],
    highlightEdges: [
      ['StrategySelect', 'ProbeCV'],
      ['ProbeCV', 'ObserveCV'],
      ['ObserveCV', 'BackFromCV'],
      ['BackFromCV', 'StrategySelect'],
    ],
  }];
}

function makeRoute(id, label, tier, mapsTo, warn = '', scoreFields = {}) {
  const score = scoreFields.score != null
    ? scoreFields.score
    : (tier === 'suboptimal' ? ROUTE_TRAP_SCORE : 0.75);
  return {
    id,
    label,
    tier,
    mapsTo: [...mapsTo],
    warn,
    score,
    weight: scoreFields.weight != null ? scoreFields.weight : score,
    ...(scoreFields.priorityRank != null ? { priorityRank: scoreFields.priorityRank } : {}),
    highlightNodes: ['Start', 'StrategySelect'],
    highlightEdges: [],
  };
}

function parseStrategySelectEdgeLabels(mermaidBody) {
  const mm = String(mermaidBody || '');
  const labels = [];
  const re = /StrategySelect[^-\n]*-->\s*\|([^|]+)\|/gi;
  let m;
  while ((m = re.exec(mm)) !== null) {
    const lab = m[1].trim();
    if (lab) labels.push(lab);
  }
  return labels;
}

function isMethodMainLabel(label) {
  return METHOD_MAIN_RE.test(String(label || ''));
}

function isMethodTrapLabel(label) {
  return METHOD_TRAP_RE.test(String(label || ''));
}

function isEnvRouteLabel(label, id = '') {
  return /env|环境|模式|开态|关态|阻力|星球/i.test(`${id}${label}`);
}

function isLegacyRedundantPreferred(route) {
  const id = String(route?.id || '');
  const label = String(route?.label || '');
  // Keep distinct per-AV tactic paths (单变量·{label}) — never treat as legacy synonym.
  if (/单变量·/.test(label)) return false;
  if (id === 'main_observe' || /观察反馈法/.test(label)) return true;
  if (/^main_/i.test(id) && id !== 'main' && isMethodMainLabel(label)) return true;
  if (LEGACY_MAIN_LABEL_RE.test(label) && label.length > MAIN_METHOD_LABEL.length + 8) return true;
  return false;
}

/**
 * Distinct semantic macro routes: method (main+trap) + env + tactic paths with StrategySelect edges.
 */
function countSemanticStrategyRoutes(chapter, gameHints) {
  const routes = Array.isArray(chapter?.strategy?.routes) ? chapter.strategy.routes : [];
  const mm = String(chapter?.strategy?.mermaid || '');
  const selectLabels = parseStrategySelectEdgeLabels(mm);

  let hasMain = false;
  let hasTrap = false;
  const tacticLabels = new Set();
  const envLabels = new Set();

  for (const r of routes) {
    if (isLegacyRedundantPreferred(r)) continue;
    const label = r.label || '';
    const id = r.id || '';
    if (r.warn === 'irrelevant') continue;
    if (isMethodTrapLabel(`${id}${label}`) || r.tier === 'suboptimal') {
      hasTrap = true;
      continue;
    }
    if (isEnvRouteLabel(label, id)) {
      envLabels.add(label || id);
      continue;
    }
    // Distinct 单变量·{name} routes count as separate tactic paths (not one collapsed main).
    if (/单变量·/.test(label)) {
      tacticLabels.add(label);
      continue;
    }
    if (isMethodMainLabel(label) || id === 'main') {
      hasMain = true;
      continue;
    }
    if (label) tacticLabels.add(label);
  }

  for (const lab of selectLabels) {
    if (isMethodTrapLabel(lab)) hasTrap = true;
    else if (/单变量·/.test(lab)) tacticLabels.add(lab);
    else if (isMethodMainLabel(lab)) hasMain = true;
    else if (isEnvRouteLabel(lab)) envLabels.add(lab);
    else tacticLabels.add(lab);
  }

  if (!hasMain && tacticLabels.size === 0 && sliderCount(gameHints) >= 1) hasMain = true;
  if (!hasTrap && sliderCount(gameHints) >= 2) hasTrap = true;

  return (hasMain ? 1 : 0) + (hasTrap ? 1 : 0) + envLabels.size + tacticLabels.size;
}

function getRankedAdjustmentVariables(gameHints, chapter) {
  const avs = chapter?.inquiryScript?.adjustmentVariables
    || gameHints?.analyzeParse?.inquiryScript?.adjustmentVariables
    || [];
  const cvs = chapter?.inquiryScript?.confoundingVariables
    || gameHints?.analyzeParse?.inquiryScript?.confoundingVariables
    || [];
  const cvIds = new Set(cvs.map(c => c.controlId).filter(Boolean));
  return [...avs]
    .filter(a => a && (a.priorityRank != null || a.controlId))
    .filter(a => !(a.controlId && cvIds.has(a.controlId)))
    .filter(a => !/^(?:s-|in-)?mass\d*$/i.test(String(a.controlId || ''))
      || /momentum|碰撞|质量[12]/.test(`${chapter?.kg?.title || ''}${a.label || ''}`))
    .sort((a, b) => (a.priorityRank ?? 99) - (b.priorityRank ?? 99));
}

function buildPerAvStrategyRoutes(gameHints, chapter = null) {
  const ranked = getRankedAdjustmentVariables(gameHints, chapter);
  if (ranked.length < 2) return null;
  const mapsTo = defaultMapsTo(chapter);
  const routes = ranked.map((av, i) => {
    const label = `单变量·${av.label || sliderParamLabel(av.controlId)}`;
    const rank = av.priorityRank ?? (i + 1);
    const score = ROUTE_SCORE_BY_RANK[rank] ?? Math.max(0.35, 0.75 - i * 0.15);
    return makeRoute(
      i === 0 ? 'main' : `main_${av.controlId || av.id}`,
      label,
      'preferred',
      mapsTo,
      MAIN_WARN,
      { score, weight: score, priorityRank: rank },
    );
  });
  routes.push(makeRoute(
    'trap',
    TRAP_METHOD_LABEL,
    'suboptimal',
    mapsTo.filter(id => id !== 'R1'),
    TRAP_WARN,
    { score: ROUTE_TRAP_SCORE, weight: ROUTE_TRAP_SCORE },
  ));
  const confoundRoutes = buildConfoundProbePlanRoutes(chapter);
  routes.push(...confoundRoutes);
  return {
    routes,
    mermaidHints: {
      strategySelectLabels: routes.map(r => r.label),
      perRouteEntryIds: routes.map((r, i) => {
        if (r?.kind === 'confoundProbe') return 'ProbeCV';
        if (r?.id === 'trap' || /盲调|多参/.test(r?.label || '')) return 'Trap';
        if (i === 0) return 'Route_main';
        const slug = String(r.id || '')
          .replace(/^main_?/, '')
          .replace(/[^A-Za-z0-9_]/g, '_') || `av${i}`;
        return `Route_main_s_${slug}`;
      }),
      confoundProbeLabels: confoundRoutes.map(r => r.label),
    },
  };
}

/**
 * @param {object} gameHints
 * @param {object} [chapter] optional for mapsTo from KG
 * @param {object} [analyzeParse] optional three-step parse
 */
function buildStrategyRoutePlan(gameHints, chapter = null, analyzeParse = null) {
  const hints = analyzeParse ? { ...gameHints, analyzeParse } : gameHints;
  const perAv = buildPerAvStrategyRoutes(hints, chapter);
  if (perAv) return perAv;

  const n = sliderCount(gameHints);
  const mapsTo = defaultMapsTo(chapter);

  if (n <= 1) {
    const routes = [makeRoute('main', MAIN_METHOD_LABEL, 'preferred', mapsTo, '')];
    return {
      routes,
      mermaidHints: {
        strategySelectLabels: [MAIN_METHOD_LABEL],
        perRouteEntryIds: ['Route_main'],
      },
    };
  }

  const routes = [
    makeRoute('main', MAIN_METHOD_LABEL, 'preferred', mapsTo, MAIN_WARN),
    makeRoute('trap', TRAP_METHOD_LABEL, 'suboptimal', mapsTo.filter(id => id !== 'R1'), TRAP_WARN),
  ];
  const confoundRoutes = buildConfoundProbePlanRoutes(chapter);
  routes.push(...confoundRoutes);

  const labels = routes.map(r => r.label);
  return {
    routes,
    mermaidHints: {
      strategySelectLabels: labels,
      perRouteEntryIds: [
        ...ENTRY_IDS.slice(0, 2),
        ...confoundRoutes.map(() => 'ProbeCV'),
      ].slice(0, labels.length),
      confoundProbeLabels: confoundRoutes.map(r => r.label),
    },
  };
}

function formatStrategyRoutePlanForPrompt(plan) {
  if (!plan?.routes?.length) return '';
  return [
    '## 须写入 strategy 的 routes 草案（id/label/warn 须一致）',
    'label 须简短（≤28 字），禁止 DOM id；Observe 边只写偏近/偏远等观察词，Adjust 每次只改一个参数',
    JSON.stringify(plan.routes.map(r => ({
      id: r.id,
      label: r.label,
      tier: r.tier,
      warn: r.warn || '',
      score: r.score,
      weight: r.weight,
      priorityRank: r.priorityRank,
      mapsTo: r.mapsTo,
    })), null, 2),
    'strategy.mermaid 须有 StrategySelect{选择调参策略?}:::stratCond 与 |途径| 边，标签与上述 label 一致；trap 途径 highlightNodes 勿含 Win；多参盲调仅 Trap 一盒再进 Fire，勿 TrapStrat/AdjustBoth 近义链。',
    '入口节点命名须统一：Route_main / Route_main_s_{av} 或 *Strat；禁止同时生成 Route1..N 与 Route_main_* 双骨架；勿留未接 StrategySelect 的 RouteN/TuneN 残桩。',
    '多 AV 时各「单变量·」route 的 score/weight 须按 priorityRank 分档（高优更高，trap 最低），禁止全相同。',
  ].join('\n');
}

function buildStrategySelectPromptSection(gameHints, analyzeParse = null) {
  if (sliderCount(gameHints) < 2) return '';
  const plan = buildStrategyRoutePlan(gameHints, null, analyzeParse);
  const labels = plan.mermaidHints.strategySelectLabels.join('、');
  const perAvHint = getRankedAdjustmentVariables(
    analyzeParse ? { analyzeParse } : gameHints,
  ).length >= 2
    ? '；多 AV 须为每个 adjustmentVariable 写「单变量·{label}」独立 route（按 priorityRank）'
    : '';
  return [
    '## Strategy 控制变量优途径（多滑条硬约束）',
    '- 须有 StrategySelect{选择调参策略?}:::stratCond',
    `- |途径| 边须覆盖：${labels}（控制变量 + 多参盲调${plan.mermaidHints?.confoundProbeLabels?.length ? ' + 试探混淆旁路' : ''}）${perAvHint}`,
    '- 若有 confoundingVariables：须加 StrategySelect -.->|试探混淆·{label}| ProbeCV:::stratInvalid → 观察无增益 → 回到 StrategySelect；routes 增加 kind=confoundProbe 低分（≤0.15），禁止 priorityRank',
    '- 每条途径独立 Adjust↔Fire↔Observe 子链，禁止多途径共用 Fire/Observe hub',
    '- 多参盲调扇出须为单节点：StrategySelect -->|多参盲调| Trap[多参盲调] --> Fire（或 Observe 环入口）；禁止 Trap→TrapStrat→AdjustBoth / Trap→AdjustMulti 近义多跳',
    '- 单变量入口统一用 Route_main / Route_main_s_*（或 HeightStrat 等 *Strat）；禁止再画一套 Route1→Adjust1…RouteN 平行残桩',
    '- Observe→Adjust：边上只写观察结论；Adjust 禁止「A 或 B」「同时调 A 和 B」',
    '- routes[] 的 id/label/warn 与 routes 草案一致；多参盲调须填 warn',
    '- mapsTo[] 顺序须与 KG play 链一致（P1→环境约束→O1→结果约束→R1），供「在事理图谱中查看」',
    formatStrategyRoutePlanForPrompt(plan),
  ].join('\n');
}

module.exports = {
  buildStrategyRoutePlan,
  buildPerAvStrategyRoutes,
  getRankedAdjustmentVariables,
  buildControlVarLabel,
  formatStrategyRoutePlanForPrompt,
  buildStrategySelectPromptSection,
  sliderParamLabel,
  countSemanticStrategyRoutes,
  parseStrategySelectEdgeLabels,
  isMethodMainLabel,
  isMethodTrapLabel,
  isLegacyRedundantPreferred,
  MAIN_METHOD_LABEL,
  TRAP_METHOD_LABEL,
  ROUTE_CONFOUND_PROBE_SCORE,
  CONFOUND_PROBE_WARN,
  LEGACY_MAIN_LABEL_RE,
  TRAP_WARN,
  MAIN_WARN,
  ROUTE_SCORE_BY_RANK,
  ROUTE_TRAP_SCORE,
};
