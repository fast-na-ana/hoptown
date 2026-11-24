import * as THREE from 'three';
import { Game } from './game.js';
import { initAudio, setVolume } from './audio.js';
import { LocalNet, RtcNet } from './net.js';
import { COLORS, WEAPONS, PRIMARIES, SECONDARIES, DEFAULT_LOADOUT } from './config.js';
import { ICONS } from './hud.js';
import { ACTIONS, RISKY, loadBinds, buildMap, keyName } from './keybinds.js';
import { setPanelKey } from './panels.js';
import { DIFFICULTIES } from './bots.js';
import { MenuPreview } from './preview.js';
import { MAP_LIST, PLANT_MAPS } from './maps/index.js';
import { MODES, RULE_OPTIONS, defaultRules, resolveRules, fmtTime, fmtLimit, timeOptions } from './modes.js';
import { stepMovement, makeMoveState, emptyInput } from './movement.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('hoptown.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('hoptown.' + k, JSON.stringify(v)); } catch { } },
};

const params = new URLSearchParams(location.search);
const settings = {
  sens: store.get('sens', 1), fov: store.get('fov', 80), volume: store.get('volume', 0.6),
  quality: store.get('quality', 'medium'), invert: store.get('invert', false), showFps: store.get('showFps', false),
};

const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('test') });
function applyQuality() {
  const dpr = window.devicePixelRatio || 1;
  const q = settings.quality;
  renderer.setPixelRatio(q === 'low' ? Math.min(dpr, 1) * 0.75 : q === 'high' ? Math.min(dpr, 1.5) : Math.min(dpr, 1));
  renderer.shadowMap.enabled = q !== 'low';
  renderer.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  if (game) {
    game.sun.castShadow = q !== 'low';
    const sm = q === 'high' ? 2048 : 1024;
    if (game.sun.shadow.mapSize.x !== sm) { game.sun.shadow.mapSize.set(sm, sm); if (game.sun.shadow.map) { game.sun.shadow.map.dispose(); game.sun.shadow.map = null; } }
    game.scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
    game.onResize();
  }
}
applyQuality();
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

let game = null;
let last = performance.now();
window.__hoptown = { get game() { return game; } };

