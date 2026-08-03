const fs = require('fs');
const path = require('path');
const {
  getRepoRoot,
  getAgentDir,
  getGamesRoot,
  getViewerRoot,
  getAgentOutputRoot,
  getStaticGraphRoot,
} = require('../../packages/shared/paths');
const {
  getSharedRoot,
  getGamesPresetRoot,
  getGamesLegacyRoot,
  getGamesGeneratedRoot,
  getDatasetHtmlSamplesRoot,
  getPackagesRoot,
  getPackageGamePath,
  resolveFileWithFallback,
} = require('../../packages/shared/data-paths');
const { resolvePackageId } = require('../../packages/shared/package-layout');

const REPO_ROOT = getRepoRoot();
const AGENT_DIR = getAgentDir();
const GAMES_ROOT = getGamesRoot();
const VIEWER_ROOT = getViewerRoot();
const GRAPH_ROOT = getStaticGraphRoot();
const PACKAGES_ROOT = getPackagesRoot();
const OUTPUT_ROOT = getAgentOutputRoot();
const SHARED_ROOT = getSharedRoot();
const PRESET_ROOT = getGamesPresetRoot();
const LEGACY_ROOT = getGamesLegacyRoot();
const GENERATED_ROOT = getGamesGeneratedRoot();
const HTML_SAMPLES_ROOT = getDatasetHtmlSamplesRoot();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const UI_PAGES = path.join(AGENT_DIR, 'apps/web', 'ui', 'pages');
const STATIC_MAP = {
  '/': path.join(UI_PAGES, 'platform.html'),
  '/index.html': path.join(UI_PAGES, 'platform.html'),
  '/teacher.html': path.join(UI_PAGES, 'teacher.html'),
  '/teacher-login.html': path.join(UI_PAGES, 'teacher-login.html'),
  '/student.html': path.join(UI_PAGES, 'student.html'),
  '/student-join.html': path.join(UI_PAGES, 'student-join.html'),
  '/student-play.html': path.join(UI_PAGES, 'student-play.html'),
  '/strategy-summary-demo.html': path.join(UI_PAGES, 'strategy-summary-demo.html'),
  '/graph.html': path.join(GRAPH_ROOT, 'graph.html'),
};

const LEGACY_REDIRECTS = {
  '/generate.html': '/teacher.html?tab=agents',
  '/judge.html': '/teacher.html?tab=sessions',
};

function decodeUrlPath(url) {
  try {
    return decodeURIComponent(url.split('?')[0]);
  } catch {
    return url.split('?')[0];
  }
}

function firstExistingFile(...candidates) {
  for (const file of candidates) {
    if (file && fs.existsSync(file)) return file;
  }
  return candidates.find(Boolean) || null;
}

