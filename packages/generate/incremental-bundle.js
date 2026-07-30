const fs = require('fs');
const path = require('path');
const { validateChapter, validateChapterQuality } = require('../contract');
const { validateChapterScope } = require('../contract/validate/validate-scope');
const { enrichChapterContract } = require('../contract/enrich');
const { ensureUniqueSlug, readIndex, writeIndex, makeBatchSlug, renderFullIndexHtml, renderSinglePreviewHtml } = require('./graph-persist');

function projectDir(root, projectId) {
  const safe = String(projectId).replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '');
  if (!safe || safe !== String(projectId)) {
    throw new Error('invalid projectId');
  }
  return path.join(root, safe);
}

function readChaptersFile(dir) {
  const file = path.join(dir, 'chapters.json');
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function readMetaFile(dir) {
  const file = path.join(dir, 'meta.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeMetaAndChapters(dir, meta, chaptersPayload) {
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'chapters.json'), JSON.stringify(chaptersPayload, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'index.html'), renderFullIndexHtml(meta), 'utf8');
}

function nextEmptySlot(chapters) {
  const used = new Set(chapters.filter(c => c.ok && c.kg).map(c => c.ch));
  for (let i = 0; i < 32; i++) {
    if (!used.has(i)) return i;
  }
  return chapters.length;
}

