/** Ingest 组员做的样本 → data/runtime/packages/{id}/ + manifest/catalog */
const fs = require('fs');
const path = require('path');
const { injectLegacyTrace, hasWinEmit } = require('../../packages/platform/legacy-trace-inject');
const { getPackagesRoot, getDatasetHtmlSamplesRoot } = require('../../packages/shared/data-paths');
const { packagePlayUrl } = require('../../packages/shared/package-layout');
const { readCatalog, writeCatalog } = require('../../packages/platform/catalog');
const { topicToMacroId } = require('../../packages/platform/category-macros');
const { ensureMacroCategories } = require('../../packages/platform/categories');
const TEAM_MAP = require('../lib/teammate-sample-map');

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, '组员做的样本');
const PKG = getPackagesRoot();
/** @deprecated mirror; packages/manifest.json is source of truth */
const HS_MANIFEST = path.join(getDatasetHtmlSamplesRoot(), 'manifest.json');
const ERA_CHAPTERS = path.join(PKG, 'capacitor-era', 'chapters.json');

const PLATFORM_WIN_CLOCK = `
  if (window.__emit) {
    var c = window.__snapControls ? window.__snapControls() : {};
    window.__emit('snapshot', { controls: c, winOk: true, hintKey: 'pendulum_clock' });
    window.__emit('win', { winOk: true });
  }`;

const PLATFORM_WIN_TARGET = `function checkLanding(x) {
        let left = cartX, right = cartX + cartWidth;
        hit = (x >= left && x <= right);
        if (hit && window.__emit) {
          var c = window.__snapControls ? window.__snapControls() : {};
          window.__emit('snapshot', { controls: c, winOk: true, hintKey: 'pendulum_target' });
          window.__emit('win', { winOk: true });
        }
    }`;

const PLATFORM_WIN_CANNON = `if (win) {
            if (window.__emit) {
              var c = window.__snapControls ? window.__snapControls() : {};
              window.__emit('snapshot', { controls: c, winOk: true, hintKey: 'cannon_hit' });
              window.__emit('win', { winOk: true });
            }
            earnedScore = this.calculatePotentialScore();`;

const PLATFORM_WIN_PROJECTILE = `if (distance <= hitMargin) {
                if (window.__emit) {
                  var c = window.__snapControls ? window.__snapControls() : {
                    's-angle': state.angle, 's-speed': state.speed, 's-height': state.height, 's-mass': state.mass
                  };
                  window.__emit('snapshot', { controls: c, winOk: true, hintKey: 'hit_target' });
                  window.__emit('win', { winOk: true });
                }
                showMessage("命中靶心！", "完美击中！准备迎接下一个目标。", false, () => {
                    spawnTarget();
                    state.projectiles = []; // 清空场地
                });
            } else {`;

function stripGoogleFonts(html) {
  return String(html || '')
    .replace(/<link[^>]*fonts\.googleapis\.com[^>]*>\s*/gi, '')
    .replace(/<link[^>]*fonts\.gstatic\.com[^>]*>\s*/gi, '')
    .replace(/@import\s+url\([^)]*fonts\.googleapis\.com[^)]*\);\s*/gi, '');
}

