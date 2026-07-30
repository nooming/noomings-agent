const fs = require('fs');
const { loadChapterForGraph } = require('../../../../packages/platform/catalog');
const { getPackageChapterPath } = require('../../../../packages/shared/data-paths');

function htmlSamplesChapterLoadCheck() {
  const chapterPath = getPackageChapterPath('multi-kp');
  if (!fs.existsSync(chapterPath)) {
    console.log('html-samples-chapter-load: SKIP (multi-kp chapter missing)');
    return;
  }
  const chapter = loadChapterForGraph('multi-kp');
  if (!chapter?.kg?.nodes?.length) {
    throw new Error('loadChapterForGraph multi-kp failed');
  }
  const legacy = loadChapterForGraph('html-samples-multi-kp');
  if (!legacy?.kg?.nodes?.length) {
    throw new Error('legacy graphId alias failed');
  }
  console.log('html-samples-chapter-load: OK');
}

module.exports = { run: htmlSamplesChapterLoadCheck };
