const fs = require('fs');
const path = require('path');
const { judge } = require('../../../packages/judge/judge');
const { buildJudgeRequest, normalizeTrace } = require('../../../packages/judge/game-trace');
const { judgeAndSaveSession } = require('../../../packages/platform/judge-session-core');
const { generateGraph } = require('../../../packages/generate/pipeline');
const { runAnalyzeThreeStep } = require('../../../packages/generate/analyze-three-step');
const { generateMultiLevelGraph } = require('../../../packages/generate/multi-level-pipeline');
const { generateDesignGraph } = require('../../../packages/generate/design-pipeline');
const { buildLlmPromptBundle } = require('../../../packages/generate/export/llm-prompt-bundle');
const { validateWithSyntheticTraces } = require('../../../packages/generate/trace-synth');
const { extractGameHints } = require('../../../packages/generate/hints');
const { writeGeneratedGraph } = require('../../../packages/generate/graph-persist');
const {
  createGraphProject,
  appendChapterToBundle,
  pruneOrphanIndexEntries,
} = require('../../../packages/generate/incremental-bundle');
const { OUTPUT_ROOT, cors } = require('../static');
const {
  listCatalog,
  getCatalogItem,
  publishGame,
  setPublished,
  loadChapterForGraph,
  deleteCatalogItem,
  isProtectedPackageGraph,
} = require('../../../packages/platform/catalog');
const {
  ingestTraceQueued,
  listTraces,
  getTraceStats,
  listTraceStudents,
  summarizeSessionEvents,
  getTraceSession,
  saveTraceSession,
  deleteTraceSessions,
  getStudentTraceSummary,
  enrichRecordMetrics,
  getClassroomBoard,
  exportClassroomCsv,
  exportAllTracesZip,
  importAllTracesZip,
  importTraceSessionFiles,
} = require('../../../packages/platform/trace-store');
const { getPackageGamePath, getPackageChapterPath } = require('../../../packages/shared/data-paths');
const { scoreTraceStrategy } = require('../../../packages/judge/strategy-segment-score');
const { resolveStrategyPathScoreScope } = require('../../../packages/judge/trace-normalize');
const {
  computeAbilityScore,
  ABILITY_SCORE_VERSION,
} = require('../../../packages/judge/ability-score');
const { formatSummary, detectNearTies } = require('../../web/ui/strategy-path-summary');
const { loadAdapter } = require('../../../packages/platform/adapters');
const { generateGameHtml } = require('../../../packages/generate/html-codegen');
const { listGamePages, deleteGamePage } = require('../../../packages/platform/game-pages');
const { deleteGeneratedGraph } = require('../../../packages/generate/graph-delete');
const {
  listCategories,
  createCategory,
  deleteCategory,
  setCatalogCategory,
  ensureMacroCategories,
} = require('../../../packages/platform/categories');
const {
  listHtmlSampleGraphs,
  listHtmlSamplePages,
} = require('../../../packages/platform/html-samples-index');
const { loadGraphPreviewPayload } = require('../../../packages/platform/graph-preview');
const { listPublishPairs } = require('../../../packages/platform/publish-pairs');
const { assertPublishReady } = require('../../../packages/platform/publish-gate');
const {
  requireTeacherAuth,
  handleTeacherLogin,
  readBody,
  readRawBody,
  parseMultipartFiles,
  checkIngestQuota,
  IMPORT_ZIP_MAX_BYTES,
  INGEST_MAX_BYTES,
} = require('../api-shared');

const LLM_OPTS = () => ({
  apiKey: process.env.DEEPSEEK_API_KEY,
  apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
});

function mergeImportResults(parts) {
  let imported = 0;
  let skipped = 0;
  const errors = [];
  let anyOk = false;
  let lastFatal = null;
  for (const r of parts) {
    if (!r) continue;
    if (r.ok) anyOk = true;
    else lastFatal = r.error || (r.errors && r.errors[0]) || 'import_failed';
    imported += Number(r.imported) || 0;
    skipped += Number(r.skipped) || 0;
    if (Array.isArray(r.errors)) errors.push(...r.errors);
  }
  if (!anyOk && lastFatal) {
    return {
      ok: false,
      imported,
      skipped,
      error: typeof lastFatal === 'string' ? lastFatal : String(lastFatal),
      errors: errors.length ? errors : [lastFatal],
    };
  }
  const out = { ok: true, imported, skipped };
  if (errors.length) out.errors = errors;
  return out;
}


