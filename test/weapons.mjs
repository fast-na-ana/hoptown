import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:960,height:540});
const errs=[]; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error' || m.type()==='warning') errs.push(m.text()); });
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
await p.evaluate(async () => {
  document.getElementById('bots').value = 0;
  await window.__start('offline');
  const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity; g.local.protectUntil = 1e9;
  while (g.match.phase !== 'play') await new Promise(r=>setTimeout(r,50));
  g.local.ms.pos = [0, 0.15, -5.4]; g.view.yaw = Math.PI / 2; g.view.pitch = 0;
});
const res = [];
for (const [pri, sec] of [['smg', 'hcannon'], ['shotgun', 'pistol'], ['rifle', 'hcannon'], ['sniper', 'pistol']]) {
  const r = await p.evaluate(async (pri, sec) => {
    const g = window.__hoptown.game, L = g.local;
    const wait = async (s) => { const t0 = g.time; while (g.time - t0 < s) await new Promise(r=>setTimeout(r,16)); };
    g.setLoadout(L, { primary: pri, secondary: sec });
    if (L.weapon !== pri) { g.spawn(L); L.ms.pos = [0, 0.15, -5.4]; g.view.yaw = Math.PI / 2; }
    await wait(0.5);
    const out = { pri, w0: L.weapon, slots: document.getElementById('slots').innerText.replace(/\s+/g,'') };
    const m0 = L.mag[pri];
    g.input.clickL = true; g.input.mouseL = true; await wait(0.25); g.input.mouseL = false; g.input.clickL = false;
    out.fired = m0 - L.mag[pri];
    g.input.pressed.add('KeyR'); await wait(0.3); out.reloading = g.time < L.reloadUntil; out.vmAction = g.vm.action;
    await wait(3.2); out.magAfter = L.mag[pri];
    g.input.pressed.add('Digit2'); await wait(0.4); out.w2 = L.weapon;
    g.input.pressed.add('KeyF'); await wait(0.5); out.inspect = g.vm.action;
    return out;
  }, pri, sec);
  await p.screenshot({ path: `test/shots/wpn-${pri}.png` });
  res.push(r);
}
console.log(JSON.stringify(res));
console.log('ERR', [...new Set(errs)].slice(0, 8));
await b.close();
