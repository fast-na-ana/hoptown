// DOM heads-up display.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class Hud {
  constructor() {
    this.el = $('hud');
    this.feed = $('killfeed');
    this.cross = $('crosshair');
    this.hitm = $('hitmarker');
    this.hitT = 0;
    this.announceT = 0;
    this.noticeT = 0;
    this.dmgIndicators = [];
    this.vignette = $('vignette');
  }
  show(v) { this.el.style.display = v ? 'block' : 'none'; }

  setHealth(hp, max) {
    $('hp-num').textContent = Math.max(0, Math.ceil(hp));
    const f = $('hp-fill');
    f.style.width = Math.max(0, hp / max * 100) + '%';
    f.style.background = hp > 60 ? '#7bdb6a' : hp > 30 ? '#ffd23f' : '#ff5a5f';
    this.vignette.style.opacity = hp < 40 ? (1 - hp / 40) * 0.6 : 0;
  }
  setAmmo(name, mag, magMax, reloading) {
    $('wpn-name').textContent = name;
    $('ammo').innerHTML = reloading ? '<span class="dim">RELOADING</span>' : `${mag}<span class="dim"> / ${magMax}</span>`;
    $('ammo').classList.toggle('low', !reloading && mag <= Math.ceil(magMax * 0.25));
  }
  setUtility(nades, nadeMax, nadeCharge, blinkCd, blinkMax, blinkActive) {
    let s = '';
    for (let i = 0; i < nadeMax; i++) s += `<span class="nade ${i < nades ? 'on' : ''}"></span>`;
    $('nades').innerHTML = s + (nades < nadeMax ? `<i class="dim"> ${Math.ceil(nadeCharge)}s</i>` : '');
    const b = $('blink');
    b.classList.toggle('ready', blinkCd <= 0);
    b.classList.toggle('active', blinkActive);
    b.textContent = blinkActive ? 'Q · WARP' : blinkCd > 0 ? `Q · ${Math.ceil(blinkCd)}s` : 'Q · BLINK';
  }
  setCrosshair(spread, visible) {
    const gap = 4 + spread * 900;
    this.cross.style.setProperty('--gap', gap + 'px');
    this.cross.style.opacity = visible ? 1 : 0;
  }
  setSpeed(v) { $('speed').textContent = Math.round(v * 10) / 10 + ' m/s'; }
  hitmarker(head, kill) {
    this.hitm.className = 'show' + (head ? ' head' : '') + (kill ? ' kill' : '');
    this.hitT = kill ? 0.35 : 0.18;
  }
  setTop({ timeLeft, round, phase, myKills, killLimit, leaderName, leaderKills, roomCode, players, isHost, ping }) {
    const m = Math.max(0, Math.floor(timeLeft / 60)), s = Math.max(0, Math.floor(timeLeft % 60));
    $('timer').textContent = phase === 'end' ? 'ROUND OVER' : `${m}:${String(s).padStart(2, '0')}`;
    $('round').textContent = `ROUND ${round}`;
    $('score-me').textContent = myKills;
    $('score-goal').textContent = killLimit;
    $('score-leader').textContent = leaderName ? `${leaderName} · ${leaderKills}` : '';
    $('room').textContent = roomCode ? `ROOM ${roomCode} · ${players} player${players === 1 ? '' : 's'}${isHost ? ' · host' : ''}` : '';
  }
  setStreak(n) {
    const el = $('streak');
    el.style.display = n >= 2 ? 'block' : 'none';
    el.innerHTML = `STREAK <b>${n}</b>`;
  }
  addFeed(killer, kcolor, victim, vcolor, weapon, head) {
    const row = document.createElement('div');
    row.className = 'feed-row';
    const icon = weapon === 'grenade' ? '✹' : weapon === 'pistol' ? '⌐' : weapon === 'fall' ? '↓' : '▬';
    row.innerHTML = killer
      ? `<b style="color:${kcolor}">${esc(killer)}</b> <span class="w">${icon}${head ? ' ◎' : ''}</span> <b style="color:${vcolor}">${esc(victim)}</b>`
      : `<b style="color:${vcolor}">${esc(victim)}</b> <span class="w">${icon}</span>`;
    this.feed.prepend(row);
    while (this.feed.children.length > 6) this.feed.lastChild.remove();
    setTimeout(() => row.classList.add('fade'), 5000);
    setTimeout(() => row.remove(), 6000);
  }
  feedText(text, color = '#fff') {
    const row = document.createElement('div');
    row.className = 'feed-row'; row.innerHTML = `<span style="color:${color}">${esc(text)}</span>`;
    this.feed.prepend(row);
    setTimeout(() => row.remove(), 5000);
  }
  announce(text, sub = '') {
    const a = $('announce');
    a.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    a.classList.remove('pop'); void a.offsetWidth; a.classList.add('pop');
    this.announceT = 2.2;
  }
  notice(text) {
    const n = $('notice');
    n.textContent = text; n.style.opacity = 1;
    this.noticeT = 1.3;
  }
  damageFrom(angle) {
    const d = document.createElement('div');
    d.className = 'dmg-ind';
    d.style.transform = `translate(-50%,-50%) rotate(${angle}rad) translateY(-120px)`;
    $('dmg-layer').appendChild(d);
    setTimeout(() => d.remove(), 900);
  }
  death(killerName, color, respawnIn, weapon) {
    const el = $('death');
    if (killerName === null) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    $('death-by').innerHTML = killerName ? `Eliminated by <b style="color:${color}">${esc(killerName)}</b>` : 'You died';
    $('death-timer').textContent = respawnIn > 0 ? `Respawning in ${respawnIn.toFixed(1)}` : 'Respawning…';
  }
  center(text) {
    const el = $('centerbig');
    el.textContent = text || '';
    el.style.display = text ? 'block' : 'none';
  }
  scoreboard(show, rows, title = 'SCOREBOARD', footer = '') {
    const el = $('scoreboard');
    el.style.display = show ? 'flex' : 'none';
    if (!show) return;
    $('sb-title').textContent = title;
    $('sb-footer').textContent = footer;
    $('sb-body').innerHTML = rows.map((r, i) => `<tr class="${r.me ? 'me' : ''}">
      <td>${i + 1}</td><td><span class="dot" style="background:${r.color}"></span>${esc(r.name)}${r.bot ? ' <i class="dim">BOT</i>' : ''}</td>
      <td>${r.score}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.best}</td><td>${r.wins}</td><td>${r.ping ?? ''}</td></tr>`).join('');
  }
  update(dt) {
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.hitm.className = ''; }
    if (this.noticeT > 0) { this.noticeT -= dt; if (this.noticeT <= 0) $('notice').style.opacity = 0; }
  }
}
