"""Grade confirmed slips from cached daily finals, without provider requests."""
import sys,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from engine.slip_grade import run
if __name__=='__main__':print(json.dumps(run()))
