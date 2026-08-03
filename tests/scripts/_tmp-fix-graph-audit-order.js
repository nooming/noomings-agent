/**
 * One-shot surgical fixes per graph consistency audit order.
 * Usage: node tests/scripts/_tmp-fix-graph-audit-order.js
 */
const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const { writePriorityGraphFiles } = require('../../packages/generate/export/build-priority-graph-html');
const { getPackagesRoot } = require('../../packages/shared/data-paths');

const ROOT = path.resolve(__dirname, '../..');
const PACKAGES = getPackagesRoot();
const YANG = path.join(ROOT, '\u6837\u672chtml');

function loadChapter(id) {
  const p = path.join(PACKAGES, id, 'chapter.json');
  return { path: p, chapter: JSON.parse(fs.readFileSync(p, 'utf8')) };
}

function saveChapter(p, chapter) {
  fs.writeFileSync(p, `${JSON.stringify(chapter, null, 2)}\n`, 'utf8');
}

function scrubHighlights(route, dropNodes) {
  const drop = new Set(dropNodes);
  if (Array.isArray(route.highlightNodes)) {
    route.highlightNodes = route.highlightNodes.filter(n => !drop.has(n));
  }
  if (Array.isArray(route.highlightEdges)) {
    route.highlightEdges = route.highlightEdges.filter(
      e => Array.isArray(e) && e.length >= 2 && !drop.has(e[0]) && !drop.has(e[1]),
    );
  }
}

function ensureUniqueNodes(nodes) {
  return [...new Set(nodes.filter(Boolean))];
}

function edgeKey(e) {
  return `${e[0]}=>${e[1]}`;
}

function ensureUniqueEdges(edges) {
  const seen = new Set();
  const out = [];
  for (const e of edges || []) {
    if (!Array.isArray(e) || e.length < 2) continue;
    const k = edgeKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([e[0], e[1]]);
  }
  return out;
}

