/** 加载探究包 manifest.json（精华种子） */
const fs = require('fs');
const { getPackageManifestPath, getPackagesRoot } = require('../../packages/shared/data-paths');

const EVAL_IDS = new Set(['multi-kp', 'series-parallel', 'heat-conduction', 'capacitor-confound-ui']);

function loadAllSamples() {
  const file = getPackageManifestPath();
  const main = JSON.parse(fs.readFileSync(file, 'utf8'));
  const samples = (main.samples || [])
    .filter(s => s.id !== 'capacitor-plate')
    .map(s => ({
      ...s,
      split: s.split || (EVAL_IDS.has(s.id) ? 'eval' : 'train'),
    }));
  return { version: main.version, description: main.description, samples };
}

module.exports = { loadAllSamples, EVAL_IDS, getPackagesRoot };
