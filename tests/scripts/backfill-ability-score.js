/**
 * 批量回填 session.abilityScore（教师侧能力总分 v1），可选生成校准抽样表。
 *
 *   node tests/scripts/backfill-ability-score.js
 *   node tests/scripts/backfill-ability-score.js --force
 *   node tests/scripts/backfill-ability-score.js --limit 20 --package projectile-cannon
 *   node tests/scripts/backfill-ability-score.js --report
 *   node tests/scripts/backfill-ability-score.js --force --report --human-report
 *   node tests/scripts/backfill-ability-score.js --dry-run
 *
 * 幂等：已有 abilityScore.version 且 inputsHash 与当前输入一致则跳过；--force 强制重算。
 * --human-report：额外写 ability-score-calibration-human.md（排除 full-eval-* / playtest-S*）。
 * 不写学生 UI；不 commit。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getTracesRoot } = require('../../packages/platform/paths');
const {
  getPackageChapterPath,
  getPackagesRoot,
  loadChapterForSample,
} = require('../../packages/shared/data-paths');
const {
  ABILITY_SCORE_VERSION,
  computeAbilityScore,
} = require('../../packages/judge/ability-score');

const REPORT_PATH = path.join(
  getPackagesRoot(),
  'reports',
  'ability-score-calibration.md',
);
const HUMAN_REPORT_PATH = path.join(
  getPackagesRoot(),
  'reports',
  'ability-score-calibration-human.md',
);

/** 合成/夹具学号：校准人样表排除；回填仍可覆盖全量 traces */
function isSyntheticStudentLabel(label) {
  const s = String(label || '').trim();
  if (!s) return false;
  if (/^full-eval[-_]/i.test(s)) return true;
  if (/^playtest[-_]?S\d+/i.test(s)) return true;
  if (/^synth[-_]/i.test(s)) return true;
  return false;
}

const HIST_BUCKETS = [
  { key: 'null', label: 'null/待评', test: (t) => t == null },
  { key: '0-49', label: '0–49', test: (t) => t != null && t < 50 },
  { key: '50-59', label: '50–59', test: (t) => t != null && t >= 50 && t < 60 },
  { key: '60-69', label: '60–69', test: (t) => t != null && t >= 60 && t < 70 },
  { key: '70-79', label: '70–79', test: (t) => t != null && t >= 70 && t < 80 },
  { key: '80-89', label: '80–89', test: (t) => t != null && t >= 80 && t < 90 },
  { key: '90-100', label: '90–100', test: (t) => t != null && t >= 90 },
];

function parseArgs(argv) {
  const out = {
    force: false,
    dryRun: false,
    report: true,
    humanReport: false,
    limit: null,
    package: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') out.force = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--report') out.report = true;
    else if (a === '--no-report') out.report = false;
    else if (a === '--human-report' || a === '--human-only') out.humanReport = true;
    else if (a === '--limit') {
      out.limit = Math.max(0, parseInt(argv[++i], 10) || 0);
    } else if (a === '--package') {
      out.package = String(argv[++i] || '').trim();
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    }
  }
  return out;
}

function shortId(sessionId) {
  const s = String(sessionId || '');
  if (s.length <= 18) return s;
  return s.slice(0, 12) + '…' + s.slice(-6);
}

function resolvePackageId(session) {
  const raw = session.packageId
    || session.graphId
    || session.catalogId
    || session.game
    || '';
  return String(raw).replace(/^html-samples-/, '').replace(/^demo-/, '').trim();
}

function loadChapter(session) {
  const candidates = [
    session.packageId,
    session.graphId,
    session.catalogId,
    session.game,
  ]
    .filter(Boolean)
    .map((id) => String(id).replace(/^html-samples-/, '').replace(/^demo-/, '').trim());
  const seen = new Set();
  for (const id of candidates) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const chapter = loadChapterForSample(id);
    if (chapter) return { chapter, packageId: id, chapterPath: getPackageChapterPath(id) };
    // also try without stripping nothing else
  }
  // last resort: graphId as-is under packages
  for (const id of candidates) {
    const p = getPackageChapterPath(id);
    if (fs.existsSync(p)) {
      try {
        return { chapter: JSON.parse(fs.readFileSync(p, 'utf8')), packageId: id, chapterPath: p };
      } catch {
        /* continue */
      }
    }
  }
  return { chapter: {}, packageId: candidates[0] || null, chapterPath: null };
}

