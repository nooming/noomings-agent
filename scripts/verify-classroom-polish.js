/** quick verify after classroom polish */
const fs = require('fs');
const path = require('path');
const { listCatalog } = require('../packages/platform/catalog');

const PKG = path.join(__dirname, '../data/runtime/packages');
const published = [
  'projectile-basic',
  'pendulum-clock',
  'gas-ideal',
  'friction-incline',
  'heat-conduction',
];
const advanced = [
  'friction-incline',
  'pendulum-target',
  'momentum-collision',
  'circular-motion',
  'ramp-rolling-collision',
];

const vis = listCatalog({ studentVisible: true }).map((i) => i.id);
console.log('studentVisible (' + vis.length + '):');
vis.forEach((id) => console.log(' ', id));
if (vis.length !== 5) {
  console.error('FAIL: expected 5');
  process.exit(1);
}

for (const id of published) {
  const h = fs.readFileSync(path.join(PKG, id, 'game.html'), 'utf8');
  if (!h.includes('craft-tokens.css')) {
    console.error('FAIL tokens missing', id);
    process.exit(1);
  }
  const okPhase =
    h.includes('__craftPhaseEmitted') ||
    h.includes("log('phase_change'") ||
    h.includes('phase_change');
  if (!okPhase) {
    console.error('FAIL phase missing', id);
    process.exit(1);
  }
}
console.log('published 5: tokens + phase OK');

for (const id of advanced) {
  const h = fs.readFileSync(path.join(PKG, id, 'game.html'), 'utf8');
  if (!h.includes('classroom-visual-p0') && id !== 'friction-incline') {
    // friction also has it
  }
  if (!h.includes('classroom-visual-p0')) {
    console.error('FAIL visual-p0 missing', id);
    process.exit(1);
  }
  if (h.includes('\u{1F480}') || h.includes('\u{1F4CA}')) {
    console.error('FAIL emoji still present', id);
    process.exit(1);
  }
}
console.log('advanced 5: visual-p0 OK');

const heat = fs.readFileSync(path.join(PKG, 'heat-conduction', 'game.html'), 'utf8');
if (/craftAttr" value="s-area"/.test(heat)) {
  console.error('FAIL heat still has area attribution');
  process.exit(1);
}
const can = fs.readFileSync(path.join(PKG, 'projectile-cannon', 'chapter.json'), 'utf8');
if (can.includes('质量影响惯性')) {
  console.error('FAIL cannon still has inertia teach copy');
  process.exit(1);
}
console.log('heat bypass + cannon copy OK');
console.log('ALL CHECKS PASSED');
