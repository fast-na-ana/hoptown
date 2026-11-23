// Original blocky "hop-bot" character with a procedural, direction-aware animation rig.
import * as THREE from 'three';

const shared = {};
function mat(color, emissive, extra = {}) {
  const k = color + (emissive || '') + JSON.stringify(extra);
  if (!shared[k]) shared[k] = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.1, emissive: emissive || '#000', emissiveIntensity: emissive ? 1.3 : 0, ...extra });
  return shared[k];
}
function box(parent, w, h, d, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh);
  return mesh;
}
function group(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
const lerp = (a, b, k) => a + (b - a) * k;

export function makeNameTag(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '700 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(240, g.measureText(text).width + 28);
  g.fillStyle = 'rgba(10,14,24,0.55)';
  g.beginPath(); g.roundRect ? g.roundRect(128 - w / 2, 12, w, 40, 10) : g.rect(128 - w / 2, 12, w, 40); g.fill();
  g.fillStyle = color; g.fillRect(128 - w / 2, 12, 5, 40);
  g.fillStyle = '#fff'; g.fillText(text, 128 + 3, 33);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
  s.scale.set(1.5, 0.375, 1);
  return s;
}

const POSE_KEYS = ['hipY', 'lean', 'side', 'twist', 'thL', 'thR', 'knL', 'knR', 'thLz', 'thRz'];

export class Avatar {
  constructor(color, name) {
    this.color = color;
    const suit = mat('#2a2f3a'), plate = mat(color), dark = mat('#14161b'), visor = mat('#0b0c10', color), joint = mat('#4b5262');
    this.root = new THREE.Group();
    this.body = group(this.root);                        // falls over on death
    this.hips = group(this.body, 0, 0.9, 0);
    box(this.hips, 0.42, 0.16, 0.26, suit, 0, 0.02, 0);
    // legs: thigh -> knee -> shin -> foot
    this.legs = [];
    for (const sx of [-1, 1]) {
      const th = group(this.hips, sx * 0.13, -0.04, 0);
      box(th, 0.17, 0.43, 0.2, suit, 0, -0.2, 0);
      box(th, 0.18, 0.14, 0.21, plate, 0, -0.12, -0.005);
      const kn = group(th, 0, -0.41, 0);
      box(kn, 0.12, 0.1, 0.12, joint, 0, 0, 0);
      box(kn, 0.15, 0.38, 0.17, suit, 0, -0.2, 0);
      box(kn, 0.16, 0.12, 0.05, plate, 0, -0.1, -0.09);
      box(kn, 0.17, 0.08, 0.28, dark, 0, -0.42, -0.05);
      this.legs.push({ th, kn });
    }
    // torso
    this.torso = group(this.hips, 0, 0.08, 0);
    box(this.torso, 0.5, 0.48, 0.3, suit, 0, 0.26, 0);
    box(this.torso, 0.46, 0.3, 0.06, plate, 0, 0.32, -0.16);      // chest plate
    box(this.torso, 0.34, 0.36, 0.14, dark, 0, 0.28, 0.21);       // backpack
    box(this.torso, 0.08, 0.2, 0.06, plate, 0.1, 0.32, 0.29);     // pack light
    for (const sx of [-1, 1]) box(this.torso, 0.16, 0.1, 0.32, plate, sx * 0.3, 0.48, 0); // shoulder pads
    this.head = group(this.torso, 0, 0.52, 0);
    box(this.head, 0.12, 0.08, 0.12, joint, 0, 0.03, 0);
    box(this.head, 0.36, 0.32, 0.36, suit, 0, 0.2, 0);
    box(this.head, 0.32, 0.11, 0.04, visor, 0, 0.22, -0.18);
    box(this.head, 0.38, 0.06, 0.38, plate, 0, 0.37, 0);
    box(this.head, 0.04, 0.16, 0.04, plate, 0.13, 0.46, 0.06);
    // arms (shoulder -> elbow), posed to hold the weapon
    this.arms = [];
    for (const sx of [-1, 1]) {
      const sh = group(this.torso, sx * 0.31, 0.42, 0);
      box(sh, 0.13, 0.3, 0.13, suit, 0, -0.14, 0);
      const el = group(sh, 0, -0.29, 0);
      box(el, 0.12, 0.28, 0.12, suit, 0, -0.13, 0);
      box(el, 0.14, 0.1, 0.14, plate, 0, -0.06, 0);
      box(el, 0.11, 0.1, 0.12, dark, 0, -0.29, 0);
      this.arms.push({ sh, el });
    }
    // weapon pivot at chest
    this.gunPivot = group(this.torso, 0.05, 0.3, -0.18);
    this.rifle = group(this.gunPivot);
    box(this.rifle, 0.07, 0.11, 0.62, dark, 0, 0, -0.22);
    box(this.rifle, 0.075, 0.03, 0.3, plate, 0, -0.02, -0.38);
    box(this.rifle, 0.05, 0.14, 0.08, dark, 0, -0.11, -0.12);
    box(this.rifle, 0.05, 0.05, 0.06, dark, 0, 0.08, -0.1);
    this.pistol = group(this.gunPivot);
    box(this.pistol, 0.05, 0.08, 0.24, dark, 0, 0, -0.26);
    box(this.pistol, 0.052, 0.02, 0.18, plate, 0, 0.045, -0.26);
    this.knife = group(this.gunPivot);
    box(this.knife, 0.025, 0.04, 0.12, dark, 0.12, -0.05, -0.18);
    box(this.knife, 0.012, 0.05, 0.22, mat('#c9d1db', null, { metalness: 0.9, roughness: 0.2 }), 0.12, -0.04, -0.34);
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0.02, -0.56); this.gunPivot.add(this.muzzle);

    this.tag = makeNameTag(name, color);
    this.tag.position.y = 2.2;
    this.root.add(this.tag);

    this.phase = 0;
    this.pose = Object.fromEntries(POSE_KEYS.map(k => [k, 0]));
    this.pose.hipY = 0.9;
    this.kick = 0; this.meleeT = 0;
    this.dead = false; this.deathT = 0; this.weapon = 'rifle';
  }

  setName(name, color) {
    this.root.remove(this.tag);
    this.tag.material.map.dispose(); this.tag.material.dispose();
    this.tag = makeNameTag(name, color); this.tag.position.y = 2.2; this.root.add(this.tag);
  }

  shoot() { this.kick = 1; }
  melee() { this.meleeT = 0.32; }

  // st: {pos, yaw, pitch, vel, crouched, airborne, sliding, alive, weapon}
  update(dt, st) {
    // ---- death / respawn
    if (!st.alive) {
      if (!this.dead) { this.dead = true; this.deathT = 0; this.fallDir = Math.random() < 0.5 ? 1 : -1; }
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.45);
      const e = k * k;
      this.body.rotation.x = this.fallDir * e * 1.45;
      this.body.position.y = -e * 0.15;
      this.tag.visible = false;
      this.root.visible = this.deathT < 1.6;
      return;
    }
    if (this.dead) { this.dead = false; this.body.rotation.set(0, 0, 0); this.body.position.y = 0; this.tag.visible = true; }
    this.root.visible = true;
    this.root.position.set(st.pos[0], st.pos[1], st.pos[2]);
    this.root.rotation.y = st.yaw;

    // ---- locomotion values in the character's frame
    const sy = Math.sin(st.yaw), cy = Math.cos(st.yaw);
    const fwd = st.vel[0] * -sy + st.vel[2] * -cy;
    const side = st.vel[0] * cy + st.vel[2] * -sy;
    const speed = Math.hypot(st.vel[0], st.vel[2]);
    const amp = Math.min(1, speed / 6.5);
    const stride = st.crouched ? 0.9 : 1.5;
    if (!st.airborne && !st.sliding) this.phase += (speed * dt / stride) * Math.PI;
    const ph = this.phase;
    const fr = speed > 0.3 ? fwd / speed : 1, sr = speed > 0.3 ? side / speed : 0;
    const dirSign = fr >= -0.2 ? 1 : -1;

    // ---- target pose
    const T = {};
    const swing = Math.sin(ph) * 0.75 * amp;
    if (st.sliding) {
      Object.assign(T, { hipY: 0.46, lean: 0.38, side: 0, twist: 0.15, thL: 1.35, knL: -0.2, thR: 0.35, knR: -1.75, thLz: 0, thRz: 0 });
    } else if (st.airborne) {
      Object.assign(T, { hipY: 0.92, lean: -0.08, side: -sr * 0.1, twist: 0, thL: 0.95, knL: -1.3, thR: -0.25, knR: -0.5, thLz: 0, thRz: 0 });
    } else if (st.crouched) {
      Object.assign(T, {
        hipY: 0.42 - Math.abs(Math.cos(ph)) * 0.02 * amp, lean: -0.28, side: -sr * 0.08, twist: Math.sin(ph) * 0.06 * amp,
        thL: 1.35 + swing * 0.5 * fr, thR: 1.35 - swing * 0.5 * fr, knL: -2.1 + Math.max(0, Math.sin(ph)) * 0.4 * amp, knR: -2.1 + Math.max(0, -Math.sin(ph)) * 0.4 * amp,
        thLz: swing * 0.25 * sr, thRz: -swing * 0.25 * sr,
      });
    } else {
      const bob = Math.abs(Math.cos(ph)) * 0.06 * amp;
      Object.assign(T, {
        hipY: 0.9 - bob + 0.02, lean: -fwd * 0.022, side: -side * 0.02, twist: Math.sin(ph) * 0.14 * amp * dirSign,
        thL: swing * fr, thR: -swing * fr,
        knL: -(0.1 + Math.max(0, Math.sin(ph + 1.2)) * 1.1) * amp, knR: -(0.1 + Math.max(0, Math.sin(ph + 1.2 + Math.PI)) * 1.1) * amp,
        thLz: swing * 0.45 * sr - 0.02, thRz: -swing * 0.45 * sr + 0.02,
      });
    }
    const k = Math.min(1, dt * 14);
    for (const key of POSE_KEYS) this.pose[key] = lerp(this.pose[key], T[key], k);
    const P = this.pose;

    this.hips.position.y = P.hipY;
    this.hips.rotation.set(0, P.twist * 0.5, 0);
    const [L, R] = this.legs;
    L.th.rotation.set(P.thL, 0, P.thLz); L.kn.rotation.x = P.knL;
    R.th.rotation.set(P.thR, 0, P.thRz); R.kn.rotation.x = P.knR;
    this.torso.rotation.set(P.lean, -P.twist, P.side);
    this.head.rotation.x = Math.max(-0.6, Math.min(0.6, st.pitch * 0.5));

    // ---- weapon + arms follow aim pitch
    if (st.weapon !== this.weapon) this.weapon = st.weapon;
    this.rifle.visible = st.weapon === 'rifle';
    this.pistol.visible = st.weapon === 'pistol';
    this.knife.visible = st.weapon === 'knife' || this.meleeT > 0;
    if (this.meleeT > 0) { this.rifle.visible = false; this.pistol.visible = false; }
    this.kick = Math.max(0, this.kick - dt * 10);
    const aim = st.pitch - P.lean; // keep the gun on the aim line, compensating torso lean
    this.gunPivot.rotation.set(aim, 0, 0);
    this.gunPivot.position.z = -0.18 + this.kick * 0.06;
    const [AL, AR] = this.arms;
    let meleeSwing = 0;
    if (this.meleeT > 0) { this.meleeT -= dt; meleeSwing = Math.sin((1 - this.meleeT / 0.32) * Math.PI); }
    const armUp = 1.2 + aim;
    if (st.weapon === 'knife' || this.meleeT > 0) {
      AR.sh.rotation.set(0.5 + meleeSwing * 1.4 + Math.sin(ph) * -0.3 * amp, 0, -0.1 - meleeSwing * 0.5);
      AR.el.rotation.set(0.6 - meleeSwing * 0.4, 0, 0);
      AL.sh.rotation.set(Math.sin(ph) * 0.5 * amp, 0, 0.12); AL.el.rotation.set(0.3, 0, 0);
    } else {
      AR.sh.rotation.set(armUp, 0, -0.18);
      AR.el.rotation.set(0.45, 0, 0);
      AL.sh.rotation.set(armUp + 0.1, 0, 0.42);
      AL.el.rotation.set(0.75, 0, 0);
    }
    this.tag.position.y = 2.15 - (0.9 - P.hipY);
  }

  muzzleWorld(out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    return this.muzzle.getWorldPosition(out);
  }

  dispose(scene) {
    scene.remove(this.root);
    this.tag.material.map.dispose(); this.tag.material.dispose();
    this.root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  }
}
