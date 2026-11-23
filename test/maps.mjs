import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1280,height:720});
const errs=[]; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
const out = {};
for (const [map, mode] of [['sunstone','ffa'],['sunstone','tdm'],['maple','ctf'],['sunstone','ctf']]) {
  const r = await p.evaluate(async (map, mode) => {
    document.getElementById('bots').value = 7;
    document.querySelector(`#map-sel [data-map="${map}"]`).click();
    document.querySelector(`#mode-seg [data-m="${mode}"]`).click();
    await window.__start('offline');
    const g = window.__hoptown.game; g.forceInput = true; g.helpShown = false; g.helpUntil = Infinity; g.local.protectUntil = 1e9;
    // nav connectivity
    const nodes = g.map.nav.nodes; const seen = new Set([0]); const q = [0];
    while (q.length) { const i = q.shift(); for (const j of nodes[i].links) if (!seen.has(j)) { seen.add(j); q.push(j); } }
    const unreachable = nodes.filter((n, i) => !seen.has(i)).map(n => n.id);
    // nodes stuck inside geometry
    const R = 0.38; const inside = nodes.filter(n => g.world.overlaps([n.p[0]-R, n.p[1]+0.05, n.p[2]-R], [n.p[0]+R, n.p[1]+1.7, n.p[2]+R])).map(n => n.id);
    // spawns valid
    const badSpawns = [...g.map.spawns, ...g.map.teamSpawns.A, ...g.map.teamSpawns.B].filter(s => g.world.overlaps([s[0]-R, s[1]+0.05, s[2]-R], [s[0]+R, s[1]+1.7, s[2]+R]));
    const t0 = g.time; while (g.time - t0 < 25) { g.local.protectUntil = g.time + 5; await new Promise(r=>setTimeout(r,50)); }
    const teams = [...g.players.values()].map(p => p.team || '-').join('');
    const res = { map: g.mapId, mode: g.mode, phase: g.match.phase, teamScore: g.teamScore, kills: [...g.players.values()].reduce((a,p)=>a+p.kills,0), teams, nodes: nodes.length, unreachable, inside, badSpawns: badSpawns.length,
      flags: g.flags ? { A: g.flags.A.state, B: g.flags.B.state } : null, caps: [...g.players.values()].reduce((a,p)=>a+(p.caps||0),0) };
    document.getElementById('quit').click();
    return res;
  }, map, mode);
  out[map + '/' + mode] = r;
  await p.screenshot({ path: `test/shots/map-${map}-${mode}.png` });
}
console.log(JSON.stringify(out, null, 1));
console.log('ERR', errs.slice(0, 8));
await b.close();
