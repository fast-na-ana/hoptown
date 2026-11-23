import puppeteer from 'puppeteer-core';
const map = process.argv[2];
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',protocolTimeout:600000,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage(); await p.setViewport({width:1100,height:1000});
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
const info = await p.evaluate(async (map) => {
  document.getElementById('bots').value = 0;
  document.querySelector(`#map-sel [data-map="${map}"]`).click();
  await window.__start('offline');
  const g = window.__hoptown.game; g.forceInput = true;
  const c = g.minimap.img || g.minimap.base || null;
  // draw collider top-down with grid labels
  const W = 1000, H = 1000, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  const b = g.map.bounds; const sx = W / 100, ox = 50, oz = 50;
  const X = v => (v + ox) * sx, Z = v => (v + oz) * sx;
  for (const bx of g.world.boxes) { if (bx.tag === 'invisible' || bx.max[1] - bx.min[1] > 20 || bx.min[1] > 30) continue; const h = bx.max[1]; x.fillStyle = h < 0.3 ? 'rgba(0,0,0,0.05)' : h < 1.2 ? 'rgba(40,120,200,0.5)' : h < 3 ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.75)'; x.fillRect(X(bx.min[0]), Z(bx.min[2]), (bx.max[0] - bx.min[0]) * sx, (bx.max[2] - bx.min[2]) * sx); }
  x.fillStyle = '#c00'; x.font = '10px monospace';
  for (let v = -50; v <= 50; v += 5) { x.fillText(String(v), X(v), 10); x.fillText(String(v), 2, Z(v)); x.strokeStyle = 'rgba(200,0,0,0.15)'; x.beginPath(); x.moveTo(X(v), 0); x.lineTo(X(v), H); x.moveTo(0, Z(v)); x.lineTo(W, Z(v)); x.stroke(); }
  for (const t of ['A', 'B']) for (const s of g.map.teamSpawns[t]) { x.fillStyle = t === 'A' ? '#f60' : '#06f'; x.beginPath(); x.arc(X(s[0]), Z(s[2]), 5, 0, 7); x.fill(); }
  document.body.innerHTML = ''; document.body.appendChild(cv); cv.style.position = 'fixed'; cv.style.left = '0'; cv.style.top = '0'; cv.style.zIndex = 99;
  return { bounds: g.map.bounds };
}, map);
await new Promise(r => setTimeout(r, 300));
await p.screenshot({ path: `test/shots/top-${map}.png`, clip: { x: 0, y: 0, width: 1000, height: 1000 } });
console.log(JSON.stringify(info));
await b.close();
