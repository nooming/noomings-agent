/** CLI: node tests/scripts/archive-manual-html-backups.js */
const fs = require('fs');
const path = require('path');
const {
  getGamesLegacyRoot,
  getManualBackupsRoot,
  getPackageGamePath,
} = require('../../packages/shared/data-paths');

const LEGACY_ENTRIES = [
  { file: '斜抛运动物理挑战.html', sampleIds: ['projectile-basic'] },
  { file: '高尔夫球斜抛入洞.html', sampleIds: ['projectile-implicit'] },
  { file: '电场台球.html', sampleIds: ['efield-charge'] },
  { file: '回旋加速器与复合电磁场运动.html', sampleIds: ['cyclotron-radius'] },
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`missing source: ${src}`);
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return { src, dest, size: fs.statSync(dest).size };
}

function main() {
  const root = getManualBackupsRoot();
  const legacyRoot = getGamesLegacyRoot();
  const legacyDest = path.join(root, 'legacy');
  const archivedAt = new Date().toISOString();
  const items = [];

  ensureDir(legacyDest);

  for (const entry of LEGACY_ENTRIES) {
    const src = path.join(legacyRoot, entry.file);
    const dest = path.join(legacyDest, entry.file);
    const copied = copyFile(src, dest);
    items.push({
      id: entry.file.replace(/\.html$/i, ''),
      file: `legacy/${entry.file}`,
      sourcePath: path.relative(process.cwd(), src).replace(/\\/g, '/'),
      sampleIds: entry.sampleIds,
      size: copied.size,
      archivedAt,
    });
  }

  const capSrc = getPackageGamePath('capacitor-era');
  const capDest = path.join(root, 'capacitor-era.html');
  const capCopied = copyFile(capSrc, capDest);
  items.push({
    id: 'capacitor-era',
    file: 'capacitor-era.html',
    sourcePath: path.relative(process.cwd(), capSrc).replace(/\\/g, '/'),
    sampleIds: ['capacitor-era', 'capacitor-plate'],
    size: capCopied.size,
    archivedAt,
  });

  const index = { version: 1, archivedAt, items };
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify(index, null, 2), 'utf8');

  const readme = [
    '# 人工 HTML 原件归档',
    '',
    '只读备份，**不挂载 HTTP**。运行态正本见 `data/games/legacy/` 与 `data/runtime/packages/capacitor-era/game.html`。',
    '',
    `归档时间：${archivedAt}`,
    '',
    '| 文件 | 来源 | 关联 sample |',
    '|------|------|-------------|',
    ...items.map(i => `| \`${i.file}\` | \`${i.sourcePath}\` | ${i.sampleIds.join(', ')} |`),
    '',
    '```bash',
    'npm run archive:manual-html',
    '```',
  ].join('\n');
  fs.writeFileSync(path.join(root, 'README.md'), readme, 'utf8');

  console.log(`archive-manual-html: ${items.length} file(s) → ${root}`);
}

main();
