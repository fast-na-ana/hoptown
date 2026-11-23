// DOM heads-up display.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ICONS = {
  rifle: '<svg viewBox="0 0 64 24"><path d="M2 9h34l3-3h10v3h13v4H49l-2 2H35l-3 7h-6l2-7h-6l-3 5h-6l2-5H2z"/></svg>',
  pistol: '<svg viewBox="0 0 40 28"><path d="M3 4h32v7H17l-3 13H6l3-13H3z"/></svg>',
  sniper: '<svg viewBox="0 0 80 22"><path d="M1 9h6l2-2h26V4h18v3h6v2h20v3H58l-3 2H40l-3 6h-5l1-6h-8l-4 5h-6l3-5H9L7 13H1z"/></svg>',
  knife: '<svg viewBox="0 0 48 20"><path d="M2 8h14v5H2zM16 6h3v9h-3zM19 8h18c5 0 9 2 9 2s-5 3-12 3H19z"/></svg>',
  grenade: '<svg viewBox="0 0 32 32"><circle cx="15" cy="19" r="10"/><path d="M12 6h8v5h-8zM20 7l6-3 1 2-6 3z"/></svg>',
  blink: '<svg viewBox="0 0 32 32"><ellipse cx="16" cy="16" rx="13" ry="5" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="16" cy="16" r="3.5"/><path d="M16 1l4 6h-8zM16 31l-4-6h8z"/></svg>',
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
    $('slots').innerHTML = [['rifle', '1'], ['sniper', '2'], ['pistol', '3'], ['knife', '4']].map(([w, k]) =>
      `<div class="slot" id="slot-${w}"><i>${k}</i>${ICONS[w]}</div>`).join('');
  }
  show(v) { this.el.style.display = v ? 'block' : 'none'; }

  _set(id, prop, val) {
    const key = id + prop;
    if (this._cache[key] === val) return false;
    this._cache[key] = val;
    const el = $(id);
    if (prop === 'html') el.innerHTML = val; else if (prop === 'text') el.textContent = val; else el.style.setProperty(prop, val);
    return true;
  }

  setVitals(hp, max, speed) {
    const h = Math.max(0, Math.ceil(hp));
    this._set('hp-num', 'text', String(h));
    this._set('hp-fill', 'width', Math.max(0, hp / max * 100) + '%');
    this._set('hp-fill', 'background', hp > 60 ? 'linear-gradient(90deg,#55e08a,#9cf2a6)' : hp > 30 ? 'linear-gradient(90deg,#ffb020,#ffd76a)' : 'linear-gradient(90deg,#ff3b4a,#ff7b6b)');
    this._set('speed', 'text', (Math.round(speed * 10) / 10).toFixed(1));
  }

  setWeapon(id, name, mag, magMax, reloading, reloadPct) {
    this._set('wpn-name', 'text', name);
    if (id === 'knife') this._set('ammo', 'html', '<span class="inf">MELEE</span>');
    else if (reloading) this._set('ammo', 'html', `<span class="reload">RELOADING<i style="width:${Math.round(reloadPct * 100)}%"></i></span>`);
    else this._set('ammo', 'html', `<b class="${mag <= Math.ceil(magMax * 0.25) ? 'low' : ''}">${mag}</b><span class="max">/ ${magMax}</span>`);
    for (const w of ['rifle', 'sniper', 'pistol', 'knife']) {
      const el = $('slot-' + w);
      el.classList.toggle('on', w === id);
    }
  }

  setAbilities(a) {
    // grenades
    const n = $('ab-nade');
    n.classList.toggle('ready', a.nades > 0);
    n.classList.toggle('empty', a.nades === 0);
    n.style.setProperty('--p', (a.nades < a.nadeMax ? a.nadePct * 100 : 0) + '%');
    this._set('ab-nade-pips', 'html', Array.from({ length: a.nadeMax }, (_, i) => `<i class="${i < a.nades ? 'on' : ''}"></i>`).join(''));
    this._set('ab-nade-sub', 'text', a.nades > 0 ? `${a.nades} ready` : `recharging ${Math.ceil(a.nadeLeft)}s`);
    // blink
    const b = $('ab-blink');
    b.classList.toggle('ready', a.blink === 'ready');
    b.classList.toggle('active', a.blink === 'active');
    b.classList.toggle('empty', a.blink === 'cooldown');
    b.style.setProperty('--p', (a.blink === 'cooldown' ? a.blinkPct * 100 : 0) + '%');
    this._set('ab-blink-sub', 'text', a.blink === 'active' ? 'Q again: WARP!' : a.blink === 'cooldown' ? `cooldown ${Math.ceil(a.blinkCd)}s` : 'throw · Q again warps');
    // knife
    const m = $('ab-melee');
    m.classList.toggle('ready', a.knifeReady);
    m.classList.toggle('empty', !a.knifeReady);
  }

  setScope(on, cycling) {
    const el = $('scope');
    if (el.classList.contains('on') !== on) el.classList.toggle('on', on);
    el.classList.toggle('cycling', !!cycling);
  }

  setLowHealth(on, hp) {
    const el = $('lowhp');
    if (el.classList.contains('on') !== on) {
      el.classList.toggle('on', on);
      if (on) for (const s of el.querySelectorAll('.splat')) s.style.transform = `rotate(${Math.random() * 360}deg) scale(${0.8 + Math.random() * 0.5})`;
    }
    if (on) el.style.setProperty('--hp', Math.max(0, hp / 20).toFixed(2));
  }

  setCrosshair(spread, visible, knife) {
    const gap = 4 + spread * 900;
    this.cross.style.setProperty('--gap', gap.toFixed(1) + 'px');
    this.cross.style.opacity = visible ? 1 : 0;
    this.cross.classList.toggle('knife', !!knife);
  }

  hitmarker(head, kill) {
    this.hitm.className = 'show' + (head ? ' head' : '') + (kill ? ' kill' : '');
    this.hitT = kill ? 0.35 : 0.16;
  }

  setMatch({ timeLeft, round, phase, myKills, killLimit, rank, total, leaderName, leaderKills, leaderColor, roomCode, players, isHost }) {
    const m = Math.max(0, Math.floor(timeLeft / 60)), s = Math.max(0, Math.floor(timeLeft % 60));
    this._set('m-round', 'text', `ROUND ${round}`);
    this._set('m-phase', 'text', phase === 'warmup' ? 'GET READY' : phase === 'end' ? 'ROUND OVER' : 'FREE FOR ALL');
    this._set('timer', 'text', phase === 'end' ? '--:--' : `${m}:${String(s).padStart(2, '0')}`);
    this._set('m-kills', 'text', String(myKills));
    this._set('m-goal', 'text', String(killLimit));
    this._set('m-bar', 'width', Math.min(100, myKills / killLimit * 100) + '%');
    this._set('m-rank', 'html', `<b>#${rank}</b> of ${total}`);
    this._set('m-leader', 'html', leaderName ? `<span class="dot" style="background:${leaderColor}"></span>${esc(leaderName)} <b>${leaderKills}</b>` : '<i>you lead</i>');
    this._set('room-pill', 'html', roomCode ? `<span class="live"></span>ROOM <b>${esc(roomCode)}</b> · ${players} player${players === 1 ? '' : 's'}${isHost ? ' · host' : ''}` : '');
    $('room-pill').style.display = roomCode ? '' : 'none';
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
    const icon = ICONS[weapon === 'grenade' ? 'grenade' : weapon] || (weapon === 'fall' ? '<span>↓</span>' : ICONS.rifle);
    row.innerHTML = killer
      ? `<b style="color:${kcolor}">${esc(killer)}</b><span class="w">${icon}${head ? '<em>HS</em>' : ''}</span><b style="color:${vcolor}">${esc(victim)}</b>`
      : `<span class="w">${icon}</span><b style="color:${vcolor}">${esc(victim)}</b>`;
    this.feed.prepend(row);
    while (this.feed.children.length > 6) this.feed.lastChild.remove();
    setTimeout(() => row.classList.add('fade'), 5000);
    setTimeout(() => row.remove(), 6000);
  }
  feedText(text, color = '#fff') {
    const row = document.createElement('div');
    row.className = 'feed-row info'; row.innerHTML = `<span style="color:${color}">${esc(text)}</span>`;
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
    this._set('death-timer', 'text', respawnIn > 0 ? `Respawning in ${respawnIn.toFixed(1)}s` : 'Respawning…');
  }
  center(text) {
    const el = $('centerbig');
    if (el.textContent !== (text || '')) { el.textContent = text || ''; if (text) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } }
    el.style.display = text ? 'block' : 'none';
  }
  help(show) { $('help').classList.toggle('show', show); }
  scoreboard(show, rows, title = 'SCOREBOARD', footer = '') {
    const el = $('scoreboard');
    el.style.display = show ? 'flex' : 'none';
    if (!show) return;
    this._set('sb-title', 'text', title);
    this._set('sb-footer', 'text', footer);
    this._set('sb-body', 'html', rows.map((r, i) => `<tr class="${r.me ? 'me' : ''}">
      <td class="rk">${i + 1}</td><td><span class="dot" style="background:${r.color}"></span>${esc(r.name)}${r.bot ? ' <i class="tagbot">BOT</i>' : ''}</td>
      <td>${r.score}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.best}</td><td>${r.wins}</td><td class="ping">${r.ping ?? ''}</td></tr>`).join(''));
  }
  update(dt) {
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.hitm.className = ''; }
    if (this.noticeT > 0) { this.noticeT -= dt; if (this.noticeT <= 0) $('notice').style.opacity = 0; }
  }
}
