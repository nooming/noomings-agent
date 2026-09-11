/**
 * One-shot: convert momentum-collision draw layer to Three.js r128.
 * Physics / win / explore_success / settle timing left untouched.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const FILE = path.join(ROOT, 'data/runtime/packages/momentum-collision/game.html');

let html = fs.readFileSync(FILE, 'utf8');

if (!html.includes('vendor/three.min.js')) {
  html = html.replace(
    '<title>气垫导轨 · 碰撞</title>',
    '<title>气垫导轨 · 碰撞</title>\n  <script src="vendor/three.min.js"></script>\n  <script src="vendor/OrbitControls.js"></script>'
  );
}

const START = '    const canvas = document.getElementById(\'collisionCanvas\');\n    const ctx = canvas.getContext(\'2d\');';
const END_MARK = '    function fire() {';

const startIdx = html.indexOf(START);
const endIdx = html.indexOf(END_MARK);
if (startIdx < 0 || endIdx < 0) {
  console.error('markers not found', { startIdx, endIdx });
  process.exit(1);
}

const THREE_BLOCK = `    const canvas = document.getElementById('collisionCanvas');
    const DESIGN_W = 760, DESIGN_H = 360;
    let W = DESIGN_W, H = DESIGN_H;

    const CRAFT3 = {
      bg: 0x120c12, mid: 0x2e2430, hi: 0xe8a8c8, glow: 0xe060a0,
      metal: 0x7a8490, accent: 0x0c8aad, ok: 0x6fae8f, ink: 0x141018
    };
    const TRACK_WORLD = 16;
    let threeReady = false;
    let renderer, scene, camera, orbit, clock;
    let railMesh, bayMesh, bayMat, block1, block2, block1Label, block2Label;
    let badgeSprite, lampPivot, dustPoints, sparkGroup, velArrow;
    let pumpMesh, cabinetMesh;

    function syncCanvasSize() {
      var stage = document.getElementById('essence-stage') || canvas.parentElement;
      var cssW = Math.max(2, (stage && stage.clientWidth) || canvas.clientWidth || DESIGN_W);
      var cssH = Math.max(2, (stage && stage.clientHeight) || canvas.clientHeight || DESIGN_H);
      W = cssW;
      H = cssH;
      if (renderer && camera) {
        var pr = Math.min(2, window.devicePixelRatio || 1);
        if (canvas.width !== Math.round(cssW * pr) || canvas.height !== Math.round(cssH * pr)) {
          renderer.setPixelRatio(pr);
          renderer.setSize(cssW, cssH, false);
          canvas.style.width = cssW + 'px';
          canvas.style.height = cssH + 'px';
          camera.aspect = cssW / cssH;
          camera.updateProjectionMatrix();
        }
      } else {
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
      }
    }

`;

// Keep everything from `let layoutMom` through just before `function roundRect`,
// then replace roundRect+drawScene with 3D impl.
// Actually START already includes canvas/ctx/DESIGN and syncCanvasSize — we replace
// from canvas through end of drawScene (before fire).

// Find the piece after original syncCanvasSize that we must keep:
const keepFrom = html.indexOf('    let layoutMom = null;', startIdx);
if (keepFrom < 0) {
  console.error('layoutMom not found');
  process.exit(1);
}

const roundRectIdx = html.indexOf('    function roundRect(x, y, w, h, r) {', keepFrom);
if (roundRectIdx < 0) {
  console.error('roundRect not found');
  process.exit(1);
}

const keepMiddle = html.slice(keepFrom, roundRectIdx);

const DRAW3D = `
    function makeLabelSprite(text, opts) {
      opts = opts || {};
      const c = document.createElement('canvas');
      c.width = opts.w || 256;
      c.height = opts.h || 96;
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      g.fillStyle = 'rgba(18,12,18,0.82)';
      g.strokeStyle = 'rgba(232,168,200,0.55)';
      g.lineWidth = 3;
      const r = 14;
      g.beginPath();
      g.moveTo(r, 4); g.lineTo(c.width - r, 4); g.quadraticCurveTo(c.width - 4, 4, c.width - 4, r);
      g.lineTo(c.width - 4, c.height - r); g.quadraticCurveTo(c.width - 4, c.height - 4, c.width - r, c.height - 4);
      g.lineTo(r, c.height - 4); g.quadraticCurveTo(4, c.height - 4, 4, c.height - r);
      g.lineTo(4, r); g.quadraticCurveTo(4, 4, r, 4); g.closePath();
      g.fill(); g.stroke();
      g.fillStyle = '#f0d0e0';
      g.font = 'bold ' + (opts.fontSize || 28) + 'px "Microsoft YaHei",sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const lines = String(text).split('\\n');
      lines.forEach(function(line, i) {
        g.fillText(line, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * (opts.fontSize || 28) * 1.15);
      });
      const tex = new THREE.CanvasTexture(c);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      const spr = new THREE.Sprite(mat);
      spr.scale.set(opts.sx || 2.2, opts.sy || 0.85, 1);
      spr.userData.tex = tex;
      spr.userData.canvas = c;
      spr.userData.g = g;
      spr.userData.opts = opts;
      return spr;
    }

    function updateSpriteText(spr, text) {
      if (!spr || !spr.userData || !spr.userData.g) return;
      const c = spr.userData.canvas;
      const g = spr.userData.g;
      const opts = spr.userData.opts || {};
      g.clearRect(0, 0, c.width, c.height);
      g.fillStyle = 'rgba(18,12,18,0.82)';
      g.strokeStyle = 'rgba(232,168,200,0.55)';
      g.lineWidth = 3;
      const r = 14;
      g.beginPath();
      g.moveTo(r, 4); g.lineTo(c.width - r, 4); g.quadraticCurveTo(c.width - 4, 4, c.width - 4, r);
      g.lineTo(c.width - 4, c.height - r); g.quadraticCurveTo(c.width - 4, c.height - 4, c.width - r, c.height - 4);
      g.lineTo(r, c.height - 4); g.quadraticCurveTo(4, c.height - 4, 4, c.height - r);
      g.lineTo(4, r); g.quadraticCurveTo(4, 4, r, 4); g.closePath();
      g.fill(); g.stroke();
      g.fillStyle = '#f0d0e0';
      g.font = 'bold ' + (opts.fontSize || 28) + 'px "Microsoft YaHei",sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const lines = String(text).split('\\n');
      lines.forEach(function(line, i) {
        g.fillText(line, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * (opts.fontSize || 28) * 1.15);
      });
      spr.userData.tex.needsUpdate = true;
    }

    function pxToWorldX(px) {
      return ((px / Math.max(1, W)) - 0.5) * TRACK_WORLD;
    }

    function createWorkshop() {
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 24),
        new THREE.MeshStandardMaterial({ color: 0x1a141c, roughness: 0.92, metalness: 0.04 })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.02;
      floor.receiveShadow = true;
      scene.add(floor);

      const back = new THREE.Mesh(
        new THREE.BoxGeometry(36, 14, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x1e1822, roughness: 0.9 })
      );
      back.position.set(0, 6.5, -6);
      scene.add(back);

      const side = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 14, 18),
        new THREE.MeshStandardMaterial({ color: 0x18141c, roughness: 0.9 })
      );
      side.position.set(-14, 6.5, 0);
      scene.add(side);

      // bench
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(18, 0.55, 3.2),
        new THREE.MeshStandardMaterial({ color: 0x3a3440, roughness: 0.7, metalness: 0.15 })
      );
      bench.position.set(0, 0.9, 0);
      bench.castShadow = true;
      bench.receiveShadow = true;
      scene.add(bench);

      // air rail
      railMesh = new THREE.Mesh(
        new THREE.BoxGeometry(TRACK_WORLD * 0.92, 0.28, 0.85),
        new THREE.MeshStandardMaterial({
          color: CRAFT3.metal, roughness: 0.35, metalness: 0.55,
          emissive: CRAFT3.hi, emissiveIntensity: 0.05
        })
      );
      railMesh.position.set(0, 1.28, 0);
      railMesh.castShadow = true;
      railMesh.receiveShadow = true;
      scene.add(railMesh);

      // rail legs
      const legMat = new THREE.MeshStandardMaterial({ color: 0x5a6268, metalness: 0.4, roughness: 0.5 });
      [-7.2, 0, 7.2].forEach(function(x) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.05, 0.22), legMat);
        leg.position.set(x, 0.52, 0.35);
        scene.add(leg);
        const leg2 = leg.clone();
        leg2.position.z = -0.35;
        scene.add(leg2);
      });

      // jet holes (decorative)
      const holeMat = new THREE.MeshBasicMaterial({ color: 0xe8a8c8, transparent: true, opacity: 0.35 });
      for (let i = -18; i <= 18; i++) {
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8), holeMat);
        h.position.set(i * 0.42, 1.43, 0);
        scene.add(h);
      }

      // photoelectric bay
      bayMat = new THREE.MeshStandardMaterial({
        color: CRAFT3.ok, transparent: true, opacity: 0.28,
        emissive: CRAFT3.ok, emissiveIntensity: 0.25, side: THREE.DoubleSide
      });
      bayMesh = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 1.1), bayMat);
      bayMesh.position.set(4, 2.0, 0);
      scene.add(bayMesh);
      const gateL = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 1.5, 1.15),
        new THREE.MeshStandardMaterial({ color: CRAFT3.metal, metalness: 0.5, roughness: 0.4 })
      );
      gateL.position.set(-0.9, 0, 0);
      bayMesh.add(gateL);
      const gateR = gateL.clone();
      gateR.position.x = 0.9;
      bayMesh.add(gateR);

      // pump cabinet left
      pumpMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 1.6, 1.1),
        new THREE.MeshStandardMaterial({ color: CRAFT3.metal, metalness: 0.45, roughness: 0.45 })
      );
      pumpMesh.position.set(-9.2, 1.7, 1.6);
      scene.add(pumpMesh);
      const hose = new THREE.Mesh(
        new THREE.TorusGeometry(0.55, 0.07, 8, 20, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0x5a626a, metalness: 0.3, roughness: 0.6 })
      );
      hose.rotation.z = Math.PI / 2;
      hose.position.set(-8.2, 1.55, 0.7);
      scene.add(hose);

      // equipment cabinet right
      cabinetMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 3.2, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x2a2430, roughness: 0.75 })
      );
      cabinetMesh.position.set(9.5, 2.5, -2.2);
      scene.add(cabinetMesh);

      // hanging lamp
      lampPivot = new THREE.Group();
      lampPivot.position.set(-2, 8.2, 2);
      scene.add(lampPivot);
      const cord = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 2.0, 8),
        new THREE.MeshStandardMaterial({ color: CRAFT3.metal, metalness: 0.6, roughness: 0.35 })
      );
      cord.position.y = -1.0;
      lampPivot.add(cord);
      const shade = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.55, 0.45, 16, 1, true),
        new THREE.MeshStandardMaterial({
          color: CRAFT3.hi, emissive: CRAFT3.glow, emissiveIntensity: 0.45, side: THREE.DoubleSide
        })
      );
      shade.position.y = -2.1;
      lampPivot.add(shade);
      const bulb = new THREE.PointLight(0xffc0e0, 0.85, 18, 2);
      bulb.position.y = -2.0;
      lampPivot.add(bulb);

      // dust
      const dustGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(90);
      for (let i = 0; i < 30; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 22;
        positions[i * 3 + 1] = Math.random() * 8;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
      }
      dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      dustPoints = new THREE.Points(dustGeo, new THREE.PointsMaterial({
        color: 0xe8a8c8, size: 0.05, transparent: true, opacity: 0.35
      }));
      scene.add(dustPoints);

      // packages
      const mkBlock = function(colorHex, label) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(0.85, 0.7, 0.7),
          new THREE.MeshStandardMaterial({
            color: colorHex, roughness: 0.45, metalness: 0.12,
            emissive: colorHex, emissiveIntensity: 0.08
          })
        );
        body.castShadow = true;
        g.add(body);
        const spr = makeLabelSprite(label, { w: 128, h: 96, fontSize: 42, sx: 0.7, sy: 0.5 });
        spr.position.set(0, 0.65, 0.4);
        g.add(spr);
        return { group: g, body: body, label: spr };
      };
      const b1 = mkBlock(0x5a7898, '1');
      const b2 = mkBlock(CRAFT3.accent, '2');
      block1 = b1.group; block2 = b2.group;
      block1Label = b1.label; block2Label = b2.label;
      scene.add(block1);
      scene.add(block2);

      sparkGroup = new THREE.Group();
      scene.add(sparkGroup);
      for (let i = 0; i < 10; i++) {
        const sp = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 6, 6),
          new THREE.MeshBasicMaterial({ color: 0xffc878, transparent: true, opacity: 0.9 })
        );
        sp.visible = false;
        sparkGroup.add(sp);
      }

      const arrowGeo = new THREE.ConeGeometry(0.12, 0.35, 10);
      velArrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: CRAFT3.hi }));
      velArrow.rotation.z = -Math.PI / 2;
      velArrow.visible = false;
      scene.add(velArrow);

      badgeSprite = makeLabelSprite('气垫导轨台', { w: 320, h: 96, fontSize: 30, sx: 2.6, sy: 0.8 });
      badgeSprite.position.set(-5.5, 3.4, 2.2);
      scene.add(badgeSprite);
    }

    function initThree() {
      if (typeof THREE === 'undefined') {
        console.error('Three.js 未加载（请确认 vendor/ 相对路径）');
        return false;
      }
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setClearColor(CRAFT3.bg, 1);

      scene = new THREE.Scene();
      scene.background = new THREE.Color(CRAFT3.bg);
      scene.fog = new THREE.Fog(CRAFT3.bg, 18, 42);

      camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
      camera.position.set(2.5, 7.5, 14);

      if (typeof THREE.OrbitControls !== 'undefined') {
        orbit = new THREE.OrbitControls(camera, renderer.domElement);
        orbit.enableDamping = true;
        orbit.dampingFactor = 0.06;
        orbit.target.set(0, 1.6, 0);
        orbit.minDistance = 6;
        orbit.maxDistance = 28;
        orbit.maxPolarAngle = Math.PI * 0.48;
        orbit.minPolarAngle = 0.2;
      } else {
        console.error('OrbitControls 未加载（请确认 vendor/ 相对路径）');
      }

      scene.add(new THREE.AmbientLight(0xc8b0c0, 0.42));
      const dir = new THREE.DirectionalLight(0xffe0f0, 0.85);
      dir.position.set(8, 16, 10);
      dir.castShadow = true;
      dir.shadow.mapSize.set(1024, 1024);
      dir.shadow.camera.near = 1;
      dir.shadow.camera.far = 40;
      dir.shadow.camera.left = -14;
      dir.shadow.camera.right = 14;
      dir.shadow.camera.top = 12;
      dir.shadow.camera.bottom = -8;
      scene.add(dir);
      const fill = new THREE.PointLight(0xb080a0, 0.4, 40);
      fill.position.set(-6, 6, 8);
      scene.add(fill);
      const cool = new THREE.PointLight(0x6a7a88, 0.22, 35);
      cool.position.set(8, 4, -6);
      scene.add(cool);

      createWorkshop();
      clock = new THREE.Clock();
      syncCanvasSize();
      threeReady = true;
      return true;
    }

    function placeBay() {
      if (!bayMesh) return;
      var L = layoutMom || layoutMetrics();
      var mid = (L.TARGET_LEFT + L.TARGET_RIGHT) / 2;
      var widthPx = Math.max(20, L.TARGET_RIGHT - L.TARGET_LEFT);
      var wx = pxToWorldX(mid);
      var ww = (widthPx / Math.max(1, W)) * TRACK_WORLD;
      bayMesh.position.x = wx;
      bayMesh.scale.x = Math.max(0.45, ww / 1.8);
      var on = hasFired && winOk && !animating;
      bayMat.emissiveIntensity = on ? 0.55 : 0.22;
      bayMat.opacity = on ? 0.42 : 0.26;
      bayMat.color.setHex(playMode === 'challenge' ? 0xa06080 : CRAFT3.ok);
      bayMat.emissive.setHex(playMode === 'challenge' ? 0xa06080 : CRAFT3.ok);
    }

    function placeBlocks() {
      if (!block1 || !block2) return;
      var r1 = ballRadius(m1), r2 = ballRadius(m2);
      var s1 = 0.75 + 0.08 * Math.min(10, m1);
      var s2 = 0.75 + 0.08 * Math.min(10, m2);
      block1.scale.setScalar(s1);
      block2.scale.setScalar(s2);
      block1.position.set(pxToWorldX(ball1X), 1.55 + 0.35 * s1, 0);
      block2.position.set(pxToWorldX(ball2X), 1.55 + 0.35 * s2, 0);

      // rail temperature tint (visual only)
      if (railMesh && sRailTemp) {
        var tRail = parseFloat(sRailTemp.value) || 22;
        var tN = Math.max(0, Math.min(1, (tRail - 5) / 55));
        railMesh.material.emissiveIntensity = 0.04 + tN * 0.18;
        railMesh.material.color.setRGB(0.48 + tN * 0.2, 0.52 - tN * 0.12, 0.55 - tN * 0.25);
      }
    }

    function syncSparks() {
      if (!sparkGroup) return;
      var r1 = ballRadius(m1), r2 = ballRadius(m2);
      var close = animating && Math.abs(ball1X - ball2X) < (r1 + r2) * 2.2;
      var kids = sparkGroup.children;
      for (var i = 0; i < kids.length; i++) {
        var sp = kids[i];
        if (!close) { sp.visible = false; continue; }
        var sf = ((performance.now() * 0.02 + i * 1.7) % 1);
        var ang = (i / kids.length) * Math.PI * 2;
        var cx = (block1.position.x + block2.position.x) / 2;
        var cy = (block1.position.y + block2.position.y) / 2;
        sp.visible = true;
        sp.position.set(cx + Math.cos(ang) * sf * 0.55, cy + Math.sin(ang) * sf * 0.4, Math.sin(ang * 2) * sf * 0.3);
        sp.material.opacity = 0.9 - sf * 0.85;
        sp.scale.setScalar(1.2 - sf);
      }
    }

    function syncVelArrow() {
      if (!velArrow) return;
      if (!hasFired && !animating) {
        velArrow.visible = true;
        velArrow.position.set(block1.position.x + 0.7 + v1 * 0.08, block1.position.y + 0.55, 0.2);
        velArrow.scale.set(1, 0.8 + v1 * 0.08, 1);
      } else {
        velArrow.visible = false;
      }
    }

    function drawScene() {
      syncCanvasSize();
      var L = layoutMetrics();
      if (!animating && !hasFired) {
        ball1X = L.BALL1_INIT_X;
        ball2X = L.BALL2_INIT_X;
        ball1Y = L.GROUND_Y - ballRadius(m1);
        ball2Y = L.GROUND_Y - ballRadius(m2);
      }
      if (!threeReady) return;
      placeBay();
      placeBlocks();
      syncSparks();
      syncVelArrow();
      var bayLabel = playMode === 'challenge' ? '竞赛光电门' : '光电门';
      updateSpriteText(badgeSprite, '气垫导轨台\\n' + bayLabel);
      badgeSprite.position.set(bayMesh ? bayMesh.position.x : 4, 3.5, 1.8);
    }

`;

const before = html.slice(0, startIdx);
const after = html.slice(endIdx); // starts with `function fire()`
html = before + THREE_BLOCK + keepMiddle + DRAW3D + after;

// Boot three + render loop: replace bottom init that calls drawScene before three ready
const OLD_BOOT = `    updateSliderLabels();
    refreshGoalUI();
    resetSim(true);
    drawScene();
    window.__momRedraw = drawScene;`;

const NEW_BOOT = `    updateSliderLabels();
    refreshGoalUI();
    window.__momRedraw = function() {
      syncCanvasSize();
      if (!animating) drawScene();
    };

    if (!initThree()) {
      hintMsg.textContent = '3D 引擎未加载，请检查 vendor/three.min.js';
    } else {
      resetSim(true);
      (function renderLoop() {
        const tNow = clock ? clock.getElapsedTime() : 0;
        if (lampPivot) lampPivot.rotation.z = Math.sin(tNow * 1.1) * 0.05;
        if (dustPoints) {
          const arr = dustPoints.geometry.attributes.position.array;
          for (let i = 0; i < arr.length; i += 3) {
            arr[i + 1] += 0.002 + ((i / 3) % 5) * 0.00015;
            if (arr[i + 1] > 8) arr[i + 1] = 0.4;
          }
          dustPoints.geometry.attributes.position.needsUpdate = true;
        }
        if (!animating) drawScene();
        if (orbit) orbit.update();
        if (renderer && scene && camera) renderer.render(scene, camera);
        requestAnimationFrame(renderLoop);
      })();
    }`;

if (!html.includes(OLD_BOOT)) {
  console.error('boot block not found');
  process.exit(1);
}
html = html.replace(OLD_BOOT, NEW_BOOT);

fs.writeFileSync(FILE, html);
console.log('OK momentum-collision 3D patched', FILE);
console.log('three scripts:', html.includes('vendor/three.min.js'));
console.log('initThree:', html.includes('function initThree'));
console.log('ctx2d leftover in main sim:', /const ctx = canvas\\.getContext\\('2d'\\)/.test(html));
`;

// Fix the write - I accidentally put the script content with trailing issues.
// Rewrite cleanly.
