const fs = require('fs');
const path = require('path');
const { listPackagePages } = require('./packages-index');
const { readCatalog, loadChapterForGraph } = require('./catalog');
const { readIndex } = require('../generate/graph-persist');
const { getPackagesRoot, getPackageGamePath, getDatasetHtmlSamplesRoot } = require('../shared/data-paths');
const { resolvePackageId, packagePlayUrl } = require('../shared/package-layout');
const {
  getGamesPresetRoot,
  getGamesGeneratedRoot,
} = require('../shared/data-paths');

function firstExisting(...candidates) {
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function resolvePlayUrlAbs(playUrl) {
  const u = String(playUrl || '').trim();
  if (!u || u.includes('..')) return null;

  if (u.startsWith('/static/packages/')) {
    const rel = u.slice('/static/packages/'.length);
    const parts = rel.split('/');
    if (parts.length >= 2 && parts[1] === 'game.html') {
      return getPackageGamePath(parts[0]);
    }
    return firstExisting(path.join(getPackagesRoot(), ...parts));
  }

  if (u.startsWith('/static/html-samples/')) {
    const rel = u.slice('/static/html-samples/'.length);
    if (rel.startsWith('generated/')) {
      const id = rel.slice('generated/'.length).replace(/\.html$/i, '');
      return firstExisting(getPackageGamePath(id), path.join(getDatasetHtmlSamplesRoot(), rel));
    }
    return firstExisting(path.join(getDatasetHtmlSamplesRoot(), ...rel.split('/')));
  }

  if (u.startsWith('/static/samples/')) {
    const rel = u.slice('/static/samples/'.length);
    if (rel === '电容纪元.html' || rel.endsWith('/电容纪元.html')) {
      return firstExisting(getPackageGamePath('capacitor-era'), path.join(getGamesPresetRoot(), '电容纪元.html'));
    }
    if (rel.startsWith('generated/')) {
      const tail = rel.slice('generated/'.length);
      return firstExisting(
        path.join(getGamesGeneratedRoot(), tail),
        path.join(getGamesPresetRoot(), 'generated', tail),
      );
    }
    return firstExisting(path.join(getGamesPresetRoot(), ...rel.split('/')));
  }
  return null;
}

function playUrlExists(playUrl) {
  const abs = resolvePlayUrlAbs(playUrl);
  return !!(abs && fs.existsSync(abs) && fs.statSync(abs).isFile());
}

function isValidPair(graphId, playUrl) {
  if (!graphId || !playUrl) return false;
  if (!loadChapterForGraph(graphId)) return false;
  return playUrlExists(playUrl);
}

function upsertPair(map, pair, { fromCatalog = false } = {}) {
  if (!isValidPair(pair.graphId, pair.playUrl)) return;
  const key = resolvePackageId(pair.graphId);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { ...pair, graphId: key });
    return;
  }
  if (fromCatalog) {
    map.set(key, {
      graphId: key,
      playUrl: pair.playUrl,
      title: pair.title || existing.title,
      source: pair.source || existing.source,
      categoryId: pair.categoryId || existing.categoryId,
      sampleTags: pair.sampleTags || existing.sampleTags,
    });
  } else {
    map.set(key, {
      graphId: key,
      playUrl: pair.playUrl,
      title: existing.title || pair.title,
      source: existing.source || pair.source,
      categoryId: existing.categoryId || pair.categoryId,
      sampleTags: existing.sampleTags || pair.sampleTags,
    });
  }
}

function listPublishPairs() {
  const map = new Map();
  const packagesRoot = getPackagesRoot();

  for (const page of listPackagePages()) {
    upsertPair(map, {
      graphId: page.graphId,
      playUrl: page.url,
      title: page.label,
      source: 'html-sample',
      topic: page.topic,
    });
  }

  const index = readIndex(packagesRoot);
  for (const item of index.items || []) {
    if (!item.playUrl) continue;
    upsertPair(map, {
      graphId: item.id,
      playUrl: item.playUrl,
      title: item.title || item.id,
      source: item.source || 'teacher',
    });
  }

  for (const item of readCatalog().items) {
    if (!item.graphId || !item.playUrl) continue;
    upsertPair(map, {
      graphId: item.graphId,
      playUrl: item.playUrl,
      title: item.title,
      source: item.source,
      categoryId: item.categoryId,
      sampleTags: item.sampleTags,
    }, { fromCatalog: true });
  }

  return [...map.values()].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh-CN'));
}

module.exports = {
  listPublishPairs,
  resolvePlayUrlAbs,
  playUrlExists,
  packagePlayUrl,
};
