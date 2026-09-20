import type {ProjectionCardData} from './projection';
import type {Bands,GameEvidence} from './board-v7';
export type ScoreContext={evidence?:GameEvidence;version:string;issued_at:string;as_of:string|null;points:Record<'home'|'away',number>;teams:Record<'home'|'away',{percentile:number|null;n:number;current_version_n:number;prior_season:boolean;sample_season:number;game_ids:string[];intervals:Bands}>;total:{percentile:number|null;n:number;game_ids:string[];interval50:[number,number]}};
export type ContextData={schema:'board-v9-context-v1';content_sha256:string;games:Record<string,ScoreContext>};
export const prediction=(g:ProjectionCardData)=>g.ours??g.projection;
export function projectedWinner(g:ProjectionCardData){const p=prediction(g);return !p||p.home_points===p.away_points?null:p.home_points>p.away_points?g.home:g.away;}
export function scoreContext(g:ProjectionCardData,data:ContextData|null){const c=data?.games[g.game_id],p=prediction(g);return c&&p&&c.version===g.version&&c.issued_at===g.issued_at&&c.points.home===p.home_points&&c.points.away===p.away_points?c:undefined;}
export function ordinal(n:number){const v=Math.round(n),m=v%100;return `${v}${m>=11&&m<=13?'th':v%10===1?'st':v%10===2?'nd':v%10===3?'rd':'th'}`;}
// Public football narrative cannot reintroduce removed comparison vocabulary.
const excluded=/\b(?:betmgm|caesars|fanduel|draftkings|pinnacle|sportsbook|book|line|lines|cover|covered|covering|over|under|disagreement|ats|odds|wager|betting)\b/i;
export function footballText(s:string){return !excluded.test(s);}
function cleanSheet(v:unknown):unknown{return Array.isArray(v)?v.map(cleanSheet):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>footballText(k.replaceAll('_',' '))).map(([k,x])=>[k,cleanSheet(x)])):typeof v==='string'&&!footballText(v)?'—':v;}
export function footballCard(g:ProjectionCardData):ProjectionCardData{return {...g,why:{lines:(g.why?.lines??[]).filter(footballText),against:footballText(g.why?.against??'')?g.why.against:'Against: No measured counterevidence recorded.'},entry:g.entry?{...g.entry,tags:g.entry.tags.filter(footballText)}:undefined,contributions:Object.fromEntries((['home','away'] as const).map(side=>[side,(g.contributions?.[side]??[]).filter(c=>footballText(c.input.replaceAll('_',' ')))])) as ProjectionCardData['contributions'],sheet:g.sheet?Object.fromEntries(Object.entries(g.sheet).filter(([,b])=>footballText(b.name)).map(([k,b])=>[k,{...b,teams:cleanSheet(b.teams) as Record<string,unknown>}])):undefined};}
