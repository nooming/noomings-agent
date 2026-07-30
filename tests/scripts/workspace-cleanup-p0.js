/** One-shot P0 workspace cleanup (logs, cookies, traces, runtime/output drafts) */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function rm(p) {
  const abs = path.isAbsolute(p) ? p : path.join(ROOT, p);
  if (!fs.existsSync(abs)) {
    console.log('skip (missing):', p);
    return;
  }
  fs.rmSync(abs, { recursive: true, force: true });
  console.log('removed:', p);
}

function ensureDir(p) {
  fs.mkdirSync(path.join(ROOT, p), { recursive: true });
}

// logs + draft outputs
rm('data/runtime/output/capacitor-era-run.log');
rm('data/runtime/output/capacitor-era-multilevel-run.log');
rm('data/runtime/output/capacitor-era-last-run.json');
rm('data/runtime/output/电容纪元-静电城邦-20260702-154833');
rm('data/runtime/output/平抛运动-调节发射参数使小球入筐-20260702-181112');
rm('data/runtime/output/index.json');

// keep output dir as placeholder
ensureDir('data/runtime/output');
fs.writeFileSync(
  path.join(ROOT, 'data/runtime/output/.gitkeep'),
  '',
  'utf8',
);

// local traces
const tracesDir = path.join(ROOT, 'data/runtime/platform/traces');
if (fs.existsSync(tracesDir)) {
  for (const f of fs.readdirSync(tracesDir)) {
    if (f.startsWith('sess-') && f.endsWith('.json')) {
      rm(path.join('data/runtime/platform/traces', f));
    }
  }
}

// empty legacy platform traces shell
rm('data/platform/traces');
if (fs.existsSync(path.join(ROOT, 'data/platform'))) {
  const left = fs.readdirSync(path.join(ROOT, 'data/platform'));
  if (!left.length) rm('data/platform');
}

// cookies
rm('resources/www.shiguangtongxue.cn_cookies.txt');

console.log('workspace-cleanup-p0: done');
