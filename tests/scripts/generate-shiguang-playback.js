/** CLI: node tests/scripts/generate-shiguang-playback.js [--fetch-embedded] */
const fs = require('fs');
const path = require('path');
const lib = require('./shiguang-playback-lib');

const {
  OUT_ROOT,
  CONTENT_ROOT,
  ensureSharedDeps,
  walkMetaFiles,
  readJson,
  writeJson,
  readEngineSource,
  extractEmbeddedRefs,
  copyCoreDeps,
  copyToolkitsToEngine,
  fetchEmbeddedAssets,
  mirrorHtmlToEmbedded,
  fixEmbeddedHtmlPaths,
  generateRedirectIndex,
  generateEngineShell,
  generateOpenCmd,
  playModeForItem,
  relFromContent,
} = lib;

function parseArgs(argv) {
  return { fetchEmbedded: argv.includes('--fetch-embedded') };
}

function generateCatalogPlay(manifestItems) {
  const byStage = { junior: {}, senior: {} };
  for (const item of manifestItems) {
    const stage = item.stage;
    if (!byStage[stage]) byStage[stage] = {};
    if (!byStage[stage][item.cat]) byStage[stage][item.cat] = [];
    byStage[stage][item.cat].push(item);
  }

  const stageLabel = { junior: '初中', senior: '高中' };
  let body = '';
  for (const stage of ['junior', 'senior']) {
    const cats = byStage[stage] || {};
    body += `<section><h2>${stageLabel[stage] || stage}</h2>`;
    for (const [cat, items] of Object.entries(cats).sort()) {
      const catLabel = items[0]?.catLabel || cat;
      body += `<h3>${catLabel}</h3><ul>`;
      for (const it of items.sort((a, b) => a.title.localeCompare(b.title, 'zh'))) {
        const href = `../content/${it.path}/`;
        const kind = it.play?.mode || it.kind || '';
        body += `<li><a href="${href}">${it.title}</a> <small>(${kind})</small></li>`;
      }
      body += '</ul>';
    }
    body += '</section>';
  }

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>拾光物理 · 实验预览目录</title>
  <style>
    body { font-family: "Noto Sans SC", system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 24px; background: #f8fafc; color: #0f172a; }
    h1 { border-bottom: 2px solid #0f172a; padding-bottom: 8px; }
    h2 { margin-top: 32px; color: #1e40af; }
    h3 { margin-top: 20px; color: #475569; font-size: 1rem; }
    ul { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 6px 16px; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    small { color: #94a3b8; }
    .hint { background: #eff6ff; border: 1px solid #bfdbfe; padding: 12px 16px; border-radius: 8px; margin-bottom: 24px; font-size: 14px; }
  </style>
</head>
<body>
  <h1>拾光物理 · 离线预览目录</h1>
  <p class="hint">共 ${manifestItems.length} 个实验。进入任意实验目录双击 <code>open.cmd</code>，或运行 <code>npm run shiguang-play -- &lt;slug&gt;</code> 启动本地服务后预览。</p>
  ${body}
</body>
</html>
`;
  const out = path.join(OUT_ROOT, 'catalog', 'play.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, 'utf8');
  return out;
}

function generateRootOpenCatalog() {
  const cmd = `@echo off
cd /d "%~dp0"
start "" "http://localhost:8765/catalog/play.html"
npx -y serve . -l 8765
`;
  fs.writeFileSync(path.join(OUT_ROOT, 'open-catalog.cmd'), cmd, 'utf8');
}

async function main() {
  const opts = parseArgs(process.argv);
  console.log('generate-shiguang-playback: ensuring shared deps…');
  await ensureSharedDeps();

  const metaFiles = walkMetaFiles(CONTENT_ROOT);
  const stats = {
    total: metaFiles.length,
    core: 0,
    toolkit: 0,
    htmlFixed: 0,
    embeddedFetched: 0,
    redirect: 0,
    shell: 0,
    openCmd: 0,
  };
  const manifestItems = [];

  for (const metaPath of metaFiles.sort()) {
    const itemPath = path.dirname(metaPath);
    const meta = readJson(metaPath);
    const engineSrc = readEngineSource(itemPath);
    const rel = relFromContent(itemPath);

    if (copyCoreDeps(itemPath, engineSrc)) stats.core++;
    if (engineNeedsToolkit(engineSrc)) {
      copyToolkitsToEngine(itemPath, engineSrc);
      stats.toolkit++;
    }

    stats.htmlFixed += fixEmbeddedHtmlPaths(itemPath);

    const embRefs = extractEmbeddedRefs(engineSrc);
    if (opts.fetchEmbedded && embRefs.length) {
      const before = hasHtmlIndex(itemPath);
      await fetchEmbeddedAssets(itemPath, embRefs, meta);
      if (!before && hasHtmlIndex(itemPath)) stats.embeddedFetched++;
    }

    if (hasHtmlIndex(itemPath)) {
      for (const ref of embRefs.filter(r => r.type === 'folder')) {
        mirrorHtmlToEmbedded(itemPath, ref.slug);
      }
      generateRedirectIndex(itemPath, meta, 'html/index.html');
      stats.redirect++;
    } else if (findEngineFile(itemPath)) {
      if (generateEngineShell(itemPath, meta)) stats.shell++;
    }

    generateOpenCmd(itemPath, meta);
    stats.openCmd++;

    const play = playModeForItem(itemPath, meta, engineSrc);
    meta.play = play;
    writeJson(metaPath, meta);

    manifestItems.push({
      slug: meta.slug,
      stage: meta.stage,
      cat: meta.cat,
      catLabel: meta.catLabel,
      title: meta.title,
      type: meta.type,
      kind: (meta.kind || []).join('+') || 'unknown',
      path: rel,
      play,
    });
  }

  const manifestPath = path.join(OUT_ROOT, 'manifest.json');
  let manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : {};
  manifest.playbackGeneratedAt = new Date().toISOString();
  manifest.items = manifestItems.sort((a, b) => a.path.localeCompare(b.path));
  writeJson(manifestPath, manifest);

  generateCatalogPlay(manifestItems);
  generateRootOpenCatalog();

  console.log('done:', stats);
  console.log(`catalog: ${path.join(OUT_ROOT, 'catalog/play.html')}`);
}

function engineNeedsToolkit(src) {
  return /MechanicsTeachingToolkit|ThermalEngineToolkit/.test(src);
}

function findEngineFile(dir) {
  const engDir = path.join(dir, 'engine');
  if (!fs.existsSync(engDir)) return null;
  const files = fs.readdirSync(engDir).filter(f => f.endsWith('Engine.js'));
  return files[0] || null;
}

function hasHtmlIndex(dir) {
  return fs.existsSync(path.join(dir, 'html', 'index.html'));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
