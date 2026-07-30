const { execSync } = require('child_process');
const path = require('path');

const viewerPath = path.join(__dirname, '../../../../apps/web/viewer/js/viewer.js');

function run() {
  execSync(`node --check "${viewerPath}"`, { stdio: 'pipe' });
  console.log('viewer-syntax-check: OK');
}

module.exports = { run };
