function designToWorld(x, y) {
  const wx = (x / DW - 0.5) * 12;
  const wy = (1 - y / DH) * 5.2 + 0.2;
  return { x: wx, y: wy, z: 0 };
}

function makeLabelSprite(text, opts) {
  opts = opts || {};
  const c = document.createElement('canvas');
  c.width = opts.w || 256; c.height = opts.h || 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(15,28,40,0.85)';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(253,230,138,0.5)';
  g.strokeRect(4, 4, c.width - 8, c.height - 8);
  g.fillStyle = '#fde68a';
  g.font = 'bold ' + (opts.fontSize || 28) + 'px "Microsoft YaHei",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  String(text).split('\n').forEach(function(line, i, arr) {
    g.fillText(line, c.width / 2, c.height / 2 + (i - (arr.length - 1) / 2) * 28);
  });
  const tex = new THREE.CanvasTexture(c);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(opts.sx || 2.2, opts.sy || 0.8, 1);
  spr.userData = { tex: tex, canvas: c, g: g, opts: opts };
  return spr;
}

function updateSpriteText(spr, text) {
  if (!spr || !spr.userData || !spr.userData.g) return;
  const c = spr.userData.canvas, g = spr.userData.g, opts = spr.userData.opts || {};
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(15,28,40,0.85)';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(253,230,138,0.5)';
  g.strokeRect(4, 4, c.width - 8, c.height - 8);
  g.fillStyle = '#fde68a';
  g.font = 'bold ' + (opts.fontSize || 28) + 'px "Microsoft YaHei",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  String(text).split('\n').forEach(function(line, i, arr) {
    g.fillText(line, c.width / 2, c.height / 2 + (i - (arr.length - 1) / 2) * 28);
  });
  spr.userData.tex.needsUpdate = true;
}

function createMine() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 16),
    new THREE.MeshStandardMaterial({ color: 0x3d4f3a, roughness: 0.92 })
  );
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(24, 10, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x1a2834, roughness: 0.9 })
  );
  wall.position.set(0, 5, -4); scene.add(wall);

  for (let i = 0; i < 5; i++) {
    const x = -8 + i * 4;
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 5.5, 0.28),
      new THREE.MeshStandardMaterial({ color: CRAFT3.wood, roughness: 0.85 })
    );
    post.position.set(x, 2.75, -2.2); scene.add(post);
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.22, 0.22),
      new THREE.MeshStandardMaterial({ color: CRAFT3.wood, roughness: 0.85 })
    );
    beam.position.set(x, 5.2, -2.2); scene.add(beam);
  }

  const railMat = new THREE.MeshStandardMaterial({ color: CRAFT3.metal, metalness: 0.55, roughness: 0.4 });
  [-0.35, 0.35].forEach(function(z) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(14, 0.06, 0.08), railMat);
    rail.position.set(1.5, 0.08, z); scene.add(rail);
  });
  for (let i = 0; i < 18; i++) {
    const tie = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.05, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 0.9 })
    );
    tie.position.set(-5 + i * 0.8, 0.04, 0); scene.add(tie);
  }

  const mount = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.35, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x4a5564, metalness: 0.3, roughness: 0.55 })
  );
  const piv = designToWorld(PIVOT_X, PIVOT_Y);
  mount.position.set(piv.x, piv.y + 0.15, 0); scene.add(mount);
  pivotMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xc0d0e0, metalness: 0.5, roughness: 0.35 })
  );
  pivotMesh.position.set(piv.x, piv.y, 0); scene.add(pivotMesh);

  rodMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 1, 10),
    new THREE.MeshStandardMaterial({ color: 0xb0c8e0, metalness: 0.4, roughness: 0.45 })
  );
  scene.add(rodMesh);

  bobMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 20, 20),
    new THREE.MeshStandardMaterial({
      color: 0xc08030, emissive: CRAFT3.glow, emissiveIntensity: 0.2, metalness: 0.25, roughness: 0.45
    })
  );
  bobMesh.castShadow = true; scene.add(bobMesh);

  flyMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xf8e080, emissive: 0xf59e0b, emissiveIntensity: 0.35 })
  );
  flyMesh.visible = false; scene.add(flyMesh);

  cartMesh = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.55, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.35, roughness: 0.5 })
  );
  body.position.y = 0.35; cartMesh.add(body);
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.12, 1.0),
    new THREE.MeshStandardMaterial({ color: CRAFT3.accent, emissive: CRAFT3.ok, emissiveIntensity: 0.15 })
  );
  bed.position.y = 0.68; cartMesh.add(bed);
  [-0.45, 0.45].forEach(function(x) {
    [-0.4, 0.4].forEach(function(z) {
      const wh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12),
        new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.4, roughness: 0.5 })
      );
      wh.rotation.z = Math.PI / 2; wh.position.set(x, 0.16, z); cartMesh.add(wh);
    });
  });
  scene.add(cartMesh);

  lampPivot = new THREE.Group();
  lampPivot.position.set(-2, 7.5, 1.5); scene.add(lampPivot);
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 1.8, 8),
    new THREE.MeshStandardMaterial({ color: CRAFT3.metal })
  );
  cord.position.y = -0.9; lampPivot.add(cord);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.5, 0.4, 14, 1, true),
    new THREE.MeshStandardMaterial({ color: CRAFT3.hi, emissive: CRAFT3.glow, emissiveIntensity: 0.5, side: THREE.DoubleSide })
  );
  shade.position.y = -1.9; lampPivot.add(shade);
  const bulb = new THREE.PointLight(0xffe08a, 0.9, 16, 2);
  bulb.position.y = -1.8; lampPivot.add(bulb);

  const dustGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(90);
  for (let i = 0; i < 30; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 18;
    pos[i * 3 + 1] = Math.random() * 7;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustPoints = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xfde68a, size: 0.04, transparent: true, opacity: 0.3 }));
  scene.add(dustPoints);

  badgeSprite = makeLabelSprite('矿井投靶台', { w: 300, h: 90, fontSize: 28, sx: 2.4, sy: 0.75 });
  badgeSprite.position.set(3, 4.5, 2); scene.add(badgeSprite);
}

