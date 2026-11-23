// Core game: players, combat, projectiles, match flow, networking glue and rendering.
import * as THREE from 'three';
import { SIM_DT, PLAYER, MOVE, WEAPONS, GRENADE, BLINK, MATCH, STREAKS, COLORS, KNIFE } from './config.js';
import { World, rayBox } from './physics.js';
import { buildMap } from './map.js';
import { makeMoveState, emptyInput, stepMovement, findFreeSpot } from './movement.js';
import { Avatar } from './avatar.js';
import { ViewModel } from './viewmodel.js';
import { Effects } from './effects.js';
import { Hud } from './hud.js';
import { sfx, setListener } from './audio.js';
import { Bot, BOT_NAMES } from './bots.js';

const now = () => performance.now() / 1000;
const r2 = (v) => Math.round(v * 100) / 100;

export class Game {
  constructor(renderer, opts) {
    this.renderer = renderer;
    this.opts = opts;
    this.settings = opts.settings;
    this.net = opts.net || null;
    this.selfId = this.net ? this.net.selfId : 'local';
    this.hostId = this.selfId;
    this.time = 0;
    this.players = new Map();
    this.projectiles = [];
    this.bots = [];
    this.botCount = opts.bots ?? 5;
    this.difficulty = opts.difficulty || 'medium';
    this.helpShown = true; this.helpUntil = 14;
    this.nextProjId = 1;
    this.acc = 0;
    this.input = { keys: new Set(), pressed: new Set(), mouseL: false, mouseR: false, clickL: false, dx: 0, dy: 0 };
    this.view = { yaw: 0, pitch: 0, recoil: 0, recoilYaw: 0, shake: 0, land: 0, roll: 0, fovKick: 0, ads: 0, step: 0 };
    this.match = { phase: 'warmup', t: MATCH.warmup, round: 1, winner: null, killLimit: MATCH.killLimit, roundTime: MATCH.roundTime };
    this.lastMatchSend = 0; this.lastStateSend = 0; this.lastRosterSend = 0;
    this.paused = false;

    this._setupScene();
    this.world = new World();
    this.map = buildMap(this.world, this.scene);
    this.effects = new Effects(this.scene);
    this.vm = new ViewModel(opts.color, renderer);
    this.hud = new Hud();

    this.local = this.addPlayer(this.selfId, { name: opts.name, color: opts.color, isLocal: true, owner: this.selfId });
    this.spawn(this.local);
    if (this.net) this._setupNet(); else this._ensureBots();
    this.onResize();
  }

  get isHost() { return this.hostId === this.selfId; }

