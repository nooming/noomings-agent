#!/usr/bin/env node
/**
 * P1: local emit() must be bound to window.__emit, otherwise craft-win
 * wrapper captures undefined and swallows attempts_exhausted.
 */
const fs = require('fs');
const path = require('path');

const roots = [
  path.join('data', 'runtime', 'packages'),
  path.join('样本html'),
];

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

const files = roots.flatMap((r) => walk(r));
const patched = [];

for (const file of files) {
  let html = fs.readFileSync(file, 'utf8');
  if (!/function emit\s*\(\s*type\s*,\s*payload\s*\)/.test(html)) continue;
  if (/window\.__emit\s*=\s*emit\s*;/.test(html)) continue;

  // Insert after the emit function's closing that records to PlatformTraceAdapter
  // Prefer: right after "function emit(...){ ... }" first occurrence that mentions PlatformTraceAdapter
  const re =
    /(function emit\s*\(\s*type\s*,\s*payload\s*\)\s*\{[\s\S]*?PlatformTraceAdapter[\s\S]*?\n\s*\})\n/;
  if (!re.test(html)) {
    console.log('no-hook', file);
    continue;
  }
  const next = html.replace(re, (m, fn) => `${fn}\n  window.__emit = emit;\n`);
  if (next === html) {
    console.log('no-change', file);
    continue;
  }
  fs.writeFileSync(file, next);
  patched.push(file);
  console.log('patched', file);
}

console.log(JSON.stringify({ patched: patched.length, files: patched }, null, 2));
