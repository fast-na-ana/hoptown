// Visual effects, fully pooled so nothing is allocated or disposed during play:
// one draw call for all tracers, one for all particles, one for all bullet holes.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _n = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _qz = new THREE.Quaternion(), _c = new THREE.Color();

export class Effects {
  constructor(scene) {
    this.scene = scene;
    // ---- particles: one Points object
    this.max = 1500;
    this.pPos = new Float32Array(this.max * 3);
    this.pCol = new Float32Array(this.max * 3);
    this.pVel = new Float32Array(this.max * 3);
    this.pLife = new Float32Array(this.max);
    this.pGrav = new Float32Array(this.max);
    this.pNext = 0; this.pAlive = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    const dot = document.createElement('canvas'); dot.width = dot.height = 32;
    const dg = dot.getContext('2d'); dg.fillStyle = '#fff'; dg.beginPath(); dg.arc(16, 16, 14, 0, Math.PI * 2); dg.fill();
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, depthWrite: false, map: new THREE.CanvasTexture(dot), alphaTest: 0.5 }));
    this.points.frustumCulled = false;
    for (let i = 0; i < this.max; i++) this.pPos[i * 3 + 1] = -999;
    scene.add(this.points);

    // ---- tracers: one LineSegments, faded via additive vertex colours
    this.maxTracers = 64;
    this.tPos = new Float32Array(this.maxTracers * 6);
    this.tCol = new Float32Array(this.maxTracers * 6);
    this.tLife = new Float32Array(this.maxTracers);
    this.tNext = 0;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracers.frustumCulled = false;
    scene.add(this.tracers);

    // ---- muzzle flashes: small sprite pool
    this.flashMat = new THREE.SpriteMaterial({ map: this._flashTexture(), color: '#ffd98a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.flashes = [];
    for (let i = 0; i < 12; i++) { const s = new THREE.Sprite(this.flashMat); s.visible = false; scene.add(s); this.flashes.push({ obj: s, life: 0 }); }
    this.flashNext = 0;

    // ---- explosion spheres + teleport rings: pools with their own materials
    const boomGeo = new THREE.SphereGeometry(1, 16, 12), ringGeo = new THREE.TorusGeometry(0.6, 0.06, 6, 24);
    this.booms = []; this.rings = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(boomGeo, new THREE.MeshBasicMaterial({ color: '#ffb04a', transparent: true, opacity: 0.9, depthWrite: false }));
      m.visible = false; scene.add(m); this.booms.push({ obj: m, life: 0, max: 0.4 });
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#7ff8ff', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
      r.visible = false; r.rotation.x = Math.PI / 2; scene.add(r); this.rings.push({ obj: r, life: 0, max: 0.45 });
    }
    this.boomNext = 0; this.ringNext = 0;

    // ---- bullet holes: one InstancedMesh
    const hc = document.createElement('canvas'); hc.width = hc.height = 64;
    const hg = hc.getContext('2d');
    const rg = hg.createRadialGradient(32, 32, 2, 32, 32, 30);
    rg.addColorStop(0, 'rgba(10,10,12,1)'); rg.addColorStop(0.22, 'rgba(18,16,16,0.95)'); rg.addColorStop(0.32, 'rgba(60,55,50,0.7)');
    rg.addColorStop(0.55, 'rgba(40,36,32,0.25)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    hg.fillStyle = rg; hg.fillRect(0, 0, 64, 64);
    hg.strokeStyle = 'rgba(15,12,10,0.6)'; hg.lineWidth = 1.2;
    for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28, r0 = 7, r1 = 12 + Math.random() * 10; hg.beginPath(); hg.moveTo(32 + Math.cos(a) * r0, 32 + Math.sin(a) * r0); hg.lineTo(32 + Math.cos(a + 0.2) * r1, 32 + Math.sin(a + 0.2) * r1); hg.stroke(); }
    this.maxHoles = 200;
    this.holes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.13, 0.13),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }), this.maxHoles);
    this.holes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.holes.count = 0; this.holes.frustumCulled = false; this.holes.renderOrder = 1;
    this.holeNext = 0;
    scene.add(this.holes);

    this.light = new THREE.PointLight('#ffb050', 0, 14, 2);
    scene.add(this.light);
    this.lightTime = 0;
  }

  // Make every pooled object visible once so the renderer can compile its shaders up front.
  setWarm(on) {
    for (const f of this.flashes) f.obj.visible = on;
    for (const b of this.booms) b.obj.visible = on;
    for (const r of this.rings) r.obj.visible = on;
  }

  _flashTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,220,140,0.8)'); grd.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  particle(p, v, color, life, grav = 9) {
    const i = this.pNext; this.pNext = (this.pNext + 1) % this.max;
    this.pPos[i * 3] = p[0]; this.pPos[i * 3 + 1] = p[1]; this.pPos[i * 3 + 2] = p[2];
    this.pVel[i * 3] = v[0]; this.pVel[i * 3 + 1] = v[1]; this.pVel[i * 3 + 2] = v[2];
    _c.set(color);
    this.pCol[i * 3] = _c.r; this.pCol[i * 3 + 1] = _c.g; this.pCol[i * 3 + 2] = _c.b;
    this.pLife[i] = life; this.pGrav[i] = grav;
    this.pAlive = 1;
  }

  burst(p, n, color, speed = 3, life = 0.5, normal = null, grav = 9) {
    const v = [0, 0, 0];
    for (let k = 0; k < n; k++) {
      v[0] = (Math.random() - 0.5) * 2; v[1] = Math.random() * 1.5; v[2] = (Math.random() - 0.5) * 2;
      if (normal) { v[0] += normal[0] * 1.5; v[1] += normal[1] * 1.5; v[2] += normal[2] * 1.5; }
      const s = speed * (0.4 + Math.random() * 0.8);
      v[0] *= s; v[1] *= s; v[2] *= s;
      this.particle(p, v, color, life * (0.6 + Math.random() * 0.6), grav);
    }
  }

  tracer(a, b) {
    const i = this.tNext; this.tNext = (this.tNext + 1) % this.maxTracers;
    this.tPos.set(a, i * 6); this.tPos.set(b, i * 6 + 3);
    this.tLife[i] = 0.07;
  }

  muzzleFlash(p, size = 0.6) {
    const f = this.flashes[this.flashNext]; this.flashNext = (this.flashNext + 1) % this.flashes.length;
    f.obj.position.set(p[0], p[1], p[2]); f.obj.scale.setScalar(size); f.obj.visible = true; f.life = 0.05;
  }

  hole(p, normal, size = 1) {
    if (!normal || (normal[0] === 0 && normal[1] === 0 && normal[2] === 0)) return;
    const i = this.holeNext; this.holeNext = (this.holeNext + 1) % this.maxHoles;
    _n.set(normal[0], normal[1], normal[2]);
    _q.setFromUnitVectors(_z, _n);
    _qz.setFromAxisAngle(_z, Math.random() * Math.PI * 2);
    _q.multiply(_qz);
    _p.set(p[0] + normal[0] * 0.006, p[1] + normal[1] * 0.006, p[2] + normal[2] * 0.006);
    _s.setScalar(size * (0.85 + Math.random() * 0.3));
    this.holes.setMatrixAt(i, _m.compose(_p, _q, _s));
    this.holes.count = Math.max(this.holes.count, i + 1);
    this.holes.instanceMatrix.needsUpdate = true;
  }

  clearHoles() { this.holes.count = 0; this.holeNext = 0; }

  impact(p, normal, color = '#d8d0c0') { this.burst(p, 6, color, 2.5, 0.35, normal); }
  blood(p, color) { this.burst(p, 10, color, 3, 0.45, null, 6); }

  explosion(p) {
    const b = this.booms[this.boomNext]; this.boomNext = (this.boomNext + 1) % this.booms.length;
    b.obj.position.set(p[0], p[1], p[2]); b.obj.visible = true; b.life = b.max;
    this.burst(p, 70, '#ffb347', 9, 0.8, null, 4);
    this.burst(p, 40, '#555555', 4, 1.3, [0, 1, 0], -1);
    this.light.position.set(p[0], p[1] + 0.5, p[2]);
    this.light.intensity = 60; this.lightTime = 0.25;
  }

  ring(p, color = '#7ff8ff', particles = true) {
    const r = this.rings[this.ringNext]; this.ringNext = (this.ringNext + 1) % this.rings.length;
    r.obj.material.color.set(color);
    r.obj.position.set(p[0], p[1], p[2]); r.obj.visible = true; r.life = r.max;
    if (particles) this.burst(p, 30, color, 4, 0.5, null, 0);
  }

  update(dt) {
    // tracers
    let anyT = false;
    for (let i = 0; i < this.maxTracers; i++) {
      if (this.tLife[i] <= 0) continue;
      this.tLife[i] -= dt;
      const k = Math.max(0, this.tLife[i] / 0.07);
      for (let v = 0; v < 2; v++) { const o = i * 6 + v * 3; this.tCol[o] = 1 * k; this.tCol[o + 1] = 0.94 * k; this.tCol[o + 2] = 0.69 * k; }
      if (this.tLife[i] <= 0) for (let j = 0; j < 6; j++) this.tCol[i * 6 + j] = 0;
      anyT = true;
    }
    if (anyT || this._tWas) {
      this.tracers.geometry.attributes.position.needsUpdate = true;
      this.tracers.geometry.attributes.color.needsUpdate = true;
    }
    this._tWas = anyT;
    this.tracers.visible = anyT;
    // flashes, booms, rings
    for (const f of this.flashes) if (f.life > 0) { f.life -= dt; if (f.life <= 0) f.obj.visible = false; }
    for (const b of this.booms) if (b.life > 0) {
      b.life -= dt; const k = Math.max(0, b.life / b.max);
      b.obj.scale.setScalar(1 + (1 - k) * 3.5); b.obj.material.opacity = k * 0.85;
      if (b.life <= 0) b.obj.visible = false;
    }
    for (const r of this.rings) if (r.life > 0) {
      r.life -= dt; const k = Math.max(0, r.life / r.max);
      r.obj.scale.setScalar(1 + (1 - k) * 2.5); r.obj.material.opacity = k;
      if (r.life <= 0) r.obj.visible = false;
    }
    // particles (skip the loop entirely when none are alive)
    if (this.pAlive) {
      let alive = 0;
      for (let i = 0; i < this.max; i++) {
        if (this.pLife[i] <= 0) continue;
        this.pLife[i] -= dt;
        if (this.pLife[i] <= 0) { this.pPos[i * 3 + 1] = -999; continue; }
        alive++;
        this.pVel[i * 3 + 1] -= this.pGrav[i] * dt;
        this.pPos[i * 3] += this.pVel[i * 3] * dt;
        this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
        this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      }
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
      this.pAlive = alive > 0 ? 1 : 0;
      this.points.visible = true;
    } else this.points.visible = false;
    if (this.lightTime > 0) { this.lightTime -= dt; this.light.intensity = Math.max(0, this.lightTime / 0.25) * 60; }
  }
}
