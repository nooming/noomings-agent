/** CLI: node tests/scripts/batch-expert-graph-eval.js [--id projectile-basic]
 *  Expert vs Agent：分栏汇总（hand-authored / curated / 全量）+ 增强匹配 + 叙事干净度
 */
const fs = require('fs');
const path = require('path');
const { getPackagesRoot } = require('../../packages/shared/data-paths');
const {
  MATCH_RULES_DOC,
  matchNodes,
  matchAvs,
  priorityCorrelation,
  perAvRouteRecall,
} = require('../lib/expert-match');
const { assessNarrativeCleanliness } = require('../lib/narrative-cleanliness');

const ROOT = path.resolve(__dirname, '../..');
const EXPERT_ROOT = path.join(ROOT, 'data/datasets/expert-graphs');
const REPORTS = path.join(getPackagesRoot(), 'reports');
const HAND_AUTHORED = new Set(['projectile-basic', 'pendulum-clock']);

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function resolveProvenance(expert, id) {
  const p = expert?._expertMeta?.provenance;
  if (p === 'hand-authored' || HAND_AUTHORED.has(id) && p !== 'curated-from-package-chapter') {
    if (p === 'hand-authored' || (!p && HAND_AUTHORED.has(id))) return 'hand-authored';
  }
  if (p === 'curated-from-package-chapter' || p === 'curated') return 'curated-from-package-chapter';
  if (HAND_AUTHORED.has(id)) return 'hand-authored';
  return p || 'curated-from-package-chapter';
}

function mean(vals) {
  const xs = vals.filter(v => v != null && Number.isFinite(v));
  if (!xs.length) return null;
  return Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 1000) / 1000;
}

function evalPair(id) {
  const expertPath = path.join(EXPERT_ROOT, `${id}.chapter.json`);
  const agentPath = path.join(getPackagesRoot(), id, 'chapter.json');
  if (!fs.existsSync(expertPath)) return { id, ok: false, error: 'expert_missing' };
  if (!fs.existsSync(agentPath)) return { id, ok: false, error: 'agent_chapter_missing' };
  const expert = loadJson(expertPath);
  const agent = loadJson(agentPath);
  const provenance = resolveProvenance(expert, id);
  const nodes = matchNodes(expert, agent);
  const avs = matchAvs(expert, agent);
  const prio = priorityCorrelation(expert, agent);
  const narrative = assessNarrativeCleanliness(agent);
  return {
    id,
    ok: true,
    provenance,
    nodeLabelF1: nodes.f1,
    nodeMatch: { f1: nodes.f1, precision: nodes.precision, recall: nodes.recall, matched: nodes.matched },
    avF1: avs.f1,
    avMatch: { f1: avs.f1, precision: avs.precision, recall: avs.recall, matched: avs.matched },
    prioritySpearman: prio.spearman,
    priorityPearson: prio.pearson,
    priorityPairCount: prio.pairCount,
    perAvRouteRecall: perAvRouteRecall(expert, agent),
    narrativeCleanScore: narrative.score,
    narrativeDirty: narrative.dirty,
    narrativeIssues: narrative.issues,
  };
}

function subsetSummary(rows, pred) {
  const okRows = rows.filter(r => r.ok && pred(r));
  return {
    covered: okRows.length,
    meanNodeLabelF1: mean(okRows.map(r => r.nodeLabelF1)),
    meanAvF1: mean(okRows.map(r => r.avF1)),
    meanSpearman: mean(okRows.map(r => r.prioritySpearman)),
    meanPearson: mean(okRows.map(r => r.priorityPearson)),
    meanRouteRecall: mean(okRows.map(r => r.perAvRouteRecall)),
    meanNarrativeClean: mean(okRows.map(r => r.narrativeCleanScore)),
    dirtyCount: okRows.filter(r => r.narrativeDirty).length,
  };
}

function fmt(v) {
  return v == null ? '—' : v;
}

function subsetTable(title, note, s) {
  return [
    `### ${title}`,
    '',
    note,
    '',
    `| 覆盖 | 节点 F1 均 | AV F1 均 | Spearman 均 | Pearson 均 | route 召回均 | 叙事干净度均 | 叙事脏条数 |`,
    `| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`,
    `| ${s.covered} | ${fmt(s.meanNodeLabelF1)} | ${fmt(s.meanAvF1)} | ${fmt(s.meanSpearman)} | ${fmt(s.meanPearson)} | ${fmt(s.meanRouteRecall)} | ${fmt(s.meanNarrativeClean)} | ${s.dirtyCount} |`,
    '',
  ];
}

