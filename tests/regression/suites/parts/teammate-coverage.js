/** Every HTML under 组员做的样本 must map into essence packages + manifest */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { getPackagesRoot } = require('../../../../packages/shared/data-paths');
const { hasWinEmit, hasExecutableTraceHook } = require('../../../../packages/platform/legacy-trace-inject');
const TEAM_MAP = require('../../../lib/teammate-sample-map');

const ROOT = path.resolve(__dirname, '../../../..');
const SRC = path.join(ROOT, '组员做的样本');

function run() {
  // Source dump dir is optional locally; packages under data/runtime/packages are canonical
  const srcPresent = fs.existsSync(SRC);
  if (srcPresent) {
    const htmlFiles = fs.readdirSync(SRC).filter((f) => f.endsWith('.html')).sort();
    const bySrc = new Map(TEAM_MAP.map((s) => [s.src, s]));
    assert.strictEqual(
      htmlFiles.length,
      TEAM_MAP.length,
      `teammate dir has ${htmlFiles.length} html, map has ${TEAM_MAP.length}`,
    );
    for (const f of htmlFiles) {
      assert.ok(bySrc.has(f), `unmapped teammate file: ${f}`);
    }
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(getPackagesRoot(), 'manifest.json'), 'utf8'));
  const ids = new Set((manifest.samples || []).map((s) => s.id));
  const pkgRoot = getPackagesRoot();

  for (const s of TEAM_MAP) {
    assert.ok(ids.has(s.id), `${s.id}: missing from packages manifest`);
    const gamePath = path.join(pkgRoot, s.id, 'game.html');
    const chapterPath = path.join(pkgRoot, s.id, 'chapter.json');
    assert.ok(fs.existsSync(gamePath), `${s.id}: game.html missing`);
    assert.ok(fs.existsSync(chapterPath), `${s.id}: chapter.json missing`);
    const html = fs.readFileSync(gamePath, 'utf8');
    assert.ok(hasExecutableTraceHook(html) || html.includes('__emit'), `${s.id}: missing emit hook`);
    assert.ok(hasWinEmit(html), `${s.id}: missing win emit`);
    assert.ok(!/fonts\.googleapis\.com/.test(html), `${s.id}: Google Fonts hard dep`);
  }

  console.log('teammate-coverage-check: ok', {
    srcDir: srcPresent ? 'present' : 'optional-missing',
    packages: TEAM_MAP.map((s) => s.id),
  });
}

module.exports = { run };
