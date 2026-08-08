const fs = require('fs');
const path = require('path');
const { getAgentDir } = require('./paths');

function resolveWithFallback(...rels) {
  const root = getAgentDir();
  for (const rel of rels) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) return p;
  }
  return path.join(root, rels[rels.length - 1]);
}

function resolveFileWithFallback(...rels) {
  const root = getAgentDir();
  for (const rel of rels) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getSharedRoot() {
  return resolveWithFallback('packages/shared');
}

function getGamesPresetRoot() {
  return resolveWithFallback('data/games/preset', 'data/samples');
}

function getGamesLegacyRoot() {
  return resolveWithFallback('data/games/legacy', 'legacy-samples');
}

function getManualBackupsRoot() {
  return resolveWithFallback('data/games/manual-backups');
}

function getGamesGeneratedRoot() {
  return resolveWithFallback('data/games/generated', 'data/samples/generated');
}

function getDatasetHtmlSamplesRoot() {
  return resolveWithFallback('data/datasets/html-samples', 'data/html-samples');
}

function getDatasetDesignSamplesRoot() {
  return resolveWithFallback('data/datasets/design-samples', 'data/design-samples');
}

function getDatasetTrainingRoot() {
  return resolveWithFallback('data/datasets/training', 'data/training');
}

function getRuntimeOutputRoot() {
  return resolveWithFallback('data/runtime/output', 'data/output', 'output');
}

/** Canonical packages root. Do not fall back to html-samples (different layout). */
function getPackagesRoot() {
  return resolveWithFallback('data/runtime/packages');
}

function getRuntimePlatformRoot() {
  return resolveWithFallback('data/runtime/platform', 'data/platform');
}

function getPackageDir(packageId) {
  return path.join(getPackagesRoot(), String(packageId || '').trim());
}

function getPackageGamePath(packageId) {
  return path.join(getPackageDir(packageId), 'game.html');
}

function getPackageChapterPath(packageId) {
  return path.join(getPackageDir(packageId), 'chapter.json');
}

function getPackageMetaPath(packageId) {
  return path.join(getPackageDir(packageId), 'meta.json');
}

function getPackageManifestPath() {
  return path.join(getPackagesRoot(), 'manifest.json');
}

/** Offline Agent B judge fixtures (moved from html-samples/). */
function getJudgeFixturesPath() {
  return path.join(getAgentDir(), 'tests/fixtures/judge-fixtures.json');
}

/**
 * Load chapter.json for a package/sample id.
 * @returns {object|null}
 */
function loadChapterForSample(sampleId) {
  const id = String(sampleId || '').trim();
  if (!id) return null;
  const p = getPackageChapterPath(id);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Load meta.json for a package/sample id.
 * @returns {object|null}
 */
function loadMetaForSample(sampleId) {
  const id = String(sampleId || '').trim();
  if (!id) return null;
  const p = getPackageMetaPath(id);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** @deprecated use getPackageChapterPath */
function getHtmlSampleChapterPath(sampleId) {
  return getPackageChapterPath(sampleId);
}

function resolveRepoRelative(relPath) {
  const root = getAgentDir();
  const normalized = String(relPath || '').replace(/\\/g, '/');
  const candidates = [normalized];
  if (normalized.startsWith('legacy-samples/')) {
    candidates.push(`data/games/legacy/${normalized.slice('legacy-samples/'.length)}`);
    candidates.push(`games/legacy/${normalized.slice('legacy-samples/'.length)}`);
  }
  if (normalized.startsWith('data/samples/')) {
    const tail = normalized.slice('data/samples/'.length);
    if (tail.startsWith('generated/')) {
      candidates.push(`data/games/generated/${tail.slice('generated/'.length)}`);
      candidates.push(`games/generated/${tail.slice('generated/'.length)}`);
    } else {
      candidates.push(`data/games/preset/${tail}`);
      candidates.push(`games/preset/${tail}`);
    }
  }
  if (normalized.startsWith('games/legacy/')) {
    candidates.push(`data/games/legacy/${normalized.slice('games/legacy/'.length)}`);
    candidates.push(`legacy-samples/${normalized.slice('games/legacy/'.length)}`);
  }
  if (normalized.startsWith('games/preset/')) {
    candidates.push(`data/games/preset/${normalized.slice('games/preset/'.length)}`);
    candidates.push(`data/samples/${normalized.slice('games/preset/'.length)}`);
  }
  if (normalized.startsWith('runtime/packages/')) {
    candidates.push(`data/runtime/packages/${normalized.slice('runtime/packages/'.length)}`);
  }
  if (normalized.startsWith('data/runtime/packages/')) {
    candidates.push(normalized);
  }
  if (normalized.startsWith('games/generated/')) {
    candidates.push(`data/games/generated/${normalized.slice('games/generated/'.length)}`);
    candidates.push(`data/samples/generated/${normalized.slice('games/generated/'.length)}`);
  }
  for (const rel of candidates) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) return p;
  }
  return path.join(root, normalized);
}

module.exports = {
  resolveWithFallback,
  resolveFileWithFallback,
  getSharedRoot,
  getGamesPresetRoot,
  getGamesLegacyRoot,
  getManualBackupsRoot,
  getGamesGeneratedRoot,
  getDatasetHtmlSamplesRoot,
  getDatasetDesignSamplesRoot,
  getDatasetTrainingRoot,
  getRuntimeOutputRoot,
  getPackagesRoot,
  getPackageDir,
  getPackageGamePath,
  getPackageChapterPath,
  getPackageMetaPath,
  getPackageManifestPath,
  getJudgeFixturesPath,
  loadChapterForSample,
  loadMetaForSample,
  getRuntimePlatformRoot,
  getHtmlSampleChapterPath,
  resolveRepoRelative,
};
