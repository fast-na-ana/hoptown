import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:300000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errs = [];
async function open(name) {
  const p = await b.newPage(); await p.setViewport({width:1280,height:760});
  p.on('pageerror', e => errs.push(name+': '+e.message));
  await p.goto('http://localhost:8123/index.html?test&local=1&nopreview', {waitUntil:'load'});
  await p.evaluate((n) => { document.getElementById('name').value = n; document.getElementById('room').value = 'AFK1'; document.getElementById('bots').value = 2; }, name);
  await p.evaluate(() => window.__start('online'));
  return p;
}
const A = await open('Alice'); await new Promise(r=>setTimeout(r,800));
const B = await open('Bob'); await new Promise(r=>setTimeout(r,800));
const C = await open('Cara');
await new Promise(r=>setTimeout(r,5000));
const pages = { A, B, C };
const info = async (p) => p.evaluate(() => { const g = window.__hoptown.game; if (!g) return { gone: true, status: document.getElementById('status').textContent }; return { me: g.local.name, host: g.isHost, afk: g.local.afk, y: +g.local.ms.pos[1].toFixed(1), players: g.playerList().map(x => x.name + (x.afk ? '(afk)' : '') + (x.host ? '*' : '')).join(' ') }; });
let all = {}; for (const [k, p] of Object.entries(pages)) all[k] = await info(p);
console.log('before', JSON.stringify(all));
const hostKey = Object.keys(all).find(k => all[k].host);
const H = pages[hostKey];
const others = Object.keys(pages).filter(k => k !== hostKey);
const [t1, t2] = others;
const id1 = await pages[t1].evaluate(() => window.__hoptown.game.selfId);
const id2 = await pages[t2].evaluate(() => window.__hoptown.game.selfId);
// host sends t1 to AFK box
await H.evaluate((id) => window.__hoptown.game.requestAfk(id, true), id1);
await new Promise(r=>setTimeout(r,2000));
all = {}; for (const [k, p] of Object.entries(pages)) all[k] = await info(p);
console.log('after AFK', JSON.stringify(all));
// AFK player can't be damaged
const dmg = await H.evaluate((id) => { const g = window.__hoptown.game; const t = g.players.get(id); const hp = t.hp; g.applyHit(g.local, t, 50, false, 'rifle'); return { afkFlag: t.afk }; }, id1);
await new Promise(r=>setTimeout(r,800));
console.log('afk target hp after hit:', await pages[t1].evaluate(() => window.__hoptown.game.local.hp), dmg);
await pages[t1].screenshot({path:'test/shots/afk-view.png'});
// AFK player presses ENTER to return
await pages[t1].evaluate(() => { const g = window.__hoptown.game; g.forceInput = true; g.input.pressed.add('Enter'); });
await new Promise(r=>setTimeout(r,1500));
console.log('after ENTER', JSON.stringify(await info(pages[t1])));
// host opens pause (online) -> screenshot list
await H.evaluate(() => { const g = window.__hoptown.game; document.exitPointerLock(); });
await new Promise(r=>setTimeout(r,300));
await H.evaluate(() => { document.getElementById('pause').style.display = 'flex'; document.dispatchEvent(new Event('pointerlockchange')); });
await new Promise(r=>setTimeout(r,1200));
await H.screenshot({path:'test/shots/pause-online-host.png'});
// kick t2
await H.evaluate((id) => window.__hoptown.game.kickPlayer(id), id2);
await new Promise(r=>setTimeout(r,2500));
all = {}; for (const [k, p] of Object.entries(pages)) all[k] = await info(p);
console.log('after kick', JSON.stringify(all));
console.log('ERR', errs);
await b.close();
