/** Regression: inquiry sanitize + route score differentiation */
const assert = require('assert');
const {
  sanitizeInquiryScriptChapter,
  isCleanFormula,
  isCrossDomainOutputPollution,
} = require('../../../../packages/contract/repair/inquiry-script-sanitize');
const { repairStrategyRouteScores } = require('../../../../packages/contract/repair/strategy-route-score-repair');
const { validateInquiryScript } = require('../../../../packages/contract/validate/validate-inquiry-script');
const { validateChapterQuality } = require('../../../../packages/contract');

function pollutedCapacitorChapter() {
  return {
    mapping: '| 调参操作 | O1 | operation |',
    kg: {
      title: '电容实验一：介质与击穿',
      sub: '第一章',
      nodes: [
        { id: 'P1', label: '进入', group: 'premise', layer: 'play', level: 0, r: 22, desc: '进入关卡' },
        { id: 'O1', label: '调参操作', group: 'operation', layer: 'play', level: 1, r: 22, desc: '调参' },
        { id: 'C1', label: '介质击穿出界?', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '场强超限击穿' },
        { id: 'C2', label: '间距约束', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '塔体限位：d≥3.5mm' },
        { id: 'C5', label: '电容读数达标', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '读数在目标带' },
        { id: 'R1', label: '过关', group: 'result', layer: 'play', level: 3, r: 22, desc: '信号塔重建完成' },
        { id: 'S1', label: '电容公式', group: 'core', layer: 'teach', level: 0, r: 22, desc: 'C = ε₀εᵣA / d' },
        { id: 'I1', label: '音量', group: 'irrelevant', layer: 'play', level: 0, r: 18, desc: '装饰' },
      ],
      links: [
        { s: 'P1', t: 'O1', tp: 'premise' },
        { s: 'O1', t: 'C1', tp: 'premise' },
        { s: 'C1', t: 'C2', tp: 'premise' },
        { s: 'C2', t: 'C5', tp: 'premise' },
        { s: 'C5', t: 'R1', tp: 'core' },
        { s: 'S1', t: 'O1', tp: 'verify' },
      ],
    },
    dt: {
      tree: {
        n: '进入', t: 'root',
        children: [{ n: '调参操作', t: 'step', children: [] }],
      },
    },
    strategy: {
      mermaid: [
        'graph TD',
        'Start([开始]):::stratStart --> StrategySelect{选择?}:::stratCond',
        'StrategySelect -->|单变量·介质材料| AdjustM[调介质]',
        'StrategySelect -->|单变量·极板间距| AdjustD[调d]',
        'StrategySelect -->|单变量·极板面积| AdjustA[调A]',
        'StrategySelect -->|多参盲调| Trap[盲调]',
        'AdjustM --> Fire[读电容]',
        'AdjustD --> Fire',
        'AdjustA --> Fire',
        'Trap --> Fire',
        'Fire --> Observe{观察?}:::stratCond',
        'Observe -->|偏低| AdjustM',
        'Observe -->|达标| Win[过关]:::stratResult',
      ].join('\n'),
      routes: [
        { id: 'main', label: '单变量·介质材料', mapsTo: ['P1', 'O1', 'C1', 'C5', 'R1'], warn: 'x', highlightNodes: ['Start', 'StrategySelect', 'AdjustM', 'Fire', 'Observe', 'Win'], highlightEdges: [['Start', 'StrategySelect'], ['StrategySelect', 'AdjustM'], ['AdjustM', 'Fire'], ['Fire', 'Observe'], ['Observe', 'Win']] },
        { id: 'main_s-dist', label: '单变量·极板间距', mapsTo: ['P1', 'O1', 'C1', 'C5', 'R1'], warn: 'x', highlightNodes: ['Start', 'StrategySelect', 'AdjustD', 'Fire', 'Observe', 'Win'], highlightEdges: [['Start', 'StrategySelect'], ['StrategySelect', 'AdjustD'], ['AdjustD', 'Fire'], ['Fire', 'Observe'], ['Observe', 'Win']] },
        { id: 'main_s-area', label: '单变量·极板面积', mapsTo: ['P1', 'O1', 'C1', 'C5', 'R1'], warn: 'x', highlightNodes: ['Start', 'StrategySelect', 'AdjustA', 'Fire', 'Observe', 'Win'], highlightEdges: [['Start', 'StrategySelect'], ['StrategySelect', 'AdjustA'], ['AdjustA', 'Fire'], ['Fire', 'Observe'], ['Observe', 'Win']] },
        { id: 'trap', label: '多参盲调', tier: 'suboptimal', mapsTo: ['P1', 'O1', 'C1'], warn: '盲调', highlightNodes: ['Start', 'StrategySelect', 'Trap', 'Fire', 'Observe'], highlightEdges: [['Start', 'StrategySelect'], ['StrategySelect', 'Trap'], ['Trap', 'Fire'], ['Fire', 'Observe']] },
      ],
    },
    winSync: { title: '过关', sub: '' },
    traceMap: {
      controls: {
        'mat-grid': { kgId: 'O1', role: 'operation' },
        's-dist': { kgId: 'O1', role: 'operation' },
        's-area': { kgId: 'O1', role: 'operation' },
        'audio-volume': { kgId: 'I1', role: 'irrelevant' },
      },
    },
    inquiryScript: {
      summary: '电容',
      knowledgePoints: [{
        id: 'KP1',
        label: '电容',
        formulas: ['g="zh-CN">', 'ε₀εᵣA / d；击穿</div>', 'r = () => reject(new Error("x"))'],
        mapsToKg: ['S1'],
      }],
      adjustmentVariables: [
        { id: 'AV1', controlId: 'mat-grid', label: '介质材料', priorityRank: 1, monotonicity: 'unknown', mapsToKg: 'O1' },
        { id: 'AV2', controlId: 's-dist', label: '极板间距', priorityRank: 2, monotonicity: 'monotone', mapsToKg: 'O1' },
        { id: 'AV3', controlId: 's-area', label: '极板面积', priorityRank: 3, monotonicity: 'monotone', mapsToKg: 'O1' },
      ],
      confoundingVariables: [
        { id: 'CV1', controlId: 'audio-volume', label: '音量', reason: '装饰' },
      ],
      outputVariables: [
        { id: 'OV1', label: '射程', symbol: 'R', unit: 'm' },
        { id: 'OV2', label: '最大高度', symbol: 'H', unit: 'm' },
      ],
      inquiryFlow: ['KP1', 'AV1', 'AV2', 'AV3'],
      narrative: {
        intro: '本关探究：电容公式 C = ε₀εᵣA/d',
        steps: [
          { order: 1, title: '识别调节变量', body: '可调节：调参操作、调参操作、调参操作', mapsToKg: ['O1'] },
        ],
      },
    },
    physicsModel: {
      formulas: ['g="zh-CN">', 'r = () => reject(new Error("x"))'],
      dependentVariables: ['OV1', 'OV2'],
    },
  };
}

