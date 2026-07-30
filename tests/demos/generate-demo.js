/** CLI: node tests/demos/generate-demo.js --sources <dir> | --file <path> */
const fs = require('fs');
const path = require('path');
const { generateGraph } = require('../../packages/generate/pipeline');
const { validateWithSyntheticTraces } = require('../../packages/generate/trace-synth');
const { extractGameHints } = require('../../packages/generate/hints');
const { walkDt } = require('../../packages/contract');

require('../../packages/shared/load-env').loadEnv();

const opts = {
  apiKey: process.env.DEEPSEEK_API_KEY,
  apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
};

const SKIP_RE = /node_modules|\.git\/|dist\/|build\/|package-lock|\.min\.js$/i;
const SCAN_EXT = new Set(['.js', '.html', '.css', '.json', '.md']);

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

function scanSources(dir) {
  const root = path.resolve(dir);
  const out = [];
  function walk(abs, rel) {
    for (const name of fs.readdirSync(abs)) {
      const relPath = rel ? `${rel}/${name}` : name;
      const full = path.join(abs, name);
      if (fs.statSync(full).isDirectory()) {
        if (!SKIP_RE.test(relPath)) walk(full, relPath);
      } else {
        const ext = path.extname(name).toLowerCase();
        if (SCAN_EXT.has(ext) && !SKIP_RE.test(relPath)) {
          out.push({ path: relPath.replace(/\\/g, '/'), content: fs.readFileSync(full, 'utf8') });
        }
      }
    }
  }
  walk(root, '');
  return out;
}

function dtStats(tree) {
  let decisions = 0;
  let retries = 0;
  let results = 0;
  walkDt(tree, n => {
    if (n.t === 'decision') decisions++;
    if (n.t === 'retry') retries++;
    if (n.t === 'result') results++;
  });
  return { decisions, retries, results };
}

(async () => {
  const sourcesDir = argValue('--sources');
  const filePath = argValue('--file');
  if (!sourcesDir && !filePath) {
    console.error('Usage: node tests/demos/generate-demo.js --sources <dir> | --file <path>');
    process.exit(1);
  }
  if (!opts.apiKey) {
    console.error('DEEPSEEK_API_KEY required');
    process.exit(1);
  }
  let sources;
  if (filePath) {
    const abs = path.resolve(filePath);
    sources = [{ path: path.basename(abs), content: fs.readFileSync(abs, 'utf8') }];
  } else {
    sources = scanSources(sourcesDir);
    if (!sources.length) {
      console.error('No source files under', sourcesDir);
      process.exit(1);
    }
  }
  const gameHints = extractGameHints(sources);
  console.log('Sources:', sources.length, 'file(s)');
  console.log('gameHints:', JSON.stringify(gameHints, null, 2));

  const gen = await generateGraph({
    sources,
    gameHints,
    title: 'demo',
  }, opts);
  console.log('validation:', gen.validation.ok, gen.validation.errors);
  console.log('quality:', gen.quality?.ok, 'score', gen.quality?.score);
  if (gen.quality?.errors?.length) console.log('quality errors:', gen.quality.errors.join('\n'));
  if (gen.validation.ok && gen.chapter) {
    const dt = dtStats(gen.chapter?.dt?.tree);
    console.log('DT decisions/retries/results:', dt.decisions, dt.retries, dt.results);
    const synth = await validateWithSyntheticTraces(gen.chapter, {}, gameHints);
    console.log('feasible:', synth.feasible);
    console.log('notes:', synth.notes);
    if (synth.smokeCheck?.main) console.log('smoke main:', synth.smokeCheck.main);
  }
})();
