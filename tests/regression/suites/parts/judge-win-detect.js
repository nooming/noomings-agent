const { assert } = require('../../../lib/assert');
const { summarizeTrace } = require('../../../../packages/judge/dt-align');
const { ruleJudge, isPassed, verdictFromLevel } = require('../../../../packages/judge/judge');

const FIXTURE_CHAPTER = {
  kg: {
    nodes: [
      { id: 'P1', group: 'premise', label: '进入' },
      { id: 'O1', group: 'operation', label: '调参' },
      { id: 'C1', group: 'constraint', label: '落入筐中' },
      { id: 'R1', group: 'result', label: '过关' },
    ],
  },
  traceMap: {
    controls: {
      's-speed': { role: 'operation', kgId: 'O1' },
      's-angle': { role: 'operation', kgId: 'O1' },
      'btn-fire': { role: 'action', kgId: 'O1' },
    },
  },
};

function baseEvents() {
  return [
    { ts: 1, type: 'puzzle_open', payload: {}, ch: 0 },
    { ts: 10, type: 'tuning', payload: { control: 's-speed', value: '15' }, ch: 0 },
    { ts: 20, type: 'action', payload: { control: 'btn-fire' }, ch: 0 },
  ];
}

function judgeWinDetectCheck() {
  const winOnlyTrace = { events: [...baseEvents(), { ts: 30, type: 'win', payload: {}, ch: 0 }] };
  const winSummary = summarizeTrace(winOnlyTrace, 0, FIXTURE_CHAPTER);
  assert(winSummary.hasWinEvent, 'hasWinEvent from win type');
  assert(winSummary.lastSnapshot?.winOk === true, 'win event synthesizes lastSnapshot.winOk');
  assert(isPassed(winSummary), 'isPassed with win event');
  assert(ruleJudge(winSummary, FIXTURE_CHAPTER).verdict === 'pass', 'ruleJudge pass on win event');
  assert(verdictFromLevel(3, winSummary) === 'pass', 'verdictFromLevel pass when win event');

  const snapshotWinTrace = {
    events: [
      ...baseEvents(),
      {
        ts: 30,
        type: 'snapshot',
        payload: { controls: { 's-speed': '15' }, winOk: true, hintKey: 'ok' },
        ch: 0,
      },
    ],
  };
  const snapSummary = summarizeTrace(snapshotWinTrace, 0, FIXTURE_CHAPTER);
  assert(!snapSummary.hasWinEvent, 'no win type when only snapshot.winOk');
  assert(snapSummary.lastSnapshot?.winOk === true, 'snapshot winOk preserved');
  assert(ruleJudge(snapSummary, FIXTURE_CHAPTER).verdict === 'pass', 'ruleJudge pass on snapshot.winOk');

  const noWinTrace = {
    events: [
      ...baseEvents(),
      {
        ts: 30,
        type: 'snapshot',
        payload: { controls: { 's-speed': '15' }, winOk: false, hintKey: 'retry' },
        ch: 0,
      },
    ],
  };
  const failSummary = summarizeTrace(noWinTrace, 0, FIXTURE_CHAPTER);
  assert(!isPassed(failSummary), 'not passed without win');
  assert(ruleJudge(failSummary, FIXTURE_CHAPTER).verdict === 'in_progress', 'ruleJudge in_progress when not won');

  console.log('judge-win-detect-check: OK');
}

module.exports = { run: judgeWinDetectCheck };
