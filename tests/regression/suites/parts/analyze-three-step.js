/** Regression: analyze-three-step rule parse + per-AV strategy plan */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runAnalyzeThreeStep } = require('../../../../packages/generate/analyze-three-step');
const { buildPerAvStrategyRoutes } = require('../../../../packages/generate/strategy-route-plan');
const { extractGameHints } = require('../../../../packages/generate/hints');

function run() {
  const htmlPath = path.join(__dirname, '../../../../data/runtime/packages/projectile-basic/game.html');
  const content = fs.readFileSync(htmlPath, 'utf8');
  const sources = [{ path: 'game.html', content }];
  const gameHints = extractGameHints(sources);
  const { analyzeParse, steps } = runAnalyzeThreeStep({ sources, gameHints });

  assert.strictEqual(steps.length, 4);
  assert.ok(analyzeParse.physicsModel.core.formulas.length >= 1);
  const avs = analyzeParse.inquiryScript.adjustmentVariables;
  assert.ok(avs.length >= 2);
  assert.ok(avs.every(a => a.priorityRank >= 1));
  const speedFirst = avs.find(a => /speed|速度/.test(`${a.controlId}${a.label}`));
  assert.ok(speedFirst);
  assert.strictEqual(speedFirst.priorityRank, 1);

  const plan = buildPerAvStrategyRoutes({ analyzeParse }, { inquiryScript: analyzeParse.inquiryScript });
  assert.ok(plan);
  assert.ok(plan.routes.some(r => /单变量·/.test(r.label)));
  assert.ok(plan.routes.some(r => r.id === 'trap'));
  const scores = plan.routes.filter(r => r.id !== 'trap').map(r => r.score);
  assert.ok(scores.length >= 2 && new Set(scores).size >= 2, `per-AV scores should differ: ${scores}`);

  console.log('analyze-three-step-check: ok', {
    avCount: avs.length,
    routes: plan.routes.map(r => `${r.label}@${r.score}`),
  });
}

module.exports = { run };
