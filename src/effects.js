// Lightweight visual effects: tracers, sparks, explosions, flashes.
import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    // particle system: one Points object with a fixed pool
    this.max = 1500;
    this.pPos = new Float32Array(this.max * 3);
    this.pCol = new Float32Array(this.max * 3);
    this.pVel = new Float32Array(this.max * 3);
    this.pLife = new Float32Array(this.max);
    this.pMaxLife = new Float32Array(this.max);
    this.pGrav = new Float32Array(this.max);
    this.pNext = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    const dot = document.createElement('canvas'); dot.width = dot.height = 32;
    const dg = dot.getContext('2d'); dg.fillStyle = '#fff'; dg.beginPath(); dg.arc(16, 16, 14, 0, Math.PI * 2); dg.fill();
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, depthWrite: false, map: new THREE.CanvasTexture(dot), alphaTest: 0.5 }));
    this.points.frustumCulled = false;
    for (let i = 0; i < this.max; i++) this.pPos[i * 3 + 1] = -999;
    scene.add(this.points);
    this.tracerMat = new THREE.LineBasicMaterial({ color: '#fff1b0', transparent: true, opacity: 0.9 });
    this.flashTex = this._flashTexture();
    this.flashMat = new THREE.SpriteMaterial({ map: this.flashTex, color: '#ffd98a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.boomMat = new THREE.MeshBasicMaterial({ color: '#ffb04a', transparent: true, opacity: 0.9, depthWrite: false });
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#7ff8ff', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    this.light = new THREE.PointLight('#ffb050', 0, 14, 2);
    scene.add(this.light);
    this.lightTime = 0;
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
    const c = new THREE.Color(color);
    this.pCol[i * 3] = c.r; this.pCol[i * 3 + 1] = c.g; this.pCol[i * 3 + 2] = c.b;
    this.pLife[i] = life; this.pMaxLife[i] = life; this.pGrav[i] = grav;
  }

  burst(p, n, color, speed = 3, life = 0.5, normal = null, grav = 9) {
    for (let k = 0; k < n; k++) {
      let v = [(Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2];
      if (normal) { v[0] += normal[0] * 1.5; v[1] += normal[1] * 1.5; v[2] += normal[2] * 1.5; }
      const s = speed * (0.4 + Math.random() * 0.8);
      this.particle(p, [v[0] * s, v[1] * s, v[2] * s], color, life * (0.6 + Math.random() * 0.6), grav);
    }
  }

  tracer(a, b) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
    const line = new THREE.Line(g, this.tracerMat.clone());
    this.scene.add(line);
    this.items.push({ obj: line, life: 0.07, max: 0.07, kind: 'tracer' });
  }

  muzzleFlash(p, size = 0.6) {
    const s = new THREE.Sprite(this.flashMat);
    s.position.set(...p); s.scale.setScalar(size);
    this.scene.add(s);
    this.items.push({ obj: s, life: 0.05, max: 0.05, kind: 'sprite' });
  }

  impact(p, normal, color = '#d8d0c0') {
    this.burst(p, 6, color, 2.5, 0.35, normal);
  }

  blood(p, color) {
    this.burst(p, 10, color, 3, 0.45, null, 6);
  }

  explosion(p) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), this.boomMat.clone());
    m.position.set(...p);
    this.scene.add(m);
    this.items.push({ obj: m, life: 0.4, max: 0.4, kind: 'boom' });
    this.burst(p, 70, '#ffb347', 9, 0.8, null, 4);
    this.burst(p, 40, '#555555', 4, 1.3, [0, 1, 0], -1);
    this.light.position.set(p[0], p[1] + 0.5, p[2]);
    this.light.intensity = 60; this.lightTime = 0.25;
  }

  ring(p, color = '#7ff8ff', particles = true) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 6, 24), this.ringMat.clone());
    m.material.color.set(color);
    m.position.set(...p); m.rotation.x = Math.PI / 2;
    this.scene.add(m);
    this.items.push({ obj: m, life: 0.45, max: 0.45, kind: 'ring' });
    if (particles) this.burst(p, 30, color, 4, 0.5, null, 0);
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const k = Math.max(0, it.life / it.max);
      if (it.kind === 'tracer') it.obj.material.opacity = k * 0.9;
      if (it.kind === 'boom') { it.obj.scale.setScalar(1 + (1 - k) * 3.5); it.obj.material.opacity = k * 0.85; }
      if (it.kind === 'ring') { it.obj.scale.setScalar(1 + (1 - k) * 2.5); it.obj.material.opacity = k; }
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        if (it.kind !== 'sprite') { it.obj.geometry.dispose(); it.obj.material.dispose(); }
        this.items.splice(i, 1);
      }
    }
    for (let i = 0; i < this.max; i++) {
      if (this.pLife[i] <= 0) continue;
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) { this.pPos[i * 3 + 1] = -999; continue; }
      this.pVel[i * 3 + 1] -= this.pGrav[i] * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt;
      this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    if (this.lightTime > 0) { this.lightTime -= dt; this.light.intensity = Math.max(0, this.lightTime / 0.25) * 60; }
  }
}
