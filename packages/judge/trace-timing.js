/**
 * 基于事件 ts 的时间衍生特征（纯函数，不新增埋点类型）。
 *
 * 注意：
 * - 滑条多在 `change`（松手）才记 tuning → 细间隔偏粗，连续拧条时中间过程不可见。
 * - 切后台、挂机会把 Δt 拉爆 → 间隔统计默认剔除超过 cap 的样本；段时长对相邻事件 gap 封顶后再累加。
 * - 事件 ts 来自客户端 Date.now()（见 apps/web/ui/trace-adapter-platform.js record）。
 */

'use strict';

/** 默认间隔上限：超过则不进中位数/均值（毫秒） */
const DEFAULT_GAP_CAP_MS = 60_000;

/** 段内相邻事件 gap 封顶（毫秒）；缺省与间隔 cap 相同 */
const DEFAULT_PHASE_GAP_CAP_MS = 60_000;

const TIMING_FEATURES_VERSION = 1;

const NOTES = Object.freeze([
  'change-only tuning: slider often recorded on change/release, fine-grained intervals are coarse',
  'gaps capped: Δt above cap excluded from median/mean; phase duration caps per-event gaps',
]);

function isFiniteTs(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function eventTs(e) {
  if (!e || typeof e !== 'object') return null;
  return isFiniteTs(e.ts) ?? isFiniteTs(e.t) ?? null;
}

function median(sortedNums) {
  const n = sortedNums.length;
  if (!n) return null;
  const mid = Math.floor(n / 2);
  if (n % 2) return sortedNums[mid];
  return (sortedNums[mid - 1] + sortedNums[mid]) / 2;
}

function mean(nums) {
  if (!nums.length) return null;
  let s = 0;
  for (const x of nums) s += x;
  return s / nums.length;
}

function roundMs(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n);
}

/**
 * @param {number[]} gaps
 * @param {number} capMs
 * @returns {{ median: number|null, mean: number|null, n: number, capped: number, rawN: number }}
 */
function summarizeGaps(gaps, capMs) {
  const rawN = gaps.length;
  const kept = [];
  let capped = 0;
  for (const g of gaps) {
    if (!Number.isFinite(g) || g < 0) continue;
    if (g > capMs) {
      capped += 1;
      continue;
    }
    kept.push(g);
  }
  kept.sort((a, b) => a - b);
  return {
    median: roundMs(median(kept)),
    mean: roundMs(mean(kept)),
    n: kept.length,
    capped,
    rawN,
  };
}

/**
 * 调参↔动作：按时间序的 tuning/action 操作流，相邻类型不同时记 |Δt|。
 * @param {object[]} timedOps
 * @returns {number[]}
 */
function collectTuneActionGaps(timedOps) {
  const gaps = [];
  for (let i = 1; i < timedOps.length; i += 1) {
    const prev = timedOps[i - 1];
    const cur = timedOps[i];
    if (prev.type === cur.type) continue;
    if (
      (prev.type === 'tuning' && cur.type === 'action')
      || (prev.type === 'action' && cur.type === 'tuning')
    ) {
      gaps.push(cur.ts - prev.ts);
    }
  }
  return gaps;
}

/**
 * 相邻 tuning 的 Δt（按时间序的 tuning 事件，中间可夹杂其它类型）。
 * @param {object[]} timedTunings
 * @returns {number[]}
 */
function collectTuneTuneGaps(timedTunings) {
  const gaps = [];
  for (let i = 1; i < timedTunings.length; i += 1) {
    gaps.push(timedTunings[i].ts - timedTunings[i - 1].ts);
  }
  return gaps;
}

/**
 * 按 phase_change 分段累计时长；单段内相邻事件 gap 封顶后累加。
 * 无 phase_change 时全部计入 unknown。
 * @param {object[]} timedEvents
 * @param {number} phaseGapCapMs
 */
