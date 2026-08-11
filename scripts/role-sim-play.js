/**
 * Multi-role simulated student play for PCA sample enrichment.
 * Uses puppeteer-core + local Chrome/Edge. Does not delete existing traces.
 *
 * Usage: node scripts/role-sim-play.js [--base http://localhost:3001] [--packs a,b] [--roles explorer,chaser]
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const BASE = process.env.ROLE_SIM_BASE || 'http://localhost:3001';
const REPORT_PATH = path.join(
  __dirname,
  '..',
  'data',
  'runtime',
  'packages',
  'reports',
  'role-sim-play-log.md',
);
const TRACE_DIR = path.join(__dirname, '..', 'data', 'runtime', 'platform', 'traces');

const PACKS = [
  { id: 'demo-projectile-basic', short: 'projectile-basic', fire: '#btnLaunch' },
  { id: 'demo-momentum-collision', short: 'momentum-collision', fire: '#btn-fire' },
  { id: 'demo-series-parallel', short: 'series-parallel', fire: '#btn-test' },
  { id: 'demo-magnetic-force', short: 'magnetic-force', fire: '#btn-test' },
  { id: 'demo-efield-charge', short: 'efield-charge', fire: '#launchBtn' },
  { id: 'demo-rc-circuit', short: 'rc-circuit', fire: '#btn-test' },
  { id: 'demo-heat-conduction', short: 'heat-conduction', fire: '#btn-test' },
  { id: 'demo-photoelectric', short: 'photoelectric', fire: '#btn-fire' },
  { id: 'demo-multi-kp', short: 'multi-kp', fire: '#btn-fire' },
  { id: 'demo-circular-motion', short: 'circular-motion', fire: '#btn-fire' },
];

const ROLES = {
  explorer: {
    zh: '探究型',
    prefix: '模拟-探究',
    exploreMeasures: [3, 5],
    exploreStyle: 'single',
    challengeStyle: 'careful',
    challengeTries: 5,
  },
  chaser: {
    zh: '冲分型',
    prefix: '模拟-冲分',
    exploreMeasures: [0, 1],
    exploreStyle: 'minimal',
    challengeStyle: 'blind',
    challengeTries: 6,
  },
  muddy: {
    zh: '混拧型',
    prefix: '模拟-混拧',
    exploreMeasures: [2, 4],
    exploreStyle: 'multi',
    challengeStyle: 'multi',
    challengeTries: 6,
  },
  partial: {
    zh: '半会型',
    prefix: '模拟-半会',
    exploreMeasures: [2, 4],
    exploreStyle: 'single',
    challengeStyle: 'messy',
    challengeTries: 6,
  },
};

function parseArgs(argv) {
  const out = {
    packs: null,
    roles: null,
    base: BASE,
    headless: true,
    maxSessions: 40,
    suffix: '',
    appendLog: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') out.base = argv[++i];
    else if (a === '--packs') out.packs = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--roles') out.roles = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--headed') out.headless = false;
    else if (a === '--max') out.maxSessions = Number(argv[++i]) || 40;
    else if (a === '--suffix') out.suffix = String(argv[++i] || '');
    else if (a === '--append-log') out.appendLog = true;
  }
  return out;
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Chrome/Edge not found; set CHROME_PATH');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randInt(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function withGame(page, fn) {
  const frame = page.frames().find((f) => /\/game\.html|packages\//.test(f.url()));
  if (!frame) throw new Error('game iframe not found');
  return fn(frame);
}

async function dismissOverlays(frame) {
  await frame.evaluate(() => {
    const hide = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      el.hidden = true;
      el.style.display = 'none';
    };
    hide('#craft-intro');
    hide('#craft-win');
    const startBtns = Array.from(document.querySelectorAll('button, .btn, a')).filter((b) =>
      /开始|进入|知道了|继续|关闭|跳过|探究/.test((b.textContent || '').trim()),
    );
    for (const b of startBtns.slice(0, 3)) {
      try { b.click(); } catch (_) { /* ignore */ }
    }
  });
}

