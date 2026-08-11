/**
 * Backfill terminalOutcome on existing platform traces + optionally recompute abilityScore.
 *
 * Outcome:
 *   pass            — win / winOk / verdict pass / bands 达标
 *   exhausted_fail  — attempts_exhausted event / snapshot flag, and not win
 *   incomplete      — neither
 *
 * Run: node scripts/retag-terminal-outcome.js [--recompute-ability] [--dry-run]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { getTracesRoot } = require('../packages/platform/paths');
const { loadChapterForGraph } = require('../packages/platform/catalog');
const { computeAbilityScore } = require('../packages/judge/ability-score');
const {
  deriveTerminalOutcome,
  mergeTerminalOutcome,
  TERMINAL_OUTCOMES,
} = require('../packages/judge/session-terminal');

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const RECOMPUTE = args.has('--recompute-ability');

function main() {
  const root = getTracesRoot();
  if (!fs.existsSync(root)) {
    console.log('no traces root:', root);
    return;
  }
  const files = fs.readdirSync(root).filter((f) => f.endsWith('.json'));
  const counts = {
    pass: 0,
    exhausted_fail: 0,
    incomplete: 0,
    written: 0,
    abilityUpdated: 0,
    skipped: 0,
    errors: 0,
  };

  for (const file of files) {
    const fp = path.join(root, file);
    try {
      const row = JSON.parse(fs.readFileSync(fp, 'utf8'));
      if (!row.sessionId) {
        counts.skipped += 1;
        continue;
      }
      const derived = deriveTerminalOutcome(row);
      const next = mergeTerminalOutcome(row.terminalOutcome, derived);
      counts[next] = (counts[next] || 0) + 1;

      let dirty = row.terminalOutcome !== next;
      row.terminalOutcome = next;

      if (RECOMPUTE) {
        try {
          const chapter = loadChapterForGraph(row.graphId) || {};
          const ability = computeAbilityScore({
            events: Array.isArray(row.events) ? row.events : [],
            chapter,
            verdict: row.judgeResult?.verdict || row.verdict || null,
            judged: !!(row.judged || row.judgeResult),
            packageId: row.packageId || row.catalogId || null,
            graphId: row.graphId,
            terminalOutcome: next,
            attemptsExhausted: next === TERMINAL_OUTCOMES.EXHAUSTED_FAIL,
          });
          const prevTotal = row.abilityScore?.total;
          const prevBand = row.abilityScore?.bands?.result;
          row.abilityScore = ability;
          row.abilityScoreComputedAt = ability.computedAt;
          if (prevTotal !== ability.total || prevBand !== ability.bands?.result) {
            counts.abilityUpdated += 1;
            dirty = true;
          }
        } catch (e) {
          console.warn('ability fail', row.sessionId, e.message);
        }
      }

      if (dirty && !DRY) {
        fs.writeFileSync(fp, JSON.stringify(row, null, 2), 'utf8');
        counts.written += 1;
      } else if (dirty && DRY) {
        counts.written += 1;
      }
    } catch (e) {
      counts.errors += 1;
      console.warn('error', file, e.message);
    }
  }

  console.log(JSON.stringify({
    dryRun: DRY,
    recomputeAbility: RECOMPUTE,
    totalFiles: files.length,
    ...counts,
  }, null, 2));
}

if (require.main === module) main();
module.exports = { main };
