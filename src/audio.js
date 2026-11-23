// Tiny synthesized sound kit (WebAudio) — no audio files needed.
let ctx = null, master = null, noiseBuf = null;
let volume = 0.6;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
}
export function setVolume(v) { volume = v; if (master) master.gain.value = v; }

let listener = { x: 0, y: 0, z: 0, yaw: 0 };
export function setListener(x, y, z, yaw) { listener.x = x; listener.y = y; listener.z = z; listener.yaw = yaw; }

function spatial(pos, maxDist = 60) {
  if (!ctx) return null;
  const g = ctx.createGain();
  let out = g;
  if (pos) {
    const dx = pos[0] - listener.x, dz = pos[2] - listener.z, dy = pos[1] - listener.y;
    const d = Math.hypot(dx, dy, dz);
    g.gain.value = Math.max(0, 1 - d / maxDist) ** 1.6;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      // right vector of listener
      const rx = Math.cos(listener.yaw), rz = -Math.sin(listener.yaw);
      p.pan.value = d > 0.1 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.8 : 0;
      g.connect(p); p.connect(master);
    } else g.connect(master);
  } else g.connect(master);
  return out;
}

function noiseBurst(dest, t, dur, freq, q, gain, type = 'bandpass') {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}
function tone(dest, t, dur, f0, f1, gain, type = 'sine') {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}

