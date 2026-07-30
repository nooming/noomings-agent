/** Shared helpers for shiguang offline playback generation. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const OUT_ROOT = path.join(ROOT, 'resources/shiguangtongxue');
const CONTENT_ROOT = path.join(OUT_ROOT, 'content');
const SHARED_CORE = path.join(CONTENT_ROOT, '_shared/js-core');
const SHARED_EMBEDDED = path.join(CONTENT_ROOT, '_shared/embedded-shared');
const SHARED_VENDOR = path.join(CONTENT_ROOT, '_shared/vendor/js');
const BASE_URL = 'https://www.shiguangtongxue.cn/subjects/physics/';
const SERVE_PORT = 8765;

const SHARED_CORE_FILES = [
  'BaseEngine.js',
  'BabylonSandboxEngine.js',
  'BabylonCircuitBaseEngine.js',
];

const TOOLKIT_FILES = [
  'MechanicsTeachingToolkit.js',
  'ModernPhysicsToolkit.js',
  'ThermalEngineToolkit.js',
];

const SHARED_EMBEDDED_FILES = [
  'shared-touch-guard.css',
  'shared-touch-guard.js',
];

const SHARED_VENDOR_FILES = [
  { rel: 'assets/vendor/js/babylon.min.js', name: 'babylon.min.js' },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) return false;
  ensureDir(path.dirname(dest));
  fs.writeFileSync(dest, fs.readFileSync(src));
  return true;
}

async function fetchToFile(url, dest) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'agent-shiguang-playback/1.0' },
      redirect: 'follow',
    });
    if (!res.ok) return false;
    ensureDir(path.dirname(dest));
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

async function ensureSharedDeps() {
  ensureDir(SHARED_CORE);
  ensureDir(SHARED_EMBEDDED);
  ensureDir(SHARED_VENDOR);

  for (const name of SHARED_CORE_FILES) {
    const dest = path.join(SHARED_CORE, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 100) continue;
    await fetchToFile(`${BASE_URL}assets/js/core/${name}`, dest);
  }

  for (const name of TOOLKIT_FILES) {
    const dest = path.join(SHARED_CORE, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 100) continue;
    const folder = name === 'ThermalEngineToolkit.js' ? 'engines' : 'engines';
    await fetchToFile(`${BASE_URL}assets/js/${folder}/${name}`, dest);
  }

  for (const name of SHARED_EMBEDDED_FILES) {
    const dest = path.join(SHARED_EMBEDDED, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 10) continue;
    await fetchToFile(`${BASE_URL}assets/embedded/${name}`, dest);
  }

  for (const { rel, name } of SHARED_VENDOR_FILES) {
    const dest = path.join(SHARED_VENDOR, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) continue;
    await fetchToFile(`${BASE_URL}${rel}`, dest);
  }
}

function walkMetaFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === '_shared') continue;
      walkMetaFiles(p, acc);
    } else if (ent.name === 'meta.json') {
      acc.push(p);
    }
  }
  return acc;
}

function relFromContent(absPath) {
  return path.relative(CONTENT_ROOT, absPath).split(path.sep).join('/');
}

function relFromServeRoot(itemPath) {
  return `content/${relFromContent(itemPath)}`;
}

function itemDir(metaPath) {
  return path.dirname(metaPath);
}

function hasHtmlIndex(dir) {
  return fs.existsSync(path.join(dir, 'html', 'index.html'));
}

function findEngineFile(dir) {
  const engDir = path.join(dir, 'engine');
  if (!fs.existsSync(engDir)) return null;
  const files = fs.readdirSync(engDir).filter(f => f.endsWith('Engine.js'));
  return files[0] || null;
}

function readEngineSource(dir) {
  const f = findEngineFile(dir);
  if (!f) return '';
  return fs.readFileSync(path.join(dir, 'engine', f), 'utf8');
}

function extractEmbeddedRefs(engineSrc) {
  const refs = [];
  const folderRe = /embedded\/([a-z0-9-]+)\/index\.html/gi;
  let m;
  while ((m = folderRe.exec(engineSrc)) !== null) {
    refs.push({ type: 'folder', slug: m[1] });
  }
  const fileRe = /embedded\/([a-z0-9-]+\.html)/gi;
  while ((m = fileRe.exec(engineSrc)) !== null) {
    if (!refs.some(r => r.type === 'file' && r.slug === m[1])) {
      refs.push({ type: 'file', slug: m[1] });
    }
  }
  return refs;
}

function engineNeedsToolkit(engineSrc) {
  return /MechanicsTeachingToolkit/.test(engineSrc)
    || /ThermalEngineToolkit/.test(engineSrc);
}

function toolkitFilesForEngine(engineSrc) {
  const files = [];
  if (/MechanicsTeachingToolkit/.test(engineSrc)) {
    files.push('MechanicsTeachingToolkit.js', 'ModernPhysicsToolkit.js');
  }
  if (/ThermalEngineToolkit/.test(engineSrc)) {
    files.push('ThermalEngineToolkit.js');
  }
  return files;
}

function extractCoreImports(engineSrc) {
  const files = new Set(['BaseEngine.js']);
  const re = /\.\.\/core\/([A-Za-z0-9_]+\.js)/g;
  let m;
  while ((m = re.exec(engineSrc || '')) !== null) {
    files.add(m[1]);
  }
  return [...files];
}

function patchBabylonVendorPath(content) {
  return content.replace(
    /new URL\(["']\.\.\/\.\.\/vendor\/js\/babylon\.min\.js[^"']*["'],\s*import\.meta\.url\)/g,
    'new URL("../../../../_shared/vendor/js/babylon.min.js", import.meta.url)',
  );
}

function copyCoreDeps(itemPath, engineSrc) {
  const imports = extractCoreImports(engineSrc);
  let copied = 0;
  for (const name of imports) {
    const src = path.join(SHARED_CORE, name);
    const dest = path.join(itemPath, 'core', name);
    if (!fs.existsSync(src)) continue;
    ensureDir(path.dirname(dest));
    if (name === 'BabylonSandboxEngine.js') {
      const content = patchBabylonVendorPath(fs.readFileSync(src, 'utf8'));
      fs.writeFileSync(dest, content, 'utf8');
      copied++;
    } else if (copyFile(src, dest)) {
      copied++;
    }
  }
  return copied > 0;
}

function copyCoreBaseEngine(itemPath) {
  return copyCoreDeps(itemPath, '');
}

function copyToolkitsToEngine(itemPath, engineSrc) {
  const engDir = path.join(itemPath, 'engine');
  for (const name of toolkitFilesForEngine(engineSrc)) {
    copyFile(path.join(SHARED_CORE, name), path.join(engDir, name));
  }
}

async function fetchEmbeddedAssets(itemPath, refs, meta) {
  for (const ref of refs) {
    if (ref.type === 'folder') {
      const htmlDest = path.join(itemPath, 'html', 'index.html');
      const embMirror = path.join(itemPath, 'embedded', ref.slug);
      if (hasHtmlIndex(itemPath)) {
        mirrorHtmlToEmbedded(itemPath, ref.slug);
        continue;
      }
      if (fs.existsSync(htmlDest)) continue;
      const indexUrl = `${BASE_URL}assets/embedded/${ref.slug}/index.html`;
      await fetchToFile(indexUrl, htmlDest);
      mirrorHtmlToEmbedded(itemPath, ref.slug);
    } else if (ref.type === 'file') {
      const dest = path.join(itemPath, 'embedded', ref.slug);
      if (fs.existsSync(dest)) continue;
      await fetchToFile(`${BASE_URL}assets/embedded/${ref.slug}`, dest);
    }
  }
}

function mirrorHtmlToEmbedded(itemPath, embSlug) {
  const htmlDir = path.join(itemPath, 'html');
  const embDir = path.join(itemPath, 'embedded', embSlug);
  if (!fs.existsSync(htmlDir)) return;
  ensureDir(embDir);
  copyDirRecursive(htmlDir, embDir);
}

function copyDirRecursive(src, dest) {
  ensureDir(dest);
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDirRecursive(s, d);
    else copyFile(s, d);
  }
}

function fixEmbeddedHtmlPaths(itemPath) {
  const htmlDir = path.join(itemPath, 'html');
  if (!fs.existsSync(htmlDir)) return 0;
  let fixed = 0;
  const sharedRel = '../../../_shared/embedded-shared';
  walkHtmlFiles(htmlDir, file => {
    let src = fs.readFileSync(file, 'utf8');
    const orig = src;
    src = src.replace(/href=["']\.\.\/shared-touch-guard\.css[^"']*["']/g,
      `href="${sharedRel}/shared-touch-guard.css"`);
    src = src.replace(/src=["']\.\.\/shared-touch-guard\.js[^"']*["']/g,
      `src="${sharedRel}/shared-touch-guard.js"`);
    src = src.replace(/href=["']\.\.\/shared-touch-guard\.css["']/g,
      `href="${sharedRel}/shared-touch-guard.css"`);
    src = src.replace(/src=["']\.\.\/shared-touch-guard\.js["']/g,
      `src="${sharedRel}/shared-touch-guard.js"`);
    if (src !== orig) {
      fs.writeFileSync(file, src, 'utf8');
      fixed++;
    }
  });
  return fixed;
}

function walkHtmlFiles(dir, fn) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkHtmlFiles(p, fn);
    else if (/\.html?$/i.test(ent.name)) fn(p);
  }
}

function buildModelFromMeta(meta) {
  return {
    id: meta.id,
    type: meta.type,
    title: meta.title,
    formula: meta.formula,
    tag: meta.tag,
    cat: meta.cat,
  };
}

function generateRedirectIndex(itemPath, meta, target) {
  const title = meta.title || meta.slug;
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0; url=${target}">
  <title>${title} · 拾光物理</title>
  <script>location.replace(${JSON.stringify(target)});</script>
</head>
<body>
  <p>正在打开「${title}」… <a href="${target}">点此进入</a></p>
</body>
</html>
`;
  fs.writeFileSync(path.join(itemPath, 'index.html'), html, 'utf8');
}

function generateEngineShell(itemPath, meta) {
  const engineFile = findEngineFile(itemPath);
  if (!engineFile) return false;
  const title = meta.title || meta.slug;
  const model = buildModelFromMeta(meta);
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} · 拾光物理离线预览</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; font-family: "Noto Sans SC", system-ui, sans-serif; background: #0f172a; color: #f8fafc; }
    #app { display: flex; height: 100vh; overflow: hidden; }
    #simCanvasArea { flex: 1; min-width: 0; position: relative; background: #111827; }
    #simCanvas { display: block; width: 100%; height: 100%; touch-action: none; }
    #controlsPanel { width: min(320px, 38vw); overflow-y: auto; background: #f8fafc; color: #0f172a; padding: 12px; border-left: 1px solid #e2e8f0; }
    #loadError { display: none; padding: 24px; color: #fca5a5; }
    @media (max-width: 768px) {
      #app { flex-direction: column; }
      #controlsPanel { width: 100%; max-height: 42vh; border-left: none; border-top: 1px solid #e2e8f0; }
    }
  </style>
</head>
<body>
  <div id="app">
    <div id="simCanvasArea">
      <canvas id="simCanvas"></canvas>
      <div id="loadError"></div>
    </div>
    <div id="controlsPanel"></div>
  </div>
  <script type="module">
    const model = ${JSON.stringify(model)};
    const canvas = document.getElementById('simCanvas');
    const controls = document.getElementById('controlsPanel');
    const errEl = document.getElementById('loadError');

    function resizeCanvas() {
      const area = document.getElementById('simCanvasArea');
      const dpr = window.devicePixelRatio || 1;
      const w = area.clientWidth;
      const h = area.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function showError(msg) {
      errEl.style.display = 'block';
      errEl.textContent = msg;
      console.error(msg);
    }

    try {
      const EngineMod = await import('./engine/${engineFile}');
      const Engine = EngineMod.default;
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);

      const engine = new Engine(canvas, controls, model);
      let last = performance.now();
      function loop(now) {
        const dt = Math.min(50, now - last);
        last = now;
        try {
          if (typeof engine.update === 'function') engine.update(dt);
          if (typeof engine.draw === 'function') engine.draw();
        } catch (e) {
          showError('仿真运行错误: ' + (e?.message || e));
          return;
        }
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    } catch (e) {
      showError('引擎加载失败: ' + (e?.message || e));
    }
  </script>
</body>
</html>
`;
  fs.writeFileSync(path.join(itemPath, 'index.html'), html, 'utf8');
  return true;
}

function generateOpenCmd(itemPath, meta) {
  const url = `http://localhost:${SERVE_PORT}/${relFromServeRoot(itemPath)}/`;
  const cmd = `@echo off
cd /d "%~dp0..\\..\\..\\.."
start "" "${url}"
npx -y serve . -l ${SERVE_PORT}
`;
  fs.writeFileSync(path.join(itemPath, 'open.cmd'), cmd, 'utf8');
}

function playModeForItem(itemPath, meta, engineSrc) {
  if (hasHtmlIndex(itemPath)) {
    return { mode: 'embedded', entry: 'html/index.html', status: 'ready' };
  }
  const refs = extractEmbeddedRefs(engineSrc);
  if (refs.length && /resolveEmbeddedUrl/.test(engineSrc)) {
    const hasEmb = refs.some(r =>
      r.type === 'file'
        ? fs.existsSync(path.join(itemPath, 'embedded', r.slug))
        : fs.existsSync(path.join(itemPath, 'embedded', r.slug, 'index.html'))
        || hasHtmlIndex(itemPath));
    if (hasEmb) {
      return { mode: 'engine-iframe', entry: 'index.html', status: 'ready' };
    }
    return { mode: 'engine-iframe', entry: 'index.html', status: 'missing-embedded' };
  }
  if (findEngineFile(itemPath)) {
    if (/BabylonSandboxEngine/.test(engineSrc)) {
      return { mode: 'engine-babylon', entry: 'index.html', status: 'ready' };
    }
    return { mode: 'engine', entry: 'index.html', status: 'ready' };
  }
  return { mode: 'unknown', entry: null, status: 'no-content' };
}

module.exports = {
  ROOT,
  OUT_ROOT,
  CONTENT_ROOT,
  SHARED_CORE,
  SHARED_EMBEDDED,
  SHARED_VENDOR,
  SERVE_PORT,
  ensureDir,
  readJson,
  writeJson,
  ensureSharedDeps,
  walkMetaFiles,
  itemDir,
  hasHtmlIndex,
  findEngineFile,
  readEngineSource,
  extractEmbeddedRefs,
  extractCoreImports,
  copyCoreDeps,
  copyCoreBaseEngine,
  copyToolkitsToEngine,
  fetchEmbeddedAssets,
  mirrorHtmlToEmbedded,
  fixEmbeddedHtmlPaths,
  generateRedirectIndex,
  generateEngineShell,
  generateOpenCmd,
  playModeForItem,
  buildModelFromMeta,
  relFromContent,
  relFromServeRoot,
};
