import {afterEach,expect,it,vi} from 'vitest';
import {closeoutResponse,readCloseout,sha256} from '../src/server/projection-closeout';

afterEach(()=>vi.unstubAllGlobals());
const bytes=(x:unknown)=>new TextEncoder().encode(JSON.stringify(x,null,2)+'\n');
async function fixture(){
 const folder='outputs/cadence-v2/weeks/2026-w2/';
 const body={scorecard:bytes({season:2026,week:2,scorecard:{team_points_mae:8.836376140888}}),trend:bytes({schema:'projection-trend-v1'}),season:bytes({schema:'board-v7-evidence',board_sha256:'original'})};
 const artifacts:Record<string,string>={};for(const [name,data] of Object.entries(body))artifacts[folder+name+'.json']=await sha256(data);
 const receipt={schema:'closeout-publication-v2',state:'PUBLISHED',all_games_graded:true,season:2026,week:2,published_at:'2026-09-22T13:04:14Z',source_commit:'a'.repeat(40),publication_surface:'source_repository',artifacts};
 const ref={season:2026,week:2,published_at:receipt.published_at,receipt_path:'outputs/cadence-v2/closeouts/2026-09-22.json',receipt_sha256:await sha256(bytes(receipt)),receipt_source_commit:'b'.repeat(40)};
 const index={schema:'closeout-index-v1',latest:'2026-w2',releases:{'2026-w2':ref}};
 const fetcher=vi.fn(async(url:string)=>{
  if(url.includes('publication-index'))return new Response(bytes(index));
  if(url.includes('/closeouts/'))return new Response(bytes(receipt));
  const name=url.split('/').at(-1)!.replace('.json','') as keyof typeof body;
  return new Response(body[name]);
 });vi.stubGlobal('fetch',fetcher);return {body,receipt,ref,index,fetcher};
}
it('serves original bytes and follows the exact receipt/artifact commits',async()=>{
 const f=await fixture();const result=await closeoutResponse(new Request('https://site/api/closeout/2026-w2/scorecard.json'));
 expect(result.status).toBe(200);expect(new Uint8Array(await result.arrayBuffer())).toEqual(f.body.scorecard);
 expect(result.headers.get('x-closeout-receipt-sha256')).toBe(f.ref.receipt_sha256);
 const urls=f.fetcher.mock.calls.map(c=>c[0]);expect(urls[1]).toContain('/'+f.ref.receipt_source_commit+'/');expect(urls[2]).toContain('/'+f.receipt.source_commit+'/');
});
it('rejects changed artifact bytes without emitting a false success',async()=>{
 const f=await fixture();f.body.scorecard=bytes({season:2026,week:2,changed:true});
 expect((await closeoutResponse(new Request('https://site/api/closeout/latest/scorecard.json'))).status).toBe(503);
});
it('rejects changed receipts and path traversal even when a new hash is supplied',async()=>{
 const f=await fixture();f.receipt.artifacts['outputs/private.json']='c'.repeat(64);
 await expect(readCloseout('scorecard')).rejects.toThrow('receipt hash');
 f.ref.receipt_sha256=await sha256(bytes(f.receipt));
 await expect(readCloseout('scorecard')).rejects.toThrow('artifact paths');
});
it('an absent first index is distinct from denied or unavailable access',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:404})));
 expect(await readCloseout('season')).toBeNull();
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:403})));
 await expect(readCloseout('season')).rejects.toThrow('source request');
});
it('rejects a regressed latest pointer and a requested unpublished week',async()=>{
 const f=await fixture();f.index.latest='2026-w1';await expect(readCloseout('season')).rejects.toThrow('latest pointer');
 f.index.latest='2026-w2';await expect(readCloseout('season','2026-w1')).rejects.toThrow('not published');
});
it('never fetches arbitrary keys or accepts writes',async()=>{
 const f=await fixture();await expect(readCloseout('season','../private')).rejects.toThrow('Invalid');
 expect((await closeoutResponse(new Request('https://site/api/closeout/latest/scorecard.json',{method:'POST'}))).status).toBe(405);
 expect(f.fetcher).not.toHaveBeenCalled();
});
it('bounds upstream reads before parsing or acknowledging content',async()=>{
 const f=await fixture();f.body.scorecard=new Uint8Array(8*1024*1024+1);
 await expect(readCloseout('scorecard')).rejects.toThrow('exceeds limit');
});
