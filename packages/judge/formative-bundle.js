/**
 * 评判层形成性出口：主错因 + 子技能 + 诊断面 + 固定建议（不进 v4 加权和）。
 */
'use strict';

const { attachPrimaryMisconception, PRIMARY_MISCONCEPTION_VERSION, CODE } = require('./primary-misconception');
const { computeSubskillProfile, SUBSKILL_PROFILE_VERSION } = require('./subskill-profile');
const { computeFormativeDiagnostics, FORMATIVE_DIAGNOSTICS_VERSION } = require('./formative-diagnostics');
const { remediationForPrimaryCode, primaryShortLabel, CODE_TO_SKILL_ID } = require('./remediation-map');
const { ABILITY_SCORE_VERSION } = require('./ability-score');

const FORMATIVE_BUNDLE_VERSION = 1;

function normalizeGapText(g) {
  return String(g || '').replace(/\s+/g, '').slice(0, 24);
}

function primaryGapPrefix(primary) {
  if (!primary?.label) return '';
  return normalizeGapText(primary.label);
}

function dedupGapsForPrimary(gaps, primary) {
  const list = Array.isArray(gaps) ? [...gaps] : [];
  const prefix = primaryGapPrefix(primary);
  if (!prefix) return list.slice(0, 2);
  return list.filter((g) => {
    const ng = normalizeGapText(g);
    if (!ng) return false;
    if (ng === prefix) return false;
    if (prefix.length >= 8 && ng.includes(prefix.slice(0, 8))) return false;
    if (/偏少对照|旁路|多参|连拧|偏快出手|未扎实/.test(primary.label || '')) {
      if (/偏少对照/.test(primary.label || '') && /偏少对照|少对照/.test(g)) return false;
      if (/旁路|无关|混淆/.test(primary.label || '') && /旁路|无关|混淆/.test(g)) return false;
      if (/多参|混调/.test(primary.label || '') && /多参|混调|盲调/.test(g)) return false;
      if (/连拧|偏快/.test(primary.label || '') && /连拧|偏快/.test(g)) return false;
    }
    return true;
  }).slice(0, 2);
}

function applyRemediationSuggestion(teacherSummary, remediation) {
  if (!teacherSummary || !remediation?.text) return teacherSummary;
  const out = { ...teacherSummary };
  if (!out.suggestion || out.suggestion.length < 4) {
    out.suggestion = remediation.text;
  }
  return out;
}

/**
 * @param {object} judgeResult
 * @param {object} ctx
 */
function attachFormativeAssessment(judgeResult, ctx = {}) {
  if (!judgeResult || typeof judgeResult !== 'object') return judgeResult;

  const result = attachPrimaryMisconception(judgeResult, ctx);
  const primary = result.primaryMisconception || { code: CODE.NONE, kind: 'none', label: '' };
  const remediation = remediationForPrimaryCode(primary.code);

  const bundleCtx = {
    ...ctx,
    judgeResult: result,
    primaryMisconception: primary,
  };

  const formativeAssessment = {
    version: FORMATIVE_BUNDLE_VERSION,
    computedAt: new Date().toISOString(),
    subskillProfile: computeSubskillProfile(bundleCtx),
    diagnostics: computeFormativeDiagnostics(bundleCtx),
    remediation,
  };

  const gaps = dedupGapsForPrimary(
    result.teacherSummary?.gaps?.length ? result.teacherSummary.gaps : result.gaps,
    primary,
  );

  let teacherSummary = result.teacherSummary
    ? applyRemediationSuggestion({ ...result.teacherSummary, gaps }, remediation)
    : undefined;

  return {
    ...result,
    gaps,
    primaryMisconception: primary,
    primaryShortLabel: primaryShortLabel(primary.code),
    formativeSkillId: CODE_TO_SKILL_ID[primary.code] || null,
    formativeAssessment,
    teacherSummary,
    schemaVersions: {
      abilityScore: ABILITY_SCORE_VERSION,
      primaryMisconception: PRIMARY_MISCONCEPTION_VERSION,
      subskillProfile: SUBSKILL_PROFILE_VERSION,
      formativeDiagnostics: FORMATIVE_DIAGNOSTICS_VERSION,
      formativeBundle: FORMATIVE_BUNDLE_VERSION,
    },
  };
}

/**
 * LLM 话术保留；verdict / level / 形成性结论以规则为准。
 */
function mergeLlmJudgeWithRuleStable(llmResult, ruleResult) {
  if (!llmResult || !ruleResult) return llmResult || ruleResult;
  const stable = ruleResult.formativeAssessment || {};
  const primary = ruleResult.primaryMisconception;
  const tsLlm = llmResult.teacherSummary || {};
  const tsRule = ruleResult.teacherSummary || {};

  const gaps = dedupGapsForPrimary(
    tsLlm.gaps?.length ? tsLlm.gaps : llmResult.gaps,
    primary,
  );

  const teacherSummary = {
    ...tsLlm,
    level: tsRule.level ?? tsLlm.level,
    gaps,
    suggestion: tsLlm.suggestion || tsRule.suggestion || stable.remediation?.text || '',
  };

  return {
    ...llmResult,
    mode: 'llm',
    verdict: ruleResult.verdict,
    primaryMisconception: primary,
    primaryShortLabel: ruleResult.primaryShortLabel,
    formativeSkillId: ruleResult.formativeSkillId,
    formativeAssessment: stable,
    schemaVersions: ruleResult.schemaVersions,
    gaps,
    teacherSummary,
  };
}

module.exports = {
  FORMATIVE_BUNDLE_VERSION,
  attachFormativeAssessment,
  mergeLlmJudgeWithRuleStable,
  dedupGapsForPrimary,
};
