import type {LockedBoard} from './locked-board';
export type TicketLeg={game_id:string;market:'spread'|'total';side:string;line:number;price:number;book:string;captured_at:string};
export type TicketInput={id:string;type:'single'|'parlay'|'teaser';book:string;stake_cents:number;price?:number;record_class:'paper'|'executed';legs:TicketLeg[]};
export type Ticket=Omit<TicketInput,'legs'> & {price:number;locked_at:string;source:'human_ticket';status:'LOCKED';cutoff_at:number;board_hash:string;legs:(TicketLeg & {settlement_line:number;kickoff_at:string;home_abbr:string;away_abbr:string;week:number;season:number})[];price_basis:string};
export const ticketBooks:Record<string,string>={williamhill_us:'Caesars',betmgm:'BetMGM',fanduel:'FanDuel',draftkings:'DraftKings'};
export function ticketQuote(leg:TicketLeg,board:LockedBoard){const g=board.games.find(g=>g.game_id===leg.game_id);const q=g?.quote_pairs?.find(q=>q.market===leg.market&&q.side===leg.side&&q.point===leg.line&&q.americanPrice===leg.price&&q.book===leg.book&&q.capturedAt===leg.captured_at);return {g,q};}
export function validateTicket(input:TicketInput,board:LockedBoard,now:number):Ticket{
 if(!input||!/^[-a-zA-Z0-9]{16,80}$/.test(input.id)||!['single','parlay','teaser'].includes(input.type)||!ticketBooks[input.book]||!['paper','executed'].includes(input.record_class))throw Error('Invalid ticket.');
 if(!Number.isInteger(input.stake_cents)||input.stake_cents<=0||input.stake_cents>10000)throw Error('Stake must be greater than zero and at most $100 (2 units).');
 if(!Array.isArray(input.legs)||input.legs.length<1||input.legs.length>8||input.type==='single'&&input.legs.length!==1||input.type==='parlay'&&input.legs.length<2||input.type==='teaser'&&![2,3].includes(input.legs.length))throw Error('Choose one leg for a single, 2–8 for a parlay, or 2–3 for a six-point teaser.');
 const seen=new Set<string>();
 const legs=input.legs.map(l=>{
  const key=l.game_id+'|'+l.market;if(seen.has(key))throw Error('Only one side per game and market on a ticket.');seen.add(key);
  if(l.book!==input.book)throw Error('All legs must be available at the same book.');
  const {g,q}=ticketQuote(l,board);if(!g||!q)throw Error('A quote changed or is unavailable. Refresh the board and review the ticket.');
  const kickoff=Date.parse(g.kickoff_at),captured=Date.parse(q.capturedAt);
  if(g.status==='FINAL'||!Number.isFinite(kickoff)||now>=kickoff)throw Error('This game has started. Ticket locking is closed.');
  if(!Number.isFinite(captured)||now<captured||now-captured>3600000||board.publication_status==='STALE')throw Error('A selected quote is stale. Wait for the next scheduled capture.');
  if(!['spread','total'].includes(l.market)||!Number.isFinite(l.line)||!Number.isInteger(l.price)||Math.abs(l.price)<100)throw Error('Invalid leg.');
  return {game_id:l.game_id,market:l.market,side:l.side,line:l.line,price:l.price,book:l.book,captured_at:l.captured_at,settlement_line:input.type==='teaser'?l.line+(l.market==='spread'||l.side==='Under'?6:-6):l.line,kickoff_at:g.kickoff_at,home_abbr:g.home_abbr==='LA'?'LAR':g.home_abbr,away_abbr:g.away_abbr==='LA'?'LAR':g.away_abbr,week:g.week,season:g.season};
 });
 if(input.type==='teaser'&&new Set(legs.map(l=>l.game_id)).size!==legs.length)throw Error('Use different games for a teaser.');
 const price=input.type==='single'?legs[0].price:input.price;
 if(!Number.isInteger(price)||Math.abs(price!)<100||Math.abs(price!)>100000)throw Error('Enter the sportsbook’s actual ticket odds. Combined odds are not estimated.');
 return {id:input.id,type:input.type,book:input.book,stake_cents:input.stake_cents,record_class:input.record_class,legs,price:price!,locked_at:new Date(now).toISOString(),source:'human_ticket',status:'LOCKED',cutoff_at:Math.min(...legs.map(l=>Date.parse(l.kickoff_at))),board_hash:board.content_sha256,price_basis:input.type==='single'?'CAPTURED_SINGLE':'USER_ENTERED_BOOK_TICKET'};
}
