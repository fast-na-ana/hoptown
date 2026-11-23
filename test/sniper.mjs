import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:300000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
const errs=[]; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8123/index.html?test', {waitUntil:'load'});
await p.evaluate(() => { document.getElementById('bots').value = 1; window.__start('offline'); });
await p.evaluate(async () => { const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity; while (g.match.phase !== 'play') await new Promise(r=>setTimeout(r,50)); });
const r = await p.evaluate(async () => {
  const g = window.__hoptown.game, L = g.local, bot = g.bots[0], B = bot.p;
  const wait = async (sec) => { const t0 = g.time; while (g.time - t0 < sec) await new Promise(r=>setTimeout(r,16)); };
  bot.think = () => {}; bot.step = () => {};
  const place = () => { B.ms.pos = [-20, 0.15, -5.5]; B.hp = 100; B.protectUntil = 0; B.alive = true; L.ms.pos = [20, 0.15, -5.5]; L.ms.vel = [0,0,0]; };
  const aim = (yo) => { const e = g.eyeOf(L), t = B.ms.pos; const dx=t[0]-e[0], dy=t[1]+yo-e[1], dz=t[2]-e[2]; g.view.yaw=Math.atan2(-dx,-dz); g.view.pitch=Math.atan2(dy,Math.hypot(dx,dz)); g.view.recoil=0; g.view.recoilYaw=0; };
  const out = {};
  place(); g.input.pressed.add('Digit2'); await wait(0.5); out.weapon = L.weapon;
  // scoped body shot at 40 m
  g.input.mouseR = true; await wait(0.5); out.scoped = g.scoped;
  aim(0.9); g.input.clickL = true; await wait(0.1);
  out.bodyShotHp = B.hp;
  out.boltBlocked = !g.canShoot(L); await wait(0.6); out.boltDone = g.canShoot(L);
  // scoped headshot
  aim(1.62); g.input.clickL = true; await wait(0.15);
  out.headshotKill = !B.alive; out.kills = L.kills;
  // hipfire spread check: count hits from 20 hip shots at 40m
  await wait(3.2); place(); g.input.mouseR = false; await wait(0.4);
  let hits = 0;
  for (let i = 0; i < 10; i++) { B.hp = 1000; aim(0.9); const before = B.hp; L.mag.sniper = 5; L.nextShot = 0; g.fire(L, g.view.yaw, g.view.pitch, g.adsAccuracy(L, g.view.ads), null); if (B.hp < before) hits++; }
  out.hipHitsOf10 = hits;
  // scoped accuracy
  g.input.mouseR = true; await wait(0.5); hits = 0;
  for (let i = 0; i < 10; i++) { B.hp = 1000; aim(0.9); const before = B.hp; L.mag.sniper = 5; L.nextShot = 0; g.fire(L, g.view.yaw, g.view.pitch, g.adsAccuracy(L, g.view.ads), null); if (B.hp < before) hits++; }
  out.adsHitsOf10 = hits;
  B.hp = 100;
  return out;
});
console.log(JSON.stringify(r));
await p.screenshot({path:'test/shots/scope.png'});
// unscoped sniper + low health blood
await p.evaluate(async () => { const g = window.__hoptown.game; g.input.mouseR = false; g.local.hp = 14; g.local.lastHurt = g.time; g.local.ms.pos = [-14,0.15,-14]; g.view.yaw = Math.PI*0.75; g.view.pitch = 0; const t0 = g.time; while (g.time - t0 < 0.6) { g.local.lastHurt = g.time; await new Promise(r=>setTimeout(r,16)); } });
await p.screenshot({path:'test/shots/lowhp-sniper.png'});
// bullet holes: spray rifle at a wall
await p.evaluate(async () => { const g = window.__hoptown.game; g.local.hp = 100; g.switchWeapon(g.local, 'rifle'); const t0 = g.time; while (g.time - t0 < 0.4) await new Promise(r=>setTimeout(r,16)); g.local.ms.pos = [-14,0.15,-14.5]; g.view.yaw = Math.PI/2; g.view.pitch = 0; g.view.recoil = 0; g.input.mouseL = true; const t1 = g.time; while (g.time - t1 < 1.6) await new Promise(r=>setTimeout(r,16)); g.input.mouseL = false; });
await p.screenshot({path:'test/shots/holes.png'});
console.log('ERR', errs);
await b.close();