function eventsDigest(events) {
  const list = Array.isArray(events) ? events : [];
  const h = crypto.createHash('sha256');
  h.update(String(list.length));
  for (const e of list) {
    h.update('|');
    h.update(String(e?.ts ?? ''));
    h.update(':');
    h.update(String(e?.type ?? ''));
    if (e?.type === 'win' || e?.type === 'phase_change' || e?.type === 'snapshot') {
      h.update(JSON.stringify(e?.payload || {}));
    } else if (e?.type === 'tuning' || e?.type === 'action') {
      h.update(String(e?.payload?.control || ''));
      h.update('=');
      h.update(String(e?.payload?.value ?? ''));
    }
  }
  return h.digest('hex').slice(0, 24);
}

function computeInputsHash(session, packageId) {
  const verdict = session.judgeResult?.verdict || session.verdict || null;
  const judged = !!(session.judged || session.judgeResult);
  const payload = {
    v: ABILITY_SCORE_VERSION,
    packageId: packageId || null,
    graphId: session.graphId || null,
    verdict,
    judged,
    eventsDigest: eventsDigest(session.events),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32);
}

function hasWin(events) {
  return (events || []).some(
    (e) => e.type === 'win' || (e.type === 'snapshot' && e.payload?.winOk),
  );
}

function atomicWriteJson(filePath, obj) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function round1(n) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function bucketTotal(total) {
  for (const b of HIST_BUCKETS) {
    if (b.test(total)) return b.key;
  }
  return 'null';
}

function pickStratifiedSample(rows, target = 28) {
  const pools = {
    high: [],
    mid: [],
    low: [],
    nullish: [],
    oneShotGateTrue: [],
    oneShotGateFalse: [],
    multiPartial: [],
  };
  for (const r of rows) {
    const t = r.total;
    if (t == null) pools.nullish.push(r);
    else if (t >= 85) pools.high.push(r);
    else if (t >= 60) pools.mid.push(r);
    else pools.low.push(r);

    if (r.challengeTrials === 1 && r.win) {
      if (r.processGate) pools.oneShotGateTrue.push(r);
      else pools.oneShotGateFalse.push(r);
    }
    // 优先部分通关；本批若无则退回任意多关（含 0/N）
    if (r.multiPartial || r.multiAny) pools.multiPartial.push(r);
  }

  const used = new Set();
  const out = [];
  const take = (arr, n, tag) => {
    const shuffled = [...arr].sort((a, b) => {
      // diversify by package then sessionId
      const pk = String(a.packageId).localeCompare(String(b.packageId));
      if (pk) return pk;
      return String(a.sessionId).localeCompare(String(b.sessionId));
    });
    let added = 0;
    for (const r of shuffled) {
      if (used.has(r.sessionId)) continue;
      used.add(r.sessionId);
      out.push({ ...r, sampleTag: tag });
      added++;
      if (added >= n) break;
    }
  };

  // quotas (~28, expandable to 40)
  take(pools.high, 6, '高分≥85');
  take(pools.mid, 6, '中分60–84');
  take(pools.low, 5, '低分<60');
  take(pools.nullish, 4, 'null/待评');
  take(pools.oneShotGateTrue, 4, '一发过·gate真');
  take(pools.oneShotGateFalse, 4, '一发过·gate假');
  take(pools.multiPartial.filter((r) => r.multiPartial), 4, '多关部分R');
  if (out.filter((r) => r.sampleTag === '多关部分R').length === 0) {
    take(pools.multiPartial, 4, '多关R(含0/N)');
  }

  // fill if short
  const rest = rows
    .filter((r) => !used.has(r.sessionId))
    .sort((a, b) => String(a.packageId).localeCompare(String(b.packageId)));
  for (const r of rest) {
    if (out.length >= target) break;
    used.add(r.sessionId);
    out.push({ ...r, sampleTag: '补样' });
  }

  // cap 40
  return out.slice(0, Math.min(40, Math.max(15, out.length || target)));
}