async function getControls(frame) {
  return frame.evaluate(() => {
    const ranges = Array.from(document.querySelectorAll('input[type="range"]')).map((el) => ({
      id: el.id || el.name || '',
      min: Number(el.min),
      max: Number(el.max),
      step: Number(el.step) || 1,
      value: Number(el.value),
    })).filter((r) => r.id);
    const mode = document.getElementById('modeSelect');
    const fireCandidates = [
      '#btnLaunch', '#btn-fire', '#btn-test', '#launchBtn', '#btnFire', '#btn-test-ft', '#testBtn', '#fireBtn',
    ];
    let fire = null;
    for (const sel of fireCandidates) {
      if (document.querySelector(sel)) { fire = sel; break; }
    }
    if (!fire) {
      const btn = Array.from(document.querySelectorAll('button')).find((b) =>
        /发射|测试|试射|连接|运行|测量|启动/.test((b.textContent || '')),
      );
      if (btn) fire = btn.id ? `#${btn.id}` : null;
    }
    return {
      ranges,
      hasMode: !!mode,
      modeValue: mode ? mode.value : null,
      fire,
      exhaustedVisible: !!(
        document.querySelector('#attempts-exhausted:not([hidden])')
        || document.querySelector('.attempts-exhausted:not([hidden])')
        || (typeof window.__attemptsExhaustedVisible === 'boolean' && window.__attemptsExhaustedVisible)
        || /次数用尽|用尽/.test(document.body?.innerText || '')
      ),
      winVisible: !!(
        document.querySelector('#craft-win:not([hidden])')
        || document.querySelector('#winIndicator[style*="display: block"], #winIndicator:not([style*="display: none"])')
        || /过关|命中目标|完美命中/.test(document.body?.innerText?.slice(0, 2000) || '')
      ),
    };
  });
}

async function setMode(frame, mode) {
  await frame.evaluate((m) => {
    const sel = document.getElementById('modeSelect');
    if (!sel) return;
    sel.value = m;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    try {
      if (window.__platformTraceSetPhase) window.__platformTraceSetPhase(m);
    } catch (_) { /* ignore */ }
  }, mode);
  await sleep(350);
}

async function setSlider(frame, id, value) {
  await frame.evaluate(({ id, value }) => {
    const el = document.getElementById(id);
    if (!el) return;
    const min = Number(el.min);
    const max = Number(el.max);
    const step = Number(el.step) || 1;
    let v = Math.min(max, Math.max(min, value));
    if (step > 0) {
      const n = Math.round((v - min) / step);
      v = min + n * step;
    }
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { id, value });
  await sleep(120);
}

async function clickFire(frame, preferredSel) {
  const clicked = await frame.evaluate((preferredSel) => {
    const tryClick = (el) => {
      if (!el || el.disabled) return false;
      el.click();
      return true;
    };
    if (preferredSel && tryClick(document.querySelector(preferredSel))) return preferredSel;
    const sels = ['#btnLaunch', '#btn-fire', '#btn-test', '#launchBtn', '#btnFire', '#testBtn', '#fireBtn'];
    for (const s of sels) {
      if (tryClick(document.querySelector(s))) return s;
    }
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      /发射|测试|试射|运行|测量|启动/.test((b.textContent || '')) && !b.disabled,
    );
    if (btn) { btn.click(); return btn.id || 'text-btn'; }
    return null;
  }, preferredSel || null);
  await sleep(900);
  return clicked;
}

async function detectTerminal(frame, page) {
  const status = await frame.evaluate(() => {
    const winEl = document.querySelector('#craft-win');
    const winOpen = !!(winEl && !winEl.hidden && winEl.getAttribute('hidden') == null);
    const winInd = document.getElementById('winIndicator');
    const winIndOn = !!(winInd && winInd.offsetParent !== null && getComputedStyle(winInd).display !== 'none');
    const exh = document.getElementById('attempts-exhausted');
    const exhOpen = !!(exh && !exh.hidden);
    const attemptsEl = document.getElementById('attemptsDisplay');
    const attempts = attemptsEl ? Number(String(attemptsEl.textContent).trim()) : null;
    const modeSel = document.getElementById('modeSelect');
    const mode = modeSel ? modeSel.value : null;
    const body = (document.body?.innerText || '').slice(0, 2500);
    const passText = /完美命中|游戏胜利|过关！|命中目标/.test(body) && /再玩一次|返回列表|再开一局/.test(body);
    const exhaustText = /机会用尽|次数用尽|未能在限次/.test(body);
    return {
      pass: winOpen || winIndOn || passText,
      exhausted: exhOpen || exhaustText,
      attempts: Number.isFinite(attempts) ? attempts : null,
      mode,
      fireDisabled: !!(document.querySelector('#btn-test[disabled], #btn-fire[disabled], #btnLaunch[disabled], #launchBtn[disabled]')),
    };
  });
  if (status.pass) return 'pass';
  if (status.exhausted) return 'exhausted_fail';
  if (status.mode === 'challenge' && status.attempts === 0 && status.fireDisabled) {
    return 'exhausted_pending';
  }
  return null;
}