function accumulatePhaseDurations(timedEvents, phaseGapCapMs) {
  const out = { explore: 0, challenge: 0, unknown: 0 };
  if (timedEvents.length < 2) return out;

  let phase = 'unknown';
  let sawPhaseChange = false;

  for (let i = 0; i < timedEvents.length; i += 1) {
    const e = timedEvents[i];
    if (e.type === 'phase_change') {
      const p = e.payload?.phase || e.phase;
      if (p === 'explore' || p === 'challenge') {
        phase = p;
        sawPhaseChange = true;
      }
    }
    if (i === 0) continue;
    const prev = timedEvents[i - 1];
    let gap = e.ts - prev.ts;
    if (!Number.isFinite(gap) || gap < 0) continue;
    if (gap > phaseGapCapMs) gap = phaseGapCapMs;
    const bucket = sawPhaseChange ? phase : 'unknown';
    if (bucket === 'explore' || bucket === 'challenge') out[bucket] += gap;
    else out.unknown += gap;
  }
  return {
    explore: roundMs(out.explore) || 0,
    challenge: roundMs(out.challenge) || 0,
    unknown: roundMs(out.unknown) || 0,
  };
}

/**
 * @param {object[]} events
 * @param {{
 *   gapCapMs?: number,
 *   phaseGapCapMs?: number,
 *   sessionStartTs?: number|null,
 * }} [opts]
 * @returns {object}
 */
function computeTimingFeatures(events, opts = {}) {
  const gapCapMs = Number.isFinite(Number(opts.gapCapMs))
    ? Math.max(1000, Number(opts.gapCapMs))
    : DEFAULT_GAP_CAP_MS;
  const phaseGapCapMs = Number.isFinite(Number(opts.phaseGapCapMs))
    ? Math.max(1000, Number(opts.phaseGapCapMs))
    : (opts.gapCapMs != null ? gapCapMs : DEFAULT_PHASE_GAP_CAP_MS);

  const list = Array.isArray(events) ? events : [];
  const timed = [];
  for (const e of list) {
    const ts = eventTs(e);
    if (ts == null) continue;
    timed.push({
      ts,
      type: e.type,
      payload: e.payload,
      phase: e.payload?.phase,
    });
  }
  timed.sort((a, b) => a.ts - b.ts || 0);

  const timedOps = timed.filter((e) => e.type === 'tuning' || e.type === 'action');
  const timedTunings = timed.filter((e) => e.type === 'tuning');

  const originTs = isFiniteTs(opts.sessionStartTs) ?? (timed.length ? timed[0].ts : null);
  const firstOpTs = timedOps.length ? timedOps[0].ts : null;
  const startupDelayMs = (originTs != null && firstOpTs != null)
    ? roundMs(Math.max(0, firstOpTs - originTs))
    : null;

  const tuneActionGapMs = summarizeGaps(collectTuneActionGaps(timedOps), gapCapMs);
  const tuneTuneGapMs = summarizeGaps(collectTuneTuneGaps(timedTunings), gapCapMs);
  const phaseDurationMs = accumulatePhaseDurations(timed, phaseGapCapMs);

  return {
    version: TIMING_FEATURES_VERSION,
    startupDelayMs,
    tuneActionGapMs: {
      median: tuneActionGapMs.median,
      mean: tuneActionGapMs.mean,
      n: tuneActionGapMs.n,
      capped: tuneActionGapMs.capped,
    },
    tuneTuneGapMs: {
      median: tuneTuneGapMs.median,
      mean: tuneTuneGapMs.mean,
      n: tuneTuneGapMs.n,
      capped: tuneTuneGapMs.capped,
    },
    phaseDurationMs: {
      explore: phaseDurationMs.explore,
      challenge: phaseDurationMs.challenge,
      unknown: phaseDurationMs.unknown,
    },
    gapCapMs,
    phaseGapCapMs,
    notes: [...NOTES, `gaps capped at ${gapCapMs}ms; phase gaps capped at ${phaseGapCapMs}ms`],
  };
}

const api = {
  TIMING_FEATURES_VERSION,
  DEFAULT_GAP_CAP_MS,
  DEFAULT_PHASE_GAP_CAP_MS,
  computeTimingFeatures,
};

if (typeof module === 'object' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.TraceTiming = api;
}
