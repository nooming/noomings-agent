/**
 * Approximate old session-level 4D PCA (memory: n≈49, PC1~60%) with KMO/MSA.
 * Primary deliverable: full equal-weight session 4D PCA (eigen / loadings /
 * names / teaching notes) on the high-KMO terminal pool; KMO is suitability.
 *
 * Closest gate to the archived run (abilityScore then v3, finite total):
 *   - terminalOutcome ∈ {pass, exhausted_fail}
 *   - abilityScore v4 with finite total (not pending)
 *   - 4D: [challengeResult|result, exploreProcess, challengeProcess, efficiency]
 *   - missing raws → 0 (v4 contrib=0 semantics). Column-mean impute is reported as
 *     unusable here: under v4, Pe/E are almost always null → near-zero variance.
 *   - drop playtest / full-eval / 全量* / anonymous junk; keep 李四/王五
 *
 * Writes:
 *   - data/runtime/analysis/reports/session-pca-kmo-approx49.md  (full report)
 *   - radar-pca-analysis.md appendix pointer only (does not touch student body)
 *
 * Strict sensitivity (「四维均有限」): complete cases only — usually tiny under v4.
 *
 * Usage:
 *   node scripts/session-pca-kmo-approx49.js
 *   node scripts/session-pca-kmo-approx49.js --traces-root=./data/runtime/analysis/traces-全部-20260816
 *   node scripts/session-pca-kmo-approx49.js --include-observe-only
 *
 * Default excludes observe-only / researchInclude=false sessions (same as radar-pca).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  runPythonKmo,
  runPythonPca,
  interpretKmo,
  interpretPca,
  suggestPcNames,
  listStudentsFromTracesRoot,
  isSyntheticLabel,
  resolveTracesRoot,
  fmtNum,
  fmtPct,
} = require('./radar-pca-analysis');
const { deriveTerminalOutcome } = require('../packages/judge/session-terminal');
const { getReportsRoot } = require('../packages/shared/data-paths');

const SESSION_4D_LABELS_ZH = [
  '竞赛结果',
  '探究过程',
  '竞赛过程',
  '效率',
];
const DIM_KEYS = [
  'challengeResult',
  'exploreProcess',
  'challengeProcess',
  'efficiency',
];

const REPORT_MD = path.join(getReportsRoot(), 'radar-pca-analysis.md');
const STANDALONE_MD = path.join(getReportsRoot(), 'session-pca-kmo-approx49.md');

function finiteRaw(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Prefer challengeResult.raw; fall back to result.raw (legacy). */
function challengeOrResultRaw(abilityScore) {
  const parts = abilityScore?.parts || {};
  const cr = finiteRaw(parts.challengeResult?.raw);
  if (cr != null) return { value: cr, source: 'challengeResult' };
  const r = finiteRaw(parts.result?.raw);
  if (r != null) return { value: r, source: 'result' };
  return { value: null, source: null };
}

function outcomeOf(session) {
  return deriveTerminalOutcome({
    ...session,
    terminalOutcome: session?.terminalOutcome || session?.sessionOutcome || null,
    verdict: session?.verdict || session?.judgeResult?.verdict || null,
    judgeResult: session?.judgeResult || null,
    abilityScore: session?.abilityScore || null,
    attemptsExhausted: session?.attemptsExhausted,
    events: session?.events,
  });
}

function hasFiniteTotal(abilityScore) {
  if (!abilityScore || Number(abilityScore.version) !== 4) return false;
  if (abilityScore.pending) return false;
  return Number.isFinite(Number(abilityScore.total));
}

function extract4d(session) {
  const a = session?.abilityScore;
  if (!a || Number(a.version) !== 4) return null;
  const parts = a.parts || {};
  const cr = challengeOrResultRaw(a);
  return {
    challengeResult: cr.value,
    exploreProcess: finiteRaw(parts.exploreProcess?.raw),
    challengeProcess: finiteRaw(parts.challengeProcess?.raw),
    efficiency: finiteRaw(parts.efficiency?.raw),
    resultSource: cr.source,
    finiteN: [cr.value, finiteRaw(parts.exploreProcess?.raw), finiteRaw(parts.challengeProcess?.raw), finiteRaw(parts.efficiency?.raw)]
      .filter((x) => x != null).length,
  };
}

