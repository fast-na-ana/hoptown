// First-person weapons (original procedural designs) with spring-based animation.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeByMaterial } from './merge.js';
import { WEAPONS } from './config.js';

// ------------------------------------------------------------------ helpers
const mats = {};
function M(key, color, o = {}) {
  if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.2, ...o });
  return mats[key];
}
function box(parent, w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
}
function cylZ(parent, r, len, mat, x, y, z, seg = 12) {
  const g = new THREE.CylinderGeometry(r, r, len, seg); g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); parent.add(m); return m;
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

function palette(accent) {
  return {
    poly: M('poly', '#1b1e24', { roughness: 0.7, metalness: 0.05 }),
    metal: M('metal', '#3c434e', { roughness: 0.32, metalness: 0.75 }),
    dark: M('dark', '#0c0d10', { roughness: 0.9 }),
    grey: M('grey', '#7d8696', { roughness: 0.45, metalness: 0.5 }),
    accent: M('acc' + accent, accent, { emissive: accent, emissiveIntensity: 0.3, roughness: 0.4 }),
    glove: M('glove', '#262a31', { roughness: 0.85, metalness: 0 }),
    sleeve: M('sleeve', '#3d4757', { roughness: 0.9, metalness: 0 }),
    cuff: M('cuff' + accent, accent, { roughness: 0.6, metalness: 0, emissive: accent, emissiveIntensity: 0.15 }),
    lens: M('lens', '#7fd4ff', { transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2 }),
    dot: M('dot', '#ff3040', { emissive: '#ff2030', emissiveIntensity: 3 }),
    blade: M('blade', '#dfe6ee', { roughness: 0.22, metalness: 0.85 }),
    brass: M('brass', '#d9a441', { roughness: 0.3, metalness: 0.9 }),
    shell: M('shellRed', '#c8372d', { roughness: 0.5, metalness: 0.1 }),
    wood: M('gunWood', '#7a4a2a', { roughness: 0.6, metalness: 0.05 }),
  };
}

function arm(parent, P, hand, elbow) {
  const g = new THREE.Group();
  const a = new THREE.Vector3(...hand), b = new THREE.Vector3(...elbow);
  const len = a.distanceTo(b);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const fore = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.068, len), P.sleeve);
  fore.position.copy(mid); fore.lookAt(b); g.add(fore);
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.074, 0.03), P.cuff);
  cuff.position.copy(a.clone().lerp(b, 0.16)); cuff.lookAt(b); g.add(cuff);
  parent.add(g);
  return g;
}

// ------------------------------------------------------------------ rifle
function buildRifle(P) {
  const g = new THREE.Group();
  box(g, 0.074, 0.068, 0.34, P.metal, 0, 0.034, -0.06);              // upper receiver
  box(g, 0.068, 0.05, 0.25, P.poly, 0, -0.022, -0.03);               // lower receiver
  box(g, 0.002, 0.022, 0.05, P.dark, 0.038, 0.04, -0.04);            // ejection port
  box(g, 0.082, 0.074, 0.29, P.poly, 0, 0.03, -0.375);               // handguard
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) box(g, 0.004, 0.018, 0.035, P.dark, s * 0.041, 0.03, -0.29 - i * 0.055);
  box(g, 0.084, 0.012, 0.2, P.accent, 0, -0.002, -0.38);             // accent band
  cylZ(g, 0.013, 0.16, P.metal, 0, 0.032, -0.6);                     // barrel
  cylZ(g, 0.021, 0.065, P.dark, 0, 0.032, -0.69, 8);                 // muzzle brake
  for (const s of [-1, 1]) box(g, 0.006, 0.01, 0.03, P.grey, s * 0.02, 0.032, -0.69);
  box(g, 0.03, 0.012, 0.52, P.dark, 0, 0.076, -0.2);                 // top rail
  for (let i = 0; i < 18; i++) box(g, 0.034, 0.006, 0.01, P.metal, 0, 0.083, -0.43 + i * 0.027);
  // red-dot sight
  box(g, 0.042, 0.016, 0.075, P.poly, 0, 0.09, -0.05);
  box(g, 0.008, 0.044, 0.05, P.poly, -0.024, 0.12, -0.05);
  box(g, 0.008, 0.044, 0.05, P.poly, 0.024, 0.12, -0.05);
  box(g, 0.056, 0.008, 0.05, P.poly, 0, 0.145, -0.05);
  box(g, 0.04, 0.036, 0.002, P.lens, 0, 0.121, -0.04);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 6, 6), P.dot); dot.position.set(0, 0.121, -0.041); g.add(dot);
  box(g, 0.056, 0.004, 0.05, P.accent, 0, 0.15, -0.05);
  // magazine (curved)
  const mag = new THREE.Group(); g.add(mag);
  box(mag, 0.044, 0.1, 0.072, P.poly, 0, -0.09, -0.1, 0.12);
  box(mag, 0.044, 0.08, 0.068, P.poly, 0, -0.17, -0.086, 0.32);
  box(mag, 0.046, 0.012, 0.072, P.accent, 0, -0.21, -0.072, 0.32);
  box(g, 0.058, 0.03, 0.085, P.poly, 0, -0.045, -0.1);                // mag well
  box(g, 0.044, 0.11, 0.05, P.poly, 0, -0.09, 0.06, -0.3);           // pistol grip
  box(g, 0.008, 0.006, 0.07, P.metal, 0, -0.062, -0.01);             // trigger guard
  box(g, 0.006, 0.024, 0.008, P.metal, 0, -0.05, 0.0, -0.2);         // trigger
  cylZ(g, 0.016, 0.11, P.metal, 0, 0.03, 0.18);                      // buffer tube
  box(g, 0.054, 0.085, 0.13, P.poly, 0, 0.012, 0.28);                // stock
  box(g, 0.05, 0.02, 0.1, P.poly, 0, 0.064, 0.27);                   // cheek rest
  box(g, 0.058, 0.096, 0.022, P.accent, 0, 0.01, 0.35);              // butt pad
  box(g, 0.03, 0.07, 0.035, P.poly, 0, -0.035, -0.4);                // foregrip
  const charge = box(g, 0.034, 0.012, 0.022, P.grey, 0, 0.07, 0.1);  // charging handle
  charge.userData.keep = true;
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.032, -0.73); g.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.set(0.04, 0.04, -0.04); g.add(eject);
  const right = new THREE.Group(); g.add(right);
  box(right, 0.062, 0.075, 0.075, P.glove, 0.002, -0.095, 0.065, -0.3);
  box(right, 0.066, 0.022, 0.06, P.glove, 0.004, -0.06, 0.025, 0.2);
  arm(right, P, [0.01, -0.12, 0.1], [0.07, -0.22, 0.42]);
  const left = new THREE.Group(); g.add(left);
  box(left, 0.06, 0.06, 0.075, P.glove, -0.008, -0.06, -0.4);
  box(left, 0.07, 0.02, 0.06, P.glove, -0.01, -0.005, -0.38, 0, 0, -0.5);
  arm(left, P, [-0.02, -0.08, -0.38], [-0.16, -0.22, -0.12]);
  return {
    g, muzzle, eject, mag, charge, left, slide: null,
    hip: new THREE.Vector3(0.14, -0.13, -0.32), ads: new THREE.Vector3(0, -0.0775, -0.22), scale: 0.64,
  };
}

