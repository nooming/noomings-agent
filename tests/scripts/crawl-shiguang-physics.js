/** CLI: node tests/scripts/crawl-shiguang-physics.js [--dry-run] [--only catalog|engines|embedded|core|deps] */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const DEFAULT_COOKIE = path.join(ROOT, 'resources/www.shiguangtongxue.cn_cookies.txt');
const OUT_ROOT = path.join(ROOT, 'resources/shiguangtongxue');
const BASE_URL = 'https://www.shiguangtongxue.cn';
const PHYSICS_PREFIX = '/subjects/physics/';

const TAXONOMY = {
  mechanics: '力学',
  electromagnetism: '电磁学',
  optics: '光学',
  thermal: '热学',
  wave: '波动',
  modern: '近代与其它',
  other: '其它',
};

const CAT_ALIASES = {
  em: 'electromagnetism',
};

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    cookieFile: DEFAULT_COOKIE,
    only: null,
    concurrency: 4,
    delayMs: 150,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--cookie-file') opts.cookieFile = path.resolve(argv[++i]);
    else if (a === '--only') opts.only = argv[++i];
    else if (a === '--concurrency') opts.concurrency = Number(argv[++i]) || 4;
    else if (a === '--delay-ms') opts.delayMs = Number(argv[++i]) || 150;
  }
  return opts;
}

function readNetscapeCookies(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Cookie file not found: ${filePath}`);
  }
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const pairs = [];
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 7) continue;
    pairs.push(`${parts[5]}=${parts[6]}`);
  }
  return pairs.join('; ');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchText(url, cookieHeader, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          Cookie: cookieHeader,
          'User-Agent': 'agent-crawl-shiguang/1.0',
        },
        redirect: 'follow',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${url}`);
      }
      return await res.text();
    } catch (err) {
      lastErr = err;
      await sleep(300 * (i + 1));
    }
  }
  throw lastErr;
}

async function fetchBuffer(url, cookieHeader, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          Cookie: cookieHeader,
          'User-Agent': 'agent-crawl-shiguang/1.0',
        },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      await sleep(300 * (i + 1));
    }
  }
  throw lastErr;
}

function physicsUrl(relativePath) {
  const p = String(relativePath || '').replace(/^\/+/, '');
  return `${BASE_URL}${PHYSICS_PREFIX}${p}`;
}

