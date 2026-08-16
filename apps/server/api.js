/**
 * API router — handlers live in apps/server/api/{platform,generate,traces}.js
 * Shared auth/body helpers: apps/server/api-shared.js
 *
 * Deprecated HTTP aliases (still routed where noted in platform README):
 *   GET /health → same as /api/health
 *   Legacy pages /generate.html /judge.html are static redirects, not API.
 */
const { cors } = require('./static');
const { requireTeacherAuth, handleTeacherLogin, readBody } = require('./api-shared');
const platform = require('./api/platform');
const generate = require('./api/generate');
const traces = require('./api/traces');

const {
  handleJudge,
  handlePlatformJudgeSession,
  handlePlatformAutoJudgeOnLeave,
  handlePlatformCatalog,
  handlePlatformPublish,
  handlePlatformSetPublished,
  handlePlatformCatalogDelete,
  handlePlatformCategories,
  handlePlatformPublishPairs,
  handlePlatformCategoryCreate,
  handlePlatformCategoryDelete,
  handlePlatformCatalogSetCategory,
  handlePlatformPackageSource,
  handlePlatformStudentSummary,
  handlePlatformAdapter,
} = platform;

const {
  handlePreviewHints,
  handleGenerateGraph,
  handleSaveGraphDraft,
  handleCreateGraphProject,
  handleAppendGraphChapter,
  handleGeneratedGraphsIndex,
  handleGamePagesIndex,
  handleGamePageDelete,
  handleGeneratedGraphDelete,
  handleGenerateGameHtml,
  handleGraphPreview,
} = generate;

const {
  handleTraceIngest,
  handlePlatformTraces,
  handlePlatformTraceStats,
  handleClassroomBoard,
  handlePlatformTraceStudents,
  handlePlatformTraceDetail,
  handlePlatformTraceDelete,
  handlePlatformTracesExportZip,
  handlePlatformTracesImportZip,
  handleDemoStrategyPathSummary,
  handleSessionStrategyPathSummary,
} = traces;

