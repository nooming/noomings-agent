const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { judge } = require('../../packages/judge/judge');
const { buildJudgeRequest, normalizeTrace } = require('../../packages/judge/game-trace');
const { judgeAndSaveSession } = require('../../packages/platform/judge-session-core');
const { generateGraph } = require('../../packages/generate/pipeline');
const { runAnalyzeThreeStep } = require('../../packages/generate/analyze-three-step');
const { generateMultiLevelGraph } = require('../../packages/generate/multi-level-pipeline');
const { generateDesignGraph } = require('../../packages/generate/design-pipeline');
const { buildLlmPromptBundle } = require('../../packages/generate/export/llm-prompt-bundle');
const { validateWithSyntheticTraces } = require('../../packages/generate/trace-synth');
const { extractGameHints } = require('../../packages/generate/hints');
const { writeGeneratedGraph } = require('../../packages/generate/graph-persist');
const {
  createGraphProject,
  appendChapterToBundle,
  pruneOrphanIndexEntries,
} = require('../../packages/generate/incremental-bundle');
const { OUTPUT_ROOT, cors } = require('./static');
const {
  listCatalog,
  getCatalogItem,
  publishGame,
  setPublished,
  loadChapterForGraph,
  deleteCatalogItem,
  isProtectedPackageGraph,
} = require('../../packages/platform/catalog');
const {
  ingestTrace,
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
} = require('../../packages/platform/trace-store');
const { getPackageGamePath, getPackageChapterPath } = require('../../packages/shared/data-paths');
const { scoreTraceStrategy } = require('../../packages/judge/strategy-segment-score');
const { resolveStrategyPathScoreScope } = require('../../packages/judge/trace-normalize');
const {
  computeAbilityScore,
  ABILITY_SCORE_VERSION,
} = require('../../packages/judge/ability-score');
const { formatSummary, detectNearTies } = require('../web/ui/strategy-path-summary');
const { loadAdapter } = require('../../packages/platform/adapters');
const { generateGameHtml } = require('../../packages/generate/html-codegen');
const { listGamePages, deleteGamePage } = require('../../packages/platform/game-pages');
const { deleteGeneratedGraph } = require('../../packages/generate/graph-delete');
const {
  listCategories,
  createCategory,
  deleteCategory,
  setCatalogCategory,
  ensureMacroCategories,
} = require('../../packages/platform/categories');
const {
  listHtmlSampleGraphs,
  listHtmlSamplePages,
} = require('../../packages/platform/html-samples-index');
const { loadGraphPreviewPayload } = require('../../packages/platform/graph-preview');
const { listPublishPairs } = require('../../packages/platform/publish-pairs');

const LLM_OPTS = () => ({
  apiKey: process.env.DEEPSEEK_API_KEY,
  apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
});

function getTeacherAccessCode() {
  return String(process.env.TEACHER_ACCESS_CODE || process.env.PLATFORM_TEACHER_PASS || '').trim();
}

function deriveTeacherToken(code) {
  return crypto.createHmac('sha256', 'platform-teacher-v1').update(String(code)).digest('hex');
}

function safeEqualStr(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function extractBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const m = String(header).match(/^Bearer\s+(\S+)/i);
  return m ? m[1].trim() : '';
}

/** When TEACHER_ACCESS_CODE is set, mutating teacher routes require Bearer token from login. */
function requireTeacherAuth(req, res) {
  const code = getTeacherAccessCode();
  if (!code) return true;
  const expected = deriveTeacherToken(code);
  const token = extractBearerToken(req);
  if (token && safeEqualStr(token, expected)) return true;
  cors(res);
  res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false, error: 'teacher_auth_required' }));
  return false;
}

async function handleTeacherLogin(req, res) {
  cors(res);
  const configured = getTeacherAccessCode();
  if (!configured) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'teacher_access_not_configured' }));
    return;
  }
  try {
    const body = await readBody(req);
    const code = String(body.code || '').trim();
    if (!code || !safeEqualStr(code, configured)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'invalid_code' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, token: deriveTeacherToken(configured) }));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message || String(e) }));
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const IMPORT_ZIP_MAX_BYTES = 64 * 1024 * 1024;

