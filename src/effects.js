// Visual effects, fully pooled so nothing is allocated or disposed during play.
// Three particle systems (solid chips, soft smoke/dust, additive sparks) are one draw call each;
// tracers are one LineSegments, bullet holes / scorch marks one InstancedMesh.
import * as THREE from 'three';
import { debrisColor, isSoft } from './mapkit.js';

function mergeGeos(list) {
  let n = 0, ni = 0; for (const g of list) { n += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint16Array(ni);
  let o = 0, oi = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx[oi + i] = ix[i] + o;
    o += g.attributes.position.count; oi += ix.length; g.dispose();
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); m.setIndex(new THREE.BufferAttribute(idx, 1));
  return m;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _n = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _qz = new THREE.Quaternion(), _c = new THREE.Color();

function dotTexture(soft) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  if (soft) {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  } else { g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// A pool of point sprites with per-particle size, alpha, growth, drag and gravity.
class PSys {
  constructor(scene, max, { soft = false, additive = false, alphaTest = 0 } = {}) {
    this.max = max; this.next = 0; this.alive = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.grow = new Float32Array(max);
    this.size0 = new Float32Array(max); this.alpha0 = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -999;
    const g = new THREE.BufferGeometry();
    const attr = (a, n) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', attr(this.pos, 3)); g.setAttribute('color', attr(this.col, 3));
    g.setAttribute('psize', attr(this.size, 1)); g.setAttribute('palpha', attr(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: dotTexture(soft) }, scale: { value: 400 }, aTest: { value: alphaTest } }]),
      vertexShader: `attribute float psize; attribute float palpha; attribute vec3 color; varying vec3 vC; varying float vA;
        uniform float scale;
        #include <fog_pars_vertex>
        void main(){ vC = color; vA = palpha; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * scale / max(0.1, -mvPosition.z); gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D map; uniform float aTest; varying vec3 vC; varying float vA;
        #include <fog_pars_fragment>
        void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vA; if (a < aTest) discard;
          gl_FragColor = vec4(vC * t.rgb, a);
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: true, vertexColors: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  add(p, v, color, life, size, { grav = 9, drag = 0, grow = 0, alpha = 1 } = {}) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    const o = i * 3;
    this.pos[o] = p[0]; this.pos[o + 1] = p[1]; this.pos[o + 2] = p[2];
    this.vel[o] = v[0]; this.vel[o + 1] = v[1]; this.vel[o + 2] = v[2];
    _c.set(color);
    this.col[o] = _c.r; this.col[o + 1] = _c.g; this.col[o + 2] = _c.b;
    this.life[i] = life; this.maxLife[i] = life; this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow;
    this.size0[i] = size; this.alpha0[i] = alpha; this.size[i] = size; this.alpha[i] = alpha;
    this.alive = 1;
  }

  update(dt) {
    if (!this.alive) { this.points.visible = false; return; }
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const o = i * 3;
      if (this.life[i] <= 0) { this.pos[o + 1] = -999; this.alpha[i] = 0; continue; }
      alive++;
      const k = this.life[i] / this.maxLife[i];           // 1 -> 0
      const d = this.drag[i] ? Math.exp(-this.drag[i] * dt) : 1;
      this.vel[o] *= d; this.vel[o + 2] *= d; this.vel[o + 1] = this.vel[o + 1] * d - this.grav[i] * dt;
      this.pos[o] += this.vel[o] * dt; this.pos[o + 1] += this.vel[o + 1] * dt; this.pos[o + 2] += this.vel[o + 2] * dt;
      this.size[i] = this.size0[i] * (1 + this.grow[i] * (1 - k));
      this.alpha[i] = this.alpha0[i] * Math.min(1, k * 2.2) * (this.grow[i] ? Math.min(1, (1 - k) * 8 + 0.2) : 1);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true; a.color.needsUpdate = true; a.psize.needsUpdate = true; a.palpha.needsUpdate = true;
    this.alive = alive > 0 ? 1 : 0;
    this.points.visible = true;
  }
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.solid = new PSys(scene, 1400, { alphaTest: 0.35 });
    this.smokeSys = new PSys(scene, 420, { soft: true });
    this.glow = new PSys(scene, 700, { soft: true, additive: true });

    // ---- tracers: one LineSegments, faded via additive vertex colours (dim at the muzzle, hot at the tip)
    this.maxTracers = 96;
    this.tPos = new Float32Array(this.maxTracers * 6);
    this.tCol = new Float32Array(this.maxTracers * 6);
    this.tLife = new Float32Array(this.maxTracers);
    this.tAmp = new Float32Array(this.maxTracers);
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

    // ---- explosion spheres + teleport / shock rings
    const boomGeo = new THREE.SphereGeometry(1, 16, 12), ringGeo = new THREE.TorusGeometry(0.6, 0.06, 6, 24);
    this.booms = []; this.rings = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(boomGeo, new THREE.MeshBasicMaterial({ color: '#ffb04a', transparent: true, opacity: 0.9, depthWrite: false }));
      m.visible = false; scene.add(m); this.booms.push({ obj: m, life: 0, max: 0.4 });
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#7ff8ff', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
      r.visible = false; r.rotation.x = Math.PI / 2; scene.add(r); this.rings.push({ obj: r, life: 0, max: 0.45, grow: 2.5 });
    }
    this.boomNext = 0; this.ringNext = 0;

    // ---- bullet holes + scorch marks: one InstancedMesh
    const hc = document.createElement('canvas'); hc.width = hc.height = 64;
    const hg = hc.getContext('2d');
    const rg = hg.createRadialGradient(32, 32, 2, 32, 32, 30);
    rg.addColorStop(0, 'rgba(10,10,12,1)'); rg.addColorStop(0.22, 'rgba(18,16,16,0.95)'); rg.addColorStop(0.32, 'rgba(60,55,50,0.7)');
    rg.addColorStop(0.55, 'rgba(40,36,32,0.25)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    hg.fillStyle = rg; hg.fillRect(0, 0, 64, 64);
    hg.strokeStyle = 'rgba(15,12,10,0.6)'; hg.lineWidth = 1.2;
    for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28, r0 = 7, r1 = 12 + Math.random() * 10; hg.beginPath(); hg.moveTo(32 + Math.cos(a) * r0, 32 + Math.sin(a) * r0); hg.lineTo(32 + Math.cos(a + 0.2) * r1, 32 + Math.sin(a + 0.2) * r1); hg.stroke(); }
    this.maxHoles = 240;
    this.holes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.13, 0.13),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }), this.maxHoles);
    this.holes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.holes.count = 0; this.holes.frustumCulled = false; this.holes.renderOrder = 1;
    this.holeNext = 0;
    scene.add(this.holes);

    this.light = new THREE.PointLight('#ffb050', 0, 14, 2);
    scene.add(this.light);
    this.lightTime = 0;

    // ---- drifting clouds (a handful of big billboards far overhead)
    this.clouds = new THREE.Group(); scene.add(this.clouds);
    const cc = document.createElement('canvas'); cc.width = 256; cc.height = 128;
    const cg = cc.getContext('2d');
    for (let i = 0; i < 14; i++) {
      const x = 40 + Math.random() * 176, y = 50 + Math.random() * 40, r = 22 + Math.random() * 30;
      const grd = cg.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      cg.fillStyle = grd; cg.fillRect(0, 0, 256, 128);
    }
    const ctex = new THREE.CanvasTexture(cc); ctex.colorSpace = THREE.SRGBColorSpace;
    // one merged mesh: vertical quads around the arena, each turned to face the middle
    this.cloudMat = new THREE.MeshBasicMaterial({ map: ctex, transparent: true, depthWrite: false, fog: false, opacity: 0.85, side: THREE.DoubleSide });
    const quads = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.5, d = 120 + Math.random() * 90;
      const q = new THREE.PlaneGeometry(70 + Math.random() * 60, 26 + Math.random() * 16);
      q.rotateY(-a - Math.PI / 2);
      q.translate(Math.cos(a) * d, 70 + Math.random() * 45, Math.sin(a) * d);
      quads.push(q);
    }
    const merged = mergeGeos(quads);
    this.cloudMesh = new THREE.Mesh(merged, this.cloudMat); this.cloudMesh.frustumCulled = false; this.cloudMesh.renderOrder = -1;
    this.clouds.add(this.cloudMesh);
    this.ambientKind = null; this.ambientAcc = 0;
  }

  // Make every pooled object visible once so the renderer can compile its shaders up front.
  setWarm(on) {
    for (const f of this.flashes) f.obj.visible = on;
    for (const b of this.booms) b.obj.visible = on;
    for (const r of this.rings) r.obj.visible = on;
    for (const s of [this.solid, this.smokeSys, this.glow]) s.points.visible = on;
  }

  setAmbient(kind, tint = '#ffffff') { this.ambientKind = kind; this.cloudMat.color.set(tint); }

  _flashTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,220,140,0.8)'); grd.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  // ---- low-level spawners
  particle(p, v, color, life, grav = 9) { this.solid.add(p, v, color, life, 0.075, { grav }); }
  burst(p, n, color, speed = 3, life = 0.5, normal = null, grav = 9, size = 0.075) {
    const v = [0, 0, 0];
    for (let k = 0; k < n; k++) {
      v[0] = (Math.random() - 0.5) * 2; v[1] = Math.random() * 1.5; v[2] = (Math.random() - 0.5) * 2;
      if (normal) { v[0] += normal[0] * 1.5; v[1] += normal[1] * 1.5; v[2] += normal[2] * 1.5; }
      const s = speed * (0.4 + Math.random() * 0.8);
      v[0] *= s; v[1] *= s; v[2] *= s;
      this.solid.add(p, v, color, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), { grav, drag: 0.6 });
    }
  }
  smoke(p, v, color, life = 1, size = 0.5, grow = 2, alpha = 0.5) { this.smokeSys.add(p, v, color, life, size, { grav: -0.25, drag: 1.6, grow, alpha }); }
  sparks(p, n, normal, color = '#ffc46b', speed = 6) {
    for (let k = 0; k < n; k++) {
      const v = [(Math.random() - 0.5) * 2 + (normal ? normal[0] * 1.6 : 0), Math.random() * 1.4 + (normal ? normal[1] * 1.6 : 0), (Math.random() - 0.5) * 2 + (normal ? normal[2] * 1.6 : 0)];
      const s = speed * (0.4 + Math.random() * 0.8);
      this.glow.add(p, [v[0] * s, v[1] * s, v[2] * s], color, 0.18 + Math.random() * 0.22, 0.07 + Math.random() * 0.05, { grav: 12, drag: 1 });
    }
  }

  tracer(a, b, amp = 1) {
    const i = this.tNext; this.tNext = (this.tNext + 1) % this.maxTracers;
    this.tPos.set(a, i * 6); this.tPos.set(b, i * 6 + 3);
    this.tLife[i] = 0.08; this.tAmp[i] = amp;
  }

  muzzleFlash(p, size = 0.6) {
    const f = this.flashes[this.flashNext]; this.flashNext = (this.flashNext + 1) % this.flashes.length;
    f.obj.position.set(p[0], p[1], p[2]); f.obj.scale.setScalar(size); f.obj.visible = true; f.life = 0.05;
    if (Math.random() < 0.5) this.smoke(p, [0, 0.4, 0], '#cfcac2', 0.6, 0.25 * size, 2.5, 0.25);
  }
  // first-person muzzle smoke, spawned at the world-space muzzle
  muzzleSmoke(p, dir, heavy = false) {
    const n = heavy ? 3 : 1;
    for (let i = 0; i < n; i++) this.smoke([p[0] + dir[0] * 0.15 * i, p[1] + dir[1] * 0.15 * i, p[2] + dir[2] * 0.15 * i], [dir[0] * 0.8 + (Math.random() - 0.5) * 0.3, 0.35 + Math.random() * 0.2, dir[2] * 0.8 + (Math.random() - 0.5) * 0.3], '#d9d4cc', 0.5 + Math.random() * 0.4, heavy ? 0.16 : 0.1, 3, heavy ? 0.32 : 0.2);
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

  // Bullet hitting the world: chips in the surface colour, a puff of dust, sparks off metal.
  impact(p, normal, mat = null, scale = 1) {
    const col = typeof mat === 'string' && mat.startsWith('#') ? mat : debrisColor(mat);
    const soft = isSoft(mat);
    const metal = mat === 'metal' || mat === 'steel' || mat === 'dark' || mat === 'truckRed' || mat === 'blueTrim' || mat === 'carBlue' || mat === 'carYellow';
    this.burst(p, Math.round((soft ? 4 : 7) * scale), col, 2.8, 0.45, normal, 9, 0.06);
    const n = normal || [0, 1, 0];
    this.smoke([p[0] + n[0] * 0.05, p[1] + n[1] * 0.05, p[2] + n[2] * 0.05], [n[0] * 0.9, n[1] * 0.9 + 0.2, n[2] * 0.9], _c.set(col).lerp(new THREE.Color('#ffffff'), 0.45).getStyle(), 0.7 * scale, soft ? 0.3 : 0.18, 2.5, soft ? 0.55 : 0.4);
    if (metal || (!soft && Math.random() < 0.25)) this.sparks(p, Math.round((metal ? 6 : 2) * scale), normal);
  }
  blood(p, color) {
    this.burst(p, 9, '#b3121c', 3, 0.45, null, 7, 0.07);
    this.burst(p, 4, color, 2.4, 0.35, null, 6, 0.05);
    this.smoke(p, [0, 0.2, 0], '#8a1018', 0.45, 0.22, 2, 0.45);
  }
  // footfall / landing / slide dust
  dust(p, color = '#cbbf9f', n = 6, speed = 1.6, size = 0.28) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke([p[0] + Math.cos(a) * 0.25, p[1] + 0.08, p[2] + Math.sin(a) * 0.25], [Math.cos(a) * speed, 0.3 + Math.random() * 0.4, Math.sin(a) * speed], color, 0.6 + Math.random() * 0.4, size, 2.2, 0.35);
    }
  }
  trail(p, color) { this.glow.add(p, [(Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4], color, 0.35, 0.12, { grav: 0, drag: 2 }); }

  explosion(p, big = false) {
    const b = this.booms[this.boomNext]; this.boomNext = (this.boomNext + 1) % this.booms.length;
    b.obj.position.set(p[0], p[1], p[2]); b.obj.visible = true; b.life = b.max; b.big = big;
    const K = big ? 2.4 : 1;
    // fireball core + embers
    for (let i = 0; i < 26 * K; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = (3 + Math.random() * 6) * K, r = Math.sqrt(1 - u * u);
      this.glow.add(p, [Math.cos(a) * r * s, Math.abs(u) * s * 0.8 + 1, Math.sin(a) * r * s], i % 3 ? '#ff8a2a' : '#ffd36b', 0.35 + Math.random() * 0.35, (0.35 + Math.random() * 0.4) * K, { grav: -1, drag: 3.2 });
    }
    this.sparks(p, Math.round(34 * K), [0, 1, 0], '#ffb347', 10 * K);
    // smoke column
    for (let i = 0; i < 16 * K; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * 1.2 * K;
      this.smokeSys.add([p[0] + Math.cos(a) * rr, p[1] + Math.random() * 0.8, p[2] + Math.sin(a) * rr], [Math.cos(a) * 1.4, 1.4 + Math.random() * 2.2, Math.sin(a) * 1.4], i % 2 ? '#3e3b39' : '#5b5652', 1.6 + Math.random() * 1.4 * K, (0.9 + Math.random() * 0.7) * K, { grav: -0.6, drag: 1.1, grow: 2.2, alpha: 0.55 });
    }
    this.burst(p, Math.round(24 * K), '#2e2a26', 7 * K, 0.9, [0, 1, 0], 12, 0.09);
    // shock ring on the ground + scorch mark
    const r = this.rings[this.ringNext]; this.ringNext = (this.ringNext + 1) % this.rings.length;
    r.obj.material.color.set('#ffcf8a'); r.obj.position.set(p[0], p[1] + 0.15, p[2]); r.obj.visible = true; r.life = r.max = 0.35; r.grow = big ? 16 : 7;
    this.hole([p[0], p[1] - 0.25, p[2]], [0, 1, 0], big ? 26 : 11);
    this.light.position.set(p[0], p[1] + 0.5, p[2]);
    this.light.intensity = big ? 140 : 60; this.lightTime = big ? 0.5 : 0.25; this.lightMax = this.light.intensity;
  }

  ring(p, color = '#7ff8ff', particles = true) {
    const r = this.rings[this.ringNext]; this.ringNext = (this.ringNext + 1) % this.rings.length;
    r.obj.material.color.set(color);
    r.obj.position.set(p[0], p[1], p[2]); r.obj.visible = true; r.life = r.max = 0.45; r.grow = 2.5;
    if (particles) for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 3;
      this.glow.add(p, [Math.cos(a) * s, (Math.random() - 0.3) * 3, Math.sin(a) * s], color, 0.4 + Math.random() * 0.25, 0.12, { grav: 0, drag: 2.5 });
    }
  }

  // ---- ambience around the camera: falling leaves, motes in the sun, blowing sand
  _ambient(dt, cam) {
    if (!this.ambientKind || !cam) return;
    this.ambientAcc += dt;
    const rate = this.ambientKind === 'sand' ? 0.05 : 0.09;
    while (this.ambientAcc > rate) {
      this.ambientAcc -= rate;
      const a = Math.random() * Math.PI * 2, d = 4 + Math.random() * 22;
      const x = cam.x + Math.cos(a) * d, z = cam.z + Math.sin(a) * d;
      if (this.ambientKind === 'leaves') {
        if (Math.random() < 0.55) {
          const leaf = ['#c9862e', '#d9a13a', '#9fb94a', '#b8582c'][Math.floor(Math.random() * 4)];
          this.solid.add([x, cam.y + 4 + Math.random() * 6, z], [0.6 + Math.random() * 0.6, -0.9 - Math.random() * 0.4, (Math.random() - 0.5) * 0.6], leaf, 7, 0.11, { grav: 0, drag: 0 });
        } else this.glow.add([x, cam.y - 1 + Math.random() * 4, z], [(Math.random() - 0.5) * 0.15, 0.05, (Math.random() - 0.5) * 0.15], '#fff3c4', 4, 0.05, { grav: 0, drag: 0, alpha: 0.5 });
      } else if (this.ambientKind === 'motes') {
        // dust hanging in the light shafts of an indoor hall
        this.glow.add([cam.x + Math.cos(a) * d * 0.6, 0.5 + Math.random() * 7, cam.z + Math.sin(a) * d * 0.6], [(Math.random() - 0.5) * 0.12, 0.04, (Math.random() - 0.5) * 0.12], '#fff1cf', 6, 0.045, { grav: 0, drag: 0, alpha: 0.45 });
      } else if (this.ambientKind === 'sand') {
        this.smokeSys.add([x, 0.15 + Math.random() * 0.6, z], [1.6 + Math.random() * 1.2, 0.05, 0.3 + Math.random() * 0.4], '#e6cf9c', 2.6, 0.5 + Math.random() * 0.5, { grav: 0, drag: 0.2, grow: 1.6, alpha: 0.22 });
        if (Math.random() < 0.3) this.solid.add([x, 0.2 + Math.random() * 1.5, z], [2.2 + Math.random(), 0.1, 0.4], '#d8bd84', 2.5, 0.035, { grav: 0.2, drag: 0 });
      }
    }
  }

  update(dt, cam = null) {
    // tracers
    let anyT = false;
    for (let i = 0; i < this.maxTracers; i++) {
      if (this.tLife[i] <= 0) continue;
      this.tLife[i] -= dt;
      const k = Math.max(0, this.tLife[i] / 0.08) * this.tAmp[i];
      const o = i * 6;
      this.tCol[o] = 0.45 * k; this.tCol[o + 1] = 0.38 * k; this.tCol[o + 2] = 0.22 * k;      // muzzle end: dim
      this.tCol[o + 3] = 1 * k; this.tCol[o + 4] = 0.95 * k; this.tCol[o + 5] = 0.72 * k;    // far end: hot
      if (this.tLife[i] <= 0) for (let j = 0; j < 6; j++) this.tCol[o + j] = 0;
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
      b.obj.scale.setScalar((1 + (1 - k) * 3.5) * (b.big ? 2.2 : 1)); b.obj.material.opacity = k * 0.85;
      if (b.life <= 0) b.obj.visible = false;
    }
    for (const r of this.rings) if (r.life > 0) {
      r.life -= dt; const k = Math.max(0, r.life / r.max);
      r.obj.scale.setScalar(1 + (1 - k) * r.grow); r.obj.material.opacity = k;
      if (r.life <= 0) r.obj.visible = false;
    }
    this._ambient(dt, cam);
    this.solid.update(dt); this.smokeSys.update(dt); this.glow.update(dt);
    if (this.lightTime > 0) { this.lightTime -= dt; this.light.intensity = Math.max(0, this.lightTime / (this.lightMax > 60 ? 0.5 : 0.25)) * (this.lightMax || 60); }
    this.cloudSpin = (this.cloudSpin || 0) + dt * 0.004;
    this.clouds.rotation.y = this.cloudSpin;
    if (cam) { this.clouds.position.set(cam.x * 0.5, 0, cam.z * 0.5); }
  }

  // keep point sizes right when the window resizes
  setViewport(h, fovDeg) {
    const s = h / (2 * Math.tan((fovDeg * Math.PI / 180) / 2));
    for (const p of [this.solid, this.smokeSys, this.glow]) p.points.material.uniforms.scale.value = s;
  }
}
