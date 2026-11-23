// Minimap (rotating, player-centred) + full-screen map (M).
// Teammates always show; enemies only while you can actually see them (then linger ~1s);
// teammates' death spots are marked until they respawn.
import { TEAMS } from './modes.js';

const $ = (id) => document.getElementById(id);
const SCALE = 6;          // image pixels per metre
const MINI_RANGE = 34;    // metres from centre to minimap edge

export class Minimap {
  constructor(game) {
    this.g = game;
    this.mini = $('mm'); this.mctx = this.mini.getContext('2d');
    this.big = $('bm'); this.bctx = this.big.getContext('2d');
    this.bigEl = $('bigmap');
    this.spotted = new Map();
    this.deaths = [];
    this.acc = 0; this.spotAcc = 0;
    this.open = false;
    this.rebuild();
  }

  // Render the map's colliders top-down into an offscreen image once per map.
  rebuild() {
    const boxes = this.g.world.boxes.filter(b => b.max[1] < 40 && b.min[1] > -0.5);
    const inv = this.g.world.boxes.filter(b => b.tag === 'invisible');
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const b of inv.length ? inv : boxes) { minX = Math.min(minX, b.max[0]); maxX = Math.max(maxX, b.min[0]); minZ = Math.min(minZ, b.max[2]); maxZ = Math.max(maxZ, b.min[2]); }
    if (this.g.map.mmBounds) ({ minX, maxX, minZ, maxZ } = this.g.map.mmBounds);
    if (!isFinite(minX)) { minX = -40; maxX = 40; minZ = -30; maxZ = 30; }
    this.bounds = { minX, maxX, minZ, maxZ };
    const c = document.createElement('canvas');
    c.width = Math.ceil((maxX - minX) * SCALE); c.height = Math.ceil((maxZ - minZ) * SCALE);
    const g = c.getContext('2d');
    const desert = this.g.mapId === 'sunstone';
    g.fillStyle = desert ? '#ead9b4' : this.g.mapId === 'drill' ? '#dcdcd8' : '#dfe6d2'; g.fillRect(0, 0, c.width, c.height);
    const sorted = boxes.filter(b => b.tag !== 'invisible').sort((a, b) => a.max[1] - b.max[1]);
    for (const b of sorted) {
      const h = b.max[1];
      if (h < 0.2) continue;
      const x = (b.min[0] - minX) * SCALE, y = (b.min[2] - minZ) * SCALE;
      const w = (b.max[0] - b.min[0]) * SCALE, d = (b.max[2] - b.min[2]) * SCALE;
      g.fillStyle = h < 1.4 ? '#a9a497' : h < 3 ? '#6d6a61' : h < 4.6 ? '#3c3a35' : '#1e1d1a';
      g.fillRect(x, y, Math.max(1, w), Math.max(1, d));
    }
    // grid for readability
    g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 1;
    for (let x = 0; x < c.width; x += 10 * SCALE) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
    for (let y = 0; y < c.height; y += 10 * SCALE) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
    this.img = c;
    this.deaths = []; this.spotted.clear();
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.bigEl.classList.toggle('on', this.open);
    $('minimap').style.visibility = this.open ? 'hidden' : '';
  }

  onDeath(victim, pos) {
    const L = this.g.local;
    const mine = this.g.teams ? victim.team && victim.team === L.team : victim === L;
    if (!mine || !pos) return;
    this.deaths.push({ id: victim.id, pos: [...pos], t: this.g.time, team: victim.team });
  }

  _spot() {
    const g = this.g, L = g.local;
    if (!L.alive) return;
    const eye = g.eyeOf(L);
    const fx = -Math.sin(g.view.yaw), fz = -Math.cos(g.view.yaw);
    for (const o of g.players.values()) {
      if (o === L || !o.alive || o.afk || !g.isEnemy(L, o)) continue;
      const op = g.posOf(o);
      const dx = op[0] - eye[0], dz = op[2] - eye[2], dist = Math.hypot(dx, dz);
      if (dist > 90) continue;
      if (dist > 4 && (dx * fx + dz * fz) / dist < 0.5) continue;        // outside ~60° view cone
      const chest = [op[0], op[1] + 1.2, op[2]];
      if (g.world.lineOfSight(eye, chest) || g.world.lineOfSight(eye, [op[0], op[1] + 1.7, op[2]])) this.spotted.set(o.id, g.time + 1.0);
    }
  }

  update(dt) {
    this.spotAcc += dt;
    if (this.spotAcc > 0.1) { this.spotAcc = 0; this._spot(); }
    // death markers last until that teammate is back (at least 2s)
    this.deaths = this.deaths.filter(d => { const p = this.g.players.get(d.id); return p && (this.g.time - d.t < 2 || !p.alive) && this.g.time - d.t < 12; });
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    this.acc = 0;
    if (this.open) this._drawBig(); else this._drawMini();
  }

  _markers() {
    const g = this.g, L = g.local, out = [];
    for (const o of g.players.values()) {
      if (o === L || !o.alive || o.afk) continue;
      const p = g.posOf(o);
      if (!g.isEnemy(L, o)) out.push({ kind: 'ally', x: p[0], z: p[2], yaw: o.yaw, color: g.displayColor(o) });
      else if ((this.spotted.get(o.id) || 0) > g.time) out.push({ kind: 'enemy', x: p[0], z: p[2], color: g.teams && o.team ? TEAMS[o.team].color : '#ff3b30', fade: Math.min(1, (this.spotted.get(o.id) - g.time) / 0.4) });
    }
    for (const d of this.deaths) out.push({ kind: 'dead', x: d.pos[0], z: d.pos[2], color: d.team ? TEAMS[d.team].color : '#111' });
    if (g.flags) for (const t of ['A', 'B']) { const f = g.flags[t]; out.push({ kind: 'flag', x: f.pos[0], z: f.pos[2], color: TEAMS[t].color, state: f.state }); }
    if (g.plant && g.map.plant) {
      const P = g.plant;
      for (const st of g.map.plant.sites) out.unshift({ kind: 'site', x: st.mark[0], z: st.mark[2], id: st.id, hot: P.ch.s === 'planted' && P.ch.site === st.id, w: st.max[0] - st.min[0], d: st.max[2] - st.min[2], cx: (st.min[0] + st.max[0]) / 2, cz: (st.min[2] + st.max[2]) / 2 });
      const cp = P.chargePos();
      const mine = L.team === P.atk;
      if (cp && (P.ch.s === 'planted' || (mine && (P.ch.s === 'dropped' || (P.ch.s === 'carried' && P.ch.c !== L.id))))) out.push({ kind: 'charge', x: cp[0], z: cp[2], state: P.ch.s, t: g.time });
    }
    return out;
  }

  _drawMarker(c, m, px, py, s = 1, rot = 0) {
    c.save(); c.translate(px, py);
    c.lineWidth = 2 * s; c.strokeStyle = '#111';
    if (m.kind === 'ally') {
      c.fillStyle = m.color; c.beginPath(); c.arc(0, 0, 5 * s, 0, 6.283); c.fill(); c.stroke();
    } else if (m.kind === 'enemy') {
      c.globalAlpha = m.fade; c.fillStyle = m.color;
      c.beginPath(); c.moveTo(0, -6 * s); c.lineTo(6 * s, 0); c.lineTo(0, 6 * s); c.lineTo(-6 * s, 0); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = '#ff3b30'; c.lineWidth = 1.5 * s; c.beginPath(); c.arc(0, 0, 9 * s, 0, 6.283); c.stroke();
    } else if (m.kind === 'dead') {
      c.rotate(-rot);
      c.strokeStyle = '#111'; c.lineWidth = 5 * s; c.beginPath(); c.moveTo(-5 * s, -5 * s); c.lineTo(5 * s, 5 * s); c.moveTo(5 * s, -5 * s); c.lineTo(-5 * s, 5 * s); c.stroke();
      c.strokeStyle = m.color; c.lineWidth = 2.5 * s; c.stroke();
    } else if (m.kind === 'site') {
      c.rotate(-rot);
      c.globalAlpha = 0.9; c.fillStyle = m.hot ? '#ff3b30' : '#ffd60a';
      c.beginPath(); c.arc(0, 0, 9 * s, 0, 6.283); c.fill(); c.stroke();
      c.fillStyle = '#111'; c.font = `900 ${Math.round(11 * s)}px Archivo, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(m.id, 0, 0.5 * s);
    } else if (m.kind === 'charge') {
      c.rotate(-rot);
      const blink = m.state === 'planted' ? (Math.floor(m.t * 4) % 2 === 0) : true;
      c.fillStyle = blink ? (m.state === 'planted' ? '#ff3b30' : '#ffd60a') : '#5a1410';
      c.fillRect(-5 * s, -4 * s, 10 * s, 8 * s); c.strokeRect(-5 * s, -4 * s, 10 * s, 8 * s);
    } else if (m.kind === 'flag') {
      c.rotate(-rot);
      c.fillStyle = m.color; c.fillRect(-1 * s, -9 * s, 2.5 * s, 13 * s); c.strokeRect(-1 * s, -9 * s, 2.5 * s, 13 * s);
      c.beginPath(); c.moveTo(1.5 * s, -9 * s); c.lineTo(9 * s, -6 * s); c.lineTo(1.5 * s, -3 * s); c.closePath(); c.fill(); c.stroke();
      if (m.state !== 'home') { c.strokeStyle = '#ffd60a'; c.lineWidth = 2 * s; c.beginPath(); c.arc(2, -3 * s, 12 * s, 0, 6.283); c.stroke(); }
    }
    c.restore();
  }

  _selfArrow(c, px, py, rot, s = 1) {
    c.save(); c.translate(px, py); c.rotate(rot);
    c.fillStyle = '#ffd60a'; c.strokeStyle = '#111'; c.lineWidth = 2.5 * s;
    c.beginPath(); c.moveTo(0, -9 * s); c.lineTo(7 * s, 7 * s); c.lineTo(0, 3 * s); c.lineTo(-7 * s, 7 * s); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }

  _fit(canvas) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    return { w, h, dpr };
  }

  _drawMini() {
    const g = this.g, c = this.mctx, { w, h, dpr } = this._fit(this.mini);
    if (!w) return;
    const L = g.local, me = L.alive ? L.ms.pos : (g.camera ? [g.camera.position.x, 0, g.camera.position.z] : [0, 0, 0]);
    const ppm = (w / 2) / MINI_RANGE, rot = g.view.yaw, B = this.bounds;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.save();
    c.translate(w / 2, h / 2); c.rotate(rot);
    c.drawImage(this.img, (B.minX - me[0]) * ppm, (B.minZ - me[2]) * ppm, this.img.width / SCALE * ppm, this.img.height / SCALE * ppm);
    for (const m of this._markers()) this._drawMarker(c, m, (m.x - me[0]) * ppm, (m.z - me[2]) * ppm, 1, rot);
    c.restore();
    // ring of "north" for orientation
    c.save(); c.translate(w / 2, h / 2); c.rotate(rot);
    c.fillStyle = '#111'; c.font = '700 10px Space Mono, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('N', 0, -(h / 2) + 9);
    c.restore();
    this._selfArrow(c, w / 2, h / 2, 0);
  }

  _drawBig() {
    const g = this.g, c = this.bctx, { w, h, dpr } = this._fit(this.big);
    if (!w) return;
    const B = this.bounds, mw = B.maxX - B.minX, mh = B.maxZ - B.minZ;
    const ppm = Math.min(w / mw, h / mh) * 0.96;
    const ox = (w - mw * ppm) / 2, oy = (h - mh * ppm) / 2;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.drawImage(this.img, ox, oy, mw * ppm, mh * ppm);
    const s = Math.max(1, ppm / 8);
    for (const m of this._markers()) this._drawMarker(c, m, ox + (m.x - B.minX) * ppm, oy + (m.z - B.minZ) * ppm, s, 0);
    const L = g.local;
    if (L.alive) this._selfArrow(c, ox + (L.ms.pos[0] - B.minX) * ppm, oy + (L.ms.pos[2] - B.minZ) * ppm, -g.view.yaw, s);
  }
}