function readRawBody(req, limit = IMPORT_ZIP_MAX_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Minimal multipart file extractor (filename parts only). */
function parseMultipartFiles(buffer, contentType) {
  const m = String(contentType || '').match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (!m) throw new Error('multipart_boundary_missing');
  const boundary = Buffer.from(`--${(m[1] || m[2]).trim()}`);
  const files = [];
  let start = buffer.indexOf(boundary);
  while (start >= 0) {
    let p = start + boundary.length;
    if (buffer[p] === 0x2d && buffer[p + 1] === 0x2d) break;
    if (buffer[p] === 0x0d && buffer[p + 1] === 0x0a) p += 2;
    const next = buffer.indexOf(boundary, p);
    if (next < 0) break;
    let partEnd = next;
    if (partEnd >= 2 && buffer[partEnd - 2] === 0x0d && buffer[partEnd - 1] === 0x0a) {
      partEnd -= 2;
    }
    const part = buffer.slice(p, partEnd);
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd >= 0) {
      const headers = part.slice(0, headerEnd).toString('utf8');
      const body = part.slice(headerEnd + 4);
      const fileMatch = headers.match(/filename="([^"]*)"/i);
      if (fileMatch && fileMatch[1]) {
        const nameMatch = headers.match(/name="([^"]+)"/i);
        files.push({
          field: nameMatch ? nameMatch[1] : 'file',
          filename: fileMatch[1],
          data: body,
        });
      }
    }
    start = next;
  }
  return files;
}

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

function resolveChParam(ch) {
  if (ch === 'external' || ch === 'auto' || ch === null || ch === undefined || ch === '') {
    return ch === 'external' ? 'external' : null;
  }
  const n = Number(ch);
  return Number.isFinite(n) ? n : null;
}

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

