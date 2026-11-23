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
  // desert
  sand: { dtex: 'sand', uv: 5 }, sandstone: { dtex: 'sandstone', uv: 3 }, sandstoneDark: { dtex: 'sandstoneDark', uv: 3 },
  plaster: { dtex: 'plaster', uv: 3 }, ochre: { dtex: 'ochre', uv: 3 }, terracotta: { dtex: 'terracotta', uv: 3 },
  tile: { dtex: 'tile', uv: 3 }, canvasRed: { dtex: 'canvasRed', uv: 2 }, canvasBlue: { dtex: 'canvasBlue', uv: 2 },
};

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
export function tf(rot, min, max) {
  if (rot === 0) return [min, max];
  return [[-max[0], min[1], -max[2]], [-min[0], max[1], -min[2]]];
}
export function tp(rot, p) { return rot === 2 ? [-p[0], p[1], -p[2]] : [...p]; }

export function createKit(world) {
  let T = null, D = null;
  const buckets = {};
  const bucket = (m) => buckets[m] || (buckets[m] = new GeoBucket());
  const canopies = [], palms = [];

  const B = {
    rot: 0,
    box(min, max, mat, collide = true) {
      const [a, b] = tf(this.rot, min, max);
      bucket(mat).addBox(a, b, (MAT_DEFS[mat] && MAT_DEFS[mat].uv) || 1);
      if (collide) world.add(a, b);
    },
    collider(min, max, tag) { const [a, b] = tf(this.rot, min, max); world.add(a, b, tag); },
    visual(min, max, mat) { this.box(min, max, mat, false); },
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
        if (axis === 'x') { B.collider([a, p, t0], [b, q, t1]); B.visual([a - e, p, t0], [b + e, q, t1], mat); }
        else { B.collider([t0, p, a], [t1, q, b]); B.visual([t0, p, a - e], [t1, q, b + e], mat); }
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
      mesh.castShadow = !['grass', 'sand', 'asphalt', 'tile', 'glass', 'afkglass', 'water'].includes(name);
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
    for (const { p, seed } of palms) {
      for (let i = 0; i < 7; i++) {
        const g = new THREE.ConeGeometry(0.5, 3.0, 4, 1); g.translate(0, 1.5, 0); g.scale(1, 1, 0.25);
        const m = new THREE.Mesh(g, frondMat);
        m.position.set(p[0], p[1], p[2]);
        m.rotation.set(0, seed + i * (Math.PI * 2 / 7), 1.15 + (i % 2) * 0.25, 'YXZ');
        m.castShadow = true; group.add(m);
      }
      const nut = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), frondMat); nut.position.set(p[0], p[1], p[2]); group.add(nut);
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

  return { B, wall, stairs, car, truck, tree, palm, pad, afkBox, perimeter, finalize };
}

// Nav graph: `half` nodes (keys starting with 'a_') are mirrored to 'b_' by 180° rotation,
// `centre` nodes are used as-is. Same-level nodes with a clear walking line are auto-linked.
export function buildNav(world, { half, centre = {}, links = [], oneWay = [], maxLink = 13, noAuto = [] }) {
  const nodes = [], index = {};
  for (const [k, p] of Object.entries(half)) {
    index[k] = nodes.length; nodes.push({ id: k, p: [...p], links: [] });
    const kb = 'b' + k.slice(1);
    index[kb] = nodes.length; nodes.push({ id: kb, p: tp(2, p), links: [] });
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

export function mirrorList(list) { const out = []; for (const s of list) { out.push([...s]); out.push(tp(2, s)); } return out; }
