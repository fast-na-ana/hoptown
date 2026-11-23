// DOM heads-up display.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ICONS = {
  rifle: '<svg viewBox="0 0 64 24"><path d="M2 9h34l3-3h10v3h13v4H49l-2 2H35l-3 7h-6l2-7h-6l-3 5h-6l2-5H2z"/></svg>',
  pistol: '<svg viewBox="0 0 40 28"><path d="M3 4h32v7H17l-3 13H6l3-13H3z"/></svg>',
  sniper: '<svg viewBox="0 0 80 22"><path d="M1 9h6l2-2h26V4h18v3h6v2h20v3H58l-3 2H40l-3 6h-5l1-6h-8l-4 5h-6l3-5H9L7 13H1z"/></svg>',
  smg: '<svg viewBox="0 0 56 26"><path d="M2 8h8V5h6v3h20l2-2h8v3h8v4h-8l-2 2h-6l-1 10h-6l1-10h-4l-3 6h-6l2-6H16v2h-4v-2H2z"/></svg>',
  shotgun: '<svg viewBox="0 0 84 20"><path d="M1 6h50v-2h30v4H51v2h22v4H51l-2 1H34l-3 5h-6l2-5H19l-4 3H3l2-4H1z"/></svg>',
  hcannon: '<svg viewBox="0 0 44 30"><path d="M2 3h38v9H22l-3 15h-9l3-15H8v2H5v-2H2z"/></svg>',
  knife: '<svg viewBox="0 0 48 20"><path d="M2 8h14v5H2zM16 6h3v9h-3zM19 8h18c5 0 9 2 9 2s-5 3-12 3H19z"/></svg>',
  grenade: '<svg viewBox="0 0 32 32"><circle cx="15" cy="19" r="10"/><path d="M12 6h8v5h-8zM20 7l6-3 1 2-6 3z"/></svg>',
  blink: '<svg viewBox="0 0 32 32"><ellipse cx="16" cy="16" rx="13" ry="5" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="16" cy="16" r="3.5"/><path d="M16 1l4 6h-8zM16 31l-4-6h8z"/></svg>',
  charge: '<svg viewBox="0 0 32 24"><path d="M3 6h26v14H3zM8 2h6v4H8zM20 9h6v4h-6z"/></svg>',
  grenadeFeed: '✹', fall: '↓',
};

