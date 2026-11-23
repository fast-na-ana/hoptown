import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
const errs=[]; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto('http://localhost:8123/index.html?test', {waitUntil:'load'});
await p.evaluate(() => window.__start('offline'));
await p.evaluate(() => { const g = window.__hoptown.game; g.forceInput = true; g.setBotCount(1); });
await p.evaluate(async () => { const g = window.__hoptown.game; while (g.match.phase !== 'play') await new Promise(r=>setTimeout(r,100)); });
const res = await p.evaluate(async () => {
  const g = window.__hoptown.game, L = g.local;
  const wait = async (sec) => { const t0 = g.time; while (g.time - t0 < sec) await new Promise(r=>setTimeout(r,16)); };
  const bot = g.bots[0]; const B = bot.p;
  // freeze bot AI: place bot in open street facing away, place player 12m away
  bot.think = () => {}; bot.step = () => {};
  B.ms.pos = [0, 0, 6.0]; B.protectUntil = 0;
  L.ms.pos = [0, 0, 18]; L.ms.vel = [0,0,0]; L.protectUntil = 0;
  const out = { phase: g.match.phase };
  // aim at bot chest: yaw toward -z
  const aim = (yoff) => { const e = g.eyeOf(L); const t = [B.ms.pos[0], B.ms.pos[1] + yoff, B.ms.pos[2]]; const dx=t[0]-e[0], dy=t[1]-e[1], dz=t[2]-e[2]; g.view.yaw = Math.atan2(-dx,-dz); g.view.pitch = Math.atan2(dy, Math.hypot(dx,dz)); g.view.recoil = 0; g.view.recoilYaw = 0; };
  aim(1.0);
  g.input.mouseR = true; // ADS
  await new Promise(r=>setTimeout(r,300));
  const hp0 = B.hp; let shots = 0;
  for (let i = 0; i < 400 && B.alive; i++) { aim(1.0); g.input.mouseL = true; await wait(0.01); } shots = 30 - L.mag.rifle;
  g.input.mouseL = false;
  out.rifleShots = shots; out.botAlive = B.alive; out.botHp = B.hp; out.kills = L.kills; out.botDeaths = B.deaths; out.score = L.score; out.mag = L.mag.rifle;
  // headshot with pistol after respawn
  await wait(3.3);
  B.ms.pos = [0, 0, 6.0]; B.protectUntil = 0; B.hp = 100;
  g.switchWeapon(L, 'pistol'); await new Promise(r=>setTimeout(r,400));
  let pshots = 0;
  for (let i = 0; i < 10 && B.alive; i++) { aim(1.62); g.input.clickL = true; await wait(0.2); pshots++; }
  out.pistolShotsToKill = pshots; out.kills2 = L.kills; out.streak = L.streak;
  // grenade at bot feet
  await wait(3.3);
  B.ms.pos = [0, 0, 10]; B.protectUntil = 0; B.hp = 100; L.ms.pos = [0,0,18];
  const hpBefore = B.hp;
  g.spawnProjectile({ id: 'x1', kind: 'nade', owner: L.id, pos: [0, 0.5, 10.5], vel: [0,0,0], fuse: 0.3, auth: true });
  await wait(0.8);
  out.nadeDmgBotHp = B.hp; out.nadeBotAlive = B.alive; out.kills3 = L.kills;
  // blink: throw toward -z, then teleport
  g.view.yaw = 0; g.view.pitch = -0.05; L.ms.pos = [-20, 0, -2.6];
  g.input.pressed.add('KeyQ'); await wait(0.25);
  const discPos = L.blink && [...L.blink.pos];
  g.input.pressed.add('KeyQ'); await new Promise(r=>setTimeout(r,100));
  out.blinkFrom = [-20,0,-2.6]; out.disc = discPos && discPos.map(v=>+v.toFixed(1)); out.afterBlink = L.ms.pos.map(v=>+v.toFixed(1)); out.blinkCd = +L.blinkCd.toFixed(1);
  return out;
});
console.log(JSON.stringify(res));
await p.screenshot({path:'test/shots/combat.png'});
console.log('ERR', errs.slice(0,10));
await b.close();
