function makeLabelSprite(text, opts) {
  opts = opts || {};
  const c = document.createElement('canvas');
  c.width = opts.w || 256; c.height = opts.h || 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,20,16,0.85)';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(64,200,120,0.5)';
  g.strokeRect(4, 4, c.width - 8, c.height - 8);
  g.fillStyle = '#80d0a0';
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
  g.fillStyle = 'rgba(10,20,16,0.85)';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(64,200,120,0.5)';
  g.strokeRect(4, 4, c.width - 8, c.height - 8);
  g.fillStyle = '#80d0a0';
  g.font = 'bold ' + (opts.fontSize || 26) + 'px "Microsoft YaHei",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  String(text).split('\n').forEach(function(line, i, arr) {
    g.fillText(line, c.width / 2, c.height / 2 + (i - (arr.length - 1) / 2) * 26);
  });
  spr.userData.tex.needsUpdate = true;
}

function createMagBench() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 14),
    new THREE.MeshStandardMaterial({ color: 0x142018, roughness: 0.92 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const bench = new THREE.Mesh(
    new THREE.BoxGeometry(12, 0.5, 4),
    new THREE.MeshStandardMaterial({ color: 0x2a3a30, roughness: 0.75, metalness: 0.1 })
  );
  bench.position.set(0, 0.8, 0);
  bench.castShadow = true;
  scene.add(bench);

  magnetGroup = new THREE.Group();
  const yokeMat = new THREE.MeshStandardMaterial({ color: 0x3a4840, metalness: 0.45, roughness: 0.45 });
  const left = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.2, 2.2), yokeMat);
  left.position.set(-3.2, 2.6, 0);
  magnetGroup.add(left);
  const right = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.2, 2.2), yokeMat);
  right.position.set(3.2, 2.6, 0);
  magnetGroup.add(right);
  const top = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.8, 2.2), yokeMat);
  top.position.set(0, 4.0, 0);
  magnetGroup.add(top);
  const poleN = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.35, 1.8),
    new THREE.MeshStandardMaterial({ color: 0xe06060, emissive: 0x601010, emissiveIntensity: 0.25, metalness: 0.3, roughness: 0.5 })
  );
  poleN.position.set(0, 3.55, 0);
  magnetGroup.add(poleN);
  const poleS = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.35, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x6080e0, emissive: 0x102060, emissiveIntensity: 0.25, metalness: 0.3, roughness: 0.5 })
  );
  poleS.position.set(0, 1.55, 0);
  magnetGroup.add(poleS);
  scene.add(magnetGroup);

  BFieldGroup = new THREE.Group();
  for (let i = -2; i <= 2; i++) {
    for (let j = -1; j <= 1; j++) {
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.35, 8),
        new THREE.MeshBasicMaterial({ color: CRAFT3.hi, transparent: true, opacity: 0.7 })
      );
      arrow.position.set(i * 0.7, 2.55, j * 0.5);
      arrow.rotation.x = Math.PI;
      BFieldGroup.add(arrow);
    }
  }
  scene.add(BFieldGroup);

  liftGroup = new THREE.Group();
  wireMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 7.2, 12),
    new THREE.MeshStandardMaterial({ color: 0xc89050, metalness: 0.55, roughness: 0.35, emissive: 0x804020, emissiveIntensity: 0.15 })
  );
  wireMesh.rotation.z = Math.PI / 2;
  wireMesh.position.set(0, 2.55, 0);
  liftGroup.add(wireMesh);
  const iArrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.14, 0.4, 10),
    new THREE.MeshBasicMaterial({ color: CRAFT3.accent })
  );
  iArrow.rotation.z = -Math.PI / 2;
  iArrow.position.set(3.8, 2.55, 0);
  liftGroup.add(iArrow);
  scene.add(liftGroup);

  powerBox = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1.2, 1.0),
    new THREE.MeshStandardMaterial({ color: CRAFT3.metal, metalness: 0.4, roughness: 0.5 })
  );
  powerBox.position.set(-5.5, 1.6, 1.4);
  scene.add(powerBox);

  scaleGroup = new THREE.Group();
  const scaleBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.4, 0.5),
    new THREE.MeshStandardMaterial({ color: CRAFT3.metal, metalness: 0.45, roughness: 0.4, emissive: 0x000000, emissiveIntensity: 0 })
  );
  scaleBody.position.set(5.2, 3.2, 0);
  scaleGroup.add(scaleBody);
  springMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 1.0, 10),
    new THREE.MeshStandardMaterial({ color: 0xa8b0a8, metalness: 0.5, roughness: 0.35 })
  );
  springMesh.position.set(5.2, 2.3, 0);
  scaleGroup.add(springMesh);
  const hook = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.04, 8, 16),
    new THREE.MeshStandardMaterial({ color: CRAFT3.metal })
  );
  hook.position.set(5.2, 1.7, 0);
  scaleGroup.add(hook);
  scene.add(scaleGroup);

  lampPivot = new THREE.Group();
  lampPivot.position.set(-1, 7.2, 2);
  scene.add(lampPivot);
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 1.6, 8),
    new THREE.MeshStandardMaterial({ color: CRAFT3.metal })
  );
  cord.position.y = -0.8;
  lampPivot.add(cord);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.48, 0.4, 14, 1, true),
    new THREE.MeshStandardMaterial({ color: CRAFT3.accent, emissive: CRAFT3.glow, emissiveIntensity: 0.45, side: THREE.DoubleSide })
  );
  shade.position.y = -1.7;
  lampPivot.add(shade);
  const bulb = new THREE.PointLight(0xc8ffd0, 0.85, 16, 2);
  bulb.position.y = -1.6;
  lampPivot.add(bulb);

  const dustGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(75);
  for (let i = 0; i < 25; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 16;
    pos[i * 3 + 1] = Math.random() * 6;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustPoints = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x80d0a0, size: 0.04, transparent: true, opacity: 0.28 }));
  scene.add(dustPoints);

  badgeSprite = makeLabelSprite('安培力台', { w: 320, h: 96, fontSize: 26, sx: 2.6, sy: 0.85 });
  badgeSprite.position.set(-4, 5.2, 2.5);
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
  scene.fog = new THREE.Fog(CRAFT3.bg, 14, 34);
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  camera.position.set(4, 6.5, 11);
  if (typeof THREE.OrbitControls !== 'undefined') {
    orbit = new THREE.OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.06;
    orbit.target.set(0, 2.4, 0);
    orbit.minDistance = 5;
    orbit.maxDistance = 22;
    orbit.maxPolarAngle = Math.PI * 0.48;
  }
  scene.add(new THREE.AmbientLight(0xa8c0b0, 0.42));
  const dir = new THREE.DirectionalLight(0xe8ffe8, 0.85);
  dir.position.set(6, 12, 8);
  dir.castShadow = true;
  scene.add(dir);
  createMagBench();
  clock = new THREE.Clock();
  threeReady = true;
  syncRendererSize();
  return true;
}

