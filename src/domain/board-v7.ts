import type {ProjectionCardData} from './projection';
export type Bands=Record<'50'|'80',[number,number]>;
export type TeamEvidence={quantile_dots?:{value:number;mass:number;probability_lo:number;probability_hi:number}[];expected:number;actual:number|null;intervals:Bands;error:number|null;hits:Record<'50'|'80',boolean|null>;pit:number|null};
export type GameEvidence={interval_kind?:string;spread_model?:string;outdoors?:boolean|null;qualified_lock:boolean;distribution_hash?:string;teams:Partial<Record<'away'|'home',TeamEvidence>>};
export type Summary={teams:number;mae:number|null;inside80:number;eligible80:number;coverage:Record<'margin'|'total',Record<'50'|'80',{hit:number;n:number;rate:number|null}>>;pit:number[]};
export type Ranked={game_id:string;team:string;expected:number;actual:number;error:number;contributions:ProjectionCardData['contributions']['away']};
export type BoardEvidence={schema:string;board_sha256:string;games:Record<string,GameEvidence>;trust:Summary;weeks:{week:number;scope:string;engine:Summary;ours:Summary}[];closest:Ranked[];furthest:Ranked[];prior_seasons:{season:number;week:number;mae:number}[];reference:{oof_mae:number|null;climatology_mae:number|null;floor:number|null;floor_status:string};edits:{engine:Summary;ours:Summary;best_tags:{game_id:string;mae:number;tags:string[]}[];worst_tags:{game_id:string;mae:number;tags:string[]}[]}};
export type Lens='POINTS'|'ERROR';
export const integer=(n:number|null|undefined)=>n==null||!Number.isFinite(n)?'—':String(Math.sign(n)*Math.floor(Math.abs(n)+.5));
export const signed=(n:number)=>n>0?'+'+integer(n):integer(n);
export const position=(v:number,lens:Lens)=>(Math.max(lens==='POINTS'?0:-30,Math.min(lens==='POINTS'?45:30,v))-(lens==='POINTS'?0:-30))/(lens==='POINTS'?45:60)*100;
export function eligible(g:ProjectionCardData,e?:GameEvidence){return g.status==='FINAL'&&!!g.final&&!!e?.qualified_lock;}
export function emptyLabel(g:ProjectionCardData,e?:GameEvidence){return g.status==='MISSED'||g.evidence==='RETROSPECTIVE'||g.status==='FINAL'&&!e?.qualified_lock?'no lock':'not played';}
export function sortGames(games:ProjectionCardData[],e:Record<string,GameEvidence>,sort:string){const kickoff=(a:ProjectionCardData,b:ProjectionCardData)=>Date.parse(a.kickoff_at)-Date.parse(b.kickoff_at)||a.game_id.localeCompare(b.game_id);return [...games].sort((a,b)=>{if(sort==='kickoff')return kickoff(a,b);const aa=eligible(a,e[a.game_id]),bb=eligible(b,e[b.game_id]);if(aa!==bb)return aa?-1:1;if(!aa)return kickoff(a,b);const error=(g:ProjectionCardData)=>Math.max(...Object.values(e[g.game_id].teams).map(t=>Math.abs(t!.error??0)));return (sort==='descending'?-1:1)*(error(a)-error(b))||kickoff(a,b);});}
export function status(e?:GameEvidence){const t=Object.values(e?.teams??{});return !t.length||t.some(x=>x?.actual==null)?'interval unavailable':t.every(x=>x?.hits['50'])?'in 50%':t.every(x=>x?.hits['80'])?'in 80%':'outside 80%';}
export const text=(s:string)=>s.replace(/(-?\d+)\.\d+/g,x=>integer(Number(x)));

// Open the active/upcoming published slate, not a stale publication default.
// Keep a slate through its final scheduled game window, then advance.
export function currentBoardWeek(board: {default_week:number;games:{week:number;kickoff_at:string}[]}, now=Date.now()):number {
 const ends=new Map<number,number>();
 for(const game of board.games){const kickoff=Date.parse(game.kickoff_at);if(Number.isFinite(kickoff))ends.set(game.week,Math.max(ends.get(game.week)??-Infinity,kickoff+4*60*60*1000));}
 const weeks=[...ends].sort((a,b)=>a[0]-b[0]);
 return weeks.find(([,end])=>end>now)?.[0]??weeks.at(-1)?.[0]??board.default_week;
}
