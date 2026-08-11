#!/usr/bin/env node
const fs = require('fs');

const files = [
  'data/runtime/packages/capacitor-era-ch1/game.html',
  'data/runtime/packages/capacitor-era-ch2/game.html',
  'data/runtime/packages/capacitor-era-ch4/game.html',
  '样本html/电容_介质与击穿/电容_介质与击穿.html',
  '样本html/电容_串并联/电容_串并联.html',
  '样本html/电容_储能与充电/电容_储能与充电.html',
  'tests/scripts/patch-manual-dual-mode.js',
];

const neu =
  "document.querySelectorAll('#controls button, #controls2 button, #controls4 button, .ctrl-panel button, #c4-discharge-btn, #btn-read-cap, #btn-read-ch2')";

const olds = [
  "document.querySelectorAll('#controls button, .ctrl-panel button')",
  "document.querySelectorAll('#controls button, #controls2 button, #controls4 button, .ctrl-panel button')",
];

let n = 0;
for (const f of files) {
  if (!fs.existsSync(f)) {
    console.log('missing', f);
    continue;
  }
  let h = fs.readFileSync(f, 'utf8');
  const before = h;
  for (const old of olds) h = h.split(old).join(neu);
  if (h !== before) {
    fs.writeFileSync(f, h);
    n++;
    console.log('patched', f);
  } else {
    console.log('skip', f);
  }
}
console.log('done', n);
