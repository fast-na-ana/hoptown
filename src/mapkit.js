// Shared map-building kit: box geometry with world-space UVs, point-symmetric placement,
// walls with openings, props, nav graph builder, AFK box and final mesh assembly.
import * as THREE from 'three';
import { makeTextures, makeDesertTextures } from './textures.js';
import { mergeByMaterial } from './merge.js';

// Depth layer per material: coplanar faces of different materials never z-fight.
const RANK = {
  grass: 0, sand: 0, asphalt: 1, tile: 1, concrete: 2, wood: 2, roof: 2, interior: 3, fence: 3, hedge: 3, trunk: 3, metal: 3,
  truckRed: 3, carBlue: 3, carYellow: 3, crate: 3, sidingA: 4, sidingB: 4, brick: 4, sandstone: 4, sandstoneDark: 4,
  plaster: 4, ochre: 4, terracotta: 4, picket: 5, dark: 5, white: 5, blueTrim: 5, canvasRed: 6, canvasBlue: 6,
  trim: 6, orange: 6, lamp: 6, pad: 6, flowers: 6, glass: 7, afkglass: 7, water: 2,
  slab: 0, shellconc: 2, corrugated: 3, roofsheet: 2, truss: 4, skylight: 5, plywood: 3, drywall: 3, sandbag: 3, pallet: 3,
  contA: 3, contB: 3, hazard: 6, saltcrust: 1, mudflat: 1, whitewash: 4, tarwood: 4, rust: 4, bdoor: 5, bpanel: 5, bglass: 7, buoy: 6, net: 6, paintA: 6, paintB: 6, targetRed: 6, barrel: 3,
  shutterA: 6, shutterB: 6, sandbox: 2, soil: 2, veg: 4, cream: 4, steel: 5, farGrass: 0, farHouse: 4, farRoof: 5, cloth: 6, rope: 6, stripeA: 6, stripeB: 6,
};

const MAT_DEFS = {
  grass: { tex: 'grass', uv: 4 }, asphalt: { tex: 'asphalt', uv: 4 }, concrete: { tex: 'concrete', uv: 2 },
  sidingA: { tex: 'sidingA', uv: 2.4 }, sidingB: { tex: 'sidingB', uv: 2.4 }, brick: { tex: 'brick', uv: 2 },
  wood: { tex: 'wood', uv: 2.5 }, fence: { tex: 'fence', uv: 2 }, roof: { tex: 'roof', uv: 3 },
  interior: { tex: 'interior', uv: 2 }, hedge: { tex: 'hedge', uv: 1.5 }, metal: { tex: 'metal', uv: 2 },
  crate: { tex: 'wood', uv: 1.2 }, picket: { color: '#f6f3ec' },
  trim: { color: '#f4f1ea' }, white: { color: '#ffffff' }, dark: { color: '#2a2d33' },
  truckRed: { color: '#d9483b' }, carBlue: { color: '#3d7be0' }, carYellow: { color: '#f2c230' },
  glass: { color: '#9fd6ff', emissive: '#1d3d55' }, afkglass: { color: '#dff4ff' },
  pad: { color: '#3ff2ff', emissive: '#18c8e0' }, trunk: { color: '#7a5233' },
  lamp: { color: '#fff4c2', emissive: '#ffe28a' }, orange: { color: '#ff8a3d' }, flowers: { color: '#ff6f9a' },
  water: { color: '#3d8fb8', emissive: '#0d3550' }, blueTrim: { color: '#2f7fc4' },
  shutterA: { color: '#2f5f8f' }, shutterB: { color: '#9a4436' }, soil: { color: '#5a3f2a' }, veg: { color: '#5cae3e' },
  cream: { color: '#efe4c8' }, sandbox: { color: '#e3cf9a' },
  slab: { tex: 'concrete', uv: 5, color: '#c4c2bc' }, shellconc: { tex: 'concrete', uv: 2.5, color: '#a9a8a2' }, corrugated: { tex: 'metal', uv: 3, color: '#8b95a1' },
  roofsheet: { color: '#4e545c' }, truss: { color: '#3a3f47' }, skylight: { color: '#eaf4ff', emissive: '#cfe3ff' },
  plywood: { color: '#dcc193' }, drywall: { color: '#e7e4dc' }, sandbag: { color: '#b8a477' }, pallet: { tex: 'wood', uv: 0.9, color: '#d0ac74' },
  contA: { tex: 'metal', uv: 1.2, color: '#c9563e' }, contB: { tex: 'metal', uv: 1.2, color: '#2f7193' }, hazard: { color: '#ffd60a' }, paintA: { color: '#ff7a3d' }, paintB: { color: '#3ec1ff' },
  targetRed: { color: '#d8332b' }, barrel: { color: '#3d6e4a' }, steel: { color: '#a9b2bd' }, farGrass: { tex: 'grass', uv: 8 }, farHouse: { color: '#d9d2c4' },
  farRoof: { color: '#6d5a50' }, cloth: { color: '#e8eef5' }, rope: { color: '#cdb79a' }, stripeA: { color: '#ff7a3d' }, stripeB: { color: '#3ec1ff' },
  // salt works
  saltcrust: { tex: 'concrete', uv: 4, color: '#efece4' }, mudflat: { dtex: 'sand', uv: 4, color: '#a39c88' }, whitewash: { dtex: 'plaster', uv: 3, color: '#fbf8f2' },
  tarwood: { tex: 'wood', uv: 2.5, color: '#7d7872' }, rust: { tex: 'metal', uv: 2, color: '#b06a44' }, buoy: { color: '#ff6a2b' }, net: { color: '#4a6b5d' },
  bdoor: { color: '#5d6873' }, bpanel: { color: '#b9bec4' }, bglass: { color: '#dff4ff' },
  // desert
  sand: { dtex: 'sand', uv: 5 }, sandstone: { dtex: 'sandstone', uv: 3 }, sandstoneDark: { dtex: 'sandstoneDark', uv: 3 },
  plaster: { dtex: 'plaster', uv: 3 }, ochre: { dtex: 'ochre', uv: 3 }, terracotta: { dtex: 'terracotta', uv: 3 },
  tile: { dtex: 'tile', uv: 3 }, canvasRed: { dtex: 'canvasRed', uv: 2 }, canvasBlue: { dtex: 'canvasBlue', uv: 2 },
};

