import {readScoreContext} from './board-v9';
import {readProjection} from './projection-board';
import type {BoardEvidence} from '../domain/board-v7';
import {readCloseout} from './projection-closeout';
export async function readBoardV7(db:Pick<D1Database,'prepare'>){
 const [board,context]=await Promise.all([readProjection(db),readScoreContext()]);
 let current:BoardEvidence|null=null;
 try{
  const response=await fetch('https://raw.githubusercontent.com/GF4E/NFL-Projection-Lab/engine-v2/outputs/board-v7/evidence.json?t='+Date.now(),{signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(!response.ok)throw Error('Season artifact request failed');
  const seasonEvidence=await response.json() as BoardEvidence;
  if(seasonEvidence.schema!=='board-v7-evidence')throw Error('Season artifact schema rejected');
  // Season is a self-contained, version-pinned graded snapshot. A newer board
  // must not hide historical results; only board markers require its exact hash.
  current=seasonEvidence;
 }catch{/* Live-board markers can be missing independently of a closeout. */}
 const evidence=current?.board_sha256===board.content_sha256?current:null;
 try{
  const closeout=await readCloseout('season');
  return {board,context,evidence,seasonEvidence:closeout?.data??current,
   closeout:closeout?.meta??null,seasonPublication:closeout?'VERIFIED_CLOSEOUT':'LEGACY_UNINDEXED'};
 }catch{return {board,context,evidence,seasonEvidence:null,closeout:null,seasonPublication:'VERIFICATION_FAILED'}}
}
