/**
 * Audit sparse highlights + CV visibility across runtime chapters / 图谱.html.
 * Writes: data/runtime/packages/reports/strategy-highlight-cv-analysis.md
 */
const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const { expandRouteHighlight } = require('../../packages/shared/strategy-mermaid-parse.js');
const { getPackagesRoot } = require('../../packages/shared/data-paths');

const ROOT = path.resolve(__dirname, '../..');
const YANG = path.join(ROOT, '\u6837\u672chtml');
const REPORT_DIR = path.join(getPackagesRoot(), 'reports');

const SKELETON = new Set(['Start', 'StrategySelect', 'Win', 'ModeExplore', 'ModeCompete', 'Env']);

function isSkeletonOnly(nodes) {
  if (!nodes || nodes.length === 0) return true;
  if (nodes.length <= 3) return true;
  return nodes.every(n => SKELETON.has(n) || /^Mode/i.test(n) || n === 'Env' || /^Win/i.test(n) || /^Challenge/i.test(n));
}

function isSparse(route) {
  const nodes = route.highlightNodes || [];
  const edges = route.highlightEdges || [];
  return isSkeletonOnly(nodes) || (!edges.length && nodes.length < 6);
}

function isSingleVar(route) {
  return /单变量·/.test(route.label || '');
}

function cvList(ch) {
  return (ch?.inquiryScript?.confoundingVariables || []).filter(c => c && (c.label || c.controlId));
}

function auditPackage(entry) {
  const outDir = path.join(getPackagesRoot(), entry.id);
  const chapterPath = path.join(outDir, 'chapter.json');
  if (!fs.existsSync(chapterPath)) {
    return { id: entry.id, ok: false, error: 'missing chapter.json' };
  }
  const ch = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
  const mermaid = ch.strategy?.mermaid || '';
  const routes = ch.strategy?.routes || [];
  const cvs = cvList(ch);
  const irrKg = (ch.kg?.nodes || []).filter(n => n.group === 'irrelevant');
  const mermaidHasCv = /试探混淆|混淆·|ProbeCV|ConfoundProbe|:::stratInvalid/i.test(mermaid)
    && /试探混淆|混淆/.test(mermaid);
  const routeCv = routes.filter(r =>
    r.kind === 'confoundProbe'
    || /试探混淆|混淆触碰/.test(r.label || '')
    || (r.warn === 'irrelevant' && /混淆|无关/.test(r.label || '')),
  );

  const selectEdges = [];
  for (const line of mermaid.split(/\n/)) {
    const m = line.match(/\bStrategySelect\b[^\n]*?(?:-->|-\\.->)\s*\|([^|]+)\|\s*([A-Za-z][A-Za-z0-9_]*)/);
    if (m) selectEdges.push({ label: m[1].trim(), to: m[2] });
  }

  const routeRows = routes.map(r => {
    const sparse = isSparse(r);
    const expanded = expandRouteHighlight(r, mermaid, {});
    const nodes = expanded.highlightNodes || [];
    const hasFire = nodes.some(id => /^(Fire|Launch|Tune)/i.test(id));
    const hasObserve = nodes.some(id => /^Observe/i.test(id));
    const hasEntry = nodes.some(id => /Route|Strat|Dist|Mat|Area|Trap|Path|Tune|Single|Adjust/i.test(id)
      && !/StrategySelect/i.test(id));
    const expandOk = !isSingleVar(r) || (hasFire && hasObserve && (hasEntry || nodes.some(id => /^Adjust/i.test(id))));
    const edgeMatch = selectEdges.find(e => {
      const a = String(e.label || '').replace(/\s*·\s*优先\d+.*$/u, '').replace(/\s+/g, '');
      const b = String(r.label || '').replace(/\s+/g, '');
      return a === b || a.includes(b) || b.includes(a);
    });
    return {
      id: r.id,
      label: r.label,
      priorityRank: r.priorityRank,
      sparse,
      storedNodes: (r.highlightNodes || []).length,
      storedEdges: (r.highlightEdges || []).length,
      expandNodes: nodes.length,
      expandOk,
      sample: (r.highlightNodes || []).slice(0, 6),
      expandSample: nodes.slice(0, 10),
      selectEdge: edgeMatch ? `${edgeMatch.label}→${edgeMatch.to}` : null,
      single: isSingleVar(r),
    };
  });

  const sampleGraph = path.join(YANG, entry.dir, '\u56fe\u8c31.html');
  const runtimeGraph = path.join(outDir, '\u56fe\u8c31.html');

  return {
    id: entry.id,
    topic: entry.topic,
    dir: entry.dir,
    routes: routeRows,
    sparseCount: routeRows.filter(r => r.sparse).length,
    singleSparse: routeRows.filter(r => r.single && r.sparse).length,
    singleTotal: routeRows.filter(r => r.single).length,
    expandFail: routeRows.filter(r => r.single && !r.expandOk).length,
    cvs: cvs.map(c => ({ id: c.id, label: c.label, controlId: c.controlId })),
    irrKg: irrKg.map(n => ({ id: n.id, label: n.label })),
    mermaidHasCv,
    routeCvCount: routeCv.length,
    hasSampleGraph: fs.existsSync(sampleGraph),
    hasRuntimeGraph: fs.existsSync(runtimeGraph),
    selectEdges,
  };
}