function run() {
  assert.strictEqual(isCleanFormula('C = ε₀εᵣA / d'), true);
  assert.strictEqual(isCleanFormula('r = () => reject(new Error("x"))'), false);
  assert.strictEqual(isCleanFormula('g="zh-CN">'), false);

  const polluted = pollutedCapacitorChapter();
  assert.ok(isCrossDomainOutputPollution(polluted, polluted.inquiryScript.outputVariables));

  let ch = sanitizeInquiryScriptChapter(polluted, {});
  ch = repairStrategyRouteScores(ch, {});

  assert.ok(!isCrossDomainOutputPollution(ch, ch.inquiryScript.outputVariables));
  assert.ok(ch.inquiryScript.outputVariables.every(o => !/射程|最大高度/.test(o.label)));
  assert.ok(ch.inquiryScript.knowledgePoints[0].formulas.every(f => isCleanFormula(f)));
  assert.ok(ch.inquiryScript.knowledgePoints[0].formulas.length >= 1);
  assert.ok(!/调参操作/.test(ch.kg.nodes.find(n => n.id === 'O1').label));
  assert.ok(!/调参操作/.test(ch.inquiryScript.narrative.intro + ch.inquiryScript.narrative.steps.map(s => s.body).join('')));
  assert.ok(ch.inquiryScript.adjustmentVariables.every(a => a.affects?.length && a.notes));
  assert.strictEqual(ch.inquiryScript.adjustmentVariables.find(a => a.controlId === 'mat-grid').monotonicity, 'discrete');

  const scores = ch.strategy.routes.filter(r => r.id !== 'trap').map(r => r.score);
  assert.ok(scores.length >= 2);
  assert.ok(new Set(scores).size >= 2, `scores should differ: ${scores}`);
  assert.ok(ch.strategy.routes.find(r => r.id === 'trap').score < Math.min(...scores));

  const c2 = ch.kg.nodes.find(n => n.id === 'C2');
  assert.ok(c2.constraintKind === 'gameLimit' || /工程限位|玩法/.test(c2.desc));

  const inquiry = validateInquiryScript(ch, {
    sliderControlIds: ['s-dist', 's-area'],
    variableKindSummary: { sliderCount: 2 },
    minNodes: 6,
    minConstraints: 2,
    minTeachNodes: 1,
    minVerifyLinks: 1,
    minStrategyRoutes: 2,
  });
  assert.ok(inquiry.ok, inquiry.errors.join('; '));

  console.log('inquiry-sanitize-route-scores: OK', {
    o1: ch.kg.nodes.find(n => n.id === 'O1').label,
    ov: ch.inquiryScript.outputVariables.map(o => o.label),
    scores: ch.strategy.routes.map(r => `${r.label}@${r.score}`),
  });
}

module.exports = { run };
