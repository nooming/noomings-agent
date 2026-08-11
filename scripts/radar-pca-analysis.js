/**
 * Session-primary PCA on abilityScore v3 parts (+ student-level appendix).
 * Does not modify product UI. Writes report markdown.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { listTraceStudents } = require('../packages/platform/trace-store');
const {
  deriveTerminalOutcome,
  isTerminalSession,
} = require('../packages/judge/session-terminal');

const ABILITY_SCORE_VERSION = 3;
const DIM_KEYS = ['result', 'exploreProcess', 'challengeProcess', 'efficiency', 'consistency', 'completion'];
const DIM_LABELS_ZH = {
  result: '结果',
  exploreProcess: '探究',
  challengeProcess: '竞赛',
  efficiency: '效率',
  consistency: '一致性',
  completion: '完成度',
};
const SESSION_DIM_KEYS = ['result', 'exploreProcess', 'challengeProcess', 'efficiency'];

function expectedAbilityScoreVersion() {
  return ABILITY_SCORE_VERSION;
}

function isFiniteAbilityTotal(v) {
  if (v == null || v === '') return false;
  return Number.isFinite(Number(v));
}

function sessionAbilityScore(session) {
  const a = session?.abilityScore;
  if (!a || Number(a.version) !== Number(expectedAbilityScoreVersion())) return null;
  return a;
}

function sessionTaskKey(session) {
  return String(
    session?.catalogId
    || session?.graphId
    || session?.packageId
    || session?.taskCode
    || 'unknown',
  );
}

function sessionFiniteAbilityTotal(session) {
  const a = sessionAbilityScore(session);
  if (!a || a.pending || !isFiniteAbilityTotal(a.total)) return null;
  return Number(a.total);
}

function sortSessionsNewestFirst(sessions) {
  return (Array.isArray(sessions) ? sessions.slice() : []).sort((a, b) => {
    const ta = String(a?.updatedAt || a?.startedAt || '');
    const tb = String(b?.updatedAt || b?.startedAt || '');
    return tb.localeCompare(ta);
  });
}

function normalizeSessionForTerminal(session) {
  return {
    ...session,
    terminalOutcome: session?.terminalOutcome || session?.sessionOutcome || null,
    verdict: session?.verdict || session?.judgeResult?.verdict || null,
    judgeResult: session?.judgeResult || null,
    abilityScore: session?.abilityScore || null,
    attemptsExhausted: session?.attemptsExhausted,
    events: session?.events,
  };
}

function isTerminalSessionRow(session) {
  return isTerminalSession(normalizeSessionForTerminal(session));
}

function terminalOutcomeOf(session) {
  return deriveTerminalOutcome(normalizeSessionForTerminal(session));
}

function terminalSessionsOf(student) {
  return (Array.isArray(student?.sessions) ? student.sessions : []).filter(isTerminalSessionRow);
}

function aggregateStudentAbilityByTask(student) {
  const sessions = terminalSessionsOf(student);
  const byTask = new Map();
  for (const s of sessions) {
    const key = sessionTaskKey(s);
    if (!byTask.has(key)) byTask.set(key, []);
    byTask.get(key).push(s);
  }
  const taskScores = [];
  const representativeSessions = [];
  for (const [, list] of byTask) {
    const scored = sortSessionsNewestFirst(list)
      .filter(s => sessionFiniteAbilityTotal(s) != null);
    if (!scored.length) continue;
    const reps = scored.slice(0, 2);
    const vals = reps.map(s => sessionFiniteAbilityTotal(s));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    taskScores.push({ score: mean, sessions: reps });
    representativeSessions.push(...reps);
  }
  const composite = taskScores.length
    ? Math.round(taskScores.reduce((a, t) => a + t.score, 0) / taskScores.length)
    : null;
  return { taskScores, representativeSessions, composite };
}

function meanFinite(nums) {
  const xs = (Array.isArray(nums) ? nums : []).filter(n => Number.isFinite(n));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function consistencyFromTotals(totals) {
  const xs = (Array.isArray(totals) ? totals : []).filter(n => Number.isFinite(n));
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length;
  const sd = Math.sqrt(variance);
  return Math.round(100 * (1 - Math.min(1, sd / Math.max(mean, 1))));
}

function abilityPartRaw(session, partKey) {
  const raw = sessionAbilityScore(session)?.parts?.[partKey]?.raw;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function countSessionTerminalStats(student) {
  const sessions = Array.isArray(student?.sessions) ? student.sessions : [];
  let terminalN = 0;
  let incompleteN = 0;
  for (const s of sessions) {
    if (isTerminalSessionRow(s)) terminalN += 1;
    else incompleteN += 1;
  }
  return { terminalN, incompleteN, totalN: terminalN + incompleteN };
}

function computeCompletionScore(student) {
  const { terminalN, incompleteN, totalN } = countSessionTerminalStats(student);
  if (!totalN) return null;
  return Math.round(100 * terminalN / (terminalN + incompleteN));
}

function computeStudentRadarDims(student) {
  const agg = aggregateStudentAbilityByTask(student);
  const reps = agg.representativeSessions;
  let result = meanFinite(reps.map(s => abilityPartRaw(s, 'result')));
  if (result == null) {
    const terminal = terminalSessionsOf(student);
    if (terminal.length) {
      result = (terminal.filter(s => s.verdict === 'pass' || s.terminalOutcome === 'pass'
        || s.abilityScore?.bands?.result === '达标').length / terminal.length) * 100;
    }
  }
  const exploreProcess = meanFinite(reps.map(s => abilityPartRaw(s, 'exploreProcess')));
  const challengeProcess = meanFinite(reps.map(s => abilityPartRaw(s, 'challengeProcess')));
  const efficiency = meanFinite(reps.map(s => abilityPartRaw(s, 'efficiency')));
  const consistencySources = agg.taskScores.length >= 2
    ? agg.taskScores.map(t => t.score)
    : reps.map(s => sessionFiniteAbilityTotal(s));
  const consistency = consistencyFromTotals(consistencySources);
  const completion = computeCompletionScore(student);
  return {
    composite: agg.composite,
    dims: { result, exploreProcess, challengeProcess, efficiency, consistency, completion },
    repCount: reps.length,
    taskCount: agg.taskScores.length,
  };
}

function isSyntheticLabel(student) {
  const label = String(student?.studentLabel || '');
  const key = String(student?.studentKey || '');
  const blob = `${label} ${key}`.toLowerCase();
  // Keep 模拟-* role-sim students (intentional PCA enrichment cohort).
  if (/模拟/.test(label) || /模拟/.test(key)) return false;
  if (/playtest/.test(blob)) return true;
  if (/full-eval/.test(blob)) return true;
  if (/全量/.test(label) || /全量/.test(key)) return true;
  if (!label.trim() || label === '匿名学生' || /^匿名/.test(label)) return true;
  if (/^anonymous/i.test(label) || /junk|test-user|bot-/i.test(blob)) return true;
  return false;
}

function isSimStudent(studentOrRow) {
  const label = String(studentOrRow?.studentLabel || '');
  const key = String(studentOrRow?.studentKey || studentOrRow?.studentId || '');
  return /模拟/.test(label) || /模拟/.test(key);
}

function collectSessionRows(students) {
  const sessionRows = [];
  let nTerminalKept = 0;
  let nTerminalV3 = 0;
  for (const s of students) {
    for (const sess of Array.isArray(s.sessions) ? s.sessions : []) {
      if (!isTerminalSessionRow(sess)) continue;
      nTerminalKept += 1;
      const a = sessionAbilityScore(sess);
      if (!a || a.pending || !isFiniteAbilityTotal(a.total)) continue;
      nTerminalV3 += 1;
      const outcome = terminalOutcomeOf(sess);
      const vec = {
        studentKey: s.studentKey,
        studentLabel: s.studentLabel,
        sessionId: sess.sessionId,
        taskKey: sessionTaskKey(sess),
        terminalOutcome: outcome,
        result: abilityPartRaw(sess, 'result'),
        exploreProcess: abilityPartRaw(sess, 'exploreProcess'),
        challengeProcess: abilityPartRaw(sess, 'challengeProcess'),
        efficiency: abilityPartRaw(sess, 'efficiency'),
        isSim: isSimStudent(s),
      };
      const finiteN = SESSION_DIM_KEYS.filter(k => Number.isFinite(vec[k])).length;
      if (finiteN < 3) continue;
      sessionRows.push(vec);
    }
  }
  return { sessionRows, nTerminalKept, nTerminalV3 };
}

function runSessionPca(sessionRows) {
  if (!sessionRows.length) return { pca: null, interp: null, imputed: [], passN: 0, failN: 0 };
  const imputed = imputeColumnMeans(sessionRows, SESSION_DIM_KEYS);
  const labelsZh = SESSION_DIM_KEYS.map(k => DIM_LABELS_ZH[k]);
  let pca = null;
  if (imputed.length >= 3) {
    const matrix = imputed.map(r => SESSION_DIM_KEYS.map(k => r[k]));
    pca = runPythonPca(matrix, labelsZh);
  }
  const interp = pca ? interpretPca(pca, 'session4') : null;
  const passN = sessionRows.filter(r => r.terminalOutcome === 'pass').length;
  const failN = sessionRows.filter(r => r.terminalOutcome === 'exhausted_fail').length;
  return { pca, interp, imputed, passN, failN };
}

function writeSessionPcaSection(lines, title, cohortNote, result) {
  const { pca, interp, imputed, passN, failN } = result;
  lines.push(`## ${title}`);
  lines.push('');
  lines.push(cohortNote);
  lines.push('');
  lines.push(`- 进入会话级 PCA：${imputed.length}`);
  lines.push(`- 终局构成：pass=${passN}，exhausted_fail=${failN}`);
  lines.push('- 向量：`[结果, 探究, 竞赛, 效率]` = abilityScore v3 `parts.*.raw`；z-score + `eigh`');
  lines.push('');
  if (!pca) {
    lines.push('样本不足（需 n≥3），未能完成该队列 PCA。');
    lines.push('');
    return;
  }
  lines.push(`- n = **${pca.n}**，p = ${pca.p}`);
  lines.push(`- pcsFor80 = **${pca.pcsFor80}**，pcsFor90 = **${pca.pcsFor90}**`);
  lines.push(`- PC1/PC2/PC3 方差：${fmtPct(pca.varianceRatios[0])} / ${fmtPct(pca.varianceRatios[1])} / ${fmtPct(pca.varianceRatios[2])}；累计至 PC3：${fmtPct(pca.cumulative[2])}`);
  lines.push('');
  lines.push(eigenTable(pca, SESSION_DIM_KEYS));
  lines.push('');
  lines.push('### 命名建议（简体中文）');
  lines.push('');
  lines.push(namesTable(interp.names));
  lines.push('');
  lines.push('### 解读（简体中文）');
  lines.push('');
  lines.push(interp.text);
  lines.push('');
}

function countFiniteDims(dims) {
  return DIM_KEYS.filter(k => Number.isFinite(dims[k])).length;
}

function imputeColumnMeans(rows, keys) {
  const means = {};
  for (const k of keys) {
    const xs = rows.map(r => r[k]).filter(n => Number.isFinite(n));
    means[k] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  }
  return rows.map(r => {
    const out = { ...r };
    for (const k of keys) {
      if (!Number.isFinite(out[k])) out[k] = means[k];
    }
    return out;
  });
}

function runPythonPca(matrix, labels) {
  const payload = JSON.stringify({ matrix, labels });
  const py = `
import json, sys
import numpy as np

data = json.loads(sys.stdin.read())
X = np.asarray(data["matrix"], dtype=float)
labels = data["labels"]
n, p = X.shape
# z-score columns
mu = X.mean(axis=0)
sd = X.std(axis=0, ddof=0)
sd[sd < 1e-12] = 1.0
Z = (X - mu) / sd
# correlation/covariance PCA on standardized data
C = np.cov(Z, rowvar=False, ddof=0)
evals, evecs = np.linalg.eigh(C)
# descending
idx = np.argsort(evals)[::-1]
evals = evals[idx]
evecs = evecs[:, idx]
# flip signs so max abs loading is positive
for j in range(evecs.shape[1]):
    k = int(np.argmax(np.abs(evecs[:, j])))
    if evecs[k, j] < 0:
        evecs[:, j] *= -1
total = float(np.sum(evals))
ratios = (evals / total).tolist() if total > 0 else [0.0]*len(evals)
cum = np.cumsum(ratios).tolist()
def pcs_for(thr):
    for i, c in enumerate(cum, 1):
        if c >= thr:
            return i
    return len(cum)

loadings = {}
for j in range(min(3, p)):
    loadings[f"PC{j+1}"] = {labels[i]: float(evecs[i, j]) for i in range(p)}

out = {
    "n": n,
    "p": p,
    "eigenvalues": [float(x) for x in evals],
    "varianceRatios": ratios,
    "cumulative": cum,
    "pcsFor80": pcs_for(0.80),
    "pcsFor90": pcs_for(0.90),
    "loadings": loadings,
    "columnMeans": mu.tolist(),
    "columnSds": sd.tolist(),
}
print(json.dumps(out, ensure_ascii=False))
`;
  const res = spawnSync('python', ['-c', py], {
    input: payload,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`PCA python failed: ${res.stderr || res.stdout}`);
  }
  return JSON.parse(res.stdout);
}

function fmtPct(x) {
  return `${(100 * x).toFixed(1)}%`;
}

function fmtNum(x, d = 4) {
  return Number(x).toFixed(d);
}

function topLoadingsText(loadings, k = 3) {
  const entries = Object.entries(loadings || {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return entries.slice(0, k).map(([name, v]) => `${name}(${v >= 0 ? '+' : ''}${fmtNum(v, 3)})`).join('、');
}

function suggestPcNames(pca, mode) {
  const names = {};
  for (let j = 1; j <= Math.min(3, pca.p || 0); j += 1) {
    const L = pca.loadings[`PC${j}`] || {};
    const r = Number(L['结果'] ?? 0);
    const e = Number(L['探究'] ?? 0);
    const c = Number(L['竞赛'] ?? 0);
    const ef = Number(L['效率'] ?? 0);
    const cons = Number(L['一致性'] ?? 0);
    const comp = Number(L['完成度'] ?? 0);
    let name = `PC${j}`;
    if (mode === 'session4') {
      const allPos = r > 0.25 && e > 0.25 && c > 0.25 && ef > 0.25;
      if (j === 1 && allPos) {
        name = '整局能力公因子';
      } else if (Math.abs(e) > 0.5 && Math.sign(e) !== Math.sign(r) && Math.abs(r) > 0.35) {
        name = e > 0 ? '深探究 vs 结果得分' : '结果得分 vs 深探究';
      } else if (Math.abs(r) > 0.5 && Math.abs(e) > 0.35 && Math.sign(r) === Math.sign(e)
        && Math.sign(r) !== Math.sign(c) && Math.abs(c) > 0.3) {
        name = r > 0 ? '结果—探究 vs 竞赛—效率' : '竞赛—效率 vs 结果—探究';
      } else if (Math.abs(c) > 0.4 && Math.abs(ef) > 0.4 && Math.sign(c) === Math.sign(ef)
        && Math.abs(r) > 0.35 && Math.sign(r) !== Math.sign(c)) {
        name = c > 0 ? '竞赛—效率 vs 结果' : '结果 vs 竞赛—效率';
      } else {
        name = `风格分化（${topLoadingsText(L, 2)}）`;
      }
    } else {
      // student 6D
      if (j === 1 && c > 0.4 && ef > 0.4 && r > 0.35) {
        name = '结果—竞赛—效率综合表现';
      } else if (Math.abs(e) > 0.5 && Math.abs(comp) > 0.4 && Math.sign(e) !== Math.sign(comp)) {
        name = e > 0 ? '深探究 vs 高完成' : '高完成 vs 深探究';
      } else if (Math.abs(cons) > 0.6) {
        name = '一致性主导轴';
      } else {
        name = `风格分化（${topLoadingsText(L, 2)}）`;
      }
    }
    names[`PC${j}`] = name;
  }
  return names;
}

function interpretPca(pca, mode) {
  const names = suggestPcNames(pca, mode);
  const sentences = [];
  for (let j = 1; j <= Math.min(3, pca.p || 0); j += 1) {
    const L = pca.loadings[`PC${j}`] || {};
    const label = names[`PC${j}`] || `PC${j}`;
    sentences.push(
      `PC${j}（解释 ${fmtPct(pca.varianceRatios[j - 1] || 0)}，建议命名「${label}」）主要载荷：${topLoadingsText(L)}。`,
    );
  }
  sentences.push(
    `达到累计方差 ≥80% 需 ${pca.pcsFor80} 个主成分，≥90% 需 ${pca.pcsFor90} 个。`,
  );
  return { text: sentences.join(''), names };
}

function eigenTable(pca, labels) {
  const lines = [
    '| PC | 特征值 | 方差占比 | 累计占比 |',
    '|---|---:|---:|---:|',
  ];
  for (let i = 0; i < pca.eigenvalues.length; i += 1) {
    lines.push(
      `| PC${i + 1} | ${fmtNum(pca.eigenvalues[i])} | ${fmtPct(pca.varianceRatios[i])} | ${fmtPct(pca.cumulative[i])} |`,
    );
  }
  lines.push('');
  lines.push('### PC1–PC3 载荷（标准化后相关矩阵 PCA）');
  lines.push('');
  const header = ['维度', 'PC1', 'PC2', 'PC3'].slice(0, 1 + Math.min(3, pca.p));
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`|${header.map(() => '---').join('|')}|`);
  for (const key of labels) {
    const zh = DIM_LABELS_ZH[key] || key;
    const row = [zh];
    for (let j = 1; j <= Math.min(3, pca.p); j += 1) {
      const v = pca.loadings[`PC${j}`]?.[zh] ?? pca.loadings[`PC${j}`]?.[key];
      row.push(v == null ? '—' : fmtNum(v, 3));
    }
    lines.push(`| ${row.join(' | ')} |`);
  }
  return lines.join('\n');
}

function namesTable(names) {
  const lines = [
    '| 主成分 | 命名建议 |',
    '|---|---|',
  ];
  for (const key of ['PC1', 'PC2', 'PC3']) {
    if (names[key]) lines.push(`| ${key} | ${names[key]} |`);
  }
  return lines.join('\n');
}

function main() {
  const students = listTraceStudents({ limit: 1000 });
  const kept = students.filter(s => !isSyntheticLabel(s));
  const simStudents = kept.filter(isSimStudent);
  const humanLike = kept.filter(s => !isSimStudent(s));

  const combined = collectSessionRows(kept);
  const simOnly = collectSessionRows(simStudents);
  const priorLike = collectSessionRows(humanLike);

  const combinedPca = runSessionPca(combined.sessionRows);
  const simPca = runSessionPca(simOnly.sessionRows);
  const priorPca = runSessionPca(priorLike.sessionRows);

  const sessionPca = combinedPca.pca;
  const sessionInterp = combinedPca.interp;
  const sessionRows = combined.sessionRows;
  const nTerminalKept = combined.nTerminalKept;
  const nTerminalV3 = combined.nTerminalV3;

  // ---- Appendix: student-level 6D (multi-task simulated students if any) ----
  const rowsRaw = [];
  for (const s of kept) {
    const radar = computeStudentRadarDims(s);
    const finiteN = countFiniteDims(radar.dims);
    if (finiteN < 4) continue;
    rowsRaw.push({
      studentKey: s.studentKey,
      studentLabel: s.studentLabel,
      finiteN,
      ...radar.dims,
      repCount: radar.repCount,
      taskCount: radar.taskCount,
      isSim: isSimStudent(s),
    });
  }
  const multiTaskSim = rowsRaw.filter(r => r.isSim && r.taskCount >= 2);
  const imputed = imputeColumnMeans(rowsRaw, DIM_KEYS);
  const labelsZh = DIM_KEYS.map(k => DIM_LABELS_ZH[k]);
  let studentPca = null;
  if (imputed.length >= 3) {
    const matrix = imputed.map(r => DIM_KEYS.map(k => r[k]));
    studentPca = runPythonPca(matrix, labelsZh);
  }
  const studentInterp = studentPca ? interpretPca(studentPca, 'student6') : null;

  const reportPath = path.join(
    __dirname,
    '..',
    'data',
    'runtime',
    'packages',
    'reports',
    'radar-pca-analysis.md',
  );

  const passN = combinedPca.passN;
  const failN = combinedPca.failN;
  const simSessionN = simOnly.sessionRows.length;
  const priorSessionN = priorLike.sessionRows.length;

  const lines = [];
  lines.push('# 雷达能力维度 PCA 分析（会话级主分析 · 含多角色模拟批次）');
  lines.push('');
  lines.push(`生成时间：${new Date().toISOString()}`);
  lines.push('');
  lines.push('> **主分析单位 = 终局会话（局）**。本版在原过滤人类/全检样本之上，并入 `模拟-*` 多角色行为模拟终局（见 `role-sim-play-log.md`）。');
  lines.push('');
  lines.push('## 数据与过滤');
  lines.push('');
  lines.push(`- 原始学生组：${students.length}`);
  lines.push(`- 过滤后学生：${kept.length}（排除 \`playtest\` / \`full-eval\` / \`全量*\` / 明显匿名 junk；**保留** \`全检-*\`、李四、王五、以及 \`模拟-探究/冲分/混拧/半会-*\`）`);
  lines.push(`- 其中模拟学生：${simStudents.length}；非模拟（全检/李四/王五等）：${humanLike.length}`);
  lines.push(`- 过滤后终局会话：${nTerminalKept}（abilityScore v3 有限总分：${nTerminalV3}）`);
  lines.push(`- 进入合并会话级 PCA：${combined.sessionRows.length}（模拟终局 ${simSessionN} + 非模拟终局 ${priorSessionN}）`);
  lines.push(`- 终局构成（合并）：pass=${passN}，exhausted_fail=${failN}`);
  lines.push('- **向量方案 A（主）**：`[结果, 探究, 竞赛, 效率]` = abilityScore v3 `parts.*.raw`');
  lines.push('- **向量方案 B**：一致性 / 完成度无可靠单局代理，跳过');
  lines.push('- 方法：列标准化（z-score）后对相关/协方差矩阵做特征分解（numpy `eigh`）');
  lines.push('');
  lines.push('## 方案 B 说明（跳过）');
  lines.push('');
  lines.push('- **一致性**：多任务/多局总分离散度，单局无 σ。');
  lines.push('- **完成度**：学生级 `terminal/(terminal+incomplete)`，不宜硬贴到终局样本。');
  lines.push('');

  writeSessionPcaSection(
    lines,
    '主分析：合并样本会话级 4D PCA',
    '对象：**模拟 + 先前过滤人类/全检** 的终局 + abilityScore v3 有限总分会话。',
    combinedPca,
  );

  if (simSessionN >= 20) {
    writeSessionPcaSection(
      lines,
      '对照：仅模拟样本会话级 4D PCA',
      `对象：仅 \`模拟-*\` 终局（n=${simSessionN}≥20）。用于观察角色策略是否单独撑起与合并样本不同的 PC2/PC3 故事。`,
      simPca,
    );
  } else {
    lines.push('## 对照：仅模拟样本会话级 4D PCA');
    lines.push('');
    lines.push(`模拟终局进入 PCA 仅 ${simSessionN}（<20），本版跳过独立 PCA。`);
    lines.push('');
  }

  lines.push('## 与先前全检偏重结果的对比');
  lines.push('');
  lines.push('先前会话级主分析（2026-08-11，n=49，全检偏重）：PC1 60.3% / PC2 20.4% / PC3 15.7%；pcsFor80=2、pcsFor90=3；命名「整局能力公因子」「深探究 vs 结果得分」「结果—探究 vs 竞赛—效率」。');
  lines.push('');
  lines.push('| 分析 | n | pcsFor80 | pcsFor90 | PC1% | PC2% | PC3% | 累计PC3 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  lines.push('| 先前（全检偏重） | 49 | 2 | 3 | 60.3% | 20.4% | 15.7% | 96.4% |');
  if (priorPca.pca) {
    lines.push(
      `| 本版非模拟子集 | ${priorPca.pca.n} | ${priorPca.pca.pcsFor80} | ${priorPca.pca.pcsFor90} | ${fmtPct(priorPca.pca.varianceRatios[0])} | ${fmtPct(priorPca.pca.varianceRatios[1])} | ${fmtPct(priorPca.pca.varianceRatios[2])} | ${fmtPct(priorPca.pca.cumulative[2])} |`,
    );
  }
  if (sessionPca) {
    lines.push(
      `| 本版合并（主） | ${sessionPca.n} | ${sessionPca.pcsFor80} | ${sessionPca.pcsFor90} | ${fmtPct(sessionPca.varianceRatios[0])} | ${fmtPct(sessionPca.varianceRatios[1])} | ${fmtPct(sessionPca.varianceRatios[2])} | ${fmtPct(sessionPca.cumulative[2])} |`,
    );
  }
  if (simPca.pca && simSessionN >= 20) {
    lines.push(
      `| 本版仅模拟 | ${simPca.pca.n} | ${simPca.pca.pcsFor80} | ${simPca.pca.pcsFor90} | ${fmtPct(simPca.pca.varianceRatios[0])} | ${fmtPct(simPca.pca.varianceRatios[1])} | ${fmtPct(simPca.pca.varianceRatios[2])} | ${fmtPct(simPca.pca.cumulative[2])} |`,
    );
  }
  lines.push('');

  // Narrative comparison of loadings
  const priorLoad = {
    PC1: { 结果: 0.411, 探究: 0.382, 竞赛: 0.585, 效率: 0.586 },
    PC2: { 结果: -0.624, 探究: 0.776, 竞赛: 0.023, 效率: -0.092 },
    PC3: { 结果: 0.662, 探究: 0.499, 竞赛: -0.405, 效率: -0.385 },
  };
  function loadingShiftNote(tag, pcaObj, names) {
    if (!pcaObj) return `${tag}：无结果。`;
    const n1 = names?.PC1 || 'PC1';
    const n2 = names?.PC2 || 'PC2';
    const n3 = names?.PC3 || 'PC3';
    const L2 = pcaObj.loadings.PC2 || {};
    const L3 = pcaObj.loadings.PC3 || {};
    const exploreSign = Math.sign(Number(L2['探究'] ?? 0));
    const resultSign = Math.sign(Number(L2['结果'] ?? 0));
    const samePc2Tension = exploreSign !== 0 && resultSign !== 0 && exploreSign !== resultSign;
    return (
      `${tag}：PC1「${n1}」、PC2「${n2}」、PC3「${n3}」。`
      + (samePc2Tension
        ? 'PC2 仍呈现探究与结果的反向张力（与先前「深探究 vs 结果得分」同族）。'
        : 'PC2 的探究—结果反向张力减弱或改组，风格轴叙事有偏移。')
      + ` PC3 主要载荷：${topLoadingsText(L3)}。`
    );
  }
  lines.push('### PC2/PC3 故事是否改变？');
  lines.push('');
  lines.push(loadingShiftNote('合并主分析', sessionPca, sessionInterp?.names));
  if (simPca.pca && simSessionN >= 20) {
    lines.push(loadingShiftNote('仅模拟对照', simPca.pca, simPca.interp?.names));
  }
  lines.push('');
  lines.push('### 样本局限（仍在）');
  lines.push('');
  lines.push('- **非独立**：同一脚本化身份 × 包可产生相关局；全检冒烟仍高度重复。');
  lines.push('- **接受性偏差**：通关偏容易的包（磁场/电场/光电等）pass 更多；难题包更易 exhausted。');
  lines.push('- **模拟非真人**：角色策略是规则化浏览器行为，能拉开探究/竞赛过程分位，但不能代表真实课堂异质性。');
  lines.push('- **学生级多任务**：多数 `模拟-*` 为「一角色×一包」单任务身份，学生级 6D 仍主要靠李四等，仅作附录。');
  if (multiTaskSim.length) {
    lines.push(`- 本批具备 ≥2 任务的模拟学生：${multiTaskSim.length}（可选后续学生级对照）。`);
  }
  lines.push('');

  lines.push('## 与学生级 6D 附录对比');
  lines.push('');
  if (studentPca && sessionPca) {
    lines.push(`| 分析 | n | p | pcsFor80 | pcsFor90 | PC1% | PC2% | PC3% | 累计PC3 |`);
    lines.push(`|---|---:|---:|---:|---:|---:|---:|---:|---:|`);
    lines.push(
      `| 会话级 4D（合并主） | ${sessionPca.n} | ${sessionPca.p} | ${sessionPca.pcsFor80} | ${sessionPca.pcsFor90} | ${fmtPct(sessionPca.varianceRatios[0])} | ${fmtPct(sessionPca.varianceRatios[1])} | ${fmtPct(sessionPca.varianceRatios[2])} | ${fmtPct(sessionPca.cumulative[2])} |`,
    );
    lines.push(
      `| 学生级 6D（附录） | ${studentPca.n} | ${studentPca.p} | ${studentPca.pcsFor80} | ${studentPca.pcsFor90} | ${fmtPct(studentPca.varianceRatios[0])} | ${fmtPct(studentPca.varianceRatios[1])} | ${fmtPct(studentPca.varianceRatios[2])} | ${fmtPct(studentPca.cumulative[2])} |`,
    );
    lines.push('');
    lines.push(
      '会话级仍是主结论载体：前 2–3 个主成分覆盖绝大部分方差；学生级含一致性/完成度且 n 较小，仅探索性参考。**不宜压成单一雷达总分**的判断保持。',
    );
    lines.push('');
  } else {
    lines.push('学生级或会话级样本不足，对比略。');
    lines.push('');
  }

  if (studentPca) {
    lines.push('## 附录：学生级 6D PCA（已降级）');
    lines.push('');
    lines.push('> 非主分析。');
    lines.push('');
    lines.push(`- n = **${studentPca.n}**，p = ${studentPca.p}`);
    lines.push(`- pcsFor80 = **${studentPca.pcsFor80}**，pcsFor90 = **${studentPca.pcsFor90}**`);
    lines.push('');
    lines.push(eigenTable(studentPca, DIM_KEYS));
    lines.push('');
    lines.push('### 命名建议');
    lines.push('');
    lines.push(namesTable(studentInterp.names));
    lines.push('');
    lines.push('### 解读');
    lines.push('');
    lines.push(studentInterp.text);
    lines.push('');
  }

  lines.push('## 样本清单（会话级，进入合并 PCA）');
  lines.push('');
  lines.push('| sessionId | studentLabel | task | outcome | sim | 结果 | 探究 | 竞赛 | 效率 |');
  lines.push('|---|---|---|---|---|---:|---:|---:|---:|');
  for (const r of sessionRows) {
    const f = (x) => (Number.isFinite(x) ? fmtNum(x, 1) : '—');
    lines.push(
      `| ${r.sessionId} | ${r.studentLabel} | ${r.taskKey} | ${r.terminalOutcome} | ${r.isSim ? 'Y' : ''} | ${f(r.result)} | ${f(r.exploreProcess)} | ${f(r.challengeProcess)} | ${f(r.efficiency)} |`,
    );
  }
  lines.push('');

  lines.push('## 样本清单（学生级附录）');
  lines.push('');
  lines.push('| studentKey | label | sim | 有限维数 | 代表局 | 任务数 |');
  lines.push('|---|---|---|---:|---:|---:|');
  for (const r of rowsRaw) {
    lines.push(`| ${r.studentKey} | ${r.studentLabel} | ${r.isSim ? 'Y' : ''} | ${r.finiteN} | ${r.repCount} | ${r.taskCount} |`);
  }
  lines.push('');

  // silence unused priorLoad in lint-free env — used as documentation anchor
  void priorLoad;

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');

  const summary = {
    reportPath,
    nStudentsRaw: students.length,
    nKept: kept.length,
    nSimStudents: simStudents.length,
    nTerminalKept,
    nTerminalV3,
    nSessionPca: sessionPca?.n ?? 0,
    nSimSessionPca: simPca.pca?.n ?? 0,
    nPriorSessionPca: priorPca.pca?.n ?? 0,
    sessionPcsFor80: sessionPca?.pcsFor80 ?? null,
    sessionPcsFor90: sessionPca?.pcsFor90 ?? null,
    sessionRatios: sessionPca?.varianceRatios ?? null,
    sessionCumulative: sessionPca?.cumulative ?? null,
    sessionLoadings: sessionPca?.loadings ?? null,
    sessionNames: sessionInterp?.names ?? null,
    simRatios: simPca.pca?.varianceRatios ?? null,
    simNames: simPca.interp?.names ?? null,
    simLoadings: simPca.pca?.loadings ?? null,
    nStudentPca: studentPca?.n ?? 0,
    studentPcsFor80: studentPca?.pcsFor80 ?? null,
    studentPcsFor90: studentPca?.pcsFor90 ?? null,
    studentRatios: studentPca?.varianceRatios ?? null,
    studentNames: studentInterp?.names ?? null,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main();