export const sfx = {
  shot(weapon, pos) {
    const d = spatial(pos, 90); if (!d) return; const t = ctx.currentTime;
    if (weapon === 'sniper') {
      noiseBurst(d, t, 0.45, 900, 0.6, 1.2);
      noiseBurst(d, t, 0.12, 3800, 0.9, 0.5);
      tone(d, t, 0.35, 120, 30, 0.9, 'triangle');
      return;
    }
    if (weapon === 'shotgun') {
      noiseBurst(d, t, 0.38, 700, 0.5, 1.3);
      noiseBurst(d, t, 0.14, 2600, 0.7, 0.6);
      tone(d, t, 0.3, 95, 28, 1.0, 'triangle');
      return;
    }
    if (weapon === 'hcannon') {
      noiseBurst(d, t, 0.3, 1000, 0.6, 1.15);
      noiseBurst(d, t, 0.08, 3600, 1.0, 0.45);
      tone(d, t, 0.22, 140, 35, 0.95, 'triangle');
      return;
    }
    if (weapon === 'smg') {
      noiseBurst(d, t, 0.1, 1900, 0.8, 0.7);
      noiseBurst(d, t, 0.06, 5000, 1.0, 0.3);
      tone(d, t, 0.08, 220, 70, 0.5, 'triangle');
    } else if (weapon === 'rifle') {
      noiseBurst(d, t, 0.16, 1400, 0.7, 0.9);
      noiseBurst(d, t, 0.09, 4200, 1.0, 0.35);
      tone(d, t, 0.12, 160, 45, 0.7, 'triangle');
    } else {
      noiseBurst(d, t, 0.12, 2200, 0.8, 0.75);
      tone(d, t, 0.09, 260, 70, 0.5, 'triangle');
    }
  },
  dry() { const d = spatial(null); if (!d) return; tone(d, ctx.currentTime, 0.04, 1800, 1200, 0.2, 'square'); },
  reload(pos, weapon = 'rifle') {
    const d = spatial(pos, 20); if (!d) return; const t = ctx.currentTime;
    if (weapon === 'shotgun') { noiseBurst(d, t, 0.05, 2200, 3, 0.3); return; }
    const dur = { rifle: 1.85, smg: 1.6, sniper: 2.2, pistol: 1.15, hcannon: 1.55 }[weapon] || 1.5;
    noiseBurst(d, t + dur * 0.18, 0.05, 3000, 3, 0.4);            // mag out
    noiseBurst(d, t + dur * 0.62, 0.06, 2500, 3, 0.5);            // mag in
    tone(d, t + dur * 0.64, 0.03, 700, 500, 0.12, 'square');
    if (weapon !== 'sniper') noiseBurst(d, t + dur * 0.78, 0.05, 3400, 3, 0.4);   // charge / slide
  },
  pump() { const d = spatial(null); if (!d) return; const t = ctx.currentTime; noiseBurst(d, t + 0.06, 0.07, 1800, 2.5, 0.45); noiseBurst(d, t + 0.3, 0.07, 2300, 2.5, 0.5); tone(d, t + 0.32, 0.04, 600, 420, 0.12, 'square'); },
  shell() { const d = spatial(null); if (!d) return; const t = ctx.currentTime; noiseBurst(d, t, 0.04, 2800, 4, 0.35); tone(d, t, 0.03, 900, 700, 0.08, 'square'); },
  inspect() { const d = spatial(null); if (!d) return; const t = ctx.currentTime; noiseBurst(d, t + 0.1, 0.12, 1200, 1, 0.12); noiseBurst(d, t + 1.4, 0.05, 3000, 3, 0.2); },
  hit(head) {
    const d = spatial(null); if (!d) return; const t = ctx.currentTime;
    if (head) { tone(d, t, 0.12, 1900, 1700, 0.35, 'sine'); tone(d, t, 0.1, 2850, 2600, 0.18, 'sine'); }
    else tone(d, t, 0.05, 1100, 900, 0.3, 'square');
  },
  kill() { const d = spatial(null); if (!d) return; const t = ctx.currentTime; tone(d, t, 0.09, 700, 700, 0.25, 'triangle'); tone(d, t + 0.08, 0.16, 1050, 1050, 0.25, 'triangle'); },
  hurt() { const d = spatial(null); if (!d) return; tone(d, ctx.currentTime, 0.18, 220, 90, 0.35, 'sawtooth'); },
  jump(pos) { const d = spatial(pos, 25); if (!d) return; noiseBurst(d, ctx.currentTime, 0.08, 600, 1, 0.25); },
  djump(pos) { const d = spatial(pos, 30); if (!d) return; const t = ctx.currentTime; tone(d, t, 0.18, 300, 900, 0.18, 'sine'); noiseBurst(d, t, 0.12, 1500, 1, 0.2); },
  land(pos, k = 1) { const d = spatial(pos, 25); if (!d) return; noiseBurst(d, ctx.currentTime, 0.1, 300, 1, 0.35 * k, 'lowpass'); },
  step(pos) { const d = spatial(pos, 20); if (!d) return; noiseBurst(d, ctx.currentTime, 0.05, 500 + Math.random() * 300, 1.5, 0.12, 'lowpass'); },
  slide(pos) { const d = spatial(pos, 25); if (!d) return; noiseBurst(d, ctx.currentTime, 0.45, 900, 0.6, 0.25); },
  pad(pos) { const d = spatial(pos, 40); if (!d) return; const t = ctx.currentTime; tone(d, t, 0.35, 200, 1200, 0.3, 'sine'); },
  throw(pos) { const d = spatial(pos, 20); if (!d) return; noiseBurst(d, ctx.currentTime, 0.15, 1200, 0.8, 0.2); },
  bounce(pos) { const d = spatial(pos, 25); if (!d) return; tone(d, ctx.currentTime, 0.05, 900, 600, 0.15, 'square'); },
  boom(pos) {
    const d = spatial(pos, 120); if (!d) return; const t = ctx.currentTime;
    noiseBurst(d, t, 0.9, 300, 0.5, 1.2, 'lowpass'); tone(d, t, 0.7, 90, 25, 1.0, 'sine'); noiseBurst(d, t, 0.3, 2500, 0.5, 0.4);
  },
  blink(pos) { const d = spatial(pos, 40); if (!d) return; const t = ctx.currentTime; tone(d, t, 0.25, 1600, 200, 0.25, 'sine'); tone(d, t, 0.2, 400, 2400, 0.15, 'triangle'); },
  streak() { const d = spatial(null); if (!d) return; const t = ctx.currentTime; [523, 659, 784, 1046].forEach((f, i) => tone(d, t + i * 0.07, 0.2, f, f, 0.18, 'triangle')); },
  swing(pos) { const d = spatial(pos, 20); if (!d) return; noiseBurst(d, ctx.currentTime, 0.16, 2600, 0.7, 0.35, 'highpass'); },
  stab(pos) { const d = spatial(pos, 25); if (!d) return; const t = ctx.currentTime; noiseBurst(d, t, 0.12, 700, 1.2, 0.6, 'lowpass'); tone(d, t, 0.1, 180, 70, 0.4, 'triangle'); },
  bolt() { const d = spatial(null); if (!d) return; const t = ctx.currentTime; noiseBurst(d, t + 0.08, 0.05, 2600, 3, 0.35); noiseBurst(d, t + 0.25, 0.06, 2000, 3, 0.4); tone(d, t + 0.3, 0.04, 900, 700, 0.12, 'square'); },
  beep(pos, k = 1) { const d = spatial(pos, 45); if (!d) return; tone(d, ctx.currentTime, 0.07, 1900 + (1 - k) * 600, 1900 + (1 - k) * 600, 0.28, 'square'); },
  planted() { const d = spatial(null); if (!d) return; const t = ctx.currentTime; [880, 660, 990].forEach((f, i) => tone(d, t + i * 0.12, 0.14, f, f, 0.22, 'square')); },
  defused() { const d = spatial(null); if (!d) return; const t = ctx.currentTime; [660, 880, 1320].forEach((f, i) => tone(d, t + i * 0.1, 0.16, f, f, 0.22, 'triangle')); },
  plantStart(pos) { const d = spatial(pos || null, 30); if (!d) return; noiseBurst(d, ctx.currentTime, 0.12, 2400, 2, 0.25); },
  plantTick() { const d = spatial(null); if (!d) return; tone(d, ctx.currentTime, 0.04, 1500, 1500, 0.12, 'square'); },
  bigBoom(pos) {
    const d = spatial(pos, 160); if (!d) return; const t = ctx.currentTime;
    noiseBurst(d, t, 1.6, 300, 0.5, 1.6, 'lowpass'); noiseBurst(d, t, 0.5, 1200, 0.6, 0.8); tone(d, t, 1.2, 70, 20, 1.2, 'triangle');
  },
  tick() { const d = spatial(null); if (!d) return; tone(d, ctx.currentTime, 0.06, 880, 880, 0.2, 'sine'); },
  go() { const d = spatial(null); if (!d) return; tone(d, ctx.currentTime, 0.3, 1320, 1320, 0.25, 'sine'); },
};
