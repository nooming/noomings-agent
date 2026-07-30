const fs = require('fs');
const path = require('path');
const { hasWinEmit } = require('../../packages/platform/legacy-trace-inject');

const ROOT = path.resolve(__dirname, '../..');
const KEEP = {
  1: ['controls', 'cap-formula', 'summary1', 's-area', 'mat-wrap'],
  2: ['controls2', 'ch2-formula', 'summary2', 's-c1'],
  4: ['controls4', 'summary4'],
};
const DROP = ['controls3', 'controls5', 'controls6', 'controls7', 'ch8-root'];

function hasId(html, id) {
  return html.includes(`id="${id}"`) || html.includes(`id='${id}'`);
}

let failed = 0;
for (const n of [1, 2, 4]) {
  const html = fs.readFileSync(
    path.join(ROOT, 'data/runtime/packages', `capacitor-era-ch${n}`, 'game.html'),
    'utf8',
  );
  const lines = html.split(/\n/).length;
  console.log(`ch${n}: lines=${lines} win=${hasWinEmit(html)}`);
  for (const id of KEEP[n]) {
    const ok = hasId(html, id);
    if (!ok) {
      console.error(`  MISSING keep #${id}`);
      failed += 1;
    }
  }
  for (const id of DROP) {
    if (hasId(html, id)) {
      console.error(`  STILL PRESENT drop #${id}`);
      failed += 1;
    }
  }
  if (!html.includes('slim-hide-map')) {
    console.error('  missing slim-hide-map css');
    failed += 1;
  }
  if (!html.includes('slim: dropped block css/ch8.css')) {
    console.error('  ch8 css block not dropped');
    failed += 1;
  }
}
if (failed) {
  console.error(`verify failed: ${failed}`);
  process.exit(1);
}
console.log('verify-capacitor-slim: ok');
