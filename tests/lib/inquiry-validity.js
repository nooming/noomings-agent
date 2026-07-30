/**
 * Inquiry validity heuristic (strong / medium / weak) for yangben samples.
 * Based on: real CV present, dual-mode, single-var convergent routes, AV count.
 */

function inquiryValidityTier(chapter) {
  const avs = chapter?.inquiryScript?.adjustmentVariables || [];
  const cvs = chapter?.inquiryScript?.confoundingVariables || [];
  const routes = chapter?.strategy?.routes || [];
  const mermaid = String(chapter?.strategy?.mermaid || '');
  const reasons = [];

  const hasRealCv = cvs.some(c => {
    const id = String(c.controlId || '');
    const lab = String(c.label || '');
    return id && !/^mode/i.test(id) && lab;
  });
  const dualMode = /ModeSelect|选择模式|探究模式|竞赛模式|ModeExp|ModeCha|Env\{/i.test(mermaid)
    || Object.keys(chapter?.traceMap?.controls || {}).some(k => /mode/i.test(k));
  const singleVarRoutes = routes.filter(r => /单变量/.test(String(r.label || '')));
  const hasTrap = routes.some(r => /盲调|多参|trap/i.test(`${r.id || ''}${r.label || ''}`));
  const avCount = avs.length;

  let score = 0;
  if (avCount >= 1) { score += 1; reasons.push('有调节变量'); }
  if (avCount >= 2) { score += 1; reasons.push('多 AV 可对照'); }
  if (hasRealCv) { score += 2; reasons.push('有真实 CV'); }
  if (dualMode) { score += 1; reasons.push('双模式'); }
  if (singleVarRoutes.length >= 1) { score += 1; reasons.push('可单变量收敛'); }
  if (singleVarRoutes.length >= 2) { score += 1; reasons.push('多条单变量支路'); }
  if (hasTrap) { score += 0.5; reasons.push('含盲调对照'); }

  let tier = '弱';
  if (score >= 6.5) tier = '强';
  else if (score >= 4) tier = '中';

  // Cap: no real CV → at most 中
  if (!hasRealCv && tier === '强') tier = '中';
  // Cap weak if no AV
  if (avCount < 1) {
    tier = '弱';
    reasons.push('无 AV');
  }

  return {
    tier,
    score: Math.round(score * 10) / 10,
    hasRealCv,
    dualMode,
    singleVarRouteCount: singleVarRoutes.length,
    avCount,
    cvCount: cvs.length,
    reasons,
  };
}

module.exports = { inquiryValidityTier };
