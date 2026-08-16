/**
 * Student-primary PCA on main 6D radar dims:
 *   [探究结果, 竞赛结果, 探究过程, 竞赛过程, 效率, 完成度]
 * Consistency is gated (≥3 terminal + ≥2 tasks), appendix only — never in main matrix.
 * Soft-downweight: incompleteTooMany → weight 0.5 (else 1.0); all students stay in matrix.
 * Matrix gate: finiteN≥2 on main 6D; column-mean impute missing dims (report rates).
 * Sparse fallback: if a part-dim is null under terminal+finite-total avoid-null,
 *   mean finite parts.*.raw over all sessions (incl. incomplete; 0 counts).
 * Main = weighted correlation PCA; appendix = equal-weight control.
 * KMO/MSA (+ Bartlett if scipy): on equal-weight Pearson corr of imputed main 6D
 *   (primary, textbook); optional soft-weighted corr KMO noted in report.
 * Does not modify product UI. Writes report markdown.
 *
 * Traces root (priority):
 *   1) --traces-root=<path>
 *   2) TRACES_ROOT env
 *   3) newest traces-全部-YYYYMMDD under ./ or data/runtime/analysis/
 *      (e.g. 20260816 > 20260813; analysis/ is the preferred snapshot home)
 *   4) platform traces dir
 *
 * Observe-only / researchInclude=false sessions are excluded by default.
 * Pass --include-observe-only to keep them.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { getTracesRoot } = require('../packages/platform/paths');
const { loadChapterForGraph, getCatalogItem, readCatalog } = require('../packages/platform/catalog');
const { isResearchInclude } = require('../packages/platform/catalog-visibility');
const { loadChapterForSample, getReportsRoot } = require('../packages/shared/data-paths');
const { computeAbilityScore } = require('../packages/judge/ability-score');
const {
  deriveTerminalOutcome,
  isTerminalSession,
} = require('../packages/judge/session-terminal');

const ABILITY_SCORE_VERSION = 4;
/** Enter main PCA matrix when ≥ this many main-6 dims are finite (pre-impute). */
const MIN_FINITE_DIMS = 2;
const MIN_PCA_N = 3;
/** Soft downweight for incompleteTooMany students in main PCA (others stay 1.0). */
const INCOMPLETE_SOFT_WEIGHT = 0.5;
/** Consistency only when terminal sessions ≥3 and distinct tasks ≥2. */
const MIN_CONSISTENCY_TERMINAL = 3;
const MIN_CONSISTENCY_TASKS = 2;
/** Reported dims (consistency is gated appendix only). */
const DIM_KEYS = [
  'exploreResult',
  'challengeResult',
  'exploreProcess',
  'challengeProcess',
  'efficiency',
  'completion',
  'consistency',
];
/** Main PCA 6D — never include consistency. */
const PCA_DIM_KEYS = [
  'exploreResult',
  'challengeResult',
  'exploreProcess',
  'challengeProcess',
  'efficiency',
  'completion',
];
/** Consistency-eligible subsample PCA: main 6 + consistency. */
const CONS_PCA_DIM_KEYS = [
  'exploreResult',
  'challengeResult',
  'exploreProcess',
  'challengeProcess',
  'efficiency',
  'completion',
  'consistency',
];
const DIM_LABELS_ZH = {
  exploreResult: '探究结果',
  challengeResult: '竞赛结果',
  result: '竞赛结果',
  exploreProcess: '探究过程',
  challengeProcess: '竞赛过程',
  efficiency: '效率',
  consistency: '一致性',
  completion: '完成度',
};

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

/**
 * Task-level totals — aligned with teacher.html:
 * per task, mean of newest 1–2 terminal sessions with finite ability total.
 */
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
  const parts = sessionAbilityScore(session)?.parts;
  if (!parts) return null;
  let raw = parts?.[partKey]?.raw;
  if (partKey === 'challengeResult' && (raw == null || raw === '')) {
    raw = parts?.result?.raw;
  }
  if (partKey === 'result' && (raw == null || raw === '') && parts?.challengeResult) {
    raw = parts.challengeResult.raw;
  }
  // Number(null)===0 — distinguish missing raw from explicit 0 (e.g. explore none)
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Per-dimension representative sessions: newest n with non-null parts.*.raw.
 * 0 counts as present; only null/non-finite is skipped.
 */
function pickRepSessionsForPart(sessions, partKey, n = 2) {
  const limit = Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : 2;
  return sortSessionsNewestFirst(sessions)
    .filter(s => abilityPartRaw(s, partKey) != null)
    .slice(0, limit);
}

/** Terminal + finite-total candidates grouped by task (same pool as composite reps). */
function finiteTerminalSessionsByTask(student) {
  const byTask = new Map();
  for (const s of terminalSessionsOf(student)) {
    if (sessionFiniteAbilityTotal(s) == null) continue;
    const key = sessionTaskKey(s);
    if (!byTask.has(key)) byTask.set(key, []);
    byTask.get(key).push(s);
  }
  return byTask;
}

/**
 * Per task: mean of newest 1–2 non-null part sessions; then mean across tasks.
 * Task contributes nothing if it has no non-null session for that part.
 * Default candidate pool = terminal + finite ability total.
 */
function meanPartByTaskAvoidNull(student, partKey, byTask = null) {
  const pool = byTask || finiteTerminalSessionsByTask(student);
  const taskMeans = [];
  for (const [, list] of pool) {
    const reps = pickRepSessionsForPart(list, partKey, 2);
    if (!reps.length) continue;
    const m = meanFinite(reps.map(s => abilityPartRaw(s, partKey)));
    if (m != null) taskMeans.push(m);
  }
  return meanFinite(taskMeans);
}

/** True if student has ≥1 terminal session with finite ability total. */
function hasFiniteTerminalTotal(student) {
  return finiteTerminalSessionsByTask(student).size > 0;
}

/**
 * Sparse fallback: mean of parts.*.raw over ALL sessions (terminal + incomplete).
 * 0 counts; null/non-finite skipped. Not task-grouped — simple session mean.
 */
function meanPartAllSessionsFiniteRaw(student, partKey) {
  const sessions = Array.isArray(student?.sessions) ? student.sessions : [];
  const vals = [];
  for (const s of sessions) {
    const v = abilityPartRaw(s, partKey);
    if (v != null) vals.push(v);
  }
  return meanFinite(vals);
}

/**
 * Default avoid-null (terminal+finite total); if null, sparse all-session finite-raw mean.
 * Returns { value, usedSparse }.
 */
