// Original blocky "hop-bot" character used for bots and remote players.
import * as THREE from 'three';

const shared = {};
function mat(color, emissive) {
  const k = color + (emissive || '');
  if (!shared[k]) shared[k] = new THREE.MeshStandardMaterial({ color, roughness: 0.7, emissive: emissive || '#000', emissiveIntensity: emissive ? 1.2 : 0 });
  return shared[k];
}
function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z); mesh.castShadow = true;
  return mesh;
}

export function makeNameTag(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(text, 128, 32);
  g.fillStyle = color; g.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
  s.scale.set(1.6, 0.4, 1);
  return s;
}

export class Avatar {
  constructor(color, name) {
    this.root = new THREE.Group();
    const body = mat('#2b2f38'), accent = mat(color), visor = mat('#111', color);
    this.hips = new THREE.Group(); this.hips.position.y = 0.9; this.root.add(this.hips);
    this.torso = new THREE.Group(); this.hips.add(this.torso);
    this.torso.add(box(0.62, 0.62, 0.36, accent, 0, 0.33, 0));
    this.torso.add(box(0.5, 0.22, 0.4, body, 0, 0.05, 0));
    this.torso.add(box(0.3, 0.3, 0.12, body, 0, 0.4, 0.22)); // backpack
    this.head = new THREE.Group(); this.head.position.y = 0.72; this.torso.add(this.head);
    this.head.add(box(0.42, 0.4, 0.42, body, 0, 0.18, 0));
    this.head.add(box(0.36, 0.12, 0.05, visor, 0, 0.2, -0.22));
    this.head.add(box(0.06, 0.18, 0.06, accent, 0.15, 0.45, 0));
    // arms holding a rifle in front
    this.armR = new THREE.Group(); this.armR.position.set(0.38, 0.55, 0); this.torso.add(this.armR);
    this.armR.add(box(0.16, 0.5, 0.16, accent, 0, -0.2, 0));
    this.armL = new THREE.Group(); this.armL.position.set(-0.38, 0.55, 0); this.torso.add(this.armL);
    this.armL.add(box(0.16, 0.5, 0.16, accent, 0, -0.2, 0));
    this.armR.rotation.x = -1.2; this.armL.rotation.x = -1.35; this.armL.rotation.z = -0.5;
    this.gun = new THREE.Group(); this.gun.position.set(0.12, 0.35, -0.42); this.torso.add(this.gun);
    this.gun.add(box(0.08, 0.12, 0.7, mat('#1d1f24'), 0, 0, 0));
    this.gun.add(box(0.06, 0.14, 0.12, mat('#1d1f24'), 0, -0.1, 0.12));
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0.02, -0.4); this.gun.add(this.muzzle);
    this.legL = new THREE.Group(); this.legL.position.set(-0.16, 0, 0); this.hips.add(this.legL);
    this.legL.add(box(0.2, 0.86, 0.22, body, 0, -0.43, 0));
    this.legR = new THREE.Group(); this.legR.position.set(0.16, 0, 0); this.hips.add(this.legR);
    this.legR.add(box(0.2, 0.86, 0.22, body, 0, -0.43, 0));
    this.tag = makeNameTag(name, color);
    this.tag.position.y = 2.25;
    this.root.add(this.tag);
    this.phase = 0;
    this.crouch = 0;
  }

  setName(name, color) {
    this.root.remove(this.tag);
    this.tag.material.map.dispose(); this.tag.material.dispose();
    this.tag = makeNameTag(name, color); this.tag.position.y = 2.25; this.root.add(this.tag);
  }

  // pos = feet; yaw/pitch; speed (horizontal); crouched; airborne
  update(dt, pos, yaw, pitch, speed, crouched, airborne, alive) {
    this.root.visible = alive;
    if (!alive) return;
    this.root.position.set(pos[0], pos[1], pos[2]);
    this.root.rotation.y = yaw;
    this.crouch += ((crouched ? 1 : 0) - this.crouch) * Math.min(1, dt * 12);
    this.hips.position.y = 0.9 - this.crouch * 0.42;
    this.phase += dt * Math.min(speed, 9) * 1.6;
    const sw = airborne ? 0.5 : Math.sin(this.phase) * Math.min(1, speed / 4) * 0.8;
    this.legL.rotation.x = airborne ? -0.6 : sw - this.crouch * 1.2;
    this.legR.rotation.x = airborne ? 0.3 : -sw - this.crouch * 1.2;
    this.torso.rotation.x = -this.crouch * 0.2;
    this.head.rotation.x = -pitch * 0.6;
    const p = -pitch * 0.7;
    this.armR.rotation.x = -1.2 + p; this.armL.rotation.x = -1.35 + p;
    this.gun.rotation.x = p;
    this.gun.position.y = 0.35 + Math.sin(p) * 0.3;
    this.tag.position.y = 2.25 - this.crouch * 0.42;
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