// ---------------------------------------------------------------- menu
function randName() { return ['Hopper', 'Strafe', 'Glide', 'Swift', 'Flick', 'Dash', 'Zip', 'Vault'][Math.floor(Math.random() * 8)] + Math.floor(Math.random() * 90 + 10); }
$('name').value = store.get('name', randName());
let color = store.get('color', COLORS[1]);
const sw = $('swatches');
COLORS.forEach(c => {
  const b = document.createElement('button');
  b.className = 'sw' + (c === color ? ' on' : ''); b.style.background = c; b.type = 'button';
  b.onclick = () => { color = c; store.set('color', c); sw.querySelectorAll('.sw').forEach(x => x.classList.remove('on')); b.classList.add('on'); };
  sw.appendChild(b);
});
$('bots').value = store.get('bots', 5); $('bots-val').textContent = $('bots').value;
$('bots').oninput = () => { $('bots-val').textContent = $('bots').value; };
let diffIdx = DIFFICULTIES.indexOf(store.get('difficulty', 'medium'));
if (diffIdx < 0) diffIdx = 1;
function paintSeg() {
  for (const seg of [$('diff-seg'), $('pause-seg')]) seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.d === diffIdx));
}
for (const seg of [$('diff-seg'), $('pause-seg')]) seg.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  diffIdx = +b.dataset.d; store.set('difficulty', DIFFICULTIES[diffIdx]); paintSeg();
  if (game && game.isHost) game.setDifficulty(DIFFICULTIES[diffIdx]);
});
paintSeg();
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
  document.querySelectorAll('.tab-body').forEach(x => x.classList.toggle('on', x.id === 'tab-' + t.dataset.tab));
}));
// ---- map + mode selection
let selMap = store.get('map', 'maple'); if (!MAP_LIST.find(m => m.id === selMap)) selMap = 'maple';
let selMode = store.get('mode', 'ffa'); if (!MODES[selMode]) selMode = 'ffa';
const mapOk = (map, mode) => mode !== 'plant' || PLANT_MAPS.includes(map);
if (!mapOk(selMap, selMode)) selMap = PLANT_MAPS[0];
$('map-sel').innerHTML = MAP_LIST.map((m, i) => `<button type="button" class="mapbtn" data-map="${m.id}"><small>MAP 0${i + 1} · ${m.size}</small><b>${m.name}</b></button>`).join('');
$('pause-map-seg').classList.add('seg2');
$('pause-map-seg').innerHTML = MAP_LIST.map(m => `<button type="button" data-map="${m.id}">${m.name}</button>`).join('');
let pMap = selMap, pMode = selMode;
// ---- match rules (time / score / respawn), remembered per mode
const savedRules = store.get('rules', {});
const rulesFor = (mode) => resolveRules(mode, savedRules[mode]);
let pRules = rulesFor(selMode);
const RULE_ROWS = [
  { k: 'time', label: (m) => m === 'plant' ? 'ROUND TIME' : 'TIME LIMIT', list: (mode) => timeOptions(mode), fmt: (v) => fmtTime(v) },
  { k: 'limit', label: (m) => m === 'plant' ? 'ROUNDS TO WIN' : 'SCORE LIMIT', list: (mode) => RULE_OPTIONS.limit[mode], fmt: (v, mode) => fmtLimit(mode, v) },
  { k: 'respawn', label: () => 'RESPAWN', list: () => RULE_OPTIONS.respawn, fmt: (v) => `${v} SEC`, skip: (m) => m === 'plant' },
];
function paintRules(el, mode, rules) {
  const def = defaultRules(mode);
  el.style.gridTemplateColumns = mode === 'plant' ? 'repeat(2, 1fr)' : '';
  el.innerHTML = RULE_ROWS.filter(r => !(r.skip && r.skip(mode))).map(r => {
    const list = r.list(mode), i = list.indexOf(rules[r.k]);
    return `<div class="step${rules[r.k] !== def[r.k] ? ' custom' : ''}"><small>${r.label(mode)}</small><button type="button" data-k="${r.k}" data-d="-1"${i <= 0 ? ' disabled' : ''}>−</button><b>${r.fmt(rules[r.k], mode)}</b><button type="button" data-k="${r.k}" data-d="1"${i >= list.length - 1 ? ' disabled' : ''}>+</button></div>`;
  }).join('');
}
function stepRule(rules, mode, k, d) {
  const list = RULE_ROWS.find(r => r.k === k).list(mode);
  const i = Math.max(0, Math.min(list.length - 1, list.indexOf(rules[k]) + d));
  rules[k] = list[i];
}
$('rules').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const r = rulesFor(selMode); stepRule(r, selMode, b.dataset.k, +b.dataset.d);
  savedRules[selMode] = r; store.set('rules', savedRules); paintSel();
});
$('pause-rules').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  stepRule(pRules, pMode, b.dataset.k, +b.dataset.d); paintSel();
});
function paintSel() {
  document.querySelectorAll('#map-sel .mapbtn').forEach(b => { b.classList.toggle('on', b.dataset.map === selMap); b.classList.toggle('na', !mapOk(b.dataset.map, selMode)); b.title = mapOk(b.dataset.map, selMode) ? '' : 'Plant & defuse runs on Saltworks and Sunstone'; });
  document.querySelectorAll('#pause-map-seg button').forEach(b => { b.classList.toggle('na', !mapOk(b.dataset.map, pMode)); });
  document.querySelectorAll('#mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === selMode));
  const mi = MAP_LIST.findIndex(m => m.id === selMap);
  $('win-title').textContent = `MAP_0${mi + 1} / ${MAP_LIST[mi].name}`;
  $('mode-blurb').textContent = `${MODES[selMode].name}: ${MODES[selMode].blurb} ${MAP_LIST[mi].blurb} Rules: ${rulesSummary(selMode, rulesFor(selMode))}.`;
  document.querySelectorAll('#pause-map-seg button').forEach(b => b.classList.toggle('on', b.dataset.map === pMap));
  document.querySelectorAll('#pause-mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === pMode));
  paintRules($('rules'), selMode, rulesFor(selMode));
  paintRules($('pause-rules'), pMode, pRules);
  $('pause-rules-sum').textContent = rulesSummary(pMode, pRules);
}
function rulesSummary(mode, r) {
  return mode === 'plant'
    ? `FIRST TO ${r.limit} ROUNDS · ${fmtTime(r.time)} A ROUND`
    : `${fmtTime(r.time)} · ${fmtLimit(mode, r.limit)} · RESPAWN ${r.respawn}s`;
}
// small gear buttons open the rules popovers
function wirePop(btnId, popId) {
  const btn = $(btnId), pop = $(popId);
  const set = (open) => { pop.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); set(pop.hidden); });
  pop.addEventListener('click', (e) => { e.stopPropagation(); if (e.target.closest('[data-close]')) set(false); });
  document.addEventListener('click', () => set(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) set(false); });
}
wirePop('rules-btn', 'rules-pop');
wirePop('lo-btn', 'lo-pop');
wirePop('pause-rules-btn', 'pause-rules-pop');
$('map-sel').addEventListener('click', (e) => { const b = e.target.closest('.mapbtn'); if (!b) return; if (!mapOk(b.dataset.map, selMode)) { selMode = 'ffa'; store.set('mode', selMode); } selMap = b.dataset.map; store.set('map', selMap); paintSel(); preview.setMap(selMap); });
$('mode-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; selMode = b.dataset.m; store.set('mode', selMode); if (!mapOk(selMap, selMode)) { selMap = PLANT_MAPS[0]; store.set('map', selMap); preview.setMap(selMap); } paintSel(); });
$('pause-map-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; pMap = b.dataset.map; if (!mapOk(pMap, pMode)) { pMode = 'ffa'; pRules = rulesFor(pMode); } paintSel(); });
$('pause-mode-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (pMode !== b.dataset.m) { pMode = b.dataset.m; pRules = rulesFor(pMode); } if (!mapOk(pMap, pMode)) pMap = PLANT_MAPS[0]; paintSel(); });
$('apply-match').onclick = () => {
  if (!game || !game.isHost) return;
  game.applyMatchSettings(pMap, pMode, true, { ...pRules });
  selMap = pMap; selMode = pMode; store.set('map', selMap); store.set('mode', selMode);
  savedRules[pMode] = { ...pRules }; store.set('rules', savedRules); paintSel();
  $('pause').style.display = 'none'; lock();
};

const preview = new MenuPreview($('preview'));
preview.mapId = selMap;
paintSel();
if (!params.has('nopreview')) preview.start();
$('room').value = params.get('room') || '';

function bindRange(id, key, fmt = (v) => v) {
  const el = $(id), out = $(id + '-val');
  el.value = settings[key]; out.textContent = fmt(settings[key]);
  el.oninput = () => { settings[key] = parseFloat(el.value); out.textContent = fmt(settings[key]); store.set(key, settings[key]); if (key === 'volume') setVolume(settings.volume); };
}
bindRange('sens', 'sens', v => (+v).toFixed(2));
bindRange('fov', 'fov', v => Math.round(v));
bindRange('volume', 'volume', v => Math.round(v * 100) + '%');
const qSeg = $('quality-seg');
const paintQ = () => qSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.q === settings.quality));
qSeg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; settings.quality = b.dataset.q; store.set('quality', settings.quality); paintQ(); applyQuality(); });
paintQ();
$('kblock').checked = !!store.get('kblock', false); $('kblock').onchange = () => store.set('kblock', $('kblock').checked);
async function enterLockedFullscreen() {
  if (!$('kblock').checked) return;
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    if (navigator.keyboard && navigator.keyboard.lock) await navigator.keyboard.lock();
  } catch { }
}
$('showfps').checked = settings.showFps; $('showfps').onchange = () => { settings.showFps = $('showfps').checked; store.set('showFps', settings.showFps); $('fps').style.display = settings.showFps ? '' : 'none'; };
$('fps').style.display = settings.showFps ? '' : 'none';
$('invert').checked = settings.invert; $('invert').onchange = () => { settings.invert = $('invert').checked; store.set('invert', settings.invert); };

