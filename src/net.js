// Networking transports. Trystero (serverless WebRTC via public relays) for real
// multiplayer, and a BroadcastChannel transport for same-browser testing (?local=1).

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
  async connect(room) {
    this.selfId = 'L' + rid();
    this.ch = new BroadcastChannel('hoptown-' + room);
    this.peers = new Map(); // id -> lastSeen
    this.ch.onmessage = (e) => {
      const m = e.data;
      if (!m || m.from === this.selfId) return;
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
  leave() { clearInterval(this.hb); try { this.ch.close(); } catch { } }
}

export class RtcNet extends Emitter {
  async connect(room) {
    const { joinRoom } = await import('trystero');
    this.room = joinRoom({ appId: 'hoptown.fast-na-ana.github.io', identity: 'none' }, 'hoptown-' + room);
    this.peers = new Set();
    const self = await this.room.getSelf();
    this.selfId = self.peerId;
    const [act] = [this.room.makeAction('m')];
    this.act = act;
    act.onMessage((m, ctx) => {
      if (!m || typeof m !== 'object') return;
      const from = ctx.peerId;
      this._emit(m.t, m.d, from);
    });
    this.room.onPeerJoin(({ peerId }) => { this.peers.add(peerId); this._join(peerId); });
    this.room.onPeerLeave(({ peerId }) => { this.peers.delete(peerId); this._leave(peerId); });
    this.room.onError?.((e) => console.warn('room error', e));
    this.status = 'connected';
  }
  send(t, d, to) {
    const opts = to ? { target: to } : undefined;
    this.act.send({ t, d }, opts).catch(() => { });
  }
  peerIds() { return [...this.peers]; }
  leave() { try { this.room.leave(); } catch { } }
}