function fixEfield(chapter) {
  // --- KG / mapping ---
  chapter.mapping = '| DT 节点 | KG id | KG type | 备注 |\n|---|---|---|---|\n| 进入关卡 | P1 | premise | play 起点 |\n| 调节场强/电荷 | O1 | operation | 调节s-fieldStrength、s-charge（有效 AV） |\n| 飞出边界? | C1 | constraint | 飞出电场区域判定 |\n| 命中靶区? | C2 | constraint | 光点到达荧光屏时是否在靶区内 |\n| 过关 | R1 | result | 命中靶区 |\n| 提示重试 | (skip retry) | — | retry 不进 KG |\n| 再试 | (skip retry) | — | retry 不进 KG |\n| 出界重试 | (skip retry) | — | retry 不进 KG |\n| 偏转原理 | S1 | core | teach 节点 |\n| 控制变量法 | S2 | method | teach 节点 |\n| 电场力公式 | S3 | core | teach 节点 |\n| 极板间距（示意） | I1 | irrelevant | 仅改示意间距，不改变偏转 |';

  const kg = chapter.kg;
  const o1 = kg.nodes.find(n => n.id === 'O1');
  if (o1) {
    o1.label = '调节场强/电荷';
    o1.desc = '通过滑条调节电场强度与粒子电荷量；极板间距仅为示意，不参与偏转物理';
  }
  const s2 = kg.nodes.find(n => n.id === 'S2');
  if (s2) {
    s2.desc = '每次只改变一个有效变量（场强或电荷量），观察偏转变化；勿把示意间距当有效控制';
  }
  if (!kg.nodes.some(n => n.id === 'I1')) {
    kg.nodes.push({
      id: 'I1',
      label: '极板间距（示意）',
      group: 'irrelevant',
      layer: 'teach',
      level: 1,
      r: 18,
      desc: '滑条仅改变极板示意间距，E 独立设定，不改变偏转',
    });
  }

  // DT labels
  const rewriteDt = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.n === '调节场强/电荷/间距') node.n = '调节场强/电荷';
    if (typeof node.d === 'string' && node.d.includes('极板间距')) {
      node.d = node.d
        .replace('、粒子电荷量和极板间距', '与粒子电荷量')
        .replace('通过滑条调节电场强度、粒子电荷量和极板间距', '通过滑条调节电场强度与粒子电荷量');
    }
    if (Array.isArray(node.children)) node.children.forEach(rewriteDt);
  };
  rewriteDt(chapter.dt?.tree);

  // traceMap
  chapter.traceMap = chapter.traceMap || { controls: {}, legacyTypes: {} };
  chapter.traceMap.controls = {
    's-fieldStrength': { kgId: 'O1', role: 'operation' },
    's-charge': { kgId: 'O1', role: 'operation' },
    's-plate-gap': { kgId: 'I1', role: 'irrelevant' },
    modeSelect: { kgId: 'O1', role: 'operation' },
    I1: { kgId: 'I1', role: 'irrelevant' },
  };
  chapter.traceMap.legacyTypes = {
    ...(chapter.traceMap.legacyTypes || {}),
    irrelevant_touch: { canonical: 'irrelevant_touch', control: 'I1' },
  };

  // strategy mermaid + routes
  chapter.strategy.title = '电场 · 带电粒子偏转';
  chapter.strategy.sub = '探究场强、电荷量对偏转的影响；极板间距仅为示意';
  chapter.strategy.mermaid = [
    'graph TD',
    'Adjust --> Fire',
    'AdjustE --> Fire[发射电子束]',
    'AdjustMulti --> Fire',
    'AdjustQ --> Fire',
    'BackFromCV --> StrategySelect',
    'ChallengeMode --> StrategySelect',
    'ExploreMode --> StrategySelect{选择调参策略?}:::stratCond',
    'Fire --> Observe{观察偏转?}:::stratCond',
    'ModeSelect -->|自由探究| ExploreMode[自由探究：不限次数观察偏转]:::stratCore',
    'ModeSelect -->|竞赛挑战| ChallengeMode[竞赛挑战：限5次命中锁定靶区]:::stratResult',
    'Observe -->|偏低| AdjustE',
    'Observe -->|偏高| AdjustE',
    'Observe -->|偏低| AdjustQ',
    'Observe -->|偏高| AdjustQ',
    'Observe -->|偏低| AdjustMulti',
    'Observe -->|偏高| AdjustMulti',
    'Observe -->|出界| Retry[出界重试]:::stratRetry',
    'Observe -->|命中| Win[过关]:::stratResult',
    'ObserveCV -->|无增益| BackFromCV[回到主策略]:::stratCore',
    'ProbeCV --> ObserveCV{观察有无增益?}:::stratCond',
    'Start --> ModeSelect{选择模式?}:::stratCond',
    'StrategySelect -->|单变量·场强| SingleE',
    'StrategySelect -->|单变量·电荷量| SingleQ',
    'StrategySelect -.->|试探混淆·极板间距| ProbeCV',
    'StrategySelect -->|多参盲调| Trap',
    'Start([开始探究]):::stratStart',
    'Adjust[单变量微调]',
    'Trap[多参盲调]',
    'Retry --> AdjustE',
    'SingleE --> AdjustE[调整场强]',
    'SingleQ --> AdjustQ[调整电荷]',
    'SingleE[单变量·场强]',
    'SingleQ[单变量·电荷量]',
    'ProbeCV[试探混淆·极板间距（示意无效）]',
    'Trap --> Fire',
    'AdjustMulti[同时调多个参数]',
    '',
  ].join('\n');

  chapter.strategy.routes = [
    {
      id: 'main',
      label: '单变量·场强',
      mapsTo: ['P1', 'O1', 'C1', 'C2', 'R1'],
      warn: '每次只改场强，观察偏转；极板间距为示意无效控件',
      score: 1,
      weight: 1,
      priorityRank: 1,
      highlightNodes: [
        'Start', 'ModeSelect', 'ExploreMode', 'StrategySelect',
        'SingleE', 'AdjustE', 'Fire', 'Observe', 'Win', 'Retry', 'ChallengeMode',
      ],
      highlightEdges: [
        ['Start', 'ModeSelect'],
        ['ModeSelect', 'ExploreMode'],
        ['ExploreMode', 'StrategySelect'],
        ['StrategySelect', 'SingleE'],
        ['SingleE', 'AdjustE'],
        ['AdjustE', 'Fire'],
        ['Fire', 'Observe'],
        ['Observe', 'Win'],
        ['Observe', 'AdjustE'],
        ['Observe', 'Retry'],
        ['Retry', 'AdjustE'],
        ['ModeSelect', 'ChallengeMode'],
        ['ChallengeMode', 'StrategySelect'],
      ],
      highlightFailureBranches: true,
    },
    {
      id: 'main_s-charge',
      label: '单变量·电荷量',
      mapsTo: ['P1', 'O1', 'C1', 'C2', 'R1'],
      warn: '每次只改电荷量，观察偏转；勿把示意间距当有效控制',
      score: 0.85,
      weight: 0.85,
      priorityRank: 2,
      highlightNodes: [
        'Start', 'ModeSelect', 'ExploreMode', 'StrategySelect',
        'SingleQ', 'AdjustQ', 'Fire', 'Observe', 'Win', 'Retry', 'ChallengeMode',
      ],
      highlightEdges: [
        ['Start', 'ModeSelect'],
        ['ModeSelect', 'ExploreMode'],
        ['ExploreMode', 'StrategySelect'],
        ['StrategySelect', 'SingleQ'],
        ['SingleQ', 'AdjustQ'],
        ['AdjustQ', 'Fire'],
        ['Fire', 'Observe'],
        ['Observe', 'Win'],
        ['Observe', 'AdjustQ'],
        ['Observe', 'Retry'],
        ['Retry', 'AdjustE'],
        ['ModeSelect', 'ChallengeMode'],
        ['ChallengeMode', 'StrategySelect'],
      ],
      highlightFailureBranches: true,
    },
    {
      id: 'trap',
      label: '多参盲调',
      mapsTo: ['P1', 'O1', 'C1', 'C2'],
      warn: '同时调节多个滑条效率低、难归因，不如每次只动一个变量',
      score: 0.2,
      weight: 0.2,
      highlightNodes: [
        'Start', 'ModeSelect', 'ExploreMode', 'StrategySelect',
        'Trap', 'Fire', 'Observe', 'Retry', 'AdjustMulti', 'AdjustE', 'AdjustQ',
      ],
      highlightEdges: [
        ['Start', 'ModeSelect'],
        ['ModeSelect', 'ExploreMode'],
        ['ExploreMode', 'StrategySelect'],
        ['StrategySelect', 'Trap'],
        ['Trap', 'Fire'],
        ['Fire', 'Observe'],
        ['Observe', 'AdjustMulti'],
        ['AdjustMulti', 'Fire'],
        ['Observe', 'AdjustE'],
        ['AdjustE', 'Fire'],
        ['Observe', 'AdjustQ'],
        ['AdjustQ', 'Fire'],
        ['Observe', 'Retry'],
      ],
      highlightFailureBranches: true,
    },
    {
      id: 'confound_s_plate_gap',
      label: '试探混淆·极板间距',
      mapsTo: [],
      warn: '极板间距仅示意、不改变偏转；拧过后应回到场强/电荷主路径',
      score: 0.15,
      weight: 0.15,
      tier: 'suboptimal',
      kind: 'confoundProbe',
      highlightNodes: [
        'Start', 'ModeSelect', 'ExploreMode', 'StrategySelect',
        'ProbeCV', 'ObserveCV', 'BackFromCV',
      ],
      highlightEdges: [
        ['Start', 'ModeSelect'],
        ['ModeSelect', 'ExploreMode'],
        ['ExploreMode', 'StrategySelect'],
        ['StrategySelect', 'ProbeCV'],
        ['ProbeCV', 'ObserveCV'],
        ['ObserveCV', 'BackFromCV'],
        ['BackFromCV', 'StrategySelect'],
      ],
      highlightFailureBranches: false,
    },
  ];

  // inquiryScript
  const iq = chapter.inquiryScript;
  iq.adjustmentVariables = [
    {
      id: 'AV1',
      controlId: 's-fieldStrength',
      label: '场强',
      type: 'range',
      role: 'primary',
      mapsToKg: 'O1',
      monotonicity: 'monotone',
      affects: ['deflection'],
      notes: '有效主控：改 E 直接改偏转',
      priorityRank: 1,
    },
    {
      id: 'AV2',
      controlId: 's-charge',
      label: '电荷量',
      type: 'range',
      role: 'secondary',
      mapsToKg: 'O1',
      monotonicity: 'monotone',
      affects: ['deflection'],
      notes: '有效次控：改 q 改偏转',
      priorityRank: 2,
    },
  ];
  iq.confoundingVariables = [
    {
      id: 'CV1',
      controlId: 's-plate-gap',
      label: '极板间距（示意）',
      reason: '仅改变极板示意间距，E 独立设定，不参与偏转归因',
    },
  ];
  iq.inquiryFlow = ['KP1', 'AV1', 'AV2', 'CV1'];
  if (iq.narrative?.steps) {
    const step2 = iq.narrative.steps.find(s => s.order === 2);
    if (step2) {
      step2.body = '可调节：场强、电荷量；极板间距仅为示意无效控件。建议控制变量法，每次只改一项有效变量。';
      step2.mapsToKg = ['O1', 'O1'];
    }
    if (!iq.narrative.steps.some(s => /混淆/.test(s.title || ''))) {
      iq.narrative.steps.splice(2, 0, {
        order: 3,
        title: '识别混淆变量',
        body: '混淆项：极板间距（示意无效，不改变偏转）',
        mapsToKg: ['I1'],
      });
      const observe = iq.narrative.steps.find(s => /观察/.test(s.title || ''));
      if (observe) observe.order = 4;
    }
  }

  // physicsModel
  if (chapter.physicsModel) {
    chapter.physicsModel.independentVariables = ['AV1', 'AV2'];
    chapter.physicsModel.confoundingVariables = ['CV1'];
  }

  // gameSpec
  const gs = chapter.gameSpec;
  gs.subtitle = '探究场强、电荷量对偏转的影响；极板间距仅为示意';
  gs.controls = (gs.controls || []).filter(c => c.id !== 's-plate-gap');
  // keep field/charge/mode; reorder field first
  const byId = Object.fromEntries((gs.controls || []).map(c => [c.id, c]));
  if (byId['s-fieldStrength']) byId['s-fieldStrength'].role = 'adjustment';
  if (byId['s-charge']) byId['s-charge'].role = 'adjustment';
  if (byId.modeSelect) {
    byId.modeSelect.label = '调节场强/电荷';
  }
  gs.controls = ['s-fieldStrength', 's-charge', 'modeSelect']
    .map(id => byId[id])
    .filter(Boolean);
  gs.confoundingUi = [
    {
      controlId: 's-plate-gap',
      label: '极板间距（示意）',
      reason: '仅改变极板示意间距，不改变偏转（E 独立设定）',
      uiStrategy: 'cosmetic_slider',
    },
  ];
  gs.confoundingMustNotBePrimarySlider = true;
  gs.traceMapExpected = {
    's-fieldStrength': { kgId: 'O1', role: 'operation' },
    's-charge': { kgId: 'O1', role: 'operation' },
    's-plate-gap': { kgId: 'I1', role: 'irrelevant' },
    modeSelect: { kgId: 'O1', role: 'operation' },
    I1: { kgId: 'I1', role: 'irrelevant' },
  };
  if (Array.isArray(gs.htmlGuidelines)) {
    // keep as-is
  }

  // telemetry
  const te = chapter.telemetrySpec;
  if (te?.events) {
    te.events = te.events.filter(e => e.controlId !== 's-plate-gap');
    te.events.push({
      type: 'irrelevant_touch',
      controlId: 's-plate-gap',
      kgId: 'I1',
      required: false,
      description: '混淆/示意控件触碰 s-plate-gap（不改变偏转）',
    });
    // rename modeSelect description
    for (const ev of te.events) {
      if (ev.controlId === 'modeSelect') {
        ev.description = '学生调节 modeSelect → KG O1';
      }
    }
  }
  if (Array.isArray(te?.dtCheckpoints)) {
    for (const cp of te.dtCheckpoints) {
      if (typeof cp.desc === 'string') {
        cp.desc = cp.desc.replace('调节场强/电荷/间距', '调节场强/电荷');
      }
    }
  }

  return 'demoted plate-gap to confound; promoted SingleE/SingleQ; Observe 偏高/偏低';
}