function normalizeSlotName(name) {
  if (name == null) return null;
  const t = String(name).trim().replace(/[<>"'`\\/]/g, '').slice(0, 48);
  return t || null;
}

function resolveSlotName(slotName, title, chapter) {
  return normalizeSlotName(slotName)
    || normalizeSlotName(title)
    || normalizeSlotName(chapter?.kg?.title)
    || '?????';
}

function chapterDisplayName(c) {
  if (!c) return '';
  return c.slotName || normalizeSlotName(c.title) || `?? ${c.ch}`;
}

function createGraphProject({ root, title }) {
  fs.mkdirSync(root, { recursive: true });
  const slug = ensureUniqueSlug(root, makeBatchSlug(title || 'web-game-project'));
  const dir = path.join(root, slug);
  fs.mkdirSync(dir, { recursive: true });

  const savedAt = new Date().toISOString();
  const meta = {
    title: (title || '????????').trim(),
    savedAt,
    source: 'agent-a',
    type: 'full',
    mode: 'incremental',
    chapters: [],
    okChapters: [],
    failedChapters: [],
    stats: { total: 0, passed: 0, failed: [] },
  };

  writeMetaAndChapters(dir, meta, []);

  const index = readIndex(root);
  const item = {
    id: slug,
    type: 'full',
    mode: 'incremental',
    title: meta.title,
    savedAt,
    url: `/packages/${slug}/index.html`,
    stats: meta.stats,
  };
  index.items.unshift(item);
  index.latest = slug;
  writeIndex(root, index);

  return {
    ok: true,
    projectId: slug,
    path: `output/${slug}`,
    viewUrl: item.url,
    meta,
  };
}

function evaluateChapterQuality(enriched, gameHints) {
  const validation = validateChapter(enriched);
  if (!validation.ok) {
    return {
      validation,
      quality: {
        ok: false,
        score: 0,
        errors: validation.errors || [],
        warnings: [],
        checklist: {},
      },
    };
  }
  let quality = validateChapterQuality(enriched, gameHints);
  const scopeResult = validateChapterScope(enriched, gameHints);
  scopeResult.errors.forEach(e => {
    if (!quality.errors.includes(e)) quality.errors.push(e);
  });
  (scopeResult.warnings || []).forEach(w => {
    quality.warnings = quality.warnings || [];
    if (!quality.warnings.includes(w)) quality.warnings.push(w);
  });
  Object.assign(quality.checklist, scopeResult.checklist);
  if (scopeResult.errors.length) quality.ok = false;
  return { validation, quality };
}

function syncBundleMetaFromChapters(meta, chapters) {
  const okEntries = chapters.filter(c => c.ok && c.kg);
  const okChapters = okEntries.map(c => c.ch);
  const qualityPassedChapters = okEntries.filter(c => c.quality?.ok).map(c => c.ch);
  const qualityFailedChapters = okEntries.filter(c => c.quality && !c.quality.ok).map(c => c.ch);
  meta.chapters = chapters.map(c => c.ch);
  meta.slotNames = okEntries.map(c => c.slotName || chapterDisplayName(c));
  meta.okChapters = okChapters;
  meta.failedChapters = chapters.filter(c => !c.ok).map(c => c.ch);
  meta.qualityOkChapters = qualityPassedChapters;
  meta.qualityFailedChapters = qualityFailedChapters;
  meta.stats = {
    total: chapters.length,
    passed: okChapters.length,
    failed: meta.failedChapters,
    qualityPassed: qualityPassedChapters.length,
    qualityFailed: qualityFailedChapters.length,
    qualityFailedChapters,
  };
  meta.subtitle = `\u589e\u91cf\u9879\u76ee \u00b7 ${okEntries.length} \u5173 \u00b7 ${okEntries.map(chapterDisplayName).join('\u3001')}`;
  return meta;
}

/**
 * Re-enrich all ok chapters in an incremental project (no LLM).
 * Updates chapters.json, meta.json, index.html and output/index.json stats.
 */
function refreshProjectBundleEnrich({ root, projectId, sources }) {
  const { extractGameHints, buildLevelGameHints } = require('./hints');
  const dir = projectDir(root, projectId);
  if (!fs.existsSync(dir)) {
    return { ok: false, errors: [`project not found: ${projectId}`] };
  }
  if (!Array.isArray(sources) || !sources.length) {
    return { ok: false, errors: ['sources[] required (game HTML for per-level hints)'] };
  }

  const chapters = readChaptersFile(dir);
  const baseHints = extractGameHints(sources);
  const levels = baseHints.levels || [];
  const levelResults = [];

  const refreshed = chapters.map(entry => {
    if (!entry.ok || !entry.kg) return entry;
    const level = levels[entry.ch] || levels.find(l => l.index === entry.ch);
    const levelHints = level ? buildLevelGameHints(baseHints, level) : baseHints;
    const raw = {
      mapping: entry.mapping,
      kg: entry.kg,
      dt: entry.dt,
      winSync: entry.winSync,
      strategy: entry.strategy,
      traceMap: entry.traceMap,
    };
    const enriched = enrichChapterContract(raw, levelHints, sources);
    const { validation, quality } = evaluateChapterQuality(enriched, levelHints);
    levelResults.push({
      ch: entry.ch,
      slotName: entry.slotName,
      structOk: validation.ok,
      qualityOk: quality.ok,
      score: quality.score,
      errors: quality.errors?.slice(0, 3) || [],
    });
    if (!validation.ok) return entry;
    return {
      ...entry,
      quality: {
        ok: quality.ok,
        score: quality.score,
        errors: quality.errors || [],
        warnings: quality.warnings || [],
        checklist: quality.checklist || {},
      },
      mapping: enriched.mapping,
      kg: enriched.kg,
      dt: enriched.dt,
      winSync: enriched.winSync,
      strategy: enriched.strategy,
      traceMap: enriched.traceMap,
      savedAt: new Date().toISOString(),
      sourcesCount: sources.length,
    };
  });

  refreshed.sort((a, b) => a.ch - b.ch);
  const meta = readMetaFile(dir) || {};
  meta.title = meta.title || '????????';
  meta.savedAt = new Date().toISOString();
  meta.type = 'full';
  meta.mode = 'incremental';
  meta.enrichedAt = meta.savedAt;
  syncBundleMetaFromChapters(meta, refreshed);
  writeMetaAndChapters(dir, meta, refreshed);

  const index = readIndex(root);
  const item = index.items.find(i => i.id === projectId);
  if (item) {
    item.savedAt = meta.savedAt;
    item.stats = meta.stats;
    item.title = meta.title;
    writeIndex(root, index);
  }

  return {
    ok: true,
    projectId,
    path: `output/${projectId}`,
    viewUrl: `/packages/${projectId}/index.html`,
    meta,
    levelResults,
    qualityPassed: meta.stats.qualityPassed,
    qualityFailed: meta.stats.qualityFailed,
  };
}

/**
 * Re-enrich a single-chapter output project (chapter.json) in place (no LLM).
 */
function refreshSingleChapterEnrich({ root, projectId, sources }) {
  const { extractGameHints } = require('./hints');
  const dir = projectDir(root, projectId);
  const chapterPath = path.join(dir, 'chapter.json');
  if (!fs.existsSync(chapterPath)) {
    return { ok: false, errors: [`chapter.json not found in ${projectId}`] };
  }
  if (!Array.isArray(sources) || !sources.length) {
    return { ok: false, errors: ['sources[] required (game HTML for hints)'] };
  }

  const raw = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
  const baseHints = extractGameHints(sources);
  const enriched = enrichChapterContract(raw, baseHints, sources);
  const { validation, quality } = evaluateChapterQuality(enriched, baseHints);

  const levelResult = {
    ch: 0,
    slotName: enriched.kg?.title || 'chapter',
    structOk: validation.ok,
    qualityOk: quality.ok,
    score: quality.score,
    errors: quality.errors?.slice(0, 3) || [],
  };

  if (!validation.ok) {
    return { ok: false, errors: validation.errors, levelResults: [levelResult] };
  }

  const savedAt = new Date().toISOString();
  const chapterPayload = {
    mapping: enriched.mapping,
    kg: enriched.kg,
    dt: enriched.dt,
    winSync: enriched.winSync,
    strategy: enriched.strategy,
    traceMap: enriched.traceMap,
  };
  fs.writeFileSync(chapterPath, JSON.stringify(chapterPayload, null, 2), 'utf8');

  const meta = readMetaFile(dir) || {};
  meta.title = meta.title || enriched.kg?.title || projectId;
  meta.savedAt = savedAt;
  meta.enrichedAt = savedAt;
  meta.quality = {
    ok: quality.ok,
    score: quality.score,
    errors: quality.errors || [],
    warnings: quality.warnings || [],
    checklist: quality.checklist || {},
  };
  meta.stats = {
    total: 1,
    passed: quality.ok ? 1 : 0,
    failed: quality.ok ? [] : ['chapter'],
    qualityPassed: quality.ok ? 1 : 0,
    qualityFailed: quality.ok ? 0 : 1,
    qualityFailedChapters: quality.ok ? [] : [0],
  };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'index.html'), renderSinglePreviewHtml(meta), 'utf8');

  const index = readIndex(root);
  const item = index.items.find(i => i.id === projectId);
  if (item) {
    item.savedAt = savedAt;
    item.stats = meta.stats;
    item.title = meta.title;
    writeIndex(root, index);
  }

  return {
    ok: true,
    projectId,
    path: `output/${projectId}`,
    viewUrl: `/packages/${projectId}/index.html`,
    meta,
    levelResults: [levelResult],
    qualityPassed: meta.stats.qualityPassed,
    qualityFailed: meta.stats.qualityFailed,
  };
}

