/**
 * trace-timing：事件 ts 衍生时间特征（封顶 / 段时长 / 启动延迟）
 */
const { assert } = require('../../../lib/assert');
const {
  computeTimingFeatures,
  DEFAULT_GAP_CAP_MS,
} = require('../../../../packages/judge/trace-timing');

function run() {
  // 基本间隔与启动延迟
  {
    const events = [
      { ts: 1000, type: 'puzzle_open', payload: {} },
      { ts: 1500, type: 'tuning', payload: { control: 's-a' } },
      { ts: 2000, type: 'action', payload: { control: 'btn' } },
      { ts: 2500, type: 'tuning', payload: { control: 's-a' } },
      { ts: 3200, type: 'action', payload: { control: 'btn' } },
    ];
    const tf = computeTimingFeatures(events);
    assert(tf.version === 1, 'version');
    assert(tf.startupDelayMs === 500, `startupDelay=${tf.startupDelayMs}`);
    assert(tf.tuneActionGapMs.n === 3, `tuneAction n=${tf.tuneActionGapMs.n}`);
    assert(tf.tuneActionGapMs.median === 500, `tuneAction median=${tf.tuneActionGapMs.median}`);
    assert(tf.tuneTuneGapMs.n === 1, 'tuneTune n');
    assert(tf.tuneTuneGapMs.median === 1000, 'tuneTune median');
    assert(/change-only/.test(tf.notes.join(' ')), 'notes mention change-only');
  }

  // 超长 gap：剔除出中位数；段时长对单段 gap 封顶
  {
    const events = [
      { ts: 0, type: 'phase_change', payload: { phase: 'explore' } },
      { ts: 1000, type: 'tuning', payload: { control: 'a' } },
      { ts: 2000, type: 'action', payload: { control: 'b' } },
      // 挂机 5 分钟
      { ts: 302000, type: 'tuning', payload: { control: 'a' } },
      { ts: 303000, type: 'action', payload: { control: 'b' } },
      { ts: 304000, type: 'phase_change', payload: { phase: 'challenge' } },
      { ts: 314000, type: 'tuning', payload: { control: 'a' } },
      { ts: 315000, type: 'action', payload: { control: 'b' } },
    ];
    const tf = computeTimingFeatures(events, { gapCapMs: 60_000, phaseGapCapMs: 60_000 });
    assert(tf.gapCapMs === DEFAULT_GAP_CAP_MS || tf.gapCapMs === 60_000, 'gapCap');
    assert(tf.tuneActionGapMs.capped >= 1, 'long tune-action capped out of median');
    assert(tf.tuneActionGapMs.n >= 2, 'kept short gaps');
    assert(tf.tuneActionGapMs.median < 60_000, 'median not inflated by hang');
    assert(tf.phaseDurationMs.explore <= 60_000 + 60_000 + 2000, 'explore phase gaps capped');
    assert(tf.phaseDurationMs.explore > 0, 'explore duration > 0');
    assert(tf.phaseDurationMs.challenge > 0, 'challenge duration > 0');
    // 若未封顶，explore 会接近 304s；封顶后应远小于此
    assert(tf.phaseDurationMs.explore < 200_000, 'explore not raw hang duration');
  }

  // 无有效操作 → 启动延迟 null
  {
    const tf = computeTimingFeatures([
      { ts: 10, type: 'puzzle_open', payload: {} },
      { ts: 20, type: 'phase_change', payload: { phase: 'explore' } },
    ]);
    assert(tf.startupDelayMs == null, 'no op → null startup');
    assert(tf.tuneActionGapMs.n === 0, 'no tune-action gaps');
  }
}

module.exports = { run };
