/**
 * Fix craft-gold MutationObserver ↔ showWin reentrancy freeze.
 * Also: rename UI .win-badge → .pass-badge; throttle legacy-win-bridge scanWinText.
 *
 * Idempotent. Run: node scripts/patch-craft-win-observer-loop.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PKG_ROOT = path.join(ROOT, 'data', 'runtime', 'packages');
const SAMPLE_ROOT = path.join(ROOT, '样本html');

const SHOWWIN_GUARD = `  function showWin(extra){
    if (window.__craftWinOpen) {
      var t0 = document.getElementById('craftWinText');
      if (t0 && typeof extra === 'string' && extra) t0.textContent = extra;
      return;
    }
    if (win) {
      window.__craftWinOpen = true;
      window.__craftWinDismissed = false;`;

const SHOWWIN_GUARD_COMPACT = `function showWin(extra){
    if (window.__craftWinOpen) {
      var t0 = document.getElementById('craftWinText');
      if (t0 && typeof extra === 'string' && extra) t0.textContent = extra;
      return;
    }
    if (win) {
      window.__craftWinOpen = true;
      window.__craftWinDismissed = false;`;

const SCAN_OLD = `  function scanWinText() {
    var text = document.body ? document.body.innerText : '';
    for (var i = 0; i < WIN_TEXT.length; i++) {
      if (WIN_TEXT[i].test(text)) {
        emitWin('text_' + i);
        return true;
      }
    }
    return false;
  }
  document.addEventListener('DOMContentLoaded', function() {
    var obs = new MutationObserver(function() { scanWinText(); });
    if (document.body) obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    setInterval(scanWinText, 800);
  });`;

const SCAN_NEW = `  var __legacyWinScanTimer = null;
  function scanWinText() {
    if (window.__legacyWinEmitted || window.__craftWinOpen || window.__craftWinDismissed) return false;
    var nodes = document.querySelectorAll(
      '.win-banner,#winBanner,[data-win="1"],.pass-badge,#winIndicator,.toast,.banner,.observe-item,[class*="win"]'
    );
    var text = '';
    for (var n = 0; n < nodes.length; n++) {
      text += (nodes[n].innerText || nodes[n].textContent || '') + '\\n';
      if (text.length > 8000) break;
    }
    if (!text) return false;
    for (var i = 0; i < WIN_TEXT.length; i++) {
      if (WIN_TEXT[i].test(text)) {
        emitWin('text_' + i);
        return true;
      }
    }
    return false;
  }
  function scheduleScanWinText(muts) {
    if (window.__legacyWinEmitted || window.__craftWinOpen || window.__craftWinDismissed) return;
    if (__legacyWinScanTimer) return;
    __legacyWinScanTimer = setTimeout(function() {
      __legacyWinScanTimer = null;
      var suspect = !muts || !muts.length;
      if (!suspect) {
        for (var i = 0; i < muts.length && !suspect; i++) {
          var m = muts[i];
          if (m.type === 'characterData') {
            var pt = m.target && m.target.parentElement;
            var t = ((pt && (pt.innerText || pt.textContent)) || (m.target && m.target.data) || '').slice(0, 240);
            if (/过关|命中|胜利|🏆|🎯/.test(t)) suspect = true;
          } else if (m.addedNodes && m.addedNodes.length) {
            for (var j = 0; j < m.addedNodes.length; j++) {
              var node = m.addedNodes[j];
              if (!node || (node.nodeType !== 1 && node.nodeType !== 3)) continue;
              var tx = node.nodeType === 3
                ? (node.data || '')
                : ((node.innerText || node.textContent || '') + ' ' + (node.className || '') + ' ' + (node.id || ''));
              if (/过关|命中|胜利|🏆|🎯|win-banner|win-badge|pass-badge|winBanner/.test(tx)) {
                suspect = true;
                break;
              }
            }
          }
        }
      }
      if (suspect) scanWinText();
    }, 200);
  }
  document.addEventListener('DOMContentLoaded', function() {
    var obs = new MutationObserver(function(muts) { scheduleScanWinText(muts); });
    if (document.body) obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    setInterval(function(){
      if (!window.__legacyWinEmitted && !window.__craftWinOpen && !window.__craftWinDismissed) scanWinText();
    }, 2000);
  });`;

function walkHtmlFiles(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'reports') continue;
      walkHtmlFiles(p, out);
    } else if (ent.isFile() && /\.html?$/i.test(ent.name)) {
      out.push(p);
    }
  }
}

function patchShowWin(src) {
  if (!src.includes('craft-gold') && !src.includes('__craftShowWin') && !src.includes('function showWin(extra)')) {
    return { src, changed: false };
  }
  if (src.includes('if (window.__craftWinOpen)') && src.includes('window.__craftWinOpen = true')) {
    return { src, changed: false, already: true };
  }
  let next = src;
  let changed = false;

  // Standard indented showWin
  const re1 = /  function showWin\(extra\)\{\s*\n    if \(win\) \{\s*\n      window\.__craftWinDismissed = false;/;
  if (re1.test(next)) {
    next = next.replace(re1, SHOWWIN_GUARD);
    changed = true;
  }

  // Compact (projectile-basic)
  const re2 = /function showWin\(extra\)\{\s*\n    if \(win\) \{\s*\n      window\.__craftWinDismissed = false;/;
  if (!changed && re2.test(next) && !next.includes(SHOWWIN_GUARD_COMPACT.slice(0, 40))) {
    next = next.replace(re2, SHOWWIN_GUARD_COMPACT);
    changed = true;
  }

  // Partial: has Open set but missing early return
  if (!changed && next.includes('window.__craftWinOpen = true') && !/function showWin\(extra\)\{\s*\n\s*if \(window\.__craftWinOpen\)/.test(next)) {
    next = next.replace(
      /function showWin\(extra\)\{\s*\n(\s*)if \(win\) \{/,
      `function showWin(extra){\n$1if (window.__craftWinOpen) {\n$1  var t0 = document.getElementById('craftWinText');\n$1  if (t0 && typeof extra === 'string' && extra) t0.textContent = extra;\n$1  return;\n$1}\n$1if (win) {`
    );
    changed = next !== src;
  }

  return { src: next, changed };
}

function patchDismiss(src) {
  let next = src;
  let changed = false;
  // add __craftWinOpen = false after dismiss, if missing
  const re = /window\.__craftWinDismissed = true;\s*\n(?!\s*window\.__craftWinOpen = false;)/g;
  if (re.test(next)) {
    next = next.replace(
      /window\.__craftWinDismissed = true;\s*\n(?!\s*window\.__craftWinOpen = false;)/g,
      'window.__craftWinDismissed = true;\n    window.__craftWinOpen = false;\n'
    );
    changed = true;
  }
  return { src: next, changed };
}

function patchObserver(src) {
  let next = src;
  let changed = false;
  const oldObs = `var obs = new MutationObserver(function(){
    if (window.__craftWinDismissed) return;
    var el = document.querySelector('.win-banner,.win-badge,#winBanner,[data-win="1"]');
    if (el && el.offsetParent !== null) showWin();
  });`;
  const newObs = `var obs = new MutationObserver(function(){
    if (window.__craftWinDismissed || window.__craftWinOpen) return;
    var el = document.querySelector('.win-banner,#winBanner,[data-win="1"]');
    if (el && el.offsetParent !== null) showWin();
  });`;
  if (next.includes(oldObs)) {
    next = next.replace(oldObs, newObs);
    changed = true;
  } else if (
    next.includes("document.querySelector('.win-banner,.win-badge,#winBanner,[data-win=\"1\"]')") &&
    next.includes('if (window.__craftWinDismissed || window.__craftWinOpen) return;')
  ) {
    // already has open guard but still matches win-badge
    next = next.replace(
      "document.querySelector('.win-banner,.win-badge,#winBanner,[data-win=\"1\"]')",
      "document.querySelector('.win-banner,#winBanner,[data-win=\"1\"]')"
    );
    changed = next !== src;
  } else if (
    next.includes('if (window.__craftWinDismissed) return;') &&
    next.includes("document.querySelector('.win-banner,.win-badge,#winBanner,[data-win=\"1\"]')")
  ) {
    next = next.replace(
      /if \(window\.__craftWinDismissed\) return;\s*\n(\s*)var el = document\.querySelector\('\.win-banner,\.win-badge,#winBanner,\[data-win="1"\]'\);/,
      "if (window.__craftWinDismissed || window.__craftWinOpen) return;\n$1var el = document.querySelector('.win-banner,#winBanner,[data-win=\"1\"]');"
    );
    changed = next !== src;
  }
  return { src: next, changed };
}

function patchWinBadge(src) {
  if (!src.includes('win-badge')) return { src, changed: false };
  let next = src;
  // CSS selectors (not inside regex literals that intentionally mention win-badge)
  next = next.replace(/(^|[^\w/])\.win-badge\b/gm, '$1.pass-badge');
  // HTML / JS class strings
  next = next.replace(/class="win-badge"/g, 'class="pass-badge"');
  next = next.replace(/class='win-badge'/g, "class='pass-badge'");
  next = next.replace(/class=\\"win-badge\\"/g, 'class=\\"pass-badge\\"');
  next = next.replace(/'<span class="win-badge">/g, "'<span class=\"pass-badge\">");
  next = next.replace(/"<span class=\\"win-badge\\">/g, '"<span class=\\"pass-badge\\">');
  // observer selector: drop badge match entirely
  next = next.replace(
    "document.querySelector('.win-banner,.pass-badge,#winBanner,[data-win=\"1\"]')",
    "document.querySelector('.win-banner,#winBanner,[data-win=\"1\"]')"
  );
  next = next.replace(
    "document.querySelector('.win-banner,.win-badge,#winBanner,[data-win=\"1\"]')",
    "document.querySelector('.win-banner,#winBanner,[data-win=\"1\"]')"
  );
  return { src: next, changed: next !== src };
}

function patchScanWinText(src) {
  if (!src.includes('function scanWinText()')) return { src, changed: false };
  if (src.includes('scheduleScanWinText') || src.includes('__legacyWinScanTimer')) {
    return { src, changed: false, already: true };
  }
  if (!src.includes("document.body ? document.body.innerText : ''")) {
    return { src, changed: false };
  }
  if (src.includes(SCAN_OLD)) {
    return { src: src.replace(SCAN_OLD, SCAN_NEW), changed: true };
  }
  const loose =
    /function scanWinText\(\) \{\s*var text = document\.body \? document\.body\.innerText : '';[\s\S]*?setInterval\(scanWinText, 800\);\s*\}\);/;
  if (loose.test(src)) {
    return { src: src.replace(loose, SCAN_NEW.trimStart()), changed: true };
  }
  return { src, changed: false };
}

function collectTargets() {
  const files = [];
  // packages/*/game.html
  if (fs.existsSync(PKG_ROOT)) {
    for (const ent of fs.readdirSync(PKG_ROOT, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name === 'reports') continue;
      const g = path.join(PKG_ROOT, ent.name, 'game.html');
      if (fs.existsSync(g)) files.push(g);
    }
  }
  walkHtmlFiles(SAMPLE_ROOT, files);
  return files;
}

