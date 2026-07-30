/** CLI: node tests/demos/design-full-pipeline-smoke.js [--prompt "..."] [--base http://localhost:3001] */
require('../../packages/shared/load-env').loadEnv();

const DEFAULT_PROMPT =
  '平抛运动，可调节发射角度和初速度，目标让小球落入筐中；忽略空气阻力';

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

function fmtMs(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

async function postJson(base, path, body, timeoutMs = 600000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const j = await r.json();
    if (!r.ok && j.ok !== true) {
      throw new Error(j.error || j.message || `HTTP ${r.status}`);
    }
    return j;
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  const base = (argValue('--base') || 'http://localhost:3001').replace(/\/$/, '');
  const prompt = argValue('--prompt') || DEFAULT_PROMPT;
  const t0 = Date.now();

  console.log('Design full pipeline smoke');
  console.log(`  base:   ${base}`);
  console.log(`  prompt: ${prompt.slice(0, 60)}${prompt.length > 60 ? '…' : ''}`);
  console.log('');

  let health;
  try {
    const hr = await fetch(`${base}/api/health`);
    health = await hr.json();
  } catch (e) {
    console.error('FAIL: server not reachable at', base);
    console.error('  ', e.message);
    console.error('  Run: npm start');
    process.exit(1);
  }

  console.log(`Health: ok=${health.ok} llm=${health.llm} port=${health.port}`);
  if (!health.llm) {
    console.error('FAIL: DEEPSEEK_API_KEY not configured (llm=false)');
    process.exit(1);
  }
  console.log('');

  // Stage A: generate graph
  console.log('Stage A: POST /api/generate-graph …');
  const tA = Date.now();
  let graph;
  try {
    graph = await postJson(base, '/api/generate-graph', {
      mode: 'design',
      knowledgePoints: prompt,
    });
  } catch (e) {
    console.error('FAIL Stage A:', e.message);
    process.exit(1);
  }
  const elapsedA = Date.now() - tA;

  if (!graph.ok) {
    console.error('FAIL Stage A:', graph.error || graph.message || 'unknown');
    process.exit(1);
  }

  const saved = graph.saved || null;
  const qualityOk = graph.quality?.ok;
  const qualityErr = graph.quality?.errors?.[0] || graph.quality?.warnings?.[0] || null;

  console.log(`  elapsed: ${fmtMs(elapsedA)}`);
  console.log(`  mode: ${graph.mode}`);
  console.log(`  title: ${graph.inquiryDraft?.title || graph.chapter?.kg?.title || '—'}`);
  console.log(`  saved.id: ${saved?.id || '—'}`);
  console.log(`  draftOnly: ${saved?.draftOnly ?? '—'}`);
  console.log(`  viewUrl: ${saved?.viewUrl || '—'}`);
  console.log(`  quality.ok: ${qualityOk}`);
  if (qualityErr) console.log(`  quality note: ${qualityErr}`);
  console.log(`  promptBundle: ${graph.promptBundle ? 'yes' : 'no'}`);

  if (!saved?.id) {
    console.error('');
    console.error('FAIL: saved.id missing — pipeline stops here (same as UI)');
    if (graph.saveError) console.error('  saveError:', graph.saveError);
    process.exit(1);
  }
  if (!graph.chapter) {
    console.error('FAIL: chapter missing');
    process.exit(1);
  }

  // Stage B: generate game HTML
  console.log('');
  console.log('Stage B: POST /api/generate-game-html … (may take 1–3 min)');
  const tB = Date.now();
  const title = graph.inquiryDraft?.title || graph.chapter?.kg?.title || saved.id;
  let html;
  try {
    html = await postJson(base, '/api/generate-game-html', {
      chapter: graph.chapter,
      promptBundle: graph.promptBundle,
      title,
      save: true,
    }, 600000);
  } catch (e) {
    console.error('FAIL Stage B:', e.message);
    console.log('');
    console.log('Partial pass: graph saved but HTML failed');
    console.log(`  graphId: ${saved.id}`);
    console.log(`  total: ${fmtMs(Date.now() - t0)}`);
    process.exit(1);
  }
  const elapsedB = Date.now() - tB;

  if (!html.ok) {
    console.error('FAIL Stage B:', html.error || 'unknown');
    process.exit(1);
  }

  console.log(`  elapsed: ${fmtMs(elapsedB)}`);
  console.log(`  playUrl: ${html.playUrl || '—'}`);
  console.log(`  savedPath: ${html.savedPath || html.path || '—'}`);

  if (!html.playUrl) {
    console.error('FAIL: playUrl missing');
    process.exit(1);
  }

  console.log('');
  console.log('PASS: full pipeline OK');
  console.log(`  graphId: ${saved.id}`);
  console.log(`  playUrl: ${html.playUrl}`);
  console.log(`  draftOnly: ${saved.draftOnly ?? false}`);
  console.log(`  total: ${fmtMs(Date.now() - t0)} (graph ${fmtMs(elapsedA)} + html ${fmtMs(elapsedB)})`);
  process.exit(0);
})();
