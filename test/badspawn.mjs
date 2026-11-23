import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage();
await p.goto('http://localhost:8123/index.html?test&nopreview', {waitUntil:'load'});
console.log(await p.evaluate(async () => {
  document.querySelector('#map-sel [data-map="sunstone"]').click();
  await window.__start('offline');
  const g = window.__hoptown.game; const R = 0.38;
  const bad = [...g.map.spawns, ...g.map.teamSpawns.A, ...g.map.teamSpawns.B].filter(s => g.world.overlaps([s[0]-R, s[1]+0.05, s[2]-R], [s[0]+R, s[1]+1.7, s[2]+R]));
  return JSON.stringify(bad.map(s => [s, g.world.overlaps([s[0]-R, s[1]+0.05, s[2]-R], [s[0]+R, s[1]+1.7, s[2]+R])]));
}));
await b.close();