async function handleTraceIngest(req, res) {
  cors(res);
  try {
    const body = await readBody(req, INGEST_MAX_BYTES);
    const quota = checkIngestQuota(req, body);
    if (!quota.ok) {
      res.writeHead(429, {
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': String(Math.ceil((quota.retryAfterMs || 0) / 1000) || 60),
      });
      res.end(JSON.stringify({ ok: false, error: quota.error || 'ingest_rate_limited' }));
      return;
    }
    const item = getCatalogItem(body.catalogId);
    if (item && !body.graphId) body.graphId = item.graphId;
    const result = await ingestTraceQueued(body);
    if (!result.ok) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  } catch (e) {
    const status = e.message === 'body_too_large' ? 413 : 400;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

function handlePlatformTraces(req, res) {
  cors(res);
  const url = new URL(req.url, 'http://localhost');
  const graphId = url.searchParams.get('graphId') || undefined;
  const catalogId = url.searchParams.get('catalogId') || undefined;
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, items: listTraces({ graphId, catalogId }) }));
}

function handlePlatformTraceStats(req, res) {
  cors(res);
  const url = new URL(req.url, 'http://localhost');
  const graphId = url.searchParams.get('graphId') || undefined;
  const catalogId = url.searchParams.get('catalogId') || undefined;
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, stats: getTraceStats({ graphId, catalogId }) }));
}

function handleClassroomBoard(req, res) {
  cors(res);
  const url = new URL(req.url, 'http://localhost');
  const graphId = url.searchParams.get('graphId') || undefined;
  const catalogId = url.searchParams.get('catalogId') || undefined;
  const taskCode = url.searchParams.get('taskCode') || undefined;
  const format = (url.searchParams.get('format') || 'json').toLowerCase();
  const board = getClassroomBoard({ graphId, catalogId, taskCode });
  if (format === 'csv') {
    const csv = exportClassroomCsv(board);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="classroom-board.csv"',
    });
    res.end('\uFEFF' + csv);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(board));
}

function handlePlatformTraceStudents(req, res) {
  cors(res);
  const url = new URL(req.url, 'http://localhost');
  const graphId = url.searchParams.get('graphId') || undefined;
  const catalogId = url.searchParams.get('catalogId') || undefined;
  const q = url.searchParams.get('q') || undefined;
  const status = url.searchParams.get('status') || undefined;
  const limitRaw = url.searchParams.get('limit');
  let limit = 200;
  if (limitRaw != null && limitRaw !== '') {
    const n = Number(limitRaw);
    if (Number.isFinite(n)) limit = Math.max(1, Math.min(300, Math.floor(n)));
  }
  const items = listTraceStudents({ graphId, catalogId, q, status, limit });
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    ok: true,
    items,
    limit,
    truncated: items.length >= limit,
  }));
}

function handlePlatformTraceDetail(req, res, sessionId) {
  cors(res);
  const session = getTraceSession(sessionId);
  if (!session) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'not_found' }));
    return;
  }
  const chapter = loadChapterForGraph(session.graphId);
  enrichRecordMetrics(session, chapter);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    ok: true,
    session,
    summary: summarizeSessionEvents(session, chapter),
  }));
}


async function handlePlatformTraceDelete(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const sessionIds = Array.isArray(body.sessionIds) ? body.sessionIds : [];
    if (!sessionIds.length) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'sessionIds_required' }));
      return;
    }
    const result = deleteTraceSessions(sessionIds);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

