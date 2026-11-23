import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errs = [];
async function open(name) {
  const p = await b.newPage(); await p.setViewport({width:960,height:540});
  p.on('pageerror', e => errs.push(name+': '+e.message)); p.on('console', m => { if (m.type()==='error') errs.push(name+': '+m.text()); });
  await p.goto('http://localhost:8123/index.html?test&local=1', {waitUntil:'load'});
  await p.evaluate((n) => { document.getElementById('name').value = n; document.getElementById('room').value = 'T1'; document.getElementById('bots').value = 2; }, name);
  return p;
}
const A = await open('Alice');
await A.evaluate(() => window.__start('online'));
await new Promise(r=>setTimeout(r,1500));
const B = await open('Bob');
await B.evaluate(() => window.__start('online'));
await new Promise(r=>setTimeout(r,6000));
const snap = async (p) => p.evaluate(() => { const g = window.__hoptown.game; return { self: g.selfId, host: g.hostId, isHost: g.isHost, phase: g.match.phase, round: g.match.round, t: +g.match.t.toFixed(1), players: [...g.players.values()].map(p => `${p.name}${p.isBot?'(bot)':''}${p.ms?'*':''} a=${p.alive} k${p.kills}d${p.deaths} @${g.posOf(p).map(v=>v.toFixed(0)).join(',')}`) }; });
console.log('A', JSON.stringify(await snap(A)));
console.log('B', JSON.stringify(await snap(B)));
// B shoots A directly: place them, aim and fire from B
const r = await B.evaluate(async () => {
  const g = window.__hoptown.game; const L = g.local;
  const wait = async (sec) => { const t0 = g.time; while (g.time - t0 < sec) await new Promise(r=>setTimeout(r,16)); };
  while (g.match.phase !== 'play') await wait(0.1);
  const A = [...g.players.values()].find(p => p.name === 'Alice');
  return { aliceSeenAt: g.posOf(A).map(v=>+v.toFixed(1)), aliceAlive: A.alive };
});
console.log('B view of Alice', JSON.stringify(r));
// Teleport Alice to fixed spot on her client, freeze her, then let Bob shoot
await A.evaluate(() => { const g = window.__hoptown.game; g.local.ms.pos = [0,0,6]; g.local.protectUntil = 0; for (const b of g.bots) { b.think=()=>{}; b.step=()=>{}; b.p.ms.pos=[25,0,-20]; } });
await new Promise(r=>setTimeout(r,800));
const r2 = await B.evaluate(async () => {
  const g = window.__hoptown.game; const L = g.local;
  const wait = async (sec) => { const t0 = g.time; while (g.time - t0 < sec) await new Promise(r=>setTimeout(r,16)); };
  g.forceInput = true;
  const A = [...g.players.values()].find(p => p.name === 'Alice');
  L.ms.pos = [0,0,16]; L.protectUntil = 0;
  const aim = () => { const e = g.eyeOf(L); const t = g.posOf(A); const dx=t[0]-e[0], dy=t[1]+1.0-e[1], dz=t[2]-e[2]; g.view.yaw=Math.atan2(-dx,-dz); g.view.pitch=Math.atan2(dy,Math.hypot(dx,dz)); g.view.recoil=0; g.view.recoilYaw=0; };
  g.input.mouseR = true; await wait(0.3);
  for (let i=0;i<300 && A.alive;i++){ aim(); g.input.mouseL = true; await wait(0.01); }
  g.input.mouseL = false;
  await wait(0.5);
  return { bobKills: L.kills, aliceDeaths: A.deaths, aliceAlive: A.alive };
});
console.log('after shooting', JSON.stringify(r2));
await new Promise(r=>setTimeout(r,1000));
console.log('A', JSON.stringify(await snap(A)));
await A.screenshot({path:'test/shots/mpA.png'});
await B.screenshot({path:'test/shots/mpB.png'});
// host migration: close A (host?) and see B take over
await A.close();
await new Promise(r=>setTimeout(r,6000));
console.log('B after A left', JSON.stringify(await snap(B)));
console.log('ERR', errs.filter(e=>!e.includes('404')).slice(0,10));
await b.close();