function rowFromSession(session, ability, packageId) {
  const parts = ability?.parts || {};
  const eff = parts.efficiency || {};
  const pe = parts.exploreProcess || {};
  const pc = parts.challengeProcess || {};
  const attr = parts.attribution || {};
  const result = parts.result || {};
  const progress = result.progress;
  const win = hasWin(session.events);
  const verdict = session.judgeResult?.verdict || session.verdict || null;
  const multiLevel = !!progress?.multiLevel;
  const multiPartial = !!(
    multiLevel
    && progress.levelsCleared > 0
    && progress.levelsCleared < progress.levelsTotal
  );
  // 抽样用：任意多关进度（含 0/N），便于教师看到大炮类 R 折算
  const multiAny = multiLevel;
  const notes = [
    pe.primary ? `Pe:${String(pe.primary).slice(0, 24)}` : null,
    pc.primary ? `Pc:${String(pc.primary).slice(0, 24)}` : null,
    ability?.labelsShort?.pathExplore || null,
    ability?.labelsShort?.pathChallenge || null,
  ].filter(Boolean).join(' · ');

  return {
    sessionId: session.sessionId,
    shortId: shortId(session.sessionId),
    packageId: packageId || resolvePackageId(session),
    graphId: session.graphId || null,
    studentLabel: session.studentLabel || session.studentId || '',
    total: ability?.total ?? null,
    pending: !!ability?.pending,
    R: result.raw ?? null,
    Pe: pe.raw ?? null,
    Pc: pc.raw ?? null,
    E: eff.raw ?? null,
    attrBonus: attr.aligned ? (attr.contrib || attr.raw || 5) : 0,
    processBand: ability?.bands?.process || '',
    resultBand: ability?.bands?.result || '',
    verdict: verdict || '',
    challengeTrials: eff.challengeTrials ?? 0,
    processGate: !!eff.processGate,
    notes,
    win,
    multiPartial,
    multiAny,
    levelsNote: progress?.multiLevel
      ? `${progress.levelsCleared}/${progress.levelsTotal}`
      : '',
    hasPhase: !!(session.sawPhaseChange
      || (session.events || []).some((e) => e.type === 'phase_change')),
  };
}

