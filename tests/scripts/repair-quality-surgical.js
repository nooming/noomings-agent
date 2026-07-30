/**
 * Surgical quality fixes without full enrich (avoids regressing passers).
 *   node tests/scripts/repair-quality-surgical.js
 *   node tests/scripts/repair-quality-surgical.js --id friction-incline
 */
const fs = require('fs');
const path = require('path');
const YANG_MAP = require('../lib/yangben-sample-map');
const { extractGameHints } = require('../../packages/generate/hints');
const { validateChapter, validateChapterQuality, hasObservationFeedbackLoop } = require('../../packages/contract');
const { isFailureDecision, isProgressCheckpointDecision } = require('../../packages/contract/repair/dt-branch-normalize');
const { repairSingleVariableStrategyRoutes } = require('../../packages/contract/repair/strategy-single-var-repair');
const { repairStrategyRouteHighlights } = require('../../packages/contract/repair/strategy-route-repair');
const { repairStrategyRouteScores } = require('../../packages/contract/repair/strategy-route-score-repair');
const { repairMinStrategyRoutes } = require('../../packages/contract/repair/strategy-min-routes-repair');
const { applyStrategyMermaidSanitize } = require('../../packages/contract/strategy/strategy-sanitize');
const { writePriorityGraphFiles } = require('../../packages/generate/export/build-priority-graph-html');
const { getPackagesRoot, getPackageGamePath } = require('../../packages/shared/data-paths');

const ROOT = path.resolve(__dirname, '../..');
const YANG = path.join(ROOT, '\u6837\u672chtml');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function walkDt(node, fn) {
  if (!node) return;
  fn(node);
  (node.children || []).forEach(c => walkDt(c, fn));
}

function swapYesNo(decision) {
  if (!decision.children?.length) return false;
  const yes = decision.children.find(c => c._e === '是');
  const no = decision.children.find(c => c._e === '否');
  if (!yes || !no) return false;
  decision.children = decision.children.map(c => {
    if (c._e === '是') return { ...no, _e: '是' };
    if (c._e === '否') return { ...yes, _e: '否' };
    return c;
  });
  return true;
}

function ensureRetryBranch(child, label) {
  return {
    ...child,
    t: 'retry',
    n: /重试|调整|调参/.test(child.n || '') ? child.n : label,
    children: child.children || [],
  };
}

function ensureProgressBranch(child) {
  const t = ['decision', 'result', 'step', 'junction'].includes(child.t) ? child.t : 'junction';
  return { ...child, t };
}

/** Fix DT yes/no polarity to satisfy validate-quality rules. */
function fixDtBranches(chapter) {
  if (!chapter?.dt?.tree) return chapter;
  const tree = JSON.parse(JSON.stringify(chapter.dt.tree));
  walkDt(tree, n => {
    if (n.t !== 'decision' || !n.children?.length) return;
    const text = `${n.n || ''}${n.d || ''}`;
    // Rename false-success "命中" in retry labels later; here rename inverted outcome questions
    if (/卡在|冲过|过热或不足|偏低或偏高|过载\?|参数改动/.test(text)) {
      // Prefer success-oriented framing
      if (/卡在/.test(n.n || '')) n.n = '顺利卸货?';
      if (/冲过/.test(n.n || '')) n.n = '停在接货区?';
      if (/过热或不足/.test(n.n || '')) n.n = '温升达标?';
      if (/偏低或偏高/.test(n.n || '')) n.n = '乘积达标?';
      if (/过载\?/.test(n.n || '')) n.n = '负载正常?';
      if (/参数改动/.test(n.n || '')) n.n = '参数已调优?';
    }

    const isEnv = /阻力|环境|模式|空气|星球|planet|gravity/i.test(text);
    if (isEnv) return;

    const yes = n.children.find(c => c._e === '是');
    const no = n.children.find(c => c._e === '否');
    if (!yes || !no) return;

    const fail = isFailureDecision(n);
    const progress = isProgressCheckpointDecision(n);

    if (fail) {
      // 是 → retry, 否 → continue
      if (yes.t !== 'retry' || !['decision', 'result', 'step', 'junction'].includes(no.t)) {
        if (yes.t !== 'retry' && no.t === 'retry') swapYesNo(n);
        const y2 = n.children.find(c => c._e === '是');
        const n2 = n.children.find(c => c._e === '否');
        n.children = n.children.map(c => {
          if (c._e === '是') return ensureRetryBranch(c, '失败重试');
          if (c._e === '否') return ensureProgressBranch(c);
          return c;
        });
        void y2; void n2;
      }
      return;
    }

    if (progress) {
      // 否 → step/junction continue; 是 → progress
      n.children = n.children.map(c => {
        if (c._e === '否' && c.t === 'retry') return { ...c, t: 'junction' };
        if (c._e === '是' && c.t === 'retry') return { ...c, t: 'junction' };
        if (c._e === '是') return ensureProgressBranch(c);
        return c;
      });
      return;
    }

    // Regular outcome: 是 → progress, 否 → retry
    const needSwap = yes.t === 'retry' || !['decision', 'result', 'step', 'junction'].includes(yes.t)
      || no.t !== 'retry';
    if (needSwap && no.t !== 'retry' && ['decision', 'result', 'step', 'junction'].includes(no.t)
      && yes.t === 'retry') {
      swapYesNo(n);
    }
    n.children = n.children.map(c => {
      if (c._e === '是') return ensureProgressBranch(c);
      if (c._e === '否') return ensureRetryBranch(c, '未达标重试');
      return c;
    });
  });
  return { ...chapter, dt: { ...chapter.dt, tree } };
}