/** Teacher-only: download all sess-*.json under traces root as a store ZIP (unfiltered). */
function handlePlatformTracesExportZip(req, res) {
  cors(res);
  try {
    const result = exportAllTracesZip();
    if (!result.ok) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: result.error || '暂无轨迹', count: result.count || 0 }));
      return;
    }
    const filename = result.filename;
    const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_');
    const disposition = `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': disposition,
      'Content-Length': String(result.buffer.length),
      'Cache-Control': 'no-store',
    });
    res.end(result.buffer);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message || 'export_failed' }));
  }
}

/** Teacher-only: import sess-*.json from ZIP (or multipart loose JSON); overwrite same names. */
async function handlePlatformTracesImportZip(req, res) {
  cors(res);
  try {
    const ct = String(req.headers['content-type'] || '');
    const ctLower = ct.toLowerCase();
    const raw = await readRawBody(req);
    let result;

    if (ctLower.includes('multipart/form-data')) {
      const parts = parseMultipartFiles(raw, ct);
      if (!parts.length) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, imported: 0, skipped: 0, error: 'no_files' }));
        return;
      }
      const partials = [];
      const looseJson = [];
      for (const part of parts) {
        const name = String(part.filename || '');
        const lower = name.toLowerCase();
        if (lower.endsWith('.zip')) {
          partials.push(importAllTracesZip(part.data));
        } else if (lower.endsWith('.json')) {
          looseJson.push({ name, data: part.data });
        } else {
          partials.push({ ok: true, imported: 0, skipped: 1 });
        }
      }
      if (looseJson.length) partials.push(importTraceSessionFiles(looseJson));
      result = mergeImportResults(partials);
    } else if (ctLower.includes('application/json')) {
      let body;
      try {
        body = JSON.parse(raw.toString('utf8') || '{}');
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, imported: 0, skipped: 0, error: 'invalid_json' }));
        return;
      }
      if (body.zipBase64) {
        result = importAllTracesZip(Buffer.from(String(body.zipBase64), 'base64'));
      } else if (Array.isArray(body.files)) {
        result = importTraceSessionFiles(
          body.files.map(f => ({
            name: f.name || f.filename,
            data: Buffer.from(String(f.contentBase64 || f.dataBase64 || ''), 'base64'),
          })),
        );
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, imported: 0, skipped: 0, error: 'expected_zipBase64_or_files' }));
        return;
      }
    } else {
      result = importAllTracesZip(raw);
    }

    const status = result.ok ? 200 : 400;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  } catch (e) {
    const status = e.message === 'body_too_large' ? 413 : 500;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: false,
      imported: 0,
      skipped: 0,
      error: e.message || 'import_failed',
    }));
  }
}


async function handleDemoStrategyPathSummary(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const packageId = String(body.packageId || 'capacitor-confound-ui').trim();
    const chapterPath = getPackageChapterPath(packageId);
    if (!fs.existsSync(chapterPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'chapter_not_found', packageId }));
      return;
    }
    const chapter = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
    // Synthetic explore-ish trace: tune primary AV then fire (does not claim optimality)
    const avs = chapter?.inquiryScript?.adjustmentVariables || [];
    const primary = avs.find(a => a.priorityRank === 1) || avs[0];
    const control = primary?.controlId || 's-distance';
    const events = [
      { ts: 1, type: 'tuning', payload: { control, value: 0.4 } },
      { ts: 2, type: 'action', payload: { control: 'btn-fire' } },
      { ts: 3, type: 'snapshot', payload: { controls: { [control]: 0.4 }, winOk: false } },
      { ts: 4, type: 'tuning', payload: { control, value: 0.55 } },
      { ts: 5, type: 'action', payload: { control: 'btn-fire' } },
      { ts: 6, type: 'snapshot', payload: { controls: { [control]: 0.55 }, winOk: true } },
      { ts: 7, type: 'win', payload: {} },
    ];
    const scoreResult = scoreTraceStrategy(events, chapter, { mode: 'explore' });
    const nearTies = detectNearTies(scoreResult, chapter);
    const audience = body.audience === 'teacher' ? 'teacher' : 'student';
    const summary = formatSummary(scoreResult, {
      showScore: body.showScore != null ? !!body.showScore : audience === 'teacher',
      audience,
      nearTies,
    });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      packageId,
      primaryStrategy: scoreResult.primaryStrategy,
      score: scoreResult.score,
      summary,
      nearTies,
      note: '演示用合成轨迹；默认文案不剧透最优路径',
    }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message || String(e) }));
  }
}

/** Score real student session events → non-spoiler path type summary. */
async function handleSessionStrategyPathSummary(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const sessionId = String(body.sessionId || '').trim();
    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'sessionId_required' }));
      return;
    }
    const session = getTraceSession(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'session_not_found' }));
      return;
    }
    const graphId = body.graphId || session.graphId;
    let chapter = loadChapterForGraph(graphId);
    if (!chapter && body.packageId) {
      const chapterPath = getPackageChapterPath(String(body.packageId));
      if (fs.existsSync(chapterPath)) chapter = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
    }
    if (!chapter) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'chapter_not_found', graphId }));
      return;
    }
    enrichRecordMetrics(session, chapter);
    const allEvents = Array.isArray(session.events) ? session.events : [];
    const audience = body.audience === 'teacher' ? 'teacher' : 'student';
    // 事件范围由服务端按 phase 决定，不单信 body.mode（对齐 Agent B：策略看竞赛段）
    const hintedMode = body.mode
      || (session.currentPhase === 'challenge' ? 'compete' : 'explore');
    const scope = resolveStrategyPathScoreScope(allEvents, {
      phaseScope: body.phaseScope,
      mode: hintedMode,
    });
    const mode = scope.mode;
    const scoredPhase = scope.scoredPhase;
    const events = scope.events;
    if (!allEvents.length) {
      const summary = formatSummary(
        { primaryStrategy: null, score: null, breakdown: {} },
        { audience, showScore: false, alignmentOk: false, degradeReason: 'events_empty', scoredPhase },
      );
      if (audience === 'teacher') {
        const hasFiniteEmpty = !!(session.abilityScore
          && Number(session.abilityScore.version) === Number(ABILITY_SCORE_VERSION)
          && Number.isFinite(Number(session.abilityScore.total)));
        if (!hasFiniteEmpty) {
          try {
            session.abilityScore = computeAbilityScore({
              events: [],
              chapter,
              verdict: session.judgeResult?.verdict || null,
              judged: !!session.judged || !!session.judgeResult,
              packageId: body.packageId || session.packageId || session.catalogId || null,
              graphId,
            });
            saveTraceSession(session);
          } catch (_) { /* ignore */ }
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        sessionId: session.sessionId,
        graphId,
        mode,
        scoredPhase,
        summary,
        degraded: true,
        variableAdjustCounts: session.variableAdjustCounts,
        abilityScore: audience === 'teacher' ? (session.abilityScore || null) : undefined,
        abilityScoreVersion: audience === 'teacher' ? ABILITY_SCORE_VERSION : undefined,
        source: 'session-events',
      }));
      return;
    }
    const scoreResult = scoreTraceStrategy(events, chapter, { mode });
    const nearTies = detectNearTies(scoreResult, chapter);
    const sawModeSwitch = allEvents.some(e =>
      e.type === 'phase_change' || e.type === 'mode');
    const degradeReason = body.degradeReason
      || (sawModeSwitch && body.strictModeAlign ? 'mode_switch' : null);
    const summary = formatSummary(scoreResult, {
      showScore: body.showScore != null ? !!body.showScore : audience === 'teacher',
      audience,
      nearTies,
      alignmentOk: degradeReason ? false : true,
      degradeReason,
      scoredPhase,
    });
    // Persist path summary：竞赛优先作 primary；探究段写入独立字段，避免并行请求互相覆盖
    const pathPayload = {
      ...summary,
      primaryStrategy: scoreResult.primaryStrategy,
      score: scoreResult.score,
      mode,
      scoredPhase,
      nearTies,
      scoredAt: new Date().toISOString(),
    };
    session.strategyPathByPhase = session.strategyPathByPhase && typeof session.strategyPathByPhase === 'object'
      ? session.strategyPathByPhase
      : {};
    if (scoredPhase === 'explore') {
      session.strategyPathSummaryExplore = pathPayload;
      session.strategyPathByPhase.explore = pathPayload;
      const prevPhase = session.strategyPathSummary?.scoredPhase;
      if (!session.strategyPathSummary || prevPhase === 'explore' || prevPhase === 'full') {
        // 无竞赛 primary 时可用探究段占位；已有 challenge 则不覆盖
        if (prevPhase !== 'challenge') session.strategyPathSummary = pathPayload;
      }
    } else if (scoredPhase === 'challenge') {
      session.strategyPathByPhase.challenge = pathPayload;
      session.strategyPathSummary = pathPayload;
    } else {
      session.strategyPathByPhase.full = pathPayload;
      // primary 优先级：challenge > explore > full（避免并行默认 full 冲掉探究段）
      const prev = session.strategyPathSummary?.scoredPhase;
      if (prev !== 'challenge' && prev !== 'explore') {
        session.strategyPathSummary = pathPayload;
      }
    }
    // 能力总分：仅缺失 / 非有限 total / 公式版本不符时懒重算。
    // 已有当前版本有限总分时整段跳过（教师受众也绝不重算/落盘覆盖）。
    const hasFiniteAbility = !!(session.abilityScore
      && Number(session.abilityScore.version) === Number(ABILITY_SCORE_VERSION)
      && Number.isFinite(Number(session.abilityScore.total)));
    if (!hasFiniteAbility) {
      try {
        const pkgId = body.packageId
          || session.packageId
          || session.catalogId
          || null;
        const computed = computeAbilityScore({
          events: allEvents,
          chapter,
          verdict: session.judgeResult?.verdict || session.verdict || null,
          judged: !!session.judged || !!session.judgeResult,
          packageId: pkgId,
          graphId,
        });
        // 二次护栏：若并发间已有有限分，不落盘覆盖
        const stillMissing = !session.abilityScore
          || Number(session.abilityScore.version) !== Number(ABILITY_SCORE_VERSION)
          || !Number.isFinite(Number(session.abilityScore.total));
        if (stillMissing) session.abilityScore = computed;
      } catch (abilityErr) {
        // 不计分失败不影响路径摘要；勿覆盖已有有效分
        if (!session.abilityScore
          || Number(session.abilityScore.version) !== Number(ABILITY_SCORE_VERSION)
          || !Number.isFinite(Number(session.abilityScore.total))) {
          session.abilityScore = {
            version: ABILITY_SCORE_VERSION,
            total: null,
            pending: true,
            error: abilityErr.message || String(abilityErr),
            computedAt: new Date().toISOString(),
          };
        }
      }
    }
    saveTraceSession(session);
    const payload = {
      ok: true,
      sessionId: session.sessionId,
      graphId,
      mode,
      scoredPhase,
      primaryStrategy: scoreResult.primaryStrategy,
      score: scoreResult.score,
      summary,
      nearTies,
      strategyPathSummaryExplore: session.strategyPathSummaryExplore || null,
      strategyPathByPhase: session.strategyPathByPhase || null,
      variableAdjustCounts: session.variableAdjustCounts,
      source: 'session-events',
      contract: {
        student: 'summary.text + summary.advice（不剧透最优；默认无分数；竞赛过关按竞赛段评分；不含能力总分展示）',
        teacher: 'audience=teacher 或 showScore=true 可见吻合度与 teacherDetail；scoredPhase 标明评分段；explore/challenge 可分次请求；abilityScore 为平台能力总分 v2',
      },
    };
    // 学生受众不附带能力总分，避免 student-play 误展示
    if (audience === 'teacher') {
      payload.abilityScore = session.abilityScore || null;
      payload.abilityScoreVersion = ABILITY_SCORE_VERSION;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message || String(e) }));
  }
}

module.exports = {
  mergeImportResults,
  handleTraceIngest,
  handlePlatformTraces,
  handlePlatformTraceStats,
  handleClassroomBoard,
  handlePlatformTraceStudents,
  handlePlatformTraceDetail,
  handlePlatformTraceDelete,
  handlePlatformTracesExportZip,
  handlePlatformTracesImportZip,
  handleDemoStrategyPathSummary,
  handleSessionStrategyPathSummary,
};