  // ---------------------------------------------------------------- scene
  _setupScene() {
    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#cfe6ff', 45, 140);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#3d8bff') }, mid: { value: new THREE.Color('#9fd0ff') }, bot: { value: new THREE.Color('#e6f2ff') }, sun: { value: new THREE.Vector3(0.45, 0.7, 0.35).normalize() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sun; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, bot, min(1.0, -h*4.0));
        float s = max(0.0, dot(vP, sun)); c += vec3(1.0,0.9,0.7) * (pow(s, 300.0) * 2.0 + pow(s, 8.0) * 0.25);
        gl_FragColor = vec4(c, 1.0); }`,
    }));
    sky.frustumCulled = false;
    scene.add(sky); this.sky = sky;
    scene.add(new THREE.HemisphereLight('#d9ecff', '#6b8f4e', 1.25));
    const sun = new THREE.DirectionalLight('#fff3dc', 2.4);
    sun.position.set(28, 44, 22);
    sun.castShadow = this.settings.shadows !== false;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 1; sc.far = 130;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target);
    this.sun = sun;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov || 75, 1, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.vm.setAspect(w / h);
  }

  // ---------------------------------------------------------------- players
  addPlayer(id, { name, color, isBot = false, isLocal = false, owner }) {
    const p = {
      id, name, color, isBot, isLocal, owner,
      ms: (isLocal || (isBot && owner === this.selfId)) ? makeMoveState([0, 0, 0]) : null,
      prevPos: [0, 0, 0], rpos: [0, -50, 0], rvel: [0, 0, 0], rc: false, rg: true, snaps: [],
      yaw: 0, pitch: 0, hp: PLAYER.maxHealth, alive: false, respawnAt: 0, protectUntil: 0,
      weapon: 'rifle', mag: { rifle: WEAPONS.rifle.mag, pistol: WEAPONS.pistol.mag }, reloadUntil: 0, nextShot: 0, bloom: 0,
      nades: GRENADE.max, nadeT: 0, blinkCd: 0, blink: null, nextMelee: 0,
      kills: 0, deaths: 0, score: 0, streak: 0, best: 0, wins: 0, lastHurt: -99, lastSeen: now(), killedBy: null,
      avatar: null,
    };
    if (!isLocal) {
      p.avatar = new Avatar(color, name);
      p.avatar.root.visible = false;
      this.scene.add(p.avatar.root);
    }
    this.players.set(id, p);
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (p.avatar) p.avatar.dispose(this.scene);
    this.players.delete(id);
    this.bots = this.bots.filter(b => b.p.id !== id);
  }

  simulatedHere(p) { return !!p.ms; }
  posOf(p) { return p.ms ? p.ms.pos : p.rpos; }
  crouchOf(p) { return p.ms ? p.ms.crouching : p.rc; }
  eyeOf(p, out = [0, 0, 0]) {
    const pos = this.posOf(p);
    out[0] = pos[0]; out[1] = pos[1] + (this.crouchOf(p) ? PLAYER.crouchEye : PLAYER.eye); out[2] = pos[2];
    return out;
  }

  spawn(p) {
    const enemies = [...this.players.values()].filter(o => o !== p && o.alive);
    const scored = this.map.spawns.map(s => {
      let d = 60;
      for (const e of enemies) {
        const ep = this.posOf(e);
        let dd = Math.hypot(ep[0] - s[0], ep[1] - s[1], ep[2] - s[2]);
        if (this.world.lineOfSight([s[0], s[1] + 1.6, s[2]], [ep[0], ep[1] + 1.4, ep[2]])) dd *= 0.5;
        d = Math.min(d, dd);
      }
      return { s, d: d + Math.random() * 6 };
    }).sort((a, b) => b.d - a.d);
    const s = scored[Math.floor(Math.random() * Math.min(3, scored.length))].s;
    const spot = findFreeSpot(this.world, s) || s;
    p.ms.pos[0] = spot[0]; p.ms.pos[1] = spot[1]; p.ms.pos[2] = spot[2];
    p.ms.vel = [0, 0, 0]; p.ms.onGround = false; p.ms.sliding = false; p.ms.crouching = false; p.ms.height = PLAYER.height;
    p.prevPos = [...p.ms.pos];
    p.hp = PLAYER.maxHealth; p.alive = true; p.protectUntil = this.time + PLAYER.spawnProtect;
    p.mag.rifle = WEAPONS.rifle.mag; p.mag.pistol = WEAPONS.pistol.mag; p.reloadUntil = 0; p.bloom = 0;
    p.nades = GRENADE.max; p.nadeT = 0; p.blinkCd = 0; p.blink = null; p.weapon = 'rifle';
    p.yaw = Math.atan2(spot[0], spot[2]); // face roughly toward the centre
    p.pitch = 0;
    if (p.isLocal) {
      this.view.yaw = p.yaw; this.view.pitch = 0; this.view.recoil = 0;
      this.vm.setWeapon('rifle', true); this.vm.cancelReload(); this.vm._start('equip', 0.4);
      this.hud.death(null);
    }
    if (this.net) this.net.send('spawn', { id: p.id, p: spot.map(r2) });
  }

  // ---------------------------------------------------------------- bots
  _ensureBots() {
    if (!this.isHost) return;
    const mine = this.bots.filter(b => b.p.owner === this.selfId);
    const want = this.botCount;
    while (mine.length < want) {
      const n = mine.length;
      const used = new Set([...this.players.values()].map(p => p.name));
      let name = BOT_NAMES.find(x => !used.has(x)) || 'Bot' + n;
      const id = this.selfId + ':b' + Math.random().toString(36).slice(2, 6);
      const color = COLORS[(n + 1) % COLORS.length];
      const p = this.addPlayer(id, { name, color, isBot: true, owner: this.selfId });
      const bot = new Bot(this, p, this.difficulty);
      this.bots.push(bot); mine.push(bot);
      this.spawn(p);
    }
    while (mine.length > want) { const b = mine.pop(); this.removePlayer(b.p.id); }
  }

  setBotCount(n) { this.botCount = n; this._ensureBots(); }
  setDifficulty(d) { this.difficulty = d; for (const b of this.bots) b.setDifficulty(d); if (this.net && this.isHost) this._sendMatch(); }

  // ---------------------------------------------------------------- combat
  forward(yaw, pitch) {
    const cp = Math.cos(pitch);
    return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
  }

  spreadFor(p, adsAmt) {
    const W = WEAPONS[p.weapon];
    let s = W.spreadHip + (W.spreadAds - W.spreadHip) * adsAmt + p.bloom;
    const vel = p.ms ? p.ms.vel : p.rvel;
    const onGround = p.ms ? p.ms.onGround : p.rg;
    const sp = Math.hypot(vel[0], vel[2]);
    if (!onGround) s += W.airSpread * (1 - adsAmt * 0.5);
    else if (sp > 1) s += W.moveSpread * Math.min(1, sp / 7) * (1 - adsAmt * 0.6);
    return s * (p.spreadMul || 1);
  }

  canShoot(p) {
    return p.alive && this.time >= p.nextShot && this.time >= p.reloadUntil && p.mag[p.weapon] > 0;
  }

  // Hitscan shot. Returns {target, head, point}
  fire(p, yaw, pitch, adsAmt, muzzle) {
    const W = WEAPONS[p.weapon];
    const eye = this.eyeOf(p);
    const spread = this.spreadFor(p, adsAmt);
    let d = this.forward(yaw, pitch);
    // random direction in cone
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    const up = Math.abs(d[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
    let rx = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]];
    let rl = Math.hypot(...rx); rx = rx.map(v => v / rl);
    const uy = [rx[1] * d[2] - rx[2] * d[1], rx[2] * d[0] - rx[0] * d[2], rx[0] * d[1] - rx[1] * d[0]];
    d = [0, 1, 2].map(i => d[i] + (rx[i] * Math.cos(a) + uy[i] * Math.sin(a)) * r);
    const dl = Math.hypot(...d); d = d.map(v => v / dl);

    const wh = this.world.raycast(eye[0], eye[1], eye[2], d[0], d[1], d[2], 250);
    let bestT = wh ? wh.t : 250, target = null, head = false;
    for (const o of this.players.values()) {
      if (o === p || !o.alive) continue;
      const hb = this.hitboxes(o);
      const rh = rayBox(eye[0], eye[1], eye[2], d[0], d[1], d[2], hb.head[0], hb.head[1]);
      if (rh && rh.t < bestT) { bestT = rh.t; target = o; head = true; }
      const rb = rayBox(eye[0], eye[1], eye[2], d[0], d[1], d[2], hb.body[0], hb.body[1]);
      if (rb && rb.t < bestT) { bestT = rb.t; target = o; head = false; }
    }
    const point = [eye[0] + d[0] * bestT, eye[1] + d[1] * bestT, eye[2] + d[2] * bestT];
    p.mag[p.weapon]--;
    p.nextShot = Math.max(p.nextShot + W.interval, this.time + W.interval * 0.5);
    if (p.nextShot < this.time) p.nextShot = this.time + W.interval;
    p.bloom = Math.min(W.bloomMax, p.bloom + W.bloomPerShot);
    p.protectUntil = 0;

    const from = muzzle || eye;
    this.effects.tracer(from, point);
    sfx.shot(p.weapon, p.isLocal ? null : this.posOf(p));
    if (!p.isLocal && p.avatar) { this.effects.muzzleFlash(from, 0.5); p.avatar.shoot(); }
    if (target) {
      const dist = bestT;
      let dmg = W.damage;
      if (dist > W.falloffStart) dmg = Math.max(W.minDamage, W.damage - (W.damage - W.minDamage) * Math.min(1, (dist - W.falloffStart) / (W.falloffEnd - W.falloffStart)));
      if (head) dmg *= W.headMul;
      dmg = Math.round(dmg);
      if (!target.isLocal) this.effects.blood(point, target.color);
      this.applyHit(p, target, dmg, head, p.weapon);
    } else if (wh) {
      this.effects.impact(point, wh.normal);
    }
    if (this.net && (p.isLocal || p.isBot)) this.net.send('shot', { id: p.id, o: from.map(r2), e: point.map(r2), w: p.weapon });
    if (p.mag[p.weapon] <= 0) this.reload(p);
    return { target, head, point };
  }

  hitboxes(o) {
    const pos = this.posOf(o), c = this.crouchOf(o);
    const h = c ? PLAYER.crouchHeight : PLAYER.height;
    const r = PLAYER.radius;
    const headH = 0.46;
    return {
      body: [[pos[0] - r, pos[1], pos[2] - r], [pos[0] + r, pos[1] + h - headH, pos[2] + r]],
      head: [[pos[0] - 0.24, pos[1] + h - headH, pos[2] - 0.24], [pos[0] + 0.24, pos[1] + h + 0.02, pos[2] + 0.24]],
    };
  }

  reload(p) {
    const W = WEAPONS[p.weapon];
    if (W.melee) return;
    if (p.mag[p.weapon] >= W.mag || this.time < p.reloadUntil || !p.alive) return;
    p.reloadUntil = this.time + W.reload;
    p.reloadWeapon = p.weapon;
    if (p.isLocal) { this.vm.startReload(W.reload); sfx.reload(null); }
  }

  switchWeapon(p, id) {
    if (p.weapon === id || !p.alive) return;
    if (this.time < p.reloadUntil) { p.reloadUntil = 0; if (p.isLocal) this.vm.cancelReload(); }
    p.weapon = id;
    p.nextShot = Math.max(p.nextShot, this.time + 0.22);
    p.bloom = 0;
    if (p.isLocal) this.vm.setWeapon(id);
  }

  melee(p, yaw, pitch) {
    if (!p.alive || this.time < p.nextMelee || this.match.phase === 'end') return false;
    p.nextMelee = this.time + KNIFE.cooldown;
    p.nextShot = Math.max(p.nextShot, this.time + (p.weapon === 'knife' ? 0 : 0.32));
    if (this.time < p.reloadUntil) { p.reloadUntil = 0; if (p.isLocal) this.vm.cancelReload(); }
    p.protectUntil = 0;
    const eye = this.eyeOf(p), d = this.forward(yaw, pitch);
    let best = null, bestD = Infinity;
    for (const o of this.players.values()) {
      if (o === p || !o.alive) continue;
      const op = this.posOf(o), h = this.crouchOf(o) ? PLAYER.crouchHeight : PLAYER.height;
      // closest point on the target's vertical segment to our eye
      const cy = Math.max(op[1] + 0.2, Math.min(op[1] + h - 0.1, eye[1]));
      const v = [op[0] - eye[0], cy - eye[1], op[2] - eye[2]];
      const dist = Math.hypot(...v);
      if (dist > KNIFE.range + PLAYER.radius) continue;
      const cos = dist > 0.01 ? (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / dist : 1;
      if (Math.acos(Math.max(-1, Math.min(1, cos))) > KNIFE.cone && dist > 0.9) continue;
      if (!this.world.lineOfSight(eye, [op[0], cy, op[2]])) continue;
      if (dist < bestD) { bestD = dist; best = o; }
    }
    sfx.swing(p.isLocal ? null : this.posOf(p));
    if (!p.isLocal && p.avatar) p.avatar.melee();
    if (this.net && (p.isLocal || p.isBot)) this.net.send('melee', { id: p.id });
    if (best) {
      const bp = this.posOf(best);
      this.effects.blood([bp[0], bp[1] + 1.1, bp[2]], best.color);
      sfx.stab(p.isLocal ? null : bp);
      this.applyHit(p, best, KNIFE.damage, false, 'knife');
    }
    return true;
  }

  ownsDamage(target) { return target.isLocal || (target.isBot && target.owner === this.selfId); }

  applyHit(shooter, target, dmg, head, weapon) {
    if (shooter.isLocal) { this.hud.hitmarker(head, target.hp - dmg <= 0 && this.match.phase === 'play'); sfx.hit(head); }
    if (this.ownsDamage(target)) this.damage(target, dmg, shooter.id, weapon, head, this.posOf(shooter));
    else if (this.net) this.net.send('hit', { t: target.id, a: shooter.id, d: dmg, h: head ? 1 : 0, w: weapon, p: this.posOf(shooter).map(r2) }, target.owner);
  }

  damage(target, amount, attackerId, weapon, head, fromPos) {
    if (!target.alive || this.match.phase !== 'play') return;
    if (this.time < target.protectUntil && attackerId !== target.id) return;
    target.hp -= amount; target.lastHurt = this.time;
    if (target.isLocal) {
      sfx.hurt();
      if (fromPos && attackerId !== target.id) {
        const dx = fromPos[0] - target.ms.pos[0], dz = fromPos[2] - target.ms.pos[2];
        const ang = Math.atan2(dx, dz) - (this.view.yaw + Math.PI);
        this.hud.damageFrom(-ang);
      }
      this.view.shake = Math.min(0.5, this.view.shake + amount / 200);
    }
    if (target.isBot) { const b = this.bots.find(x => x.p === target); if (b) b.onHurt(attackerId); }
    if (target.hp <= 0) this.kill(target, attackerId, weapon, head);
  }

  kill(victim, killerId, weapon, head) {
    victim.alive = false;
    victim.hp = 0;
    victim.respawnAt = this.time + PLAYER.respawnTime;
    if (victim.blink) { victim.blink.dead = true; victim.blink = null; }
    const msg = { v: victim.id, k: killerId, w: weapon, h: head ? 1 : 0, p: this.posOf(victim).map(r2) };
    if (this.net) this.net.send('death', msg);
    this.onDeath(msg);
  }

  onDeath(msg) {
    const v = this.players.get(msg.v);
    if (!v) return;
    v.alive = false;
    const k = msg.k && msg.k !== msg.v ? this.players.get(msg.k) : null;
    v.deaths++; v.streak = 0; v.killedBy = k ? k.id : null;
    if (msg.p) this.effects.burst([msg.p[0], msg.p[1] + 1, msg.p[2]], 40, v.color, 5, 0.8);
    if (k) {
      k.kills++; k.streak++; k.best = Math.max(k.best, k.streak);
      k.score += MATCH.scoreKill + (msg.h ? MATCH.scoreHeadshotBonus : 0) + (k.streak >= 3 ? MATCH.scoreStreakBonus * k.streak : 0);
      if (STREAKS[k.streak] && !k.isLocal) this.hud.feedText(`${k.name}: ${STREAKS[k.streak]} (${k.streak})`, k.color);
    } else if (msg.k === msg.v) {
      v.score = Math.max(0, v.score - 50);
    }
    this.hud.addFeed(k ? k.name : null, k ? k.color : '#fff', v.name, v.color, msg.w, !!msg.h);
    if (k && k.isLocal) {
      sfx.kill();
      this.hud.notice(`+${MATCH.scoreKill + (msg.h ? MATCH.scoreHeadshotBonus : 0)}  ELIMINATED ${v.name}${msg.h ? ' · HEADSHOT' : ''}`);
      if (STREAKS[k.streak]) { this.hud.announce(STREAKS[k.streak], `${k.streak} kill streak`); sfx.streak(); }
    }
    if (v.isLocal) { this.deathCam = { from: [...v.ms.pos], killer: k ? k.id : null, t: 0 }; }
    if (this.isHost && this.match.phase === 'play' && k && k.kills >= this.match.killLimit) this._endRound();
  }

  // ---------------------------------------------------------------- utility
  throwGrenade(p, yaw, pitch) {
    if (!p.alive || p.nades <= 0 || this.match.phase === 'end') return;
    p.nades--;
    const d = this.forward(yaw, pitch);
    const eye = this.eyeOf(p);
    const vel = p.ms ? p.ms.vel : p.rvel;
    const pos = [eye[0] + d[0] * 0.5, eye[1] + d[1] * 0.5 - 0.1, eye[2] + d[2] * 0.5];
    const v = [d[0] * GRENADE.throwSpeed + vel[0] * 0.4, d[1] * GRENADE.throwSpeed + GRENADE.upBoost + Math.max(0, vel[1]) * 0.3, d[2] * GRENADE.throwSpeed + vel[2] * 0.4];
    const id = this.selfId + ':' + (this.nextProjId++);
    this.spawnProjectile({ id, kind: 'nade', owner: p.id, pos, vel: v, fuse: GRENADE.fuse, auth: true });
    if (this.net) this.net.send('nade', { id, o: p.id, p: pos.map(r2), v: v.map(r2) });
    sfx.throw(p.isLocal ? null : p.ms ? p.ms.pos : p.rpos);
  }

  blinkAction(p, yaw, pitch) {
    if (!p.alive) return;
    if (p.blink && !p.blink.dead) { this.teleport(p); return; }
    if (p.blinkCd > 0) return;
    const d = this.forward(yaw, pitch);
    const eye = this.eyeOf(p);
    const pos = [eye[0] + d[0] * 0.4, eye[1] + d[1] * 0.4 - 0.1, eye[2] + d[2] * 0.4];
    const v = d.map(x => x * BLINK.throwSpeed);
    const id = this.selfId + ':' + (this.nextProjId++);
    p.blink = this.spawnProjectile({ id, kind: 'blink', owner: p.id, pos, vel: v, fuse: BLINK.life, auth: true, color: p.color });
    sfx.throw(null);
  }

  teleport(p) {
    const b = p.blink;
    if (!b) return;
    const target = [b.pos[0], b.pos[1] - 0.9, b.pos[2]];
    if (b.normal) { target[0] += b.normal[0] * 0.45; target[2] += b.normal[2] * 0.45; }
    const spot = findFreeSpot(this.world, target, p.ms.height);
    b.dead = true; p.blink = null; p.blinkCd = BLINK.cooldown;
    if (!spot) { if (p.isLocal) this.hud.notice('BLINK BLOCKED'); return; }
    const from = [...p.ms.pos];
    p.ms.pos[0] = spot[0]; p.ms.pos[1] = spot[1]; p.ms.pos[2] = spot[2];
    p.prevPos = [...p.ms.pos];
    p.ms.vel[1] = Math.max(p.ms.vel[1], 1.5);
    p.ms.onGround = false;
    this.effects.ring([from[0], from[1] + 1, from[2]], p.color);
    this.effects.ring([spot[0], spot[1] + 1, spot[2]], p.color, !p.isLocal);
    sfx.blink(p.isLocal ? null : spot);
    if (this.net) this.net.send('blink', { id: p.id, a: from.map(r2), b: spot.map(r2) });
  }

  spawnProjectile(pr) {
    const geo = pr.kind === 'nade' ? new THREE.SphereGeometry(0.12, 10, 8) : new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16);
    const mat = pr.kind === 'nade'
      ? new THREE.MeshStandardMaterial({ color: '#384a2c', roughness: 0.6, emissive: '#ff3b1f', emissiveIntensity: 0.25 })
      : new THREE.MeshBasicMaterial({ color: pr.color || '#7ff8ff' });
    pr.mesh = new THREE.Mesh(geo, mat);
    pr.mesh.position.set(...pr.pos);
    pr.mesh.castShadow = true;
    this.scene.add(pr.mesh);
    pr.age = 0; pr.dead = false; pr.stuck = false; pr.normal = null; pr.bounces = 0;
    this.projectiles.push(pr);
    return pr;
  }

  _stepProjectile(pr, dt) {
    pr.age += dt;
    if (pr.kind === 'nade') {
      pr.fuse -= dt;
      if (pr.fuse <= 0) {
        if (pr.auth) { this.explode(pr.pos, pr.owner); if (this.net) this.net.send('boom', { id: pr.id, o: pr.owner, p: pr.pos.map(r2) }); }
        pr.dead = true;
        return;
      }
    } else {
      pr.fuse -= dt;
      if (pr.fuse <= 0) {
        pr.dead = true;
        const owner = this.players.get(pr.owner);
        if (owner && owner.blink === pr) { owner.blink = null; owner.blinkCd = BLINK.cooldown * 0.5; }
        return;
      }
    }
    if (pr.stuck) return;
    pr.vel[1] -= (pr.kind === 'nade' ? GRENADE.gravity : BLINK.gravity) * dt;
    const h = 0.1;
    const mn = [pr.pos[0] - h, pr.pos[1] - h, pr.pos[2] - h], mx = [pr.pos[0] + h, pr.pos[1] + h, pr.pos[2] + h];
    for (const axis of [0, 1, 2]) {
      const r = this.world.sweepAxis(mn, mx, axis, pr.vel[axis] * dt);
      if (r.hit) {
        if (pr.kind === 'blink') {
          pr.stuck = true; pr.normal = [0, 0, 0]; pr.normal[axis] = pr.vel[axis] > 0 ? -1 : 1;
          pr.vel = [0, 0, 0];
          break;
        }
        const sp = Math.abs(pr.vel[axis]);
        pr.vel[axis] *= -GRENADE.restitution;
        if (axis === 1) { pr.vel[0] *= 0.75; pr.vel[2] *= 0.75; }
        if (sp > 2.5) sfx.bounce(pr.pos);
      }
    }
    pr.pos = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    if (pr.pos[1] < -20) pr.dead = true;
  }

  explode(pos, ownerId) {
    this.effects.explosion(pos);
    sfx.boom(pos);
    if (this.local.alive) {
      const lp = this.local.ms.pos;
      const d = Math.hypot(lp[0] - pos[0], lp[1] + 1 - pos[1], lp[2] - pos[2]);
      this.view.shake = Math.min(1, this.view.shake + Math.max(0, 1 - d / 25) * 0.8);
    }
    for (const p of this.players.values()) {
      if (!p.alive || !this.ownsDamage(p)) continue;
      const pp = p.ms.pos;
      const c = [pp[0], pp[1] + 0.9, pp[2]];
      const d = Math.hypot(c[0] - pos[0], c[1] - pos[1], c[2] - pos[2]);
      if (d > GRENADE.radius) continue;
      const src = [pos[0], pos[1] + 0.15, pos[2]];
      if (!this.world.lineOfSight(src, c) && !this.world.lineOfSight(src, [pp[0], pp[1] + 1.6, pp[2]])) continue;
      const k = 1 - d / GRENADE.radius;
      let dmg = GRENADE.maxDamage * (0.25 + 0.75 * k);
      if (p.id === ownerId) dmg *= GRENADE.selfDamageMul;
      // knockback (nade jumps!)
      const dir = [c[0] - pos[0], c[1] - pos[1] + 0.6, c[2] - pos[2]];
      const dl = Math.hypot(...dir) || 1;
      const push = 11 * k;
      p.ms.vel[0] += dir[0] / dl * push; p.ms.vel[1] += dir[1] / dl * push; p.ms.vel[2] += dir[2] / dl * push;
      p.ms.onGround = false;
      this.damage(p, Math.round(dmg), ownerId, 'grenade', false, pos);
    }
  }

  // ---------------------------------------------------------------- match flow (host)
  _endRound() {
    const ranked = [...this.players.values()].sort((a, b) => b.kills - a.kills || b.score - a.score);
    const w = ranked[0];
    if (w) w.wins++;
    this.match.phase = 'end'; this.match.t = MATCH.intermission; this.match.winner = w ? w.id : null;
    this._onPhase('end');
    this._sendMatch();
  }

  _startWarmup() {
    this.match.phase = 'warmup'; this.match.t = MATCH.warmup; this.match.round++;
    this.match.winner = null;
    this._onPhase('warmup');
    this._sendMatch();
  }

  _onPhase(ph) {
    if (ph === 'warmup') {
      for (const p of this.players.values()) { p.kills = 0; p.deaths = 0; p.score = 0; p.streak = 0; p.best = 0; }
      for (const p of this.players.values()) if (this.simulatedHere(p)) this.spawn(p);
      for (const pr of this.projectiles) pr.dead = true;
      this.hud.scoreboard(false, []);
    }
    if (ph === 'play') { sfx.go(); this.hud.announce('FIGHT!', `First to ${this.match.killLimit} kills`); }
    if (ph === 'end') {
      const w = this.players.get(this.match.winner);
      this.hud.announce(w ? (w.isLocal ? 'YOU WIN THE ROUND!' : `${w.name} WINS`) : 'ROUND OVER', `Round ${this.match.round}`);
    }
  }

  _hostMatch(dt) {
    const m = this.match;
    m.t -= dt;
    if (m.phase === 'warmup' && m.t <= 0) { m.phase = 'play'; m.t = m.roundTime; this._onPhase('play'); this._sendMatch(); }
    else if (m.phase === 'play' && m.t <= 0) this._endRound();
    else if (m.phase === 'end' && m.t <= 0) this._startWarmup();
    if (this.net && this.time - this.lastMatchSend > 1) this._sendMatch();
  }

  _sendMatch() {
    if (!this.net) return;
    this.lastMatchSend = this.time;
    this.net.send('match', { ph: this.match.phase, t: r2(this.match.t), r: this.match.round, w: this.match.winner, kl: this.match.killLimit, bc: this.botCount, df: this.difficulty });
  }

  // ---------------------------------------------------------------- networking
  _setupNet() {
    const net = this.net;
    this.roomCode = this.opts.roomCode;
    const hello = (to) => net.send('hello', { n: this.local.name, c: this.local.color }, to);
    hello();
    net.onJoin((id) => { hello(id); this._electHost(); if (this.isHost) { this._sendMatch(); this._sendRoster(true); } });
    net.onLeave((id) => {
      const p = this.players.get(id);
      if (p) this.hud.feedText(`${p.name} left`, '#aaa');
      for (const q of [...this.players.values()]) if (q.id === id || (q.isBot && q.owner === id)) this.removePlayer(q.id);
      this._electHost();
    });
    net.on('hello', (d, from) => {
      let p = this.players.get(from);
      if (!p) { p = this.addPlayer(from, { name: d.n, color: d.c, owner: from }); this.hud.feedText(`${d.n} joined`, d.c); }
      else if (p.name !== d.n || p.color !== d.c) { p.name = d.n; p.color = d.c; p.avatar.setName(d.n, d.c); }
      p.lastSeen = now();
    });
    net.on('st', (d, from) => {
      let p = this.players.get(from);
      if (!p) p = this.addPlayer(from, { name: '...', color: '#ccc', owner: from });
      this._pushSnap(p, d);
    });
    net.on('bs', (d, from) => {
      for (const b of d) {
        const p = this.players.get(b.id);
        if (p && p.owner === from && !p.ms) this._pushSnap(p, b);
      }
    });
    net.on('roster', (d, from) => {
      if (from !== this.hostId) return;
      const ids = new Set();
      for (const [id, name, color] of d.bots) {
        ids.add(id);
        if (!this.players.has(id)) this.addPlayer(id, { name, color, isBot: true, owner: from });
      }
      for (const p of [...this.players.values()]) if (p.isBot && p.owner === from && !ids.has(p.id)) this.removePlayer(p.id);
      for (const [id, s] of Object.entries(d.s || {})) {
        const p = this.players.get(id);
        if (!p) continue;
        [p.kills, p.deaths, p.score, p.streak, p.best, p.wins] = s;
      }
    });
    net.on('match', (d, from) => {
      if (from !== this.hostId) return;
      const prev = this.match.phase;
      this.match.t = d.t; this.match.round = d.r; this.match.winner = d.w; this.match.killLimit = d.kl;
      this.botCount = d.bc; this.difficulty = d.df;
      if (d.ph !== prev) {
        if (d.ph === 'end' && d.w) { const w = this.players.get(d.w); if (w) w.wins++; }
        this.match.phase = d.ph; this._onPhase(d.ph);
      }
    });
    net.on('hit', (d) => {
      const t = this.players.get(d.t);
      if (t && this.ownsDamage(t)) this.damage(t, d.d, d.a, d.w, !!d.h, d.p);
    });
    net.on('death', (d) => this.onDeath(d));
    net.on('spawn', (d) => {
      const p = this.players.get(d.id);
      if (p && !p.ms) { p.alive = true; p.snaps.length = 0; p.rpos = [...d.p]; }
    });
    net.on('shot', (d) => {
      const p = this.players.get(d.id);
      if (!p || p.ms) return;
      this.effects.tracer(d.o, d.e);
      this.effects.muzzleFlash(d.o, 0.5);
      if (p.avatar) p.avatar.shoot();
      this.effects.impact(d.e, null);
      sfx.shot(d.w, d.o);
    });
    net.on('nade', (d) => {
      this.spawnProjectile({ id: d.id, kind: 'nade', owner: d.o, pos: d.p, vel: d.v, fuse: GRENADE.fuse + 0.6, auth: false });
    });
    net.on('boom', (d) => {
      for (const pr of this.projectiles) if (pr.id === d.id) pr.dead = true;
      this.explode(d.p, d.o);
    });
    net.on('blink', (d) => {
      const p = this.players.get(d.id);
      const col = p ? p.color : '#7ff8ff';
      this.effects.ring([d.a[0], d.a[1] + 1, d.a[2]], col);
      this.effects.ring([d.b[0], d.b[1] + 1, d.b[2]], col);
      sfx.blink(d.b);
      if (p && !p.ms) { p.snaps.length = 0; p.rpos = [...d.b]; }
    });
    net.on('melee', (d) => {
      const p = this.players.get(d.id);
      if (!p || p.ms) return;
      if (p.avatar) p.avatar.melee();
      sfx.swing(this.posOf(p));
    });
    net.on('ping', (d, from) => net.send('pong', d, from));
    net.on('pong', (d, from) => { const p = this.players.get(from); if (p) p.ping = Math.round((now() - d) * 1000); });
    this._electHost();
  }

  _electHost() {
    if (!this.net) return;
    const ids = [this.selfId, ...this.net.peerIds()].sort();
    const prev = this.hostId;
    this.hostId = ids[0];
    if (prev !== this.hostId) {
      if (this.isHost) {
        this.botCount = this.botCount ?? this.opts.bots;
        // take over: drop bots owned by the old host, spawn our own
        for (const p of [...this.players.values()]) if (p.isBot && p.owner !== this.selfId) this.removePlayer(p.id);
        this._ensureBots();
        this._sendMatch();
      } else {
        for (const b of [...this.bots]) this.removePlayer(b.p.id);
      }
    }
    if (this.isHost) this._ensureBots();
  }

  _sendRoster(force) {
    if (!this.net) return;
    this.lastRosterSend = this.time;
    const s = {};
    for (const p of this.players.values()) s[p.id] = [p.kills, p.deaths, p.score, p.streak, p.best, p.wins];
    this.net.send('roster', { bots: this.bots.map(b => [b.p.id, b.p.name, b.p.color]), s });
  }

  _stateOf(p) {
    const m = p.ms;
    return { id: p.id, p: m.pos.map(r2), v: m.vel.map(r2), y: r2(p.yaw), pi: r2(p.pitch), c: m.crouching ? 1 : 0, g: m.onGround ? 1 : 0, s: m.sliding ? 1 : 0, a: p.alive ? 1 : 0, w: p.weapon, hp: Math.round(p.hp) };
  }

  _pushSnap(p, d) {
    p.lastSeen = now();
    p.snaps.push({ t: now(), p: d.p, y: d.y, pi: d.pi, c: d.c, g: d.g, v: d.v, s: d.s });
    if (p.snaps.length > 30) p.snaps.shift();
    if (d.a && !p.alive) p.alive = true;
    if (!d.a && p.alive) p.alive = false;
    p.weapon = d.w; p.hp = d.hp;
  }

  _interpRemote(p) {
    const rt = now() - 0.1;
    const s = p.snaps;
    if (!s.length) return;
    let a = s[0], b = s[s.length - 1];
    for (let i = s.length - 1; i >= 0; i--) if (s[i].t <= rt) { a = s[i]; b = s[i + 1] || s[i]; break; }
    let k = b.t > a.t ? (rt - a.t) / (b.t - a.t) : 1;
    let lerpPos;
    if (rt > b.t) { // extrapolate briefly
      const ex = Math.min(0.1, rt - b.t);
      lerpPos = [b.p[0] + b.v[0] * ex, b.p[1] + b.v[1] * ex, b.p[2] + b.v[2] * ex];
    } else {
      k = Math.max(0, Math.min(1, k));
      lerpPos = [0, 1, 2].map(i => a.p[i] + (b.p[i] - a.p[i]) * k);
    }
    // teleport if far (respawn / blink)
    p.rpos = lerpPos;
    let dy = b.y - a.y; if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2;
    p.yaw = a.y + dy * Math.max(0, Math.min(1, k));
    p.pitch = a.pi + (b.pi - a.pi) * Math.max(0, Math.min(1, k));
    p.rc = !!b.c; p.rg = !!b.g; p.rs = !!b.s; p.rvel = b.v;
  }

  // ---------------------------------------------------------------- main update
  update(dtRaw) {
    const dt = Math.min(dtRaw, 0.1);
    this.time += dt;
    const inp = this.input;
    const L = this.local;
    const sens = (this.settings.sens || 1) * 0.0022 * (this.view.ads > 0.5 ? WEAPONS[L.weapon].adsFov * 0.85 : 1);
    const inputActive = !this.paused && document.pointerLockElement != null || this.forceInput;
    if (inputActive && L.alive) {
      this.view.yaw -= inp.dx * sens;
      this.view.pitch -= inp.dy * sens * (this.settings.invert ? -1 : 1);
      this.view.pitch = Math.max(-1.55, Math.min(1.55, this.view.pitch));
    }
    const mdx = inp.dx, mdy = inp.dy;
    inp.dx = 0; inp.dy = 0;
    const keys = inputActive ? inp.keys : new Set();
    const pressed = inputActive ? inp.pressed : new Set();

    // aim includes recoil
    const aimPitch = this.view.pitch + this.view.recoil;
    const aimYaw = this.view.yaw + this.view.recoilYaw;
    L.yaw = this.view.yaw; L.pitch = aimPitch;

    // --- local actions
    const canAct = L.alive && this.match.phase !== 'end';
    const adsHeld = inputActive && inp.mouseR && L.alive && this.time >= L.reloadUntil;
    this.view.ads += ((adsHeld ? 1 : 0) - this.view.ads) * Math.min(1, dt * 14);
    if (canAct) {
      if (pressed.has('Digit1')) this.switchWeapon(L, 'rifle');
      if (pressed.has('Digit2')) this.switchWeapon(L, 'pistol');
      if (pressed.has('Digit3')) this.switchWeapon(L, 'knife');
      if (pressed.has('wheel')) this.switchWeapon(L, { rifle: 'pistol', pistol: 'knife', knife: 'rifle' }[L.weapon]);
      if (pressed.has('KeyV') && L.weapon !== 'knife') { if (this.melee(L, aimYaw, aimPitch)) this.vm.quickKnife(); }
      if (pressed.has('KeyR')) this.reload(L);
      if (pressed.has('KeyG')) this.throwGrenade(L, aimYaw, aimPitch);
      if (pressed.has('KeyQ') || pressed.has('KeyE')) this.blinkAction(L, aimYaw, aimPitch);
      const W = WEAPONS[L.weapon];
      const wantFire = inputActive && (W.auto ? inp.mouseL : inp.clickL);
      if (W.melee) {
        if (inputActive && inp.mouseL && this.match.phase !== 'end' && this.melee(L, aimYaw, aimPitch)) this.vm.slash();
        inp.clickL = false;
      } else if (this.vm.busy) {
        inp.clickL = false;
      } else if (wantFire && this.match.phase !== 'end') {
        if (this.canShoot(L)) {
                    const muzzle = this._vmMuzzleWorld();
          this.fire(L, aimYaw, aimPitch, this.view.ads, muzzle);
          this.vm.fire(L.weapon);
          const rk = 1 - this.view.ads * 0.35;
          this.view.recoil += W.recoilPitch * rk * (0.8 + Math.random() * 0.4);
          this.view.recoilYaw += (Math.random() - 0.5) * 2 * W.recoilYaw * rk;
          inp.clickL = false;
        } else if (L.mag[L.weapon] <= 0 && inp.clickL) { sfx.dry(); this.reload(L); inp.clickL = false; }
        else if (!W.auto && this.time + 0.12 < L.nextShot) inp.clickL = false; // too early: drop buffered click
      } else if (!W.auto) inp.clickL = false;
    } else inp.clickL = false;
    if (!(inp.mouseL && inputActive)) {
      L.bloom = Math.max(0, L.bloom - dt * 0.12);
      this.view.recoil *= Math.exp(-dt * 9);
      this.view.recoilYaw *= Math.exp(-dt * 9);
    } else {
      this.view.recoil *= Math.exp(-dt * 3.2);
      this.view.recoilYaw *= Math.exp(-dt * 3.5);
    }
    if (pressed.has('KeyH')) { this.helpShown = !this.helpShown; this.helpUntil = Infinity; }
    inp.pressed.clear();

    // --- reload completion & utility timers for simulated players
    for (const p of this.players.values()) {
      if (!this.simulatedHere(p)) continue;
      if (p.reloadUntil && this.time >= p.reloadUntil) {
        if (p.reloadWeapon === p.weapon) p.mag[p.weapon] = WEAPONS[p.weapon].mag;
        p.reloadUntil = 0;
      }
      if (p.nades < GRENADE.max) { p.nadeT += dt; if (p.nadeT >= GRENADE.rechargeTime) { p.nadeT = 0; p.nades++; } }
      if (p.blinkCd > 0 && !p.blink) p.blinkCd = Math.max(0, p.blinkCd - dt);
      if (!p.isLocal) p.bloom = Math.max(0, p.bloom - dt * 0.1);
      if (p.alive && this.time - p.lastHurt > PLAYER.regenDelay && p.hp < PLAYER.maxHealth) p.hp = Math.min(PLAYER.maxHealth, p.hp + PLAYER.regenRate * dt);
      if (!p.alive && this.match.phase !== 'end' && (this.time >= p.respawnAt || this.match.phase === 'warmup')) this.spawn(p);
    }

    // --- fixed-step simulation
    const mvIn = emptyInput();
    if (L.alive) {
      mvIn.fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      mvIn.right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      mvIn.jump = keys.has('Space');
      mvIn.crouch = keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyC') || keys.has('ControlLeft');
      mvIn.yaw = this.view.yaw;
      mvIn.ads = this.view.ads > 0.5;
      mvIn.speedMul = L.weapon === 'knife' ? KNIFE.speedMul : 1;
    }
    this.acc += dt;
    let steps = 0;
    while (this.acc >= SIM_DT && steps < 24) {
      this.acc -= SIM_DT; steps++;
      if (L.alive) {
        L.prevPos = [...L.ms.pos];
        stepMovement(L.ms, mvIn, SIM_DT, this.world);
        if (L.ms.events.includes('step') || (L.ms.onGround && L.ms.pos[1] - L.prevPos[1] > 0.08 && L.ms.pos[1] - L.prevPos[1] < 0.6)) {
          const dy = L.ms.pos[1] - L.prevPos[1];
          if (dy > 0.05) this.view.step = Math.max(-0.6, this.view.step - dy);
        }
        this._moveEvents(L);
        if (L.ms.pos[1] < this.map.bounds.minY) this.kill(L, L.id, 'fall', false);
      }
      for (const b of this.bots) if (b.p.alive) {
        b.p.prevPos = [...b.p.ms.pos];
        b.step(SIM_DT);
        this._moveEvents(b.p);
        if (b.p.ms.pos[1] < this.map.bounds.minY) this.kill(b.p, b.p.id, 'fall', false);
      }
      for (const pr of this.projectiles) if (!pr.dead) this._stepProjectile(pr, SIM_DT);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      if (pr.dead) { this.scene.remove(pr.mesh); pr.mesh.geometry.dispose(); pr.mesh.material.dispose(); this.projectiles.splice(i, 1); continue; }
      pr.mesh.position.set(...pr.pos);
      if (pr.kind === 'blink') { pr.mesh.rotation.y += dt * 12; pr.mesh.rotation.x = pr.normal && pr.normal[1] === 0 ? Math.PI / 2 : 0; }
      if (pr.kind === 'nade' && Math.random() < 0.3) this.effects.particle(pr.pos, [0, 0.5, 0], '#ff7b4a', 0.25, 0);
    }
    for (const b of this.bots) b.think(this.time);

    // --- host match logic + network sends
    if (this.isHost) this._hostMatch(dt);
    else this.match.t -= dt;
    if (this.net) {
      if (this.time - this.lastStateSend > 0.05) {
        this.lastStateSend = this.time;
        this.net.send('st', this._stateOf(L));
        if (this.isHost && this.bots.length) this.net.send('bs', this.bots.map(b => this._stateOf(b.p)));
      }
      if (this.isHost && this.time - this.lastRosterSend > 2) this._sendRoster();
      if (!this._lastPing || this.time - this._lastPing > 2) { this._lastPing = this.time; this.net.send('ping', now()); }
    }

    // --- remote interpolation + avatars
    for (const p of this.players.values()) {
      if (p.isLocal) continue;
      if (!p.ms) this._interpRemote(p);
      const pos = this.posOf(p);
      const vel = p.ms ? p.ms.vel : p.rvel;
      const air = p.ms ? !p.ms.onGround : !p.rg;
      p.avatar.update(dt, { pos, yaw: p.yaw, pitch: p.pitch, vel, crouched: this.crouchOf(p), airborne: air, sliding: p.ms ? p.ms.sliding : p.rs, alive: p.alive, weapon: p.weapon });
    }

    this._updateCamera(dt, mdx, mdy);
    this.effects.update(dt);
    for (const r of this.map.padRings) { r.position.y = 0.3 + (this.time * 0.8 % 1) * 1.2; r.material.opacity = 0.6 * (1 - (this.time * 0.8 % 1)); }
    this._updateHud(dt, keys);
  }

  _vmMuzzleWorld() {
    const m = this.vm.models[this.vm.current].muzzle;
    this.vm.holder.updateMatrixWorld(true);
    const v = new THREE.Vector3(); m.getWorldPosition(v);
    // vm space -> world: vm camera sits at origin looking -z; map through main camera
    v.applyQuaternion(this.camera.quaternion).add(this.camera.position);
    return [v.x, v.y, v.z];
  }

  _moveEvents(p) {
    const pos = p.isLocal ? null : p.ms.pos;
    for (const e of p.ms.events) {
      if (e === 'jump') sfx.jump(pos);
      else if (e === 'djump') { sfx.djump(pos); this.effects.burst([p.ms.pos[0], p.ms.pos[1] + 0.1, p.ms.pos[2]], 12, '#ffffff', 2, 0.35, null, 2); }
      else if (e === 'land') { sfx.land(pos, Math.min(1.5, (p.ms.landSpeed || 5) / 8)); if (p.isLocal) this.view.land = Math.min(0.25, (p.ms.landSpeed || 0) * 0.018); }
      else if (e === 'slide') sfx.slide(pos);
      else if (e === 'pad') { sfx.pad(pos || p.ms.pos); this.effects.ring([p.ms.pos[0], p.ms.pos[1] + 0.3, p.ms.pos[2]], '#7ff8ff', !p.isLocal); }
    }
    // footsteps
    const sp = Math.hypot(p.ms.vel[0], p.ms.vel[2]);
    if (p.ms.onGround && !p.ms.sliding && sp > 2) {
      p.stepAcc = (p.stepAcc || 0) + sp * SIM_DT;
      if (p.stepAcc > 2.4) { p.stepAcc = 0; sfx.step(pos); }
    }
  }

  _updateCamera(dt, mdx, mdy) {
    const L = this.local, v = this.view, cam = this.camera;
    const baseFov = this.settings.fov || 75;
    if (L.alive) {
      const a = this.acc / SIM_DT;
      const p = [0, 1, 2].map(i => L.prevPos[i] + (L.ms.pos[i] - L.prevPos[i]) * a);
      v.eyeH = v.eyeH ?? PLAYER.eye;
      v.eyeH += ((L.ms.crouching ? PLAYER.crouchEye : PLAYER.eye) - v.eyeH) * Math.min(1, dt * 14);
      v.land *= Math.exp(-dt * 9);
      v.step *= Math.exp(-dt * 14);
      cam.position.set(p[0], p[1] + v.eyeH - v.land + v.step, p[2]);
      const sp = Math.hypot(L.ms.vel[0], L.ms.vel[2]);
      v.roll += ((L.ms.sliding ? 0.06 : 0) - v.roll) * Math.min(1, dt * 8);
      v.fovKick += (Math.max(0, sp - 8) * 0.9 - v.fovKick) * Math.min(1, dt * 4);
      cam.rotation.set(v.pitch + v.recoil, v.yaw + v.recoilYaw, v.roll);
      const adsMul = 1 + (WEAPONS[L.weapon].adsFov - 1) * v.ads;
      cam.fov = (baseFov + v.fovKick * (1 - v.ads)) * adsMul;
      this.vm.update(dt, { ads: v.ads > 0.5, speed: sp, onGround: L.ms.onGround, mouseDX: mdx, mouseDY: mdy, sliding: L.ms.sliding, vy: L.ms.vel[1] });
      this.deathCam = null;
    } else if (this.deathCam) {
      const dc = this.deathCam; dc.t += dt;
      const k = Math.min(1, dc.t * 1.5);
      cam.position.set(dc.from[0], dc.from[1] + 1.6 + k * 2.5, dc.from[2]);
      const killer = dc.killer && this.players.get(dc.killer);
      if (killer) {
        const kp = this.posOf(killer);
        const look = new THREE.Vector3(kp[0], kp[1] + 1.2, kp[2]);
        const m = new THREE.Matrix4().lookAt(cam.position, look, new THREE.Vector3(0, 1, 0));
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        cam.quaternion.slerp(q, Math.min(1, dt * 5));
      } else cam.rotation.x += (-0.6 - cam.rotation.x) * Math.min(1, dt * 3);
      cam.fov = baseFov;
    }
    if (v.shake > 0) {
      v.shake = Math.max(0, v.shake - dt * 1.6);
      cam.rotation.x += (Math.random() - 0.5) * v.shake * 0.05;
      cam.rotation.y += (Math.random() - 0.5) * v.shake * 0.05;
    }
    cam.updateProjectionMatrix();
    this.vm.camera.fov = 60 * (1 + (WEAPONS[L.weapon].adsFov - 1) * v.ads * 0.5);
    this.vm.camera.updateProjectionMatrix();
    setListener(cam.position.x, cam.position.y, cam.position.z, v.yaw);
    this.sun.position.set(cam.position.x + 28, 44, cam.position.z + 22);
    this.sun.target.position.set(cam.position.x, 0, cam.position.z);
    this.sky.position.copy(cam.position);
  }

  _updateHud(dt, keys) {
    const L = this.local, h = this.hud;
    const W = WEAPONS[L.weapon];
    const reloading = this.time < L.reloadUntil;
    h.setVitals(L.hp, PLAYER.maxHealth, L.alive ? Math.hypot(L.ms.vel[0], L.ms.vel[2]) : 0);
    h.setWeapon(L.weapon, W.name, L.mag[L.weapon] ?? 0, W.mag, reloading, reloading ? 1 - (L.reloadUntil - this.time) / W.reload : 0);
    const blinkActive = !!(L.blink && !L.blink.dead);
    h.setAbilities({
      nades: L.nades, nadeMax: GRENADE.max, nadePct: L.nadeT / GRENADE.rechargeTime, nadeLeft: GRENADE.rechargeTime - L.nadeT,
      blink: blinkActive ? 'active' : L.blinkCd > 0 ? 'cooldown' : 'ready', blinkPct: L.blinkCd / BLINK.cooldown, blinkCd: L.blinkCd,
      knifeReady: this.time >= L.nextMelee,
    });
    h.setCrosshair(this.spreadFor(L, this.view.ads), L.alive && this.view.ads < 0.6, L.weapon === 'knife');
    h.setStreak(L.streak);
    // contextual prompt
    let prompt = '';
    if (L.alive) {
      if (blinkActive) prompt = 'Press <kbd>Q</kbd> to WARP to your disc';
      else if (W.mag && L.mag[L.weapon] === 0 && !reloading) prompt = 'Press <kbd>R</kbd> to reload';
      else if (this.match.phase === 'warmup' && this.match.round === 1) prompt = 'Press <kbd>H</kbd> for controls &amp; abilities';
    }
    h.prompt(prompt);
    if (this.helpUntil !== Infinity && this.time > this.helpUntil) { this.helpShown = false; this.helpUntil = Infinity; }
    h.help(this.helpShown && this.match.phase !== 'end');
    const ranked = this.ranking();
    const rank = ranked.indexOf(L) + 1;
    const top = ranked[0] === L ? null : ranked[0];
    h.setMatch({
      timeLeft: this.match.t, round: this.match.round, phase: this.match.phase, myKills: L.kills, killLimit: this.match.killLimit,
      rank, total: ranked.length, leaderName: top ? top.name : '', leaderKills: top ? top.kills : 0, leaderColor: top ? top.color : '#fff',
      roomCode: this.roomCode, players: [...this.players.values()].filter(p => !p.isBot).length, isHost: this.net && this.isHost,
    });
    if (!L.alive && this.match.phase !== 'end') {
      const k = L.killedBy && this.players.get(L.killedBy);
      h.death(k ? k.name : '', k ? k.color : '#fff', L.respawnAt - this.time);
    } else h.death(null);
    if (this.match.phase === 'warmup') h.center(Math.ceil(this.match.t) > 0 ? String(Math.ceil(this.match.t)) : '');
    else h.center('');
    if (this.match.phase === 'warmup' && this._lastTick !== Math.ceil(this.match.t)) { this._lastTick = Math.ceil(this.match.t); if (this._lastTick > 0) sfx.tick(); }
    const showSb = keys.has('Tab') || this.match.phase === 'end';
    if (showSb) {
      const w = this.match.winner && this.players.get(this.match.winner);
      h.scoreboard(true, ranked.map(p => ({ name: p.name, color: p.color, bot: p.isBot, score: p.score, kills: p.kills, deaths: p.deaths, best: p.best, wins: p.wins, me: p.isLocal, ping: p.isLocal ? '' : p.isBot ? 'BOT' : (p.ping ? p.ping + 'ms' : '') })),
        this.match.phase === 'end' ? (w ? `${w.name} wins round ${this.match.round}` : 'Round over') : `ROUND ${this.match.round} · FREE FOR ALL`,
        this.match.phase === 'end' ? `Next round in ${Math.max(0, Math.ceil(this.match.t))}s` : 'Hold TAB');
    } else h.scoreboard(false, []);
    h.update(dt);
  }

  ranking() { return [...this.players.values()].sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths); }

  render() {
    const r = this.renderer;
    r.autoClear = false;
    r.clear();
    r.render(this.scene, this.camera);
    if (this.local.alive) { r.clearDepth(); r.render(this.vm.scene, this.vm.camera); }
  }

  dispose() {
    if (this.net) this.net.leave();
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}
