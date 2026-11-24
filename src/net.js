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
    room = String(room).toUpperCase();
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
  info() { return { networks: ['local'], sig: { local: '1/1' }, brokers: '0/0', direct: this.peers.size, relayed: 0, error: '' }; }
  isRelayed() { return false; }
  anyRelayed() { return false; }
  leave() { clearInterval(this.hb); try { this.ch.close(); } catch { } }
}

// Real multiplayer, in two layers:
//  1. Direct WebRTC links. Peers find each other through several independent public signalling
//     networks at once (Nostr relays, MQTT brokers, BitTorrent trackers); whichever introduces two
//     players first wins, and links fail over between networks.
//  2. A relay fallback. Many school / office / campus networks block the direct peer-to-peer
//     connection itself (UDP blocked, client isolation, no NAT hairpin), so two players can see each
//     other but never connect. Every player also joins a room topic on public MQTT brokers over
//     secure WebSockets (two of them on port 443), and any peer without a working direct link gets
//     its game traffic relayed through there instead. Slightly higher latency, but it connects.
// Every player has an app-level id (not any one network's), learnt in a tiny '_id' handshake per
// link, so the game sees one peer no matter how many links it has to it.
const STRATEGIES = [
  ['nostr', () => import('@trystero-p2p/nostr')],
  ['mqtt', () => import('@trystero-p2p/mqtt')],
  ['torrent', () => import('@trystero-p2p/torrent')],
];
const RELAY_BROKERS = [
  'wss://public:public@public.cloud.shiftr.io',      // 443
  'wss://mqtt.eclipseprojects.io:443/mqtt',          // 443
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];
const isOpen = (s) => !!s && (s.readyState === 1 || s.connected === true);
const RELAY_LINK = 'relay:';

class Relay {
  constructor(net, room, urls) { this.net = net; this.urls = urls; this.topic = `hoptown/v2/${room}`; this.brokers = []; this.seq = 0; this.seenA = new Set(); this.seenB = new Set(); }
  async start() {
    const mqtt = (await import('mqtt')).default;
    for (const url of this.urls) {
      let c;
      try { c = mqtt.connect(url, { clean: true, connectTimeout: 8000, reconnectPeriod: 4000, keepalive: 20, queueQoSZero: false, clientId: 'ht' + rid() + rid() }); }
      catch (e) { console.warn('[relay] connect failed', url, e); continue; }
      const b = { url, c, up: false };
      c.on('connect', () => { b.up = true; c.subscribe(this.topic, { qos: 0 }); this.net._relayPresence(); });
      c.on('close', () => { b.up = false; }); c.on('offline', () => { b.up = false; });
      c.on('error', () => { });
      c.on('message', (topic, buf) => { if (topic === this.topic) this._recv(buf); });
      this.brokers.push(b);
    }
  }
  get upCount() { return this.brokers.filter(b => b.up).length; }
  publish(obj) {
    obj.f = this.net.selfId; obj.q = ++this.seq;
    const s = JSON.stringify(obj);
    for (const b of this.brokers) if (b.up) { try { b.c.publish(this.topic, s, { qos: 0 }); } catch { } }
  }
  _recv(buf) {
    let m; try { m = JSON.parse(typeof buf === 'string' ? buf : new TextDecoder().decode(buf)); } catch { return; }
    if (!m || !m.f || m.f === this.net.selfId) return;
    const k = m.f + ':' + m.q;                         // the same message arrives once per broker
    if (this.seenA.has(k) || this.seenB.has(k)) return;
    this.seenA.add(k); if (this.seenA.size > 3000) { this.seenB = this.seenA; this.seenA = new Set(); }
    this.net._onRelay(m);
  }
  stop() { for (const b of this.brokers) { try { b.c.end(true); } catch { } } }
}

