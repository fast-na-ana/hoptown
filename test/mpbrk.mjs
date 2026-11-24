// online sync of blast doors / glass / panels on Saltworks (BroadcastChannel transport)
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errs = [];
async function open(name) {
  const p = await b.newPage(); await p.setViewport({width:640,height:360});
  p.on('pageerror', e => errs.push(name + ': ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.goto('http://localhost:8123/index.html?test&local=1&nopreview', {waitUntil:'load'});
  await p.evaluate((n) => { document.getElementById('name').value = n; document.getElementById('room').value = 'BRKS'; document.getElementById('bots').value = 0;
    document.querySelector('#mode-seg [data-m="tdm"]').click(); document.querySelector('#map-sel [data-map="saltworks"]').click(); }, name);
  await p.evaluate(() => window.__start('online'));
  await p.evaluate(() => { const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity; window.__wait = async (s) => { const t0 = g.time; while (g.time - t0 < s) await new Promise(r=>setTimeout(r,16)); }; });
  return p;
}
const A = await open('Alice');
await new Promise(r => setTimeout(r, 1500));
const B = await open('Bob');
await new Promise(r => setTimeout(r, 3000));
const st = (p) => p.evaluate(() => { const g = window.__hoptown.game; return { host: g.isHost, map: g.mapId, brk: g.brk.list.map(b => `${b.id}:${b.state}:${b.hp}`).join(' ') }; });
const sA = await st(A); const H = sA.host ? A : B, C = sA.host ? B : A;
console.log('host', JSON.stringify(await st(H))); console.log('client', JSON.stringify(await st(C)));
// client closes door A from its switch
await C.evaluate(async () => { const g = window.__hoptown.game, L = g.local; L.protectUntil = 1e9; L.ms.pos = [24.0, 0, -13.4]; L.ms.vel = [0,0,0]; await window.__wait(0.3); g.brk.useSwitch(L); await window.__wait(1.2); });
console.log('after client switch: host', (await st(H)).brk, '| client', (await st(C)).brk);
// client shoots the glass from mid
await C.evaluate(async () => { const g = window.__hoptown.game, L = g.local; L.ms.pos = [11, -0.75, -8]; L.ms.vel = [0,0,0]; await window.__wait(0.3);
  g.view.yaw = 0; g.view.pitch = Math.atan2(1.6 + 0.75 - 1.6, 6.7); L.ammo = 30; g.input.mouseL = true; await window.__wait(0.15); g.input.mouseL = false; await window.__wait(1.0); });
console.log('after client shot: host', (await st(H)).brk, '| client', (await st(C)).brk);
// a third player joins late and must receive the current state
const D = await open('Dana'); await new Promise(r => setTimeout(r, 3000));
console.log('late joiner', (await st(D)).brk);
console.log('ERR', [...new Set(errs)].slice(0, 8));
await b.close();