// ------------------------------------------------------------------ sniper
function buildSniper(P) {
  const g = new THREE.Group();
  box(g, 0.07, 0.072, 0.46, P.metal, 0, 0.03, -0.04);                 // receiver
  box(g, 0.072, 0.02, 0.4, P.accent, 0, -0.012, -0.06);                // accent chassis line
  box(g, 0.078, 0.07, 0.3, P.poly, 0, 0.025, -0.36);                   // handguard
  for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) box(g, 0.004, 0.02, 0.03, P.dark, sd * 0.039, 0.03, -0.25 - i * 0.05);
  cylZ(g, 0.012, 0.5, P.metal, 0, 0.03, -0.72);                        // barrel
  for (let i = 0; i < 4; i++) box(g, 0.004, 0.004, 0.42, P.dark, Math.cos(i * 1.57) * 0.0115, 0.03 + Math.sin(i * 1.57) * 0.0115, -0.74);
  cylZ(g, 0.022, 0.09, P.dark, 0, 0.03, -1.0, 8);                      // muzzle brake
  for (const sd of [-1, 1]) box(g, 0.008, 0.012, 0.05, P.grey, sd * 0.021, 0.03, -1.0);
  // scope
  cylZ(g, 0.022, 0.34, P.poly, 0, 0.115, -0.08, 16);
  cylZ(g, 0.034, 0.09, P.poly, 0, 0.115, -0.29, 16);
  cylZ(g, 0.03, 0.07, P.poly, 0, 0.115, 0.12, 16);
  const lensF = cylZ(g, 0.03, 0.004, P.lens, 0, 0.115, -0.337, 16);
  const lensB = cylZ(g, 0.026, 0.004, P.lens, 0, 0.115, 0.157, 16);
  const tur = new THREE.CylinderGeometry(0.014, 0.014, 0.03, 10);
  const t1 = new THREE.Mesh(tur, P.accent); t1.position.set(0, 0.148, -0.08); g.add(t1);
  const t2 = new THREE.Mesh(tur, P.poly); t2.rotation.z = Math.PI / 2; t2.position.set(0.033, 0.115, -0.08); g.add(t2);
  for (const z of [-0.17, 0.02]) box(g, 0.05, 0.05, 0.03, P.dark, 0, 0.085, z);   // rings
  // magazine + grip + trigger
  const mag = new THREE.Group(); g.add(mag);
  box(mag, 0.05, 0.09, 0.09, P.poly, 0, -0.065, -0.07);
  box(mag, 0.052, 0.012, 0.092, P.accent, 0, -0.11, -0.07);
  box(g, 0.044, 0.11, 0.05, P.poly, 0, -0.08, 0.1, -0.3);
  box(g, 0.008, 0.006, 0.07, P.metal, 0, -0.04, 0.04);
  box(g, 0.006, 0.022, 0.008, P.metal, 0, -0.028, 0.05, -0.2);
  // skeleton stock
  box(g, 0.05, 0.03, 0.3, P.poly, 0, 0.04, 0.33);
  box(g, 0.05, 0.03, 0.26, P.poly, 0, -0.04, 0.35, 0.18);
  box(g, 0.054, 0.12, 0.03, P.accent, 0, 0.0, 0.49);
  box(g, 0.046, 0.025, 0.12, P.grey, 0, 0.066, 0.36);                  // cheek riser
  // folded bipod
  for (const sd of [-1, 1]) box(g, 0.01, 0.01, 0.2, P.metal, sd * 0.022, -0.02, -0.55);
  // bolt (pivots around the bore axis, slides back)
  const bolt = new THREE.Group(); bolt.position.set(0, 0.04, 0.1); g.add(bolt);
  box(bolt, 0.055, 0.012, 0.012, P.grey, 0.04, 0, 0);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), P.accent); knob.position.set(0.07, -0.004, 0.0); bolt.add(knob);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.03, -1.05); g.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.set(0.04, 0.05, 0.02); g.add(eject);
  const right = new THREE.Group(); g.add(right);
  box(right, 0.062, 0.075, 0.075, P.glove, 0.002, -0.085, 0.105, -0.3);
  arm(right, P, [0.01, -0.11, 0.14], [0.07, -0.22, 0.46]);
  const left = new THREE.Group(); g.add(left);
  box(left, 0.07, 0.05, 0.08, P.glove, 0, -0.025, -0.4);
  arm(left, P, [-0.02, -0.05, -0.4], [-0.16, -0.21, -0.14]);
  return {
    g, muzzle, eject, mag, charge: null, slide: null, left, bolt,
    hip: new THREE.Vector3(0.15, -0.13, -0.36), ads: new THREE.Vector3(0, -0.0736, -0.24), scale: 0.64,
  };
}

// ------------------------------------------------------------------ pistol
function buildPistol(P) {
  const g = new THREE.Group();
  const slide = new THREE.Group(); g.add(slide);
  box(slide, 0.042, 0.045, 0.215, P.metal, 0, 0.035, -0.06);
  box(slide, 0.044, 0.004, 0.15, P.accent, 0, 0.059, -0.07);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) box(slide, 0.003, 0.03, 0.006, P.dark, s * 0.022, 0.035, 0.02 + i * 0.011 - 0.03);
  box(slide, 0.002, 0.018, 0.04, P.dark, 0.022, 0.04, -0.05);         // ejection port
  box(slide, 0.006, 0.012, 0.008, P.dark, 0, 0.063, -0.155);           // front sight
  const fdot = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 6, 6), P.dot); fdot.position.set(0, 0.066, -0.151); slide.add(fdot);
  box(slide, 0.008, 0.012, 0.008, P.dark, -0.011, 0.063, 0.035);       // rear sight
  box(slide, 0.008, 0.012, 0.008, P.dark, 0.011, 0.063, 0.035);
  cylZ(g, 0.009, 0.02, P.dark, 0, 0.035, -0.17, 10);                   // barrel crown
  box(g, 0.04, 0.03, 0.19, P.poly, 0, 0.0, -0.055);                    // frame
  box(g, 0.036, 0.008, 0.06, P.dark, 0, -0.018, -0.12);                // rail
  box(g, 0.04, 0.125, 0.055, P.poly, 0, -0.072, 0.03, -0.24);         // grip
  for (let i = 0; i < 4; i++) box(g, 0.042, 0.006, 0.04, P.dark, 0, -0.04 - i * 0.022, 0.03 + i * 0.005, -0.24);
  const mag = new THREE.Group(); g.add(mag);
  box(mag, 0.03, 0.11, 0.04, P.metal, 0, -0.07, 0.03, -0.24);
  box(mag, 0.044, 0.014, 0.058, P.accent, 0, -0.135, 0.046, -0.24);
  box(g, 0.008, 0.006, 0.055, P.poly, 0, -0.03, -0.02);                // trigger guard
  box(g, 0.006, 0.022, 0.008, P.metal, 0, -0.02, -0.01, -0.2);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.035, -0.19); g.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.set(0.025, 0.045, -0.05); g.add(eject);
  const right = new THREE.Group(); g.add(right);
  box(right, 0.06, 0.08, 0.07, P.glove, 0.006, -0.075, 0.04, -0.24);
  arm(right, P, [0.01, -0.12, 0.07], [0.06, -0.22, 0.38]);
  const left = new THREE.Group(); g.add(left);
  box(left, 0.05, 0.075, 0.065, P.glove, -0.03, -0.08, 0.035, -0.24, 0, 0.15);
  arm(left, P, [-0.035, -0.12, 0.06], [-0.15, -0.23, 0.3]);
  return {
    g, muzzle, eject, mag, charge: null, slide, left,
    hip: new THREE.Vector3(0.13, -0.12, -0.3), ads: new THREE.Vector3(0, -0.0422, -0.33), scale: 0.64,
  };
}