function fixPhotoelectric(chapter) {
  const routes = chapter.strategy.routes || [];
  const main = routes.find(r => r.id === 'main');
  if (main) {
    scrubHighlights(main, ['PathTrap', 'AdjustMulti']);
    main.highlightNodes = ensureUniqueNodes(main.highlightNodes);
    main.highlightEdges = ensureUniqueEdges(main.highlightEdges);
  }

  const work = routes.find(r => r.id === 'main_s-workfunction');
  if (work) {
    // W locked in challenge → highlight explore path
    work.highlightNodes = ensureUniqueNodes([
      'Start', 'Env', 'ModeExplore', 'StrategySelect',
      'PathWork', 'AdjustWork', 'Fire', 'Observe', 'Win', 'Adjust', 'Retry',
    ]);
    work.highlightEdges = ensureUniqueEdges([
      ['Start', 'Env'],
      ['Env', 'ModeExplore'],
      ['ModeExplore', 'StrategySelect'],
      ['StrategySelect', 'PathWork'],
      ['PathWork', 'AdjustWork'],
      ['AdjustWork', 'Fire'],
      ['Fire', 'Observe'],
      ['Observe', 'Win'],
      ['Observe', 'Adjust'],
      ['Adjust', 'Fire'],
      ['Observe', 'Retry'],
    ]);
    work.warn = '逸出功仅在探究模式可调；竞赛模式材料锁定，勿把 PathWork 当作挑战主路径';
  }

  const intensity = routes.find(r => r.id === 'main_s-intensity');
  if (intensity) {
    // intensity scales amplitude only; not a challenge-winning threshold control
    intensity.score = 0.35;
    intensity.weight = 0.35;
    intensity.priorityRank = 3;
    intensity.tier = 'suboptimal';
    intensity.warn = '光强只缩放电流幅值，不改阈值；无法单独作为挑战过关主路径';
    intensity.highlightNodes = ensureUniqueNodes([
      'Start', 'Env', 'ModeExplore', 'StrategySelect',
      'PathIntensity', 'AdjustIntensity', 'Fire', 'Observe', 'Adjust', 'Retry',
    ]);
    intensity.highlightEdges = ensureUniqueEdges([
      ['Start', 'Env'],
      ['Env', 'ModeExplore'],
      ['ModeExplore', 'StrategySelect'],
      ['StrategySelect', 'PathIntensity'],
      ['PathIntensity', 'AdjustIntensity'],
      ['AdjustIntensity', 'Fire'],
      ['Fire', 'Observe'],
      ['Observe', 'Adjust'],
      ['Adjust', 'Fire'],
      ['Observe', 'Retry'],
    ]);
  }

  const confound = routes.find(r => r.id === 'confound_CV1');
  if (confound) {
    // prefer explore for CV probe highlight
    confound.highlightNodes = ensureUniqueNodes([
      'Start', 'Env', 'ModeExplore', 'StrategySelect',
      'ProbeCV', 'ObserveCV', 'BackFromCV',
    ]);
    confound.highlightEdges = ensureUniqueEdges([
      ['Start', 'Env'],
      ['Env', 'ModeExplore'],
      ['ModeExplore', 'StrategySelect'],
      ['StrategySelect', 'ProbeCV'],
      ['ProbeCV', 'ObserveCV'],
      ['ObserveCV', 'BackFromCV'],
      ['BackFromCV', 'StrategySelect'],
    ]);
  }

  // AV3 notes
  const av3 = chapter.inquiryScript?.adjustmentVariables?.find(a => a.controlId === 's-intensity');
  if (av3) {
    av3.notes = '只缩放光电流幅值，不改阈值条件；非挑战过关主控';
    av3.role = 'secondary';
  }

  // narrative note about materials if present
  const nar = chapter.inquiryScript?.narrative;
  if (nar?.steps) {
    const step1 = nar.steps.find(s => s.order === 1);
    if (step1 && !/Cu|Ag|铜|银|材料池/.test(step1.body || '')) {
      step1.body = `${step1.body}；竞赛材料池仅含阈值可过关材料（Na/K/Cs/Zn），Cu/Ag 保留在探究演示。`;
    }
  }

  // S2 desc if mentions materials
  const s2 = chapter.kg?.nodes?.find(n => n.id === 'S2');
  if (s2 && typeof s2.desc === 'string') {
    if (!/材料池|Cu|Ag/.test(s2.desc)) {
      s2.desc = `${s2.desc}；竞赛急单材料池排除不可过关的 Cu/Ag（探究仍可演示）。`;
    }
  }

  return 'removed ghost PathTrap/AdjustMulti; workfunction→ModeExplore; demoted intensity';
}

