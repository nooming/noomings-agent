/**
 * Shared rules/LLM judge + abilityScore persist (same path as POST /api/platform/judge-session).
 * Usable from HTTP handlers and CLI batch scripts without spinning up the server.
 */
const { judge } = require('../judge/judge');
const { summarizeTrace } = require('../judge/dt-align');
const { attachFormativeAssessment } = require('../judge/formative-bundle');
const { buildJudgeRequest, normalizeTrace } = require('../judge/game-trace');
const { computeLiteracyProfileFromSession } = require('../judge/literacy-mapping');
const { computeTimingFeatures } = require('../judge/trace-timing');
const {
  deriveTerminalOutcome,
  isTerminalSession,
  mergeTerminalOutcome,
} = require('../judge/session-terminal');
const {
  classifyIncompleteKind,
  shouldRunIncompletePreview,
  applyIncompletePreviewJudgeResult,
} = require('../judge/incomplete-session');
const { loadChapterForGraph } = require('./catalog');
const { getTraceSession, saveJudgeResult, saveTraceSession } = require('./trace-store');
const {
  computeSessionAbilityScore,
  mergeAbilityScoreRecords,
  isFiniteAbilityTotal,
  sessionNeedsPreviewRescore,
  stripPreviewFieldsFromAbility,
} = require('./session-ability-score');

/**
 * @param {object} session
 * @param {object} opts
 * @param {{ incompletePreview?: boolean }} [flags]
 */
async function executeJudgeAndPersist(session, opts, flags = {}) {
  const incompletePreview = flags.incompletePreview === true;
  const graphId = opts.graphId || session.graphId;
  const chapter = loadChapterForGraph(graphId);
  if (!chapter) {
    return { ok: false, error: 'chapter_not_found', sessionId: session.sessionId, graphId };
  }

  const ch = opts.ch ?? session.ch ?? 0;
  const base = buildJudgeRequest({
    ch,
    trace: normalizeTrace({ events: session.events, ch, game: session.game }, ch),
    chapter,
  });
  const graph = base.graph;
  const judgeMode = incompletePreview
    ? 'rules'
    : String(opts.mode || 'rules').toLowerCase();
  const llmOpts = opts.llmOpts || {};

  let result = await judge(
    {
      ...base,
      graph,
      chapter,
      mode: judgeMode,
      graphId,
      packageId: opts.packageId,
      skipFormativeAttach: true,
    },
    { ...llmOpts, skipFormativeAttach: true },
  );

  if (incompletePreview) {
    result = applyIncompletePreviewJudgeResult(result);
  }

  let judgedPayload = {
    ...result,
    judgedAt: new Date().toISOString(),
    judgeSchemaVersion: 1,
  };
  if (incompletePreview) {
    judgedPayload.judgePreview = true;
  }

  const terminalOutcome = incompletePreview
    ? mergeTerminalOutcome(session.terminalOutcome, 'incomplete')
    : mergeTerminalOutcome(
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
    const verdictForAbility = incompletePreview
      ? (result?.verdict === 'pass' ? 'in_progress' : (result?.verdict || null))
      : (result?.verdict || null);
    abilityScore = computeSessionAbilityScore(session, chapter, {
      graphId,
      packageId: pkgId,
      terminalOutcome,
      incompletePreview,
      verdict: verdictForAbility,
    });
  } catch (_) { /* teacher lazy path remains as fallback */ }

  try {
    const traceNorm = normalizeTrace({ events: session.events, ch, game: session.game }, ch);
    const summary = summarizeTrace(traceNorm, ch, chapter);
    judgedPayload = attachFormativeAssessment(judgedPayload, {
      summary,
      chapter,
      events: summary.events || [],
      judgeResult: judgedPayload,
      abilityScore,
    });
  } catch (_) { /* optional */ }

  let timingFeatures = null;
  try {
    const startedMs = session.startedAt ? Date.parse(session.startedAt) : NaN;
    timingFeatures = computeTimingFeatures(
      Array.isArray(session.events) ? session.events : [],
      { sessionStartTs: Number.isFinite(startedMs) ? startedMs : null },
    );
  } catch (_) { /* optional */ }

  let literacyProfile = null;
  try {
    literacyProfile = computeLiteracyProfileFromSession(session, {
      abilityScore: abilityScore || session.abilityScore || null,
      judgeResult: judgedPayload,
      terminalOutcome,
      timingFeatures: timingFeatures || session.timingFeatures || null,
    });
  } catch (_) { /* teacher UI can recompute */ }

  saveJudgeResult(
    session.sessionId,
    judgedPayload,
    {
      ...(abilityScore ? { abilityScore } : {}),
      ...(literacyProfile ? { literacyProfile } : {}),
      ...(timingFeatures ? { timingFeatures } : {}),
      terminalOutcome,
      incompleteKind: session.incompleteKind || null,
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
    incompleteKind: session.incompleteKind || null,
    judgePreview: !!incompletePreview,
    abilityScore: abilityScore || undefined,
    literacyProfile: literacyProfile || undefined,
    timingFeatures: timingFeatures || undefined,
  };
}

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
  if (leaveAuto && !isTerminalSession(session)) {
    session.terminalOutcome = mergeTerminalOutcome(session.terminalOutcome, 'incomplete');
    const graphId = opts.graphId || session.graphId;
    const chapter = graphId ? loadChapterForGraph(graphId) : null;
    session.incompleteKind = classifyIncompleteKind(session, chapter);

    if (!shouldRunIncompletePreview(session, chapter)) {
      saveTraceSession(session);
      return {
        ok: true,
        skipped: true,
        reason: 'incomplete_non_terminal',
        sessionId: session.sessionId,
        terminalOutcome: session.terminalOutcome,
        incompleteKind: session.incompleteKind,
        abilityScore: session.abilityScore || undefined,
        literacyProfile: session.literacyProfile || undefined,
        timingFeatures: session.timingFeatures || undefined,
        judgeResult: session.judgeResult || undefined,
      };
    }

    return executeJudgeAndPersist(session, {
      ...opts,
      leaveAuto: false,
      mode: 'rules',
    }, { incompletePreview: true });
  }

  const force = opts.force === true;
  if (!force && (session.judged || session.judgeResult)) {
    if (sessionNeedsPreviewRescore(session)) {
      return executeJudgeAndPersist(session, {
        ...opts,
        leaveAuto: false,
        mode: 'rules',
      }, { incompletePreview: true });
    }
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
      literacyProfile: session.literacyProfile || undefined,
      timingFeatures: session.timingFeatures || undefined,
      judgeResult: session.judgeResult || undefined,
    };
  }

  return executeJudgeAndPersist(session, opts, { incompletePreview: false });
}

