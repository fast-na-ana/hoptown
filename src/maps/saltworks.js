// SALTWORKS — an original 5v5 plant & defuse map set in a coastal salt works.
// Axes: x runs west (−) → east (+), z runs north (−) → south (+). Attackers spawn in the south loading
// yard, defenders on the north pier head. A wide, terraced mid courtyard (draining north toward the sea)
// links to both sites; Site A (east, boiling house yard) and Site B (west, sunken boat slip).
//
// The map is authored as a list of walkable rectangles; everything else on a 0.5 m grid becomes solid
// building mass (merged into boxes), so every gap between rooms is a real wall and chokes are exactly
// the width written below. Metrics: chokes 3.5–4 m, doors 1.5 × 2.4 m, cover 1.05 / 1.4 / 3.0+ m.
// Dynamic pieces: two switch-operated blast doors (500 HP), two destructible wall panels (400 HP) and
// a breakable glass window looking over mid. Scale anchor: the end of B Main to B's defender choke is
// a 15 m peek.
import { createKit, buildNav } from '../mapkit.js';

export const info = { id: 'saltworks', name: 'SALTWORKS', blurb: '5v5 plant & defuse at a coastal salt works: mid courtyard, sunken B, blast doors and breakable walls.', size: 'LARGE', tags: ['5V5 PLANT', 'BLAST DOORS', 'BREAKABLES'] };

const X0 = -48, X1 = 49, Z0 = -37, Z1 = 47;     // grid extents (outer ring of cells stays solid)
const CEIL = 9.2;                               // invisible lid: nobody stands on the roofs

