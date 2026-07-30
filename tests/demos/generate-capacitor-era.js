/** Agent A 分析轨：电容纪元 → 落盘 multi-level 或单章 project */
const fs = require('fs');
const path = require('path');
const { extractGameHints } = require('../../packages/generate/hints');
const { generateGraph } = require('../../packages/generate/pipeline');
const { generateMultiLevelGraph } = require('../../packages/generate/multi-level-pipeline');
const { writeGeneratedGraph } = require('../../packages/generate/graph-persist');
const { getAgentOutputRoot } = require('../../packages/shared/paths');
const { getPackageGamePath } = require('../../packages/shared/data-paths');
const { packagePlayUrl } = require('../../packages/shared/package-layout');
const { publishGame } = require('../../packages/platform/catalog');

require('../../packages/shared/load-env').loadEnv();

const opts = {
  apiKey: process.env.DEEPSEEK_API_KEY,
  apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
};

const SAMPLE = getPackageGamePath('capacitor-era');
const outputRoot = getAgentOutputRoot();

function upsertCatalog(graphId) {
  const pub = publishGame({
    id: 'capacitor-era',
    title: '电容纪元：静电城邦',
    description: '多章静电与电容探究旗舰示例 · 平台自动采集操作轨迹',
    graphId: graphId === '电容纪元-静电城邦-20260702-154833' ? 'capacitor-era' : graphId,
    playUrl: packagePlayUrl('capacitor-era'),
    featured: true,
    published: true,
    source: 'teacher',
  });
  console.log('catalog:', pub);
  return pub;
}

(async () => {
  if (!opts.apiKey) {
    console.error('DEEPSEEK_API_KEY required');
    process.exit(1);
  }
  console.log('Reading', SAMPLE);
  const sources = [{ path: '电容纪元.html', content: fs.readFileSync(SAMPLE, 'utf8') }];
  const gameHints = extractGameHints(sources);
  console.log('hasMultipleLevels:', gameHints.hasMultipleLevels, 'levelCount:', gameHints.levelCount);

  if (gameHints.hasMultipleLevels) {
    const gen = await generateMultiLevelGraph({
      sources,
      gameHints,
      title: '电容纪元：静电城邦',
      outputRoot,
    }, opts);
    console.log('projectId:', gen.projectId);
    console.log('path:', gen.path);
    console.log('stats:', JSON.stringify(gen.stats, null, 2));
    fs.writeFileSync(
      path.join(outputRoot, 'capacitor-era-last-run.json'),
      JSON.stringify({ projectId: gen.projectId, path: gen.path, stats: gen.stats, at: new Date().toISOString() }, null, 2),
    );
    if (gen.stats?.passed > 0) upsertCatalog(gen.projectId);
    process.exit(gen.stats?.passed > 0 ? 0 : 1);
  }

  const gen = await generateGraph({ sources, gameHints, title: '电容纪元：静电城邦' }, opts);
  const saved = writeGeneratedGraph({
    root: outputRoot,
    chapter: gen.chapter,
    title: '电容纪元：静电城邦',
    gameHints,
    sources,
    skipQuality: !gen.quality?.ok,
  });
  console.log('saved:', saved);
  fs.writeFileSync(
    path.join(outputRoot, 'capacitor-era-last-run.json'),
    JSON.stringify({ projectId: saved.id, ok: saved.ok, at: new Date().toISOString() }, null, 2),
  );
  if (saved.ok) upsertCatalog(saved.id);
  process.exit(saved.ok ? 0 : 1);
})();