/** Fill missing raw with 0 (matches v4 fixed-weight contrib=0). */
function fillMissingWithZero(rows) {
  const columnMissing = {};
  const meansObserved = {};
  for (const k of DIM_KEYS) {
    const xs = rows.map((r) => r[k]).filter((n) => Number.isFinite(n));
    meansObserved[k] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    columnMissing[k] = rows.length - xs.length;
  }
  const filled = rows.map((r) => {
    const out = { ...r };
    const missingKeys = [];
    for (const k of DIM_KEYS) {
      if (!Number.isFinite(out[k])) {
        missingKeys.push(k);
        out[k] = 0;
      }
    }
    out._imputedKeys = missingKeys;
    out._imputedN = missingKeys.length;
    out._fillMode = 'zero';
    return out;
  });
  return { rows: filled, meansObserved, columnMissing, fillMode: 'zero' };
}

function collectSessionRows(tracesRoot, { excludeObserveOnly = true } = {}) {
  const { students, sessionFileN, scoreStats } = listStudentsFromTracesRoot(tracesRoot, {
    limit: 5000,
    excludeObserveOnly,
  });
  const filteredOut = students.filter(isSyntheticLabel);
  const kept = students.filter((s) => !isSyntheticLabel(s));

  const outcomeCounts = { pass: 0, exhausted_fail: 0, incomplete: 0, other: 0 };
  let terminalN = 0;
  let terminalFiniteTotal = 0;
  let terminalNoFiniteTotal = 0;
  const rows = [];
  let resultFromChallenge = 0;
  let resultFromLegacy = 0;

  for (const st of kept) {
    for (const sess of st.sessions || []) {
      const outcome = outcomeOf(sess);
      if (outcome === 'pass' || outcome === 'exhausted_fail' || outcome === 'incomplete') {
        outcomeCounts[outcome] += 1;
      } else {
        outcomeCounts.other += 1;
      }
      if (outcome !== 'pass' && outcome !== 'exhausted_fail') continue;
      terminalN += 1;
      if (!hasFiniteTotal(sess.abilityScore)) {
        terminalNoFiniteTotal += 1;
        continue;
      }
      terminalFiniteTotal += 1;
      const d = extract4d(sess);
      if (!d) continue;
      if (d.resultSource === 'challengeResult') resultFromChallenge += 1;
      else if (d.resultSource === 'result') resultFromLegacy += 1;
      rows.push({
        sessionId: sess.sessionId,
        studentKey: st.studentKey,
        studentLabel: st.studentLabel,
        outcome,
        catalogId: sess.catalogId || sess.graphId || sess.packageId || null,
        resultSource: d.resultSource,
        challengeResult: d.challengeResult,
        exploreProcess: d.exploreProcess,
        challengeProcess: d.challengeProcess,
        efficiency: d.efficiency,
        finiteN: d.finiteN,
        total: Number(sess.abilityScore.total),
      });
    }
  }

  return {
    rows,
    sessionFileN,
    scoreStats,
    studentsKept: kept.length,
    studentsFilteredOut: filteredOut.length,
    filteredLabels: filteredOut.map((s) => s.studentLabel || s.studentKey),
    outcomeCounts,
    terminalN,
    terminalFiniteTotal,
    terminalNoFiniteTotal,
    resultFromChallenge,
    resultFromLegacy,
    tracesRoot,
  };
}

function runMatrixStats(rowsImputed, labels) {
  const matrix = rowsImputed.map((r) => DIM_KEYS.map((k) => r[k]));
  if (matrix.length < 3) {
    return {
      kmo: { ok: false, error: `n=${matrix.length} < 3` },
      pca: null,
    };
  }
  return {
    kmo: runPythonKmo(matrix, labels, null),
    pca: runPythonPca(matrix, labels, null),
  };
}

