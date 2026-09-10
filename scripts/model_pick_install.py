"""Replace existing launchd capture target; add independent daily prepare/grade."""
import json
import os
import plistlib
import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PYTHON='/opt/anaconda3/bin/python3.12'

def install():
    output={}
    for label,script,interval in [('com.gabe.nfl-week1-t60','model_pick_runner.py',15),('com.gabe.nfl-model-pick-daily','model_pick_daily.py',3600)]:
        path=Path.home()/'Library/LaunchAgents'/(label+'.plist')
        archive=ROOT/'work/model-pick-v1'/('prior-'+label+'.plist')
        if path.exists() and not archive.exists():archive.write_bytes(path.read_bytes())
        config={'Label':label,'ProgramArguments':[PYTHON,'-B',str(ROOT/'scripts'/script)],'WorkingDirectory':str(ROOT),
                'EnvironmentVariables':{'GIT_TERMINAL_PROMPT':'0'},'StartInterval':interval,'RunAtLoad':True,'ProcessType':'Background',
                'StandardOutPath':str(Path.home()/'Library/Logs'/(label+'.log')),'StandardErrorPath':str(Path.home()/'Library/Logs'/(label+'.log'))}
        # Hourly wake checks an idempotent UTC-day marker, recovering after sleep.
        path.write_bytes(plistlib.dumps(config));(ROOT/'work/model-pick-v1'/(label+'.plist')).write_bytes(path.read_bytes())
        target='gui/'+str(os.getuid())
        subprocess.run(['launchctl','bootout',target+'/'+label],capture_output=True)
        subprocess.run(['launchctl','bootstrap',target,str(path)],check=True)
        result=subprocess.run(['launchctl','print',target+'/'+label],capture_output=True,text=True,check=True)
        output[label]=result.stdout
    return output

if __name__=='__main__':print(json.dumps(install(),indent=2))
