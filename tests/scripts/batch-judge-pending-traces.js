/**
 * Batch rules-judge all pending platform traces (same path as POST /api/platform/judge-session).
 *
 *   node tests/scripts/batch-judge-pending-traces.js
 *   node tests/scripts/batch-judge-pending-traces.js --dry-run
 *   node tests/scripts/batch-judge-pending-traces.js --limit 20
 *   node tests/scripts/batch-judge-pending-traces.js --force
 *   node tests/scripts/batch-judge-pending-traces.js --concurrency 3
 *
 * Idempotent: skips sessions with judged / judgeResult unless --force.
 * Writes abilityScore via shared judgeAndSaveSession (mirrors API).
 */
const fs = require('fs');
const path = require('path');
const { getTracesRoot } = require('../../packages/platform/paths');
const { judgeAndSaveSession } = require('../../packages/platform/judge-session-core');

function parseArgs(argv) {
  const out = {
    dryRun: false,
    force: false,
    limit: null,
    concurrency: 3,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--force') out.force = true;
    else if (a === '--limit') out.limit = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === '--concurrency') {
      out.concurrency = Math.max(1, Math.min(8, parseInt(argv[++i], 10) || 3));
    } else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function isPending(row) {
  return !(row.judged || row.judgeResult);
}

function listTraceFiles() {
  const root = getTracesRoot();
  if (!fs.existsSync(root)) return { root, files: [] };
  return {
    root,
    files: fs.readdirSync(root).filter((f) => f.endsWith('.json')),
  };
}

function loadSessionMeta(filePath) {
  const row = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return {
    sessionId: row.sessionId || path.basename(filePath, '.json'),
    judged: !!(row.judged || row.judgeResult),
    hasAbility: !!(row.abilityScore && Number.isFinite(Number(row.abilityScore.total))),
    graphId: row.graphId || null,
    eventCount: Array.isArray(row.events) ? row.events.length : (row.eventCount || 0),
  };
}

async function runPool(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return;
  const limit = Math.max(1, Math.min(concurrency || 1, list.length));
  let cursor = 0;
  async function runOne() {
    while (cursor < list.length) {
      const idx = cursor++;
      await worker(list[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => runOne()));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node tests/scripts/batch-judge-pending-traces.js [options]
  --dry-run         List pending only; do not judge
  --limit N         Cap number of sessions to process
  --force           Re-judge even if already judged
  --concurrency N   Parallel workers (default 3, max 8)`);
    process.exit(0);
  }

  const { root, files } = listTraceFiles();
  const metas = [];
  let corrupt = 0;
  for (const f of files) {
    try {
      metas.push(loadSessionMeta(path.join(root, f)));
    } catch {
      corrupt += 1;
    }
  }

  const pendingBefore = metas.filter((m) => !m.judged).length;
  let targets = args.force ? metas.slice() : metas.filter((m) => !m.judged);
  if (args.limit != null) targets = targets.slice(0, args.limit);

  console.log(JSON.stringify({
    tracesRoot: root,
    totalFiles: files.length,
    corrupt,
    pendingBefore,
    alreadyJudged: metas.length - pendingBefore,
    targets: targets.length,
    dryRun: args.dryRun,
    force: args.force,
    concurrency: args.concurrency,
  }, null, 2));

  if (args.dryRun) {
    console.log('dry-run sample:', targets.slice(0, 10).map((t) => t.sessionId));
    return;
  }

  const stats = {
    judged: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  await runPool(targets, args.concurrency, async (meta) => {
    try {
      const result = await judgeAndSaveSession(meta.sessionId, {
        mode: 'rules',
        force: args.force,
        llmOpts: {
          apiKey: process.env.DEEPSEEK_API_KEY,
          apiUrl: process.env.DEEPSEEK_API_URL
            || 'https://api.deepseek.com/v1/chat/completions',
        },
      });
      if (!result.ok) {
        stats.failed += 1;
        stats.failures.push({
          sessionId: meta.sessionId,
          error: result.error || 'unknown',
          graphId: meta.graphId,
        });
        console.error(`FAIL ${meta.sessionId}: ${result.error}`);
        return;
      }
      if (result.skipped) {
        stats.skipped += 1;
        return;
      }
      stats.judged += 1;
      const total = result.abilityScore?.total;
      console.log(
        `OK ${meta.sessionId} verdict=${result.verdict || '?'} ability=${
          Number.isFinite(Number(total)) ? Math.round(Number(total)) : '—'
        }`,
      );
    } catch (err) {
      stats.failed += 1;
      stats.failures.push({
        sessionId: meta.sessionId,
        error: err.message || String(err),
        graphId: meta.graphId,
      });
      console.error(`FAIL ${meta.sessionId}:`, err.message || err);
    }
  });

  // recount pending after
  let pendingAfter = 0;
  for (const f of fs.readdirSync(root).filter((x) => x.endsWith('.json'))) {
    try {
      const row = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
      if (isPending(row)) pendingAfter += 1;
    } catch { /* ignore */ }
  }

  const summary = {
    pendingBefore,
    pendingAfter,
    judged: stats.judged,
    skipped: stats.skipped,
    failed: stats.failed,
    failures: stats.failures,
  };
  console.log('\n=== batch-judge summary ===');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