async function routeApi(req, res) {
  if (req.method === 'GET' && (req.url === '/api/health' || req.url === '/health')) {
    cors(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      llm: !!process.env.DEEPSEEK_API_KEY,
      port: Number(process.env.PORT || process.env.AGENT_PORT) || 3001,
      judge: true,
      generate: true,
      platform: true,
      traceIngest: true,
      graphPreview: true,
      teacherCodeConfigured: !!(process.env.TEACHER_ACCESS_CODE || process.env.PLATFORM_TEACHER_PASS),
    }));
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/demo/strategy-path-summary') {
    await handleDemoStrategyPathSummary(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/teacher-login') {
    await handleTeacherLogin(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/strategy-path-summary') {
    await handleSessionStrategyPathSummary(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/judge') {
    if (!requireTeacherAuth(req, res)) return true;
    await handleJudge(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/preview-hints') {
    if (!requireTeacherAuth(req, res)) return true;
    await handlePreviewHints(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/generate-graph') {
    if (!requireTeacherAuth(req, res)) return true;
    await handleGenerateGraph(req, res);
    return true;
  }
  if (req.method === 'GET' && new URL(req.url, 'http://localhost').pathname === '/api/graph-preview') {
    handleGraphPreview(req, res);
    return true;
  }
  if (req.method === 'GET' && req.url === '/api/generated-graphs') {
    handleGeneratedGraphsIndex(req, res);
    return true;
  }
  if (req.method === 'GET' && req.url === '/api/game-pages') {
    handleGamePagesIndex(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/game-pages/delete') {
    if (!requireTeacherAuth(req, res)) return true;
    await handleGamePageDelete(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/generated-graphs/delete') {
    if (!requireTeacherAuth(req, res)) return true;
    await handleGeneratedGraphDelete(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/save-graph-draft') {
    if (!requireTeacherAuth(req, res)) return true;
    await handleSaveGraphDraft(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/create-graph-project') {
    if (!requireTeacherAuth(req, res)) return true;
    await handleCreateGraphProject(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/append-graph-chapter') {
    if (!requireTeacherAuth(req, res)) return true;
    await handleAppendGraphChapter(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/trace/ingest') {
    await handleTraceIngest(req, res);
    return true;
  }
  if (req.method === 'GET' && req.url === '/api/platform/catalog') {
    handlePlatformCatalog(req, res, true);
    return true;
  }
  if (req.method === 'GET' && req.url === '/api/platform/catalog/all') {
    handlePlatformCatalog(req, res, false);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/publish') {
    if (!requireTeacherAuth(req, res)) return true;
    await handlePlatformPublish(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/set-published') {
    if (!requireTeacherAuth(req, res)) return true;
    await handlePlatformSetPublished(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/catalog/delete') {
    if (!requireTeacherAuth(req, res)) return true;
    await handlePlatformCatalogDelete(req, res);
    return true;
  }
  if (req.method === 'GET' && req.url === '/api/platform/publish-pairs') {
    handlePlatformPublishPairs(req, res);
    return true;
  }
  if (req.method === 'GET' && new URL(req.url, 'http://localhost').pathname === '/api/platform/categories') {
    handlePlatformCategories(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/categories') {
    if (!requireTeacherAuth(req, res)) return true;
    await handlePlatformCategoryCreate(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/categories/delete') {
    if (!requireTeacherAuth(req, res)) return true;
    await handlePlatformCategoryDelete(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/catalog/set-category') {
    if (!requireTeacherAuth(req, res)) return true;
    await handlePlatformCatalogSetCategory(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/traces/delete') {
    if (!requireTeacherAuth(req, res)) return true;
    await handlePlatformTraceDelete(req, res);
    return true;
  }
  if (req.method === 'POST') {
    const importPath = new URL(req.url, 'http://localhost').pathname;
    if (importPath === '/api/platform/traces/import-zip' || importPath === '/api/platform/traces/import-zip/') {
      if (!requireTeacherAuth(req, res)) return true;
      await handlePlatformTracesImportZip(req, res);
      return true;
    }
  }
  if (req.method === 'GET' && req.url.startsWith('/api/platform/traces')) {
    if (!requireTeacherAuth(req, res)) return true;
    const tracesPath = new URL(req.url, 'http://localhost').pathname;
    if (tracesPath === '/api/platform/traces/export-zip' || tracesPath === '/api/platform/traces/export-zip/') {
      handlePlatformTracesExportZip(req, res);
      return true;
    }
    if (tracesPath === '/api/platform/traces/stats' || tracesPath.startsWith('/api/platform/traces/stats/')) {
      handlePlatformTraceStats(req, res);
      return true;
    }
    if (tracesPath === '/api/platform/traces/classroom' || tracesPath.startsWith('/api/platform/traces/classroom/')) {
      handleClassroomBoard(req, res);
      return true;
    }
    if (tracesPath === '/api/platform/traces/students' || tracesPath === '/api/platform/traces/students/') {
      handlePlatformTraceStudents(req, res);
      return true;
    }
    const studentSummary = tracesPath.match(/^\/api\/platform\/traces\/students\/([^/]+)\/summary$/);
    if (studentSummary) {
      handlePlatformStudentSummary(req, res, studentSummary[1]);
      return true;
    }
    const detail = tracesPath.match(/^\/api\/platform\/traces\/([^/]+)$/);
    if (detail && detail[1] !== 'students') {
      handlePlatformTraceDetail(req, res, decodeURIComponent(detail[1]));
      return true;
    }
    if (tracesPath === '/api/platform/traces' || tracesPath === '/api/platform/traces/') {
      handlePlatformTraces(req, res);
      return true;
    }
  }
  if (req.method === 'GET' && req.url.startsWith('/api/platform/adapter')) {
    handlePlatformAdapter(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/generate-game-html') {
    if (!requireTeacherAuth(req, res)) return true;
    await handleGenerateGameHtml(req, res);
    return true;
  }
  if (req.method === 'GET' && req.url.startsWith('/api/platform/package-source')) {
    handlePlatformPackageSource(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/judge-session') {
    if (!requireTeacherAuth(req, res)) return true;
    await handlePlatformJudgeSession(req, res);
    return true;
  }
  if (req.method === 'POST' && req.url === '/api/platform/auto-judge-on-leave') {
    await handlePlatformAutoJudgeOnLeave(req, res);
    return true;
  }
  return false;
}

module.exports = { routeApi, readBody };
