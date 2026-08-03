/**
 * Upsert shared craft-bench-unify CSS into all mapped packages (+ 样本html mirror).
 * Does not rewrite canvas / dual-mode JS — CSS only.
 *
 * Usage:
 *   node tests/scripts/craft-bench-unify-apply.js
 *   node tests/scripts/craft-bench-unify-apply.js --pkg series-parallel
 */
'use strict';

const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const { benchUnifyCss } = require('./craft-scene-themes');

const ROOT = path.resolve(__dirname, '../..');
const PKG = path.join(ROOT, 'data/runtime/packages');
const YANG = path.join(ROOT, '样本html');

const BLOCK_RE = /\/\* === craft-bench-unify === \*\/[\s\S]*?(?=\n\/\* ===|\n<\/style>)/;

function upsertBenchCss(html) {
  const block = benchUnifyCss().trim() + '\n';
  if (BLOCK_RE.test(html)) {
    return { html: html.replace(BLOCK_RE, block), changed: true, mode: 'replace' };
  }
  const idx = html.lastIndexOf('</style>');
  if (idx < 0) return { html, changed: false, mode: 'skip' };
  return {
    html: html.slice(0, idx) + block + html.slice(idx),
    changed: true,
    mode: 'inject',
  };
}

function mirrorPath(entry) {
  return path.join(YANG, entry.dir, entry.game);
}

function applyOne(entry) {
  const gamePath = path.join(PKG, entry.id, 'game.html');
  if (!fs.existsSync(gamePath)) {
    console.warn('skip missing', entry.id);
    return { id: entry.id, changed: false };
  }
  const before = fs.readFileSync(gamePath, 'utf8');
  const { html, changed, mode } = upsertBenchCss(before);
  if (changed && html !== before) {
    fs.writeFileSync(gamePath, html, 'utf8');
    console.log(mode, entry.id);
  } else {
    console.log('no-op', entry.id);
  }

  const mPath = mirrorPath(entry);
  if (fs.existsSync(path.dirname(mPath))) {
    fs.mkdirSync(path.dirname(mPath), { recursive: true });
    fs.writeFileSync(mPath, html, 'utf8');
    console.log('  mirror', `${entry.dir}/${entry.game}`);
  } else {
    // create dir if parent 样本html exists
    if (fs.existsSync(YANG)) {
      fs.mkdirSync(path.dirname(mPath), { recursive: true });
      fs.writeFileSync(mPath, html, 'utf8');
      console.log('  mirror+', `${entry.dir}/${entry.game}`);
    }
  }
  return { id: entry.id, changed: changed && html !== before };
}

function main() {
  const args = process.argv.slice(2);
  const pkgIdx = args.indexOf('--pkg');
  let list = YANG_MAP;
  if (pkgIdx >= 0) {
    const name = args[pkgIdx + 1];
    list = YANG_MAP.filter((e) => e.id === name);
    if (!list.length) {
      console.error('unknown pkg', name);
      process.exit(1);
    }
  }
  const results = list.map(applyOne);
  const n = results.filter((r) => r.changed).length;
  console.log(`\ncraft-bench-unify: updated ${n}/${results.length} packages`);
}

if (require.main === module) main();
module.exports = { upsertBenchCss, main };
