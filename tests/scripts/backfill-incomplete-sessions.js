/**
 * 历史会话：补未终局分档 + 规则 preview 评判（与 leaveAuto 新逻辑一致）。
 *
 *   node tests/scripts/backfill-incomplete-sessions.js
 *   node tests/scripts/backfill-incomplete-sessions.js --dry-run
 *   node tests/scripts/backfill-incomplete-sessions.js --limit 50
 *   node tests/scripts/backfill-incomplete-sessions.js --concurrency 4
 */
const fs = require('fs');
const path = require('path');
const { getTracesRoot } = require('../../packages/platform/paths');
const { getTraceSession, rebuildTracesIndex } = require('../../packages/platform/trace-store');
const { backfillIncompleteSessionRecord } = require('../../packages/platform/judge-session-core');

function parseArgs(argv) {
  const out = { dryRun: false, limit: null, concurrency: 4, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--limit') out.limit = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === '--concurrency') {
      out.concurrency = Math.max(1, Math.min(8, parseInt(argv[++i], 10) || 4));
    } else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function listSessionIds() {
  const root = getTracesRoot();
  if (!fs.existsSync(root)) return [];
  const ids = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!ent.name || ent.name.startsWith('.')) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (/^sess-[a-zA-Z0-9-]+\.json$/.test(ent.name)) {
        ids.push(ent.name.replace(/\.json$/, ''));
      }
    }
  }
  walk(root);
  return ids.sort();
}

async function runPool(items, concurrency, worker) {
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tests/scripts/backfill-incomplete-sessions.js [--dry-run] [--limit N] [--concurrency N]');
    process.exit(0);
  }

  let ids = listSessionIds();
  if (args.limit > 0) ids = ids.slice(0, args.limit);

  const stats = {
    total: ids.length,
    terminal_skip: 0,
    terminal_cleared_kind: 0,
    terminal_rescored_ability: 0,
    kind_only: 0,
    preview_judged: 0,
    would_preview_judge: 0,
    errors: 0,
  };

  console.log(`backfill incomplete: ${ids.length} sessions, dryRun=${args.dryRun}, concurrency=${args.concurrency}`);

  await runPool(ids, args.concurrency, async (sessionId) => {
    try {
      const session = getTraceSession(sessionId);
      if (!session) {
        stats.errors += 1;
        return;
      }
      const result = await backfillIncompleteSessionRecord(session, { dryRun: args.dryRun });
      const action = result.action || 'unknown';
      if (stats[action] != null) stats[action] += 1;
      else stats.errors += 1;
    } catch (e) {
      stats.errors += 1;
      console.error(`[error] ${sessionId}: ${e.message}`);
    }
  });

  if (!args.dryRun) {
    try {
      rebuildTracesIndex();
    } catch (e) {
      console.warn('rebuildTracesIndex:', e.message);
    }
  }

  console.log(JSON.stringify(stats, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
