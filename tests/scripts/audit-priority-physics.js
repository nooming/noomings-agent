/**
 * Lightweight priority physics probes for samples with clear expectations.
 * Marks suspicious priorityRank; --fix applies safe swaps when confident.
 *
 *   node tests/scripts/audit-priority-physics.js
 *   node tests/scripts/audit-priority-physics.js --fix
 */
const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const { getPackagesRoot, getReportsRoot } = require('../../packages/shared/data-paths');
const { stripSingleVarPrefix, stripSpace, synKey } = require('../lib/expert-match');

const REPORTS = getReportsRoot();

/** Heuristic expectations: variable class → preferred monotonicity / relative priority */
const RULES = {
  'projectile-basic': {
    note: '斜抛：速度对射程大致单调；角度非单调（有最佳角）→ 速度优先级通常应高于或等于角度的「先试」地位，但角度非单调应标 non-monotone',
    expect: [
      { match: id => /speed|速度|v0/i.test(id), mono: 'monotone', maxRank: 2 },
      { match: id => /angle|角度|倾角/i.test(id), mono: 'non-monotone' },
    ],
  },
  'projectile-cannon': {
    note: '抛体大炮：同类斜抛启发式',
    expect: [
      { match: id => /speed|速度|v0|power|炮口/i.test(id), mono: 'monotone', maxRank: 2 },
      { match: id => /angle|角度/i.test(id), mono: 'non-monotone' },
    ],
  },
};

function avKey(av) {
  return `${av.controlId || ''} ${av.label || ''} ${av.symbol || ''}`;
}

function auditChapter(id, chapter) {
  const rule = RULES[id];
  if (!rule) return { id, skipped: true, reason: 'no_clear_physics_rule' };
  const avs = chapter?.inquiryScript?.adjustmentVariables || [];
  const flags = [];
  for (const exp of rule.expect) {
    const hit = avs.find(a => exp.match(avKey(a)));
    if (!hit) {
      flags.push({ severity: 'info', issue: 'av_not_found_for_rule', rule: String(exp.match) });
      continue;
    }
    if (exp.mono && hit.monotonicity && hit.monotonicity !== 'unknown') {
      const m = String(hit.monotonicity).toLowerCase();
      const want = exp.mono.toLowerCase();
      if (!m.includes(want.replace('non-', '')) && m !== want && !(want === 'non-monotone' && /non|peak/.test(m))) {
        // allow non-monotone aliases
        if (want === 'non-monotone' && /non|peak/.test(m)) {
          /* ok */
        } else if (want === 'monotone' && m === 'monotone') {
          /* ok */
        } else if (want === 'monotone' && /non|peak/.test(m)) {
          flags.push({
            severity: 'warn',
            issue: 'monotonicity_mismatch',
            controlId: hit.controlId,
            label: hit.label,
            got: hit.monotonicity,
            expect: exp.mono,
          });
        } else if (want === 'non-monotone' && m === 'monotone') {
          flags.push({
            severity: 'warn',
            issue: 'monotonicity_mismatch',
            controlId: hit.controlId,
            label: hit.label,
            got: hit.monotonicity,
            expect: exp.mono,
          });
        }
      }
    } else if (exp.mono && (!hit.monotonicity || hit.monotonicity === 'unknown')) {
      flags.push({
        severity: 'warn',
        issue: 'monotonicity_missing',
        controlId: hit.controlId,
        label: hit.label,
        expect: exp.mono,
      });
    }
    if (exp.maxRank != null && hit.priorityRank != null && Number(hit.priorityRank) > exp.maxRank) {
      flags.push({
        severity: 'warn',
        issue: 'priority_rank_suspicious',
        controlId: hit.controlId,
        label: hit.label,
        got: hit.priorityRank,
        expectMaxRank: exp.maxRank,
      });
    }
  }
  return { id, skipped: false, note: rule.note, flags, suspicious: flags.some(f => f.severity === 'warn') };
}

function applyFixes(id, chapter, audit) {
  if (!audit || audit.skipped) return false;
  let changed = false;
  const avs = chapter.inquiryScript?.adjustmentVariables || [];
  for (const f of audit.flags) {
    if (f.issue === 'monotonicity_missing' || f.issue === 'monotonicity_mismatch') {
      const av = avs.find(a => a.controlId === f.controlId);
      if (av && f.expect) {
        av.monotonicity = f.expect;
        changed = true;
      }
    }
  }
  // projectile: ensure speed rank <= angle rank when both exist
  if (id.startsWith('projectile')) {
    const speed = avs.find(a => /speed|速度/i.test(avKey(a)));
    const angle = avs.find(a => /angle|角度/i.test(avKey(a)));
    if (speed && angle && speed.priorityRank != null && angle.priorityRank != null) {
      if (Number(speed.priorityRank) > Number(angle.priorityRank)) {
        const tmp = speed.priorityRank;
        speed.priorityRank = angle.priorityRank;
        angle.priorityRank = tmp;
        changed = true;
      }
    }
  }
  return changed;
}

function main() {
  const doFix = process.argv.includes('--fix');
  const rows = [];
  const fixes = [];
  for (const entry of YANG_MAP) {
    const p = path.join(getPackagesRoot(), entry.id, 'chapter.json');
    if (!fs.existsSync(p)) {
      rows.push({ id: entry.id, ok: false, error: 'missing' });
      continue;
    }
    const chapter = JSON.parse(fs.readFileSync(p, 'utf8'));
    const audit = auditChapter(entry.id, chapter);
    rows.push({ ok: true, ...audit });
    if (doFix && !audit.skipped && audit.flags?.length) {
      if (applyFixes(entry.id, chapter, audit)) {
        fs.writeFileSync(p, JSON.stringify(chapter, null, 2), 'utf8');
        fixes.push(entry.id);
      }
    }
  }
  fs.mkdirSync(REPORTS, { recursive: true });
  const payload = { generatedAt: new Date().toISOString(), rows, fixes };
  fs.writeFileSync(path.join(REPORTS, 'priority-physics-audit.json'), JSON.stringify(payload, null, 2), 'utf8');
  const sus = rows.filter(r => r.suspicious);
  console.log(`priority-physics-audit: ${sus.length} suspicious; fixed=${fixes.length}`);
  for (const r of sus) {
    console.log(`- ${r.id}: ${r.flags.map(f => f.issue).join(', ')}`);
  }
}

main();
