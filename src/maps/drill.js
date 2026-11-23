// DRILL HALL — compact indoor training warehouse for 1v1 / 2v2.
// 28 m (x, west-east) × 56 m (z, north-south), mirrored across z = 0 so both spawns get identical
// travel times, cover heights and sightlines. Lanes: west flank x∈[-14,-7] (plywood CQB),
// centre x∈[-7,7] (angled blockers + central watchtower), east flank x∈[7,14] (steel containers).
// Cover heights: 1.05 m crouch cover, 1.40 m half cover, 3.0 m line-of-sight walls, 1.2×2.4 m doors.
// Plywood / drywall can be shot through (reduced damage); concrete, steel and crates stop bullets.
import { createKit, buildNav, mirrorList } from '../mapkit.js';

export const info = { id: 'drill', name: 'DRILL HALL', blurb: 'Compact training warehouse for 1v1 / 2v2: plywood you can shoot through, a central tower.', size: 'SMALL', tags: ['1V1 · 2V2', 'WALLBANGS', 'TOWER'] };

const W = 14, L = 28;            // half width, half length
const WALL = 3.0, CROUCH = 1.05, HALF = 1.4, DOOR_W = 1.2, DOOR_H = 2.4;

export function build(world, scene) {
  const K = createKit(world);
  const { B, wall } = K;

  // ---------- helpers
  // a door is a centre (standard 1.2 × 2.4 m cut-out) or [from, to] for a full-height gap
  const door = (c) => Array.isArray(c) ? [c[0], c[1], 0, WALL + 1] : [c - DOOR_W / 2, c + DOOR_W / 2, 0, DOOR_H];
  // plywood partition with door cut-outs and a header strip, framed with studs at the ends
  function partition(axis, t, a, b, doors, mat = 'plywood') {
    const t0 = t - 0.06, t1 = t + 0.06;
    wall(axis, t0, t1, a, b, 0, WALL, doors.map(door), mat, null);
    for (const s of [a, b, ...doors.flatMap(c => { const d = door(c); return [d[0], d[1]]; })]) {
      if (axis === 'x') B.visual([s - 0.05, 0, t0 - 0.02], [s + 0.05, WALL + 0.02, t1 + 0.02], 'pallet');
      else B.visual([t0 - 0.02, 0, s - 0.05], [t1 + 0.02, WALL + 0.02, s + 0.05], 'pallet');
    }
    const gaps = doors.filter(Array.isArray), cuts = [a, ...gaps.flat(), b];
    for (let i = 0; i < cuts.length; i += 2) {
      if (cuts[i + 1] - cuts[i] < 0.01) continue;
      if (axis === 'x') B.visual([cuts[i], WALL, t0 - 0.02], [cuts[i + 1], WALL + 0.06, t1 + 0.02], 'pallet');
      else B.visual([t0 - 0.02, WALL, cuts[i]], [t1 + 0.02, WALL + 0.06, cuts[i + 1]], 'pallet');
    }
  }
  // steel shipping container: hard cover, too tall to stand on
  function container(min, max, mat) {
    B.box([min[0], 0, min[2]], [max[0], 2.9, max[2]], mat);
    const alongZ = max[2] - min[2] > max[0] - min[0];
    const n = Math.floor((alongZ ? max[2] - min[2] : max[0] - min[0]) / 0.5);
    for (let i = 1; i < n; i++) {   // corrugation ribs
      const s = (alongZ ? min[2] : min[0]) + i * 0.5;
      if (alongZ) { B.visual([min[0] - 0.03, 0.1, s - 0.04], [min[0], 2.8, s + 0.04], 'dark'); B.visual([max[0], 0.1, s - 0.04], [max[0] + 0.03, 2.8, s + 0.04], 'dark'); }
      else { B.visual([s - 0.04, 0.1, min[2] - 0.03], [s + 0.04, 2.8, min[2]], 'dark'); B.visual([s - 0.04, 0.1, max[2]], [s + 0.04, 2.8, max[2] + 0.03], 'dark'); }
    }
    B.visual([min[0] - 0.02, 2.9, min[2] - 0.02], [max[0] + 0.02, 2.96, max[2] + 0.02], 'truss');
    B.collider([min[0], 2.9, min[2]], [max[0], 3.7, max[2]], 'invisible');      // no standing on top
  }
  function sandbags(min, max) {
    B.box([min[0], 0, min[2]], [max[0], CROUCH, max[2]], 'sandbag');
    for (let y = 0.2; y < CROUCH; y += 0.21) B.visual([min[0] - 0.03, y, min[2] - 0.03], [max[0] + 0.03, y + 0.025, max[2] + 0.03], 'pallet');
  }
  function pallets(min, max, h) {
    B.box([min[0], 0, min[2]], [max[0], h, max[2]], 'pallet');
    for (let y = 0.14; y < h; y += 0.15) B.visual([min[0] - 0.02, y, min[2] - 0.02], [max[0] + 0.02, y + 0.03, max[2] + 0.02], 'dark');
  }
  function crate(min, max, h) {
    B.box([min[0], 0, min[2]], [max[0], h, max[2]], 'crate');
    B.visual([min[0] - 0.02, h - 0.08, min[2] - 0.02], [max[0] + 0.02, h, max[2] + 0.02], 'dark');
  }
  function barrel(x, z) { B.box([x - 0.3, 0, z - 0.3], [x + 0.3, 0.95, z + 0.3], 'barrel'); B.visual([x - 0.32, 0.42, z - 0.32], [x + 0.32, 0.5, z + 0.32], 'dark'); }
  function target(axis, t, s, y, out) {     // paper target on a wall face
    const f0 = out > 0 ? t : t - 0.02, f1 = out > 0 ? t + 0.02 : t;
    if (axis === 'x') { B.visual([s - 0.35, y - 0.45, f0], [s + 0.35, y + 0.45, f1], 'white'); B.visual([s - 0.12, y - 0.12, f0 - 0.005], [s + 0.12, y + 0.12, f1 + 0.005], 'targetRed'); }
    else { B.visual([f0, y - 0.45, s - 0.35], [f1, y + 0.45, s + 0.35], 'white'); B.visual([f0 - 0.005, y - 0.12, s - 0.12], [f1 + 0.005, y + 0.12, s + 0.12], 'targetRed'); }
  }
  const floorPaint = (min, max, mat) => B.visual([min[0], 0, min[1]], [max[0], 0.012, max[1]], mat);

  // ---------- shell (built once): slab, walls, trusses, roof with skylights
  B.rot = 0;
  B.box([-W - 0.4, -0.4, -L - 0.4], [W + 0.4, 0, L + 0.4], 'slab');
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -W - 0.4 : W, x1 = sx < 0 ? -W : W + 0.4;
    B.box([x0, 0, -L - 0.4], [x1, 3, L + 0.4], 'shellconc'); B.box([x0, 3, -L - 0.4], [x1, 14, L + 0.4], 'corrugated');
    for (let z = -L + 4; z < L; z += 8) B.visual([sx < 0 ? -W : W - 0.04, 9, z - 1.6], [sx < 0 ? -W + 0.04 : W, 11, z + 1.6], 'skylight');   // clerestory
    for (let z = -L; z <= L; z += 4) B.visual([sx < 0 ? -W : W - 0.35, 0, z - 0.2], [sx < 0 ? -W + 0.35 : W, 12.2, z + 0.2], 'truss');      // wall columns
  }
  for (const sz of [-1, 1]) {
    const z0 = sz < 0 ? -L - 0.4 : L, z1 = sz < 0 ? -L : L + 0.4;
    B.box([-W, 0, z0], [W, 3, z1], 'shellconc'); B.box([-W, 3, z0], [W, 14, z1], 'corrugated');
    B.visual([-4, 7, sz < 0 ? -L : L - 0.04], [4, 11, sz < 0 ? -L + 0.04 : L], 'skylight');                                              // gable window
  }
  for (let z = -L + 2; z < L; z += 4) {
    B.visual([-W, 12.2, z - 0.12], [W, 12.6, z + 0.12], 'truss');
    for (let x = -W + 2; x < W; x += 3) B.visual([x - 0.06, 12.6, z - 0.06], [x + 0.06, 13.9, z + 0.06], 'truss');
    B.visual([-W, 13.8, z - 0.1], [W, 14, z + 0.1], 'truss');
  }
  for (const x of [-10, -3.5, 3.5, 10]) B.visual([x - 0.1, 12.6, -L], [x + 0.1, 12.8, L], 'truss');
  for (const [a, b, m] of [[-W - 0.4, -9, 'roofsheet'], [-9, -6, 'skylight'], [-6, 6, 'roofsheet'], [6, 9, 'skylight'], [9, W + 0.4, 'roofsheet']]) B.visual([a, 14, -L - 0.4], [b, 14.3, L + 0.4], m);
  // hanging work lights over each lane
  for (const x of [-10.5, 0, 10.5]) for (const z of [-22, -12, -4, 4, 12, 22]) {
    B.visual([x - 0.6, 8.8, z - 0.2], [x + 0.6, 8.95, z + 0.2], 'lamp');
    B.visual([x - 0.02, 8.95, z - 0.02], [x + 0.02, 12.2, z + 0.02], 'dark');
  }
  // centre-line paint and lane edges
  floorPaint([-W, -0.06], [W, 0.06], 'hazard');
  for (const x of [-7, 7]) floorPaint([x - 0.05, -2], [x + 0.05, 2], 'hazard');

  // ---------- one half (north, z < 0); the south half is its mirror image
  function half(rot, paint, cont) {
    B.rot = rot;
    // spawn staging: painted zone, lockers, team marking
    floorPaint([-W, -L], [W, -27.8], paint);
    floorPaint([-6.6, -21.75], [-3.0, -21.62], paint); floorPaint([3.0, -21.75], [6.6, -21.62], paint);
    for (const [a, b] of [[-8.6, -3.4], [3.4, 8.6]]) {
      B.box([a, 0, -L], [b, 2.0, -27.45], 'steel');
      for (let x = a + 0.55; x < b; x += 0.55) B.visual([x - 0.02, 0.1, -27.46], [x + 0.02, 1.9, -27.43], 'dark');
      B.visual([a, 2.0, -L], [b, 2.05, -27.45], paint);
    }
    // corner storage rooms (drywall, ceilings) with two doors each
    for (const sx of [-1, 1]) {
      const inner = sx * 10.6, outer = sx * W;
      const xa = Math.min(inner, outer), xb = Math.max(inner, outer);
      partition('z', inner + sx * 0.0, -L, -24.6, [-26.3], 'drywall');
      partition('x', -24.6, xa, xb, [sx * 12.5], 'drywall');
      B.box([xa, WALL, -L], [xb, WALL + 0.15, -24.55], 'metal');                               // ceiling
      B.box([sx < 0 ? xa + 0.1 : xb - 0.55, 0, -27.95], [sx < 0 ? xa + 0.55 : xb - 0.1, 2.2, -25.4], 'steel');   // shelving
      crate([sx < 0 ? -12.4 : 11.2, 0, -27.9], [sx < 0 ? -11.2 : 12.4, 0, -26.9], CROUCH);
      B.visual([sx < 0 ? xa + 0.6 : xb - 0.65, 2.2, -27.9], [sx < 0 ? xa + 0.65 : xb - 0.6, 2.25, -25.5], 'dark');
    }
    // gate line: three exits out of the staging area (west flank, centre, east flank)
    partition('x', -21.5, -W, -3.0, [[-9.8, -7.4]]);   // 2.4 m west-flank exit; centre exit is x∈[-3, 3]
    partition('x', -21.5, 3.0, W, [[7.4, 9.8]]);
    target('x', -21.44, -5, 1.6, 1); target('x', -21.44, 5, 1.6, 1);

    // ---- west flank: plywood CQB with alternating doors
    partition('z', -7, -21.5, -2.0, [-14.6, -6.0]);
    partition('x', -16.5, -W, -7.06, [-8.8]);          // door on the east side
    partition('x', -10.5, -W, -7.06, [-12.2]);         // door on the west side
    crate([-13.4, 0, -19.6], [-12.2, 0, -18.4], HALF);
    pallets([-10.4, 0, -13.8], [-9.0, 0, -12.6], CROUCH);
    barrel(-13.4, -14.6); barrel(-13.4, -13.8);
    crate([-12.6, 0, -6.2], [-11.2, 0, -4.8], HALF);
    target('z', -7.06, -18.5, 1.6, 1); target('x', -10.44, -9.5, 1.6, 1);

    // ---- east flank: steel containers and crates (hard cover)
    partition('z', 7, -21.5, -2.0, [-17.2, -7.6]);
    container([11.4, 0, -19.8], [13.9, 0, -13.4], cont);
    container([7.06, 0, -11.6], [10.9, 0, -9.2], cont);
    pallets([8.0, 0, -15.8], [9.2, 0, -14.6], HALF);
    crate([12.6, 0, -7.4], [13.8, 0, -6.2], CROUCH);
    barrel(13.4, -4.6);
    target('z', 7.06, -4.2, 1.6, 1);

    // ---- centre approach: angled plywood walls, sandbags, pallets, concrete pillars
    B.obox([-3.0, WALL / 2, -17.2], [2.2, WALL / 2, 0.06], 0.52, 'plywood');
    B.obox([2.8, WALL / 2, -12.6], [2.0, WALL / 2, 0.06], -0.61, 'plywood');
    sandbags([-5.4, 0, -11.2], [-3.2, 0, -10.4]);
    pallets([3.6, 0, -19.4], [4.9, 0, -18.2], HALF);
    sandbags([0.6, 0, -6.0], [2.6, 0, -5.2]);
    for (const x of [-4.2, 4.2]) B.box([x - 0.45, 0, -7.45], [x + 0.45, 12.2, -6.55], 'shellconc');

    // ---- tower ladder + backboard on this side
    B.ladder([-0.5, 0, -3.05], [0.5, 4.2, -2.5], [0, 1]);
    B.box([-0.6, 0, -2.5], [0.6, 3.2, -2.36], 'truss');
    for (const x of [-0.5, 0.42]) B.visual([x, 0, -2.86], [x + 0.08, 4.5, -2.78], 'steel');
    for (let y = 0.3; y < 3.6; y += 0.3) B.visual([-0.45, y, -2.85], [0.45, y + 0.05, -2.79], 'steel');
    // deck barricade on this edge, gap at the ladder
    for (const [a, b] of [[-2.5, -0.65], [0.65, 2.5]]) B.box([a, 3.5, -2.5], [b, 3.5 + CROUCH, -2.4], 'plywood');
    B.visual([-2.55, 3.5 + CROUCH, -2.52], [2.55, 3.6 + CROUCH, -2.38], 'hazard');
  }
  half(0, 'paintA', 'contA');
  half('mz', 'paintB', 'contB');
  B.rot = 0;

  // ---------- central watchtower (on the centre line, built once)
  B.box([-2.5, 3.2, -2.5], [2.5, 3.5, 2.5], 'plywood');                              // deck
  B.visual([-2.55, 3.1, -2.55], [2.55, 3.2, 2.55], 'truss');
  for (const x of [-2.5, 2.2]) for (const z of [-2.5, 2.2]) B.box([x, 0, z], [x + 0.3, 3.2, z + 0.3], 'truss');
  for (const sx of [-1, 1]) {
    B.box([sx < 0 ? -2.5 : 2.4, 3.5, -2.4], [sx < 0 ? -2.4 : 2.5, 3.5 + CROUCH, 2.4], 'plywood');   // side barricades
    B.visual([sx < 0 ? -2.52 : 2.38, 3.5 + CROUCH, -2.5], [sx < 0 ? -2.38 : 2.52, 3.6 + CROUCH, 2.5], 'hazard');
    B.box([sx < 0 ? -2.5 : 2.42, 0, -1.6], [sx < 0 ? -2.42 : 2.5, CROUCH, 1.6], 'plywood');          // low skirts underneath
  }
  B.box([-0.05, 0, -1.6], [0.05, CROUCH, 1.6], 'plywood');                           // thin divider in the pass-through
  // tower flanks: sandbags and concrete pillars where the flank lanes open into the middle
  sandbags([4.4, 0, -0.6], [5.6, 0, 0.6]); sandbags([-5.6, 0, -0.6], [-4.4, 0, 0.6]);
  for (const x of [-7, 7]) B.box([x - 0.45, 0, -0.45], [x + 0.45, 12.2, 0.45], 'shellconc');
  crate([-12.0, 0, -0.7], [-10.8, 0, 0.7], HALF); crate([10.8, 0, -0.7], [12.0, 0, 0.7], HALF);

  const afkSpawns = K.afkBox(60);
  const { group, padRings } = K.finalize(scene, { leaf: '#5d9a3f' });

  const MZ = 'z';
  const teamA = [[-4, 0, -26], [4, 0, -26], [-1.5, 0, -23.6], [1.5, 0, -23.6], [-12.3, 0, -25.6], [12.3, 0, -25.6]];
  const teamSpawns = { A: teamA, B: teamA.map(p => [p[0], p[1], -p[2]]) };
  const spawns = mirrorList([...teamA, [-12.8, 0, -8.4], [10.0, 0, -5.4], [-5.6, 0, -14.4], [5.6, 0, -15.2]], MZ);
  const flags = { A: [0, 0, -25.4], B: [0, 0, 25.4] };

  const nav = buildNav(world, {
    mirror: MZ,
    half: {
      a_sp1: [-4, 0, -26], a_sp2: [4, 0, -26], a_spc: [0, 0, -23.6],
      a_alw: [-12.3, 0, -26.3], a_alw_d: [-9.6, 0, -26.3], a_alw_s: [-12.5, 0, -23.4],
      a_ale: [12.3, 0, -26.3], a_ale_d: [9.6, 0, -26.3], a_ale_s: [12.5, 0, -23.4],
      a_gw: [-8.6, 0, -21.5], a_ge: [8.6, 0, -21.5], a_gc: [0, 0, -21.4],
      a_w1: [-10.4, 0, -19.4], a_w1d: [-8.8, 0, -16.5], a_w2: [-10.6, 0, -15.2], a_wd1: [-7, 0, -14.6],
      a_w2d: [-12.2, 0, -10.5], a_w3: [-11.6, 0, -8.6], a_w4: [-9.4, 0, -6.0], a_wd2: [-7, 0, -6.0], a_w5: [-10.2, 0, -2.6],
      a_e1: [9.2, 0, -19.4], a_ed1: [7, 0, -17.2], a_e2: [9.2, 0, -13.0], a_e3: [12.4, 0, -12.5], a_e4: [12.4, 0, -8.6],
      a_ed2: [7, 0, -7.6], a_e5: [9.8, 0, -5.4], a_e6: [10.4, 0, -2.6],
      a_c1: [0, 0, -19.6], a_c2: [-5.2, 0, -14.4], a_c3: [0.6, 0, -15.4], a_c4: [5.6, 0, -15.2], a_c5: [-1.0, 0, -9.8],
      a_c6: [5.4, 0, -9.4], a_c7: [-5.6, 0, -8.4], a_c8: [-2.6, 0, -5.0], a_c9: [4.6, 0, -4.0], a_cw: [-4.8, 0, -2.8], a_ce: [4.8, 0, -2.8],
      a_lad: [0, 0, -3.6], a_uw: [-1.4, 0, -1.8], a_ue: [1.4, 0, -1.8], a_top: [0, 3.5, -1.2],
    },
    centre: { c_w: [-9.6, 0, 0], c_e: [9.6, 0, 0], c_mw: [-6.0, 0, 1.6], c_me: [6.0, 0, -1.6] },
    links: [['a_lad', 'a_top']],
  });

  return {
    group, padRings, spawns, teamSpawns, flags, afkSpawns, nav, bounds: { minY: -15 }, mmBounds: { minX: -W - 0.4, maxX: W + 0.4, minZ: -L - 0.4, maxZ: L + 0.4 },
    env: { ambient: 'motes', dust: '#bdb6a8', cloud: '#ffffff', top: '#6f7884', mid: '#a9b0b8', bot: '#c9ccd0', fog: '#b8bcc2', hemiSky: '#f2f4f7', hemiGround: '#8a8174', sun: '#fff0d8', sunI: 1.7 },
    preview: { radius: 9, height: 7.5 },
  };
}
