"""Select accessible team colors from existing logo pixels; no image edits."""
from pathlib import Path
from collections import Counter
from PIL import Image
import hashlib,json
ROOT=Path(__file__).resolve().parents[1]
def luminance(rgb):
 c=[v/255 for v in rgb];c=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c];return sum(v*w for v,w in zip(c,[.2126,.7152,.0722]))
def run():
 colors={};text=luminance((242,244,247))
 for p in sorted((ROOT.parent/'nfl-board-main/public/team-logos').glob('*.png')):
  count=Counter(rgb[:3] for rgb in Image.open(p).convert('RGBA').getdata() if rgb[3]>240)
  eligible=[(rgb,n) for rgb,n in count.items() if max(rgb)-min(rgb)>20 and (text+.05)/(luminance(rgb)+.05)>=4.5]
  rgb=max(eligible,key=lambda x:x[1])[0] if eligible else (18,24,32)
  team={'wsh':'WAS','lar':'LA','oak':'LV','sd':'LAC','stl':'LA'}.get(p.stem,p.stem.upper())
  colors[team]={'color':'#'+''.join(f'{v:02X}' for v in rgb),'asset_sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
 (ROOT/'config/game_card_team_colors.json').write_text(json.dumps(colors,indent=2)+'\n')
if __name__=='__main__':run()
