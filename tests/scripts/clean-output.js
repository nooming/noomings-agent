/**
 * Prune duplicate / empty output directories and sync index.json.
 * Usage: node tests/scripts/clean-output.js [--dry-run]
 */
const fs = require('fs');
const path = require('path');
const { pruneOrphanIndexEntries } = require('../../packages/generate/incremental-bundle');

const { getAgentOutputRoot } = require('../../packages/shared/paths');
const ROOT = getAgentOutputRoot();
const dryRun = process.argv.includes('--dry-run');

function readIndex() {
  const file = path.join(ROOT, 'index.json');
  if (!fs.existsSync(file)) return { latest: null, items: [] };
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { latest: data.latest || null, items: Array.isArray(data.items) ? data.items : [] };
  } catch {
    return { latest: null, items: [] };
  }
}

function writeIndex(index) {
  fs.writeFileSync(path.join(ROOT, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
}

function isEmptyProject(dir, item) {
  if (item?.stats?.passed === 0 && item?.stats?.total === 0) return true;
  const chFile = path.join(dir, 'chapters.json');
  if (!fs.existsSync(chFile)) return false;
  try {
    const ch = JSON.parse(fs.readFileSync(chFile, 'utf8'));
    return Array.isArray(ch) && ch.length === 0;
  } catch {
    return false;
  }
}

function pickDuplicates(items) {
  const toDelete = new Set();
  const byKey = new Map();

  for (const item of items) {
    const key = item.type === 'full'
      ? `full:${item.title || item.id}`
      : `single:${(item.title || '').trim()}`;
    const prev = byKey.get(key);
    if (!prev || new Date(item.savedAt) > new Date(prev.savedAt)) {
      if (prev) toDelete.add(prev.id);
      byKey.set(key, item);
    } else {
      toDelete.add(item.id);
    }
  }

  for (const item of items) {
    const dir = path.join(ROOT, item.id);
    if (fs.existsSync(dir) && isEmptyProject(dir, item)) {
      toDelete.add(item.id);
    }
  }

  return toDelete;
}

function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function main() {
  if (!fs.existsSync(ROOT)) {
    console.log('output 目录不存在，跳过');
    return;
  }

  const index = readIndex();
  const toDelete = pickDuplicates(index.items);
  const kept = index.items.filter(i => !toDelete.has(i.id));

  console.log(dryRun ? '[dry-run] ' : '', '将删�?, toDelete.size, '项：');
  [...toDelete].sort().forEach(id => console.log('  -', id));
  console.log('保留', kept.length, '�?);

  if (dryRun) return;

  for (const id of toDelete) {
    rmDir(path.join(ROOT, id));
  }

  let latest = index.latest;
  if (latest && toDelete.has(latest)) {
    latest = kept[0]?.id || null;
  }

  writeIndex({ latest, items: kept });
  const pruned = pruneOrphanIndexEntries(ROOT);
  console.log('已写�?index.json，prune �?, pruned.items.length, '�?);
}

main();