function analyzeRoot(tracesRoot) {
  const includeObserve = process.argv.includes('--include-observe-only');
  const collected = collectSessionRows(tracesRoot, { excludeObserveOnly: !includeObserve });
  // Drop rows with no competition result at all (cannot form 4D meaningfully).
  const eligible = collected.rows.filter((r) => Number.isFinite(r.challengeResult));
  const { rows: imputedRows, meansObserved, columnMissing, fillMode } = fillMissingWithZero(eligible);
  const primary = runMatrixStats(imputedRows, SESSION_4D_LABELS_ZH);

  // Strict complete-case sensitivity (all 4 raws finite, no fill)
  const strictRows = eligible.filter((r) => r.finiteN === 4);
  const strict = strictRows.length >= 3
    ? runMatrixStats(strictRows, SESSION_4D_LABELS_ZH)
    : { kmo: { ok: false, error: `n=${strictRows.length} < 3` }, pca: null };

  return {
    rowsRaw: eligible,
    rows: imputedRows,
    meansObserved,
    columnMissing,
    fillMode,
    kmo: primary.kmo,
    pca: primary.pca,
    strict: {
      n: strictRows.length,
      pass: strictRows.filter((r) => r.outcome === 'pass').length,
      exhausted_fail: strictRows.filter((r) => r.outcome === 'exhausted_fail').length,
      kmo: strict.kmo,
      pca: strict.pca,
    },
    meta: {
      tracesRoot: collected.tracesRoot,
      sessionFileN: collected.sessionFileN,
      scoreStats: collected.scoreStats,
      studentsKept: collected.studentsKept,
      studentsFilteredOut: collected.studentsFilteredOut,
      filteredLabels: collected.filteredLabels,
      outcomeCounts: collected.outcomeCounts,
      terminalN: collected.terminalN,
      terminalFiniteTotal: collected.terminalFiniteTotal,
      terminalNoFiniteTotal: collected.terminalNoFiniteTotal,
      resultFromChallenge: collected.resultFromChallenge,
      resultFromLegacy: collected.resultFromLegacy,
    },
  };
}