function meanPartWithSparseFallback(student, partKey) {
  const primary = meanPartByTaskAvoidNull(student, partKey);
  if (primary != null) return { value: primary, usedSparse: false };
  const sparse = meanPartAllSessionsFiniteRaw(student, partKey);
  if (sparse != null) return { value: sparse, usedSparse: true };
  return { value: null, usedSparse: false };
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

/**
 * Aligned with teacher.html incompleteTooMany:
 * incomplete≥5, or incomplete/total≥50% and incomplete≥3.
 */
function incompleteTooMany(stats) {
  const incompleteN = Number(stats?.incompleteN) || 0;
  const totalN = Number(stats?.totalN) || 0;
  if (incompleteN >= 5) return true;
  if (totalN > 0 && incompleteN / totalN >= 0.5 && incompleteN >= 3) return true;
  return false;
}

function pcaSampleWeight(stats) {
  return incompleteTooMany(stats) ? INCOMPLETE_SOFT_WEIGHT : 1;
}

function computeCompletionScore(student) {
  const { terminalN, incompleteN, totalN } = countSessionTerminalStats(student);
  if (!totalN) return null;
  return Math.round(100 * terminalN / (terminalN + incompleteN));
}

function fallbackChallengeResultFromTerminal(student) {
  const terminal = terminalSessionsOf(student);
  if (!terminal.length) return null;
  const passN = terminal.filter(s => {
    const outcome = terminalOutcomeOf(s);
    return outcome === 'pass'
      || s.verdict === 'pass'
      || s.abilityScore?.bands?.challengeResult === '达标'
      || s.abilityScore?.bands?.result === '达标';
  }).length;
  return (passN / terminal.length) * 100;
}

/** Count sessions with non-null part in terminal+finite-total pool. */
function countSessionsWithPart(student, partKey) {
  let n = 0;
  for (const [, list] of finiteTerminalSessionsByTask(student)) {
    n += list.filter(s => abilityPartRaw(s, partKey) != null).length;
  }
  return n;
}

/** Count any session (incl. incomplete) with finite parts.*.raw. */
function countAllSessionsWithPart(student, partKey) {
  const sessions = Array.isArray(student?.sessions) ? student.sessions : [];
  return sessions.filter(s => abilityPartRaw(s, partKey) != null).length;
}

/**
 * Student dims: main 6 for PCA + gated consistency appendix.
 * - composite: per-task newest 1–2 terminal finite totals, then task mean
 * - explore/challenge/efficiency: default = per-dim avoid-null on terminal+finite-total;
 *   if null → sparse = mean finite raw over all sessions (incl. incomplete)
 * - exploreResult none=0 enters; unexplored null skipped until a non-null session exists
 * - challengeResult: avoid-null → legacy result → sparse raw → pass-rate over terminal
 * - consistency: only if terminalN≥MIN_CONSISTENCY_TERMINAL and taskCount≥MIN_CONSISTENCY_TASKS
 * - completion: terminal / (terminal + incomplete) over all sessions
 */
function computeStudentRadarDims(student) {
  const agg = aggregateStudentAbilityByTask(student);
  const terminalStats = countSessionTerminalStats(student);
  const noFiniteTerminalPool = !hasFiniteTerminalTotal(student);
  const sparseDims = [];

  let challengeResult = meanPartByTaskAvoidNull(student, 'challengeResult');
  if (challengeResult == null) challengeResult = meanPartByTaskAvoidNull(student, 'result');
  if (challengeResult == null) {
    const sparseCr = meanPartAllSessionsFiniteRaw(student, 'challengeResult');
    const sparseLegacy = sparseCr == null ? meanPartAllSessionsFiniteRaw(student, 'result') : null;
    if (sparseCr != null) {
      challengeResult = sparseCr;
      sparseDims.push('challengeResult');
    } else if (sparseLegacy != null) {
      challengeResult = sparseLegacy;
      sparseDims.push('challengeResult');
    }
  }
  if (challengeResult == null) challengeResult = fallbackChallengeResultFromTerminal(student);

  const er = meanPartWithSparseFallback(student, 'exploreResult');
  const ep = meanPartWithSparseFallback(student, 'exploreProcess');
  const cp = meanPartWithSparseFallback(student, 'challengeProcess');
  const ef = meanPartWithSparseFallback(student, 'efficiency');
  if (er.usedSparse) sparseDims.push('exploreResult');
  if (ep.usedSparse) sparseDims.push('exploreProcess');
  if (cp.usedSparse) sparseDims.push('challengeProcess');
  if (ef.usedSparse) sparseDims.push('efficiency');

  const taskCount = agg.taskScores.length;
  const consistencyEligible = terminalStats.terminalN >= MIN_CONSISTENCY_TERMINAL
    && taskCount >= MIN_CONSISTENCY_TASKS;
  let consistency = null;
  if (consistencyEligible) {
    consistency = consistencyFromTotals(agg.taskScores.map(t => t.score));
  }
  const completion = computeCompletionScore(student);
  const partCounts = {
    exploreResult: countSessionsWithPart(student, 'exploreResult')
      || countAllSessionsWithPart(student, 'exploreResult'),
    challengeResult: countSessionsWithPart(student, 'challengeResult')
      || countSessionsWithPart(student, 'result')
      || countAllSessionsWithPart(student, 'challengeResult')
      || countAllSessionsWithPart(student, 'result'),
    exploreProcess: countSessionsWithPart(student, 'exploreProcess')
      || countAllSessionsWithPart(student, 'exploreProcess'),
    challengeProcess: countSessionsWithPart(student, 'challengeProcess')
      || countAllSessionsWithPart(student, 'challengeProcess'),
    efficiency: countSessionsWithPart(student, 'efficiency')
      || countAllSessionsWithPart(student, 'efficiency'),
  };
  return {
    composite: agg.composite,
    dims: {
      exploreResult: er.value,
      challengeResult,
      exploreProcess: ep.value,
      challengeProcess: cp.value,
      efficiency: ef.value,
      consistency,
      completion,
    },
    partCounts,
    scoredSessionCount: agg.representativeSessions.length,
    taskCount,
    consistencyEligible,
    noFiniteTerminalPool,
    sparseFallbackDims: sparseDims,
    usedSparseFallback: sparseDims.length > 0 || noFiniteTerminalPool,
    ...terminalStats,
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

function countFiniteDims(dims, keys = PCA_DIM_KEYS) {
  return keys.filter(k => Number.isFinite(dims[k])).length;
}

/**
 * Column-mean impute missing keys. Returns { rows, means, columnMissing, perRowMissing }.
 * perRowMissing: [{ studentKey, studentLabel, missingKeys, missingN }]
 */
function imputeColumnMeans(rows, keys) {
  const means = {};
  const columnMissing = {};
  for (const k of keys) {
    const xs = rows.map(r => r[k]).filter(n => Number.isFinite(n));
    means[k] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    columnMissing[k] = rows.length - xs.length;
  }
  const perRowMissing = [];
  const imputedRows = rows.map(r => {
    const out = { ...r };
    const missingKeys = [];
    for (const k of keys) {
      if (!Number.isFinite(out[k])) {
        missingKeys.push(k);
        out[k] = means[k];
      }
    }
    out._imputedKeys = missingKeys;
    out._imputedN = missingKeys.length;
    if (missingKeys.length) {
      perRowMissing.push({
        studentKey: r.studentKey,
        studentLabel: r.studentLabel,
        missingKeys,
        missingN: missingKeys.length,
      });
    }
    return out;
  });
  return { rows: imputedRows, means, columnMissing, perRowMissing };
}

/**
 * Weighted correlation PCA (numpy eigh).
 * weights: per-row sample weights (default all 1 → equal-weight / unweighted).
 * Method: weighted column mean & sd → standardize → C = Z' diag(w) Z / sum(w)
 * (equiv. multiply each row by sqrt(w_i) then form Gram / sum(w)).
 */
function runPythonPca(matrix, labels, weights = null) {
  const n = Array.isArray(matrix) ? matrix.length : 0;
  const w = Array.isArray(weights) && weights.length === n
    ? weights.map(x => Number(x))
    : Array.from({ length: n }, () => 1);
  const payload = JSON.stringify({ matrix, labels, weights: w });
  const py = `
import json, sys
import numpy as np

data = json.loads(sys.stdin.read())
X = np.asarray(data["matrix"], dtype=float)
labels = data["labels"]
n, p = X.shape
w = np.asarray(data.get("weights") or [1.0] * n, dtype=float)
if w.shape != (n,):
    raise SystemExit("weights length mismatch")
w = np.maximum(w, 0.0)
if float(w.sum()) <= 0:
    w = np.ones(n, dtype=float)
w_sum = float(w.sum())
# weighted z-score columns
mu = np.average(X, axis=0, weights=w)
var = np.average((X - mu) ** 2, axis=0, weights=w)
sd = np.sqrt(var)
sd[sd < 1e-12] = 1.0
Z = (X - mu) / sd
# weighted correlation: row-scale by sqrt(w), then Gram / sum(w)
Zw = Z * np.sqrt(w)[:, None]
C = (Zw.T @ Zw) / w_sum
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
    "weightSum": w_sum,
    "effectiveN": float((w_sum ** 2) / float(np.sum(w ** 2))) if w_sum > 0 else float(n),
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

/**
 * KMO / MSA (+ Bartlett sphericity) on correlation matrix of imputed X.
 * Default weights=null/all-1 → classic equal-weight Pearson (textbook KMO).
 * Soft weights → weighted correlation KMO (optional companion).
 */
function runPythonKmo(matrix, labels, weights = null) {
  const n = Array.isArray(matrix) ? matrix.length : 0;
  const w = Array.isArray(weights) && weights.length === n
    ? weights.map(x => Number(x))
    : Array.from({ length: n }, () => 1);
  const payload = JSON.stringify({ matrix, labels, weights: w });
  const py = `
import json, sys
import numpy as np

data = json.loads(sys.stdin.read())
X = np.asarray(data["matrix"], dtype=float)
labels = data["labels"]
n, p = X.shape
w = np.asarray(data.get("weights") or [1.0] * n, dtype=float)
if w.shape != (n,):
    raise SystemExit("weights length mismatch")
w = np.maximum(w, 0.0)
if float(w.sum()) <= 0:
    w = np.ones(n, dtype=float)
equal_w = bool(np.allclose(w, 1.0))

# correlation matrix (Pearson equal-weight, or weighted corr matching PCA)
if equal_w:
    # np.corrcoef needs n>=2; column sd>0
    sd = X.std(axis=0, ddof=0)
    if n < 2 or p < 2 or np.any(sd < 1e-12):
        out = {
            "ok": False,
            "error": "degenerate matrix (n<2, p<2, or zero-variance column)",
            "n": int(n), "p": int(p),
            "matrixKind": "equal_pearson",
        }
        print(json.dumps(out, ensure_ascii=False))
        raise SystemExit(0)
    R = np.corrcoef(X, rowvar=False)
else:
    mu = np.average(X, axis=0, weights=w)
    var = np.average((X - mu) ** 2, axis=0, weights=w)
    sd = np.sqrt(var)
    if n < 2 or p < 2 or np.any(sd < 1e-12):
        out = {
            "ok": False,
            "error": "degenerate matrix (n<2, p<2, or zero-variance column)",
            "n": int(n), "p": int(p),
            "matrixKind": "weighted_corr",
        }
        print(json.dumps(out, ensure_ascii=False))
        raise SystemExit(0)
    Z = (X - mu) / sd
    Zw = Z * np.sqrt(w)[:, None]
    R = (Zw.T @ Zw) / float(w.sum())
    # force unit diagonal for numerical stability
    d = np.sqrt(np.clip(np.diag(R), 1e-18, None))
    R = R / np.outer(d, d)
    np.fill_diagonal(R, 1.0)

R = np.asarray(R, dtype=float)
# symmetrize
R = 0.5 * (R + R.T)
np.fill_diagonal(R, 1.0)

# invert R for anti-image / partial correlations
try:
    R_inv = np.linalg.inv(R)
    inv_method = "inv"
except np.linalg.LinAlgError:
    R_inv = np.linalg.pinv(R)
    inv_method = "pinv"

diag_inv = np.diag(R_inv).copy()
diag_inv[diag_inv < 1e-18] = 1e-18
# anti-image correlation (partial corr off-diagonal)
Q = -R_inv / np.sqrt(np.outer(diag_inv, diag_inv))
np.fill_diagonal(Q, 1.0)

R2 = R ** 2
Q2 = Q ** 2
np.fill_diagonal(R2, 0.0)
np.fill_diagonal(Q2, 0.0)
num = float(R2.sum())
den = num + float(Q2.sum())
kmo = float(num / den) if den > 0 else None

msa = {}
for i in range(p):
    ni = float(R2[:, i].sum())
    di = ni + float(Q2[:, i].sum())
    msa[labels[i]] = float(ni / di) if di > 0 else None

# Bartlett test of sphericity (scipy if available)
bartlett = None
try:
    from scipy import stats
    sign, logdet = np.linalg.slogdet(R)
    if sign <= 0:
        bartlett = {
            "ok": False,
            "error": "correlation matrix not positive definite (det<=0)",
            "logdet": float(logdet),
        }
    else:
        # -(n - 1 - (2p+5)/6) * ln|R|
        chi2 = float(-(n - 1 - (2 * p + 5) / 6.0) * logdet)
        df = int(p * (p - 1) / 2)
        pvalue = float(stats.chi2.sf(chi2, df)) if df > 0 else None
        bartlett = {
            "ok": True,
            "chi2": chi2,
            "df": df,
            "pvalue": pvalue,
        }
except Exception as e:
    bartlett = {"ok": False, "error": str(e)}

out = {
    "ok": True,
    "n": int(n),
    "p": int(p),
    "matrixKind": "equal_pearson" if equal_w else "weighted_corr",
    "kmo": kmo,
    "msa": msa,
    "bartlett": bartlett,
    "invMethod": inv_method,
    "corrDetSign": int(np.linalg.slogdet(R)[0]),
}
print(json.dumps(out, ensure_ascii=False))
`;
  const res = spawnSync('python', ['-c', py], {
    input: payload,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`KMO python failed: ${res.stderr || res.stdout}`);
  }
  return JSON.parse(res.stdout);
}

/** Kaiser rule-of-thumb for overall KMO / MSA. */
function interpretKmo(kmo) {
  if (kmo == null || !Number.isFinite(Number(kmo))) {
    return { band: 'unknown', zh: '无法计算' };
  }
  const v = Number(kmo);
  if (v < 0.5) return { band: 'unacceptable', zh: '不适合（<0.5）' };
  if (v < 0.6) return { band: 'miserable', zh: '很差 / 勉强边缘（0.5–0.6）' };
  if (v < 0.7) return { band: 'mediocre', zh: '勉强可接受（0.6–0.7）' };
  if (v < 0.8) return { band: 'middling', zh: '一般（0.7–0.8）' };
  if (v < 0.9) return { band: 'meritorious', zh: '良好（0.8–0.9）' };
  return { band: 'marvelous', zh: '优秀（≥0.9）' };
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

function suggestPcNames(pca) {
  const names = {};
  for (let j = 1; j <= Math.min(3, pca.p || 0); j += 1) {
    const L = pca.loadings[`PC${j}`] || {};
    const er = Number(L['探究结果'] ?? 0);
    const cr = Number(L['竞赛结果'] ?? L['结果'] ?? 0);
    const ep = Number(L['探究过程'] ?? L['探究'] ?? 0);
    const cp = Number(L['竞赛过程'] ?? L['竞赛'] ?? 0);
    const ef = Number(L['效率'] ?? 0);
    const cons = Number(L['一致性'] ?? 0);
    const comp = Number(L['完成度'] ?? 0);
    let name = `PC${j}`;
    if (j === 1 && cr > 0.3 && cp > 0.3 && (comp > 0.3 || ef > 0.3)) {
      name = '竞赛侧综合表现';
    } else if (j === 1 && er > 0.3 && ep > 0.3 && cr > 0.3) {
      name = '探究—竞赛综合表现';
    } else if (j === 1 && (cr > 0.35 || ef > 0.35) && comp > 0.35) {
      name = '通关—完成综合表现';
    } else if (Math.abs(ep) > 0.5 && Math.abs(er) > 0.35 && Math.sign(ep) === Math.sign(er)
      && Math.abs(ep) >= Math.abs(cr) && Math.abs(ep) >= Math.abs(cp)) {
      name = '探究侧（结果+过程）';
    } else if (Math.abs(ep) > 0.5 && Math.abs(comp) > 0.35 && Math.sign(ep) !== Math.sign(comp)) {
      name = ep > 0 ? '深探究 vs 高完成' : '高完成 vs 深探究';
    } else if (Math.abs(ep) > 0.45 && Math.abs(ef) > 0.45 && Math.sign(ep) === Math.sign(ef)) {
      // Prefer process–efficiency co-variation when both dominate (even if result opposes).
      name = '探究过程—效率共变';
    } else if (Math.abs(ep) > 0.45 && Math.abs(cr) > 0.3 && Math.sign(ep) !== Math.sign(cr)) {
      name = ep > 0 ? '深探究 vs 竞赛结果' : '竞赛结果 vs 深探究';
    } else if (Math.abs(er) > 0.55 && Math.abs(er) >= Math.abs(ep) && Math.abs(er) >= Math.abs(cr)) {
      name = Math.abs(cp) > 0.35 && Math.sign(er) !== Math.sign(cp)
        ? '探究达成 vs 竞赛过程'
        : '探究结果主导分化';
    } else if (Math.abs(ef) > 0.5 && Math.abs(ef) >= Math.abs(cr) && Math.abs(ef) >= Math.abs(ep)) {
      name = '效率主导分化';
    } else if (Math.abs(cons) > 0.55 && Math.abs(cons) >= Math.abs(ep) && Math.abs(cons) >= Math.abs(comp)) {
      name = '一致性主导轴';
    } else if (Math.abs(comp) > 0.5 && Math.abs(cr) > 0.35 && Math.sign(comp) !== Math.sign(cr)) {
      name = comp > 0 ? '高完成 vs 竞赛结果' : '竞赛结果 vs 高完成';
    } else if (Math.abs(cp) > 0.45 && Math.abs(cr) > 0.35 && Math.sign(cp) === Math.sign(cr)
      && Math.abs(cp) >= Math.abs(ep) && Math.abs(cr) >= Math.abs(ef)) {
      name = '竞赛侧（结果+过程）';
    } else if (Math.abs(cp) > 0.45 && Math.abs(cr) > 0.35 && Math.sign(cp) !== Math.sign(cr)) {
      name = cp > 0 ? '竞赛过程 vs 竞赛结果' : '竞赛结果 vs 竞赛过程';
    } else {
      name = `风格分化（${topLoadingsText(L, 2)}）`;
    }
    names[`PC${j}`] = name;
  }
  return names;
}

function interpretPca(pca, { teaching = false } = {}) {
  const names = suggestPcNames(pca);
  const sentences = [];
  for (let j = 1; j <= Math.min(3, pca.p || 0); j += 1) {
    const L = pca.loadings[`PC${j}`] || {};
    const label = names[`PC${j}`] || `PC${j}`;
    if (teaching) {
      const tops = Object.entries(L || {})
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 3)
        .map(([name]) => name);
      sentences.push(
        `PC${j}（约 ${fmtPct(pca.varianceRatios[j - 1] || 0)}）可理解为「${label}」，主要与 ${tops.join('、')} 共变。`,
      );
    } else {
      sentences.push(
        `PC${j}（解释 ${fmtPct(pca.varianceRatios[j - 1] || 0)}，建议命名「${label}」）主要载荷：${topLoadingsText(L)}。`,
      );
    }
  }
  sentences.push(
    `达到累计方差 ≥80% 需 ${pca.pcsFor80} 个主成分，≥90% 需 ${pca.pcsFor90} 个。`,
  );
  return { text: sentences.join(''), names };
}

function eigenTable(pca, labels, { loadingsTitle = 'PC1–PC3 载荷（加权/等权相关矩阵 PCA）' } = {}) {
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
  lines.push(`### ${loadingsTitle}`);
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

function pcBriefLine(pca, interp) {
  if (!pca) return '（未跑）';
  const names = interp?.names || {};
  const parts = [];
  for (let j = 1; j <= Math.min(3, pca.p || 0); j += 1) {
    const label = names[`PC${j}`] || `PC${j}`;
    parts.push(`PC${j} ${fmtPct(pca.varianceRatios[j - 1] || 0)}「${label}」`);
  }
  return parts.join('；');
}

function compareLoadingsBrief(pcaA, pcaB, labelsZh) {
  if (!pcaA || !pcaB) return [];
  const notes = [];
  for (let j = 1; j <= Math.min(3, pcaA.p || 0, pcaB.p || 0); j += 1) {
    const La = pcaA.loadings[`PC${j}`] || {};
    const Lb = pcaB.loadings[`PC${j}`] || {};
    // Align PC sign so comparison is not inflated by arbitrary flip.
    let dot = 0;
    for (const zh of labelsZh) {
      dot += Number(La[zh] ?? 0) * Number(Lb[zh] ?? 0);
    }
    const sign = dot < 0 ? -1 : 1;
    let maxAbsDiff = 0;
    let maxDim = '';
    for (const zh of labelsZh) {
      const da = Number(La[zh] ?? 0);
      const db = sign * Number(Lb[zh] ?? 0);
      const d = Math.abs(da - db);
      if (d > maxAbsDiff) {
        maxAbsDiff = d;
        maxDim = zh;
      }
    }
    const ra = pcaA.varianceRatios[j - 1] || 0;
    const rb = pcaB.varianceRatios[j - 1] || 0;
    notes.push(
      `PC${j}：方差 ${fmtPct(ra)} → ${fmtPct(rb)}（Δ ${(100 * (rb - ra)).toFixed(1)} pt）${sign < 0 ? '；对照相对主分析存在符号翻转（已对齐后比较）' : ''}；对齐后载荷最大绝对差在「${maxDim}」（${fmtNum(maxAbsDiff, 3)}）`,
    );
  }
  return notes;
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

function parseArgs(argv) {
  const out = {
    tracesRoot: null,
    /** Default true: exclude observe-only / researchInclude=false sessions from PCA. */
    excludeObserveOnly: true,
    includeObserveOnly: false,
  };
  for (const a of argv) {
    if (a.startsWith('--traces-root=')) out.tracesRoot = a.slice('--traces-root='.length);
    else if (a === '--traces-root') out._nextTraces = true;
    else if (out._nextTraces) {
      out.tracesRoot = a;
      out._nextTraces = false;
    } else if (a === '--include-observe-only') {
      out.includeObserveOnly = true;
      out.excludeObserveOnly = false;
    } else if (a === '--exclude-observe-only') {
      out.excludeObserveOnly = true;
      out.includeObserveOnly = false;
    }
  }
  delete out._nextTraces;
  return out;
}

function resolveNewestBundledTracesRoot() {
  const repoRoot = path.join(__dirname, '..');
  const scanDirs = [
    repoRoot,
    path.join(repoRoot, 'data', 'runtime', 'analysis'),
  ];
  let best = null;
  let bestDate = '';
  for (const dir of scanDirs) {
    try {
      for (const name of fs.readdirSync(dir)) {
        const m = /^traces-全部-(\d{8})$/.exec(name);
        if (!m) continue;
        if (m[1] > bestDate) {
          bestDate = m[1];
          best = path.join(dir, name);
        }
      }
    } catch { /* try next scan dir */ }
  }
  return best && fs.existsSync(best) ? best : null;
}

function resolveTracesRoot(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.tracesRoot) return path.resolve(args.tracesRoot);
  if (process.env.TRACES_ROOT) return path.resolve(process.env.TRACES_ROOT);
  const bundled = resolveNewestBundledTracesRoot();
  if (bundled) return bundled;
  return getTracesRoot();
}

function studentGroupKey(row) {
  if (row.studentId) return String(row.studentId).trim();
  const label = String(row.studentLabel || '匿名学生').trim() || '匿名学生';
  if (label !== '匿名学生') return label;
  return `匿名 · ${String(row.sessionId || '').slice(-6)}`;
}

function resolveChapterForSession(session) {
  const graphId = String(session?.graphId || '').trim();
  const catalogId = String(session?.catalogId || '').trim();
  const candidates = [];
  if (graphId) {
    candidates.push(graphId);
    candidates.push(graphId.replace(/^html-samples-/, ''));
  }
  if (catalogId) {
    candidates.push(catalogId);
    candidates.push(catalogId.replace(/^demo-/, ''));
    candidates.push(catalogId.replace(/^html-samples-/, ''));
  }
  const seen = new Set();
  for (const id of candidates) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    try {
      const ch = loadChapterForGraph(id) || loadChapterForSample(id);
      if (ch) return ch;
    } catch { /* try next */ }
  }
  return null;
}

function ensureAbilityScoreOnSession(session, stats) {
  if (sessionAbilityScore(session)) {
    stats.alreadyV3 += 1;
    return session;
  }
  stats.missingV3 += 1;
  const events = Array.isArray(session.events) ? session.events : [];
  if (!events.length) {
    stats.skipNoEvents += 1;
    return session;
  }
  const chapter = resolveChapterForSession(session);
  if (!chapter) {
    stats.skipNoChapter += 1;
    return session;
  }
  try {
    const abilityScore = computeAbilityScore({
      events,
      chapter,
      verdict: session.verdict || session.judgeResult?.verdict || null,
      judged: !!session.judgeResult,
      packageId: session.packageId || session.catalogId || null,
      graphId: session.graphId || null,
      attemptsExhausted: session.attemptsExhausted === true
        || terminalOutcomeOf(session) === 'exhausted_fail',
      terminalOutcome: terminalOutcomeOf(session),
      exploreScore: session.strategyPathSummaryExplore || session.strategyPathByPhase?.explore || null,
      challengeScore: session.strategyPathSummary || session.strategyPathByPhase?.challenge || null,
    });
    session.abilityScore = abilityScore;
    stats.rescored += 1;
  } catch {
    stats.skipComputeError += 1;
  }
  return session;
}

function catalogItemForSession(row) {
  const id = String(row?.catalogId || '').trim();
  if (id) {
    const item = getCatalogItem(id);
    if (item) return item;
  }
  const graphId = String(row?.graphId || row?.packageId || '').trim();
  if (!graphId) return null;
  const catalog = readCatalog();
  return (catalog.items || []).find((i) => i.graphId === graphId || String(i.graphId || '').endsWith(graphId)) || null;
}

function sessionIncludedInResearch(row) {
  const item = catalogItemForSession(row);
  if (item) return isResearchInclude(item);
  // No catalog hit: keep unless tags on row itself say observe-only
  if (Array.isArray(row?.sampleTags) && row.sampleTags.includes('observe-only')) return false;
  return true;
}

function listStudentsFromTracesRoot(tracesRoot, { limit = 1000, excludeObserveOnly = false } = {}) {
  if (!fs.existsSync(tracesRoot)) {
    throw new Error(`traces root not found: ${tracesRoot}`);
  }
  const files = fs.readdirSync(tracesRoot).filter(f => f.endsWith('.json'));
  const scoreStats = {
    alreadyV3: 0,
    missingV3: 0,
    rescored: 0,
    skipNoEvents: 0,
    skipNoChapter: 0,
    skipComputeError: 0,
    skippedObserveOnly: 0,
  };
  const groups = new Map();
  let sessionFileN = 0;
  for (const file of files) {
    let row;
    try {
      row = JSON.parse(fs.readFileSync(path.join(tracesRoot, file), 'utf8'));
    } catch {
      continue;
    }
    if (!row || !row.sessionId) continue;
    sessionFileN += 1;
    if (excludeObserveOnly && !sessionIncludedInResearch(row)) {
      scoreStats.skippedObserveOnly += 1;
      continue;
    }
    ensureAbilityScoreOnSession(row, scoreStats);
    const key = studentGroupKey(row);
    if (!groups.has(key)) {
      groups.set(key, {
        studentKey: key,
        studentLabel: row.studentLabel || '匿名学生',
        sessionCount: 0,
        pendingCount: 0,
        totalEvents: 0,
        lastUpdatedAt: null,
        latestVerdict: null,
        sessions: [],
      });
    }
    const g = groups.get(key);
    g.sessionCount += 1;
    if (!row.judgeResult) g.pendingCount += 1;
    g.totalEvents += row.eventCount || row.events?.length || 0;
    if (row.updatedAt && (!g.lastUpdatedAt || row.updatedAt > g.lastUpdatedAt)) {
      g.lastUpdatedAt = row.updatedAt;
    }
    if (row.studentLabel) g.studentLabel = row.studentLabel;
    const verdict = row.judgeResult?.verdict || row.verdict || null;
    const gaps = Array.isArray(row.judgeResult?.teacherSummary?.gaps)
      ? row.judgeResult.teacherSummary.gaps
      : (Array.isArray(row.judgeResult?.gaps) ? row.judgeResult.gaps : null);
    g.sessions.push({
      sessionId: row.sessionId,
      catalogId: row.catalogId || null,
      graphId: row.graphId || null,
      packageId: row.packageId || null,
      taskCode: row.taskCode || null,
      startedAt: row.startedAt,
      updatedAt: row.updatedAt,
      eventCount: row.eventCount || row.events?.length || 0,
      judged: !!row.judgeResult,
      verdict,
      gaps,
      ch: row.ch,
      strategyPathSummary: row.strategyPathSummary || null,
      strategyPathSummaryExplore: row.strategyPathSummaryExplore || null,
      strategyPathByPhase: row.strategyPathByPhase || null,
      scoredPhase: row.scoredPhase || row.strategyPathSummary?.scoredPhase || null,
      abilityScore: row.abilityScore || null,
      terminalOutcome: row.terminalOutcome || deriveTerminalOutcome(row) || null,
      attemptsExhausted: row.attemptsExhausted,
      events: row.events || [],
    });
  }
  let items = [...groups.values()];
  items.sort((a, b) => (b.lastUpdatedAt || '').localeCompare(a.lastUpdatedAt || ''));
  for (const item of items) {
    item.sessions.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }
  return {
    students: items.slice(0, limit),
    sessionFileN,
    scoreStats,
    tracesRoot,
  };
}

function main() {
  const cli = parseArgs(process.argv.slice(2));
  const excludeObserveOnly = cli.excludeObserveOnly !== false && !cli.includeObserveOnly;
  const { students, sessionFileN, scoreStats, tracesRoot } = listStudentsFromTracesRoot(
    resolveTracesRoot(process.argv.slice(2)),
    { limit: 1000, excludeObserveOnly },
  );
  const filteredOut = students.filter(isSyntheticLabel);
  const kept = students.filter(s => !isSyntheticLabel(s));
  const simStudents = kept.filter(isSimStudent);
  const humanLike = kept.filter(s => !isSimStudent(s));

  const rowsRaw = [];
  let studentsSkippedLowFinite = 0;
  let studentsSkippedNoDims = 0;
  for (const s of kept) {
    const radar = computeStudentRadarDims(s);
    const finiteN = countFiniteDims(radar.dims, PCA_DIM_KEYS);
    if (finiteN === 0) {
      studentsSkippedNoDims += 1;
      continue;
    }
    if (finiteN < MIN_FINITE_DIMS) {
      studentsSkippedLowFinite += 1;
      continue;
    }
    const totalN = Number(radar.totalN) || (radar.terminalN + radar.incompleteN);
    const softFlag = incompleteTooMany({
      incompleteN: radar.incompleteN,
      totalN,
    });
    const weight = softFlag ? INCOMPLETE_SOFT_WEIGHT : 1;
    const sparseDims = Array.isArray(radar.sparseFallbackDims) ? radar.sparseFallbackDims : [];
    rowsRaw.push({
      studentKey: s.studentKey,
      studentLabel: s.studentLabel,
      finiteN,
      ...radar.dims,
      partCounts: radar.partCounts,
      scoredSessionCount: radar.scoredSessionCount,
      taskCount: radar.taskCount,
      terminalN: radar.terminalN,
      incompleteN: radar.incompleteN,
      totalN,
      incompleteTooMany: softFlag,
      weight,
      consistencyEligible: !!radar.consistencyEligible,
      noFiniteTerminalPool: !!radar.noFiniteTerminalPool,
      sparseFallbackDims: sparseDims,
      usedSparseFallback: sparseDims.length > 0,
      isSim: isSimStudent(s),
    });
  }

  const consistencyEligibleRows = rowsRaw.filter(
    r => r.consistencyEligible && Number.isFinite(r.consistency),
  );
  const downweightedRows = rowsRaw.filter(r => r.incompleteTooMany);
  const sparseFallbackRows = rowsRaw.filter(r => r.usedSparseFallback);
  const noFiniteTerminalPoolRows = rowsRaw.filter(r => r.noFiniteTerminalPool);

  // Main PCA: 6D — never impute consistency into the matrix.
  // Same imputed matrix for soft-weight main + equal-weight control.
  const imputeResult = imputeColumnMeans(rowsRaw, PCA_DIM_KEYS);
  const imputed = imputeResult.rows;
  const labelsZh = PCA_DIM_KEYS.map(k => DIM_LABELS_ZH[k]);
  const softWeights = imputed.map(r => Number(r.weight) || 1);
  const equalWeights = imputed.map(() => 1);
  let studentPca = null;
  let equalPca = null;
  let kmoEqual = null;
  let kmoSoft = null;
  if (imputed.length >= MIN_PCA_N) {
    const matrix = imputed.map(r => PCA_DIM_KEYS.map(k => r[k]));
    studentPca = runPythonPca(matrix, labelsZh, softWeights);
    equalPca = runPythonPca(matrix, labelsZh, equalWeights);
    // Primary KMO: classic equal-weight Pearson on same imputed X.
    kmoEqual = runPythonKmo(matrix, labelsZh, equalWeights);
    // Companion: soft-weighted correlation KMO (optional note).
    const softDiffers = softWeights.some((w, i) => Math.abs(Number(w) - Number(equalWeights[i])) > 1e-12);
    if (softDiffers) {
      kmoSoft = runPythonKmo(matrix, labelsZh, softWeights);
    }
  }
  const studentInterp = studentPca ? interpretPca(studentPca, { teaching: true }) : null;
  const equalInterp = equalPca ? interpretPca(equalPca, { teaching: true }) : null;

  // Optional appendix: consistency-eligible subsample (main 6 + consistency), equal-weight.
  let consistencyPca = null;
  let consistencyInterp = null;
  if (consistencyEligibleRows.length >= MIN_PCA_N) {
    const consImputed = imputeColumnMeans(consistencyEligibleRows, CONS_PCA_DIM_KEYS).rows;
    const consLabelsZh = CONS_PCA_DIM_KEYS.map(k => DIM_LABELS_ZH[k]);
    const consMatrix = consImputed.map(r => CONS_PCA_DIM_KEYS.map(k => r[k]));
    consistencyPca = runPythonPca(consMatrix, consLabelsZh);
    consistencyInterp = interpretPca(consistencyPca);
  }

  // Session stats for filter reporting only (not primary analysis)
  let nTerminalKept = 0;
  let nIncompleteKept = 0;
  let nSessionsWithV3 = 0;
  let nSessionsWithAnyPart = 0;
  for (const s of kept) {
    for (const sess of s.sessions || []) {
      if (isTerminalSessionRow(sess)) nTerminalKept += 1;
      else nIncompleteKept += 1;
      if (sessionAbilityScore(sess)) {
        nSessionsWithV3 += 1;
        const hasPart = [
          'exploreResult',
          'challengeResult',
          'result',
          'exploreProcess',
          'challengeProcess',
          'efficiency',
        ].some(k => abilityPartRaw(sess, k) != null);
        if (hasPart) nSessionsWithAnyPart += 1;
      }
    }
  }

  const reportPath = path.join(getReportsRoot(), 'radar-pca-analysis.md');

  const lines = [];
  lines.push('# 雷达能力维度 PCA 分析（学生级主分析）');
  lines.push('');
  lines.push(`生成时间：${new Date().toISOString()}`);
  lines.push('');
  lines.push(`> **主分析单位 = 学生**（一人一行）。主 PCA 向量 **主六维**：\`[探究结果, 竞赛结果, 探究过程, 竞赛过程, 效率, 完成度]\`。`);
  lines.push('> **效率进入主矩阵**（与产品主六维一致）；解读时仍可标明它更贴近试次/步数信号。');
  lines.push(`> **一致性 = 门槛维**：终局会话数 ≥ ${MIN_CONSISTENCY_TERMINAL} **且** 任务数（distinct catalogId/graphId/packageId）≥ ${MIN_CONSISTENCY_TASKS} 才计算并显示；否则为缺失（null /「—」），**不进主矩阵、不做列均值插补、不占主六维展示槽**。`);
  lines.push('> incomplete 纳入完成度：`completion = 终局数 / (终局 + incomplete)`；探究过程只平均 Pe 非 null 的局；探究结果对「未探究」为 null（跳过）、有探究未达成记 0。');
  lines.push('> 能力分 **v4**：竞赛结果仅看竞赛段；探究结果 = none/lucky/solid，**禁止**互相顶替。总分权重 R0.25 + Er0.08 + Pe0.24 + Pc0.24 + E0.19（缺维贡献 0、不摊权重）。');
  lines.push('');
  lines.push('## 数据与过滤');
  lines.push('');
  lines.push(`- traces 根目录：\`${tracesRoot}\``);
  lines.push(`- 会话文件：${sessionFileN}`);
  lines.push(`- 原始学生组：${students.length}`);
  lines.push(`- 过滤剔除：${filteredOut.length}（\`playtest\` / \`full-eval\` / \`全量*\` / 匿名 junk）；**保留** \`模拟-*\` 与真实学生`);
  lines.push(`- 过滤后学生：${kept.length}（模拟 ${simStudents.length}；非模拟 ${humanLike.length}）`);
  lines.push(`- 过滤后会话：终局 ${nTerminalKept} + incomplete ${nIncompleteKept}；abilityScore v4 ${nSessionsWithV3}（任一分项有限 ${nSessionsWithAnyPart}）`);
  lines.push(`- 进入学生级矩阵：${rowsRaw.length}（主 6D 中 finiteN≥${MIN_FINITE_DIMS}；仅对 6 主维列均值插补；PCA 需 n≥${MIN_PCA_N}；**全员进主矩阵**，不因姓名剔除）`);
  lines.push(`- 跳过：finiteN=0 → ${studentsSkippedNoDims}；0<finiteN<${MIN_FINITE_DIMS} → ${studentsSkippedLowFinite}`);
  lines.push(`- **一致性达标**：${consistencyEligibleRows.length} / ${rowsRaw.length}（门槛：终局≥${MIN_CONSISTENCY_TERMINAL} 且 任务数≥${MIN_CONSISTENCY_TASKS}）`);
  lines.push(`- **incomplete 软降权**：触发 ${downweightedRows.length} / ${rowsRaw.length}（权重 ${INCOMPLETE_SOFT_WEIGHT}；其余 1.0）`);
  lines.push(`- **稀疏回退**：触发 ${sparseFallbackRows.length} / ${rowsRaw.length}（默认终局+有限总分避 null 为 null 时，改用全会话有限 raw 均值；无终局有限总分池 ${noFiniteTerminalPoolRows.length} 人）`);
  lines.push('');
  lines.push('### abilityScore v4 补算');
  lines.push('');
  lines.push(`- 已有 v4：${scoreStats.alreadyV3}`);
  lines.push(`- 缺失并尝试补算：${scoreStats.missingV3}`);
  lines.push(`- 补算成功：${scoreStats.rescored}`);
  lines.push(`- 因缺 events 跳过：${scoreStats.skipNoEvents}`);
  lines.push(`- 因缺 chapter 跳过：${scoreStats.skipNoChapter}`);
  lines.push(`- 因计算异常跳过：${scoreStats.skipComputeError}`);
  if (scoreStats.skipNoChapter > 0) {
    lines.push(`- **说明**：${scoreStats.skipNoChapter} 个会话因无法解析 chapter 未能补算；对应学生若因此 finiteN 不足会被排除出矩阵。`);
  }
  lines.push('');
  lines.push('### 聚合规则');
  lines.push('');
  lines.push('- **综合分**：与教师端一致——每任务取最近 1–2 局终局有限总分均值，再对任务均分');
  lines.push('- **探究结果 / 探究过程 / 竞赛结果 / 竞赛过程 / 效率**（主）默认：按任务、按维避 null——在**终局有限总分**候选中取对应 `parts.*.raw` 非 null 的最近 1–2 局均值，再跨任务均分；`0`（有探究未达成）计入；同任务无非 null 则该任务不贡献；竞赛结果优先 `challengeResult`，旧分回退 `result`');
  lines.push('- **稀疏回退**：若某维在默认路径下为 null（或该生无任何终局+有限总分候选导致多维塌掉），则对该维改用——该生**所有会话**中该 `parts.*.raw` 有限的局取均值（**含 incomplete**；0 计入；null 跳过）；竞赛结果在 raw 仍缺时再回退终局通过率');
  lines.push('- **完成度**（主）：全部会话 `终局 / (终局 + incomplete)`，不跟代表局');
  lines.push(`- **一致性**（门槛附录）：仅当终局≥${MIN_CONSISTENCY_TERMINAL} 且任务数≥${MIN_CONSISTENCY_TASKS} 时，用各任务代表总分的离散度；否则缺失（不进主 PCA、不插补）`);
  lines.push(`- **进矩阵门槛**：主 6D 中 finiteN≥${MIN_FINITE_DIMS}；缺失主维用列均值插补（一致性永不插补）`);
  lines.push('- **主分析维数**：主六维；一致性不进入主矩阵');
  lines.push('');
  lines.push('### 稀疏回退触发名单');
  lines.push('');
  if (!sparseFallbackRows.length) {
    lines.push('（本批无学生触发稀疏回退。）');
    lines.push('');
  } else {
    lines.push('| studentKey | label | 无终局有限总分池 | 回退维度 | 有限维(6D) |');
    lines.push('|---|---|---|---|---:|');
    for (const r of sparseFallbackRows) {
      const dimsZh = (r.sparseFallbackDims || []).map(k => DIM_LABELS_ZH[k] || k).join('、') || '—';
      lines.push(
        `| ${r.studentKey} | ${r.studentLabel} | ${r.noFiniteTerminalPool ? 'Y' : ''} | ${dimsZh} | ${r.finiteN} |`,
      );
    }
    lines.push('');
  }
  lines.push('### 列均值插补比例（主六维，进矩阵后）');
  lines.push('');
  {
    const n = rowsRaw.length || 1;
    const colParts = PCA_DIM_KEYS.map(k => {
      const miss = imputeResult.columnMissing[k] || 0;
      return `${DIM_LABELS_ZH[k]} ${miss}/${rowsRaw.length}（${fmtPct(miss / n)}）`;
    });
    lines.push(`- 按列缺失（插补前）：${colParts.join('；')}`);
    lines.push(`- 有缺失需插补的学生：${imputeResult.perRowMissing.length} / ${rowsRaw.length}`);
  }
  if (imputeResult.perRowMissing.length) {
    lines.push('');
    lines.push('| studentKey | label | 缺失维数 | 缺失维 |');
    lines.push('|---|---|---:|---|');
    for (const r of imputeResult.perRowMissing) {
      const dimsZh = r.missingKeys.map(k => DIM_LABELS_ZH[k] || k).join('、');
      lines.push(`| ${r.studentKey} | ${r.studentLabel} | ${r.missingN} | ${dimsZh} |`);
    }
  }
  lines.push('');
  lines.push('### incomplete 软降权与加权 PCA 方法');
  lines.push('');
  lines.push(`- **触发规则**（与教师端 \`incompleteTooMany\` 对齐）：incomplete≥5，**或** incomplete/total≥50% 且 incomplete≥3。`);
  lines.push(`- **软降权**：触发者样本权重 **${INCOMPLETE_SOFT_WEIGHT}**，其余 **1.0**；仍保留在主矩阵（不做硬剔除）。`);
  lines.push('- **加权相关 PCA**：对同一插补后矩阵 X，用权重 w 算加权列均值与加权标准差并标准化得 Z；再令每行乘 √w_i，构造 C = Z′ diag(w) Z / Σw，对 C 做 numpy \`eigh\`（等价于加权相关/协方差 PCA）。等权时 w≡1，退化为原先未加权相关 PCA。');
  lines.push('- **主分析**用软降权；**附录**给出等权对照（权重全 1），便于看降权是否改变 PC 教学解读。');
  lines.push('- **KMO/MSA**：在**同一插补后主六维矩阵 X**上，优先用**等权 Pearson 相关矩阵**计算（与教科书一致，作主数字）；若触发软降权，另附加权相关矩阵上的 KMO 作对照。');
  lines.push('');

  lines.push('### 触发软降权的学生');
  lines.push('');
  if (!downweightedRows.length) {
    lines.push('（本批无学生触发 incompleteTooMany。）');
    lines.push('');
  } else {
    lines.push('| studentKey | label | 终局 | incomplete | total | 权重 |');
    lines.push('|---|---|---:|---:|---:|---:|');
    for (const r of downweightedRows) {
      lines.push(
        `| ${r.studentKey} | ${r.studentLabel} | ${r.terminalN} | ${r.incompleteN} | ${r.totalN} | ${r.weight} |`,
      );
    }
    lines.push('');
  }

  lines.push('## 主分析：学生级主六维 PCA（软降权）');
  lines.push('');
  if (!studentPca) {
    lines.push(`样本不足（进入矩阵 ${imputed.length}，需 n≥${MIN_PCA_N}），未能完成学生级 PCA。`);
    lines.push('');
  } else {
    lines.push(`- n = **${studentPca.n}**（行数；全员进矩阵），有效样本量（Kish）≈ **${fmtNum(studentPca.effectiveN || studentPca.n, 1)}**，Σw = **${fmtNum(studentPca.weightSum || studentPca.n, 1)}**`);
    lines.push(`- p = **${studentPca.p}**（主六维：探究结果 / 竞赛结果 / 探究过程 / 竞赛过程 / 效率 / 完成度）`);
    lines.push(`- 软降权人数：**${downweightedRows.length}**（权重 ${INCOMPLETE_SOFT_WEIGHT}）`);
    lines.push(`- pcsFor80 = **${studentPca.pcsFor80}**，pcsFor90 = **${studentPca.pcsFor90}**`);
    const vr = studentPca.varianceRatios || [];
    const cum = studentPca.cumulative || [];
    const pcVarParts = [0, 1, 2]
      .filter(i => vr[i] != null)
      .map(i => `PC${i + 1} ${fmtPct(vr[i])}`);
    lines.push(`- 方差占比：${pcVarParts.join(' / ')}${cum[Math.min(2, cum.length - 1)] != null ? `；累计至 PC${Math.min(3, cum.length)}：${fmtPct(cum[Math.min(2, cum.length - 1)])}` : ''}`);
    lines.push('');

    // KMO / MSA / Bartlett — primary on equal-weight Pearson of imputed X
    lines.push('### KMO / MSA（PCA 适合度）');
    lines.push('');
    if (!kmoEqual || !kmoEqual.ok) {
      lines.push(`未能计算 KMO：${kmoEqual?.error || '未知错误'}。`);
      lines.push('');
    } else {
      const kmoInterp = interpretKmo(kmoEqual.kmo);
      lines.push(`- **矩阵**：插补后主六维 X 的**等权 Pearson 相关矩阵**（\`matrixKind=${kmoEqual.matrixKind}\`；与教科书 KMO 一致；**主数字**）`);
      lines.push(`- **n / p** = **${kmoEqual.n}** / **${kmoEqual.p}**`);
      lines.push(`- **整体 KMO** = **${fmtNum(kmoEqual.kmo, 3)}** → ${kmoInterp.zh}`);
      lines.push('- 经验阈值：&lt;0.5 不适合；0.5–0.6 很差；0.6–0.7 勉强；0.7–0.8 一般；0.8–0.9 良好；≥0.9 优秀。');
      lines.push('');
      lines.push('| 维度 | MSA | 适合度 |');
      lines.push('|---|---:|---|');
      for (const key of PCA_DIM_KEYS) {
        const zh = DIM_LABELS_ZH[key];
        const msa = kmoEqual.msa?.[zh];
        const msaInterp = interpretKmo(msa);
        lines.push(`| ${zh} | ${msa == null ? '—' : fmtNum(msa, 3)} | ${msaInterp.zh} |`);
      }
      lines.push('');
      const bart = kmoEqual.bartlett;
      if (bart && bart.ok) {
        const pStr = bart.pvalue == null
          ? '—'
          : (bart.pvalue < 1e-4 ? bart.pvalue.toExponential(2) : fmtNum(bart.pvalue, 4));
        lines.push(
          `- **Bartlett 球形检验**：χ² = ${fmtNum(bart.chi2, 2)}，df = ${bart.df}，p = ${pStr}`
          + (bart.pvalue != null && bart.pvalue < 0.05
            ? '（拒绝单位阵假设，变量间存在相关，适合做因子分析/PCA）'
            : '（未能拒绝单位阵；相关可能偏弱，解读 PCA 需谨慎）'),
        );
      } else if (bart && !bart.ok) {
        lines.push(`- **Bartlett 球形检验**：跳过（${bart.error || '不可用'}）。`);
      } else {
        lines.push('- **Bartlett 球形检验**：未计算。');
      }
      if (kmoSoft && kmoSoft.ok) {
        const softInterp = interpretKmo(kmoSoft.kmo);
        lines.push(
          `- **对照（软降权加权相关矩阵 KMO）**：${fmtNum(kmoSoft.kmo, 3)} → ${softInterp.zh}`
          + `（\`matrixKind=${kmoSoft.matrixKind}\`；非主数字，仅看降权是否改变适合度结论）`,
        );
      }
      lines.push('');
      lines.push(
        `简短解读：整体 KMO=${fmtNum(kmoEqual.kmo, 3)}，判定为${kmoInterp.zh}。`
        + (Number(kmoEqual.kmo) < 0.5
          ? '当前相关结构偏弱，主六维 PCA 更宜作探索性描述，不宜过度解释因子。'
          : Number(kmoEqual.kmo) < 0.7
            ? '适合度一般偏勉强，PCA 可作探索，载荷解读宜保守。'
            : '相关结构尚可支撑探索性主成分描述。'),
      );
      lines.push('');
    }

    lines.push(eigenTable(studentPca, PCA_DIM_KEYS, {
      loadingsTitle: 'PC1–PC3 载荷（软降权加权相关 PCA）',
    }));
    lines.push('');
    lines.push('### 命名建议（简体中文）');
    lines.push('');
    lines.push(namesTable(studentInterp.names));
    lines.push('');
    lines.push('### 解读（简体中文）');
    lines.push('');
    lines.push(studentInterp.text);
    lines.push('');
    lines.push('主轴由主六维构成；一致性是门槛旁注，不解释为「主 PC 上的载荷维度」。探究结果在真实课迹中可能稀疏（多数包探究段无 win），解读时注意与探究过程的共线/稀疏效应。');
    lines.push('');
    lines.push('### 相对旧版的变化说明');
    lines.push('');
    lines.push('- 旧「结果」收窄为**竞赛结果**；新增**探究结果**（none/lucky/solid），二者禁止互相顶替。');
    lines.push('- **效率进入主 PCA**；一致性仍门槛附录、不占主六维。');
    lines.push('- 能力分升至 v4；缺分会话按新公式补算（探究结果兼容 \`explore_success\`）。');
    lines.push(`- 主 PCA 改为 incompleteTooMany **软降权**（权重 ${INCOMPLETE_SOFT_WEIGHT}），全员仍进矩阵。`);
    lines.push(`- 进矩阵门槛由 finiteN≥3 放宽为 **finiteN≥${MIN_FINITE_DIMS}**；默认避 null 为 null 时启用**稀疏回退**（全会话有限 raw 均值，含 incomplete）。`);
    lines.push('- 相对上一版 n=3：本批在放宽门槛 + 稀疏回退后，进入矩阵人数应明显回升。');
    lines.push('');
  }

  lines.push('## 附录：等权对照 PCA（权重全 1）');
  lines.push('');
  if (!equalPca) {
    lines.push('（等权对照未跑。）');
    lines.push('');
  } else {
    lines.push('与主分析同一矩阵 X（相同插补），仅样本权重全为 1，用于对照软降权是否改变 PC1–3 教学解读。');
    lines.push('');
    lines.push(`- 简要：${pcBriefLine(equalPca, equalInterp)}`);
    lines.push(`- 主分析（软降权）简要：${pcBriefLine(studentPca, studentInterp)}`);
    lines.push('');
    lines.push('### PC1–3 差异摘要');
    lines.push('');
    const diffs = compareLoadingsBrief(equalPca, studentPca, labelsZh);
    if (!diffs.length) {
      lines.push('（无差异可列。）');
    } else {
      for (const d of diffs) lines.push(`- ${d}`);
    }
    lines.push('');
    lines.push(eigenTable(equalPca, PCA_DIM_KEYS, {
      loadingsTitle: 'PC1–PC3 载荷（等权对照）',
    }));
    lines.push('');
    lines.push(namesTable(equalInterp.names));
    lines.push('');
    lines.push(equalInterp.text);
    lines.push('');
  }

  lines.push('## 附录：一致性门槛与达标名单');
  lines.push('');
  lines.push(`- 门槛：终局会话数 ≥ **${MIN_CONSISTENCY_TERMINAL}**，且任务数（与 \`taskCount\` / \`aggregateStudentAbilityByTask\` 一致）≥ **${MIN_CONSISTENCY_TASKS}**`);
  lines.push(`- 进入主矩阵学生中达标人数：**${consistencyEligibleRows.length}** / ${rowsRaw.length}`);
  lines.push('- 未达标者一致性记为「—」（null），不参与主 PCA，也不做列均值插补。');
  lines.push('');
  if (!consistencyEligibleRows.length) {
    lines.push('（本批无学生同时满足门槛，无一致性数值可列。）');
    lines.push('');
  } else {
    lines.push('| studentKey | label | sim | 终局 | 任务数 | 一致性 |');
    lines.push('|---|---|---|---:|---:|---:|');
    for (const r of consistencyEligibleRows) {
      lines.push(
        `| ${r.studentKey} | ${r.studentLabel} | ${r.isSim ? 'Y' : ''} | ${r.terminalN} | ${r.taskCount} | ${fmtNum(r.consistency, 1)} |`,
      );
    }
    lines.push('');
  }

  if (consistencyPca) {
    lines.push('### 附录：一致性子样本 PCA（探索性：主六维 + 一致性）');
    lines.push('');
    lines.push(`仅对达标学生（n=${consistencyPca.n}）做含一致性的 PCA，样本量小，仅供参考。`);
    lines.push(`- pcsFor80 = **${consistencyPca.pcsFor80}**，pcsFor90 = **${consistencyPca.pcsFor90}**`);
    lines.push(`- PC1/PC2/PC3 方差：${fmtPct(consistencyPca.varianceRatios[0])} / ${fmtPct(consistencyPca.varianceRatios[1])} / ${fmtPct(consistencyPca.varianceRatios[2])}`);
    lines.push('');
    lines.push(eigenTable(consistencyPca, CONS_PCA_DIM_KEYS));
    lines.push('');
    lines.push(namesTable(consistencyInterp.names));
    lines.push('');
    lines.push(consistencyInterp.text);
    lines.push('');
  } else if (consistencyEligibleRows.length > 0 && consistencyEligibleRows.length < MIN_PCA_N) {
    lines.push('### 附录：一致性子样本 PCA');
    lines.push('');
    lines.push(`达标人数 ${consistencyEligibleRows.length} < ${MIN_PCA_N}，跳过一致性子样本 PCA。`);
    lines.push('');
  }

  lines.push('## 样本局限');
  lines.push('');
  lines.push('- 学生 n 仍偏小；一人多包时会话相关，PCA 为探索性描述。');
  lines.push('- incomplete 抬高「未完成」信号；Pe 缺失不计入探究过程维；探究结果在无探究 win 的包上常为 0/缺失，可能稀疏。');
  lines.push('- 部分会话缺 chapter 时无法补算过程分，可能低估探究/竞赛维覆盖。');
  lines.push('- 一致性门槛较严，多数学生该维缺失；主分析刻意不含该维，避免插补伪信号。');
  lines.push('');

  lines.push('## 样本清单（学生级，进入主 PCA）');
  lines.push('');
  lines.push('| studentKey | label | sim | 权重 | 有限维(6D) | 插补维数 | 稀疏回退 | 终局 | incomplete | 任务数 | 探究结果 | 竞赛结果 | 探究过程 | 竞赛过程 | 效率 | 完成度 | 一致性(门槛) | Pe局数 |');
  lines.push('|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  {
    const imputedNByKey = new Map(imputed.map(r => [r.studentKey, r._imputedN || 0]));
    for (const r of rowsRaw) {
      const f = (x) => (Number.isFinite(x) ? fmtNum(x, 1) : '—');
      const sparseMark = r.usedSparseFallback
        ? (r.sparseFallbackDims || []).map(k => DIM_LABELS_ZH[k] || k).join('、') || 'Y'
        : '';
      lines.push(
        `| ${r.studentKey} | ${r.studentLabel} | ${r.isSim ? 'Y' : ''} | ${r.weight} | ${r.finiteN} | ${imputedNByKey.get(r.studentKey) || 0} | ${sparseMark} | ${r.terminalN} | ${r.incompleteN} | ${r.taskCount} | ${f(r.exploreResult)} | ${f(r.challengeResult)} | ${f(r.exploreProcess)} | ${f(r.challengeProcess)} | ${f(r.efficiency)} | ${f(r.completion)} | ${f(r.consistency)} | ${r.partCounts.exploreProcess} |`,
      );
    }
  }
  lines.push('');

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');

  const summary = {
    reportPath,
    tracesRoot,
    sessionFileN,
    scoreStats,
    nStudentsRaw: students.length,
    nFilteredOut: filteredOut.length,
    nKept: kept.length,
    nSimStudents: simStudents.length,
    nTerminalKept,
    nIncompleteKept,
    nSessionsWithV3,
    studentsSkippedNoDims,
    studentsSkippedLowFinite,
    consistencyGate: {
      minTerminal: MIN_CONSISTENCY_TERMINAL,
      minTasks: MIN_CONSISTENCY_TASKS,
      nEligible: consistencyEligibleRows.length,
      nInMatrix: rowsRaw.length,
    },
    pcaDims: PCA_DIM_KEYS,
    softWeight: INCOMPLETE_SOFT_WEIGHT,
    minFiniteDims: MIN_FINITE_DIMS,
    nDownweighted: downweightedRows.length,
    downweighted: downweightedRows.map(r => ({
      studentKey: r.studentKey,
      studentLabel: r.studentLabel,
      terminalN: r.terminalN,
      incompleteN: r.incompleteN,
      totalN: r.totalN,
      weight: r.weight,
    })),
    nSparseFallback: sparseFallbackRows.length,
    nNoFiniteTerminalPool: noFiniteTerminalPoolRows.length,
    sparseFallback: sparseFallbackRows.map(r => ({
      studentKey: r.studentKey,
      studentLabel: r.studentLabel,
      noFiniteTerminalPool: r.noFiniteTerminalPool,
      sparseFallbackDims: r.sparseFallbackDims,
      finiteN: r.finiteN,
    })),
    impute: {
      columnMissing: imputeResult.columnMissing,
      nRowsWithMissing: imputeResult.perRowMissing.length,
      perRowMissing: imputeResult.perRowMissing,
    },
    nStudentPca: studentPca?.n ?? 0,
    effectiveN: studentPca?.effectiveN ?? null,
    weightSum: studentPca?.weightSum ?? null,
    studentPcaP: studentPca?.p ?? 0,
    kmo: kmoEqual && kmoEqual.ok
      ? {
          matrixKind: kmoEqual.matrixKind,
          n: kmoEqual.n,
          p: kmoEqual.p,
          overall: kmoEqual.kmo,
          overallBand: interpretKmo(kmoEqual.kmo).band,
          overallZh: interpretKmo(kmoEqual.kmo).zh,
          msa: kmoEqual.msa,
          bartlett: kmoEqual.bartlett,
          softWeightedOverall: kmoSoft?.ok ? kmoSoft.kmo : null,
        }
      : { ok: false, error: kmoEqual?.error || null },
    studentPcsFor80: studentPca?.pcsFor80 ?? null,
    studentPcsFor90: studentPca?.pcsFor90 ?? null,
    studentRatios: studentPca?.varianceRatios ?? null,
    studentCumulative: studentPca?.cumulative ?? null,
    studentLoadings: studentPca?.loadings ?? null,
    studentNames: studentInterp?.names ?? null,
    equalRatios: equalPca?.varianceRatios ?? null,
    equalNames: equalInterp?.names ?? null,
    consistencySubsamplePcaN: consistencyPca?.n ?? 0,
    studentRows: rowsRaw.map(r => ({
      studentKey: r.studentKey,
      studentLabel: r.studentLabel,
      finiteN: r.finiteN,
      terminalN: r.terminalN,
      incompleteN: r.incompleteN,
      totalN: r.totalN,
      weight: r.weight,
      incompleteTooMany: r.incompleteTooMany,
      taskCount: r.taskCount,
      consistencyEligible: r.consistencyEligible,
      dims: {
        exploreResult: r.exploreResult,
        challengeResult: r.challengeResult,
        exploreProcess: r.exploreProcess,
        challengeProcess: r.challengeProcess,
        efficiency: r.efficiency,
        consistency: r.consistency,
        completion: r.completion,
      },
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = {
  pickRepSessionsForPart,
  meanPartByTaskAvoidNull,
  meanPartAllSessionsFiniteRaw,
  meanPartWithSparseFallback,
  computeStudentRadarDims,
  aggregateStudentAbilityByTask,
  abilityPartRaw,
  incompleteTooMany,
  pcaSampleWeight,
  INCOMPLETE_SOFT_WEIGHT,
  MIN_FINITE_DIMS,
  ABILITY_SCORE_VERSION,
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
  DIM_LABELS_ZH,
};

if (require.main === module) {
  main();
}
