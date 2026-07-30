/**
 * Deterministic repair for projectile-basic / multi-kp / capacitor-era-ch1
 * so quality gates pass, then re-export 图谱.html.
 */
const fs = require('fs');
const path = require('path');
const { extractGameHints } = require('../../packages/generate/hints');
const { runAnalyzeThreeStep } = require('../../packages/generate/analyze-three-step');
const { enrichChapterContract } = require('../../packages/contract/enrich');
const { validateChapter, validateChapterQuality } = require('../../packages/contract');
const { buildStandaloneGraphHtml } = require('../../packages/generate/export/export-standalone-html');
const { repairSingleVariableStrategyRoutes } = require('../../packages/contract/repair/strategy-single-var-repair');
const { repairStrategyRouteHighlights } = require('../../packages/contract/repair/strategy-route-repair');
const { repairStrategyMapsToFromKg } = require('../../packages/contract/repair/strategy-mapsTo-repair');
const { MAIN_WARN, TRAP_WARN, ROUTE_SCORE_BY_RANK, ROUTE_TRAP_SCORE } = require('../../packages/generate/strategy-route-plan');
const { orderedPlayPathIds } = require('../../packages/contract/graph/play-graph');
const { sanitizeInquiryScriptChapter } = require('../../packages/contract/repair/inquiry-script-sanitize');
const { repairStrategyRouteScores } = require('../../packages/contract/repair/strategy-route-score-repair');

const ROOT = path.resolve(__dirname, '../..');
const PKG = path.join(ROOT, 'data/runtime/packages');
const JS_DIR = path.join(ROOT, 'apps/web/viewer/js');
const SHARED_DIR = path.join(ROOT, 'packages/shared');

const SAMPLE_MAP = {
  'projectile-basic': { dir: '斜抛', game: '斜抛.html' },
  'multi-kp': { dir: '机械能', game: '机械能.html' },
  'capacitor-era-ch1': { dir: '电容_介质与击穿', game: '电容_介质与击穿.html' },
};

function loadViewerAssets() {
  const viewerJs = [
    fs.readFileSync(path.join(JS_DIR, 'strategy-mermaid-theme.js'), 'utf8'),
    fs.readFileSync(path.join(SHARED_DIR, 'strategy-mermaid-parse.js'), 'utf8'),
    fs.readFileSync(path.join(SHARED_DIR, 'strategy-priority-mermaid.js'), 'utf8'),
    fs.readFileSync(path.join(JS_DIR, 'viewer.js'), 'utf8'),
  ].join('\n');
  const graphCss = fs.readFileSync(path.join(JS_DIR, 'graph-shell.css'), 'utf8');
  return { viewerJs, graphCss };
}

function walkDt(node, fn) {
  if (!node) return;
  fn(node);
  (node.children || []).forEach(c => walkDt(c, fn));
}

function defaultMapsTo(chapter) {
  const nodes = chapter?.kg?.nodes || [];
  const links = chapter?.kg?.links || [];
  const playPath = orderedPlayPathIds(nodes, links);
  if (playPath.length >= 2) return playPath;
  const play = nodes.filter(n => n.layer === 'play');
  const ids = ['P1'];
  const o = play.find(n => n.group === 'operation');
  if (o) ids.push(o.id);
  play.filter(n => n.group === 'constraint').forEach(n => ids.push(n.id));
  const r = play.find(n => n.group === 'result');
  if (r) ids.push(r.id);
  return [...new Set(ids)];
}

function makeRoute(id, label, mapsTo, opts = {}) {
  const rank = opts.priorityRank;
  const score = opts.trap
    ? ROUTE_TRAP_SCORE
    : (opts.score != null
      ? opts.score
      : (rank != null ? (ROUTE_SCORE_BY_RANK[rank] ?? 0.75) : 0.75));
  return {
    id,
    label,
    mapsTo: opts.trap ? mapsTo.filter(x => x !== 'R1') : [...mapsTo],
    warn: opts.trap ? TRAP_WARN : MAIN_WARN,
    score,
    weight: score,
    ...(rank != null && !opts.trap ? { priorityRank: rank } : {}),
    highlightNodes: opts.highlightNodes || ['Start', 'StrategySelect'],
    highlightEdges: opts.highlightEdges || [],
    highlightFailureBranches: true,
    ...(opts.trap ? { tier: 'suboptimal' } : {}),
  };
}

function ensureIrrelevantNode(chapter, id, label, desc) {
  const nodes = chapter.kg.nodes || [];
  if (nodes.some(n => n.id === id || n.label === label)) return chapter;
  return {
    ...chapter,
    kg: {
      ...chapter.kg,
      nodes: [
        ...nodes,
        {
          id,
          label,
          group: 'irrelevant',
          layer: 'play',
          level: 0,
          r: 18,
          desc,
        },
      ],
    },
  };
}

