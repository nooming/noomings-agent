/**
 * One-shot: publish only mechanics + thermal packages for classroom demo.
 * - Whitelist → published; KEEP_GOLD → craft:gold + featured; others → craft:pilot
 * - Everything else → unpublished (package files kept)
 * - Ensures class-config.json has a usable code + demo label
 *
 * Usage: node scripts/set-mechanics-thermo-classroom.js
 *        node scripts/set-mechanics-thermo-classroom.js --dry-run
 */
const fs = require('fs');
const path = require('path');
const {
  readCatalog,
  writeCatalog,
  listCatalog,
} = require('../packages/platform/catalog');
const { assertPublishReady } = require('../packages/platform/publish-gate');
const {
  getClassAccessCode,
  getClassCodeSource,
  getClassConfigPath,
  DEV_DEFAULT_CLASS_CODE,
} = require('../packages/platform/class-access');
const { getPackagesRoot } = require('../packages/shared/data-paths');

const DRY = process.argv.includes('--dry-run');

/**
 * Default classroom demo: 5 mechanics + 3 thermo (8 total).
 * Thermo: gas-pressure-micro / maxwell-speed-dist / adiabatic-process
 *   (gas-ideal & heat-conduction unpublished; packages kept).
 * Mechanics five = craft:gold; thermo three = craft:pilot (still published).
 * Unpublished / deferred: cannon, pendulum-target, momentum, circular, friction,
 *   non mech/thermo.
 * ramp-rolling-collision replaces friction-incline (same incline line; avoid friction+rolling overlap).
 */
const WHITELIST = [
  'projectile-basic',
  'pendulum-clock',
  'ramp-rolling-collision',
  'nezha-boat-jump',
  'pulley-rigid',
  'gas-pressure-micro',
  'maxwell-speed-dist',
  'adiabatic-process',
];

/** Classroom mechanics set = craft:gold; thermo three stay craft:pilot. */
const KEEP_GOLD = new Set([
  'projectile-basic',
  'pendulum-clock',
  'ramp-rolling-collision',
  'nezha-boat-jump',
  'pulley-rigid',
]);

/** Explicitly not on student catalog (kept as packages for self-study / later) */
const DEFERRED = [
  'projectile-cannon',
  'pendulum-target',
  'momentum-collision',
  'circular-motion',
  'friction-incline',
  'gas-ideal',
  'heat-conduction',
];

const CLASSROOM_LABEL = '力学与热学课堂';
const CLASSROOM_CODE = DEV_DEFAULT_CLASS_CODE; // wuli2609

function setCraft(tags, craft) {
  const rest = (tags || []).filter((t) => !String(t).startsWith('craft:'));
  return [...new Set([...rest, craft])];
}

function packageExists(graphId) {
  const dir = path.join(getPackagesRoot(), graphId);
  return fs.existsSync(path.join(dir, 'game.html'));
}

function ensureClassConfig() {
  const source = getClassCodeSource();
  const existing = getClassAccessCode();
  const p = getClassConfigPath();
  let raw = {};
  if (fs.existsSync(p)) {
    try {
      raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      raw = {};
    }
  }

  // Env locks the code; still write label note for local operators.
  const code = source === 'env' ? existing : (existing || CLASSROOM_CODE || DEV_DEFAULT_CLASS_CODE);
  const next = {
    ...raw,
    classCode: code,
    label: CLASSROOM_LABEL,
    name: CLASSROOM_LABEL,
    note: '默认上架 8 关（力学 basic/clock/ramp/nezha-boat-jump/pulley-rigid + 热学 micro/maxwell/adiabatic）；gas-ideal/heat 与 cannon/target/momentum/circular/friction 后置 unpublished；力学五关 craft:gold，热学三关 craft:pilot（仍上架演示）',
    updatedAt: new Date().toISOString(),
  };

  if (!DRY) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }
  return { source, classCode: next.classCode, label: next.label, path: p, dry: DRY };
}

