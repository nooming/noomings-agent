/** CLI: node tests/demos/design-demo.js [--parse-only] [--id <sample>] [--save] [--report] [--seed-run] */
const fs = require('fs');
const path = require('path');
const {
  parseKnowledgeInput,
  generateDesignGraph,
} = require('../../packages/generate/design-pipeline');
const { evaluateDesignSample } = require('../lib/design-sample-eval');

require('../../packages/shared/load-env').loadEnv();

const ROOT = path.resolve(__dirname, '../..');
const FIXTURES = path.join(ROOT, 'data/design-samples/prompts.json');
const RUNS_DIR = path.join(ROOT, 'data/runtime/output/design-runs');

const opts = {
  apiKey: process.env.DEEPSEEK_API_KEY,
  apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
};

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

function loadSamples() {
  const data = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));
  const filterId = argValue('--id');
  let samples = data.samples || [];
  if (filterId) {
    samples = samples.filter(s => s.id === filterId);
    if (!samples.length) {
      console.error(`Sample not found: ${filterId}`);
      process.exit(1);
    }
  }
  return samples;
}

function isoStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function printReport(rows) {
  const idW = Math.max(4, ...rows.map(r => r.id.length));
  const passW = 4;
  const scoreW = 7;
  console.log('');
  console.log(`${'id'.padEnd(idW)}  ${'pass'.padEnd(passW)}  ${'score'.padEnd(scoreW)}  first failure`);
  console.log('-'.repeat(idW + passW + scoreW + 30));
  for (const row of rows) {
    const fail = row.failures[0] || '—';
    console.log(
      `${row.id.padEnd(idW)}  ${String(row.pass).padEnd(passW)}  ${`${row.score}/${row.total}`.padEnd(scoreW)}  ${fail}`,
    );
  }
  const passed = rows.filter(r => r.pass).length;
  console.log('');
  console.log(`Summary: ${passed}/${rows.length} passed`);
}

async function runSample(sample, parseOnly) {
  const body = {
    knowledgePoints: sample.knowledgeText,
    hint: sample.hint,
    title: sample.topic,
  };
  const start = Date.now();

  let result;
  if (parseOnly) {
    const inquiryDraft = await parseKnowledgeInput(sample.knowledgeText, body, opts);
    result = { inquiryDraft, mode: 'design' };
  } else {
    result = await generateDesignGraph(body, opts);
  }

  const elapsedMs = Date.now() - start;
  const evalResult = evaluateDesignSample(sample, result, { parseOnly });

  return {
    id: sample.id,
    topic: sample.topic,
    parseOnly,
    elapsedMs,
    inquiryDraft: result.inquiryDraft,
    validation: result.validation,
    quality: result.quality,
    pass: evalResult.pass,
    score: evalResult.score,
    total: evalResult.total,
    checks: evalResult.checks,
    failures: evalResult.failures,
    promptBundle: result.promptBundle ? {
      systemLen: result.promptBundle.system?.length || 0,
      userLen: result.promptBundle.user?.length || 0,
      markdownLen: result.promptBundle.markdown?.length || 0,
    } : undefined,
  };
}

function saveResult(row, outDir) {
  ensureDir(outDir);
  const file = path.join(outDir, `${row.id}-${isoStamp()}.json`);
  fs.writeFileSync(file, JSON.stringify(row, null, 2), 'utf8');
  return file;
}

(async () => {
  const parseOnly = hasFlag('--parse-only');
  const doSave = hasFlag('--save');
  const doReport = hasFlag('--report');
  const seedRun = hasFlag('--seed-run');

  if (!opts.apiKey) {
    console.error('DEEPSEEK_API_KEY required (set in .env)');
    process.exit(1);
  }

  const samples = loadSamples();
  console.log(`Design demo: ${samples.length} sample(s), mode=${parseOnly ? 'parse-only' : 'full'}`);

  const rows = [];
  for (const sample of samples) {
    process.stdout.write(`  ${sample.id} ... `);
    try {
      const row = await runSample(sample, parseOnly);
      rows.push(row);
      console.log(row.pass ? 'PASS' : 'FAIL', `(${row.elapsedMs}ms)`);
      if (!row.pass && row.failures.length) {
        console.log(`    ${row.failures[0]}`);
      }
      if (doSave) {
        const outDir = seedRun
          ? path.join(RUNS_DIR, 'seed-run')
          : RUNS_DIR;
        const file = saveResult(row, outDir);
        console.log(`    saved ${path.relative(ROOT, file)}`);
      }
    } catch (err) {
      console.log('ERROR');
      console.error(`    ${err.message}`);
      rows.push({
        id: sample.id,
        pass: false,
        score: 0,
        total: 0,
        failures: [err.message],
      });
    }
  }

  if (doReport) printReport(rows);

  const anyFail = rows.some(r => !r.pass);
  process.exit(anyFail ? 1 : 0);
})();
