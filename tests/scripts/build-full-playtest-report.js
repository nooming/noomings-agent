/** node tests/scripts/build-full-playtest-report.js */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { getPackagesRoot } = require('../../packages/shared/data-paths');

const ROOT = getPackagesRoot();
const REPORTS = path.join(ROOT, 'reports');
const priority = [
  'projectile-basic', 'series-parallel', 'refraction-snell', 'thin-lens-implicit',
  'pendulum-clock', 'multi-kp', 'rc-circuit', 'magnetic-force', 'efield-charge',
  'capacitor-confound-ui',
];

function get(u) {
  return new Promise((res, rej) => {
    http.get(u, r => {
      let d = '';
      r.on('data', c => (d += c));
      r.on('end', () => res(d));
    }).on('error', rej);
  });
}

async function main() {
  const v = JSON.parse(fs.readFileSync(path.join(REPORTS, 'student-agentb-full-eval.json'), 'utf8'));
  const smoke = JSON.parse(fs.readFileSync(path.join(REPORTS, 'student-play-smoke-http.json'), 'utf8'));
  const ingest = JSON.parse(fs.readFileSync(path.join(REPORTS, 'student-agentb-ingest-rule-judge.json'), 'utf8'));
  const cat = JSON.parse(await get('http://localhost:3001/api/platform/catalog'));

  const rows = [];
  for (const item of cat.items) {
    const id = item.graphId;
    const vr = v.rows.find(r => r.id === id);
    const sr = smoke.rows.find(r => r.packageId === id);
    const ir = ingest.rows.find(r => r.id === id);
    const ch = JSON.parse(fs.readFileSync(path.join(ROOT, id, 'chapter.json'), 'utf8'));
    const av = (ch.inquiryScript?.adjustmentVariables || []).length;
    const cv = (ch.inquiryScript?.confoundingVariables || []).filter(c => c.controlId).length;
    const cell = k => {
      const c = vr?.cases?.find(x => x.kind.startsWith(k));
      if (!c) return '—';
      if (c.skipped) return 'skip';
      return `${c.acceptOk ? '✓' : '✗'}:${c.verdict}/sv=${c.singleVariableRate ?? '—'}`;
    };
    const catalogSpoil = /[CτE]=|½|mgh|hf\s*>|pV|不进入周期公式/.test(item.description || '');
    const gameSpoil = !!sr?.flags?.spoilFormula || !!sr?.flags?.spoilInGoal;
    const deep = priority.includes(id);
    const ux = {
      目标可读: ch.winSync?.sub || ch.kg?.title ? 2 : 0,
      无剧透: catalogSpoil || gameSpoil ? 0 : 2,
      CV诚实: cv ? (/(不影响|混淆变量|无关)/.test(item.description || '') ? 0 : 1) : 1,
      探究反馈: sr?.flags?.hasFire ? 2 : 1,
      竞赛可过: 1,
      图谱可选: 2,
      埋点壳: sr?.ux?.traceShell ? 2 : 0,
    };
    rows.push({
      id, av, cv, deep,
      V: true,
      R_smoke: sr?.playStatus === 200 && sr?.gameStatus === 200,
      S1: cell('S1'), S2: cell('S2'), S3: cell('S3'), S4: cell('S4'),
      ux, catalogSpoil, gameSpoil,
      accept: vr ? `${vr.acceptPass}/${vr.acceptTotal}` : '—',
      ingestS1: ir?.sessions?.S1?.verdict,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'rule + hybrid browser/API',
    virtualAccept: `${v.acceptOk}/${v.acceptCells}`,
    packages: rows.length,
    rows,
    browserDeep: {
      'projectile-basic': { smoke: true, phase_change: true, traceGrew: true, S1_win: 'timebox miss', note: '质量CV可见；列表提混淆' },
      'series-parallel': { smoke: true, phase_change: true, note: 'R1/R2/仪表内阻清晰' },
      'refraction-snell': { smoke: true, phase_change: true, note: '水温CV可见未标无关' },
      'pendulum-clock': { smoke: true, phase_change: true, traceGrew: true, S1_win: 'reachability/timebox miss', note: '目标T≈2.045严公差' },
      'multi-kp': { smoke: true, phase_change: true, S2: true, traceGrew: true, note: '局内无公式；目录有mgh剧透' },
      'rc-circuit': { http: true, note: 'legacyTypes snapshot/win→tuning' },
      'capacitor-confound-ui': { http: true, note: '目录写不影响结论' },
      'thin-lens-implicit': { http: true },
      'magnetic-force': { http: true },
      'efield-charge': { http: true },
    },
    teacherJudgeSample: { mode: 'llm', note: 'judge-session可用；空会话learning；全量LLM可能慢' },
  };

  fs.writeFileSync(path.join(REPORTS, 'student-agentb-full-matrix.json'), JSON.stringify(report, null, 2), 'utf8');

  const md = [];
  md.push('# 全量学生试玩 + Agent B 评判报告');
  md.push('');
  md.push(`生成时间：${report.generatedAt}`);
  md.push('');
  md.push('评判模式：**rule**（虚拟/注入轨迹）+ 教师端抽样 **llm**（环境有 DEEPSEEK_API_KEY）。');
  md.push('');
  md.push('## 1. 覆盖矩阵');
  md.push('');
  md.push('| 包 | AV/CV | V脚本 | R冒烟 | S1 | S2 | S3 | S4 | 剧透 | 深度 |');
  md.push('|----|-------|-------|-------|----|----|----|----|------|------|');
  for (const r of rows) {
    md.push(`| ${r.id} | ${r.av}/${r.cv} | ✓ | ${r.R_smoke ? '✓' : '✗'} | ${r.S1} | ${r.S2} | ${r.S3} | ${r.S4} | ${r.catalogSpoil || r.gameSpoil ? 'P0' : 'ok'} | ${r.deep ? '深' : '浅'} |`);
  }
  md.push('');
  md.push(`虚拟验收：${report.virtualAccept}（S3 无 CV 的包已 skip）`);
  md.push('');
  md.push('### UX 快评（0–2，节选）');
  md.push('');
  md.push('| 包 | 目标 | 无剧透 | CV诚实 | 反馈 | 可过 | 图谱 | 埋点 |');
  md.push('|----|------|--------|--------|------|------|------|------|');
  for (const r of rows) {
    const u = r.ux;
    md.push(`| ${r.id} | ${u.目标可读} | ${u.无剧透} | ${u.CV诚实} | ${u.探究反馈} | ${u.竞赛可过} | ${u.图谱可选} | ${u.埋点壳} |`);
  }
  md.push('');
  md.push('## 2. P0 / P1 / P2');
  md.push('');
  md.push('### P0');
  md.push('- **Agent B · S3 CV 重度仍表扬单变量**：CV 在 traceMap 为 `irrelevant`，不计入 `singleVariableRate`，svRate=1 且 strengths 含「符合控制变量途径」；gaps 同时写「操作了永久无关控件」。含 CV 包几乎全中。');
  md.push('- **学生目录剧透**：multi-kp（mgh/½mv²）、rc-circuit（τ=RC）、capacitor-era-ch4（E=½CV²）、pendulum-clock（不进入周期公式）、gas-ideal（pV）、photoelectric（hf>W）等。');
  md.push('- **rc-circuit · legacyTypes**：`snapshot`/`win`→`tuning`，有 win 仍判 `in_progress`。');
  md.push('');
  md.push('### P1');
  md.push('- **projectile-cannon · legacyTypes**：`action→tuning`，干扰 svRate。');
  md.push('- **capacitor-era-ch4 仅 1 个 AV**：S2 多参陷阱不可构造（伪失败）。');
  md.push('- **CV 诚实**：目录/文案点明「混淆/不影响」破坏探究。');
  md.push('- **教师端 judge-session**：默认 LLM，全量可能慢/超时；规则模式需无 Key 或本地 evaluateTraceRules。');
  md.push('- **FixedChallenge 严公差**：pendulum-clock / projectile-basic 等短时难通关 → reachability/timebox miss，非 Agent B 失败。');
  md.push('');
  md.push('### P2');
  md.push('- 轨迹计数 flush 偶发延迟。');
  md.push('- 部分目标文案模板化。');
  md.push('- S2 若最终 win，verdict 可为 pass（可接受），但不应表扬单变量。');
  md.push('');
  md.push('## 3. Agent B 验收对照');
  md.push('');
  md.push('| 场景 | 期望 | 实测摘要 |');
  md.push('|------|------|----------|');
  md.push('| S1 win | pass | 22/23 pass；**rc-circuit 失败** |');
  md.push('| S2 多参 | 低 svRate / trap 倾向 | 多数 sv≈0.57；ch4 例外 |');
  md.push('| S3 CV重 | 不得表扬 primary AV | **大面积失败（11 包）** |');
  md.push('| S4 未完成 | 不得 pass | 全部通过 |');
  md.push('| explore 噪声 | 不主导 | 通过 |');
  md.push('');
  md.push('## 4. Go / No-Go');
  md.push('');
  md.push('**结论：No-Go（附条件）** — 不宜对全体 23 关直接做真实学生试点。');
  md.push('');
  md.push('阻断项：');
  md.push('1. Agent B 对 CV 拧动的误表扬是系统性错误。');
  md.push('2. 学生任务列表公式/混淆剧透破坏探究目标。');
  md.push('3. rc-circuit 等 legacyTypes 导致通关轨迹无法判 pass。');
  md.push('');
  md.push('**条件 Go（小范围）**：先修 CV 计量 + 目录去剧透 + legacyTypes，再开放 `series-parallel`、`circular-motion`、`thin-lens-implicit`、`projectile-basic`（改文案后）等清洁包。');
  md.push('');
  md.push('## 5. 报告路径');
  md.push('');
  md.push('- `data/runtime/packages/reports/student-agentb-full-eval.{json,md}`');
  md.push('- `data/runtime/packages/reports/student-agentb-ingest-rule-judge.json`');
  md.push('- `data/runtime/packages/reports/student-play-smoke-http.json`');
  md.push('- `data/runtime/packages/reports/agent-b-virtual-trace-eval.{json,md}`（5 样本 25/25）');
  md.push('- `data/runtime/packages/reports/student-agentb-full-matrix.json`');
  md.push('- `data/runtime/packages/reports/student-agentb-full-playtest-report.md`（本文件）');

  const mdPath = path.join(REPORTS, 'student-agentb-full-playtest-report.md');
  fs.writeFileSync(mdPath, md.join('\n'), 'utf8');
  console.log('Wrote', mdPath);
  console.log('packages', rows.length, 'spoiler', rows.filter(r => r.catalogSpoil || r.gameSpoil).map(r => r.id).join(', '));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
