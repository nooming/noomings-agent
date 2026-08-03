/**
 * HTTP 冒烟：student-play 壳 + game.html 可加载；抽取控件/模式文案线索
 *   node tests/scripts/student-play-smoke-http.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { getPackagesRoot } = require('../../packages/shared/data-paths');

const BASE = process.env.AGENT_BASE || 'http://localhost:3001';
const ROOT = getPackagesRoot();

function get(urlPath) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, BASE);
    http.get(u, res => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => resolve({ status: res.statusCode, body: raw, headers: res.headers }));
    }).on('error', reject);
  });
}

function analyzeGameHtml(html, chapter) {
  const flags = {
    hasChallengeBtn: /挑战|竞赛|challenge/i.test(html),
    hasExploreBtn: /探究|explore/i.test(html),
    hasFire: /发射|测试|开始|释放|运行|fire|launch/i.test(html),
    spoilFormula: /C\s*=\s*ε|τ\s*=\s*RC|½mv|mgh|n₁sin|过关只需|最优解|直接调/i.test(html),
    cvLabelHonest: true,
    guideLine: /指南|提示|目标|过关/.test(html),
  };
  const cvs = (chapter?.inquiryScript?.confoundingVariables || []).filter(c => c.controlId);
  // If CV controlId appears with labels that reveal "无关/混淆" too bluntly or formula spoilers near CV
  for (const cv of cvs) {
    const id = cv.controlId;
    if (html.includes(id)) {
      const re = new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]{0,120}', 'i');
      const m = html.match(re);
      if (m && /无关|混淆|不影响|假变量/.test(m[0]) && /公式|周期|电容/.test(m[0])) {
        flags.cvLabelHonest = false;
      }
    }
  }
  // student-facing spoilers in winSync/goal banners
  const goalText = `${chapter?.winSync?.sub || ''} ${chapter?.kg?.sub || ''}`;
  if (/C=|τ=|公式/.test(goalText)) flags.spoilInGoal = true;
  return flags;
}

async function main() {
  const catalog = JSON.parse((await get('/api/platform/catalog')).body);
  const items = catalog.items || [];
  const rows = [];
  for (const item of items) {
    const pkgId = item.graphId;
    const chapterPath = path.join(ROOT, pkgId, 'chapter.json');
    const chapter = fs.existsSync(chapterPath) ? JSON.parse(fs.readFileSync(chapterPath, 'utf8')) : null;
    const play = await get(`/student-play.html?id=${encodeURIComponent(item.id)}`);
    const gameUrl = item.playUrl || `/static/packages/${pkgId}/game.html`;
    const game = await get(gameUrl);
    const flags = game.status === 200 ? analyzeGameHtml(game.body, chapter) : {};
    const ux = {
      goalReadable: !!(chapter?.winSync?.sub || chapter?.kg?.title),
      noSpoil: !flags.spoilFormula && !flags.spoilInGoal,
      cvHonest: flags.cvLabelHonest !== false,
      inquiryFeedback: !!flags.hasFire,
      competeReachableHint: !!flags.hasChallengeBtn,
      graphOptional: true, // shell doesn't force graph
      traceShell: play.status === 200 && /PlatformTraceAdapter|轨迹/.test(play.body),
    };
    // score 0-2 crude from flags
    const score = {
      目标可读: ux.goalReadable ? 2 : 0,
      无剧透: ux.noSpoil ? 2 : 0,
      CV诚实: (chapter && (chapter.inquiryScript?.confoundingVariables || []).some(c => c.controlId))
        ? (ux.cvHonest ? 2 : 0)
        : 1,
      探究反馈: ux.inquiryFeedback ? 2 : 1,
      竞赛可过: ux.competeReachableHint ? 1 : 0, // unknown until play; hint only
      图谱可选: 2,
      埋点壳: ux.traceShell ? 2 : 0,
    };
    rows.push({
      catalogId: item.id,
      packageId: pkgId,
      title: item.title,
      playStatus: play.status,
      gameStatus: game.status,
      gameBytes: game.body?.length || 0,
      flags,
      ux,
      score,
      p0: (!ux.noSpoil ? ['剧透'] : []).concat(score.竞赛可过 === 0 ? ['可过未知/无挑战入口'] : []),
    });
    console.log(pkgId, `play=${play.status}`, `game=${game.status}`, `spoil=${!ux.noSpoil}`, `challengeBtn=${!!flags.hasChallengeBtn}`);
  }

  const outDir = path.join(ROOT, 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const report = { generatedAt: new Date().toISOString(), count: rows.length, rows };
  const jp = path.join(outDir, 'student-play-smoke-http.json');
  fs.writeFileSync(jp, JSON.stringify(report, null, 2), 'utf8');
  console.log('Wrote', jp);
}

main().catch(e => { console.error(e); process.exit(1); });
