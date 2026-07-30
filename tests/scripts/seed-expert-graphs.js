/**
 * Seed expert gold chapters from packages (curated reproducible gold).
 * Keeps existing hand-authored expert files unless --force.
 *
 *   node tests/scripts/seed-expert-graphs.js
 *   node tests/scripts/seed-expert-graphs.js --force
 *   node tests/scripts/seed-expert-graphs.js --id projectile-cannon
 */
const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const { getPackagesRoot } = require('../../packages/shared/data-paths');

const ROOT = path.resolve(__dirname, '../..');
const EXPERT_ROOT = path.join(ROOT, 'data/datasets/expert-graphs');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function slimExpert(chapter, id, provenance) {
  const avs = (chapter.inquiryScript?.adjustmentVariables || []).map(a => ({
    id: a.id,
    controlId: a.controlId,
    label: a.label,
    symbol: a.symbol,
    type: a.type,
    role: a.role,
    priorityRank: a.priorityRank,
    monotonicity: a.monotonicity,
  }));
  const cvs = (chapter.inquiryScript?.confoundingVariables || []).map(c => ({
    id: c.id,
    controlId: c.controlId,
    label: c.label,
    reason: c.reason,
  }));
  const kgNodes = (chapter.kg?.nodes || []).map(n => ({
    id: n.id,
    label: n.label,
    group: n.group,
    layer: n.layer,
  }));
  return {
    _expertMeta: {
      id,
      provenance,
      seededAt: new Date().toISOString(),
      note: '可复现金标：自 packages chapter 固化 inquiryScript+KG 节点；非真人专家重画。手写金标见 projectile-basic / pendulum-clock。',
    },
    kg: {
      title: chapter.kg?.title || id,
      sub: chapter.kg?.sub || '',
      nodes: kgNodes,
      links: chapter.kg?.links || [],
    },
    inquiryScript: {
      summary: chapter.inquiryScript?.summary || '',
      knowledgePoints: chapter.inquiryScript?.knowledgePoints || [],
      adjustmentVariables: avs,
      confoundingVariables: cvs,
      inquiryFlow: chapter.inquiryScript?.inquiryFlow || [],
    },
    strategy: {
      routes: (chapter.strategy?.routes || []).map(r => ({
        id: r.id,
        label: r.label,
        priorityRank: r.priorityRank,
        score: r.score,
        tier: r.tier,
      })),
    },
  };
}

function main() {
  fs.mkdirSync(EXPERT_ROOT, { recursive: true });
  const force = process.argv.includes('--force');
  const filterId = argValue('--id');
  const entries = filterId ? YANG_MAP.filter(e => e.id === filterId) : YANG_MAP;
  const HAND_AUTHORED = new Set(['projectile-basic', 'pendulum-clock']);
  const rows = [];
  for (const entry of entries) {
    const outPath = path.join(EXPERT_ROOT, `${entry.id}.chapter.json`);
    const exists = fs.existsSync(outPath);
    if (exists && HAND_AUTHORED.has(entry.id) && !force) {
      rows.push({ id: entry.id, action: 'keep-hand-authored' });
      continue;
    }
    if (exists && !force && !HAND_AUTHORED.has(entry.id)) {
      // refresh curated golds by default so they track latest packages
    }
    const chapterPath = path.join(getPackagesRoot(), entry.id, 'chapter.json');
    if (!fs.existsSync(chapterPath)) {
      rows.push({ id: entry.id, action: 'skip-missing-package' });
      continue;
    }
    const chapter = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
    const provenance = HAND_AUTHORED.has(entry.id) && force
      ? 'overwrite-hand-authored-from-package'
      : 'curated-from-package-chapter';
    if (HAND_AUTHORED.has(entry.id) && !force) {
      rows.push({ id: entry.id, action: 'keep-hand-authored' });
      continue;
    }
    const expert = slimExpert(chapter, entry.id, provenance);
    fs.writeFileSync(outPath, JSON.stringify(expert, null, 2), 'utf8');
    rows.push({
      id: entry.id,
      action: exists ? 'updated' : 'created',
      avs: expert.inquiryScript.adjustmentVariables.length,
      kgNodes: expert.kg.nodes.length,
    });
  }
  console.log(JSON.stringify({ expertRoot: EXPERT_ROOT, rows }, null, 2));
  console.log(`expert graphs: ${rows.filter(r => r.action === 'created' || r.action === 'updated').length} written, ${rows.filter(r => r.action === 'keep-hand-authored').length} kept`);
}

main();
