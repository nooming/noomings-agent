initThree() {
  if (typeof THREE === 'undefined') {
    console.error('Three.js missing');
    return false;
  }
  const canvas = this.dom.canvas;
  const T = this._three;
  T.CRAFT3 = { bg: 0x1a2430, mid: 0x2b3a48, hi: 0x7af2cc, glow: 0xffaf40, metal: 0x5d6d7e, accent: 0xff7eb3, ok: 0x2ecc71 };
  T.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  T.renderer.shadowMap.enabled = true;
  T.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  T.renderer.setClearColor(T.CRAFT3.bg, 1);
  T.scene = new THREE.Scene();
  T.scene.background = new THREE.Color(T.CRAFT3.bg);
  T.scene.fog = new THREE.Fog(T.CRAFT3.bg, 40, 120);
  T.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
  T.camera.position.set(8, 14, 28);
  if (typeof THREE.OrbitControls !== 'undefined') {
    T.orbit = new THREE.OrbitControls(T.camera, T.renderer.domElement);
    T.orbit.enableDamping = true;
    T.orbit.dampingFactor = 0.06;
    T.orbit.target.set(18, 4, 0);
    T.orbit.minDistance = 12;
    T.orbit.maxDistance = 60;
    T.orbit.maxPolarAngle = Math.PI * 0.48;
  }
  T.scene.add(new THREE.AmbientLight(0xb8c8d8, 0.45));
  const dir = new THREE.DirectionalLight(0xfff0d0, 0.9);
  dir.position.set(20, 30, 15);
  dir.castShadow = true;
  T.scene.add(dir);
  T.scene.add(new THREE.HemisphereLight(0x88aacc, 0x3a5030, 0.35));

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 60),
    new THREE.MeshStandardMaterial({ color: 0x2f6b32, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  T.scene.add(ground);
  const dirt = new THREE.Mesh(
    new THREE.BoxGeometry(100, 0.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 0.9 })
  );
  dirt.position.set(20, 0.15, 0);
  T.scene.add(dirt);

  // hills (far)
  for (let i = 0; i < 4; i++) {
    const hill = new THREE.Mesh(
      new THREE.ConeGeometry(6 + i, 4 + i * 0.5, 5),
      new THREE.MeshStandardMaterial({ color: 0x4a5a48, roughness: 1 })
    );
    hill.position.set(10 + i * 18, 1.5, -18 - i);
    T.scene.add(hill);
  }

  // cannon group
  T.cannon = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.7, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x2c3e50, metalness: 0.4, roughness: 0.5 })
  );
  base.position.y = 0.35;
  T.cannon.add(base);
  T.barrelPivot = new THREE.Group();
  T.barrelPivot.position.set(0, 0.75, 0);
  T.cannon.add(T.barrelPivot);
  const breech = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.9, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x34495e, metalness: 0.45, roughness: 0.4 })
  );
  T.barrelPivot.add(breech);
  T.barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.34, 3.2, 16),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.55, roughness: 0.35 })
  );
  T.barrel.rotation.z = Math.PI / 2;
  T.barrel.position.x = 1.6;
  T.barrelPivot.add(T.barrel);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.32, 0.06, 8, 16),
    new THREE.MeshStandardMaterial({ color: T.CRAFT3.hi, metalness: 0.5, roughness: 0.3 })
  );
  rim.rotation.y = Math.PI / 2;
  rim.position.x = 3.2;
  T.barrelPivot.add(rim);
  T.cannon.position.set(0, 0, 0);
  T.scene.add(T.cannon);

  // projectile
  T.projMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffaf40, emissive: 0xffaf40, emissiveIntensity: 0.35 })
  );
  T.projMesh.visible = false;
  T.projMesh.castShadow = true;
  T.scene.add(T.projMesh);

  // target
  T.targetMesh = new THREE.Group();
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.9, 0.15),
    new THREE.MeshStandardMaterial({ color: 0xe74c3c, emissive: 0x801010, emissiveIntensity: 0.2 })
  );
  T.targetMesh.add(board);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 2.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.4, roughness: 0.5 })
  );
  pole.position.y = -1.2;
  T.targetMesh.add(pole);
  T.scene.add(T.targetMesh);

  T.obstacleGroup = new THREE.Group();
  T.scene.add(T.obstacleGroup);

  T.trail = [];
  T.trailLine = null;
  T.flashLight = new THREE.PointLight(0xfff0a0, 0, 12, 2);
  T.scene.add(T.flashLight);

  T.clock = new THREE.Clock();
  this.threeReady = true;
  this.resize();
  return true;
}

