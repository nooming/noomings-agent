/** Assert every packages manifest sample has a parseable chapter.json */
const fs = require('fs');
const { assert } = require('../../../lib/assert');
const { loadAllSamples } = require('../../../lib/html-samples-manifest');
const { loadChapterForGraph } = require('../../../../packages/platform/catalog');
const {
  getPackageChapterPath,
  loadChapterForSample,
} = require('../../../../packages/shared/data-paths');

function packagesChapterLoadCheck() {
  const { samples } = loadAllSamples();
  assert(samples.length >= 23, `expected >= 23 packages samples, got ${samples.length}`);

  const missing = [];
  const unparseable = [];
  const ok = [];

  for (const sample of samples) {
    const id = sample.id;
    const chapterPath = getPackageChapterPath(id);
    if (!fs.existsSync(chapterPath)) {
      missing.push(id);
      continue;
    }
    const chapter = loadChapterForSample(id);
    if (!chapter || typeof chapter !== 'object') {
      unparseable.push(id);
      continue;
    }
    if (!chapter.kg?.nodes?.length && !chapter.inquiryScript) {
      unparseable.push(`${id} (no kg.nodes / inquiryScript)`);
      continue;
    }
    ok.push(id);
  }

  if (missing.length) {
    console.warn(`packages-chapter-load: missing chapter.json: ${missing.join(', ')}`);
  }
  if (unparseable.length) {
    console.warn(`packages-chapter-load: unparseable/empty: ${unparseable.join(', ')}`);
  }

  assert(missing.length === 0, `missing chapter.json for: ${missing.join(', ')}`);
  assert(unparseable.length === 0, `bad chapter for: ${unparseable.join(', ')}`);

  // Alias smoke
  const alias = loadChapterForGraph('html-samples-multi-kp');
  assert(alias?.kg?.nodes?.length, 'legacy html-samples-* graphId alias failed');

  console.log(`packages-chapter-load: OK (${ok.length}/${samples.length})`);
}

module.exports = { run: packagesChapterLoadCheck };
