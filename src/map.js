// "Maple Court" — an original small suburban arena: two houses facing each other
// diagonally across a street, garages, a delivery truck as centre cover, rooftop jump pads.
import * as THREE from 'three';
import { makeTextures } from './textures.js';
import { mergeByMaterial } from './merge.js';

const RANK = {
  grass: 0, asphalt: 1, concrete: 2, wood: 2, roof: 2, interior: 3, fence: 3, hedge: 3, trunk: 3, metal: 3,
  truckRed: 3, carBlue: 3, carYellow: 3, crate: 3, sidingA: 4, sidingB: 4, brick: 4, dark: 5, white: 5,
  trim: 6, orange: 6, lamp: 6, pad: 6, glass: 7, afkglass: 7,
};
const F1 = 0.15;   // ground floor top
const F2 = 3.35;   // second floor top
const ROOF = 6.5;  // roof top

// ---------- geometry accumulation with world-space UVs ----------
class GeoBucket {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; }
  addBox(min, max, uvScale) {
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    const s = 1 / uvScale;
    const face = (verts, n, uvs) => {
      const base = this.pos.length / 3;
      for (let i = 0; i < 4; i++) {
        this.pos.push(...verts[i]); this.nor.push(...n); this.uv.push(uvs[i][0] * s, uvs[i][1] * s);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    // +X
    face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [[-z1, y0], [-z0, y0], [-z0, y1], [-z1, y1]]);
    // -X
    face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [[z0, y0], [z1, y0], [z1, y1], [z0, y1]]);
    // +Y
    face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], [[x0, -z1], [x1, -z1], [x1, -z0], [x0, -z0]]);
    // -Y
    face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);
    // +Z
    face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    // -Z
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

// Quarter-turn transforms around the origin (rot 0 or 2 used for point symmetry).
function tf(rot, min, max) {
  if (rot === 0) return [min, max];
  if (rot === 2) return [[-max[0], min[1], -max[2]], [-min[0], max[1], -min[2]]];
  throw new Error('rot');
}
function tp(rot, p) { return rot === 2 ? [-p[0], p[1], -p[2]] : [...p]; }

