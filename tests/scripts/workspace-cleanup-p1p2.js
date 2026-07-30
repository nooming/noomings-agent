/** Remove obsolete duplicate trees and abandoned offline mirrors */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function removeIfExists(srcRel) {
  const src = path.join(ROOT, srcRel);
  if (!fs.existsSync(src)) {
    console.log('skip missing:', srcRel);
    return;
  }
  fs.rmSync(src, { recursive: true, force: true });
  console.log('removed:', srcRel);
}

// P1: obsolete duplicates (packages/reports + datasets/training are canonical)
removeIfExists('data/datasets/html-samples/reports');
removeIfExists('data/training');
removeIfExists('data/datasets/html-samples/REPORTS.md');
removeIfExists('_archive');

// P2: 拾光离线镜像已弃用（外置包也不再保留）；需要时用 crawl-shiguang-physics 重建
removeIfExists('resources/shiguangtongxue');

console.log('workspace-cleanup-p1p2: done');
