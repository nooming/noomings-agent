/** @typedef {{ path: string, lang?: string, content: string }} SourceFile */

const EXT_LANG = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', java: 'java', kt: 'kotlin',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
  cs: 'csharp', go: 'go', rs: 'rust',
  json: 'json', md: 'markdown', txt: 'text',
  html: 'html', css: 'css',
};

const PRIORITY_RE = /graph\/ch\d|constraint|win|puzzle|syncUI|game\.js|index\.html/i;
const STANDALONE_PRIORITY_RE = /index\.html|game\.js|main\.js|app\.js|script\.js|style\.css/i;
const SKIP_PATH_RE = /node_modules|\.git\/|dist\/|build\/|package-lock|\.min\.js$/i;

const MAX_CHARS = 28000;
const HEAD_TAIL_RATIO = { head: 0.6, tail: 0.4 };

function truncateContent(content, budget) {
  if (content.length <= budget) return content;
  const headBudget = Math.floor(budget * HEAD_TAIL_RATIO.head);
  const tailBudget = budget - headBudget - '\n// ... [middle omitted] ...\n'.length;
  if (tailBudget < 200) {
    return content.slice(0, budget) + '\n// ... [truncated]';
  }
  const head = content.slice(0, headBudget);
  const tail = content.slice(-tailBudget);
  return `${head}\n// ... [middle omitted] ...\n${tail}`;
}

function langFromPath(path, lang) {
  if (lang) return lang;
  const ext = (path.split('.').pop() || '').toLowerCase();
  return EXT_LANG[ext] || 'text';
}

function normalizeSources(sources) {
  if (!Array.isArray(sources)) return [];
  return sources
    .filter(s => s && s.path && typeof s.content === 'string')
    .filter(s => !SKIP_PATH_RE.test(s.path))
    .map(s => ({
      path: s.path.replace(/\\/g, '/'),
      lang: langFromPath(s.path, s.lang),
      content: s.content,
    }));
}

function scoreSource(s, ch, tier) {
  let score = 0;
  if (PRIORITY_RE.test(s.path)) score += 10;
  if (ch != null && typeof ch === 'number' && new RegExp(`ch${ch}\\b|ch${ch}\\.js|graph/ch${ch}`).test(s.path)) score += 20;
  if (STANDALONE_PRIORITY_RE.test(s.path)) score += 25;
  if (/index\.html$/i.test(s.path)) score += 15;
  return score;
}

function buildCodeContext(sources, ch, tier) {
  const list = normalizeSources(sources);
  list.sort((a, b) => scoreSource(b, ch, tier) - scoreSource(a, ch, tier) || a.path.localeCompare(b.path));

  let used = 0;
  const blocks = [];
  for (const s of list) {
    let content = s.content;
    const header = `### file: ${s.path}\n\`\`\`${s.lang}\n`;
    const footer = '\n```\n';
    const budget = MAX_CHARS - used - header.length - footer.length - 80;
    if (budget <= 0) break;
    if (content.length > budget) {
      content = truncateContent(content, budget);
    }
    blocks.push(header + content + footer);
    used += header.length + content.length + footer.length;
  }
  return blocks.join('\n');
}

module.exports = { normalizeSources, buildCodeContext, langFromPath, MAX_CHARS };
