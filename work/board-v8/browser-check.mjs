import {chromium} from '/Users/gabe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const logs=[];const page=await browser.newPage();page.on('pageerror',e=>logs.push(e.message));const path='work/board-v8/team-stack-screenshots/';fs.mkdirSync(path,{recursive:true});
const columns=[152,86,26,86,86,14,96,72,26,52,56,96,24,270];
for(const width of [1280,390,360]){
 await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:5188/');await page.getByRole('button',{name:'SF at LA',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'overflow '+width);
 for(const matchup of await page.locator('.v8-matchup:visible').all()){const parts=matchup.locator('.v8-matchup-part');assert.deepEqual(await parts.evaluateAll(es=>es.map(e=>e.dataset.side)),['away','home']);const boxes=await parts.evaluateAll(es=>es.map(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom})));assert.ok(boxes[1].top>=boxes[0].bottom,'home below away');await matchup.locator('img').evaluateAll(es=>Promise.all(es.map(e=>e.decode())));assert.ok(await matchup.locator('img').evaluateAll(es=>es.every(e=>e.naturalWidth>0&&e.getBoundingClientRect().width===24)),'logos loaded');}
 const order=await page.locator('[data-game-id]').evaluateAll(els=>els.map(x=>x.dataset.gameId));
 if(width===1280){for(const row of await page.locator('.v8-desktop').all()){assert.deepEqual(await row.locator(':scope > .v8-cell').evaluateAll(els=>els.map(x=>x.getBoundingClientRect().width)),columns);}assert.equal(await page.locator('.v8-row').first().evaluate(e=>e.getBoundingClientRect().height),64);const fill=page.locator('[data-game-id="final"] .v8-gap-fill');assert.equal(await fill.evaluate(e=>e.getBoundingClientRect().width),12);assert.equal(await fill.evaluate(e=>parseFloat(e.style.left)),36);}
 else assert.equal(await page.locator('.v8-row').first().evaluate(e=>e.getBoundingClientRect().height),132);
 const predicted=page.locator('[data-game-id="final"] .v8-code[data-team="LA"]').filter({visible:true}).first(),actual=page.locator('[data-game-id="final"] .v8-code[data-team="SF"]').filter({visible:true}).first();assert.equal(await predicted.evaluate(e=>getComputedStyle(e).fontWeight),'700');assert.equal(await actual.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(242, 244, 247)');assert.equal(await actual.evaluate(e=>getComputedStyle(e).fontWeight),'500');
 if(width!==360){await page.screenshot({path:path+'table-'+width+'.png',fullPage:true});await page.locator('[data-game-id="missing"]').screenshot({path:path+'no-book-'+width+'.png'});}
 await page.getByRole('button',{name:'ERROR',exact:true}).click();assert.deepEqual(await page.locator('[data-game-id]').evaluateAll(els=>els.map(x=>x.dataset.gameId)),order);if(width!==360)await page.screenshot({path:path+'error-'+width+'.png',fullPage:true});
 await page.getByRole('button',{name:'SCORES',exact:true}).click();await page.getByRole('button',{name:'SF at LA',exact:true}).click();assert.equal(await page.locator('[data-quantile]').count(),20);assert.equal(await page.locator('[data-observed]').count(),2);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'expanded overflow '+width);if(width!==360)await page.screenshot({path:path+'expanded-'+width+'.png',fullPage:true});
}
await page.setViewportSize({width:1280,height:900});await page.goto('http://127.0.0.1:5188/?live');await page.locator('.v8-row').first().waitFor();await page.screenshot({path:path+'actual-week2-1280.png',fullPage:true});
await page.goto('http://127.0.0.1:5188/?thresholds');await page.locator('[data-game-id="near"]').waitFor();
for(const [id,expected,opacity] of [['final','rgb(242, 244, 247)','1'],['near','rgb(110, 120, 133)','0.55']]){
 const row=page.locator('[data-game-id="'+id+'"] .v8-desktop');
 assert.deepEqual(await row.locator('.v8-lean').evaluateAll(els=>els.map(e=>getComputedStyle(e).color)),[expected,expected]);
 assert.equal(await row.locator('.v8-gap-fill').evaluate(e=>getComputedStyle(e).backgroundColor),expected);
 assert.equal(await row.locator('.v8-gap-fill').evaluate(e=>getComputedStyle(e).opacity),opacity);
}
assert.deepEqual(logs,[]);console.log(JSON.stringify({widths:[1280,390,360],columnWidths:columns,tests:'PASS',consoleErrors:logs}));await browser.close();
