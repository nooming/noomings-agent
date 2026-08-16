/**
 * Browser mirror of packages/judge/session-terminal.js
 * Terminal = pass/win OR attempts exhausted without win.
 */
(function (global) {
  const TERMINAL_OUTCOMES = Object.freeze({
    PASS: 'pass',
    EXHAUSTED_FAIL: 'exhausted_fail',
    INCOMPLETE: 'incomplete',
  });

  function eventsHaveWin(events) {
    return (Array.isArray(events) ? events : []).some(
      (e) => e?.type === 'win' || (e?.type === 'snapshot' && e?.payload?.winOk),
    );
  }

  function eventsHaveAttemptsExhausted(events) {
    return (Array.isArray(events) ? events : []).some((e) => {
      if (e?.type === 'attempts_exhausted') return true;
      if (e?.type === 'snapshot' && e?.payload) {
        if (e.payload.attemptsExhausted === true) return true;
        if (e.payload.hintKey === 'attempts_exhausted') return true;
      }
      return false;
    });
  }

  function deriveTerminalOutcome(session) {
    if (!session || typeof session !== 'object') return TERMINAL_OUTCOMES.INCOMPLETE;

    const stored = session.terminalOutcome || session.sessionOutcome || null;
    const events = session.events;
    const hasEvents = Array.isArray(events);
    const verdict = session.verdict || session.judgeResult?.verdict || null;
    const abilityResult = session.abilityScore?.bands?.challengeResult
      || session.abilityScore?.bands?.result;

    const won = verdict === 'pass'
      || abilityResult === '达标'
      || stored === TERMINAL_OUTCOMES.PASS
      || (hasEvents && eventsHaveWin(events));

    if (won) return TERMINAL_OUTCOMES.PASS;

    const resultPart = session.abilityScore?.parts?.result;
    const exhausted = stored === TERMINAL_OUTCOMES.EXHAUSTED_FAIL
      || session.attemptsExhausted === true
      || abilityResult === '未达标'
      || !!resultPart?.attemptsExhausted
      || (hasEvents && eventsHaveAttemptsExhausted(events));

    if (exhausted) return TERMINAL_OUTCOMES.EXHAUSTED_FAIL;

    return TERMINAL_OUTCOMES.INCOMPLETE;
  }

  function isTerminalSession(session) {
    const o = deriveTerminalOutcome(session);
    return o === TERMINAL_OUTCOMES.PASS || o === TERMINAL_OUTCOMES.EXHAUSTED_FAIL;
  }

  function isAttemptsExhaustedFail(session) {
    return deriveTerminalOutcome(session) === TERMINAL_OUTCOMES.EXHAUSTED_FAIL;
  }

  function mergeTerminalOutcome(prev, next) {
    const rank = { incomplete: 0, exhausted_fail: 1, pass: 2 };
    const a = rank[prev] != null ? rank[prev] : -1;
    const b = rank[next] != null ? rank[next] : -1;
    return b >= a ? next : prev;
  }

  global.SessionTerminal = {
    TERMINAL_OUTCOMES,
    eventsHaveWin,
    eventsHaveAttemptsExhausted,
    deriveTerminalOutcome,
    isTerminalSession,
    isAttemptsExhaustedFail,
    mergeTerminalOutcome,
  };
})(typeof window !== 'undefined' ? window : globalThis);
