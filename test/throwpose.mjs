import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:960,height:540});
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
await p.evaluate(async () => {
  document.getElementById('bots').value = 0;
  await window.__start('offline');
  const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity; g.local.protectUntil = 1e9;
  g.local.ms.pos = [0, 0, -8]; g.view.yaw = Math.PI; g.view.pitch = 0;
  await new Promise(r=>setTimeout(r,300));
});
for (const t of [0.12, 0.25, 0.4, 0.65]) {
  await p.evaluate((t) => { const g = window.__hoptown.game; g.vm.throwItem('nade'); g.vm.throwDur = 1000; g.vm.throwT = t * 1000; }, t);
  await new Promise(r => setTimeout(r, 400));
  await p.screenshot({ path: `test/shots/pose-${t}.png`, clip: { x: 0, y: 140, width: 960, height: 400 } });
}
await b.close();