function buildSampleBullets(primary, { mergeNote = null, mergeStats = null } = {}) {
  const { rows, kmo, meta, columnMissing, meansObserved, fillMode, strict } = primary;
  const passN = rows.filter((r) => r.outcome === 'pass').length;
  const exhN = rows.filter((r) => r.outcome === 'exhausted_fail').length;
  const imputedAny = rows.filter((r) => r._imputedN > 0).length;
  const meanTxt = (k) => (meansObserved[k] == null ? '—' : fmtNum(meansObserved[k], 1));
  const lines = [];
  lines.push(`- 会话文件：${meta.sessionFileN}`);
  lines.push(`- 过滤后学生组：${meta.studentsKept}（剔除 junk 组 ${meta.studentsFilteredOut}${meta.filteredLabels.length ? `：${meta.filteredLabels.join('、')}` : ''}）`);
  lines.push(`- 过滤后会话结局：pass ${meta.outcomeCounts.pass} + exhausted_fail ${meta.outcomeCounts.exhausted_fail} + incomplete ${meta.outcomeCounts.incomplete}`);
  lines.push(`- 终局会话：${meta.terminalN}；其中有限总分：${meta.terminalFiniteTotal}；无有限总分剔除：${meta.terminalNoFiniteTotal}`);
  lines.push(`- **进入 KMO/PCA 矩阵 n = ${rows.length}**（pass ${passN} + exhausted_fail ${exhN}；fillMode=\`${fillMode}\`）`);
  lines.push(`- 竞赛结果来源：challengeResult ${meta.resultFromChallenge}；legacy result ${meta.resultFromLegacy}`);
  lines.push(`- 缺失→0：有缺失的局 ${imputedAny} / ${rows.length}；按列原缺失——探究过程 ${columnMissing.exploreProcess}/${rows.length}；效率 ${columnMissing.efficiency}/${rows.length}；竞赛结果 ${columnMissing.challengeResult}/${rows.length}；竞赛过程 ${columnMissing.challengeProcess}/${rows.length}`);
  lines.push(`- 观测列均值（仅有限 raw，供参考）：竞赛结果 ${meanTxt('challengeResult')}；探究过程 ${meanTxt('exploreProcess')}；竞赛过程 ${meanTxt('challengeProcess')}；效率 ${meanTxt('efficiency')}`);
  lines.push(`- abilityScore v4：已有 ${meta.scoreStats.alreadyV3}；补算成功 ${meta.scoreStats.rescored}；缺 events ${meta.scoreStats.skipNoEvents}；缺 chapter ${meta.scoreStats.skipNoChapter}；异常 ${meta.scoreStats.skipComputeError}`);
  lines.push(`- **与历史 n≈49 的差异**：本次主报 n=${rows.length}${rows.length === 49 ? '（恰好贴近）' : rows.length > 49 ? `（比记忆中多 ${rows.length - 49}）` : `（比记忆中少 ${49 - rows.length}）`}；历史构成约 pass 34 / exhausted_fail 15，本次 pass ${passN} / exhausted_fail ${exhN}。差异可能来自：分版 v3→v4、终局池变化、junk 规则、traces 打包日期、缺维填 0 vs 旧列均值。`);
  lines.push(`- **严格对照（四维 raw 均有限、不填补）**：n=${strict.n}（pass ${strict.pass} / exhausted_fail ${strict.exhausted_fail}）${strict.kmo?.ok ? `；KMO=${fmtNum(strict.kmo.kmo, 3)}` : `；KMO 未算（${strict.kmo?.error || 'n 过小'}）`}——v4 下远小于旧 n；**不以该对照当主数字**。`);
  if (mergeNote) lines.push(`- ${mergeNote}`);
  if (mergeStats) lines.push(`- 合并参考（非主报）：${mergeStats}`);
  if (kmo?.ok) {
    lines.push(`- **适合度提醒**：整体 KMO=${fmtNum(kmo.kmo, 3)}（${interpretKmo(kmo.kmo).zh}）——仍属边缘，PCA 宜作探索性教学描述，不宜过度当稳定因子结构。`);
  }
  return lines;
}

function buildGateBullets(meta) {
  return [
    '1. 数据源主报：`' + path.basename(meta.tracesRoot) + '`（`' + meta.tracesRoot + '`）',
    '2. 只要终局：`terminalOutcome ∈ {pass, exhausted_fail}`（不要 incomplete）',
    '3. **进样门槛（贴近旧）**：abilityScore **v4 有限总分**（`pending≠true` 且 `total` 有限）+ 竞赛结果 raw 有限——对应旧稿「v3 有限总分」',
    '4. 会话级向量 4D：`[竞赛结果或 result, 探究过程, 竞赛过程, 效率]`——优先 `parts.challengeResult.raw`，否则 `parts.result.raw`',
    '5. **缺失处理**：v4 下探究过程/效率大量为 null；若用列均值插补会把整列压成近常数 → 相关/KMO 退化。故主数字对缺失 `raw` 按 **0** 填（与 v4「缺维贡献 0」一致）。旧稿曾用列均值，但在当前 v4 稀疏下不可复现。',
    '6. 过滤明显 junk：`playtest` / `full-eval` / `全量*` / 匿名 junk；**保留李四/王五等**真实学生标签',
    '7. 矩阵：会话级 4D，等权 Pearson 相关 → KMO/MSA/Bartlett + **等权 PCA（本报告主交付）**',
  ];
}

