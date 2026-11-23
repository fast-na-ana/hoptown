import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
const errs=[]; p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack||'').split('\n')[1]));
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
const r = await p.evaluate(async () => {
  document.getElementById('bots').value = 1;
  document.querySelector('#map-sel [data-map="drill"]').click();
  document.querySelector('#mode-seg [data-m="ffa"]').click();
  await window.__start('offline');
  const g = window.__hoptown.game, L = g.local; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity; L.protectUntil = 1e9;
  const wait = async (s) => { const t0 = g.time; while (g.time - t0 < s) await new Promise(r=>setTimeout(r,16)); };
  while (g.match.phase !== 'play') await new Promise(r=>setTimeout(r,50));
  const out = { map: g.mapId };
  // ladder: stand at the north ladder, push forward (+z means yaw = PI)
  L.ms.pos = [0, 0, -3.6]; L.ms.vel = [0, 0, 0]; g.view.yaw = Math.PI; g.view.pitch = 0;
  g.input.keys.add('KeyW'); await wait(2.2); g.input.keys.delete('KeyW'); await wait(0.3);
  out.afterClimb = L.ms.pos.map(v => +v.toFixed(2));
  // wallbang: bot behind the west divider (x=-7), me in the west lane shooting through plywood
  const bot = g.bots[0].p; g.bots[0].think = () => {}; g.bots[0].step = () => {};
  bot.ms.pos = [-5.5, 0, -12.5]; bot.ms.vel = [0, 0, 0]; bot.hp = 100; bot.protectUntil = 0;
  L.ms.pos = [-10.5, 0, -12.5]; L.ms.vel = [0, 0, 0]; g.setLoadout(L, { primary: 'rifle', secondary: 'pistol' }); g.spawn(L); L.ms.pos = [-10.5, 0, -12.5]; L.protectUntil = 1e9;
  await wait(0.4);
  g.view.yaw = -Math.PI / 2; g.view.pitch = -0.05;   // face +x
  const hp0 = bot.hp;
  g.input.mouseL = true; await wait(0.12); g.input.mouseL = false; await wait(0.3);
  out.wallbang = { hp0, hp1: bot.hp, alive: bot.alive };
  // concrete pillar should stop bullets: bot behind pillar at x=4.2,z=-7
  bot.hp = 100; bot.alive = true; bot.ms.pos = [4.2, 0, -5.8];
  L.ms.pos = [4.2, 0, -12.0]; await wait(0.3); g.view.yaw = Math.PI; g.view.pitch = 0;
  g.input.mouseL = true; await wait(0.12); g.input.mouseL = false; await wait(0.3);
  out.pillar = { hp: bot.hp };
  return out;
});
console.log(JSON.stringify(r));
console.log('ERR', errs.slice(0, 5));
await b.close();