pxToWorld(x, y) {
  const ppm = this.pixelsPerMeter || 4;
  const wx = (x - 60) / ppm;
  const wy = Math.max(0, (this.groundY - y) / ppm);
  return { x: wx, y: wy, z: 0 };
}

sync3d() {
  const T = this._three;
  if (!T.scene) return;
  const angle = parseFloat(this.dom.inputs.angle.value) * Math.PI / 180;
  const recoil = (this.recoil || 0) * 0.02;
  T.cannon.position.x = -recoil;
  T.barrelPivot.rotation.z = angle;

  // obstacles
  while (T.obstacleGroup.children.length) {
    const ch = T.obstacleGroup.children[0];
    T.obstacleGroup.remove(ch);
    if (ch.geometry) ch.geometry.dispose();
  }
  (this.obstacles || []).forEach((obs) => {
    const w = this.pxToWorld(obs.x, obs.y + obs.h);
    const ww = obs.w / (this.pixelsPerMeter || 4);
    const hh = obs.h / (this.pixelsPerMeter || 4);
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.4, ww), Math.max(0.4, hh), 1.2),
      new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 })
    );
    m.position.set(w.x + ww / 2, hh / 2, 0);
    m.castShadow = true;
    T.obstacleGroup.add(m);
  });

  if (this.target) {
    const tw = this.pxToWorld(this.target.x, this.target.y);
    T.targetMesh.visible = true;
    T.targetMesh.position.set(tw.x, Math.max(0.6, tw.y), 0);
  } else {
    T.targetMesh.visible = false;
  }

  if (this.proj && this.state === 'SIMULATING') {
    const p = this.pxToWorld(this.proj.x, this.proj.y);
    T.projMesh.visible = true;
    T.projMesh.position.set(p.x, p.y, 0);
    T.trail.push(new THREE.Vector3(p.x, p.y, 0));
    if (T.trail.length > 80) T.trail.shift();
    if (T.trailLine) {
      T.scene.remove(T.trailLine);
      T.trailLine.geometry.dispose();
    }
    if (T.trail.length > 1) {
      T.trailLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(T.trail),
        new THREE.LineBasicMaterial({ color: 0xffaf40, transparent: true, opacity: 0.75 })
      );
      T.scene.add(T.trailLine);
    }
  } else if (this.state === 'READY') {
    T.projMesh.visible = false;
    T.trail = [];
    if (T.trailLine) {
      T.scene.remove(T.trailLine);
      T.trailLine = null;
    }
  }

  if (this.muzzleFlash && this.muzzleFlash.life > 0) {
    const cx = 60 - (this.recoil || 0);
    const cy = this.groundY - 18;
    const dist = 65;
    const fx = cx + Math.cos(angle) * dist;
    const fy = cy - Math.sin(angle) * dist;
    const fw = this.pxToWorld(fx, fy);
    T.flashLight.intensity = this.muzzleFlash.life * 4;
    T.flashLight.position.set(fw.x, fw.y, 0.5);
  } else {
    T.flashLight.intensity = 0;
  }

  // camera look along range
  if (T.orbit) {
    T.orbit.target.set(Math.max(10, (this.width || 800) / (this.pixelsPerMeter || 4) * 0.35), 3, 0);
  }
}
