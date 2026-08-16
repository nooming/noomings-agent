/**
 * Unidirectional sync: data/runtime/packages/*/game.html → 样本html/<topic>/
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

/** packageId → sample relative folder (under 样本html/) */
const MAP = {
  'ramp-rolling-collision': '斜坡滚球',
  'gas-ideal': '理想气体',
  'heat-conduction': '热传导',
  'refraction-snell': '光的折射',
  'series-parallel': '串并联电路',
  'thin-lens-implicit': '透镜',
  'transformer-turns': '变压器',
  'rc-circuit': 'RC电路',
  'photoelectric': '光电效应',
  'magnetic-force': '安培力',
  'cyclotron-radius': '回旋加速器',
  'pendulum-clock': '单摆与校时',
  'projectile-basic': '斜抛',
  'projectile-cannon': '炮弹投射',
  'circular-motion': '圆周运动',
  'efield-charge': '电场',
  'friction-incline': '斜面摩擦',
  'momentum-collision': '动量碰撞',
  'multi-kp': '多知识点',
  'pendulum-target': '单摆打靶',
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

  console.log(JSON.stringify({ check, synced, drift, missing }, null, 2));
  if (check && drift) process.exit(1);
}

main();
