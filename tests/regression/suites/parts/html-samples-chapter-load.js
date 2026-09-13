/** Legacy name: html-samples-* alias smoke (full coverage → packages-chapter-load) */
const fs = require('fs');
const { loadChapterForGraph } = require('../../../../packages/platform/catalog');
const { getPackageChapterPath } = require('../../../../packages/shared/data-paths');

function htmlSamplesChapterLoadCheck() {
  const chapterPath = getPackageChapterPath('projectile-basic');
  if (!fs.existsSync(chapterPath)) {
    console.log('html-samples-chapter-load: SKIP (projectile-basic chapter missing)');
    return;
  }
  const chapter = loadChapterForGraph('projectile-basic');
  if (!chapter?.kg?.nodes?.length) {
    throw new Error('loadChapterForGraph projectile-basic failed');
  }
  const legacy = loadChapterForGraph('html-samples-projectile-basic');
  if (!legacy?.kg?.nodes?.length) {
    throw new Error('legacy graphId alias failed');
  }
  console.log('html-samples-chapter-load: OK');
}

module.exports = { run: htmlSamplesChapterLoadCheck };
