const fs = require('fs');
const path = require('path');

const FIXTURES_ROOT = path.join(__dirname, '../fixtures');

let manifestCache = null;
const bundleCache = new Map();

function loadManifest() {
  if (!manifestCache) {
    manifestCache = JSON.parse(
      fs.readFileSync(path.join(FIXTURES_ROOT, 'manifest.json'), 'utf8'),
    );
  }
  return manifestCache;
}

function loadBundle(bundleName) {
  if (bundleCache.has(bundleName)) return bundleCache.get(bundleName);
  const manifest = loadManifest();
  const fileName = manifest.bundles[bundleName];
  if (!fileName) throw new Error(`Unknown fixture bundle: ${bundleName}`);
  const data = JSON.parse(fs.readFileSync(path.join(FIXTURES_ROOT, fileName), 'utf8'));
  bundleCache.set(bundleName, data);
  return data;
}

/** @returns {object} chapter or bundle wrapper (generic keeps { chapter }) */
function loadChapter(bundleName, key) {
  const bundle = loadBundle(bundleName);
  const entry = bundle[key];
  if (entry == null) throw new Error(`Unknown chapter key ${bundleName}.${key}`);
  return entry;
}

/** Unwrap generic bundle entry to bare chapter. */
function loadGenericChapter() {
  const entry = loadChapter('judge', 'generic');
  return entry.chapter || entry;
}

function loadGenericBundle() {
  return loadChapter('judge', 'generic');
}

function loadTrace(key) {
  return loadChapter('traces', key);
}

function loadHints(name) {
  const hints = loadManifest().hints[name];
  if (!hints) throw new Error(`Unknown fixture hints: ${name}`);
  return { ...hints };
}

function listStrategyChapters() {
  const bundle = loadBundle('strategy');
  return Object.entries(bundle).map(([key, chapter]) => ({
    id: key,
    chapter,
    source: `fixtures/strategy.bundle.json#${key}`,
  }));
}

function fixturesRoot() {
  return FIXTURES_ROOT;
}

module.exports = {
  loadManifest,
  loadBundle,
  loadChapter,
  loadGenericChapter,
  loadGenericBundle,
  loadTrace,
  loadHints,
  listStrategyChapters,
  fixturesRoot,
};