// ---- loadout (non-economy modes)
let loadout = { ...DEFAULT_LOADOUT, ...store.get('loadout', {}) };
if (!PRIMARIES.includes(loadout.primary)) loadout.primary = DEFAULT_LOADOUT.primary;
if (!SECONDARIES.includes(loadout.secondary)) loadout.secondary = DEFAULT_LOADOUT.secondary;
const WTAG = { rifle: 'ALL-ROUND', smg: 'FAST · CLOSE', shotgun: 'CLOSE · 1-PUMP', sniper: 'LONG · 1-TAP HEAD', pistol: 'QUICK', hcannon: 'HEAVY · 1-TAP HEAD' };
function paintLoadout() {
  const tile = (w, slot) => `<button type="button" class="lo-tile${loadout[slot] === w ? ' on' : ''}" data-w="${w}" data-slot="${slot}">${ICONS[w]}<span>${WEAPONS[w].name.toUpperCase()}</span><small>${WTAG[w]}</small></button>`;
  $('lo-primary').innerHTML = PRIMARIES.map(w => tile(w, 'primary')).join('');
  $('lo-secondary').innerHTML = SECONDARIES.map(w => tile(w, 'secondary')).join('');
  $('lo-sum').textContent = `${WEAPONS[loadout.primary].name.toUpperCase()} + ${WEAPONS[loadout.secondary].name.toUpperCase()}`;
}
function setMenuLoadout(lo) { loadout = { ...loadout, ...lo }; store.set('loadout', loadout); paintLoadout(); }
$('lo-pop').addEventListener('click', (e) => { const b = e.target.closest('.lo-tile'); if (!b) return; setMenuLoadout({ [b.dataset.slot]: b.dataset.w }); });
paintLoadout();

