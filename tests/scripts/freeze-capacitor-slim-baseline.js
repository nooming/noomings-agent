/** Copy current packages capacitor-era-ch{1,2,4} game.html → fixtures baseline */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'tests/fixtures/capacitor-era-slim-baseline');
fs.mkdirSync(OUT, { recursive: true });

for (const n of [1, 2, 4]) {
  const src = path.join(ROOT, 'data/runtime/packages', `capacitor-era-ch${n}`, 'game.html');
  const dest = path.join(OUT, `ch${n}.html`);
  fs.copyFileSync(src, dest);
  const lines = fs.readFileSync(dest, 'utf8').split(/\n/).length;
  console.log(`baseline ch${n}: ${lines} lines → ${dest}`);
}
