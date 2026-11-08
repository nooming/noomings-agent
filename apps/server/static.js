const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
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

/**
 * Every HTTP-visible asset root. Keep this list narrow: serving the repository
 * root (or AGENT_DIR) would expose .env, runtime traces, source and tests.
 */
const UI_ROOT = path.join(AGENT_DIR, 'apps/web/ui');
const ICONS_ROOT = path.join(AGENT_DIR, 'apps/web/icons');
const GENERATE_EXPORT_ROOT = path.join(AGENT_DIR, 'packages/generate/export');
const STATIC_ASSET_ROOTS = Object.freeze([
  UI_ROOT,
  ICONS_ROOT,
  VIEWER_ROOT,
  GRAPH_ROOT,
  PACKAGES_ROOT,
  OUTPUT_ROOT,
  SHARED_ROOT,
  PRESET_ROOT,
  LEGACY_ROOT,
  GENERATED_ROOT,
  HTML_SAMPLES_ROOT,
  GENERATE_EXPORT_ROOT,
  ...(GAMES_ROOT ? [GAMES_ROOT] : []),
].map((root) => path.resolve(root)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
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
  '/student-survey.html': path.join(UI_PAGES, 'student-survey.html'),
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
  // deprecated URL alias /static/html-samples/* → packages (keep for old links / tests)
  if (rel.startsWith('generated/')) {
    const id = rel.slice('generated/'.length).replace(/\.html$/i, '');
    return firstExistingFile(
      getPackageGamePath(id),
      path.join(HTML_SAMPLES_ROOT, rel),
    );
  }
  return firstExistingFile(
    path.join(HTML_SAMPLES_ROOT, rel),
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
  if (url.startsWith('/icons/')) {
    return path.join(AGENT_DIR, 'apps/web', 'icons', url.slice('/icons/'.length));
  }
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
    // deprecated alias; disk truth is data/games/legacy (LEGACY_ROOT)
    const rel = url.slice('/static/legacy-samples/'.length);
    return firstExistingFile(
      path.join(LEGACY_ROOT, rel),
    );
  }
  if (url.startsWith('/static/html-samples/')) {
    // deprecated alias → packages / dataset html-samples
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
    // deprecated preview alias → packages (kept for graphViewUrl / old bookmarks)
    return resolveOutputPreview(url.slice('/output/'.length));
  }
  if (url.startsWith('/games/') && GAMES_ROOT) {
    const rel = url.slice('/games/'.length).replace(/^\//, '') || 'index.html';
    return path.join(GAMES_ROOT, rel);
  }
  return null;
}

/** Resolve symlinks as far as possible; non-existent paths fall back to a resolved parent + basename. */
function canonicalPath(file) {
  const resolved = path.resolve(file);
  try {
    return fs.realpathSync(resolved);
  } catch {
    try {
      return path.join(fs.realpathSync(path.dirname(resolved)), path.basename(resolved));
    } catch {
      return resolved;
    }
  }
}

function isPathAllowed(file) {
  const resolved = canonicalPath(file);
  return STATIC_ASSET_ROOTS.some((root) => {
    const canonicalRoot = canonicalPath(root);
    return resolved === canonicalRoot || resolved.startsWith(canonicalRoot + path.sep);
  });
}

/** Reject encoded/raw traversal before path.join can normalize it away. */
function hasTraversalSegment(urlPath) {
  const raw = String(urlPath || '');
  if (raw.includes('\0')) return true;
  return raw.split(/[\\/]+/).some((segment) => segment === '..');
}

/** Long-cache immutable vendor JS: /static/.../vendor/*.js and packages/vendor. */
function isVendorStaticJs(url, file) {
  if (!/\.js$/i.test(file || '')) return false;
  const u = String(url || '').split('?')[0];
  if (/^\/static\/(?:.+\/)?vendor\/[^/]+\.js$/i.test(u)) return true;
  const norm = String(file || '').replace(/\\/g, '/');
  return /\/(?:packages\/)?vendor\/[^/]+\.js$/i.test(norm)
    || /\/viewer\/vendor\/[^/]+\.js$/i.test(norm);
}

function contentHeaders(url, file) {
  const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' };
  if (isVendorStaticJs(url, file)) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  }
  return headers;
}

function etagFor(stat) {
  return `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}

function isCompressible(file) {
  return /\.(?:html|js|css|json|svg|webmanifest)$/i.test(file);
}

/** Shared GET file sender: conditional ETag, revalidation and gzip for text assets. */
function sendFile(req, res, file, url) {
  fs.stat(file, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const etag = etagFor(stat);
    const headers = contentHeaders(url, file);
    headers.ETag = etag;
    if (headers['Cache-Control'] == null) {
      headers['Cache-Control'] = /\.html$/i.test(file)
        ? 'no-cache'
        : 'public, max-age=300, must-revalidate';
    }
    if (isCompressible(file)) headers.Vary = 'Accept-Encoding';
    const inm = req.headers['if-none-match'];
    if (inm && String(inm).split(',').map((s) => s.trim()).includes(etag)) {
      res.writeHead(304, headers);
      res.end();
      return;
    }

    fs.readFile(file, (readErr, data) => {
      if (readErr) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const acceptsGzip = /\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''));
      if (!acceptsGzip || !isCompressible(file) || data.length < 1024) {
        headers['Content-Length'] = String(data.length);
        res.writeHead(200, headers);
        res.end(data);
        return;
      }
      zlib.gzip(data, (gzipErr, gz) => {
        if (gzipErr) {
          headers['Content-Length'] = String(data.length);
          res.writeHead(200, headers);
          res.end(data);
          return;
        }
        headers['Content-Encoding'] = 'gzip';
        headers['Vary'] = 'Accept-Encoding';
        headers['Content-Length'] = String(gz.length);
        res.writeHead(200, headers);
        res.end(gz);
      });
    });
  });
}

function serveAsset(req, res) {
  const url = decodeUrlPath(req.url);
  if (hasTraversalSegment(url)) {
    res.writeHead(400);
    res.end('Bad request');
    return true;
  }
  const file = resolveAssetFile(url);
  if (!file) return false;
  if (!isPathAllowed(file)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }
  sendFile(req, res, file, url);
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
  sendFile(req, res, file, url);
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
  STATIC_ASSET_ROOTS,
  STATIC_MAP,
  cors,
  serveAsset,
  serveStatic,
  decodeUrlPath,
  hasTraversalSegment,
  canonicalPath,
  isPathAllowed,
  resolveAssetFile,
};
