import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
const errs=[]; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
const rebind = (id, slot, code) => p.evaluate((id, slot, code) => {
  document.querySelector(`.kb[data-id="${id}"][data-slot="${slot}"]`).click();
  document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
}, id, slot, code);
await rebind('use', 0, 'KeyE'); await rebind('reload', 0, 'KeyT'); await rebind('buy', 0, 'KeyN'); await rebind('grenade', 0, 'Digit5'); await rebind('blink', 0, 'KeyZ');
const r = await p.evaluate(async () => {
  document.getElementById('bots').value = 0; window.__speed = 4;
  document.querySelector('#mode-seg [data-m="plant"]').click();
  await window.__start('offline');
  const g = window.__hoptown.game; g.forceInput = true; g.helpShown = true; g.helpUntil = Infinity;
  while (g.plant.ph !== 'buy') await new Promise(r=>setTimeout(r,50));
  window.__speed = 1; g.setPanel(null);
  await new Promise(r=>setTimeout(r,400));
  const out = { buyPrompt: document.getElementById('prompt').innerText, abKeys: [...document.querySelectorAll('.ab-key')].map(e => e.textContent).join(','), blinkSub: document.getElementById('ab-blink-sub').textContent, help: document.getElementById('help').innerText.split('\n').slice(4, 8).join(' | ') };
  while (g.plant.ph !== 'live') await new Promise(r=>setTimeout(r,50));
  const L = g.local, s = g.map.plant.sites[0];
  g.plant.ch = { s: 'carried', c: L.id, p: null, site: null };
  L.ms.pos = [s.mark[0], 0.2, s.mark[2]]; await new Promise(r=>setTimeout(r,500));
  out.plantPrompt = document.getElementById('prompt').innerText;
  // physical T should reload, physical R should do nothing now
  L.mag[L.weapon] = 3;
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true })); document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyR', bubbles: true }));
  await new Promise(r=>setTimeout(r,200)); out.reloadOnR = g.time < L.reloadUntil;
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', bubbles: true })); document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyT', bubbles: true }));
  await new Promise(r=>setTimeout(r,200)); out.reloadOnT = g.time < L.reloadUntil;
  return out;
});
console.log(JSON.stringify(r, null, 1));
await p.screenshot({ path: 'test/shots/keyhints.png' });
console.log('ERR', errs.slice(0, 5));
await b.close();
