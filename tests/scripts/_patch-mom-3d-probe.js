/**
 * One-shot: convert momentum-collision draw layer to Three.js r128.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const FILE = path.join(ROOT, 'data/runtime/packages/momentum-collision/game.html');
let html = fs.readFileSync(FILE, 'utf8');
if (!html.includes('vendor/three.min.js')) {
  html = html.replace(
    '<title>气垫导轨 · 碰撞</title>',
    '<title>气垫导轨 · 碰撞</title>\n  <script src="vendor/three.min.js"></script>\n  <script src="vendor/OrbitControls.js"></script>'
  );
}
console.log('scripts ok', html.includes('vendor/three.min.js'));
const START = "    const canvas = document.getElementById('collisionCanvas');\n    const ctx = canvas.getContext('2d');";
console.log('start', html.indexOf(START));
console.log('fire', html.indexOf('    function fire() {'));
console.log('roundRect', html.indexOf('    function roundRect'));
console.log('layoutMom', html.indexOf('    let layoutMom = null;'));