function nextValue(range, style, i) {
  const { min, max, step, value } = range;
  const span = max - min;
  const st = step > 0 ? step : (span / 20 || 1);
  if (style === 'careful') {
    const delta = st * (i % 2 === 0 ? 1 : -1) * (1 + Math.floor(i / 2));
    return value + delta;
  }
  if (style === 'blind' || style === 'messy') {
    return min + Math.random() * span;
  }
  if (style === 'multi') {
    return min + Math.random() * span;
  }
  // single-var explore: step through mid-ish values
  const t = (i + 1) / 6;
  return min + span * Math.min(0.95, Math.max(0.05, t));
}

async function runExplore(frame, pack, role, roleKey) {
  const ctrl = await getControls(frame);
  await setMode(frame, 'explore');
  const n = randInt(role.exploreMeasures[0], role.exploreMeasures[1]);
  const ranges = ctrl.ranges;
  if (!ranges.length || n <= 0) {
    if (n > 0) await clickFire(frame, pack.fire || ctrl.fire);
    return { measures: Math.max(0, n), style: role.exploreStyle };
  }

  for (let i = 0; i < n; i++) {
    if (role.exploreStyle === 'multi') {
      for (const r of ranges) {
        await setSlider(frame, r.id, minMaxRand(r));
      }
    } else if (role.exploreStyle === 'minimal') {
      if (i === 0 && ranges[0]) {
        await setSlider(frame, ranges[0].id, nextValue(ranges[0], 'careful', 0));
      }
    } else {
      // single-variable: pick one control, vary it; optionally hold others
      const focus = ranges[i % ranges.length];
      await setSlider(frame, focus.id, nextValue(focus, 'careful', i));
    }
    await clickFire(frame, pack.fire || ctrl.fire);
    await sleep(roleKey === 'explorer' ? 400 : 200);
  }
  return { measures: n, style: role.exploreStyle };
}

function minMaxRand(r) {
  return r.min + Math.random() * (r.max - r.min);
}

