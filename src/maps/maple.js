// MAPLE COURT — compact two-houses-across-a-street arena (original geometry).
// Flow: two 2-storey houses face each other across a cul-de-sac; staggered trucks leave a
// dead-centre lane; side yards and backyards give flank routes; teams spawn in the backyards.
import { createKit, buildNav, mirrorList, tp } from '../mapkit.js';

const F1 = 0.15, F2 = 3.35, ROOF = 6.5;

export const info = { id: 'maple', name: 'MAPLE COURT', blurb: 'Two houses, one street. Fast and close.', size: 'SMALL', tags: ['2 HOUSES', 'ROOFTOPS', 'TRAMPOLINES'] };

export function build(world, scene) {
  const K = createKit(world);
  const { B, wall, stairs } = K;

  function side(rot, siding, carMat) {
    B.rot = rot;
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
    B.box([X0 + W, F1, Z0 + W], [-5.4, F1 + 0.32, -18.3], 'wood');
    stairs(-5.4, Z0 + W, 1.4, '+x', 10, 0.32, 0.45, F1, 'wood');
    B.box([-0.9, F2 - 0.2, Z0 + W], [X1 - W, F2, Z1 - W], 'wood');
    B.box([X0 + W, F2 - 0.2, -18.2], [-0.9, F2, Z1 - W], 'wood');
    B.box([X0 + W, F2, -18.25], [-1.5, F2 + 1.0, -18.12], 'trim');
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
    B.box([-17, 3.4, -20], [-10, 3.7, -19.8], 'trim'); B.box([-17, 3.4, -12.2], [-10, 3.7, -12], 'trim');
    B.box([-16.4, 0, -19.4], [-13.8, 1.0, -18.7], 'wood');           // workbench
    B.box([-12.2, 0, -18.5], [-10.8, 1.2, -17.1], 'crate');
    B.box([-18.3, 0, -16], [-17, 1.1, -14.7], 'crate');                // climb to garage roof
    B.box([-18.3, 0, -17.4], [-17, 2.2, -16], 'crate');
    B.visual([-14.3, 3.75, -11.98], [-12.7, 4.75, -11.88], 'white');
    B.visual([-13.8, 3.8, -11.88], [-13.2, 3.85, -11.35], 'orange');
    B.visual([-16.5, 0, -12], [-10.5, 0.02, -6.5], 'concrete');        // driveway
    K.car([-14.5, 0, -11.6], [-12.6, 0, -7.4], 'z', carMat);

    // ---- yards: picket fence with gaps, hedge, trees, playset, shed
    for (const [a, b] of [[-28, -17], [-9.5, -1.3], [1.3, 9.5], [12.5, 28]]) {
      B.box([a, 0, -6.75], [b, 0.95, -6.6], 'picket');
      for (let x = a; x <= b; x += 1.5) B.visual([x, 0, -6.8], [x + 0.12, 1.1, -6.55], 'picket');
    }
    B.box([6.5, 0, -10.8], [8, 1.35, -7], 'hedge');
    B.box([9, 0, -20], [9.15, 1.0, -17.2], 'picket'); B.box([9, 0, -14.8], [9.15, 1.0, -12], 'picket');
    K.tree([-24, 0, -9]); K.tree([16, 0, -9.5]); K.tree([24, 0, -17]);
    for (const x of [-27, -21]) { B.box([x, 0, -17.1], [x + 0.15, 2.4, -16.9], 'metal'); B.box([x, 0, -15.1], [x + 0.15, 2.4, -14.9], 'metal'); }
    B.visual([-27, 2.4, -17.1], [-20.85, 2.55, -14.9], 'metal');        // swing frame
    B.box([18, 0, -26.5], [22.5, 2.6, -22.5], 'wood');                  // shed
    B.box([17.8, 2.6, -26.7], [22.7, 2.8, -22.3], 'roof');
    B.box([-20.5, 0, -24.8], [-18.5, 1.3, -23.6], 'dark');              // bins
    // ---- street furniture
    B.box([-20.1, 0, -6.1], [-19.85, 4.2, -5.85], 'dark'); B.visual([-20.4, 4.2, -6.4], [-19.55, 4.45, -5.55], 'lamp');
    B.box([7.8, 0.15, -5.8], [8.2, 0.85, -5.4], 'truckRed');            // hydrant
    B.box([-30, 0, -6.5], [30, 0.15, -4.5], 'concrete');                // sidewalk
    K.truck(-12, -3.2, 'metal', rot === 0 ? 'truckRed' : 'blueTrim');
    B.box([-25, 0, -1.6], [-23, 1.0, -0.8], 'concrete'); B.visual([-25, 1.0, -1.45], [-23, 1.1, -0.95], 'orange');
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
  const afkSpawns = K.afkBox(60);
  const { group, padRings } = K.finalize(scene);

  const spawns = mirrorList([
    [-3, F1, -14], [4, F2, -17.5], [-13.5, 0, -16], [-8, 0, -25], [8, 0, -25], [-26, 0, -12], [22, 0, -11], [-26, 0, -2.5],
  ]);
  const teamA = [[-12, 0, -25.5], [-6, 0, -25.5], [6, 0, -25.5], [12, 0, -25.5], [-20, 0, -21.5], [15.5, 0, -24.5], [-3, 0, -21.5], [3, 0, -21.5]];
  const teamSpawns = { A: teamA, B: teamA.map(p => tp(2, p)) };
  const flags = { A: [-8.5, 0, -23.5], B: tp(2, [-8.5, 0, -23.5]) };

  const nav = buildNav(world, {
    half: {
      a_st1: [-24, 0, -3.5], a_st2: [-16, 0, -3.8], a_st3: [-2, 0, -2.5], a_st4: [14, 0, -3.5], a_st5: [24, 0, -3],
      a_sw1: [-24, F1, -5.5], a_sw2: [-8, F1, -5.5], a_sw3: [10, F1, -5.5], a_sw4: [24, F1, -5.5],
      a_fy_w: [-21.6, 0, -9.6], a_drive: [-11.2, 0, -8.5], a_walk: [0, 0, -8], a_fy_e: [14, 0, -9], a_fy_e2: [24, 0, -12],
      a_side_w: [-8, 0, -15], a_side_w2: [-8, 0, -21], a_side_e: [7.5, 0, -16], a_side_e2: [7.5, 0, -21.5],
      a_fw: [-24, 0, -16], a_fw2: [-24, 0, -22], a_fw3: [-19.5, 0, -12],
      a_by1: [-13, 0, -22], a_by2: [-4, 0, -25.5], a_by3: [4, 0, -25.5], a_by4: [13, 0, -22], a_by5: [24, 0, -20.5],
      a_gar_in: [-13.5, 0, -15.5], a_gar_front: [-11.2, 0, -11], a_gar_back: [-13.5, 0, -21.2], a_gar_side: [-9.2, 0, -15.9],
      a_porch: [0, F1, -10.2], a_h_door: [0, F1, -12.2], a_h_liv: [-3, F1, -14.6], a_h_side_in: [-5.1, F1, -14.9], a_h_side_out: [-7.1, 0, -14.9],
      a_h_divw: [1.2, F1, -15.4], a_h_dive: [2.9, F1, -15.4], a_h_east: [4, F1, -13.5], a_h_back_in: [3.5, F1, -18.2], a_h_back_out: [3.5, 0, -21],
      a_stair_b: [-5.0, F1, -17.6], a_stair_m: [-3.0, 2.07, -19.0], a_stair_t: [-0.4, F2, -19.0],
      a_up_hall: [1, F2, -17], a_up_front: [0, F2, -12.5], a_up_east: [4.5, F2, -17.5], a_up_west: [-4, F2, -13.5],
      a_roof: [0, ROOF, -15.5], a_pad: [0, 0.35, -23.2],
    },
    centre: { c_0: [0, 0, 0], c_w: [-20, 0, 0], c_e: [20, 0, 0] },
    links: [['a_stair_b', 'a_stair_m'], ['a_stair_m', 'a_stair_t'], ['a_stair_t', 'a_up_hall'], ['a_h_liv', 'a_stair_b'],
      ['a_porch', 'a_h_door'], ['a_walk', 'a_porch'], ['a_h_side_in', 'a_h_side_out'], ['a_h_back_in', 'a_h_back_out'], ['a_sw2', 'a_walk']],
    oneWay: [['a_pad', 'a_roof'], ['a_roof', 'a_by2'], ['a_by2', 'a_pad'], ['a_by3', 'a_pad']],
    noAuto: ['pad', 'roof'],
  });

  return {
    group, padRings, spawns, teamSpawns, flags, afkSpawns, nav, bounds: { minY: -15 },
    env: { top: '#3d8bff', mid: '#9fd0ff', bot: '#e6f2ff', fog: '#cfe6ff', hemiSky: '#d9ecff', hemiGround: '#6b8f4e', sun: '#fff3dc', sunI: 2.4 },
    preview: { radius: 40, height: 19 },
  };
}
