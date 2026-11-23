import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage();
p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto('http://localhost:8123/index.html?test', {waitUntil:'load'});
await p.evaluate(() => window.__start('offline'));
const r = await p.evaluate(() => {
  const g = window.__hoptown.game; g.setBotCount(0);
  const { stepMovement, makeMoveState, emptyInput } = window.__mods;
  const W = g.world, DT = 1/120, out = {};
  const run = (s, secs, f) => { for (let i = 0; i < secs*120; i++) { const inp = emptyInput(); f(inp, i*DT); stepMovement(s, inp, DT, W); } return s; };
  const hs = s => Math.hypot(s.vel[0], s.vel[2]);
  // 1 stairs: from bottom landing walk toward +x (yaw = -PI/2 faces +x)
  let s = makeMoveState([-18.3, 0.2, -19.0]);
  run(s, 3, inp => { inp.fwd = 1; inp.yaw = -Math.PI/2; });
  out.stairs = s.pos.map(v=>+v.toFixed(2));
  // 2 ground speed + slide
  s = makeMoveState([-25, 0, -2]);
  run(s, 1.2, inp => { inp.fwd = 1; inp.yaw = -Math.PI/2; });
  out.runSpeed = +hs(s).toFixed(2);
  run(s, 0.05, inp => { inp.fwd = 1; inp.yaw = -Math.PI/2; inp.crouch = true; });
  out.slideSpeed = +hs(s).toFixed(2); out.sliding = s.sliding;
  run(s, 0.6, inp => { inp.fwd = 1; inp.yaw = -Math.PI/2; inp.crouch = true; });
  out.slideAfter = +hs(s).toFixed(2);
  // 3 bhop with air strafe: hold jump, strafe right while turning right
  s = makeMoveState([-26, 0, 0.5]);
  run(s, 0.8, inp => { inp.fwd = 1; inp.yaw = -Math.PI/2; });
  let yaw = -Math.PI/2, maxv = 0, dir = 1, tt = 0;
  for (let i = 0; i < 120*3.0; i++) {
    const inp = emptyInput(); tt += DT;
    if (tt > 0.6) { dir = -dir; tt = 0; }
    yaw -= dir * 1.6 * DT;
    inp.yaw = yaw; inp.right = dir; inp.jump = true;
    stepMovement(s, inp, DT, W);
    maxv = Math.max(maxv, hs(s));
  }
  out.bhopMax = +maxv.toFixed(2);
  // 4 jump heights
  s = makeMoveState([-25, 0, 0]); run(s, 0.3, ()=>{});
  let maxy = 0; run(s, 1.2, (inp, t) => { inp.jump = t < 0.02; maxy = Math.max(maxy, s.pos[1]); });
  out.jumpH = +maxy.toFixed(2);
  s = makeMoveState([-25, 0, 0]); run(s, 0.3, ()=>{});
  maxy = 0; run(s, 1.5, (inp, t) => { inp.jump = t < 0.02 || (t > 0.3 && t < 0.32); maxy = Math.max(maxy, s.pos[1]); });
  out.djumpH = +maxy.toFixed(2);
  // 5 jump pad A at [-13,0,-22.1]
  s = makeMoveState([-13, 0.2, -23.4]);
  run(s, 3, (inp, t) => { inp.fwd = t < 0.3 ? 1 : 0; inp.yaw = Math.PI; });
  out.padLand = s.pos.map(v=>+v.toFixed(2));
  // 6 garage crates: walk from (5,-15.3) toward -x onto crate (top 1.1)
  s = makeMoveState([5.5, 0, -15.3]);
  run(s, 1.2, (inp, t) => { inp.fwd = 1; inp.yaw = Math.PI/2; inp.jump = t > 0.05 && t < 0.1; });
  out.crate1 = s.pos.map(v=>+v.toFixed(2));
  return out;
});
console.log(JSON.stringify(r, null, 0));
await b.close();
