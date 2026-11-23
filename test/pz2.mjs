import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1366,height:820});
p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
await p.evaluate(() => window.__start('offline'));
for (let i = 0; i < 4; i++) { await new Promise(r=>setTimeout(r,700)); console.log(await p.evaluate(() => { const g = window.__hoptown.game; return [g.time.toFixed(2), g.match.phase, document.getElementById('pause').style.display, document.pointerLockElement ? 'locked' : 'unlocked']; })); }
await b.close();