function buildKmoSection(kmo) {
  const lines = [];
  const kmoInterp = interpretKmo(kmo?.kmo);
  if (!kmo || !kmo.ok) {
    lines.push(`未能计算 KMO：${kmo?.error || '未知错误'}。`);
    return lines;
  }
  lines.push(`- **矩阵**：缺维填 0 后的会话级 4D 等权 Pearson（\`matrixKind=${kmo.matrixKind}\`）`);
  lines.push(`- **n / p** = **${kmo.n}** / **${kmo.p}**`);
  lines.push(`- **整体 KMO** = **${fmtNum(kmo.kmo, 3)}** → ${kmoInterp.zh}`);
  lines.push('');
  lines.push('| 维度 | MSA | 适合度 |');
  lines.push('|---|---:|---|');
  for (const zh of SESSION_4D_LABELS_ZH) {
    const msa = kmo.msa?.[zh];
    const band = interpretKmo(msa);
    lines.push(`| ${zh} | ${fmtNum(msa, 3)} | ${band.zh} |`);
  }
  const bart = kmo.bartlett;
  if (bart && bart.ok) {
    const pStr = bart.pvalue != null && bart.pvalue < 1e-4
      ? bart.pvalue.toExponential(2)
      : fmtNum(bart.pvalue, 4);
    lines.push('');
    lines.push(
      `- **Bartlett 球形检验**：χ² = ${fmtNum(bart.chi2, 2)}，df = ${bart.df}，p = ${pStr}`
      + (bart.pvalue != null && bart.pvalue < 0.05 ? '（拒绝单位阵，相关结构存在）' : ''),
    );
  } else if (bart) {
    lines.push('');
    lines.push(`- **Bartlett 球形检验**：跳过（${bart.error || '不可用'}）。`);
  }
  lines.push('');
  lines.push(
    `简短解读：会话级 4D 整体 KMO=${fmtNum(kmo.kmo, 3)}（${kmoInterp.zh}）。`
    + `对照**学生级主六维 KMO≈0.337**（不适合）：`
    + (Number(kmo.kmo) > 0.337
      ? '本会话级口径 KMO 更高，说明「终局局×4D」相关结构相对更紧；仍须按 Kaiser 带解读，且**不可回溯宣称旧 49 当时的 KMO**。'
      : '本会话级口径 KMO 并未明显高于学生级，因子适合度仍偏弱。'),
  );
  return lines;
}

function buildPcaSection(pca, { asMain = true } = {}) {
  const lines = [];
  if (!pca) {
    lines.push('未能计算 PCA。');
    return { lines, names: {}, teaching: '' };
  }
  const names = suggestPcNames(pca);
  const interp = interpretPca(pca, { teaching: true });
  if (asMain) {
    lines.push(`- **方法**：会话级 4D 等权相关矩阵 PCA（与 KMO 同一矩阵；缺维填 0 + v4）`);
    lines.push(`- **n / p** = **${pca.n}** / **${pca.p}**`);
    lines.push(`- 记忆对照：旧分析约 n≈49、PC1~60% 方差；本次 PC1 = ${fmtPct(pca.varianceRatios[0] || 0)}（不必等于 60%）`);
    lines.push(`- 累计方差：≥80% 需 ${pca.pcsFor80} 个主成分，≥90% 需 ${pca.pcsFor90} 个`);
  } else {
    lines.push(`- 记忆对照：旧分析约 n≈49、PC1~60%；本次 PC1 = ${fmtPct(pca.varianceRatios[0] || 0)}（n=${pca.n}）`);
  }
  lines.push('');
  lines.push('| 主成分 | 特征值 | 方差比 | 累计 |');
  lines.push('|---|---:|---:|---:|');
  for (let i = 0; i < (pca.eigenvalues || []).length; i += 1) {
    lines.push(
      `| PC${i + 1} | ${fmtNum(pca.eigenvalues[i])} | ${fmtPct(pca.varianceRatios[i])} | ${fmtPct(pca.cumulative[i])} |`,
    );
  }
  lines.push('');
  lines.push('| 维度 | PC1 | PC2 | PC3 |');
  lines.push('|---|---:|---:|---:|');
  for (const zh of SESSION_4D_LABELS_ZH) {
    const a = pca.loadings?.PC1?.[zh];
    const b = pca.loadings?.PC2?.[zh];
    const c = pca.loadings?.PC3?.[zh];
    lines.push(
      `| ${zh} | ${a == null ? '—' : fmtNum(a, 3)} | ${b == null ? '—' : fmtNum(b, 3)} | ${c == null ? '—' : fmtNum(c, 3)} |`,
    );
  }
  lines.push('');
  lines.push('#### 命名建议');
  lines.push('');
  lines.push('| 主成分 | 方差比 | 命名建议 |');
  lines.push('|---|---:|---|');
  for (let j = 1; j <= Math.min(3, pca.p || 0); j += 1) {
    lines.push(`| PC${j} | ${fmtPct(pca.varianceRatios[j - 1] || 0)} | ${names[`PC${j}`] || `PC${j}`} |`);
  }
  lines.push('');
  lines.push('#### 教学解读（给老师看）');
  lines.push('');
  lines.push(interp.text);
  lines.push('');
  lines.push(
    '一句话：这一局里，**过程/效率怎么走**（PC1）与**竞赛侧强弱**（PC2）是两条相对独立的主轴；'
    + 'PC3 再区分「结果好但过程分低」或反过来。KMO 仍边缘，宜作课堂描述，勿当稳定人格因子。',
  );
  return { lines, names, teaching: interp.text };
}