export class Hud {
  constructor() {
    this.el = $('hud');
    this.feed = $('killfeed');
    this.cross = $('crosshair');
    this.hitm = $('hitmarker');
    this.hitT = 0; this.noticeT = 0; this.promptText = '';
    this.vignette = $('vignette');
    this._cache = {};
    // build ability tiles + weapon slots once
    $('abilities').innerHTML = [
      ['nade', 'G', 'grenade', 'FRAG', 'Throw a grenade'],
      ['blink', 'Q', 'blink', 'BLINK', 'Throw, press again to warp'],
      ['melee', 'V', 'knife', 'KNIFE', 'One-hit melee'],
    ].map(([id, key, icon, name, sub]) => `
      <div class="ab" id="ab-${id}">
        <div class="ab-ring"></div>
        <div class="ab-icon">${ICONS[icon]}</div>
        <div class="ab-key">${key}</div>
        <div class="ab-text"><b>${name}</b><span id="ab-${id}-sub">${sub}</span></div>
        <div class="ab-pips" id="ab-${id}-pips"></div>
      </div>`).join('');
    // blood splatter textures (procedural)
    const splat = () => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d');
      const red = (a) => `rgba(${95 + Math.random() * 45},${Math.random() * 6},${Math.random() * 8},${a})`;
      // irregular core made of overlapping lobes
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * 6.283, d = Math.random() * 34;
        g.fillStyle = red(0.55 + Math.random() * 0.3);
        g.beginPath(); g.ellipse(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 18 + Math.random() * 26, 12 + Math.random() * 20, Math.random() * 3, 0, 6.283); g.fill();
      }
      // spikes flung outward
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * 6.283, l = 50 + Math.random() * 70, w = 2 + Math.random() * 5;
        g.save(); g.translate(128, 128); g.rotate(a); g.fillStyle = red(0.75);
        g.beginPath(); g.moveTo(20, -w); g.lineTo(l, 0); g.lineTo(20, w); g.fill();
        g.beginPath(); g.arc(l + 4, 0, w * 0.9, 0, 6.283); g.fill(); g.restore();
      }
      // fine mist
      for (let i = 0; i < 60; i++) { const a = Math.random() * 6.283, d = 40 + Math.random() * 85; g.fillStyle = red(0.6); g.beginPath(); g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 0.8 + Math.random() * 2.6, 0, 6.283); g.fill(); }
      // drips
      for (let i = 0; i < 4; i++) { const x = 100 + Math.random() * 56; const h = 50 + Math.random() * 80; g.fillStyle = red(0.8); g.fillRect(x, 140, 3 + Math.random() * 4, h); g.beginPath(); g.arc(x + 3, 140 + h, 4.5, 0, 6.283); g.fill(); }
      return c.toDataURL();
    };
    $('lowhp').innerHTML = '<div class="tint"></div>' + ['tl', 'tr', 'bl', 'br', 'l', 'r'].map(pos => `<div class="splat ${pos}" style="background-image:url(${splat()})"></div>`).join('');
    this.setSlots(['rifle', 'pistol', 'knife']);
  }
  show(v) { this.el.style.display = v ? 'block' : 'none'; }
  // current key labels per action (from the player's keybinds)
  key(id) { return (this.keys && this.keys[id]) || ({ use: 'F', buy: 'B', drop: 'X', reload: 'R', blink: 'Q', grenade: 'G', quickknife: 'V', help: 'H', map: 'M', scores: 'TAB', back2: 'ENTER', jump: 'SPACE', crouch: 'SHIFT', left: 'A', right: 'D', primary: '1', sidearm: '2', knife: '3' }[id]); }
  kb(id) { return `<kbd>${esc(this.key(id))}</kbd>`; }
  setKeys(labels) {
    this.keys = labels; this.dropKey = this.key('drop');
    const ab = { nade: 'grenade', blink: 'blink', melee: 'quickknife' };
    for (const [el, act] of Object.entries(ab)) { const k = document.querySelector(`#ab-${el} .ab-key`); if (k) k.textContent = this.key(act); }
    this._slots = null;
    const kb = (id) => this.kb(id);
    $('help').innerHTML = `<h4>HOW TO PLAY <span>${esc(this.key('help'))} to hide</span></h4><ul>
      <li>${kb('jump')} jump · tap again in air = <b>double jump</b> · hold to <b>bunny hop</b></li>
      <li>${kb('crouch')} while running = <b>slide</b> (speed boost). Jump out of a slide to keep it</li>
      <li>${kb('left')}/${kb('right')} + mouse turn in the air = <b>air strafe</b> for more speed</li>
      <li>${kb('grenade')} <b>Frag grenade</b> · blast knocks you back</li>
      <li>${kb('blink')} <b>Blink</b> · throw the disc, press ${kb('blink')} again to <b>teleport</b> to it</li>
      <li>${kb('quickknife')} <b>Quick knife</b> · very close range · one hit = one kill</li>
      <li>${kb('primary')} primary · ${kb('sidearm')} sidearm · ${kb('knife')} knife · <kbd>RMB</kbd> aim / scope · ${kb('reload')} reload</li>
      <li>${kb('buy')} loadout / buy menu · ${kb('use')} inspect, plant, defuse · ${kb('drop')} drop the charge</li>
      <li>${kb('scores')} scores · ${kb('map')} big map · rebind keys in the menu's Controls tab</li>
    </ul>`;
  }
  // owned weapons in key order (1 primary, 2 sidearm, 3 knife)
  setSlots(list, charge = false) {
    const key = list.join(',') + (charge ? '+c' : '');
    if (this._slots === key) return;
    this._slots = key; this.slotList = list;
    const slotKey = (w) => w === 'knife' ? 3 : ['pistol', 'hcannon'].includes(w) ? 2 : 1;
    $('slots').innerHTML = list.map((w) => `<div class="slot" id="slot-${w}"><i>${slotKey(w)}</i>${ICONS[w]}</div>`).join('')
      + (charge ? `<div class="slot charge" title="You carry the charge"><i>${this.dropKey || 'X'} DROP</i>${ICONS.charge}</div>` : '');
    for (const k in this._cache) if (k.startsWith('slot-')) delete this._cache[k];
  }

  _cls(el, cls, on) {
    const key = (el.id || el) + '.' + cls;
    if (this._cache[key] === on) return;
    this._cache[key] = on; el.classList.toggle(cls, on);
  }

  _set(id, prop, val) {
    const key = id + prop;
    if (this._cache[key] === val) return false;
    this._cache[key] = val;
    const el = $(id);
    if (prop === 'html') el.innerHTML = val; else if (prop === 'text') el.textContent = val; else el.style.setProperty(prop, val);
    return true;
  }

  setVitals(hp, max, speed, armour = null) {
    const row = $('armour-row');
    if (armour === null) { if (row.style.display !== 'none') row.style.display = 'none'; }
    else {
      if (row.style.display !== 'flex') row.style.display = 'flex';
      const a = Math.max(0, Math.round(armour));
      if (this._lastAr !== undefined && a < this._lastAr) { row.classList.remove('hit'); void row.offsetWidth; row.classList.add('hit'); }
      this._lastAr = a;
      this._set('ar-num', 'text', String(a));
      this._set('ar-fill', 'width', a + '%');
      this._cls(row, 'empty', a <= 0);
    }
    const h = Math.max(0, Math.ceil(hp));
    this._set('hp-num', 'text', String(h));
    this._set('hp-fill', 'width', Math.max(0, hp / max * 100) + '%');
    this._set('hp-fill', 'background', hp > 60 ? '#2bd66a' : hp > 30 ? '#ffd60a' : '#ff4a3d');
    this._set('speed', 'text', (Math.round(speed * 10) / 10).toFixed(1));
  }

  setWeapon(id, name, mag, magMax, reloading, reloadPct) {
    this._set('wpn-name', 'text', name);
    if (id === 'knife') this._set('ammo', 'html', '<span class="inf">MELEE</span>');
    else if (reloading) this._set('ammo', 'html', `<span class="reload">RELOADING<i style="width:${Math.round(reloadPct * 100)}%"></i></span>`);
    else this._set('ammo', 'html', `<b class="${mag <= Math.ceil(magMax * 0.25) ? 'low' : ''}">${mag}</b><span class="max">/ ${magMax}</span>`);
    for (const w of this.slotList || []) { const el = $('slot-' + w); if (el) this._cls(el, 'on', w === id); }
  }

  setAbilities(a) {
    // grenades
    const n = $('ab-nade');
    this._cls(n, 'ready', a.nades > 0); this._cls(n, 'empty', a.nades === 0);
    this._set('ab-nade', '--p', (a.nades < a.nadeMax && !a.bought ? Math.round(a.nadePct * 100) : 0) + '%');
    this._set('ab-nade-pips', 'html', Array.from({ length: a.nadeMax }, (_, i) => `<i class="${i < a.nades ? 'on' : ''}"></i>`).join(''));
    this._set('ab-nade-sub', 'text', a.nades > 0 ? `${a.nades} ready` : a.bought ? 'buy in the shop' : `recharging ${Math.ceil(a.nadeLeft)}s`);
    // blink
    const b = $('ab-blink');
    this._cls(b, 'ready', a.blink === 'ready'); this._cls(b, 'active', a.blink === 'active'); this._cls(b, 'empty', a.blink === 'cooldown');
    this._set('ab-blink', '--p', (a.blink === 'cooldown' ? Math.round(a.blinkPct * 100) : 0) + '%');
    const bk = this.key('blink');
    this._set('ab-blink-sub', 'text', a.blink === 'active' ? `${bk} again: WARP!` : a.blink === 'cooldown' ? `cooldown ${Math.ceil(a.blinkCd)}s` : `throw · ${bk} again warps`);
    // knife
    const m = $('ab-melee');
    this._cls(m, 'ready', a.knifeReady); this._cls(m, 'empty', !a.knifeReady);
  }

  setScope(on, cycling) {
    const el = $('scope');
    this._cls(el, 'on', on); this._cls(el, 'cycling', !!cycling);
  }

  setLowHealth(on, hp) {
    const el = $('lowhp');
    if (el.classList.contains('on') !== on) {
      el.classList.toggle('on', on);
      if (on) for (const s of el.querySelectorAll('.splat')) s.style.transform = `rotate(${Math.random() * 360}deg) scale(${0.8 + Math.random() * 0.5})`;
    }

  }

  setCrosshair(spread, visible, knife) {
    const gap = Math.round(4 + spread * 900);
    this._set('crosshair', '--gap', gap + 'px');
    this._set('crosshair', 'opacity', visible ? '1' : '0');
    this._cls(this.cross, 'knife', !!knife);
  }

  hitmarker(head, kill) {
    this.hitm.className = 'show' + (head ? ' head' : '') + (kill ? ' kill' : '');
    this.hitT = kill ? 0.35 : 0.16;
  }

  setMatch({ timeLeft, endless, round, phase, myKills, killLimit, rank, total, leaderName, leaderKills, leaderColor, roomCode, players, isHost, bots, difficulty, modeName, teams, scoreA, scoreB, myTeam, mapName }) {
    const m = Math.max(0, Math.floor(timeLeft / 60)), s = Math.max(0, Math.floor(timeLeft % 60));
    this._set('m-round', 'text', `ROUND ${round}`);
    this._set('m-phase', 'text', phase === 'warmup' ? 'GET READY' : phase === 'end' ? 'ROUND OVER' : (modeName || 'FREE FOR ALL'));
    this._cls($('match'), 'teams', !!teams);
    if (teams) {
      const tot = killLimit || Math.max(10, scoreA, scoreB) * 1.25;
      this._set('m-teams', 'html', `<div class="tm A${myTeam === 'A' ? ' me' : ''}"><span>EMBER</span><b>${scoreA}</b></div><div class="tlim">/${killLimit || '∞'}</div><div class="tm B${myTeam === 'B' ? ' me' : ''}"><b>${scoreB}</b><span>TIDE</span></div>`
        + `<div class="tbar"><i class="A" style="width:${Math.min(50, scoreA / tot * 50)}%"></i><i class="B" style="width:${Math.min(50, scoreB / tot * 50)}%"></i></div>`);
    }
    this._set('timer', 'text', phase === 'end' ? '--:--' : endless ? '∞' : `${m}:${String(s).padStart(2, '0')}`);
    this._set('m-kills', 'text', String(myKills));
    this._set('m-goal', 'text', killLimit ? String(killLimit) : '∞');
    this._set('m-bar', 'width', Math.min(100, myKills / killLimit * 100) + '%');
    this._set('m-rank', 'html', `<b>#${rank}</b> of ${total}`);
    this._set('m-leader', 'html', leaderName ? `<span class="dot" style="background:${leaderColor}"></span>${esc(leaderName)} <b>${leaderKills}</b>` : '<i>you lead</i>');
    this._set('room-pill', 'html', roomCode
      ? `<span class="live"></span><b>ONLINE</b> ROOM ${esc(roomCode)} · ${players} PLAYER${players === 1 ? '' : 'S'}${isHost ? ' · HOST' : ''}`
      : `<span class="off"></span><b>OFFLINE</b> ${bots} BOT${bots === 1 ? '' : 'S'} · ${String(difficulty).toUpperCase()}`);
  }

  setFlags(f) {
    const el = $('flagbar');
    if (!f) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
    el.style.display = 'flex';
    const chip = (t, name) => {
      const s = f[t].state;
      const who = s === 'carried' ? f.names(f[t].carrier) : '';
      return `<div class="fchip ${t} ${s}${f.mine === t ? ' mine' : ''}"><i></i><b>${name}</b><span>${s === 'home' ? 'HOME' : s === 'carried' ? 'TAKEN · ' + esc(who) : 'DROPPED'}</span></div>`;
    };
    this._set('flagbar', 'html', chip('A', 'EMBER FLAG') + chip('B', 'TIDE FLAG'));
  }

  // plant & defuse bar: alive pips per team, round clock or charge state, your role
  setPlant(st) {
    const el = $('plantbar');
    if (!st) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
    el.style.display = 'flex';
    const pips = (t) => st.alive[t].map(a => `<span class="pip${a ? '' : ' dead'}"></span>`).join('');
    const m = Math.max(0, Math.floor(st.t / 60)), sec = Math.max(0, Math.floor(st.t % 60));
    const clock = `${m}:${String(sec).padStart(2, '0')}`;
    const mid = st.ph === 'planted' ? `<div class="pb-mid planted"><big>${clock}</big><small>CHARGE · SITE ${st.site}</small></div>`
      : `<div class="pb-mid"><big>${st.ph === 'post' ? '--:--' : clock}</big><small>${st.ph === 'buy' ? 'BUY TIME' : st.ph === 'post' ? 'ROUND OVER' : 'ROUND ' + st.round}</small></div>`;
    this._set('plantbar', 'html', `<div class="pb-team A">${pips('A')}<b>${st.score.A}</b></div>${mid}<div class="pb-team B"><b>${st.score.B}</b>${pips('B')}</div><div class="pb-role ${st.role === 'ATTACK' ? 'atk' : 'def'}">${st.role}${st.carrying ? ' · CHARGE' : ''}</div>`);
  }
  setMoney(v, sub = '') {
    const el = $('money');
    if (v === null) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
    el.style.display = 'block';
    this._set('money', 'html', `$${v}${sub ? `<small>${esc(sub)}</small>` : ''}`);
  }
  setAction(label, pct, kind) {
    const el = $('actbar');
    if (label === null) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
    el.style.display = 'block';
    this._cls(el, 'defuse', kind === 'defuse');
    this._set('act-label', 'text', label);
    this._set('act-fill', 'width', Math.round(pct * 100) + '%');
  }

  setStreak(n) {
    const el = $('streak');
    el.style.display = n >= 2 ? 'flex' : 'none';
    this._set('streak-n', 'text', String(n));
  }

  prompt(text) {
    if (text === this.promptText) return;
    this.promptText = text;
    const el = $('prompt');
    el.innerHTML = text || '';
    el.style.opacity = text ? 1 : 0;
  }

  addFeed(killer, kcolor, victim, vcolor, weapon, head) {
    const row = document.createElement('div');
    row.className = 'feed-row';
    const icon = ICONS[weapon] || (weapon === 'fall' ? '<span>FALL</span>' : ICONS.rifle);
    row.innerHTML = killer
      ? `<i class="dot" style="background:${kcolor}"></i><b>${esc(killer)}</b><span class="w">${icon}${head ? '<em>HS</em>' : ''}</span><i class="dot" style="background:${vcolor}"></i><b>${esc(victim)}</b>`
      : `<span class="w">${icon}</span><i class="dot" style="background:${vcolor}"></i><b>${esc(victim)}</b>`;
    this.feed.prepend(row);
    while (this.feed.children.length > 6) this.feed.lastChild.remove();
    setTimeout(() => row.classList.add('fade'), 5000);
    setTimeout(() => row.remove(), 6000);
  }
  feedText(text, color = '#fff') {
    const row = document.createElement('div');
    row.className = 'feed-row info'; row.innerHTML = `<i class="dot" style="background:${color}"></i><span>${esc(text)}</span>`;
    this.feed.prepend(row);
    setTimeout(() => row.classList.add('fade'), 4200);
    setTimeout(() => row.remove(), 5000);
  }
  announce(text, sub = '') {
    const a = $('announce');
    a.innerHTML = `<div>${esc(text)}</div>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    a.classList.remove('pop'); void a.offsetWidth; a.classList.add('pop');
  }
  notice(text) {
    const n = $('notice');
    n.textContent = text; n.style.opacity = 1; n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop');
    this.noticeT = 1.4;
  }
  damageFrom(angle) {
    const d = document.createElement('div');
    d.className = 'dmg-ind';
    d.style.transform = `translate(-50%,-50%) rotate(${angle}rad) translateY(-130px)`;
    $('dmg-layer').appendChild(d);
    setTimeout(() => d.remove(), 900);
  }
  death(killerName, color, respawnIn) {
    const el = $('death');
    if (killerName === null) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
    el.style.display = 'flex';
    this._set('death-by', 'html', killerName ? `ELIMINATED BY <b style="color:${color}">${esc(killerName)}</b>` : 'YOU DIED');
    this._set('death-timer', 'text', typeof respawnIn === 'string' ? respawnIn : respawnIn > 0 ? `Respawning in ${respawnIn.toFixed(1)}s · ${this.key('buy')} to change loadout` : 'Respawning…');
  }
  center(text) {
    const el = $('centerbig');
    if (el.textContent !== (text || '')) { el.textContent = text || ''; if (text) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } }
    el.style.display = text ? 'block' : 'none';
  }
  help(show) { this._cls($('help'), 'show', show); }
  panel(html) {
    const el = $('panel');
    if (html === null) { if (el.style.display !== 'none') el.style.display = 'none'; this._panel = null; return; }
    if (el.style.display !== 'block') el.style.display = 'block';
    if (this._panel !== html) { el.innerHTML = html; this._panel = html; }
  }
  setAfk(on) { this._cls($('afk-banner'), 'on', on); this._cls($('abilities'), 'off', on); this._cls($('weapon'), 'off', on); }
  scoreboard(show, rows, title = 'SCOREBOARD', footer = '') {
    const el = $('scoreboard');
    el.style.display = show ? 'flex' : 'none';
    if (!show) return;
    this._set('sb-title', 'text', title);
    this._set('sb-footer', 'text', footer);
    let rank = 0;
    this._set('sb-body', 'html', rows.map((r) => r.header
      ? `<tr class="team-h"><td colspan="8"><span class="dot" style="background:${r.color}"></span>${esc(r.label)}${r.mine ? ' <i class="tagbot host">YOUR TEAM</i>' : ''}<b>${r.score}</b></td></tr>`
      : `<tr class="${r.me ? 'me' : ''}">
      <td class="rk">${++rank}</td><td><span class="dot" style="background:${r.color}"></span>${esc(r.name)}${r.bot ? ' <i class="tagbot">BOT</i>' : ''}${r.host ? ' <i class="tagbot host">HOST</i>' : ''}${r.afk ? ' <i class="tagbot afk">AFK</i>' : ''}${r.money !== undefined ? ` <i class="tagbot money">$${r.money}</i>` : ''}</td>
      <td>${r.score}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.best}</td><td>${r.wins}</td><td class="ping">${r.ping ?? ''}</td></tr>`).join(''));
  }
  update(dt) {
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.hitm.className = ''; }
    if (this.noticeT > 0) { this.noticeT -= dt; if (this.noticeT <= 0) $('notice').style.opacity = 0; }
  }
}
