/**
 * Organize 样本html into one-folder-per-sample layout.
 * Each folder keeps only: <game>.html + 图谱.html (chapter stays in runtime).
 * Syncs larger/newer game body into package game.html without dropping content.
 *
 *   node tests/scripts/organize-yangben-folders.js [--dry-run]
 */
const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const { getPackagesRoot } = require('../../packages/shared/data-paths');

const ROOT = path.resolve(__dirname, '../..');
const YANG = path.join(ROOT, '\u6837\u672chtml'); // 样本html
const dryRun = process.argv.includes('--dry-run');

function ensureDir(dir) {
  if (!dryRun) fs.mkdirSync(dir, { recursive: true });
}

function readIfExists(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

function pickBestHtml(candidates) {
  // Prefer non-empty; if multiple, prefer larger then newer mtime
  const scored = candidates
    .filter(c => c.content && c.content.length > 100)
    .map(c => ({
      ...c,
      mtime: fs.existsSync(c.path) ? fs.statSync(c.path).mtimeMs : 0,
    }))
    .sort((a, b) => (b.content.length - a.content.length) || (b.mtime - a.mtime));
  return scored[0] || null;
}

function listExtraHtml(dir, keepNames) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => name.endsWith('.html') && !keepNames.has(name))
    .map(name => path.join(dir, name));
}

function organizeOne(entry) {
  const sampleDir = path.join(YANG, entry.dir);
  const nestedGame = path.join(sampleDir, entry.game);
  const flatGame = path.join(YANG, entry.game);
  const pkgGame = path.join(getPackagesRoot(), entry.id, 'game.html');
  const graphName = '\u56fe\u8c31.html'; // 图谱.html

  const candidates = [
    { path: nestedGame, content: readIfExists(nestedGame), tag: 'nested' },
    { path: flatGame, content: readIfExists(flatGame), tag: 'flat' },
    { path: pkgGame, content: readIfExists(pkgGame), tag: 'pkg' },
  ];
  const best = pickBestHtml(candidates);
  if (!best) {
    return { id: entry.id, ok: false, error: 'no game html found' };
  }

  ensureDir(sampleDir);
  const actions = [];

  // Write chosen game into sample folder
  if (!dryRun) {
    if (!fs.existsSync(nestedGame) || fs.readFileSync(nestedGame, 'utf8') !== best.content) {
      fs.writeFileSync(nestedGame, best.content, 'utf8');
      actions.push(`wrote sample ${entry.dir}/${entry.game} from ${best.tag}`);
    }
  } else {
    actions.push(`would write sample from ${best.tag} (${best.content.length} bytes)`);
  }

  // Sync package game.html if missing or smaller/empty (never shrink content)
  const pkgExisting = readIfExists(pkgGame);
  if (!pkgExisting || pkgExisting.length < best.content.length) {
    if (!dryRun) {
      fs.mkdirSync(path.dirname(pkgGame), { recursive: true });
      fs.writeFileSync(pkgGame, best.content, 'utf8');
    }
    actions.push(`${dryRun ? 'would sync' : 'synced'} package game.html (${best.content.length} bytes)`);
  } else if (pkgExisting.length > best.content.length) {
    // Package has more content — promote into sample so sample isn't worse
    if (!dryRun) fs.writeFileSync(nestedGame, pkgExisting, 'utf8');
    actions.push(`${dryRun ? 'would promote' : 'promoted'} package→sample (pkg larger)`);
  }

  // Remove flat duplicate after nested exists
  if (fs.existsSync(flatGame) && (dryRun || fs.existsSync(nestedGame))) {
    if (!dryRun) fs.unlinkSync(flatGame);
    actions.push(`${dryRun ? 'would remove' : 'removed'} flat ${entry.game}`);
  }

  // Remove stray html in sample folder (keep game + 图谱 only)
  const keep = new Set([entry.game, graphName]);
  for (const extra of listExtraHtml(sampleDir, keep)) {
    if (!dryRun) fs.unlinkSync(extra);
    actions.push(`${dryRun ? 'would remove' : 'removed'} extra ${path.basename(extra)}`);
  }

  // Remove stray chapter/meta if previously copied into sample folder
  for (const name of ['chapter.json', 'meta.json', 'index.html']) {
    const p = path.join(sampleDir, name);
    if (fs.existsSync(p)) {
      if (!dryRun) fs.unlinkSync(p);
      actions.push(`${dryRun ? 'would remove' : 'removed'} ${name}`);
    }
  }

  return { id: entry.id, ok: true, actions, bytes: best.content.length };
}

function main() {
  const rows = YANG_MAP.map(organizeOne);
  for (const row of rows) {
    console.log(row.ok ? 'OK' : 'FAIL', row.id, row.error || row.actions.join('; '));
  }
  const failed = rows.filter(r => !r.ok);
  console.log(`Done: ${rows.length - failed.length}/${rows.length}`);
  if (failed.length) process.exit(1);
}

main();
