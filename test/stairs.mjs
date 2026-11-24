// every staircase needs room to step on at the bottom and step off at the top
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errs=[];
const maps = process.argv.slice(2).length ? process.argv.slice(2) : ['maple','sunstone','drill'];
for (const id of maps) {
  const p = await b.newPage(); await p.setViewport({width:800,height:450}); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
  const r = await p.evaluate(async (id) => {
    document.querySelector('#mode-seg [data-m="ffa"]').click(); const btn = document.querySelector(`#map-sel [data-map="${id}"]`); if (btn) btn.click();
    document.getElementById('bots').value = 0;
    await window.__start('offline');
    const g = window.__hoptown.game, W = g.world;
    const blocked = (mn, mx) => W.boxes.filter(x => !x.off && x.tag !== 'invisible' && x.min[0] < mx[0] - 0.01 && x.max[0] > mn[0] + 0.01 && x.min[1] < mx[1] && x.max[1] > mn[1] && x.min[2] < mx[2] - 0.01 && x.max[2] > mn[2] + 0.01);
    const out = [];
    for (const [i, s] of (g.map.stairs || []).entries()) {
      // bottom: the whole 0.9 m approach in front of the first step must be clear
      const bb = blocked(...s.bottom);
      // top: clear either straight ahead, or (for side exits) leave it to the nav test
      const tb = blocked(...s.top);
      out.push({ i, bottom: bb.length ? bb.map(x => `${x.mat}[${x.min.map(v=>v.toFixed(1))}→${x.max.map(v=>v.toFixed(1))}]`).slice(0,2) : 'ok', top: tb.length ? 'side-exit' : 'ok', at: s.bottom[0].map(v => +v.toFixed(1)) });
    }
    g.stop && g.stop(); if (window.__quit) window.__quit();
    return out;
  }, id);
  console.log(id, r.length, 'stairs');
  for (const s of r) console.log('  ', s.i, JSON.stringify(s.at), 'bottom:', s.bottom === 'ok' ? 'ok' : 'BLOCKED ' + s.bottom.join(' '), 'top:', s.top);
  await p.close({ runBeforeUnload: false });
}
console.log(errs.slice(0,5));
await b.close();
