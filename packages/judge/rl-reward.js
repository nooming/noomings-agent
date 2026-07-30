/**
 * Agent B 导向的标量奖励（供 RL / 偏好学习）。
 * 合成轨迹 pass 不等于真实试玩；本模块对齐 trace-path-align metrics + HTML 可采集性。
 */

function computeRlReward(ctx = {}) {
  const {
    verdict,
    hasWinEvent,
    htmlValidation,
    inquiryPath,
    confoundingOnMainSlider = false,
  } = ctx;

  let reward = 0;
  const breakdown = [];

  if (verdict === 'pass' || hasWinEvent) {
    reward += 1;
    breakdown.push({ key: 'win_pass', value: 1 });
  }

  const ip = inquiryPath || {};
  const m = ip.metrics || {};
  if (ip.strategyRouteGuess === 'main' && m.singleVariableRate != null && m.singleVariableRate >= 0.8) {
    reward += 0.5;
    breakdown.push({ key: 'single_var_main', value: 0.5 });
  }

  // 切段策略分（0..1）映射到小幅奖励，避免只靠最后一发猜路径
  if (m.strategyScore != null && Number.isFinite(m.strategyScore)) {
    const v = Math.round(m.strategyScore * 0.4 * 100) / 100;
    reward += v;
    breakdown.push({ key: 'strategy_segment_score', value: v, score: m.strategyScore });
  } else if (ip.strategySegmentScore?.score != null) {
    const v = Math.round(ip.strategySegmentScore.score * 0.4 * 100) / 100;
    reward += v;
    breakdown.push({
      key: 'strategy_segment_score',
      value: v,
      score: ip.strategySegmentScore.score,
    });
  }

  if (htmlValidation && htmlValidation.ok === false) {
    reward -= 1;
    breakdown.push({ key: 'missing_control_id', value: -1, errors: htmlValidation.errors });
  }

  if (confoundingOnMainSlider) {
    reward -= 0.5;
    breakdown.push({ key: 'confound_on_slider', value: -0.5 });
  }

  if (verdict === 'learning') {
    reward -= 0.25;
    breakdown.push({ key: 'learning_verdict', value: -0.25 });
  }

  return { reward, breakdown };
}

function rewardFromJudgeResult(result, extras = {}) {
  return computeRlReward({
    verdict: result?.verdict,
    hasWinEvent: result?.hasWinEvent,
    inquiryPath: result?.inquiryPath,
    htmlValidation: extras.htmlValidation,
    confoundingOnMainSlider: extras.confoundingOnMainSlider,
  });
}

module.exports = { computeRlReward, rewardFromJudgeResult };
