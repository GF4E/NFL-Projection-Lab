export const TAGS = ["QB_MATCHUP","COORDINATOR","TRENCHES","INJURY","SCHEME","SITUATIONAL","WEATHER","PRICE","YOUNG_QB_SUPPORT","RUSH_VS_EXPLOSIVE","MOMENTUM","CONTINUITY","REFEREE"];
export type Person = "Gabe" | "Jarrett";
export type Entry = {game_id:string;person:Person;spread:number;total:number;confidence:number;tags:string[];submitted_at:string;input_class:string;confidence_map:Record<string,number>;confidence_version:string};
export type Offer = {market:string;side:string;line:number;price:number;book:string};
export type Context = {offers:Offer[];captured_at:string;consensus:Record<string,{full:{center:number|null}}>};
export type Metric = {raw:number|null;adjusted:number|null;rank:number|null;n_games:number};
export type Team = {metrics:Record<string,Metric>;qb:Record<string,string|number|null>;composition:Record<string,{value?:number|null;n_games?:number;n?:number;wins?:number;status?:string}>;momentum:{value:number|null;components:Record<string,number|null>;n_games:number};support:{status:string};source_hashes:Record<string,string>};
export type Game = {game:{game_id:string;home_team:string;away_team:string;home_abbr:string;away_abbr:string;kickoff_at:string;cutoff_at:string;week:number};early_at:string;outside_view:string;sheet_status:string;teams:Record<string,Team>;context:Context|null;locks:{market:string;phase:string;locked_at:string;verdict:{verdict:string;side?:string;line?:number;book?:string;price?:number;stake_dollars?:number}}[]};
export type Score = {person:string;population:string;tag:string;week:string|number;phase:string;input_class:string;confidence:string|number;graded:number;wins:number;losses:number;pushes:number;hit_rate:number|null;mean_clv_points:number|null;brier_confidence:number|null;brier_number:number|null;better_predictor:string|null;confidence_status:string};
export type Calibration = {person:string;population:string;level:number;provisional:number;observed:number|null;posterior:number;n:number};
export type Board = {confidence_config:{version:string;people:Record<string,{provisional:Record<string,number>}>};schema:string;week:number;as_of:string;status:string;games:Game[];distribution:{targets:Record<string,{counts:Record<string,number>}>};distribution_hash:string;feedback:{rows:Score[];calibration:Calibration[]};confidence_maps:{version:string;calibration:Calibration[]}|null;source_hashes:Record<string,string>};
export function eligible(board:Board,person:Person):boolean {return board.feedback.rows.filter(r=>r.person===person&&r.tag==="ALL"&&r.week==="ALL"&&r.phase==="ALL"&&r.input_class==="ALL"&&r.confidence==="ALL").reduce((n,r)=>n+r.graded,0)>=50;}

export function validateEntry(v:Partial<Entry>):boolean {return Number.isFinite(v.spread)&&Math.abs(v.spread!)<=60&&Number.isFinite(v.total)&&v.total!>=0&&v.total!<=150&&Number.isInteger(v.confidence)&&v.confidence!>=1&&v.confidence!<=5&&Array.isArray(v.tags)&&v.tags.length>0&&v.tags.every(t=>TAGS.includes(t))&&new Set(v.tags).size===v.tags.length;}
// Mirrors the pinned integer PMF; only prices a human-entered location.
export type Pricing = Partial<Offer> & {market:string;status:string;gap?:number;stake_dollars?:number;fair_probability?:number;push?:number;EV?:number;edge_cents?:number;conflict?:boolean};
export function priceEntry(e:Entry,g:Game,b:Board):Pricing[] {
 return ["spreads","totals"].map(m=>{
 const c=g.context?.consensus[m].full.center;if(c===null||c===undefined)return {market:m,status:"AWAITING_CAPTURE"};
 const location=m==="spreads"?-e.spread:e.total,gap=location-c;
 if(gap===0)return {market:m,gap,status:"STORY",stake_dollars:0};
 const side=m==="spreads"?(gap>0?g.game.home_team:g.game.away_team):(gap>0?"Over":"Under");
 const counts=b.distribution.targets[m==="spreads"?"margin":"total"].counts,n=Object.values(counts).reduce((a,v)=>a+v,0),center=Math.sign(location)*Math.floor(Math.abs(location)+.5);
 const offers=(g.context?.offers||[]).filter(q=>q.market===m&&q.side===side).map(q=>{
 let win=0,push=0;for(const [r,count] of Object.entries(counts)){let x=center+Number(r);if(m==="totals")x=Math.max(0,x);const delta=m==="spreads"?(side===g.game.home_team?x:-x)+q.line:(x-q.line)*(side==="Over"?1:-1);if(delta>0)win+=count/n;else if(delta===0)push+=count/n;}
 const p=win/(1-push),profit=q.price>0?q.price/100:100/-q.price,EV=win*profit-(1-win-push),fair=p>=.5?-100*p/(1-p):100*(1-p)/p;
 const cents=(x:number)=>x>=100?x-100:x<=-100?x+100:x;
 return {...q,fair_probability:p,push,EV,edge_cents:cents(q.price)-cents(fair),stake_dollars:Math.min(100,1000*Math.max(0,(p*profit-(1-p))/profit)/4)};
 }).sort((a,z)=>z.EV-a.EV||z.book.localeCompare(a.book)||z.line-a.line);
 if(!offers.length)return {market:m,status:"NO_EXECUTABLE_PRICE",gap};
 const best=offers[0],level=[1,2,3,4,5].sort((a,z)=>Math.abs(e.confidence_map[a]-best.fair_probability)-Math.abs(e.confidence_map[z]-best.fair_probability)||a-z)[0];
 const band=Math.abs(gap)<1?"STORY":Math.abs(gap)<=2?"LEAN":"BET";
 return {...best,gap,status:band, ...(eligible(b,e.person)?{conflict:Math.abs(level-e.confidence)>1}: {})};
 });
}
