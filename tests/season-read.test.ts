import {it,expect,vi,afterEach} from 'vitest';
vi.mock('../src/server/projection-board',()=>({readProjection:async()=>({content_sha256:'new-board'})}));
import {readBoardV7} from '../src/server/board-v7';
afterEach(()=>vi.unstubAllGlobals());
it('retains independently graded Season history across board publication changes',async()=>{
 const history={schema:'board-v7-evidence',board_sha256:'prior-board',prior_seasons:[{season:2025,week:1,mae:8}]};
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>history}));
 const result=await readBoardV7({} as Pick<D1Database,'prepare'>);
 expect(result.evidence).toBeNull();expect(result.seasonEvidence).toEqual(history);
});