// representative colour of each surface, for impact debris
const TEX_COL = {
  grass: '#5f9a3e', asphalt: '#3a3d42', concrete: '#b9b7b0', sidingA: '#d8d2c2', sidingB: '#c9d6e0', brick: '#a2543c',
  wood: '#9a6b3e', fence: '#a57a4e', roof: '#5a4a44', interior: '#d9d0bf', hedge: '#3f7a34', metal: '#8a9099', crate: '#9a6b3e',
  sand: '#d9b77e', sandstone: '#d6b07a', sandstoneDark: '#a98656', plaster: '#e6dcc8', ochre: '#c88a3c', terracotta: '#b85c38',
  tile: '#3f8fa8', canvasRed: '#c0473a', canvasBlue: '#3a6fb0', farGrass: '#5f9a3e',
  saltcrust: '#efece4', mudflat: '#8f8875', whitewash: '#f4f1ea', tarwood: '#6d6a66', rust: '#a5603a',
};
export function debrisColor(mat) { return TEX_COL[mat] || (MAT_DEFS[mat] && MAT_DEFS[mat].color) || '#9a9a9a'; }
const SOFT = new Set(['grass', 'sand', 'hedge', 'soil', 'veg', 'farGrass', 'sandbox', 'flowers', 'cloth', 'canvasRed', 'canvasBlue']);
export function isSoft(mat) { return SOFT.has(mat); }

