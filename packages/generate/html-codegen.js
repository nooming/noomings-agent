const fs = require('fs');
const path = require('path');
const { chatCompletion } = require('../shared/llm');
const {
  buildLlmPromptBundle,
  buildHtmlRepairPrompt,
  HTMLGEN_SYSTEM,
} = require('./export/llm-prompt-bundle');
const { validateGeneratedHtml } = require('./html-post-validate');
const { makeTimestampSlug } = require('../shared/slugify');
const { getGamesGeneratedRoot } = require('../shared/data-paths');
const { getAgentOutputRoot } = require('../shared/paths');
const { linkGraphPlayUrl } = require('./graph-persist');

function extractHtmlFromLlm(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('empty_html_response');
  const fence = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const start = raw.search(/<!DOCTYPE/i);
  if (start >= 0) return raw.slice(start).trim();
  if (raw.startsWith('<html')) return raw;
  throw new Error('no_html_document_in_response');
}

async function repairGameHtml(html, chapter, validation, opts) {
  const repair = buildHtmlRepairPrompt(html, validation);
  const text = await chatCompletion(
    opts.apiKey,
    opts.apiUrl,
    [
      { role: 'system', content: repair.system },
      { role: 'user', content: repair.user },
    ],
    { max_tokens: 16384, temperature: 0.15 },
  );
  return extractHtmlFromLlm(text);
}

async function generateGameHtml(body, opts = {}) {
  if (!opts.apiKey) {
    const err = new Error('DEEPSEEK_API_KEY required');
    err.status = 503;
    throw err;
  }
  const chapter = body.chapter;
  if (!chapter) {
    const err = new Error('chapter_required');
    err.status = 400;
    throw err;
  }

  const bundle = body.promptBundle || buildLlmPromptBundle(chapter);
  const text = await chatCompletion(
    opts.apiKey,
    opts.apiUrl,
    [
      { role: 'system', content: bundle.system || HTMLGEN_SYSTEM },
      { role: 'user', content: bundle.user },
    ],
    { max_tokens: 16384, temperature: 0.25 },
  );

  let html = extractHtmlFromLlm(text);
  let validation = validateGeneratedHtml(html, chapter);
  let repaired = false;

  if (!validation.ok && body.skipRepair !== true) {
    try {
      const fixed = await repairGameHtml(html, chapter, validation, opts);
      const revalidation = validateGeneratedHtml(fixed, chapter);
      if (revalidation.ok || revalidation.errors.length < validation.errors.length) {
        html = fixed;
        validation = revalidation;
        repaired = true;
      }
    } catch {
      /* keep original html + validation */
    }
  }

  const title = body.title || bundle.meta?.title || chapter.kg?.title || 'generated-game';
  let savedPath = null;
  let playUrl = null;

  if (body.save !== false) {
    const dir = getGamesGeneratedRoot();
    fs.mkdirSync(dir, { recursive: true });
    const slug = makeTimestampSlug(title, 'game');
    savedPath = path.join(dir, `${slug}.html`);
    fs.writeFileSync(savedPath, html, 'utf8');
    playUrl = `/static/samples/generated/${slug}.html`;
  }

  const graphId = String(body.graphId || '').trim();
  if (graphId && playUrl) {
    const link = linkGraphPlayUrl(getAgentOutputRoot(), graphId, playUrl);
    if (!link.ok) {
      return {
        html, savedPath, playUrl, title, validation, repaired,
        linkWarning: link.error,
      };
    }
  }

  return {
    html,
    savedPath,
    playUrl,
    title,
    graphId: graphId || undefined,
    validation,
    repaired,
  };
}

module.exports = { generateGameHtml, extractHtmlFromLlm, repairGameHtml };