function fixPendulumTarget(chapter) {
  // Unify angle spine: remove orphan Ang → AdjustAng; keep Route_main_s_angle → Adjust
  // Also wire AdjustAng into angle route feedback via Route_main_s_angle → AdjustAng if useful,
  // or remove AdjustAng entirely and point RetryFar → Adjust.
  let m = chapter.strategy.mermaid;
  // Drop unreachable Ang → AdjustAng island
  m = m
    .replace(/\nAdjustAng --> Fire\n/g, '\n')
    .replace(/\nAng --> AdjustAng\[[^\]]*\]\n/g, '\n')
    .replace(/\nRetryFar --> AdjustAng\n/g, '\nRetryFar --> Adjust\n')
    .replace(/\nAdjustAng\[[^\]]*\]\n/g, '\n');
  // Ensure angle route uses Adjust (already there); optionally add AdjustAng on live spine
  // Prefer: Route_main_s_angle → AdjustAng → Fire for angle-specific feedback
  if (!/Route_main_s_angle --> AdjustAng/.test(m) && !/AdjustAng --> Fire/.test(m)) {
    // Keep simple unified spine: Route_main_s_angle → Adjust (already in mermaid)
    // Add AdjustAng as alias on live spine under angle route
    m = m.replace(
      /Route_main_s_angle --> Adjust\n/,
      'Route_main_s_angle --> Adjust\nRoute_main_s_angle --> AdjustAng[调整角度]\nAdjustAng --> Fire\nRetryFar --> AdjustAng\n',
    );
  }
  // If RetryFar → Adjust was already set and we also added RetryFar → AdjustAng, dedupe later via parse
  // Clean duplicate RetryFar lines
  const lines = m.replace(/\r\n/g, '\n').split('\n');
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
  chapter.strategy.mermaid = kept.join('\n');
  if (!chapter.strategy.mermaid.endsWith('\n')) chapter.strategy.mermaid += '\n';

  for (const route of chapter.strategy.routes || []) {
    scrubHighlights(route, ['Ang']);
    // Fix edges that referenced Ang → AdjustAng to Route_main_s_angle → AdjustAng / Adjust
    if (Array.isArray(route.highlightEdges)) {
      route.highlightEdges = route.highlightEdges.map(e => {
        if (Array.isArray(e) && e[0] === 'Ang' && e[1] === 'AdjustAng') {
          return ['Route_main_s_angle', 'AdjustAng'];
        }
        return e;
      });
      route.highlightEdges = ensureUniqueEdges(route.highlightEdges);
    }
    if (route.id === 'main_s-angle') {
      route.highlightNodes = ensureUniqueNodes([
        ...(route.highlightNodes || []).filter(n => n !== 'Ang'),
        'Route_main_s_angle', 'Adjust', 'AdjustAng',
      ]);
      if (!route.highlightEdges.some(e => e[0] === 'Route_main_s_angle' && e[1] === 'AdjustAng')) {
        route.highlightEdges.push(['Route_main_s_angle', 'AdjustAng']);
      }
      if (!route.highlightEdges.some(e => e[0] === 'AdjustAng' && e[1] === 'Fire')) {
        route.highlightEdges.push(['AdjustAng', 'Fire']);
      }
      route.highlightEdges = ensureUniqueEdges(route.highlightEdges);
    }
    if (route.id === 'main') {
      // main (length) should not highlight Ang island; AdjustAng ok for RetryFar feedback
      route.highlightNodes = ensureUniqueNodes((route.highlightNodes || []).filter(n => n !== 'Ang'));
    }
  }

  return 'removed Ang island; unified angle spine with Route_main_s_angle';
}

