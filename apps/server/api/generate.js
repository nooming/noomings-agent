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

function resolveChParam(ch) {
  if (ch === 'external' || ch === 'auto' || ch === null || ch === undefined || ch === '') {
    return ch === 'external' ? 'external' : null;
  }
  const n = Number(ch);
  return Number.isFinite(n) ? n : null;
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


module.exports = {
  resolveChParam,
  handlePreviewHints,
  handleGenerateGraph,
  handleSaveGraphDraft,
  handleCreateGraphProject,
  handleAppendGraphChapter,
  handleGeneratedGraphsIndex,
  handleGamePagesIndex,
  handleGamePageDelete,
  handleGeneratedGraphDelete,
  handleGenerateGameHtml,
  handleGraphPreview,
};
