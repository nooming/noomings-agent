/**
 * 结束占用 Agent 端口�?node 进程（Windows 优先�? * 用法：npm run agent:stop
 */
const { execSync } = require('child_process');
const path = require('path');

require('../../packages/shared/load-env').loadEnv();

const port = String(process.env.AGENT_PORT || 3001);

function killWindows(portNum) {
  let out = '';
  try {
    out = execSync(`netstat -ano | findstr :${portNum} | findstr LISTENING`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return [];
  }
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    const pid = parts[parts.length - 1];
    if (/^\d+$/.test(pid)) pids.add(pid);
  }
  return [...pids];
}

function killUnix(portNum) {
  try {
    const out = execSync(`lsof -ti :${portNum}`, { encoding: 'utf8' }).trim();
    return out ? out.split(/\s+/).filter(Boolean) : [];
  } catch {
    return [];
  }
}

const pids = process.platform === 'win32' ? killWindows(port) : killUnix(port);

if (!pids.length) {
  console.log(`端口 ${port} 上没有正在监听的进程（Agent 可能已关闭）。`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'inherit' });
    } else {
      execSync(`kill -9 ${pid}`, { stdio: 'inherit' });
    }
    console.log(`已结�?PID ${pid}（释放端�?${port}）`);
  } catch (err) {
    console.warn(`无法结束 PID ${pid}:`, err.message || err);
  }
}