function initThree() {
  if (typeof THREE === 'undefined') { console.error('Three.js missing'); return false; }
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(CRAFT3.bg, 1);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(CRAFT3.bg);
  scene.fog = new THREE.Fog(CRAFT3.bg, 14, 36);
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(1.5, 5.8, 11);
  if (typeof THREE.OrbitControls !== 'undefined') {
    orbit = new THREE.OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true; orbit.dampingFactor = 0.06;
    orbit.target.set(0.5, 2.2, 0);
    orbit.minDistance = 5; orbit.maxDistance = 22;
    orbit.maxPolarAngle = Math.PI * 0.48;
  }
  scene.add(new THREE.AmbientLight(0xc8b898, 0.4));
  const dir = new THREE.DirectionalLight(0xffe8c8, 0.85);
  dir.position.set(6, 14, 8); dir.castShadow = true; scene.add(dir);
  const fill = new THREE.PointLight(0xb8956c, 0.35, 30);
  fill.position.set(-5, 5, 4); scene.add(fill);
  createMine();
  clock = new THREE.Clock();
  threeReady = true;
  resize();
  return true;
}

function drawScene() {
  if (!threeReady) return;
  const piv = designToWorld(PIVOT_X, PIVOT_Y);
  let endX = bobX, endY = bobY;
  let showBob = state === STATE_READY || state === STATE_SWING;
  let showFly = state === STATE_FLYING;
  if (showFly) { endX = flyX; endY = flyY; }
  const bob = designToWorld(endX, endY);
  const dx = bob.x - piv.x, dy = bob.y - piv.y;
  const len = Math.max(0.2, Math.sqrt(dx * dx + dy * dy));
  const ang = Math.atan2(dx, -dy);
  rodMesh.position.set(piv.x + dx / 2, piv.y + dy / 2, 0);
  rodMesh.scale.set(1, len, 1);
  rodMesh.rotation.z = -ang;
  bobMesh.visible = showBob;
  bobMesh.position.set(bob.x, bob.y, 0);
  bobMesh.scale.setScalar(0.85 + 0.08 * Math.min(8, mass));
  flyMesh.visible = showFly;
  if (showFly) flyMesh.position.set(bob.x, bob.y, 0);

  const cart = designToWorld(cartX + cartWidth / 2, GROUND_Y - 10);
  cartMesh.position.set(cart.x, 0.05, 0);
  cartMesh.scale.x = Math.max(0.7, cartWidth / 80);
  const bed = cartMesh.children[1];
  if (bed && bed.material) {
    bed.material.emissiveIntensity = hit ? 0.55 : 0.15;
    bed.material.color.setHex(hit ? CRAFT3.ok : CRAFT3.accent);
  }
  updateSpriteText(badgeSprite, playMode === 'challenge' ? '急单接矿车' : '矿井投靶台');
}
