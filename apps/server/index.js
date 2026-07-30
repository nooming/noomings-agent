const http = require('http');
const path = require('path');
const { loadEnv } = require('../../packages/shared/load-env');
const { getAgentDir } = require('../../packages/shared/paths');
const { cors, serveAsset, serveStatic } = require('./static');
const { routeApi } = require('./api');

loadEnv(getAgentDir());

const PORT = Number(process.env.PORT || process.env.AGENT_PORT) || 3001;

http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (await routeApi(req, res)) return;
  if (req.method === 'GET') {
    if (serveAsset(req, res)) return;
    serveStatic(req, res);
    return;
  }
  cors(res);
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false, error: 'not_found' }));
}).listen(PORT, () => {
  console.log(`Agent server http://localhost:${PORT} (llm: ${process.env.DEEPSEEK_API_KEY ? 'on' : 'rule-only'})`);
});
