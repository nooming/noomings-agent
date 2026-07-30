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
