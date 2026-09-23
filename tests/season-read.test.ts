import {it,expect,vi,afterEach} from 'vitest';
vi.mock('../src/server/projection-board',()=>({readProjection:async()=>({content_sha256:'new-board'})}));
vi.mock('../src/server/board-v9',()=>({readScoreContext:async()=>null}));
import {readBoardV7} from '../src/server/board-v7';
afterEach(()=>vi.unstubAllGlobals());
it('retains independently graded Season history across board publication changes',async()=>{
 const history={schema:'board-v7-evidence',board_sha256:'prior-board',prior_seasons:[{season:2025,week:1,mae:8}]};
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.includes('publication-index')?new Response('',{status:404}):Response.json(history)));
 const result=await readBoardV7({} as Pick<D1Database,'prepare'>);
 expect(result.evidence).toBeNull();expect(result.seasonEvidence).toEqual(history);
 expect(result.seasonPublication).toBe('LEGACY_UNINDEXED');
});
it('does not silently label legacy history as a verified closeout after an integrity failure',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.includes('publication-index')?Response.json({schema:'bad'}):Response.json({schema:'board-v7-evidence'})));
 const result=await readBoardV7({} as Pick<D1Database,'prepare'>);
 expect(result.seasonPublication).toBe('VERIFICATION_FAILED');expect(result.seasonEvidence).toBeNull();
});
