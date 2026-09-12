import fs from 'node:fs';
const colors=JSON.parse(fs.readFileSync(new URL('../tests/fixtures/game-card-colors.json',import.meta.url)));
function lum(h){const c=h.match(/[a-f0-9]{2}/ig).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
const pairs=[];for(const bg of ['#0B0F14','#121820'])for(const fg of ['#F2F4F7','#8B95A5','#D4AF37','#E5484D'])pairs.push([fg,bg]);pairs.push(['#0B0F14','#D4AF37']);for(const c of Object.values(colors))pairs.push(['#F2F4F7',c.color]);
let failures=0;for(const [a,b] of pairs){const v=(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);if(v<4.5){failures++;process.stderr.write(`${a} on ${b}: ${v} FAIL\n`);}}
console.log(JSON.stringify({pairs:pairs.length,passed:pairs.length-failures,failed:failures}));process.exitCode=failures?1:0;
