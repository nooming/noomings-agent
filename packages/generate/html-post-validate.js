/** Post-validate LLM-generated game HTML against chapter traceMap. */

const { isMotionTopic, MOTION_TOPIC_RE } = require('./game-spec');

function topicFromChapter(chapter, opts = {}) {
  return opts.topic
    || chapter?.kg?.title
    || chapter?.inquiryScript?.summary
    || '';
}

function isMotionChapter(chapter, opts = {}) {
  if (chapter?.gameSpec?.needsContinuousSim || chapter?.gameHints?.needsContinuousSim) return true;
  return isMotionTopic(topicFromChapter(chapter, opts));
}

function validateGeneratedHtml(html, chapter, opts = {}) {
  const text = String(html || '');
  const errors = [];
  const warnings = [];
  const controls = chapter?.traceMap?.controls || {};
  const topic = topicFromChapter(chapter, opts);
  const motion = isMotionChapter(chapter, opts);

  for (const id of Object.keys(controls)) {
    const re = new RegExp(`\\bid=["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`);
    if (!re.test(text)) {
      errors.push(`missing_control_id:${id}`);
    }
  }

  if (!/<canvas[\s>]/i.test(text)) {
    errors.push('missing_canvas');
  }

  const hookCount = (text.match(/<!-- trace-adapter-hook -->/g) || []).length;
  if (hookCount !== 1) {
    warnings.push(`trace_hook_count:${hookCount}`);
  }

  const { hasExecutableTraceHook, hasTraceHookMarker } = require('../platform/legacy-trace-inject');
  if (hasTraceHookMarker(text) && !hasExecutableTraceHook(text)) {
    warnings.push('trace_hook_marker_only');
  }

  const emitCount = (text.match(/function emit\s*\(/g) || []).length;
  if (emitCount > 1) {
    warnings.push(`multiple_emit_definitions:${emitCount}`);
  }

  const hasWinEmit = /(?:emit|emitFn|__emit|__traceHookEmit)\s*\(\s*['"]win['"]|PlatformTraceAdapter\.record\s*\(\s*['"]win['"]/.test(text);
  const hasWinOk = /winOk\s*=\s*true|winOk:\s*true/.test(text);
  if (!hasWinEmit && !hasWinOk) {
    errors.push('missing_win_emit');
  }

  const hasRaf = /requestAnimationFrame/.test(text);
  if (motion && !hasRaf) {
    errors.push('motion_topic_without_raf');
  }

  if (motion && hasRaf) {
    const hasSimLoop = /function\s+(update|draw)\s*\(|\.update\s*\(|\.draw\s*\(/.test(text);
    if (!hasSimLoop) {
      errors.push('missing_sim_loop');
    }
  }

  const rangeIds = Object.keys(controls).filter(id => {
    const specCtrl = (chapter?.gameSpec?.controls || []).find(c => c.id === id);
    if (specCtrl?.type === 'button' || specCtrl?.type === 'discrete') return false;
    if (specCtrl?.type === 'range') return true;
    const idEsc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
      `id=["']${idEsc}["'][^>]*type=["']range["']|type=["']range["'][^>]*id=["']${idEsc}["']`,
      'i',
    ).test(text);
  });
  for (const id of rangeIds) {
    const idEsc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nearValue = new RegExp(
      `id=["']${idEsc}["'][\\s\\S]{0,500}(value-badge|type=["']number["']|Display|读数|数值)|`
      + `(value-badge|type=["']number["']|Display)[\\s\\S]{0,500}id=["']${idEsc}["']`,
      'i',
    );
    if (!nearValue.test(text)) {
      warnings.push(`missing_value_display:${id}`);
    }
  }

  const hasFireButton = /btn-fire|btn-test|btn-launch|发射|测试|launch\s*\(/i.test(text);
  if (!hasRaf && !hasFireButton && hasWinOk) {
    warnings.push('instant_win_pattern');
  }

  // Soft craft-gold classroom pattern checks (warnings only — do not fail legacy samples)
  const hasCvControls = (chapter?.gameSpec?.controls || []).some(c => c.role === 'confounding')
    || (chapter?.inquiryScript?.confoundingVariables || []).some(c => c.controlId);
  if (hasCvControls) {
    const spoilerOnKnob = /<(?:label|span)[^>]{0,120}>([^<]{0,80}(?:不影响|仅视觉|旁路|混淆变量)[^<]{0,40})<\/(?:label|span)>/i.test(text);
    if (spoilerOnKnob) warnings.push('cv_spoiler_label_on_knob');
  }

  const hasPostMeasure = /已落入/.test(text) && /偏低/.test(text) && /偏高/.test(text);
  const hasPendingMeasure = /待测/.test(text);
  if (/modeSelect|challenge/.test(text) && (!hasPostMeasure || !hasPendingMeasure)) {
    warnings.push('missing_challenge_post_measure_feedback');
  }

  const hasAttrMcq = /name=["']craftAttr["']|attribution/.test(text);
  const hasCraftWin = /craft-win|craftWin|__craftShowWin/.test(text);
  if ((hasCraftWin || /emit\s*\(\s*['"]win['"]/.test(text)) && !hasAttrMcq) {
    warnings.push('missing_win_attribution_mcq');
  }

  const hasCraftTokens = /--craft-bg|--craft-panel|--craft-accent/.test(text)
    || /craft-tokens\.css/.test(text);
  if (!hasCraftTokens) {
    warnings.push('missing_craft_tokens');
  }

  // Soft craft shell IA checks (warnings only)
  const hasDualMode = /id=["']modeSelect["']|#modeSelect/.test(text);
  if (hasDualMode) {
    if (!/\bbench-hd\b/.test(text)) warnings.push('missing_bench_hd');
    if (!/\bside-goal-box\b/.test(text)) warnings.push('missing_side_goal_box');
    if (!/\bcraft-mode-pill\b/.test(text)) warnings.push('missing_craft_mode_pill');
    const hasShellLink = /craft-shell\.css/.test(text);
    const hasInlineShell = hasShellLink
      || /\.bench-hd[\w.-]*\s*\{/.test(text)
      || /\.side-goal-box\s*\{/.test(text)
      || /\.craft-mode-pill\b[\w.#\s>-]*\{|#dual-mode-hud\.craft-mode-pill\s*\{/.test(text);
    if (!hasInlineShell) {
      warnings.push('missing_craft_shell_link_or_inline');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    motion,
  };
}

module.exports = {
  validateGeneratedHtml,
  MOTION_TOPIC_RE,
  isMotionChapter,
};