function refreshProjectBundleEnrichAuto({ root, projectId, sources }) {
  const dir = projectDir(root, projectId);
  if (fs.existsSync(path.join(dir, 'chapters.json'))) {
    return refreshProjectBundleEnrich({ root, projectId, sources });
  }
  if (fs.existsSync(path.join(dir, 'chapter.json'))) {
    return refreshSingleChapterEnrich({ root, projectId, sources });
  }
  return { ok: false, errors: [`no chapters.json or chapter.json in ${projectId}`] };
}

function appendChapterToBundle({
  root,
  projectId,
  slotName: slotNameInput,
  chapter,
  title,
  gameHints,
  sources,
  skipQuality,
}) {
  const enriched = enrichChapterContract(chapter, gameHints, sources);
  const validation = validateChapter(enriched);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, validation };
  }
  let quality = validateChapterQuality(enriched, gameHints);
  const scopeResult = validateChapterScope(enriched, gameHints);
  scopeResult.errors.forEach(e => {
    if (!quality.errors.includes(e)) quality.errors.push(e);
  });
  (scopeResult.warnings || []).forEach(w => {
    quality.warnings = quality.warnings || [];
    if (!quality.warnings.includes(w)) quality.warnings.push(w);
  });
  Object.assign(quality.checklist, scopeResult.checklist);
  if (scopeResult.errors.length) quality.ok = false;

  if (!skipQuality && !quality.ok) {
    return { ok: false, errors: quality.errors, quality, validation: { ok: true } };
  }

  const dir = projectDir(root, projectId);
  if (!fs.existsSync(dir)) {
    return { ok: false, errors: [`project not found: ${projectId}`] };
  }

  let chapters = readChaptersFile(dir);
  const name = resolveSlotName(slotNameInput, title, enriched);
  const idx = chapters.findIndex(c => c.slotName === name);
  const slot = idx >= 0 ? chapters[idx].ch : nextEmptySlot(chapters);
  if (slot < 0 || slot > 31) {
    return { ok: false, errors: ['\u9879\u76ee\u5173\u5361\u6570\u91cf\u5df2\u8fbe\u4e0a\u9650\uff0832\uff09'] };
  }

  const chapterTitle = (title || enriched.kg?.title || name).trim();
  const entry = {
    ch: slot,
    slotName: name,
    ok: true,
    title: chapterTitle,
    error: null,
    quality: {
      ok: quality.ok,
      score: quality.score,
      errors: quality.errors || [],
      warnings: quality.warnings || [],
      checklist: quality.checklist || {},
    },
    mapping: enriched.mapping,
    kg: enriched.kg,
    dt: enriched.dt,
    winSync: enriched.winSync,
    strategy: enriched.strategy,
    traceMap: enriched.traceMap,
    savedAt: new Date().toISOString(),
    sourcesCount: Array.isArray(sources) ? sources.length : 0,
  };

  if (idx >= 0) chapters[idx] = entry;
  else chapters.push(entry);
  chapters.sort((a, b) => a.ch - b.ch);

  const okEntries = chapters.filter(c => c.ok && c.kg);
  const okChapters = okEntries.map(c => c.ch);
  const qualityPassedChapters = okEntries.filter(c => c.quality?.ok).map(c => c.ch);
  const qualityFailedChapters = okEntries.filter(c => c.quality && !c.quality.ok).map(c => c.ch);
  const meta = readMetaFile(dir) || {};
  meta.title = meta.title || '????????';
  meta.savedAt = new Date().toISOString();
  meta.type = 'full';
  meta.mode = 'incremental';
  meta.chapters = chapters.map(c => c.ch);
  meta.slotNames = okEntries.map(c => c.slotName || chapterDisplayName(c));
  meta.okChapters = okChapters;
  meta.failedChapters = chapters.filter(c => !c.ok).map(c => c.ch);
  meta.qualityOkChapters = qualityPassedChapters;
  meta.qualityFailedChapters = qualityFailedChapters;
  meta.stats = {
    total: chapters.length,
    passed: okChapters.length,
    failed: meta.failedChapters,
    qualityPassed: qualityPassedChapters.length,
    qualityFailed: qualityFailedChapters.length,
    qualityFailedChapters,
  };
  meta.subtitle = `\u589e\u91cf\u9879\u76ee \u00b7 ${okEntries.length} \u5173 \u00b7 ${okEntries.map(chapterDisplayName).join('\u3001')}`;

  writeMetaAndChapters(dir, meta, chapters);

  const index = readIndex(root);
  const item = index.items.find(i => i.id === projectId);
  if (item) {
    item.savedAt = meta.savedAt;
    item.stats = meta.stats;
    item.title = meta.title;
    writeIndex(root, index);
  }

  return {
    ok: true,
    projectId,
    slotName: name,
    ch: slot,
    replaced: idx >= 0,
    path: `output/${projectId}`,
    viewUrl: `/packages/${projectId}/index.html`,
    meta,
    quality,
    draftOnly: !!skipQuality && !quality.ok,
  };
}

