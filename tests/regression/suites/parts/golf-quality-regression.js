const { assert } = require('../../../lib/assert');
const fs = require('fs');
const path = require('path');
const { validateChapterQuality } = require('../../../../packages/contract');
const { enrichChapterContract } = require('../../../../packages/contract/enrich');
const { extractGameHints, buildLevelGameHints } = require('../../../../packages/generate/hints');
const { getGamesLegacyRoot, getRuntimeOutputRoot } = require('../../../../packages/shared/data-paths');

const GOLF_OUTPUT = path.join(
  getRuntimeOutputRoot(),
  '高尔夫球物理挑战-斜抛入洞示例-20260530-012538/chapters.json',
);
const GOLF_HTML = path.join(getGamesLegacyRoot(), '高尔夫球斜抛入洞.html');

function run() {
  if (!fs.existsSync(GOLF_OUTPUT) || !fs.existsSync(GOLF_HTML)) {
    console.log('golf-quality-regression: skip (output or source missing)');
    return;
  }

  const html = fs.readFileSync(GOLF_HTML, 'utf8');
  const base = extractGameHints([{ path: 'golf.html', content: html }]);
  const chapters = JSON.parse(fs.readFileSync(GOLF_OUTPUT, 'utf8'));
  const sources = [{ path: 'golf.html', content: html }];

  let improved = 0;
  const stillFail = [];

  chapters.forEach((entry, i) => {
    const levelHints = buildLevelGameHints(base, base.levels[i]);
    const raw = {
      mapping: entry.mapping,
      kg: entry.kg,
      dt: entry.dt,
      winSync: entry.winSync,
      strategy: entry.strategy,
      traceMap: entry.traceMap,
    };
    const before = validateChapterQuality(raw, levelHints);
    const enriched = enrichChapterContract(raw, levelHints, sources);
    const after = validateChapterQuality(enriched, levelHints);
    if (!before.ok && after.ok) improved += 1;
    if (!after.ok) {
      stillFail.push({
        ch: i,
        errors: after.errors.slice(0, 3),
        checklist: Object.entries(after.checklist || {}).filter(([, v]) => v === false).map(([k]) => k),
      });
    }
  });

  console.log('golf-quality-regression:', {
    total: chapters.length,
    improvedAfterEnrich: improved,
    stillFailCount: stillFail.length,
  });

  if (stillFail.length) {
    stillFail.forEach(s => console.log('  ch', s.ch, s.checklist.join(','), s.errors[0] || ''));
  }

  assert(improved >= 1, 'expected enrich repair to fix at least one chapter');
  console.log('golf-quality-regression: OK (repair path verified)');
}

module.exports = { run };
