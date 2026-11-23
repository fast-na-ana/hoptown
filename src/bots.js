// Bot AI: waypoint navigation (A*), target acquisition, aim with reaction time and error,
// strafing, jumping, sliding and the occasional grenade.
import { stepMovement, emptyInput } from './movement.js';
import { WEAPONS } from './config.js';
import { other } from './modes.js';

export const BOT_NAMES = ['Sprocket', 'Rivet', 'Nova', 'Bolt', 'Pixel', 'Ziggy', 'Comet', 'Gizmo', 'Blitz', 'Orbit', 'Turbo', 'Echo'];

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'legendary'];
const DIFF = {
  // react: seconds before first shot · err: initial aim error · turn: rad/s · cone: fire when within
  // head: chance to aim for the head · spread: multiplier on weapon spread · pause: gaps between bursts
  easy:      { snipe: 0.03, react: 0.85, err: 0.16, turn: 2.4, cone: 0.06, head: 0.05, view: 38, strafe: 0.45, nade: 0.03, spread: 3.2, burst: 0.35, pause: 0.7, decay: 1.2 },
  medium:    { snipe: 0.018, react: 0.55, err: 0.1, turn: 3.6, cone: 0.05, head: 0.12, view: 52, strafe: 0.7, nade: 0.07, spread: 2.2, burst: 0.5, pause: 0.45, decay: 1.6 },
  hard:      { snipe: 0.01, react: 0.34, err: 0.06, turn: 5.5, cone: 0.04, head: 0.28, view: 68, strafe: 0.9, nade: 0.12, spread: 1.5, burst: 0.8, pause: 0.25, decay: 2.2 },
  legendary: { snipe: 0.005, react: 0.2, err: 0.035, turn: 9, cone: 0.035, head: 0.5, view: 85, strafe: 1, nade: 0.2, spread: 1.0, burst: 1.5, pause: 0.12, decay: 3 },
};
DIFF.normal = DIFF.medium;

function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

export class Bot {
  constructor(game, p, difficulty = 'normal') {
    this.g = game; this.p = p; this.d = DIFF[difficulty] || DIFF.medium;
    this.burstT = 0; this.pauseT = 0; this.role = 'rifle';
    this.ctfRole = Math.random() < 0.65 ? 'attack' : 'defend';
    this.objT = 0;
    this.path = []; this.pi = 0; this.target = null; this.lastSeen = null; this.lastSeenT = -99;
    this.reactUntil = 0; this.strafe = 1; this.strafeT = 0; this.err = [0, 0];
    this.nextThink = 0; this.stuckT = 0; this.checkPos = [0, 0, 0]; this.checkT = 0;
    this.jumpHold = 0; this.crouchHold = 0; this.wantJump = false;
    this.headAim = Math.random() < this.d.head;
    this.nextNade = 0;
  }

  setDifficulty(name) { this.d = DIFF[name] || DIFF.medium; }

  // ---- navigation
  nearestNode(pos) {
    const nodes = this.g.map.nav.nodes;
    const cand = nodes.map((n, i) => ({ i, d: Math.hypot(n.p[0] - pos[0], (n.p[1] - pos[1]) * 2.5, n.p[2] - pos[2]) })).sort((a, b) => a.d - b.d);
    for (let k = 0; k < Math.min(6, cand.length); k++) {
      const n = nodes[cand[k].i];
      if (this.g.world.lineOfSight([pos[0], pos[1] + 0.8, pos[2]], [n.p[0], n.p[1] + 0.8, n.p[2]])) return cand[k].i;
    }
    return cand[0].i;
  }

