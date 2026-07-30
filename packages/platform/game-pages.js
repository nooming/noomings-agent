const fs = require('fs');
const path = require('path');
const { getPackagesRoot, getPackageGamePath } = require('../shared/data-paths');
const { packagePlayUrl } = require('../shared/package-layout');
const { findCatalogRefsForPlayUrl } = require('./catalog');

const SKIP_DIRS = new Set(['backups', 'reports']);

function listGamePages() {
  const root = getPackagesRoot();
  if (!fs.existsSync(root)) return [];

  const items = [];
  for (const name of fs.readdirSync(root)) {
    const abs = path.join(root, name);
    if (!fs.statSync(abs).isDirectory()) continue;
    if (SKIP_DIRS.has(name)) continue;
    const game = path.join(abs, 'game.html');
    if (!fs.existsSync(game)) continue;
    const st = fs.statSync(game);
    items.push({
      url: packagePlayUrl(name),
      label: name,
      mtime: st.mtimeMs,
    });
  }
  items.sort((a, b) => b.mtime - a.mtime);
  return items;
}

function urlToAbsPath(url) {
  const u = String(url || '').trim();
  if (u.startsWith('/static/packages/')) {
    const rel = u.slice('/static/packages/'.length);
    const parts = rel.split('/');
    if (parts.length >= 2 && parts[1] === 'game.html') {
      return getPackageGamePath(parts[0]);
    }
  }
  return null;
}

function isProtectedPlayUrl(url) {
  const u = String(url || '').trim();
  if (u.includes('/static/html-samples/')) return true;
  if (u.includes('/static/packages/capacitor-era/')) return true;
  if (u.includes('电容纪元.html')) return true;
  const abs = urlToAbsPath(u);
  if (!abs) return false;
  const pkgId = path.basename(path.dirname(abs));
  const manifestPath = path.join(getPackagesRoot(), 'manifest.json');
  if (!fs.existsSync(manifestPath)) return false;
  try {
    const { samples = [] } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return samples.some(s => s.id === pkgId && s.id !== 'capacitor-plate');
  } catch {
    return false;
  }
}

function deleteGamePage(url, { force = false } = {}) {
  const u = String(url || '').trim();
  if (!u) return { ok: false, error: 'url_required' };
  if (isProtectedPlayUrl(u)) {
    return { ok: false, error: u.includes('html-samples') ? 'protected_html_sample' : 'protected_preset' };
  }
  const abs = urlToAbsPath(u);
  if (!abs) return { ok: false, error: 'invalid_url' };
  const referencedBy = findCatalogRefsForPlayUrl(u);
  if (referencedBy.length && !force) {
    return { ok: false, error: 'referenced_by_catalog', referencedBy };
  }
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
  return { ok: true, url: u, referencedBy };
}

module.exports = { listGamePages, deleteGamePage, isProtectedPlayUrl, urlToAbsPath };