async function handlePreviewHints(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const sources = body.sources || [];
    const chParam = resolveChParam(body.ch);
    const gameHints = extractGameHints(sources, chParam === 'external' ? 'external' : chParam);
    const detectedLevels = (gameHints.levels || []).map(l => ({
      index: l.index,
      slotName: l.slotName,
      isFreeMode: !!l.isFreeMode,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      gameHints,
      detectedLevels,
      hasMultipleLevels: !!gameHints.hasMultipleLevels,
      levelCount: gameHints.levelCount || 0,
      detectionSource: gameHints.detectionSource || null,
    }));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

async function handleGenerateGraph(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const mode = body.mode === 'design' ? 'design' : 'analyze';
    const chParam = resolveChParam(body.ch);

    if (mode === 'design') {
      const gen = await generateDesignGraph({ ...body, ch: chParam }, LLM_OPTS());
      let saved = null;
      let saveError = null;
      const autoSaveDraft = body.autoSaveDraft !== false;
      if (autoSaveDraft && gen.validation?.ok && gen.chapter) {
        const skipQuality = !gen.quality?.ok;
        try {
          const result = writeGeneratedGraph({
            root: OUTPUT_ROOT,
            chapter: gen.chapter,
            title: body.title || gen.inquiryDraft?.title,
            ch: chParam,
            gameHints: gen.gameHints,
            sources: [{ path: 'design-spec.txt', content: body.knowledgePoints || '' }],
            skipQuality,
          });
          if (result.ok) {
            saved = {
              id: result.id,
              path: result.path,
              viewUrl: result.viewUrl,
              draftOnly: skipQuality,
            };
          } else {
            saveError = (result.errors || []).join('; ') || 'save failed';
          }
        } catch (e) {
          saveError = e.message;
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        mode: 'design',
        ...gen,
        promptBundle: gen.promptBundle || (gen.chapter ? buildLlmPromptBundle(gen.chapter) : null),
        saved,
        saveError,
      }));
      return;
    }

    const sources = body.sources?.length ? body.sources : [];
    if (!sources.length) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: false,
        error: 'sources_required',
        message: '请上传游戏源码（文件或文件夹）。',
      }));
      return;
    }
    const gameHints = extractGameHints(sources, chParam === 'external' ? 'external' : chParam);
    const useMultiLevel = gameHints.hasMultipleLevels && body.singleLevel !== true;

    let analyzeSteps = null;
    let analyzeParse = body.analyzeParse || null;
    if (!useMultiLevel && !analyzeParse) {
      const threeStep = runAnalyzeThreeStep({ sources, gameHints });
      analyzeSteps = threeStep.steps;
      analyzeParse = threeStep.analyzeParse;
    }

    if (useMultiLevel) {
      const gen = await generateMultiLevelGraph(
        { ...body, ch: chParam, sources, gameHints, outputRoot: OUTPUT_ROOT },
        LLM_OPTS(),
      );
      let saved = null;
      const autoSaveDraft = body.autoSaveDraft !== false;
      if (autoSaveDraft && gen.stats?.passed > 0) {
        const anyDraft = gen.levelResults?.some(r => r.draftOnly);
        saved = {
          id: gen.projectId,
          path: gen.path,
          viewUrl: gen.viewUrl,
          draftOnly: anyDraft,
          project: true,
        };
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        ...gen,
        saved,
        detectedLevels: gen.detectedLevels,
      }));
      return;
    }

    const gen = await generateGraph({
      ...body,
      ch: chParam,
      sources,
      gameHints,
      analyzeParse,
    }, LLM_OPTS());
    if (analyzeSteps?.length) {
      analyzeSteps = analyzeSteps.map(s =>
        (s.id === 'graph'
          ? {
            ...s,
            status: gen.validation?.ok && gen.quality?.ok ? 'done' : 'warn',
            summary: gen.validation?.ok
              ? (gen.quality?.ok ? '结构+质量校验通过' : `质量未过（${gen.quality?.score ?? 0}）`)
              : '结构校验未通过',
          }
          : s),
      );
    }
    let synth = null;
    if (gen.validation.ok && gen.chapter) {
      synth = await validateWithSyntheticTraces(gen.chapter, {}, gameHints);
    }

    let saved = null;
    let saveError = null;
    const autoSaveDraft = body.autoSaveDraft !== false;
    if (autoSaveDraft && gen.validation?.ok && gen.chapter) {
      const skipQuality = !gen.quality?.ok;
      try {
        const result = writeGeneratedGraph({
          root: OUTPUT_ROOT,
          chapter: gen.chapter,
          title: body.title,
          ch: chParam,
          gameHints,
          sources,
          skipQuality,
        });
        if (result.ok) {
          saved = {
            id: result.id,
            path: result.path,
            viewUrl: result.viewUrl,
            draftOnly: skipQuality,
          };
        } else {
          saveError = (result.errors || []).join('; ') || 'save failed';
        }
      } catch (e) {
        saveError = e.message;
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      mode: 'single',
      ...gen,
      ...synth,
      analyzeSteps,
      analyzeParse,
      promptBundle: gen.chapter ? buildLlmPromptBundle(gen.chapter) : null,
      saved,
      saveError,
      detectedLevels: (gameHints.levels || []).map(l => ({
        index: l.index,
        slotName: l.slotName,
        isFreeMode: !!l.isFreeMode,
      })),
    }));
  } catch (e) {
    const code = e.status || 400;
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

async function handleSaveGraphDraft(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const sources = body.sources || [];
    if (!sources.length) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'sources_required', message: '请上传源码后再保存草稿。' }));
      return;
    }
    const gameHints = sources.length ? extractGameHints(sources, body.ch) : { tier: 'generic' };
    const result = writeGeneratedGraph({
      root: OUTPUT_ROOT,
      chapter: body.chapter,
      title: body.title,
      ch: body.ch,
      gameHints,
      sources: body.sources,
      skipQuality: !!body.skipQuality,
    });
    if (!result.ok) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, errors: result.errors, quality: result.quality }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      id: result.id,
      path: result.path,
      viewUrl: result.viewUrl,
    }));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

async function handleCreateGraphProject(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const result = createGraphProject({ root: OUTPUT_ROOT, title: body.title });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

async function handleAppendGraphChapter(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const sources = body.sources || [];
    const gameHints = extractGameHints(sources, body.ch);
    const result = appendChapterToBundle({
      root: OUTPUT_ROOT,
      projectId: body.projectId,
      slotName: body.slotName,
      chapter: body.chapter,
      title: body.title,
      gameHints,
      sources,
    });
    if (!result.ok) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

function handleGeneratedGraphsIndex(req, res) {
  cors(res);
  const file = path.join(OUTPUT_ROOT, 'index.json');
  let outputItems = [];
  if (fs.existsSync(file)) {
    const data = pruneOrphanIndexEntries(OUTPUT_ROOT);
    outputItems = (data.items || []).map(i => ({ ...i, source: i.source || 'teacher', protected: false }));
  }
  const sampleGraphs = listHtmlSampleGraphs();
  const seen = new Set(sampleGraphs.map(g => g.id));
  const merged = [
    ...sampleGraphs,
    ...outputItems.filter(i => !seen.has(i.id)),
  ];
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, latest: outputItems[0]?.id || null, items: merged }));
}

