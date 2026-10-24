/**
 * Unidirectional sync: data/runtime/packages/{id}/game.html -> 样本html/{topic}/
 * Packages are the runtime source of truth; samples are edit mirrors.
 *
 * Usage:
 *   node scripts/sync-packages-to-samples.js           # sync mapped dual-mode pkgs
 *   node scripts/sync-packages-to-samples.js --check    # drift check (exit 1 if differ)
 *   node scripts/sync-packages-to-samples.js --all      # sync all mapped
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PKG_ROOT = path.join(ROOT, 'data/runtime/packages');
const SAMPLE_ROOT = path.join(ROOT, '样本html');
const YANG_MAP = require('../tests/lib/yangben-sample-map');

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function syncOneFile(src, target, check, label) {
  if (!fs.existsSync(src)) return { status: 'MISSING_PKG' };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) {
    if (check) return { status: 'DRIFT', detail: 'missing sample ' + label };
    fs.copyFileSync(src, target);
    return { status: 'CREATE', target };
  }
  if (hash(src) === hash(target)) return { status: 'OK' };
  if (check) return { status: 'DRIFT', detail: label };
  fs.copyFileSync(src, target);
  return { status: 'SYNC', target };
}

function main() {
  const check = process.argv.includes('--check');
  const ids = YANG_MAP.map((e) => e.id);
  let drift = 0;
  let synced = 0;
  let missing = 0;

  for (const entry of YANG_MAP) {
    const { id, dir, game } = entry;
    const srcGame = path.join(PKG_ROOT, id, 'game.html');
    const dstDir = path.join(SAMPLE_ROOT, dir);
    const targetGame = path.join(dstDir, game);
    const srcGraph = path.join(PKG_ROOT, id, '图谱.html');
    const targetGraph = path.join(dstDir, '图谱.html');

    const g = syncOneFile(srcGame, targetGame, check, id + ' game');
    if (g.status === 'MISSING_PKG') {
      console.log('MISSING_PKG', id);
      missing += 1;
      continue;
    }
    if (g.status === 'OK') console.log('OK', id);
    else if (g.status === 'DRIFT') {
      console.log('DRIFT', id, g.detail || path.relative(ROOT, targetGame));
      drift += 1;
    } else {
      console.log(g.status.toUpperCase(), id, '→', path.relative(ROOT, g.target));
      synced += 1;
    }

    if (fs.existsSync(srcGraph)) {
      const gr = syncOneFile(srcGraph, targetGraph, check, id + ' 图谱');
      if (gr.status === 'DRIFT') {
        console.log('DRIFT', id, '图谱.html');
        drift += 1;
      } else if (gr.status === 'CREATE' || gr.status === 'SYNC') {
        console.log(gr.status.toUpperCase(), id, '图谱 →', path.relative(ROOT, gr.target));
        synced += 1;
      } else if (gr.status === 'OK') console.log('OK', id, '图谱');
    }
  }

  // Mirror packages/_shared → 样本html/_shared so relative ../_shared links work offline
  const sharedSrc = path.join(PKG_ROOT, '_shared');
  const sharedDst = path.join(SAMPLE_ROOT, '_shared');
  if (fs.existsSync(sharedSrc)) {
    fs.mkdirSync(sharedDst, { recursive: true });
    for (const name of fs.readdirSync(sharedSrc)) {
      const from = path.join(sharedSrc, name);
      const to = path.join(sharedDst, name);
      if (fs.statSync(from).isFile()) {
        if (check) {
          if (!fs.existsSync(to) || hash(from) !== hash(to)) {
            console.log('DRIFT _shared', name);
            drift += 1;
          } else {
            console.log('OK _shared/' + name);
          }
        } else {
          fs.copyFileSync(from, to);
          console.log('SYNC _shared/' + name);
          synced += 1;
        }
      }
    }
  }

  console.log(JSON.stringify({ check, synced, drift, missing, ids: ids.length }, null, 2));
  if (check && drift) process.exit(1);
}

main();