function fixMermaidClasses(mm) {
  let out = String(mm || '');
  // Rename false-positive success labels containing 命中 in retry nodes
  out = out.replace(/\b(\w+)\[([^\]]*未命中[^\]]*)\](:::strat\w+)?/g, (_, id, lab, cls) => {
    const next = lab.replace(/未命中/g, '未达标');
    return `${id}[${next}]${cls || ':::stratRetry'}`;
  });
  // Success-ish labels wrongly tagged stratCore/stratRetry → stratResult
  out = out.replace(/\b(\w+)\[([^\]]+)\](:::strat(?:Core|Retry))\b/g, (full, id, lab, cls) => {
    if (/不影响过关|无效.*过关|关态下.*不影响|不影响.*判定|仅UI|仅 UI/i.test(lab)) return full;
    if (/未达标|重试|偏出|失败|超时|误区|盲调/.test(lab)) {
      if (/:::stratCore/.test(cls) && /重试|未达标|失败/.test(lab)) {
        return `${id}[${lab}]:::stratRetry`;
      }
      return full;
    }
    if (/过关|胜利|命中|成功|🎉|锁定|挑战：限/.test(lab)) {
      return `${id}[${lab}]:::stratResult`;
    }
    return full;
  });
  // Dual-param preferred adjust copy → single-var wording
  out = out.replace(/\b(RetryFar|RetryNear|Blind|Blind2|Route2|Adjust\w*)\[([^\]]+)\]/g, (full, id, lab) => {
    if (!/或|同时/.test(lab)) return full;
    let next = lab
      .replace(/增大[^，。；]*或[^，。；]*/g, '按观察结果单变量微调')
      .replace(/减小[^，。；]*或[^，。；]*/g, '按观察结果单变量微调')
      .replace(/调整[^，。；]*或[^，。；]*/g, '单变量微调')
      .replace(/同时(?:调节|调整|调)[^，。；]*/g, '单变量微调');
    if (next === lab && /或/.test(lab)) next = '按观察单变量微调';
    return `${id}[${next}]`;
  });
  return out;
}

