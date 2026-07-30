/**
 * Analyze all catalog chapters for Strategy-first / priority graph quality patterns.
 *   node tests/scripts/analyze-yangben-graphs.js
 */
const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const { annotateStrategyMermaidPriority } = require('../../packages/shared/strategy-priority-mermaid');
const { getPackagesRoot } = require('../../packages/shared/data-paths');

const ROOT = path.resolve(__dirname, '../..');
const YANG = path.join(ROOT, '\u6837\u672chtml');
const REPORTS = path.join(getPackagesRoot(), 'reports');

const DOMAIN_LEAK = {
  projectile: /射程|抛射角|初速度|落点|弹道|斜抛/,
  capacitor: /电容|极板|介质|击穿|串并联|储能/,
  pendulum: /摆长|周期|秒摆|摆角/,
  optics: /焦距|物距|像距|折射|透镜|折射率/,
  circuit: /电阻|电流|电压|匝数|RC|时间常数/,
  thermo: /温度|热传导|理想气体|压强/,
};

function detectExpectedDomain(id, topic) {
  if (/projectile|cannon/.test(id)) return 'projectile';
  if (/capacitor/.test(id)) return 'capacitor';
  if (/pendulum/.test(id)) return 'pendulum';
  if (/lens|refraction|photo/.test(id)) return 'optics';
  if (/circuit|series|rc-|transformer|magnetic|efield/.test(id)) return 'circuit';
  if (/heat|gas-ideal/.test(id)) return 'thermo';
  if (/friction|circular|momentum|multi-kp/.test(id)) return 'mechanics';
  return 'other';
}

function isTrap(r) {
  return r?.tier === 'suboptimal' || /trap|盲调|多参|多滑/i.test(`${r?.id || ''}${r?.label || ''}`);
}

