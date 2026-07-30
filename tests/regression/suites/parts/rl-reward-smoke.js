const { assert } = require('../../../lib/assert');
const { computeRlReward, rewardFromJudgeResult } = require('../../../../packages/judge/rl-reward');

function run() {
  const passReward = computeRlReward({
    verdict: 'pass',
    hasWinEvent: true,
    inquiryPath: { strategyRouteGuess: 'main', metrics: { singleVariableRate: 1 } },
    htmlValidation: { ok: true, errors: [] },
  });
  assert(passReward.reward >= 1.5, 'pass + main single var');

  const htmlFail = computeRlReward({
    verdict: 'in_progress',
    htmlValidation: { ok: false, errors: ['missing_control_id:I1'] },
  });
  assert(htmlFail.reward <= -0.5, 'html fail penalized');

  const confound = computeRlReward({
    verdict: 'in_progress',
    htmlValidation: { ok: true, errors: [] },
    confoundingOnMainSlider: true,
  });
  assert(confound.reward < 0, 'confound on slider penalized');

  const fromJudge = rewardFromJudgeResult(
    { verdict: 'pass', inquiryPath: { strategyRouteGuess: 'main', metrics: { singleVariableRate: 0.9 } } },
    { htmlValidation: { ok: true, errors: [] } },
  );
  assert(fromJudge.reward > 0, 'rewardFromJudgeResult');

  console.log('rl-reward-smoke: OK');
}

module.exports = { run };
