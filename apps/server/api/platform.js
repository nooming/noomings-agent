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

async function handleJudge(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const ch = body.ch ?? 0;
    const base = buildJudgeRequest({
      ch,
      trace: normalizeTrace(body.trace, ch),
      sources: body.sources,
      chapter: body.chapter,
    });
    const graph = body.graph?.mapping ? body.graph : base.graph;
    const result = await judge({ ...body, ...base, graph }, LLM_OPTS());
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, ch, ...result }));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}


async function handlePlatformJudgeSession(req, res, opts = {}) {
  cors(res);
  try {
    const body = await readBody(req);
    if (!body.sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'sessionId_required' }));
      return;
    }
    const reasonLc = String(body.reason || '').toLowerCase();
    const isLeave = opts.leaveAuto === true || reasonLc === 'leave';
    const tipOutcomeRaw = body.terminalOutcome != null ? String(body.terminalOutcome) : '';
    const tipOutcome = (tipOutcomeRaw === 'pass' || tipOutcomeRaw === 'exhausted_fail' || tipOutcomeRaw === 'incomplete')
      ? tipOutcomeRaw
      : null;
    const tipExhausted = body.attemptsExhausted === true || tipOutcome === 'exhausted_fail';
    // 离开自动评判仅 rules；教师端默认 rules，显式 mode=llm 才走 LLM（无 Key 仍降级 rules）
    // leave：已评判则幂等跳过；教师手动评判默认 force 重评
    // new_round(+terminal tip)：允许在 events 稍晚时先标终局再 judge，避免 incomplete skip
    const result = await judgeAndSaveSession(body.sessionId, {
      mode: isLeave ? 'rules' : String(body.mode || 'rules').toLowerCase(),
      force: !isLeave,
      leaveAuto: isLeave,
      graphId: body.graphId,
      packageId: body.packageId,
      ch: body.ch,
      llmOpts: LLM_OPTS(),
      reason: body.reason,
      terminalOutcome: tipOutcome || undefined,
      attemptsExhausted: tipExhausted || undefined,
    });
    if (!result.ok && result.error === 'session_not_found') {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'session_not_found' }));
      return;
    }
    if (!result.ok && result.error === 'chapter_not_found') {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'chapter_not_found' }));
      return;
    }
    if (!result.ok) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: result.error || 'judge_failed' }));
      return;
    }
    if (result.skipped) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        skipped: true,
        reason: result.reason || 'already_judged',
        sessionId: result.sessionId,
        terminalOutcome: result.terminalOutcome || undefined,
        abilityScore: result.abilityScore || undefined,
      }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      sessionId: result.sessionId,
      ch: result.ch,
      skipped: false,
      reason: isLeave ? 'leave' : undefined,
      mode: result.mode,
      verdict: result.verdict,
      comment: result.comment,
      strengths: result.strengths,
      gaps: result.gaps,
      inquiryPath: result.inquiryPath,
      teacherSummary: result.teacherSummary,
      judgedAt: result.judgedAt,
      terminalOutcome: result.terminalOutcome || undefined,
      // 仅回传给教师调用方；学生端不读此字段作展示
      abilityScore: result.abilityScore || undefined,
    }));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

/** Student leave: fire-and-forget rules judge; no teacher auth. */
async function handlePlatformAutoJudgeOnLeave(req, res) {
  return handlePlatformJudgeSession(req, res, { leaveAuto: true });
}

function handlePlatformCatalog(req, res, publishedOnly) {
  cors(res);
  const items = listCatalog({
    publishedOnly,
    studentVisible: !!publishedOnly,
  });
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, items }));
}

async function handlePlatformPublish(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const wantPublish = body.published !== false;
    const gate = assertPublishReady({
      graphId: body.graphId,
      playUrl: body.playUrl,
      sampleTags: body.sampleTags,
      published: wantPublish,
    });
    if (gate.blocked) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: false,
        error: 'publish_gate_blocked',
        errors: gate.errors,
        warnings: gate.warnings,
      }));
      return;
    }
    const result = publishGame(body);
    if (gate.warnings.length) result.publishWarnings = gate.warnings;
    res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

async function handlePlatformSetPublished(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const wantPublish = !!body.published;
    if (wantPublish) {
      const item = getCatalogItem(body.id);
      if (item) {
        const gate = assertPublishReady({
          graphId: item.graphId,
          playUrl: item.playUrl,
          sampleTags: item.sampleTags,
          published: true,
        });
        if (gate.blocked) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            ok: false,
            error: 'publish_gate_blocked',
            errors: gate.errors,
            warnings: gate.warnings,
          }));
          return;
        }
        const result = setPublished(body.id, true);
        if (gate.warnings.length) result.publishWarnings = gate.warnings;
        res.writeHead(result.ok ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
        return;
      }
    }
    const result = setPublished(body.id, body.published);
    res.writeHead(result.ok ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

async function handlePlatformCatalogDelete(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const result = deleteCatalogItem(body.id, { forceFeatured: body.forceFeatured === true });
    const status = result.ok ? 200 : (result.error === 'featured_protected' ? 403 : 404);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

function handlePlatformCategories(req, res) {
  cors(res);
  ensureMacroCategories();
  const url = new URL(req.url, 'http://localhost');
  const kind = url.searchParams.get('kind') || undefined;
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, items: listCategories({ kind }) }));
}

function handlePlatformPublishPairs(req, res) {
  cors(res);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, items: listPublishPairs() }));
}

async function handlePlatformCategoryCreate(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const result = createCategory(body.name);
    res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

async function handlePlatformCategoryDelete(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const result = deleteCategory(body.id, { reassignTo: body.reassignTo || null });
    const status = result.ok ? 200 : (result.error === 'category_in_use' ? 409 : 404);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

async function handlePlatformCatalogSetCategory(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const result = setCatalogCategory(body.catalogId, body.categoryId || null);
    res.writeHead(result.ok ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

function handlePlatformPackageSource(req, res) {
  cors(res);
  const url = new URL(req.url, 'http://localhost');
  const packageId = url.searchParams.get('packageId') || url.searchParams.get('id');
  if (!packageId) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'packageId_required' }));
    return;
  }
  const gamePath = getPackageGamePath(packageId);
  if (!gamePath || !fs.existsSync(gamePath)) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'game_not_found' }));
    return;
  }
  const content = fs.readFileSync(gamePath, 'utf8');
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    ok: true,
    packageId,
    path: 'game.html',
    content,
  }));
}

function handlePlatformStudentSummary(req, res, studentLabel) {
  cors(res);
  const result = getStudentTraceSummary(decodeURIComponent(studentLabel));
  const status = result.ok ? 200 : 400;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(result));
}


function handlePlatformAdapter(req, res) {
  cors(res);
  const url = new URL(req.url, 'http://localhost');
  const catalogId = url.searchParams.get('catalogId');
  const adapter = loadAdapter(catalogId);
  if (!adapter) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'adapter_not_found' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, catalogId, adapter }));
}


module.exports = {
  handleJudge,
  handlePlatformJudgeSession,
  handlePlatformAutoJudgeOnLeave,
  handlePlatformCatalog,
  handlePlatformPublish,
  handlePlatformSetPublished,
  handlePlatformCatalogDelete,
  handlePlatformCategories,
  handlePlatformPublishPairs,
  handlePlatformCategoryCreate,
  handlePlatformCategoryDelete,
  handlePlatformCatalogSetCategory,
  handlePlatformPackageSource,
  handlePlatformStudentSummary,
  handlePlatformAdapter,
};
