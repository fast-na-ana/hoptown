import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
const errs=[]; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8123/index.html?test', {waitUntil:'load'});
await new Promise(r => setTimeout(r, 1500));
await p.evaluate(() => { document.querySelector('#mode-seg [data-m="plant"]').click(); document.getElementById('rules-btn').click(); });
await new Promise(r => setTimeout(r, 600));
await p.screenshot({ path: 'test/shots/menu-rules.png' });
await p.evaluate(() => { document.body.click(); document.getElementById('lo-btn').click(); });
await new Promise(r => setTimeout(r, 400));
await p.screenshot({ path: 'test/shots/menu-loadout.png' });
await p.evaluate(() => document.body.click());
// plant: planted charge on site A, player nearby looking at it
await p.evaluate(async () => {
  document.getElementById('bots').value = 0; window.__speed = 4;
  await window.__start('offline');
  const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity;
  while (g.plant.ph !== 'live') await new Promise(r=>setTimeout(r,50));
  window.__speed = 1;
  const P = g.plant, s = g.map.plant.sites[0];
  P.hostAction(P.ch.c, 'plant', [s.mark[0], 0, s.mark[2]]);
  g.local.ms.pos = [s.mark[0] - 4, 0, s.mark[2] - 1]; g.view.yaw = -Math.PI / 2 - 0.25; g.view.pitch = -0.2;
  g.local.protectUntil = 1e9;
});
await new Promise(r => setTimeout(r, 1800));
await p.screenshot({ path: 'test/shots/plant-planted.png' });
// detonation
await p.evaluate(async () => { const g = window.__hoptown.game; g.local.ms.pos = [-2, 0, 18]; g.view.yaw = -Math.PI / 2; g.view.pitch = 0.05; g.plant.t = 0.3; });
await new Promise(r => setTimeout(r, 900));
await p.screenshot({ path: 'test/shots/plant-blast.png' });
console.log('ERR', errs.slice(0, 5));
await b.close();
