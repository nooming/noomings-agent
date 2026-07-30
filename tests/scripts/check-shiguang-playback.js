/** CLI: node tests/scripts/check-shiguang-playback.js */
const fs = require('fs');
const path = require('path');
const lib = require('./shiguang-playback-lib');

const {
  OUT_ROOT,
  CONTENT_ROOT,
  SHARED_VENDOR,
  walkMetaFiles,
  readJson,
  hasHtmlIndex,
  findEngineFile,
  readEngineSource,
} = lib;

function checkBrokenSharedRefs(htmlFile) {
  const src = fs.readFileSync(htmlFile, 'utf8');
  const issues = [];
  if (/shared-touch-guard\.(css|js)/.test(src) && /\.\.\/shared-touch-guard/.test(src)) {
    issues.push('unfixed shared-touch-guard relative path');
  }
  return issues;
}

function walkHtml(dir, fn) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkHtml(p, fn);
    else if (/\.html?$/i.test(ent.name)) fn(p);
  }
}

function main() {
  const metaFiles = walkMetaFiles(CONTENT_ROOT);
  const errors = [];
  const warnings = [];

  if (metaFiles.length === 0) {
    console.error('no meta.json found under content/');
    process.exit(1);
  }

  for (const metaPath of metaFiles) {
    const itemPath = path.dirname(metaPath);
    const meta = readJson(metaPath);
    const label = `${meta.stage}/${meta.cat}/${meta.slug}`;

    if (!fs.existsSync(path.join(itemPath, 'index.html'))) {
      errors.push(`${label}: missing index.html`);
    }
    if (!fs.existsSync(path.join(itemPath, 'open.cmd'))) {
      errors.push(`${label}: missing open.cmd`);
    }

    const engineFile = findEngineFile(itemPath);
    const engineSrc = engineFile ? readEngineSource(itemPath) : '';
    if (engineFile && !fs.existsSync(path.join(itemPath, 'core', 'BaseEngine.js'))) {
      errors.push(`${label}: missing core/BaseEngine.js`);
    }
    if (/BabylonSandboxEngine/.test(engineSrc)) {
      for (const name of ['BabylonSandboxEngine.js', 'BabylonCircuitBaseEngine.js']) {
        if (!fs.existsSync(path.join(itemPath, 'core', name))) {
          errors.push(`${label}: missing core/${name}`);
        }
      }
    }

    if (hasHtmlIndex(itemPath)) {
      walkHtml(path.join(itemPath, 'html'), file => {
        for (const issue of checkBrokenSharedRefs(file)) {
          errors.push(`${label}: html/${path.basename(file)} ${issue}`);
        }
      });
    }

    if (meta.play?.status === 'missing-embedded') {
      warnings.push(`${label}: embedded assets still missing (run with --fetch-embedded)`);
    }
    if (!meta.play?.entry) {
      warnings.push(`${label}: no play metadata`);
    }
  }

  const manifestPath = path.join(OUT_ROOT, 'manifest.json');
  if (!fs.existsSync(path.join(OUT_ROOT, 'catalog', 'play.html'))) {
    errors.push('missing catalog/play.html');
  }
  if (!fs.existsSync(path.join(OUT_ROOT, 'open-catalog.cmd'))) {
    errors.push('missing open-catalog.cmd');
  }

  if (!fs.existsSync(path.join(SHARED_VENDOR, 'babylon.min.js'))) {
    errors.push('missing content/_shared/vendor/js/babylon.min.js');
  }

  console.log(`checked ${metaFiles.length} experiments`);
  if (warnings.length) {
    console.warn(`warnings (${warnings.length}):`);
    warnings.slice(0, 15).forEach(w => console.warn('  -', w));
    if (warnings.length > 15) console.warn(`  … and ${warnings.length - 15} more`);
  }
  if (errors.length) {
    console.error(`FAILED (${errors.length}):`);
    errors.forEach(e => console.error('  -', e));
    process.exit(1);
  }
  console.log(`OK: ${metaFiles.length}/${metaFiles.length} playable entries`);
}

main();
