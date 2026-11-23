import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1366,height:820});
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
await p.evaluate(() => window.__start('offline'));
await new Promise(r=>setTimeout(r,1200));
console.log(await p.evaluate(() => { const el = document.getElementById('pause'); el.style.display = 'flex'; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return [cs.display, cs.zIndex, cs.visibility, r.width, r.height, el.parentElement.id, getComputedStyle(el.parentElement).display]; }));
await new Promise(r=>setTimeout(r,400)); await p.screenshot({path:'test/shots/pause-new.png'}); await b.close();
