/**
 * Shared rules/LLM judge + abilityScore persist (same path as POST /api/platform/judge-session).
 * Usable from HTTP handlers and CLI batch scripts without spinning up the server.
 */
const { judge } = require('../judge/judge');
const { buildJudgeRequest, normalizeTrace } = require('../judge/game-trace');
const { computeAbilityScore } = require('../judge/ability-score');
const {
  deriveTerminalOutcome,
  isTerminalSession,
  mergeTerminalOutcome,
} = require('../judge/session-terminal');
const { loadChapterForGraph } = require('./catalog');
const { getTraceSession, saveJudgeResult, saveTraceSession } = require('./trace-store');

/**
 * @param {string} sessionId
 * @param {{
 *   mode?: string,
 *   force?: boolean,
 *   leaveAuto?: boolean,
 *   graphId?: string,
 *   packageId?: string,
 *   ch?: number,
 *   llmOpts?: { apiKey?: string, apiUrl?: string },
 *   terminalOutcome?: string,
 *   attemptsExhausted?: boolean,
 *   reason?: string,
 * }} [opts]
 * @returns {Promise<object>}
 */
async function judgeAndSaveSession(sessionId, opts = {}) {
  const session = getTraceSession(sessionId);
  if (!session) {
    return { ok: false, error: 'session_not_found', sessionId };
  }

  // Client tip (new_round / new_round_pass) may land before late attempts_exhausted events.
  const tipRaw = opts.terminalOutcome != null ? String(opts.terminalOutcome) : '';
  const tipOutcome = (tipRaw === 'pass' || tipRaw === 'exhausted_fail' || tipRaw === 'incomplete')
    ? tipRaw
    : null;
  const tipExhausted = opts.attemptsExhausted === true || tipOutcome === 'exhausted_fail';
  const reasonLc = String(opts.reason || '').toLowerCase();
  if (tipExhausted) session.attemptsExhausted = true;
  if (tipOutcome) {
    session.terminalOutcome = mergeTerminalOutcome(session.terminalOutcome, tipOutcome);
  } else if (tipExhausted) {
    session.terminalOutcome = mergeTerminalOutcome(session.terminalOutcome, 'exhausted_fail');
  } else if (reasonLc === 'new_round_pass') {
    session.terminalOutcome = mergeTerminalOutcome(session.terminalOutcome, 'pass');
  }

  // Refresh / persist terminalOutcome from events before leave-skip decision.
  const derived = deriveTerminalOutcome(session);
  session.terminalOutcome = mergeTerminalOutcome(session.terminalOutcome, derived);

  const leaveAuto = opts.leaveAuto === true;
  // Leave: skip auto-judge for incomplete (non-terminal) sessions to avoid noise.
  // Still tag terminalOutcome=incomplete so teacher list can filter.
  if (leaveAuto && !isTerminalSession(session)) {
    session.terminalOutcome = mergeTerminalOutcome(session.terminalOutcome, 'incomplete');
    saveTraceSession(session);
    return {
      ok: true,
      skipped: true,
      reason: 'incomplete_non_terminal',
      sessionId: session.sessionId,
      terminalOutcome: session.terminalOutcome,
      abilityScore: session.abilityScore || undefined,
      judgeResult: session.judgeResult || undefined,
    };
  }

  const force = opts.force === true;
  if (!force && (session.judged || session.judgeResult)) {
    // Ensure terminalOutcome is persisted even on skip
    if (!session.terminalOutcome || session.terminalOutcome !== derived) {
      saveTraceSession(session);
    }
    return {
      ok: true,
      skipped: true,
      reason: 'already_judged',
      sessionId: session.sessionId,
      terminalOutcome: session.terminalOutcome || undefined,
      abilityScore: session.abilityScore || undefined,
      judgeResult: session.judgeResult || undefined,
    };
  }

  const graphId = opts.graphId || session.graphId;
  const chapter = loadChapterForGraph(graphId);
  if (!chapter) {
    return { ok: false, error: 'chapter_not_found', sessionId, graphId };
  }

  const ch = opts.ch ?? session.ch ?? 0;
  const base = buildJudgeRequest({
    ch,
    trace: normalizeTrace({ events: session.events, ch, game: session.game }, ch),
    chapter,
  });
  const graph = base.graph;
  const judgeMode = String(opts.mode || 'rules').toLowerCase();
  const llmOpts = opts.llmOpts || {};

  const result = await judge(
    { ...base, graph, chapter, mode: judgeMode, graphId, packageId: opts.packageId },
    llmOpts,
  );

  const judgedPayload = { ...result, judgedAt: new Date().toISOString() };
  const terminalOutcome = mergeTerminalOutcome(
    session.terminalOutcome,
    deriveTerminalOutcome({
      ...session,
      verdict: result?.verdict || null,
      judgeResult: judgedPayload,
    }),
  );

  let abilityScore = null;
  try {
    const pkgId = opts.packageId || session.packageId || session.catalogId || null;
    abilityScore = computeAbilityScore({
      events: Array.isArray(session.events) ? session.events : [],
      chapter,
      verdict: result?.verdict || null,
      judged: true,
      packageId: pkgId,
      graphId,
      terminalOutcome,
      attemptsExhausted: terminalOutcome === 'exhausted_fail',
    });
  } catch (_) { /* teacher lazy path remains as fallback */ }

  saveJudgeResult(
    session.sessionId,
    judgedPayload,
    {
      ...(abilityScore ? { abilityScore } : {}),
      terminalOutcome,
    },
  );

  return {
    ok: true,
    skipped: false,
    sessionId: session.sessionId,
    ch,
    ...result,
    judgedAt: judgedPayload.judgedAt,
    terminalOutcome,
    abilityScore: abilityScore || undefined,
  };
}

module.exports = {
  judgeAndSaveSession,
};
