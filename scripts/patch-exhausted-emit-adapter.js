#!/usr/bin/env node
/**
 * P1: attempts_exhausted must hit PlatformTraceAdapter even when window.__emit
 * is a stub (e.g. cyclotron console telemetry) or a craft-win wrapper.
 */
const fs = require('fs');
const path = require('path');

const OLD = `    if (firstShow) {
      try {
        var __exPayload = { attempts: 0, mode: 'challenge' };
        var __exSnap = { winOk: false, attemptsExhausted: true, hintKey: 'attempts_exhausted' };
        if (typeof window.__emit === 'function') {
          window.__emit('attempts_exhausted', __exPayload);
          window.__emit('snapshot', __exSnap);
        } else if (window.PlatformTraceAdapter && typeof window.PlatformTraceAdapter.record === 'function') {
          window.PlatformTraceAdapter.record('attempts_exhausted', __exPayload);
          window.PlatformTraceAdapter.record('snapshot', __exSnap);
        }
      } catch (__exErr) {}
    }`;

const NEW = `    if (firstShow) {
      try {
        var __exPayload = { attempts: 0, mode: 'challenge' };
        var __exSnap = { winOk: false, attemptsExhausted: true, hintKey: 'attempts_exhausted' };
        if (typeof window.__emit === 'function') {
          window.__emit('attempts_exhausted', __exPayload);
          window.__emit('snapshot', __exSnap);
        }
        // Always mirror to PlatformTraceAdapter — __emit may be a stub/wrapper
        try {
          if (window.PlatformTraceAdapter && typeof window.PlatformTraceAdapter.record === 'function') {
            window.PlatformTraceAdapter.record('attempts_exhausted', __exPayload);
            window.PlatformTraceAdapter.record('snapshot', __exSnap);
          } else if (window.parent && window.parent !== window && window.parent.PlatformTraceAdapter && typeof window.parent.PlatformTraceAdapter.record === 'function') {
            window.parent.PlatformTraceAdapter.record('attempts_exhausted', __exPayload);
            window.parent.PlatformTraceAdapter.record('snapshot', __exSnap);
          }
        } catch (__pta) {}
      } catch (__exErr) {}
    }`;

// compact variant without spaces differences - also handle single-line-ish
const OLD2 = OLD.replace(/\r\n/g, '\n');

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (name === 'game.html' || name.endsWith('.html') || name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

const files = [
  ...walk('data/runtime/packages'),
  ...walk('样本html'),
  'tests/scripts/inject-dual-mode-shell.js',
  'tests/scripts/patch-manual-dual-mode.js',
];

const patched = [];
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');
  const norm = html.replace(/\r\n/g, '\n');
  if (!norm.includes("hintKey: 'attempts_exhausted'") && !norm.includes('hintKey: "attempts_exhausted"')) continue;
  if (norm.includes('Always mirror to PlatformTraceAdapter')) {
    continue;
  }
  if (!norm.includes(OLD2)) {
    // try looser: replace the if/else if emit block
    const loose =
      /if \(typeof window\.__emit === 'function'\) \{\s*window\.__emit\('attempts_exhausted', __exPayload\);\s*window\.__emit\('snapshot', __exSnap\);\s*\} else if \(window\.PlatformTraceAdapter && typeof window\.PlatformTraceAdapter\.record === 'function'\) \{\s*window\.PlatformTraceAdapter\.record\('attempts_exhausted', __exPayload\);\s*window\.PlatformTraceAdapter\.record\('snapshot', __exSnap\);\s*\}/;
    if (!loose.test(norm)) {
      console.log('skip-pattern', file);
      continue;
    }
    html = html.replace(loose, `if (typeof window.__emit === 'function') {
          window.__emit('attempts_exhausted', __exPayload);
          window.__emit('snapshot', __exSnap);
        }
        // Always mirror to PlatformTraceAdapter — __emit may be a stub/wrapper
        try {
          if (window.PlatformTraceAdapter && typeof window.PlatformTraceAdapter.record === 'function') {
            window.PlatformTraceAdapter.record('attempts_exhausted', __exPayload);
            window.PlatformTraceAdapter.record('snapshot', __exSnap);
          } else if (window.parent && window.parent !== window && window.parent.PlatformTraceAdapter && typeof window.parent.PlatformTraceAdapter.record === 'function') {
            window.parent.PlatformTraceAdapter.record('attempts_exhausted', __exPayload);
            window.parent.PlatformTraceAdapter.record('snapshot', __exSnap);
          }
        } catch (__pta) {}`);
  } else {
    html = html.replace(/\r\n/g, '\n').split(OLD2).join(NEW);
  }
  fs.writeFileSync(file, html);
  patched.push(file);
  console.log('patched', file);
}

console.log(JSON.stringify({ patched: patched.length }, null, 2));
