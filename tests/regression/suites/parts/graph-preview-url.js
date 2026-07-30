const { assert } = require('../../../lib/assert');
const { resolveGraphPreviewUrl } = require('../../../../packages/platform/graph-preview-url');
const { loadGraphPreviewPayload } = require('../../../../packages/platform/graph-preview');
const { listPackageGraphs } = require('../../../../packages/platform/packages-index');

function run() {
  const graphs = listPackageGraphs();
  assert(graphs.length > 0, 'package graphs exist');

  for (const g of graphs) {
    assert(g.url, `${g.id} must have url`);
    assert(g.url.startsWith('/packages/') || g.url.startsWith('/graph.html?graphId='), `${g.id} preview url`);
  }

  const url = resolveGraphPreviewUrl('projectile-basic');
  assert(
    url.includes('/packages/projectile-basic/') || url.includes('graphId=projectile-basic'),
    `resolver url: ${url}`,
  );

  const legacy = resolveGraphPreviewUrl('html-samples-projectile-basic');
  assert(legacy.includes('projectile-basic'), `legacy graphId alias: ${legacy}`);

  const withIndex = resolveGraphPreviewUrl('projectile-basic', {
    id: 'projectile-basic',
    url: '/packages/custom/index.html',
  });
  assert(withIndex === '/packages/custom/index.html', 'index item url takes precedence');

  const eraUrl = resolveGraphPreviewUrl('capacitor-era');
  assert(eraUrl.includes('/packages/capacitor-era/'), `capacitor-era url: ${eraUrl}`);

  const legacyEra = resolveGraphPreviewUrl('电容纪元-静电城邦-20260702-154833');
  assert(legacyEra.includes('capacitor-era'), 'legacy output graphId alias');

  const sample = graphs[0];
  const payload = loadGraphPreviewPayload(sample.id);
  assert(payload.ok, `loadGraphPreviewPayload ${sample.id}: ${payload.error || 'ok'}`);
  assert(payload.kgChapters?.length >= 1, 'payload has kgChapters');

  const eraPayload = loadGraphPreviewPayload('capacitor-era');
  assert(eraPayload.ok && eraPayload.mode === 'full', 'capacitor-era multi-chapter');

  const missing = loadGraphPreviewPayload('__missing_package__');
  assert(!missing.ok, 'missing package should fail');

  console.log('graph-preview-url-check: OK');
}

module.exports = { run };