// ---------- geometry accumulation with world-space UVs ----------
class GeoBucket {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; }
  addBox(min, max, uvScale) {
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    const s = 1 / uvScale;
    const face = (verts, n, uvs) => {
      const base = this.pos.length / 3;
      for (let i = 0; i < 4; i++) { this.pos.push(...verts[i]); this.nor.push(...n); this.uv.push(uvs[i][0] * s, uvs[i][1] * s); }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [[-z1, y0], [-z0, y0], [-z0, y1], [-z1, y1]]);
    face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [[z0, y0], [z1, y0], [z1, y1], [z0, y1]]);
    face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]]);
    face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
    face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], [[-x1, y0], [-x0, y0], [-x0, y1], [-x1, y1]]);
  }
  // box rotated about Y by `yaw` (world = c + R·local), UVs in the box's own frame
  addOBox(c, h, yaw, uvScale) {
    const s = 1 / uvScale, cs = Math.cos(yaw), sn = Math.sin(yaw);
    const W = (lx, ly, lz) => [c[0] + lx * cs - lz * sn, c[1] + ly, c[2] + lx * sn + lz * cs];
    const N = (lx, lz) => [lx * cs - lz * sn, 0, lx * sn + lz * cs];
    const [hx, hy, hz] = h;
    const face = (corners, n) => {
      const base = this.pos.length / 3;
      for (const [lx, ly, lz, u, v] of corners) { this.pos.push(...W(lx, ly, lz)); this.nor.push(...n); this.uv.push(u * s, v * s); }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    face([[hx, -hy, hz, -hz, -hy], [hx, -hy, -hz, hz, -hy], [hx, hy, -hz, hz, hy], [hx, hy, hz, -hz, hy]], N(1, 0));
    face([[-hx, -hy, -hz, -hz, -hy], [-hx, -hy, hz, hz, -hy], [-hx, hy, hz, hz, hy], [-hx, hy, -hz, -hz, hy]], N(-1, 0));
    face([[-hx, hy, hz, -hx, -hz], [hx, hy, hz, hx, -hz], [hx, hy, -hz, hx, hz], [-hx, hy, -hz, -hx, hz]], [0, 1, 0]);
    face([[-hx, -hy, -hz, -hx, -hz], [hx, -hy, -hz, hx, -hz], [hx, -hy, hz, hx, hz], [-hx, -hy, hz, -hx, hz]], [0, -1, 0]);
    face([[-hx, -hy, hz, -hx, -hy], [hx, -hy, hz, hx, -hy], [hx, hy, hz, hx, hy], [-hx, hy, hz, -hx, hy]], N(0, 1));
    face([[hx, -hy, -hz, -hx, -hy], [-hx, -hy, -hz, hx, -hy], [-hx, hy, -hz, hx, hy], [hx, hy, -hz, -hx, hy]], N(0, -1));
  }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// 180° rotation about the origin gives perfectly fair, point-symmetric maps.
// rot 0 = as written, 2 = 180° point symmetry, 'mz' = mirror across the z = 0 line
export const STAIR_LOG = [];   // stairs of the map being built (for tests)
export function tf(rot, min, max) {
  if (rot === 0) return [min, max];
  if (rot === 'mz') return [[min[0], min[1], -max[2]], [max[0], max[1], -min[2]]];
  return [[-max[0], min[1], -max[2]], [-min[0], max[1], -min[2]]];
}
export function tp(rot, p) { return rot === 2 ? [-p[0], p[1], -p[2]] : rot === 'mz' ? [p[0], p[1], -p[2]] : [...p]; }

// Cover a rotated rectangle (in XZ) with thin axis-aligned strips so the AABB physics world can collide with it.
export function rasterRect(c, hx, hz, yaw, step = 0.25) {
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const pts = [[hx, hz], [hx, -hz], [-hx, -hz], [-hx, hz]].map(([x, z]) => [c[0] + x * cs - z * sn, c[2] + x * sn + z * cs]);
  const ex = Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0]));
  const ez = Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1]));
  const A = ex >= ez ? 0 : 1, Bx = 1 - A;            // strip along the longer world axis
  const lo = Math.min(...pts.map(p => p[A])), hi = Math.max(...pts.map(p => p[A]));
  const n = Math.max(1, Math.ceil((hi - lo) / step - 1e-6)), w = (hi - lo) / n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const s0 = lo + i * w, s1 = s0 + w;
    let bmin = Infinity, bmax = -Infinity;
    for (let k = 0; k < 4; k++) {
      const p = pts[k], q = pts[(k + 1) % 4];
      if (p[A] >= s0 - 1e-6 && p[A] <= s1 + 1e-6) { bmin = Math.min(bmin, p[Bx]); bmax = Math.max(bmax, p[Bx]); }
      for (const sx of [s0, s1]) {
        if ((p[A] - sx) * (q[A] - sx) < 0) { const t = (sx - p[A]) / (q[A] - p[A]); const b = p[Bx] + (q[Bx] - p[Bx]) * t; bmin = Math.min(bmin, b); bmax = Math.max(bmax, b); }
      }
    }
    if (bmin > bmax) continue;
    out.push(A === 0 ? [s0, s1, bmin, bmax] : [bmin, bmax, s0, s1]);
  }
  return out;   // [x0, x1, z0, z1]
}