function main() {
  const missingPkgs = WHITELIST.filter((id) => !packageExists(id));
  if (missingPkgs.length) {
    console.error('Missing packages (abort):', missingPkgs.join(', '));
    process.exit(1);
  }

  const catalog = readCatalog();
  const byGraph = new Map();
  for (const item of catalog.items || []) {
    byGraph.set(String(item.graphId || '').replace(/^demo-/, ''), item);
  }

  const published = [];
  const unpublished = [];
  const craftUpgraded = [];
  const warnings = [];
  const missingCatalog = [];

  for (const graphId of WHITELIST) {
    const item = byGraph.get(graphId);
    if (!item) {
      missingCatalog.push(graphId);
      continue;
    }
    const wantCraft = KEEP_GOLD.has(graphId) ? 'craft:gold' : 'craft:pilot';
    const tags = setCraft(item.sampleTags || [], wantCraft);
    const prevCraft = (item.sampleTags || []).find((t) => String(t).startsWith('craft:'));
    if (prevCraft !== wantCraft) craftUpgraded.push({ id: item.id, from: prevCraft || '(none)', to: wantCraft });

    item.sampleTags = tags;
    item.published = true;
    item.featured = wantCraft === 'craft:gold';
    item.publishedAt = item.publishedAt || new Date().toISOString();

    const gate = assertPublishReady({
      graphId: item.graphId,
      playUrl: item.playUrl,
      sampleTags: item.sampleTags,
      published: true,
    });
    if (gate.warnings.length || gate.errors.length) {
      warnings.push({
        id: item.id,
        graphId: item.graphId,
        warnings: gate.warnings,
        errors: gate.errors,
        blocked: gate.blocked,
      });
    }
    published.push(item.id);
  }

  for (const item of catalog.items || []) {
    const gid = String(item.graphId || '').replace(/^demo-/, '');
    if (WHITELIST.includes(gid)) continue;
    if (item.published) unpublished.push(item.id);
    item.published = false;
  }

  if (missingCatalog.length) {
    console.error('Whitelist packages not in catalog:', missingCatalog.join(', '));
    process.exit(1);
  }

  if (!DRY) writeCatalog(catalog);

  const classInfo = ensureClassConfig();
  const studentVisible = listCatalog({ studentVisible: true });

  console.log(DRY ? '=== DRY RUN (no write) ===' : '=== Applied ===');
  console.log('Classroom:', classInfo.label, '| code:', classInfo.classCode, `| source→file (${classInfo.source} was prior)`);
  console.log('Published (whitelist):', published.join(', '));
  console.log('Deferred (kept unpublished):', DEFERRED.join(', '));
  console.log('Unpublished:', unpublished.length ? unpublished.join(', ') : '(none newly)');
  if (craftUpgraded.length) {
    console.log('Craft upgrades:');
    for (const u of craftUpgraded) console.log(`  ${u.id}: ${u.from} → ${u.to}`);
  }
  if (warnings.length) {
    console.log('Publish gate warnings:');
    for (const w of warnings) {
      console.log(`  ${w.id}:`, JSON.stringify({ warnings: w.warnings, errors: w.errors }));
    }
  } else {
    console.log('Publish gate: no warnings on whitelist');
  }
  console.log('\nStudent-visible catalog ids:');
  for (const it of studentVisible) {
    const craft = (it.sampleTags || []).find((t) => String(t).startsWith('craft:')) || '(none)';
    console.log(`  ${it.id}\t${it.graphId}\t${craft}`);
  }
  const extra = studentVisible.filter((it) => !WHITELIST.includes(String(it.graphId || '').replace(/^demo-/, '')));
  if (extra.length) {
    console.error('ERROR: unexpected student-visible:', extra.map((i) => i.id).join(', '));
    process.exit(1);
  }
  const missingVis = WHITELIST.filter(
    (gid) => !studentVisible.some((it) => String(it.graphId || '').replace(/^demo-/, '') === gid),
  );
  if (missingVis.length) {
    console.error('ERROR: whitelist not student-visible:', missingVis.join(', '));
    process.exit(1);
  }
  console.log(`\nOK: ${studentVisible.length} student-visible = whitelist only`);
}

main();