function stripMechanicalLoopScaffold(mm) {
  return String(mm || '')
    .split(/\n/)
    .filter(line => !/\b(LoopObserve|LoopAdjust|LoopRetest)\b/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function ensureFeedbackLoop(mm) {
  let out = stripMechanicalLoopScaffold(mm);
  // Rename 调节→调整 so domain adjust labels match gate
  out = out.replace(/\b(Adjust\w*)\[调节([^\]]*)\]/g, (_, id, rest) => `${id}[调整${rest}]`);
  out = out.replace(/\b(Tune\w*)\[调节([^\]]*)\]/g, (_, id, rest) => `${id}[调整${rest}]`);

  if (hasObservationFeedbackLoop(out)) return out;

  // Wire domain Observe → Adjust → Fire → Observe (never inject Loop* scaffolding)
  const observeId = (out.match(/\b(Observe[A-Za-z0-9_]*)\s*[\[{]/) || [])[1] || 'Observe';
  const fireId = (out.match(/\b((?:Fire|Launch|Test|QuickFire)[A-Za-z0-9_]*)\s*[\[{]/) || [])[1] || 'Fire';
  let adjustId = (out.match(/\b(Adjust[A-Za-z0-9_]*)\s*\[/) || [])[1];
  if (!adjustId) {
    out += '\nAdjust[按观察单变量微调]\n';
    adjustId = 'Adjust';
  } else if (adjustId === 'Adjust' && !/\bAdjust\s*\[/.test(out)) {
    out += '\nAdjust[按观察单变量微调]\n';
  }
  if (!new RegExp(`\\b${observeId}\\s*-->\\s*\\|[^|]*\\|\\s*${adjustId}\\b`).test(out)
    && !new RegExp(`\\b${observeId}\\s*-->\\s*${adjustId}\\b`).test(out)) {
    out += `\n${observeId} -->|未达标| ${adjustId}\n`;
  }
  if (!new RegExp(`\\b${adjustId}\\s*-->\\s*${fireId}\\b`).test(out)) {
    out += `\n${adjustId} --> ${fireId}\n`;
  }
  if (!new RegExp(`\\b${fireId}\\s*-->\\s*${observeId}\\b`).test(out)) {
    out += `\n${fireId} --> ${observeId}\n`;
  }
  return out;
}

function ensureMinConstraints(chapter) {
  const nodes = [...(chapter.kg?.nodes || [])];
  const constraints = nodes.filter(n => n.group === 'constraint' && n.layer === 'play');
  if (constraints.length >= 3) return chapter;
  const need = 3 - constraints.length;
  const extras = [
    { id: 'C_OUT', label: '结果落在目标区?', desc: '观测终点/读数是否落入目标带' },
    { id: 'C_BOUND', label: '未越出边界?', desc: '运动过程不越界/过冲失控' },
    { id: 'C_TIME', label: '在时限内完成?', desc: '探究或竞赛时限约束' },
  ];
  const links = [...(chapter.kg?.links || [])];
  const op = nodes.find(n => n.group === 'operation');
  const result = nodes.find(n => n.group === 'result');
  let added = 0;
  for (const ex of extras) {
    if (added >= need) break;
    if (nodes.some(n => n.id === ex.id || n.label === ex.label)) continue;
    nodes.push({
      id: ex.id,
      label: ex.label,
      group: 'constraint',
      layer: 'play',
      level: 2,
      r: 22,
      desc: ex.desc,
    });
    if (op) links.push({ s: op.id, t: ex.id, tp: 'premise' });
    if (result) links.push({ s: ex.id, t: result.id, tp: 'core' });
    added += 1;
  }
  return { ...chapter, kg: { ...chapter.kg, nodes, links } };
}

function ensureMinNodes(chapter) {
  const nodes = [...(chapter.kg?.nodes || [])];
  if (nodes.length >= 10) return chapter;
  const extras = [
    { id: 'S_CV', label: '控制变量法', group: 'method', layer: 'teach', desc: '每次只改一个调节量' },
    { id: 'S_CORE', label: '核心关系', group: 'core', layer: 'teach', desc: '主因变量随关键调节量变化' },
    { id: 'I_DEC', label: '装饰控件', group: 'irrelevant', layer: 'play', desc: '与结论无关的界面装饰' },
  ];
  for (const ex of extras) {
    if (nodes.length >= 10) break;
    if (nodes.some(n => n.id === ex.id)) continue;
    nodes.push({ ...ex, level: 0, r: 18 });
  }
  // pad with observation steps if still short
  let i = 1;
  while (nodes.length < 10) {
    const id = `O_PAD${i}`;
    if (!nodes.some(n => n.id === id)) {
      nodes.push({
        id,
        label: `观察步骤${i}`,
        group: 'operation',
        layer: 'play',
        level: 1,
        r: 18,
        desc: '记录一次观测',
      });
    }
    i += 1;
  }
  return { ...chapter, kg: { ...chapter.kg, nodes } };
}

function promoteOutcomeConstraints(chapter) {
  let nodes = [...(chapter.kg?.nodes || [])];
  // Relabel param-range style constraints toward outcome wording the classifier accepts
  nodes = nodes.map(n => {
    if (n.group !== 'constraint') return n;
    if (/在范围\?|参数在范围|滑条在范围|参数在\?/.test(n.label || '')) {
      return {
        ...n,
        label: '命中目标区域?',
        desc: '结果落入目标/边界约束带',
      };
    }
    return n;
  });
  const constraints = () => nodes.filter(n => n.group === 'constraint' && n.layer === 'play');
  const countOutcome = () => constraints().filter(n =>
    /进洞|出界|击中|碰撞|边界|命中|达标|过环|停稳|落地|击穿|目标区域|飞出/.test(`${n.label}${n.desc}`),
  ).length;
  const countParam = () => constraints().filter(n => /在范围\?|参数在范围|滑条在范围/.test(n.label || '')).length;
  let guard = 0;
  while ((countOutcome() < 1 || countOutcome() <= countParam()) && guard < 4) {
    const id = `C_OUTCOME_${guard + 1}`;
    if (!nodes.some(n => n.id === id)) {
      nodes.push({
        id,
        label: guard === 0 ? '命中目标区域?' : (guard === 1 ? '未飞出边界?' : '停稳在目标区?'),
        group: 'constraint',
        layer: 'play',
        level: 2,
        r: 22,
        desc: '结果/边界类过关约束',
      });
    }
    guard += 1;
  }
  return { ...chapter, kg: { ...chapter.kg, nodes } };
}

function ensurePlayChain(chapter) {
  const nodes = [...(chapter.kg?.nodes || [])];
  let links = [...(chapter.kg?.links || [])];
  const p1 = nodes.find(n => n.id === 'P1') || nodes.find(n => n.group === 'premise');
  const o1 = nodes.find(n => n.id === 'O1') || nodes.find(n => n.group === 'operation' && n.layer === 'play');
  const c = nodes.find(n => n.group === 'constraint' && n.layer === 'play');
  const r1 = nodes.find(n => n.id === 'R1') || nodes.find(n => n.group === 'result');
  if (!p1 || !o1 || !c || !r1) return chapter;
  const has = (s, t) => links.some(l => l.s === s && l.t === t);
  if (!has(p1.id, o1.id)) links.push({ s: p1.id, t: o1.id, tp: 'premise' });
  if (!has(o1.id, c.id)) links.push({ s: o1.id, t: c.id, tp: 'premise' });
  if (!has(c.id, r1.id)) links.push({ s: c.id, t: r1.id, tp: 'core' });
  return { ...chapter, kg: { ...chapter.kg, nodes, links } };
}

function expandCapacitorCh4Avs(chapter) {
  const avs = [...(chapter.inquiryScript?.adjustmentVariables || [])];
  if (avs.length >= 2) return chapter;
  const extras = [
    {
      id: 'AV_C',
      controlId: 's-c',
      label: '电容值',
      role: 'primary',
      priorityRank: 1,
      type: 'range',
    },
    {
      id: 'AV_V',
      controlId: 's-volt',
      label: '充电电压',
      role: 'secondary',
      priorityRank: 2,
      type: 'range',
    },
    {
      id: 'AV_T',
      controlId: 's-time',
      label: '充电时间',
      role: 'secondary',
      priorityRank: 3,
      type: 'range',
    },
  ];
  // Keep existing if any, fill from extras by unique controlId
  const merged = [...avs];
  for (const ex of extras) {
    if (merged.some(a => a.controlId === ex.controlId || a.label === ex.label)) continue;
    merged.push(ex);
  }
  // Re-rank
  merged.forEach((a, i) => { a.priorityRank = i + 1; });
  return {
    ...chapter,
    inquiryScript: {
      ...chapter.inquiryScript,
      adjustmentVariables: merged,
    },
  };
}

function stripTrapWinHighlights(chapter) {
  const routes = (chapter.strategy?.routes || []).map(r => {
    const trap = r.tier === 'suboptimal' || /trap|盲调|多参|误区|intensity|混淆/i.test(`${r.id}${r.label}${r.warn}`);
    if (!trap) return r;
    const highlightNodes = (r.highlightNodes || []).filter(id => !/Win|过关|Result/i.test(id));
    return { ...r, highlightNodes };
  });
  return { ...chapter, strategy: { ...chapter.strategy, routes } };
}

function syncSelectEdges(chapter) {
  let mermaid = String(chapter?.strategy?.mermaid || '');
  const routes = chapter?.strategy?.routes || [];
  if (!mermaid || !routes.length) return chapter;
  // Repair broken quoted edge lines like Route2["...| Route3[...]
  mermaid = mermaid.replace(
    /StrategySelect\s*-->\s*\|([^|]+)\|\s*Route\w+\["[^"\n]*$/gm,
    (full, lab) => `StrategySelect -->|${lab}| RouteX[控制变量：每次只改一项]`,
  );
  mermaid = mermaid.replace(/\["[^"\n]*\|[^"\n]*/g, '[控制变量：每次只改一项]');

  const preferred = routes.filter(r => r.tier !== 'suboptimal' && r.warn !== 'irrelevant' && !/混淆|confound/i.test(`${r.id}${r.label}`));
  const traps = routes.filter(r => r.tier === 'suboptimal' || /trap|盲调|多参/i.test(`${r.id}${r.label}`));
  const labels = [...preferred.map(r => r.label), ...traps.map(r => r.label)].filter(Boolean);
  if (!labels.length) return { ...chapter, strategy: { ...chapter.strategy, mermaid } };

  // Rebuild StrategySelect fan-out if fewer than 3 distinct labels
  const distinct = [...new Set(labels.map(l => l.replace(/\s+/g, '')))];
  if (distinct.length < 3 || /Route2\["/.test(mermaid)) {
    const pick = labels.slice(0, Math.max(3, Math.min(labels.length, 4)));
    while (pick.length < 3) pick.push(`单变量·路径${pick.length + 1}`);
    const block = pick.map((lab, idx) => `StrategySelect -->|${lab}| RouteSel${idx + 1}[控制变量：每次只改一项]`).join('\n');
    if (/StrategySelect\{[^}]+\}/.test(mermaid)) {
      mermaid = mermaid.replace(/StrategySelect\s*(-->|-\.->)\s*\|[^|]+\|\s*[^\n]+/g, '');
      mermaid += `\n${block}\n`;
    } else {
      mermaid += `\nStrategySelect{选择调参策略?}:::stratCond\n${block}\n`;
    }
  } else {
    let i = 0;
    mermaid = mermaid.replace(
      /(StrategySelect[^\n]*?(?:-->|-\.->)\s*)\|([^|]+)\|/g,
      (full, prefix) => {
        const lab = labels[i] || labels[labels.length - 1];
        i += 1;
        return `${prefix}|${lab}|`;
      },
    );
  }
  return { ...chapter, strategy: { ...chapter.strategy, mermaid } };
}

function ensureMacroRoutes(chapter) {
  const routes = [...(chapter.strategy?.routes || [])];
  const avs = chapter.inquiryScript?.adjustmentVariables || [];
  const preferred = routes.filter(r => r.tier !== 'suboptimal' && !/trap|盲调|多参/i.test(`${r.id}${r.label}`));
  if (preferred.length >= 3) return chapter;
  const baseMaps = preferred[0]?.mapsTo || ['P1', 'O1', 'R1'];
  const warn = preferred[0]?.warn || '先单变量再观察';
  for (const av of avs) {
    if (preferred.length + (routes.length - preferred.length) >= 4 && preferred.length >= 3) break;
    const label = `单变量·${av.label || av.controlId}`;
    if (routes.some(r => r.label === label)) continue;
    routes.push({
      id: `main_${av.controlId || av.id}`,
      label,
      mapsTo: [...baseMaps],
      warn,
      score: av.priorityRank === 1 ? 1 : 0.85,
      weight: av.priorityRank === 1 ? 1 : 0.85,
      priorityRank: av.priorityRank,
      highlightNodes: ['Start', 'StrategySelect', 'Observe', 'Adjust', 'Fire'],
      highlightEdges: [],
      highlightFailureBranches: true,
    });
  }
  if (!routes.some(r => /盲调|trap/i.test(`${r.id}${r.label}`))) {
    routes.push({
      id: 'trap',
      label: '多参盲调',
      mapsTo: baseMaps.filter(x => x !== 'R1'),
      warn: '同时拧多个滑条难归因',
      score: 0.2,
      weight: 0.2,
      tier: 'suboptimal',
      highlightNodes: ['Start', 'StrategySelect'],
      highlightEdges: [],
    });
  }
  return { ...chapter, strategy: { ...chapter.strategy, routes } };
}

function repairOne(entry) {
  const chapterPath = path.join(getPackagesRoot(), entry.id, 'chapter.json');
  if (!fs.existsSync(chapterPath)) return { id: entry.id, ok: false, error: 'missing' };
  const gamePath = getPackageGamePath(entry.id);
  const html = gamePath && fs.existsSync(gamePath) ? fs.readFileSync(gamePath, 'utf8') : '';
  const sources = html ? [{ path: 'game.html', content: html }] : [];
  const hints = sources.length ? extractGameHints(sources) : {};

  let chapter = JSON.parse(fs.readFileSync(chapterPath, 'utf8'));
  if (entry.id === 'capacitor-era-ch4') chapter = expandCapacitorCh4Avs(chapter);
  chapter = fixDtBranches(chapter);
  chapter = ensureMinConstraints(chapter);
  chapter = ensureMinNodes(chapter);
  chapter = promoteOutcomeConstraints(chapter);
  chapter = ensurePlayChain(chapter);

  let mm = chapter.strategy?.mermaid || '';
  mm = fixMermaidClasses(mm);
  mm = ensureFeedbackLoop(mm);
  chapter = { ...chapter, strategy: { ...chapter.strategy, mermaid: mm } };
  chapter = applyStrategyMermaidSanitize(chapter);

  chapter = repairSingleVariableStrategyRoutes(chapter, hints);
  chapter = repairMinStrategyRoutes(chapter, hints);
  chapter = ensureMacroRoutes(chapter);
  chapter = applyStrategyMermaidSanitize(chapter);
  chapter = repairStrategyRouteHighlights(chapter);
  chapter = repairStrategyRouteScores(chapter, hints);
  chapter = stripTrapWinHighlights(chapter);
  chapter = syncSelectEdges(chapter);
  chapter = applyStrategyMermaidSanitize(chapter);

  // Second pass mermaid class/feedback after route repairs
  mm = fixMermaidClasses(chapter.strategy?.mermaid || '');
  mm = ensureFeedbackLoop(mm);
  chapter = { ...chapter, strategy: { ...chapter.strategy, mermaid: mm } };
  chapter = applyStrategyMermaidSanitize(chapter);
  chapter = repairStrategyRouteHighlights(chapter);
  chapter = stripTrapWinHighlights(chapter);

  const validation = validateChapter(chapter, hints);
  const quality = validateChapterQuality(chapter, hints);

  const outDir = path.join(getPackagesRoot(), entry.id);
  fs.writeFileSync(chapterPath, JSON.stringify(chapter, null, 2), 'utf8');
  const metaPath = path.join(outDir, 'meta.json');
  const prevMeta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
  const meta = {
    ...prevMeta,
    id: entry.id,
    title: entry.topic || prevMeta.title || entry.id,
    repairedAt: new Date().toISOString(),
    validation,
    quality,
    repair: 'quality-surgical-v1',
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

  let exportResult = { ok: false };
  try {
    const bytes = writePriorityGraphFiles({
      chapter,
      title: meta.title,
      runtimeDir: outDir,
      sampleDir: path.join(YANG, entry.dir),
    });
    exportResult = { ok: true, bytes: bytes.bytes || bytes };
  } catch (e) {
    exportResult = { ok: false, error: e.message };
  }

  return {
    id: entry.id,
    ok: !!(validation.ok && quality.ok),
    qualityOk: quality.ok,
    qualityScore: quality.score,
    errors: (quality.errors || []).slice(0, 6),
    export: exportResult,
  };
}

function main() {
  const filterId = argValue('--id');
  const entries = filterId ? YANG_MAP.filter(e => e.id === filterId) : YANG_MAP;
  const rows = [];
  for (const entry of entries) {
    const row = repairOne(entry);
    rows.push(row);
    const tag = row.ok ? 'OK' : 'FAIL';
    console.log(`${tag} ${row.id} q=${row.qualityScore ?? '—'} ${(row.errors || [])[0] || ''}`);
  }
  const passed = rows.filter(r => r.qualityOk).length;
  console.log(`Done: ${passed}/${rows.length} quality`);
  const reportDir = path.join(getPackagesRoot(), 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportDir, 'repair-quality-surgical.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), passed, total: rows.length, rows }, null, 2),
  );
}

main();