function stripChallengeIslands(mermaid, patterns) {
  let m = mermaid.replace(/\r\n/g, '\n');
  const lines = m.split('\n');
  const dropRe = patterns;
  const kept = lines.filter(raw => {
    const line = raw.trim();
    if (!line) return true;
    return !dropRe.some(re => re.test(line));
  });
  // Also drop node declarations for removed ids
  return kept.join('\n');
}

function fixCapacitorConfound(chapter) {
  const dropIds = ['Adjust1C', 'FireC', 'ObserveC', 'RetryC', 'WinC'];
  chapter.strategy.mermaid = stripChallengeIslands(chapter.strategy.mermaid, [
    /\bAdjust1C\b/,
    /\bFireC\b/,
    /\bObserveC\b/,
    /\bRetryC\b/,
    /\bWinC\b/,
  ]);
  for (const route of chapter.strategy.routes || []) {
    scrubHighlights(route, dropIds);
    route.highlightNodes = ensureUniqueNodes(route.highlightNodes);
    route.highlightEdges = ensureUniqueEdges(route.highlightEdges);
  }
  return 'removed unreachable *C challenge bone; cleaned WinC highlights';
}

function fixThinLens(chapter) {
  const dropIds = ['AdjustBothC', 'AdjustFC', 'AdjustUC', 'FireC', 'ObserveC', 'RetryC', 'WinC', 'Fail'];
  // Keep Fail only if still referenced from live Observe — after strip, Fail may be orphan
  chapter.strategy.mermaid = stripChallengeIslands(chapter.strategy.mermaid, [
    /\bAdjustBothC\b/,
    /\bAdjustFC\b/,
    /\bAdjustUC\b/,
    /\bFireC\b/,
    /\bObserveC\b(?!V)/, // do not match ObserveCV
    /\bRetryC\b/,
    /\bWinC\b/,
    /机会耗尽/,
    /\bFail\b/,
  ]);
  for (const route of chapter.strategy.routes || []) {
    scrubHighlights(route, dropIds);
    route.highlightNodes = ensureUniqueNodes(route.highlightNodes);
    route.highlightEdges = ensureUniqueEdges(route.highlightEdges);
  }
  return 'removed unreachable *C challenge bone; cleaned WinC highlights';
}

