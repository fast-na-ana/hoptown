// Dynamic map pieces: switch-operated blast doors, destructible wall panels and breakable glass.
// The host owns their state (open / closed / broken, HP) and broadcasts changes; anyone who hits
// one reports the damage to the host. Colliders are toggled with box.off so physics, bullets and
// line-of-sight all follow the current state.
import * as THREE from 'three';
import { sfx } from './audio.js';

const MATS = {};
function mat(kind) {
  if (MATS[kind]) return MATS[kind];
  const m = {
    door: new THREE.MeshStandardMaterial({ color: '#5d6873', metalness: 0.45, roughness: 0.45 }),
    doorStripe: new THREE.MeshStandardMaterial({ color: '#ffd60a', roughness: 0.6 }),
    panel: new THREE.MeshStandardMaterial({ color: '#b9bec4', metalness: 0.2, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.1, depthWrite: false }),
    switch: new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.5 }),
    lightOn: new THREE.MeshBasicMaterial({ color: '#2bd66a' }),
    lightOff: new THREE.MeshBasicMaterial({ color: '#ff3b30' }),
  }[kind];
  MATS[kind] = m; return m;
}

export class Breakables {
  constructor(game, defs) {
    this.g = game;
    this.list = []; this.byId = new Map();
    this.group = new THREE.Group(); game.scene.add(this.group);
    for (const d of defs || []) {
      const b = { ...d, hp: d.hp, maxHp: d.hp, state: d.kind === 'door' ? 'open' : 'intact', anim: 0, meshes: [], cooldown: 0, brokenAt: 0 };
      const size = [d.max[0] - d.min[0], d.max[1] - d.min[1], d.max[2] - d.min[2]];
      const centre = [(d.min[0] + d.max[0]) / 2, (d.min[1] + d.max[1]) / 2, (d.min[2] + d.max[2]) / 2];
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat(d.kind === 'door' ? 'door' : d.kind));
      m.position.set(...centre); m.castShadow = d.kind !== 'glass'; m.receiveShadow = true;
      this.group.add(m); b.mesh = m; b.home = centre; b.size = size;
      if (d.kind === 'door') {   // hazard stripes on both faces
        const thinX = size[0] < size[2];
        for (const s of [-1, 1]) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(thinX ? 0.02 : size[0] * 0.98, 0.25, thinX ? size[2] * 0.98 : 0.02), mat('doorStripe'));
          st.position.set(thinX ? s * (size[0] / 2 + 0.01) : 0, -size[1] / 2 + 0.4, thinX ? 0 : s * (size[2] / 2 + 0.01));
          m.add(st);
        }
        b.switchMeshes = (d.switches || []).map(p => {
          const sw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.3), mat('switch'));
          sw.position.set(p[0], p[1] + 1.2, p[2]); this.group.add(sw);
          const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.32), mat('lightOn'));
          lamp.position.y = 0.16; sw.add(lamp); sw.userData.lamp = lamp;
          return sw;
        });
      }
      for (const box of d.boxes) box.brk = b;
      this.list.push(b); this.byId.set(b.id, b);
      this._apply(b, true);
    }
    this._linkNav();
  }

  get solidCount() { return this.list.filter(b => this.isSolid(b)).length; }
  isSolid(b) { return b.kind === 'door' ? b.state === 'closed' : b.state === 'intact'; }

  // nav edges that pass through a door are skipped by bots while that door is shut
  _linkNav() {
    const nav = this.g.map.nav; if (!nav) return;
    for (const n of nav.nodes) n.blk = null;
    for (const b of this.list) {
      if (b.kind !== 'door') continue;
      const mn = b.min, mx = b.max;
      nav.nodes.forEach((n, i) => {
        for (const j of n.links) {
          const a = n.p, c = nav.nodes[j].p;
          // segment vs door box (slab test in XZ at waist height)
          let t0 = 0, t1 = 1, ok = true;
          for (const ax of [0, 2]) {
            const d = c[ax] - a[ax];
            if (Math.abs(d) < 1e-6) { if (a[ax] < mn[ax] - 0.3 || a[ax] > mx[ax] + 0.3) { ok = false; break; } continue; }
            let u0 = (mn[ax] - 0.3 - a[ax]) / d, u1 = (mx[ax] + 0.3 - a[ax]) / d;
            if (u0 > u1) [u0, u1] = [u1, u0];
            t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); if (t0 > t1) { ok = false; break; }
          }
          if (ok) (n.blk || (n.blk = new Map())).set(j, b);
        }
      });
    }
  }
  edgeBlocked(i, j) { const n = this.g.map.nav.nodes[i]; const b = n.blk && n.blk.get(j); return !!(b && this.isSolid(b)); }

  _apply(b, instant = false) {
    const solid = this.isSolid(b);
    for (const box of b.boxes) box.off = !solid;
    if (b.kind !== 'door') b.mesh.visible = solid;
    if (b.kind === 'door' && b.state === 'broken') b.mesh.visible = false;
    else if (b.kind === 'door') b.mesh.visible = true;
    if (instant) b.anim = solid ? 1 : 0;
    if (b.switchMeshes) for (const sw of b.switchMeshes) sw.userData.lamp.material = b.state === 'open' ? mat('lightOn') : mat('lightOff');
  }

  // ---------------------------------------------------------------- interaction
  switchNear(p) {
    if (!p.alive) return null;
    const pos = this.g.posOf(p);
    for (const b of this.list) {
      if (b.kind !== 'door' || b.state === 'broken') continue;
      for (const s of b.switches || []) if (Math.hypot(pos[0] - s[0], pos[2] - s[2]) < 1.7 && Math.abs(pos[1] - s[1]) < 1.5) return b;
    }
    return null;
  }
  useSwitch(p) {
    const b = this.switchNear(p); if (!b) return false;
    if (this.g.isHost) this.hostToggle(b.id); else if (this.g.net) this.g.net.send('brksw', { id: b.id }, this.g.hostId);
    return true;
  }
  hostToggle(id) {
    const b = this.byId.get(id), g = this.g;
    if (!b || b.kind !== 'door' || b.state === 'broken' || g.time < b.cooldown) return;
    if (b.state === 'open') {
      // don't slam shut on someone standing in the doorway
      for (const p of g.players.values()) {
        if (!p.alive) continue;
        const q = g.posOf(p);
        if (q[0] > b.min[0] - 0.4 && q[0] < b.max[0] + 0.4 && q[2] > b.min[2] - 0.4 && q[2] < b.max[2] + 0.4 && q[1] < b.max[1]) return;
      }
      b.state = 'closed'; b.hp = b.maxHp;
    } else b.state = 'open';
    b.cooldown = g.time + 1.2;
    this._apply(b); this._send(b); this._fx(b);
  }

  // shooter side: a bullet / blast hit this piece
  hit(box, dmg) {
    const b = box && box.brk; if (!b || !this.isSolid(b)) return;
    if (this.g.isHost) this.hostDamage(b.id, dmg);
    else if (this.g.net) { this._pend = this._pend || {}; this._pend[b.id] = (this._pend[b.id] || 0) + dmg; }
    if (b.kind === 'glass') this.g.effects.burst(b.home, 10, '#dff4ff', 3, 0.6, null, 9, 0.05);
  }
  hostDamage(id, dmg) {
    const b = this.byId.get(id);
    if (!b || !this.isSolid(b)) return;
    b.hp -= dmg;
    if (b.hp <= 0) { b.hp = 0; b.state = 'broken'; b.brokenAt = this.g.time; this._apply(b); this._fx(b, true); }
    this._send(b);
  }
  blast(pos, radius, dmg) {   // grenades / the charge (host only)
    if (!this.g.isHost) return;
    for (const b of this.list) {
      if (!this.isSolid(b)) continue;
      const q = [Math.max(b.min[0], Math.min(pos[0], b.max[0])), Math.max(b.min[1], Math.min(pos[1], b.max[1])), Math.max(b.min[2], Math.min(pos[2], b.max[2]))];
      const d = Math.hypot(q[0] - pos[0], q[1] - pos[1], q[2] - pos[2]);
      if (d < radius) this.hostDamage(b.id, Math.round(dmg * (1 - d / radius) + 20));
    }
  }

  resetAll() {   // new round / new match
    for (const b of this.list) { b.state = b.kind === 'door' ? 'open' : 'intact'; b.hp = b.maxHp; this._apply(b, true); }
    if (this.g.isHost && this.g.net) this.g.net.send('brkall', this.snapshot());
  }
  snapshot() { return this.list.map(b => [b.id, b.state, Math.round(b.hp)]); }

  _send(b) { if (this.g.net) this.g.net.send('brk', { id: b.id, s: b.state, hp: Math.round(b.hp) }); }
  onNet(d) {
    const b = this.byId.get(d.id); if (!b) return;
    const was = b.state;
    b.state = d.s; b.hp = d.hp; this._apply(b);
    if (was !== b.state) this._fx(b, b.state === 'broken');
  }
  onAll(arr) { for (const [id, s, hp] of arr) { const b = this.byId.get(id); if (b) { b.state = s; b.hp = hp; this._apply(b, true); } } }

  _fx(b, broke = false) {
    const g = this.g, c = b.home;
    if (broke) {
      const col = b.kind === 'glass' ? '#dff4ff' : b.kind === 'door' ? '#5d6873' : '#b9bec4';
      g.effects.burst(c, b.kind === 'glass' ? 30 : 40, col, 5, 0.9, null, 9, b.kind === 'glass' ? 0.06 : 0.1);
      g.effects.smoke(c, [0, 0.6, 0], '#bbbbbb', 1.4, 0.9, 2.5, 0.5);
      if (b.kind !== 'glass') g.effects.sparks(c, 16, null);
      if (b.kind === 'glass') sfx.shatter(c); else sfx.crumble(c);
    } else sfx.door(c, b.state === 'closed');
  }

  update(dt) {
    const g = this.g;
    if (this._pend && g.time - (this._pendT || 0) > 0.1) {     // batch damage reports
      for (const [id, d] of Object.entries(this._pend)) g.net.send('brkhit', { id, d: Math.round(d) }, g.hostId);
      this._pend = null; this._pendT = g.time;
    }
    // outside plant mode, broken panels / glass / doors come back after a while
    if (g.isHost && !g.plant) for (const b of this.list) if (b.state === 'broken' && g.time - b.brokenAt > 45) { b.state = b.kind === 'door' ? 'open' : 'intact'; b.hp = b.maxHp; this._apply(b, true); this._send(b); }
    for (const b of this.list) {
      if (b.kind !== 'door' || b.state === 'broken') continue;
      const target = b.state === 'closed' ? 1 : 0;
      b.anim += Math.sign(target - b.anim) * Math.min(Math.abs(target - b.anim), dt / 0.6);
      // door rises out of the floor slot
      b.mesh.position.y = b.home[1] - (1 - b.anim) * (b.size[1] - 0.12);
      // tint with damage
      const k = b.hp / b.maxHp;
      if (b.mesh.material === mat('door') && k < 0.999) { b.mesh.material = b.mesh.material.clone(); }
      if (b.mesh.material !== mat('door')) b.mesh.material.color.setRGB(0.36 + (1 - k) * 0.3, 0.41 * (0.6 + 0.4 * k), 0.45 * (0.6 + 0.4 * k));
    }
  }

  dispose() { this.g.scene.remove(this.group); }
}