export class RtcNet extends Emitter {
  // opts.relays / opts.noP2P are test hooks (a local broker, and a network where WebRTC never connects)
  async connect(room, opts = {}) {
    room = String(room).toUpperCase();
    this.selfId = 'P' + rid() + rid();
    this.peers = new Map();      // app id -> { links: Map(linkKey -> true), seen, relaySeen }
    this.linkPeer = new Map();   // linkKey -> app id
    this.links = new Map();      // linkKey -> { s, pid, act } (direct) | { relay: true }
    this.rooms = []; this.mods = {};
    this.up = [];                // signalling networks that joined
    this.errors = {};
    const cfg = { appId: 'hoptown.fast-na-ana.github.io', identity: 'none' };
    if (NET.turn && NET.turn.length) cfg.turnConfig = NET.turn;
    this.relay = new Relay(this, room, opts.relays || RELAY_BROKERS);
    const relayP = this.relay.start().catch(e => console.warn('[relay] unavailable', e));
    const results = await Promise.allSettled((opts.noP2P ? [] : STRATEGIES).map(async ([name, load]) => {
      const mod = await load();
      const r = mod.joinRoom(cfg, `hoptown-${room}-${name}`);
      const act = r.makeAction('m');
      act.onMessage((m, ctx) => this._onMsg(name, ctx.peerId, act, m));
      r.onPeerJoin(({ peerId }) => this._linkUp(name, peerId, act));
      r.onPeerLeave(({ peerId }) => this._linkDown(name, peerId));
      r.onError?.((e) => { const msg = e && (e.message || e.code || String(e)); this.errors[name] = msg; console.warn(`[net:${name}]`, msg); });
      this.rooms.push(r); this.mods[name] = mod; this.up.push(name);
    }));
    results.forEach((r, i) => { if (r.status === 'rejected') console.warn(`[net:${STRATEGIES[i][0]}] unavailable`, r.reason); });
    await relayP;
    if (!this.up.length && !this.relay.brokers.length) throw new Error('no network reachable');
    this.hb = setInterval(() => this._tick(), 1000);
    this.status = 'connected';
  }
  _tick() {
    const t = performance.now();
    // links where the '_id' handshake hasn't landed yet: say hello again
    for (const [k, l] of this.links) if (!l.relay && !this.linkPeer.has(k)) this._sendLink(k, { t: '_id', d: this.selfId });
    if (t - (this.lastPresence || 0) > 2000) this._relayPresence();
    for (const [id, p] of this.peers) {
      const rk = RELAY_LINK + id;
      if (p.links.has(rk) && t - (p.relaySeen || 0) > 9000) { p.links.delete(rk); this.links.delete(rk); this.linkPeer.delete(rk); }
      const k = this._bestLink(id);
      if (k && !k.startsWith(RELAY_LINK)) this._sendLink(k, { t: '_hb' });
      if (!p.links.size || t - p.seen > 12000) this._dropPeer(id);
    }
  }
  _relayPresence() { if (this.relay && this.relay.upCount) { this.lastPresence = performance.now(); this.relay.publish({ t: '_rp' }); } }
  _onRelay(m) {
    const id = String(m.f), k = RELAY_LINK + id, t = performance.now();
    let p = this.peers.get(id); const fresh = !p;
    if (fresh) { p = { links: new Map(), seen: t }; this.peers.set(id, p); }
    if (!p.links.has(k)) { p.links.set(k, true); this.links.set(k, { relay: true }); this.linkPeer.set(k, id); }
    p.relaySeen = t; p.seen = t;
    if (fresh) { this._join(id); this._relayPresence(); }
    if (m.t === '_rp' || m.t === '_hb') return;
    if (m.o && !m.o.includes(this.selfId)) return;          // relayed to someone else
    this._emit(m.t, m.d, id);
  }
  _key(s, pid) { return s + ':' + pid; }
  _linkUp(s, pid, act) {
    const k = this._key(s, pid);
    this.links.set(k, { s, pid, act, born: performance.now(), seen: 0 });
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
    for (const k of p.links.keys()) { this.linkPeer.delete(k); if (k.startsWith(RELAY_LINK)) this.links.delete(k); }
    this.peers.delete(id); this._leave(id);
  }
  _onMsg(s, pid, act, m) {
    if (!m || typeof m !== 'object') return;
    const k = this._key(s, pid);
    if (!this.links.has(k)) this.links.set(k, { s, pid, act, born: performance.now(), seen: 0 });
    this.links.get(k).seen = performance.now();
    if (m.t === '_id') {
      const id = String(m.d || ''); if (!id || id === this.selfId) return;
      if (this.linkPeer.get(k) === id) return;
      this.linkPeer.set(k, id);
      let p = this.peers.get(id);
      const fresh = !p;
      if (fresh) { p = { links: new Map(), seen: performance.now() }; this.peers.set(id, p); }
      p.links.set(k, true); p.seen = performance.now();
      this._sendLink(k, { t: '_id', d: this.selfId });
      if (fresh) this._join(id);
      return;
    }
    const id = this.linkPeer.get(k);
    if (!id) { this._sendLink(k, { t: '_id', d: this.selfId }); return; }
    const p = this.peers.get(id); if (p) p.seen = performance.now();
    if (m.t === '_hb') return;
    this._emit(m.t, m.d, id);
  }
  // direct links first; the relay only when there is nothing better
  _bestLink(id) {
    const p = this.peers.get(id); if (!p) return null;
    let relay = null;
    const t = performance.now(); let stale = null;
    for (const k of p.links.keys()) {
      const l = this.links.get(k); if (!l) continue;
      if (l.relay) { relay = k; continue; }
      if (t - Math.max(l.seen, l.born) < 5000) return k;     // direct link that is actually delivering
      stale = stale || k;
    }
    return relay || stale;
  }
  _sendLink(k, msg) {
    const l = k && this.links.get(k); if (!l || l.relay) return;
    try { const r = l.act.send(msg, { target: l.pid }); if (r && r.catch) r.catch(() => { }); } catch { }
  }
  send(t, d, to) {
    const msg = { t, d };
    if (to) {
      const k = this._bestLink(to);
      if (k && k.startsWith(RELAY_LINK)) this.relay.publish({ t, d, o: [to] }); else this._sendLink(k, msg);
      return;
    }
    const viaRelay = [];
    for (const id of this.peers.keys()) {
      const k = this._bestLink(id); if (!k) continue;
      if (k.startsWith(RELAY_LINK)) viaRelay.push(id); else this._sendLink(k, msg);
    }
    if (viaRelay.length) this.relay.publish({ t, d, o: viaRelay });
  }
  peerIds() { return [...this.peers.keys()]; }
  anyRelayed() { for (const id of this.peers.keys()) if (this.isRelayed(id)) return true; return false; }
  isRelayed(id) { const k = this._bestLink(id); return !!k && k.startsWith(RELAY_LINK); }
  info() {
    const sig = {};
    for (const [name, mod] of Object.entries(this.mods)) {
      const socks = Object.values((mod.getRelaySockets && mod.getRelaySockets()) || {});
      sig[name] = `${socks.filter(isOpen).length}/${socks.length}`;
    }
    let direct = 0, relayed = 0;
    for (const id of this.peers.keys()) { if (this.isRelayed(id)) relayed++; else direct++; }
    return { networks: this.up.slice(), sig, brokers: `${this.relay.upCount}/${this.relay.brokers.length}`, direct, relayed, error: Object.values(this.errors).pop() || '' };
  }
  leave() { clearInterval(this.hb); this.relay && this.relay.stop(); for (const r of this.rooms) { try { r.leave(); } catch { } } }
}
