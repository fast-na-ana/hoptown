import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1366,height:820});
const errs=[]; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto('http://localhost:8123/index.html?test', {waitUntil:'load'});
await new Promise(r=>setTimeout(r,2500));
await p.screenshot({path:'test/shots/menu-new.png'});
await p.click('.tab[data-tab="settings"]'); await new Promise(r=>setTimeout(r,300));
await p.evaluate(() => document.querySelector('.tabs').scrollIntoView());
await p.screenshot({path:'test/shots/menu-settings.png'});
await p.setViewport({width:820,height:900}); await new Promise(r=>setTimeout(r,600));
await p.evaluate(() => document.getElementById('menu').scrollTo(0,0));
await p.screenshot({path:'test/shots/menu-narrow.png'});
// start + pause
await p.setViewport({width:1366,height:820});
await p.evaluate(() => window.__start('offline'));
await new Promise(r=>setTimeout(r,1500));
await p.evaluate(() => { document.getElementById('pause').style.display = 'flex'; });
await new Promise(r=>setTimeout(r,300));
await p.screenshot({path:'test/shots/pause-new.png'});
// quit back to menu: preview restarts
await p.evaluate(() => document.getElementById('quit').click());
await new Promise(r=>setTimeout(r,1500));
await p.screenshot({path:'test/shots/menu-again.png'});
console.log('ERR', errs);
await b.close();
