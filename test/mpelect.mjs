// host election: a later joiner never takes over; split rooms merge; host leaving hands over cleanly
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errs = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function open(name, room, map, extra = '') {
  const p = await b.newPage(); await p.setViewport({width:1280,height:720});
  p.on('pageerror', e => errs.push(name + ': ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.goto(`http://localhost:8123/index.html?test&local=1&nopreview${extra}`, {waitUntil:'load'});
  await p.evaluate((n, room, map) => { document.getElementById('name').value = n; document.getElementById('room').value = room; document.getElementById('bots').value = 2;
    document.querySelector('#mode-seg [data-m="ffa"]').click(); document.querySelector(`#map-sel [data-map="${map}"]`).click(); }, name, room, map);
  await p.evaluate(() => window.__start('online'));
  await p.evaluate(() => { const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity; });
  return p;
}
const st = (p) => p.evaluate(() => { const g = window.__hoptown.game; const h = g.players.get(g.hostId);
  return { me: g.local.name, host: g.isHost, hostName: h ? h.name : '?', map: g.mapId, peers: g.net.peerIds().length, bots: [...g.players.values()].filter(q => q.isBot).length }; });
const line = async (label, ps) => console.log(label.padEnd(34), (await Promise.all(ps.map(st))).map(s => `${s.me}[host=${s.hostName}${s.host ? '*' : ''} map=${s.map} peers=${s.peers} bots=${s.bots}]`).join('  '));

// 1) existing host keeps the room even when the joiner's id sorts first
const A = await open('Alice', 'ELEC1', 'saltworks', '&idp=Z');
await sleep(2000);
const B = await open('Bob', 'ELEC1', 'maple', '&idp=A');
await sleep(4000);
await line('1 joiner with lower id:', [A, B]);

// 2) two players who could not see each other at first (both hosting) merge into one room
const C = await open('Cara', 'ELEC2', 'drill', '&deaf=7000');
await sleep(2500);
const D = await open('Dev', 'ELEC2', 'sunstone', '&deaf=4000');
await sleep(1500);
await line('2a before they can hear each other:', [C, D]);
await sleep(8000);
await line('2b after:', [C, D]);

// 3) host leaves: the remaining player takes over and keeps playing
const E = await open('Eve', 'ELEC1', 'drill');
await sleep(4000);
await line('3a three in room:', [A, B, E]);
await A.close({ runBeforeUnload: false });
await sleep(7000);
await line('3b after host left:', [B, E]);
// pause menu: online, client view (single column) + host view (two columns), screenshot both
for (const [p, n] of [[B, 'B'], [E, 'E']]) {
  await p.evaluate(() => { const g = window.__hoptown.game; g.forceInput = false; document.exitPointerLock?.(); document.dispatchEvent(new Event('pointerlockchange')); });
  await sleep(1200);
  const box = await p.evaluate(() => { const c = document.querySelector('.pause-card').getBoundingClientRect(); const el = document.querySelector('.pause-card'); return { h: Math.round(c.height), w: Math.round(c.width), scroll: el.scrollHeight > el.clientHeight + 1, top: Math.round(c.top) }; });
  console.log('pause', n, JSON.stringify(box));
  await p.screenshot({ path: `test/shots/pause_${n}.png` });
}
console.log('ERR', [...new Set(errs)].slice(0, 8));
await b.close();