// ------------------------------------------------------------------ SMG (Hornet)
function buildSmg(P) {
  const g = new THREE.Group();
  box(g, 0.07, 0.078, 0.3, P.metal, 0, 0.032, -0.1);                  // receiver
  box(g, 0.072, 0.03, 0.26, P.poly, 0, -0.022, -0.08);                // lower
  box(g, 0.074, 0.012, 0.17, P.accent, 0, 0.075, -0.11);             // top accent
  box(g, 0.002, 0.02, 0.045, P.dark, 0.036, 0.04, -0.07);            // ejection port
  box(g, 0.078, 0.062, 0.16, P.poly, 0, 0.03, -0.31);                // barrel shroud
  for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) box(g, 0.004, 0.026, 0.022, P.dark, sd * 0.04, 0.03, -0.26 - i * 0.042);
  cylZ(g, 0.012, 0.08, P.metal, 0, 0.034, -0.43);
  cylZ(g, 0.019, 0.05, P.dark, 0, 0.034, -0.48, 8);                  // compensator
  for (const sd of [-1, 1]) box(g, 0.006, 0.008, 0.026, P.grey, sd * 0.019, 0.034, -0.48);
  box(g, 0.036, 0.012, 0.05, P.poly, 0, 0.082, -0.06);               // sight base
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0045, 6, 16), P.poly); ring.position.set(0, 0.108, -0.06); g.add(ring);
  box(g, 0.034, 0.03, 0.0015, P.lens, 0, 0.108, -0.058);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 6, 6), P.dot); dot.position.set(0, 0.108, -0.059); g.add(dot);
  const mag = new THREE.Group(); g.add(mag);
  box(mag, 0.034, 0.15, 0.048, P.poly, 0, -0.1, -0.13, 0.06);
  box(mag, 0.037, 0.012, 0.052, P.accent, 0, -0.176, -0.125, 0.06);
  box(g, 0.05, 0.03, 0.062, P.poly, 0, -0.04, -0.13);               // mag well
  box(g, 0.042, 0.1, 0.048, P.poly, 0, -0.08, 0.025, -0.25);         // grip
  box(g, 0.008, 0.006, 0.06, P.metal, 0, -0.05, -0.04);             // guard
  box(g, 0.006, 0.022, 0.008, P.metal, 0, -0.04, -0.035, -0.2);
  box(g, 0.032, 0.075, 0.034, P.poly, 0, -0.035, -0.31);            // vertical foregrip
  for (const sd of [-1, 1]) box(g, 0.008, 0.008, 0.2, P.metal, sd * 0.021, 0.022, 0.14);  // wire stock
  box(g, 0.052, 0.072, 0.016, P.poly, 0, 0.012, 0.245);
  box(g, 0.054, 0.014, 0.018, P.accent, 0, 0.05, 0.245);
  const charge = box(g, 0.022, 0.014, 0.024, P.grey, -0.044, 0.058, -0.22);   // side charging handle
  charge.userData.keep = true;
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.034, -0.51); g.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.set(0.04, 0.045, -0.07); g.add(eject);
  const right = new THREE.Group(); g.add(right);
  box(right, 0.062, 0.075, 0.072, P.glove, 0.003, -0.085, 0.03, -0.25);
  box(right, 0.064, 0.02, 0.056, P.glove, 0.004, -0.052, -0.01, 0.2);
  arm(right, P, [0.01, -0.115, 0.07], [0.07, -0.22, 0.4]);
  const left = new THREE.Group(); g.add(left);
  box(left, 0.062, 0.07, 0.07, P.glove, -0.004, -0.05, -0.31);
  arm(left, P, [-0.02, -0.08, -0.3], [-0.16, -0.22, -0.06]);
  return { g, muzzle, eject, mag, charge, left, slide: null,
    hip: new THREE.Vector3(0.13, -0.125, -0.3), ads: new THREE.Vector3(0, -0.0691, -0.22), scale: 0.64 };
}

