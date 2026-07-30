const {
  sanitizeStrategyMermaid,
  hasInvalidStrategyMermaidSyntax,
  sanitizeMisconceptionRouteHighlights,
} = require('../../shared/strategy-mermaid-parse.js');

function applyStrategyMermaidSanitize(chapter) {
  if (!chapter?.strategy?.mermaid) return chapter;
  const mermaid = sanitizeStrategyMermaid(chapter.strategy.mermaid);
  const routes = chapter.strategy.routes
    ? sanitizeMisconceptionRouteHighlights(chapter.strategy.routes, mermaid)
    : chapter.strategy.routes;
  return {
    ...chapter,
    strategy: {
      ...chapter.strategy,
      mermaid,
      ...(routes ? { routes } : {}),
    },
  };
}

module.exports = {
  applyStrategyMermaidSanitize,
  sanitizeStrategyMermaid,
  hasInvalidStrategyMermaidSyntax,
};