function patchConstraintLabels(chapter, renames) {
  const nodes = (chapter.kg.nodes || []).map(n => {
    if (n.group !== 'constraint') return n;
    const next = renames[n.id] || renames[n.label];
    return next ? { ...n, label: next } : n;
  });
  return { ...chapter, kg: { ...chapter.kg, nodes } };
}

function fixDtPolarity(chapter, fixes) {
  const tree = JSON.parse(JSON.stringify(chapter.dt.tree));
  walkDt(tree, node => {
    const fix = fixes.find(f => f.match.test(String(node.n || '')));
    if (!fix || node.t !== 'decision') return;
    if (fix.rename) node.n = fix.rename;
    if (fix.swapYesNo) {
      node.children = (node.children || []).map(c => {
        if (c._e === '是') return { ...c, _e: '否' };
        if (c._e === '否') return { ...c, _e: '是' };
        return c;
      });
    }
    if (fix.setBranches) {
      node.children = fix.setBranches(node.children || []);
    }
  });
  return { ...chapter, dt: { ...chapter.dt, tree } };
}

function repairProjectile(chapter) {
  let ch = { ...chapter };
  ch = ensureIrrelevantNode(ch, 'I1', '小球质量', 's-mass 只改绘制半径，不参与运动学');
  ch.inquiryScript = {
    ...(ch.inquiryScript || {}),
    summary: ch.kg?.title || '斜抛运动',
    knowledgePoints: [
      {
        id: 'KP1',
        label: '斜抛射程与高度',
        formulas: ['R = (v0² · sin(2θ)) / g'],
        mapsToKg: ['S1'],
      },
    ],
    adjustmentVariables: [
      {
        id: 'AV1', controlId: 's-speed', label: '初速度', symbol: 'v0', role: 'primary',
        priorityRank: 1, monotonicity: 'monotone', affects: ['R', 'H'],
        notes: 'v0 优先单变量：单调抬高射程', mapsToKg: 'O1',
      },
      {
        id: 'AV2', controlId: 's-height', label: '发射高度', symbol: 'h', role: 'secondary',
        priorityRank: 2, monotonicity: 'monotone', affects: ['R', 'H'],
        notes: '发射高度单调影响落点，弱于 v0', mapsToKg: 'O1',
      },
      {
        id: 'AV3', controlId: 's-angle', label: '发射角度', symbol: 'θ', role: 'secondary',
        priorityRank: 3, monotonicity: 'non-monotone', affects: ['R', 'H'],
        notes: 'θ 对射程非单调（约 45° 峰值），与 v0/h 不等价', mapsToKg: 'O1',
      },
    ],
    confoundingVariables: [
      { id: 'CV1', controlId: 's-mass', label: '质量', reason: '混淆变量：不影响弹道' },
    ],
    outputVariables: [
      { id: 'OV1', label: '射程', symbol: 'R', unit: 'm', role: 'primary', mapsToKg: 'R1', source: 'formula' },
      { id: 'OV2', label: '最大高度', symbol: 'H', unit: 'm', role: 'secondary', mapsToKg: 'R1', source: 'formula' },
    ],
    inquiryFlow: ['KP1', 'AV1', 'AV2', 'AV3', 'CV1'],
    narrative: {
      intro: '观察落点远近与轨迹高低，弄清初速度、高度、角度各自如何改变现象；每次只改一项。',
      steps: [
        { order: 1, title: '明确探究焦点', body: '关注落点偏近/偏远与轨迹高低（现象，勿先背公式）。', mapsToKg: ['S1'] },
        { order: 2, title: '识别调节变量', body: '可调节：初速度、发射高度、发射角度；控制变量法，每次只改一项。θ 与 v0/h 不等价（非单调）。', mapsToKg: ['O1'] },
        { order: 3, title: '识别混淆变量', body: '混淆项：质量（不影响弹道）', mapsToKg: ['I1'] },
        { order: 4, title: '观察—调整—再测', body: '操作后观察射程与最大高度；未命中则只微调一个调节变量并重复。', mapsToKg: ['O1'] },
      ],
    },
  };
  // O1 real label
  ch.kg = {
    ...ch.kg,
    nodes: (ch.kg.nodes || []).map(n =>
      (n.id === 'O1' || n.group === 'operation')
        ? { ...n, label: '调节初速度/高度/角度' }
        : n),
  };
  ch.traceMap = {
    ...(ch.traceMap || {}),
    controls: {
      ...(ch.traceMap?.controls || {}),
      's-speed': { kgId: 'O1', role: 'operation' },
      's-height': { kgId: 'O1', role: 'operation' },
      's-angle': { kgId: 'O1', role: 'operation' },
      's-mass': { kgId: 'I1', role: 'irrelevant' },
      modeSelect: { kgId: 'C1', role: 'operation' },
      btnLaunch: { kgId: 'O1', role: 'operation' },
    },
  };

  ch.strategy = {
    ...ch.strategy,
    mermaid: [
      'graph TD',
      'Start([开始探究/挑战]):::stratStart --> Env{选择模式?}:::stratCond',
      'Env -->|探究模式| Explore[自由探究]',
      'Env -->|挑战模式| Challenge[靶心挑战]',
      'Explore --> StrategySelect{选择调参策略?}:::stratCond',
      'Challenge --> StrategySelect',
      'StrategySelect -->|单变量·初速度| SpeedRoute[固定角与高度，只调v0]',
      'StrategySelect -->|单变量·发射高度| HeightRoute[固定v0与角，只调高度]',
      'StrategySelect -->|单变量·发射角度| AngleRoute[固定v0与高度，只调θ]',
      'StrategySelect -->|多参盲调| TrapRoute[同时调多个滑条]',
      'SpeedRoute --> AdjustSpeed[调整初速度]',
      'HeightRoute --> AdjustHeight[调整发射高度]',
      'AngleRoute --> AdjustAngle[调整发射角度]',
      'TrapRoute --> AdjustMulti[同时乱调多参]',
      'AdjustSpeed --> Fire[发射]',
      'AdjustHeight --> Fire',
      'AdjustAngle --> Fire',
      'AdjustMulti --> Fire',
      'Fire --> Observe{观察落点?}:::stratCond',
      'Observe -->|偏近| AdjustSpeed',
      'Observe -->|偏远| AdjustSpeed',
      'Observe -->|偏近| AdjustHeight',
      'Observe -->|偏远| AdjustHeight',
      'Observe -->|偏近| AdjustAngle',
      'Observe -->|偏远| AdjustAngle',
      'Observe -->|偏近| AdjustMulti',
      'Observe -->|偏远| AdjustMulti',
      'Observe -->|机会用尽| Retry[重试]:::stratRetry',
      'Observe -->|命中| Win[过关]:::stratResult',
    ].join('\n'),
  };

  const mapsTo = defaultMapsTo(ch);
  ch.strategy.routes = [
    makeRoute('main', '单变量·初速度', mapsTo, {
      priorityRank: 1,
      highlightNodes: ['Start', 'Env', 'Explore', 'StrategySelect', 'SpeedRoute', 'AdjustSpeed', 'Fire', 'Observe', 'Win', 'Retry'],
      highlightEdges: [
        ['Start', 'Env'], ['Env', 'Explore'], ['Explore', 'StrategySelect'],
        ['StrategySelect', 'SpeedRoute'], ['SpeedRoute', 'AdjustSpeed'],
        ['AdjustSpeed', 'Fire'], ['Fire', 'Observe'], ['Observe', 'Win'],
        ['Observe', 'AdjustSpeed'], ['Observe', 'Retry'],
      ],
    }),
    makeRoute('main_s-height', '单变量·发射高度', mapsTo, {
      priorityRank: 2,
      highlightNodes: ['Start', 'Env', 'Explore', 'StrategySelect', 'HeightRoute', 'AdjustHeight', 'Fire', 'Observe', 'Win', 'Retry'],
      highlightEdges: [
        ['Start', 'Env'], ['Env', 'Explore'], ['Explore', 'StrategySelect'],
        ['StrategySelect', 'HeightRoute'], ['HeightRoute', 'AdjustHeight'],
        ['AdjustHeight', 'Fire'], ['Fire', 'Observe'], ['Observe', 'Win'],
        ['Observe', 'AdjustHeight'], ['Observe', 'Retry'],
      ],
    }),
    makeRoute('main_s-angle', '单变量·发射角度', mapsTo, {
      priorityRank: 3,
      highlightNodes: ['Start', 'Env', 'Explore', 'StrategySelect', 'AngleRoute', 'AdjustAngle', 'Fire', 'Observe', 'Win', 'Retry'],
      highlightEdges: [
        ['Start', 'Env'], ['Env', 'Explore'], ['Explore', 'StrategySelect'],
        ['StrategySelect', 'AngleRoute'], ['AngleRoute', 'AdjustAngle'],
        ['AdjustAngle', 'Fire'], ['Fire', 'Observe'], ['Observe', 'Win'],
        ['Observe', 'AdjustAngle'], ['Observe', 'Retry'],
      ],
    }),
    makeRoute('trap', '多参盲调', mapsTo, {
      trap: true,
      highlightNodes: ['Start', 'Env', 'Explore', 'StrategySelect', 'TrapRoute', 'AdjustMulti', 'Fire', 'Observe', 'Retry'],
      highlightEdges: [
        ['Start', 'Env'], ['Env', 'Explore'], ['Explore', 'StrategySelect'],
        ['StrategySelect', 'TrapRoute'], ['TrapRoute', 'AdjustMulti'],
        ['AdjustMulti', 'Fire'], ['Fire', 'Observe'],
        ['Observe', 'AdjustMulti'], ['Observe', 'Retry'],
      ],
    }),
  ];

  return ch;
}