// ------------------------------------------------------------------ pump shotgun (Breacher-8)
function buildShotgun(P) {
  const g = new THREE.Group();
  box(g, 0.068, 0.086, 0.3, P.metal, 0, 0.032, -0.02);                // receiver
  box(g, 0.07, 0.016, 0.24, P.accent, 0, -0.006, -0.02);              // accent band
  box(g, 0.002, 0.03, 0.08, P.dark, 0.035, 0.045, -0.04);             // ejection port
  box(g, 0.04, 0.006, 0.07, P.dark, 0, -0.012, -0.06);                // loading port
  cylZ(g, 0.016, 0.6, P.metal, 0, 0.052, -0.46);                      // barrel
  box(g, 0.016, 0.008, 0.58, P.dark, 0, 0.072, -0.46);                // vent rib
  for (let i = 0; i < 10; i++) box(g, 0.018, 0.004, 0.006, P.grey, 0, 0.077, -0.2 - i * 0.055);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), P.dot); bead.position.set(0, 0.08, -0.75); g.add(bead);
  box(g, 0.03, 0.022, 0.012, P.dark, 0, 0.088, 0.1);                 // rear notch
  cylZ(g, 0.017, 0.48, P.poly, 0, 0.012, -0.42);                      // tube magazine
  cylZ(g, 0.021, 0.03, P.metal, 0, 0.012, -0.67, 10);                 // cap
  box(g, 0.046, 0.11, 0.054, P.wood, 0, -0.07, 0.11, -0.3);           // grip
  box(g, 0.048, 0.064, 0.2, P.wood, 0, 0.0, 0.22, 0.08);              // stock
  box(g, 0.05, 0.076, 0.02, P.dark, 0, -0.01, 0.325, 0.08);           // pad
  box(g, 0.008, 0.006, 0.07, P.metal, 0, -0.03, 0.03);
  box(g, 0.006, 0.022, 0.008, P.metal, 0, -0.02, 0.04, -0.2);
  const pump = new THREE.Group(); g.add(pump);
  box(pump, 0.068, 0.056, 0.18, P.wood, 0, 0.008, -0.4);
  for (let i = 0; i < 5; i++) box(pump, 0.07, 0.006, 0.012, P.dark, 0, 0.008 + (i % 2 ? 0.02 : -0.02), -0.34 - i * 0.03);
  const left = new THREE.Group(); pump.add(left);
  box(left, 0.064, 0.06, 0.08, P.glove, -0.006, -0.03, -0.4);
  box(left, 0.07, 0.02, 0.06, P.glove, -0.01, 0.02, -0.39, 0, 0, -0.5);
  arm(left, P, [-0.02, -0.06, -0.38], [-0.16, -0.22, -0.1]);
  const hshell = new THREE.Group(); left.add(hshell); hshell.position.set(0.0, -0.01, -0.4);
  cylZ(hshell, 0.011, 0.05, P.shell, 0, 0, 0.0, 8); cylZ(hshell, 0.0115, 0.014, P.brass, 0, 0, 0.03, 8);
  hshell.visible = false; hshell.userData.keep = true;
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.052, -0.78); g.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.set(0.04, 0.05, -0.04); g.add(eject);
  const right = new THREE.Group(); g.add(right);
  box(right, 0.062, 0.075, 0.075, P.glove, 0.002, -0.08, 0.115, -0.3);
  arm(right, P, [0.01, -0.11, 0.15], [0.07, -0.22, 0.46]);
  return { g, muzzle, eject, mag: null, charge: null, slide: null, left, pump, hshell, shellMat: 'shell',
    hip: new THREE.Vector3(0.15, -0.13, -0.37), ads: new THREE.Vector3(0, -0.0512, -0.27), scale: 0.64 };
}

// ------------------------------------------------------------------ hand cannon (Hammer .50)
function buildHcannon(P) {
  const g = new THREE.Group();
  const slide = new THREE.Group(); g.add(slide);
  box(slide, 0.05, 0.058, 0.27, P.metal, 0, 0.04, -0.08);
  box(slide, 0.034, 0.006, 0.2, P.accent, 0, 0.071, -0.1);
  for (let i = 0; i < 3; i++) box(slide, 0.02, 0.004, 0.014, P.dark, 0, 0.072, -0.19 + i * 0.02);   // top ports
  for (let i = 0; i < 7; i++) for (const sd of [-1, 1]) box(slide, 0.003, 0.036, 0.006, P.dark, sd * 0.026, 0.04, 0.02 + i * 0.011 - 0.03);
  box(slide, 0.002, 0.022, 0.05, P.dark, 0.026, 0.046, -0.06);        // ejection port
  box(slide, 0.008, 0.016, 0.01, P.dark, 0, 0.076, -0.2);              // front sight
  const fdot = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 6, 6), P.dot); fdot.position.set(0, 0.08, -0.196); slide.add(fdot);
  box(slide, 0.009, 0.016, 0.01, P.dark, -0.013, 0.076, 0.045); box(slide, 0.009, 0.016, 0.01, P.dark, 0.013, 0.076, 0.045);
  cylZ(g, 0.012, 0.02, P.dark, 0, 0.04, -0.222, 10);
  box(g, 0.048, 0.036, 0.25, P.poly, 0, -0.002, -0.08);               // frame
  box(g, 0.044, 0.01, 0.08, P.dark, 0, -0.024, -0.16);                // rail
  box(g, 0.052, 0.14, 0.064, P.poly, 0, -0.082, 0.03, -0.22);         // grip
  for (let i = 0; i < 5; i++) box(g, 0.054, 0.006, 0.048, P.dark, 0, -0.04 - i * 0.022, 0.03 + i * 0.005, -0.22);
  box(g, 0.014, 0.024, 0.014, P.grey, 0, 0.05, 0.068, 0.4);          // hammer
  const mag = new THREE.Group(); g.add(mag);
  box(mag, 0.038, 0.12, 0.046, P.metal, 0, -0.078, 0.03, -0.22);
  box(mag, 0.056, 0.016, 0.068, P.accent, 0, -0.15, 0.048, -0.22);
  box(g, 0.01, 0.006, 0.06, P.poly, 0, -0.034, -0.02);
  box(g, 0.006, 0.022, 0.008, P.metal, 0, -0.024, -0.012, -0.2);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.04, -0.24); g.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.set(0.028, 0.052, -0.06); g.add(eject);
  const right = new THREE.Group(); g.add(right);
  box(right, 0.064, 0.085, 0.074, P.glove, 0.006, -0.08, 0.04, -0.22);
  arm(right, P, [0.01, -0.125, 0.07], [0.06, -0.22, 0.38]);
  const left = new THREE.Group(); g.add(left);
  box(left, 0.054, 0.08, 0.068, P.glove, -0.034, -0.085, 0.035, -0.22, 0, 0.15);
  arm(left, P, [-0.04, -0.125, 0.06], [-0.15, -0.23, 0.3]);
  return { g, muzzle, eject, mag, charge: null, slide, left,
    hip: new THREE.Vector3(0.13, -0.12, -0.31), ads: new THREE.Vector3(0, -0.0512, -0.34), scale: 0.64 };
}

// ------------------------------------------------------------------ knife
function buildKnife(P) {
  const g = new THREE.Group();
  const knife = new THREE.Group(); g.add(knife);
  const s = new THREE.Shape();
  s.moveTo(0, -0.014); s.lineTo(0.15, -0.012); s.quadraticCurveTo(0.185, -0.006, 0.2, 0.012);
  s.lineTo(0.14, 0.016); s.lineTo(0.0, 0.016); s.lineTo(0, -0.014);
  const bg = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
  bg.translate(0, 0, -0.002);
  const blade = new THREE.Mesh(bg, P.blade);
  blade.rotation.y = Math.PI / 2;
  blade.position.set(0, 0, -0.05);
  knife.add(blade);
  box(knife, 0.007, 0.005, 0.1, P.dark, 0, 0.0, -0.11);               // fuller
  box(knife, 0.05, 0.014, 0.018, P.metal, 0, 0, -0.045);               // guard
  box(knife, 0.028, 0.034, 0.11, P.poly, 0, 0, 0.012);                 // handle
  for (let i = 0; i < 4; i++) box(knife, 0.03, 0.036, 0.006, P.accent, 0, 0, -0.025 + i * 0.024);
  box(knife, 0.032, 0.036, 0.018, P.metal, 0, 0, 0.074);               // pommel
  knife.rotation.set(0.25, 0, 0);
  const right = new THREE.Group(); g.add(right);
  box(right, 0.062, 0.07, 0.08, P.glove, 0.004, -0.006, 0.015);
  arm(right, P, [0.01, -0.03, 0.05], [0.08, -0.15, 0.36]);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.02, -0.2); g.add(muzzle);
  return { g, muzzle, eject: null, mag: null, charge: null, slide: null, left: null, knife,
    hip: new THREE.Vector3(0.17, -0.15, -0.3), ads: new THREE.Vector3(0.17, -0.15, -0.3), scale: 0.64 };
}

