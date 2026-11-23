import puppeteer from 'puppeteer-core';
const maps = (process.argv[2] || 'maple').split(',');
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
const errs=[]; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
for (const map of maps) {
  const r = await p.evaluate(async (map) => {
    document.getElementById('bots').value = 0;
    document.querySelector(`#map-sel [data-map="${map}"]`).click();
    document.querySelector(`#mode-seg [data-m="ffa"]`).click();
    await window.__start('offline');
    const g = window.__hoptown.game;
    const nodes = g.map.nav.nodes; const seen = new Set([0]); const q = [0];
    while (q.length) { const i = q.shift(); for (const j of nodes[i].links) if (!seen.has(j)) { seen.add(j); q.push(j); } }
    // reverse reachability too (one-way links)
    const unreachable = nodes.filter((n, i) => !seen.has(i)).map(n => n.id);
    const R = 0.38;
    const inside = nodes.filter(n => g.world.overlaps([n.p[0]-R, n.p[1]+0.05, n.p[2]-R], [n.p[0]+R, n.p[1]+1.7, n.p[2]+R])).map(n => n.id);
    const all = [...g.map.spawns, ...g.map.teamSpawns.A, ...g.map.teamSpawns.B];
    const badSpawns = all.filter(s => g.world.overlaps([s[0]-R, s[1]+0.05, s[2]-R], [s[0]+R, s[1]+1.7, s[2]+R]));
    const deg = nodes.filter(n => n.links.length <= 1).map(n => n.id + ':' + n.links.length);
    const res = { boxes: g.world.boxes.length, nodes: nodes.length, unreachable, inside, badSpawns, lowDegree: deg };
    document.getElementById('quit').click();
    return res;
  }, map);
  console.log(map, JSON.stringify(r));
}
console.log('ERR', errs.slice(0, 8));
await b.close();