function fixFriction(chapter) {
  const dropIds = [
    'AdjustAngleChallenge', 'FireChallenge', 'ObserveChallenge',
    'WinChallenge', 'AngleRouteChallenge', 'Fail',
  ];
  chapter.strategy.mermaid = stripChallengeIslands(chapter.strategy.mermaid, [
    /\bAdjustAngleChallenge\b/,
    /\bFireChallenge\b/,
    /\bObserveChallenge\b/,
    /\bWinChallenge\b/,
    /\bAngleRouteChallenge\b/,
    /次数耗尽/,
    /^Fail\b/,
    /\bFail -->/,
  ]);
  for (const route of chapter.strategy.routes || []) {
    scrubHighlights(route, dropIds);
    route.highlightNodes = ensureUniqueNodes(route.highlightNodes);
    route.highlightEdges = ensureUniqueEdges(route.highlightEdges);
  }
  return 'removed unreachable *Challenge bone; cleaned WinChallenge highlights';
}

function exportPkg(id) {
  const entry = YANG_MAP.find(e => e.id === id);
  if (!entry) return { id, ok: false, error: 'not in yangben map' };
  const pkgDir = path.join(PACKAGES, id);
  const chapter = JSON.parse(fs.readFileSync(path.join(pkgDir, 'chapter.json'), 'utf8'));
  const metaPath = path.join(pkgDir, 'meta.json');
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
  const title = meta.title || chapter.kg?.title || chapter.strategy?.title || entry.topic || id;
  const result = writePriorityGraphFiles({
    chapter,
    title,
    runtimeDir: pkgDir,
    sampleDir: path.join(YANG, entry.dir),
  });
  return { id, ok: true, bytes: result.bytes, outs: result.outs };
}

function main() {
  const jobs = [
    ['efield-charge', fixEfield],
    ['photoelectric', fixPhotoelectric],
    ['pendulum-target', fixPendulumTarget],
    ['capacitor-confound-ui', fixCapacitorConfound],
    ['thin-lens-implicit', fixThinLens],
    ['friction-incline', fixFriction],
  ];
  const report = [];
  for (const [id, fn] of jobs) {
    const { path: p, chapter } = loadChapter(id);
    const note = fn(chapter);
    saveChapter(p, chapter);
    const exp = exportPkg(id);
    report.push({ id, note, export: exp });
    console.log(exp.ok ? 'OK' : 'FAIL', id, '—', note, exp.error || `${exp.bytes}B`);
  }
  const out = path.join(PACKAGES, 'reports', 'tmp-graph-audit-fix.json');
  fs.writeFileSync(out, `${JSON.stringify({ at: new Date().toISOString(), report }, null, 2)}\n`);
  console.log('report →', out);
}

main();
