/**
 * Agent A 生成物落盘：单章草稿与批�?bundle（合并自 save-generated-graph / save-full-generated-graph�?
 */
const fs = require('fs');
const path = require('path');
const { validateChapter, validateChapterQuality } = require('../contract');
const { enrichChapterContract } = require('../contract/enrich');
const { makeTimestampSlug } = require('../shared/slugify');
const { renderSinglePreviewHtml, renderFullPreviewHtml } = require('./export/render-preview-html');

function makeSlug(title) {
  return makeTimestampSlug(title, 'generated');
}

function makeBatchSlug(title) {
  return makeTimestampSlug(title, 'full-graph');
}

function ensureUniqueSlug(root, slug) {
  let candidate = slug;
  let n = 2;
  while (fs.existsSync(path.join(root, candidate))) {
    candidate = `${slug}-${n}`;
    n += 1;
  }
  return candidate;
}

function readIndex(root) {
  const file = path.join(root, 'index.json');
  if (!fs.existsSync(file)) return { latest: null, items: [] };
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { latest: data.latest || null, items: Array.isArray(data.items) ? data.items : [] };
  } catch {
    return { latest: null, items: [] };
  }
}

function writeIndex(root, index) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
}

function renderIndexHtml(meta) {
  return renderSinglePreviewHtml(meta);
}

function renderFullIndexHtml(meta) {
  return renderFullPreviewHtml(meta);
}

function writeGeneratedGraph({ root, chapter, title, ch, gameHints, sources, skipQuality }) {
  const enriched = enrichChapterContract(chapter, gameHints, sources);
  const validation = validateChapter(enriched);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }
  let quality = { ok: true, errors: [], score: 1, checklist: {} };
  if (!skipQuality) {
    quality = validateChapterQuality(enriched, gameHints);
    if (!quality.ok) {
      return { ok: false, errors: quality.errors, quality };
    }
  }

  fs.mkdirSync(root, { recursive: true });
  const slug = ensureUniqueSlug(root, makeSlug(title || enriched.kg?.title));
  const dir = path.join(root, slug);
  fs.mkdirSync(dir, { recursive: true });

  const savedAt = new Date().toISOString();
  const meta = {
    title: (title || enriched.kg?.title || 'AI 生成').trim(),
    savedAt,
    source: 'agent-a',
    ch: ch ?? null,
    enrichedAt: savedAt,
    quality: {
      ok: quality.ok,
      score: quality.score,
      errors: quality.errors || [],
      warnings: quality.warnings || [],
      checklist: quality.checklist || {},
    },
    stats: {
      total: 1,
      passed: quality.ok ? 1 : 0,
      failed: quality.ok ? [] : ['chapter'],
      qualityPassed: quality.ok ? 1 : 0,
      qualityFailed: quality.ok ? 0 : 1,
      qualityFailedChapters: quality.ok ? [] : [0],
    },
  };

  const chapterPayload = {
    mapping: enriched.mapping,
    kg: enriched.kg,
    dt: enriched.dt,
    winSync: enriched.winSync,
    strategy: enriched.strategy,
    traceMap: enriched.traceMap,
  };

  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'chapter.json'), JSON.stringify(chapterPayload, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'index.html'), renderIndexHtml(meta), 'utf8');

  const index = readIndex(root);
  const item = {
    id: slug,
    type: 'single',
    title: meta.title,
    savedAt,
    url: `/packages/${slug}/index.html`,
    ch: meta.ch,
    stats: meta.stats,
  };
  index.items.unshift(item);
  index.latest = slug;
  writeIndex(root, index);

  return {
    ok: true,
    id: slug,
    path: `packages/${slug}`,
    viewUrl: item.url,
    meta,
    quality,
  };
}

function linkGraphPlayUrl(root, graphId, playUrl) {
  const id = String(graphId || '').trim();
  const url = String(playUrl || '').trim();
  if (!id || !url) return { ok: false, error: 'graphId_and_playUrl_required' };

  const index = readIndex(root);
  const item = index.items.find(i => i.id === id);
  if (!item) return { ok: false, error: 'graph_not_in_index' };
  item.playUrl = url;
  writeIndex(root, index);

  const metaPath = path.join(root, id, 'meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      meta.playUrl = url;
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
    } catch {
      /* non-fatal */
    }
  }
  return { ok: true, graphId: id, playUrl: url };
}

module.exports = {
  makeSlug,
  makeBatchSlug,
  renderIndexHtml,
  renderFullIndexHtml,
  renderSinglePreviewHtml: renderIndexHtml,
  writeGeneratedGraph,
  ensureUniqueSlug,
  readIndex,
  writeIndex,
  linkGraphPlayUrl,
};
