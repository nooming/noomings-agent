/** CLI: node tests/scripts/upload-html-finetune.js [--dry-run] [--poll] [--suffix name]
 *  Upload training html/train.jsonl (v2-packages 优先，回退 v1) to DeepSeek fine-tune API.
 */
const fs = require('fs');
const path = require('path');
require('../../packages/shared/load-env').loadEnv();
const { getDatasetTrainingRoot } = require('../../packages/shared/data-paths');

const ROOT = path.resolve(__dirname, '../..');
const TRAINING = getDatasetTrainingRoot();
const TRAIN_V2 = path.join(TRAINING, 'v2-packages/html/train.jsonl');
const TRAIN_V1 = path.join(TRAINING, 'v1/html/train.jsonl');
const API_BASE = (process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions')
  .replace(/\/chat\/completions\/?$/, '');

function resolveTrainJsonl() {
  if (fs.existsSync(TRAIN_V2)) return TRAIN_V2;
  if (fs.existsSync(TRAIN_V1)) return TRAIN_V1;
  return TRAIN_V2;
}

function trainingHtmlDir() {
  return path.dirname(resolveTrainJsonl());
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

function loadTrainRows() {
  const trainJsonl = resolveTrainJsonl();
  if (!fs.existsSync(trainJsonl)) {
    throw new Error(`missing ${trainJsonl} — run npm run export-training-jsonl first`);
  }
  const lines = fs.readFileSync(trainJsonl, 'utf8').trim().split('\n').filter(Boolean);
  return lines.map((line, i) => {
    const row = JSON.parse(line);
    if (!row.messages?.length) throw new Error(`line ${i + 1}: missing messages`);
    return { messages: row.messages };
  });
}

function writeUploadJsonl(rows) {
  const tmp = path.join(trainingHtmlDir(), 'train.upload.jsonl');
  fs.writeFileSync(tmp, rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  return tmp;
}

async function apiFetch(endpoint, init = {}) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY required');
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`DeepSeek ${res.status}: ${text.slice(0, 400)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function uploadFile(filePath) {
  const blob = new Blob([fs.readFileSync(filePath)]);
  const form = new FormData();
  form.append('file', blob, path.basename(filePath));
  form.append('purpose', 'fine-tune');
  return apiFetch('/files', { method: 'POST', body: form });
}

async function createFineTuneJob(trainingFileId, suffix) {
  return apiFetch('/fine_tuning/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      training_file: trainingFileId,
      model: process.env.FINETUNE_BASE_MODEL || 'deepseek-chat',
      suffix: suffix || 'htmlgen-v1',
    }),
  });
}

async function getJob(jobId) {
  return apiFetch(`/fine_tuning/jobs/${jobId}`);
}

async function pollJob(jobId, maxWaitMs = 30 * 60 * 1000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const job = await getJob(jobId);
    console.log(`  job ${jobId}: ${job.status}`);
    if (job.status === 'succeeded' && job.fine_tuned_model) {
      return job;
    }
    if (job.status === 'failed' || job.status === 'cancelled') {
      throw new Error(`fine-tune ${job.status}: ${JSON.stringify(job.error || job)}`);
    }
    await new Promise(r => setTimeout(r, 15000));
  }
  throw new Error('fine-tune poll timeout');
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const poll = hasFlag('--poll');
  const suffix = argValue('--suffix') || 'htmlgen-v1';

  const rows = loadTrainRows();
  console.log(`upload-html-finetune: ${rows.length} training rows`);
  console.log(`  source: ${resolveTrainJsonl()}`);
  if (rows.length < 10) {
    console.warn('  warn: <10 rows — consider expanding batch-html-dataset first');
  }

  const uploadPath = writeUploadJsonl(rows);
  console.log(`  prepared: ${uploadPath}`);

  if (dryRun) {
    console.log('  dry-run: skip API upload');
    console.log('  next: node tests/scripts/upload-html-finetune.js --poll');
    return;
  }

  let fileInfo;
  try {
    fileInfo = await uploadFile(uploadPath);
    console.log(`  uploaded file: ${fileInfo.id}`);
  } catch (err) {
    console.error('  upload failed:', err.message);
    console.log('');
    console.log('Manual fine-tune:');
    console.log(`  1. Upload ${uploadPath} via provider dashboard or curl`);
    console.log('  2. Set FINETUNED_MODEL_ID=<model-id> in .env');
    console.log('  3. npm run batch-html-dataset -- --id multi-kp --force  (repeat eval ids)');
    console.log('  4. npm run html-sft-eval');
    process.exit(err.status === 404 ? 0 : 1);
  }

  let job;
  try {
    job = await createFineTuneJob(fileInfo.id, suffix);
    console.log(`  fine-tune job: ${job.id} (${job.status})`);
  } catch (err) {
    console.error('  create job failed:', err.message);
    console.log(`  training_file id: ${fileInfo.id} — create job manually`);
    process.exit(1);
  }

  const metaPath = path.join(path.dirname(trainingHtmlDir()), 'finetune-job.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    job,
    file: fileInfo,
    source: resolveTrainJsonl(),
    createdAt: new Date().toISOString(),
  }, null, 2));
  console.log(`  saved: ${metaPath}`);

  if (poll) {
    const done = await pollJob(job.id);
    console.log('');
    console.log(`FINETUNED_MODEL_ID=${done.fine_tuned_model}`);
    console.log('Add to .env and re-run eval batch on 4 eval ids.');
  } else {
    console.log('');
    console.log(`Poll: node tests/scripts/upload-html-finetune.js --poll  (job id in ${metaPath})`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
