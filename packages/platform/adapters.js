const fs = require('fs');
const path = require('path');
const { getPlatformRoot } = require('./paths');

const ADAPTER_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function adaptersDir() {
  return path.join(getPlatformRoot(), 'adapters');
}

function isSafeAdapterId(catalogId) {
  return ADAPTER_ID_RE.test(String(catalogId || ''));
}

function loadAdapter(catalogId) {
  const id = String(catalogId || '').trim();
  if (!isSafeAdapterId(id)) return null;
  const dir = path.resolve(adaptersDir());
  const file = path.resolve(dir, `${id}.json`);
  if (path.dirname(file) !== dir) return null;
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

module.exports = { loadAdapter, isSafeAdapterId, adaptersDir };
