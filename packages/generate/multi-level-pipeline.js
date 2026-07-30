const { enrichChapterContract } = require('../contract/enrich');
const { validateChapterQuality } = require('../contract');
const { extractGameHints, buildLevelGameHints } = require('./hints');
const pipelineMod = require('./pipeline');
const { validateWithSyntheticTraces } = require('./trace-synth');
const {
  createGraphProject,
  appendChapterToBundle,
  appendFailedChapterToBundle,
} = require('./incremental-bundle');

function resolveLevelConcurrency(body) {
  const fromBody = Number(body.levelConcurrency);
  if (Number.isFinite(fromBody) && fromBody >= 1) return Math.min(4, Math.floor(fromBody));
  const fromEnv = Number(process.env.AGENT_LEVEL_CONCURRENCY);
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return Math.min(4, Math.floor(fromEnv));
  return 2;
}

async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function withRateLimitRetry(fn) {
  try {
    return await fn();
  } catch (e) {
    const msg = String(e.message || e);
    if (/429|rate|Too Many/i.test(msg)) {
      await new Promise(r => setTimeout(r, 2000));
      return fn();
    }
    throw e;
  }
}

async function generateLevelPayload(level, body, opts, baseHints, sources) {
  const levelHints = buildLevelGameHints(baseHints, level);
  const levelStart = Date.now();
  const gen = await withRateLimitRetry(() => pipelineMod.generateGraph(
    {
      ...body,
      title: level.slotName,
      gameHints: levelHints,
      sources,
      multiLevel: true,
    },
    opts,
  ));

  let synth = null;
  if (gen.validation?.ok && gen.chapter) {
    synth = await validateWithSyntheticTraces(gen.chapter, {}, levelHints);
  }

  const traceMapOk = !!(gen.chapter?.traceMap?.controls && Object.keys(gen.chapter.traceMap.controls).length);
  let appendPlan;
  if (gen.validation?.ok && gen.chapter && traceMapOk) {
    const enrichedPreview = enrichChapterContract(gen.chapter, levelHints, sources);
    const postEnrichQuality = validateChapterQuality(enrichedPreview, levelHints);
    appendPlan = {
      kind: 'ok',
      skipQuality: !postEnrichQuality.ok,
      errors: null,
    };
  } else {
    appendPlan = {
      kind: 'fail',
      skipQuality: false,
      errors: !traceMapOk && gen.chapter
        ? ['traceMap missing or empty after generation']
        : (gen.validation?.errors || gen.quality?.errors || ['generation failed']),
    };
  }

  return {
    level,
    levelHints,
    gen,
    synth,
    appendPlan,
    levelMs: Date.now() - levelStart,
  };
}

function appendLevelPayload(root, projectId, payload) {
  const { level, levelHints, gen, appendPlan } = payload;
  const sources = payload.sources;

  if (appendPlan.kind === 'ok') {
    let appendResult = appendChapterToBundle({
      root,
      projectId,
      slotName: level.slotName,
      chapter: gen.chapter,
      title: level.slotName,
      gameHints: levelHints,
      sources,
      skipQuality: appendPlan.skipQuality,
    });
    if (!appendResult.ok && gen.validation?.ok) {
      appendResult = appendFailedChapterToBundle({
        root,
        projectId,
        slotName: level.slotName,
        title: level.slotName,
        errors: appendResult.errors || ['append failed'],
      });
    }
    return appendResult;
  }

  return appendFailedChapterToBundle({
    root,
    projectId,
    slotName: level.slotName,
    title: level.slotName,
    errors: appendPlan.errors,
  });
}

async function generateMultiLevelGraph(body, opts = {}) {
  const sources = body.sources || [];
  const baseHints = body.gameHints || extractGameHints(sources, body.ch);
  const levels = baseHints.levels || [];

  if (!baseHints.hasMultipleLevels || levels.length < 2) {
    const err = new Error('multi_level_not_detected');
    err.status = 400;
    throw err;
  }

  const projectTitle = (body.title || baseHints.projectTitle || '网页游戏项目图谱').trim();
  const root = body.outputRoot || opts.outputRoot;
  if (!root) {
    const err = new Error('outputRoot required for multi-level generation');
    err.status = 500;
    throw err;
  }

  const project = createGraphProject({ root, title: projectTitle });
  const concurrency = resolveLevelConcurrency(body);
  const batchStart = Date.now();
  const timings = { llmMs: 0, llmCalls: 0, enrichMs: 0, totalMs: 0, perLevel: [] };

  const generated = await mapWithConcurrency(levels, concurrency, level =>
    generateLevelPayload(level, body, opts, baseHints, sources),
  );

  generated.sort((a, b) => a.level.index - b.level.index);

  const levelResults = [];
  let totalAttempts = 0;
  let anyTeachRepair = false;
  let anyDtRepair = false;

  for (const payload of generated) {
    payload.sources = sources;
    const { level, gen, synth, levelMs } = payload;
    totalAttempts += gen.attempts || 0;
    if (gen.teachRepairUsed) anyTeachRepair = true;
    if (gen.dtRepairUsed || gen.dtQualityRepairUsed) anyDtRepair = true;
    if (gen.timings) {
      timings.llmMs += gen.timings.llmMs || 0;
      timings.llmCalls += gen.timings.llmCalls || 0;
      timings.enrichMs += gen.timings.enrichMs || 0;
    }
    timings.perLevel.push({
      index: level.index,
      slotName: level.slotName,
      levelMs,
      llmCalls: gen.timings?.llmCalls || 0,
      attempts: gen.attempts || 0,
    });

    const appendResult = appendLevelPayload(root, project.projectId, payload);
    levelResults.push({
      slotName: level.slotName,
      index: level.index,
      validation: gen.validation,
      quality: gen.quality,
      qualityChecklist: gen.quality?.checklist,
      qualityErrors: gen.quality?.errors,
      attempts: gen.attempts,
      synth,
      saved: appendResult.ok && !appendResult.failed,
      draftOnly: !!appendResult.draftOnly,
      failed: !!appendResult.failed,
      ch: appendResult.ch,
      errors: appendResult.errors,
      timings: gen.timings,
    });
  }

  timings.totalMs = Date.now() - batchStart;
  const passed = levelResults.filter(r => r.saved).length;
  const failed = levelResults.filter(r => r.failed || !r.saved).length;

  return {
    ok: true,
    mode: 'project',
    projectId: project.projectId,
    viewUrl: project.viewUrl,
    path: project.path,
    levelConcurrency: concurrency,
    detectedLevels: levels.map(l => ({ index: l.index, slotName: l.slotName, isFreeMode: l.isFreeMode })),
    levelResults,
    gameHints: baseHints,
    attempts: totalAttempts,
    teachRepairUsed: anyTeachRepair,
    dtRepairUsed: anyDtRepair,
    timings,
    stats: {
      total: levels.length,
      passed,
      failed,
    },
    validation: {
      ok: passed > 0,
      errors: failed ? [`${failed} 关未成功写入`] : [],
    },
    quality: {
      ok: levelResults.every(r => r.quality?.ok),
      score: passed / Math.max(levels.length, 1),
    },
    chapter: null,
    inferredContext: {
      titleProvided: !!(body.title && String(body.title).trim()),
      multiLevel: true,
      levelCount: levels.length,
    },
  };
}

module.exports = {
  generateMultiLevelGraph,
  mapWithConcurrency,
  resolveLevelConcurrency,
};
