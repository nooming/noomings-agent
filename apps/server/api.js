const fs = require('fs');
const path = require('path');
const { judge } = require('../../packages/judge/judge');
const { buildJudgeRequest, normalizeTrace } = require('../../packages/judge/game-trace');
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
  saveJudgeResult,
  saveTraceSession,
  deleteTraceSessions,
  getStudentTraceSummary,
  enrichRecordMetrics,
  getClassroomBoard,
  exportClassroomCsv,
} = require('../../packages/platform/trace-store');
const { getPackageGamePath, getPackageChapterPath } = require('../../packages/shared/data-paths');
const { scoreTraceStrategy } = require('../../packages/judge/strategy-segment-score');
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

async function handlePlatformJudgeSession(req, res) {
  cors(res);
  try {
    const body = await readBody(req);
    const session = getTraceSession(body.sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'session_not_found' }));
      return;
    }
    const graphId = body.graphId || session.graphId;
    const chapter = loadChapterForGraph(graphId);
    if (!chapter) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'chapter_not_found' }));
      return;
    }
    const ch = body.ch ?? session.ch ?? 0;
    const base = buildJudgeRequest({
      ch,
      trace: normalizeTrace({ events: session.events, ch, game: session.game }, ch),
      chapter,
    });
    const graph = base.graph;
    const result = await judge({ ...body, ...base, graph, chapter }, LLM_OPTS());
    saveJudgeResult(session.sessionId, { ...result, judgedAt: new Date().toISOString() });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, sessionId: session.sessionId, ch, ...result }));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
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
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    ok: true,
    items: listTraceStudents({ graphId, catalogId, q, status }),
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
    const mode = body.mode
      || (session.currentPhase === 'challenge' ? 'compete' : 'explore');
    const events = Array.isArray(session.events) ? session.events : [];
    const audience = body.audience === 'teacher' ? 'teacher' : 'student';
    if (!events.length) {
      const summary = formatSummary(
        { primaryStrategy: null, score: null, breakdown: {} },
        { audience, showScore: false, alignmentOk: false, degradeReason: 'events_empty' },
      );
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        sessionId: session.sessionId,
        graphId,
        mode,
        summary,
        degraded: true,
        variableAdjustCounts: session.variableAdjustCounts,
        source: 'session-events',
      }));
      return;
    }
    const scoreResult = scoreTraceStrategy(events, chapter, { mode });
    const nearTies = detectNearTies(scoreResult, chapter);
    const sawModeSwitch = (events || []).some(e =>
      e.type === 'phase_change' || e.type === 'mode');
    const degradeReason = body.degradeReason
      || (sawModeSwitch && body.strictModeAlign ? 'mode_switch' : null);
    const summary = formatSummary(scoreResult, {
      showScore: body.showScore != null ? !!body.showScore : audience === 'teacher',
      audience,
      nearTies,
      alignmentOk: degradeReason ? false : true,
      degradeReason,
    });
    // Persist path summary on session for teacher view (always keep score)
    session.strategyPathSummary = {
      ...summary,
      primaryStrategy: scoreResult.primaryStrategy,
      score: scoreResult.score,
      mode,
      nearTies,
      scoredAt: new Date().toISOString(),
    };
    saveTraceSession(session);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      sessionId: session.sessionId,
      graphId,
      mode,
      primaryStrategy: scoreResult.primaryStrategy,
      score: scoreResult.score,
      summary,
      nearTies,
      variableAdjustCounts: session.variableAdjustCounts,
      source: 'session-events',
      contract: {
        student: 'summary.text + summary.advice（不剧透最优；默认无分数）',
        teacher: 'audience=teacher 或 showScore=true 可见吻合度与 teacherDetail',
      },
    }));
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
  if (req.method === 'POST' && req.url === '/api/platform/strategy-path-summary') {
    await handleSessionStrategyPathSummary(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/judge') {
    await handleJudge(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/preview-hints') {
    await handlePreviewHints(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/generate-graph') {
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
    await handleGamePageDelete(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/generated-graphs/delete') {
    await handleGeneratedGraphDelete(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/save-graph-draft') {
    await handleSaveGraphDraft(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/create-graph-project') {
    await handleCreateGraphProject(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/append-graph-chapter') {
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
    await handlePlatformPublish(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/set-published') {
    await handlePlatformSetPublished(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/catalog/delete') {
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
    await handlePlatformCategoryCreate(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/categories/delete') {
    await handlePlatformCategoryDelete(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/catalog/set-category') {
    await handlePlatformCatalogSetCategory(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/traces/delete') {
    await handlePlatformTraceDelete(req, res);
    return true;
  }
  if (req.method === 'GET' && req.url.startsWith('/api/platform/traces')) {
    if (req.url.startsWith('/api/platform/traces/stats')) {
      handlePlatformTraceStats(req, res);
      return true;
    }
    if (req.url.startsWith('/api/platform/traces/classroom')) {
      handleClassroomBoard(req, res);
      return true;
    }
    if (req.url.startsWith('/api/platform/traces/students/')) {
      const m = req.url.match(/^\/api\/platform\/traces\/students\/([^/?]+)(\/summary)?/);
      if (m && (m[2] || req.url.includes('/summary'))) {
        handlePlatformStudentSummary(req, res, m[1]);
        return true;
      }
      handlePlatformTraceStudents(req, res);
      return true;
    }
    const detail = req.url.match(/^\/api\/platform\/traces\/([^/?]+)/);
    if (detail) {
      handlePlatformTraceDetail(req, res, decodeURIComponent(detail[1]));
      return true;
    }
    handlePlatformTraces(req, res);
    return true;
  }
  if (req.method === 'GET' && req.url.startsWith('/api/platform/adapter')) {
    handlePlatformAdapter(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/generate-game-html') {
    await handleGenerateGameHtml(req, res);
    return true;
  }
  if (req.method === 'GET' && req.url.startsWith('/api/platform/package-source')) {
    handlePlatformPackageSource(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/judge-session') {
    await handlePlatformJudgeSession(req, res);
    return true;
  }
  return false;
}

module.exports = { routeApi, readBody };
