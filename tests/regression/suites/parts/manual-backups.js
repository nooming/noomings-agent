const fs = require('fs');
const path = require('path');
const { assert } = require('../../../lib/assert');
const { getManualBackupsRoot, getPackageManifestPath } = require('../../../../packages/shared/data-paths');

function run() {
  const root = getManualBackupsRoot();
  assert(fs.existsSync(path.join(root, 'README.md')), 'manual-backups README');
  assert(fs.existsSync(path.join(root, 'index.json')), 'manual-backups index.json');
  assert(fs.existsSync(path.join(root, 'capacitor-era.html')), 'capacitor-era backup');

  const legacyDir = path.join(root, 'legacy');
  const legacyFiles = [
    '斜抛运动物理挑战.html',
    '高尔夫球斜抛入洞.html',
    '电场台球.html',
    '回旋加速器与复合电磁场运动.html',
  ];
  for (const name of legacyFiles) {
    assert(fs.existsSync(path.join(legacyDir, name)), `legacy backup ${name}`);
  }

  const manifest = JSON.parse(fs.readFileSync(getPackageManifestPath(), 'utf8'));
  const allowedOrigin = new Set(['agent', 'teammate']);
  for (const s of manifest.samples || []) {
    assert(!s.existingHtml, `${s.id} must not have existingHtml`);
    assert(allowedOrigin.has(s.htmlOrigin), `${s.id} htmlOrigin should be agent|teammate`);
  }

  console.log('manual-backups-check: OK');
}

module.exports = { run };
