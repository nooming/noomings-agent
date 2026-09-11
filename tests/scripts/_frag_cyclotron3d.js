function makeLabelSprite(text, opts) {
  opts = opts || {};
  const c = document.createElement('canvas');
  c.width = opts.w || 256; c.height = opts.h || 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,18,24,0.85)';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(128,216,224,0.5)';
  g.strokeRect(4, 4, c.width - 8, c.height - 8);
  g.fillStyle = '#80d8e0';
  g.font = 'bold ' + (opts.fontSize || 26) + 'px "Microsoft YaHei",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  String(text).split('\n').forEach(function(line, i, arr) {
    g.fillText(line, c.width / 2, c.height / 2 + (i - (arr.length - 1) / 2) * 26);
  });
  const tex = new THREE.CanvasTexture(c);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(opts.sx || 2.4, opts.sy || 0.85, 1);
  spr.userData = { tex: tex, canvas: c, g: g, opts: opts };
  return spr;
}

function updateSpriteText(spr, text) {
  if (!spr || !spr.userData || !spr.userData.g) return;
  const c = spr.userData.canvas, g = spr.userData.g, opts = spr.userData.opts || {};
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(10,18,24,0.85)';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(128,216,224,0.5)';
  g.strokeRect(4, 4, c.width - 8, c.height - 8);
  g.fillStyle = '#80d8e0';
  g.font = 'bold ' + (opts.fontSize || 26) + 'px "Microsoft YaHei",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  String(text).split('\n').forEach(function(line, i, arr) {
    g.fillText(line, c.width / 2, c.height / 2 + (i - (arr.length - 1) / 2) * 26);
  });
  spr.userData.tex.needsUpdate = true;
}

function createChamber() {
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(8, 48),
    new THREE.MeshStandardMaterial({ color: 0x1a2834, roughness: 0.85, metalness: 0.15 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  chamberGroup = new THREE.Group();
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(7.2, 7.2, 3.2, 48, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x243848, metalness: 0.35, roughness: 0.55,
      side: THREE.DoubleSide, transparent: true, opacity: 0.55
    })
  );
  wall.position.y = 1.6;
  chamberGroup.add(wall);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(7.2, 0.12, 8, 48),
    new THREE.MeshStandardMaterial({ color: CRAFT3.hi, metalness: 0.5, roughness: 0.35 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 3.2;
  chamberGroup.add(rim);
  scene.add(chamberGroup);

  poleN = new THREE.Mesh(
    new THREE.CylinderGeometry(2.8, 2.8, 0.35, 32),
    new THREE.MeshStandardMaterial({ color: 0xe06060, metalness: 0.4, roughness: 0.45, emissive: 0x601010, emissiveIntensity: 0.2 })
  );
  poleN.position.y = 3.5;
  scene.add(poleN);
  poleS = new THREE.Mesh(
    new THREE.CylinderGeometry(2.8, 2.8, 0.35, 32),
    new THREE.MeshStandardMaterial({ color: 0x6080e0, metalness: 0.4, roughness: 0.45, emissive: 0x102060, emissiveIntensity: 0.2 })
  );
  poleS.position.y = -0.1;
  scene.add(poleS);

  BArrowGroup = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.45, 8),
      new THREE.MeshBasicMaterial({ color: CRAFT3.hi, transparent: true, opacity: 0.7 })
    );
    arrow.position.set(Math.cos(a) * 3.2, 1.7, Math.sin(a) * 3.2);
    arrow.rotation.x = Math.PI;
    BArrowGroup.add(arrow);
  }
  scene.add(BArrowGroup);

  extractRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.75, 0.08, 10, 64),
    new THREE.MeshStandardMaterial({ color: CRAFT3.ok, emissive: CRAFT3.ok, emissiveIntensity: 0.35 })
  );
  extractRing.rotation.x = Math.PI / 2;
  extractRing.position.y = 1.6;
  scene.add(extractRing);

  orbitRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.5, 0.04, 8, 64),
    new THREE.MeshStandardMaterial({ color: CRAFT3.accent, emissive: CRAFT3.glow, emissiveIntensity: 0.25 })
  );
  orbitRing.rotation.x = Math.PI / 2;
  orbitRing.position.y = 1.6;
  orbitRing.visible = false;
  scene.add(orbitRing);

  particleMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 14, 14),
    new THREE.MeshStandardMaterial({ color: CRAFT3.accent, emissive: CRAFT3.glow, emissiveIntensity: 0.6 })
  );
  particleMesh.position.set(2.5, 1.6, 0);
  particleMesh.visible = false;
  scene.add(particleMesh);

  badgeSprite = makeLabelSprite('加速舱', { w: 340, h: 96, fontSize: 26, sx: 2.8, sy: 0.85 });
  badgeSprite.position.set(-4.5, 4.2, 4);
  scene.add(badgeSprite);
}

