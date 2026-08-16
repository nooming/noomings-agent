/**
 * Sync explore_success gate into 样本html dual-mode pages that use explore_observe.
 * Run: node scripts/sync-explore-success-samples.js
 */
const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const templateSrc = path.join(__dirname, '../data/runtime/packages/gas-ideal/game.html');
const helperFs = fs.readFileSync(templateSrc, 'utf8');
const m = helperFs.match(/<script>\s*\/\* === explore_success gate[\s\S]*?<\/script>/);
if (!m) {
  console.error('no helper template in gas-ideal/game.html');
  process.exit(1);
}
const helper = m[0];
const callSnippet = "try { if (window.__noteExploreSuccess) window.__noteExploreSuccess(typeof emit === 'function' ? emit : (window.__emit || null), (typeof controlsSnapshot !== 'undefined' ? controlsSnapshot : (typeof controls !== 'undefined' ? controls : {}))); } catch (_es) {}";

let n = 0;
for (const f of walk(path.join(__dirname, '../样本html'))) {
  let html = fs.readFileSync(f, 'utf8');
  if (/emit\(['"]explore_success['"]/.test(html) || /__emit\(['"]explore_success['"]/.test(html)) continue;
  if (!html.includes('explore_observe')) continue;
  if (!/dual-mode|modeSelect|playMode/.test(html)) continue;

  if (!html.includes('__noteExploreSuccess')) {
    if (html.includes('</body>')) html = html.replace('</body>', `${helper}\n</body>`);
    else html += helper;
  }

  let patched = 0;
  let idx = 0;
  while ((idx = html.indexOf('explore_observe', idx)) !== -1) {
    const semi = html.indexOf(';', idx);
    if (semi < 0) break;
    const ctx = html.slice(Math.max(0, idx - 160), Math.min(html.length, semi + 60));
    if (ctx.includes('__noteExploreSuccess')) {
      idx = semi + 1;
      continue;
    }
    if (!/snapshot|hintKey/.test(ctx)) {
      idx = semi + 1;
      continue;
    }
    const before = html.slice(Math.max(0, idx - 40), idx);
    if (/let\s+hintKey\s*=\s*$/.test(before.trimEnd()) || /let\s+hintKey\s*=\s*['"]$/.test(before)) {
      // default assignment — only keep if inside explore branch nearby
      const window400 = html.slice(Math.max(0, idx - 400), idx);
      if (!/playMode\s*===\s*['"]explore['"]/.test(window400)) {
        idx = semi + 1;
        continue;
      }
    }
    html = `${html.slice(0, semi + 1)}\n            ${callSnippet}${html.slice(semi + 1)}`;
    patched += 1;
    idx = semi + 1 + callSnippet.length + 14;
  }

  fs.writeFileSync(f, html, 'utf8');
  console.log('synced', path.relative(process.cwd(), f), 'calls', patched);
  n += 1;
}
console.log('done', n);
