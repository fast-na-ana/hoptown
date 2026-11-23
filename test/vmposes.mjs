import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:640,height:360});
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
await p.evaluate(async () => {
  document.getElementById('bots').value = 0;
  await window.__start('offline');
  const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity; g.local.protectUntil = 1e9;
  g.local.ms.pos = [0, 0.15, -5.4]; g.view.yaw = Math.PI / 2; g.view.pitch = 0;
  document.getElementById('hud').style.display = 'none';
});
// [weapon, action, phase k]
const poses = [['smg', null, 0], ['shotgun', null, 0], ['hcannon', null, 0], ['shotgun', 'reload', 0.45], ['hcannon', 'reload', 0.78], ['smg', 'reload', 0.55], ['rifle', 'inspect', 0.35], ['hcannon', 'inspect', 0.65], ['knife', 'inspect', 0.45]];
let i = 0;
for (const [w, act, k] of poses) {
  await p.evaluate((w, act, k) => {
    const g = window.__hoptown.game, vm = g.vm;
    vm.setWeapon(w, true);
    if (act) { if (act === 'reload') vm.startReload(w === 'shotgun' ? 0.28 + 3 * 0.42 + 0.42 : 1.6, w === 'shotgun' ? 3 : 0); else vm._start(act, 2.3); vm.actionDur = vm.actionDur * 1000; vm.actionT = vm.actionDur * k; }
  }, w, act, k);
  await new Promise(r => setTimeout(r, 450));
  await p.screenshot({ path: `test/shots/vm-${i++}.png` });
}
await b.close();
