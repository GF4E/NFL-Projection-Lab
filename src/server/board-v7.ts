import {readScoreContext} from './board-v9';
import {readProjection} from './projection-board';
import type {BoardEvidence} from '../domain/board-v7';
export async function readBoardV7(db:Pick<D1Database,'prepare'>){
 const [board,context]=await Promise.all([readProjection(db),readScoreContext()]);
 try{
  const response=await fetch('https://raw.githubusercontent.com/GF4E/NFL-Projection-Lab/engine-v2/outputs/board-v7/evidence.json?t='+Date.now(),{signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(!response.ok)throw Error('Season artifact request failed');
  const seasonEvidence=await response.json() as BoardEvidence;
  if(seasonEvidence.schema!=='board-v7-evidence')throw Error('Season artifact schema rejected');
  // Season is a self-contained, version-pinned graded snapshot. A newer board
  // must not hide historical results; only board markers require its exact hash.
  return {board,context,evidence:seasonEvidence.board_sha256===board.content_sha256?seasonEvidence:null,seasonEvidence};
 }catch{return {board,context,evidence:null,seasonEvidence:null}}
}