function commonOpts() {
  const name = ($('name').value || 'Player').trim().slice(0, 16) || 'Player';
  store.set('name', name);
  store.set('bots', +$('bots').value);
  store.set('difficulty', DIFFICULTIES[diffIdx]);
  return { name, color, settings, bots: +$('bots').value, difficulty: DIFFICULTIES[diffIdx], map: selMap, mode: selMode, rules: rulesFor(selMode), loadout: { ...loadout }, onLoadout: (lo) => setMenuLoadout(lo),
    panelCursor: (open) => { if (!game || game.forceInput) return; game.cursorFree = open; if (open) { if (document.pointerLockElement) document.exitPointerLock(); } else lock(); } };
}

function randRoom() { return Math.random().toString(36).slice(2, 7).toUpperCase(); }

async function start(mode) {
  enterLockedFullscreen();
  initAudio(); setVolume(settings.volume);
  const opts = commonOpts();
  if (mode === 'online') {
    let room = ($('room').value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!room) room = randRoom();
    $('room').value = room;
    $('status').textContent = 'Connecting to room ' + room + '…';
    const net = (params.has('local') ? new LocalNet() : new RtcNet());
    try { await net.connect(room); }
    catch (e) { console.error(e); $('status').textContent = 'Could not connect: ' + (e.message || e); return; }
    opts.net = net; opts.roomCode = room;
    const url = new URL(location.href); url.searchParams.set('room', room);
    history.replaceState(null, '', url);
    $('status').textContent = '';
  }
  if (game) game.dispose();
  preview.stop();
  game = new Game(renderer, opts);
  $('menu').style.display = 'none';
  game.hud.show(true);
  if (opts.roomCode) game.hud.feedText(`Online room ${opts.roomCode}. Press Esc to copy the invite link`, '#ffd60a');
  applyKeyLabels();
  game.onKicked = () => { leaveToMenu('You were removed from the room by the host.'); };
  game.input.lastInput = performance.now();
  lock();
}

function leaveToMenu(msg = '') {
  if (game) { game.dispose(); game = null; }
  try { if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock(); } catch { }
  clearInterval(pauseTimer);
  if (document.pointerLockElement) document.exitPointerLock();
  $('pause').style.display = 'none'; $('hud').style.display = 'none'; $('menu').style.display = 'block';
  preview.start();
  const url = new URL(location.href); url.searchParams.delete('room'); history.replaceState(null, '', url);
  $('status').textContent = msg;
}

