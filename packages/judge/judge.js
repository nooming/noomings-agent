const { chatCompletion } = require('../shared/llm');
const { summarizeTrace } = require('./dt-align');
const { getSystem, buildUserPrompt } = require('./prompt');

const HINT_GAP_MESSAGES = {
  ok: '已接近或达到过关条件，可检查是否触发 win。',
  retry: '尚未满足全部约束，请根据提示调整后再试。',
  unknown: '请继续按游戏提示与图谱约束调整操作。',
};

const ANTI_SINGLE_VAR_GAP_RE = /未试|未尝试|未探索|未调节|方法单一|只调一|单一方法|同时调|两参|双变量|多参一起/i;
const DUAL_PARAM_SUGGESTION_RE = /同时|两参|双变量|一起调|一并调/i;

function gapFromHint(hintKey, chapter) {
  if (hintKey && HINT_GAP_MESSAGES[hintKey]) return HINT_GAP_MESSAGES[hintKey];
  if (chapter?.winSync?.sub) return `请对照过关说明调整：${chapter.winSync.sub}`;
  if (hintKey && hintKey !== 'unknown') {
    return `请对照当前提示/约束（hintKey: ${hintKey}）调整操作。`;
  }
  return HINT_GAP_MESSAGES.unknown;
}

const ROUTE_LABELS = { main: '主推途径 M', trap: '误区途径 T', teach: '教案途径 L' };

function isPassed(summary) {
  return summary.align?.dtPath?.includes('R1')
    || summary.lastSnapshot?.winOk
    || summary.hasWinEvent;
}

function isCvHeavyInquiry(summary) {
  const m = summary?.inquiryPath?.metrics || {};
  if (m.cvHeavy) return true;
  if ((summary?.irrelevantTouches || 0) > 0 && m.cvOverAv != null && m.cvOverAv >= 0.35) {
    return true;
  }
  return false;
}

function isMainSingleVariableExploration(summary) {
  const ip = summary.inquiryPath;
  if (!ip) return false;
  // CV 重度拧旁路：不得当作主推单变量成功
  if (isCvHeavyInquiry(summary)) return false;
  const rate = ip.metrics?.singleVariableRate;
  return ip.strategyRouteGuess === 'main' && rate != null && rate >= 0.8;
}

const SINGLE_VAR_PRAISE_RE = /控制变量途径|坚持单参|主推控制变量|单参调节优于|符合主推/;

function parseJudgeJson(text) {
  if (!text || typeof text !== 'string') return null;
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(raw.slice(start, end + 1));
    if (!obj || typeof obj !== 'object') return null;
    const level = Number(obj.level);
    return {
      level: level >= 1 && level <= 4 ? level : null,
      summary: String(obj.summary || '').trim(),
      strengths: Array.isArray(obj.strengths)
        ? obj.strengths.map(String).map(s => s.trim()).filter(Boolean).slice(0, 2)
        : [],
      gaps: Array.isArray(obj.gaps)
        ? obj.gaps.map(String).map(s => s.trim()).filter(Boolean).slice(0, 2)
        : [],
      suggestion: String(obj.suggestion || '').trim(),
    };
  } catch {
    return null;
  }
}

function verdictFromLevel(level, summary) {
  if (isPassed(summary)) return 'pass';
  if (isMainSingleVariableExploration(summary) && (level == null || level <= 2)) {
    return 'in_progress';
  }
  if (level == null) return 'in_progress';
  if (level >= 4) return 'pass';
  if (level === 3) return 'in_progress';
  return 'learning';
}