function resolvePackagesStatic(rel) {
  const normalized = rel.replace(/^\//, '');
  const parts = normalized.split('/');
  if (parts.length >= 2 && parts[1] === 'game.html') {
    return firstExistingFile(getPackageGamePath(parts[0]));
  }
  return firstExistingFile(path.join(PACKAGES_ROOT, ...parts));
}

function resolvePackagesPreview(rel) {
  const normalized = rel.replace(/^\//, '').replace(/\/index\.html$/i, '');
  const packageId = resolvePackageId(normalized.split('/')[0]);
  return firstExistingFile(
    path.join(PACKAGES_ROOT, packageId, 'index.html'),
    path.join(PACKAGES_ROOT, packageId, rel),
  );
}

function resolveOutputPreview(rel) {
  const normalized = rel.replace(/^\//, '');
  const packageId = resolvePackageId(normalized.split('/')[0]);
  return firstExistingFile(
    path.join(PACKAGES_ROOT, packageId, 'index.html'),
    path.join(PACKAGES_ROOT, packageId, normalized),
    path.join(OUTPUT_ROOT, normalized),
  );
}

function resolveHtmlSamplesFile(rel) {
  if (rel.startsWith('generated/')) {
    const id = rel.slice('generated/'.length).replace(/\.html$/i, '');
    return firstExistingFile(
      getPackageGamePath(id),
      path.join(HTML_SAMPLES_ROOT, rel),
      path.join(AGENT_DIR, 'data/html-samples', rel),
    );
  }
  return firstExistingFile(
    path.join(HTML_SAMPLES_ROOT, rel),
    path.join(AGENT_DIR, 'data/html-samples', rel),
  );
}

function resolveSamplesFile(rel) {
  const normalized = rel.replace(/^\//, '');
  if (normalized === '电容纪元.html') {
    return firstExistingFile(getPackageGamePath('capacitor-era'), path.join(PRESET_ROOT, normalized));
  }
  if (normalized.startsWith('generated/')) {
    const tail = normalized.slice('generated/'.length);
    return firstExistingFile(
      path.join(GENERATED_ROOT, tail),
      path.join(PRESET_ROOT, 'generated', tail),
    );
  }
  return firstExistingFile(path.join(PRESET_ROOT, normalized));
}

function resolveAssetFile(url) {
  if (url.startsWith('/static/ui/')) {
    return path.join(AGENT_DIR, 'apps/web', 'ui', url.slice('/static/ui/'.length));
  }
  if (url.startsWith('/static/shared/')) {
    const rel = url.slice('/static/shared/'.length);
    return firstExistingFile(path.join(SHARED_ROOT, rel));
  }
  if (url.startsWith('/static/packages/')) {
    return resolvePackagesStatic(url.slice('/static/packages/'.length));
  }
  if (url.startsWith('/static/samples/')) {
    return resolveSamplesFile(url.slice('/static/samples/'.length));
  }
  if (url.startsWith('/static/legacy-samples/')) {
    const rel = url.slice('/static/legacy-samples/'.length);
    return firstExistingFile(
      path.join(LEGACY_ROOT, rel),
      path.join(AGENT_DIR, 'legacy-samples', rel),
    );
  }
  if (url.startsWith('/static/html-samples/')) {
    return resolveHtmlSamplesFile(url.slice('/static/html-samples/'.length));
  }
  if (url.startsWith('/static/viewer/js/')) {
    const rel = url.slice('/static/viewer/js/'.length);
    const viewerFile = path.join(VIEWER_ROOT, 'js', rel);
    if (fs.existsSync(viewerFile)) return viewerFile;
    const sharedFallback = resolveFileWithFallback(
      `packages/shared/${rel}`,
      `apps/web/viewer/js/${rel}`,
    );
    if (sharedFallback) return sharedFallback;
    return viewerFile;
  }
  if (url.startsWith('/static/viewer/')) {
    return path.join(VIEWER_ROOT, url.slice('/static/viewer/'.length));
  }
  if (url.startsWith('/static/generate/export/')) {
    return path.join(AGENT_DIR, 'packages', 'generate', 'export', url.slice('/static/generate/export/'.length));
  }
  if (url.startsWith('/packages/')) {
    return resolvePackagesPreview(url.slice('/packages/'.length));
  }
  if (url.startsWith('/output/')) {
    return resolveOutputPreview(url.slice('/output/'.length));
  }
  if (url.startsWith('/games/') && GAMES_ROOT) {
    const rel = url.slice('/games/'.length).replace(/^\//, '') || 'index.html';
    return path.join(GAMES_ROOT, rel);
  }
  return null;
}

function isPathAllowed(file) {
  const resolved = path.resolve(file);
  const allowed = [
    REPO_ROOT,
    AGENT_DIR,
    path.join(AGENT_DIR, 'packages'),
    VIEWER_ROOT,
    GRAPH_ROOT,
    PACKAGES_ROOT,
    OUTPUT_ROOT,
    SHARED_ROOT,
    PRESET_ROOT,
    LEGACY_ROOT,
    GENERATED_ROOT,
    HTML_SAMPLES_ROOT,
  ];
  if (GAMES_ROOT) allowed.push(GAMES_ROOT);
  return allowed.some(root => {
    const r = path.resolve(root);
    return resolved === r || resolved.startsWith(r + path.sep);
  });
}

function serveAsset(req, res) {
  const url = decodeUrlPath(req.url);
  const file = resolveAssetFile(url);
  if (!file) return false;
  if (!isPathAllowed(file)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
  return true;
}

function serveStatic(req, res) {
  const url = req.url.split('?')[0];
  const redirect = LEGACY_REDIRECTS[url];
  if (redirect) {
    res.writeHead(302, { Location: redirect });
    res.end();
    return;
  }
  const file = STATIC_MAP[url];
  const root = path.resolve(AGENT_DIR);
  if (!file || !path.resolve(file).startsWith(root)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = {
  REPO_ROOT,
  OUTPUT_ROOT: PACKAGES_ROOT,
  PACKAGES_ROOT,
  STATIC_MAP,
  cors,
  serveAsset,
  serveStatic,
  decodeUrlPath,
  resolveAssetFile,
};
