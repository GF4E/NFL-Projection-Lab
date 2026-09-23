// Exact-byte source/cache/response qualification in real workerd and isolated D1.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {build}=await import(createRequire(require.resolve('vite/package.json')).resolve('esbuild'));
const {Miniflare}=await import(createRequire(require.resolve('wrangler/package.json')).resolve('miniflare'));
const result=await build({stdin:{contents:`
import {projectionResponse,PROJECTION_URL} from './src/server/projection-board';
async function sha(b){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');}
export default {async fetch(request,env){
 const upstream=await fetch(PROJECTION_URL,{redirect:'manual'});if(upstream.status!==200)throw Error('No source');
 const original=await upstream.text();const parsed=JSON.parse(original);const legacy=JSON.stringify({...parsed,games:parsed.games.slice(0,1),scorecards:[]});
 await env.DB.prepare('INSERT INTO engine_projection_publication(id,payload,checked_at) VALUES(1,?,0)').bind(legacy).run();
 const response=await projectionResponse(env.DB,true);if(response.status!==200)throw Error('Response failed');
 const served=await response.text();if(served!==original)throw Error('Source bytes changed');
 const row=await env.DB.prepare('SELECT payload FROM engine_projection_publication WHERE id=2').first();
 if(!row?.payload.startsWith('gzip-json-v1:'))throw Error('Raw cache not retained');
 const warm=await projectionResponse(env.DB);if(await warm.text()!==original)throw Error('Warm cache changed');
 const old=await env.DB.prepare('SELECT payload FROM engine_projection_publication WHERE id=1').first();
 if(old.payload!==legacy)throw Error('Legacy row changed');
 return Response.json({status:'PASS',source_sha256:await sha(new TextEncoder().encode(original)),served_sha256:await sha(new TextEncoder().encode(served)),bytes:new TextEncoder().encode(original).length,cache_bytes:row.payload.length,warm_cache_exact:true,legacy_preserved:true});
}};`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser'});
const mf=new Miniflare({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-05-01',d1Databases:['DB']});
try{const db=await mf.getD1Database('DB');await db.prepare('CREATE TABLE engine_projection_publication(id INTEGER PRIMARY KEY,payload TEXT,checked_at INTEGER)').run();const response=await mf.dispatchFetch('http://localhost/verify');if(!response.ok)throw Error('Worker verification failed: '+response.status+' '+await response.text());console.log(await response.text());}finally{await mf.dispose();}
