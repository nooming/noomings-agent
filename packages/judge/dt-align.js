/** 从轨迹 snapshot 与评判 JSON 中的 KG 对齐 DT 路径 */

const { alignFromGeneratedSnapshot, alignFromDecisionsOnly } = require('./dt-align-core');
const { tracePathAlign } = require('./trace-path-align');
const {
  filterEventsForChapter,
  normalizeTraceForChapter,
  snapshotPayloadFromEvent,
} = require('./trace-normalize');

function summarizeTrace(trace, ch, chapter) {
  const { events } = chapter?.kg
    ? normalizeTraceForChapter(trace, chapter, ch)
    : { events: filterEventsForChapter(trace, ch) };

  const types = {};
  let brokenCount = 0;
  let winAttempts = 0;
  let irrelevantTouches = 0;
  let hasWinEvent = false;
  for (const e of events) {
    types[e.type] = (types[e.type] || 0) + 1;
    const snap = snapshotPayloadFromEvent(e);
    if (e.type === 'win') hasWinEvent = true;
    if (e.type === 'snapshot' && e.payload?.bd) brokenCount++;
    if (snap?.bd) brokenCount++;
    if (e.type === 'win_attempt') winAttempts++;
    if (e.type === 'irrelevant_touch') irrelevantTouches++;
    else if (e.type === 'tuning' && chapter?.traceMap?.controls?.[e.payload?.control]?.role === 'irrelevant') {
      irrelevantTouches++;
    }
  }

  let lastPayload = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const p = snapshotPayloadFromEvent(events[i]);
    if (p?.decisions) {
      lastPayload = p;
      break;
    }
  }
  if (!lastPayload) {
    for (let i = events.length - 1; i >= 0; i--) {
      const p = snapshotPayloadFromEvent(events[i]);
      if (p) {
        lastPayload = p;
        break;
      }
    }
  }
  const align = chapter?.kg?.nodes
    ? alignFromGeneratedSnapshot(lastPayload, chapter.kg.nodes)
    : alignFromDecisionsOnly(lastPayload);

  if (hasWinEvent && !lastPayload?.winOk) {
    lastPayload = {
      ...(lastPayload || {}),
      winOk: true,
      hintKey: lastPayload?.hintKey || 'ok',
    };
  }

  const recent = events.slice(-40).map(e => {
    if (e.type === 'snapshot') {
      return { ts: e.ts, type: e.type, hintKey: e.payload?.hintKey, decisions: e.payload?.decisions };
    }
    return { ts: e.ts, type: e.type, payload: e.payload };
  });

  const inquiryPath = chapter?.kg
    ? tracePathAlign(trace, chapter, ch)
    : null;

  return {
    eventCounts: types,
    brokenCount,
    winAttempts,
    irrelevantTouches,
    hasWinEvent,
    lastSnapshot: lastPayload,
    align,
    recent,
    inquiryPath,
    filteredEventCount: events.length,
  };
}

module.exports = { alignFromGeneratedSnapshot, alignFromDecisionsOnly, summarizeTrace };
