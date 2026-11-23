// SUNSTONE — original desert market town built on the classic three-lane, figure-eight idea:
// a long open road, a mid street with an arch choke, and a covered bazaar, crossing at a
// central plaza, with short connectors near each base. Point-symmetric, so each team's lanes
// mirror the other's (an open half and a close-quarters half per lane).
import { createKit, buildNav, mirrorList, tp } from '../mapkit.js';

export const info = { id: 'sunstone', name: 'SUNSTONE', blurb: 'Three lanes through a desert market town.', size: 'LARGE', tags: ['3 LANES', 'BAZAAR', 'ROOFTOPS'] };

export function build(world, scene) {
  const K = createKit(world);
  const { B, wall, stairs } = K;

  function stall(x, z, cloth) {
    B.box([x - 1, 0, z - 0.5], [x + 1, 0.95, z + 0.5], 'wood');
    B.visual([x - 1.25, 2.3, z - 0.85], [x + 1.25, 2.4, z + 0.85], cloth);
    for (const sx of [-1.15, 1.05]) B.visual([x + sx, 0.95, z - 0.75], [x + sx + 0.1, 2.3, z - 0.65], 'wood');
  }
  function shutters(axis, t, a, b, y0, y1) {
    if (axis === 'x') { B.visual([a - 0.45, y0, t - 0.06], [a - 0.05, y1, t], 'blueTrim'); B.visual([b + 0.05, y0, t - 0.06], [b + 0.45, y1, t], 'blueTrim'); }
    else { B.visual([t - 0.06, y0, a - 0.45], [t, y1, a - 0.05], 'blueTrim'); B.visual([t - 0.06, y0, b + 0.05], [t, y1, b + 0.45], 'blueTrim'); }
  }

  // pennant string along x or z at height y (visual only)
  function bunting(axis, t, a, b, y, cols) {
    if (axis === 'x') B.visual([a, y - 0.03, t - 0.02], [b, y, t + 0.02], 'rope');
    else B.visual([t - 0.02, y - 0.03, a], [t + 0.02, y, b], 'rope');
    let i = 0;
    for (let s = a + 0.4; s < b - 0.3; s += 0.75, i++) {
      const m = cols[i % cols.length], sag = 0.12 * Math.sin(Math.PI * (s - a) / (b - a));
      if (axis === 'x') B.visual([s, y - 0.42 - sag, t - 0.015], [s + 0.32, y - 0.03 - sag, t + 0.015], m);
      else B.visual([t - 0.015, y - 0.42 - sag, s], [t + 0.015, y - 0.03 - sag, s + 0.32], m);
    }
  }
  // wooden frame around a doorway; `face` is the wall surface, `out` = +1/-1 normal direction
  function frame(axis, face, a, b, top, out) {
    const f0 = out > 0 ? face : face - 0.08, f1 = out > 0 ? face + 0.08 : face;
    if (axis === 'x') { B.visual([a - 0.16, 0, f0], [a, top + 0.16, f1], 'wood'); B.visual([b, 0, f0], [b + 0.16, top + 0.16, f1], 'wood'); B.visual([a - 0.16, top, f0], [b + 0.16, top + 0.16, f1], 'wood'); }
    else { B.visual([f0, 0, a - 0.16], [f1, top + 0.16, a], 'wood'); B.visual([f0, 0, b], [f1, top + 0.16, b + 0.16], 'wood'); B.visual([f0, top, a - 0.16], [f1, top + 0.16, b + 0.16], 'wood'); }
  }
  // protruding roof beams along a wall face
  function vigas(face, out, x0, x1, y) { for (let x = x0 + 0.5; x < x1 - 0.3; x += 1.4) B.visual([x, y, out > 0 ? face : face - 0.45], [x + 0.2, y + 0.2, out > 0 ? face + 0.45 : face], 'wood'); }
  function pots(x, z) {
    B.box([x, 0, z], [x + 0.55, 0.7, z + 0.55], 'terracotta');
    B.visual([x + 0.12, 0.7, z + 0.12], [x + 0.43, 0.85, z + 0.43], 'terracotta');
    B.box([x + 0.65, 0, z + 0.1], [x + 1.05, 0.5, z + 0.5], 'terracotta');
  }

  function side(rot, wallMat) {
    B.rot = rot;
    const team = rot === 0 ? 'stripeA' : 'stripeB';
    // ---------------- base (team spawn + flag) ----------------
    B.visual([-46, 0, -12], [-34.6, 0.02, 12], 'tile');
    wall('z', -34.6, -34, -12.6, 12.6, 0, 4.2, [[-2.5, 2.5, 0, 3.4]], 'sandstoneDark', null);
    B.visual([-34.8, 3.4, -2.9], [-33.8, 3.7, 2.9], 'sandstone');
    wall('x', 12, 12.6, -46, -34.6, 0, 4.2, [[-41, -37.5, 0, 3.4]], 'sandstoneDark', null);
    wall('x', -12.6, -12, -46, -34.6, 0, 4.2, [[-41, -37.5, 0, 3.4]], 'sandstoneDark', null);
    B.box([-46, 0, -9], [-44, 2.2, 9], 'sandstone');                       // rampart
    B.box([-44.15, 2.2, -9], [-44, 3.0, 6.3], 'sandstoneDark');            // rampart parapet
    stairs(-41.5, 6.5, 2.0, '-x', 5, 0.44, 0.5, 0, 'sandstone');
    B.visual([-39.6, 0, -0.6], [-38.4, 0.12, 0.6], wallMat === 'ochre' ? 'orange' : 'blueTrim'); // flag plinth
    B.box([-45.6, 0, 9.8], [-44.4, 1.2, 11.4], 'crate');
    B.box([-36.6, 0, 10.6], [-35.4, 1.0, 11.6], 'crate');
    B.visual([-37.4, 3.0, 8.4], [-34.8, 3.1, 12], 'canvasRed');
    K.palm([-45.2, 0, -11]);

    // ---------------- north lane: long open road ----------------
    B.box([-30, 0, 17], [-27, 1.1, 17.6], 'sandstone');
    B.box([-22.6, 0, 19.4], [-21.4, 1.2, 20.6], 'crate'); B.box([-22.4, 1.2, 19.6], [-21.6, 2.0, 20.4], 'crate');
    B.box([-14, 0.3, 14], [-11, 1.3, 15.6], 'wood');                       // cart
    for (const x of [-13.6, -11.6]) B.visual([x, 0, 13.8], [x + 0.2, 0.7, 15.8], 'dark');
    B.collider([-14, 0, 14.2], [-11, 0.3, 15.4]);
    B.box([-6.6, 0, 22], [-5.8, 1.1, 22.8], 'terracotta'); B.box([-5.6, 0, 22.4], [-4.8, 1.1, 23.2], 'terracotta');
    // lookout platform with stairs from the east
    B.box([-20, 0, 21.6], [-15, 2.6, 25.4], 'sandstone');
    B.box([-20, 2.6, 21.6], [-15, 3.4, 21.85], 'sandstoneDark');
    stairs(-12, 22.2, 1.6, '-x', 6, 0.433, 0.5, 0, 'sandstone');
    B.visual([-20.2, 4.6, 21.4], [-14.8, 4.7, 25.4], 'canvasBlue');
    for (const x of [-20.1, -15.1]) B.visual([x, 2.6, 21.6], [x + 0.2, 4.6, 21.8], 'wood');
    K.palm([-44, 0, 22]);
    B.box([-45, 0, 15], [-43.6, 1.0, 16.4], 'crate');

    // ---------------- north block: NB1 house + NB2 tower, bridged ----------------
    const H1 = 3.6;
    wall('x', 5.5, 5.9, -32, -23, 0, H1, [[-29, -27.6, 0, 2.5], [-26, -24.5, 1.0, 2.2]], wallMat);
    wall('x', 11.6, 12, -32, -23, 0, H1, [[-26, -24.6, 0, 2.5], [-31, -29.5, 1.0, 2.2]], wallMat);
    wall('z', -32, -31.6, 5.9, 11.6, 0, H1, [], wallMat);
    wall('z', -23.4, -23, 5.9, 11.6, 0, H1, [[8, 9.4, 1.0, 2.2]], wallMat);
    shutters('x', 5.5, -26, -24.5, 1.0, 2.2);
    B.box([-32, H1, 5.5], [-23, H1 + 0.2, 12], 'sandstone');
    const R1 = H1 + 0.2;
    B.box([-32, R1, 5.5], [-23, R1 + 0.5, 5.8], 'sandstoneDark');
    B.box([-27.8, R1, 11.7], [-23, R1 + 0.5, 12], 'sandstoneDark');
    B.box([-32, R1, 5.8], [-31.7, R1 + 0.5, 11.7], 'sandstoneDark');
    B.box([-23.3, R1, 5.8], [-23, R1 + 0.5, 8.0], 'sandstoneDark'); B.box([-23.3, R1, 9.4], [-23, R1 + 0.5, 11.7], 'sandstoneDark');
    stairs(-32, 12, 1.2, '+x', 9, 0.42, 0.45, 0, 'sandstone');            // outside stairs to the roof
    B.box([-31.4, 0, 6.3], [-30.2, 1.1, 7.5], 'crate');
    B.box([-23, 3.6, 8.0], [-20, 3.8, 9.4], 'wood');                       // plank bridge over the alley
    // NB2: two storeys
    const H2 = 6.8;
    wall('x', 5.5, 5.9, -20, -8, 0, H2, [[-12, -10.6, 0, 2.5], [-18.5, -16.5, 1.0, 2.4], [-18, -16, 4.6, 6.0], [-14, -12, 4.6, 6.0]], 'ochre');
    wall('x', 11.6, 12, -20, -8, 0, H2, [[-17, -15, 1.0, 2.4], [-16.5, -14.5, 4.6, 6.0], [-11, -9, 4.6, 6.0]], 'ochre');
    wall('z', -20, -19.6, 5.9, 11.6, 0, H2, [[7.4, 8.8, 0, 2.5], [8, 9.4, 3.6, 5.8]], 'ochre');
    wall('z', -8.4, -8, 5.9, 11.6, 0, H2, [[7, 9, 1.0, 2.4]], 'ochre');
    shutters('x', 5.5, -18.5, -16.5, 1.0, 2.4); shutters('x', 5.5, -14, -12, 4.6, 6.0);
    stairs(-9.8, 6, 1.4, '+z', 9, 0.4, 0.5, 0, 'wood');
    B.box([-19.6, 3.4, 5.9], [-9.8, 3.6, 11.6], 'wood');
    B.box([-9.8, 3.4, 10.5], [-8.4, 3.6, 11.6], 'wood');
    B.box([-10.0, 3.6, 5.9], [-9.85, 4.6, 10.2], 'trim');
    B.box([-20, H2, 5.5], [-8, H2 + 0.2, 12], 'sandstone');
    B.visual([-13, 2.8, 4.3], [-9.6, 2.9, 5.5], 'canvasRed');
    B.box([-18.8, 0, 10.2], [-17.6, 1.1, 11.4], 'crate'); B.box([-15, 3.6, 10.4], [-13.8, 4.5, 11.4], 'crate');

    // ---------------- mid street with an arch choke ----------------
    B.visual([-34, 0, -5.5], [-8, 0.02, 5.5], 'tile');
    wall('z', -21, -20.4, -5.5, 5.5, 0, 4.4, [[-2, 2, 0, 3.4]], 'sandstone', null);
    B.visual([-21.2, 3.4, -2.3], [-20.2, 3.7, 2.3], 'sandstoneDark');
    B.box([-30.6, 0, -3.8], [-29.4, 1.2, -2.6], 'crate');
    B.box([-15.6, 0, 2.4], [-14.4, 1.2, 3.6], 'crate'); B.box([-15.4, 1.2, 2.6], [-14.6, 1.9, 3.4], 'crate');
    B.box([-12.5, 0, -3.4], [-10.5, 1.2, -1.8], 'wood');

    // ---------------- south block: SB1 + SB2 hall ----------------
    wall('x', -5.9, -5.5, -32, -25, 0, 3.6, [[-30, -28.6, 0, 2.5]], 'terracotta');
    wall('x', -12, -11.6, -32, -25, 0, 3.6, [[-28, -26.6, 0, 2.5]], 'terracotta');
    wall('z', -32, -31.6, -11.6, -5.9, 0, 3.6, [[-9.5, -8, 1.0, 2.2]], 'terracotta');
    wall('z', -25.4, -25, -11.6, -5.9, 0, 3.6, [], 'terracotta');
    B.box([-32, 3.6, -12], [-25, 3.8, -5.5], 'sandstone');
    B.box([-29.6, 0, -11], [-28.4, 1.1, -9.8], 'crate');
    wall('x', -5.9, -5.5, -22, -8, 0, 4.4, [[-15, -13.6, 0, 2.6], [-20, -18, 1.2, 2.4], [-11, -9, 1.2, 2.4]], wallMat);
    wall('x', -12, -11.6, -22, -8, 0, 4.4, [[-11, -9.6, 0, 2.6], [-19.5, -17.5, 1.2, 2.4]], wallMat);
    wall('z', -22, -21.6, -11.6, -5.9, 0, 4.4, [[-9.6, -8.2, 0, 2.5]], wallMat);
    wall('z', -8.4, -8, -11.6, -5.9, 0, 4.4, [[-9.4, -7.4, 1.0, 2.4]], wallMat);
    shutters('x', -5.5 + 0.06, -20, -18, 1.2, 2.4);
    B.box([-22, 4.4, -12], [-8, 4.6, -5.5], 'sandstone');
    B.box([-17.25, 0, -9], [-16.75, 4.4, -8.5], 'sandstoneDark'); B.box([-12.25, 0, -9], [-11.75, 4.4, -8.5], 'sandstoneDark');
    B.box([-20.8, 0, -7.2], [-19.6, 1.1, -6.2], 'crate');

    // ---------------- south lane: covered bazaar ----------------
    B.box([-30, 4.0, -22], [-6, 4.25, -14], 'sandstone');
    for (const x of [-30, -24, -18, -12, -6]) for (const z of [-14, -22]) B.box([x - 0.25, 0, z - 0.25], [x + 0.25, 4.0, z + 0.25], 'sandstoneDark');
    stall(-26, -18.2, 'canvasRed'); stall(-20, -16.2, 'canvasBlue'); stall(-14, -19.6, 'canvasRed'); stall(-9, -17.4, 'canvasBlue');
    B.visual([-24, 0, -20.5], [-21, 0.03, -18.5], 'terracotta');
    for (const x of [-27, -21, -15, -9]) B.visual([x - 0.15, 3.3, -18.15], [x + 0.15, 3.7, -17.85], 'lamp');
    B.box([-28, 0, -24.6], [-27.2, 0.9, -23.8], 'terracotta'); B.box([-16, 0, -24.8], [-15, 1.0, -23.8], 'crate');
    // south-west ruins pocket
    B.box([-44, 0, -20], [-40, 2.2, -19.4], 'sandstoneDark');
    B.box([-38, 0, -24], [-37.4, 1.6, -21], 'sandstoneDark');
    K.palm([-43, 0, -23.5]);

    // ---------------- dressing: bunting, door frames, beams, lamps, goods, roof clutter ----------------
    bunting('z', -26, -5.5, 5.5, 4.1, ['canvasRed', 'orange', 'canvasBlue', 'cream']);
    bunting('z', -14, -5.5, 5.5, 4.3, [team, 'cream', 'orange']);
    bunting('x', -14.1, -29.7, -6.3, 3.75, ['canvasBlue', 'cream', 'canvasRed']);
    bunting('x', 7, -8, 8, 4.15, ['orange', team, 'cream', 'canvasBlue']);
    for (let x = -7.2; x < 8; x += 2.4) B.visual([x - 0.1, 3.75, 6.9], [x + 0.1, 3.95, 7.1], 'lamp');
    frame('x', 5.5, -12, -10.6, 2.5, -1); frame('x', 5.5, -29, -27.6, 2.5, -1);
    frame('x', -5.5, -30, -28.6, 2.5, 1); frame('x', -5.5, -15, -13.6, 2.6, 1);
    frame('z', -34, -2.5, 2.5, 3.4, 1);
    vigas(5.5, -1, -32, -23, 3.15); vigas(5.5, -1, -20, -8, 6.35); vigas(5.5, -1, -20, -8, 3.2);
    vigas(-5.5, 1, -32, -25, 3.15); vigas(-5.5, 1, -22, -8, 3.95);
    for (const [x, z] of [[-30.2, 5.4], [-12.8, 5.4], [-26.4, -5.4], [-15.9, -5.4]]) B.visual([x, 2.6, z - 0.1], [x + 0.25, 3.0, z + 0.1], 'lamp');
    B.visual([-34.66, 0.9, 4.2], [-34.6, 3.1, 6.4], 'canvasBlue'); B.visual([-34.66, 0.9, -6.4], [-34.6, 3.1, -4.2], 'canvasRed');
    B.visual([-34.68, 1.3, 4.6], [-34.64, 2.7, 6.0], 'cream');
    // market goods on the stalls and along the walls
    for (const [x, z] of [[-26, -18.2], [-20, -16.2], [-14, -19.6], [-9, -17.4]]) {
      B.visual([x - 0.85, 0.95, z - 0.4], [x - 0.25, 1.2, z + 0.4], 'orange');
      B.visual([x - 0.15, 0.95, z - 0.4], [x + 0.35, 1.15, z + 0.4], 'veg');
      B.visual([x + 0.45, 0.95, z - 0.35], [x + 0.85, 1.35, z + 0.05], 'terracotta');
    }
    pots(-29.4, -25.6); pots(-12.6, -25.6); pots(-44.9, 12.2); pots(-21.3, 25.0);
    B.box([-7.4, 0, 24.6], [-6.2, 0.6, 25.6], 'wood'); B.visual([-7.3, 0.6, 24.7], [-6.3, 0.85, 25.5], 'veg');
    // roof clutter
    B.box([-31.4, R1, 6.2], [-30.2, R1 + 1.5, 7.4], 'steel'); B.visual([-31.5, R1 + 1.5, 6.1], [-30.1, R1 + 1.6, 7.5], 'dark');
    for (const x of [-31.5, -28.9]) B.visual([x, R1, 10.75], [x + 0.08, R1 + 1.7, 10.85], 'wood');
    B.visual([-31.5, R1 + 1.62, 10.77], [-28.82, R1 + 1.65, 10.83], 'rope');
    B.visual([-31.1, R1 + 0.7, 10.78], [-30.2, R1 + 1.62, 10.82], 'cloth'); B.visual([-29.9, R1 + 0.85, 10.78], [-29.2, R1 + 1.62, 10.82], team);
    B.visual([-19, H2 + 0.2, 6.4], [-17.6, H2 + 1.6, 7.8], 'steel'); B.visual([-12, H2 + 0.2, 10], [-10.4, H2 + 0.7, 11.2], 'metal');
    B.visual([-31, 3.8, -11], [-29.6, 5.1, -9.6], 'steel'); B.visual([-27.6, 3.8, -7.4], [-26.4, 4.3, -6.6], 'metal');
    B.visual([-20.5, 4.6, -11], [-18.5, 5.2, -9.8], 'metal'); B.visual([-11, 4.6, -7.4], [-9.6, 5.9, -6.0], 'steel');
    B.visual([-29.5, 4.25, -21.5], [-27.5, 4.7, -20.3], 'crate'); B.visual([-12.5, 4.25, -15.6], [-11.2, 4.9, -14.6], 'crate');
  }

  B.rot = 0;
  B.box([-50, -1, -30], [50, 0, 30], 'sand');
  K.perimeter(46, 26, 30, 'sandstoneDark', 6);
  side(0, 'plaster');
  side(2, 'ochre');

  // ---------------- centre plaza (shared, symmetric) ----------------
  B.rot = 0;
  B.visual([-8, 0, -12], [8, 0.02, 12], 'tile');
  B.box([-1.3, 0, -1.3], [1.3, 1.0, 1.3], 'sandstoneDark');
  B.visual([-1.0, 1.0, -1.0], [1.0, 1.02, 1.0], 'water');
  B.box([-1.3, 1.0, -0.15], [-1.1, 2.6, 0.15], 'wood'); B.box([1.1, 1.0, -0.15], [1.3, 2.6, 0.15], 'wood');
  B.visual([-1.3, 2.6, -0.15], [1.3, 2.8, 0.15], 'wood');
  for (const [x, z] of [[5, 4], [-5, 4], [5, -4], [-5, -4]]) { B.box([x - 0.8, 0, z - 0.8], [x + 0.8, 0.8, z + 0.8], 'terracotta'); K.palm([x, 0.8, z], 4.6); }
  for (const s of [1, -1]) {
    const [z0, z1] = s > 0 ? [7.5, 10.5] : [-10.5, -7.5];
    B.box([-3.5, 0, z0], [3.5, 1.0, z1], 'sandstone');
    const [sa, sb] = s > 0 ? [6.7, 7.5] : [-7.5, -6.7];
    B.box([-3.5, 0, sa], [3.5, 0.5, sb], 'sandstone');
  }
  B.box([-2, 0, 18], [2, 1.1, 18.6], 'sandstone'); B.box([-2, 0, -18.6], [2, 1.1, -18], 'sandstone');

  // perimeter cap + buttresses, desert town and dunes beyond the walls
  for (const sz of [-1, 1]) {
    B.visual([-46.6, 6, sz > 0 ? 25.85 : -26.45], [46.6, 6.3, sz > 0 ? 26.45 : -25.85], 'sandstone');
    for (const x of [-40, -32, -24, -8, 8, 24, 32, 40]) B.box([x - 0.45, 0, sz > 0 ? 25.55 : -26], [x + 0.45, 5.4, sz > 0 ? 26 : -25.55], 'sandstone');
  }
  for (const sx of [-1, 1]) B.visual([sx > 0 ? 45.85 : -46.45, 6, -26.4], [sx > 0 ? 46.45 : -45.85, 6.3, 26.4], 'sandstone');
  K.scenery({ ix: 47, iz: 27, ground: 'sand', bodies: ['sandstone', 'plaster', 'ochre', 'sandstoneDark'], roof: 'sandstoneDark', window: 'dark', trees: false, palmsToo: true, flatRoof: true, tall: true, domes: true, hillsAt: 120, seed: 23 });

  const afkSpawns = K.afkBox(60);
  const { group, padRings } = K.finalize(scene, { leaf: '#5d9a3f', hill: '#d9b77e', dome: '#e8d7b5' });

  const spawns = mirrorList([
    [-38, 0, -6], [-38, 0, 6], [-28.5, 0, 8.7], [-14, 3.6, 8.5], [-30, 0, 20], [-17.5, 2.6, 23.5],
    [-28.5, 0, -8.7], [-15, 0, -10], [-24, 0, -18], [-41, 0, -17],
  ]);
  const teamA = [[-40, 0, -8], [-40, 0, 8], [-37, 0, -5], [-37, 0, 5], [-43, 0, -4], [-43, 0, 4], [-45, 2.2, 0], [-36, 0, -10]];
  const teamSpawns = { A: teamA, B: teamA.map(p => tp(2, p)) };
  const flags = { A: [-39, 0, 0], B: [39, 0, 0] };

  const nav = buildNav(world, {
    half: {
      a_b1: [-40, 0, -6], a_b2: [-40, 0, 6], a_b3: [-36, 0, 0], a_flag: [-38.5, 0, 2.5], a_gate_out: [-32.8, 0, 0],
      a_ng_in: [-39.2, 0, 10.4], a_ng_out: [-39.2, 0, 14.5], a_sg_in: [-39.2, 0, -10.4], a_sg_out: [-39.2, 0, -14.5],
      a_ramp_b: [-40.6, 0, 7.5], a_ramp_t: [-44.8, 2.2, 7.5], a_ramp_m: [-45, 2.2, 0],
      a_n1: [-44, 0, 18.5], a_n2: [-33, 0, 15], a_n3: [-26, 0, 15.8], a_n4: [-25, 0, 22.5], a_n5: [-17, 0, 18], a_n6: [-9, 0, 18],
      a_n7: [-3.5, 0, 23.5], a_n8: [-3, 0, 14.5], a_look_b: [-11.2, 0, 23], a_look_m: [-13.6, 1.3, 23], a_look_t: [-17.5, 2.6, 23.5],
      a_cw_n: [-33, 0, 8], a_cw_s: [-33, 0, -8],
      a_nb1_s_out: [-28.3, 0, 4.3], a_nb1_in: [-27.3, 0, 8.7], a_nb1_n_out: [-25.3, 0, 13.8],
      a_nb1_stb: [-33, 0, 12.6], a_nb1_stm: [-30.2, 1.68, 12.6], a_nb1_roof: [-27, 3.8, 9], a_nb1_roof_e: [-24, 3.8, 8.7],
      a_bridge: [-21.5, 3.8, 8.7], a_nb2_up_w: [-18.6, 3.6, 8.7], a_nb2_up: [-14, 3.6, 8.5], a_nb2_up_e: [-11.5, 3.6, 10.8],
      a_nb2_st_t: [-9.1, 3.6, 11.05], a_nb2_st_m: [-9.1, 2.0, 8.25], a_nb2_st_b: [-11, 0, 6.6],
      a_al1_s: [-21.5, 0, 4.2], a_al1_m: [-21.5, 0, 8.7], a_al1_n: [-21.5, 0, 13.5],
      a_nb2_door_out: [-11.3, 0, 4.2], a_nb2_in: [-14, 0, 8.5], a_nb2_w_in: [-18.8, 0, 8.1],
      a_m1: [-30, 0, 1], a_m2: [-24, 0, 0], a_m3: [-17, 0, 0], a_m4: [-12, 0, 0.5], a_m5: [-9.5, 0, -3.2],
      a_sb1_n_out: [-29.3, 0, -4.3], a_sb1_in: [-28.5, 0, -8.7], a_sb1_s_out: [-27.3, 0, -13],
      a_al2_n: [-23.5, 0, -4.3], a_al2_m: [-23.5, 0, -8.9], a_al2_s: [-23.5, 0, -13],
      a_sb2_n_out: [-14.3, 0, -4.3], a_sb2_in: [-14.5, 0, -10.2], a_sb2_s_out: [-10.3, 0, -13], a_sb2_w_in: [-20.8, 0, -8.9],
      a_s1: [-36, 0, -16.5], a_s2: [-30.5, 0, -17], a_s3: [-27, 0, -15], a_s4: [-23, 0, -19.5], a_s5: [-17, 0, -18],
      a_s6: [-11, 0, -15.5], a_s7: [-6, 0, -19], a_s8: [-3, 0, -15], a_s9: [-20, 0, -23.5], a_s10: [-8, 0, -23.5],
      a_r1: [-41, 0, -22.5], a_r2: [-44, 0, -16],
    },
    centre: { c_n: [0, 0, 3.4], c_s: [0, 0, -3.4], c_w: [-3.2, 0, 0], c_e: [3.2, 0, 0], c_nn: [0, 0, 14], c_ss: [0, 0, -14],
      c_stg_n: [0, 1.0, 9], c_stg_s: [0, 1.0, -9], c_nw: [-6.5, 0, 9], c_se: [6.5, 0, -9] },
    links: [['a_ramp_b', 'a_ramp_t'], ['a_ramp_t', 'a_ramp_m'], ['a_look_b', 'a_look_m'], ['a_look_m', 'a_look_t'],
      ['a_nb1_stb', 'a_nb1_stm'], ['a_nb1_stm', 'a_nb1_roof'], ['a_nb1_roof', 'a_nb1_roof_e'], ['a_nb1_roof_e', 'a_bridge'], ['a_bridge', 'a_nb2_up_w'],
      ['a_nb2_st_b', 'a_nb2_st_m'], ['a_nb2_st_m', 'a_nb2_st_t'], ['a_nb2_st_t', 'a_nb2_up_e'],
      ['c_stg_n', 'c_n'], ['c_stg_s', 'c_s']],
    noAuto: ['stg'],
  });

  return {
    group, padRings, spawns, teamSpawns, flags, afkSpawns, nav, bounds: { minY: -15 },
    env: { top: '#3f86d8', mid: '#bcd8ec', bot: '#f2e2c2', fog: '#eadcbd', hemiSky: '#fff1da', hemiGround: '#b08a55', sun: '#ffe7c0', sunI: 2.7 },
    preview: { radius: 56, height: 26 },
  };
}
