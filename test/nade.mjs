import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:300000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage();
p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
await p.evaluate(() => { document.getElementById('bots').value = 1; window.__start('offline'); });
const r = await p.evaluate(async () => {
  const g = window.__hoptown.game, L = g.local, bot = g.bots[0], B = bot.p;
  while (g.match.phase !== 'play') await new Promise(r=>setTimeout(r,50));
  bot.think = () => {}; bot.step = () => {};
  const out = {};
  for (const d of [1, 3, 5, 7, 8.4]) {
    B.alive = true; B.hp = 1000; B.protectUntil = 0; B.ms.pos = [-20 + d, 0, -2.6]; B.ms.vel = [0,0,0];
    L.ms.pos = [20, 0, -2.6];
    g.explode([-20, 0.3, -2.6], L.id);
    out['d' + d] = 1000 - B.hp;
  }
  return out;
});
console.log('grenade damage by distance (m):', JSON.stringify(r));
await b.close();