function patchFile(file) {
  const before = fs.readFileSync(file, 'utf8');
  if (!before.includes('showWin') && !before.includes('scanWinText') && !before.includes('win-badge')) {
    return null;
  }
  // only touch craft / legacy bridge related html
  if (
    !before.includes('craft-gold') &&
    !before.includes('legacy-win-bridge') &&
    !before.includes('__craftShowWin') &&
    !before.includes('win-badge') &&
    !before.includes('function showWin(extra)')
  ) {
    return null;
  }

  let src = before;
  const flags = { showWin: false, dismiss: false, observer: false, badge: false, scan: false, alreadyShowWin: false };

  {
    const r = patchShowWin(src);
    src = r.src;
    flags.showWin = !!r.changed;
    flags.alreadyShowWin = !!r.already;
  }
  {
    const r = patchDismiss(src);
    src = r.src;
    flags.dismiss = !!r.changed;
  }
  {
    const r = patchObserver(src);
    src = r.src;
    flags.observer = !!r.changed;
  }
  {
    const r = patchWinBadge(src);
    src = r.src;
    flags.badge = !!r.changed;
  }
  {
    const r = patchScanWinText(src);
    src = r.src;
    flags.scan = !!r.changed;
  }

  if (src === before) {
    return { file, changed: false, flags };
  }
  fs.writeFileSync(file, src, 'utf8');
  return { file, changed: true, flags };
}

function main() {
  const files = collectTargets();
  const results = [];
  for (const f of files) {
    const r = patchFile(f);
    if (r) results.push(r);
  }
  const changed = results.filter((r) => r.changed);
  const summary = {
    scanned: files.length,
    touched: results.length,
    changed: changed.length,
    packages: changed
      .filter((r) => r.file.includes(`${path.sep}packages${path.sep}`))
      .map((r) => path.basename(path.dirname(r.file))),
    samples: changed
      .filter((r) => r.file.includes('样本html'))
      .map((r) => path.relative(SAMPLE_ROOT, r.file)),
    details: changed.map((r) => ({
      rel: path.relative(ROOT, r.file),
      ...r.flags,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
}

main();
