const fs = require('fs');
const path = require('path');
const { assert } = require('../../../lib/assert');
const { validateGeneratedHtml } = require('../../../../packages/generate/html-post-validate');
const { inferSimHints, buildGameSpec } = require('../../../../packages/generate/game-spec');
const { getGamesGeneratedRoot, getRuntimeOutputRoot } = require('../../../../packages/shared/data-paths');

const PROJECTILE_HTML = path.join(
  getGamesGeneratedRoot(),
  '平抛运动-调节发射参数命中目标-20260702-165927.html',
);
const CHAPTER_JSON = path.join(
  getRuntimeOutputRoot(),
  '平抛运动-调节发射参数命中目标-20260702-165821/chapter.json',
);

function run() {
  if (!fs.existsSync(PROJECTILE_HTML) || !fs.existsSync(CHAPTER_JSON)) {
    console.log('html-post-validate: skip (projectile sample html or chapter missing)');
  } else {
    const html = fs.readFileSync(PROJECTILE_HTML, 'utf8');
    const chapter = JSON.parse(fs.readFileSync(CHAPTER_JSON, 'utf8'));

    const result = validateGeneratedHtml(html, chapter);
    assert(result.ok, `html validation errors: ${result.errors.join(', ')}`);
    assert(html.includes('id="I1"'), 'I1 control id');
    assert(html.includes('id="s-angle"'), 's-angle');
    assert(html.includes('id="s-speed"'), 's-speed');
    assert((html.match(/<!-- trace-adapter-hook -->/g) || []).length === 1, 'single trace hook');
  }

  const simHints = inferSimHints({
    kg: { title: '平抛运动：调节发射参数命中目标' },
    inquiryScript: {
      summary: '平抛运动落入筐中',
      knowledgePoints: [{ formulas: ['x = v0 * cosθ * t'] }],
      outputVariables: [{ label: '水平射程' }],
    },
  });
  assert(simHints?.type === 'projectile2d', 'inferSimHints projectile');
  assert(simHints?.needsContinuousSim === true, 'projectile needsContinuousSim');

  const motionChapter = {
    kg: { title: '简谐振子' },
    traceMap: { controls: { 's-k': { kgId: 'O1', role: 'operation' } } },
    gameSpec: { needsContinuousSim: true, controls: [{ id: 's-k', type: 'range' }] },
  };
  const badHtml = `<!DOCTYPE html><html><body>
    <canvas id="simCanvas"></canvas>
    <input type="range" id="s-k" min="0" max="10">
    <!-- trace-adapter-hook -->
    <script>function emit(t,p){} emit('win',{winOk:true});</script>
    </body></html>`;
  const motionResult = validateGeneratedHtml(badHtml, motionChapter);
  assert(!motionResult.ok, 'motion without RAF should fail');
  assert(motionResult.errors.includes('motion_topic_without_raf'), 'raf error code');

  const goodHtml = `<!DOCTYPE html><html><body>
    <canvas id="simCanvas"></canvas>
    <input type="range" id="s-k"><span id="s-kDisplay">1</span>
    <!-- trace-adapter-hook -->
    <script>
    function update(dt){}
    function draw(){}
    function loop(now){ update(16); draw(); requestAnimationFrame(loop); }
    requestAnimationFrame(loop);
    function emit(t,p){} emit('win',{winOk:true});
    </script></body></html>`;
  const goodResult = validateGeneratedHtml(goodHtml, motionChapter);
  assert(goodResult.ok, `motion with RAF should pass: ${goodResult.errors.join(',')}`);

  const spec = buildGameSpec({
    kg: { title: '动量守恒碰撞' },
    inquiryScript: {
      summary: '两球碰撞',
      adjustmentVariables: [{ controlId: 's-v1', label: '初速度', symbol: 'v₁', type: 'range' }],
    },
    traceMap: { controls: { 's-v1': { kgId: 'O1', role: 'operation' } } },
  }, { needsContinuousSim: true });
  assert(spec.needsContinuousSim === true, 'buildGameSpec needsContinuousSim');
  assert(spec.dataReadouts.length >= 2, 'dataReadouts for motion');
  assert(spec.layout?.canvasId === 'simCanvas', 'layout canvasId');

  console.log('html-post-validate-check: OK');
}

module.exports = { run };
