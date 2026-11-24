// MAPLE COURT — compact two-houses-across-a-street arena (original geometry).
// Flow: two 2-storey houses face each other across a street; two hollow box trucks parked at an
// angle break the door-to-door sightline and leave a tight alley between them; the west lane runs
// past the garage and bus stop, the east lane through the side yard; fenced backyards hold the spawns.
import { createKit, buildNav, mirrorList, tp } from '../mapkit.js';

const F1 = 0.15, F2 = 3.35, ROOF = 6.5;

export const info = { id: 'maple', name: 'MAPLE COURT', blurb: 'Two houses, one street. Fast and close.', size: 'SMALL', tags: ['2 HOUSES', 'ROOFTOPS', 'TRAMPOLINES'] };

export function build(world, scene) {
  const K = createKit(world);
  const { B, wall, stairs } = K;

  function side(rot, siding, carMat) {
    B.rot = rot;
    const shutter = rot === 0 ? 'shutterA' : 'shutterB', stripe = rot === 0 ? 'stripeA' : 'stripeB';
    const X0 = -6, X1 = 6, Z0 = -20, Z1 = -11, W = 0.3;
    // ---- house
    B.box([X0 + W, 0, Z0 + W], [X1 - W, F1, Z1 - W], 'wood');
    wall('x', Z1 - W, Z1, X0, X1, 0, ROOF - 0.2, [
      [-0.7, 0.7, F1, 2.45], [-5.2, -2.8, 0.95, 2.85], [2.8, 5.2, 0.95, 2.85],
      [-4.8, -2.8, 4.25, 5.9], [-1, 1, 4.25, 5.9], [2.8, 4.8, 4.25, 5.9],
    ], siding);
    wall('x', Z0, Z0 + W, X0, X1, 0, ROOF - 0.2, [
      [2.8, 4.2, F1, 2.45], [-4.8, -2.4, 0.95, 2.85], [-4.8, -2.8, 4.25, 5.9], [1, 3, 4.25, 5.9],
    ], siding);
    wall('z', X0, X0 + W, Z0 + W, Z1 - W, 0, ROOF - 0.2, [[-15.6, -14.2, F1, 2.45], [-17, -15, 4.25, 5.9]], siding);
    wall('z', X1 - W, X1, Z0 + W, Z1 - W, 0, ROOF - 0.2, [[-16.7, -14.3, 0.95, 2.85], [-15.5, -13.5, 4.25, 5.9]], siding);
    // stairs along the back wall, rising east, + upstairs floor with a stairwell
    // (1.3 m of floor in front of the bottom step so you can walk straight on)
    stairs(-4.4, Z0 + W, 1.4, '+x', 10, 0.32, 0.45, F1, 'wood');
    B.box([0.1, F2 - 0.2, Z0 + W], [X1 - W, F2, Z1 - W], 'wood');
    B.box([X0 + W, F2 - 0.2, -18.2], [0.1, F2, Z1 - W], 'wood');
    B.box([X0 + W, F2, -18.25], [-0.5, F2 + 1.0, -18.12], 'trim');
    wall('z', 1.9, 2.1, Z0 + W, Z1 - W, F1, F2 - 0.2, [[-16.2, -14.6, F1, 2.45]], 'interior', null);
    wall('x', -15.6, -15.4, 0.5, X1 - W, F2, ROOF - 0.2, [[2.2, 3.6, F2, F2 + 2.3]], 'interior', null);
    B.box([3, F1, -19.6], [5.6, F1 + 1.0, -18.7], 'wood');            // kitchen counter
    B.box([-4.5, F1, -13.3], [-2.3, F1 + 0.8, -12.5], 'carBlue');     // couch
    B.box([-1.6, F1, -16.2], [0.4, F1 + 0.85, -15.0], 'wood');        // dining table
    B.box([3.5, F2, -14.6], [5.7, F2 + 0.7, -12.2], 'white');         // bed
    B.box([-5.6, F2, -15.2], [-4.6, F2 + 1.6, -13], 'wood');          // wardrobe
    // roof
    B.box([X0, ROOF - 0.2, Z0], [X1, ROOF, Z1], 'roof');
    B.box([X0, ROOF, Z0], [X1, ROOF + 0.6, Z0 + 0.3], 'trim');
    B.box([X0, ROOF, Z1 - 0.3], [X1, ROOF + 0.6, Z1], 'trim');
    B.box([X0, ROOF, Z0 + 0.3], [X0 + 0.3, ROOF + 0.6, Z1 - 0.3], 'trim');
    B.box([X1 - 0.3, ROOF, Z0 + 0.3], [X1, ROOF + 0.6, Z1 - 0.3], 'trim');
    B.box([3.5, ROOF, -17.5], [4.5, ROOF + 1.6, -16.5], 'brick');      // chimney
    B.box([-3.5, ROOF, -17], [-2, ROOF + 1.0, -15.5], 'metal');        // AC unit
    B.visual([4.3, ROOF, -12.4], [4.42, ROOF + 0.9, -12.28], 'steel');  // satellite dish
    B.visual([3.9, ROOF + 0.75, -12.75], [4.8, ROOF + 1.45, -12.62], 'white');
    B.visual([-0.5, ROOF, -18.6], [-0.3, ROOF + 0.7, -18.4], 'dark'); B.visual([1.4, ROOF, -18.8], [1.6, ROOF + 0.5, -18.6], 'dark');
    // shutters beside the street-facing windows, downpipes, open front door, porch light, house number
    for (const [a, b, y0, y1] of [[-5.2, -2.8, 0.95, 2.85], [2.8, 5.2, 0.95, 2.85], [-4.8, -2.8, 4.25, 5.9], [-1, 1, 4.25, 5.9], [2.8, 4.8, 4.25, 5.9]]) {
      B.visual([a - 0.55, y0, Z1], [a - 0.1, y1, Z1 + 0.07], shutter);
      B.visual([b + 0.1, y0, Z1], [b + 0.55, y1, Z1 + 0.07], shutter);
    }
    for (const x of [X0 - 0.12, X1 - 0.03]) B.visual([x, 0, Z1 - 0.05], [x + 0.15, ROOF, Z1 + 0.1], 'white');
    B.visual([0.62, F1, -12.7], [0.7, 2.4, -11.3], 'wood');
    B.visual([-1.2, 2.0, Z1], [-0.95, 2.3, Z1 + 0.1], 'lamp');
    B.visual([0.95, 2.05, Z1], [1.5, 2.3, Z1 + 0.04], rot === 0 ? 'white' : 'cream');
    B.visual([X1, 0.6, -17], [X1 + 0.8, 1.5, -16], 'steel'); B.collider([X1, 0, -17], [X1 + 0.8, 0.9, -16]);   // AC box in the side yard
    // porch, steps, flower beds, walkway, mailbox
    B.box([-2.4, 0, Z1], [2.4, F1, -9.4], 'wood');
    B.visual([-2.6, 2.6, Z1], [2.6, 2.75, -9.2], 'trim');
    B.box([-2.45, 0, -9.6], [-2.2, 2.6, -9.35], 'trim'); B.box([2.2, 0, -9.6], [2.45, 2.6, -9.35], 'trim');
    B.box([-5.6, 0, -10.95], [-2.8, 0.35, -10.25], 'flowers'); B.box([2.8, 0, -10.95], [5.6, 0.35, -10.25], 'flowers');
    B.visual([-0.9, 0, -9.4], [0.9, 0.02, -6.5], 'concrete');
    B.box([2.0, 0, -7.1], [2.12, 1.1, -6.98], 'trim');
    B.box([1.85, 1.1, -7.25], [2.3, 1.4, -6.85], 'blueTrim');
    // backyard trampoline -> roof
    K.pad([-0.9, 0, -24.1], [0.9, 0.35, -22.3], [0, 17.4, 3.4]);
    B.visual([-1.1, 0, -24.3], [1.1, 0.3, -24.1], 'dark'); B.visual([-1.1, 0, -22.3], [1.1, 0.3, -22.1], 'dark');
    // patio
    B.box([3, 0, -24.5], [4.6, 0.85, -23.3], 'wood');
    B.box([-4.5, 0, -24], [-3.8, 1.0, -23.3], 'dark');

    // ---- garage (west of the house) with hoop
    wall('x', -12.3, -12, -17, -10, 0, 3.2, [[-16.3, -10.7, 0, 2.8]], 'brick');
    wall('x', -20, -19.7, -17, -10, 0, 3.2, [[-14.2, -12.8, 0, 2.3]], 'brick');
    wall('z', -17, -16.7, -19.7, -12.3, 0, 3.2, [[-17, -14.5, 1.1, 2.2]], 'brick');
    wall('z', -10.3, -10, -19.7, -12.3, 0, 3.2, [[-16.6, -15.2, 0, 2.3]], 'brick');
    B.box([-17, 3.2, -20], [-10, 3.4, -12], 'roof');
    B.box([-16.3, 2.5, -12.2], [-10.7, 2.8, -12.0], 'white');           // roll-up door, raised
    B.visual([-16.2, 0.9, -19.65], [-14, 2.2, -19.55], 'dark');          // pegboard
    B.visual([-11.6, 0, -16.6], [-10.5, 1.9, -14.4], 'steel');           // shelving
    B.box([-17, 3.4, -20], [-10, 3.7, -19.8], 'trim'); B.box([-17, 3.4, -12.2], [-10, 3.7, -12], 'trim');
    B.box([-16.4, 0, -19.4], [-13.8, 1.0, -18.7], 'wood');           // workbench
    B.box([-12.2, 0, -18.5], [-10.8, 1.2, -17.1], 'crate');
    B.box([-18.3, 0, -16], [-17, 1.1, -14.7], 'crate');                // climb to garage roof
    B.box([-18.3, 0, -17.4], [-17, 2.2, -16], 'crate');
    B.visual([-14.3, 3.75, -11.98], [-12.7, 4.75, -11.88], 'white');
    B.visual([-13.8, 3.8, -11.88], [-13.2, 3.85, -11.35], 'orange');
    B.visual([-16.5, 0, -12], [-10.5, 0.02, -6.5], 'concrete');        // driveway
    K.car([-14.5, 0, -11.6], [-12.6, 0, -7.4], 'z', carMat);

    // ---- front yards: picket fence with gaps, hedge, trees, playset
    for (const [a, b] of [[-28, -17], [-9.5, -1.3], [1.3, 9.5], [12.5, 28]]) {
      B.box([a, 0, -6.75], [b, 0.95, -6.6], 'picket');
      for (let x = a; x <= b; x += 1.5) B.visual([x, 0, -6.8], [x + 0.12, 1.1, -6.55], 'picket');
    }
    B.box([6.5, 0, -10.8], [8, 1.35, -7], 'hedge');
    B.box([9, 0, -20], [9.15, 1.0, -17.2], 'picket'); B.box([9, 0, -14.8], [9.15, 1.0, -12], 'picket');
    K.tree([-24, 0, -9]); K.tree([16, 0, -9.5]); K.tree([24, 0, -17]);
    for (const x of [-27, -21]) { B.box([x, 0, -17.1], [x + 0.15, 2.4, -16.9], 'metal'); B.box([x, 0, -15.1], [x + 0.15, 2.4, -14.9], 'metal'); }
    B.visual([-27, 2.4, -17.1], [-20.85, 2.55, -14.9], 'metal');        // swing frame
    for (const x of [-25.8, -23.2]) { B.visual([x, 0.55, -16.3], [x + 0.9, 0.62, -15.7], 'wood'); B.visual([x + 0.05, 0.62, -16.02], [x + 0.08, 2.4, -15.98], 'rope'); B.visual([x + 0.82, 0.62, -16.02], [x + 0.85, 2.4, -15.98], 'rope'); }
    B.box([12.2, 0, -12.6], [14.4, 0.3, -10.6], 'sandbox'); B.visual([12.2, 0.3, -12.6], [14.4, 0.4, -12.45], 'wood');   // sandpit

    // ---- fenced backyard: privacy fence west + east with gates, divider north-east, gardens
    const fence = (min, max) => { B.box(min, max, 'fence'); };
    fence([-17.3, 0, -27], [-17.1, 1.9, -25.2]); fence([-17.3, 0, -23.6], [-17.1, 1.9, -20]);
    fence([16.9, 0, -27], [17.1, 1.9, -24.4]); fence([16.9, 0, -22.8], [17.1, 1.9, -20.3]);
    fence([9, 0, -20.4], [12.5, 1.9, -20.2]); fence([14, 0, -20.4], [17.1, 1.9, -20.2]);
    for (const [x, z] of [[-17.35, -25.3], [-17.35, -23.6], [16.85, -24.5], [16.85, -22.8], [12.4, -20.45], [14, -20.45]]) B.box([x, 0, z - 0.1], [x + 0.3, 2.1, z + 0.1], 'wood');
    B.visual([-18.4, 0.05, -25.15], [-17.3, 1.8, -25.05], 'wood');      // west gate, swung open
    for (const [x0, x1] of [[-15.6, -13.2], [8.6, 11]]) {               // raised vegetable beds
      B.box([x0, 0, -26.8], [x1, 0.38, -26.0], 'wood');
      B.visual([x0 + 0.1, 0.38, -26.7], [x1 - 0.1, 0.42, -26.1], 'soil');
      for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.45) B.visual([x, 0.42, -26.55], [x + 0.25, 0.75, -26.25], 'veg');
      B.visual([x0 + 0.2, 0.38, -26.45], [x0 + 0.26, 1.3, -26.39], 'wood'); B.visual([x1 - 0.26, 0.38, -26.45], [x1 - 0.2, 1.3, -26.39], 'wood');
    }
    B.box([-2.2, 0, -26.9], [-1.2, 0.9, -25.9], 'soil');                // compost bin
    B.visual([-2.25, 0.9, -26.95], [-1.15, 0.98, -25.85], 'dark');
    // clothesline (sheets block sight, not bullets)
    for (const x of [-15.9, -10.2]) B.box([x, 0, -21.35], [x + 0.12, 2.2, -21.2], 'steel');
    B.visual([-15.9, 2.0, -21.3], [-10.1, 2.03, -21.26], 'rope');
    B.visual([-15.1, 0.95, -21.3], [-13.9, 2.0, -21.27], 'cloth'); B.visual([-12.7, 1.15, -21.3], [-11.4, 2.0, -21.27], stripe);
    // patio: grill lid, chairs, umbrella
    B.visual([-4.6, 1.0, -24.1], [-3.7, 1.25, -23.2], 'dark'); B.visual([-4.25, 1.25, -23.75], [-4.05, 1.6, -23.55], 'steel');
    for (const z of [-25.1, -22.7]) B.visual([3.4, 0, z], [4.2, 0.5, z + 0.6], 'cloth');
    B.visual([3.75, 0.85, -23.95], [3.85, 2.3, -23.85], 'steel'); B.visual([2.6, 2.3, -25.1], [5.0, 2.4, -22.7], stripe);
    B.box([20, 0, -26.8], [24.5, 2.6, -23.3], 'wood');                  // shed
    B.box([19.8, 2.6, -27], [24.7, 2.8, -23.1], 'roof');
    B.visual([21.6, 0, -23.32], [22.9, 2.1, -23.25], 'dark');
    B.box([-20.5, 0, -26.6], [-18.5, 1.3, -25.4], 'dark');              // wheelie bins
    B.visual([-20.55, 1.3, -26.65], [-19.55, 1.38, -25.35], stripe);
    // power line behind the back fence (outside the arena)
    for (const x of [-24, -8, 8, 24]) { B.visual([x - 0.15, 0, -30.1], [x + 0.15, 8.6, -29.8], 'trunk'); B.visual([x - 1.1, 8.0, -30.05], [x + 1.1, 8.15, -29.85], 'trunk'); }
    for (const dx of [-0.95, 0.95]) for (const x0 of [-34, -24, -8, 8, 24]) B.visual([x0, 8.12, -29.97], [Math.min(34, x0 === -34 ? -24 : x0 === 24 ? 34 : x0 + 16), 8.15, -29.94], 'dark');

    // ---- street: sidewalk, lamps, hydrant, drains, bus stop cover, dumpster, parked car
    B.box([-30, 0, -6.5], [30, 0.15, -4.5], 'concrete');                // sidewalk
    B.visual([-30, 0.15, -4.62], [30, 0.17, -4.5], 'white');            // kerb line
    for (const x of [-20, 13]) { B.box([x - 0.1, 0, -6.1], [x + 0.15, 4.2, -5.85], 'dark'); B.visual([x - 0.4, 4.2, -6.4], [x + 0.45, 4.45, -5.55], 'lamp'); }
    B.box([8.4, 0.15, -6.45], [8.8, 0.85, -6.05], 'truckRed');            // hydrant
    for (const x of [-10, 21]) B.visual([x, 0.02, -4.45], [x + 1.1, 0.035, -4.0], 'dark');   // storm drains
    B.visual([-6.6, 0.02, -2.2], [-5.6, 0.035, -1.2], 'steel');          // manhole
    // bus stop at the west end: crouch behind the planter wall and aim across the street
    B.box([-27, 0, -4.95], [-22.2, 0.9, -4.6], 'brick');
    B.visual([-26.9, 0.9, -4.9], [-22.3, 1.05, -4.65], 'veg');
    B.box([-26.2, 0, -6.35], [-23.2, 0.5, -5.95], 'wood');
    for (const x of [-26.85, -22.45]) for (const z of [-6.45, -4.75]) B.box([x, 0.15, z], [x + 0.1, 2.6, z + 0.1], 'steel');
    B.visual([-27, 2.6, -6.55], [-22.25, 2.72, -4.6], 'glass');
    B.visual([-26.8, 0.6, -6.5], [-22.5, 2.55, -6.46], 'glass');
    B.visual([-24.6, 1.0, -6.44], [-23.2, 2.2, -6.4], stripe);           // ad panel
    // dumpster in the west lane, parked hatchback in the east lane
    B.box([-13.6, 0, -2.9], [-11.2, 1.3, -1.4], 'blueTrim');
    B.visual([-13.7, 1.3, -3.0], [-11.1, 1.42, -1.3], 'dark');
    K.car([16, 0, -4.3], [20.4, 0, -2.45], 'x', carMat);
    B.box([-25, 0, -1.6], [-23, 1.0, -0.8], 'concrete'); B.visual([-25, 1.0, -1.45], [-23, 1.1, -0.95], 'orange');
    // the angled hollow truck on this side of the street
    K.atruck(1.8, -2.6, -18 * Math.PI / 180, rot === 0 ? 'truckRed' : 'blueTrim', stripe);
  }

  B.rot = 0;
  B.box([-34, -1, -31], [34, 0, 31], 'grass');
  B.visual([-30, 0, -4.5], [30, 0.02, 4.5], 'asphalt');
  for (let x = -27; x < 28; x += 4) B.visual([x, 0.02, -0.1], [x + 2, 0.03, 0.1], 'white');
  K.perimeter(30, 27, 30, 'fence');
  B.box([-29.9, 0, -4.5], [-28.6, 1.6, 4.5], 'hedge');
  B.box([28.6, 0, -4.5], [29.9, 1.6, 4.5], 'hedge');
  side(0, 'sidingA', 'carBlue');
  side(2, 'sidingB', 'carYellow');
  B.rot = 0;
  for (const x of [-14.6, 14.6]) for (let z = -4.2; z < 4.3; z += 1.2) B.visual([x - 0.5, 0.02, z], [x + 0.5, 0.03, z + 0.6], 'white');   // crossings
  K.scenery({ ix: 31, iz: 28, bodies: ['farHouse', 'sidingA', 'sidingB'], roof: 'farRoof', seed: 11 });
  const afkSpawns = K.afkBox(60);
  const { group, padRings } = K.finalize(scene, { hill: '#86ad6f' });

  const spawns = mirrorList([
    [-3, F1, -14], [4, F2, -17.5], [-13.5, 0, -16], [-8, 0, -25], [8, 0, -25], [-26, 0, -12], [22, 0, -11], [-26, 0, -2.5],
  ]);
  const teamA = [[-12, 0, -25.5], [-6, 0, -25.5], [6, 0, -25.5], [12, 0, -25.5], [-14.5, 0, -22.8], [15.5, 0, -25.6], [-3, 0, -21.5], [3, 0, -21.5]];
  const teamSpawns = { A: teamA, B: teamA.map(p => tp(2, p)) };
  const flags = { A: [-8.5, 0, -23.5], B: tp(2, [-8.5, 0, -23.5]) };

  const nav = buildNav(world, {
    half: {
      a_st1: [-24, 0, -3.5], a_st2: [-16, 0, -3.8], a_st3: [-4.6, 0, -3.6], a_st4: [13, 0, -1.6], a_st5: [24, 0, -1.8], a_st6: [6.6, 0, -3.4],
      a_tr_rear: [-2.6, 0, -1.2], a_tr_in: [0.28, 0.48, -2.11], a_tr_in2: [1.25, 0.48, -2.84], a_tr_door: [0.75, F1, -4.6],
      a_wgate: [-17.2, 0, -24.4], a_egate: [17.0, 0, -23.6], a_ngate: [13.25, 0, -21.3],
      a_sw1: [-21.2, F1, -5.4], a_sw_mid: [2.5, F1, -5.6], a_sw2: [-8, F1, -5.5], a_sw3: [10, F1, -5.5], a_sw4: [24, F1, -5.5],
      a_fy_w: [-21.6, 0, -9.6], a_drive: [-11.2, 0, -8.5], a_walk: [0, 0, -8], a_fy_e: [14, 0, -9], a_fy_e2: [24, 0, -12],
      a_side_w: [-8, 0, -15], a_side_w2: [-8, 0, -21], a_side_e: [7.5, 0, -16], a_side_e2: [7.5, 0, -21.5],
      a_fw: [-24, 0, -16], a_fw2: [-24, 0, -22], a_fw3: [-19.5, 0, -12],
      a_by1: [-13, 0, -22], a_by2: [-4, 0, -25.5], a_by3: [4, 0, -25.5], a_by4: [13, 0, -22], a_by5: [24, 0, -20.5],
      a_gar_in: [-13.5, 0, -15.5], a_gar_front: [-11.2, 0, -11], a_gar_back: [-13.5, 0, -21.2], a_gar_side: [-9.2, 0, -15.9],
      a_porch: [0, F1, -10.2], a_h_door: [0, F1, -12.2], a_h_liv: [-3, F1, -14.6], a_h_side_in: [-5.1, F1, -14.9], a_h_side_out: [-7.1, 0, -14.9],
      a_h_divw: [1.2, F1, -15.4], a_h_dive: [2.9, F1, -15.4], a_h_east: [4, F1, -13.5], a_h_back_in: [3.5, F1, -18.2], a_h_back_out: [3.5, 0, -21],
      a_stair_b: [-5.0, F1, -17.6], a_stair_m: [-2.1, F1 + 1.92, -19.0], a_stair_t: [0.7, F2, -19.0],
      a_up_hall: [1, F2, -17], a_up_front: [0, F2, -12.5], a_up_east: [4.5, F2, -17.5], a_up_west: [-4, F2, -13.5],
      a_roof: [0, ROOF, -15.5], a_pad: [0, 0.35, -23.2],
    },
    centre: { c_0: [0, 0, 0], c_aw: [-2.85, 0, 0.93], c_ae: [2.85, 0, -0.93], c_w: [-20, 0, 0], c_e: [20, 0, 0], c_w2: [-10, 0, 0.6], c_e2: [10, 0, -0.6] },
    links: [['a_tr_rear', 'a_tr_in'], ['a_tr_in2', 'a_tr_door'], ['a_stair_b', 'a_stair_m'], ['a_stair_m', 'a_stair_t'], ['a_stair_t', 'a_up_hall'], ['a_h_liv', 'a_stair_b'],
      ['a_porch', 'a_h_door'], ['a_walk', 'a_porch'], ['a_h_side_in', 'a_h_side_out'], ['a_h_back_in', 'a_h_back_out'], ['a_sw2', 'a_walk']],
    oneWay: [['a_pad', 'a_roof'], ['a_roof', 'a_by2'], ['a_by2', 'a_pad'], ['a_by3', 'a_pad']],
    noAuto: ['pad', 'roof'],
  });

  return {
    group, padRings, spawns, teamSpawns, flags, afkSpawns, nav, bounds: { minY: -15 },
    env: { ambient: 'leaves', dust: '#c9bd9c', cloud: '#ffffff', top: '#3d8bff', mid: '#9fd0ff', bot: '#e6f2ff', fog: '#cfe6ff', hemiSky: '#d9ecff', hemiGround: '#6b8f4e', sun: '#fff3dc', sunI: 2.4 },
    preview: { radius: 40, height: 19 },
  };
}
