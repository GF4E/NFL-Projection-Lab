import {it,expect,vi,afterEach} from 'vitest';
import {readProjection} from '../src/server/projection-board';
afterEach(()=>vi.unstubAllGlobals());
const board={schema:'projection-board-v1',published_at:'2026-09-13T20:00:00Z',games:[{game_id:'missing',status:'MISSED',projection:null}]};
function db(checked_at:number){const run=vi.fn().mockResolvedValue({});return {run,prepare:vi.fn(()=>({first:async()=>({payload:JSON.stringify(board),checked_at}),bind:()=>({run})}))};}
it('refreshes stale saved boards without requiring the refresh button and persists the newer board',async()=>{const next={...board,published_at:'2026-09-13T21:00:00Z'};const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>next});vi.stubGlobal('fetch',fetcher);const cache=db(0);expect(await readProjection(cache as never)).toEqual(next);expect(fetcher).toHaveBeenCalledOnce();expect(cache.run).toHaveBeenCalledOnce();});
it('keeps last-good data on failure and retries the next read',async()=>{const fetcher=vi.fn().mockRejectedValue(new Error('offline'));vi.stubGlobal('fetch',fetcher);const cache=db(0);expect(await readProjection(cache as never)).toEqual(board);expect(await readProjection(cache as never)).toEqual(board);expect(fetcher).toHaveBeenCalledTimes(2);expect(cache.run).not.toHaveBeenCalled();});
it('uses a recently checked cache without another request',async()=>{const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);expect(await readProjection(db(Date.now()) as never)).toEqual(board);expect(fetcher).not.toHaveBeenCalled();});