export function createKit(world) {
  let T = null, D = null;
  const buckets = {};
  const bucket = (m) => buckets[m] || (buckets[m] = new GeoBucket());
  const canopies = [], palms = [], hills = [], domeList = [];

  const B = {
    rot: 0,
    box(min, max, mat, collide = true) {
      const [a, b] = tf(this.rot, min, max);
      bucket(mat).addBox(a, b, (MAT_DEFS[mat] && MAT_DEFS[mat].uv) || 1);
      if (collide) world.add(a, b).mat = mat;
    },
    collider(min, max, tag, mat) { const [a, b] = tf(this.rot, min, max); const bx = world.add(a, b, tag); if (mat) bx.mat = mat; return bx; },
    // climbable volume; dir = horizontal direction a climber faces (into the ladder)
    ladder(min, max, dir) {
      const [a, b] = tf(this.rot, min, max);
      const d = this.rot === 'mz' ? [dir[0], -dir[1]] : this.rot === 2 ? [-dir[0], -dir[1]] : dir;
      (world.ladders || (world.ladders = [])).push({ min: a, max: b, dir: d });
    },
    visual(min, max, mat) { this.box(min, max, mat, false); },
    // rotated box: centre c, half-extents h, yaw (radians). Point symmetry keeps yaw, mirrors the centre.
    obox(c, h, yaw, mat, collide = true) {
      const cc = tp(this.rot, c);
      if (this.rot === 'mz') yaw = -yaw;
      bucket(mat).addOBox(cc, h, yaw, (MAT_DEFS[mat] && MAT_DEFS[mat].uv) || 1);
      if (collide) for (const [x0, x1, z0, z1] of rasterRect(cc, h[0], h[2], yaw)) world.add([x0, cc[1] - h[1], z0], [x1, cc[1] + h[1], z1], 'angled').mat = mat;
    },
    p(p) { return tp(this.rot, p); },
  };

  // wall along X (thickness along Z) or along Z, with rectangular openings [s0, s1, y0, y1]
  function wall(axis, t0, t1, s0, s1, y0, y1, openings, mat, sill = 'trim') {
    const cuts = new Set([s0, s1]);
    for (const o of openings) { cuts.add(Math.max(s0, Math.min(s1, o[0]))); cuts.add(Math.max(s0, Math.min(s1, o[1]))); }
    const cs = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i < cs.length - 1; i++) {
      const a = cs[i], b = cs[i + 1];
      if (b - a < 1e-4) continue;
      const m = (a + b) / 2;
      let intervals = [[y0, y1]];
      for (const o of openings) {
        if (m > o[0] && m < o[1]) {
          const next = [];
          for (const [p, q] of intervals) {
            if (o[3] <= p || o[2] >= q) { next.push([p, q]); continue; }
            if (o[2] > p) next.push([p, o[2]]);
            if (o[3] < q) next.push([o[3], q]);
          }
          intervals = next;
        }
      }
      for (const [p, q] of intervals) {
        if (q - p < 1e-4) continue;
        const e = 0.004;
        if (axis === 'x') { B.collider([a, p, t0], [b, q, t1], undefined, mat); B.visual([a - e, p, t0], [b + e, q, t1], mat); }
        else { B.collider([t0, p, a], [t1, q, b], undefined, mat); B.visual([t0, p, a - e], [t1, q, b + e], mat); }
      }
    }
    if (sill) for (const o of openings) {
      if (o[2] < 0.5) continue;
      if (axis === 'x') B.visual([o[0] - 0.08, o[2] - 0.08, t0 - 0.08], [o[1] + 0.08, o[2], t1 + 0.08], sill);
      else B.visual([t0 - 0.08, o[2] - 0.08, o[0] - 0.08], [t1 + 0.08, o[2], o[1] + 0.08], sill);
    }
  }

  // straight stairs: from (x,z) start, rising along +x/-x/+z/-z
  function stairs(x0, z0, width, dir, steps, rise, run, baseY, mat) {
    // remember the space in front of the bottom step and past the top one (checked by test/stairs.mjs)
    const L = steps * run, top = baseY + rise * steps, P = 0.9;
    const zone = (a, b, y) => dir === '+x' ? [[x0 + a, y, z0], [x0 + b, y + 1.75, z0 + width]] : dir === '-x' ? [[x0 - b, y, z0], [x0 - a, y + 1.75, z0 + width]]
      : dir === '+z' ? [[x0, y, z0 + a], [x0 + width, y + 1.75, z0 + b]] : [[x0, y, z0 - b], [x0 + width, y + 1.75, z0 - a]];
    STAIR_LOG.push({ bottom: tf(B.rot, ...zone(-P, -0.02, baseY + 0.05)), top: tf(B.rot, ...zone(L + 0.02, L + P, top + 0.05)), width });
    for (let i = 0; i < steps; i++) {
      const h = baseY + rise * (i + 1);
      const a = i * run, b = (i + 1) * run;
      if (dir === '+x') B.box([x0 + a, baseY, z0], [x0 + b, h, z0 + width], mat);
      if (dir === '-x') B.box([x0 - b, baseY, z0], [x0 - a, h, z0 + width], mat);
      if (dir === '+z') B.box([x0, baseY, z0 + a], [x0 + width, h, z0 + b], mat);
      if (dir === '-z') B.box([x0, baseY, z0 - b], [x0 + width, h, z0 - a], mat);
    }
  }

  function car(min, max, axis, mat) {
    const [x0, , z0] = min, [x1, , z1] = max;
    B.box([x0, 0.3, z0], [x1, 1.05, z1], mat);
    if (axis === 'z') {
      const l = z1 - z0;
      B.box([x0 + 0.12, 1.05, z0 + l * 0.28], [x1 - 0.12, 1.55, z0 + l * 0.72], 'glass');
      for (const zz of [z0 + 0.5, z1 - 1.2]) for (const xx of [x0 - 0.05, x1 - 0.25]) B.visual([xx, 0, zz], [xx + 0.3, 0.6, zz + 0.7], 'dark');
    } else {
      const l = x1 - x0;
      B.box([x0 + l * 0.28, 1.05, z0 + 0.12], [x0 + l * 0.72, 1.55, z1 - 0.12], 'glass');
      for (const xx of [x0 + 0.5, x1 - 1.2]) for (const zz of [z0 - 0.05, z1 - 0.25]) B.visual([xx, 0, zz], [xx + 0.7, 0.6, zz + 0.3], 'dark');
    }
    B.collider([x0, 0, z0], [x1, 0.3, z1]);
  }

  // box truck along x: cargo [x0,x0+5] then cab
  function truck(x0, z0, cargoMat = 'metal', cabMat = 'truckRed', flip = false) {
    const cx0 = flip ? x0 + 2 : x0, cabX = flip ? x0 : x0 + 5.1;
    B.box([cx0, 0.45, z0], [cx0 + 5.1, 3.2, z0 + 2.5], cargoMat);
    B.box([cabX, 0.45, z0 + 0.1], [cabX + 2, 2.45, z0 + 2.4], cabMat);
    B.box([flip ? cabX : cabX + 0.7, 1.55, z0 + 0.08], [flip ? cabX + 1.3 : cabX + 1.95, 2.3, z0 + 2.42], 'glass', false);
    for (const x of [x0 + 1, x0 + 4, x0 + 6.2]) for (const z of [z0 - 0.05, z0 + 2.2]) B.visual([x - 0.45, 0, z], [x + 0.45, 0.9, z + 0.35], 'dark');
    B.collider([x0, 0, z0 + 0.3], [x0 + 7.1, 0.45, z0 + 2.2]);
  }

  // Hollow box truck parked at an angle: walk in through the open back or the kerb-side door,
  // peek through the window slot on the far side. Local u = length (cab at +u), w = width.
  function atruck(cx, cz, yaw, cabMat = 'truckRed', stripe = 'orange', bodyMat = 'cream') {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (u0, u1, w0, w1, y0, y1, mat, collide = true) => {
      const uc = (u0 + u1) / 2, wc = (w0 + w1) / 2;
      B.obox([cx + uc * cs - wc * sn, (y0 + y1) / 2, cz + uc * sn + wc * cs], [(u1 - u0) / 2, (y1 - y0) / 2, (w1 - w0) / 2], yaw, mat, collide);
    };
    const U0 = -3.7, U1 = 1.5, WI = 1.13, WO = 1.25, FL = 0.48, TOP = 3.05;
    // chassis + floor (solid to the ground so nobody shoots under it)
    P(U0, U1, -WO, WO, 0.22, FL - 0.08, 'dark');
    P(U0, U1, -WI, WI, FL - 0.08, FL, 'wood');
    P(U0, 3.8, -1.0, 1.0, 0, 0.22, 'dark');
    // +w wall with a window slot
    P(U0, -2.6, WI, WO, FL, TOP, bodyMat); P(-1.2, U1, WI, WO, FL, TOP, bodyMat);
    P(-2.6, -1.2, WI, WO, FL, 1.6, bodyMat); P(-2.6, -1.2, WI, WO, 2.3, TOP, bodyMat);
    // -w wall with a side door
    P(U0, -1.1, -WO, -WI, FL, TOP, bodyMat); P(0.2, U1, -WO, -WI, FL, TOP, bodyMat); P(-1.1, 0.2, -WO, -WI, 2.45, TOP, bodyMat);
    // front bulkhead, roof, rear header
    P(U1 - 0.12, U1, -WI, WI, FL, TOP, bodyMat);
    P(U0 - 0.05, U1 + 0.05, -WO - 0.05, WO + 0.05, TOP, TOP + 0.15, bodyMat);
    P(U0, U0 + 0.14, -WI, WI, 2.8, TOP, 'dark');
    // stripes (outside only), rear doors swung open flat against the sides, steps
    P(U0 + 0.1, -2.6, WO, WO + 0.02, 2.15, 2.4, stripe, false); P(-1.2, U1 - 0.1, WO, WO + 0.02, 2.15, 2.4, stripe, false);
    P(U0 + 0.1, -1.1, -WO - 0.02, -WO, 2.15, 2.4, stripe, false); P(0.2, U1 - 0.1, -WO - 0.02, -WO, 2.15, 2.4, stripe, false);
    P(U0 - 0.02, U0 + 1.15, WO + 0.02, WO + 0.08, 0.55, 2.95, bodyMat, false);
    P(U0 - 0.02, U0 + 1.15, -WO - 0.08, -WO - 0.02, 0.55, 2.95, bodyMat, false);
    P(U0 - 0.3, U0, -1.0, 1.0, 0, 0.24, 'dark');
    P(-1.0, 0.1, -1.5, -WO, 0, 0.22, 'dark');
    P(0.4, 1.3, 0.15, 1.05, FL, FL + 0.9, 'crate');                       // crate inside: crouch cover
    // cab + hood
    P(1.6, 3.05, -1.15, 1.15, 0.22, 2.5, cabMat);
    P(3.05, 3.8, -1.12, 1.12, 0.22, 1.55, cabMat);
    P(2.95, 3.07, -1.0, 1.0, 1.6, 2.35, 'glass', false);
    P(1.85, 2.85, 1.15, 1.17, 1.55, 2.3, 'glass', false); P(1.85, 2.85, -1.17, -1.15, 1.55, 2.3, 'glass', false);
    P(3.8, 3.84, -0.85, 0.85, 0.6, 1.3, 'steel', false);
    P(3.8, 3.86, 0.62, 0.95, 1.05, 1.35, 'lamp', false); P(3.8, 3.86, -0.95, -0.62, 1.05, 1.35, 'lamp', false);
    P(1.6, 1.75, 1.15, 1.45, 1.6, 1.9, 'dark', false); P(1.6, 1.75, -1.45, -1.15, 1.6, 1.9, 'dark', false); // mirrors
    // wheels
    for (const u of [-3.0, -2.05, 2.9]) for (const ws of [-1, 1]) P(u - 0.45, u + 0.45, ws > 0 ? 1.12 : -1.38, ws > 0 ? 1.38 : -1.12, 0, 0.9, 'dark', false);
  }

  // Visual-only backdrop beyond the play area: far ground, a ring of buildings, trees and hills.
  // Deterministic so every client sees the same skyline.
  function scenery({ ix, iz, ground = 'farGrass', bodies = ['farHouse'], roof = 'farRoof', window = 'dark', trees = true, palmsToo = false, hillsAt = 95, seed = 7, flatRoof = false, tall = false, domes = false }) {
    let a = seed >>> 0;
    const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const r = B.rot; B.rot = 0;
    B.visual([-160, -1.5, -160], [160, -0.06, 160], ground);
    const building = (x, z, faceX) => {
      const w = 7 + rnd() * 4, d = 6 + rnd() * 3, h = tall ? 7 + rnd() * 7 : 4.5 + rnd() * 3.5, body = bodies[Math.floor(rnd() * bodies.length)];
      const [hw, hd] = faceX ? [d / 2, w / 2] : [w / 2, d / 2];
      B.visual([x - hw, -0.06, z - hd], [x + hw, h, z + hd], body);
      if (flatRoof) { B.visual([x - hw - 0.2, h, z - hd - 0.2], [x + hw + 0.2, h + 0.4, z + hd + 0.2], roof); if (domes && rnd() < 0.3) domeList.push([x, h + 0.4, z, Math.min(hw, hd) * 0.8]); }
      else { B.visual([x - hw - 0.4, h, z - hd - 0.4], [x + hw + 0.4, h + 0.5, z + hd + 0.4], roof); B.visual([x - hw * 0.6, h + 0.5, z - hd * 0.6], [x + hw * 0.6, h + 1.6, z + hd * 0.6], roof); }
      // windows on the face that looks at the arena
      const fz = z > 0 ? z - hd - 0.05 : z + hd, fx = x > 0 ? x - hw - 0.05 : x + hw;
      for (let f = 0; f < (h > 6.5 ? 2 : 1); f++) for (const o of [-0.3, 0.3]) {
        const y0 = 1.4 + f * 3;
        if (faceX) B.visual([fx, y0, z + o * w - 0.6], [fx + 0.05, y0 + 1.2, z + o * w + 0.6], window);
        else B.visual([x + o * w - 0.6, y0, fz], [x + o * w + 0.6, y0 + 1.2, fz + 0.05], window);
      }
    };
    for (let x = -ix - 26; x <= ix + 26; x += 13 + rnd() * 3) for (const sz of [-1, 1]) building(x + rnd() * 3, sz * (iz + 8 + rnd() * 6), false);
    for (let z = -iz + 4; z <= iz - 4; z += 13 + rnd() * 3) for (const sx of [-1, 1]) building(sx * (ix + 8 + rnd() * 6), z + rnd() * 3, true);
    if (trees || palmsToo) {
      for (let i = 0; i < 26; i++) {
        const ang = rnd() * Math.PI * 2, rx = ix + 4 + rnd() * 18, rz = iz + 4 + rnd() * 18;
        const p = [Math.cos(ang) * rx, 0, Math.sin(ang) * rz];
        if (Math.abs(p[0]) < ix + 2 && Math.abs(p[2]) < iz + 2) continue;
        if (palmsToo) palms.push({ p: [p[0], 5 + rnd() * 2, p[2]], seed: rnd() * 6, trunk: true });
        else canopies.push([p[0], 4 + rnd() * 1.5, p[2]]);
        if (!palmsToo) B.visual([p[0] - 0.3, -0.06, p[2] - 0.3], [p[0] + 0.3, 3.4, p[2] + 0.3], 'trunk');
      }
    }
    for (let i = 0; i < 9; i++) { const ang = i / 9 * Math.PI * 2 + rnd() * 0.4; hills.push([Math.cos(ang) * hillsAt * (1 + rnd() * 0.25), Math.sin(ang) * hillsAt * (0.85 + rnd() * 0.25), 22 + rnd() * 16, 9 + rnd() * 10]); }
    B.rot = r;
  }

  function tree(p, h = 3.6) {
    B.box([p[0] - 0.3, 0 + p[1], p[2] - 0.3], [p[0] + 0.3, h + p[1], p[2] + 0.3], 'trunk');
    canopies.push(tp(B.rot, [p[0], p[1] + h + 1.0, p[2]]));
  }
  function palm(p, h = 5.2) {
    B.box([p[0] - 0.22, p[1], p[2] - 0.22], [p[0] + 0.22, p[1] + h, p[2] + 0.22], 'trunk');
    palms.push({ p: tp(B.rot, [p[0], p[1] + h, p[2]]), seed: Math.random() * 6 });
  }

  function pad(min, max, vel) {
    B.box(min, max, 'pad');
    const [pm, px] = tf(B.rot, min, max);
    world.pads.push({ min: pm, max: px, vel: tp(B.rot, vel) });
  }

  function afkBox(y = 30) {
    const r = B.rot; B.rot = 0;
    B.box([-4.3, y - 0.3, -4.3], [4.3, y, 4.3], 'concrete');
    for (const [mn, mx] of [[[-4.3, y, -4.3], [4.3, y + 3.4, -4.0]], [[-4.3, y, 4.0], [4.3, y + 3.4, 4.3]],
      [[-4.3, y, -4.0], [-4.0, y + 3.4, 4.0]], [[4.0, y, -4.0], [4.3, y + 3.4, 4.0]]]) B.box(mn, mx, 'afkglass');
    B.box([-4.3, y + 3.4, -4.3], [4.3, y + 3.6, 4.3], 'afkglass');
    for (const x of [-4.3, 4.0]) for (const z of [-4.3, 4.0]) B.box([x, y, z], [x + 0.3, y + 3.6, z + 0.3], 'dark');
    B.box([-3.6, y, 2.6], [3.6, y + 0.5, 3.6], 'wood');
    B.box([-1.2, y, -1.2], [1.2, y + 0.02, 1.2], 'orange');
    B.rot = r;
    return [[-2.5, y, -2.5], [2.5, y, -2.5], [-2.5, y, 1], [2.5, y, 1], [0, y, -1.5], [0, y, 1.2]];
  }

  function perimeter(x, z, h, mat, wallH = 2.4) {
    const r = B.rot; B.rot = 0;
    B.box([-x - 0.3, 0, -z - 0.3], [x + 0.3, wallH, -z], mat);
    B.box([-x - 0.3, 0, z], [x + 0.3, wallH, z + 0.3], mat);
    B.box([-x - 0.3, 0, -z], [-x, wallH, z], mat);
    B.box([x, 0, -z], [x + 0.3, wallH, z], mat);
    world.add([-x - 1, 0, -z - 1], [x + 1, h, -z - 0.3], 'invisible');
    world.add([-x - 1, 0, z + 0.3], [x + 1, h, z + 1], 'invisible');
    world.add([-x - 1, 0, -z - 1], [-x - 0.3, h, z + 1], 'invisible');
    world.add([x + 0.3, 0, -z - 1], [x + 1, h, z + 1], 'invisible');
    B.rot = r;
  }

  function finalize(scene, opts = {}) {
    world.build();
    const group = new THREE.Group();
    for (const [name, bk] of Object.entries(buckets)) {
      const def = MAT_DEFS[name] || { color: '#ff00ff' };
      let map = null;
      if (def.tex) { T = T || makeTextures(); map = T[def.tex]; }
      if (def.dtex) { D = D || makeDesertTextures(); map = D[def.dtex]; }
      const mat = new THREE.MeshStandardMaterial({
        map, color: def.color || '#ffffff', roughness: name === 'glass' ? 0.2 : 0.88,
        metalness: name === 'metal' ? 0.15 : 0, emissive: def.emissive || '#000000', emissiveIntensity: def.emissive ? 0.8 : 0,
      });
      if (name === 'glass') { mat.transparent = true; mat.opacity = 0.75; }
      if (name === 'water') { mat.roughness = 0.15; }
      if (name === 'afkglass') { mat.transparent = true; mat.opacity = 0.16; mat.roughness = 0.1; mat.depthWrite = false; }
      const rank = RANK[name] ?? 3;
      if (rank > 0) { mat.polygonOffset = true; mat.polygonOffsetFactor = -0.5 * rank; mat.polygonOffsetUnits = -2 * rank; }
      const mesh = new THREE.Mesh(bk.toGeometry(), mat);
      mesh.castShadow = !['grass', 'sand', 'asphalt', 'tile', 'glass', 'afkglass', 'water', 'roofsheet', 'skylight', 'corrugated', 'shellconc', 'slab'].includes(name);
      mesh.receiveShadow = true;
      mesh.name = 'map-' + name;
      group.add(mesh);
    }
    const leafMat = new THREE.MeshStandardMaterial({ color: opts.leaf || '#3f9b46', roughness: 0.9, flatShading: true });
    for (const c of canopies) {
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 - i * 0.25, 0), leafMat);
        m.position.set(c[0] + (i - 1) * 0.6, c[1] + i * 0.7, c[2] + (i % 2) * 0.5);
        m.castShadow = true; group.add(m);
      }
    }
    const frondMat = new THREE.MeshStandardMaterial({ color: '#4f9a3c', roughness: 0.85, flatShading: true, side: THREE.DoubleSide });
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#7a5233', roughness: 0.9 });
    for (const { p, seed, trunk } of palms) {
      if (trunk) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, p[1], 0.4), trunkMat); t.position.set(p[0], p[1] / 2, p[2]); group.add(t); }
      for (let i = 0; i < 7; i++) {
        const g = new THREE.ConeGeometry(0.5, 3.0, 4, 1); g.translate(0, 1.5, 0); g.scale(1, 1, 0.25);
        const m = new THREE.Mesh(g, frondMat);
        m.position.set(p[0], p[1], p[2]);
        m.rotation.set(0, seed + i * (Math.PI * 2 / 7), 1.15 + (i % 2) * 0.25, 'YXZ');
        m.castShadow = true; group.add(m);
      }
      const nut = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), frondMat); nut.position.set(p[0], p[1], p[2]); group.add(nut);
    }
    const hillMat = new THREE.MeshStandardMaterial({ color: opts.hill || '#7fa36a', roughness: 1, flatShading: true });
    for (const [x, z, r, h] of hills) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), hillMat);
      m.scale.set(r, h, r * 0.8); m.position.set(x, -h * 0.15, z); group.add(m);
    }
    const domeMat = new THREE.MeshStandardMaterial({ color: opts.dome || '#e8d7b5', roughness: 0.8, flatShading: true });
    for (const [x, y, z, r] of domeList) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), domeMat); m.position.set(x, y, z); group.add(m);
    }
    const ringMat = new THREE.MeshBasicMaterial({ color: '#7ff8ff', transparent: true, opacity: 0.55, depthWrite: false });
    const padRings = [];
    for (const p of world.pads) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 6, 24), ringMat);
      ring.rotation.x = Math.PI / 2; ring.userData.keep = true;
      ring.position.set((p.min[0] + p.max[0]) / 2, p.max[1] + 0.2, (p.min[2] + p.max[2]) / 2);
      ring.userData.baseY = p.max[1] + 0.2;
      group.add(ring); padRings.push(ring);
    }
    mergeByMaterial(group);
    scene.add(group);
    return { group, padRings };
  }

  return { B, wall, stairs, car, truck, atruck, tree, palm, pad, afkBox, perimeter, finalize, scenery };
}

