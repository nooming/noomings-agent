/**
 * 能力分统一计算 / 合并：preview 门闩不被 path-summary 式裸覆盖冲掉。
 */
const { assert } = require('../../../lib/assert');
const {
  mergeAbilityScoreRecords,
  computeSessionAbilityScore,
} = require('../../../../packages/platform/session-ability-score');
const { applyIncompletePreviewAbilityScore } = require('../../../../packages/judge/incomplete-session');

const CHAPTER = {
  traceMap: {
    controls: {
      's-a': { role: 'operation', kgId: 'O1' },
      'btn-fire': { role: 'action', kgId: 'O1' },
    },
  },
  inquiryScript: {
    adjustmentVariables: [{ controlId: 's-a', label: 'A', role: 'primary' }],
  },
  strategy: { routes: [{ id: 'main', label: '单变量·A', score: 1 }] },
};

function previewStored() {
  return applyIncompletePreviewAbilityScore({
    version: 4,
    total: null,
    previewTotal: 35,
    preview: true,
    pending: true,
    bands: { result: '未完成' },
    parts: { exploreProcess: { contrib: 24 } },
    computedAt: '2026-01-01T00:00:00.000Z',
  });
}

function bareRecompute() {
  return {
    version: 4,
    total: null,
    previewTotal: 35,
    pending: true,
    bands: { result: '未完成' },
    parts: { exploreProcess: { contrib: 24 } },
    computedAt: '2026-01-02T00:00:00.000Z',
  };
}

function run() {
  const stored = previewStored();
  const incoming = bareRecompute();
  const merged = mergeAbilityScoreRecords(stored, incoming);
  assert(merged.preview === true, 'merge keeps preview flag');
  assert(merged.total == null, 'merge keeps total null');
  assert(merged.previewTotal === 35, 'merge keeps previewTotal');

  const events = [
    { ts: 1, type: 'puzzle_open', payload: {}, ch: 0 },
    { ts: 2, type: 'phase_change', payload: { phase: 'explore' }, ch: 0 },
    { ts: 3, type: 'tuning', payload: { control: 's-a', value: 1 }, ch: 0 },
    { ts: 4, type: 'action', payload: { control: 'btn-fire' }, ch: 0 },
  ];
  const session = {
    events,
    judged: true,
    judgeResult: { judgePreview: true, mode: 'rule_preview', verdict: 'in_progress' },
    terminalOutcome: 'incomplete',
  };
  const scored = computeSessionAbilityScore(session, CHAPTER, { incompletePreview: true });
  assert(scored.preview && scored.total == null, 'computeSession preview gate');
  assert(Number.isFinite(scored.previewTotal), 'computeSession previewTotal');

  console.log('session-ability-merge-check: ok');
}

module.exports = { run };
