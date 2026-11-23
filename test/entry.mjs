import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage();
p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto('http://localhost:8123/index.html?test', {waitUntil:'load'});
await p.evaluate(() => window.__start('offline'));
const r = await p.evaluate(() => {
  const g = window.__hoptown.game; g.setBotCount(0);
  const { stepMovement, makeMoveState, emptyInput } = window.__mods;
  const W = g.world, DT = 1/120;
  const run = (s, secs, f) => { for (let i = 0; i < secs*120; i++) { const inp = emptyInput(); f(inp, i*DT); stepMovement(s, inp, DT, W); } return s; };
  const out = {};
  const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
  // front door A (x -13.5, z -11): walk from yard z -8.5 toward -z
  let s = makeMoveState([-13.5, 0, -8.5]); run(s, 1.2, i => { i.fwd = 1; i.yaw = yawTo(0, -1); });
  out.frontDoor = s.pos.map(v=>+v.toFixed(2));
  // back door A (x -9.3, z -20): from backyard z -22 toward +z
  s = makeMoveState([-9.3, 0, -22]); run(s, 1.2, i => { i.fwd = 1; i.yaw = yawTo(0, 1); });
  out.backDoor = s.pos.map(v=>+v.toFixed(2));
  // side door A (x -7, z -13.5): from x -5 toward -x
  s = makeMoveState([-5, 0, -13.5]); run(s, 1.2, i => { i.fwd = 1; i.yaw = yawTo(-1, 0); });
  out.sideDoor = s.pos.map(v=>+v.toFixed(2));
  // jump through front window (x -17, sill 0.95) from z -8.5 toward -z
  s = makeMoveState([-17.1, 0, -9.0]); run(s, 1.6, (i, t) => { i.fwd = 1; i.yaw = yawTo(0, -1); i.jump = t > 0.05 && t < 0.1; });
  out.windowJump = s.pos.map(v=>+v.toFixed(2));
  // hop the low front fence (z -6.7, x -25) from the sidewalk side (z -5.5) toward -z
  s = makeMoveState([-25, 0.15, -5.4]); run(s, 1.2, (i, t) => { i.fwd = 1; i.yaw = yawTo(0, -1); i.jump = t > 0.02 && t < 0.07; });
  out.fenceHop = s.pos.map(v=>+v.toFixed(2));
  // walk into garage
  s = makeMoveState([-0.5, 0, -9]); run(s, 1.2, i => { i.fwd = 1; i.yaw = yawTo(0, -1); });
  out.garage = s.pos.map(v=>+v.toFixed(2));
  return out;
});
console.log(JSON.stringify(r));
await b.close();
