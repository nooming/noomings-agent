/**
 * Win / snapshot progress fields that must survive ingest → disk.
 * Adapter and normalize must not strip these (no allowlist drop).
 */
const WIN_PROGRESS_KEYS = Object.freeze([
  'winOk',
  'interim',
  'final',
  'levelsCleared',
  'levelsTotal',
  'level',
  'levelIndex',
  'hintKey',
]);

/**
 * Clone an ingest event, preserving full payload (esp. win progress keys).
 * Never apply a field allowlist that drops interim/final/levelsCleared.
 */
function cloneTraceEvent(e) {
  if (!e || typeof e !== 'object') return e;
  const out = { ...e };
  if (e.payload && typeof e.payload === 'object' && !Array.isArray(e.payload)) {
    out.payload = { ...e.payload };
  }
  return out;
}

function cloneTraceEvents(events) {
  return (Array.isArray(events) ? events : []).map(cloneTraceEvent);
}

/** Smoke helper: which progress keys are present on a payload */
function listPresentWinProgressKeys(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return WIN_PROGRESS_KEYS.filter((k) => p[k] !== undefined);
}

module.exports = {
  WIN_PROGRESS_KEYS,
  cloneTraceEvent,
  cloneTraceEvents,
  listPresentWinProgressKeys,
};