/**
 * 历史/批量：未终局补 incompleteKind；达门槛则规则 preview 评判（可覆盖旧 judge）。
 * @param {object} session 完整会话（含 events）
 * @param {{ packageId?: string, dryRun?: boolean }} [opts]
 */
async function backfillIncompleteSessionRecord(session, opts = {}) {
  if (!session?.sessionId) {
    return { ok: false, error: 'sessionId_required' };
  }
  const dryRun = opts.dryRun === true;
  session.terminalOutcome = mergeTerminalOutcome(
    session.terminalOutcome,
    deriveTerminalOutcome(session),
  );

  if (isTerminalSession(session)) {
    const hadKind = session.incompleteKind != null;
    if (hadKind) session.incompleteKind = null;
    const graphId = session.graphId;
    const chapter = graphId ? loadChapterForGraph(graphId) : null;
    const hadPreviewAbility = !!(session.abilityScore?.preview
      || isFiniteAbilityTotal(session.abilityScore?.previewTotal));
    let rescored = false;
    if (!dryRun && chapter && hadPreviewAbility) {
      try {
        const computed = computeSessionAbilityScore(session, chapter, { incompletePreview: false });
        session.abilityScore = stripPreviewFieldsFromAbility(
          mergeAbilityScoreRecords(session.abilityScore, computed),
        );
        rescored = true;
      } catch (_) { /* keep existing */ }
    }
    if (!dryRun && (hadKind || rescored)) saveTraceSession(session);
    let action = 'terminal_skip';
    if (rescored) action = 'terminal_rescored_ability';
    else if (hadKind) action = 'terminal_cleared_kind';
    return { ok: true, action, sessionId: session.sessionId };
  }

  session.terminalOutcome = mergeTerminalOutcome(session.terminalOutcome, 'incomplete');
  const graphId = session.graphId;
  const chapter = graphId ? loadChapterForGraph(graphId) : null;
  session.incompleteKind = classifyIncompleteKind(session, chapter);

  if (!shouldRunIncompletePreview(session, chapter)) {
    if (!dryRun) saveTraceSession(session);
    return {
      ok: true,
      action: 'kind_only',
      sessionId: session.sessionId,
      incompleteKind: session.incompleteKind,
    };
  }

  if (dryRun) {
    return {
      ok: true,
      action: 'would_preview_judge',
      sessionId: session.sessionId,
      incompleteKind: session.incompleteKind,
    };
  }

  const out = await executeJudgeAndPersist(session, {
    graphId,
    mode: 'rules',
    packageId: opts.packageId || session.packageId || session.catalogId,
  }, { incompletePreview: true });
  return { ...out, action: 'preview_judged', incompleteKind: session.incompleteKind };
}

module.exports = {
  judgeAndSaveSession,
  executeJudgeAndPersist,
  backfillIncompleteSessionRecord,
};