export function buildMap(world, scene) {
  const T = makeTextures();
  const mats = {
    grass: { map: T.grass, uv: 4 },
    asphalt: { map: T.asphalt, uv: 4 },
    concrete: { map: T.concrete, uv: 2 },
    sidingA: { map: T.sidingA, uv: 2.4 },
    sidingB: { map: T.sidingB, uv: 2.4 },
    brick: { map: T.brick, uv: 2 },
    wood: { map: T.wood, uv: 2.5 },
    fence: { map: T.fence, uv: 2 },
    roof: { map: T.roof, uv: 3 },
    interior: { map: T.interior, uv: 2 },
    hedge: { map: T.hedge, uv: 1.5 },
    metal: { map: T.metal, uv: 2 },
    trim: { color: '#f4f1ea' },
    white: { color: '#ffffff' },
    dark: { color: '#2a2d33' },
    truckRed: { color: '#d9483b' },
    carBlue: { color: '#3d7be0' },
    carYellow: { color: '#f2c230' },
    glass: { color: '#9fd6ff', emissive: '#1d3d55' },
    afkglass: { color: '#dff4ff' },
    pad: { color: '#3ff2ff', emissive: '#18c8e0' },
    trunk: { color: '#7a5233' },
    lamp: { color: '#fff4c2', emissive: '#ffe28a' },
    orange: { color: '#ff8a3d' },
    crate: { map: T.wood, uv: 1.2 },
  };
  const buckets = {};
  const bucket = (m) => buckets[m] || (buckets[m] = new GeoBucket());

  const B = {
    rot: 0,
    box(min, max, mat, collide = true) {
      const [a, b] = tf(this.rot, min, max);
      bucket(mat).addBox(a, b, mats[mat].uv || 1);
      if (collide) world.add(a, b);
    },
    collider(min, max) { const [a, b] = tf(this.rot, min, max); world.add(a, b); },
    visual(min, max, mat) { this.box(min, max, mat, false); },
  };

  // wall along X (thickness along Z) or along Z, with rectangular openings
  function wall(axis, t0, t1, s0, s1, y0, y1, openings, mat) {
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
        // colliders are exact; visuals overlap slightly to hide hairline seams between slices
        const e = 0.004;
        if (axis === 'x') { B.collider([a, p, t0], [b, q, t1]); B.visual([a - e, p, t0], [b + e, q, t1], mat); }
        else { B.collider([t0, p, a], [t1, q, b]); B.visual([t0, p, a - e], [t1, q, b + e], mat); }
      }
    }
    // window sills (visual)
    for (const o of openings) {
      if (o[2] < 0.5) continue;
      if (axis === 'x') B.visual([o[0] - 0.08, o[2] - 0.08, t0 - 0.08], [o[1] + 0.08, o[2], t1 + 0.08], 'trim');
      else B.visual([t0 - 0.08, o[2] - 0.08, o[0] - 0.08], [t1 + 0.08, o[2], o[1] + 0.08], 'trim');
    }
  }

  // ---------- one side of the court (mirrored by 180° rotation) ----------
  function side(rot, siding, carMat) {
    B.rot = rot;
    // House footprint x[-19,-7], z[-20,-11]; front faces +z (street)
    const X0 = -19, X1 = -7, Z0 = -20, Z1 = -11, W = 0.3;
    B.box([X0 + W, 0, Z0 + W], [X1 - W, F1, Z1 - W], 'wood');       // ground slab (inside the walls)
    const dW = 1.4;
    // front wall
    wall('x', Z1 - W, Z1, X0, X1, 0, ROOF - 0.2, [
      [-14.2, -12.8, F1, 2.45], [-18.2, -16.0, 0.95, 2.85], [-10.6, -8.2, 0.95, 2.85],
      [-17.6, -15.6, 4.25, 5.9], [-14, -12, 4.25, 5.9], [-10.4, -8.4, 4.25, 5.9],
    ], siding);
    // back wall
    wall('x', Z0, Z0 + W, X0, X1, 0, ROOF - 0.2, [
      [-10, -10 + dW, F1, 2.45], [-17.2, -14.8, 0.95, 2.85], [-17, -15, 4.25, 5.9], [-11, -9, 4.25, 5.9],
    ], siding);
    // side walls
    wall('z', X0, X0 + W, Z0 + W, Z1 - W, 0, ROOF - 0.2, [[-16.7, -14.3, 0.95, 2.85], [-17, -15, 4.25, 5.9]], siding);
    wall('z', X1 - W, X1, Z0 + W, Z1 - W, 0, ROOF - 0.2, [[-14.2, -12.8, F1, 2.45], [-18.6, -16.2, 4.25, 5.9]], siding);
    // second floor slab with stairwell hole x[-18.7,-13.4] z[-19.7,-18.2]
    B.box([-13.4, F2 - 0.2, Z0 + W], [X1 - W, F2, Z1 - W], 'wood');
    B.box([X0 + W, F2 - 0.2, -18.2], [-13.4, F2, Z1 - W], 'wood');
    // stair railing
    B.box([X0 + W, F2, -18.25], [-14.0, F2 + 1.0, -18.12], 'trim');
    // stairs: 10 steps rising toward +x along the back wall
    for (let i = 0; i < 10; i++) {
      const x0 = -17.9 + 0.45 * i;
      B.box([x0, F1, Z0 + W], [x0 + 0.45, F1 + 0.32 * (i + 1), -18.3], 'wood');
    }
    B.box([X0 + W, F1, Z0 + W], [-17.9, F1 + 0.32, -18.3], 'wood'); // bottom landing block
    // ground floor divider with doorway
    wall('z', -11.2, -11.0, Z0 + W, Z1 - W, F1, F2 - 0.2, [[-16.4, -14.8, F1, 2.45]], 'interior');
    // upstairs divider with doorway
    wall('x', -15.6, -15.4, -13.0, X1 - W, F2, ROOF - 0.2, [[-11, -9.6, F2, F2 + 2.3]], 'interior');
    // furniture cover
    B.box([-18.4, F1, -13.3], [-16.6, F1 + 1.0, -12.3], 'wood');      // kitchen counter
    B.box([-16.0, F1, -15.8], [-13.8, F1 + 0.8, -15.0], 'carBlue');   // couch
    B.box([-8.3, F1, -17.8], [-7.3, F1 + 1.1, -15.8], 'wood');        // dresser
    B.box([-9.4, F2, -14.6], [-7.3, F2 + 0.7, -12.2], 'white');      // bed
    B.box([-9.4, F2, -19.4], [-7.6, F2 + 1.3, -18.2], 'wood');        // wardrobe
    // roof slab + parapet + rooftop unit
    B.box([X0, ROOF - 0.2, Z0], [X1, ROOF, Z1], 'roof');
    B.box([X0, ROOF, Z0], [X1, ROOF + 0.6, Z0 + 0.3], 'trim');
    B.box([X0, ROOF, Z1 - 0.3], [X1, ROOF + 0.6, Z1], 'trim');
    B.box([X0, ROOF, Z0 + 0.3], [X0 + 0.3, ROOF + 0.6, Z1 - 0.3], 'trim');
    B.box([X1 - 0.3, ROOF, Z0 + 0.3], [X1, ROOF + 0.6, Z1 - 0.3], 'trim');
    B.box([-15, ROOF, -17], [-13.4, ROOF + 1.0, -15.5], 'metal');
    B.box([-10.5, ROOF, -14.2], [-9.5, ROOF + 1.6, -13.2], 'brick');  // chimney
    // porch roof (visual) and step
    B.box([-15, 2.6, Z1], [-12, 2.75, Z1 + 1.6], 'trim', false);
    // jump pad to roof in backyard
    const pad = { min: [-13.6, 0, -22.7], max: [-12.4, 0.12, -21.5] };
    B.box(pad.min, pad.max, 'pad');
    const [pm, px] = tf(rot, pad.min, pad.max);
    const v = tp(rot, [0, 17.4, 2.6]);
    world.pads.push({ min: pm, max: px, vel: v });

    // Garage x[-4,3] z[-21,-13], open door toward street
    wall('x', -13.3, -13.0, -4, 3, 0, 3.2, [[-3.2, 2.2, 0, 2.8]], 'brick');
    wall('x', -21, -20.7, -4, 3, 0, 3.2, [[-1.2, 0.2, 0, 2.3]], 'brick');
    wall('z', -4, -3.7, -20.7, -13.3, 0, 3.2, [[-18.5, -16, 1.1, 2.2]], 'brick');
    wall('z', 2.7, 3, -20.7, -13.3, 0, 3.2, [], 'brick');
    B.box([-4, 3.2, -21], [3, 3.4, -13], 'roof');
    B.box([-4, 3.4, -21], [3, 3.7, -20.8], 'trim');
    B.box([-4, 3.4, -13.2], [3, 3.7, -13], 'trim');
    B.box([-3.4, 0, -20.4], [0.6, 1.0, -19.6], 'wood');   // workbench
    B.box([1.0, 0, -18.0], [2.4, 1.2, -16.6], 'crate');   // crate inside
    // crates outside to climb onto garage roof
    B.box([3, 0, -16], [4.3, 1.1, -14.7], 'crate');
    B.box([3, 0, -17.4], [4.3, 2.2, -16], 'crate');
    // driveway (visual) + car
    B.visual([-3.5, 0, -13], [2.2, 0.02, -6.5], 'concrete');
    car([-1.95, 0, -12.4], [-0.05, 0, -8.2], 'z', carMat);

    // yards: low fence along sidewalk with gaps, hedge, tree, shed
    B.box([-29.5, 0, -6.75], [-20.5, 0.95, -6.6], 'fence');
    B.box([-11.5, 0, -6.75], [-5.0, 0.95, -6.6], 'fence');
    B.box([-6.4, 0, -10.6], [-5.0, 1.35, -7.0], 'hedge');
    tree([-24.5, 0, -9.5]);
    tree([-26.5, 0, -19.5]);
    B.box([-28.5, 0, -26.2], [-24.0, 2.6, -22.6], 'wood');  // shed
    B.box([-28.7, 2.6, -26.4], [-23.8, 2.8, -22.4], 'roof');
    B.box([-20.5, 0, -24.8], [-18.5, 1.3, -23.6], 'dark');  // bins
    B.box([-6.5, 0, -25.0], [-3.0, 1.1, -23.6], 'concrete'); // planter
    // lamp post
    B.box([-6.1, 0, -6.1], [-5.85, 4.2, -5.85], 'dark');
    B.visual([-6.4, 4.2, -6.4], [-5.55, 4.45, -5.55], 'lamp');
    // sidewalk
    B.box([-30, 0, -6.5], [30, 0.15, -4.5], 'concrete');
  }

  function car(min, max, axis, mat) {
    // min/max footprint; body + cabin
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

  const canopies = [];
  function tree(p) {
    B.box([p[0] - 0.3, 0, p[2] - 0.3], [p[0] + 0.3, 3.6, p[2] + 0.3], 'trunk');
    canopies.push(tp(B.rot, [p[0], 4.6, p[2]]));
  }

  // ---------- shared ground + perimeter ----------
  B.rot = 0;
  B.box([-34, -1, -31], [34, 0, 31], 'grass');
  B.visual([-30, 0, -4.5], [30, 0.02, 4.5], 'asphalt');
  for (let x = -27; x < 28; x += 4) B.visual([x, 0.02, -0.1], [x + 2, 0.03, 0.1], 'white');
  // perimeter fences with tall invisible colliders
  const H = 2.4;
  B.box([-30.3, 0, -27.3], [30.3, H, -27], 'fence');
  B.box([-30.3, 0, 27], [30.3, H, 27.3], 'fence');
  B.box([-30.3, 0, -27], [-30, H, 27], 'fence');
  B.box([30, 0, -27], [30.3, H, 27], 'fence');
  world.add([-31, 0, -28], [31, 30, -27.3], 'invisible');
  world.add([-31, 0, 27.3], [31, 30, 28], 'invisible');
  world.add([-31, 0, -28], [-30.3, 30, 28], 'invisible');
  world.add([30.3, 0, -28], [31, 30, 28], 'invisible');
  // street-end hedges
  B.box([-29.9, 0, -4.5], [-28.6, 1.6, 4.5], 'hedge');
  B.box([28.6, 0, -4.5], [29.9, 1.6, 4.5], 'hedge');

  side(0, 'sidingA', 'carBlue');
  side(2, 'sidingB', 'carYellow');

  // ---------- centre: delivery truck, cars, barriers ----------
  B.rot = 0;
  B.box([-3.6, 0.45, -1.3], [1.5, 3.3, 1.3], 'metal');           // cargo box
  B.box([1.5, 0.45, -1.2], [3.5, 2.5, 1.2], 'truckRed');           // cab
  B.box([2.2, 1.6, -1.22], [3.45, 2.35, 1.22], 'glass', false);    // windscreen look
  for (const x of [-2.6, 0.4, 2.7]) for (const z of [-1.35, 1.0]) B.visual([x - 0.45, 0, z], [x + 0.45, 0.9, z + 0.35], 'dark');
  world.add([-3.6, 0, -1.0], [3.5, 0.45, 1.0]); // chassis (feet-level cover, shots pass under the sides)
  car([9, 0, -3.6], [13.2, 0, -1.7], 'x', 'carBlue');
  car([-13.2, 0, 1.7], [-9, 0, 3.6], 'x', 'carYellow');
  for (const [x, z] of [[19, 1.2], [-19, -1.2], [22, -2.4], [-22, 2.4]]) {
    B.box([x - 1.2, 0, z - 0.35], [x + 1.2, 1.0, z + 0.35], 'concrete');
    B.visual([x - 1.2, 1.0, z - 0.2], [x + 1.2, 1.1, z + 0.2], 'orange');
  }
  // ---------- AFK box: a sealed glass room high above the court ----------
  B.rot = 0;
  const AY = 30;
  B.box([-4.3, AY - 0.3, -4.3], [4.3, AY, 4.3], 'concrete');                 // floor
  for (const [mn, mx] of [[[-4.3, AY, -4.3], [4.3, AY + 3.4, -4.0]], [[-4.3, AY, 4.0], [4.3, AY + 3.4, 4.3]],
    [[-4.3, AY, -4.0], [-4.0, AY + 3.4, 4.0]], [[4.0, AY, -4.0], [4.3, AY + 3.4, 4.0]]]) B.box(mn, mx, 'afkglass');
  B.box([-4.3, AY + 3.4, -4.3], [4.3, AY + 3.6, 4.3], 'afkglass');         // ceiling
  for (const x of [-4.3, 4.0]) for (const z of [-4.3, 4.0]) B.box([x, AY, z], [x + 0.3, AY + 3.6, z + 0.3], 'dark'); // corner posts
  B.box([-3.6, AY, 2.6], [3.6, AY + 0.5, 3.6], 'wood');                     // bench
  B.box([-1.2, AY, -1.2], [1.2, AY + 0.02, 1.2], 'orange');                 // AFK mat
  // street-side mailboxes for small cover
  B.rot = 0;

  world.build();

  // ---------- meshes ----------
  const group = new THREE.Group();
  for (const [name, bk] of Object.entries(buckets)) {
    const m = mats[name];
    const mat = new THREE.MeshStandardMaterial({
      map: m.map || null, color: m.color || '#ffffff', roughness: name === 'glass' ? 0.2 : 0.88,
      metalness: name === 'metal' ? 0.15 : 0, emissive: m.emissive || '#000000', emissiveIntensity: m.emissive ? 0.8 : 0,
    });
    if (name === 'glass') { mat.transparent = true; mat.opacity = 0.75; }
    if (name === 'afkglass') { mat.transparent = true; mat.opacity = 0.16; mat.roughness = 0.1; mat.depthWrite = false; }
    // Every material sits on its own depth layer, so coplanar faces of different
    // materials never fight: the higher rank always wins.
    const rank = RANK[name] ?? 3;
    if (rank > 0) { mat.polygonOffset = true; mat.polygonOffsetFactor = -0.5 * rank; mat.polygonOffsetUnits = -2 * rank; }
    const mesh = new THREE.Mesh(bk.toGeometry(), mat);
    mesh.castShadow = name !== 'grass' && name !== 'asphalt' && name !== 'glass' && name !== 'afkglass';
    mesh.receiveShadow = true;
    mesh.name = 'map-' + name;
    group.add(mesh);
  }
  // tree canopies (non-colliding)
  const leafMat = new THREE.MeshStandardMaterial({ color: '#3f9b46', roughness: 0.9, flatShading: true });
  for (const c of canopies) {
    for (let i = 0; i < 3; i++) {
      const g = new THREE.IcosahedronGeometry(1.6 - i * 0.25, 0);
      const m = new THREE.Mesh(g, leafMat);
      m.position.set(c[0] + (i - 1) * 0.6, c[1] + i * 0.7, c[2] + (i % 2) * 0.5);
      m.castShadow = true;
      group.add(m);
    }
  }
  // lamp lights (cheap: emissive only, plus jump pad glow rings)
  const ringMat = new THREE.MeshBasicMaterial({ color: '#7ff8ff', transparent: true, opacity: 0.55, depthWrite: false });
  const padRings = [];
  for (const p of world.pads) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 6, 24), ringMat);
    ring.rotation.x = Math.PI / 2; ring.userData.keep = true;
    ring.position.set((p.min[0] + p.max[0]) / 2, 0.3, (p.min[2] + p.max[2]) / 2);
    group.add(ring);
    padRings.push(ring);
  }
  mergeByMaterial(group);
  scene.add(group);

  // ---------- spawns + bot navigation ----------
  const spawnsHalf = [
    [-15, F1, -16.8], [-9.0, F2, -12.5], [-20.5, 0, -22], [-22, 0, -14], [0.5, 0, -16],
    [-27, 0, -2.5], [-8, 0, -24.5], [-12, ROOF, -15.5],
  ];
  const spawns = [];
  for (const s of spawnsHalf) { spawns.push([...s]); spawns.push(tp(2, s)); }

  const navHalf = {
    // ground outside
    a_street_w: [-24, 0, -2.6], a_street_m: [-14, 0, -2.6], a_street_c: [-6, 0, -2.8],
    a_walk_w: [-24, 0.15, -5.5], a_walk_m: [-14, 0.15, -5.5], a_walk_e: [-3, 0.15, -5.5],
    a_yard_w: [-24, 0, -8.4], a_yard_m: [-13.5, 0, -8.6], a_drive: [1.2, 0, -8.6],
    a_alley_w: [-23, 0, -15], a_alley_w2: [-23.5, 0, -21.5], a_back_w: [-17, 0, -23.5], a_back_m: [-11, 0, -24],
    a_back_e: [-5, 0, -22.5], a_gap: [-5.5, 0, -16.5], a_gar_out: [5.5, 0, -18], a_gar_front: [6.5, 0, -10],
    a_gar_in: [-0.5, 0, -15.5], a_gar_door: [-0.5, 0, -11.6], a_back_out: [-9.3, 0, -21.6], a_gar_back: [-0.5, 0, -22.5], a_far_e: [12, 0, -9], a_far_e2: [20, 0, -8.5],
    // house interior
    a_door: [-13.5, F1, -12.2], a_liv: [-14.5, F1, -13.8], a_kit: [-17.5, F1, -14.6], a_back_rm: [-9.2, F1, -15.5],
    a_back_door: [-9.3, F1, -18.9], a_side_door: [-8.2, F1, -13.5],
    a_stair_b: [-18.3, F1, -19.0], a_stair_m: [-15.8, F1 + 1.6, -19.0], a_stair_t: [-12.8, F2, -19.0],
    a_up_hall: [-12.2, F2, -17.0], a_up_front: [-11.5, F2, -12.5], a_up_west: [-16.5, F2, -13.0], a_up_east: [-9.0, F2, -17.5],
    // roof
    a_roof_c: [-12, ROOF, -15.5], a_roof_w: [-17, ROOF, -13], a_pad: [-13, 0.12, -22.1],
  };
  const navLinks = [
    ['a_stair_b', 'a_stair_m'], ['a_stair_m', 'a_stair_t'], ['a_stair_t', 'a_up_hall'],
    ['a_kit', 'a_stair_b'], ['a_liv', 'a_stair_b'], ['a_back_door', 'a_back_out'], ['a_gar_in', 'a_gar_door'],
  ];
  const navOneWay = [['a_pad', 'a_roof_c'], ['a_roof_c', 'a_back_m'], ['a_roof_w', 'a_yard_m']];
  const nodes = [], index = {};
  for (const [k, p] of Object.entries(navHalf)) {
    index[k] = nodes.length; nodes.push({ id: k, p: [...p], links: [] });
    const kb = 'b' + k.slice(1);
    index[kb] = nodes.length; nodes.push({ id: kb, p: tp(2, p), links: [] });
  }
  // centre nodes
  for (const [k, p] of Object.entries({ c_n: [0, 0, 3.0], c_s: [0, 0, -3.0], c_e: [6, 0, 0], c_w: [-6, 0, 0], c_ee: [16, 0, 0], c_ww: [-16, 0, 0] })) {
    index[k] = nodes.length; nodes.push({ id: k, p, links: [] });
  }
  const link = (a, b) => { if (!nodes[a].links.includes(b)) nodes[a].links.push(b); };
  for (const [a, b] of navLinks) for (const pre of ['a', 'b']) {
    const A = index[pre + a.slice(1)], Bi = index[pre + b.slice(1)];
    link(A, Bi); link(Bi, A);
  }
  for (const [a, b] of navOneWay) for (const pre of ['a', 'b']) link(index[pre + a.slice(1)], index[pre + b.slice(1)]);
  // auto-link nodes on the same level with a clear walk path
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i].p, b = nodes[j].p;
    if (Math.abs(a[1] - b[1]) > 0.4) continue;
    const d = Math.hypot(a[0] - b[0], a[2] - b[2]);
    if (d > 13) continue;
    if (nodes[i].id.includes('roof') || nodes[j].id.includes('roof')) {
      if (!(nodes[i].id.includes('roof') && nodes[j].id.includes('roof'))) continue;
    }
    if (nodes[i].id.includes('pad') || nodes[j].id.includes('pad')) continue;
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
  // pad is enterable from the backyard
  for (const pre of ['a', 'b']) for (const k of ['_back_m', '_back_w', '_back_e']) link(index[pre + k], index[pre + '_pad']);

  const afkSpawns = [[-2.5, 30, -2.5], [2.5, 30, -2.5], [-2.5, 30, 1], [2.5, 30, 1], [0, 30, -1.5], [0, 30, 1.2]];
  return { group, spawns, afkSpawns, nav: { nodes, index }, padRings, bounds: { minY: -15 } };
}