function handleGamePagesIndex(req, res) {
  cors(res);
  const teacherPages = listGamePages().map(i => ({ ...i, source: i.source || 'teacher', protected: !!i.protected }));
  const samplePages = listHtmlSamplePages();
  const seen = new Set(samplePages.map(p => p.url));
  const merged = [
    ...samplePages,
    ...teacherPages.filter(p => !seen.has(p.url)),
  ];
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, items: merged }));
}

async function handleGamePageDelete(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const result = deleteGamePage(body.url, { force: body.force === true });
    const status = result.ok ? 200 : (result.error === 'referenced_by_catalog' ? 409 : 400);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

async function handleGeneratedGraphDelete(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    if (isProtectedPackageGraph(body.graphId) || String(body.graphId || '').startsWith('html-samples-')) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'protected_html_sample' }));
      return;
    }
    const result = deleteGeneratedGraph(body.graphId, OUTPUT_ROOT, { force: body.force === true });
    const status = result.ok ? 200 : (result.error === 'referenced_by_catalog' ? 409 : 400);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

async function handleTraceIngest(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const item = getCatalogItem(body.catalogId);
    if (item && !body.graphId) body.graphId = item.graphId;
    const result = ingestTrace(body);
    if (!result.ok) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {{ leaveAuto?: boolean }} [opts]
 * leaveAuto / body.reason==='leave': rules-only, skip if already judged (idempotent).
 */
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
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, items: listCatalog({ publishedOnly }) }));
}

async function handlePlatformPublish(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const result = publishGame(body);
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

async function handleGenerateGameHtml(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const result = await generateGameHtml(body, LLM_OPTS());
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, ...result }));
  } catch (e) {
    const status = e.status || 400;
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
}

