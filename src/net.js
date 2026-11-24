// Networking transports. Trystero (serverless WebRTC via public relays) for real
// multiplayer, and a BroadcastChannel transport for same-browser testing (?local=1).

import { NET } from './config.js';

function rid() { return Math.random().toString(36).slice(2, 10); }

class Emitter {
  constructor() { this.handlers = {}; this.joinFns = []; this.leaveFns = []; }
  on(type, fn) { (this.handlers[type] || (this.handlers[type] = [])).push(fn); }
  onJoin(fn) { this.joinFns.push(fn); }
  onLeave(fn) { this.leaveFns.push(fn); }
  _emit(type, data, from) { const hs = this.handlers[type]; if (hs) for (const h of hs) { try { h(data, from); } catch (e) { console.error(e); } } }
  _join(id) { for (const f of this.joinFns) f(id); }
  _leave(id) { for (const f of this.leaveFns) f(id); }
}

export class LocalNet extends Emitter {
  async connect(room, opts = {}) {
    this.selfId = (opts.idPrefix || 'L') + rid();
    this.deaf = performance.now() + (opts.deafMs || 0);   // test hook: ignore everyone for a while
    this.ch = new BroadcastChannel('hoptown-' + room);
    this.peers = new Map(); // id -> lastSeen
    this.ch.onmessage = (e) => {
      const m = e.data;
      if (!m || m.from === this.selfId || performance.now() < this.deaf) return;
      if (m.to && m.to !== this.selfId) return;
      if (!this.peers.has(m.from)) { this.peers.set(m.from, performance.now()); this._join(m.from); }
      this.peers.set(m.from, performance.now());
      if (m.t === '_hb') return;
      this._emit(m.t, m.d, m.from);
    };
    this.hb = setInterval(() => {
      this.ch.postMessage({ t: '_hb', from: this.selfId });
      const now = performance.now();
      for (const [id, seen] of this.peers) if (now - seen > 3500) { this.peers.delete(id); this._leave(id); }
    }, 500);
    this.ch.postMessage({ t: '_hb', from: this.selfId });
    this.status = 'connected';
  }
  send(t, d, to) { this.ch.postMessage({ t, d, from: this.selfId, to }); }
  peerIds() { return [...this.peers.keys()]; }
  info() { return { networks: ['local'], links: this.peers.size }; }
  leave() { clearInterval(this.hb); try { this.ch.close(); } catch { } }
}

// Real multiplayer. Peers find each other through several independent public signalling networks
// at once (Nostr relays, MQTT brokers and BitTorrent trackers); whichever one introduces two players
// first wins, and if one network drops out mid-game the link fails over to another. Every player has
// an app-level id (its own, not any one network's), learnt in a tiny '_id' handshake per link, so the
// game sees one peer no matter how many links it has to it.
const STRATEGIES = [
  ['nostr', () => import('@trystero-p2p/nostr')],
  ['mqtt', () => import('@trystero-p2p/mqtt')],
  ['torrent', () => import('@trystero-p2p/torrent')],
];

export class RtcNet extends Emitter {
  async connect(room) {
    this.selfId = 'P' + rid() + rid();
    this.peers = new Map();      // app id -> { links: Map(linkKey -> link), seen }
    this.linkPeer = new Map();   // linkKey -> app id
    this.links = new Map();      // linkKey -> { s, pid, act }
    this.rooms = [];
    this.up = [];                // strategies that joined
    const cfg = { appId: 'hoptown.fast-na-ana.github.io', identity: 'none' };
    if (NET.turn && NET.turn.length) cfg.turnConfig = NET.turn;
    const results = await Promise.allSettled(STRATEGIES.map(async ([name, load]) => {
      const mod = await load();
      const r = mod.joinRoom(cfg, `hoptown-${room}-${name}`);
      const act = r.makeAction('m');
      act.onMessage((m, ctx) => this._onMsg(name, ctx.peerId, act, m));
      r.onPeerJoin(({ peerId }) => this._linkUp(name, peerId, act));
      r.onPeerLeave(({ peerId }) => this._linkDown(name, peerId));
      r.onError?.((e) => console.warn(`[net:${name}]`, e && (e.message || e.code || e)));
      this.rooms.push(r); this.up.push(name);
    }));
    results.forEach((r, i) => { if (r.status === 'rejected') console.warn(`[net:${STRATEGIES[i][0]}] unavailable`, r.reason); });
    if (!this.up.length) throw new Error('no signalling network reachable');
    // keep-alive: links that go quiet are dropped; the peer leaves when its last link goes
    this.hb = setInterval(() => {
      const t = performance.now();
      for (const [id, p] of this.peers) {
        this._sendLink(this._bestLink(id), { t: '_hb' });
        if (t - p.seen > 12000) this._dropPeer(id);
      }
    }, 1000);
    this.status = 'connected';
  }
  _key(s, pid) { return s + ':' + pid; }
  _linkUp(s, pid, act) {
    const k = this._key(s, pid);
    this.links.set(k, { s, pid, act });
    this._sendLink(k, { t: '_id', d: this.selfId });
  }
  _linkDown(s, pid) {
    const k = this._key(s, pid), id = this.linkPeer.get(k);
    this.links.delete(k); this.linkPeer.delete(k);
    const p = id && this.peers.get(id);
    if (p) { p.links.delete(k); if (!p.links.size) this._dropPeer(id); }
  }
  _dropPeer(id) {
    const p = this.peers.get(id); if (!p) return;
    for (const k of p.links.keys()) this.linkPeer.delete(k);
    this.peers.delete(id); this._leave(id);
  }
  _onMsg(s, pid, act, m) {
    if (!m || typeof m !== 'object') return;
    const k = this._key(s, pid);
    if (!this.links.has(k)) this.links.set(k, { s, pid, act });
    if (m.t === '_id') {
      const id = String(m.d || ''); if (!id || id === this.selfId) return;
      const prev = this.linkPeer.get(k);
      if (prev === id) return;
      this.linkPeer.set(k, id);
      let p = this.peers.get(id);
      const fresh = !p;
      if (fresh) { p = { links: new Map(), seen: performance.now() }; this.peers.set(id, p); }
      p.links.set(k, true); p.seen = performance.now();
      this._sendLink(k, { t: '_id', d: this.selfId });     // make sure they know us on this link too
      if (fresh) this._join(id);
      return;
    }
    const id = this.linkPeer.get(k);
    if (!id) { this._sendLink(k, { t: '_id', d: this.selfId }); return; }   // unknown link: introduce ourselves
    const p = this.peers.get(id); if (p) p.seen = performance.now();
    if (m.t === '_hb') return;
    this._emit(m.t, m.d, id);
  }
  _bestLink(id) {
    const p = this.peers.get(id); if (!p) return null;
    for (const k of p.links.keys()) if (this.links.has(k)) return k;
    return null;
  }
  _sendLink(k, msg) {
    const l = k && this.links.get(k); if (!l) return;
    try { const r = l.act.send(msg, { target: l.pid }); if (r && r.catch) r.catch(() => { }); } catch { }
  }
  send(t, d, to) {
    const msg = { t, d };
    if (to) { this._sendLink(this._bestLink(to), msg); return; }
    for (const id of this.peers.keys()) this._sendLink(this._bestLink(id), msg);
  }
  peerIds() { return [...this.peers.keys()]; }
  info() { return { networks: this.up.slice(), links: this.links.size }; }
  leave() { clearInterval(this.hb); for (const r of this.rooms) { try { r.leave(); } catch { } } }
}