function toMarkdown(rows, subsets) {
  const lines = [
    '# Expert 图谱评测',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    '## 匹配规则',
    '',
    '```',
    MATCH_RULES_DOC,
    '```',
    '',
    '## 指标说明',
    '',
    '- **节点 F1 / AV F1**：增强匹配（controlId / 归一 label / 同义词），非裸字符串全等',
    '- **priority ρ / r**：配对 priorityRank 的 Spearman / Pearson（不足 2 对为 —）',
    '- **单变量 route 召回**：专家 AV 是否在 Agent strategy.routes 中有对应支路',
    '- **叙事干净度**：1=干净；检测机械 LoopObserve 门控、空环、边标签↔routes 不一致（structural 全绿仍可能叙事脏）',
    '',
    '## 诚实声明（金标局限）',
    '',
    '- **hand-authored**：目前仅 `projectile-basic`、`pendulum-clock` 为整理/手写金标；**不是**「全班真人专家重画」的学术级金标。',
    '- **curated-from-package-chapter**：其余样本由 `seed-expert-graphs.js` 自 packages chapter 固化，属**可复现对照基线**。',
    '- **禁止误读**：curated 子集上的高 F1 **不能**宣传为「Agent 对齐真人专家」——那是自己和固化快照比对；学术主张请只用 hand-authored 子集，并写明样本极少。',
    '- 全量汇总仅供工程回归； intrinsic 局限见上。',
    '',
    '## 分栏汇总',
    '',
    ...subsetTable(
      'A. hand-authored（手写/整理金标）',
      '> 唯一适合谨慎引用为「专家对齐」的子集；n 很小，勿过度外推。',
      subsets.handAuthored,
    ),
    ...subsetTable(
      'B. curated-from-package-chapter（固化金标）',
      '> 可复现工程基线；**非**真人专家重画。高分不代表学术对齐。',
      subsets.curated,
    ),
    ...subsetTable(
      'C. 全量（含上述局限）',
      '> 工程覆盖用；解读时必须拆开 A/B，勿只报全量均值。',
      subsets.all,
    ),
    '## 明细',
    '',
    '| id | 金标来源 | 节点 F1 | AV F1 | priority ρ | priority r | route 召回 | 叙事干净度 |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const r of rows) {
    if (!r.ok) {
      lines.push(`| ${r.id} | — | — | — | — | — | — | ${r.error} |`);
      continue;
    }
    lines.push(
      `| ${r.id} | ${r.provenance} | ${r.nodeLabelF1} | ${r.avF1} | ${fmt(r.prioritySpearman)} | ${fmt(r.priorityPearson)} | ${fmt(r.perAvRouteRecall)} | ${fmt(r.narrativeCleanScore)}${r.narrativeDirty ? ' ⚠' : ''} |`,
    );
  }
  const dirty = rows.filter(r => r.ok && r.narrativeDirty);
  if (dirty.length) {
    lines.push('', '## 叙事偏脏样本（摘录）', '');
    for (const r of dirty.slice(0, 12)) {
      lines.push(`- **${r.id}**（${r.narrativeCleanScore}）：${(r.narrativeIssues || []).join('；') || '见 JSON flags'}`);
    }
  }
  return lines.join('\n');
}

function main() {
  fs.mkdirSync(REPORTS, { recursive: true });
  const filterId = argValue('--id');
  const ids = filterId
    ? [filterId]
    : fs.readdirSync(EXPERT_ROOT).filter(f => f.endsWith('.chapter.json')).map(f => f.replace('.chapter.json', ''));
  const rows = ids.map(evalPair);
  const subsets = {
    handAuthored: subsetSummary(rows, r => r.provenance === 'hand-authored'),
    curated: subsetSummary(rows, r => r.provenance === 'curated-from-package-chapter'),
    all: subsetSummary(rows, () => true),
  };
  const md = toMarkdown(rows, subsets);
  fs.writeFileSync(path.join(REPORTS, 'expert-graph-eval.md'), md, 'utf8');
  fs.writeFileSync(path.join(REPORTS, 'expert-graph-eval.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    matchRules: MATCH_RULES_DOC,
    honesty: {
      handAuthoredIds: [...HAND_AUTHORED],
      curatedIsNotHumanExpert: true,
      fullSetForEngineeringOnly: true,
    },
    rows,
    subsets,
    summary: subsets.all,
  }, null, 2));

  // Standalone narrative report
  const narrRows = rows.filter(r => r.ok).map(r => ({
    id: r.id,
    score: r.narrativeCleanScore,
    dirty: r.narrativeDirty,
    issues: r.narrativeIssues,
  }));
  fs.writeFileSync(path.join(REPORTS, 'narrative-cleanliness.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    meanScore: mean(narrRows.map(r => r.score)),
    dirtyCount: narrRows.filter(r => r.dirty).length,
    rows: narrRows,
  }, null, 2));

  console.log(md);
}

main();