function analyzeChapter(entry) {
  const pkgDir = path.join(getPackagesRoot(), entry.id);
  const chapterPath = path.join(pkgDir, 'chapter.json');
  const metaPath = path.join(pkgDir, 'meta.json');
  const sampleGraph = path.join(YANG, entry.dir, '\u56fe\u8c31.html');
  const runtimeGraph = path.join(pkgDir, '\u56fe\u8c31.html');

  const issues = [];
  if (!fs.existsSync(chapterPath)) {
    return { id: entry.id, topic: entry.topic, issues: [{ sev: 'high', problem: 'chapter.json 缺失' }] };
  }
  const chapter = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
  const kg = chapter.kg || {};
  const nodes = kg.nodes || [];
  const strategy = chapter.strategy || {};
  const routes = strategy.routes || [];
  const inquiry = chapter.inquiryScript || {};
  const avs = inquiry.adjustmentVariables || [];
  const cvs = inquiry.confoundingVariables || [];
  const domain = detectExpectedDomain(entry.id, entry.topic);

  // Empty nodes
  const emptyNodes = nodes.filter(n => !String(n.label || '').trim());
  if (emptyNodes.length) {
    issues.push({ sev: 'high', problem: `空标签节点 ${emptyNodes.length} 个: ${emptyNodes.map(n => n.id).join(',')}` });
  }
  if (nodes.length < 6) {
    issues.push({ sev: 'med', problem: `KG 节点过少 (${nodes.length})` });
  }

  // Cross-domain leak (exclude own domain)
  const blob = [
    kg.title,
    ...nodes.map(n => `${n.label} ${n.desc || ''}`),
    strategy.mermaid || '',
    ...(avs.map(a => a.label)),
  ].join('\n');

  for (const [dom, re] of Object.entries(DOMAIN_LEAK)) {
    if (dom === domain) continue;
    // mechanics shouldn't flag projectile loosely; capacitor shouldn't get projectile fields
    if (domain === 'mechanics' && (dom === 'projectile' || dom === 'pendulum')) continue;
    if (domain === 'other') continue;
    const hits = blob.match(new RegExp(re.source, 'g'));
    if (hits && hits.length >= 2) {
      // Cap: only report if clearly foreign (e.g. capacitor with 射程)
      if ((domain === 'capacitor' && dom === 'projectile')
        || (domain === 'optics' && dom === 'projectile')
        || (domain === 'circuit' && dom === 'projectile')
        || (domain === 'thermo' && dom === 'projectile')
        || (domain === 'pendulum' && dom === 'capacitor')
        || (domain === 'projectile' && dom === 'capacitor')) {
        issues.push({
          sev: 'high',
          problem: `疑似串台：本域=${domain} 出现异域「${dom}」词 ${[...new Set(hits)].slice(0, 5).join('/')}`,
        });
      }
    }
  }

  // AV / CV
  const avLabels = avs.map(a => a.label);
  const cvLabels = cvs.map(c => c.label);
  const cvInAv = avs.filter(a =>
    cvs.some(c => c.controlId && c.controlId === a.controlId)
    || /质量|颜色|材质外观/.test(a.label || ''),
  );
  // mass as AV when also CV
  for (const conf of cvs) {
    if (conf.controlId && avs.some(a => a.controlId === conf.controlId)) {
      issues.push({ sev: 'high', problem: `CV 误进 AV：controlId=${conf.controlId} 同时在 AV/CV` });
    }
  }
  // quality error echo
  const qErrors = [
    ...(meta.quality?.errors || []),
    ...(meta.validation?.errors || []),
  ];
  if (qErrors.some(e => /confounding .* must not be traceMap operation/.test(e))) {
    issues.push({ sev: 'high', problem: 'CV 被 traceMap 标成 operation（inquiry 校验失败）' });
  }

  // Single-var routes
  const singleVar = routes.filter(r => /单变量·/.test(r.label || '') && !isTrap(r));
  const preferred = routes.filter(r => !isTrap(r) && r.warn !== 'irrelevant');
  if (avs.length >= 2 && singleVar.length < Math.min(2, avs.length)) {
    issues.push({
      sev: 'high',
      problem: `多 AV(${avs.length}) 但单变量路由仅 ${singleVar.length}：${singleVar.map(r => r.label).join(', ') || '(无)'}`,
    });
  }
  if (preferred.length < 3 && routes.length > 0) {
    issues.push({ sev: 'med', problem: `策略路由不足 3 条语义路径 (preferred=${preferred.length}, raw=${routes.length})` });
  }

  // priorityRank / score tiers
  const ranks = singleVar.map(r => r.priorityRank).filter(x => x != null);
  const scores = preferred.map(r => r.score).filter(x => x != null);
  const uniqueScores = new Set(scores.map(s => Number(s).toFixed(2)));
  if (singleVar.length >= 2 && ranks.length < 2) {
    issues.push({ sev: 'med', problem: '单变量路由缺少 priorityRank 分档' });
  }
  if (preferred.length >= 2 && uniqueScores.size < 2) {
    issues.push({ sev: 'med', problem: `路由 score 未分化（全为 ${scores[0]}）` });
  }
  // Check rank order vs score
  if (singleVar.length >= 2 && ranks.length >= 2) {
    const sorted = [...singleVar].filter(r => r.priorityRank != null)
      .sort((a, b) => a.priorityRank - b.priorityRank);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].score != null && sorted[i - 1].score != null
        && sorted[i].score > sorted[i - 1].score + 0.01) {
        issues.push({
          sev: 'med',
          problem: `priorityRank 与 score 倒置：优先${sorted[i].priorityRank} score=${sorted[i].score} > 优先${sorted[i - 1].priorityRank} score=${sorted[i - 1].score}`,
        });
        break;
      }
    }
  }

  // Strategy mermaid priority annotate preview
  let annotateOk = false;
  let edgeLabels = [];
  try {
    const annotated = annotateStrategyMermaidPriority(strategy.mermaid || '', routes);
    edgeLabels = [...annotated.matchAll(/StrategySelect[^\n]*?(?:-->|-\.->)\s*\|([^|]+)\|/g)]
      .map(m => m[1].trim());
    annotateOk = edgeLabels.some(l => /优先\d+|陷阱/.test(l));
    if (strategy.mermaid && !annotateOk && preferred.length) {
      issues.push({ sev: 'med', problem: '优先级注解后 StrategySelect 边标签未见「优先N/陷阱」' });
    }
  } catch (e) {
    issues.push({ sev: 'high', problem: `priority annotate 失败: ${e.message}` });
  }

  // Graph html presence
  if (!fs.existsSync(sampleGraph)) {
    issues.push({ sev: 'high', problem: '样本夹缺少 图谱.html' });
  } else {
    const html = fs.readFileSync(sampleGraph, 'utf8');
    if (!html.includes('探究策略图')) issues.push({ sev: 'high', problem: '图谱.html 非 Strategy-first 壳' });
    if (/\?\?\/(?:div|h2)>/.test(html)) issues.push({ sev: 'high', problem: '图谱.html CJK 乱码' });
  }
  if (!fs.existsSync(runtimeGraph)) {
    issues.push({ sev: 'med', problem: 'runtime 缺少 图谱.html' });
  }

  // Trap route
  const traps = routes.filter(isTrap);
  if (!traps.length && preferred.length >= 1) {
    issues.push({ sev: 'low', problem: '无陷阱/多参盲调路由' });
  }

  return {
    id: entry.id,
    topic: entry.topic,
    qualityOk: !!meta.quality?.ok,
    qualityScore: meta.quality?.score ?? null,
    nodes: nodes.length,
    avCount: avs.length,
    cvCount: cvs.length,
    avLabels,
    cvLabels,
    singleVarLabels: singleVar.map(r => `${r.label}#${r.priorityRank ?? '?'}@${r.score ?? '?'}`),
    edgeLabels,
    annotateOk,
    issues,
  };
}

function main() {
  const rows = YANG_MAP.map(analyzeChapter);
  const flatIssues = [];
  for (const row of rows) {
    for (const iss of row.issues) {
      flatIssues.push({ id: row.id, topic: row.topic, ...iss });
    }
  }

  // Pattern summary
  const patterns = {};
  for (const iss of flatIssues) {
    const key = iss.problem.replace(/（.*?）/g, '').replace(/\d+/g, 'N').slice(0, 60);
    patterns[key] = (patterns[key] || 0) + 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    total: rows.length,
    withIssues: rows.filter(r => r.issues.length).length,
    highCount: flatIssues.filter(i => i.sev === 'high').length,
    patterns,
    rows,
    issueTable: flatIssues,
  };

  fs.mkdirSync(REPORTS, { recursive: true });
  const outJson = path.join(REPORTS, 'yangben-graph-analysis.json');
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2), 'utf8');

  // Markdown table
  const md = [
    '# 样本图谱问题分析',
    '',
    `生成于 ${report.generatedAt} · ${report.withIssues}/${report.total} 样本有问题 · high=${report.highCount}`,
    '',
    '## 跨样本 pattern',
    '',
    ...Object.entries(patterns)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `- (${n}) ${k}`),
    '',
    '## 明细表',
    '',
    '| 样本 | 问题 | 严重度 |',
    '|------|------|--------|',
    ...flatIssues.map(i => `| ${i.id} | ${i.problem.replace(/\|/g, '/')} | ${i.sev} |`),
    '',
  ].join('\n');
  const outMd = path.join(REPORTS, 'yangben-graph-analysis.md');
  fs.writeFileSync(outMd, md, 'utf8');

  console.log(md);
  console.log('\nWrote', outJson);
}

main();