// ------------------------------------------------------------------ throw rig (off-hand + grenade / blink disc)
function buildThrowRig(P) {
  const g = new THREE.Group();
  box(g, 0.068, 0.074, 0.085, P.glove, 0, 0, 0);                          // fist
  box(g, 0.024, 0.03, 0.06, P.glove, 0.036, 0.03, -0.006, 0, 0, -0.3);    // thumb
  box(g, 0.072, 0.012, 0.07, P.glove, 0, 0.04, -0.012);                   // fingers wrapped over
  arm(g, P, [0, -0.03, 0.045], [-0.07, -0.21, 0.4]);
  const olive = M('nadeBody', '#3b4d2e', { roughness: 0.62, metalness: 0.1 });
  const ember = M('nadeBand', '#ff5a2a', { emissive: '#ff3b1f', emissiveIntensity: 0.9, roughness: 0.5 });
  const nade = new THREE.Group(); nade.position.set(0.004, 0.072, -0.018); g.add(nade);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.043, 14, 10), olive); body.scale.set(1, 1.18, 1); nade.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0445, 0.0445, 0.012, 16), ember); nade.add(band);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 0.024, 10), P.metal); cap.position.y = 0.056; nade.add(cap);
  box(nade, 0.012, 0.07, 0.007, P.metal, 0.03, 0.025, 0, 0, 0, 0.22);     // spoon
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.0028, 6, 14), P.metal);
  ring.position.set(-0.024, 0.066, 0); ring.rotation.y = Math.PI / 2; nade.add(ring);
  const disc = new THREE.Group(); disc.position.set(0.004, 0.05, -0.03); g.add(disc);
  const dm = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.014, 20), P.accent); dm.rotation.x = 0.35; disc.add(dm);
  const dc = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.017, 14), P.dark); dc.rotation.x = 0.35; disc.add(dc);
  g.visible = false;
  return { g, nade, disc };
}

// ------------------------------------------------------------------ spring
class Spring {
  constructor(k = 160, damp = 0.62) { this.k = k; this.c = 2 * Math.sqrt(k) * damp; this.x = new THREE.Vector3(); this.v = new THREE.Vector3(); }
  kick(x, y, z) { this.v.x += x; this.v.y += y; this.v.z += z; }
  update(dt) {
    const steps = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.v.x += (-this.k * this.x.x - this.c * this.v.x) * h;
      this.v.y += (-this.k * this.x.y - this.c * this.v.y) * h;
      this.v.z += (-this.k * this.x.z - this.c * this.v.z) * h;
      this.x.addScaledVector(this.v, h);
    }
  }
}