function appendFailedChapterToBundle({
  root,
  projectId,
  slotName: slotNameInput,
  title,
  errors,
}) {
  const dir = projectDir(root, projectId);
  if (!fs.existsSync(dir)) {
    return { ok: false, errors: [`project not found: ${projectId}`] };
  }

  let chapters = readChaptersFile(dir);
  const name = normalizeSlotName(slotNameInput) || normalizeSlotName(title) || '\u672a\u547d\u540d\u5173\u5361';
  const idx = chapters.findIndex(c => c.slotName === name);
  const slot = idx >= 0 ? chapters[idx].ch : nextEmptySlot(chapters);
  if (slot < 0 || slot > 31) {
    return { ok: false, errors: ['\u9879\u76ee\u5173\u5361\u6570\u91cf\u5df2\u8fbe\u4e0a\u9650\uff0832\uff09'] };
  }

  const entry = {
    ch: slot,
    slotName: name,
    ok: false,
    title: (title || name).trim(),
    error: (errors || []).join('; ') || 'generation failed',
    quality: null,
    mapping: null,
    kg: null,
    dt: null,
    winSync: null,
    strategy: null,
    savedAt: new Date().toISOString(),
  };

  if (idx >= 0) chapters[idx] = entry;
  else chapters.push(entry);
  chapters.sort((a, b) => a.ch - b.ch);

  const okEntries = chapters.filter(c => c.ok && c.kg);
  const qualityPassedChapters = okEntries.filter(c => c.quality?.ok).map(c => c.ch);
  const qualityFailedChapters = okEntries.filter(c => c.quality && !c.quality.ok).map(c => c.ch);
  const meta = readMetaFile(dir) || {};
  meta.title = meta.title || '????????';
  meta.savedAt = new Date().toISOString();
  meta.type = 'full';
  meta.mode = 'incremental';
  meta.chapters = chapters.map(c => c.ch);
  meta.slotNames = okEntries.map(c => c.slotName || chapterDisplayName(c));
  meta.okChapters = okEntries.map(c => c.ch);
  meta.failedChapters = chapters.filter(c => !c.ok).map(c => c.ch);
  meta.qualityOkChapters = qualityPassedChapters;
  meta.qualityFailedChapters = qualityFailedChapters;
  meta.stats = {
    total: chapters.length,
    passed: okEntries.length,
    failed: meta.failedChapters,
    qualityPassed: qualityPassedChapters.length,
    qualityFailed: qualityFailedChapters.length,
    qualityFailedChapters,
  };
  meta.subtitle = `\u589e\u91cf\u9879\u76ee \u00b7 ${okEntries.length} \u5173 \u00b7 ${okEntries.map(chapterDisplayName).join('\u3001')}`;

  writeMetaAndChapters(dir, meta, chapters);

  const index = readIndex(root);
  const item = index.items.find(i => i.id === projectId);
  if (item) {
    item.savedAt = meta.savedAt;
    item.stats = meta.stats;
    item.title = meta.title;
    writeIndex(root, index);
  }

  return {
    ok: true,
    projectId,
    slotName: name,
    ch: slot,
    failed: true,
    path: `output/${projectId}`,
    viewUrl: `/packages/${projectId}/index.html`,
    meta,
    errors,
  };
}

function listIncrementalProjects(root) {
  const index = readIndex(root);
  return index.items.filter(i => i.type === 'full' && i.mode === 'incremental');
}

function pruneOrphanIndexEntries(root) {
  const index = readIndex(root);
  const items = index.items.filter(item => fs.existsSync(path.join(root, item.id)));
  let latest = index.latest;
  if (latest && !items.some(i => i.id === latest)) {
    latest = items[0]?.id || null;
  }
  if (items.length !== index.items.length || latest !== index.latest) {
    writeIndex(root, { latest, items });
  }
  return { latest, items };
}

module.exports = {
  createGraphProject,
  appendChapterToBundle,
  appendFailedChapterToBundle,
  refreshProjectBundleEnrich,
  refreshSingleChapterEnrich,
  refreshProjectBundleEnrichAuto,
  listIncrementalProjects,
  pruneOrphanIndexEntries,
  readChaptersFile,
  nextEmptySlot,
  projectDir,
  normalizeSlotName,
  chapterDisplayName,
};
