/**
 * 统一会话评判/能力分回填入口。
 *
 *   node tests/scripts/backfill-session-scores.js --mode all
 *   node tests/scripts/backfill-session-scores.js --mode preview
 *   node tests/scripts/backfill-session-scores.js --mode terminal-ability [--force]
 *   node tests/scripts/backfill-session-scores.js --dry-run
 */
const { getTracesRoot } = require('../../packages/platform/paths');
const { rebuildTracesIndex } = require('../../packages/platform/trace-store');
const { spawnSync } = require('child_process');
const path = require('path');

function parseArgs(argv) {
  const out = {
    mode: 'all',
    dryRun: false,
    force: false,
    concurrency: 4,
    limit: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mode') out.mode = String(argv[++i] || 'all').trim();
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--force') out.force = true;
    else if (a === '--concurrency') out.concurrency = Math.max(1, parseInt(argv[++i], 10) || 4);
    else if (a === '--limit') out.limit = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function runNode(script, extraArgs) {
  const r = spawnSync(process.execPath, [path.join(__dirname, script), ...extraArgs], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '../..'),
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node tests/scripts/backfill-session-scores.js [--mode all|preview|terminal-ability] [--dry-run] [--force] [--limit N] [--concurrency N]
tracesRoot: ${getTracesRoot()}`);
    process.exit(0);
  }

  const common = [];
  if (args.dryRun) common.push('--dry-run');
  if (args.limit > 0) common.push('--limit', String(args.limit));

  if (args.mode === 'preview' || args.mode === 'all') {
    runNode('backfill-incomplete-sessions.js', [
      ...common,
      '--concurrency',
      String(args.concurrency),
    ]);
  }

  if (args.mode === 'terminal-ability' || args.mode === 'all') {
    const abilityArgs = [...common];
    if (args.force) abilityArgs.push('--force');
    runNode('backfill-ability-score.js', [...abilityArgs, '--no-report']);
  }

  if (!args.dryRun) {
    try {
      rebuildTracesIndex();
      console.log('rebuildTracesIndex: ok');
    } catch (e) {
      console.warn('rebuildTracesIndex:', e.message);
    }
  }
}

main();