$('play-bots').onclick = () => start('offline');
$('play-online').onclick = () => start('online');
$('resume').onclick = () => { $('pause').style.display = 'none'; lock(); };
$('copy-link').onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); $('copy-link').textContent = 'COPIED ✓'; } catch { $('copy-link').textContent = location.href; }
  setTimeout(() => $('copy-link').textContent = 'COPY INVITE LINK', 1500);
};
$('quit').onclick = () => leaveToMenu();
$('pause-bots').oninput = () => { $('pause-bots-val').textContent = $('pause-bots').value; if (game && game.isHost) game.setBotCount(+$('pause-bots').value); store.set('bots', +$('pause-bots').value); $('bots').value = $('pause-bots').value; $('bots-val').textContent = $('bots').value; renderPause(); };
if (params.get('room')) $('room-hint').textContent = 'You were invited to room ' + params.get('room') + '. Hit JOIN.';

// ---------------------------------------------------------------- input
const canvas = $('game');
function lock() {
  const fallback = () => { try { const r2 = canvas.requestPointerLock(); if (r2 && r2.catch) r2.catch(() => { }); } catch { } };
  try { const r = canvas.requestPointerLock({ unadjustedMovement: true }); if (r && r.catch) r.catch(fallback); } catch { fallback(); }
}
canvas.addEventListener('click', () => {
  if (!game || document.pointerLockElement === canvas || $('pause').style.display === 'flex') return;
  if (game.panelOpen) { game.setPanel(null); return; }   // click outside the buy/loadout panel closes it
  lock();
});
// mouse-driven buy / loadout panel
$('panel').addEventListener('click', (e) => {
  if (!game) return;
  if (e.target.closest('.gp-close')) { game.setPanel(null); return; }
  const it = e.target.closest('.gp-item[data-i]');
  if (it && !it.classList.contains('gp-off')) game._panelPick(+it.dataset.i);
});
document.addEventListener('pointerlockchange', () => {
  if (!game) return;
  if (document.pointerLockElement === canvas) { $('pause').style.display = 'none'; game.paused = false; }
  else if (!game.forceInput && !game.cursorFree) {
    game.input.keys.clear(); game.input.mouseL = false; game.input.mouseR = false;
    $('pause').style.display = 'flex';
    $('pause-bots').value = game.botCount; $('pause-bots-val').textContent = game.botCount;
    diffIdx = Math.max(0, DIFFICULTIES.indexOf(game.difficulty)); paintSeg();
    $('pause')._painted = false;
    renderPause();
    clearInterval(pauseTimer); pauseTimer = setInterval(renderPause, 1000);
  } 
  if (document.pointerLockElement === canvas) clearInterval(pauseTimer);
});