function buildReport({ tracesRoot, stats, rows, sample, generatedAt, humanOnly = false, nextSteps = null }) {
  const totals = rows.map((r) => r.total).filter((t) => t != null).sort((a, b) => a - b);
  const n = rows.length;
  const nWith = totals.length;
  const hist = {};
  for (const b of HIST_BUCKETS) hist[b.key] = 0;
  for (const r of rows) hist[bucketTotal(r.total)]++;

  const byPkg = {};
  for (const r of rows) {
    const k = r.packageId || r.graphId || 'unknown';
    if (!byPkg[k]) byPkg[k] = { n: 0, sum: 0, withTotal: 0, nulls: 0 };
    byPkg[k].n++;
    if (r.total == null) byPkg[k].nulls++;
    else {
      byPkg[k].withTotal++;
      byPkg[k].sum += r.total;
    }
  }
  const topPkgs = Object.entries(byPkg)
    .map(([id, v]) => ({
      id,
      n: v.n,
      nulls: v.nulls,
      mean: v.withTotal ? round1(v.sum / v.withTotal) : null,
    }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 15);

  const luckyOneShot = rows.filter(
    (r) => r.win && r.challengeTrials === 1 && !r.processGate
      && ((r.Pc != null && r.Pc < 55) || (r.E != null && r.E <= 45)),
  );
  const skilledOneShot = rows.filter(
    (r) => r.win && r.challengeTrials === 1 && r.processGate
      && (r.Pc == null || r.Pc >= 70) && (r.E == null || r.E >= 85),
  );
  const missingPhase = rows.filter((r) => !r.hasPhase && (r.total != null || r.Pe != null));
  const multiPartial = rows.filter((r) => r.multiPartial);
  const cannonRows = rows.filter((r) => /cannon/i.test(String(r.packageId || r.graphId || '')));
  const peNullish = rows.filter((r) => r.Pe == null && r.Pc != null && r.total != null);

  const lines = [];
  lines.push(humanOnly ? '# 能力总分 v2 · 真人抽样校准表' : '# 能力总分 v2 · 抽样校准表');
  lines.push('');
  lines.push(`生成时间：${generatedAt}`);
  lines.push(`轨迹根：\`${tracesRoot}\``);
  if (humanOnly) {
    lines.push('过滤：排除合成学号 `full-eval-*` / `playtest-S*` / `synth-*`（保留如「李四」等真人标签）。');
    lines.push('回填仍覆盖全量 traces；本表仅统计过滤后子集。');
  }
  lines.push(`本趟回填：更新 ${stats.updated} · 跳过 ${stats.skipped} · 失败 ${stats.failed} · 扫描 ${stats.total}（跳过=version+inputsHash 未变）`);
  lines.push(`分布基于磁盘上 ${n} 条会话的 abilityScore（含本趟跳过未改写者）。`);
  lines.push(`公式版本：abilityScore.version=${ABILITY_SCORE_VERSION} · 权重 R 25 / Er 8 / Pe 24 / Pc 24 / E 19 · 归因对齐 +5 · 仅教师侧`);
  lines.push('');
  lines.push('## 1. 总体分布');
  lines.push('');
  lines.push(`| 指标 | 值 |`);
  lines.push(`|------|-----|`);
  lines.push(`| 会话数 n | ${n} |`);
  lines.push(`| 有总分 | ${nWith}（${n ? round1(100 * nWith / n) : 0}%） |`);
  lines.push(`| total=null | ${n - nWith}（${n ? round1(100 * (n - nWith) / n) : 0}%） |`);
  lines.push(`| mean | ${round1(mean(totals)) ?? '—'} |`);
  lines.push(`| median | ${round1(percentile(totals, 0.5)) ?? '—'} |`);
  lines.push(`| p25 | ${round1(percentile(totals, 0.25)) ?? '—'} |`);
  lines.push(`| p75 | ${round1(percentile(totals, 0.75)) ?? '—'} |`);
  lines.push('');
  if (humanOnly) {
    const byLabel = {};
    for (const r of rows) {
      const lab = String(r.studentLabel || '（空）').trim() || '（空）';
      if (!byLabel[lab]) byLabel[lab] = { n: 0, withTotal: 0, sum: 0 };
      byLabel[lab].n++;
      if (r.total != null) {
        byLabel[lab].withTotal++;
        byLabel[lab].sum += r.total;
      }
    }
    const labelRows = Object.entries(byLabel)
      .map(([lab, v]) => ({
        lab,
        n: v.n,
        withTotal: v.withTotal,
        mean: v.withTotal ? round1(v.sum / v.withTotal) : null,
      }))
      .sort((a, b) => b.n - a.n || a.lab.localeCompare(b.lab, 'zh'));
    lines.push('### 按 studentLabel');
    lines.push('');
    lines.push('| studentLabel | n | 有总分 | mean(有分) |');
    lines.push('|--------------|---|--------|------------|');
    for (const row of labelRows) {
      lines.push(`| ${row.lab.replace(/\|/g, '/')} | ${row.n} | ${row.withTotal} | ${row.mean ?? '—'} |`);
    }
    const nonLisi = labelRows.filter((r) => r.lab !== '李四');
    const nonLisiN = nonLisi.reduce((s, r) => s + r.n, 0);
    lines.push('');
    lines.push(`非「李四」课堂标签会话合计：**${nonLisiN}** / ${n}（扩大人样需另行采集，不可合成）。`);
    lines.push('');
  }
  lines.push('### 直方图');
  lines.push('');
  lines.push('| 桶 | 人数 | 占比 |');
  lines.push('|----|------|------|');
  for (const b of HIST_BUCKETS) {
    const c = hist[b.key] || 0;
    lines.push(`| ${b.label} | ${c} | ${n ? round1(100 * c / n) : 0}% |`);
  }
  lines.push('');
  lines.push('## 2. 按 package / graph（Top）');
  lines.push('');
  lines.push('| packageId | n | null | mean(有分) |');
  lines.push('|-----------|---|------|------------|');
  for (const p of topPkgs) {
    lines.push(`| \`${p.id}\` | ${p.n} | ${p.nulls} | ${p.mean ?? '—'} |`);
  }
  if (cannonRows.length) {
    const cTotals = cannonRows.map((r) => r.total).filter((t) => t != null);
    const cR = cannonRows.map((r) => r.R);
    lines.push('');
    lines.push('### projectile-cannon 快照');
    lines.push('');
    lines.push(`| n | mean(有分) | R 列表 | levels 注记 |`);
    lines.push(`|---|------------|--------|-------------|`);
    lines.push(`| ${cannonRows.length} | ${round1(mean(cTotals)) ?? '—'} | ${cR.map((x) => x ?? '—').join(', ')} | ${cannonRows.map((r) => r.levelsNote || '—').join('; ')} |`);
  }
  lines.push('');
  lines.push('## 3. 分层抽样表');
  lines.push('');
  lines.push(`共 ${sample.length} 行（高/中/低/null · 一发过 gate 真假 · 多关部分 R）。`);
  lines.push('');
  lines.push('| 分层 | session | package | studentLabel | total | R | Pe | Pc | E | attr | processBand | result/verdict | trials | gate | 策略摘要 | win |');
  lines.push('|------|---------|---------|--------------|-------|---|----|----|---|------|-------------|----------------|--------|------|----------|-----|');
  for (const r of sample) {
    const label = String(r.studentLabel || '').replace(/\|/g, '/').slice(0, 36);
    const notes = String(r.notes || '').replace(/\|/g, '/').slice(0, 48);
    const resultCell = [r.resultBand, r.verdict, r.levelsNote].filter(Boolean).join('/');
    lines.push(
      `| ${r.sampleTag} | \`${r.shortId}\` | \`${r.packageId}\` | ${label || '—'} | ${r.total ?? '—'} | ${r.R ?? '—'} | ${r.Pe ?? '—'} | ${r.Pc ?? '—'} | ${r.E ?? '—'} | ${r.attrBonus || 0} | ${r.processBand || '—'} | ${resultCell || '—'} | ${r.challengeTrials} | ${r.processGate} | ${notes || '—'} | ${r.win ? 'Y' : 'N'} |`,
    );
  }
  lines.push('');
  lines.push('## 4. 看点（定性）');
  lines.push('');
  lines.push(`- **幸运一发**（过关 + trials==1 + gate 假且 Pc/E 偏低）：**${luckyOneShot.length}** 例。`);
  if (luckyOneShot.length) {
    const ex = luckyOneShot.slice(0, 3).map((r) => `\`${r.shortId}\`(${r.packageId}, Pc=${r.Pc ?? '—'}, E=${r.E ?? '—'})`).join('；');
    lines.push(`  - 例：${ex}`);
  }
  lines.push(`- **扎实一发**（过关 + trials==1 + gate 真且 Pc/E 较高）：**${skilledOneShot.length}** 例。`);
  if (skilledOneShot.length) {
    const ex = skilledOneShot.slice(0, 3).map((r) => `\`${r.shortId}\`(${r.packageId}, total=${r.total})`).join('；');
    lines.push(`  - 例：${ex}`);
  }
  lines.push(`- **缺 phase_change**（整局进 Pe、Pc=null）：约 **${missingPhase.length}** 条有分会话；renorm 会抬高 Pe/R 权重，对照时注意勿当「竞赛过程」。`);
  const multiAny = rows.filter((r) => r.multiAny);
  lines.push(`- **多关部分 R**：${multiPartial.length} 条（0 < cleared < total）；任意多关标记 **${multiAny.length}** 条。`);
  lines.push(`- **Pe 空 renorm**：探究 effectiveTrials=0 时 Pe→null（不再记 0）；本批有分且 Pe=null、Pc 有值约 **${peNullish.length}** 条。`);
  const peNullQingchu = peNullish.filter((r) => r.processBand === '清楚');
  const peNullPartial = peNullish.filter((r) => r.processBand === '部分清楚');
  const peNullOneShotQingchu = peNullQingchu.filter((r) => (r.challengeTrials || 0) < 2);
  lines.push(
    `- **Pe-null 过程档**：清楚 **${peNullQingchu.length}** / 部分清楚 **${peNullPartial.length}**`
    + `（v2：Pe-null 且竞赛试次<2 不得标清楚；本批此类残留清楚 **${peNullOneShotQingchu.length}**）。`,
  );

  // weight recommendation
  const shareHigh = nWith ? totals.filter((t) => t >= 85).length / nWith : 0;
  const shareLow = nWith ? totals.filter((t) => t < 60).length / nWith : 0;
  const nullRate = n ? (n - nWith) / n : 0;
  let weightNote = '权重 30/25/25/20 在本批上**暂可沿用**（未见明显全员贴顶或贴底）。';
  if (shareHigh > 0.55 && luckyOneShot.length > skilledOneShot.length) {
    weightNote = '高分段偏多且幸运一发不亚于扎实一发 → **建议 v2 略降 E 或对 gate=false 的一发过再压 Pc 封顶**，本期不自动调权。';
  } else if (shareLow > 0.55 && nWith > 20) {
    weightNote = '有分会话大量 <60 → 检查策略分/门闩是否过严，或玩法样本偏「未过关」；**暂不自动升 v2**，先人工抽几条路径摘要。';
  } else if (nullRate > 0.45) {
    weightNote = 'null/待评占比偏高（多未评判或进行中）属预期；校准请以有总分子集为主，权重可先不动。';
  }
  lines.push(`- **权重建议**：${weightNote}`);
  lines.push('');
  lines.push('## 5. 复跑');
  lines.push('');
  lines.push('```bash');
  lines.push('node tests/scripts/backfill-ability-score.js --report --human-report');
  lines.push('node tests/scripts/backfill-ability-score.js --force --report --human-report');
  lines.push('node tests/scripts/backfill-ability-score.js --package projectile-cannon --limit 10');
  lines.push('```');
  lines.push('');
  if (nextSteps && nextSteps.length) {
    lines.push('## 6. 下下步');
    lines.push('');
    for (let i = 0; i < nextSteps.length; i++) {
      lines.push(`${i + 1}. ${nextSteps[i]}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

const DEFAULT_NEXT_STEPS = [
  '人样扩大：课堂采集更多非「李四」标签会话（当前人样仍偏单标签；不可合成）。',
  '大炮真人复测：用新 emit（interim/final/levelsCleared）再打一局，确认磁盘 win payload 含旗标。',
  '合成夹具：若重跑 full-eval/playtest ingest，大炮 S1/S2 已带 final+levelsCleared=4；旧合成轨迹仍为 legacy 1/4。',
  '权重：人样多样后再评估是否动 30/25/25/20。',
];

function findAlternateTraceRoots(primary) {
  const roots = [];
  if (fs.existsSync(primary)) roots.push(primary);
  const agentRoot = path.resolve(__dirname, '../..');
  const candidates = [
    path.join(agentRoot, 'data/runtime/platform/traces'),
    path.join(agentRoot, 'data/platform/traces'),
  ];
  // shallow scan data/runtime/**/traces
  const runtime = path.join(agentRoot, 'data/runtime');
  if (fs.existsSync(runtime)) {
    for (const name of fs.readdirSync(runtime)) {
      const t = path.join(runtime, name, 'traces');
      if (fs.existsSync(t) && fs.statSync(t).isDirectory()) candidates.push(t);
    }
  }
  for (const c of candidates) {
    if (roots.includes(c)) continue;
    if (fs.existsSync(c)) roots.push(c);
  }
  return roots;
}

function listSessionFiles(tracesRoot) {
  if (!fs.existsSync(tracesRoot)) return [];
  return fs.readdirSync(tracesRoot)
    .filter((f) => f.endsWith('.json') && f.startsWith('sess-'))
    .map((f) => path.join(tracesRoot, f))
    .sort();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node tests/scripts/backfill-ability-score.js [--force] [--dry-run] [--report|--no-report] [--human-report] [--limit N] [--package id]`);
    process.exit(0);
  }

  const primary = getTracesRoot();
  const alts = findAlternateTraceRoots(primary);
  let tracesRoot = primary;
  let files = listSessionFiles(tracesRoot);
  if (!files.length) {
    for (const alt of alts) {
      const list = listSessionFiles(alt);
      if (list.length) {
        tracesRoot = alt;
        files = list;
        console.warn(`[warn] primary empty; using ${alt} (${list.length} sessions)`);
        break;
      }
    }
  }

  console.log(`tracesRoot: ${tracesRoot}`);
  console.log(`sessions found: ${files.length}`);
  if (!files.length) {
    console.error('No session JSON under traces. Searched:', alts);
    process.exit(1);
  }

  if (args.package) {
    const needle = args.package.toLowerCase();
    files = files.filter((fp) => {
      try {
        const s = JSON.parse(fs.readFileSync(fp, 'utf8'));
        const ids = [s.packageId, s.graphId, s.catalogId, s.game]
          .filter(Boolean)
          .map((x) => String(x).toLowerCase());
        return ids.some((id) => id.includes(needle));
      } catch {
        return false;
      }
    });
    console.log(`after --package ${args.package}: ${files.length}`);
  }
  if (args.limit != null) files = files.slice(0, args.limit);

  const stats = {
    total: files.length,
    updated: 0,
    skipped: 0,
    failed: 0,
    buckets: Object.fromEntries(HIST_BUCKETS.map((b) => [b.key, 0])),
  };
  const rows = [];
  const chapterCache = new Map();

  for (const fp of files) {
    let session;
    try {
      session = JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch (e) {
      stats.failed++;
      console.error(`[fail] read ${path.basename(fp)}: ${e.message}`);
      continue;
    }

    const pkgKey = resolvePackageId(session);
    let loaded = chapterCache.get(pkgKey);
    if (!loaded) {
      loaded = loadChapter(session);
      chapterCache.set(pkgKey, loaded);
    }
    const packageId = loaded.packageId || pkgKey;
    const inputsHash = computeInputsHash(session, packageId);
    const existing = session.abilityScore;

    if (
      !args.force
      && existing
      && existing.version === ABILITY_SCORE_VERSION
      && existing.inputsHash
      && existing.inputsHash === inputsHash
    ) {
      stats.skipped++;
      const row = rowFromSession(session, existing, packageId);
      rows.push(row);
      stats.buckets[bucketTotal(row.total)]++;
      continue;
    }

    try {
      const ability = computeAbilityScore({
        events: Array.isArray(session.events) ? session.events : [],
        chapter: loaded.chapter || {},
        verdict: session.judgeResult?.verdict || session.verdict || null,
        judged: !!(session.judged || session.judgeResult),
        packageId,
        graphId: session.graphId || null,
      });
      ability.inputsHash = inputsHash;
      ability.computedAt = ability.computedAt || new Date().toISOString();
      // keep abilityScoreComputedAt mirror for quick grep / older readers
      session.abilityScore = ability;
      session.abilityScoreComputedAt = ability.computedAt;

      if (!args.dryRun) {
        atomicWriteJson(fp, session);
      }
      stats.updated++;
      const row = rowFromSession(session, ability, packageId);
      rows.push(row);
      stats.buckets[bucketTotal(row.total)]++;
    } catch (e) {
      stats.failed++;
      console.error(`[fail] ${session.sessionId || path.basename(fp)}: ${e.message}`);
    }
  }

  console.log('--- summary ---');
  console.log(JSON.stringify({
    tracesRoot,
    dryRun: args.dryRun,
    total: stats.total,
    updated: stats.updated,
    skipped: stats.skipped,
    failed: stats.failed,
    buckets: stats.buckets,
  }, null, 2));

  if (args.report) {
    const sample = pickStratifiedSample(rows, 28);
    const md = buildReport({
      tracesRoot,
      stats,
      rows,
      sample,
      generatedAt: new Date().toISOString(),
    });
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, md, 'utf8');
    console.log(`report: ${REPORT_PATH}`);
  }

  // 默认随 --report 写人样表；也可单独 --human-report
  if (args.humanReport || args.report) {
    const humanRows = rows.filter((r) => !isSyntheticStudentLabel(r.studentLabel));
    const sample = pickStratifiedSample(humanRows, 28);
    const md = buildReport({
      tracesRoot,
      stats,
      rows: humanRows,
      sample,
      generatedAt: new Date().toISOString(),
      humanOnly: true,
      nextSteps: DEFAULT_NEXT_STEPS,
    });
    fs.mkdirSync(path.dirname(HUMAN_REPORT_PATH), { recursive: true });
    fs.writeFileSync(HUMAN_REPORT_PATH, md, 'utf8');
    console.log(`human-report: ${HUMAN_REPORT_PATH} (n=${humanRows.length})`);
  }
}

module.exports = { isSyntheticStudentLabel };

main();
