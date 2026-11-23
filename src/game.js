// Core game: players, combat, projectiles, match flow, networking glue and rendering.
import * as THREE from 'three';
import { SIM_DT, PLAYER, MOVE, WEAPONS, GRENADE, BLINK, MATCH, STREAKS, COLORS, KNIFE, PRIMARIES, SECONDARIES, GUNS, DEFAULT_LOADOUT, PLANT } from './config.js';
import { World, rayBox } from './physics.js';
import { buildMap, PLANT_MAPS } from './maps/index.js';
import { MODES, TEAMS, FLAG, other, resolveRules } from './modes.js';
import { Minimap } from './minimap.js';
import { makeMoveState, emptyInput, stepMovement, findFreeSpot } from './movement.js';
import { Avatar } from './avatar.js';
import { ViewModel } from './viewmodel.js';
import { Effects } from './effects.js';
import { Hud } from './hud.js';
import { sfx, setListener } from './audio.js';
import { Bot, BOT_NAMES } from './bots.js';
import { PlantMode } from './plant.js';
import { loadoutHtml, LOADOUT_KEYS } from './panels.js';

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
    this.mapId = opts.map || 'maple';
    this.mode = MODES[opts.mode] ? opts.mode : 'ffa';
    if (MODES[this.mode].plant && !PLANT_MAPS.includes(this.mapId)) this.mapId = PLANT_MAPS[0];
    this._builtMap = this.mapId;
    this.teamScore = { A: 0, B: 0 };
    this.rules = resolveRules(this.mode, opts.rules);
    this.match = { phase: 'warmup', t: MATCH.warmup, round: 1, winner: null, winnerTeam: null, killLimit: this.rules.limit, roundTime: this.rules.time };
    this.lastMatchSend = 0; this.lastStateSend = 0; this.lastRosterSend = 0;
    this.kicked = new Set();
    this.paused = false;

    this._setupScene();
    this.world = new World();
    this.map = buildMap(this.mapId, this.world, this.scene);
    this._applyEnv();
    this.effects = new Effects(this.scene);
    this._applyEnv();
    this._initFlags();
    this.vm = new ViewModel(opts.color, renderer);
    this.hud = new Hud();
    this.minimap = new Minimap(this);

    this.plant = MODES[this.mode].plant && this.map.plant ? new PlantMode(this) : null;
    this.panelOpen = null;
    this.local = this.addPlayer(this.selfId, { name: opts.name, color: opts.color, isLocal: true, owner: this.selfId });
    if (opts.loadout) this.local.loadout = { primary: PRIMARIES.includes(opts.loadout.primary) ? opts.loadout.primary : 'rifle', secondary: SECONDARIES.includes(opts.loadout.secondary) ? opts.loadout.secondary : 'pistol' };
    if (this.teams && !this.net) this.local.team = 'A';
    this.spawn(this.local);
    if (this.net) this._setupNet(); else this._ensureBots();
    this.onResize();
    this._prewarm();
  }

  // Compile every shader and upload every texture now, so the first shot, explosion,
  // blink or scope-in doesn't hitch mid-fight.
  _prewarm() {
    try {
      this.effects.setWarm(true);
      const far = [0, -40, 0];
      const a = this.spawnProjectile({ id: 'warm1', kind: 'nade', owner: 'x', pos: far, vel: [0, 0, 0], fuse: 0, auth: false });
      const b = this.spawnProjectile({ id: 'warm2', kind: 'blink', owner: 'x', pos: far, vel: [0, 0, 0], fuse: 0, auth: false, color: this.local.color });
      const vis = {};
      for (const k in this.vm.models) { vis[k] = this.vm.models[k].g.visible; this.vm.models[k].g.visible = true; }
      this.vm.flashSprite.visible = true;
      this.renderer.compile(this.scene, this.camera);
      this.renderer.compile(this.vm.scene, this.vm.camera);
      this.render();
      for (const k in this.vm.models) this.vm.models[k].g.visible = vis[k];
      this.vm.flashSprite.visible = false;
      this.effects.setWarm(false);
      a.dead = true; b.dead = true;
      for (const pr of [a, b]) { this.scene.remove(pr.mesh); this.projectiles.splice(this.projectiles.indexOf(pr), 1); }
    } catch (e) { console.warn('prewarm', e); }
  }

  get isHost() { return this.hostId === this.selfId; }
  get teams() { return MODES[this.mode].teams; }
  displayColor(p) { return this.teams && p.team ? TEAMS[p.team].color : p.color; }
  isEnemy(a, b) { return a !== b && !(this.teams && a.team && a.team === b.team); }

  // ---------------------------------------------------------------- loadouts
  loadoutOf(p) {
    if (this.plant) return { primary: (p.inv && p.inv.primary) || null, secondary: (p.inv && p.inv.secondary) || 'pistol' };
    return p.loadout;
  }
  ownedWeapons(p) { const l = this.loadoutOf(p); return [l.primary, l.secondary, 'knife'].filter(Boolean); }
  // Non-economy modes: choice takes effect now if you only just spawned, otherwise on the next spawn.
  setLoadout(p, lo) {
    const next = { primary: PRIMARIES.includes(lo.primary) ? lo.primary : 'rifle', secondary: SECONDARIES.includes(lo.secondary) ? lo.secondary : 'pistol' };
    if (this.plant) return;
    if (p.alive && this.time - (p.spawnT || 0) < 6 && !p.firedSinceSpawn) {
      p.loadout = next; p.pendingLoadout = null;
      for (const w of GUNS) p.mag[w] = WEAPONS[w].mag;
      p.reloadUntil = 0;
      const w = next.primary;
      p.weapon = w; if (p.isLocal) { this.vm.cancelReload(); this.vm.setWeapon(w); }
    } else p.pendingLoadout = next;
  }
  // Panels take the mouse: release pointer lock while open, take it back when closed.
  setPanel(kind) {
    if (kind === this.panelOpen) return;
    const was = this.panelOpen; this.panelOpen = kind;
    if (kind && !was && this.opts.panelCursor) this.opts.panelCursor(true);
    if (!kind && was && this.opts.panelCursor) this.opts.panelCursor(false);
  }
  _panelPick(i) {
    const L = this.local;
    if (this.panelOpen === 'buy' && this.plant) { this.plant.buy(L, i); return; }
    if (this.panelOpen !== 'loadout') return;
    const w = LOADOUT_KEYS[i]; if (!w) return;
    const cur = L.pendingLoadout || L.loadout;
    const next = { ...cur, [PRIMARIES.includes(w) ? 'primary' : 'secondary']: w };
    this.setLoadout(L, next);
    if (this.opts.onLoadout) this.opts.onLoadout(next);
    this.hud.setSlots(this.ownedWeapons(L));
  }
  _botLoadout(bot) {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    return { primary: bot.role === 'sniper' ? 'sniper' : pick(['rifle', 'rifle', 'smg', 'smg', 'shotgun']), secondary: Math.random() < 0.4 ? 'hcannon' : 'pistol' };
  }

  _applyEnv() {
    const e = this.map.env, u = this.sky.material.uniforms;
    u.top.value.set(e.top); u.mid.value.set(e.mid); u.bot.value.set(e.bot);
    this.scene.fog.color.set(e.fog);
    this.hemi.color.set(e.hemiSky); this.hemi.groundColor.set(e.hemiGround);
    this.sun.color.set(e.sun); this.sun.intensity = e.sunI;
    if (this.effects) this.effects.setAmbient(e.ambient || null, e.cloud || '#ffffff');
  }

  // ---------------------------------------------------------------- teams
  setTeam(p, team) {
    if (!team || p.team === team) return;
    const had = p.team;
    p.team = team;
    if (p.avatar) {
      const vis = p.avatar.root.visible;
      p.avatar.dispose(this.scene);
      p.avatar = new Avatar(this.displayColor(p), p.name);
      p.avatar.root.visible = vis;
      this.scene.add(p.avatar.root);
    }
    if (p.isLocal && had && this.teams) this.hud.announce(`YOU ARE ${TEAMS[team].name}`, 'Team changed');
    if (this.simulatedHere(p) && had && this.teams && p.alive && !p.afk) this.spawn(p);
  }

  _pickTeam(exclude) {
    const c = { A: 0, B: 0 };
    for (const o of this.players.values()) if (o !== exclude && o.team) c[o.team]++;
    return c.A < c.B ? 'A' : c.B < c.A ? 'B' : (Math.random() < 0.5 ? 'A' : 'B');
  }

  // Host only: everyone gets a team; bots are shuffled to keep sides even.
  _balanceTeams() {
    if (!this.teams || !this.isHost) return;
    for (const p of this.players.values()) if (!p.team) this.setTeam(p, this._pickTeam(p));
    for (let guard = 0; guard < 10; guard++) {
      const c = { A: 0, B: 0 };
      for (const o of this.players.values()) c[o.team]++;
      const big = c.A - c.B > 1 ? 'A' : c.B - c.A > 1 ? 'B' : null;
      if (!big) break;
      const bot = this.bots.find(b => b.p.team === big);
      if (!bot) break;
      this.setTeam(bot.p, other(big));
    }
    if (this.net) this._sendRoster();
  }

  // ---------------------------------------------------------------- flags (CTF)
  _initFlags() {
    if (this.flagGroup) { this.scene.remove(this.flagGroup); this.flagGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    this.flags = null; this.flagGroup = null;
    if (this.mode !== 'ctf') return;
    this.flagGroup = new THREE.Group();
    this.flags = {};
    for (const t of ['A', 'B']) {
      const base = this.map.flags[t];
      const g = new THREE.Group();
      const col = TEAMS[t].color;
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.08), new THREE.MeshStandardMaterial({ color: '#e8e8e8', metalness: 0.4, roughness: 0.4 }));
      pole.position.y = 1.2; g.add(pole);
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, 1.1), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.45 }));
      cloth.position.set(0, 2.0, 0.58); g.add(cloth);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.07, 6, 28), new THREE.MeshBasicMaterial({ color: col }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(base[0], base[1] + 0.06, base[2]);
      this.flagGroup.add(ring);
      this.flagGroup.add(g);
      this.flags[t] = { state: 'home', pos: [...base], carrier: null, dropT: 0, mesh: g, cloth };
    }
    this.scene.add(this.flagGroup);
  }

  carrying(p) {
    if (!this.flags) return null;
    for (const t of ['A', 'B']) if (this.flags[t].state === 'carried' && this.flags[t].carrier === p.id) return t;
    return null;
  }

  _flagEvent(t, ev, by) {
    const f = this.flags[t];
    const pl = by && this.players.get(by);
    const mine = this.local.team === t;
    const name = pl ? pl.name : '';
    if (ev === 'take') {
      if (pl && pl.isLocal) this.hud.announce('YOU HAVE THE FLAG', 'Bring it back to your base');
      else this.hud.feedText(`${name} took ${TEAMS[t].name}'s flag`, TEAMS[t].color);
      if (mine && !(pl && pl.isLocal)) this.hud.notice('YOUR FLAG WAS TAKEN');
      sfx.pad(null);
    } else if (ev === 'drop') this.hud.feedText(`${TEAMS[t].name} flag dropped`, TEAMS[t].color);
    else if (ev === 'return') { this.hud.feedText(`${TEAMS[t].name} flag returned${name ? ' by ' + name : ''}`, TEAMS[t].color); }
    else if (ev === 'capture') {
      const capTeam = other(t);
      this.hud.announce(`${TEAMS[capTeam].name} SCORES!`, `${name} captured the flag`);
      sfx.streak();
    }
    f.lastEv = ev;
  }

  _setFlag(t, state, pos, carrier, ev, by) {
    const f = this.flags[t];
    f.state = state; f.carrier = carrier || null; f.dropT = 0;
    if (pos) f.pos = [...pos];
    if (ev) this._flagEvent(t, ev, by);
    if (this.net && this.isHost) this.net.send('flag', { t, s: state, p: f.pos.map(r2), c: f.carrier, ev, by });
  }

  _hostFlags(dt) {
    if (!this.flags || this.match.phase !== 'play') return;
    for (const t of ['A', 'B']) {
      const f = this.flags[t], base = this.map.flags[t];
      if (f.state === 'carried') {
        const c = this.players.get(f.carrier);
        if (!c || !c.alive || c.afk) { const pp = c ? this.posOf(c) : f.pos; this._setFlag(t, 'dropped', [pp[0], Math.max(0, pp[1]), pp[2]], null, 'drop'); continue; }
        // capture: carrier reaches own base while own flag is home
        const own = this.flags[c.team], ob = this.map.flags[c.team], cp = this.posOf(c);
        if (own.state === 'home' && Math.hypot(cp[0] - ob[0], cp[2] - ob[2]) < FLAG.capture && Math.abs(cp[1] - ob[1]) < 2) {
          this.teamScore[c.team]++; c.score += FLAG.scoreCapture; c.caps = (c.caps || 0) + 1;
          this._setFlag(t, 'home', base, null, 'capture', c.id);
          this._sendMatch();
          if (this.match.killLimit && this.teamScore[c.team] >= this.match.killLimit) this._endRound();
        }
        continue;
      }
      if (f.state === 'dropped') { f.dropT += dt; if (f.dropT > FLAG.returnTime) { this._setFlag(t, 'home', base, null, 'return'); continue; } }
      for (const p of this.players.values()) {
        if (!p.alive || p.afk || !p.team) continue;
        const pp = this.posOf(p);
        if (Math.hypot(pp[0] - f.pos[0], pp[2] - f.pos[2]) > FLAG.touch || Math.abs(pp[1] - f.pos[1]) > 2) continue;
        if (p.team !== t) { if (!this.carrying(p)) { p.score += FLAG.scorePickup; this._setFlag(t, 'carried', f.pos, p.id, 'take', p.id); break; } }
        else if (f.state === 'dropped') { p.score += FLAG.scoreReturn; this._setFlag(t, 'home', base, null, 'return', p.id); break; }
      }
    }
    if (this.net && this.time - (this._lastFlagSync || 0) > 1) {
      this._lastFlagSync = this.time;
      for (const t of ['A', 'B']) { const f = this.flags[t]; this.net.send('flag', { t, s: f.state, p: f.pos.map(r2), c: f.carrier }); }
    }
  }

  _updateFlagMeshes(dt) {
    if (!this.flags) return;
    for (const t of ['A', 'B']) {
      const f = this.flags[t];
      let p = f.pos;
      if (f.state === 'carried') { const c = this.players.get(f.carrier); if (c) { const cp = c.isLocal ? c.ms.pos : this.posOf(c); p = [cp[0], cp[1] + 0.9, cp[2]]; f.pos = [cp[0], cp[1], cp[2]]; } }
      f.mesh.position.set(p[0], p[1], p[2]);
      f.mesh.rotation.y += dt * (f.state === 'home' ? 0.8 : 2.5);
      f.mesh.visible = !(f.state === 'carried' && f.carrier === this.local.id && this.local.alive);
      f.cloth.scale.y = 1 + Math.sin(this.time * 6) * 0.05;
    }
  }

  // ---------------------------------------------------------------- map / mode switching
  applyMatchSettings(mapId, mode, broadcast = false, rules = null) {
    const mapChanged = mapId !== this.mapId;
    const modeChanged = mode !== this.mode;
    this.mode = MODES[mode] ? mode : 'ffa';
    if (MODES[this.mode].plant && !PLANT_MAPS.includes(mapId)) mapId = PLANT_MAPS[0];
    this.mapId = mapId;
    const mapChanged2 = mapChanged || mapId !== this._builtMap;
    if (rules || modeChanged) this.rules = resolveRules(this.mode, rules);
    if (mapChanged2) {
      this._builtMap = mapId;
      this.scene.remove(this.map.group);
      this.map.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); });
      this.world = new World();
      this.map = buildMap(this.mapId, this.world, this.scene);
      this._applyEnv();
      this.effects.clearHoles();
      this.minimap.rebuild();
    }
    for (const b of this.bots) { b.path = []; b.pi = 0; b.target = null; }
    if (this.plant) { this.plant.dispose(); this.plant = null; }
    if (MODES[this.mode].plant && this.map.plant) this.plant = new PlantMode(this);
    this.setPanel(null);
    this._initFlags();
    this.teamScore = { A: 0, B: 0 };
    this.match.killLimit = this.rules.limit; this.match.roundTime = this.rules.time;
    this.match.phase = 'warmup'; this.match.t = MATCH.warmup; this.match.round = 1; this.match.winner = null; this.match.winnerTeam = null;
    for (const p of this.players.values()) { p.wins = 0; if (!this.teams) this.setTeamNull(p); }
    if (this.teams) { if (!this.net) { if (!this.local.team) this.setTeam(this.local, 'A'); for (const b of this.bots) if (!b.p.team) this.setTeam(b.p, this._pickTeam(b.p)); } this._balanceTeams(); }
    this._onPhase('warmup');
    this.hud.announce(`${MODES[this.mode].name}`, `${this.map.info.name} · ${MODES[this.mode].blurb}`);
    if (broadcast && this.net && this.isHost) { this.net.send('restart', { mp: this.mapId, mo: this.mode, ru: this.rules }); this._sendMatch(); }
  }

  setTeamNull(p) {
    if (!p.team) return;
    p.team = null;
    if (p.avatar) { const vis = p.avatar.root.visible; p.avatar.dispose(this.scene); p.avatar = new Avatar(p.color, p.name); p.avatar.root.visible = vis; this.scene.add(p.avatar.root); }
  }

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
    this.hemi = new THREE.HemisphereLight('#d9ecff', '#6b8f4e', 1.25);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight('#fff3dc', 2.4);
    sun.position.set(28, 44, 22);
    sun.castShadow = (this.settings.quality || 'medium') !== 'low';
    const sm = this.settings.quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(sm, sm);
    const sc = sun.shadow.camera; sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 1; sc.far = 130;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target);
    this.sun = sun;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov || 75, 1, 0.1, 400);
    this.camera.rotation.order = 'YXZ';
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.vm.setAspect(w / h);
    this.effects.setViewport(h * Math.min(window.devicePixelRatio || 1, this.renderer.getPixelRatio ? this.renderer.getPixelRatio() : 1), this.camera.fov);
  }

  // ---------------------------------------------------------------- players
  addPlayer(id, { name, color, isBot = false, isLocal = false, owner, team = null }) {
    const p = {
      id, name, color, isBot, isLocal, owner, team,
      ms: (isLocal || (isBot && owner === this.selfId)) ? makeMoveState([0, 0, 0]) : null,
      prevPos: [0, 0, 0], rpos: [0, -50, 0], rvel: [0, 0, 0], rc: false, rg: true, snaps: [],
      yaw: 0, pitch: 0, hp: PLAYER.maxHealth, alive: false, respawnAt: 0, protectUntil: 0,
      weapon: 'rifle', mag: Object.fromEntries(GUNS.map(w => [w, WEAPONS[w].mag])), reloadUntil: 0, nextShot: 0, bloom: 0,
      loadout: { ...DEFAULT_LOADOUT }, pendingLoadout: null,
      nades: GRENADE.max, nadeT: 0, blinkCd: 0, blink: null, nextMelee: 0, afk: false,
      kills: 0, deaths: 0, score: 0, streak: 0, best: 0, wins: 0, lastHurt: -99, lastSeen: now(), killedBy: null,
      avatar: null,
    };
    if (!isLocal) {
      p.avatar = new Avatar(this.displayColor(p), name);
      p.avatar.root.visible = false;
      this.scene.add(p.avatar.root);
    }
    this.players.set(id, p);
    if (this.plant) this.plant.initPlayer(p);
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
    const enemies = [...this.players.values()].filter(o => o !== p && o.alive && !o.afk && this.isEnemy(o, p));
    const pool = p.afk ? this.map.afkSpawns : this.plant && p.team ? this.map.plant[this.plant.roleOf(p) === 'attack' ? 'attack' : 'defend'] : (this.teams && p.team ? this.map.teamSpawns[p.team] : this.map.spawns);
    const scored = pool.map(s => {
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
    p.hp = PLAYER.maxHealth; p.alive = true; p.protectUntil = p.afk ? Infinity : this.plant ? 0 : this.time + PLAYER.spawnProtect;
    if (p.pendingLoadout && !this.plant) { p.loadout = p.pendingLoadout; p.pendingLoadout = null; }
    for (const w of GUNS) p.mag[w] = WEAPONS[w].mag;
    p.spray = 0; p.reloadUntil = 0; p.bloom = 0; p.spawnT = this.time; p.firedSinceSpawn = false;
    p.nades = GRENADE.max; p.nadeT = 0; p.blinkCd = 0; p.blink = null; p.weapon = this.ownedWeapons(p)[0]; p.armour = 0;
    if (this.plant && p.inv) { p.nades = p.inv.nades; p.armour = p.inv.armour; }
    p.yaw = Math.atan2(spot[0], spot[2]); // face roughly toward the centre
    p.pitch = 0;
    if (p.isLocal) {
      this.view.yaw = p.yaw; this.view.pitch = 0; this.view.recoil = 0;
      this.vm.setWeapon(p.weapon, true); this.vm.cancelReload(); this.vm._start('equip', 0.4);
      this.hud.setSlots(this.ownedWeapons(p));
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
      const p = this.addPlayer(id, { name, color, isBot: true, owner: this.selfId, team: this.teams ? this._pickTeam() : null });
      const bot = new Bot(this, p, this.difficulty);
      if (n % 4 === 3) bot.role = 'sniper';
      p.loadout = this._botLoadout(bot);
      this.bots.push(bot); mine.push(bot);
      this.spawn(p);
    }
    while (mine.length > want) { const b = mine.pop(); this.removePlayer(b.p.id); }
    if (this.teams) this._balanceTeams();
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
    return s * (p.spreadMul || 1) + (p.spreadAdd || 0);
  }

  canShoot(p) {
    if (!p.alive || this.time < p.nextShot || p.mag[p.weapon] <= 0) return false;
    if (this.plant && this.plant.frozen) return false;
    if (this.time >= p.reloadUntil) return true;
    return !!WEAPONS[p.weapon].shells && p.reloadWeapon === p.weapon;   // pump guns can fire mid-reload
  }

  // random direction within a cone of radius r around d
  _jitter(d, r) {
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r;
    const up = Math.abs(d[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
    let rx = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]];
    const rl = Math.hypot(...rx); rx = rx.map(v => v / rl);
    const uy = [rx[1] * d[2] - rx[2] * d[1], rx[2] * d[0] - rx[0] * d[2], rx[0] * d[1] - rx[1] * d[0]];
    const o = [0, 1, 2].map(i => d[i] + (rx[i] * Math.cos(a) + uy[i] * Math.sin(a)) * rr);
    const ol = Math.hypot(...o); return o.map(v => v / ol);
  }

  _trace(p, eye, d) {
    const wh = this.world.raycast(eye[0], eye[1], eye[2], d[0], d[1], d[2], 250);
    let bestT = wh ? wh.t : 250, target = null, head = false;
    for (const o of this.players.values()) {
      if (o === p || !o.alive || o.afk || !this.isEnemy(p, o)) continue;
      const hb = this.hitboxes(o);
      const rh = rayBox(eye[0], eye[1], eye[2], d[0], d[1], d[2], hb.head[0], hb.head[1]);
      if (rh && rh.t < bestT) { bestT = rh.t; target = o; head = true; }
      const rb = rayBox(eye[0], eye[1], eye[2], d[0], d[1], d[2], hb.body[0], hb.body[1]);
      if (rb && rb.t < bestT) { bestT = rb.t; target = o; head = false; }
    }
    return { wh, t: bestT, target, head, point: [eye[0] + d[0] * bestT, eye[1] + d[1] * bestT, eye[2] + d[2] * bestT] };
  }

  // Hitscan shot (or a spread of pellets). Returns {target, head, point} of the first ray.
  fire(p, yaw, pitch, adsAmt, muzzle) {
    const W = WEAPONS[p.weapon];
    if (W.shells && this.time < p.reloadUntil) { p.reloadUntil = 0; if (p.isLocal) this.vm.cancelReload(); }
    const eye = this.eyeOf(p);
    const spread = this.spreadFor(p, adsAmt);
    const d0 = this.forward(yaw, pitch);
    const n = W.pellets || 1;
    const from = muzzle || eye;
    const ends = [], hits = new Map();
    let first = null;
    for (let i = 0; i < n; i++) {
      const d = this._jitter(d0, n > 1 ? spread + W.pelletCone : spread);
      const r = this._trace(p, eye, d);
      if (!first) first = r;
      ends.push(r.point);
      if (n > 1 && i % 2 === 0) this.effects.tracer(from, r.point, 0.6);
      if (r.target) {
        let dmg = W.damage;
        if (r.t > W.falloffStart) dmg = Math.max(W.minDamage, W.damage - (W.damage - W.minDamage) * Math.min(1, (r.t - W.falloffStart) / (W.falloffEnd - W.falloffStart)));
        if (r.head) dmg *= W.headMul;
        const h = hits.get(r.target) || { dmg: 0, head: false, point: r.point };
        h.dmg += dmg; h.head = h.head || r.head; hits.set(r.target, h);
      } else if (r.wh && r.wh.box.tag !== 'invisible') {
        this.effects.impact(r.point, r.wh.normal, r.wh.box.mat, n > 1 ? 0.5 : W.heavy || p.weapon === 'sniper' ? 1.6 : 1);
        if (r.wh.box.tag !== 'angled') this.effects.hole(r.point, r.wh.normal, p.weapon === 'sniper' || W.heavy ? 1.5 : p.weapon === 'pistol' ? 0.85 : n > 1 ? 0.6 : 1);
      }
    }
    p.mag[p.weapon]--;
    p.nextShot = Math.max(p.nextShot + W.interval, this.time + W.interval * 0.5);
    if (p.nextShot < this.time) p.nextShot = this.time + W.interval;
    p.bloom = Math.min(W.bloomMax, p.bloom + W.bloomPerShot);
    p.protectUntil = 0; p.firedSinceSpawn = true;

    if (n === 1) this.effects.tracer(from, first.point);
    sfx.shot(p.weapon, p.isLocal ? null : this.posOf(p));
    if (!p.isLocal && p.avatar) { this.effects.muzzleFlash(from, W.heavy || n > 1 ? 0.8 : 0.5); p.avatar.shoot(); }
    for (const [t, h] of hits) {
      if (!t.isLocal) this.effects.blood(h.point, t.color);
      this.applyHit(p, t, Math.round(h.dmg), h.head, p.weapon);
    }
    if (this.net && (p.isLocal || p.isBot)) this.net.send('shot', { id: p.id, o: from.map(r2), e: ends[0].map(r2), es: n > 1 ? ends.slice(1).map(e => e.map(r2)) : undefined, w: p.weapon });
    if (p.mag[p.weapon] <= 0) this.reload(p);
    return { target: first.target, head: first.head, point: first.point };
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

  // Spray pattern: the first shots climb straight up; longer bursts add a left/right sway.
  recoilKick(W, i) {
    if (W.pattern) {
      const r = () => (Math.random() - 0.5), k = W.patternScale || 1;
      if (i < 3) return [(0.0042 + r() * 0.0008) * k, r() * 0.0004 * k];
      if (i < 9) return [(0.0082 + r() * 0.001) * k, r() * 0.0012 * k];
      const sway = Math.sin((i - 9) * 0.52 + 0.5);
      return [(0.0016 + r() * 0.0008) * k, (0.0068 * sway + r() * 0.0012) * k];
    }
    return [W.recoilPitch * (0.85 + Math.random() * 0.3), (Math.random() - 0.5) * 2 * W.recoilYaw];
  }

  // Scoped weapons only become accurate once fully scoped in.
  adsAccuracy(p, ads) {
    const W = WEAPONS[p.weapon];
    if (W.scope) return ads > 0.92 ? 1 : ads * 0.25;
    return ads;
  }

  reload(p) {
    const W = WEAPONS[p.weapon];
    if (W.melee) return;
    if (p.mag[p.weapon] >= W.mag || this.time < p.reloadUntil || !p.alive) return;
    let dur = W.reload, shells = 0;
    if (W.shells) { shells = W.mag - p.mag[p.weapon]; dur = W.reloadStart + shells * W.reload + W.reloadEnd; p.reloadStart = this.time; p.reloadBase = p.mag[p.weapon]; }
    p.reloadUntil = this.time + dur;
    p.reloadWeapon = p.weapon;
    if (p.isLocal) { this.vm.startReload(dur, shells); sfx.reload(null, p.weapon); }
  }

  switchWeapon(p, id) {
    if (p.weapon === id || !p.alive || !this.ownedWeapons(p).includes(id)) return;
    if (this.time < p.reloadUntil) { p.reloadUntil = 0; if (p.isLocal) this.vm.cancelReload(); }
    p.weapon = id;
    p.nextShot = Math.max(p.nextShot, this.time + 0.22);
    p.bloom = 0;
    if (p.isLocal) this.vm.setWeapon(id);
  }

  melee(p, yaw, pitch) {
    if (!p.alive || this.time < p.nextMelee || this.match.phase === 'end' || (this.plant && this.plant.frozen)) return false;
    p.nextMelee = this.time + KNIFE.cooldown;
    p.nextShot = Math.max(p.nextShot, this.time + (p.weapon === 'knife' ? 0 : 0.32));
    if (this.time < p.reloadUntil) { p.reloadUntil = 0; if (p.isLocal) this.vm.cancelReload(); }
    p.protectUntil = 0;
    const eye = this.eyeOf(p), d = this.forward(yaw, pitch);
    let best = null, bestD = Infinity;
    for (const o of this.players.values()) {
      if (o === p || !o.alive || o.afk || !this.isEnemy(p, o)) continue;
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
    if (!target.alive || target.afk || this.match.phase !== 'play') return;
    const atk = this.players.get(attackerId); if (atk && atk.afk) return;
    if (atk && atk !== target && !this.isEnemy(atk, target)) return;   // no friendly fire
    if (this.time < target.protectUntil && attackerId !== target.id) return;
    if (this.plant && this.plant.frozen) return;
    if (this.plant && target.armour > 0 && weapon !== 'charge' && weapon !== 'fall') {
      const ab = Math.min(target.armour, amount * PLANT.armourAbsorb);
      target.armour -= ab; amount -= ab;
    }
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
    victim.respawnAt = this.plant ? Infinity : this.time + this.rules.respawn;
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
    this.hud.addFeed(k ? k.name : null, k ? this.displayColor(k) : '#fff', v.name, this.displayColor(v), msg.w, !!msg.h);
    if (k && k.isLocal) {
      sfx.kill();
      this.hud.notice(`+${MATCH.scoreKill + (msg.h ? MATCH.scoreHeadshotBonus : 0)}  ELIMINATED ${v.name}${msg.h ? ' · HEADSHOT' : ''}`);
      if (STREAKS[k.streak]) { this.hud.announce(STREAKS[k.streak], `${k.streak} kill streak`); sfx.streak(); }
    }
    if (v.isLocal) { this.deathCam = { from: [...v.ms.pos], killer: k ? k.id : null, t: 0 }; }
    this.minimap.onDeath(v, msg.p);
    if (this.plant) this.plant.onDeath(v, k, msg.w, msg.p);
    if (this.mode === 'tdm' && k && this.isEnemy(k, v) && this.match.phase === 'play') this.teamScore[k.team]++;
    if (this.isHost && this.match.phase === 'play') {
      if (this.mode === 'ffa' && k && this.match.killLimit && k.kills >= this.match.killLimit) this._endRound();
      if (this.mode === 'tdm' && k && this.match.killLimit && this.teamScore[k.team] >= this.match.killLimit) this._endRound();
    }
  }

  // ---------------------------------------------------------------- utility
  throwGrenade(p, yaw, pitch) {
    if (!p.alive || p.nades <= 0 || this.match.phase === 'end' || (this.plant && this.plant.frozen)) return;
    p.nades--;
    if (this.plant && p.inv) p.inv.nades = p.nades;
    const d = this.forward(yaw, pitch);
    const eye = this.eyeOf(p);
    const vel = p.ms ? p.ms.vel : p.rvel;
    const pos = [eye[0] + d[0] * 0.5, eye[1] + d[1] * 0.5 - 0.1, eye[2] + d[2] * 0.5];
    const v = [d[0] * GRENADE.throwSpeed + vel[0] * 0.4, d[1] * GRENADE.throwSpeed + GRENADE.upBoost + Math.max(0, vel[1]) * 0.3, d[2] * GRENADE.throwSpeed + vel[2] * 0.4];
    const id = this.selfId + ':' + (this.nextProjId++);
    const pr = this.spawnProjectile({ id, kind: 'nade', owner: p.id, pos, vel: v, fuse: GRENADE.fuse, auth: true });
    // local thrower: the grenade leaves the viewmodel hand ~0.1 s in; hide the world copy until then (spawn is not delayed)
    if (p.isLocal) { pr.hideT = 0.1; pr.mesh.visible = false; this.vm.throwItem('nade'); }
    if (this.net) this.net.send('nade', { id, o: p.id, p: pos.map(r2), v: v.map(r2) });
    sfx.throw(p.isLocal ? null : p.ms ? p.ms.pos : p.rpos);
  }

  blinkAction(p, yaw, pitch) {
    if (!p.alive || (this.plant && this.plant.frozen)) return;
    if (this.carrying(p)) { if (p.isLocal) this.hud.notice('NO BLINKING WITH THE FLAG'); return; }
    if (p.blink && !p.blink.dead) { this.teleport(p); return; }
    if (p.blinkCd > 0) return;
    const d = this.forward(yaw, pitch);
    const eye = this.eyeOf(p);
    const pos = [eye[0] + d[0] * 0.4, eye[1] + d[1] * 0.4 - 0.1, eye[2] + d[2] * 0.4];
    const v = d.map(x => x * BLINK.throwSpeed);
    const id = this.selfId + ':' + (this.nextProjId++);
    p.blink = this.spawnProjectile({ id, kind: 'blink', owner: p.id, pos, vel: v, fuse: BLINK.life, auth: true, color: p.color });
    if (p.isLocal) { p.blink.hideT = 0.08; p.blink.mesh.visible = false; this.vm.throwItem('blink'); }
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
    if (!this._proj) {
      this._proj = {
        nadeGeo: new THREE.SphereGeometry(0.12, 10, 8), discGeo: new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16),
        nadeMat: new THREE.MeshStandardMaterial({ color: '#384a2c', roughness: 0.6, emissive: '#ff3b1f', emissiveIntensity: 0.25 }), discMats: new Map(),
      };
    }
    const P = this._proj;
    let mat = P.nadeMat;
    if (pr.kind !== 'nade') {
      const col = pr.color || '#7ff8ff';
      if (!P.discMats.has(col)) P.discMats.set(col, new THREE.MeshBasicMaterial({ color: col }));
      mat = P.discMats.get(col);
    }
    pr.mesh = new THREE.Mesh(pr.kind === 'nade' ? P.nadeGeo : P.discGeo, mat);
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
      const src = [pos[0], pos[1] + 0.2, pos[2]];
      const visible = [pp[1] + 0.3, pp[1] + 0.9, pp[1] + 1.6].some(y => this.world.lineOfSight(src, [pp[0], y, pp[2]]));
      if (!visible && d > 3) continue;
      const k = 1 - d / GRENADE.radius;
      let dmg = GRENADE.maxDamage * (GRENADE.minFrac + (1 - GRENADE.minFrac) * k) * (visible ? 1 : 0.55);
      if (p.id === ownerId) dmg *= GRENADE.selfDamageMul;
      // knockback (nade jumps!)
      const dir = [c[0] - pos[0], c[1] - pos[1] + 0.6, c[2] - pos[2]];
      const dl = Math.hypot(...dir) || 1;
      const push = 14 * k;
      p.ms.vel[0] += dir[0] / dl * push; p.ms.vel[1] += dir[1] / dl * push; p.ms.vel[2] += dir[2] / dl * push;
      p.ms.onGround = false;
      this.damage(p, Math.round(dmg), ownerId, 'grenade', false, pos);
    }
  }

  // ---------------------------------------------------------------- match flow (host)
  _endRound() {
    this.match.winner = null; this.match.winnerTeam = null;
    if (this.teams) {
      const t = this.teamScore.A > this.teamScore.B ? 'A' : this.teamScore.B > this.teamScore.A ? 'B' : null;
      this.match.winnerTeam = t;
      if (t) for (const p of this.players.values()) if (p.team === t) p.wins++;
    } else {
      const ranked = [...this.players.values()].sort((a, b) => b.kills - a.kills || b.score - a.score);
      const w = ranked[0];
      if (w) { w.wins++; this.match.winner = w.id; }
    }
    this.match.phase = 'end'; this.match.t = MATCH.intermission;
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
      for (const p of this.players.values()) { p.kills = 0; p.deaths = 0; p.score = 0; p.streak = 0; p.best = 0; p.caps = 0; }
      this.teamScore = { A: 0, B: 0 };
      if (this.plant) this.plant.resetMatch();
      if (this.flags) for (const t of ['A', 'B']) { const f = this.flags[t]; f.state = 'home'; f.carrier = null; f.pos = [...this.map.flags[t]]; f.dropT = 0; }
      for (const p of this.players.values()) if (this.simulatedHere(p)) this.spawn(p);
      for (const pr of this.projectiles) pr.dead = true;
      this.effects.clearHoles();
      this.hud.scoreboard(false, []);
    }
    if (ph === 'play' && this.plant) { /* rounds announce themselves */ }
    else if (ph === 'play') {
      sfx.go();
      const M = MODES[this.mode], L = this.match.killLimit;
      const goal = L ? `first to ${L} ${this.teams ? M.limitLabel : 'kills'}` : (this.match.roundTime ? 'most points at the buzzer' : 'no limits, endless');
      this.hud.announce('FIGHT!', this.teams ? `${TEAMS[this.local.team || 'A'].name} · ${goal}` : goal.charAt(0).toUpperCase() + goal.slice(1));
    }
    if (ph === 'end') {
      if (this.teams) {
        const t = this.match.winnerTeam;
        this.hud.announce(t ? (t === this.local.team ? 'YOUR TEAM WINS!' : `${TEAMS[t].name} WINS`) : 'DRAW', `Round ${this.match.round}`);
      } else {
        const w = this.players.get(this.match.winner);
        this.hud.announce(w ? (w.isLocal ? 'YOU WIN THE ROUND!' : `${w.name} WINS`) : 'ROUND OVER', `Round ${this.match.round}`);
      }
    }
  }

  _hostMatch(dt) {
    if (this.plant) { this.plant.hostUpdate(dt); if (this.net && this.time - this.lastMatchSend > 1) this._sendMatch(); return; }
    const m = this.match;
    const endless = m.phase === 'play' && !m.roundTime;
    if (!endless) m.t -= dt;
    if (m.phase === 'warmup' && m.t <= 0) { m.phase = 'play'; m.t = m.roundTime; this._onPhase('play'); this._sendMatch(); }
    else if (m.phase === 'play' && !endless && m.t <= 0) this._endRound();
    else if (m.phase === 'end' && m.t <= 0) this._startWarmup();
    if (this.mode === 'ctf') this._hostFlags(dt);
    if (this.net && this.time - this.lastMatchSend > 1) this._sendMatch();
  }

  _sendMatch() {
    if (!this.net) return;
    this.lastMatchSend = this.time;
    this.net.send('match', { ph: this.match.phase, t: r2(this.match.t), r: this.match.round, w: this.match.winner, wt: this.match.winnerTeam, kl: this.match.killLimit, rt: this.match.roundTime, rs: this.rules.respawn, bc: this.botCount, df: this.difficulty, mp: this.mapId, mo: this.mode, ts: this.teamScore });
  }

  // ---------------------------------------------------------------- AFK box + kick
  setAfk(id, on) {
    const p = this.players.get(id);
    if (!p || p.afk === on) return;
    p.afk = on;
    if (p.ms) this.spawn(p);              // owner teleports into / out of the box
    if (on && p.blink) { p.blink.dead = true; p.blink = null; }
    if (p.isLocal) {
      if (on) this.hud.announce('AFK BOX', `Press ${this.hud.key('back2')} to rejoin the match`);
      else this.hud.announce('BACK IN!', 'Welcome back');
    } else this.hud.feedText(`${p.name} ${on ? 'moved to the AFK box' : 'is back in the match'}`, on ? '#aaa' : p.color);
  }

  requestAfk(id, on) {
    if (this.net) this.net.send('afk', { id, on: on ? 1 : 0 });
    this.setAfk(id, on);
  }

  kickPlayer(id) {
    if (!this.net || !this.isHost || id === this.selfId) return;
    const p = this.players.get(id);
    this.kicked.add(id);
    this.net.send('kick', { id });
    if (p) this.hud.feedText(`${p.name} was removed by the host`, '#ff6b6b');
    for (const q of [...this.players.values()]) if (q.id === id || (q.isBot && q.owner === id)) this.removePlayer(q.id);
  }

  playerList() {
    return [...this.players.values()].filter(p => !p.isBot).map(p => ({
      id: p.id, name: p.name, color: this.displayColor(p), me: p.isLocal, host: p.id === this.hostId, afk: p.afk, ping: p.ping, team: p.team,
    }));
  }

  // ---------------------------------------------------------------- networking
  _setupNet() {
    const net = this.net;
    this.roomCode = this.opts.roomCode;
    const hello = (to) => net.send('hello', { n: this.local.name, c: this.local.color }, to);
    hello();
    net.onJoin((id) => { hello(id); this._electHost(); if (this.isHost) { this._sendMatch(); this._sendRoster(true); if (this.plant) { this.plant._send(); this.plant._sendEcon(); } } });
    net.onLeave((id) => {
      const p = this.players.get(id);
      if (p) this.hud.feedText(`${p.name} left`, '#aaa');
      for (const q of [...this.players.values()]) if (q.id === id || (q.isBot && q.owner === id)) this.removePlayer(q.id);
      this._electHost();
      if (this.isHost && this.teams) this._balanceTeams();
    });
    net.on('hello', (d, from) => {
      if (this.kicked.has(from)) return;
      let p = this.players.get(from);
      if (!p) { p = this.addPlayer(from, { name: d.n, color: d.c, owner: from }); this.hud.feedText(`${d.n} joined`, d.c); if (this.isHost && this.teams) this._balanceTeams(); }
      else if (p.name !== d.n || p.color !== d.c) { p.name = d.n; p.color = d.c; p.avatar.setName(d.n, d.c); }
      p.lastSeen = now();
    });
    net.on('st', (d, from) => {
      if (this.kicked.has(from)) return;
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
      for (const [id, name, color, team] of d.bots) {
        ids.add(id);
        if (!this.players.has(id)) this.addPlayer(id, { name, color, isBot: true, owner: from, team: team || null });
      }
      for (const p of [...this.players.values()]) if (p.isBot && p.owner === from && !ids.has(p.id)) this.removePlayer(p.id);
      for (const [id, s] of Object.entries(d.s || {})) {
        const p = this.players.get(id);
        if (!p) continue;
        [p.kills, p.deaths, p.score, p.streak, p.best, p.wins] = s;
        if (!p.isLocal) p.afk = !!s[6];
        if (s[7] && this.teams) this.setTeam(p, s[7]);
      }
    });
    net.on('match', (d, from) => {
      if (from !== this.hostId) return;
      if ((d.mp && d.mp !== this.mapId) || (d.mo && d.mo !== this.mode)) this.applyMatchSettings(d.mp || this.mapId, d.mo || this.mode);
      const prev = this.match.phase;
      this.match.t = d.t; this.match.round = d.r; this.match.winner = d.w; this.match.winnerTeam = d.wt || null; this.match.killLimit = d.kl;
      if (d.rt !== undefined) { this.match.roundTime = d.rt; this.rules.time = d.rt; this.rules.limit = d.kl; }
      if (d.rs) this.rules.respawn = d.rs;
      if (d.ts) this.teamScore = d.ts;
      this.botCount = d.bc; this.difficulty = d.df;
      if (d.ph !== prev) {
        if (d.ph === 'end' && d.w) { const w = this.players.get(d.w); if (w) w.wins++; }
        if (d.ph === 'end' && d.wt) for (const p of this.players.values()) if (p.team === d.wt) p.wins++;
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
      const W = WEAPONS[d.w] || WEAPONS.rifle;
      this.effects.muzzleFlash(d.o, W.heavy || d.es ? 0.8 : 0.5);
      if (p.avatar) p.avatar.shoot();
      const ends = [d.e, ...(d.es || [])];
      ends.forEach((e, i) => {
        if (!d.es || i % 2 === 0) this.effects.tracer(d.o, e, d.es ? 0.6 : 1);
        const dx = e[0] - d.o[0], dy = e[1] - d.o[1], dz = e[2] - d.o[2], dl = Math.hypot(dx, dy, dz) || 1;
        const h = this.world.raycast(d.o[0], d.o[1], d.o[2], dx / dl, dy / dl, dz / dl, dl + 0.2);
        if (h && h.box.tag !== 'invisible' && Math.abs(h.t - dl) < 0.25) {
          this.effects.impact(e, h.normal, h.box.mat, d.es ? 0.5 : 1);
          if (h.box.tag !== 'angled') this.effects.hole(e, h.normal, d.w === 'sniper' || W.heavy ? 1.5 : d.es ? 0.6 : 1);
        }
      });
      sfx.shot(d.w, d.o);
    });
    net.on('nade', (d) => {
      if (this.plant && this.isHost) { const o = this.players.get(d.o); if (o && o.inv) o.inv.nades = Math.max(0, o.inv.nades - 1); }
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
    net.on('afk', (d, from) => {
      if (from !== this.hostId && from !== d.id) return;   // only the host or the player themself
      this.setAfk(d.id, !!d.on);
    });
    net.on('kick', (d, from) => {
      if (from !== this.hostId) return;
      if (d.id === this.selfId) { if (this.onKicked) this.onKicked(); return; }
      this.kicked.add(d.id);
      const p = this.players.get(d.id);
      if (p) this.hud.feedText(`${p.name} was removed by the host`, '#ff6b6b');
      for (const q of [...this.players.values()]) if (q.id === d.id || (q.isBot && q.owner === d.id)) this.removePlayer(q.id);
    });
    net.on('melee', (d) => {
      const p = this.players.get(d.id);
      if (!p || p.ms) return;
      if (p.avatar) p.avatar.melee();
      sfx.swing(this.posOf(p));
    });
    net.on('flag', (d, from) => {
      if (from !== this.hostId || !this.flags) return;
      const f = this.flags[d.t]; if (!f) return;
      f.state = d.s; f.carrier = d.c || null; if (d.p && d.s !== 'carried') f.pos = d.p;
      if (d.ev) this._flagEvent(d.t, d.ev, d.by);
    });
    net.on('pl', (d, from) => { if (from === this.hostId && this.plant && !this.isHost) this.plant.onNet(d); });
    net.on('pinv', (d, from) => { if (from === this.hostId && this.plant && !this.isHost) this.plant.onEcon(d); });
    net.on('buy', (d, from) => { if (this.isHost && this.plant) this.plant.hostBuy(this.players.get(from), d.i); });
    net.on('pdrop', (d, from) => { if (this.isHost && this.plant) this.plant.hostDrop(from); });
    net.on('pla', (d, from) => { if (this.isHost && this.plant) this.plant.hostAction(from, d.k, d.p); });
    net.on('plp', (d) => { const p = this.players.get(d.id); if (p) sfx.plantStart(this.posOf(p)); });
    net.on('restart', (d, from) => { if (from === this.hostId) this.applyMatchSettings(d.mp, d.mo, false, d.ru || null); });
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
    for (const p of this.players.values()) s[p.id] = [p.kills, p.deaths, p.score, p.streak, p.best, p.wins, p.afk ? 1 : 0, p.team || 0];
    this.net.send('roster', { bots: this.bots.map(b => [b.p.id, b.p.name, b.p.color, b.p.team || 0]), s });
  }

  _stateOf(p) {
    const m = p.ms;
    return { id: p.id, p: m.pos.map(r2), v: m.vel.map(r2), y: r2(p.yaw), pi: r2(p.pitch), c: m.crouching ? 1 : 0, g: m.onGround ? 1 : 0, s: m.sliding ? 1 : 0, a: p.alive ? 1 : 0, w: p.weapon, hp: Math.round(p.hp), ar: Math.round(p.armour || 0) };
  }

  _pushSnap(p, d) {
    p.lastSeen = now();
    p.snaps.push({ t: now(), p: d.p, y: d.y, pi: d.pi, c: d.c, g: d.g, v: d.v, s: d.s });
    if (p.snaps.length > 30) p.snaps.shift();
    if (d.a && !p.alive) p.alive = true;
    if (!d.a && p.alive) p.alive = false;
    p.weapon = d.w; p.hp = d.hp; p.rArmour = d.ar || 0;
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
    const inputActive = !this.paused && (document.pointerLockElement != null || this.cursorFree) || this.forceInput;
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

    // --- panels (B): loadout picker, or the buy menu in plant mode
    if (pressed.has('KeyB')) {
      const want = this.plant ? (this.plant.ph === 'buy' && L.team ? 'buy' : null) : 'loadout';
      this.setPanel(this.panelOpen ? null : want);
      if (this.plant && !want) this.hud.notice('BUY MENU ONLY DURING BUY TIME');
    }
    if (this.panelOpen === 'buy' && (!this.plant || this.plant.ph !== 'buy')) this.setPanel(null);
    if (this.panelOpen) {
      for (let i = 1; i <= 8; i++) if (pressed.has('Digit' + i)) { this._panelPick(i - 1); pressed.delete('Digit' + i); }

    }
    if (pressed.has('KeyX') && this.plant && L.alive) this.plant.drop(L);
    // --- plant / defuse hold (locks movement and shooting while held)
    const holding = this.plant && L.alive ? this.plant.updateLocal(dt, keys) : false;
    const frozen = !!(this.plant && this.plant.frozen);

    // --- local actions
    const canAct = L.alive && !L.afk && this.match.phase !== 'end' && !holding;
    const adsHeld = inputActive && inp.mouseR && L.alive && this.time >= L.reloadUntil && !WEAPONS[L.weapon].melee;
    const adsRate = WEAPONS[L.weapon].scope ? 11 : 14;
    this.view.ads += ((adsHeld ? 1 : 0) - this.view.ads) * Math.min(1, dt * adsRate);
    if (Math.abs(this.view.ads - (adsHeld ? 1 : 0)) < 0.01) this.view.ads = adsHeld ? 1 : 0;
    if (canAct) {
      const own = this.ownedWeapons(L), lo = this.loadoutOf(L);
      if (pressed.has('Digit1') && lo.primary) this.switchWeapon(L, lo.primary);
      if (pressed.has('Digit2')) this.switchWeapon(L, lo.secondary);
      if (pressed.has('Digit3') || pressed.has('Digit4')) this.switchWeapon(L, 'knife');
      if (pressed.has('wheel')) { const i = Math.max(0, own.indexOf(L.weapon)); this.switchWeapon(L, own[(i + (this.input.wheelDir < 0 ? own.length - 1 : 1)) % own.length]); }
      if (pressed.has('KeyV') && L.weapon !== 'knife') { if (this.melee(L, aimYaw, aimPitch)) this.vm.quickKnife(); }
      if (pressed.has('KeyR')) this.reload(L);
      if (pressed.has('KeyF') && !(this.plant && this.plant.actionAvailable(L)) && this.time >= L.reloadUntil) { this.vm.inspect(); sfx.inspect(); }
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
          if (this.time - (L.lastShotT ?? -9) > (W.sprayReset || 0.3)) L.spray = 0;
          this.fire(L, aimYaw, aimPitch, this.adsAccuracy(L, this.view.ads), muzzle);
          if (!W.auto || Math.random() < 0.35) this.effects.muzzleSmoke(muzzle, this.forward(aimYaw, aimPitch), !!(W.heavy || W.pellets || W.scope));
          L.lastShotT = this.time;
          this.vm.fire(L.weapon);
          const [kp, ky] = this.recoilKick(W, L.spray || 0);
          const rk = 1 - this.view.ads * 0.25;
          this.view.recoil += kp * rk;
          this.view.recoilYaw += ky * rk;
          L.spray = (L.spray || 0) + 1;
          if (W.bolt && L.mag[L.weapon] > 0) { this.vm.bolt(W.interval); sfx.bolt(); }
          if (W.pump && L.mag[L.weapon] > 0) { this.vm.pump(W.interval * 0.9); sfx.pump(); }
          inp.clickL = false;
        } else if (L.mag[L.weapon] <= 0 && inp.clickL) { sfx.dry(); this.reload(L); inp.clickL = false; }
        else if (!W.auto && this.time + 0.12 < L.nextShot) inp.clickL = false; // too early: drop buffered click
      } else if (!W.auto) inp.clickL = false;
    } else inp.clickL = false;
    const spraying = inp.mouseL && inputActive && WEAPONS[L.weapon].auto && this.time - (L.lastShotT ?? -9) < 0.2;
    if (!spraying) {
      L.bloom = Math.max(0, L.bloom - dt * 0.12);
      const rec = WEAPONS[L.weapon].bolt ? 6 : 7.5;
      this.view.recoil *= Math.exp(-dt * rec);
      this.view.recoilYaw *= Math.exp(-dt * rec);
    } else {
      // while spraying the pattern mostly sticks, so the climb and sway are felt (and can be pulled against)
      this.view.recoil *= Math.exp(-dt * 0.6);
      this.view.recoilYaw *= Math.exp(-dt * 0.6);
    }
    if (pressed.has('KeyH')) { this.helpShown = !this.helpShown; this.helpUntil = Infinity; }
    if (pressed.has('KeyM')) this.minimap.toggle();
    if (L.afk && (pressed.has('Enter') || pressed.has('NumpadEnter'))) this.requestAfk(L.id, false);
    if (this.net && !L.afk && this.match.phase === 'play' && performance.now() - (this.input.lastInput || performance.now()) > 60000) {
      this.input.lastInput = performance.now();
      this.requestAfk(L.id, true);
      this.hud.feedText('You were idle for 60s and moved to the AFK box', '#ffd60a');
    }
    inp.pressed.clear();

    // --- reload completion & utility timers for simulated players
    for (const p of this.players.values()) {
      if (!this.simulatedHere(p)) continue;
      if (p.reloadUntil && WEAPONS[p.reloadWeapon].shells && p.reloadWeapon === p.weapon) {
        const W = WEAPONS[p.weapon], ins = Math.floor((this.time - p.reloadStart - W.reloadStart) / W.reload) + 1;
        const m = Math.min(W.mag, p.reloadBase + Math.max(0, ins));
        if (m > p.mag[p.weapon]) { p.mag[p.weapon] = m; if (p.isLocal) sfx.shell(); }
      }
      if (p.reloadUntil && this.time >= p.reloadUntil) {
        if (p.reloadWeapon === p.weapon) p.mag[p.weapon] = WEAPONS[p.weapon].mag;
        p.reloadUntil = 0;
      }
      if (p.nades < GRENADE.max && !this.plant) { p.nadeT += dt; if (p.nadeT >= GRENADE.rechargeTime) { p.nadeT = 0; p.nades++; } }
      if (p.blinkCd > 0 && !p.blink) p.blinkCd = Math.max(0, p.blinkCd - dt);
      if (!p.isLocal) p.bloom = Math.max(0, p.bloom - dt * 0.1);
      if (p.alive && !this.plant && this.time - p.lastHurt > PLAYER.regenDelay && p.hp < PLAYER.maxHealth) p.hp = Math.min(PLAYER.maxHealth, p.hp + PLAYER.regenRate * dt);
      if (!p.alive && this.match.phase !== 'end' && (this.time >= p.respawnAt || this.match.phase === 'warmup')) this.spawn(p);
    }

    // --- fixed-step simulation
    const mvIn = emptyInput();
    if (L.alive && !frozen && !holding) {
      mvIn.fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      mvIn.right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      mvIn.jump = keys.has('Space');
      mvIn.crouch = keys.has('ShiftLeft');
      mvIn.yaw = this.view.yaw;
      mvIn.ads = this.view.ads > 0.5;
      mvIn.speedMul = L.weapon === 'knife' ? KNIFE.speedMul : (WEAPONS[L.weapon].speedMul || 1);
    } else if (L.alive) { mvIn.yaw = this.view.yaw; mvIn.crouch = holding; }
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
      if (pr.dead) { this.scene.remove(pr.mesh); this.projectiles.splice(i, 1); continue; }
      pr.mesh.position.set(...pr.pos);
      if (pr.hideT) { if (pr.age >= pr.hideT) { pr.mesh.visible = true; pr.hideT = 0; } }
      if (pr.kind === 'blink') { pr.mesh.rotation.y += dt * 12; pr.mesh.rotation.x = pr.normal && pr.normal[1] === 0 ? Math.PI / 2 : 0; }
      if (pr.kind === 'nade' && Math.random() < 0.35) this.effects.glow.add(pr.pos, [0, 0.4, 0], '#ff7b4a', 0.3, 0.09, { grav: 0, drag: 1 });
      if (pr.kind === 'blink' && Math.random() < 0.6) this.effects.trail(pr.pos, pr.color || '#7ff8ff');
    }
    for (const b of this.bots) b.think(this.time);
    if (this.plant) this.plant.update(dt);

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
    this.effects.update(dt, this.camera.position);
    for (const r of this.map.padRings) { r.position.y = (r.userData.baseY || 0.3) + (this.time * 0.8 % 1) * 1.2; r.material.opacity = 0.6 * (1 - (this.time * 0.8 % 1)); }
    this._updateFlagMeshes(dt);
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
      else if (e === 'land') {
        sfx.land(pos, Math.min(1.5, (p.ms.landSpeed || 5) / 8)); if (p.isLocal) this.view.land = Math.min(0.25, (p.ms.landSpeed || 0) * 0.018);
        if ((p.ms.landSpeed || 0) > 7) this.effects.dust(p.ms.pos, this.map.env.dust || '#cbbf9f', Math.min(10, Math.round((p.ms.landSpeed || 0) / 2)), 1.8);
      }
      else if (e === 'slide') { sfx.slide(pos); this.effects.dust(p.ms.pos, this.map.env.dust || '#cbbf9f', 5, 2.2, 0.3); }
      else if (e === 'pad') { sfx.pad(pos || p.ms.pos); this.effects.ring([p.ms.pos[0], p.ms.pos[1] + 0.3, p.ms.pos[2]], '#7ff8ff', !p.isLocal); }
    }
    // footsteps (+ a trail of dust while sliding fast)
    const sp = Math.hypot(p.ms.vel[0], p.ms.vel[2]);
    if (p.ms.sliding && sp > 6 && Math.random() < 0.18) this.effects.dust(p.ms.pos, this.map.env.dust || '#cbbf9f', 1, 0.8, 0.22);
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
      const Wc = WEAPONS[L.weapon];
      this.scoped = !!Wc.scope && v.ads > 0.85;
      const adsMul = Wc.scope ? (this.scoped ? Wc.adsFov : 1 + (0.8 - 1) * v.ads) : 1 + (Wc.adsFov - 1) * v.ads;
      cam.fov = (baseFov + v.fovKick * (1 - v.ads)) * adsMul;
      this.vm.update(dt, { ads: v.ads > 0.5, speed: sp, onGround: L.ms.onGround, mouseDX: mdx, mouseDY: mdy, sliding: L.ms.sliding, vy: L.ms.vel[1] });
      this.deathCam = null;
    } else if (this.plant && this._spectate(dt)) {
      this.scoped = false;
    } else if (this.deathCam) {
      this.scoped = false;
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

  // plant mode: after dying, ride along with a living teammate (click cycles)
  _spectate(dt) {
    const P = this.plant, L = this.local, cam = this.camera;
    if (this.deathCam && this.deathCam.t < 2.2 && !P.joinedLate) { if (P.specAv) { P.specAv.root.visible = true; P.specAv = null; } return false; }
    const mates = [...this.players.values()].filter(p => p !== L && p.alive && !p.afk && p.team === L.team);
    if (!mates.length) { if (P.specAv) { P.specAv.root.visible = true; P.specAv = null; } P.spec = null; return false; }
    let t = this.players.get(P.spec);
    if (!t || !t.alive || this.input.clickL) {
      const i = t ? mates.indexOf(t) : -1;
      t = mates[(i + 1) % mates.length]; P.spec = t.id; this.input.clickL = false;
    }
    if (P.specAv && P.specAv !== t.avatar) P.specAv.root.visible = true;
    if (t.avatar) { t.avatar.root.visible = false; P.specAv = t.avatar; }
    const e = this.eyeOf(t);
    cam.position.set(e[0], e[1], e[2]);
    cam.rotation.set(t.pitch, t.yaw, 0);
    cam.fov = this.settings.fov || 75;
    return true;
  }

  _updateHud(dt, keys) {
    const L = this.local, h = this.hud;
    const W = WEAPONS[L.weapon];
    const reloading = this.time < L.reloadUntil;
    h.setVitals(L.hp, PLAYER.maxHealth, L.alive ? Math.hypot(L.ms.vel[0], L.ms.vel[2]) : 0, this.plant ? (L.alive ? (L.armour || 0) : (L.inv ? L.inv.armour : 0)) : null);
    h.setWeapon(L.weapon, W.name, L.mag[L.weapon] ?? 0, W.mag, reloading, reloading ? 1 - (L.reloadUntil - this.time) / W.reload : 0);
    const blinkActive = !!(L.blink && !L.blink.dead);
    h.setAbilities({
      nades: L.nades, nadeMax: GRENADE.max, nadePct: L.nadeT / GRENADE.rechargeTime, nadeLeft: GRENADE.rechargeTime - L.nadeT, bought: !!this.plant,
      blink: blinkActive ? 'active' : L.blinkCd > 0 ? 'cooldown' : 'ready', blinkPct: L.blinkCd / BLINK.cooldown, blinkCd: L.blinkCd,
      knifeReady: this.time >= L.nextMelee,
    });
    h.setCrosshair(this.spreadFor(L, this.adsAccuracy(L, this.view.ads)), L.alive && this.view.ads < 0.6, L.weapon === 'knife');
    h.setScope(!!this.scoped, this.time < L.nextShot);
    h.setLowHealth(L.alive && L.hp < 20, L.hp);
    h.setStreak(L.streak);
    // contextual prompt
    let prompt = '';
    const pAct = this.plant && L.alive ? this.plant.actionAvailable(L) : null;
    if (L.alive && pAct && !this.plant.hold) prompt = pAct === 'plant' ? `Hold ${h.kb('use')} to PLANT the charge` : `Hold ${h.kb('use')} to DEFUSE${L.inv && L.inv.kit ? ' (kit)' : ''}`;
    else if (L.alive && this.plant && this.plant.ph === 'buy' && this.panelOpen !== 'buy') prompt = `Press ${h.kb('buy')} to buy`;
    else if (L.alive) {
      if (blinkActive) prompt = `Press ${h.kb('blink')} to WARP to your disc`;
      else if (W.mag && L.mag[L.weapon] === 0 && !reloading) prompt = `Press ${h.kb('reload')} to reload`;
      else if (this.match.phase === 'warmup' && this.match.round === 1) prompt = `Press ${h.kb('help')} for controls &amp; abilities`;
    }
    h.prompt(prompt);
    if (this.helpUntil !== Infinity && this.time > this.helpUntil) { this.helpShown = false; this.helpUntil = Infinity; }
    h.help(this.helpShown && this.match.phase !== 'end');
    const ranked = this.ranking();
    const rank = ranked.indexOf(L) + 1;
    const top = ranked[0] === L ? null : ranked[0];
    h.setMatch({
      timeLeft: this.plant && this.match.phase === 'play' ? this.plant.t : this.match.t, endless: !this.plant && this.match.phase === 'play' && !this.match.roundTime, round: this.match.round, phase: this.match.phase, myKills: L.kills, killLimit: this.match.killLimit,
      rank, total: ranked.length, leaderName: top ? top.name : '', leaderKills: top ? top.kills : 0, leaderColor: top ? top.color : '#fff',
      roomCode: this.roomCode, players: [...this.players.values()].filter(p => !p.isBot).length, isHost: this.net && this.isHost,
      bots: this.botCount, difficulty: this.difficulty,
      modeName: MODES[this.mode].name, teams: this.teams, scoreA: this.plant ? this.plant.score.A : this.teamScore.A, scoreB: this.plant ? this.plant.score.B : this.teamScore.B, myTeam: L.team, mapName: this.map.info.name,
    });
    if (L.alive) h.setSlots(this.ownedWeapons(L), !!(this.plant && this.plant.ch.s === 'carried' && this.plant.ch.c === L.id));
    if (this.plant) {
      const P = this.plant, alive = { A: [], B: [] };
      for (const p of this.players.values()) if (p.team && !p.afk) alive[p.team].push(p.alive);
      for (const t of ['A', 'B']) alive[t].sort((a, b) => b - a);
      h.setPlant({ ph: P.ph, t: P.t, round: P.round, score: P.score, alive, site: P.ch.site, role: L.team === P.atk ? 'ATTACK' : 'DEFEND', carrying: P.ch.s === 'carried' && P.ch.c === L.id });
      h.setMoney(L.streak >= 2 && L.alive ? null : (L.money ?? 0));
      const hold = P.hold;
      h.setAction(hold ? (hold.kind === 'plant' ? 'PLANTING…' : (L.inv && L.inv.kit ? 'DEFUSING · KIT' : 'DEFUSING…')) : null, hold ? hold.t / hold.need : 0, hold && hold.kind);
    } else { h.setPlant(null); h.setMoney(null); h.setAction(null); }
    if (this.panelOpen === 'loadout') h.panel(loadoutHtml(L.loadout, L.pendingLoadout, false));
    else if (this.panelOpen === 'buy' && this.plant) h.panel(this.plant.buyHtml(L));
    else h.panel(null);
    h.setFlags(this.flags ? { A: this.flags.A, B: this.flags.B, names: (id) => { const c = this.players.get(id); return c ? c.name : ''; }, mine: L.team } : null);
    h.setAfk(!!L.afk);
    if (!L.alive && this.match.phase !== 'end') {
      const k = L.killedBy && this.players.get(L.killedBy);
      if (this.plant) {
        const sp = this.plant.spec && this.players.get(this.plant.spec);
        h.death(this.plant.joinedLate ? null : (k ? k.name : ''), k ? k.color : '#fff', sp ? `Spectating ${sp.name} · click to switch` : 'Out until next round');
        if (this.plant.joinedLate) h.center('NEXT ROUND');
      } else h.death(k ? k.name : '', k ? k.color : '#fff', L.respawnAt - this.time);
    } else h.death(null);
    if (this.match.phase === 'warmup') h.center(Math.ceil(this.match.t) > 0 ? String(Math.ceil(this.match.t)) : '');
    else h.center('');
    if (this.match.phase === 'warmup' && this._lastTick !== Math.ceil(this.match.t)) { this._lastTick = Math.ceil(this.match.t); if (this._lastTick > 0) sfx.tick(); }
    const showSb = keys.has('Tab') || this.match.phase === 'end';
    if (showSb) {
      const w = this.match.winner && this.players.get(this.match.winner);
      const row = (p) => ({ name: p.name, color: this.displayColor(p), bot: p.isBot, afk: p.afk, host: !!this.net && p.id === this.hostId, score: p.score, kills: p.kills, deaths: p.deaths, best: p.best, wins: p.wins, caps: p.caps || 0, me: p.isLocal, ping: p.isLocal ? '' : p.isBot ? 'BOT' : (p.ping ? p.ping + 'ms' : ''), money: this.plant && p.team === L.team ? p.money : undefined });
      let rows;
      if (this.teams) {
        rows = [];
        for (const t of ['A', 'B']) {
          rows.push({ header: true, label: TEAMS[t].name, color: TEAMS[t].color, score: this.teamScore[t], mine: L.team === t });
          rows.push(...ranked.filter(p => p.team === t).map(row));
        }
      } else rows = ranked.map(row);
      const wt = this.match.winnerTeam;
      const endTitle = this.teams ? (wt ? `${TEAMS[wt].name} WINS ROUND ${this.match.round}` : 'DRAW') : (w ? `${w.name.toUpperCase()} WINS ROUND ${this.match.round}` : 'ROUND OVER');
      h.scoreboard(true, rows,
        this.match.phase === 'end' ? endTitle : this.plant ? `ROUND ${this.plant.round} · PLANT & DEFUSE · ${TEAMS.A.name} ${this.plant.score.A} – ${this.plant.score.B} ${TEAMS.B.name}` : `ROUND ${this.match.round} · ${MODES[this.mode].name} · ${this.map.info.name} · ${this.net ? 'ONLINE ' + this.roomCode : 'OFFLINE'}`,
        this.match.phase === 'end' ? `NEXT ROUND IN ${Math.max(0, Math.ceil(this.match.t))}S` : 'HOLD TAB');
    } else h.scoreboard(false, []);
    this.minimap.update(dt);
    h.update(dt);
  }

  ranking() { return [...this.players.values()].sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths); }

  render() {
    const r = this.renderer;
    r.autoClear = false;
    r.clear();
    r.render(this.scene, this.camera);
    if (this.local.alive && !this.scoped) { r.clearDepth(); r.render(this.vm.scene, this.vm.camera); }
  }

  dispose() {
    if (this.minimap) this.minimap.toggle(false);
    if (this.net) this.net.leave();
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}