// Nav graph: `half` nodes (keys starting with 'a_') are mirrored to 'b_' by 180° rotation,
// `centre` nodes are used as-is. Same-level nodes with a clear walking line are auto-linked.
export function buildNav(world, { half, centre = {}, links = [], oneWay = [], maxLink = 13, noAuto = [], mirror = null }) {
  const twin = (p) => mirror === 'z' ? [p[0], p[1], -p[2]] : tp(2, p);
  const nodes = [], index = {};
  for (const [k, p] of Object.entries(half)) {
    index[k] = nodes.length; nodes.push({ id: k, p: [...p], links: [] });
    const kb = 'b' + k.slice(1);
    index[kb] = nodes.length; nodes.push({ id: kb, p: twin(p), links: [] });
  }
  for (const [k, p] of Object.entries(centre)) { index[k] = nodes.length; nodes.push({ id: k, p: [...p], links: [] }); }
  const link = (a, b) => { if (a == null || b == null) return; if (!nodes[a].links.includes(b)) nodes[a].links.push(b); };
  const both = (a, b) => {
    if (a.startsWith('a_') || b.startsWith('a_')) for (const pre of ['a', 'b']) {
      const ka = a.startsWith('a_') ? pre + a.slice(1) : a, kb = b.startsWith('a_') ? pre + b.slice(1) : b;
      link(index[ka], index[kb]); link(index[kb], index[ka]);
    } else { link(index[a], index[b]); link(index[b], index[a]); }
  };
  for (const [a, b] of links) both(a, b);
  for (const [a, b] of oneWay) for (const pre of ['a', 'b']) link(index[a.startsWith('a_') ? pre + a.slice(1) : a], index[b.startsWith('a_') ? pre + b.slice(1) : b]);
  const skip = (id) => noAuto.some(s => id.includes(s));
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i].p, b = nodes[j].p;
    if (Math.abs(a[1] - b[1]) > 0.45) continue;
    const d = Math.hypot(a[0] - b[0], a[2] - b[2]);
    if (d > maxLink || d < 0.01) continue;
    if (skip(nodes[i].id) || skip(nodes[j].id)) continue;
    let ok = true;
    for (const h of [0.3, 0.9, 1.5]) {
      for (const off of [-0.35, 0.35]) {
        const nx = -(b[2] - a[2]) / d * off, nz = (b[0] - a[0]) / d * off;
        if (!world.lineOfSight([a[0] + nx, a[1] + h, a[2] + nz], [b[0] + nx, b[1] + h, b[2] + nz])) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (ok) { link(i, j); link(j, i); }
  }
  return { nodes, index };
}

export function mirrorList(list, mirror = null) { const out = []; for (const s of list) { out.push([...s]); out.push(mirror === 'z' ? [s[0], s[1], -s[2]] : tp(2, s)); } return out; }
