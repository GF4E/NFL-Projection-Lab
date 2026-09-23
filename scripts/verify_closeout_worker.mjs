// Read-only integration check in the installed hosting runtime, using real pinned artifacts.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {build}=await import(createRequire(require.resolve('vite/package.json')).resolve('esbuild'));
const {Miniflare}=await import(createRequire(require.resolve('wrangler/package.json')).resolve('miniflare'));
const result=await build({stdin:{contents:`
import {readCloseout,sha256} from './src/server/projection-closeout';
export default {async fetch(){
 const checks=[];
 for(const name of ['scorecard','season','trend']){
  const r=await readCloseout(name);
  if(!r?.bytes)throw Error('No indexed artifact');
  checks.push({artifact:name,receipt_sha256:r.meta.receipt_sha256,sha256:await sha256(r.bytes),bytes:r.bytes.length});
 }
 return Response.json({status:'PASS',checks});
}};`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser'});
const mf=new Miniflare({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-05-01'});
try{
 const response=await mf.dispatchFetch('http://localhost/verify-closeout');
 if(!response.ok)throw Error('Worker closeout verification failed: HTTP '+response.status);
 console.log(await response.text());
}finally{await mf.dispose()}
