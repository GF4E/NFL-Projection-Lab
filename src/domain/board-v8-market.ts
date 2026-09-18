// Display-only DTOs. Never import this module into forecast or training code.
import type {ProjectionCardData} from './projection';
import {integer} from './board-v7';
export type BookRow={book:'Caesars'|'BetMGM';home_handicap:number;total:number;captured_at:string;cutoff_at:string;source_sha256:string;source_path:string};
export type BookTable={schema:'board-v8-market-display';version:string;content_sha256:string;games:Record<string,BookRow>};
export const columns=[152,86,26,86,86,14,96,72,26,52,56,96,24,270];
export const bookNumber=(n:number)=>Number.isInteger(n)?String(n):n.toFixed(1);
export const prediction=(g:ProjectionCardData)=>g.ours??g.projection;
export const spread=(g:ProjectionCardData,margin:number,book=false)=>`${margin>=0?g.home:g.away} −${book?bookNumber(Math.abs(margin)):integer(Math.abs(margin))}`;
export const et=(s:string)=>new Date(s).toLocaleString('en-US',{timeZone:'America/New_York',weekday:'short',hour:'numeric',minute:'2-digit'})+' ET';
export function comparison(g:ProjectionCardData,b?:BookRow){const p=prediction(g);return p&&b?{side:p.margin+b.home_handicap,total:p.total-b.total}:null;}
export function bar(gap:number){const width=Math.min(8,Math.abs(gap))*6;return {width,left:gap<0?48-width:48,strong:Math.abs(gap)>=2};}
export function lean(g:ProjectionCardData,gap:number|null|undefined,total=false){return gap==null||Math.abs(gap)<.5?'—':`${total?(gap>0?'OVER':'UNDER'):(gap>0?g.home:g.away)} ${total?'':'+'}${integer(Math.abs(gap))}`;}
export function outcome(g:ProjectionCardData,b?:BookRow){if(!g.final||!b)return '—';const margin=g.final.home_points-g.final.away_points+b.home_handicap,total=g.final.home_points+g.final.away_points;return `${margin===0?'SPREAD PUSH':(margin>0?g.home:g.away)+' covered'} · ${total===b.total?'TOTAL PUSH':total>b.total?'OVER':'UNDER'} ${integer(total)}`;}
export function qualifyingBook(g:ProjectionCardData,b?:BookRow){return b&&['Caesars','BetMGM'].includes(b.book)&&Number.isFinite(b.home_handicap)&&Number.isFinite(b.total)&&Date.parse(b.captured_at)<Date.parse(g.cutoff_at)&&Date.parse(b.captured_at)<=Date.now()?b:undefined;}
