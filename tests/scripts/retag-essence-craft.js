/** Retag craft:* on essence manifests + catalog featured */
const fs = require('fs');
const path = require('path');
const { readCatalog, writeCatalog } = require('../../packages/platform/catalog');

const ROOT = path.resolve(__dirname, '../..');
const PKG_MANIFEST = path.join(ROOT, 'data/runtime/packages/manifest.json');
const HS_MANIFEST = path.join(ROOT, 'data/datasets/html-samples/manifest.json');

const GOLD = new Set([
  'pendulum-clock',
  'pendulum-target',
  'projectile-cannon',
  'projectile-basic',
]);
const PILOT = new Set([
  'capacitor-era-ch1',
  'capacitor-era-ch2',
  'capacitor-era-ch4',
  'gas-ideal',
  'circular-motion',
  'rc-circuit',
  'photoelectric',
  'refraction-snell',
  'multi-kp',
  'transformer-turns',
]);

function setCraft(tags, craft) {
  const rest = (tags || []).filter((t) => !String(t).startsWith('craft:'));
  return [...new Set([...rest, craft])];
}

function patchManifest(file) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const s of m.samples || []) {
    if (GOLD.has(s.id)) s.tags = setCraft(s.tags, 'craft:gold');
    else if (PILOT.has(s.id)) s.tags = setCraft(s.tags, 'craft:pilot');
    else s.tags = setCraft(s.tags, 'craft:draft');
  }
  fs.writeFileSync(file, JSON.stringify(m, null, 2) + '\n', 'utf8');
  console.log('manifest', path.relative(ROOT, file), (m.samples || []).length);
}

patchManifest(PKG_MANIFEST);
if (fs.existsSync(HS_MANIFEST)) patchManifest(HS_MANIFEST);

const catalog = readCatalog();
let n = 0;
for (const item of catalog.items || []) {
  const sampleId = String(item.graphId || item.id || '').replace(/^demo-/, '');
  const craft = GOLD.has(sampleId)
    ? 'craft:gold'
    : PILOT.has(sampleId)
      ? 'craft:pilot'
      : 'craft:draft';
  const tags = setCraft(item.sampleTags || item.tags || [], craft);
  item.sampleTags = tags;
  const wantFeatured = craft === 'craft:gold';
  if (item.featured !== wantFeatured) {
    item.featured = wantFeatured;
    n++;
  }
}
writeCatalog(catalog);
console.log('catalog featured updates:', n, 'total', (catalog.items || []).length);
