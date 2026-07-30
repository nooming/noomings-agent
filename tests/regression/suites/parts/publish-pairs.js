const fs = require('fs');
const { listPublishPairs } = require('../../../../packages/platform/publish-pairs');
const { loadManifest } = require('../../../../packages/platform/packages-index');
const { getPackageGamePath, getPackageChapterPath } = require('../../../../packages/shared/data-paths');
const { packagePlayUrl } = require('../../../../packages/shared/package-layout');

function publishPairsCheck() {
  const { samples = [] } = loadManifest();
  const pairs = listPublishPairs();
  const byGraphId = new Map(pairs.map(p => [p.graphId, p]));

  let expected = 0;
  for (const s of samples) {
    if (s.id === 'capacitor-plate') continue;
    const chapterPath = getPackageChapterPath(s.id);
    const htmlPath = getPackageGamePath(s.id);
    if (!fs.existsSync(chapterPath) || !fs.existsSync(htmlPath)) continue;
    expected += 1;
    const pair = byGraphId.get(s.id);
    if (!pair) {
      throw new Error(`missing publish pair for ${s.id}`);
    }
    const expectedUrl = packagePlayUrl(s.id);
    if (pair.playUrl !== expectedUrl) {
      throw new Error(`${s.id}: playUrl mismatch ${pair.playUrl} !== ${expectedUrl}`);
    }
  }

  if (expected < 1) {
    console.log('publish-pairs: SKIP (no package chapters on disk)');
    return;
  }
  console.log(`publish-pairs: OK (${expected} sample pairs)`);
}

module.exports = { run: publishPairsCheck };