function buildSessionListSection(rows, rowsRaw) {
  const lines = [];
  lines.push('| sessionId | studentLabel | outcome | 填0维 | 竞赛结果 | 探究过程 | 竞赛过程 | 效率 |');
  lines.push('|---|---|---|---|---:|---:|---:|---:|');
  const show = rows.slice(0, 60);
  for (const r of show) {
    const imp = (r._imputedKeys || []).map((k) => ({
      challengeResult: '竞赛结果',
      exploreProcess: '探究过程',
      challengeProcess: '竞赛过程',
      efficiency: '效率',
    }[k] || k)).join('、') || '—';
    lines.push(
      `| ${r.sessionId} | ${r.studentLabel || r.studentKey} | ${r.outcome} | ${imp} | ${fmtNum(r.challengeResult, 1)} | ${fmtNum(r.exploreProcess, 1)} | ${fmtNum(r.challengeProcess, 1)} | ${fmtNum(r.efficiency, 1)} |`,
    );
  }
  if (rows.length > show.length) {
    lines.push('');
    lines.push(`（仅列出前 ${show.length} / ${rows.length} 条）`);
  }
  lines.push('');
  lines.push(`原始进样（填 0 前）行数：${rowsRaw.length}。`);
  return lines;
}

/** Full standalone report — session 4D PCA is the main deliverable. */
function buildStandaloneReport(primary, { mergeNote = null, mergeStats = null } = {}) {
  const { rows, rowsRaw, kmo, pca, meta } = primary;
  const now = new Date().toISOString();
  const kmoInterp = interpretKmo(kmo?.kmo);
  const pcaBlock = buildPcaSection(pca, { asMain: true });
  const lines = [];
  lines.push('# 贴近旧49的会话级 4D PCA（KMO 较高口径 · 近似复算）');
  lines.push('');
  lines.push(`生成时间：${now}`);
  lines.push('');
  lines.push('> **主交付**：会话级终局 4D 等权 PCA（特征值、方差比、PC1–3 载荷、命名建议、教学解读）。');
  lines.push('> **样本口径**：贴近旧会话级约 n≈49 的高 KMO 池（上次近似复算 n≈51、KMO≈0.549），**不是**学生级 6D（KMO≈0.337）。');
  lines.push('> **重要**：近似复算，不能当作历史存档 KMO；分版已从 v3→v4。学生级主分析仍见 `radar-pca-analysis.md` 正文，本报告不覆盖之。');
  lines.push('');
  lines.push('## 筛选口径（贴近旧会话级 PCA）');
  lines.push('');
  lines.push(...buildGateBullets(meta));
  lines.push('');
  lines.push('## 样本规模');
  lines.push('');
  lines.push(...buildSampleBullets(primary, { mergeNote, mergeStats }));
  lines.push('');
  lines.push('## 主交付：会话级 4D 等权 PCA');
  lines.push('');
  lines.push(...pcaBlock.lines);
  lines.push('');
  lines.push('## 适合度：KMO / MSA / Bartlett');
  lines.push('');
  lines.push(...buildKmoSection(kmo));
  lines.push('');
  lines.push('## 与学生级主分析对照（一句）');
  lines.push('');
  if (kmo?.ok) {
    lines.push(
      `会话级 4D（n=${rows.length}，KMO=${fmtNum(kmo.kmo, 3)}，${kmoInterp.zh}）相关更紧、可作探索性 PCA；`
      + `学生级 6D（KMO≈0.337，不适合）更宜当描述性雷达，不宜硬抽稳定因子——两套口径回答的问题不同，勿混读。`,
    );
  } else {
    lines.push('会话级 KMO 未能计算；学生级主六维 KMO≈0.337（不适合）。勿混读两套口径。');
  }
  lines.push('');
  lines.push('## 进样会话清单（节选，缺维已填 0）');
  lines.push('');
  lines.push(...buildSessionListSection(rows, rowsRaw));
  lines.push('');
  return lines.join('\n');
}