function repairMultiKp(chapter) {
  let ch = { ...chapter };
  ch = ensureIrrelevantNode(ch, 'I1', '质量', 's-mass 为混淆：机械能差与质量无关');
  ch = patchConstraintLabels(ch, {
    C2: '过环命中判定',
    C3: '减速带停稳达标',
    C4: '探究完成达标',
  });
  ch.inquiryScript = {
    ...(ch.inquiryScript || {}),
    summary: ch.kg?.title || '机械能探究',
    knowledgePoints: [
      {
        id: 'KP1',
        label: '机械能转化与守恒',
        formulas: ['E = Ek + Ep'],
        mapsToKg: ['S1'],
      },
    ],
    adjustmentVariables: [
      {
        id: 'AV1', controlId: 's-speed', label: '初速度', symbol: 'v', role: 'primary',
        priorityRank: 1, monotonicity: 'monotone', affects: ['Ek'],
        notes: '初速度优先：单调改变动能与过环能力', mapsToKg: 'O1',
      },
      {
        id: 'AV2', controlId: 's-height', label: '发射高度', symbol: 'h', role: 'secondary',
        priorityRank: 2, monotonicity: 'monotone', affects: ['Ep'],
        notes: '高度改势能，作用弱于 v', mapsToKg: 'O1',
      },
    ],
    confoundingVariables: [
      { id: 'CV1', controlId: 's-mass', label: '质量', reason: '混淆变量：不影响过环/停稳结论' },
    ],
    outputVariables: [
      { id: 'OV1', label: '过环/停稳结果', symbol: '', unit: '', role: 'primary', mapsToKg: 'R1', source: 'observe' },
    ],
    inquiryFlow: ['KP1', 'AV1', 'AV2', 'CV1'],
    narrative: {
      intro: '观察能否过环与是否停稳，弄清初速度与高度各自如何改变现象；每次只改一项。',
      steps: [
        { order: 1, title: '明确探究焦点', body: '关注过环成败与停稳现象（勿先背完整公式）。', mapsToKg: ['S1'] },
        { order: 2, title: '识别调节变量', body: '可调节：初速度、发射高度；控制变量法，每次只改一项。', mapsToKg: ['O1'] },
        { order: 3, title: '识别混淆变量', body: '混淆项：质量（不影响过环/停稳结论）', mapsToKg: ['I1'] },
        { order: 4, title: '观察—调整—再测', body: '操作后观察过环/停稳结果；未达标则只微调一个调节变量并重复。', mapsToKg: ['O1'] },
      ],
    },
  };
  ch.kg = {
    ...ch.kg,
    nodes: (ch.kg.nodes || []).map(n =>
      (n.id === 'O1' || n.group === 'operation')
        ? { ...n, label: n.label && !/调参操作/.test(n.label) ? n.label : '调节初速度/高度' }
        : n),
  };
  ch.traceMap = {
    ...(ch.traceMap || {}),
    controls: {
      ...(ch.traceMap?.controls || {}),
      's-speed': { kgId: 'O1', role: 'operation' },
      's-height': { kgId: 'O1', role: 'operation' },
      's-mass': { kgId: 'I1', role: 'irrelevant' },
      modeSelect: { kgId: 'C1', role: 'operation' },
    },
  };

  ch = fixDtPolarity(ch, [
    {
      match: /见过成功与失败/,
      rename: '见过达标与失败?',
      setBranches: (children) => {
        const yes = children.find(c => c._e === '是');
        const no = children.find(c => c._e === '否');
        // Correct polarity: 是→过关 result, 否→继续 retry
        return [
          {
            n: '探究过关',
            t: 'result',
            d: (yes && yes.t === 'result' ? yes.d : no?.d) || '已见过达标与失败',
            _e: '是',
            children: [],
          },
          {
            n: '继续尝试',
            t: 'retry',
            d: '尚未同时见过达标与失败',
            _e: '否',
            children: [],
          },
        ];
      },
    },
  ]);

  ch.strategy = {
    ...ch.strategy,
    mermaid: [
      'graph TD',
      'Start([开始探究/竞赛]):::stratStart --> Env{选择模式?}:::stratCond',
      'Env -->|探究模式| ModeExplore[探究：不限次数，需见过达标与失败]:::stratCore',
      'Env -->|竞赛模式| ModeChallenge[竞赛：限5次，需过环并停稳]:::stratCore',
      'ModeExplore --> StrategySelect{选择调参策略?}:::stratCond',
      'ModeChallenge --> StrategySelect',
      'StrategySelect -->|单变量·初速度| SingleV[固定h，只调v]',
      'StrategySelect -->|单变量·发射高度| SingleH[固定v，只调h]',
      'StrategySelect -->|多参盲调| TrapPath[同时调多个滑条]',
      'SingleV --> AdjustV[调整v]',
      'SingleH --> AdjustH[调整h]',
      'TrapPath --> AdjustMulti[同时乱调多参]',
      'AdjustV --> Fire[发射]',
      'AdjustH --> Fire',
      'AdjustMulti --> Fire',
      'Fire --> Observe{观察结果?}:::stratCond',
      'Observe -->|偏近| AdjustV',
      'Observe -->|偏远| AdjustV',
      'Observe -->|偏近| AdjustH',
      'Observe -->|偏远| AdjustH',
      'Observe -->|偏近| AdjustMulti',
      'Observe -->|偏远| AdjustMulti',
      'Observe -->|掉落| RetryDrop[能量不足，增大v]:::stratRetry',
      'Observe -->|冲出| RetryOut[速度过大，减小v]:::stratRetry',
      'Observe -->|停稳| CheckGoal{见过达标与失败?}:::stratCond',
      'RetryDrop --> AdjustV',
      'RetryOut --> AdjustV',
      'CheckGoal -->|是| Win[过关]:::stratResult',
      'CheckGoal -->|否| Continue[继续尝试]:::stratRetry',
      'Continue --> AdjustV',
    ].join('\n'),
  };

  const mapsTo = defaultMapsTo(ch);
  ch.strategy.routes = [
    makeRoute('main', '单变量·初速度', mapsTo, {
      priorityRank: 1,
      highlightNodes: ['Start', 'Env', 'ModeExplore', 'StrategySelect', 'SingleV', 'AdjustV', 'Fire', 'Observe', 'CheckGoal', 'Win', 'Continue', 'RetryDrop', 'RetryOut'],
      highlightEdges: [
        ['Start', 'Env'], ['Env', 'ModeExplore'], ['ModeExplore', 'StrategySelect'],
        ['StrategySelect', 'SingleV'], ['SingleV', 'AdjustV'],
        ['AdjustV', 'Fire'], ['Fire', 'Observe'], ['Observe', 'CheckGoal'],
        ['CheckGoal', 'Win'], ['Observe', 'AdjustV'], ['CheckGoal', 'Continue'],
        ['Continue', 'AdjustV'], ['Observe', 'RetryDrop'], ['Observe', 'RetryOut'],
        ['RetryDrop', 'AdjustV'], ['RetryOut', 'AdjustV'],
      ],
    }),
    makeRoute('main_s-height', '单变量·发射高度', mapsTo, {
      priorityRank: 2,
      highlightNodes: ['Start', 'Env', 'ModeExplore', 'StrategySelect', 'SingleH', 'AdjustH', 'Fire', 'Observe', 'CheckGoal', 'Win', 'Continue', 'RetryDrop', 'RetryOut'],
      highlightEdges: [
        ['Start', 'Env'], ['Env', 'ModeExplore'], ['ModeExplore', 'StrategySelect'],
        ['StrategySelect', 'SingleH'], ['SingleH', 'AdjustH'],
        ['AdjustH', 'Fire'], ['Fire', 'Observe'], ['Observe', 'CheckGoal'],
        ['CheckGoal', 'Win'], ['Observe', 'AdjustH'], ['CheckGoal', 'Continue'],
        ['Continue', 'AdjustV'], ['Observe', 'RetryDrop'], ['Observe', 'RetryOut'],
      ],
    }),
    makeRoute('trap', '多参盲调', mapsTo, {
      trap: true,
      highlightNodes: ['Start', 'Env', 'ModeExplore', 'StrategySelect', 'TrapPath', 'AdjustMulti', 'Fire', 'Observe', 'RetryDrop', 'RetryOut'],
      highlightEdges: [
        ['Start', 'Env'], ['Env', 'ModeExplore'], ['ModeExplore', 'StrategySelect'],
        ['StrategySelect', 'TrapPath'], ['TrapPath', 'AdjustMulti'],
        ['AdjustMulti', 'Fire'], ['Fire', 'Observe'],
        ['Observe', 'AdjustMulti'], ['Observe', 'RetryDrop'], ['Observe', 'RetryOut'],
      ],
    }),
  ];

  return ch;
}

