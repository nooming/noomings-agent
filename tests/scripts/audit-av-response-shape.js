/**
 * Regression audit: every AV has responseShape + consistent monotonicity;
 * route scores match priorityRank table; confoundProbe has no priorityRank.
 *
 *   node tests/scripts/audit-av-response-shape.js
 *   node tests/scripts/audit-av-response-shape.js --id thin-lens-implicit
 */
const fs = require('fs');
const path = require('path');
const { getPackagesRoot } = require('../../packages/shared/data-paths');
const { SCORE_BY_RANK, TRAP_SCORE } = require('../../packages/contract/repair/strategy-route-score-repair');
const { RESPONSE_SHAPES, monotonicityFromResponseShape } = require('../../packages/generate/av-response-shape');
const YANG_MAP = require('../lib/yangben-sample-map');

const REPORTS = path.join(getPackagesRoot(), 'reports');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function auditOne(id) {
  const chapterPath = path.join(getPackagesRoot(), id, 'chapter.json');
  if (!fs.existsSync(chapterPath)) return { id, ok: false, errors: ['chapter_missing'] };
  const chapter = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
  const avs = chapter.inquiryScript?.adjustmentVariables || [];
  const routes = chapter.strategy?.routes || [];
  const errors = [];
  const warnings = [];

  for (const av of avs) {
    if (!av.responseShape || !RESPONSE_SHAPES.includes(av.responseShape)) {
      errors.push(`av ${av.controlId}: bad/missing responseShape`);
    } else if (av.responseShape !== 'unknown') {
      const expect = monotonicityFromResponseShape(av.responseShape);
      if (av.monotonicity !== expect) {
        errors.push(`av ${av.controlId}: monotonicity ${av.monotonicity} != ${expect} for ${av.responseShape}`);
      }
    }
    if (av.priorityRank == null) warnings.push(`av ${av.controlId}: missing priorityRank`);
    if (!av.notes) warnings.push(`av ${av.controlId}: empty notes`);
    if (/混淆/.test(av.notes || '') || /混淆/.test(av.label || '')) {
      errors.push(`av ${av.controlId}: student-facing spoiler「混淆」`);
    }
  }

  const ranks = avs.map(a => a.priorityRank).filter(r => r != null);
  if (ranks.length >= 2 && new Set(ranks).size !== ranks.length) {
    errors.push('duplicate priorityRank among AVs');
  }

  for (const r of routes) {
    if (r.kind === 'confoundProbe' || (/试探·/.test(r.label || '') && !/单变量·/.test(r.label || ''))) {
      if (r.priorityRank != null) errors.push(`confound route ${r.label}: must not have priorityRank`);
      if ((r.score ?? 1) > 0.15 + 1e-9) warnings.push(`confound route ${r.label}: score>${r.score}`);
      continue;
    }
    if (/trap|盲调|多参/i.test(`${r.id}${r.label}`) || r.tier === 'suboptimal') {
      if (Math.abs((r.score ?? 0) - TRAP_SCORE) > 1e-9) {
        warnings.push(`trap ${r.label}: score ${r.score} != ${TRAP_SCORE}`);
      }
      continue;
    }
    if (/单变量·/.test(r.label || '') && r.priorityRank != null) {
      const expect = SCORE_BY_RANK[r.priorityRank];
      if (expect != null && Math.abs((r.score ?? 0) - expect) > 1e-9) {
        errors.push(`route ${r.label}: score ${r.score} != ${expect} for rank ${r.priorityRank}`);
      }
    }
  }

  return {
    id,
    ok: errors.length === 0,
    errors,
    warnings,
    order: avs
      .slice()
      .sort((a, b) => (a.priorityRank || 99) - (b.priorityRank || 99))
      .map(a => `${a.priorityRank}:${a.label}/${a.responseShape}`)
      .join(' > '),
  };
}

function main() {
  const filterId = argValue('--id');
  const ids = filterId
    ? [filterId]
    : YANG_MAP.map(e => e.id);
  const rows = ids.map(auditOne);
  const failed = rows.filter(r => !r.ok);
  fs.mkdirSync(REPORTS, { recursive: true });
  const out = path.join(REPORTS, 'av-response-shape-audit.json');
  fs.writeFileSync(out, JSON.stringify({ rows, failed: failed.length }, null, 2), 'utf8');
  for (const r of rows) {
    console.log(r.ok ? 'OK' : 'FAIL', r.id, r.order || '', r.errors?.join('; ') || '');
    if (r.warnings?.length) console.log('  warn:', r.warnings.join('; '));
  }
  console.log(`Done: ${rows.length - failed.length}/${rows.length} ok → ${out}`);
  if (failed.length) process.exit(1);
}

main();