function drawCanvas(I, B, F) {
  if (!threeReady) return;
  syncRendererSize();
  const drv = eventAnim ? eventAnim.drivers : null;
  const drawI = drv ? drv.I : I;
  const drawB = drv ? drv.B : B;
  const drawF = drv ? drv.F : F;
  const band = drv ? drv.band : (typeof classifyBand === 'function' ? classifyBand(drawF) : 'low');
  const lift = typeof displayLift !== 'undefined' ? displayLift : 0;
  const springOff = eventAnim ? (eventAnim.springOffset || 0) : 0;
  const flashG = eventAnim ? (eventAnim.flashGreen || 0) : 0;

  const liftM = Math.min(1.2, lift * 0.02);
  liftGroup.position.y = liftM;
  const iGlow = Math.min(1, drawI / 5);
  wireMesh.material.emissiveIntensity = 0.1 + iGlow * 0.55 + flashG * 0.3;
  const tWire = sWireTemp ? parseFloat(sWireTemp.value) : 25;
  const tN = Math.max(0, Math.min(1, (tWire - 10) / 70));
  wireMesh.material.color.setRGB(0.7 + tN * 0.2, 0.55 - tN * 0.2, 0.3 - tN * 0.15);

  const bN = Math.min(1, drawB / 2);
  BFieldGroup.children.forEach(function(a) {
    a.material.opacity = 0.2 + bN * 0.75;
    a.scale.setScalar(0.7 + bN * 0.7);
  });

  const stretch = 1 + Math.min(1.2, drawF / 8) * 0.8 + springOff * 0.02;
  springMesh.scale.y = stretch;
  springMesh.position.y = 2.3 - (stretch - 1) * 0.35;

  const onBand = band === 'ok';
  const col = onBand ? CRAFT3.ok : (band === 'high' ? 0xf87171 : 0xfb923c);
  if (scaleGroup.children[0] && scaleGroup.children[0].material) {
    scaleGroup.children[0].material.emissive.setHex(col);
    scaleGroup.children[0].material.emissiveIntensity = onBand ? 0.35 + flashG * 0.4 : 0.08;
  }

  let label = '安培力台';
  if (measuredF != null) label += '\nF = ' + measuredF.toFixed(2) + ' N';
  else label += '\n待测试';
  if (playMode === 'challenge' && lockedF != null) label += '\n目标 ' + lockedF.toFixed(1) + ' N';
  updateSpriteText(badgeSprite, label);
}