/** Short appendix pointer for radar-pca-analysis.md — do not replace student-level body. */
function buildRadarAppendixPointer(primary) {
  const { rows, kmo, pca, meta } = primary;
  const now = new Date().toISOString();
  const passN = rows.filter((r) => r.outcome === 'pass').length;
  const exhN = rows.filter((r) => r.outcome === 'exhausted_fail').length;
  const kmoInterp = interpretKmo(kmo?.kmo);
  const names = pca ? suggestPcNames(pca) : {};
  const lines = [];
  lines.push('');
  lines.push('## 附录：贴近旧49的会话级4D PCA（指向）');
  lines.push('');
  lines.push(`生成时间：${now}`);
  lines.push('');
  lines.push('> **主分析仍是上文学生级 6D**（学生级 KMO≈0.337）；本附录**不覆盖、不改写**主结论。');
  lines.push('> **完整会话级 4D PCA**（特征值、载荷、命名、教学解读）见：[`session-pca-kmo-approx49.md`](./session-pca-kmo-approx49.md)。');
  lines.push('> 口径：终局 pass/exhausted_fail × 4D（竞赛结果/探究过程/竞赛过程/效率），缺维填 0，等权相关；traces=`'
    + path.basename(meta.tracesRoot) + '`。');
  lines.push('');
  lines.push('### 摘要数字');
  lines.push('');
  lines.push(`- **n** = ${rows.length}（pass ${passN} + exhausted_fail ${exhN}；历史记忆约 49）`);
  if (kmo?.ok) {
    lines.push(`- **整体 KMO** = **${fmtNum(kmo.kmo, 3)}** → ${kmoInterp.zh}（仍边缘；高于学生级 0.337，但不可回溯旧 49 当时的 KMO）`);
  } else {
    lines.push(`- **整体 KMO**：未能计算（${kmo?.error || '未知'}）`);
  }
  if (pca) {
    lines.push(
      `- **PCA 方差**：PC1 ${fmtPct(pca.varianceRatios[0] || 0)}`
      + ` / PC2 ${fmtPct(pca.varianceRatios[1] || 0)}`
      + ` / PC3 ${fmtPct(pca.varianceRatios[2] || 0)}`
      + `（累计 ${fmtPct(pca.cumulative[2] || 0)}）`,
    );
    lines.push(
      `- **命名建议**：PC1「${names.PC1 || '—'}」；PC2「${names.PC2 || '—'}」；PC3「${names.PC3 || '—'}」`,
    );
  }
  const relRoot = path
    .relative(path.join(__dirname, '..'), meta.tracesRoot)
    .split(path.sep)
    .join('/');
  const tracesRootArg = relRoot.startsWith('.') ? relRoot : `./${relRoot}`;
  lines.push(
    `- 复算命令：\`node scripts/session-pca-kmo-approx49.js --traces-root=${tracesRootArg}\``,
  );
  lines.push('');
  return lines.join('\n');
}

