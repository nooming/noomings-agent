const fs = require('fs');
const path = require('path');
const { assert } = require('../../../lib/assert');
const { validateGeneratedHtml } = require('../../../../packages/generate/html-post-validate');
const { auditHtmlContent } = require('../../../../packages/platform/legacy-trace-inject');
const { getGamesGeneratedRoot } = require('../../../../packages/shared/data-paths');

function run() {
  const dir = getGamesGeneratedRoot();
  if (!fs.existsSync(dir)) {
    console.log('generated-html-gates: skip (no generated dir)');
    return;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.html')).slice(0, 5);
  if (!files.length) {
    console.log('generated-html-gates: skip (no generated html files)');
    return;
  }

  for (const file of files) {
    const html = fs.readFileSync(path.join(dir, file), 'utf8');
    assert(/<canvas[\s>]/i.test(html) || html.length < 500,
      `${file}: expected canvas in generated html`);
    const audit = auditHtmlContent(html, { topic: file, id: file });
    if (/抛体|平抛|碰撞|动量|振子|圆周/.test(file)) {
      assert(!audit.staticOnly, `${file}: motion sample must not be static-only`);
    }
  }

  const staticHtml = `<!DOCTYPE html><html><body><div>no canvas</div>
    <!-- trace-adapter-hook --><script>emit('win',{winOk:true})</script></body></html>`;
  const staticResult = validateGeneratedHtml(staticHtml, {
    kg: { title: '光电效应' },
    traceMap: { controls: {} },
  });
  assert(staticResult.errors.includes('missing_canvas'), 'missing_canvas error');

  console.log('generated-html-gates-check: OK');
}

module.exports = { run };