// ---------------------------------------------------------------- pause menu (mode-aware)
let pauseTimer = 0;
const DIFF_NAMES = ['EASY', 'MEDIUM', 'HARD', 'LEGENDARY'];
const escHtml = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function renderPause() {
  if (!game || $('pause').style.display !== 'flex') return;
  const online = !!game.net, host = game.isHost;
  $('pause-mode').textContent = online ? `ONLINE ROOM · ${game.roomCode}` : 'OFFLINE';
  $('pause-mode').classList.toggle('on', online);
  $('pause-room').textContent = online
    ? (host ? 'You are the host. You manage bots and players.' : 'The host manages bots and players.')
    : `Solo ${MODES[game.mode].name.toLowerCase()} on ${game.map.info.name} vs ${game.botCount} bot${game.botCount === 1 ? '' : 's'}. The match keeps running while paused.`;
  $('pause-online').style.display = online ? '' : 'none';
  $('pause-bots-row').style.display = host ? '' : 'none';
  $('pause-match').style.display = host ? '' : 'none';
  if (!$('pause')._painted) { pMap = game.mapId; pMode = game.mode; pRules = { ...game.rules }; paintSel(); $('pause')._painted = true; }
  $('bots-readonly').style.display = host ? 'none' : '';
  $('bots-readonly').textContent = host ? '' : `${game.map.info.name} · ${MODES[game.mode].short} · BOTS ${game.botCount} · ${DIFF_NAMES[Math.max(0, DIFFICULTIES.indexOf(game.difficulty))]} · ${fmtTime(game.rules.time)} · ${fmtLimit(game.mode, game.rules.limit)} · RESPAWN ${game.rules.respawn}s (set by host)`;
  $('quit').textContent = online ? 'LEAVE ROOM' : 'QUIT TO MENU';
  if (online) {
    const rows = game.playerList();
    $('plist').innerHTML = rows.map(r => `<div class="prow">
      <span class="dot" style="background:${r.color}"></span><b>${escHtml(r.name)}</b>
      ${r.me ? '<i class="tag">YOU</i>' : ''}${r.host ? '<i class="tag host">HOST</i>' : ''}${r.afk ? '<i class="tag afk">AFK</i>' : ''}
      <span class="ping">${r.me ? '' : (r.ping ? r.ping + 'ms' : '…')}</span>
      ${host && !r.me ? `<button class="mini" data-act="${r.afk ? 'return' : 'afk'}" data-id="${r.id}">${r.afk ? 'RETURN' : 'AFK BOX'}</button><button class="mini red" data-act="kick" data-id="${r.id}">KICK</button>` : ''}
    </div>`).join('');
    $('plist-hint').textContent = host
      ? 'AFK BOX moves a player to a sealed glass room above the map. They can press ENTER to come back.'
      : (rows.length < 2 ? 'Nobody else here yet. Copy the invite link above.' : '');
  }
}
$('plist').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || !game || !game.isHost) return;
  const id = b.dataset.id;
  if (b.dataset.act === 'kick') game.kickPlayer(id);
  else game.requestAfk(id, b.dataset.act === 'afk');
  renderPause();
});
document.addEventListener('mousemove', (e) => {
  if (!game || document.pointerLockElement !== canvas) return;
  game.input.lastInput = performance.now();
  // ignore occasional giant spikes some browsers produce
  if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
  game.input.dx += e.movementX; game.input.dy += e.movementY;
});
document.addEventListener('mousedown', (e) => {
  if (!game || document.pointerLockElement !== canvas) return;
  game.input.lastInput = performance.now();
  if (e.button === 0) { game.input.mouseL = true; game.input.clickL = true; }
  if (e.button === 2) game.input.mouseR = true;
});
document.addEventListener('mouseup', (e) => {
  if (!game) return;
  if (e.button === 0) game.input.mouseL = false;
  if (e.button === 2) game.input.mouseR = false;
});
document.addEventListener('contextmenu', (e) => { if (game) e.preventDefault(); });
document.addEventListener('wheel', (e) => { if (game && document.pointerLockElement === canvas) { game.input.wheelDir = Math.sign(e.deltaY); game.input.pressed.add('wheel'); } }, { passive: true });
// ---- rebindable keys: physical key -> the logical code the game reads
let binds = loadBinds(store.get('binds', null));
let keyMap = buildMap(binds);
let rebinding = null;   // { id, slot } while waiting for a key
const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'];
function paintBinds() {
  $('binds').innerHTML = ACTIONS.map(a => `<div class="bind"><span>${a.label}</span>${[0, 1].map(i => {
    const c = binds[a.id][i], wait = rebinding && rebinding.id === a.id && rebinding.slot === i;
    return `<button type="button" class="kb${wait ? ' wait' : ''}${c && RISKY.has(c) ? ' risky' : ''}${c ? '' : ' empty'}" data-id="${a.id}" data-slot="${i}">${wait ? 'PRESS A KEY…' : c ? keyName(c) : '+'}</button>`;
  }).join('')}</div>`).join('') + '<div class="bind fixed"><span>Fire · aim / scope</span><button type="button" class="kb" disabled>LMB</button><button type="button" class="kb" disabled>RMB</button></div>';
  const risky = ACTIONS.some(a => binds[a.id].some(c => RISKY.has(c)));
  $('binds-warn').textContent = risky ? 'Ctrl / Alt / Meta keys clash with browser shortcuts (Ctrl+W closes the tab). Turn on FULLSCREEN · LOCK BROWSER SHORTCUTS in Settings to use them safely.' : '';
}
function setBind(id, slot, code) {
  if (code) for (const a of ACTIONS) binds[a.id] = binds[a.id].map(c => (c === code ? null : c));   // a key does one thing
  const cur = [...binds[id]]; cur[slot] = code; binds[id] = cur;
  for (const a of ACTIONS) { binds[a.id] = binds[a.id].filter(Boolean); }
  store.set('binds', binds); keyMap = buildMap(binds); paintBinds(); applyKeyLabels();
}
$('binds').addEventListener('click', (e) => {
  const b = e.target.closest('.kb'); if (!b || b.disabled) return;
  rebinding = { id: b.dataset.id, slot: Math.min(+b.dataset.slot, binds[b.dataset.id].length) }; paintBinds();
});
$('binds-reset').onclick = () => { binds = loadBinds(null); store.set('binds', binds); keyMap = buildMap(binds); rebinding = null; paintBinds(); applyKeyLabels(); };
document.addEventListener('keydown', (e) => {
  if (!rebinding) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.code === 'Escape') { rebinding = null; paintBinds(); return; }
  if (e.code === 'Backspace' || e.code === 'Delete') { const r = rebinding; rebinding = null; setBind(r.id, r.slot, null); return; }
  const r = rebinding; rebinding = null; setBind(r.id, r.slot, e.code);
}, true);
paintBinds();
function applyKeyLabels() {
  const labels = {};
  for (const a of ACTIONS) labels[a.id] = binds[a.id] && binds[a.id][0] ? keyName(binds[a.id][0]) : '—';
  setPanelKey(labels.buy);
  if (game) game.hud.setKeys(labels);
}

