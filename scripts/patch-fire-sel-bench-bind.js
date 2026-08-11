#!/usr/bin/env node
/**
 * P1: dual-mode onPrimaryClick must count main fire buttons outside .essence-ft.
 * Prefer essence-bench + FIRE_SEL (same pattern as gas-ideal / thin-lens).
 */
const fs = require('fs');
const path = require('path');

const FIRE_SEL =
  "#btnLaunch,#btn-test,#btn-test-ft,#btn-fire,#btnFire,#btnTest,#testBtn,#fireBtn,#launchBtn,#btn-run,#btnRun,#c4-discharge-btn,[data-action=\"fire\"],[data-action=\"test\"],[data-action=\"launch\"]";

const OLD_BOOT =
  "    var ft = document.querySelector('#essence-bench .essence-ft') || $('essence-bench') || document.body;\n    ft.addEventListener('click', onPrimaryClick, true);";

const NEW_BOOT =
  "    // Prefer whole bench so fire buttons outside .essence-ft still count\n" +
  "    var root = $('essence-bench') || document;\n" +
  "    root.addEventListener('click', onPrimaryClick, true);";

const OLD_HANDLER =
  "  function onPrimaryClick(e){\n" +
  "    if (state.mode !== 'challenge') return;\n" +
  "    var t = e.target.closest('button');\n" +
  "    if (!t) return;";

const NEW_HANDLER =
  "  var FIRE_SEL = '" +
  FIRE_SEL +
  "';\n" +
  "  function onPrimaryClick(e){\n" +
  "    if (state.mode !== 'challenge') return;\n" +
  "    var t = e.target && e.target.closest ? e.target.closest(FIRE_SEL) : null;\n" +
  "    if (!t) return;";

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (name === 'game.html' || name.endsWith('.html')) acc.push(p);
  }
  return acc;
}

const roots = [
  path.join('data', 'runtime', 'packages'),
  path.join('样本html'),
  path.join('tests', 'scripts'),
];

const files = [];
for (const r of roots) {
  if (r.endsWith('scripts')) {
    const inj = path.join(r, 'inject-dual-mode-shell.js');
    if (fs.existsSync(inj)) files.push(inj);
  } else {
    walk(r, files);
  }
}

const results = [];
for (const file of files) {
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('function onPrimaryClick(e){')) continue;
  if (!html.includes('dual-mode-shell') && !file.includes('inject-dual-mode-shell')) continue;

  let changed = false;
  const before = html;

  if (html.includes(OLD_BOOT)) {
    html = html.split(OLD_BOOT).join(NEW_BOOT);
    changed = true;
  }

  if (html.includes(OLD_HANDLER) && !html.includes('var FIRE_SEL = ')) {
    html = html.split(OLD_HANDLER).join(NEW_HANDLER);
    changed = true;
  } else if (/var FIRE_SEL = '[^']*';/.test(html)) {
    html = html.replace(/var FIRE_SEL = '[^']*';/, "var FIRE_SEL = '" + FIRE_SEL + "';");
    if (html !== before) changed = true;
  }

  if (html !== before) {
    fs.writeFileSync(file, html);
    results.push({ file, ok: true });
  }
}

console.log(JSON.stringify({ patched: results.length, files: results.map((r) => r.file) }, null, 2));