  astar(from, to) {
    const nodes = this.g.map.nav.nodes;
    const open = new Set([from]), came = new Map(), gs = new Map([[from, 0]]), fs = new Map();
    const h = (i) => { const a = nodes[i].p, b = nodes[to].p; return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
    fs.set(from, h(from));
    let guard = 0;
    while (open.size && guard++ < 2000) {
      let cur = null, best = Infinity;
      for (const i of open) { const f = fs.get(i); if (f < best) { best = f; cur = i; } }
      if (cur === to) {
        const out = [cur];
        while (came.has(cur)) { cur = came.get(cur); out.unshift(cur); }
        return out;
      }
      open.delete(cur);
      for (const nb of nodes[cur].links) {
        const a = nodes[cur].p, b = nodes[nb].p;
        const t = gs.get(cur) + Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        if (t < (gs.get(nb) ?? Infinity)) { came.set(nb, cur); gs.set(nb, t); fs.set(nb, t + h(nb)); open.add(nb); }
      }
    }
    return null;
  }

  goTo(pos) {
    const a = this.nearestNode(this.p.ms.pos), b = this.nearestNode(pos);
    const path = this.astar(a, b);
    this.path = path ? path.map(i => this.g.map.nav.nodes[i].p) : [];
    if (path) this.path.push([...pos]);
    this.pi = 0;
  }

  wander() {
    const enemies = [...this.g.players.values()].filter(o => o !== this.p && o.alive && !o.afk && this.g.isEnemy(this.p, o));
    if (enemies.length && Math.random() < 0.55) {
      const e = enemies[Math.floor(Math.random() * enemies.length)];
      const ep = this.g.posOf(e);
      this.goTo([ep[0], ep[1], ep[2]]);
    } else {
      const nodes = this.g.map.nav.nodes.filter(n => !n.id.includes('pad') && !n.id.includes('roof'));
      const n = nodes[Math.floor(Math.random() * nodes.length)];
      this.goTo(n.p);
    }
  }

  // CTF: where should this bot be heading?
  objective() {
    const g = this.g;
    if (g.mode !== 'ctf' || !g.flags || !this.p.team) return null;
    const my = this.p.team, en = other(my);
    if (g.carrying(this.p)) return { pos: g.map.flags[my], urgent: true };
    const of = g.flags[my], ef = g.flags[en];
    if (of.state === 'carried') { const c = g.players.get(of.carrier); if (c) return { pos: [...g.posOf(c)], urgent: true }; }
    if (of.state === 'dropped') return { pos: of.pos, urgent: true };
    if (this.ctfRole === 'defend') {
      const b = g.map.flags[my];
      const near = g.map.nav.nodes.filter(n => Math.hypot(n.p[0] - b[0], n.p[2] - b[2]) < 11 && Math.abs(n.p[1] - b[1]) < 1);
      const n = near.length ? near[Math.floor(Math.random() * near.length)] : null;
      return { pos: n ? n.p : b, urgent: false, idle: true };
    }
    if (ef.state === 'carried') { const c = g.players.get(ef.carrier); if (c && c !== this.p) return { pos: [...g.posOf(c)], urgent: false }; }
    return { pos: ef.pos, urgent: false };
  }

  onHurt(attackerId) {
    const a = this.g.players.get(attackerId);
    if (!a || a === this.p) return;
    if (!this.target) { const ap = this.g.posOf(a); this.lastSeen = [...ap]; this.lastSeenT = this.g.time; this.alertYaw = Math.atan2(-(ap[0] - this.p.ms.pos[0]), -(ap[2] - this.p.ms.pos[2])); }
  }

  // ---- perception (~8 Hz)
  think(t) {
    const p = this.p;
    if (!p.alive) { this.path = []; this.target = null; return; }
    if (t < this.nextThink) return;
    this.nextThink = t + 0.12 + Math.random() * 0.05;
    const eye = this.g.eyeOf(p);
    let best = null, bestD = Infinity;
    for (const o of this.g.players.values()) {
      if (o === p || !o.alive || o.afk || !this.g.isEnemy(p, o)) continue;
      if (this.g.match.phase === 'warmup') continue;
      const op = this.g.posOf(o);
      const d = Math.hypot(op[0] - eye[0], op[1] - eye[1], op[2] - eye[2]);
      if (d > this.d.view) continue;
      // field of view check (wide) unless very close or it's our current target
      const yawTo = Math.atan2(-(op[0] - eye[0]), -(op[2] - eye[2]));
      if (o !== this.target && Math.abs(angDiff(yawTo, p.yaw)) > 1.9 && d > 8) continue;
      const tgt = [op[0], op[1] + (this.g.crouchOf(o) ? 0.8 : 1.3), op[2]];
      if (!this.g.world.lineOfSight(eye, tgt)) continue;
      const score = d * (o === this.target ? 0.6 : 1);
      if (score < bestD) { bestD = score; best = o; }
    }
    if (best && best !== this.target) {
      this.reactUntil = t + this.d.react * (0.7 + Math.random() * 0.6);
      this.err = [(Math.random() - 0.5) * this.d.err * 6, (Math.random() - 0.5) * this.d.err * 4];
      this.headAim = Math.random() < this.d.head;
    }
    this.target = best;
    if (best) {
      const bp = this.g.posOf(best);
      this.lastSeen = [...bp]; this.lastSeenT = t;
      const dist = bestD;
      if (!this.urgent && dist > 22 && (!this.path.length || this.pi >= this.path.length || Math.random() < 0.1)) this.goTo(bp);
      // grenade
      if (this.p.nades > 0 && t > this.nextNade && dist > 9 && dist < 26 && Math.random() < this.d.nade) {
        this.nextNade = t + 6;
        const dx = bp[0] - eye[0], dz = bp[2] - eye[2], dh = Math.hypot(dx, dz);
        this.g.throwGrenade(p, Math.atan2(-dx, -dz), Math.min(0.7, 0.18 + dh * 0.012));
      }
    }
    const obj = this.objective();
    this.urgent = !!(obj && obj.urgent);
    if (obj && (!best || obj.urgent)) {
      const end = this.path.length ? this.path[this.path.length - 1] : null;
      const moved = !end || Math.hypot(end[0] - obj.pos[0], end[2] - obj.pos[2]) > 4;
      const done = !this.path.length || this.pi >= this.path.length;
      if ((moved && !obj.idle) || (done && (!obj.idle || t > this.objT))) { this.goTo(obj.pos); this.objT = t + 3 + Math.random() * 4; }
    } else if (!best && this.lastSeen && t - this.lastSeenT < 5) {
      if (!this.path.length || this.pi >= this.path.length) this.goTo(this.lastSeen);
    } else if (!best && (!this.path.length || this.pi >= this.path.length)) {
      this.wander();
    }
  }

  // ---- per-sim-step control
  step(dt) {
    const p = this.p, ms = p.ms, g = this.g;
    const inp = emptyInput();
    let moveYaw = p.yaw, fwd = 0, right = 0;

    // follow path
    let wp = null;
    while (this.pi < this.path.length) {
      const n = this.path[this.pi];
      const dh = Math.hypot(n[0] - ms.pos[0], n[2] - ms.pos[2]);
      if (dh < 0.9 && Math.abs(n[1] - ms.pos[1]) < 1.6) { this.pi++; continue; }
      wp = n; break;
    }
    if (wp) { moveYaw = Math.atan2(-(wp[0] - ms.pos[0]), -(wp[2] - ms.pos[2])); fwd = 1; }

    let desiredYaw = wp ? moveYaw : p.yaw, desiredPitch = 0;
    if (this.alertYaw !== undefined && !this.target) { desiredYaw = this.alertYaw; if (Math.abs(angDiff(p.yaw, this.alertYaw)) < 0.1) this.alertYaw = undefined; }

    const T = this.target && this.target.alive ? this.target : null;
    if (T) {
      const eye = g.eyeOf(p), tp = g.posOf(T);
      const th = g.crouchOf(T) ? 1.15 : 1.8;
      const aimY = tp[1] + (this.headAim ? th - 0.2 : th * 0.62);
      const dx = tp[0] - eye[0], dy = aimY - eye[1], dz = tp[2] - eye[2];
      const dh = Math.hypot(dx, dz);
      desiredYaw = Math.atan2(-dx, -dz) + this.err[0];
      desiredPitch = Math.atan2(dy, dh) + this.err[1];
      // error decays while tracking
      this.err[0] *= Math.exp(-dt * this.d.decay); this.err[1] *= Math.exp(-dt * this.d.decay);
      // combat movement
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0.4 + Math.random() * 0.9; if (Math.random() < 0.18 * this.d.strafe) this.wantJump = true; }
      const dist = Math.hypot(dx, dy, dz);
      if ((dist < 22 || !wp) && !(this.urgent && wp)) {
        moveYaw = Math.atan2(-dx, -dz);
        fwd = dist > 12 ? 0.6 : dist < 5 ? -0.6 : 0;
        right = this.strafe * this.d.strafe;
        if (Math.random() < 0.003 * this.d.strafe && ms.onGround) this.crouchHold = 0.5; // slide
      }
      // weapon logic
      const primary = this.role === 'sniper' && dist > 12 ? 'sniper' : 'rifle';
      if (p.weapon !== 'pistol' && p.weapon !== primary && g.time >= p.reloadUntil) g.switchWeapon(p, primary);
      if (p.mag[p.weapon] === 0 && p.weapon !== 'pistol' && dist < 12 && g.time < p.reloadUntil) g.switchWeapon(p, 'pistol');
      if (p.weapon === 'pistol' && p.mag.pistol === 0) g.switchWeapon(p, primary);
      const yawErr = Math.abs(angDiff(p.yaw, desiredYaw - this.err[0]));
      const pitchErr = Math.abs(p.pitch - (desiredPitch - this.err[1]));
      const cone = this.d.cone + 0.4 / Math.max(3, dist);
      // burst / pause rhythm so lower difficulties don't laser you
      if (this.pauseT > 0) this.pauseT -= dt;
      else { this.burstT += dt; if (this.burstT > this.d.burst * (0.6 + Math.random() * 0.8)) { this.burstT = 0; this.pauseT = this.d.pause * (0.6 + Math.random() * 0.8); } }
      if (dist < 2.1 && g.match.phase === 'play' && g.time > this.reactUntil) {
        g.melee(p, Math.atan2(-dx, -dz), Math.atan2(dy, dh));
      } else if (g.time > this.reactUntil && this.pauseT <= 0 && yawErr < cone && pitchErr < cone && g.match.phase === 'play' && g.canShoot(p)) {
        const W = WEAPONS[p.weapon];
        const settled = !W.scope || (g.time > this.reactUntil + 0.35 && yawErr < cone * 0.5);
        if ((W.auto || Math.random() < 0.3) && settled) {
          const eyeNow = g.eyeOf(p);
          if (W.scope) { p.spreadAdd = this.d.snipe; g.fire(p, p.yaw, p.pitch, 1, eyeNow); p.spreadAdd = 0; }
          else { p.spreadMul = this.d.spread; g.fire(p, p.yaw, p.pitch, 0.2, eyeNow); p.spreadMul = 1; }
          p.pitch += W.recoilPitch * 0.5;
        }
      }
    } else if (p.mag[p.weapon] < WEAPONS[p.weapon].mag * 0.5) {
      if (p.weapon === 'pistol') g.switchWeapon(p, 'rifle');
      g.reload(p);
    }

    // turn toward desired angles at limited rate
    const turn = this.d.turn * dt * (T ? 1 : 0.7);
    const dyaw = angDiff(desiredYaw, p.yaw);
    p.yaw += Math.max(-turn, Math.min(turn, dyaw * Math.min(1, dt * 14)));
    p.pitch += (desiredPitch - p.pitch) * Math.min(1, dt * 8);
    p.pitch = Math.max(-1.4, Math.min(1.4, p.pitch));

    // stuck detection -> jump, then repath
    this.checkT += dt;
    if (this.checkT > 0.7) {
      const moved = Math.hypot(ms.pos[0] - this.checkPos[0], ms.pos[2] - this.checkPos[2]);
      if ((fwd !== 0 || right !== 0) && moved < 0.6) { this.stuckT++; this.wantJump = true; if (this.stuckT > 2) { this.path = []; this.pi = 0; this.stuckT = 0; } }
      else this.stuckT = 0;
      this.checkPos = [...ms.pos]; this.checkT = 0;
    }
    // occasional bunny hop when running a long path
    if (!T && wp && ms.onGround && Math.random() < 0.004) this.wantJump = true;

    if (this.wantJump) { this.jumpHold = 0.12; this.wantJump = false; }
    if (this.jumpHold > 0) { this.jumpHold -= dt; inp.jump = true; }
    if (this.crouchHold > 0) { this.crouchHold -= dt; inp.crouch = true; }

    // convert move intent (in moveYaw frame) to the movement yaw
    inp.yaw = moveYaw; inp.fwd = fwd; inp.right = right;
    stepMovement(ms, inp, dt, g.world);
  }
}