function rootCauseFor(pkg) {
  const causes = [];
  if (pkg.singleSparse > 0 && pkg.expandFail === 0) {
    causes.push('chapter 未持久化 repair（expand 运行时可补全，但导出/落盘仍是骨架）');
  }
  if (pkg.expandFail > 0) {
    causes.push('标签/边匹配失败或 Mermaid 缺对应 StrategySelect 边（seed 无法播种）');
  }
  if (pkg.cvs.length && !pkg.mermaidHasCv && pkg.routeCvCount === 0) {
    causes.push('CV 仅在 inquiryScript/KG，策略图无试探混淆支路');
  }
  if (!pkg.hasSampleGraph) {
    causes.push('样本夹缺 图谱.html（导出未同步）');
  }
  return causes;
}

function main() {
  const pkgs = YANG_MAP.map(auditPackage).filter(p => !p.error);
  // Extra sample ≥8: take first 10 yangben + any with sparse
  const focus = pkgs.slice(0, 12);

  let totalRoutes = 0;
  let sparseRoutes = 0;
  let singleTotal = 0;
  let singleSparse = 0;
  let expandFail = 0;
  let cvPresent = 0;
  let cvVisible = 0;

  for (const p of pkgs) {
    totalRoutes += p.routes.length;
    sparseRoutes += p.sparseCount;
    singleTotal += p.singleTotal;
    singleSparse += p.singleSparse;
    expandFail += p.expandFail;
    if (p.cvs.length) cvPresent += 1;
    if (p.mermaidHasCv || p.routeCvCount > 0) cvVisible += 1;
  }

  const lines = [];
  lines.push('# 策略高亮稀疏 + 混淆变量可视 分析报告');
  lines.push('');
  lines.push(`生成时间：${new Date().toISOString()}`);
  lines.push('');
  lines.push('## 1. 总览');
  lines.push('');
  lines.push(`- 抽样包数（样本地图）：**${pkgs.length}**`);
  lines.push(`- 路由总数：**${totalRoutes}**；稀疏（≤3 或仅 Start/Select/Win 骨架 / 无边且 <6 节点）：**${sparseRoutes}**（${(sparseRoutes / Math.max(1, totalRoutes) * 100).toFixed(1)}%）`);
  lines.push(`- 「单变量·」路由：**${singleTotal}**；其中稀疏：**${singleSparse}**（${(singleSparse / Math.max(1, singleTotal) * 100).toFixed(1)}%）`);
  lines.push(`- 运行时 expand 后仍缺 Fire/Observe/入口：**${expandFail}**（多为边标签与 route 不匹配或缺边）`);
  lines.push(`- 有 CV 数据的包：**${cvPresent}/${pkgs.length}**；策略图/路由已体现 CV：**${cvVisible}/${pkgs.length}**`);
  lines.push('');
  lines.push('## 2. 根因分类');
  lines.push('');
  lines.push('1. **route 数据残缺（主因）**：`makeRoute` / 单变量 plan 默认 `highlightNodes: [Start, StrategySelect]`、`highlightEdges: []`；次优「优先2/3」常落盘为 Start/Select/Win。');
  lines.push('2. **repair 未全量跑**：`repairStrategyRouteHighlights` + seed spine 已能补全；先前只修了约 5 个包（斜面/斜抛/机械能/电容介质/圆周），其余 chapter 仍骨架。');
  lines.push('3. **pathRespectsHlOrig 历史坑**：expand  pairwise 要求路径节点已在原 highlight；已由 `seedSingleVarRouteSpine`（按 StrategySelect\\|label\\| 播种）缓解。viewer 点击会 expand，但若种子匹配失败仍只亮骨架。');
  lines.push('4. **标签改写后匹配**：优先注解会改边标签为「·优先n·score」；normalize 会 strip。仍有 **语义串名**（route「逸出功」→ 边目标 PathIntensity 等）——高亮跟边走，路径可亮但教学节点名错。');
  lines.push('5. **导出未带上 repair 后 chapter**：部分样本夹曾缺或旧 图谱.html；需 repair 后 `writePriorityGraphFiles` 全量重导。');
  lines.push('6. **CV 可视缺失**：`confoundingVariables` / KG `irrelevant` 在 JSON 中常见，但 **strategy.mermaid 无「试探混淆」支路**，routes 无 `confoundProbe`，图例只列 AV/陷阱。');
  lines.push('');
  lines.push('## 3. 样本×路由问题表（重点包）');
  lines.push('');
  lines.push('| 包 | 稀疏单变量 | expand失败 | CV数 | 图有CV支路 | 样本图谱 | 根因摘要 |');
  lines.push('|----|------------|------------|------|------------|----------|----------|');
  for (const p of focus) {
    const causes = rootCauseFor(p).join('；') || 'OK';
    lines.push(`| ${p.id}（${p.topic}） | ${p.singleSparse}/${p.singleTotal} | ${p.expandFail} | ${p.cvs.length} | ${p.mermaidHasCv || p.routeCvCount ? '是' : '否'} | ${p.hasSampleGraph ? '有' : '缺'} | ${causes} |`);
  }
  lines.push('');
  lines.push('### 稀疏路由明细（单变量）');
  lines.push('');
  lines.push('| 包 | route.id | label | pr | 落盘节点 | expand后 | select边 |');
  lines.push('|----|-----------|-------|----|----------|----------|----------|');
  for (const p of pkgs) {
    for (const r of p.routes) {
      if (!r.single || !r.sparse) continue;
      lines.push(`| ${p.id} | ${r.id} | ${r.label} | ${r.priorityRank ?? ''} | ${r.sample.join('→')} (${r.storedNodes}) | ${r.expandSample.join('→')} (${r.expandNodes}) | ${r.selectEdge || '—'} |`);
    }
  }
  lines.push('');
  lines.push('## 4. 混淆变量现状');
  lines.push('');
  lines.push('- **数据层**：多数包 `inquiryScript.confoundingVariables` 非空；KG 常有 `group=irrelevant` 的 I*。');
  lines.push('- **策略图**：StrategySelect 出边几乎只有「单变量·* / 多参盲调」；**无「试探混淆·{label}」虚线/低分支**。');
  lines.push('- **图例**：仅调节优先级 + AV/陷阱按钮；CV 预览不可见。');
  lines.push('- **会议要求**：须识别混淆量；图谱可见无关/混淆支路（迷思环或侧枝）；**不得**抬成高优单变量主路径（无 priorityRank 竞争，低分 confoundProbe）。');
  lines.push('');
  lines.push('## 5. 管线改造建议（阶段2）');
  lines.push('');
  lines.push('1. 全量 `repairStrategyRouteHighlights` + export 所有 yangben 样本。');
  lines.push('2. 新增 CV 可视 repair：注入 StrategySelect `-.->|试探混淆·L| ProbeCV` → Invalid → 回主策略；routes 增加 `kind:confoundProbe` 低分。');
  lines.push('3. analyze prompt / route-plan / sanitize：生成时带 CV 支路；priority annotate 对 confound 用虚线且不参与优先1–n。');
  lines.push('4. 抽验：斜面摩擦、斜抛、电容、机械能 + ≥2 个曾稀疏包；优先2/3 整路亮；混淆支路可见。');
  lines.push('');

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const outMd = path.join(REPORT_DIR, 'strategy-highlight-cv-analysis.md');
  const outJson = path.join(REPORT_DIR, 'strategy-highlight-cv-analysis.json');
  fs.writeFileSync(outMd, lines.join('\n'), 'utf8');
  fs.writeFileSync(outJson, JSON.stringify({ pkgs, totals: { totalRoutes, sparseRoutes, singleTotal, singleSparse, expandFail, cvPresent, cvVisible } }, null, 2), 'utf8');
  console.log(`Wrote ${outMd}`);
  console.log(JSON.stringify({ totalRoutes, sparseRoutes, singleTotal, singleSparse, expandFail, cvPresent, cvVisible }, null, 2));
}

main();
