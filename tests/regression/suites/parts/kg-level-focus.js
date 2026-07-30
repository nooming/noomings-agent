const { assert } = require('../../../lib/assert');
const { challengeLevelsStub } = require('../../../lib/html-stubs');
const { extractGameHints, buildLevelGameHints } = require('../../../../packages/generate/hints');
const { enrichChapterContract } = require('../../../../packages/contract/enrich');

function buildNoisyChapter() {
  const irr = [];
  const labels = [
    '白球电荷切换', '辅助线开关', '模式切换按钮', '教程 HUD', '帮助按钮', '重新开始按钮',
    '进球数显示', '剩余球显示', '当前模式显示', '当前关卡显示', '已进球显示',
  ];
  for (let i = 0; i < labels.length; i += 1) {
    irr.push({
      id: `I${i + 1}`,
      label: labels[i],
      group: 'irrelevant',
      layer: 'play',
      level: 0,
      r: 18,
      desc: `${labels[i]}，不影响过关判定`,
    });
  }
  const ops = [
    { id: 'O1', label: '调整电场强度 E', group: 'operation', layer: 'play', level: 1, r: 22, desc: '拖动滑条调整电场强度，影响白球加速度' },
    { id: 'O2', label: '调整磁场强度 B', group: 'operation', layer: 'play', level: 1, r: 22, desc: '拖动滑条调整垂直磁场强度，使白球轨迹偏转' },
    { id: 'O3', label: '调整电场方向 θ', group: 'operation', layer: 'play', level: 1, r: 22, desc: '微调电场方向，决定白球初始运动方向' },
    { id: 'O4', label: '锁定瞄准方向', group: 'operation', layer: 'play', level: 1, r: 22, desc: '点击台面锁定瞄准方向，显示白色实线瞄准线' },
    { id: 'O5', label: '施加电场击球', group: 'operation', layer: 'play', level: 1, r: 22, desc: '点击按钮或按空格键，对白球施加电场力击球' },
    { id: 'O6', label: '电场方向预览', group: 'operation', layer: 'play', level: 1, r: 22, desc: '鼠标在台面上移动时显示虚线瞄准线' },
  ];
  const constraints = [
    { id: 'C1', label: '目标球进洞?', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '判断目标球是否进入有效袋口，进球后得分' },
    { id: 'C2', label: '白球出界?', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '白球落袋时自动复位到开球位置并重试' },
    { id: 'C3', label: '碰撞障碍物?', group: 'constraint', layer: 'play', level: 2, r: 22, desc: '白球或目标球与矩形障碍物碰撞后反弹' },
  ];
  const playLinks = [];
  for (const o of ops) playLinks.push({ s: 'P1', t: o.id, tp: 'premise' });
  for (const o of ops) playLinks.push({ s: o.id, t: 'C1', tp: 'premise' });
  playLinks.push(
    { s: 'C1', t: 'C2', tp: 'premise' },
    { s: 'C2', t: 'C3', tp: 'premise' },
    { s: 'C3', t: 'R1', tp: 'core' },
  );

  return {
    mapping: '| DT | KG | type |\n|---|---|---|\n| 根 | P1 | premise |',
    kg: {
      title: '第 3 关：3 球 + 4 洞 + 1 障碍',
      sub: '测试',
      nodes: [
        { id: 'P1', label: '进入第 3 关', group: 'premise', layer: 'play', level: 0, r: 22, desc: '闯关模式第 3 关，含障碍物' },
        ...ops,
        ...constraints,
        { id: 'R1', label: '过关', group: 'result', layer: 'play', level: 3, r: 22, desc: '全部 3 颗目标球进洞后过关' },
        { id: 'S1', label: '教学', group: 'core', layer: 'teach', level: 0, r: 22, desc: '讲解电场力公式与调参策略' },
        ...irr,
      ],
      links: [
        ...playLinks,
        { s: 'S1', t: 'O1', tp: 'verify' },
      ],
    },
    dt: {
      title: 'DT',
      sub: '第 3 关',
      tree: {
        n: '根', t: 'root', d: '进入',
        children: [{
          n: '进洞?', t: 'decision', d: '是否进球',
          children: [
            { _e: '否', n: '重试', t: 'retry', d: '调整后再击' },
            { _e: '是', n: '过关', t: 'result', d: '达成目标' },
          ],
        }],
      },
    },
    winSync: { title: '过关', sub: 's' },
    traceMap: {
      controls: Object.fromEntries(
        [...Array.from({ length: 11 }, (_, i) => [`hud${i + 1}`, { kgId: `I${i + 1}`, role: 'irrelevant' }]),
          ['power', { kgId: 'O1', role: 'operation' }],
          ['preview', { kgId: 'O6', role: 'operation' }],
        ],
      ),
    },
    strategy: {
      title: '策略',
      sub: '策略',
      mermaid: 'graph TD\nStart([开始]):::stratStart\nStart --> Fire[击球]\nFire --> Observe{观察?}:::stratCond\nObserve -->|达标| Win[过关]:::stratResult\nObserve -->|未达标| Adjust[调参]\nAdjust --> Fire',
      routes: [
        { id: 'a', label: '主路径', mapsTo: ['P1', 'O1', 'C1', 'R1'] },
        { id: 'b', label: '绕障路径', mapsTo: ['P1', 'O1', 'C3', 'R1'] },
      ],
    },
  };
}

function run() {
  const sources = [{ path: 'challenge.html', content: challengeLevelsStub }];
  const baseHints = extractGameHints(sources);
  const level = (baseHints.levels || []).find(l => l.index === 2) || baseHints.levels?.[2];
  assert(level, 'L3 level from challengeLevelsStub');
  const gameHints = buildLevelGameHints(baseHints, level);
  assert(gameHints.levelContext?.focusMode === 'challenge', 'L3 should be challenge focus');

  const enriched = enrichChapterContract(buildNoisyChapter(), gameHints, sources);
  const nodes = enriched.kg?.nodes || [];
  const irr = nodes.filter(n => n.group === 'irrelevant' && n.layer === 'play');
  const ops = nodes.filter(n => n.group === 'operation' && n.layer === 'play');
  const p1FanOut = (enriched.kg?.links || []).filter(l =>
    l.s === 'P1' && ops.some(n => n.id === l.t),
  ).length;

  assert(irr.length <= 3, `irrelevant cap: got ${irr.length}`);
  assert(!irr.some(n => /当前关卡显示|进球数显示|剩余球/.test(`${n.label}${n.desc}`)), 'HUD display I* removed');
  assert(ops.length <= 4, `operation cap: got ${ops.length} (${ops.map(n => n.id).join(', ')})`);
  assert(p1FanOut <= 2, `P1 fan-out: got ${p1FanOut}`);
  assert(!ops.some(n => /预览|虚线/.test(`${n.label}${n.desc}`)), 'preview operation removed');
  assert(!nodes.some(n => /模式切换|教程\s*HUD|自由模式/.test(`${n.label}${n.desc}`)), 'mode UI nodes removed');

  console.log('kg-level-focus: OK');
}

module.exports = { run };
