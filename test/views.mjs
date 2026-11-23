import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
const errs=[]; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
await p.evaluate(async () => {
  document.getElementById('bots').value = 5;
  document.querySelector('#map-sel [data-map="sunstone"]').click();
  document.querySelector('#mode-seg [data-m="tdm"]').click();
  await window.__start('offline');
  const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity; g.local.protectUntil = 1e9;
  while (g.match.phase !== 'play') await new Promise(r=>setTimeout(r,50));
});
const shots = [
  ['sun-base', [-40, 0, 4], -Math.PI / 2, 0],          // looking east out of the base gate
  ['sun-north', [-40, 0, 18], -Math.PI / 2, 0.02],     // long road
  ['sun-mid', [-31, 0, 0], -Math.PI / 2, 0],           // mid street toward arch
  ['sun-bazaar', [-33, 0, -18], -Math.PI / 2, 0],      // covered bazaar
  ['sun-plaza', [-7, 1.0, 9], -Math.PI * 0.75, -0.1],  // plaza from the stage
  ['sun-roof', [-27, 3.8, 9], -Math.PI * 0.6, -0.15],  // rooftop
];
for (const [name, pos, yaw, pitch] of shots) {
  await p.evaluate(async (pos, yaw, pitch) => {
    const g = window.__hoptown.game; g.local.ms.pos = [...pos]; g.local.ms.vel = [0,0,0]; g.local.prevPos = [...pos]; g.view.yaw = yaw; g.view.pitch = pitch;
    const t0 = g.time; while (g.time - t0 < 0.5) { g.local.protectUntil = g.time + 5; await new Promise(r=>setTimeout(r,16)); }
  }, pos, yaw, pitch);
  await p.screenshot({ path: `test/shots/${name}.png` });
}
await p.evaluate(async () => { const g = window.__hoptown.game; g.input.pressed.add('KeyM'); const t0 = g.time; while (g.time - t0 < 0.4) await new Promise(r=>setTimeout(r,16)); });
await p.screenshot({ path: 'test/shots/sun-bigmap.png' });
await p.evaluate(async () => { const g = window.__hoptown.game; g.input.pressed.add('KeyM'); document.getElementById('quit').click(); });
await p.evaluate(async () => {
  document.querySelector('#map-sel [data-map="maple"]').click();
  document.querySelector('#mode-seg [data-m="ctf"]').click();
  await window.__start('offline');
  const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity; g.local.protectUntil = 1e9;
  while (g.match.phase !== 'play') await new Promise(r=>setTimeout(r,50));
  g.local.ms.pos = [10, 0, -1.5]; g.local.prevPos = [10, 0, -1.5]; g.view.yaw = Math.PI / 2 + 0.25; g.view.pitch = 0.02;
  const t0 = g.time; while (g.time - t0 < 0.6) { g.local.protectUntil = g.time + 5; await new Promise(r=>setTimeout(r,16)); }
});
await p.screenshot({ path: 'test/shots/maple-street.png' });
await p.evaluate(async () => {
  const g = window.__hoptown.game; g.local.ms.pos = [-8, 0, -25.5]; g.local.prevPos = [-8, 0, -25.5]; g.view.yaw = -0.4; g.view.pitch = 0.05;
  const t0 = g.time; while (g.time - t0 < 0.5) { g.local.protectUntil = g.time + 5; await new Promise(r=>setTimeout(r,16)); }
});
await p.screenshot({ path: 'test/shots/maple-backyard.png' });
console.log('ERR', errs);
await b.close();
