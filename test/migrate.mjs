import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errs = [];
async function open(name) {
  const p = await b.newPage(); await p.setViewport({width:800,height:450});
  p.on('pageerror', e => errs.push(name+': '+e.message));
  await p.goto('http://localhost:8123/index.html?test&local=1', {waitUntil:'load'});
  await p.evaluate((n) => { document.getElementById('name').value = n; document.getElementById('room').value = 'MIG'; document.getElementById('bots').value = 3; }, name);
  await p.evaluate(() => window.__start('online'));
  return p;
}
const pages = [await open('P1'), await open('P2'), await open('P3')];
await new Promise(r=>setTimeout(r,5000));
const info = async (p) => p.evaluate(() => { const g = window.__hoptown.game; return { me: g.local.name, isHost: g.isHost, n: g.players.size, bots: [...g.players.values()].filter(p=>p.isBot).length, phase: g.match.phase }; });
const all = await Promise.all(pages.map(info));
console.log(JSON.stringify(all));
const hostIdx = all.findIndex(x => x.isHost);
console.log('closing host', all[hostIdx].me);
await pages[hostIdx].close();
const rest = pages.filter((_, i) => i !== hostIdx);
await new Promise(r=>setTimeout(r,8000));
console.log(JSON.stringify(await Promise.all(rest.map(info))));
console.log('ERR', errs);
// RTC mode smoke (no local): should start without throwing
const q = await b.newPage();
q.on('pageerror', e => console.log('rtc pageerror', e.message));
await q.goto('http://localhost:8123/index.html?test', {waitUntil:'load'});
await q.evaluate(() => { document.getElementById('room').value = 'SMOKE'; window.__start('online'); });
await new Promise(r=>setTimeout(r,5000));
console.log('rtc', await q.evaluate(() => { const g = window.__hoptown.game; return g ? { started: true, self: g.selfId, host: g.isHost, bots: g.bots.length, status: document.getElementById('status').textContent } : { started: false, status: document.getElementById('status').textContent }; }));
await b.close();
