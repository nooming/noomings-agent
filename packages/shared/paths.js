const fs = require('fs');
const path = require('path');

const AGENT_DIR = path.join(__dirname, '..', '..');

function resolveRepoRoot() {
  const parent = path.join(AGENT_DIR, '..');
  const siblingGames = path.join(parent, 'games');
  if (fs.existsSync(siblingGames) && fs.statSync(siblingGames).isDirectory()) {
    return parent;
  }
  return AGENT_DIR;
}

const REPO_ROOT = resolveRepoRoot();

function warnDeprecatedEnv(name, replacement) {
  if (process.env[name] != null && process.env[replacement] == null) {
    console.warn(`[agent] ${name} is deprecated; use ${replacement} instead.`);
  }
}

function resolveFirstExisting(...rels) {
  for (const rel of rels) {
    const p = path.join(AGENT_DIR, rel);
    if (fs.existsSync(p)) return p;
  }
  return path.join(AGENT_DIR, rels[rels.length - 1]);
}

function getRepoRoot() {
  return REPO_ROOT;
}

function getAgentDir() {
  return AGENT_DIR;
}

/** 与 agent 同级的 games/（monorepo）；独立 agent 仓可能不存在 */
function getGamesRoot() {
  const sibling = path.join(AGENT_DIR, '..', 'games');
  if (fs.existsSync(sibling) && fs.statSync(sibling).isDirectory()) {
    return sibling;
  }
  return null;
}

/** 图谱预览 viewer 根（含 graph.html、js/viewer.js） */
function getViewerRoot() {
  warnDeprecatedEnv('STATIC_GAME_ROOT', 'AGENT_VIEWER_ROOT');
  const rel = process.env.AGENT_VIEWER_ROOT || process.env.STATIC_GAME_ROOT;
  if (rel) {
    return path.isAbsolute(rel) ? rel : path.join(AGENT_DIR, rel);
  }
  return resolveFirstExisting('apps/web/viewer', 'frontend/viewer');
}

/** Agent A 生成物输出根 */
function getAgentOutputRoot() {
  const rel = process.env.AGENT_OUTPUT_ROOT;
  if (rel) {
    return path.isAbsolute(rel) ? rel : path.join(AGENT_DIR, rel);
  }
  const { getPackagesRoot } = require('./data-paths');
  return getPackagesRoot();
}

/** viewer 根（graph.html 与 js/ 同级） */
function getStaticGraphRoot() {
  return getViewerRoot();
}

module.exports = {
  getRepoRoot,
  getAgentDir,
  getGamesRoot,
  getViewerRoot,
  getAgentOutputRoot,
  getStaticGraphRoot,
};
