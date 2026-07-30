/** CLI: node tests/scripts/migrate-packages-layout.js [--dry-run] */
const fs = require('fs');
const path = require('path');
const {
  getPackagesRoot,
  getDatasetHtmlSamplesRoot,
  getRuntimeOutputRoot,
  getGamesPresetRoot,
  getPackageDir,
} = require('../../packages/shared/data-paths');

const CAPACITOR_ERA_OUTPUT = '电容纪元-静电城邦-20260702-154833';
const CAPACITOR_ERA_PKG = 'capacitor-era';
const SKIP_SAMPLE_IDS = new Set(['capacitor-plate']);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest, dryRun) {
  if (!fs.existsSync(src)) return false;
  if (dryRun) {
    console.log(`  copy ${src} -> ${dest}`);
    return true;
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

function copyDirFiles(srcDir, destDir, names, dryRun) {
  let n = 0;
  for (const name of names) {
    const src = path.join(srcDir, name);
    if (copyFile(src, path.join(destDir, name), dryRun)) n += 1;
  }
  return n;
}

function migrateHtmlSamples(packagesRoot, dryRun) {
  const hsRoot = getDatasetHtmlSamplesRoot();
  const manifestSrc = path.join(hsRoot, 'manifest.json');
  if (!fs.existsSync(manifestSrc)) {
    console.warn('skip html-samples: no manifest');
    return 0;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestSrc, 'utf8'));
  const manifestDest = path.join(packagesRoot, 'manifest.json');
  if (!dryRun) {
    ensureDir(packagesRoot);
    fs.writeFileSync(manifestDest, JSON.stringify(manifest, null, 2), 'utf8');
  } else {
    console.log(`write ${manifestDest}`);
  }

  let count = 0;
  for (const sample of manifest.samples || []) {
    if (SKIP_SAMPLE_IDS.has(sample.id)) {
      console.log(`  skip sample ${sample.id} (merged into ${CAPACITOR_ERA_PKG})`);
      continue;
    }
    const pkgDir = path.join(packagesRoot, sample.id);
    const htmlSrc = path.join(hsRoot, 'generated', `${sample.id}.html`);
    const chapterSrc = path.join(hsRoot, 'chapters', sample.id, 'chapter.json');
    if (copyFile(htmlSrc, path.join(pkgDir, 'game.html'), dryRun)) count += 1;
    if (copyFile(chapterSrc, path.join(pkgDir, 'chapter.json'), dryRun)) count += 1;
  }
  return count;
}

function migrateCapacitorEra(packagesRoot, dryRun) {
  const pkgDir = path.join(packagesRoot, CAPACITOR_ERA_PKG);
  const presetHtml = path.join(getGamesPresetRoot(), '电容纪元.html');
  const plateHtml = path.join(getDatasetHtmlSamplesRoot(), 'generated', 'capacitor-plate.html');
  const htmlSrc = fs.existsSync(presetHtml) ? presetHtml : plateHtml;
  copyFile(htmlSrc, path.join(pkgDir, 'game.html'), dryRun);

  const outDir = path.join(getRuntimeOutputRoot(), CAPACITOR_ERA_OUTPUT);
  copyDirFiles(outDir, pkgDir, ['chapters.json', 'meta.json', 'index.html', 'report.json'], dryRun);
  console.log(`  capacitor-era from ${htmlSrc} + ${outDir}`);
}

function migrateOutputProjects(packagesRoot, dryRun) {
  const outRoot = getRuntimeOutputRoot();
  const indexFile = path.join(outRoot, 'index.json');
  if (!fs.existsSync(indexFile)) return { items: [] };

  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  const items = [];
  for (const item of index.items || []) {
    if (item.id === CAPACITOR_ERA_OUTPUT) {
      items.push({
        ...item,
        id: CAPACITOR_ERA_PKG,
        url: `/packages/${CAPACITOR_ERA_PKG}/index.html`,
        legacyGraphId: CAPACITOR_ERA_OUTPUT,
      });
      continue;
    }
    const pkgDir = path.join(packagesRoot, item.id);
    const srcDir = path.join(outRoot, item.id);
    copyDirFiles(srcDir, pkgDir, ['chapter.json', 'chapters.json', 'meta.json', 'index.html', 'report.json'], dryRun);
    const htmlInPkg = path.join(pkgDir, 'game.html');
    if (!fs.existsSync(htmlInPkg) && item.playUrl) {
      /* playUrl may point elsewhere; index item kept */
    }
    items.push({
      ...item,
      url: `/packages/${item.id}/index.html`,
    });
  }
  return { latest: index.latest === CAPACITOR_ERA_OUTPUT ? CAPACITOR_ERA_PKG : index.latest, items };
}

function migrateReports(packagesRoot, dryRun) {
  const src = path.join(getDatasetHtmlSamplesRoot(), 'reports');
  const dest = path.join(packagesRoot, 'reports');
  if (!fs.existsSync(src)) return;
  if (dryRun) {
    console.log(`copy reports ${src} -> ${dest}`);
    return;
  }
  ensureDir(dest);
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) continue;
    fs.copyFileSync(s, d);
  }
}

function printAliasMap() {
  console.log('\ngraphId alias map:');
  console.log('  电容纪元-静电城邦-20260702-154833 -> capacitor-era');
  console.log('  html-samples-{id} -> {id}');
  console.log('  html-samples-capacitor-plate -> capacitor-era');
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const packagesRoot = path.join(require('../../packages/shared/paths').getAgentDir(), 'data/runtime/packages');

  console.log(`migrate-packages-layout: ${packagesRoot}${dryRun ? ' (dry-run)' : ''}`);

  const n = migrateHtmlSamples(packagesRoot, dryRun);
  migrateCapacitorEra(packagesRoot, dryRun);
  const index = migrateOutputProjects(packagesRoot, dryRun);
  migrateReports(packagesRoot, dryRun);

  const indexDest = path.join(packagesRoot, 'index.json');
  if (!dryRun) {
    ensureDir(packagesRoot);
    fs.writeFileSync(indexDest, JSON.stringify(index, null, 2), 'utf8');
  } else {
    console.log(`write ${indexDest}`);
  }

  printAliasMap();
  console.log(`migrate-packages-layout: done (${n} html-sample file pairs)`);
}

main();
