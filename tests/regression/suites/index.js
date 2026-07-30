const SUITES = {
  contract: [
    { name: 'trace-contract', module: './parts/trace-contract' },
    { name: 'trace-phase-metrics', module: './parts/trace-phase-metrics' },
    { name: 'chapter-enrich-quality', module: './parts/chapter-enrich-quality' },
    { name: 'draft-quality', module: './parts/draft-quality' },
    { name: 'conditional-param', module: './parts/conditional-param' },
    { name: 'teach-group-normalize', module: './parts/teach-group-normalize' },
  ],
  generate: [
    { name: 'trace-map-infer', module: './parts/trace-map-infer' },
    { name: 'trace-map-hud-purge', module: './parts/trace-map-hud-purge' },
    { name: 'bundle-persist', module: './parts/bundle-persist' },
    { name: 'gameplay-mode-hints', module: './parts/gameplay-mode-hints' },
    { name: 'level-detect', module: './parts/level-detect' },
    { name: 'level-config-scope', module: './parts/level-config-scope' },
    { name: 'html-samples-chapter-load', module: './parts/html-samples-chapter-load' },
    { name: 'publish-pairs', module: './parts/publish-pairs' },
    { name: 'catalog-pair-integrity', module: './parts/catalog-pair-integrity' },
    { name: 'generate-hints-smoke', module: './parts/generate-hints-smoke' },
    { name: 'analyze-three-step', module: './parts/analyze-three-step' },
    { name: 'inquiry-sanitize-route-scores', module: './parts/inquiry-sanitize-route-scores' },
    { name: 'html-post-validate', module: './parts/html-post-validate' },
    { name: 'generated-html-gates', module: './parts/generated-html-gates' },
    { name: 'trace-package-hooks', module: './parts/trace-package-hooks' },
    { name: 'platform-phase-teammate', module: './parts/platform-phase-teammate' },
    { name: 'teammate-coverage', module: './parts/teammate-coverage' },
    { name: 'capacitor-slim-visual', module: './parts/capacitor-slim-visual' },
    { name: 'graph-preview-url', module: './parts/graph-preview-url' },
    { name: 'graph-preview-api-smoke', module: './parts/graph-preview-api-smoke' },
    { name: 'manual-backups', module: './parts/manual-backups' },
  ],
  strategy: [
    { name: 'strategy-mermaid-sanitize', module: './parts/strategy-mermaid-sanitize' },
    { name: 'strategy-compare', module: './parts/strategy-compare' },
    { name: 'strategy-route-highlight', module: './strategy/highlight-tiers' },
    { name: 'strategy-route-highlight-audit', module: './parts/strategy-route-highlight-audit' },
    { name: 'strategy-sparse-highlight-seed', module: './parts/strategy-sparse-highlight-seed' },
    { name: 'strategy-confound-visual-repair', module: './parts/strategy-confound-visual-repair' },
    { name: 'strategy-segment-score', module: './parts/strategy-segment-score' },
    { name: 'strategy-path-summary', module: './parts/strategy-path-summary' },
    { name: 'strategy-layout', module: './parts/strategy-layout' },
  ],
  export: [
    { name: 'export-standalone-smoke', module: './parts/export-standalone-smoke' },
    { name: 'viewer-syntax', module: './parts/viewer-syntax' },
  ],
};

async function runSuite(suiteName, filter) {
  const items = SUITES[suiteName];
  if (!items) throw new Error(`Unknown suite: ${suiteName}`);
  const failures = [];
  for (const item of items) {
    if (filter && item.name !== filter && !item.name.includes(filter)) continue;
    try {
      const mod = require(item.module);
      const result = mod.run();
      if (result && typeof result.then === 'function') await result;
      console.log(`[${suiteName}] ${item.name}: OK`);
    } catch (err) {
      failures.push({ suite: suiteName, name: item.name, error: err });
      console.error(`[${suiteName}] ${item.name}: FAIL`, err.message);
    }
  }
  return failures;
}

async function runAll(options = {}) {
  const suiteArg = options.suite;
  const filter = options.filter;
  const suites = suiteArg ? [suiteArg] : Object.keys(SUITES);
  const allFailures = [];
  for (const suite of suites) {
    const failures = await runSuite(suite, filter);
    allFailures.push(...failures);
  }
  if (allFailures.length) {
    console.error(`\ncheck failed: ${allFailures.length} test(s)`);
    process.exit(1);
  }
  console.log('\ncheck: all suites OK');
}

module.exports = { SUITES, runSuite, runAll };