function repairCapacitor(chapter) {
  let ch = { ...chapter };
  ch = ensureIrrelevantNode(ch, 'I1', '音量/厚度', 'audio-volume 与 s-thickness 为混淆装饰');
  ch = patchConstraintLabels(ch, {
    C1: '介质击穿出界?',
    C2: '间距约束',
    C3: '面积约束',
    C4: '介质非空气',
    C5: '电容读数达标',
  });
  ch.inquiryScript = {
    ...(ch.inquiryScript || {}),
    summary: '电容实验一：介质与击穿',
    knowledgePoints: [
      {
        id: 'KP1',
        label: '电容与击穿',
        formulas: ['C = ε₀εᵣA / d', 'E = V/d（击穿：E > Ebd）'],
        mapsToKg: ['S1', 'S2'],
      },
    ],
    adjustmentVariables: [
      {
        id: 'AV1', controlId: 'mat-grid', label: '介质材料', symbol: 'κ', role: 'primary',
        priorityRank: 1, monotonicity: 'discrete', affects: ['C', 'Ebd'],
        notes: '离散选介质：εᵣ 改 C，击穿场强 Ebd 随材料变；与连续滑条 A/d 不等价', mapsToKg: 'O1',
      },
      {
        id: 'AV2', controlId: 's-dist', label: '极板间距', symbol: 'd', role: 'secondary',
        priorityRank: 2, monotonicity: 'monotone', affects: ['C', 'E'],
        notes: 'd 双作用：C∝1/d（读数）且 E=V/d（击穿风险）；与只改 A 不等价', mapsToKg: 'O1',
      },
      {
        id: 'AV3', controlId: 's-area', label: '极板面积', symbol: 'A', role: 'secondary',
        priorityRank: 3, monotonicity: 'monotone', affects: ['C'],
        notes: 'A 单调抬高 C，不直接改击穿场强；优先级通常低于换介质/调 d', mapsToKg: 'O1',
      },
    ],
    confoundingVariables: [
      { id: 'CV1', controlId: 'audio-volume', label: '音量', reason: '混淆/装饰：与电容无关' },
      { id: 'CV2', controlId: 's-thickness', label: '介质厚度', reason: '混淆变量：本关不作为主探究量' },
    ],
    outputVariables: [
      { id: 'OV1', label: '电容读数', symbol: 'C', unit: 'pF', role: 'primary', mapsToKg: 'R1', source: 'observe' },
      { id: 'OV2', label: '是否击穿', symbol: 'E>Ebd', unit: '', role: 'secondary', mapsToKg: 'C1', source: 'constraint' },
    ],
    inquiryFlow: ['KP1', 'AV1', 'AV2', 'AV3', 'CV1'],
    narrative: {
      intro: '观察电容读数高低与是否击穿，弄清介质、间距、面积各自如何改变现象；每次只改一项。',
      steps: [
        { order: 1, title: '明确探究焦点', body: '关注：读数是否进入目标带、是否出现击穿警告（现象，勿先背公式）。', mapsToKg: ['S1', 'S2'] },
        { order: 2, title: '识别调节变量', body: '可调节：介质材料、极板间距、极板面积；控制变量法，每次只改一项。介质与 d 不等价（d 同时影响读数与击穿）。', mapsToKg: ['O1'] },
        { order: 3, title: '识别混淆变量', body: '混淆项：音量（与电容无关）；介质厚度（本关不作为主探究量）', mapsToKg: ['I1'] },
        { order: 4, title: '观察—调整—再测', body: '操作后观察电容读数与是否击穿；未达标则只微调一个调节变量并重复。', mapsToKg: ['O1'] },
      ],
    },
  };
  ch.kg = {
    ...ch.kg,
    nodes: (ch.kg.nodes || []).map(n => {
      if (n.id === 'O1' || (n.group === 'operation' && /调参操作/.test(n.label || ''))) {
        return { ...n, label: '调节介质/间距/面积' };
      }
      return n;
    }),
  };
  if (typeof ch.mapping === 'string') {
    ch.mapping = ch.mapping.replace(/调参操作/g, '调节介质/间距/面积');
  }
  ch.traceMap = {
    ...(ch.traceMap || {}),
    controls: {
      ...(ch.traceMap?.controls || {}),
      's-area': { kgId: 'O1', role: 'operation' },
      's-dist': { kgId: 'O1', role: 'operation' },
      'mat-grid': { kgId: 'O1', role: 'operation' },
      's-thickness': { kgId: 'I1', role: 'irrelevant' },
      'audio-volume': { kgId: 'I1', role: 'irrelevant' },
      modeSelect: { kgId: 'O1', role: 'operation' },
    },
  };

  // 击穿 already 是→retry / 否→continue; FAILURE_RE now matches 击穿
  ch.strategy = {
    ...ch.strategy,
    mermaid: [
      'graph TD',
      'Start([开始探究]):::stratStart --> Env{选择探究模式?}:::stratCond',
      'Env -->|自由探究| ModeExplore[自由探究：不限次数，观察参数影响]:::stratCore',
      'Env -->|竞赛挑战| ModeChallenge[竞赛挑战：限次急单，目标固定]:::stratCore',
      'ModeExplore --> StrategySelect{选择调参策略?}:::stratCond',
      'ModeChallenge --> StrategySelect',
      'StrategySelect -->|单变量·介质材料| StratM[固定A和d，只换介质]',
      'StrategySelect -->|单变量·极板间距| StratD[固定A和介质，只调d]',
      'StrategySelect -->|单变量·极板面积| StratA[固定d和介质，只调A]',
      'StrategySelect -->|多参盲调| Trap[同时调A、d、介质]',
      'StratM --> AdjustM[选择介质材料]',
      'StratD --> AdjustD[调整间距d]',
      'StratA --> AdjustA[调整面积A]',
      'Trap --> FireT[点击读取电容]',
      'AdjustM --> FireM[点击读取电容]',
      'AdjustD --> FireD[点击读取电容]',
      'AdjustA --> FireA[点击读取电容]',
      'FireM --> ObserveM{观察电容和击穿?}:::stratCond',
      'FireD --> ObserveD{观察电容读数?}:::stratCond',
      'FireA --> ObserveA{观察电容读数?}:::stratCond',
      'FireT --> ObserveT{观察结果?}:::stratCond',
      'ObserveM -->|击穿| AdjustM',
      'ObserveM -->|偏低| AdjustM',
      'ObserveM -->|达标| CheckGoalM{检查约束?}:::stratCond',
      'ObserveD -->|偏低| AdjustD',
      'ObserveD -->|偏高| AdjustD',
      'ObserveD -->|达标| CheckGoalD{检查约束?}:::stratCond',
      'ObserveA -->|偏低| AdjustA',
      'ObserveA -->|偏高| AdjustA',
      'ObserveA -->|达标| CheckGoalA{检查约束?}:::stratCond',
      'ObserveT -->|未达标| Trap',
      'ObserveT -->|达标| CheckGoalT{检查约束?}:::stratCond',
      'CheckGoalM -->|通过| Win[过关]:::stratResult',
      'CheckGoalM -->|不通过| AdjustM',
      'CheckGoalD -->|通过| Win',
      'CheckGoalD -->|不通过| AdjustD',
      'CheckGoalA -->|通过| Win',
      'CheckGoalA -->|不通过| AdjustA',
      'CheckGoalT -->|通过| Win',
      'CheckGoalT -->|不通过| Trap',
    ].join('\n'),
  };

  const mapsTo = defaultMapsTo(ch);
  ch.strategy.routes = [
    makeRoute('main', '单变量·介质材料', mapsTo, {
      priorityRank: 1,
      highlightNodes: ['Start', 'Env', 'ModeExplore', 'StrategySelect', 'StratM', 'AdjustM', 'FireM', 'ObserveM', 'CheckGoalM', 'Win'],
      highlightEdges: [
        ['Start', 'Env'], ['Env', 'ModeExplore'], ['ModeExplore', 'StrategySelect'],
        ['StrategySelect', 'StratM'], ['StratM', 'AdjustM'],
        ['AdjustM', 'FireM'], ['FireM', 'ObserveM'],
        ['ObserveM', 'AdjustM'], ['ObserveM', 'CheckGoalM'],
        ['CheckGoalM', 'Win'], ['CheckGoalM', 'AdjustM'],
      ],
    }),
    makeRoute('main_s-dist', '单变量·极板间距', mapsTo, {
      priorityRank: 2,
      highlightNodes: ['Start', 'Env', 'ModeExplore', 'StrategySelect', 'StratD', 'AdjustD', 'FireD', 'ObserveD', 'CheckGoalD', 'Win'],
      highlightEdges: [
        ['Start', 'Env'], ['Env', 'ModeExplore'], ['ModeExplore', 'StrategySelect'],
        ['StrategySelect', 'StratD'], ['StratD', 'AdjustD'],
        ['AdjustD', 'FireD'], ['FireD', 'ObserveD'],
        ['ObserveD', 'AdjustD'], ['ObserveD', 'CheckGoalD'],
        ['CheckGoalD', 'Win'], ['CheckGoalD', 'AdjustD'],
      ],
    }),
    makeRoute('main_s-area', '单变量·极板面积', mapsTo, {
      priorityRank: 3,
      highlightNodes: ['Start', 'Env', 'ModeExplore', 'StrategySelect', 'StratA', 'AdjustA', 'FireA', 'ObserveA', 'CheckGoalA', 'Win'],
      highlightEdges: [
        ['Start', 'Env'], ['Env', 'ModeExplore'], ['ModeExplore', 'StrategySelect'],
        ['StrategySelect', 'StratA'], ['StratA', 'AdjustA'],
        ['AdjustA', 'FireA'], ['FireA', 'ObserveA'],
        ['ObserveA', 'AdjustA'], ['ObserveA', 'CheckGoalA'],
        ['CheckGoalA', 'Win'], ['CheckGoalA', 'AdjustA'],
      ],
    }),
    makeRoute('trap', '多参盲调', mapsTo, {
      trap: true,
      highlightNodes: ['Start', 'Env', 'ModeExplore', 'StrategySelect', 'Trap', 'FireT', 'ObserveT', 'CheckGoalT'],
      highlightEdges: [
        ['Start', 'Env'], ['Env', 'ModeExplore'], ['ModeExplore', 'StrategySelect'],
        ['StrategySelect', 'Trap'], ['Trap', 'FireT'],
        ['FireT', 'ObserveT'], ['ObserveT', 'Trap'], ['ObserveT', 'CheckGoalT'],
        ['CheckGoalT', 'Trap'],
      ],
    }),
  ];

  return ch;
}

