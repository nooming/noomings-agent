const { assert } = require('../../../lib/assert');
const { resolveGraphPreviewUrl } = require('../../../../packages/platform/graph-preview-url');
const { loadGraphPreviewPayload } = require('../../../../packages/platform/graph-preview');
const { listPackageGraphs } = require('../../../../packages/platform/packages-index');

function run() {
  const graphs = listPackageGraphs();
  assert(graphs.length > 0, 'package graphs exist');

  for (const g of graphs) {
    assert(g.url, `${g.id} must have url`);
    assert(
      g.url.startsWith('/packages/')
        || g.url.startsWith('/graph.html?graphId=')
        || g.url.startsWith('/static/packages/'),
      `${g.id} preview url: ${g.url}`,
    );
  }

  const url = resolveGraphPreviewUrl('projectile-basic');
  assert(
    url === `/static/packages/projectile-basic/${encodeURIComponent('图谱.html')}`,
    `resolver prefers Strategy-first 图谱.html: ${url}`,
  );
  assert(!url.endsWith('/index.html'), 'must not open packages index.html as primary');

  const legacy = resolveGraphPreviewUrl('html-samples-projectile-basic');
  assert(
    legacy === `/static/packages/projectile-basic/${encodeURIComponent('图谱.html')}`,
    `legacy graphId alias: ${legacy}`,
  );

  const withIndex = resolveGraphPreviewUrl('projectile-basic', {
    id: 'projectile-basic',
    url: '/packages/custom/index.html',
  });
  assert(withIndex === '/packages/custom/index.html', 'index item url takes precedence');

  const eraUrl = resolveGraphPreviewUrl('capacitor-era');
  assert(eraUrl.includes('/packages/capacitor-era/') || eraUrl.includes('graphId=capacitor-era') || eraUrl.includes('capacitor-era'), `capacitor-era url: ${eraUrl}`);

  const ch1Url = resolveGraphPreviewUrl('capacitor-era-ch1');
  assert(
    ch1Url === `/static/packages/capacitor-era-ch1/${encodeURIComponent('图谱.html')}`,
    `ch1 must use Strategy-first 图谱.html: ${ch1Url}`,
  );

  const legacyEra = resolveGraphPreviewUrl('电容纪元-静电城邦-20260702-154833');
  assert(legacyEra.includes('capacitor-era'), 'legacy output graphId alias');

  const sample = graphs[0];
  const payload = loadGraphPreviewPayload(sample.id);
  assert(payload.ok, `loadGraphPreviewPayload ${sample.id}: ${payload.error || 'ok'}`);
  assert(payload.kgChapters?.length >= 1, 'payload has kgChapters');

  const ch1Payload = loadGraphPreviewPayload('capacitor-era-ch1');
  assert(ch1Payload.ok, 'capacitor-era-ch1 payload loads');

  const missing = loadGraphPreviewPayload('__missing_package__');
  assert(!missing.ok, 'missing package should fail');

  console.log('graph-preview-url-check: OK');
}

module.exports = { run };
