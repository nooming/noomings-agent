/** 从 judge bundle generic 章合成 traces.bundle.json 中的轨迹（无外部游戏依赖） */
const fs = require('fs');
const path = require('path');
const {
  synthFromDtOutline,
  synthGenericIrrelevantTrace,
} = require('../../packages/generate/trace-synth');
const { loadGenericChapter, fixturesRoot } = require('../lib/fixture-loader');

const TRACES_BUNDLE = path.join(fixturesRoot(), 'traces.bundle.json');

function loadGenericChapterWithMeta() {
  const chapter = loadGenericChapter();
  chapter._ch = 0;
  return chapter;
}

function wrapTrace(synth, extra = {}) {
  if (synth.skipped) return null;
  return {
    traceVersion: 1,
    game: 'generic-demo',
    ch: 0,
    exportedAt: new Date().toISOString(),
    ...extra,
    events: synth.events,
  };
}

function synthTrapFromChapter(chapter) {
  const ch = chapter._ch ?? 0;
  const hasIrrelevant = (chapter.kg?.nodes || []).some(n => n.group === 'irrelevant');
  if (!hasIrrelevant) return null;
  return {
    label: 'trap',
    events: [
      { ts: 1, ch, type: 'puzzle_open', payload: {} },
      { ts: 2, ch, type: 'irrelevant_touch', payload: { control: 'irrelevant_ctrl', value: 2 } },
      { ts: 3, ch, type: 'tuning', payload: { control: 'step_0', value: 1 } },
      {
        ts: 4, ch, type: 'snapshot',
        payload: { decisions: { C1: false, C2: true }, hintKey: 'retry', winOk: false },
      },
    ],
  };
}

function synthBadRetryFromChapter(chapter) {
  const ch = chapter._ch ?? 0;
  const constraints = (chapter.kg?.nodes || []).filter(
    n => n.group === 'constraint' && n.layer === 'play',
  );
  const decisions = {};
  constraints.forEach(c => { decisions[c.id] = c.id === constraints[0]?.id ? false : true; });
  return {
    label: 'bad_retry',
    events: [
      { ts: 1, ch, type: 'puzzle_open', payload: {} },
      { ts: 2, ch, type: 'tuning', payload: { control: 'step_0', value: 1 } },
      { ts: 3, ch, type: 'snapshot', payload: { decisions, hintKey: 'retry', winOk: false } },
    ],
  };
}

function synthPlaythroughFilter(chapter) {
  const ch = chapter._ch ?? 0;
  const good = synthFromDtOutline({ ...chapter, _ch: ch });
  if (good.skipped) return null;
  const ch1 = [
    { ts: 100, ch: 1, type: 'puzzle_open', payload: {} },
    { ts: 101, ch: 1, type: 'tuning', payload: { control: 'other', value: 1 } },
    { ts: 102, ch: 1, type: 'snapshot', payload: { decisions: { C1: false }, hintKey: 'retry', winOk: false } },
  ];
  return {
    label: 'playthrough',
    kind: 'playthrough',
    events: [...good.events, ...ch1],
  };
}

function main() {
  const chapter = loadGenericChapterWithMeta();
  const bundle = JSON.parse(fs.readFileSync(TRACES_BUNDLE, 'utf8'));

  const updates = {
    genericGood: wrapTrace(synthFromDtOutline(chapter), { label: 'good' }),
    genericTrap: wrapTrace(synthTrapFromChapter(chapter), { label: 'trap' }),
    genericBadRetry: wrapTrace(synthBadRetryFromChapter(chapter), { label: 'bad_retry' }),
    genericPlaythrough: wrapTrace(synthPlaythroughFilter(chapter), {
      label: 'playthrough',
      kind: 'playthrough',
    }),
  };

  for (const [key, data] of Object.entries(updates)) {
    if (!data) {
      console.warn('skip', key, '(synth returned empty)');
      continue;
    }
    bundle[key] = data;
    console.log('wrote traces.bundle.json#' + key);
  }

  fs.writeFileSync(TRACES_BUNDLE, JSON.stringify(bundle, null, 2) + '\n');

  const irr = synthGenericIrrelevantTrace(chapter);
  if (!irr.skipped) {
    console.log('note: generic_irrelevant events available via synthGenericIrrelevantTrace (', irr.events.length, 'events)');
  }
  console.log('Done. judge.bundle.json#generic unchanged; genericLegacy trace preserved in bundle.');
}

main();