function handleGraphPreview(req, res) {
  cors(res);
  const url = new URL(req.url, 'http://localhost');
  const graphId = url.searchParams.get('graphId') || '';
  const payload = loadGraphPreviewPayload(graphId);
  const status = payload.ok ? 200 : (payload.error === 'graph_not_found' ? 404 : 400);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
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

async function routeApi(req, res) {
  if (req.method === 'GET' && req.url === '/api/health') {
    cors(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      llm: !!process.env.DEEPSEEK_API_KEY,
      port: Number(process.env.PORT || process.env.AGENT_PORT) || 3001,
      judge: true,
      generate: true,
      platform: true,
      traceIngest: true,
      graphPreview: true,
    }));
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/demo/strategy-path-summary') {
    await handleDemoStrategyPathSummary(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/teacher-login') {
    await handleTeacherLogin(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/strategy-path-summary') {
    await handleSessionStrategyPathSummary(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/judge') {
    if (!requireTeacherAuth(req, res)) return true;
    await handleJudge(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/preview-hints') {
    if (!requireTeacherAuth(req, res)) return true;
    await handlePreviewHints(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/generate-graph') {
    if (!requireTeacherAuth(req, res)) return true;
    await handleGenerateGraph(req, res);
    return true;
  }
  if (req.method === 'GET' && new URL(req.url, 'http://localhost').pathname === '/api/graph-preview') {
    handleGraphPreview(req, res);
    return true;
  }
  if (req.method === 'GET' && req.url === '/api/generated-graphs') {
    handleGeneratedGraphsIndex(req, res);
    return true;
  }
  if (req.method === 'GET' && req.url === '/api/game-pages') {
    handleGamePagesIndex(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/game-pages/delete') {
    if (!requireTeacherAuth(req, res)) return true;
    await handleGamePageDelete(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/generated-graphs/delete') {
    if (!requireTeacherAuth(req, res)) return true;
    await handleGeneratedGraphDelete(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/save-graph-draft') {
    if (!requireTeacherAuth(req, res)) return true;
    await handleSaveGraphDraft(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/create-graph-project') {
    if (!requireTeacherAuth(req, res)) return true;
    await handleCreateGraphProject(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/append-graph-chapter') {
    if (!requireTeacherAuth(req, res)) return true;
    await handleAppendGraphChapter(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/trace/ingest') {
    await handleTraceIngest(req, res);
    return true;
  }
  if (req.method === 'GET' && req.url === '/api/platform/catalog') {
    handlePlatformCatalog(req, res, true);
    return true;
  }
  if (req.method === 'GET' && req.url === '/api/platform/catalog/all') {
    handlePlatformCatalog(req, res, false);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/publish') {
    if (!requireTeacherAuth(req, res)) return true;
    await handlePlatformPublish(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/set-published') {
    if (!requireTeacherAuth(req, res)) return true;
    await handlePlatformSetPublished(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/catalog/delete') {
    if (!requireTeacherAuth(req, res)) return true;
    await handlePlatformCatalogDelete(req, res);
    return true;
  }
  if (req.method === 'GET' && req.url === '/api/platform/publish-pairs') {
    handlePlatformPublishPairs(req, res);
    return true;
  }
  if (req.method === 'GET' && new URL(req.url, 'http://localhost').pathname === '/api/platform/categories') {
    handlePlatformCategories(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/categories') {
    if (!requireTeacherAuth(req, res)) return true;
    await handlePlatformCategoryCreate(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/categories/delete') {
    if (!requireTeacherAuth(req, res)) return true;
    await handlePlatformCategoryDelete(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/catalog/set-category') {
    if (!requireTeacherAuth(req, res)) return true;
    await handlePlatformCatalogSetCategory(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/traces/delete') {
    if (!requireTeacherAuth(req, res)) return true;
    await handlePlatformTraceDelete(req, res);
    return true;
  }
  if (req.method === 'POST') {
    const importPath = new URL(req.url, 'http://localhost').pathname;
    if (importPath === '/api/platform/traces/import-zip' || importPath === '/api/platform/traces/import-zip/') {
      if (!requireTeacherAuth(req, res)) return true;
      await handlePlatformTracesImportZip(req, res);
      return true;
    }
  }
  if (req.method === 'GET' && req.url.startsWith('/api/platform/traces')) {
    const tracesPath = new URL(req.url, 'http://localhost').pathname;
    if (tracesPath === '/api/platform/traces/export-zip' || tracesPath === '/api/platform/traces/export-zip/') {
      if (!requireTeacherAuth(req, res)) return true;
      handlePlatformTracesExportZip(req, res);
      return true;
    }
    if (tracesPath === '/api/platform/traces/stats' || tracesPath.startsWith('/api/platform/traces/stats/')) {
      handlePlatformTraceStats(req, res);
      return true;
    }
    if (tracesPath === '/api/platform/traces/classroom' || tracesPath.startsWith('/api/platform/traces/classroom/')) {
      handleClassroomBoard(req, res);
      return true;
    }
    if (tracesPath === '/api/platform/traces/students' || tracesPath === '/api/platform/traces/students/') {
      handlePlatformTraceStudents(req, res);
      return true;
    }
    const studentSummary = tracesPath.match(/^\/api\/platform\/traces\/students\/([^/]+)\/summary$/);
    if (studentSummary) {
      handlePlatformStudentSummary(req, res, studentSummary[1]);
      return true;
    }
    const detail = tracesPath.match(/^\/api\/platform\/traces\/([^/]+)$/);
    if (detail && detail[1] !== 'students') {
      handlePlatformTraceDetail(req, res, decodeURIComponent(detail[1]));
      return true;
    }
    if (tracesPath === '/api/platform/traces' || tracesPath === '/api/platform/traces/') {
      handlePlatformTraces(req, res);
      return true;
    }
  }
  if (req.method === 'GET' && req.url.startsWith('/api/platform/adapter')) {
    handlePlatformAdapter(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/generate-game-html') {
    if (!requireTeacherAuth(req, res)) return true;
    await handleGenerateGameHtml(req, res);
    return true;
  }
  if (req.method === 'GET' && req.url.startsWith('/api/platform/package-source')) {
    handlePlatformPackageSource(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/judge-session') {
    if (!requireTeacherAuth(req, res)) return true;
    await handlePlatformJudgeSession(req, res);
    return true;
  }
  // 学生离开探究页：rules 自动评判（幂等）；无需教师鉴权；供 sendBeacon / keepalive
  if (req.method === 'POST' && req.url === '/api/platform/auto-judge-on-leave') {
    await handlePlatformAutoJudgeOnLeave(req, res);
    return true;
  }
  return false;
}

module.exports = { routeApi, readBody };
