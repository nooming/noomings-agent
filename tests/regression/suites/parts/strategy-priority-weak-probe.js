/**
 * Weak correlation is its own strategy-edge kind.
 * suboptimal + weakProbe must not render as 陷阱 or 旁路, and must not become 优先N.
 */
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const {
  formatPriorityEdgeLabel,
  stripPriorityAnnotation,
  isTrapRoute,
  isConfoundProbeRoute,
  isWeakProbeRoute,
  routePriorityMeta,
  strokeWidthForMeta,
  annotateStrategyMermaidPriority,
} = require('../../../../packages/shared/strategy-priority-mermaid');
const { isTrapRoute: isCoupledTrap } = require('../../../../packages/judge/coupled-invalid');
const { guessStrategyRoute } = require('../../../../packages/judge/trace-path-align');
const { repairStrategyRouteScores } = require('../../../../packages/contract/repair/strategy-route-score-repair');

const weak = {
  id: 'weak_s_m',
  label: '弱相关·锤质量',
  kind: 'weakProbe',
  tier: 'suboptimal',
  score: 0.5,
};

const confound = {
  id: 'confound_s_angle',
  label: '试探·摆角',
  kind: 'confoundProbe',
  tier: 'suboptimal',
  score: 0.15,
};

const single = {
  id: 'main_s-d',
  label: '单变量·锤位',
  priorityRank: 2,
  score: 0.85,
};

const lowSingle = {
  id: 'main_angle',
  label: '单变量·倾角',
  priorityRank: 2,
  score: 0.55,
  tier: 'suboptimal',
};

function run() {
  const weakLabel = formatPriorityEdgeLabel(weak);
  assert.equal(weakLabel, '弱相关·锤质量 · 弱相关 · 0.50');
  assert.equal(weakLabel.includes('陷阱'), false);
  assert.equal(weakLabel.includes('旁路'), false);
  assert.equal(/优先\d/.test(weakLabel), false);
  assert.equal(stripPriorityAnnotation(weakLabel), '弱相关·锤质量');
  assert.equal(formatPriorityEdgeLabel({ ...weak, label: weakLabel }), weakLabel);
  assert.equal(stripPriorityAnnotation('弱相关·杆质量 · 弱相关'), '弱相关·杆质量');

  const meta = routePriorityMeta(weak);
  assert.equal(meta.weak, true);
  assert.equal(meta.trap, false);
  assert.equal(meta.confound, false);
  assert.equal(isWeakProbeRoute(weak), true);
  assert.equal(isTrapRoute(weak), false);
  assert.equal(isConfoundProbeRoute(weak), false);
  assert.equal(isCoupledTrap(weak), false);
  const width = strokeWidthForMeta(meta);
  assert.equal(width, 2);
  assert.ok(width > strokeWidthForMeta(routePriorityMeta(confound)));
  assert.ok(width < strokeWidthForMeta(routePriorityMeta({ priorityRank: 1, score: 1, label: '单变量·杆长' })));
  assert.notEqual(width, strokeWidthForMeta(routePriorityMeta({ tier: 'suboptimal', label: '多参盲调', id: 'trap', score: 0.2 })));

  const confoundLabel = formatPriorityEdgeLabel(confound);
  assert.match(confoundLabel, /旁路/);
  assert.equal(confoundLabel.includes('弱相关'), false);
  assert.equal(confoundLabel.includes('陷阱'), false);

  const singleLabel = formatPriorityEdgeLabel(single);
  assert.match(singleLabel, /优先2/);
  assert.equal(singleLabel.includes('弱相关'), false);

  const lowSingleLabel = formatPriorityEdgeLabel(lowSingle);
  assert.match(lowSingleLabel, /陷阱/);
  assert.equal(lowSingleLabel.includes('弱相关'), false);

  const mermaid = [
    'graph TD',
    'StrategySelect -->|弱相关·锤质量| MassRoute',
    'StrategySelect -->|试探·摆角| ProbeCV',
    'StrategySelect -->|单变量·锤位| DRoute',
  ].join('\n');
  const annotated = annotateStrategyMermaidPriority(mermaid, [weak, confound, single]);
  assert.match(annotated, /-->\|弱相关·锤质量 · 弱相关 · 0\.50\|/);
  assert.equal(/-\.->\|[^|]*弱相关·锤质量 · 弱相关/.test(annotated), false);
  assert.match(annotated, /-\.->\|[^|]*旁路/);
  assert.match(annotated, /优先2/);

  const guessed = guessStrategyRoute(new Set(), 1, 1, {
    routes: [weak, confound],
  }, { cvHeavy: true });
  assert.equal(guessed.routeScores.weak_s_m, 0);
  assert.ok(guessed.routeScores.confound_s_angle > guessed.routeScores.weak_s_m);

  const repaired = repairStrategyRouteScores({
    strategy: { routes: [single, weak, { id: 'trap', label: '多参盲调', tier: 'suboptimal', score: 0.2 }] },
    inquiryScript: { adjustmentVariables: [] },
  }, {});
  const kept = repaired.strategy.routes.find(r => r.id === 'weak_s_m');
  assert.equal(kept.score, 0.5);
  assert.equal(kept.kind, 'weakProbe');

  const root = path.resolve(__dirname, '../../../..');
  const pkgDir = path.join(root, 'data', 'runtime', 'packages');
  for (const name of fs.readdirSync(pkgDir)) {
    const chapterPath = path.join(pkgDir, name, 'chapter.json');
    if (!fs.existsSync(chapterPath)) continue;
    const chapter = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
    for (const route of chapter.strategy?.routes || []) {
      const rendered = formatPriorityEdgeLabel(route);
      const isWeak = route.kind === 'weakProbe' || /^弱相关[·•.]/.test(String(route.label || ''));
      if (/^单变量/.test(String(route.label || ''))) {
        assert.equal(isWeak, false, `${name} ${route.id} single-var must stay single-var`);
        assert.equal(rendered.includes('弱相关'), false, `${name} ${route.label} => ${rendered}`);
      }
      if (isWeak) {
        assert.match(rendered, /弱相关/);
        assert.equal(rendered.includes('陷阱'), false, rendered);
        assert.equal(/优先\d/.test(rendered), false, rendered);
      }
    }
  }

  console.log('strategy-priority-weak-probe: ok');
}

module.exports = { run };
