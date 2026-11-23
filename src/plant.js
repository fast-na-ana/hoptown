// PLANT & DEFUSE: attackers carry a charge to one of two sites, defenders stop or defuse it.
// One life per round, money between rounds, sides swap at half time. The host is authoritative
// for the round state, the charge and everyone's money / inventory; clients mirror it.
import * as THREE from 'three';
import { PLANT, WEAPONS, MATCH, PRIMARIES, SECONDARIES } from './config.js';
import { TEAMS, other } from './modes.js';
import { sfx } from './audio.js';
import { ICONS } from './hud.js';
import { buyHtml, ITEM_ICONS } from './panels.js';

const r2 = (v) => Math.round(v * 100) / 100;
const BUY = [
  { id: 'rifle', kind: 'gun' }, { id: 'smg', kind: 'gun' }, { id: 'shotgun', kind: 'gun' }, { id: 'sniper', kind: 'gun' },
  { id: 'hcannon', kind: 'gun' }, { id: 'armour', name: 'ARMOUR' }, { id: 'nade', name: 'FRAG' }, { id: 'kit', name: 'DEFUSE KIT' },
];

function signTexture(letter, color) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 256, 256);
  // hazard border
  g.save(); g.beginPath(); g.rect(8, 8, 240, 240); g.rect(36, 36, 184, 184); g.clip('evenodd');
  for (let i = -256; i < 512; i += 36) { g.fillStyle = i % 72 === 0 ? '#111' : color; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 18, 0); g.lineTo(i + 274, 256); g.lineTo(i + 256, 256); g.fill(); }
  g.restore();
  g.fillStyle = 'rgba(17,17,17,0.82)'; g.fillRect(36, 36, 184, 184);
  g.fillStyle = color; g.font = '900 150px Archivo, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, 128, 138);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export class PlantMode {
  constructor(game) {
    this.g = game;
    this.cfg = game.map.plant;
    this.ph = 'wait'; this.t = 0; this.round = 0;
    this.score = { A: 0, B: 0 }; this.atk = 'A'; this.loss = { A: 0, B: 0 };
    this.ch = { s: 'none', c: null, p: null, site: null };
    this.planted = false; this.last = null; this.hold = null; this.lastSend = -9; this.econDirty = false;
    this.targetSite = 'A'; this.spec = null; this.beepT = 0; this.joinedLate = false;
    for (const p of game.players.values()) this.initPlayer(p);
    this._buildVisuals();
  }

  // ---------------------------------------------------------------- helpers
  get frozen() { return this.ph === 'buy'; }
  get def() { return other(this.atk); }
  get half() { return Math.max(1, this.g.rules.limit - 1); }
  roleOf(p) { return p.team === this.atk ? 'attack' : 'defend'; }
  initPlayer(p) { if (!p.inv) { p.inv = { primary: null, secondary: 'pistol', armour: 0, nades: 0, kit: false }; p.money = PLANT.startMoney; } }
  _resetInv(p) { p.inv = { primary: null, secondary: 'pistol', armour: 0, nades: 0, kit: false }; }
  siteAt(pos, pad = 0.3) {
    for (const s of this.cfg.sites) if (pos[0] > s.min[0] - pad && pos[0] < s.max[0] + pad && pos[2] > s.min[2] - pad && pos[2] < s.max[2] + pad && pos[1] > s.min[1] - 0.5 && pos[1] < s.max[1]) return s.id;
    return null;
  }
  _alive(team) { return [...this.g.players.values()].filter(p => p.team === team && p.alive && !p.afk); }
  _members(team) { return [...this.g.players.values()].filter(p => p.team === team && !p.afk); }
  carrier() { return this.ch.s === 'carried' ? this.g.players.get(this.ch.c) : null; }
  chargePos() { const c = this.carrier(); if (c) { const p = this.g.posOf(c); return [p[0], p[1], p[2]]; } return this.ch.p; }

  // What F does for this player right now ('plant' | 'defuse' | null).
  actionAvailable(p) {
    if (!p.alive || this.frozen) return null;
    const pos = this.g.posOf(p);
    if (this.ph === 'live' && this.ch.s === 'carried' && this.ch.c === p.id && p.team === this.atk && this.siteAt(pos) && (p.ms ? p.ms.onGround : true)) return 'plant';
    if (this.ph === 'planted' && p.team === this.def && this.ch.p && Math.hypot(pos[0] - this.ch.p[0], pos[1] - this.ch.p[1], pos[2] - this.ch.p[2]) < PLANT.defuseRange) return 'defuse';
    return null;
  }
  holdTime(p, kind) { return kind === 'plant' ? PLANT.plantTime : (p.inv && p.inv.kit ? PLANT.kitDefuseTime : PLANT.defuseTime); }

  // ---------------------------------------------------------------- visuals
  _buildVisuals() {
    const g = this.g;
    this.group = new THREE.Group(); g.scene.add(this.group);
    for (const s of this.cfg.sites) {
      const col = '#ffd60a';
      const w = s.max[0] - s.min[0], d = s.max[2] - s.min[2];
      // zone outline
      const y = s.floor ?? 0.04;
      const pts = [[s.min[0], s.min[2]], [s.max[0], s.min[2]], [s.max[0], s.max[2]], [s.min[0], s.max[2]]];
      const arr = [];
      for (let i = 0; i < 4; i++) { const a = pts[i], b = pts[(i + 1) % 4]; arr.push(a[0], y + 0.03, a[1], b[0], y + 0.03, b[1]); }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      this.group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.85 })));
      // corner ticks as thin boxes so they read at a distance
      const tick = new THREE.MeshBasicMaterial({ color: col });
      for (const [x, z] of pts) for (const [dx, dz] of [[1, 0], [0, 1]]) {
        const sx = Math.sign(s.min[0] + w / 2 - x), sz = Math.sign(s.min[2] + d / 2 - z);
        const m = new THREE.Mesh(new THREE.BoxGeometry(dx ? 1.2 : 0.12, 0.02, dz ? 1.2 : 0.12), tick);
        m.position.set(x + sx * (dx ? 0.6 : 0.06), y + 0.02, z + sz * (dz ? 0.6 : 0.06)); this.group.add(m);
      }
      // painted letter
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), new THREE.MeshBasicMaterial({ map: signTexture(s.id, col), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
      plane.rotation.x = -Math.PI / 2; plane.position.set(s.mark[0], s.mark[1] + 0.03, s.mark[2]); plane.renderOrder = 1;
      this.group.add(plane);
    }
    // the charge: a chunky box with a screen and a blinking light
    const c = this.chargeMesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.32), new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.6, metalness: 0.3 }));
    body.position.y = 0.11; c.add(body);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 0.34), new THREE.MeshStandardMaterial({ color: '#ffd60a', roughness: 0.5 }));
    band.position.y = 0.12; c.add(band);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.12), new THREE.MeshBasicMaterial({ color: '#2bd66a' }));
    screen.position.set(-0.06, 0.226, 0); c.add(screen);
    this.chargeLed = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3b30' }));
    this.chargeLed.position.set(0.14, 0.24, 0.06); c.add(this.chargeLed);
    this.chargeLight = new THREE.PointLight('#ff3b30', 0, 5, 2); this.chargeLight.position.set(0, 0.5, 0); c.add(this.chargeLight);
    c.visible = false; this.group.add(c);
  }

  dispose() { if (this.group) this.g.scene.remove(this.group); }

  // ---------------------------------------------------------------- host: match + rounds
  resetMatch() {
    this.round = 0; this.score = { A: 0, B: 0 }; this.atk = 'A'; this.loss = { A: 0, B: 0 };
    this.ch = { s: 'none', c: null, p: null, site: null }; this.ph = 'wait'; this.last = null; this.planted = false;
    for (const p of this.g.players.values()) { this._resetInv(p); p.money = PLANT.startMoney; }
    this.econDirty = true;
  }

  startMatch() { this.resetMatch(); this._startRound(); }

  _startRound() {
    const g = this.g;
    this.round++;
    if (this.round === this.half + 1) {   // half time: swap sides, fresh economy
      this.atk = other(this.atk); this.loss = { A: 0, B: 0 };
      for (const p of g.players.values()) { this._resetInv(p); p.money = PLANT.startMoney; }
      this._event('swap');
    } else {
      for (const p of g.players.values()) {
        if (!p.inv) this.initPlayer(p);
        if (!p.alive || p.afk) this._resetInv(p);
        else { p.inv.armour = Math.round(p.ms ? (p.armour || 0) : (p.rArmour ?? p.inv.armour)); p.inv.nades = Math.min(p.inv.nades, PLANT.maxNades); }
      }
    }
    for (const p of g.players.values()) if (p.team !== this.def) p.inv.kit = false;
    const atk = this._members(this.atk);
    const humans = atk.filter(p => !p.isBot);
    const pickFrom = humans.length && Math.random() < 0.7 ? humans : atk;
    const carrier = pickFrom.length ? pickFrom[Math.floor(Math.random() * pickFrom.length)] : null;
    this.ch = carrier ? { s: 'carried', c: carrier.id, p: null, site: null } : { s: 'none', c: null, p: null, site: null };
    this.targetSite = Math.random() < 0.5 ? 'A' : 'B';
    this.planted = false; this.last = null;
    for (const b of g.bots) this._botBuy(b);
    this.ph = 'buy'; this.t = PLANT.buyTime;
    this._sendEcon(); this._send('round');
    this._onRound();
  }

  _endRound(w, why) {
    const g = this.g, l = other(w);
    if (this.ph === 'post') return;
    this.score[w]++;
    this.last = { w, why };
    for (const p of g.players.values()) {
      if (!p.team) continue;
      if (p.team === w) p.money += PLANT.win;
      else p.money += Math.min(PLANT.lossMax, PLANT.lossBase + PLANT.lossStep * this.loss[l]);
      if (p.team === this.atk && l === this.atk && this.planted) p.money += PLANT.plantTeamBonus;
      p.money = Math.min(PLANT.maxMoney, p.money);
    }
    this.loss[l] = Math.min(4, this.loss[l] + 1); this.loss[w] = 0;
    this.ph = 'post'; this.t = PLANT.post;
    this._sendEcon(); this._send('end');
    this._onEnd();
  }

  hostUpdate(dt) {
    const g = this.g, m = g.match;
    if (m.phase === 'warmup') { m.t -= dt; if (m.t <= 0) { m.phase = 'play'; m.t = 0; g._onPhase('play'); this.startMatch(); g._sendMatch(); } return; }
    if (m.phase === 'end') { m.t -= dt; if (m.t <= 0) g._startWarmup(); return; }
    if (this.ph === 'wait') { this.startMatch(); return; }
    this.t -= dt; m.t = this.t;
    // carrier left, went AFK or died without a death event: drop the charge where they were
    if (this.ch.s === 'carried') {
      const c = g.players.get(this.ch.c);
      if (!c || c.afk || (!c.alive && this.ph !== 'buy') || c.team !== this.atk) {
        const alt = this._alive(this.atk).filter(p => p !== c);
        if (this.ph === 'buy' && alt.length) this.ch = { s: 'carried', c: alt[0].id, p: null, site: null };
        else this.ch = { s: 'dropped', c: null, p: c && !c.afk ? [...g.posOf(c)] : [...(this.cfg.attack[0])], site: null };
        this._send('drop');
      }
    }
    if (this.ph === 'buy') { if (this.t <= 0) { this.ph = 'live'; this.t = g.rules.time; this._send('live'); this._onLive(); } }
    else if (this.ph === 'live' || this.ph === 'planted') {
      // charge pickup
      if (this.ch.s === 'dropped') {
        for (const p of this._alive(this.atk)) {
          if (this.ch.np === p.id && g.time < this.ch.npT) continue;   // the dropper can't instantly re-grab it
          const pp = g.posOf(p);
          if (Math.hypot(pp[0] - this.ch.p[0], pp[1] - this.ch.p[1], pp[2] - this.ch.p[2]) < PLANT.pickup) { this.ch = { s: 'carried', c: p.id, p: null, site: null }; this._send('pick', p.id); break; }
        }
      }
      const aAlive = this._alive(this.atk).length, dAlive = this._alive(this.def).length;
      const aAny = this._members(this.atk).length, dAny = this._members(this.def).length;
      if (this.ph === 'live') {
        if (aAny && !aAlive) this._endRound(this.def, 'elim');
        else if (dAny && !dAlive) this._endRound(this.atk, 'elim');
        else if (this.t <= 0) this._endRound(this.def, 'time');
      } else {
        if (dAny && !dAlive) this._endRound(this.atk, 'elim');
        else if (this.t <= 0) { this.ch.s = 'blown'; this._send('blown'); this._blast(); this._endRound(this.atk, 'blown'); }
      }
    } else if (this.ph === 'post' && this.t <= 0) {
      const lim = g.rules.limit;
      const w = this.score.A >= lim ? 'A' : this.score.B >= lim ? 'B' : null;
      if (w) {
        m.phase = 'end'; m.t = MATCH.intermission; m.winnerTeam = w; m.winner = null;
        for (const p of g.players.values()) if (p.team === w) p.wins++;
        g._onPhase('end'); g._sendMatch();
      } else this._startRound();
    }
    if (this.econDirty && g.time - (this._econT || 0) > 0.25) this._sendEcon();
    if (g.net && g.time - this.lastSend > 1) this._send();
  }

  // ---------------------------------------------------------------- host: actions
  hostAction(id, kind, pos) {
    const g = this.g, p = g.players.get(id);
    if (!p || !p.alive) return;
    if (kind === 'plant') {
      if (this.ph !== 'live' || this.ch.s !== 'carried' || this.ch.c !== id) return;
      const site = this.siteAt(pos, 0.6);
      if (!site) return;
      this.ch = { s: 'planted', c: null, p: [r2(pos[0]), r2(pos[1]), r2(pos[2])], site };
      this.planted = true; this.ph = 'planted'; this.t = PLANT.fuse;
      p.money = Math.min(PLANT.maxMoney, p.money + PLANT.plantBonus); this.econDirty = true;
      this._send('planted', id);
      this._onPlanted(id);
    } else if (kind === 'defuse') {
      if (this.ph !== 'planted' || p.team !== this.def || !this.ch.p) return;
      const pp = g.posOf(p);
      if (Math.hypot(pp[0] - this.ch.p[0], pp[1] - this.ch.p[1], pp[2] - this.ch.p[2]) > PLANT.defuseRange + 1) return;
      this.ch.s = 'defused';
      p.money = Math.min(PLANT.maxMoney, p.money + PLANT.defuseBonus);
      this._send('defused', id);
      this._onDefused(id);
      this._endRound(this.def, 'defused');
    }
  }

  // buy item index i for player p (host applies; clients ask the host)
  buy(p, i) {
    const g = this.g;
    if (!g.isHost) { if (g.net) g.net.send('buy', { i }, g.hostId); return; }
    this.hostBuy(p, i);
  }
  hostBuy(p, i) {
    const it = BUY[i];
    if (!it || !p || !p.inv || this.ph !== 'buy' || !p.team) return false;
    const price = PLANT.prices[it.id], inv = p.inv;
    if (p.money < price) return false;
    if (it.kind === 'gun') {
      const prim = PRIMARIES.includes(it.id);
      if ((prim ? inv.primary : inv.secondary) === it.id) return false;
      if (prim) inv.primary = it.id; else inv.secondary = it.id;
    } else if (it.id === 'armour') { if (inv.armour >= 100) return false; inv.armour = 100; }
    else if (it.id === 'nade') { if (inv.nades >= PLANT.maxNades) return false; inv.nades++; }
    else if (it.id === 'kit') { if (inv.kit || p.team !== this.def) return false; inv.kit = true; }
    p.money -= price;
    this._applyInv(p, true);
    this.econDirty = true; this._sendEcon();
    return true;
  }

  _botBuy(b) {
    const p = b.p, inv = p.inv; if (!inv || !p.team) return;
    const buy = (id) => this.hostBuyRaw(p, id);
    const pistolRound = this.round === 1 || this.round === this.half + 1;
    const wantSniper = b.role === 'sniper';
    if (!inv.primary) {
      if (wantSniper && p.money >= PLANT.prices.sniper + PLANT.prices.armour) { buy('sniper'); buy('armour'); }
      else if (p.money >= PLANT.prices.rifle + PLANT.prices.armour) { buy(Math.random() < 0.75 ? 'rifle' : 'shotgun'); buy('armour'); }
      else if (p.money >= 2000 || (!pistolRound && p.money >= PLANT.prices.smg && Math.random() < 0.5)) { buy(p.money >= PLANT.prices.rifle ? 'rifle' : 'smg'); }
      else if (pistolRound) { if (Math.random() < 0.5) buy('armour'); else buy('hcannon'); }
    } else if (inv.armour < 50 && p.money >= PLANT.prices.armour) buy('armour');
    if (p.money > 1200 && Math.random() < 0.6) buy('nade');
    if (p.team === this.def && p.money > 900 && Math.random() < 0.6) buy('kit');
    this._applyInv(p, true);
  }
  hostBuyRaw(p, id) { const i = BUY.findIndex(x => x.id === id); if (i < 0) return; const ph = this.ph; this.ph = 'buy'; this.hostBuy(p, i); this.ph = ph; }

  // inventory -> live state of a simulated player (weapon, nades, armour)
  _applyInv(p, equip) {
    if (!p.inv) return;
    p.armour = p.inv.armour; p.nades = p.inv.nades;
    if (!this.g.simulatedHere(p)) return;
    const own = this.g.ownedWeapons(p);
    if (equip || !own.includes(p.weapon)) {
      const w = own[0];
      if (p.weapon !== w) { p.weapon = w; p.mag[w] = WEAPONS[w].mag; if (p.isLocal) this.g.vm.setWeapon(w); }
    }
    if (p.isLocal) this.g.hud.setSlots(own);
  }

  // ---------------------------------------------------------------- net
  _send(ev = null, by = null) {
    const g = this.g; this.lastSend = g.time;
    if (!g.net) return;
    g.net.send('pl', { ph: this.ph, t: r2(this.t), r: this.round, sc: this.score, atk: this.atk, ch: this.ch, ts: this.targetSite, last: this.last, pl: this.planted ? 1 : 0, ev, by });
  }
  _sendEcon() {
    const g = this.g; this.econDirty = false; this._econT = g.time;
    if (!g.net) return;
    const e = {};
    for (const p of g.players.values()) if (p.inv) e[p.id] = [p.money, p.inv.primary || 0, p.inv.secondary, p.inv.armour, p.inv.nades, p.inv.kit ? 1 : 0];
    g.net.send('pinv', e);
  }

  onNet(d) {   // client: authoritative round state from the host
    const prevPh = this.ph, prevCh = this.ch.s;
    const first = !this._got; this._got = true;
    this.ph = d.ph; this.t = d.t; this.round = d.r; this.score = d.sc; this.atk = d.atk; this.ch = d.ch; this.targetSite = d.ts; this.last = d.last; this.planted = !!d.pl;
    this.g.match.t = d.t;
    if (first && d.ph !== 'buy') { this.joinedLate = true; for (const p of this.g.players.values()) if (this.g.simulatedHere(p)) { p.alive = false; p.respawnAt = Infinity; } }
    if (d.ev === 'round' || (d.ph === 'buy' && prevPh !== 'buy')) this._onRound();
    if (d.ev === 'live' || (d.ph === 'live' && prevPh === 'buy')) this._onLive();
    if (d.ev === 'planted' || (d.ph === 'planted' && prevPh !== 'planted')) this._onPlanted(d.by);
    if (d.ev === 'defused') this._onDefused(d.by);
    if (d.ev === 'blown' || (this.ch.s === 'blown' && prevCh !== 'blown')) this._blast();
    if (d.ev === 'end' || (d.ph === 'post' && prevPh !== 'post')) this._onEnd();
    if (d.ev === 'swap') this._event('swap');
    if (d.ev === 'drop' && d.by) { const p = this.g.players.get(d.by); if (p && p.team === this.g.local.team) this.g.hud.feedText(`${p.name} dropped the charge`, '#ffd60a'); }
    if (d.ev === 'pick') { const p = this.g.players.get(d.by); if (p && p.team === this.g.local.team) this.g.hud.feedText(`${p.name} picked up the charge`, '#ffd60a'); }
  }
  onEcon(e) {
    for (const [id, v] of Object.entries(e)) {
      const p = this.g.players.get(id); if (!p) continue;
      const prevPrim = p.inv && p.inv.primary, prevSec = p.inv && p.inv.secondary;
      p.money = v[0];
      p.inv = { primary: v[1] || null, secondary: v[2] || 'pistol', armour: v[3], nades: v[4], kit: !!v[5] };
      if (this.ph === 'buy' || !p.alive) this._applyInv(p, p.inv.primary !== prevPrim || p.inv.secondary !== prevSec);
    }
  }

  // ---------------------------------------------------------------- shared reactions
  _onRound() {
    const g = this.g;
    this.hold = null; this.spec = null;
    for (const pr of g.projectiles) pr.dead = true;
    g.effects.clearHoles();
    for (const p of g.players.values()) {
      if (!p.inv) this.initPlayer(p);
      if (g.simulatedHere(p) && !p.afk && p.team) { g.spawn(p); this._applyInv(p, true); }
    }
    this.joinedLate = false;
    const L = g.local;
    if (L.team) {
      const role = L.team === this.atk ? 'ATTACK' : 'DEFEND';
      g.hud.announce(`ROUND ${this.round} · ${role}`, L.team === this.atk ? (this.ch.c === L.id ? 'You carry the charge. Plant it at A or B.' : 'Get the charge to a site. B to buy.') : 'Hold both sites. B to buy.');
      if (!g.panelOpen) g.setPanel('buy');
    }
    sfx.tick();
  }
  _onLive() {
    const g = this.g;
    if (g.panelOpen === 'buy') g.setPanel(null);
    sfx.go();
  }
  _onPlanted(by) {
    const g = this.g, p = g.players.get(by);
    g.hud.announce('CHARGE PLANTED', `Site ${this.ch.site} · ${PLANT.fuse}s`);
    if (p) g.hud.feedText(`${p.name} planted the charge at ${this.ch.site}`, '#ff6b3d');
    sfx.planted();
  }
  _onDefused(by) {
    const g = this.g, p = g.players.get(by);
    if (p) g.hud.feedText(`${p.name} defused the charge`, '#3ec1ff');
    sfx.defused();
  }
  _onEnd() {
    const g = this.g, L = g.local;
    if (!this.last) return;
    const { w, why } = this.last;
    const txt = { elim: 'Team eliminated', time: 'Time ran out', blown: 'The charge detonated', defused: 'The charge was defused' }[why] || '';
    g.hud.announce(w === L.team ? 'ROUND WON' : `${TEAMS[w].name} WINS THE ROUND`, `${txt} · ${TEAMS.A.name} ${this.score.A} – ${this.score.B} ${TEAMS.B.name}`);
    if (this.round === this.half && Math.max(this.score.A, this.score.B) < this.g.rules.limit) setTimeout(() => g.hud.announce('HALF TIME', 'Teams swap sides · money resets'), 2600);
  }
  _event(ev) { if (ev === 'swap') this.g.hud.feedText('Half time: teams swapped sides', '#ffd60a'); }

  // charge detonation: big boom, everyone near it takes heavy damage (owners apply it)
  _blast() {
    const g = this.g, c = this.ch.p; if (!c) return;
    g.effects.explosion([c[0], c[1] + 0.5, c[2]], true);
    sfx.bigBoom(c);
    g.view.shake = 1;
    for (const p of g.players.values()) {
      if (!p.alive || !g.ownsDamage(p)) continue;
      const pp = g.posOf(p), d = Math.hypot(pp[0] - c[0], pp[1] + 1 - c[1], pp[2] - c[2]);
      if (d > PLANT.blastRadius) continue;
      const dmg = d < PLANT.blastKill ? 999 : Math.round(150 * (1 - (d - PLANT.blastKill) / (PLANT.blastRadius - PLANT.blastKill)) + 10);
      g.damage(p, dmg, null, 'charge', false, c);
    }
  }

  // kill rewards + charge drop (every client runs this from onDeath; only the host changes money)
  onDeath(v, k, weapon, pos) {
    const g = this.g;
    if (g.isHost) {
      if (k && k.team && v.team && k.team !== v.team && (this.ph === 'live' || this.ph === 'planted')) {
        k.money = Math.min(PLANT.maxMoney, k.money + (weapon === 'knife' ? PLANT.knifeKill : PLANT.kill)); this.econDirty = true;
      }
      if (this.ch.s === 'carried' && this.ch.c === v.id) {
        this.ch = { s: 'dropped', c: null, p: pos ? [pos[0], pos[1], pos[2]] : [...g.posOf(v)], site: null };
        this._send('drop');
      }
    }
    if (v.isLocal) { this.hold = null; }
  }

  // ---------------------------------------------------------------- local per-frame
  // returns true when the local player is busy planting/defusing (movement + shooting locked)
  updateLocal(dt, keys) {
    const g = this.g, L = g.local;
    const act = this.actionAvailable(L);
    const want = act && keys.has('KeyF');
    if (want) {
      if (!this.hold || this.hold.kind !== act) { this.hold = { kind: act, t: 0, need: this.holdTime(L, act) }; if (g.net) g.net.send('plp', { id: L.id, k: act }); sfx.plantStart(); }
      this.hold.t += dt;
      if (Math.floor(this.hold.t * 4) !== Math.floor((this.hold.t - dt) * 4)) sfx.plantTick();
      if (this.hold.t >= this.hold.need) {
        const pos = [...L.ms.pos];
        this.hold = null;
        if (g.isHost) this.hostAction(L.id, act, pos); else if (g.net) g.net.send('pla', { k: act, p: pos.map(r2) }, g.hostId);
      }
    } else this.hold = null;
    return !!this.hold;
  }

  // X: throw the charge a couple of metres ahead so a teammate can grab it
  drop(p) {
    if (this.ch.s !== 'carried' || this.ch.c !== p.id || this.ph === 'post') return;
    const g = this.g;
    if (g.isHost) this.hostDrop(p.id); else if (g.net) g.net.send('pdrop', {}, g.hostId);
  }
  hostDrop(id) {
    const g = this.g, p = g.players.get(id);
    if (!p || this.ch.s !== 'carried' || this.ch.c !== id) return;
    const pos = g.posOf(p), fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let x = pos[0], z = pos[2];
    for (let d = 1.8; d > 0; d -= 0.3) {     // as far ahead as the walls allow
      const h = g.world.raycast(pos[0], pos[1] + 0.6, pos[2], fx, 0, fz, d + 0.3);
      if (!h) { x = pos[0] + fx * d; z = pos[2] + fz * d; break; }
    }
    const down = g.world.raycast(x, pos[1] + 0.6, z, 0, -1, 0, 6);
    const y = down ? pos[1] + 0.6 - down.t : pos[1];
    this.ch = { s: 'dropped', c: null, p: [r2(x), r2(y), r2(z)], site: null, np: id, npT: g.time + 1.2 };
    this._send('drop', id);
  }

  // bots: host drives their plant / defuse holds
  botHold(b, dt, busy) {
    const p = b.p, act = this.actionAvailable(p);
    if (!act || busy) { b.holdT = 0; return false; }
    b.holdT = (b.holdT || 0) + dt;
    if (b.holdT >= this.holdTime(p, act)) { b.holdT = 0; this.hostAction(p.id, act, [...p.ms.pos]); }
    return true;
  }

  update(dt) {
    const g = this.g;
    if (!g.isHost && g.match.phase === 'play') this.t -= dt;
    // charge mesh + beeping
    const cp = this.chargePos();
    const show = this.ch.s === 'planted' || this.ch.s === 'dropped' || (this.ch.s === 'carried' && this.carrier() && !this.carrier().isLocal);
    this.chargeMesh.visible = !!(show && cp);
    if (this.chargeMesh.visible) {
      if (this.ch.s === 'carried') { const c = this.carrier(); this.chargeMesh.position.set(cp[0] + Math.sin(c.yaw) * 0.3, cp[1] + (g.crouchOf(c) ? 0.75 : 1.15), cp[2] + Math.cos(c.yaw) * 0.3); this.chargeMesh.rotation.set(0, c.yaw, 0.0); }
      else { this.chargeMesh.position.set(cp[0], cp[1] + 0.02, cp[2]); this.chargeMesh.rotation.set(0, 0.4, 0); }
    }
    if (this.ch.s === 'planted' && this.ph === 'planted') {
      const k = Math.max(0, this.t / PLANT.fuse);
      const interval = 0.12 + 0.9 * k;
      this.beepT -= dt;
      if (this.beepT <= 0) { this.beepT = interval; sfx.beep(cp, k); this.blink = 0.08; }
      this.blink = Math.max(0, (this.blink || 0) - dt);
      this.chargeLed.material.color.set(this.blink > 0 ? '#ff3b30' : '#5a1410');
      this.chargeLight.intensity = this.blink > 0 ? 6 : 0;
    } else { this.chargeLight.intensity = 0; this.chargeLed.material.color.set(this.ch.s === 'defused' ? '#2bd66a' : '#5a1410'); }
  }

  // ---------------------------------------------------------------- HUD data
  buyItems(p) {
    const inv = p.inv || {};
    return BUY.map(it => {
      const price = PLANT.prices[it.id];
      const name = it.kind === 'gun' ? WEAPONS[it.id].name : it.name;
      const icon = it.kind === 'gun' ? ICONS[it.id] : ITEM_ICONS[it.id];
      let owned = false, off = (p.money ?? 0) < price, sub = '';
      if (it.kind === 'gun') owned = inv.primary === it.id || inv.secondary === it.id;
      if (it.id === 'armour') owned = inv.armour >= 100;
      if (it.id === 'nade') { owned = inv.nades >= PLANT.maxNades; sub = `${inv.nades || 0}/${PLANT.maxNades}`; }
      if (it.id === 'kit') { owned = !!inv.kit; if (p.team !== this.def) { off = true; sub = 'DEFENDERS'; } }
      return { id: it.id, name, icon, price, owned, off: off || owned, sub };
    });
  }
  buyHtml(p) {
    return buyHtml({ money: p.money ?? 0, items: this.buyItems(p), timeLeft: this.ph === 'buy' ? this.t : 0, role: p.team === this.atk ? 'ATTACK' : 'DEFEND' });
  }
}
