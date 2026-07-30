function normalizeTrace(raw, ch) {
  if (!raw) return { events: [] };
  if (Array.isArray(raw.events)) {
    if (raw.events.some(e => typeof e.ch === 'number')) {
      return { events: raw.events.filter(e => e.ch === ch) };
    }
    if (typeof raw.ch === 'number' && raw.ch !== ch) return { events: [] };
    return raw;
  }
  if (Array.isArray(raw.sessions)) {
    const list = raw.sessions.filter(s => s.ch === ch);
    return list.length ? list[list.length - 1] : { events: [] };
  }
  return { events: [] };
}

const { enrichChapterContract } = require('../contract/enrich');
const { normalizeTraceForChapter } = require('./trace-normalize');

function buildJudgeRequest(opts = {}) {
  const ch = opts.ch ?? 0;
  const raw = normalizeTrace(opts.trace, ch);
  const chapter = opts.chapter
    ? enrichChapterContract(opts.chapter, opts.gameHints)
    : undefined;
  const { events } = chapter
    ? normalizeTraceForChapter(raw, chapter, ch)
    : { events: raw.events || [] };
  const trace = { ...raw, events };
  const sources = opts.sources?.length ? opts.sources : [];
  const graph = chapter
    ? { mapping: chapter.mapping, dtSummary: chapter.kg?.sub }
    : { dtSummary: '', mapping: '' };
  return { ch, trace, sources, graph, chapter };
}

module.exports = {
  normalizeTrace,
  buildJudgeRequest,
};
