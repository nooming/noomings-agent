/**
 * CLI: node cli/demos/judge-demo.js [ch] [traceKey|trace.json] [judgeKey|chapter.json]
 *
 * 示例（bundle key）：
 *   node cli/demos/judge-demo.js 0 genericGood generic
 *   node cli/demos/judge-demo.js 0 genericTrap generic
 *   node cli/demos/judge-demo.js 0 coupledModeOn judge:coupledAligned
 */
const fs = require('fs');
const path = require('path');
const { judge } = require('../../packages/judge/judge');
const { buildJudgeRequest } = require('../../packages/judge/game-trace');
const { loadChapter, loadTrace } = require('../lib/fixture-loader');

require('../../packages/shared/load-env').loadEnv();

const ch = Number(process.argv[2] || 0);
const traceArg = process.argv[3];
const chapterArg = process.argv[4];

function loadJsonFile(pathArg) {
  const abs = path.isAbsolute(pathArg) ? pathArg : path.join(process.cwd(), pathArg);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function looksLikePath(arg) {
  return arg.includes('/') || arg.includes('\\') || arg.endsWith('.json');
}

function resolveTrace(arg) {
  if (!arg) return undefined;
  if (!looksLikePath(arg)) {
    try {
      return loadTrace(arg);
    } catch {
      // fall through to file path
    }
  }
  return loadJsonFile(arg);
}

function resolveChapter(arg) {
  if (!arg) return undefined;
  if (arg.includes(':')) {
    const [bundle, key] = arg.split(':');
    return loadChapter(bundle, key);
  }
  if (!looksLikePath(arg)) {
    try {
      return loadChapter('judge', arg);
    } catch {
      // fall through
    }
  }
  return loadJsonFile(arg);
}

(async () => {
  const chapterRaw = resolveChapter(chapterArg);
  const chapter = chapterRaw?.chapter || chapterRaw;
  const req = buildJudgeRequest({
    ch,
    trace: resolveTrace(traceArg),
    chapter: chapter?.kg ? chapter : undefined,
    sources: chapterRaw?.sources,
  });
  const result = await judge(req, {
    apiKey: process.env.DEEPSEEK_API_KEY,
    apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
  });
  console.log(JSON.stringify(result, null, 2));
})();