async function runChallenge(frame, page, pack, role, roleKey) {
  await setMode(frame, 'challenge');
  await sleep(500);
  let outcome = null;
  const maxTries = Math.max(role.challengeTries, 8);
  for (let i = 0; i < maxTries; i++) {
    outcome = await detectTerminal(frame, page);
    if (outcome === 'pass' || outcome === 'exhausted_fail' || outcome === 'exhausted_pending') break;
    const ctrl = await getControls(frame);
    if (role.challengeStyle === 'careful' && ctrl.ranges.length) {
      const focus = ctrl.ranges[i % ctrl.ranges.length];
      await setSlider(frame, focus.id, nextValue(focus, 'careful', i));
    } else if (role.challengeStyle === 'multi' && ctrl.ranges.length) {
      for (const r of ctrl.ranges) await setSlider(frame, r.id, minMaxRand(r));
    } else if (role.challengeStyle === 'messy' && ctrl.ranges.length) {
      if (Math.random() < 0.55) {
        for (const r of ctrl.ranges) await setSlider(frame, r.id, minMaxRand(r));
      } else {
        const focus = pick(ctrl.ranges);
        await setSlider(frame, focus.id, minMaxRand(focus));
      }
    } else if (ctrl.ranges.length) {
      const focus = pick(ctrl.ranges);
      await setSlider(frame, focus.id, minMaxRand(focus));
    }
    await clickFire(frame, pack.fire || ctrl.fire);
    await sleep(roleKey === 'explorer' ? 800 : 600);
    outcome = await detectTerminal(frame, page);
    if (outcome === 'pass' || outcome === 'exhausted_fail' || outcome === 'exhausted_pending') break;
  }

  // Drain remaining attempts until 0 / overlay
  for (let i = 0; i < 8 && outcome !== 'pass' && outcome !== 'exhausted_fail'; i++) {
    if (outcome === 'exhausted_pending') break;
    const ctrl = await getControls(frame);
    for (const r of ctrl.ranges) await setSlider(frame, r.id, minMaxRand(r));
    await clickFire(frame, pack.fire || ctrl.fire);
    await sleep(650);
    outcome = await detectTerminal(frame, page);
  }

  if (outcome === 'exhausted_pending' || (!outcome || outcome === 'incomplete')) {
    await frame.evaluate(() => {
      try {
        if (typeof window.__showAttemptsExhausted === 'function') {
          window.__showAttemptsExhausted('模拟：未能在限次内达成目标');
        }
      } catch (_) { /* ignore */ }
    });
    await sleep(350);
    // One more click can unstick settle UI on some packs
    await clickFire(frame, pack.fire);
    await sleep(400);
    outcome = await detectTerminal(frame, page);
    if (outcome === 'exhausted_pending' || !outcome) outcome = 'exhausted_fail';
  }

  // Ensure platform tip + events so leave judge can score
  if (outcome === 'exhausted_fail' || outcome === 'pass') {
    await page.evaluate(async (outcome) => {
      try {
        if (typeof PlatformTraceAdapter !== 'undefined' && PlatformTraceAdapter.markTerminalAndFlush) {
          await PlatformTraceAdapter.markTerminalAndFlush({
            outcome,
            reason: outcome === 'pass' ? 'role_sim_pass' : 'role_sim_exhaust',
            timeoutMs: 2500,
            emitEvents: outcome === 'exhausted_fail',
          });
        } else if (typeof PlatformTraceAdapter !== 'undefined' && PlatformTraceAdapter.flushPending) {
          await PlatformTraceAdapter.flushPending(2500);
        }
      } catch (_) { /* ignore */ }
      try {
        const f = document.getElementById('gameFrame');
        const child = f && f.contentWindow && f.contentWindow.PlatformTraceAdapter;
        if (child && child.markTerminalAndFlush) {
          await child.markTerminalAndFlush({
            outcome,
            reason: 'role_sim',
            timeoutMs: 2000,
            emitEvents: false,
          });
        }
      } catch (_) { /* ignore */ }
    }, outcome === 'pass' ? 'pass' : 'exhausted_fail');
  }
  return outcome === 'exhausted_pending' ? 'exhausted_fail' : outcome;
}