function parseModelsExport(source, exportName) {
  const marker = `export const ${exportName}`;
  const idx = source.indexOf(marker);
  if (idx < 0) throw new Error(`Missing ${exportName} in models source`);
  const eq = source.indexOf('=', idx);
  const start = source.indexOf('[', eq);
  let depth = 0;
  let end = -1;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error(`Unclosed array for ${exportName}`);
  const arrSrc = source.slice(start, end);
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${arrSrc});`)();
}

function normalizeCat(cat) {
  const c = String(cat || '').trim().toLowerCase();
  if (!c) return 'other';
  return CAT_ALIASES[c] || c;
}

function parseEngineRegistry(source, junior) {
  const folder = junior ? 'engines-junior' : 'engines';
  const re = new RegExp(`(\\w+(?:_\\w+)*):\\s*\\(\\)\\s*=>\\s*import\\([^)]*${folder}/([^"?]+)`, 'g');
  const map = new Map();
  let m;
  while ((m = re.exec(source)) !== null) {
    map.set(m[1], `${folder}/${m[2]}`);
  }
  return map;
}

function extractEmbeddedSlugsFromConfig(source) {
  const re = /assets\/embedded\/([a-z0-9-]+)\//gi;
  const set = new Set();
  let m;
  while ((m = re.exec(source)) !== null) {
    set.add(m[1]);
  }
  return [...set];
}

function extractEmbeddedFromEngineSource(source) {
  const re = /embedded\/([a-z0-9-]+)\//gi;
  const set = new Set();
  let m;
  while ((m = re.exec(source)) !== null) {
    set.add(m[1]);
  }
  return [...set];
}

function extractImportPaths(source, baseDir) {
  const paths = new Set();
  const re = /from\s+["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    let rel = m[1].split('?')[0];
    if (rel.startsWith('.')) {
      const resolved = path.posix.normalize(path.posix.join(baseDir, rel));
      if (resolved.startsWith('assets/js/')) paths.add(resolved);
    }
  }
  return [...paths];
}

function manifestPathsForEmbeddedSlug(configSource, slug) {
  const re = new RegExp(`"([^"]*assets/embedded/${slug}/[^"]+)"\\s*:`, 'gi');
  const paths = new Set();
  let m;
  while ((m = re.exec(configSource)) !== null) {
    let p = m[1].replace(/^\.\//, '');
    if (p.startsWith('/')) p = p.slice(1);
    if (!p.startsWith('assets/')) {
      const idx = p.indexOf('assets/embedded/');
      if (idx >= 0) p = p.slice(idx);
    }
    paths.add(p);
  }
  // always try index.html
  paths.add(`assets/embedded/${slug}/index.html`);
  return [...paths];
}

function inferCatFromEmbeddedSlug(slug, modelByType) {
  for (const model of modelByType.values()) {
    if (model._embeddedSlugs?.includes(slug)) {
      return normalizeCat(model.cat);
    }
  }
  if (slug.includes('optics') || slug.includes('lens') || slug.includes('mirror')) return 'optics';
  if (slug.includes('circuit') || slug.includes('magnet') || slug.includes('em-') || slug.includes('current')) return 'electromagnetism';
  if (slug.includes('heat') || slug.includes('thermal') || slug.includes('evaporation')) return 'thermal';
  if (slug.includes('sound') || slug.includes('echo') || slug.includes('wave')) return 'wave';
  return 'mechanics';
}

async function mapPool(items, concurrency, worker) {
  const results = [];
  let idx = 0;
  async function run() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function relContentPath(stage, cat, slug) {
  return path.join('content', stage, cat, slug).split(path.sep).join('/');
}

async function main() {
  const opts = parseArgs(process.argv);
  const cookieHeader = readNetscapeCookies(opts.cookieFile);
  const stats = { files: 0, bytes: 0, failed: [] };
  const runCatalog = !opts.only || opts.only === 'catalog';
  const runEngines = !opts.only || opts.only === 'engines';
  const runEmbedded = !opts.only || opts.only === 'embedded';
  const runCore = !opts.only || opts.only === 'core';
  const runDeps = !opts.only || opts.only === 'deps';

  console.log(`crawl-shiguang-physics: ${opts.dryRun ? 'DRY-RUN' : 'download'} cookie=${opts.cookieFile}`);

  const catalogDir = path.join(OUT_ROOT, 'catalog');
  ensureDir(catalogDir);
  ensureDir(path.join(OUT_ROOT, 'content'));

  const [modelsJuniorSrc, modelsSeniorSrc, registryJuniorSrc, registrySeniorSrc, configSrc, enginesApiSrc] =
    await Promise.all([
      fetchText(physicsUrl('assets/js/core/models-junior.js'), cookieHeader),
      fetchText(physicsUrl('assets/js/core/models.js'), cookieHeader),
      fetchText(physicsUrl('assets/js/core/EngineRegistryJunior.js'), cookieHeader),
      fetchText(physicsUrl('assets/js/core/EngineRegistry.js'), cookieHeader),
      fetchText(physicsUrl('physics.config.js'), cookieHeader),
      fetchText(`${BASE_URL}/api/engines`, cookieHeader).catch(() => '[]'),
    ]);

  const modelsJunior = parseModelsExport(modelsJuniorSrc, 'physicsJuniorModels');
  const modelsSenior = parseModelsExport(modelsSeniorSrc, 'physicsModels');
  let enginesApi = [];
  try {
    enginesApi = JSON.parse(enginesApiSrc);
  } catch {
    enginesApi = [];
  }
  const engineStatus = new Map(enginesApi.map(e => [e.engine_type, e]));

  if (runCatalog) {
    writeJson(path.join(catalogDir, 'models-junior.json'), modelsJunior);
    writeJson(path.join(catalogDir, 'models-senior.json'), modelsSenior);
    writeJson(path.join(catalogDir, 'engines-api.json'), enginesApi);
    writeJson(path.join(catalogDir, 'taxonomy.json'), TAXONOMY);
  }

  const juniorEngineMap = parseEngineRegistry(registryJuniorSrc, true);
  const seniorEngineMap = parseEngineRegistry(registrySeniorSrc, false);
  const embeddedSlugs = extractEmbeddedSlugsFromConfig(configSrc);

  /** @type {Map<string, object>} */
  const modelByType = new Map();
  for (const m of modelsJunior) {
    modelByType.set(m.type, { ...m, stage: 'junior', cat: normalizeCat(m.cat) });
  }
  for (const m of modelsSenior) {
    modelByType.set(m.type, { ...m, stage: 'senior', cat: normalizeCat(m.cat) });
  }

  /** @type {Map<string, { stage, cat, slug, type, model, enginePath?, embeddedSlugs: string[] }>} */
  const items = new Map();

  function upsertItem(type, patch) {
    const model = modelByType.get(type);
    const stage = patch.stage || model?.stage || 'junior';
    const cat = patch.cat || model?.cat || 'other';
    const slug = type;
    const key = `${stage}/${cat}/${slug}`;
    const prev = items.get(key) || {
      stage,
      cat,
      slug,
      type,
      model: model || null,
      enginePath: null,
      embeddedSlugs: [],
      kind: [],
    };
    items.set(key, { ...prev, ...patch, kind: [...new Set([...(prev.kind || []), ...(patch.kind || [])])] });
  }

  for (const [type, enginePath] of juniorEngineMap) {
    upsertItem(type, { enginePath, stage: 'junior', kind: ['engine'] });
  }
  for (const [type, enginePath] of seniorEngineMap) {
    upsertItem(type, { enginePath, stage: 'senior', kind: ['engine'] });
  }

  // Resolve embedded slugs via engine source (for mapping)
  const engineFetchList = [];
  for (const item of items.values()) {
    if (item.enginePath) {
      engineFetchList.push({ item, url: physicsUrl(`assets/js/${item.enginePath}`) });
    }
  }

  await mapPool(engineFetchList, opts.concurrency, async ({ item, url }) => {
    if (opts.dryRun) return;
    try {
      const src = await fetchText(url, cookieHeader);
      const slugs = extractEmbeddedFromEngineSource(src);
      item.embeddedSlugs = slugs;
      if (slugs.length) item.kind = [...new Set([...item.kind, 'html'])];
      if (item.model) item.model._embeddedSlugs = slugs;
    } catch (err) {
      stats.failed.push({ url, error: String(err.message || err) });
    }
    if (opts.delayMs) await sleep(opts.delayMs);
  });

  // Standalone embedded dirs not yet linked
  for (const slug of embeddedSlugs) {
    let linked = false;
    for (const item of items.values()) {
      if (item.embeddedSlugs.includes(slug)) {
        linked = true;
        break;
      }
    }
    if (!linked) {
      const cat = inferCatFromEmbeddedSlug(slug, modelByType);
      const key = `junior/${cat}/embedded-${slug}`;
      items.set(key, {
        stage: 'junior',
        cat,
        slug: `embedded-${slug}`,
        type: slug,
        model: null,
        enginePath: null,
        embeddedSlugs: [slug],
        kind: ['html'],
      });
    }
  }

  /** @type {{ url: string, dest: string }[]} */
  const downloadQueue = [];

  if (runCore) {
    const coreSeed = [
      'assets/js/core/EngineRegistryJunior.js',
      'assets/js/core/EngineRegistry.js',
      'assets/js/core/BaseEngine.js',
    ];
    const coreQueue = [...coreSeed];
    const coreSeen = new Set(coreSeed);
    if (!opts.dryRun) {
      while (coreQueue.length) {
        const rel = coreQueue.shift();
        const url = physicsUrl(rel);
        let src;
        try {
          src = await fetchText(url, cookieHeader);
        } catch (err) {
          stats.failed.push({ url, error: String(err.message || err) });
          continue;
        }
        const baseDir = path.posix.dirname(rel);
        for (const imp of extractImportPaths(src, baseDir)) {
          if (imp.startsWith('assets/js/core/') && !coreSeen.has(imp)) {
            coreSeen.add(imp);
            coreQueue.push(imp);
          }
        }
        await sleep(opts.delayMs);
      }
    }
    for (const rel of opts.dryRun ? coreSeed : [...coreSeen]) {
      downloadQueue.push({
        url: physicsUrl(rel),
        dest: path.join(OUT_ROOT, 'content/_shared/js-core', path.basename(rel)),
      });
    }
  }

  for (const item of items.values()) {
    const baseDir = path.join(OUT_ROOT, relContentPath(item.stage, item.cat, item.slug));
    const meta = {
      slug: item.slug,
      type: item.type,
      stage: item.stage,
      cat: item.cat,
      catLabel: TAXONOMY[item.cat] || item.cat,
      title: item.model?.title || item.slug,
      formula: item.model?.formula || null,
      tag: item.model?.tag || null,
      id: item.model?.id ?? null,
      enginePath: item.enginePath,
      embeddedSlugs: item.embeddedSlugs,
      kind: item.kind,
      enabled: engineStatus.get(item.type)?.is_enabled !== 0,
      engineApi: engineStatus.get(item.type) || null,
    };

    if (!opts.dryRun && runCatalog) {
      writeJson(path.join(baseDir, 'meta.json'), meta);
    }

    if (item.enginePath && runEngines) {
      downloadQueue.push({
        url: physicsUrl(`assets/js/${item.enginePath}`),
        dest: path.join(baseDir, 'engine', path.basename(item.enginePath)),
        item,
      });
    }

    if (item.embeddedSlugs?.length && runEmbedded) {
      for (const embSlug of item.embeddedSlugs) {
        for (const rel of manifestPathsForEmbeddedSlug(configSrc, embSlug)) {
          downloadQueue.push({
            url: physicsUrl(rel),
            dest: path.join(baseDir, 'html', rel.replace(`assets/embedded/${embSlug}/`, '')),
            item,
          });
        }
      }
    }
  }

  // shared embedded assets
  const sharedEmbedded = [
    'assets/embedded/shared-touch-guard.css',
    'assets/embedded/shared-touch-guard.js',
  ];
  if (runEmbedded || runDeps) {
    for (const rel of sharedEmbedded) {
      if (configSrc.includes('shared-touch-guard') || runDeps) {
        downloadQueue.push({
          url: physicsUrl(rel),
          dest: path.join(OUT_ROOT, 'content/_shared/embedded-shared', path.basename(rel)),
        });
      }
    }
  }

  const toolkitFiles = [
    'assets/js/engines/MechanicsTeachingToolkit.js',
    'assets/js/engines/ModernPhysicsToolkit.js',
    'assets/js/engines/ThermalEngineToolkit.js',
  ];
  const babylonDeps = [
    'assets/js/core/BabylonSandboxEngine.js',
    'assets/js/core/BabylonCircuitBaseEngine.js',
    'assets/vendor/js/babylon.min.js',
  ];
  if (runDeps) {
    for (const rel of toolkitFiles) {
      downloadQueue.push({
        url: physicsUrl(rel),
        dest: path.join(OUT_ROOT, 'content/_shared/js-core', path.basename(rel)),
      });
    }
    for (const rel of babylonDeps) {
      const base = path.basename(rel);
      const dest = base === 'babylon.min.js'
        ? path.join(OUT_ROOT, 'content/_shared/vendor/js', base)
        : path.join(OUT_ROOT, 'content/_shared/js-core', base);
      downloadQueue.push({ url: physicsUrl(rel), dest });
    }
  }

  console.log(`items: ${items.size}, download queue: ${downloadQueue.length}`);

  if (opts.dryRun) {
    const byStage = {};
    for (const item of items.values()) {
      byStage[item.stage] = byStage[item.stage] || {};
      byStage[item.stage][item.cat] = byStage[item.stage][item.cat] || [];
      byStage[item.stage][item.cat].push(item.slug);
    }
    console.log(JSON.stringify({ byStage, queue: downloadQueue.length }, null, 2));
    return;
  }

  await mapPool(downloadQueue, opts.concurrency, async (job) => {
    try {
      const buf = await fetchBuffer(job.url, cookieHeader);
      ensureDir(path.dirname(job.dest));
      fs.writeFileSync(job.dest, buf);
      stats.files++;
      stats.bytes += buf.length;
    } catch (err) {
      stats.failed.push({ url: job.url, dest: job.dest, error: String(err.message || err) });
    }
    if (opts.delayMs) await sleep(opts.delayMs);
  });

  const byStage = {};
  const manifestItems = [];
  for (const item of items.values()) {
    byStage[item.stage] = byStage[item.stage] || {};
    byStage[item.stage][item.cat] = byStage[item.stage][item.cat] || [];
    byStage[item.stage][item.cat].push(item.slug);
    manifestItems.push({
      slug: item.slug,
      stage: item.stage,
      cat: item.cat,
      catLabel: TAXONOMY[item.cat] || item.cat,
      title: item.model?.title || item.slug,
      type: item.type,
      kind: item.kind.join('+') || 'unknown',
      path: relContentPath(item.stage, item.cat, item.slug),
    });
  }

  writeJson(path.join(OUT_ROOT, 'manifest.json'), {
    source: `${BASE_URL}${PHYSICS_PREFIX}`,
    crawledAt: new Date().toISOString(),
    taxonomy: TAXONOMY,
    byStage,
    items: manifestItems.sort((a, b) => a.path.localeCompare(b.path)),
    stats,
  });

  console.log(`done: files=${stats.files} bytes=${stats.bytes} failed=${stats.failed.length}`);
  if (stats.failed.length) {
    console.warn('failures:', stats.failed.slice(0, 10));
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
