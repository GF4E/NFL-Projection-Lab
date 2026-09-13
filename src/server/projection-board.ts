import type {ProjectionBoardData} from '../domain/projection';
type DB=Pick<D1Database,'prepare'>;
export const PROJECTION_URL='https://raw.githubusercontent.com/GF4E/NFL-Projection-Lab/engine-v2/outputs/projection-v1/board.json';
export function validateProjection(b:unknown):ProjectionBoardData{
 const x=b as ProjectionBoardData;
 if(!x||x.schema!=='projection-board-v1'||!Number.isFinite(Date.parse(x.published_at))||!Array.isArray(x.games)||!x.games.length||new Set(x.games.map(g=>g.game_id)).size!==x.games.length)throw Error('Invalid projection artifact');
 for(const g of x.games){if(!g.projection){if(g.status!=='MISSED')throw Error('Missing projection');continue;}if(!g.display||![g.projection,g.display].every(p=>[p.home_points,p.away_points,p.margin,p.total,p.home_win_probability].every(Number.isFinite))||!['AS_ISSUED','RETROSPECTIVE'].includes(g.evidence)||!g.why.against.startsWith('Against:'))throw Error('Incomplete projection');}
 return x;
}
export function assertProjectionProgress(a:ProjectionBoardData,b:ProjectionBoardData){
 if(Date.parse(b.published_at)<Date.parse(a.published_at))throw Error('Older publication');
 for(const g of a.games.filter(g=>['LOCKED','FINAL'].includes(g.status))){const next=b.games.find(n=>n.game_id===g.game_id);if(!next||JSON.stringify(g.projection)!==JSON.stringify(next.projection)||JSON.stringify(g.ours)!==JSON.stringify(next.ours)||g.evidence!==next.evidence||g.grades&&JSON.stringify(g.grades)!==JSON.stringify(next.grades))throw Error('Frozen projection changed');}
}
async function download(){const r=await fetch(PROJECTION_URL+'?publication='+Date.now(),{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Projection source unavailable');return validateProjection(await r.json());}
export async function readProjection(db:DB,fresh=false){let prior:null|{payload:string}=null;try{prior=await db.prepare('SELECT payload FROM engine_projection_publication WHERE id=1').first<{payload:string}>();}catch{}if(prior&&!fresh)return validateProjection(JSON.parse(prior.payload));try{const b=await download();if(prior)assertProjectionProgress(validateProjection(JSON.parse(prior.payload)),b);return b;}catch(e){if(prior)return validateProjection(JSON.parse(prior.payload));throw e;}}
export async function refreshProjection(db:DB){const b=await download();const prior=await db.prepare('SELECT payload FROM engine_projection_publication WHERE id=1').first<{payload:string}>();if(prior)assertProjectionProgress(validateProjection(JSON.parse(prior.payload)),b);await db.prepare('INSERT INTO engine_projection_publication(id,payload,checked_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,checked_at=excluded.checked_at WHERE excluded.checked_at>=engine_projection_publication.checked_at').bind(JSON.stringify(b),Date.now()).run();}