function patchCapShowWin(html, hintKey) {
  let out = html;
  if (out.includes(`hintKey: '${hintKey}'`)) return out;
  const inject = `
  if (window.__emit) {
    var c = window.__snapControls ? window.__snapControls() : {};
    window.__emit('snapshot', { controls: c, winOk: true, hintKey: '${hintKey}' });
    window.__emit('win', { winOk: true });
  }`;
  if (/phase = 'win';/.test(out)) {
    out = out.replace(/phase = 'win';/, `phase = 'win';${inject}`);
  } else if (/function showWin\(\)\s*\{/.test(out)) {
    out = out.replace(/function showWin\(\)\s*\{/, `function showWin() {${inject}`);
  } else {
    throw new Error(`cannot find showWin/phase=win for ${hintKey}`);
  }
  return out;
}

function patchForSpec(s, html) {
  let out = stripGoogleFonts(html);
  if (s.id === 'pendulum-clock') {
    out = out.replace(
      "const endpoint = qs.get('ep') || 'http://127.0.0.1:8000/api/events';",
      "const endpoint = qs.get('ep') || ''; // platform owns ingest",
    );
    const winLine = "Telemetry.log('win', { after: Telemetry.snapshot() });";
    if (out.includes(winLine) && !out.includes("hintKey: 'pendulum_clock'")) {
      out = out.replace(winLine, `${winLine}${PLATFORM_WIN_CLOCK}`);
    }
    return out;
  }
  if (s.id === 'pendulum-target') {
    out = out
      .replace(/id="lengthSlider"/g, 'id="s-length"')
      .replace(/id="angleSlider"/g, 'id="s-angle"')
      .replace(/id="massSlider"/g, 'id="s-mass"')
      .replace(/getElementById\('lengthSlider'\)/g, "getElementById('s-length')")
      .replace(/getElementById\('angleSlider'\)/g, "getElementById('s-angle')")
      .replace(/getElementById\('massSlider'\)/g, "getElementById('s-mass')")
      .replace(/#lengthSlider/g, '#s-length')
      .replace(/#angleSlider/g, '#s-angle')
      .replace(/#massSlider/g, '#s-mass');
    if (!out.includes("hintKey: 'pendulum_target'")) {
      out = out.replace(
        /function checkLanding\(x\) \{\s*let left = cartX, right = cartX \+ cartWidth;\s*hit = \(x >= left && x <= right\);\s*\}/,
        PLATFORM_WIN_TARGET,
      );
    }
    return out;
  }
  if (s.id === 'projectile-cannon') {
    out = out.replace(/font-family:\s*'VT323'[^;]*;/g, "font-family: Consolas, 'Courier New', monospace;");
    if (!out.includes("hintKey: 'cannon_hit'")) {
      out = out.replace(
        /if \(win\) \{\s*earnedScore = this\.calculatePotentialScore\(\);/,
        PLATFORM_WIN_CANNON,
      );
    }
    return out;
  }
  if (s.id === 'projectile-basic') {
    const idMap = [
      ['sliderAngle', 's-angle'],
      ['sliderSpeed', 's-speed'],
      ['sliderHeight', 's-height'],
      ['sliderMass', 's-mass'],
    ];
    for (const [from, to] of idMap) {
      out = out
        .replace(new RegExp(`id="${from}"`, 'g'), `id="${to}"`)
        .replace(new RegExp(`getElementById\\('${from}'\\)`, 'g'), `getElementById('${to}')`)
        .replace(new RegExp(`#${from}\\b`, 'g'), `#${to}`);
    }
    if (!out.includes("hintKey: 'hit_target'")) {
      out = out.replace(
        /if \(distance <= hitMargin\) \{\s*showMessage\("命中靶心！", "完美击中！准备迎接下一个目标。", false, \(\) => \{\s*spawnTarget\(\);\s*state\.projectiles = \[\]; \/\/ 清空场地\s*\}\);\s*\} else \{/,
        PLATFORM_WIN_PROJECTILE,
      );
    }
    return out;
  }
  if (s.hintKey) return patchCapShowWin(out, s.hintKey);
  return out;
}

function buildStubChapter(s) {
  return {
    mapping: '| DT | KG | 备注 |\n| --- | --- | --- |\n| 开始 | P1 | |\n| 调参 | O1 | |\n| 过关判定 | C1 | |\n| 过关 | R1 | |',
    kg: {
      title: s.topic,
      sub: '组员样本 · 待 Agent A 重分析',
      nodes: [
        { id: 'P1', label: '进入关卡', group: 'premise', layer: 'play', level: 0, r: 22, desc: s.knowledgeText },
        { id: 'O1', label: '调节变量', group: 'operation', layer: 'play', level: 1, r: 22, desc: '调节滑条并观察结果' },
        { id: 'C1', label: '是否过关?', group: 'constraint', layer: 'play', level: 2, r: 22, desc: s.hint },
        { id: 'R1', label: '过关', group: 'result', layer: 'play', level: 3, r: 22, desc: '达成过关目标' },
        { id: 'S1', label: s.topic, group: 'core', layer: 'teach', level: 0, r: 22, desc: s.knowledgeText },
        { id: 'S2', label: '控制变量法', group: 'method', layer: 'teach', level: 0, r: 22, desc: '每次只改一个调节变量' },
        { id: 'I1', label: '混淆控件', group: 'irrelevant', layer: 'play', level: 0, r: 18, desc: '不影响核心结论的控件' },
      ],
      links: [
        { s: 'P1', t: 'O1', tp: 'premise' },
        { s: 'O1', t: 'C1', tp: 'premise' },
        { s: 'C1', t: 'R1', tp: 'core' },
        { s: 'S1', t: 'O1', tp: 'verify' },
        { s: 'S2', t: 'O1', tp: 'verify' },
      ],
    },
    dt: {
      title: s.topic,
      sub: '',
      tree: {
        n: '开始', t: 'root', d: '进入探究',
        children: [{
          n: '调参', t: 'step', d: '调节变量',
          children: [{
            n: '过关?', t: 'decision', d: s.hint,
            children: [
              { n: '过关', t: 'result', d: '成功', _e: '是' },
              { n: '重试', t: 'retry', d: '未达标，继续调参', _e: '否' },
            ],
          }],
        }],
      },
    },
    winSync: { title: s.hint, sub: s.topic },
    traceMap: { controls: {} },
    strategy: {
      title: '控制变量',
      sub: '',
      mermaid: 'graph TD\n  Start([开始]):::stratStart --> StrategySelect{选择调参策略?}:::stratCond\n  StrategySelect -->|控制变量：每次只改一项| Adjust[调整参数]\n  Adjust --> Fire[操作/发射]\n  Fire --> Observe{观察结果?}:::stratCond\n  Observe -->|未达标| Adjust\n  Observe -->|达标| Win[过关]:::stratResult\n  StrategySelect -->|多参盲调| Trap[同时多调]:::stratInvalid\n  Trap --> Fire',
      routes: [
        { id: 'main', label: '控制变量：每次只改一项', mapsTo: ['P1', 'O1', 'C1', 'R1'], warn: '每次只改一个参数' },
        { id: 'trap', label: '多参盲调', mapsTo: ['P1', 'O1', 'C1'], warn: '同时调节多个滑条效率低' },
      ],
    },
    inquiryScript: {
      summary: s.knowledgeText,
      knowledgePoints: [{ id: 'KP1', label: s.topic, formulas: [], mapsToKg: ['S1'] }],
      adjustmentVariables: [
        { id: 'AV1', controlId: null, label: '调节变量1', role: 'primary', priorityRank: 1 },
        { id: 'AV2', controlId: null, label: '调节变量2', role: 'secondary', priorityRank: 2 },
      ],
      confoundingVariables: [{ id: 'CV1', controlId: null, label: '混淆变量', reason: '不影响核心结论' }],
      outputVariables: [{ id: 'OV1', label: '过关结果', role: 'primary', mapsToKg: 'R1' }],
      inquiryFlow: ['KP1', 'AV1', 'AV2', 'OV1'],
    },
    inquiryProfile: 'generic',
    meta: { generationMode: 'analyze', stub: true, htmlOrigin: 'teammate' },
  };
}

function chapterFromEra(s) {
  if (s.chapterIndex == null || !fs.existsSync(ERA_CHAPTERS)) return buildStubChapter(s);
  const all = JSON.parse(fs.readFileSync(ERA_CHAPTERS, 'utf8'));
  const src = all.find((c) => c.ch === s.chapterIndex);
  if (!src || !src.kg || !src.dt) return buildStubChapter(s);
  return {
    mapping: src.mapping,
    kg: src.kg,
    dt: src.dt,
    winSync: src.winSync || { title: s.hint, sub: s.topic },
    strategy: src.strategy,
    traceMap: src.traceMap || { controls: {} },
    inquiryScript: src.inquiryScript,
    inquiryProfile: src.inquiryProfile || 'generic',
    meta: {
      generationMode: 'analyze',
      htmlOrigin: 'teammate',
      sourceChapter: s.chapterIndex,
      sourcePackage: 'capacitor-era',
      stub: false,
      quality: src.quality || null,
    },
  };
}

function upsertManifestSample(manifest, s) {
  const entry = {
    id: s.id,
    topic: s.topic,
    knowledgeText: s.knowledgeText,
    hint: s.hint,
    tags: [...s.tags],
    expected: {
      confoundingMin: 1,
      minAdjustmentVars: 2,
      minOutputVars: 1,
    },
    demoCatalog: false,
    htmlOrigin: 'teammate',
  };
  const idx = (manifest.samples || []).findIndex((x) => x.id === s.id);
  if (idx >= 0) {
    const prev = manifest.samples[idx];
    manifest.samples[idx] = {
      ...prev,
      ...entry,
      tags: [...new Set([...(prev.tags || []).filter((t) => !String(t).startsWith('craft:')), ...entry.tags])],
    };
  } else {
    manifest.samples.push(entry);
  }
}

function main() {
  const forceGame = process.argv.includes('--force-game');
  const srcFiles = fs.readdirSync(SRC).filter((f) => f.endsWith('.html'));
  const mappedSrc = new Set(TEAM_MAP.map((s) => s.src));
  for (const f of srcFiles) {
    if (!mappedSrc.has(f)) throw new Error(`unmapped teammate sample file: ${f}`);
  }
  for (const s of TEAM_MAP) {
    if (!fs.existsSync(path.join(SRC, s.src))) throw new Error(`missing ${s.src}`);
  }

  const manifestPath = path.join(PKG, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.description = '985 大物课纲 · 精华 HTML 探究样本（约 20 条起，可随组员/试点扩展；eval 子集仍覆盖 hard tags）';

  for (const s of TEAM_MAP) {
    const dir = path.join(PKG, s.id);
    fs.mkdirSync(dir, { recursive: true });
    const gamePath = path.join(dir, 'game.html');
    const existingHtml = fs.existsSync(gamePath) ? fs.readFileSync(gamePath, 'utf8') : '';
    const preserveGame = !forceGame && !!existingHtml && (
      (s.tags || []).includes('craft:gold')
      || existingHtml.includes('slim: dropped block')
    );
    let html;
    if (preserveGame) {
      html = existingHtml;
      console.log(`${s.id}: preserve existing game.html (${(s.tags || []).includes('craft:gold') ? 'craft:gold' : 'slimmed'})`);
    } else {
      const srcPath = path.join(SRC, s.src);
      html = patchForSpec(s, fs.readFileSync(srcPath, 'utf8'));
      html = injectLegacyTrace(html, s.id);
      fs.writeFileSync(gamePath, html, 'utf8');
      if (forceGame) console.log(`${s.id}: wrote game.html (--force-game)`);
    }
    const chapter = s.chapterIndex != null ? chapterFromEra(s) : buildStubChapter(s);
    const existingChapter = path.join(dir, 'chapter.json');
    let writeChapter = true;
    if (fs.existsSync(existingChapter)) {
      try {
        const prev = JSON.parse(fs.readFileSync(existingChapter, 'utf8'));
        if (prev && prev.meta && prev.meta.stub === false) writeChapter = false;
      } catch { /* rewrite */ }
    }
    if (writeChapter) {
      fs.writeFileSync(existingChapter, JSON.stringify(chapter, null, 2), 'utf8');
    }
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
      id: s.id,
      topic: s.topic,
      htmlOrigin: 'teammate',
      ingestedAt: new Date().toISOString(),
      sourceFile: s.src,
      chapterIndex: s.chapterIndex ?? null,
      notes: 'Platform shell owns explore/challenge phase; sample provides gameplay + win.',
    }, null, 2), 'utf8');
    fs.writeFileSync(path.join(dir, 'README.md'), [
      `# ${s.id}`,
      '',
      `- 源：组员做的样本/${s.src}`,
      `- 知识点：${s.knowledgeText}`,
      `- 过关：${s.hint}`,
      '- 探索/竞赛：由学生端平台壳统一提供',
      '',
    ].join('\n'), 'utf8');

    upsertManifestSample(manifest, s);
    console.log(`${s.id}: bytes=${html.length} hasWin=${hasWinEmit(html)}`);
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`runtime manifest samples: ${manifest.samples.length}`);

  if (fs.existsSync(HS_MANIFEST)) {
    const hs = JSON.parse(fs.readFileSync(HS_MANIFEST, 'utf8'));
    hs.description = manifest.description;
    for (const s of TEAM_MAP) upsertManifestSample(hs, s);
    fs.writeFileSync(HS_MANIFEST, JSON.stringify(hs, null, 2), 'utf8');
    console.log(`html-samples manifest samples: ${hs.samples.length}`);
  }

  ensureMacroCategories();
  const catalog = readCatalog();
  let catalogAdded = 0;
  for (const s of TEAM_MAP) {
    const id = `demo-${s.id}`;
    const item = {
      id,
      title: `${s.topic} · ${s.id}`,
      description: [s.hint, s.knowledgeText].filter(Boolean).join(' · '),
      graphId: s.id,
      playUrl: packagePlayUrl(s.id),
      published: true,
      featured: (s.tags || []).includes('craft:gold'),
      publishedAt: new Date().toISOString(),
      source: 'html-sample',
      categoryId: topicToMacroId(s.topic),
      topicKey: s.topic,
      sampleTags: [...s.tags],
    };
    const idx = catalog.items.findIndex((i) => i.id === id);
    if (idx >= 0) catalog.items[idx] = { ...catalog.items[idx], ...item };
    else {
      catalog.items.push(item);
      catalogAdded += 1;
    }
  }
  writeCatalog(catalog);
  console.log(`catalog: +${catalogAdded} (total ${catalog.items.length})`);
}

if (require.main === module) main();
module.exports = { TEAM_MAP, main };
