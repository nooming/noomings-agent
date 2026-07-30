const fs = require('fs');
const path = require('path');

const SHELL_PATH = path.join(__dirname, 'templates', 'preview-shell.html');
const VIEWER_SCRIPTS = [
  '<script src="/static/shared/tab-label.js"></script>',
  '<script src="/static/viewer/js/viewer.js"></script>',
].join('\n');

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function applyShell({ title, headerTag, viewerScript, bootScript }) {
  const tpl = fs.readFileSync(SHELL_PATH, 'utf8');
  return tpl
    .replace(/\{\{TITLE\}\}/g, escapeHtml(title))
    .replace(/\{\{HEADER_TAG\}\}/g, escapeHtml(headerTag))
    .replace('{{VIEWER_SCRIPT}}', viewerScript)
    .replace('{{BOOT_SCRIPT}}', bootScript);
}

function renderSinglePreviewHtml(meta) {
  const title = meta.title || 'Agent A 生成图谱';
  return applyShell({
    title,
    headerTag: 'AGENT A · KNOWLEDGE GRAPH & DECISION TREE',
    viewerScript: VIEWER_SCRIPTS,
    bootScript: `<script>
(async function () {
  const [chRes, metaRes] = await Promise.all([
    fetch('./chapter.json'),
    fetch('./meta.json'),
  ]);
  if (!chRes.ok) throw new Error('chapter.json not found');
  const chapter = await chRes.json();
  const meta = metaRes.ok ? await metaRes.json() : {};
  const fullTab = (meta.title || chapter.kg?.title || '草稿预览').trim();
  GraphViewer.init({
    kgChapters: [Object.assign({}, chapter.kg, { _tabLabel: fullTab, _tabTitleFull: fullTab })],
    dtChapters: [chapter.dt],
    metaChapters: [{ winSync: chapter.winSync, mapping: chapter.mapping, strategy: chapter.strategy }],
    features: { trace: false, agent: false },
  });
})();
</script>`,
  });
}

function renderFullPreviewHtml(meta) {
  const title = meta.title || 'Agent A 完整图谱';
  return applyShell({
    title,
    headerTag: 'AGENT A · FULL GRAPH · KNOWLEDGE GRAPH & DECISION TREE',
    viewerScript: VIEWER_SCRIPTS,
    bootScript: `<script>
(async function () {
  const [chRes, metaRes] = await Promise.all([
    fetch('./chapters.json'),
    fetch('./meta.json'),
  ]);
  if (!chRes.ok) throw new Error('chapters.json not found');
  const chapters = await chRes.json();
  const meta = metaRes.ok ? await metaRes.json() : {};
  const ok = chapters.filter(c => c.ok && c.kg && c.dt).sort((a, b) => a.ch - b.ch);
  if (!ok.length) {
    document.getElementById('batch-warn').textContent = '（无可用章节，请查看 report.json）';
    return;
  }
  if (meta.failedChapters?.length) {
    const failedLabels = meta.failedChapters.map(n => '关卡 ' + n);
    document.getElementById('batch-warn').textContent =
      '（部分关卡结构未通过：' + failedLabels.join('、') + '）';
  } else if (meta.stats?.qualityFailed > 0 || meta.qualityFailedChapters?.length) {
    const qf = (meta.qualityFailedChapters || meta.stats?.qualityFailedChapters || []).map(n => '关卡 ' + (n + 1));
    const passed = meta.stats?.qualityPassed ?? 0;
    const total = meta.stats?.passed ?? ok.length;
    document.getElementById('batch-warn').textContent =
      '（结构 ' + total + '/' + total + ' 关已入库；质量达标 ' + passed + '/' + total + '；未达标：' + qf.join('、') + '）';
  }
  function tabMeta(c, i) {
    const full = c.slotName || c.title || ('关卡 ' + c.ch);
    return { _tabLabel: full, _tabTitleFull: full };
  }
  GraphViewer.init({
    kgChapters: ok.map((c, i) => Object.assign({}, c.kg, tabMeta(c, i))),
    dtChapters: ok.map(c => c.dt),
    metaChapters: ok.map(c => ({ winSync: c.winSync, mapping: c.mapping, strategy: c.strategy })),
    features: { trace: false, agent: false },
  });
})();
</script>`,
  });
}

function renderStandalonePreviewHtml({ chapter, title, viewerJs, graphCss }) {
  const { buildStandaloneExportHtml } = require('./export-standalone-template');
  return buildStandaloneExportHtml({ chapter, title, viewerJs, graphCss, escapeHtml });
}

function renderPreviewHtml(opts) {
  const mode = opts.mode || 'single';
  if (mode === 'full') return renderFullPreviewHtml(opts.meta || opts);
  if (mode === 'standalone') {
    return renderStandalonePreviewHtml({
      chapter: opts.chapter,
      title: opts.title,
      viewerJs: opts.viewerJs,
      graphCss: opts.graphCss,
    });
  }
  return renderSinglePreviewHtml(opts.meta || opts);
}

module.exports = {
  renderPreviewHtml,
  renderSinglePreviewHtml,
  renderFullPreviewHtml,
  renderStandalonePreviewHtml,
};