function repairOne(id) {
  const dir = path.join(PKG, id);
  const chapterPath = path.join(dir, 'chapter.json');
  const metaPath = path.join(dir, 'meta.json');
  const gamePath = path.join(dir, 'game.html');
  let chapter = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const html = fs.readFileSync(gamePath, 'utf8');
  const sources = [{ path: 'game.html', content: html }];
  const gameHints = extractGameHints(sources);
  const threeStep = runAnalyzeThreeStep({ sources, gameHints });

  if (id === 'projectile-basic') chapter = repairProjectile(chapter);
  else if (id === 'multi-kp') chapter = repairMultiKp(chapter);
  else if (id === 'capacitor-era-ch1') chapter = repairCapacitor(chapter);

  // Prefer repaired inquiryScript over analyze overwrite of confounders
  const analyzeParse = {
    ...threeStep.analyzeParse,
    inquiryScript: {
      ...threeStep.analyzeParse?.inquiryScript,
      adjustmentVariables: chapter.inquiryScript.adjustmentVariables,
      confoundingVariables: chapter.inquiryScript.confoundingVariables,
    },
  };

  let enriched = enrichChapterContract(chapter, { ...gameHints, analyzeParse }, sources);
  // Keep our strategy routes / mermaid if enrich collapsed anything unexpectedly
  if (id === 'projectile-basic') enriched = repairProjectile(enriched);
  else if (id === 'multi-kp') enriched = repairMultiKp(enriched);
  else if (id === 'capacitor-era-ch1') enriched = repairCapacitor(enriched);

  enriched = repairSingleVariableStrategyRoutes(enriched, { ...gameHints, analyzeParse });
  enriched = repairStrategyRouteHighlights(enriched);
  // Re-apply mermaid/routes after single-var merge (preserve distinct labels)
  if (id === 'projectile-basic') enriched = repairProjectile(enriched);
  else if (id === 'multi-kp') enriched = repairMultiKp(enriched);
  else if (id === 'capacitor-era-ch1') enriched = repairCapacitor(enriched);
  enriched = repairStrategyMapsToFromKg(enriched, gameHints);
  enriched = repairStrategyRouteHighlights(enriched);
  // Final deterministic sanitize + route scores (A–D guarantees)
  enriched = sanitizeInquiryScriptChapter(enriched, { ...gameHints, analyzeParse });
  enriched = repairStrategyRouteScores(enriched, { ...gameHints, analyzeParse });

  const validation = validateChapter(enriched);
  const quality = validateChapterQuality(enriched, gameHints);

  fs.writeFileSync(chapterPath, JSON.stringify(enriched, null, 2), 'utf8');
  const nextMeta = {
    ...meta,
    title: meta.title || enriched.kg?.title,
    savedAt: new Date().toISOString(),
    packageId: id,
    analyzedAt: new Date().toISOString(),
    source: 'agent-a-repair',
    validation,
    quality,
    analyzeSteps: threeStep.steps,
  };
  fs.writeFileSync(metaPath, JSON.stringify(nextMeta, null, 2), 'utf8');

  const { viewerJs, graphCss } = loadViewerAssets();
  const graphHtml = buildStandaloneGraphHtml({
    chapter: enriched,
    title: nextMeta.title || enriched.kg?.title || id,
    viewerJs,
    graphCss,
  });
  const runtimeGraph = path.join(dir, '图谱.html');
  fs.writeFileSync(runtimeGraph, graphHtml, 'utf8');

  const sample = SAMPLE_MAP[id];
  if (sample) {
    const sampleDir = path.join(ROOT, '样本html', sample.dir);
    fs.mkdirSync(sampleDir, { recursive: true });
    fs.writeFileSync(path.join(sampleDir, '图谱.html'), graphHtml, 'utf8');
  }

  // Keep index.html in sync if present
  const indexPath = path.join(dir, 'index.html');
  if (fs.existsSync(indexPath)) {
    try {
      const { renderSinglePreviewHtml } = require('../../packages/generate/export/render-preview-html');
      fs.writeFileSync(indexPath, renderSinglePreviewHtml(nextMeta), 'utf8');
    } catch {
      /* optional */
    }
  }

  return {
    id,
    validationOk: validation.ok,
    qualityOk: quality.ok,
    score: quality.score,
    errors: quality.errors || [],
    warnings: (quality.warnings || []).slice(0, 6),
    graphPaths: [
      runtimeGraph,
      sample ? path.join(ROOT, '样本html', sample.dir, '图谱.html') : null,
    ].filter(Boolean),
    av: (enriched.inquiryScript?.adjustmentVariables || []).map(a =>
      `${a.priorityRank}:${a.label}(${a.monotonicity})`).join(' | '),
    routes: (enriched.strategy?.routes || []).map(r =>
      `${r.label}@${r.score ?? '?'}`).join(' | '),
    ov: (enriched.inquiryScript?.outputVariables || []).map(o => o.label).join(','),
    formulas: (enriched.inquiryScript?.knowledgePoints || [])
      .flatMap(k => k.formulas || []).slice(0, 3),
  };
}

function main() {
  const ids = ['projectile-basic', 'multi-kp', 'capacitor-era-ch1'];
  const rows = ids.map(repairOne);
  console.log(JSON.stringify(rows, null, 2));
  const failed = rows.filter(r => !r.qualityOk);
  if (failed.length) {
    console.error('QUALITY_FAIL', failed.map(f => ({ id: f.id, errors: f.errors })));
    process.exitCode = 1;
  }
}

main();
