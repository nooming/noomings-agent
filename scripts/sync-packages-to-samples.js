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

/** packageId → sample relative folder (under 样本html/); keep aligned with tests/lib/yangben-sample-map.js */
const MAP = {
  'ramp-rolling-collision': '斜坡滚球',
  'gas-pressure-micro': '气体压强微观',
  'maxwell-speed-dist': '麦克斯韦速率分布',
  'adiabatic-process': '绝热过程',
  'cyclotron-radius': '回旋加速器',
  'pendulum-clock': '钟表铺校时',
  'projectile-basic': '斜抛',
  'nezha-boat-jump': '哪吒跳船',
  'pulley-rigid': '滑轮刚体',
  'capacitor-era-ch1': '电容_介质与击穿',
  'capacitor-era-ch2': '电容_串并联',
  'capacitor-era-ch4': '电容_储能与充电',
};

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function main() {
  const check = process.argv.includes('--check');
  const all = process.argv.includes('--all');
  const ids = all || check ? Object.keys(MAP) : Object.keys(MAP);
  let drift = 0;
  let synced = 0;
  let missing = 0;

  for (const id of ids) {
    const sampleDir = MAP[id];
    const src = path.join(PKG_ROOT, id, 'game.html');
    const dstDir = path.join(SAMPLE_ROOT, sampleDir);
    const dst = path.join(dstDir, 'game.html');
    // Some samples use <topic>.html instead of game.html
    let target = dst;
    if (!fs.existsSync(dst) && fs.existsSync(dstDir)) {
      const alts = fs.readdirSync(dstDir).filter((f) => f.endsWith('.html') && f !== '图谱.html');
      if (alts.length === 1) target = path.join(dstDir, alts[0]);
    }
    if (!fs.existsSync(src)) {
      console.log('MISSING_PKG', id);
      missing += 1;
      continue;
    }
    if (!fs.existsSync(path.dirname(target))) {
      console.log('MISSING_SAMPLE_DIR', id, sampleDir);
      missing += 1;
      continue;
    }
    if (!fs.existsSync(target)) {
      if (check) {
        console.log('DRIFT missing sample', id, '→', path.relative(ROOT, target));
        drift += 1;
      } else {
        fs.copyFileSync(src, target);
        console.log('CREATE', id, '→', path.relative(ROOT, target));
        synced += 1;
      }
      continue;
    }
    const same = hash(src) === hash(target);
    if (same) {
      console.log('OK', id);
      continue;
    }
    if (check) {
      console.log('DRIFT', id, path.relative(ROOT, target));
      drift += 1;
    } else {
      fs.copyFileSync(src, target);
      console.log('SYNC', id, '→', path.relative(ROOT, target));
      synced += 1;
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

  console.log(JSON.stringify({ check, synced, drift, missing }, null, 2));
  if (check && drift) process.exit(1);
}

main();
