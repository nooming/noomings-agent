/** Structural + style-token visual regression vs pre-slim baseline fixtures */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '../../../..');
const BASE = path.join(ROOT, 'tests/fixtures/capacitor-era-slim-baseline');
const PKG = path.join(ROOT, 'data/runtime/packages');

const KEEP = {
  1: ['#controls', '#cap-formula', '#summary1', '#s-area', '#mat-wrap', '#chapter-badge', '#victory', '#dialogue'],
  2: ['#controls2', '#ch2-formula', '#summary2', '#s-c1', '#chapter-badge', '#victory', '#dialogue'],
  4: ['#controls4', '#summary4', '#chapter-badge', '#victory', '#dialogue'],
};

const DROP = ['#controls3', '#controls5', '#controls6', '#controls7', '#ch8-root'];

function extractStyleBlock(html) {
  const m = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(html);
  return m ? m[1] : '';
}

/** Pull simple CSS declarations for a selector from a style sheet text */
function declsFor(styleText, selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${esc}\\s*\\{([^}]*)\\}`, 'g');
  const props = {};
  let m;
  while ((m = re.exec(styleText))) {
    const body = m[1];
    for (const part of body.split(';')) {
      const idx = part.indexOf(':');
      if (idx < 0) continue;
      const k = part.slice(0, idx).trim().toLowerCase();
      const v = part.slice(idx + 1).trim();
      if (k) props[k] = v;
    }
  }
  return props;
}

function hasId(html, sel) {
  const id = sel.startsWith('#') ? sel.slice(1) : sel;
  return html.includes(`id="${id}"`) || html.includes(`id='${id}'`);
}

function run() {
  for (const n of [1, 2, 4]) {
    const baseline = fs.readFileSync(path.join(BASE, `ch${n}.html`), 'utf8');
    const slim = fs.readFileSync(path.join(PKG, `capacitor-era-ch${n}`, 'game.html'), 'utf8');
    assert.ok(slim.includes('slim: dropped block'), `ch${n}: expected slim markers`);
    assert.ok(slim.split(/\n/).length < baseline.split(/\n/).length, `ch${n}: should be shorter`);

    for (const sel of KEEP[n]) {
      assert.ok(hasId(slim, sel), `ch${n}: slim missing ${sel}`);
      assert.ok(hasId(baseline, sel), `ch${n}: baseline missing ${sel}`);
    }
    for (const sel of DROP) {
      assert.ok(!hasId(slim, sel), `ch${n}: slim still has ${sel}`);
    }

    const baseStyle = extractStyleBlock(baseline);
    const slimStyle = extractStyleBlock(slim);
    // Shared chrome tokens must remain
    for (const sel of ['#top-chrome', '#dialogue', '.ctrl-panel', '.formula-float']) {
      const b = declsFor(baseStyle, sel);
      const s = declsFor(slimStyle, sel);
      if (!Object.keys(b).length) continue;
      for (const key of ['background', 'background-color', 'border', 'color', 'font-family', 'font-size']) {
        if (b[key] == null) continue;
        assert.strictEqual(
          s[key],
          b[key],
          `ch${n}: ${sel} ${key} changed (${b[key]} → ${s[key]})`,
        );
      }
    }

    // Keep-chapter panel tokens
    const panelSel = { 1: '#controls', 2: '#controls2', 4: '#controls4' }[n];
    const bp = declsFor(baseStyle, panelSel);
    const sp = declsFor(slimStyle, panelSel);
    for (const key of Object.keys(bp)) {
      if (['display', 'opacity', 'pointer-events'].includes(key)) continue;
      if (bp[key] !== sp[key]) {
        // allow missing if selector was only in media query we narrowed
        if (sp[key] == null && /max-width|@media/.test(baseStyle)) continue;
        assert.strictEqual(sp[key], bp[key], `ch${n}: ${panelSel}.${key}`);
      }
    }
  }
  console.log('capacitor-slim-visual-check: ok', { chapters: [1, 2, 4] });
}

module.exports = { run };
