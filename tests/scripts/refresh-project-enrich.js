/**
 * Re-enrich an incremental output project in place (no LLM).
 *
 * Usage:
 *   node tests/scripts/refresh-project-enrich.js --project <id> --source <html>
 *   node tests/scripts/refresh-project-enrich.js --project 高尔夫球物理挑战-斜抛入洞示例-20260530-012538 --source 高尔夫球斜抛入洞.html
 */
const fs = require('fs');
const path = require('path');
const { refreshProjectBundleEnrich } = require('../../packages/generate/incremental-bundle');
const { getAgentDir, getAgentOutputRoot } = require('../../packages/shared/paths');

function parseArgs(argv) {
  const out = { project: null, source: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--project' && argv[i + 1]) {
      out.project = argv[++i];
    } else if (argv[i] === '--source' && argv[i + 1]) {
      out.source = argv[++i];
    }
  }
  return out;
}

function resolveProjectId(projectArg) {
  if (!projectArg) return null;
  const root = getAgentOutputRoot();
  const asPath = path.isAbsolute(projectArg)
    ? projectArg
    : path.join(root, projectArg);
  if (fs.existsSync(path.join(asPath, 'chapters.json'))) {
    return path.basename(asPath);
  }
  if (fs.existsSync(path.join(root, projectArg, 'chapters.json'))) {
    return projectArg;
  }
  return projectArg;
}

function main() {
  const { project, source } = parseArgs(process.argv);
  if (!project || !source) {
    console.error('Usage: node tests/scripts/refresh-project-enrich.js --project <id|path> --source <html>');
    process.exit(1);
  }

  const agentDir = getAgentDir();
  const sourcePath = path.isAbsolute(source) ? source : path.join(agentDir, source);
  if (!fs.existsSync(sourcePath)) {
    console.error('Source HTML not found:', sourcePath);
    process.exit(1);
  }

  const projectId = resolveProjectId(project);
  const html = fs.readFileSync(sourcePath, 'utf8');
  const sources = [{ path: path.basename(sourcePath), content: html }];

  const result = refreshProjectBundleEnrich({
    root: getAgentOutputRoot(),
    projectId,
    sources,
  });

  if (!result.ok) {
    console.error('refresh failed:', result.errors?.join('; ') || 'unknown');
    process.exit(1);
  }

  console.log('refresh-project-enrich: OK');
  console.log('  project:', result.projectId);
  console.log('  view:', result.viewUrl);
  console.log('  quality:', `${result.qualityPassed}/${result.meta.stats.passed} passed`);
  result.levelResults.forEach(r => {
    const label = r.slotName || `ch${r.ch}`;
    console.log(`  L${r.ch + 1} ${label.slice(0, 24)}… struct=${r.structOk} quality=${r.qualityOk} score=${r.score}`);
    if (!r.qualityOk && r.errors.length) {
      console.log('       ', r.errors[0]);
    }
  });

  if (result.qualityFailed > 0) {
    process.exit(2);
  }
}

main();
