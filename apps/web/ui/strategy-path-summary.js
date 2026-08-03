/**
 * Client helper: non-spoiler inquiry-path feedback from strategy-segment-score.
 * Default copy does NOT reveal "最优路径" / "应先调 X".
 *
 * Contract:
 *   formatSummary(scoreResult, {
 *     showScore: boolean,       // teacher: true; student: false
 *     audience: 'student'|'teacher',
 *     alignmentOk: boolean,     // false → degrade copy when trace align failed
 *     degradeReason: string,    // 'events_empty'|'align_failed'|'mode_switch'|'missing_trace'
 *     nearTies: [{ label, score }], // optional equivalent high routes
 *     scoredPhase: 'challenge'|'full'|'explore', // path-summary 评分段；challenge 时建议加轻前缀
 *   })
 *   → { text, type, advice, primary, score, audience, degraded, scoredPhase, teacherDetail? }
 */
(function (root) {
  function pathTypeLabel(primaryStrategy) {
    const s = String(primaryStrategy || '').trim();
    if (!s) return '尚不清晰';
    if (/盲调|多参|trap/i.test(s)) return '多参混调型';
    if (/混淆|confound|无关/i.test(s)) return '混淆触碰型';
    if (/空操作|empty/i.test(s)) return '观察偏少型';
    if (/单变量/.test(s)) {
      const name = s.replace(/^单变量[·•.]/, '').trim();
      // Student-facing: describe pattern, avoid "最优"
      return name ? `单变量探究（${name}）` : '单变量探究型';
    }
    return `探究路径：${s}`;
  }

  function switchKindAdvice(switchKind, bd) {
    const kind = String(switchKind || '');
    if (kind === 'focused_redirect') {
      return '你先围绕一个量连续试了几发，再换到另一个量——这是聚焦换向，方向清楚即可。';
    }
    if (kind === 'explore_converge') {
      return '前几轮有些混杂试探，后面逐渐收束到单一变量，收敛感不错；继续保持一次只改一项。';
    }
    if (kind === 'thrash') {
      return '策略切换较散、缺少连续对照块；先选定一个量连续试几发，看清趋势再换方向。';
    }
    if (kind === 'stable' && bd && bd.mainClarityBonus > 0) {
      return null; // let the single-var clarity tip handle it
    }
    return null;
  }

  function studentAdvice(scoreResult, opts) {
    const o = opts || {};
    if (o.alignmentOk === false || o.degradeReason) {
      return degradeAdvice(o.degradeReason);
    }
    const bd = scoreResult?.breakdown || {};
    const primary = scoreResult?.primaryStrategy || '';
    const tips = [];

    // 换向感知优先：收敛/聚焦换向比笼统「多参」更贴过程
    const switchTip = switchKindAdvice(bd.switchKind, bd);
    if (switchTip) {
      tips.push(switchTip);
    }

    if (bd.switchKind !== 'explore_converge' && bd.segmentCounts && bd.segmentCounts['多参盲调'] >= 2) {
      tips.push('这几轮里经常同时拧多个量，现象很难归因；下次可以试着每次只动一个控件再发射。');
    } else if (bd.switchKind !== 'explore_converge' && /盲调|多参/.test(primary)) {
      tips.push('本局主路径像「多量一起拧」。想看清因果时，固定其余、只改一项再观察。');
    }

    if (bd.cvOver) {
      tips.push('无关/装饰类控件拧得偏多，有效试次被占掉了；可以把它们当对照，点到为止。');
    } else if (bd.cvTunings >= 3 && bd.cvProbe) {
      tips.push('你有试探一些旁路控件——可以，但主探究仍宜围绕会改变结果的量。');
    }

    if (!switchTip && bd.nSwitch >= 3) {
      tips.push('策略切换较频繁，试次有点散；选定一个量连续试几发，再考虑换方向。');
    }

    if (bd.effectiveTrials != null && bd.effectiveTrials <= 1) {
      tips.push('有效发射/测试偏少，信息不够稳；可以在同一设置下多观察一次再下结论。');
    }

    if (o.nearTies && o.nearTies.length >= 2) {
      tips.push('有好几条探究路径表现接近，不必执着「唯一标准答案」；关键是能说清你控制了什么。');
    } else if (/单变量/.test(primary) && bd.mainClarityBonus > 0 && bd.switchKind !== 'thrash') {
      tips.push('你大体保持了单变量节奏，继续用「改一项→观察→再决定」即可。');
    }

    if (!tips.length) {
      tips.push('继续用控制变量的思路：一次改一项，对照观察结果是否跟着变。');
    }
    // One-liner for chip; keep short. Challenge-scored: frame lightly, never blame explore sweep.
    let tip = tips[0];
    if (o.scoredPhase === 'challenge' && tip && !/竞赛段/.test(tip)) {
      tip = `竞赛段里，${tip}`;
    }
    return tip;
  }

  function degradeAdvice(reason) {
    const r = String(reason || 'align_failed');
    if (r === 'events_empty' || r === 'missing_trace') {
      return '本局埋点不完整，暂时只能给笼统建议：注意每次只改一个量并记录发射前后的现象。';
    }
    if (r === 'mode_switch') {
      return '检测到探究/竞赛模式切换，路径对齐可能不稳；建议在同一模式下连续完成一组试次。';
    }
    return '轨迹与策略图谱未能可靠对齐，以下仅供参考：减少同时拧多量，保证每次发射前目标明确。';
  }

  function teacherDetail(scoreResult, opts) {
    const bd = scoreResult?.breakdown || {};
    return {
      score: scoreResult?.score ?? null,
      primaryStrategy: scoreResult?.primaryStrategy || null,
      nSwitch: bd.nSwitch,
      nBlockSwitch: bd.nBlockSwitch,
      switchKind: bd.switchKind || scoreResult?.switchKind || null,
      strategySequence: bd.strategySequence || scoreResult?.strategySequence || [],
      cvTunings: bd.cvTunings,
      avTunings: bd.avTunings,
      cvOver: !!bd.cvOver,
      cvProbe: !!bd.cvProbe,
      effectiveTrials: bd.effectiveTrials,
      segmentCounts: bd.segmentCounts || {},
      nearTies: opts?.nearTies || [],
      scoredPhase: opts?.scoredPhase || null,
    };
  }

  function detectNearTies(scoreResult, chapter) {
    const routes = chapter?.strategy?.routes || [];
    if (!routes.length) return [];
    const scored = routes
      .filter(r => r.score != null && !/盲调|trap/i.test(`${r.id}${r.label}`))
      .map(r => ({ label: r.label, score: Number(r.score) }))
      .sort((a, b) => b.score - a.score);
    if (scored.length < 2) return [];
    const top = scored[0].score;
    return scored.filter(r => top - r.score <= 0.08).slice(0, 4);
  }

  function formatSummary(scoreResult, opts) {
    const o = opts || {};
    const audience = o.audience === 'teacher' ? 'teacher' : 'student';
    const showScore = o.showScore != null ? !!o.showScore : audience === 'teacher';
    const primary = scoreResult?.primaryStrategy || scoreResult?.dominant?.label;
    const type = pathTypeLabel(primary);
    const score = scoreResult?.score;
    const nearTies = o.nearTies || [];
    const degraded = o.alignmentOk === false || !!o.degradeReason;

    let text = `你的探究路径类型：${type}`;
    if (nearTies.length >= 2 && !degraded) {
      text += '（多条路径表现接近）';
    }
    if (showScore && score != null && Number.isFinite(Number(score))) {
      text += `（本局策略吻合度 ${Number(score).toFixed(2)}）`;
    }

    const advice = studentAdvice(scoreResult, { ...o, nearTies });
    const out = {
      text,
      type,
      advice,
      primary: primary || null,
      score: score != null ? Number(score) : null,
      audience,
      degraded: !!degraded,
      degradeReason: o.degradeReason || null,
      scoredPhase: o.scoredPhase || null,
    };
    if (audience === 'teacher') {
      out.teacherDetail = teacherDetail(scoreResult, { nearTies, scoredPhase: o.scoredPhase });
    }
    return out;
  }

  const api = {
    pathTypeLabel,
    studentAdvice,
    switchKindAdvice,
    degradeAdvice,
    detectNearTies,
    formatSummary,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StrategyPathSummary = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
