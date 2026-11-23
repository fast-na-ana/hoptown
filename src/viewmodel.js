// First-person weapon models (original designs built from boxes), rendered in their own pass.
import * as THREE from 'three';

function m(color, opts = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3, ...opts }); }
function b(g, w, h, d, mat, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z); g.add(mesh); return mesh;
}

function buildRifle(accent) {
  const g = new THREE.Group();
  const dark = m('#22252b'), mid = m('#3a3f48'), acc = m(accent, { emissive: accent, emissiveIntensity: 0.35 });
  b(g, 0.07, 0.09, 0.62, dark, 0, 0, -0.1);           // receiver
  b(g, 0.035, 0.035, 0.3, mid, 0, 0.015, -0.55);       // barrel
  b(g, 0.075, 0.07, 0.26, mid, 0, -0.005, -0.38);      // handguard
  b(g, 0.078, 0.02, 0.24, acc, 0, 0.04, -0.38);        // accent rail
  b(g, 0.05, 0.14, 0.07, dark, 0, -0.1, -0.12);        // magazine
  b(g, 0.045, 0.11, 0.05, dark, 0, -0.08, 0.06);       // grip
  b(g, 0.06, 0.08, 0.2, mid, 0, -0.01, 0.27);          // stock
  b(g, 0.03, 0.04, 0.1, acc, 0, 0.065, -0.05);         // sight
  b(g, 0.008, 0.03, 0.01, acc, 0, 0.095, -0.05);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.015, -0.72); g.add(muzzle);
  // hands
  const skin = m('#4a505c', { metalness: 0 }), glove = m(accent, { metalness: 0 });
  b(g, 0.09, 0.08, 0.12, glove, 0.0, -0.09, 0.07);
  b(g, 0.09, 0.07, 0.12, glove, 0.0, -0.05, -0.4);
  b(g, 0.07, 0.07, 0.26, skin, 0.04, -0.13, 0.24).rotation.x = 0.4;
  b(g, 0.065, 0.065, 0.2, skin, -0.07, -0.1, -0.33).rotation.set(0.3, 0.6, 0);
  return { g, muzzle, mag: g.children[4], hipPos: new THREE.Vector3(0.15, -0.14, -0.33), adsPos: new THREE.Vector3(0, -0.062, -0.25) };
}

function buildPistol(accent) {
  const g = new THREE.Group();
  const dark = m('#22252b'), mid = m('#3a3f48'), acc = m(accent, { emissive: accent, emissiveIntensity: 0.35 });
  b(g, 0.05, 0.06, 0.24, mid, 0, 0.02, -0.08);         // slide
  b(g, 0.052, 0.01, 0.2, acc, 0, 0.055, -0.08);
  b(g, 0.045, 0.05, 0.2, dark, 0, -0.03, -0.07);       // frame
  b(g, 0.042, 0.13, 0.06, dark, 0, -0.1, 0.0);         // grip
  b(g, 0.012, 0.02, 0.012, acc, 0, 0.062, -0.18);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.02, -0.22); g.add(muzzle);
  const glove = m(accent, { metalness: 0 }), skin = m('#4a505c', { metalness: 0 });
  b(g, 0.07, 0.08, 0.09, glove, 0, -0.1, 0.02);
  b(g, 0.07, 0.07, 0.32, skin, 0.02, -0.15, 0.2).rotation.x = 0.4;
  return { g, muzzle, mag: g.children[3], hipPos: new THREE.Vector3(0.13, -0.125, -0.28), adsPos: new THREE.Vector3(0, -0.04, -0.34) };
}

