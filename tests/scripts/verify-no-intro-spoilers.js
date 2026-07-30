const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '../../样本html');
const files = fs.readdirSync(p).filter((f) => f.endsWith('.html'));
let spoil = 0;
for (const f of files) {
  const h = fs.readFileSync(path.join(p, f), 'utf8');
  const m = h.match(/<div id="craft-intro">([\s\S]*?)<div id="craft-win"/);
  if (!m) continue;
  if (/混淆说明|质量为混淆|<div class="formula">/.test(m[1])) {
    console.log('SPOIL', f);
    spoil++;
  }
}
console.log('spoil_count', spoil, 'of', files.length);