function truncateText(text, maxLen) {
  const s = String(text || '').trim();
  if (!s) return '';
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

function filterSingleVariableGaps(gaps) {
  return (gaps || []).filter(g => {
    if (!ANTI_SINGLE_VAR_GAP_RE.test(g)) return true;
    return /混调|盲调|交替|无关|忽视|无效调参/.test(g);
  });
}

function applyCvHeavyPolicy(result, summary) {
  if (!isCvHeavyInquiry(summary)) return result;

  const out = {
    ...result,
    strengths: [...(result.strengths || [])].filter(s => !SINGLE_VAR_PRAISE_RE.test(s)),
    gaps: [...(result.gaps || [])],
    teacherSummary: result.teacherSummary ? { ...result.teacherSummary } : undefined,
  };

  const bypassGap = '竞赛段偏重拧无关量，更像试探旁路';
  if (!out.gaps.some(g => /无关|旁路|混淆触碰|永久无关/.test(g))) {
    out.gaps.unshift(bypassGap);
  }
  out.gaps = out.gaps.slice(0, 2).map(s => truncateText(s, 30));
  out.strengths = out.strengths.slice(0, 2).map(s => truncateText(s, 30));

  if (out.teacherSummary) {
    out.teacherSummary.strengths = out.strengths;
    out.teacherSummary.gaps = out.gaps;
    if (SINGLE_VAR_PRAISE_RE.test(out.teacherSummary.summary || '')) {
      out.teacherSummary.summary = truncateText(bypassGap, 40);
    }
    if (!out.teacherSummary.suggestion || SINGLE_VAR_PRAISE_RE.test(out.teacherSummary.suggestion)) {
      out.teacherSummary.suggestion = '先停拧无关控件，回到单一有效参量';
    }
  }
  if (out.comment && SINGLE_VAR_PRAISE_RE.test(out.comment)) {
    out.comment = `[规则模式] ${bypassGap}`;
  }
  return out;
}

/**
 * 已过关但竞赛段有效对照不足 → 补一条短 gap（不改 verdict，不碰 CV 重度逻辑）。
 * 启发式（满足其一即可，见注释）：
 *  1) 评分段 AV 调节次数过低：avTunings < 2（几乎没对照就 win）
 *  2) 调了 ≥3 种 AV 且 singleVariableRate < 0.6（种类多、无一清晰占优）
 */
const PASS_WEAK_COMPARE_GAP = '过关偏少对照，建议同一变量多测几次再下结论';

function isPassWithWeakComparison(summary) {
  if (!isPassed(summary)) return false;
  if (isCvHeavyInquiry(summary)) return false; // CV 旁路另有 gap，不抢这条
  const m = summary?.inquiryPath?.metrics || {};
  const avTunings = m.avTunings;
  const tuned = Array.isArray(m.tunedControls) ? m.tunedControls : [];
  const sv = m.singleVariableRate;
  // (1) 主有效参几乎没拧就过关
  if (typeof avTunings === 'number' && avTunings < 2) return true;
  // (2) 多 AV 混调且单变量率偏低（阈值 0.6：典型三角交替约 0.56）
  if (tuned.length >= 3 && typeof sv === 'number' && sv < 0.6) return true;
  return false;
}

function applyPassWeakComparisonPolicy(result, summary) {
  if (!isPassWithWeakComparison(summary)) return result;
  if (result.verdict !== 'pass' && !isPassed(summary)) return result;

  const out = {
    ...result,
    strengths: [...(result.strengths || [])],
    gaps: [...(result.gaps || [])],
    teacherSummary: result.teacherSummary ? { ...result.teacherSummary } : undefined,
  };

  if (!out.gaps.some(g => /偏少对照|少对照|多测几次/.test(g))) {
    // 优先露出：插到最前，再截断到 2 条
    out.gaps.unshift(PASS_WEAK_COMPARE_GAP);
  }
  out.gaps = out.gaps.slice(0, 2).map(s => truncateText(s, 30));

  if (out.teacherSummary) {
    out.teacherSummary.gaps = out.gaps;
    if (!out.teacherSummary.suggestion || !/对照|多测/.test(out.teacherSummary.suggestion)) {
      out.teacherSummary.suggestion = truncateText(PASS_WEAK_COMPARE_GAP, 40);
    }
  }
  if (out.comment && !/偏少对照|少对照/.test(out.comment)) {
    out.comment = `${out.comment}；待改进：${truncateText(PASS_WEAK_COMPARE_GAP, 30)}`;
  }
  return out;
}

function applySingleVariablePolicy(result, summary) {
  if (!isMainSingleVariableExploration(summary) || isPassed(summary)) {
    return result;
  }

  const out = {
    ...result,
    strengths: [...(result.strengths || [])],
    gaps: filterSingleVariableGaps(result.gaps),
    teacherSummary: result.teacherSummary ? { ...result.teacherSummary } : undefined,
  };

  if (out.verdict === 'learning') out.verdict = 'in_progress';
  if (out.teacherSummary?.level != null && out.teacherSummary.level < 3) {
    out.teacherSummary.level = 3;
  } else if (out.teacherSummary && out.teacherSummary.level == null) {
    out.teacherSummary.level = 3;
  }

  // parameterCoverage = 探究段广度；勿把竞赛段未换参说成「探索失败」
  const coverage = summary.inquiryPath?.metrics?.parameterCoverage;
  const challengeCoverage = summary.inquiryPath?.metrics?.parameterCoverageChallenge;
  if (coverage != null && coverage < 1 && out.gaps.length < 2) {
    out.gaps.push('探究段维度尚未扫全，可换另一单参继续对照');
  }
  out.gaps = out.gaps.slice(0, 2);

  const hasSingleVarStrength = out.strengths.some(s => /单变量|控制变量|单参|主推/.test(s));
  if (!hasSingleVarStrength) {
    out.strengths.unshift('符合主推控制变量途径，单参调节优于多参混调');
  }
  out.strengths = out.strengths.slice(0, 2).map(s => truncateText(s, 30));

  if (out.teacherSummary) {
    out.teacherSummary.gaps = out.gaps.map(s => truncateText(s, 30));
    out.teacherSummary.strengths = out.strengths;
    if (out.teacherSummary.suggestion && DUAL_PARAM_SUGGESTION_RE.test(out.teacherSummary.suggestion)) {
      out.teacherSummary.suggestion = coverage != null && coverage >= 1
        ? '探究已较全，竞赛段可固定单参继续收敛'
        : '可固定已试参数，单独探索另一维度';
    } else if (!out.teacherSummary.suggestion && coverage != null && coverage < 1) {
      out.teacherSummary.suggestion = '可固定已试参数，单独探索另一维度';
    } else if (
      !out.teacherSummary.suggestion
      && coverage != null && coverage >= 1
      && challengeCoverage != null && challengeCoverage < 1
    ) {
      // 探究已覆盖、竞赛只盯一参：谈收敛而非「未探索」
      out.teacherSummary.suggestion = '探究已较全，竞赛段可固定单参继续收敛';
    }
    if (ANTI_SINGLE_VAR_GAP_RE.test(out.teacherSummary.summary)
      && !/混调|盲调|无关/.test(out.teacherSummary.summary)) {
      out.teacherSummary.summary = '坚持单变量控制，符合主推途径';
    }
  }

  if (out.comment && ANTI_SINGLE_VAR_GAP_RE.test(out.comment) && out.teacherSummary?.summary) {
    out.comment = out.teacherSummary.summary;
  }

  return out;
}

function ruleJudge(summary, chapter) {
  const { brokenCount, winAttempts, align, lastSnapshot, irrelevantTouches, inquiryPath } = summary;
  const strengths = [];
  const gaps = [];
  if (brokenCount > 0) strengths.push('轨迹中有失败或危险状态快照，属于合理试错。');
  if (align.dtPath.length >= 2) strengths.push(`操作过程已触及约束链：${align.dtPath.join(' → ')}。`);
  // 无实质亮点时不塞默认 strengths；摘要仍有「有基本操作记录」兜底（教师端会再去重）

  const hk = align.hintKey || lastSnapshot?.hintKey;
  if (hk && hk !== 'ok' && hk !== 'unknown') gaps.push(gapFromHint(hk, chapter));
  if (winAttempts > 1) gaps.push('多次触发过关判定，说明约束可能未同时满足。');
  if (irrelevantTouches > 0) gaps.push('操作了与过关永久无关的控件，理解可能有偏差。');

  const cvHeavy = isCvHeavyInquiry(summary);

  if (inquiryPath) {
    const m = inquiryPath.metrics || {};
    const route = inquiryPath.strategyRouteGuess;
    const misconceptions = inquiryPath.misconceptionTouches || [];
    if (misconceptions.length) {
      gaps.push(`当前模式下存在无效调参（${misconceptions.join('、')}），更接近策略图中的迷思/无效操作分支。`);
    }
    if (route === 'trap' || (inquiryPath.irrelevantTouches?.length && route !== 'main' && !misconceptions.length)) {
      gaps.push(`路径更接近${ROUTE_LABELS.trap || '误区途径'}（${(inquiryPath.irrelevantTouches || []).join('、')}），控制变量意识可能不足。`);
    }
    if (cvHeavy) {
      gaps.push('竞赛段偏重拧无关量，更像试探旁路。');
    }
    if (route === 'main' && inquiryPath.pathSteps?.includes('R1') && !cvHeavy) {
      strengths.push(`与${ROUTE_LABELS.main}一致，已沿 O1→约束链→R1 收敛。`);
    }
    if (route === 'main' && m.singleVariableRate != null && m.singleVariableRate >= 0.8 && !cvHeavy) {
      strengths.push('符合控制变量途径，坚持单参调节。');
    }
    if (m.singleVariableRate != null && m.singleVariableRate < 0.5 && !cvHeavy) {
      gaps.push('多控件交替调节过频，单变量控制习惯较弱。');
    }
    // 换向感知：两 AV 间切换≠陷阱；按 switchKind 给过程评语（优先插入，避免被 slice 挤掉）
    if (m.switchKind === 'focused_redirect' && !cvHeavy) {
      strengths.unshift('先聚焦再换向，策略切换有节奏。');
    } else if (m.switchKind === 'explore_converge' && !cvHeavy) {
      strengths.unshift('探索后逐渐收敛到单变量。');
    } else if (m.switchKind === 'thrash') {
      gaps.unshift('策略块切换偏散，缺少连续单变量对照。');
    }
    if (m.rationalCorrectionRate != null && m.rationalCorrectionRate >= 0.5) {
      strengths.push('失败后快照显示约束有向过关方向修正。');
    }
    if (m.boundaryAware === true && !cvHeavy) {
      strengths.push('能识别无关变量或介质边界并回到主路径。');
    }
    if (m.boundaryAware === false) {
      gaps.push('误触无关控件后未见明显回到主路径的操作。');
    }
  }

  let verdict = align.dtPath.includes('R1') || lastSnapshot?.winOk || summary.hasWinEvent
    ? 'pass'
    : brokenCount > 2 ? 'learning' : 'in_progress';
  if (isMainSingleVariableExploration(summary) && verdict === 'learning') verdict = 'in_progress';
  const level = verdict === 'pass' ? 4 : verdict === 'learning' ? 2 : 3;
  // CV 重度时不要用「单变量表扬」作摘要首句
  const strengthsClean = cvHeavy
    ? strengths.filter(s => !SINGLE_VAR_PRAISE_RE.test(s))
    : strengths;
  const teacherSummary = {
    level,
    summary: truncateText(strengthsClean[0] || (cvHeavy ? '竞赛段偏重拧无关量' : '有基本操作记录'), 40),
    strengths: strengthsClean.slice(0, 2).map(s => truncateText(s, 30)),
    gaps: gaps.slice(0, 2).map(s => truncateText(s, 30)),
    suggestion: truncateText(gaps[0] || gapFromHint('ok', chapter), 40),
  };
  const comment = `[规则模式] ${teacherSummary.summary}${gaps.length ? '；待改进：' + teacherSummary.gaps.join('；') : ''}`;
  return applyPassWeakComparisonPolicy(
    applyCvHeavyPolicy(applySingleVariablePolicy({
      mode: 'rule',
      verdict,
      strengths: teacherSummary.strengths,
      gaps: teacherSummary.gaps,
      dtAlignment: align.dtPath,
      inquiryPath: inquiryPath || undefined,
      teacherSummary,
      comment,
    }, summary), summary),
    summary,
  );
}

function buildLlmJudgeResult(text, summary) {
  let result;
  const parsed = parseJudgeJson(text);
  if (parsed) {
    const verdict = verdictFromLevel(parsed.level, summary);
    const teacherSummary = {
      level: parsed.level,
      summary: truncateText(parsed.summary, 40),
      strengths: parsed.strengths.map(s => truncateText(s, 30)),
      gaps: parsed.gaps.map(s => truncateText(s, 30)),
      suggestion: truncateText(parsed.suggestion, 40),
    };
    result = {
      mode: 'llm',
      verdict,
      strengths: teacherSummary.strengths,
      gaps: teacherSummary.gaps,
      dtAlignment: summary.align.dtPath,
      inquiryPath: summary.inquiryPath,
      teacherSummary,
      comment: teacherSummary.summary || truncateText(text, 200),
    };
  } else {
    const fallbackGaps = summary.irrelevantTouches > 0
      ? ['操作了永久无关控件']
      : (summary.inquiryPath?.misconceptionTouches?.length
        ? [`当前模式下无效调参：${summary.inquiryPath.misconceptionTouches.join('、')}`]
        : []);
    result = {
      mode: 'llm',
      verdict: verdictFromLevel(null, summary),
      strengths: [],
      gaps: fallbackGaps,
      dtAlignment: summary.align.dtPath,
      inquiryPath: summary.inquiryPath,
      teacherSummary: {
        level: null,
        summary: truncateText(text, 40),
        strengths: [],
        gaps: fallbackGaps.slice(0, 2),
        suggestion: '',
      },
      comment: truncateText(text, 200),
    };
  }
  return applyPassWeakComparisonPolicy(
    applyCvHeavyPolicy(applySingleVariablePolicy(result, summary), summary),
    summary,
  );
}

async function judge(body, opts = {}) {
  const ch = body.ch ?? 0;
  const trace = body.trace || { events: [] };
  const summary = summarizeTrace(trace, ch, body.chapter);
  const modeRaw = String(body.mode || opts.mode || '').toLowerCase();
  const preferRules = modeRaw === 'rule' || modeRaw === 'rules'
    || opts.forceRules === true
    || body.forceRules === true;

  if (preferRules || !opts.apiKey) {
    const result = ruleJudge(summary, body.chapter);
    if (!opts.apiKey && !preferRules) {
      result.comment = `[规则模式·无 Key] ${String(result.comment || '').replace(/^\[规则模式\]\s*/, '')}`;
    }
    return result;
  }

  const userPrompt = buildUserPrompt(body);
  const system = getSystem(body);

  try {
    const text = await chatCompletion(opts.apiKey, opts.apiUrl, [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ]);
    return buildLlmJudgeResult(text, summary);
  } catch (err) {
    const fallback = ruleJudge(summary, body.chapter);
    fallback.comment = `[LLM 失败，规则降级] ${fallback.comment} (${err.message})`;
    return fallback;
  }
}

module.exports = {
  judge,
  buildUserPrompt,
  ruleJudge,
  getSystem,
  parseJudgeJson,
  verdictFromLevel,
  buildLlmJudgeResult,
  applySingleVariablePolicy,
  applyCvHeavyPolicy,
  applyPassWeakComparisonPolicy,
  isPassWithWeakComparison,
  isMainSingleVariableExploration,
  isCvHeavyInquiry,
  isPassed,
  PASS_WEAK_COMPARE_GAP,
};
