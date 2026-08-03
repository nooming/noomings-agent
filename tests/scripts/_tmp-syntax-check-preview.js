const fs = require('fs');
const path = require('path');

const pkgs = [
  'rc-circuit', 'transformer-turns', 'series-parallel', 'magnetic-force',
  'photoelectric', 'heat-conduction', 'gas-ideal', 'capacitor-confound-ui',
  'thin-lens-implicit', 'refraction-snell', 'efield-charge', 'circular-motion', 'multi-kp'
];
const root = path.join(__dirname, '../../data/runtime/packages');
let failed = 0;

for (const id of pkgs) {
  const f = path.join(root, id, 'game.html');
  const html = fs.readFileSync(f, 'utf8');
  const blocks = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) blocks.push(m[1]);
  let ok = true;
  let err = '';
  for (let i = 0; i < blocks.length; i++) {
    const code = blocks[i].trim();
    if (!code) continue;
    try {
      // eslint-disable-next-line no-new-func
      new Function(code);
    } catch (e) {
      ok = false;
      err = 'block ' + i + ': ' + e.message;
      break;
    }
  }
  if (!ok) {
    failed++;
    console.log('FAIL', id, err);
  } else {
    console.log('OK  ', id, '(' + blocks.length + ' scripts)');
  }
}

console.log(failed ? ('FAILED: ' + failed) : 'ALL_OK');
process.exit(failed ? 1 : 0);
