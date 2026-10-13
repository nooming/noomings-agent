/**
 * preview 门闩：仅 judgePreview / 已存 preview，不含 kind_only。
 */
const { assert } = require('../../../lib/assert');
const {
  sessionLooksPreview,
  computeSessionAbilityScore,
} = require('../../../../packages/platform/session-ability-score');

const CHAPTER = {
  traceMap: { controls: { 's-a': { role: 'operation' }, 'btn-fire': { role: 'action' } } },
  inquiryScript: { adjustmentVariables: [{ controlId: 's-a' }] },
  strategy: { routes: [{ id: 'main', score: 1 }] },
};

function run() {
  const kindOnly = {
    events: [{ ts: 1, type: 'puzzle_open', payload: {}, ch: 0 }],
    judged: false,
    terminalOutcome: 'incomplete',
    incompleteKind: 'touch_only',
  };
  assert(!sessionLooksPreview(kindOnly), 'kind_only not preview');

  const preview = {
    events: kindOnly.events,
    judged: true,
    judgeResult: { judgePreview: true, mode: 'rule_preview' },
    terminalOutcome: 'incomplete',
  };
  assert(sessionLooksPreview(preview), 'judgePreview is preview');

  const scored = computeSessionAbilityScore(preview, CHAPTER, { incompletePreview: false });
  assert(scored.preview === true && scored.total == null, 'preview gate applied');

  const incompleteJudgedOnly = {
    events: kindOnly.events,
    judged: true,
    judgeResult: { mode: 'rule', verdict: 'in_progress' },
    terminalOutcome: 'incomplete',
  };
  assert(!sessionLooksPreview(incompleteJudgedOnly), 'incomplete+judged alone not preview');
  const raw = computeSessionAbilityScore(incompleteJudgedOnly, CHAPTER, { incompletePreview: false });
  assert(raw.preview !== true, 'no spurious preview flag');

  console.log('session-ability-preview-gate-check: ok');
}

module.exports = { run };