const gameKeys = new Set(['Space', 'Tab', ...DIGITS, 'Enter']);
document.addEventListener('keydown', (e) => {
  if (!game || rebinding) return;
  if (e.code === 'Escape' && game.panelOpen) { e.preventDefault(); game.setPanel(null); return; }
  if (e.code === 'Escape' && document.pointerLockElement) document.exitPointerLock();
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  const code = keyMap.get(e.code) || (game.panelOpen && DIGITS.includes(e.code) ? e.code : null);
  if (code || gameKeys.has(e.code) || e.ctrlKey || e.metaKey) e.preventDefault();
  if (!code) return;
  game.input.lastInput = performance.now();
  if (!e.repeat) game.input.pressed.add(code);
  game.input.keys.add(code);
});
document.addEventListener('keyup', (e) => { if (!game) return; const code = keyMap.get(e.code); if (code) game.input.keys.delete(code); });
// safety net: Ctrl+W etc. during a match asks before leaving
window.addEventListener('beforeunload', (e) => { if (game && !game.forceInput) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('blur', () => { if (game) { game.input.keys.clear(); game.input.mouseL = false; } });
window.addEventListener('resize', () => { if (game) game.onResize(); });

// ---------------------------------------------------------------- loop
let lastRaf = performance.now();
let fpsFrames = 0, fpsT = performance.now(), worst = 0;
function frame(t) {
  requestAnimationFrame(frame);
  lastRaf = performance.now();
  fpsFrames++; worst = Math.max(worst, t - last);
  if (t - fpsT > 500) { if (settings.showFps && game) $('fps').textContent = `${Math.round(fpsFrames * 1000 / (t - fpsT))} FPS · ${worst.toFixed(0)}ms`; fpsFrames = 0; fpsT = t; worst = 0; }
  // rAF timestamps can trail performance.now() used by the fallback timer, so clamp at 0
  const now = performance.now();
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
  if (!game) return;
  const reps = window.__speed || 1;   // tests only: run the sim faster than it renders
  for (let i = 0; i < reps; i++) game.update(dt);
  game.render();
}
requestAnimationFrame(frame);
// Browsers pause requestAnimationFrame in background tabs. Keep the simulation and
// networking alive (important when the host alt-tabs) with a slower timer loop.
setInterval(() => {
  const n = performance.now();
  if (!game || n - lastRaf < 150) return;
  const dt = Math.max(0, Math.min(0.1, (n - last) / 1000)); last = n;
  game.update(dt);
}, 50);

// auto-start hooks for automated testing
if (params.has('test')) {
  window.__start = (mode) => start(mode);
  window.__mods = { stepMovement, makeMoveState, emptyInput };
}
