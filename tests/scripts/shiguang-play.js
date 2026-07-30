/** CLI: node tests/scripts/shiguang-play.js [slug|stage/cat/slug] [--port 8765] */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const lib = require('./shiguang-playback-lib');

const { OUT_ROOT, SERVE_PORT, readJson } = lib;

function parseArgs(argv) {
  const opts = { slug: null, port: SERVE_PORT, catalog: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--catalog') opts.catalog = true;
    else if (a === '--port') opts.port = Number(argv[++i]) || SERVE_PORT;
    else if (!a.startsWith('-')) opts.slug = a;
  }
  return opts;
}

function resolveItemPath(slug) {
  const manifestPath = path.join(OUT_ROOT, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('manifest.json not found — run npm run generate-shiguang-playback first');
  }
  const manifest = readJson(manifestPath);
  const needle = slug.replace(/\\/g, '/').replace(/^content\//, '');
  let item = manifest.items?.find(it =>
    it.slug === needle
    || it.path === needle
    || it.path.endsWith('/' + needle)
  );
  if (!item) {
    item = manifest.items?.find(it => it.path.includes(needle));
  }
  if (!item) throw new Error(`experiment not found: ${slug}`);
  return item;
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? 'cmd' : 'open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'win32') {
    spawn(cmd, args, { detached: true, stdio: 'ignore', shell: true }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

function main() {
  const opts = parseArgs(process.argv);
  const rel = opts.catalog
    ? 'catalog/play.html'
    : `content/${resolveItemPath(opts.slug || 'atwood').path}/`;
  const url = `http://localhost:${opts.port}/${rel}`;

  console.log(`Serving ${OUT_ROOT}`);
  console.log(`Opening ${url}`);

  setTimeout(() => openBrowser(url), 800);

  const child = spawn('npx', ['-y', 'serve', '.', '-l', String(opts.port)], {
    cwd: OUT_ROOT,
    stdio: 'inherit',
    shell: true,
  });
  child.on('exit', code => process.exit(code ?? 0));
}

try {
  main();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
