(function (global) {
  const ENDPOINT = '/api/trace/ingest';
  let sessionId = null;
  let config = {};
  let adapterConfig = null;

  function now() { return Date.now(); }

  function newSessionId() {
    return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function mapControlId(id) {
    if (!id || !adapterConfig?.controlAliases) return id;
    return adapterConfig.controlAliases[id] || id;
  }

  function postEvents(events) {
    if (!events.length) return;
    const payload = {
      sessionId,
      catalogId: config.catalogId,
      graphId: config.graphId,
      studentLabel: config.studentLabel,
      studentId: config.studentId || undefined,
      taskCode: config.taskCode || config.catalogId || undefined,
      ch: config.ch ?? 0,
      game: config.catalogId,
      traceVersion: 1,
      events,
    };
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(r => r.json())
      .then(data => {
        if (data.sessionId) sessionId = data.sessionId;
        if (global.PlatformTraceOnFlush) global.PlatformTraceOnFlush(data);
      })
      .catch(() => {});
  }

  function record(type, payload) {
    const p = { ...(payload || {}) };
    if (p.control) p.control = mapControlId(p.control);
    if (p.controls && typeof p.controls === 'object') {
      const mapped = {};
      for (const [k, v] of Object.entries(p.controls)) {
        mapped[mapControlId(k)] = v;
      }
      p.controls = mapped;
    }
    postEvents([{ ts: now(), type, payload: p, ch: config.ch ?? 0 }]);
  }

  function bindControls(root) {
    const doc = root || document;
    doc.querySelectorAll('input[type="range"], input[type="number"]').forEach(el => {
      const fire = () => {
        record('tuning', { control: el.id || el.name || 'slider', value: el.value });
      };
      el.addEventListener('input', fire);
      el.addEventListener('change', fire);
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
    config = cfg || {};
    sessionId = cfg.sessionId || sessionId || newSessionId();
    adapterConfig = cfg.adapter || (cfg.catalogId ? await loadAdapter(cfg.catalogId) : null);
    if (!cfg.skipPuzzleOpen) record('puzzle_open', {});
    if (!cfg.skipBindControls) bindControls(document);
  }

  function getSessionId() {
    return sessionId;
  }

  function exportSessionJson() {
    return {
      sessionId,
      catalogId: config.catalogId,
      graphId: config.graphId,
      studentLabel: config.studentLabel,
      studentId: config.studentId || null,
      taskCode: config.taskCode || null,
      ch: config.ch ?? 0,
      traceVersion: 1,
      exportedAt: new Date().toISOString(),
      note: 'Use platform ingest session; this is a partial export from client buffer only',
    };
  }

  global.PlatformTraceAdapter = { start, record, postEvents, exportSessionJson, getSessionId, setPhase, getPhase };
  global.__platformTraceSetPhase = setPhase;
})(window);
