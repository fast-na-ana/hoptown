import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage();
await p.setContent('<canvas id=c></canvas><script>const g=document.getElementById("c").getContext("webgl2");document.title=g?g.getParameter(g.VERSION):"nogl"</script>');
console.log(await p.title());
await b.close();