export function build(world, scene) {
  const K = createKit(world);
  const { B, wall, stairs } = K;
  const brk = [];

  // ------------------------------------------------------------------ walkable areas
  // [x0, z0, x1, z1, floorY, material]
  const R = [];
  const area = (x0, z0, x1, z1, y = 0, mat = 'slab') => { R.push([x0, z0, x1, z1, y, mat]); };
  // attacker side (south)
  area(-11, 36, 11, 46, 0, 'slab');                 // attacker spawn: loading yard
  area(-13, 36.5, -11, 40, 0, 'slab');              // → B lobby
  area(11, 36.5, 13, 40, 0, 'slab');                // → A lobby
  area(-2, 30, 2, 36, 0, 'slab');                   // gate: 4 m choke to mid bottom
  area(-7, 20, 7, 30, 0, 'saltcrust');              // mid bottom
  area(-46.5, 24, -13, 40, 0, 'concrete');          // B lobby
  area(-46.5, 4, -43, 24, 0, 'slab');               // B Main: long narrow west corridor (3.5 m)
  area(13, 24, 38, 46, 0, 'concrete');              // A lobby
  area(30, 6, 34, 24, 0, 'slab');                   // A Main: 4 m south choke
  // mid courtyard, terraced down toward the north
  const bands = [[14, 20, 0], [11, 14, -0.15], [8, 11, -0.3], [5, 8, -0.45], [2, 5, -0.6], [-14, 2, -0.75]];
  for (const [a, b, y] of bands) area(-14, a, 14, b, y, 'saltcrust');
  area(-16, 11, -14, 14, -0.15, 'saltcrust');       // recessed cubby
  // site B (sunken boat slip) + its entrances
  area(-46.5, -10.5, -24, 4, -1.2, 'mudflat');
  area(-41.5, 6, -36, 13, 0, 'tarwood');            // pump closet (opened by breaking its panel)
  area(-43, 8, -41.5, 11.5, 0, 'tarwood');          //   panel opening from B Main
  area(-40, 4, -37, 6, 0, 'tarwood');               //   closet → site
  area(-22, -8, -15.5, -1, -0.75, 'tarwood');       // B Link: interior room between mid and B
  area(-24, -6, -22, -2.5, -0.75, 'tarwood');       //   blast door into B (3.5 m)
  area(-15.5, -6, -14, -2.5, -0.75, 'tarwood');     //   opening onto mid
  // site A (boiling house yard) + garden flank
  area(26, -19, 48, 6, 0, 'slab');
  area(16.5, -17, 24.5, -1, 0, 'grass');            // herb garden
  area(14, -6, 16.5, -2.5, -0.75, 'saltcrust');     //   catwalk mouth from mid
  area(24.5, -12, 26, -8.5, 0, 'slab');             //   blast door into A (3.5 m)
  area(24.5, -4, 26, -0.5, 0, 'slab');              //   destructible panel into A
  // defender side (north)
  area(-12, -36, 12, -26, 0, 'slab');               // defender spawn: pier head
  area(-3, -26, 1, -24, 0, 'slab');                 // → market
  area(-9, -24, 7, -15.5, 0, 'tile');               // market hall
  area(-3, -15.5, 1, -14, -0.75, 'tile');           //   market → mid
  area(8.5, -22, 13.5, -15.5, 0, 'tarwood');        // tide office (glass window over mid)
  area(7, -21, 8.5, -19.5, 0, 'tarwood');           //   door from the market (1.5 × 2.4)
  area(-14, -32, -12, -28, 0, 'asphalt');           // → west road
  area(-42.5, -33, -14, -28, 0, 'asphalt');         // west road
  area(-42.5, -28, -38.5, -10.5, 0, 'slab');        // B back: defender choke (4 m)
  area(12, -32, 14, -28, 0, 'asphalt');             // → east road
  area(14, -33, 47, -28, 0, 'asphalt');             // east road
  area(43, -28, 47, -19, 0, 'slab');                // A back
  // hand-built walls (not mass): the office window wall
  const MANUAL = [[8.5, -15.5, 13.5, -14]];

  // ------------------------------------------------------------------ building mass
  const C = 0.5, NX = Math.round((X1 - X0) / C), NZ = Math.round((Z1 - Z0) / C);
  const open = new Uint8Array(NX * NZ);
  const mark = (r, v) => {
    for (let i = Math.round((r[0] - X0) / C); i < Math.round((r[2] - X0) / C); i++)
      for (let k = Math.round((r[1] - Z0) / C); k < Math.round((r[3] - Z0) / C); k++) if (i >= 0 && k >= 0 && i < NX && k < NZ) open[k * NX + i] = v;
  };
  for (const r of R) mark(r, 1);
  for (const r of MANUAL) mark(r, 2);
  for (let i = 0; i < NX; i++) for (const k of [0, NZ - 1]) open[k * NX + i] = 0;
  for (let k = 0; k < NZ; k++) for (const i of [0, NX - 1]) open[k * NX + i] = 0;
  // roof line varies by 8 m district; taller around the A gantry
  const hash = (a, b) => { const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); };
  const district = (x, z) => { const a = Math.floor(x / 8), b = Math.floor(z / 8); return { a, b, r: hash(a, b) }; };
  const heightAt = (x, z) => {
    if (x > 24 && z < -14) return 8.6;
    const { r } = district(x, z);
    return [6.6, 7.0, 7.4, 8.0][Math.floor(r * 4)];
  };
  const MASS_MATS = ['whitewash', 'whitewash', 'whitewash', 'brick', 'brick', 'rust', 'tarwood', 'whitewash'];
  const matAt = (x, z) => { const { a, b } = district(x, z); return MASS_MATS[Math.floor(hash(b + 7, a - 3) * MASS_MATS.length)]; };
  const used = new Uint8Array(NX * NZ);
  const key = (i, k) => { const x = X0 + (i + 0.5) * C, z = Z0 + (k + 0.5) * C; return heightAt(x, z) * 100 + MASS_MATS.indexOf(matAt(x, z)); };
  const massRects = [];
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
    const id = k * NX + i; if (open[id] || used[id]) continue;
    const kk = key(i, k);
    let w = 1; while (i + w < NX && !open[k * NX + i + w] && !used[k * NX + i + w] && key(i + w, k) === kk) w++;
    let h = 1;
    grow: while (k + h < NZ) { for (let j = 0; j < w; j++) { const c = (k + h) * NX + i + j; if (open[c] || used[c] || key(i + j, k + h) !== kk) break grow; } h++; }
    for (let a = 0; a < h; a++) for (let j = 0; j < w; j++) used[(k + a) * NX + i + j] = 1;
    const x0 = X0 + i * C, z0 = Z0 + k * C, x1 = x0 + w * C, z1 = z0 + h * C;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    massRects.push([x0, z0, x1, z1, heightAt(X0 + (i + 0.5) * C, Z0 + (k + 0.5) * C), matAt(X0 + (i + 0.5) * C, Z0 + (k + 0.5) * C), cx, cz]);
  }
  for (const [x0, z0, x1, z1, H, mat] of massRects) {
    B.box([x0, -0.45, z0], [x1, H, z1], mat);
    B.box([x0, -3, z0], [x1, -0.45, z1], mat);
    B.visual([x0 - 0.02, H, z0 - 0.02], [x1 + 0.02, H + 0.12, z1 + 0.02], mat === 'whitewash' ? 'trim' : 'roofsheet');
    B.collider([x0, H, z0], [x1, CEIL + 0.2, z1], 'invisible');
  }
  B.collider([X0 - 5, CEIL, Z0 - 5], [X1 + 5, 40, Z1 + 5], 'invisible');
  // floors
  for (const [x0, z0, x1, z1, y, mat] of R) B.box([x0, -3, z0], [x1, y, z1], mat);

  // ------------------------------------------------------------------ helpers
  const lintel = (x0, z0, x1, z1, top, H = 7) => B.box([x0, top, z0], [x1, H, z1], 'whitewash');
  const crate = (x, z, y, w, d, h, mat = 'crate') => B.box([x, y, z], [x + w, y + h, z + d], mat);
  const switches = [];
  function blastDoor(id, min, max, sw) {
    const box = B.collider(min, max, 'solid', 'bdoor'); box.off = true;    // doors start open (nav is built open)
    brk.push({ id, kind: 'door', min, max, hp: 500, switches: sw, boxes: [box] });
    for (const p of sw) switches.push(p);
  }
  function panel(id, min, max) {
    const box = B.collider(min, max, 'solid', 'bpanel');
    brk.push({ id, kind: 'panel', min, max, hp: 400, boxes: [box] });
  }
  function glass(id, min, max) {
    const box = B.collider(min, max, 'solid', 'bglass');
    brk.push({ id, kind: 'glass', min, max, hp: 1, boxes: [box] });
  }
  // wall-mounted switch plate (the switch mesh itself is made by the breakables module)
  function plate(p, face) { B.visual([p[0] - 0.25 + face[0] * 0.1, p[1] + 0.8, p[2] - 0.25 + face[1] * 0.1], [p[0] + 0.25 + face[0] * 0.1, p[1] + 1.7, p[2] + 0.25 + face[1] * 0.1], 'hazard'); }

  // ------------------------------------------------------------------ attacker spawn + lobbies
  crate(-9.5, 43.5, 0, 1.4, 1.4, 1.4); crate(-8.1, 43.8, 0, 1.0, 1.0, 1.05);
  crate(8.4, 43.5, 0, 1.4, 1.4, 1.4);
  B.box([-3, 0, 44.2], [3, 1.05, 45.4], 'pallet');                         // stacked salt sacks
  B.visual([-2.8, 1.05, 44.4], [2.8, 1.35, 45.2], 'sandbag');
  for (const x of [-6, 6]) { B.box([x - 0.15, 0, 37], [x + 0.15, 4.2, 37.3], 'steel'); B.visual([x - 0.6, 4.2, 36.9], [x + 0.6, 4.4, 37.6], 'lamp'); }
  // B lobby: carts, a skip and sack stacks
  crate(-20, 33, 0, 2.6, 1.4, 1.4, 'rust'); crate(-30, 37, 0, 1.4, 1.4, 1.05); crate(-28.6, 37.2, 0, 1.2, 1.2, 1.4);
  crate(-38, 26.5, 0, 3.0, 1.6, 1.4, 'contB'); crate(-24, 26.2, 0, 1.4, 1.4, 1.4);
  // B Main: narrow, with a couple of barrels to peek around
  B.box([-46.2, 0, 15], [-45.4, 1.05, 15.8], 'barrel'); B.box([-43.9, 0, 19], [-43.2, 1.05, 19.7], 'barrel');
  // A lobby
  crate(20, 30, 0, 2.8, 1.4, 1.4, 'contA'); crate(27, 40, 0, 1.4, 1.4, 1.05); crate(33, 27, 0, 1.6, 1.6, 1.4);
  crate(16, 42, 0, 1.4, 1.4, 1.4); B.box([24, 0, 34.5], [26.6, 1.05, 35.3], 'sandbag');
  // A Main: a skid half-way down
  crate(30.3, 14, 0, 1.2, 1.4, 1.05);

  // ------------------------------------------------------------------ mid courtyard
  // kiosk (one solid booth with an awning)
  B.box([3, -1, 6], [5.6, 2.2, 8.6], 'whitewash');
  B.visual([2.6, 2.2, 5.6], [6, 2.42, 9], 'canvasBlue');
  B.visual([2.94, 0.6, 6.5], [3.0, 1.6, 8.1], 'dark'); B.visual([2.9, 0.55, 6.4], [3.0, 0.65, 8.2], 'trim');
  // salt pile: 1.4 base with a 2.2 top
  B.box([-9, -1, -9.5], [-5, 0.65, -6.5], 'white');
  B.box([-8.2, 0.65, -8.8], [-5.8, 1.45, -7.2], 'white');
  // conveyor: crouch cover (1.05)
  B.box([4, -1, -9.4], [11, 0.3, -8.4], 'steel');
  for (let x = 4.3; x < 11; x += 0.7) B.visual([x, 0.3, -9.35], [x + 0.35, 0.36, -8.45], 'dark');
  // low wall + barrels on the south terraces
  B.box([-11, -1, 9], [-6.5, 0.75, 9.6], 'whitewash');
  B.box([7.5, 0, 15], [8.3, 1.05, 15.8], 'barrel'); B.box([8.4, 0, 15.3], [9.2, 1.05, 16.1], 'barrel');
  // lamps + bollards
  for (const [x, z, y] of [[-12.5, 18, 0], [12.5, 18, 0], [-12.5, -12.5, -0.75], [12.5, 0, -0.75]]) { B.box([x - 0.12, y, z - 0.12], [x + 0.12, y + 4.4, z + 0.12], 'steel'); B.visual([x - 0.4, y + 4.4, z - 0.4], [x + 0.4, y + 4.6, z + 0.4], 'lamp'); }
  // extra mid cover: a sack stack, a crate and pallets
  crate(-3, 13, -0.15, 1.4, 1.4, 1.4); crate(9, -3, -0.75, 1.4, 1.4, 1.05, 'pallet'); crate(-12.6, -1.2, -0.75, 1.2, 1.2, 1.4, 'crate');
    // cubby lip
  B.visual([-16, -0.15, 10.9], [-14, 0.05, 11.1], 'trim');

  // ------------------------------------------------------------------ site B (sunken boat slip, floor −1.2)
  const FB = -1.2;
  // steps down from B Main, from the closet and from B back
  for (const [x0, x1, zA, dir] of [[-46.5, -43, 4, -1], [-40, -37, 4, -1], [-42.5, -38.5, -10.5, 1]]) {
    for (let s = 0; s < 2; s++) {
      const za = zA + dir * s * 0.9, zb = zA + dir * (s + 1) * 0.9;
      B.box([x0, FB - 1, Math.min(za, zb)], [x1, -0.4 - s * 0.4, Math.max(za, zb)], 'slab');
    }
  }
  // boathouse: roofed shed on posts with a back wall, an upturned hull inside
  const BH = [-33, -9, -27, -2.5];
  B.box([BH[0], FB, BH[1]], [BH[2], FB + 2.6, BH[1] + 0.3], 'tarwood');              // back wall
  for (const [x, z] of [[BH[0], BH[3] - 0.3], [BH[2] - 0.3, BH[3] - 0.3], [BH[0], BH[1] + 0.3], [BH[2] - 0.3, BH[1] + 0.3]]) B.box([x, FB, z], [x + 0.3, FB + 3.4, z + 0.3], 'tarwood');
  B.box([BH[0] - 0.4, FB + 3.4, BH[1] - 0.2], [BH[2] + 0.4, FB + 3.65, BH[3] + 0.4], 'roofsheet');
  B.box([-31.6, FB, -6.6], [-28.4, FB + 1.05, -4.6], 'buoy');                      // hull (1.05)
  B.visual([-31.2, FB + 1.05, -6.2], [-28.8, FB + 1.15, -5.0], 'white');
  // low crates (1.05) and one 1.4 stack
  crate(-41, -1.2, FB, 1.4, 1.4, 1.05); crate(-37, -6, FB, 1.2, 1.2, 1.05); crate(-35, 0.8, FB, 1.4, 1.4, 1.4);
  crate(-44.8, -7.5, FB, 1.2, 1.2, 1.05, 'pallet');
  // mooring posts + nets + puddles
  for (const x of [-45, -39, -33]) B.box([x, FB, 2.8], [x + 0.35, FB + 1.3, 3.15], 'tarwood');
  B.visual([-46.4, FB, -10.4], [-43.4, FB + 2.2, -10.35], 'net');
  B.visual([-38, FB + 0.005, -3], [-34.5, FB + 0.012, -1], 'water'); B.visual([-43, FB + 0.005, -9], [-40.5, FB + 0.012, -7.5], 'water');
  // pump closet (panel side) — roof + lintels
  B.box([-43, 3.0, 6], [-36, 3.3, 13], 'roofsheet');
  lintel(-43, 8, -41.5, 11.5, 3.0); lintel(-40, 4, -37, 6, 3.0);
  panel('panelB', [-42.45, 0, 8], [-42.05, 3.0, 11.5]);
  crate(-37, 11.4, 0, 1.0, 1.0, 1.05, 'rust');
  // B Link room: roof, lintels, blast door into B
  B.box([-24, 2.9, -8], [-14, 3.2, -1], 'roofsheet');
  lintel(-24, -6, -22, -2.5, 2.25); lintel(-15.5, -6, -14, -2.5, 2.25);
  B.box([-21.8, -0.75, -1.6], [-19.6, 0.3, -1], 'pallet'); B.box([-17.2, -0.75, -7.8], [-16, 0.65, -6.6], 'crate');
  blastDoor('doorB', [-23.2, -0.75, -6], [-22.8, 2.25, -2.5], [[-21.6, -0.75, -7.3], [-24.4, FB, -7.0]]);
  plate([-21.6, -0.75, -7.75], [0, 0]); plate([-24.25, FB, -7.0], [0, 0]);

  // ------------------------------------------------------------------ site A (boiling house yard)
  // generator block (3.2 m) with pipes and an exhaust stack
  B.box([35, 0, -7], [38.5, 3.2, -4], 'steel');
  B.visual([35.2, 0.3, -4.02], [38.3, 0.55, -3.98], 'hazard');
  B.visual([38.5, 1.2, -6.4], [39.4, 1.6, -6.0], 'rust'); B.visual([39.1, 0, -6.4], [39.4, 1.6, -6.0], 'rust');
  B.box([36.2, 3.2, -6.2], [36.8, 5.2, -5.6], 'rust');
  // crates: 1.4 + 1.05
  crate(30.5, -2, 0, 1.4, 1.4, 1.4); crate(40, 0, 0, 1.2, 1.2, 1.05); crate(41.2, -0.2, 0, 1.2, 1.2, 1.4, 'pallet');
  crate(43, -9, 0, 2.6, 1.4, 1.4, 'contA');
  // salt boiling pans along the south wall (crouch cover)
  B.box([36, 0, 3.8], [44, 1.05, 5.6], 'rust');
  B.visual([36.2, 1.05, 4.0], [43.8, 1.08, 5.4], 'white');
  // north gantry (balcony) at 3.4 m: deck, landing, railings, posts, stairs from the east
  const GY = 3.4;
  B.box([26, GY - 0.2, -19], [40, GY, -16], 'tarwood');
  B.box([38, GY - 0.2, -16], [40, GY, -14.6], 'tarwood');
  B.box([26, GY, -16.12], [38, GY + 1.05, -16], 'steel');
  B.box([37.88, GY, -16], [38, GY + 1.05, -14.6], 'steel');
  B.box([38, GY, -14.72], [40, GY + 1.05, -14.6], 'steel');
  for (const x of [27, 32, 37]) B.box([x, 0, -16.2], [x + 0.3, GY - 0.2, -15.9], 'steel');
  B.box([39.7, 0, -14.9], [40, GY - 0.2, -14.6], 'steel');
  stairs(44.5, -16, 1.4, '-x', 9, 0.378, 0.5, 0, 'tarwood');
  B.box([44.5, 0, -14.6], [44.6, 1.05, -14.5], 'steel');
  // rafters overhead
  for (const z of [-12, -5, 2]) B.visual([26, 6.4, z], [48, 6.7, z + 0.3], 'truss');
  for (const x of [30, 37, 44]) B.visual([x, 6.7, -19], [x + 0.25, 6.9, 6], 'truss');
  // garden flank: catwalk from mid, beds, a tree, the blast door + a breakable panel into A
  const CW = 0.85;
  for (const [x0, x1, top] of [[14, 14.6, -0.35], [14.6, 15.2, 0.05], [15.2, 15.8, 0.45]]) B.box([x0, -3, -6], [x1, top, -2.5], 'steel');
  B.box([15.8, -3, -6], [21.5, CW, -2.5], 'steel');
  B.box([21.5, -3, -6], [22.1, 0.45, -2.5], 'steel');
  B.box([16.5, CW, -6], [21.5, CW + 1.05, -5.9], 'steel'); B.box([16.5, CW, -2.6], [21.5, CW + 1.05, -2.5], 'steel');
  B.box([17.5, 0, -15.5], [23, 1.05, -14], 'soil'); B.visual([17.6, 1.05, -15.4], [22.9, 1.35, -14.1], 'veg');
  B.box([18, 0, -11], [20.5, 1.4, -9], 'sandbag');
  K.tree([23.2, 0, -16.2], 3.4);
  lintel(24.5, -12, 26, -8.5, 3.0, 8.6); lintel(24.5, -4, 26, -0.5, 3.0, 8.6);
  blastDoor('doorA', [25.05, 0, -12], [25.45, 3.0, -8.5], [[24.0, 0, -12.6], [26.5, 0, -12.6]]);
  plate([24.15, 0, -12.6], [0, 0]); plate([26.35, 0, -12.6], [0, 0]);
  panel('panelA', [25.05, 0, -4], [25.45, 3.0, -0.5]);

  // ------------------------------------------------------------------ defender side
  // market hall: stalls (1.05), crates, roof with skylights
  B.box([-9, 4.0, -24], [7, 4.3, -15.5], 'roofsheet');
  B.visual([-6, 4.31, -22], [-2, 4.35, -18], 'skylight'); B.visual([1, 4.31, -22], [5, 4.35, -18], 'skylight');
  lintel(-3, -15.5, 1, -14, 3.0); lintel(7, -21, 8.5, -19.5, 2.4);
  B.box([-3, -0.75, -15.5], [1, -0.375, -14.8], 'tile');                         // step down to mid
  B.box([-8, 0, -22], [-5, 1.05, -21], 'tarwood'); B.box([3, 0, -22], [6, 1.05, -21], 'tarwood');
  B.box([-8, 0, -18.5], [-6.6, 1.4, -17.1], 'crate'); B.box([4.5, 0, -18], [5.7, 1.05, -16.8], 'crate');
  // tide office: roof, desk, and the glass window over mid
  B.box([7, 3.0, -22], [13.5, 3.3, -14], 'roofsheet');
  B.box([9, 0, -21.8], [12.5, 0.8, -20.8], 'tarwood');
  wall('x', -15.5, -14, 8.5, 13.5, -3, 7.0, [[9.2, 12.8, 0.9, 2.4]], 'whitewash', 'trim');
  glass('window', [9.2, 0.9, -14.9], [12.8, 2.4, -14.6]);
  // defender spawn: bollards, nets, a lighthouse beyond the pier
  crate(-9.5, -35, 0, 1.4, 1.4, 1.4); crate(8, -35, 0, 1.4, 1.4, 1.05);
  for (const x of [-10, -4, 4, 10]) B.box([x - 0.2, 0, -35.9], [x + 0.2, 0.7, -35.5], 'buoy');
  // roads: a couple of parked carts
  crate(-30, -32.6, 0, 3.0, 1.4, 1.4, 'rust'); crate(24, -32.6, 0, 3.0, 1.4, 1.4, 'contB');
  crate(-39.5, -20, 0, 1.2, 1.2, 1.05); crate(43.1, -26.6, 0, 1.4, 1.4, 1.4);

  // ------------------------------------------------------------------ skyline (visual only)
  B.visual([-4, 0, -60], [2, 22, -54], 'white'); B.visual([-4, 22, -60], [2, 25, -54], 'buoy');      // lighthouse
  B.visual([-3.4, 10, -60.1], [1.4, 13, -53.9], 'buoy');
  for (const [x, z, h] of [[-30, 52, 16], [36, -46, 18], [56, 10, 14], [-58, -14, 15]]) B.visual([x, 0, z], [x + 2.4, h, z + 2.4], 'brick');
  B.visual([-120, -1, -200], [120, -0.6, -40], 'water');

  const afkSpawns = K.afkBox(60);
  const { group, padRings } = K.finalize(scene, { leaf: '#5d9a3f' });

  // ------------------------------------------------------------------ spawns, flags, nav
  const atk = [[-6, 0, 42], [0, 0, 42.5], [6, 0, 42], [-3, 0, 38.5], [3, 0, 38.5], [-9, 0, 38.5], [9, 0, 38.5]];
  const def = [[-6, 0, -33], [0, 0, -33.5], [6, 0, -33], [-3, 0, -29], [3, 0, -29], [-9, 0, -29.5], [9, 0, -29.5]];
  const teamSpawns = { A: atk, B: def };
  const spawns = [...atk.slice(0, 4), ...def.slice(0, 4), [-35, 0, 30], [22, 0, 36], [-44.8, 0, 15], [32, 0, 15], [-40, FB, -3], [41, 0, -6],
    [-10, -0.75, -9], [10, -0.15, 13], [20, 0, -13], [-19, -0.75, -4.5], [-1, 0, -20], [45, 0, -24], [-40.5, 0, -20], [-25, 0, -30.5], [28, 0, -30.5]];
  const flags = { A: [0, 0, 40], B: [0, 0, -31] };

  const nav = buildNav(world, {
    half: {},
    centre: {
      // attacker spawn + lobbies
      s1: [-6, 0, 42], s2: [0, 0, 42], s3: [6, 0, 42], s4: [0, 0, 37.5], sw: [-9, 0, 38.2], se: [9, 0, 38.2], wd: [-12, 0, 38.2], ed: [12, 0, 38.2],
      bl1: [-17, 0, 38], bl2: [-24, 0, 32], bl3: [-33, 0, 29], bl4: [-40, 0, 32], bl5: [-44.8, 0, 26.5], bl6: [-18, 0, 27],
      bm1: [-44.8, 0, 19], bm_p: [-44.8, 0, 9.8], bm3: [-44.8, 0, 6.5],
      cl1: [-39.5, 0, 9.5], cl_d: [-38.5, 0, 5.2],
      al1: [25, 0, 30], al2: [17, 0, 37], al3: [31, 0, 36], al4: [36, 0, 30], am1: [32, 0, 9], am2: [32, 0, 17], am3: [32, 0, 23],
      // mid
      g: [0, 0, 33], mb1: [0, 0, 24], mb2: [0, 0, 28.5], ms: [0, 0, 17.5], ms1: [-8, -0.15, 12.5], ms2: [8, -0.15, 12.5], cb: [-15, -0.15, 12.5],
      k1: [0, -0.45, 6.5], k2: [9, -0.45, 6.5], mc2: [-6, -0.6, 3.5], mc: [0, -0.75, -2], mw: [-11, -0.75, -4.2], me: [11, -0.75, -4.2],
      mn: [-1, -0.75, -12], mnw: [-11, -0.75, -11], mne: [9, -0.75, -11.5],
      // B link + site B
      lk_m: [-14.7, -0.75, -4.2], lk1: [-18.7, -0.75, -4.5], lk_d: [-23, -0.75, -4.2],
      b_in: [-44.8, FB, 1.0], b1: [-42, FB, -3.5], b2: [-37, FB, -8.5], b3: [-36.5, FB, -2], b4: [-30, FB, 1.2], b5: [-26, FB, -8.5], b6: [-25.6, FB, 1.2],
      b_cl: [-38.5, FB, 1.5], b_bk: [-40.5, FB, -6.6], b_ld: [-25.4, FB, -4.2], b_bh: [-30, FB, -3.4],
      // B back + west road
      bb_t: [-40.5, 0, -11.6], bb1: [-40.5, 0, -18], bb2: [-40.5, 0, -24], wr_w: [-40.5, 0, -30.5], wr1: [-31, 0, -30.5], wr2: [-21, 0, -30.5], wr_d: [-13, 0, -30],
      // defender spawn, market, office
      d1: [-6, 0, -33], d2: [0, 0, -33], d3: [6, 0, -33], d4: [-8, 0, -28.5], d5: [8, 0, -28.5], d6: [-1, 0, -27.5], pa: [-1, 0, -25],
      m1: [-5, 0, -20.5], m2: [3, 0, -20.5], m3: [-1, 0, -16.8], m_off: [7.8, 0, -20.2], off1: [11, 0, -19.5], off2: [11, 0, -16.4],
      // east road + A back
      er_d: [13, 0, -30], er1: [22, 0, -30.5], er2: [32, 0, -30.5], er3: [40, 0, -30.5], er_e: [45, 0, -30.5], ab1: [45, 0, -24], ab2: [45, 0, -20],
      // garden flank
      cw0: [13.4, -0.75, -4.2], cw_t: [17.5, CW, -4.2], cw_e: [21, CW, -4.2], g_l: [22.8, 0, -4.2],
      g1: [24, 0, -14.6], g2: [23, 0, -11.5], g3: [23, 0, -7], g5: [17.5, 0, -12.5], g_d: [25.2, 0, -10.25],
      // site A
      a_dw: [27.5, 0, -10.25], a_pw: [27.5, 0, -2.25], a1: [31, 0, -12], a2: [33, 0, -4.5], a3: [41, 0, -10.5], a4: [40, 0, -2.6], a5: [35, 0, 2],
      a6: [32, 0, 4.5], a7: [46, 0, -17], a8: [34, 0, -14], a9: [46.5, 0, -6], gs_b: [45.3, 0, -15.3], st_t: [39, GY, -15.3], gt1: [35, GY, -17.5], gt2: [29, GY, -17.5],
    },
    links: [['bm3', 'b_in'], ['cl_d', 'b_cl'], ['bb_t', 'b_bk'], ['m3', 'mn'], ['cw0', 'cw_t'], ['g_l', 'cw_e'], ['gs_b', 'st_t'], ['lk_d', 'b_ld'],
      ['bm_p', 'cl1'], ['g_d', 'a_dw'], ['m_off', 'off1'], ['m2', 'm_off'], ['wd', 'bl1'], ['ed', 'al2']],
    oneWay: [['cw_e', 'g_l'], ['gt1', 'a8'], ['gt2', 'a1']],
    noAuto: ['st_', 'gt', 'cw_'],
  });
  // the gantry nodes still need to see each other
  const ix = nav.index, ln = (a, b) => { nav.nodes[ix[a]].links.push(ix[b]); nav.nodes[ix[b]].links.push(ix[a]); };
  ln('st_t', 'gt1'); ln('gt1', 'gt2'); ln('cw_t', 'cw_e');

  return {
    group, padRings, spawns, teamSpawns, flags, afkSpawns, nav, bounds: { minY: -15 }, breakables: brk,
    mmBounds: { minX: X0 + 0.5, maxX: X1 - 0.5, minZ: Z0 + 0.5, maxZ: Z1 - 0.5 },
    plant: {
      attack: atk, defend: def,
      sites: [
        { id: 'A', min: [29, -0.5, -13.5], max: [45, 4, 3], mark: [32.5, 0, -9.5] },
        { id: 'B', min: [-46, -1.8, -9.5], max: [-29, 2.5, 3], mark: [-40.5, FB, -2.5], floor: FB + 0.04 },
      ],
    },
    env: { ambient: 'motes', dust: '#e9e4d8', cloud: '#ffffff', top: '#4f8fd0', mid: '#b8d6ea', bot: '#eef3f5', fog: '#d4e3ea', hemiSky: '#eef6ff', hemiGround: '#a79f8c', sun: '#fff4e2', sunI: 2.5 },
    preview: { radius: 52, height: 30 },
  };
}