async function setIdentity(page, base, studentId, studentName) {
  await page.goto(`${base}/student-join.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(({ studentId, studentName }) => {
    localStorage.setItem('platform-student-id', studentId);
    localStorage.setItem('platform-student-name', studentName);
  }, { studentId, studentName });
}

async function leaveAndJudge(page, base) {
  // Prefer clicking 返回列表 if available; else navigate + invoke leave hooks
  await page.evaluate(async () => {
    try {
      if (typeof PlatformTraceAdapter !== 'undefined' && PlatformTraceAdapter.flushPending) {
        await PlatformTraceAdapter.flushPending(2500);
      }
    } catch (_) { /* ignore */ }
    const f = document.getElementById('gameFrame');
    try {
      const child = f && f.contentWindow && f.contentWindow.PlatformTraceAdapter;
      if (child && child.flushPending) await child.flushPending(2500);
    } catch (_) { /* ignore */ }
  });
  await page.goto(`${base}/student.html`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await sleep(800);
}

function listTraceFiles() {
  if (!fs.existsSync(TRACE_DIR)) return [];
  return fs.readdirSync(TRACE_DIR).filter((f) => f.endsWith('.json'));
}

function readTrace(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(TRACE_DIR, file), 'utf8'));
  } catch (_) {
    return null;
  }
}

function findSessionsForStudent(studentId) {
  const out = [];
  for (const f of listTraceFiles()) {
    const t = readTrace(f);
    if (!t) continue;
    if (String(t.studentId || '') === studentId || String(t.studentLabel || '').includes(studentId)) {
      out.push({ file: f, ...t });
    }
  }
  return out.sort((a, b) => String(b.updatedAt || b.startedAt || '').localeCompare(String(a.updatedAt || a.startedAt || '')));
}

async function ensureAbilityViaTeacherApi(base, sessionId) {
  // Teacher path-summary / auto-judge endpoints used by UI
  try {
    const r = await fetch(`${base}/api/platform/auto-judge-on-leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        reason: 'role_sim',
        accessCode: process.env.TEACHER_ACCESS_CODE || 'test-class-2026',
      }),
    });
    return r.json().catch(() => ({ ok: r.ok }));
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function pathSummaryRescore(base, session) {
  try {
    const r = await fetch(`${base}/api/platform/strategy-path-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.sessionId || session.id,
        graphId: session.graphId,
        packageId: session.packageId || session.catalogId,
        mode: 'compete',
        phaseScope: 'challenge',
        showScore: true,
        audience: 'teacher',
        persistAbility: true,
        accessCode: process.env.TEACHER_ACCESS_CODE || 'test-class-2026',
      }),
    });
    return r.json().catch(() => ({ ok: r.ok }));
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function playOne(browser, base, pack, roleKey, role, opts = {}) {
  const suffix = opts.suffix ? `-${opts.suffix}` : '';
  const studentId = `${role.prefix}-${pack.short}${suffix}`;
  const studentName = `${role.zh}-${pack.short}${suffix}`;
  const page = await browser.newPage();
  const log = {
    role: roleKey,
    roleZh: role.zh,
    pack: pack.short,
    catalogId: pack.id,
    studentId,
    studentName,
    outcome: null,
    sessionId: null,
    abilityTotal: null,
    error: null,
    explore: null,
  };
  try {
    await setIdentity(page, base, studentId, studentName);
    await page.goto(`${base}/student-play.html?id=${encodeURIComponent(pack.id)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    // wait iframe
    for (let i = 0; i < 40; i++) {
      const ready = page.frames().some((f) => /game\.html/.test(f.url()));
      if (ready) break;
      await sleep(250);
    }
    await sleep(800);
    await withGame(page, async (frame) => {
      await dismissOverlays(frame);
      await sleep(300);
      log.explore = await runExplore(frame, pack, role, roleKey);
      log.outcome = await runChallenge(frame, page, pack, role, roleKey);
    });

    // capture session id before leave
    log.sessionId = await page.evaluate(() => {
      try {
        return (typeof PlatformTraceAdapter !== 'undefined' && PlatformTraceAdapter.getSessionId)
          ? PlatformTraceAdapter.getSessionId()
          : null;
      } catch (_) {
        return null;
      }
    });

    await leaveAndJudge(page, base);
    await sleep(1200);

    // locate newest terminal-ish session for this student
    let sessions = findSessionsForStudent(studentId);
    let sess = sessions[0];
    if (sess) {
      log.sessionId = sess.sessionId || sess.id || log.sessionId;
      await ensureAbilityViaTeacherApi(base, log.sessionId);
      await pathSummaryRescore(base, sess);
      await sleep(400);
      sessions = findSessionsForStudent(studentId);
      sess = sessions.find((s) => (s.sessionId || s.id) === log.sessionId) || sessions[0];
      if (sess) {
        const term = sess.terminalOutcome || sess.sessionOutcome || null;
        if (term) log.outcome = term;
        const a = sess.abilityScore;
        if (a && a.total != null) log.abilityTotal = a.total;
        log.abilityVersion = a?.version ?? null;
        log.parts = a?.parts ? {
          result: a.parts.result?.raw,
          exploreProcess: a.parts.exploreProcess?.raw,
          challengeProcess: a.parts.challengeProcess?.raw,
          efficiency: a.parts.efficiency?.raw,
        } : null;
      }
    }
  } catch (e) {
    log.error = String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e);
  } finally {
    await page.close().catch(() => {});
  }
  return log;
}

function writeReport(logs, meta) {
  let allLogs = logs;
  const jsonPath = REPORT_PATH.replace(/\.md$/, '.json');
  if (meta.appendLog && fs.existsSync(jsonPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      allLogs = [...(prev.logs || []), ...logs];
    } catch (_) { /* ignore */ }
  }

  const lines = [];
  lines.push('# 多角色模拟游玩日志（PCA 样本 enrichment）');
  lines.push('');
  lines.push(`生成时间：${new Date().toISOString()}`);
  lines.push('');
  lines.push('## 配置');
  lines.push('');
  lines.push(`- 服务：\`${meta.base}\``);
  lines.push(`- 角色：${meta.roles.map((r) => `${ROLES[r].zh}(\`${r}\`)`).join('、')}`);
  lines.push(`- 包：${[...new Set(allLogs.map((l) => l.pack))].join('、') || meta.packs.map((p) => p.short).join('、')}`);
  lines.push(`- 本批计划局数：${meta.planned}；本批尝试：${logs.length}；累计尝试：${allLogs.length}`);
  lines.push('- 身份前缀：`模拟-探究-*` / `模拟-冲分-*` / `模拟-混拧-*` / `模拟-半会-*`（可从真实班级数据过滤）');
  lines.push('- 未删除既有李四/王五/全检 traces');
  lines.push('');

  const ok = allLogs.filter((l) => !l.error);
  const pass = allLogs.filter((l) => l.outcome === 'pass');
  const exhaust = allLogs.filter((l) => l.outcome === 'exhausted_fail');
  const incomplete = allLogs.filter((l) => l.outcome && l.outcome !== 'pass' && l.outcome !== 'exhausted_fail');
  const scored = allLogs.filter((l) => l.abilityTotal != null && Number.isFinite(Number(l.abilityTotal)));
  const failed = allLogs.filter((l) => l.error);

  lines.push('## 批次说明');
  lines.push('');
  lines.push('1. **批次 A**：10 包 × 4 角色 = 40 局；其中 rc-circuit / heat-conduction / circular-motion 因竞赛扣次/终局 tip 时机未对齐，落成 incomplete（无 ability）。');
  lines.push('2. **批次 B（`-b2`）**：上述 3 包 × 4 角色补跑，增强 attempts 排空 + `markTerminalAndFlush`；12/12 均为 exhausted_fail 且已打 ability v3。');
  lines.push('3. PCA 仅计入终局 + 有限 ability 总分会话；incomplete 保留在 traces 中但不会进入 PCA。');
  lines.push('');

  lines.push('## 汇总');
  lines.push('');
  lines.push(`| 指标 | 数量 |`);
  lines.push(`|---|---:|`);
  lines.push(`| 累计尝试局 | ${allLogs.length} |`);
  lines.push(`| 本批尝试 | ${logs.length} |`);
  lines.push(`| 无脚本错误 | ${ok.length} |`);
  lines.push(`| pass | ${pass.length} |`);
  lines.push(`| exhausted_fail | ${exhaust.length} |`);
  lines.push(`| 其它/未终局 | ${incomplete.length} |`);
  lines.push(`| 已有 ability 总分 | ${scored.length} |`);
  lines.push(`| 脚本失败 | ${failed.length} |`);
  lines.push('');

  const roleKeys = [...new Set(allLogs.map((l) => l.role))];
  lines.push('### 按角色');
  lines.push('');
  lines.push('| 角色 | n | pass | exhaust | scored | fail |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const rk of roleKeys) {
    const subset = allLogs.filter((l) => l.role === rk);
    lines.push(
      `| ${(ROLES[rk] && ROLES[rk].zh) || rk} | ${subset.length} | ${subset.filter((l) => l.outcome === 'pass').length} | ${subset.filter((l) => l.outcome === 'exhausted_fail').length} | ${subset.filter((l) => l.abilityTotal != null).length} | ${subset.filter((l) => l.error).length} |`,
    );
  }
  lines.push('');

  const packKeys = [...new Set(allLogs.map((l) => l.pack))];
  lines.push('### 按包');
  lines.push('');
  lines.push('| 包 | n | pass | exhaust | scored | fail |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const short of packKeys) {
    const subset = allLogs.filter((l) => l.pack === short);
    lines.push(
      `| ${short} | ${subset.length} | ${subset.filter((l) => l.outcome === 'pass').length} | ${subset.filter((l) => l.outcome === 'exhausted_fail').length} | ${subset.filter((l) => l.abilityTotal != null).length} | ${subset.filter((l) => l.error).length} |`,
    );
  }
  lines.push('');

  lines.push('## 明细');
  lines.push('');
  lines.push('| role | pack | studentId | outcome | ability | sessionId | error |');
  lines.push('|---|---|---|---|---:|---|---|');
  for (const l of allLogs) {
    lines.push(
      `| ${l.roleZh} | ${l.pack} | ${l.studentId} | ${l.outcome || '—'} | ${l.abilityTotal ?? '—'} | ${l.sessionId || '—'} | ${l.error ? l.error.replace(/\|/g, '/') : ''} |`,
    );
  }
  lines.push('');

  if (failed.length) {
    lines.push('## 失败');
    lines.push('');
    for (const l of failed) {
      lines.push(`- **${l.roleZh} / ${l.pack}**：${l.error}`);
    }
    lines.push('');
  }

  lines.push('## 行为策略摘要');
  lines.push('');
  lines.push('| 角色 | 探究 | 竞赛 |');
  lines.push('|---|---|---|');
  lines.push('| 探究型 | 单变量多轮观测 3–5 次 | 单变量谨慎调节，争取通关 |');
  lines.push('| 冲分型 | 0–1 次微调 | 盲调乱拧直至用尽或碰巧过关 |');
  lines.push('| 混拧型 | 多参数同时拧 | 多参数同时拧，倾向用尽 |');
  lines.push('| 半会型 | 单变量尚可 | 竞赛更乱/更易用尽 |');
  lines.push('');

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ meta: { ...meta, cumulativeAttempts: allLogs.length }, logs: allLogs }, null, 2),
    'utf8',
  );
  return REPORT_PATH;
}

async function main() {
  const args = parseArgs(process.argv);
  let packs = PACKS;
  if (args.packs) {
    packs = PACKS.filter((p) => args.packs.includes(p.short) || args.packs.includes(p.id));
  }
  let roleKeys = Object.keys(ROLES);
  if (args.roles) roleKeys = roleKeys.filter((r) => args.roles.includes(r));

  const plan = [];
  for (const pack of packs) {
    for (const rk of roleKeys) {
      plan.push({ pack, roleKey: rk, role: ROLES[rk] });
    }
  }
  const limited = plan.slice(0, args.maxSessions);

  const executablePath = findBrowser();
  console.log(JSON.stringify({
    base: args.base,
    browser: executablePath,
    planned: limited.length,
    packs: packs.map((p) => p.short),
    roles: roleKeys,
  }, null, 2));

  const browser = await puppeteer.launch({
    executablePath,
    headless: args.headless,
    args: ['--no-sandbox', '--disable-dev-shm-usage', `--window-size=1280,900`],
    defaultViewport: { width: 1280, height: 900 },
  });

  const logs = [];
  try {
    for (let i = 0; i < limited.length; i++) {
      const { pack, roleKey, role } = limited[i];
      console.log(`[${i + 1}/${limited.length}] ${role.zh} × ${pack.short}`);
      const log = await playOne(browser, args.base, pack, roleKey, role, { suffix: args.suffix });
      logs.push(log);
      console.log('  ->', log.outcome, 'ability=', log.abilityTotal, log.error ? `ERR ${log.error}` : '');
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const report = writeReport(logs, {
    base: args.base,
    packs,
    roles: roleKeys,
    planned: limited.length,
    appendLog: args.appendLog,
    suffix: args.suffix,
  });
  console.log('report:', report);
  console.log(JSON.stringify({
    n: logs.length,
    pass: logs.filter((l) => l.outcome === 'pass').length,
    exhaust: logs.filter((l) => l.outcome === 'exhausted_fail').length,
    scored: logs.filter((l) => l.abilityTotal != null).length,
    failed: logs.filter((l) => l.error).length,
  }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
