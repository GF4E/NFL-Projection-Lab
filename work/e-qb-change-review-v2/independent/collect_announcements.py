from pathlib import Path
import requests,json,hashlib,datetime,re
from bs4 import BeautifulSoup
OUT=Path(__file__).parent
rows=[
('2025_02_SF_NO','SF','Mac Jones','2025-09-12','BACKUP','https://www.49ers.com/news/purdy-fuera-por-lesion-trent-williams-y-jauan-jennings-cuestionables-y-mac-jones-sera-titular-contra-los-saints','Team announces Purdy out and Jones starting against Saints.'),
('2025_03_CIN_MIN','MIN','Carson Wentz','2025-09-17','BACKUP','https://www.vikings.com/news/carson-wentz-quarterback-1st-vikings-start-bengals-week-3','Team previews Wentz first Vikings start with McCarthy injured.'),
('2025_03_LV_WAS','WAS','Marcus Mariota','2025-09-19','BACKUP','https://www.commanders.com/news/game-status-commanders-raiders-week-3','Daniels ruled out; coach confirms backup Mariota starts versus Raiders.'),
('2025_03_NYJ_TB','NYJ','Tyrod Taylor','2025-09-17','BACKUP','https://www.newyorkjets.com/news/justin-fields-out-vs-buccaneers-tyrod-taylor-named-starting-quarterback-week-3','Coach rules Fields out and names Taylor starter against Buccaneers.'),
('2025_04_WAS_ATL','WAS','Marcus Mariota','2025-09-26','BACKUP','https://www.commanders.com/news/game-status-commanders-falcons-week-4','Daniels ruled out for second straight week; Mariota to start. CONTRADICTS frozen schedule Daniels identity.'),
('2025_04_JAX_SF','SF','Brock Purdy','2025-09-26','RETURNING_STARTER','https://www.49ers.com/news/brock-purdy-cleared-to-start-injury-report-ahead-of-jaxvssf','Purdy cleared and will start against Jaguars following absence.'),
('2025_05_MIN_CLE','CLE','Dillon Gabriel','2025-10-01','BACKUP','https://www.clevelandbrowns.com/news/dillon-gabriel-named-starting-quarterback-ahead-of-week-5','Previously named backup Gabriel promoted to first NFL start versus Vikings.'),
('2025_06_ARI_IND','ARI','Jacoby Brissett','2025-10-12','BACKUP','https://www.azcardinals.com/news/kyler-murray-inactive-for-cardinals-against-colts-jacoby-brissett-to-start-at-qb','Murray inactive; Brissett will start. Same-day published08:30 updated09:46 site-local; requires timestamp bounds, not date-only qualification.'),
('2025_08_CHI_BAL','BAL','Tyler Huntley','2025-10-25','BACKUP','https://www.baltimoreravens.com/news/lamar-jackson-downgraded-rules-out-bears-tyler-huntley','Jackson out; article explicitly says Harbaugh announced Huntley start.'),
('2025_09_BAL_MIA','BAL','Lamar Jackson','2025-10-30','RETURNING_STARTER','https://www.baltimoreravens.com/news/lamar-jackson-active-ravens-dolphins-thursday-night-football-2025','Jackson active after three missed games; Huntley backup. Published same day18:55 site-local; verify UTC metadata before T75 qualification.'),
('2025_09_MIN_DET','MIN','J.J. McCarthy','2025-10-29','RETURNING_STARTER','https://www.vikings.com/news/jj-mccarthy-starting-quarterback-lions-return-ankle-injury-week-9-2025','Team previews McCarthy first action since ankle injury, returning versus Lions.'),
('2025_09_NO_LA','NO','Tyler Shough','2025-10-28','BACKUP','https://www.neworleanssaints.com/news/tyler-shough-quarterback-nfl-starters-week-9-2025-new-orleans-saints-vs-los-angeles-rams','Rookie replacing benched Rattler named starter for Rams.'),
('2025_12_PIT_CHI','PIT','Mason Rudolph','2025-11-23','BACKUP','https://www.steelers.com/news/rudolph-to-start-at-qb-vs-bears','Tomlin confirms Rudolph starting with Rodgers out. Same-day11:12 site-local; verify timestamp metadata.'),
('2025_12_CLE_LV','CLE','Shedeur Sanders','2025-11-19','BACKUP','https://www.clevelandbrowns.com/news/shedeur-sanders-to-start-week-12-against-the-raiders','Coach announces Sanders first NFL start while Gabriel in concussion protocol.'),
('2025_13_CIN_BAL','CIN','Joe Burrow','2025-11-26','RETURNING_STARTER','https://www.bengals.com/news/joe-burrow-returns-thanksgiving-baltimore-ravens','Burrow activated and installed as Thanksgiving quarterback after75dayabsence.'),
('2025_13_MIN_SEA','MIN','Max Brosmer','2025-11-28','BACKUP','https://www.vikings.com/news/max-brosmer-quarterback-1st-nfl-start-seahawks-week-13','Brosmer will start with McCarthy still in concussion protocol.'),
('2025_13_BUF_PIT','PIT','Aaron Rodgers','2025-11-28','RETURNING_STARTER','https://www.steelers.com/news/tomlin-said-it-s-all-systems-go-for-rodgers','Rodgers cleared for Bills after missed Bears game.'),
('2025_15_NYJ_JAX','NYJ','Brady Cook','2025-12-13','BACKUP','https://www.newyorkjets.com/news/brady-cook-jets-starting-quarterback-vs-jaguars-12-12-2025','Taylor and Fields out; coach announces Cook first NFL start.'),
('2025_16_NYJ_NO','NYJ','Brady Cook','2025-12-18','CONTINUING_STARTER','https://www.newyorkjets.com/news/brady-cook-eager-for-another-opportunity-to-lead-jets-offense-12-17-2025','Cook confirmed for secondstraightstart in NewOrleans. CONTRADICTS frozen schedule Taylor identity.'),
('2025_18_IND_HOU','IND','Riley Leonard','2025-12-31','BACKUP','https://www.colts.com/news/colts-to-start-riley-leonard-at-quarterback-for-week-18-game-vs-houston-texans-anthony-richardson-sr-will-not-be-activated-off-injured-reserve','Coach names Leonard starter versus Texans replacing Rivers.')]
results=[]
for gid,team,qb,date,role,url,support in rows:
 r=requests.get(url,timeout=40);soup=BeautifulSoup(r.text,'html.parser');metas={m.get('property') or m.get('name'):m.get('content') for m in soup.find_all('meta') if m.get('content') and any(k in str(m).lower() for k in ['published','modified','date','time'])};j=[]
 for el in soup.find_all('script',type='application/ld+json'):
  try:
   z=json.loads(el.get_text());j.append({k:z.get(k) for k in ['@type','headline','url','datePublished','dateModified']})
  except ValueError:j.append({'parse_error':True});results.append({'game_id':gid,'team':team,'qb_name':qb,'published_date':date,'role':role,'url':url,'support':support,'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'http_status':r.status_code,'response_sha256':hashlib.sha256(r.content).hexdigest(),'timestamp_metadata':metas,'structured_metadata':j,'qualification':'DATE_ONLY_CONSERVATIVE_BOUND_OR_VERIFIED_METADATA_REQUIRED','not_earliest_announcement_claim':True})
(OUT/'primary-announcements.json').write_text(json.dumps(results,indent=2)+'\n');print('records',len(results));print([(r['game_id'],r['timestamp_metadata']) for r in results if r['game_id'] in ['2025_06_ARI_IND','2025_09_BAL_MIA','2025_12_PIT_CHI']])
