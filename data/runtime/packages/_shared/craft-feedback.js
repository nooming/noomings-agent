/**
 * Challenge post-measure feedback wording (thin helper).
 * Winner source: thermo trio + pulley-rigid
 *   待测 → 实测值 + 偏低 | 偏高 | 已落入
 *
 * Usage:
 *   CraftFeedback.relativeWord('low') // '偏低'
 *   CraftFeedback.hitHint({ measured: 'P≈1.2', band: '1.0–1.5' })
 *   CraftFeedback.missHint({ verdict: 'high', measured: 'P≈2.0', band: '1.0–1.5' })
 */
(function (global) {
  var PENDING = '待测';
  var HIT = '已落入';
  var LOW = '偏低';
  var HIGH = '偏高';

  function relativeWord(verdict) {
    if (verdict === 'ok' || verdict === 'hit' || verdict === true) return HIT;
    if (verdict === 'low' || verdict === 'below') return LOW;
    if (verdict === 'high' || verdict === 'above') return HIGH;
    return PENDING;
  }

  function fromValue(value, lo, hi) {
    if (value == null || !Number.isFinite(+value)) return null;
    var v = +value;
    if (v < +lo) return 'low';
    if (v > +hi) return 'high';
    return 'ok';
  }

  function hitHint(opts) {
    opts = opts || {};
    var m = opts.measured != null ? String(opts.measured) : '';
    var band = opts.band != null ? String(opts.band) : '';
    if (m && band) return HIT + ' · ' + m + '（目标 ' + band + '）';
    if (m) return HIT + ' · ' + m;
    if (band) return HIT + ' · ' + band;
    return HIT;
  }

  function missHint(opts) {
    opts = opts || {};
    var side = relativeWord(opts.verdict || opts.side);
    if (side === HIT || side === PENDING) side = HIGH;
    var m = opts.measured != null ? String(opts.measured) : '';
    var band = opts.band != null ? String(opts.band) : '';
    var tail = opts.retryText != null ? String(opts.retryText) : '调参后再测';
    if (m && band) return side + ' · ' + m + '（目标 ' + band + '）· ' + tail;
    if (m) return side + ' · ' + m + ' · ' + tail;
    return side + ' · ' + tail;
  }

  global.CraftFeedback = {
    PENDING: PENDING,
    HIT: HIT,
    LOW: LOW,
    HIGH: HIGH,
    relativeWord: relativeWord,
    fromValue: fromValue,
    hitHint: hitHint,
    missHint: missHint,
  };
})(typeof window !== 'undefined' ? window : globalThis);
