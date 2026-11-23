import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:900000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:640,height:360});
const errs=[]; p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack||'').split('\n')[1])); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
const setup = await p.evaluate(async () => {
  document.getElementById('bots').value = 5; window.__speed = 6;
  document.querySelector('#mode-seg [data-m="plant"]').click();
  const mapOn = document.querySelector('#map-sel .mapbtn.on').dataset.map;
  await window.__start('offline');
  const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity;
  return { mapOn, map: g.mapId, mode: g.mode, plant: !!g.plant, rules: g.rules };
});
console.log('setup', JSON.stringify(setup));
// buy phase: buy rifle + armour via the panel keys
const buy = await p.evaluate(async () => {
  const g = window.__hoptown.game, L = g.local;
  const wait = async (s) => { const t0 = g.time; while (g.time - t0 < s) await new Promise(r=>setTimeout(r,16)); };
  while (!g.plant || g.plant.ph !== 'buy') await new Promise(r=>setTimeout(r,50));
  await wait(0.3);
  const before = { money: L.money, panel: g.panelOpen, weapon: L.weapon, slots: document.getElementById('slots').innerText.replace(/\s+/g,'') };
  g.input.pressed.add('Digit5'); await wait(0.1);   // hand cannon $700
  const after = { money: L.money, sec: L.inv.secondary, weapon: L.weapon, slots: document.getElementById('slots').innerText.replace(/\s+/g,''), team: L.team, atk: g.plant.atk, carrier: g.plant.ch.c === L.id };
  return { before, after };
});
console.log('buy', JSON.stringify(buy));
await p.screenshot({ path: 'test/shots/plant-buy.png' });
// let bots play; player parks on a roof out of the way (invulnerable-ish: we just watch)
const log = await p.evaluate(async () => {
  const g = window.__hoptown.game, L = g.local, P = g.plant;
  g.requestAfk(L.id, true);
  const out = []; let last = ''; let lastPos = 0;
  const t0 = g.time;
  while (g.time - t0 < 400) {
    const key = `${P.round}/${P.ph}/${P.ch.s}`;
    if (key !== last) { last = key; out.push(`${g.time.toFixed(0)}s r${P.round} ${P.ph} ch:${P.ch.s}${P.ch.site ? '@' + P.ch.site : ''} atk:${P.atk} ${P.score.A}-${P.score.B} alive A${P._alive('A').length} B${P._alive('B').length}${P.last ? ' last:' + P.last.w + '/' + P.last.why : ''}`); }
    if (g.match.phase === 'end') { out.push('MATCH END winner ' + g.match.winnerTeam); break; }
    if (g.time - lastPos > 15) { lastPos = g.time; out.push('   pos ' + g.bots.map(b => `${b.p.name[0]}${b.p.team}${b.p.alive ? '' : 'x'}(${b.p.ms.pos[0].toFixed(0)},${b.p.ms.pos[2].toFixed(0)})${b.path.length ? 'p' + (b.path.length - b.pi) : ''}`).join(' ')); }
    if (out.length > 90) break;
    await new Promise(r=>setTimeout(r,100));
  }
  const money = [...g.players.values()].map(p => `${p.name}:${p.team}:$${p.money}:${p.inv.primary || '-'}`).join(' ');
  return { out, money };
});
console.log(log.out.join('\n'));
console.log(log.money);
await p.screenshot({ path: 'test/shots/plant-late.png' });
console.log('ERR', [...new Set(errs)].slice(0, 10));
await b.close();
