import * as THREE from 'three';
import { Game } from './game.js';
import { initAudio, setVolume } from './audio.js';
import { LocalNet, RtcNet } from './net.js';
import { COLORS } from './config.js';
import { stepMovement, makeMoveState, emptyInput } from './movement.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('hoptown.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('hoptown.' + k, JSON.stringify(v)); } catch { } },
};

const params = new URLSearchParams(location.search);
const settings = {
  sens: store.get('sens', 1), fov: store.get('fov', 80), volume: store.get('volume', 0.6),
  shadows: store.get('shadows', true), invert: store.get('invert', false),
};

const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('test') });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
$('difficulty').value = store.get('difficulty', 'normal');
$('room').value = params.get('room') || '';

function bindRange(id, key, fmt = (v) => v) {
  const el = $(id), out = $(id + '-val');
  el.value = settings[key]; out.textContent = fmt(settings[key]);
  el.oninput = () => { settings[key] = parseFloat(el.value); out.textContent = fmt(settings[key]); store.set(key, settings[key]); if (key === 'volume') setVolume(settings.volume); };
}
bindRange('sens', 'sens', v => (+v).toFixed(2));
bindRange('fov', 'fov', v => Math.round(v));
bindRange('volume', 'volume', v => Math.round(v * 100) + '%');
$('shadows').checked = settings.shadows; $('shadows').onchange = () => { settings.shadows = $('shadows').checked; store.set('shadows', settings.shadows); if (game) game.sun.castShadow = settings.shadows; };
$('invert').checked = settings.invert; $('invert').onchange = () => { settings.invert = $('invert').checked; store.set('invert', settings.invert); };

function commonOpts() {
  const name = ($('name').value || 'Player').trim().slice(0, 16) || 'Player';
  store.set('name', name);
  store.set('bots', +$('bots').value);
  store.set('difficulty', $('difficulty').value);
  return { name, color, settings, bots: +$('bots').value, difficulty: $('difficulty').value };
}

function randRoom() { return Math.random().toString(36).slice(2, 7).toUpperCase(); }

async function start(mode) {
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
  game = new Game(renderer, opts);
  $('menu').style.display = 'none';
  game.hud.show(true);
  if (opts.roomCode) game.hud.feedText(`Room ${opts.roomCode} — share the link to invite friends`, '#7ff8ff');
  lock();
}

$('play-bots').onclick = () => start('offline');
$('play-online').onclick = () => start('online');
$('resume').onclick = () => { $('pause').style.display = 'none'; lock(); };
$('copy-link').onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); $('copy-link').textContent = 'Copied!'; } catch { $('copy-link').textContent = location.href; }
  setTimeout(() => $('copy-link').textContent = 'Copy invite link', 1500);
};
$('quit').onclick = () => {
  if (game) { game.dispose(); game = null; }
  $('pause').style.display = 'none'; $('hud').style.display = 'none'; $('menu').style.display = 'flex';
  const url = new URL(location.href); url.searchParams.delete('room'); history.replaceState(null, '', url);
};
$('pause-bots').oninput = () => { $('pause-bots-val').textContent = $('pause-bots').value; if (game && game.isHost) game.setBotCount(+$('pause-bots').value); store.set('bots', +$('pause-bots').value); };
if (params.get('room')) $('room-hint').textContent = 'You were invited to room ' + params.get('room') + ' — press Join.';

// ---------------------------------------------------------------- input
const canvas = $('game');
function lock() {
  const fallback = () => { try { const r2 = canvas.requestPointerLock(); if (r2 && r2.catch) r2.catch(() => { }); } catch { } };
  try { const r = canvas.requestPointerLock({ unadjustedMovement: true }); if (r && r.catch) r.catch(fallback); } catch { fallback(); }
}
canvas.addEventListener('click', () => { if (game && document.pointerLockElement !== canvas && $('pause').style.display !== 'flex') lock(); });
document.addEventListener('pointerlockchange', () => {
  if (!game) return;
  if (document.pointerLockElement === canvas) { $('pause').style.display = 'none'; game.paused = false; }
  else if (!game.forceInput) {
    game.input.keys.clear(); game.input.mouseL = false; game.input.mouseR = false;
    $('pause').style.display = 'flex';
    $('pause-bots').value = game.botCount; $('pause-bots-val').textContent = game.botCount;
    $('pause-bots-row').style.display = game.isHost ? '' : 'none';
    $('pause-room').textContent = game.roomCode ? `Room ${game.roomCode}` : 'Offline match vs bots';
    $('copy-link').style.display = game.roomCode ? '' : 'none';
  }
});
document.addEventListener('mousemove', (e) => {
  if (!game || document.pointerLockElement !== canvas) return;
  // ignore occasional giant spikes some browsers produce
  if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
  game.input.dx += e.movementX; game.input.dy += e.movementY;
});
document.addEventListener('mousedown', (e) => {
  if (!game || document.pointerLockElement !== canvas) return;
  if (e.button === 0) { game.input.mouseL = true; game.input.clickL = true; }
  if (e.button === 2) game.input.mouseR = true;
});
document.addEventListener('mouseup', (e) => {
  if (!game) return;
  if (e.button === 0) game.input.mouseL = false;
  if (e.button === 2) game.input.mouseR = false;
});
document.addEventListener('contextmenu', (e) => { if (game) e.preventDefault(); });
document.addEventListener('wheel', (e) => { if (game && document.pointerLockElement === canvas) game.input.pressed.add('wheel'); }, { passive: true });
const gameKeys = new Set(['Space', 'Tab', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyG', 'KeyR', 'KeyC', 'ShiftLeft', 'ShiftRight', 'Digit1', 'Digit2', 'ControlLeft']);
document.addEventListener('keydown', (e) => {
  if (!game) return;
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  if (gameKeys.has(e.code)) e.preventDefault();
  if (!e.repeat) game.input.pressed.add(e.code);
  game.input.keys.add(e.code);
});
document.addEventListener('keyup', (e) => { if (game) game.input.keys.delete(e.code); });
window.addEventListener('blur', () => { if (game) { game.input.keys.clear(); game.input.mouseL = false; } });
window.addEventListener('resize', () => { if (game) game.onResize(); });

// ---------------------------------------------------------------- loop
let lastRaf = performance.now();
function frame(t) {
  requestAnimationFrame(frame);
  lastRaf = performance.now();
  const dt = Math.min(0.1, (t - last) / 1000); last = t;
  if (!game) return;
  game.update(dt);
  game.render();
}
requestAnimationFrame(frame);
// Browsers pause requestAnimationFrame in background tabs. Keep the simulation and
// networking alive (important when the host alt-tabs) with a slower timer loop.
setInterval(() => {
  const n = performance.now();
  if (!game || n - lastRaf < 150) return;
  const dt = Math.min(0.1, (n - last) / 1000); last = n;
  game.update(dt);
}, 50);

// auto-start hooks for automated testing
if (params.has('test')) {
  window.__start = (mode) => start(mode);
  window.__mods = { stepMovement, makeMoveState, emptyInput };
}
