import {it,expect,vi,afterEach} from 'vitest';
import {createHash} from 'node:crypto';
import {readScoreContext} from '../src/server/board-v9';
afterEach(()=>vi.unstubAllGlobals());
it('accepts verified context and rejects changed content or failed fetches',async()=>{
 const body={games:{},schema:'board-v9-context-v1'};
 const value={...body,content_sha256:createHash('sha256').update(JSON.stringify(body)).digest('hex')};
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>value});vi.stubGlobal('fetch',fetcher);
 expect(await readScoreContext()).toEqual(value);
 fetcher.mockResolvedValue({ok:true,json:async()=>({...value,games:{tampered:{}}})});
 expect(await readScoreContext()).toBeNull();
 fetcher.mockResolvedValue({ok:false});expect(await readScoreContext()).toBeNull();
});
