import puppeteer from 'puppeteer-core';
import fs from 'fs';
const [map, file] = [process.argv[2], process.argv[3]];
const views = JSON.parse(fs.readFileSync(file, 'utf8'));
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
const errs=[]; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
await p.evaluate(async (map) => {
  document.getElementById('bots').value = 0;
  document.querySelector(`#map-sel [data-map="${map}"]`).click();
  document.querySelector('#mode-seg [data-m="ffa"]').click();
  await window.__start('offline');
  const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity; g.local.protectUntil = 1e9;
}, map);
for (const [name, pos, yaw, pitch, crouch] of views) {
  await p.evaluate(async (pos, yaw, pitch) => {
    const g = window.__hoptown.game;
    const t0 = g.time; while (g.time - t0 < 0.5) { g.local.ms.pos = [...pos]; g.local.ms.vel = [0,0,0]; g.local.prevPos = [...pos]; g.view.yaw = yaw; g.view.pitch = pitch; g.local.protectUntil = g.time + 5; await new Promise(r=>setTimeout(r,16)); }
  }, pos, yaw, pitch);
  await p.screenshot({ path: `test/shots/${name}.png` });
}
console.log('ERR', errs);
await b.close();