export class ViewModel {
  constructor(accent = '#3ec1ff') {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight('#ddeeff', '#554433', 1.4));
    const dl = new THREE.DirectionalLight('#ffffff', 1.6); dl.position.set(1, 2, 1); this.scene.add(dl);
    this.holder = new THREE.Group(); this.holder.scale.setScalar(0.64); this.scene.add(this.holder);
    this.models = { rifle: buildRifle(accent), pistol: buildPistol(accent) };
    for (const k in this.models) { this.models[k].g.visible = false; this.holder.add(this.models[k].g); }
    this.current = 'rifle';
    this.models.rifle.g.visible = true;
    this.kick = 0; this.kickRot = 0; this.swayX = 0; this.swayY = 0; this.bob = 0;
    this.switchT = 0; this.reloadT = 0; this.reloadDur = 1; this.ads = 0;
    this.flash = new THREE.PointLight('#ffcc66', 0, 3); this.scene.add(this.flash);
    const fc = document.createElement('canvas'); fc.width = fc.height = 64;
    const fg = fc.getContext('2d'); const grd = fg.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,240,1)'); grd.addColorStop(0.35, 'rgba(255,200,90,0.85)'); grd.addColorStop(1, 'rgba(255,120,20,0)');
    fg.fillStyle = grd; fg.fillRect(0, 0, 64, 64);
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(fc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flashSprite.scale.setScalar(0.18); this.flashSprite.visible = false;
    this.scene.add(this.flashSprite);
    this.flashT = 0;
  }

  setWeapon(id) {
    if (id === this.current) return;
    this.models[this.current].g.visible = false;
    this.current = id;
    this.models[id].g.visible = true;
    this.switchT = 0.25;
  }

  fire(weapon) {
    this.kick = weapon === 'rifle' ? 0.045 : 0.07;
    this.kickRot = weapon === 'rifle' ? 0.06 : 0.16;
    this.flashT = 0.045;
  }

  startReload(dur) { this.reloadT = dur; this.reloadDur = dur; }
  cancelReload() { this.reloadT = 0; }

  update(dt, { ads, speed, onGround, mouseDX, mouseDY, sliding, t }) {
    const model = this.models[this.current];
    this.ads += ((ads ? 1 : 0) - this.ads) * Math.min(1, dt * 14);
    this.kick += (0 - this.kick) * Math.min(1, dt * 18);
    this.kickRot += (0 - this.kickRot) * Math.min(1, dt * 14);
    this.swayX += (-mouseDX * 0.0006 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (mouseDY * 0.0006 - this.swayY) * Math.min(1, dt * 10);
    this.swayX = Math.max(-0.05, Math.min(0.05, this.swayX));
    this.swayY = Math.max(-0.05, Math.min(0.05, this.swayY));
    const moving = onGround && !sliding ? Math.min(1, speed / 7) : 0;
    this.bob += dt * (6 + speed * 0.9);
    const bobAmt = (1 - this.ads * 0.85) * moving;
    const pos = new THREE.Vector3().lerpVectors(model.hipPos, model.adsPos, this.ads);
    pos.x += Math.sin(this.bob) * 0.012 * bobAmt + this.swayX * (1 - this.ads * 0.7);
    pos.y += Math.abs(Math.cos(this.bob)) * 0.012 * bobAmt + this.swayY * (1 - this.ads * 0.7);
    pos.y += Math.sin(t * 1.6) * 0.003 * (1 - this.ads);
    pos.z += this.kick;
    if (!onGround) pos.y -= 0.015;
    if (sliding) { pos.x -= 0.03; pos.y -= 0.02; }
    let rotX = this.kickRot, rotZ = sliding ? 0.25 * (1 - this.ads) : 0;
    if (this.switchT > 0) { this.switchT -= dt; const k = Math.max(0, this.switchT / 0.25); pos.y -= k * 0.25; rotX -= k * 0.6; }
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      const k = 1 - Math.max(0, this.reloadT) / this.reloadDur;
      const dip = Math.sin(Math.min(1, k) * Math.PI);
      pos.y -= dip * 0.08; rotX -= dip * 0.35; rotZ += dip * 0.5;
      model.mag.position.y = (this.current === 'rifle' ? -0.1 : -0.1) - Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.15;
    } else model.mag.position.y = -0.1;
    this.holder.position.copy(pos);
    this.holder.rotation.set(rotX, 0, rotZ);
    // muzzle flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.holder.updateMatrixWorld(true);
      model.muzzle.getWorldPosition(this.flashSprite.position);
      this.flashSprite.visible = true; this.flashSprite.material.rotation = Math.random() * 6;
      this.flash.position.copy(this.flashSprite.position); this.flash.intensity = 4;
    } else { this.flashSprite.visible = false; this.flash.intensity = 0; }
  }

  setAspect(a) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }
}
