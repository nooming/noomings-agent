const { GENERIC_DT_TREE_EXAMPLE } = require('../contract');
const { formatGameHintsForPrompt } = require('./hints');
const { normalizeDtChapter } = require('../contract/repair/dt-branch-normalize');

const DT_STRUCT_ERRORS = [
  'dt needs at least 1 result',
  'dt needs at least 1 retry',
  'dt needs at least 1 decision',
  'dt.tree missing',
];

function needsDtSkeletonRepair(validation) {
  if (!validation?.errors?.length) return false;
  return validation.errors.some(e =>
    DT_STRUCT_ERRORS.some(sig => String(e).includes(sig)),
  );
}

const DT_QUALITY_ERRORS = [
  '? branch should be retry',
  '? branch should lead',
  '? branch should be retry',
  '? branch should lead',
  'DT first decision must be mode/env',
  'coupled mode strategy needs :::stratInvalid',
  'strategy needs :::stratInvalid misconception loop',
];

function needsCoupledQualityRepair(quality) {
  if (!quality?.checklist) return false;
  const c = quality.checklist;
  return c.coupledStratInvalid === false
    || c.strategyMisconceptionLoop === false
    || c.dtEnvAlignment === false;
}

function needsDtQualityRepair(quality) {
  if (needsCoupledQualityRepair(quality)) return true;
  if (!quality?.errors?.length) return false;
  return quality.errors.some(e => {
    const s = String(e);
    return DT_QUALITY_ERRORS.some(sig => s.includes(sig))
      && (s.includes('decision') || s.includes('stratInvalid') || s.includes('mode/env'));
  });
}

function buildDtSkeletonRepairPrompt(chapter, gameHints, errors) {
  return [
    '??? dt.tree ???decision/retry/result ??? _e???? kg?winSync?mapping?traceMap?strategy ??????? traceMap/strategy?',
    '???? 1 ? t:"retry"?1 ? t:"result"?1 ? t:"decision"?????????? t:"step"?',
    GENERIC_DT_TREE_EXAMPLE,
    formatGameHintsForPrompt(gameHints),
    `????:\n${(errors || []).join('\n')}`,
    `\n?? JSON??????????:\n${JSON.stringify(chapter, null, 2).slice(0, 8000)}`,
  ].join('\n');
}

function buildDtBranchRepairPrompt(chapter, gameHints, errors) {
  return [
    '??? dt.tree ? decision ?? polarity ??????_e ? retry/result ???????? kg?winSync?mapping?traceMap?strategy ???',
    '??? decision??? ??/??/??/??/???/invalid/fail????retry????????????? decision???result???retry?',
    '?????????/?? vs ??????? decision ????????? decision ?????? decision ? _e:"?" ??',
    GENERIC_DT_TREE_EXAMPLE,
    formatGameHintsForPrompt(gameHints),
    `????:\n${(errors || []).join('\n')}`,
    `\n?? JSON??????????:\n${JSON.stringify(chapter, null, 2).slice(0, 8000)}`,
  ].join('\n');
}

/** ??????????? result???? decision ?? retry */
function patchDtSkeleton(chapter) {
  if (!chapter?.dt?.tree) return chapter;
  const tree = JSON.parse(JSON.stringify(chapter.dt.tree));
  let hasResult = false;
  let hasRetry = false;
  let hasDecision = false;

  const walk = n => {
    if (n.t === 'result') hasResult = true;
    if (n.t === 'retry') hasRetry = true;
    if (n.t === 'decision') hasDecision = true;
    (n.children || []).forEach(walk);
  };
  walk(tree);

  if (!hasDecision) {
    tree.children = tree.children || [];
    tree.children.push({
      n: '????',
      t: 'decision',
      d: '????????',
      children: [
        { _e: '?', n: '??????', t: 'retry', d: '?????' },
        { _e: '?', n: '??', t: 'result', d: chapter.winSync?.title || '??' },
      ],
    });
    hasDecision = true;
    hasRetry = true;
    hasResult = true;
  } else if (!hasRetry || !hasResult) {
    const patchDecision = n => {
      if (n.t !== 'decision') {
        (n.children || []).forEach(patchDecision);
        return;
      }
      n.children = n.children || [];
      if (!hasRetry && !n.children.some(c => c.t === 'retry')) {
        n.children.unshift({ _e: '?', n: '??????', t: 'retry', d: '?????' });
        hasRetry = true;
      }
      if (!hasResult && !n.children.some(c => c.t === 'result')) {
        n.children.push({ _e: '?', n: '??', t: 'result', d: chapter.winSync?.title || '??' });
        hasResult = true;
      }
      (n.children || []).forEach(patchDecision);
    };
    patchDecision(tree);
  }

  return { ...chapter, dt: { ...chapter.dt, tree } };
}

module.exports = {
  needsDtSkeletonRepair,
  needsDtQualityRepair,
  needsCoupledQualityRepair,
  buildDtSkeletonRepairPrompt,
  buildDtBranchRepairPrompt,
  patchDtSkeleton,
  normalizeDtChapter,
};