function resolveSiblingRoots(primaryRoot) {
  const repoRoot = path.join(__dirname, '..');
  const names = ['traces-全部-20260813', 'traces-全部-20260812', 'traces-全部-20260811'];
  const parents = [
    repoRoot,
    path.join(repoRoot, 'data', 'runtime', 'analysis'),
  ];
  const out = [];
  const seen = new Set();
  for (const parent of parents) {
    for (const name of names) {
      const p = path.join(parent, name);
      const key = path.resolve(p);
      if (seen.has(key)) continue;
      if (fs.existsSync(p) && key !== path.resolve(primaryRoot)) {
        seen.add(key);
        out.push(p);
      }
    }
  }
  return out;
}

function main() {
  const primaryRoot = resolveTracesRoot(process.argv.slice(2));
  console.error(`[session-kmo] primary traces: ${primaryRoot}`);
  const primary = analyzeRoot(primaryRoot);

  let mergeNote = null;
  let mergeStats = null;
  if (primary.rows.length < 40) {
    const refs = [];
    for (const root of resolveSiblingRoots(primaryRoot)) {
      const r = analyzeRoot(root);
      refs.push(`${path.basename(root)} n=${r.rows.length} KMO=${r.kmo?.ok ? fmtNum(r.kmo.kmo, 3) : 'n/a'}`);
    }
    if (refs.length) {
      mergeNote = '主报终局有限总分样本偏少；下列为同口径兄弟目录参考（**不并入主数字**）。';
      mergeStats = refs.join('；');
    }
  }

  const standalone = buildStandaloneReport(primary, { mergeNote, mergeStats });
  const appendix = buildRadarAppendixPointer(primary);
  const pcNames = primary.pca ? suggestPcNames(primary.pca) : {};

  fs.mkdirSync(path.dirname(STANDALONE_MD), { recursive: true });
  fs.writeFileSync(STANDALONE_MD, standalone, 'utf8');
  console.error(`[session-kmo] wrote ${STANDALONE_MD}`);

  if (fs.existsSync(REPORT_MD)) {
    let existing = fs.readFileSync(REPORT_MD, 'utf8');
    // Replace either the old full appendix or the new pointer appendix.
    const markers = [
      '## 附录：贴近旧49的会话级4D PCA（指向）',
      '## 附录：贴近旧49的会话级4D KMO（近似复算）',
    ];
    let cut = -1;
    for (const marker of markers) {
      const idx = existing.indexOf(marker);
      if (idx >= 0 && (cut < 0 || idx < cut)) cut = idx;
    }
    if (cut >= 0) {
      existing = existing.slice(0, cut).replace(/\s*$/, '\n');
    } else {
      existing = existing.replace(/\s*$/, '\n');
    }
    fs.writeFileSync(REPORT_MD, `${existing}\n${appendix.trim()}\n`, 'utf8');
    console.error(`[session-kmo] updated radar appendix pointer → ${REPORT_MD}`);
  } else {
    fs.writeFileSync(
      REPORT_MD,
      `# 雷达能力维度 PCA 分析（学生级主分析）\n\n> 学生级正文尚未生成；下列仅为会话级附录指向。\n\n${appendix.trim()}\n`,
      'utf8',
    );
  }

  const summary = {
    n: primary.rows.length,
    pass: primary.rows.filter((r) => r.outcome === 'pass').length,
    exhausted_fail: primary.rows.filter((r) => r.outcome === 'exhausted_fail').length,
    kmo: primary.kmo?.ok ? primary.kmo.kmo : null,
    kmoBand: primary.kmo?.ok ? interpretKmo(primary.kmo.kmo).zh : primary.kmo?.error,
    msa: primary.kmo?.msa || null,
    bartlett: primary.kmo?.bartlett || null,
    pc1Variance: primary.pca?.varianceRatios?.[0] ?? null,
    varianceRatios: primary.pca?.varianceRatios ?? null,
    pcNames,
    strictN: primary.strict.n,
    columnMissing: primary.columnMissing,
    tracesRoot: primary.meta.tracesRoot,
    reportMd: REPORT_MD,
    standaloneMd: STANDALONE_MD,
  };
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  collectSessionRows,
  analyzeRoot,
  fillMissingWithZero,
  buildStandaloneReport,
  buildRadarAppendixPointer,
};