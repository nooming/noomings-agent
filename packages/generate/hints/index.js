const { detectLevels } = require('../level-detect');
const {
  STANDALONE_LABEL, IRRELEVANT_RE,
  inferProjectTitle, inferWinTitle, estimateMinConstraints, collectHintKeys,
  countModeToggles, countTunableInputs,
  detectCoupledControls, detectGameplayModeSwitch, detectConditionalParamProfile,
  inferSourceComplexity,
  inferMinStrategyRoutes,
} = require('./source-scan');
const {
  inferControlIds,
  inferSliderControlIds,
  inferDiscreteControlIds,
  inferActionTriggerControlIds,
  detectActionObserveLoop,
  detectScoringTargetWin,
  inferOptionalUiToggleIds,
  isOptionalToggleWinCoupled,
  buildOptionalToggleWinCoupled,
  isTraceUiControlId,
  isTraceMapExcludedControlId,
} = require('./controls');
const { buildLevelGameHints, extractLevelSourceSnippet, inferLevelActiveToggles, narrowHintsForLevel } = require('./level-context');
const { formatGameHintsForPrompt, buildStrategyPromptHints } = require('./prompt');

function extractGameHints(sources, _chHint) {

  const allText = (sources || []).map(s => s.content || '').join('\n');

  const levelDetection = detectLevels(allText);

  const projectTitle = inferProjectTitle(sources, allText);

  const minConstraints = estimateMinConstraints(allText);

  const hasIrrelevant = IRRELEVANT_RE.test(allText);

  const winTitle = inferWinTitle(allText);

  const hintKeys = collectHintKeys(allText);

  const modeToggleCount = countModeToggles(allText);

  const tunableInputCount = countTunableInputs(allText);

  const hasCoupledControls = detectCoupledControls(allText);
  const hasGameplayModeSwitch = detectGameplayModeSwitch(allText);
  const hasConditionalParamProfile = detectConditionalParamProfile(allText);
  const inferredControlIds = inferControlIds(allText);
  const sliderControlIds = inferSliderControlIds(allText);
  const discreteControlIds = inferDiscreteControlIds(allText, sliderControlIds);
  const variableKindSummary = {
    sliderCount: sliderControlIds.length,
    discreteCount: discreteControlIds.length,
  };
  const actionTriggerControlIds = inferActionTriggerControlIds(allText);
  const actionObserveLoop = detectActionObserveLoop(allText);
  const hasScoringTargetWin = detectScoringTargetWin(allText);
  const optionalUiToggleIds = inferOptionalUiToggleIds(allText);
  const optionalToggleWinCoupled = buildOptionalToggleWinCoupled(allText, optionalUiToggleIds);

  const sourceComplexity = inferSourceComplexity(modeToggleCount, tunableInputCount, hasCoupledControls);

  const minStrategyRoutes = inferMinStrategyRoutes({

    modeToggleCount,

    tunableInputCount,

    hasCoupledControls,

    sourceComplexity,

  });



  return {

    tier: 'generic',

    chLabel: projectTitle || STANDALONE_LABEL,

    projectTitle,

    winTitle,

    hintKeys,

    hasIrrelevant,

    modeToggleCount,

    tunableInputCount,

    hasCoupledControls,

    hasConditionalParamProfile,

    hasGameplayModeSwitch,

    actionObserveLoop,

    hasScoringTargetWin,

    optionalUiToggleIds,

    optionalToggleWinCoupled,

    inferredControlIds,
    sliderControlIds,
    discreteControlIds,
    variableKindSummary,
    actionTriggerControlIds,

    sourceComplexity,

    minStrategyRoutes,

    minConstraints,

    minDecisions: minConstraints,

    minTeachNodes: 2,

    minVerifyLinks: 1,

    minNodes: sourceComplexity === 'rich' ? 9 : 8,

    maxNodes: sourceComplexity === 'rich' ? 36 : 30,

    skipWinTitleSync: !winTitle,

    hasMultipleLevels: levelDetection.hasMultipleLevels,
    levelCount: levelDetection.levelCount,
    levels: levelDetection.levels,
    uiLevelTotal: levelDetection.uiLevelTotal,
    levelArrayName: levelDetection.arrayName,
    detectionSource: levelDetection.detectionSource || null,
    detectionWarnings: levelDetection.detectionWarnings || null,

    _sourceText: allText,

  };

}

module.exports = {
  extractGameHints,
  buildLevelGameHints,
  extractLevelSourceSnippet,
  inferLevelActiveToggles,
  narrowHintsForLevel,
  formatGameHintsForPrompt,
  buildStrategyPromptHints,
  inferProjectTitle,
  countModeToggles,
  countTunableInputs,
  detectConditionalParamProfile,
  detectGameplayModeSwitch,
  detectActionObserveLoop,
  inferActionTriggerControlIds,
  inferControlIds,
  inferSliderControlIds,
  inferDiscreteControlIds,
  isTraceUiControlId,
  isTraceMapExcludedControlId,
  detectScoringTargetWin,
  inferOptionalUiToggleIds,
  isOptionalToggleWinCoupled,
  STANDALONE_LABEL,
};