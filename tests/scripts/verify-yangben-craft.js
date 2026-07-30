const fs = require('fs');
const path = require('path');
const yang = path.join(__dirname, '../../样本html');
const files = fs.readdirSync(yang).filter((f) => f.endsWith('.html'));
const bad = [];
for (const f of files) {
  const h = fs.readFileSync(path.join(yang, f), 'utf8');
  const checks = {
    mode: /id=["']modeSelect["']/.test(h),
    craft: /craft-gold|craft-intro/.test(h),
    win: /__emit|craft-win|__craftShowWin/.test(h),
  };
  if (!checks.mode || !checks.craft) bad.push({ f, checks });
}
console.log('html', files.length);
console.log('bad', bad.length);
if (bad.length) console.log(JSON.stringify(bad, null, 2));
console.log('清单', fs.existsSync(path.join(yang, '清单.md')));