// ------------------------------------------------------------------ view model
export class ViewModel {
  constructor(accent = '#3ec1ff', renderer = null) {
    this.scene = new THREE.Scene();
    if (renderer) {
      try {
        const pm = new THREE.PMREMGenerator(renderer);
        this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
        this.scene.environmentIntensity = 0.55;
        pm.dispose();
      } catch (e) { console.warn('env map', e); }
    }
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight('#e6f0ff', '#4a3f35', 1.35));
    const key = new THREE.DirectionalLight('#fff4e0', 2.2); key.position.set(1.2, 2, 0.6); this.scene.add(key);
    const rim = new THREE.DirectionalLight('#9fd0ff', 1.0); rim.position.set(-1.5, 0.5, -1); this.scene.add(rim);
    const P = palette(accent);
    this.holder = new THREE.Group(); this.scene.add(this.holder);
    this.models = { rifle: buildRifle(P), sniper: buildSniper(P), pistol: buildPistol(P), knife: buildKnife(P), smg: buildSmg(P), shotgun: buildShotgun(P), hcannon: buildHcannon(P) };
    for (const k in this.models) {
      const m = this.models[k];
      mergeByMaterial(m.g);
      m.g.visible = false; m.g.scale.setScalar(m.scale); this.holder.add(m.g);
      if (m.mag) m.magHome = m.mag.position.clone();
      if (m.left) m.leftHome = m.left.position.clone();
      if (m.slide) m.slideHome = m.slide.position.clone();
      if (m.charge) m.chargeHome = m.charge.position.clone();
      if (m.bolt) m.boltHome = m.bolt.position.clone();
      if (m.pump) m.pumpHome = m.pump.position.clone();
      if (m.knife) m.knifeRot = m.knife.rotation.clone();
    }
    this.current = 'rifle'; this.models.rifle.g.visible = true;
    this.rig = buildThrowRig(P); this.rig.g.scale.setScalar(0.72); this.scene.add(this.rig.g);
    this.throwT = -1; this.throwDur = 0.36; this.throwRelease = 0.28;
    this.posSpring = new Spring(170, 0.6); this.rotSpring = new Spring(140, 0.55);
    this.moveSpring = new Spring(60, 0.7);
    this.swayX = 0; this.swayY = 0; this.bob = 0; this.bobAmt = 0; this.ads = 0;
    this.action = null; this.actionT = 0; this.actionDur = 0;
    this.slideKick = 0; this.time = 0; this.prevVy = 0;
    const fc = document.createElement('canvas'); fc.width = fc.height = 64;
    const fg = fc.getContext('2d'); const grd = fg.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,240,1)'); grd.addColorStop(0.3, 'rgba(255,210,110,0.85)'); grd.addColorStop(1, 'rgba(255,120,20,0)');
    fg.fillStyle = grd; fg.fillRect(0, 0, 64, 64);
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(fc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flashSprite.visible = false; this.scene.add(this.flashSprite);
    this.flash = new THREE.PointLight('#ffcc66', 0, 2.5); this.scene.add(this.flash);
    this.flashT = 0;
    this.shells = [];
    const sg = new THREE.CylinderGeometry(0.0035, 0.0035, 0.016, 6); sg.rotateZ(Math.PI / 2);
    this.brassMat = P.brass; this.shellRedMat = P.shell; this.flashSize = 0.16;
    for (let i = 0; i < 20; i++) { const m = new THREE.Mesh(sg, P.brass); m.visible = false; this.scene.add(m); this.shells.push({ m, v: new THREE.Vector3(), t: 0, spin: 0 }); }
    this.shellIdx = 0;
  }

  get busy() { return this.action === 'slash' || this.action === 'quick'; }

  _show(id) { for (const k in this.models) this.models[k].g.visible = k === id; }

  setWeapon(id, instant = false) {
    if (id === this.current && !instant) return;
    this.current = id; this._show(id);
    this._resetParts();
    if (!instant) this._start('equip', id === 'knife' ? 0.22 : 0.32); else this.action = null;
  }

  _resetParts() {
    for (const k in this.models) {
      const m = this.models[k];
      if (m.mag) { m.mag.position.copy(m.magHome); m.mag.visible = true; }
      if (m.left) { m.left.position.copy(m.leftHome); m.left.visible = true; }
      if (m.slide) m.slide.position.copy(m.slideHome);
      if (m.charge) m.charge.position.copy(m.chargeHome);
      if (m.bolt) { m.bolt.position.copy(m.boltHome); m.bolt.rotation.set(0, 0, 0); }
      if (m.pump) m.pump.position.copy(m.pumpHome);
      if (m.hshell) m.hshell.visible = false;
      if (m.knife) m.knife.rotation.copy(m.knifeRot);
    }
  }

  _start(action, dur) { this.action = action; this.actionT = 0; this.actionDur = dur; }

  fire(weapon) {
    if (this.action === 'inspect') { this.action = null; this._resetParts(); }
    // [up kick, back kick, pitch kick, flash time]
    const K = { pistol: [0.25, 0.9, 6, 0.045], hcannon: [0.55, 1.5, 13, 0.06], sniper: [0.4, 1.6, 9, 0.06], shotgun: [0.5, 2.0, 11, 0.07], smg: [0.08, 0.5, 1.8, 0.04], rifle: [0.12, 0.7, 2.6, 0.045] }[weapon] || [0.12, 0.7, 2.6, 0.045];
    const adsK = 1 - this.ads * 0.55;
    this.posSpring.kick((Math.random() - 0.5) * 0.06 * adsK, K[0] * adsK, K[1] * adsK);
    this.rotSpring.kick(K[2] * adsK, (Math.random() - 0.5) * 1.2 * adsK, (Math.random() - 0.5) * (weapon === 'hcannon' ? 4 : 1.6) * adsK);
    this.flashT = K[3]; this.flashSize = weapon === 'shotgun' || weapon === 'hcannon' ? 0.2 : weapon === 'smg' ? 0.12 : weapon === 'rifle' ? 0.16 : 0.11;
    if (weapon === 'pistol' || weapon === 'hcannon') this.slideKick = 0.06;
    if (weapon !== 'sniper' && weapon !== 'shotgun') this._ejectShell();
  }
  pump(dur) { if (this.current === 'shotgun') this._start('pump', dur); }
  inspect() {
    if (this.action || this.ads > 0.2) return;
    this._start('inspect', this.current === 'knife' ? 1.6 : 2.3);
  }

  _ejectShell(red = false) {
    const m = this.models[this.current];
    if (!m.eject) return;
    const s = this.shells[this.shellIdx]; this.shellIdx = (this.shellIdx + 1) % this.shells.length;
    s.m.material = red ? this.shellRedMat : this.brassMat;
    s.m.scale.setScalar(red ? 2.4 : this.current === 'hcannon' ? 1.4 : 1);
    this.holder.updateMatrixWorld(true);
    m.eject.getWorldPosition(s.m.position);
    s.v.set(0.9 + Math.random() * 0.5, 0.9 + Math.random() * 0.5, 0.2 + Math.random() * 0.2);
    s.t = 0.6; s.spin = 20 + Math.random() * 15; s.m.visible = true;
  }

  startReload(dur, shells = 0) { if (this.current !== 'knife') { this.reloadShells = shells; this._start('reload', dur); } }
  bolt(dur) { if (this.current === 'sniper') this._start('bolt', dur); }
  cancelReload() { if (this.action === 'reload' || this.action === 'inspect') { this.action = null; this._resetParts(); } }
  slash() { this._start('slash', 0.42); }
  // Off-hand flick; purely visual and runs alongside whatever the gun is doing.
  throwItem(kind = 'nade') {
    const blink = kind === 'blink';
    this.throwT = 0; this.throwDur = blink ? 0.3 : 0.36; this.throwRelease = blink ? 0.27 : 0.28;
    this.rig.nade.visible = !blink; this.rig.disc.visible = blink; this.rig.g.visible = true;
  }
  quickKnife() { this._show('knife'); this._start('quick', 0.5); }

  update(dt, { ads, speed, onGround, mouseDX, mouseDY, sliding, vy = 0 }) {
    dt = Math.max(0, dt);
    this.time += dt;
    const id = this.action === 'quick' ? 'knife' : this.current;
    const m = this.models[id];
    const canAds = id !== 'knife' && this.action !== 'reload';
    if (ads && this.action === 'inspect') { this.action = null; this._resetParts(); }
    this.ads += (((ads && canAds) ? 1 : 0) - this.ads) * Math.min(1, dt * 16);
    const A = this.ads;
    this.posSpring.update(dt); this.rotSpring.update(dt);

    const tx = Math.max(-0.035, Math.min(0.035, -mouseDX * 0.00045));
    const ty = Math.max(-0.035, Math.min(0.035, mouseDY * 0.00045));
    this.swayX += (tx - this.swayX) * Math.min(1, dt * 9);
    this.swayY += (ty - this.swayY) * Math.min(1, dt * 9);
    const dvy = vy - this.prevVy; this.prevVy = vy;
    if (Math.abs(dvy) < 30) this.moveSpring.kick(0, -dvy * 0.004, 0);
    this.moveSpring.update(dt);
    const moving = onGround && !sliding ? Math.min(1, speed / 7.6) : 0;
    this.bobAmt += (moving - this.bobAmt) * Math.min(1, dt * 8);
    this.bob += dt * (4 + speed * 1.05);
    const bk = this.bobAmt * (1 - A * 0.88);

    const pos = new THREE.Vector3().lerpVectors(m.hip, m.ads, A);
    let rx = 0, ry = 0, rz = 0;
    const swayK = 1 - A * 0.75;
    pos.x += Math.sin(this.bob) * 0.011 * bk + this.swayX * swayK;
    pos.y += -Math.abs(Math.cos(this.bob)) * 0.009 * bk + this.swayY * swayK + this.moveSpring.x.y;
    rz += Math.sin(this.bob) * 0.025 * bk;
    pos.y += Math.sin(this.time * 1.7) * 0.0025 * (1 - A);
    rx += Math.sin(this.time * 1.3) * 0.004 * (1 - A);
    pos.x += this.posSpring.x.x * 0.02; pos.y += this.posSpring.x.y * 0.02; pos.z += this.posSpring.x.z * 0.05;
    rx += this.rotSpring.x.x * 0.02; ry += this.rotSpring.x.y * 0.02; rz += this.rotSpring.x.z * 0.02;
    if (sliding) { pos.x -= 0.03 * (1 - A); pos.y -= 0.02; rz += 0.22 * (1 - A); }
    if (!onGround) pos.y -= 0.01;

    if (this.action) {
      this.actionT += dt;
      const t = this.actionT, D = this.actionDur, k = t / D;
      if (this.action === 'equip') {
        const e = easeOut(k);
        pos.y -= (1 - e) * 0.22; rx -= (1 - e) * 0.9; rz += (1 - e) * 0.3;
      } else if (this.action === 'reload') {
        this._reloadAnim(id, m, k, pos, (a, b, c) => { rx += a; ry += b; rz += c; });
      } else if (this.action === 'bolt' && m.bolt) {
        const up = smooth(0.12, 0.3, k) * (1 - smooth(0.78, 0.94, k));
        const back = smooth(0.3, 0.5, k) * (1 - smooth(0.56, 0.76, k));
        m.bolt.rotation.z = up * 1.15;
        m.bolt.position.z = m.boltHome.z + back * 0.09;
        rz += up * 0.12; rx += back * 0.04; pos.y -= up * 0.012;
        if (k > 0.5 && !this._shellOut) { this._shellOut = true; this._ejectShell(); }
        if (k < 0.5) this._shellOut = false;
      } else if (this.action === 'pump' && m.pump) {
        const back = smooth(0.08, 0.42, k) * (1 - smooth(0.5, 0.88, k));
        m.pump.position.z = m.pumpHome.z + back * 0.11;
        rx += back * 0.05; rz -= back * 0.06; pos.y -= back * 0.01;
        if (k > 0.4 && !this._shellOut) { this._shellOut = true; this._ejectShell(true); }
        if (k < 0.4) this._shellOut = false;
      } else if (this.action === 'inspect') {
        this._inspectAnim(id, m, k, pos, (a, b, c) => { rx += a; ry += b; rz += c; });
      } else if (this.action === 'slash' || this.action === 'quick') {
        const wind = smooth(0, 0.18, k), swing = smooth(0.18, 0.42, k), back = smooth(0.6, 1, k);
        const s = swing - back * swing;
        pos.x += wind * 0.06 - s * 0.2;
        pos.y += wind * 0.04 - s * 0.02;
        pos.z += -s * 0.08;
        ry += wind * 0.7 - s * 1.7;
        rz += -wind * 0.5 + s * 1.1;
        rx += wind * 0.2 - s * 0.3;
        if (this.action === 'quick') { const appear = smooth(0, 0.1, k) * (1 - smooth(0.85, 1, k)); pos.y -= (1 - appear) * 0.25; }
      }
      if (this.actionT >= D) {
        const was = this.action; this.action = null; this._resetParts();
        if (was === 'quick') { this._show(this.current); this._start('equip', 0.28); }
      }
    }
    if (this.throwT >= 0) {
      this.throwT += dt;
      const k = this.throwT / this.throwDur, R = this.rig;
      if (k >= 1) { this.throwT = -1; R.g.visible = false; if (m.left) m.left.visible = true; }
      else {
        const up = easeOut(k / 0.3);                 // hand rises into a cocked pose
        const flick = smooth(0.2, 0.42, k);          // snap forward, item leaves the hand mid-snap
        const out = smooth(0.45, 1, k);              // follow-through, drop out of view
        R.g.position.set(-0.27 + up * 0.07 + flick * 0.19 + out * 0.07, -0.44 + up * 0.36 + flick * 0.05 - out * 0.52, -0.25 - flick * 0.25 + out * 0.05);
        R.g.rotation.set(-0.75 * up * (1 - flick) + flick * 0.55 + out * 0.35, 0.45 - flick * 0.55, 0.3 - flick * 0.45);
        const held = k < this.throwRelease;
        R.nade.visible = held && this.throwDur > 0.32; R.disc.visible = held && this.throwDur <= 0.32;
        const dip = smooth(0, 0.14, k) * (1 - smooth(0.55, 1, k));
        pos.y -= dip * 0.07; pos.x += dip * 0.035; rz -= dip * 0.28; rx -= dip * 0.12;
        if (m.left) m.left.visible = dip < 0.25;
      }
    }
    if (m.slide && this.action !== 'reload') {
      this.slideKick = Math.max(0, this.slideKick - dt * 0.9);
      m.slide.position.z = m.slideHome.z + (this.slideKick > 0.03 ? 0.035 : this.slideKick * 1.1);
    }

    this.holder.position.copy(pos);
    this.holder.rotation.set(rx, ry, rz);

    if (this.flashT > 0 && m.eject) {
      this.flashT -= dt;
      this.holder.updateMatrixWorld(true);
      m.muzzle.getWorldPosition(this.flashSprite.position);
      this.flashSprite.visible = true; this.flashSprite.material.rotation = Math.random() * 6;
      this.flashSprite.scale.setScalar(this.flashSize * (0.8 + Math.random() * 0.4));
      this.flash.position.copy(this.flashSprite.position); this.flash.intensity = 5;
    } else { this.flashSprite.visible = false; this.flash.intensity = 0; this.flashT = 0; }

    for (const s of this.shells) {
      if (s.t <= 0) continue;
      s.t -= dt; s.v.y -= 6 * dt;
      s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += s.spin * dt; s.m.rotation.y += s.spin * 0.5 * dt;
      if (s.t <= 0) s.m.visible = false;
    }
  }

  // Magazine swap shared by rifle / SMG / pistols: drop, reach, insert, seat.
  _magSwap(m, k, t0, t1, t2, dropDist, handOut) {
    const drop = smooth(t0, t0 + 0.14, k), insert = smooth(t1, t2, k);
    const gone = k > t0 + 0.14 && k < t1;
    m.mag.visible = !gone;
    if (k < t1) m.mag.position.set(m.magHome.x, m.magHome.y - drop * dropDist, m.magHome.z + drop * 0.03);
    else m.mag.position.set(m.magHome.x, m.magHome.y - (1 - insert) * dropDist * 0.75, m.magHome.z + (1 - insert) * 0.03);
    const reach = smooth(t0 - 0.06, t0 + 0.1, k) * (1 - smooth(t1 - 0.08, t1 + 0.06, k));
    const guide = smooth(t1 - 0.06, t1 + 0.04, k) * (1 - smooth(t2, t2 + 0.1, k));
    m.left.position.set(m.leftHome.x - reach * handOut[0], m.leftHome.y - reach * handOut[1] - guide * 0.05, m.leftHome.z + reach * handOut[2] + guide * 0.2);
    return smooth(t2 - 0.02, t2 + 0.02, k) * (1 - smooth(t2 + 0.02, t2 + 0.08, k));   // seat bump
  }

  _reloadAnim(id, m, k, pos, rot) {
    const tilt = smooth(0, 0.12, k) * (1 - smooth(0.86, 1, k));
    if (id === 'rifle' || id === 'smg') {
      const smg = id === 'smg';
      pos.y -= tilt * 0.035; pos.x -= tilt * 0.02; rot(tilt * 0.12, tilt * 0.18, tilt * (smg ? 0.6 : 0.45));
      const seat = this._magSwap(m, k, 0.14, 0.46, 0.64, 0.42, [0.05, 0.35, 0.12]);
      pos.y += seat * 0.014; rot(seat * 0.04, 0, 0);
      // charge: rifle pulls the rear handle, SMG slaps the side handle
      const pull = smooth(0.72, 0.78, k) * (1 - smooth(0.78, 0.86, k));
      m.charge.position.z = m.chargeHome.z + pull * (smg ? 0.06 : 0.07);
      if (smg) m.left.position.x -= pull * 0.03;
      rot(pull * -0.06, pull * 0.05, pull * 0.1);
    } else if (id === 'sniper') {
      pos.y -= tilt * 0.03; rot(tilt * 0.1, tilt * 0.12, tilt * 0.42);
      // bolt open first, then mag swap, then close the bolt
      const open = smooth(0.06, 0.14, k) * (1 - smooth(0.82, 0.92, k));
      const back = smooth(0.12, 0.2, k) * (1 - smooth(0.78, 0.84, k));
      m.bolt.rotation.z = open * 1.15; m.bolt.position.z = m.boltHome.z + back * 0.09;
      const seat = this._magSwap(m, k, 0.24, 0.5, 0.66, 0.35, [0, 0.3, 0.25]);
      pos.y += seat * 0.012;
      rot(back * 0.03, 0, open * 0.06);
    } else if (id === 'pistol' || id === 'hcannon') {
      const heavy = id === 'hcannon';
      pos.y -= tilt * 0.02; rot(tilt * 0.25, tilt * 0.12, tilt * (heavy ? 0.5 : 0.35));
      // wrist flick to drop the mag
      const flick = smooth(0.08, 0.14, k) * (1 - smooth(0.14, 0.26, k));
      rot(0, 0, -flick * 0.3);
      const seat = this._magSwap(m, k, 0.12, 0.4, 0.66, 0.3, [0.04, 0.25, 0.05]);
      pos.y += seat * 0.016; rot(seat * 0.06, 0, 0);
      const locked = smooth(0.05, 0.1, k) * (1 - smooth(0.8, 0.84, k));
      m.slide.position.z = m.slideHome.z + locked * (heavy ? 0.045 : 0.035);
      if (heavy) {   // left hand racks the big slide
        const rack = smooth(0.74, 0.8, k) * (1 - smooth(0.8, 0.88, k));
        m.left.position.set(m.leftHome.x + rack * 0.02, m.leftHome.y + rack * 0.1, m.leftHome.z + rack * 0.06);
        m.slide.position.z += rack * 0.02;
      }
      const snap = smooth(0.8, 0.84, k) * (1 - smooth(0.84, 0.95, k));
      rot(snap * -0.1, 0, 0);
    } else if (id === 'shotgun') {
      // tilt to show the loading port, feed shells one by one, rack at the end
      const W = WEAPONS.shotgun, D = this.actionDur, n = Math.max(1, this.reloadShells || 1);
      const t = k * D;
      const hold = smooth(0, W.reloadStart, t) * (1 - smooth(D - W.reloadEnd * 0.8, D, t));
      pos.y -= hold * 0.03; pos.x -= hold * 0.02; rot(hold * 0.2, hold * 0.25, hold * 0.65);
      const cycT = t - W.reloadStart, i = Math.floor(cycT / W.reload);
      if (cycT > 0 && i < n) {
        const c = (cycT - i * W.reload) / W.reload;
        const down = smooth(0, 0.35, c) * (1 - smooth(0.35, 0.7, c));
        const push = smooth(0.55, 0.85, c);
        m.hshell.visible = c > 0.25 && c < 0.88;
        m.left.position.set(m.leftHome.x + down * 0.02, m.leftHome.y - down * 0.18 - push * 0.02, m.leftHome.z + 0.2 * smooth(0, 0.3, c) * (1 - smooth(0.9, 1, c)) + push * 0.05);
        if (c > 0.82 && c < 0.9) pos.y += 0.006;
      } else {
        m.hshell.visible = false;
        m.left.position.copy(m.leftHome);
        if (cycT > 0 && t > D - W.reloadEnd) {   // rack
          const r = (t - (D - W.reloadEnd)) / W.reloadEnd;
          const back = smooth(0.1, 0.45, r) * (1 - smooth(0.5, 0.9, r));
          m.pump.position.z = m.pumpHome.z + back * 0.11;
        }
      }
    }
  }

  _inspectAnim(id, m, k, pos, rot) {
    const inn = smooth(0, 0.16, k), out = smooth(0.84, 1, k), h = inn * (1 - out);
    if (id === 'knife') {
      // flip the knife and catch it
      pos.x -= h * 0.08; pos.y += h * 0.04; pos.z -= h * 0.03;
      rot(h * 0.4, h * 0.6, -h * 0.5);
      const spin = smooth(0.25, 0.65, k);
      m.knife.rotation.set(m.knifeRot.x + spin * Math.PI * 2, m.knifeRot.y, m.knifeRot.z);
      pos.y += Math.sin(spin * Math.PI) * 0.05;
      return;
    }
    // bring the gun in, turn it to show the side, tilt up to admire the top, return
    const side = smooth(0.12, 0.38, k) * (1 - smooth(0.52, 0.7, k));
    const top = smooth(0.55, 0.72, k) * (1 - smooth(0.82, 0.98, k));
    pos.x -= h * 0.09; pos.y += h * 0.03 + top * 0.02; pos.z += h * 0.04;
    rot(h * 0.05 + top * 0.55, h * 0.45 + side * 0.55, -h * 0.2 - side * 0.35 + top * 0.2);
    if (m.slide) m.slide.position.z = m.slideHome.z + smooth(0.6, 0.66, k) * (1 - smooth(0.7, 0.76, k)) * 0.03;
    if (m.charge && id !== 'smg') m.charge.position.z = m.chargeHome.z + smooth(0.6, 0.66, k) * (1 - smooth(0.68, 0.74, k)) * 0.05;
    if (m.pump) m.pump.position.z = m.pumpHome.z + smooth(0.6, 0.66, k) * (1 - smooth(0.68, 0.76, k)) * 0.06;
  }

  setAspect(a) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }
}
