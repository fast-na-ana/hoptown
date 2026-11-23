// Procedural canvas textures so the game ships with zero image assets.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTex(size, draw, seed = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size, rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function noise(g, s, r, base, vari, count, sz = 2) {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < count; i++) {
    const v = (r() - 0.5) * vari;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(r() * s, r() * s, sz + r() * sz, sz + r() * sz);
  }
}

export function makeTextures() {
  const T = {};
  T.grass = canvasTex(256, (g, s, r) => {
    noise(g, s, r, '#5fae4a', 0.22, 5000, 2);
    for (let i = 0; i < 900; i++) {
      g.strokeStyle = r() > 0.5 ? 'rgba(40,110,40,0.5)' : 'rgba(150,210,110,0.45)';
      const x = r() * s, y = r() * s;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 4); g.stroke();
    }
  }, 2);
  T.asphalt = canvasTex(256, (g, s, r) => noise(g, s, r, '#3b3f46', 0.18, 7000, 1.5), 3);
  T.concrete = canvasTex(256, (g, s, r) => {
    noise(g, s, r, '#c9c6bf', 0.1, 3000, 2);
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2;
    g.strokeRect(1, 1, s - 2, s - 2);
  }, 4);
  const siding = (base, line) => (g, s, r) => {
    noise(g, s, r, base, 0.06, 1500, 2);
    for (let y = 0; y < s; y += s / 8) {
      g.fillStyle = line; g.fillRect(0, y, s, 3);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, y + 3, s, 2);
    }
  };
  T.sidingA = canvasTex(256, siding('#7fc8c4', 'rgba(20,60,60,0.35)'), 5);
  T.sidingB = canvasTex(256, siding('#f2b48a', 'rgba(90,40,20,0.3)'), 6);
  T.brick = canvasTex(256, (g, s, r) => {
    g.fillStyle = '#d9d2c8'; g.fillRect(0, 0, s, s);
    const bh = s / 8, bw = s / 4;
    for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
      const x = col * bw + (row % 2) * bw / 2, y = row * bh;
      const v = 150 + r() * 40;
      g.fillStyle = `rgb(${v + 30},${v * 0.55},${v * 0.42})`;
      g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
  }, 7);
  T.wood = canvasTex(256, (g, s, r) => {
    for (let i = 0; i < 8; i++) {
      const v = 120 + r() * 40;
      g.fillStyle = `rgb(${v + 50},${v + 10},${v * 0.6})`;
      g.fillRect(0, i * s / 8, s, s / 8);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, i * s / 8, s, 2);
      for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(60,30,10,0.12)'; g.fillRect(r() * s, i * s / 8 + r() * s / 8, 20 + r() * 40, 1); }
    }
  }, 8);
  T.fence = canvasTex(256, (g, s, r) => {
    for (let i = 0; i < 8; i++) {
      const v = 200 + r() * 30;
      g.fillStyle = `rgb(${v},${v - 5},${v - 20})`; g.fillRect(i * s / 8, 0, s / 8, s);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(i * s / 8, 0, 3, s);
    }
  }, 9);
  T.roof = canvasTex(256, (g, s, r) => noise(g, s, r, '#5a5f6b', 0.15, 4000, 3), 10);
  T.interior = canvasTex(128, (g, s, r) => noise(g, s, r, '#ece6da', 0.05, 600, 3), 11);
  T.hedge = canvasTex(128, (g, s, r) => {
    noise(g, s, r, '#2f7d3a', 0.3, 2500, 3);
  }, 12);
  T.metal = canvasTex(128, (g, s, r) => {
    noise(g, s, r, '#e9edf2', 0.06, 800, 2);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = 0; x < s; x += s / 6) g.fillRect(x, 0, 2, s);
  }, 13);
  return T;
}
