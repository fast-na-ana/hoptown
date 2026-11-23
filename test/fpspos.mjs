import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:300000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
const r = await p.evaluate(async () => {
  document.getElementById('bots').value = 0;
  document.getElementById('showfps').checked = true; document.getElementById('showfps').dispatchEvent(new Event('change'));
  document.querySelector('#mode-seg [data-m="ctf"]').click();
  await window.__start('offline');
  const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity;
  await new Promise(r => setTimeout(r, 2500));
  const box = id => { const e = document.getElementById(id).getBoundingClientRect(); return [Math.round(e.left), Math.round(e.top), Math.round(e.right), Math.round(e.bottom)]; };
  return { fps: box('fps'), flag: box('flagbar'), abilities: box('abilities'), text: document.getElementById('fps').textContent };
});
console.log(JSON.stringify(r));
await p.screenshot({ path: 'test/shots/fpspos.png' });
await b.close();
