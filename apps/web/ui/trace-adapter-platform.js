(function (global) {
  const ENDPOINT = '/api/trace/ingest';
  const DEFAULT_FLUSH_TIMEOUT_MS = 2500;
  /** Batch window / cap: one POST carries several UI events, not one request per click. */
  const FLUSH_INTERVAL_MS = 400;
  const MAX_BUFFERED_EVENTS = 20;
  let sessionId = null;
  let config = {};
  let adapterConfig = null;
  /** @type {Set<Promise<unknown>>} */
  const pendingPosts = new Set();
  /** @type {Array<object>} */
  let eventBuffer = [];
  /** @type {Array<(value?: unknown) => void>} */
  let bufferWaiters = [];
  let flushTimer = null;

  function now() { return Date.now(); }

  function newSessionId() {
    return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function mapControlId(id) {
    if (!id || !adapterConfig?.controlAliases) return id;
    return adapterConfig.controlAliases[id] || id;
  }

  function withTimeout(promise, timeoutMs) {
    const ms = timeoutMs != null ? timeoutMs : DEFAULT_FLUSH_TIMEOUT_MS;
    if (!(ms > 0)) return promise;
    return Promise.race([
      promise,
      new Promise((resolve) => {
        setTimeout(() => resolve({ ok: false, timedOut: true }), ms);
      }),
    ]);
  }

  /**
   * POST events (and optional terminal tip) for the current sessionId.
   * Returns a Promise; callers that need disk durability should await flushPending / recordAndWait.
   * @param {Array} events
   * @param {{ terminalOutcome?: string, attemptsExhausted?: boolean }} [extras]
   */
  function postEvents(events, extras) {
    const list = Array.isArray(events) ? events : [];
    const tipOutcome = extras && extras.terminalOutcome ? String(extras.terminalOutcome) : null;
    const tipExhausted = !!(extras && extras.attemptsExhausted) || tipOutcome === 'exhausted_fail';
    if (!list.length && !tipOutcome && !tipExhausted) {
      return Promise.resolve(null);
    }
    const postedSessionId = sessionId;
    const payload = {
      sessionId: postedSessionId,
      catalogId: config.catalogId,
      graphId: config.graphId,
      studentLabel: config.studentLabel,
      studentId: config.studentId || undefined,
      classCode: config.classCode || undefined,
      studentSession: config.studentSession || undefined,
      taskCode: config.taskCode || config.catalogId || undefined,
      ch: config.ch ?? 0,
      game: config.catalogId,
      traceVersion: 1,
      events: list,
    };
    if (tipOutcome) payload.terminalOutcome = tipOutcome;
    if (tipExhausted) payload.attemptsExhausted = true;

    const body = JSON.stringify(payload);
    const p = fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // keepalive is valuable on unload, but browsers cap its body size.
      keepalive: body.length < 60 * 1024,
    })
      .then(r => r.json())
      .then(data => {
        // Do not let a late response for an old round overwrite a rotated sessionId.
        if (data && data.sessionId && sessionId === postedSessionId) {
          sessionId = data.sessionId;
        }
        if (global.PlatformTraceOnFlush) global.PlatformTraceOnFlush(data);
        return data;
      })
      .catch(() => null)
      .finally(() => {
        pendingPosts.delete(p);
      });

    pendingPosts.add(p);
    return p;
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushBuffer();
    }, FLUSH_INTERVAL_MS);
  }

  /**
   * Send queued events (and optional terminal tip/extras) as one ingest request.
   * @param {{ terminalOutcome?: string, attemptsExhausted?: boolean, extraEvents?: object[] }} [extras]
   */
  function flushBuffer(extras) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    const queued = eventBuffer;
    eventBuffer = [];
    const waiters = bufferWaiters;
    bufferWaiters = [];
    const list = [
      ...queued,
      ...(Array.isArray(extras?.extraEvents) ? extras.extraEvents : []),
    ];
    const tipOutcome = extras?.terminalOutcome || null;
    const tipExhausted = extras?.attemptsExhausted === true || tipOutcome === 'exhausted_fail';
    if (!list.length && !tipOutcome && !tipExhausted) {
      waiters.forEach((resolve) => resolve(null));
      return Promise.resolve(null);
    }
    const p = postEvents(list, { terminalOutcome: tipOutcome, attemptsExhausted: tipExhausted });
    waiters.forEach((resolve) => {
      p.then((value) => resolve(value), () => resolve(null));
    });
    return p;
  }

  function enqueueEvent(event) {
    return new Promise((resolve) => {
      eventBuffer.push(event);
      bufferWaiters.push(resolve);
      if (eventBuffer.length >= MAX_BUFFERED_EVENTS) flushBuffer();
      else scheduleFlush();
    });
  }

  function shouldFlushNow(type, payload) {
    if (type === 'win' || type === 'explore_success' || type === 'attempts_exhausted') return true;
    return type === 'snapshot'
      && (payload?.winOk === true || payload?.attemptsExhausted === true || payload?.final === true);
  }

  function record(type, payload) {
    // Full shallow copy — no type allowlist (explore_success / win / snapshot all ingest).
    // Do not strip win progress fields (interim / final / levelsCleared / level / levelIndex / winOk / hintKey).
    const p = { ...(payload || {}) };
    if (p.control) p.control = mapControlId(p.control);
    if (p.controls && typeof p.controls === 'object') {
      const mapped = {};
      for (const [k, v] of Object.entries(p.controls)) {
        mapped[mapControlId(k)] = v;
      }
      p.controls = mapped;
    }
    const pending = enqueueEvent({ ts: now(), type, payload: p, ch: config.ch ?? 0 });
    // Terminal/progress events must not wait for the batch timer; ordinary
    // tuning/action events can be coalesced.
    if (shouldFlushNow(type, p)) flushBuffer();
    return pending;
  }

  /** Await a single record ingest (best-effort; rejects swallowed inside postEvents). */
  async function recordAndWait(type, payload) {
    const recorded = record(type, payload);
    await flushBuffer();
    return recorded;
  }

  /**
   * Wait for queued events and in-flight ingest POSTs (optionally timed out).
   * @param {number} [timeoutMs]
   */
  function flushPending(timeoutMs) {
    const buffered = eventBuffer.length > 0;
    const flushP = buffered ? flushBuffer() : Promise.resolve(null);
    if (!pendingPosts.size && !buffered) {
      return Promise.resolve({ flushed: true, timedOut: false, pending: 0 });
    }
    const pending = pendingPosts.size;
    const all = Promise.all([...pendingPosts, flushP]).then(() => ({
      flushed: true,
      timedOut: false,
      pending,
    }));
    return withTimeout(all, timeoutMs).then((result) => {
      if (result && result.timedOut) {
        return { flushed: false, timedOut: true, pending };
      }
      return result || { flushed: true, timedOut: false, pending };
    });
  }

  /**
   * Ensure a terminal tip (and optional events) land on the *current* session, then await in-flight ingest.
   * Used before auto-judge + session rotate so leaveAuto does not tag incomplete.
   * @param {{ outcome: 'exhausted_fail'|'pass', reason?: string, timeoutMs?: number, emitEvents?: boolean }} opts
   */
  async function markTerminalAndFlush(opts) {
    const o = opts || {};
    const outcome = o.outcome === 'pass'
      ? 'pass'
      : (o.outcome === 'exhausted_fail' ? 'exhausted_fail' : null);
    const timeoutMs = o.timeoutMs != null ? o.timeoutMs : DEFAULT_FLUSH_TIMEOUT_MS;
    const sid = sessionId;
    const emitEvents = o.emitEvents !== false;

    if (outcome === 'exhausted_fail') {
      const extraEvents = emitEvents ? [
        {
          ts: now(),
          type: 'attempts_exhausted',
          payload: { attempts: 0, mode: 'challenge', reason: o.reason || 'exhausted_retry' },
          ch: config.ch ?? 0,
        },
        {
          ts: now(),
          type: 'snapshot',
          payload: { winOk: false, attemptsExhausted: true, hintKey: 'attempts_exhausted' },
          ch: config.ch ?? 0,
        },
      ] : [];
      await withTimeout(
        flushBuffer({
          terminalOutcome: 'exhausted_fail',
          attemptsExhausted: true,
          extraEvents,
        }),
        timeoutMs,
      );
    } else if (outcome === 'pass') {
      // Win events should already be queued by the game; flush them with the tip.
      await withTimeout(
        flushBuffer({ terminalOutcome: 'pass' }),
        timeoutMs,
      );
    }

    const flushResult = await flushPending(timeoutMs);
    return {
      sessionId: sid,
      outcome,
      reason: o.reason || null,
      ...flushResult,
    };
  }

  function bindControls(root) {
    const doc = root || document;
    // Mark so game-level TRACE_HOOK / self-emit can skip and avoid double-count
    // when the platform adapter is the source of truth (e.g. student-play iframe).
    try { global.__platformTraceControlsBound = true; } catch (e) { /* window may be restricted */ }
    // Range/number: record tuning on `change` only (pointer/keyboard commit).
    // Do not bind `input` — dragging a range fires many intermediate values.
    doc.querySelectorAll('input[type="range"], input[type="number"]').forEach(el => {
      el.addEventListener('change', () => {
        record('tuning', { control: el.id || el.name || 'slider', value: el.value });
      });
    });
    doc.querySelectorAll('button, [role="button"]').forEach(el => {
      el.addEventListener('click', () => {
        record('action', { control: el.id || el.textContent?.trim()?.slice(0, 24) || 'button' });
      });
    });
    doc.addEventListener('click', (e) => {
      const t = e.target;
      if (t.tagName === 'CANVAS') {
        record('canvas_interact', { x: e.offsetX, y: e.offsetY });
      }
    }, true);
  }

  async function loadAdapter(catalogId) {
    if (!catalogId) return null;
    try {
      const r = await fetch(`/api/platform/adapter?catalogId=${encodeURIComponent(catalogId)}`);
      if (!r.ok) return null;
      const data = await r.json();
      return data.adapter || null;
    } catch {
      return null;
    }
  }

  let lastPhase = null;

  function setPhase(phase) {
    const p = phase === 'challenge' ? 'challenge' : 'explore';
    if (p === lastPhase) return;
    lastPhase = p;
    record('phase_change', { phase: p });
  }

  function getPhase() {
    return lastPhase;
  }

  async function start(cfg) {
    const nextConfig = cfg || {};
    const nextId = nextConfig.sessionId || sessionId || newSessionId();
    // Never let events queued for the old round leak into the next session.
    if (sessionId && nextId !== sessionId) {
      await flushBuffer();
      await flushPending(DEFAULT_FLUSH_TIMEOUT_MS);
      lastPhase = null;
    }
    config = nextConfig;
    sessionId = nextId;
    adapterConfig = cfg.adapter || (cfg.catalogId ? await loadAdapter(cfg.catalogId) : null);
    if (!cfg.skipPuzzleOpen) record('puzzle_open', {});
    if (!cfg.skipBindControls) bindControls(document);
  }

  function getSessionId() {
    return sessionId;
  }

  function getConfig() {
    return { ...config };
  }

  /**
   * After a terminal round (exhausted_fail / pass), start a fresh ingest session
   * with a new sessionId while preserving student/catalog identity fields.
   * Safe to call mid-page; does not re-bind controls.
   */
  async function beginNewRound(opts) {
    const o = opts || {};
    const oldSessionId = sessionId;
    const reason = o.reason || 'retry';
    const preserved = { ...config };
    const nextId = o.sessionId || newSessionId();
    const prevPhase = lastPhase;
    lastPhase = null;
    await start({
      ...preserved,
      catalogId: o.catalogId != null ? o.catalogId : preserved.catalogId,
      graphId: o.graphId != null ? o.graphId : preserved.graphId,
      studentLabel: o.studentLabel != null ? o.studentLabel : preserved.studentLabel,
      studentId: o.studentId != null ? o.studentId : preserved.studentId,
      classCode: o.classCode != null ? o.classCode : preserved.classCode,
      studentSession: o.studentSession != null ? o.studentSession : preserved.studentSession,
      taskCode: o.taskCode != null ? o.taskCode : preserved.taskCode,
      ch: o.ch != null ? o.ch : preserved.ch,
      adapter: o.adapter || adapterConfig || preserved.adapter,
      sessionId: nextId,
      skipBindControls: true,
      skipPuzzleOpen: !!o.skipPuzzleOpen,
    });
    if (prevPhase) setPhase(prevPhase);
    return { oldSessionId, sessionId: nextId, reason };
  }

  function exportSessionJson() {
    return {
      sessionId,
      catalogId: config.catalogId,
      graphId: config.graphId,
      studentLabel: config.studentLabel,
      studentId: config.studentId || null,
      classCode: config.classCode || null,
      taskCode: config.taskCode || null,
      ch: config.ch ?? 0,
      traceVersion: 1,
      exportedAt: new Date().toISOString(),
      note: 'Use platform ingest session; this is a partial export from client buffer only',
    };
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('pagehide', () => {
      // Best-effort last flush; the play shell's auto-judge path sends the tip.
      flushBuffer();
    });
  }

  global.PlatformTraceAdapter = {
    start,
    record,
    recordAndWait,
    postEvents,
    flushPending,
    markTerminalAndFlush,
    exportSessionJson,
    getSessionId,
    getConfig,
    setPhase,
    getPhase,
    beginNewRound,
    rotateSession: beginNewRound,
  };
  global.__platformTraceSetPhase = setPhase;
})(window);
