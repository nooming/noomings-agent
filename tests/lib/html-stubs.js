/** Level-detect HTML stubs (inlined; was fixtures/*.html). */

const configArrayStub = `<!DOCTYPE html>
<html lang="zh-CN">
<head><title>多关检测样例</title></head>
<body>
<div id="levelIndicator">关卡 1 / 3</div>
<script>
let currentLevel = 1;
const levels = [
  { name: '入门', targetX: 100, locked: ['speed'], defaults: { speed: 1, angle: 45 } },
  { title: '进阶', targetX: 200, locked: [], defaults: { speed: 2, angle: 30 } },
  { targetX: 300, isFreeMode: true, defaults: { speed: 1, angle: 0 } },
];
function loadLevel(level) {
  currentLevel = level;
  const levelConfig = levels[currentLevel - 1];
  document.getElementById('levelIndicator').innerHTML = \`关卡 \${currentLevel} / 3\`;
  return levelConfig;
}
</script>
</body>
</html>`;

const selectThreeStub = `<!DOCTYPE html>
<html lang="zh-CN">
<head><title>select 多关检测样例</title></head>
<body>
<select id="levelSelect">
  <option value="1">第 1 关：入门</option>
  <option value="2">第 2 关：进阶</option>
  <option value="3">第 3 关：自由探索</option>
</select>
<script>
let currentLevel = 1;
const levelSelect = document.getElementById('levelSelect');
levelSelect.addEventListener('change', () => {
  currentLevel = parseInt(levelSelect.value, 10);
});
</script>
</body>
</html>`;

const selectManyStub = `<!DOCTYPE html>
<html lang="zh-CN">
<head><title>select 六关检测样例</title></head>
<body>
<select id="levelSelect">
  <option value="1">第 1 关：变体 1</option>
  <option value="2">第 2 关：变体 2</option>
  <option value="3">第 3 关：变体 3</option>
  <option value="4">第 4 关：变体 4</option>
  <option value="5">第 5 关：变体 5</option>
  <option value="6">第 6 关：变体 6</option>
</select>
<script>
let currentLevel = 1;
const levelSelect = document.getElementById('levelSelect');
levelSelect.addEventListener('change', () => {
  currentLevel = parseInt(levelSelect.value, 10);
});
</script>
</body>
</html>`;

const branchStub = `<!DOCTYPE html>
<html lang="zh-CN">
<head><title>branch 多关检测样例</title></head>
<body>
<div id="levelIndicator">关卡 1 / 3</div>
<script>
let currentLevel = 1;
function applyLevelUI() {
  if (currentLevel === 1) {
    document.getElementById('levelIndicator').textContent = '关卡 1：基础';
  } else if (currentLevel === 2) {
    document.getElementById('levelIndicator').textContent = '关卡 2：进阶';
  } else if (currentLevel === 3) {
    document.getElementById('levelIndicator').textContent = '关卡 3：综合';
  }
}
applyLevelUI();
</script>
</body>
</html>`;

const challengeLevelsStub = `<!DOCTYPE html>
<html lang="zh-CN">
<head><title>challengeLevels 检测样例</title></head>
<body>
<div id="challengeLevel">—</div>
<p>本模式共 3 关：ballCount=1/2/3，含 hasObstacle 变体</p>
<script>
let currentChallengeLevel = 1;
const challengeLevels = [
  { ballCount: 1, pocketIndices: [0, 1, 2], hasObstacle: false },
  { ballCount: 2, pocketIndices: [0, 2], hasObstacle: false },
  { ballCount: 3, pocketIndices: [0, 2], hasObstacle: true }
];
function getCurrentChallengeConfig() {
  return challengeLevels[Math.max(0, Math.min(challengeLevels.length - 1, currentChallengeLevel - 1))];
}
function updateUI() {
  document.getElementById('challengeLevel').textContent =
    \`\${currentChallengeLevel}/3 · ballCount=\${getCurrentChallengeConfig().ballCount}\`;
}
updateUI();
</script>
</body>
</html>`;

module.exports = {
  configArrayStub,
  selectThreeStub,
  selectManyStub,
  branchStub,
  challengeLevelsStub,
};