function initThree() {
  if (typeof THREE === 'undefined') {
    console.error('Three.js missing');
    return false;
  }
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(CRAFT3.bg, 1);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(CRAFT3.bg);
  scene.fog = new THREE.Fog(CRAFT3.bg, 16, 40);
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(6, 8, 12);
  if (typeof THREE.OrbitControls !== 'undefined') {
    orbit = new THREE.OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.06;
    orbit.target.set(0, 1.6, 0);
    orbit.minDistance = 6;
    orbit.maxDistance = 24;
    orbit.maxPolarAngle = Math.PI * 0.49;
  }
  scene.add(new THREE.AmbientLight(0xa8c0d0, 0.4));
  const dir = new THREE.DirectionalLight(0xe8f4ff, 0.85);
  dir.position.set(8, 14, 10);
  dir.castShadow = true;
  scene.add(dir);
  createChamber();
  clock = new THREE.Clock();
  threeReady = true;
  syncRendererSize();
  return true;
}

function clearTrail3d() {
  if (trailLine) {
    scene.remove(trailLine);
    trailLine.geometry.dispose();
    trailLine = null;
  }
}

function updateTrail3d(points) {
  clearTrail3d();
  if (!points || points.length < 2) return;
  const pts = points.map(function(p) { return new THREE.Vector3(p.x, p.y, p.z); });
  trailLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: CRAFT3.glow, transparent: true, opacity: 0.7 })
  );
  scene.add(trailLine);
}

function drawStatic() {
  draw();
}

function draw() {
  if (!threeReady) return;
  syncRendererSize();
  const B = parseFloat(sMag.value) || 0;
  const bN = Math.min(1, B / 2);
  poleN.material.emissiveIntensity = 0.15 + bN * 0.45;
  poleS.material.emissiveIntensity = 0.15 + bN * 0.45;
  BArrowGroup.children.forEach(function(a) {
    a.material.opacity = 0.25 + bN * 0.7;
    a.material.transparent = true;
    a.scale.setScalar(0.7 + bN * 0.6);
  });

  const midR = (TARGET_R_MIN + TARGET_R_MAX) / 2;
  extractRing.scale.setScalar(Math.max(0.35, midR / 2.75));
  extractRing.material.emissiveIntensity = 0.25 + (playMode === 'challenge' ? 0.2 : 0);

  if (measuredR != null && measuredR > 0 && measuredR < 100) {
    const rWorld = Math.max(0.4, measuredR);
    orbitRing.visible = true;
    orbitRing.scale.setScalar(rWorld / 2.5);
    const px = Math.cos(angle) * rWorld;
    const pz = Math.sin(angle) * rWorld;
    particleMesh.visible = true;
    particleMesh.position.set(px, 1.6, pz);
    if (simRunning) {
      trailTick++;
      if (trailTick % 2 === 0) {
        if (!window.__orbitTrail3d) window.__orbitTrail3d = [];
        window.__orbitTrail3d.push({ x: px, y: 1.6, z: pz });
        if (window.__orbitTrail3d.length > 120) window.__orbitTrail3d.shift();
        updateTrail3d(window.__orbitTrail3d);
      }
    }
    const inBand = measuredR >= TARGET_R_MIN && measuredR <= TARGET_R_MAX;
    orbitRing.material.color.setHex(inBand ? CRAFT3.ok : CRAFT3.accent);
    orbitRing.material.emissiveIntensity = inBand ? 0.45 : 0.2;
  } else {
    orbitRing.visible = false;
    particleMesh.visible = false;
    clearTrail3d();
    window.__orbitTrail3d = [];
  }

  let label = '加速舱';
  if (measuredR != null) label += '\nr = ' + measuredR.toFixed(2) + ' m';
  else label += '\n待发射';
  updateSpriteText(badgeSprite, label);

  if (orbit) orbit.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}
