"""Plot cached E1 verification only; never fits or refreshes sources."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'work/projection-governance-v2/e1'

def run():
    report=json.loads((OUT/'verification.json').read_text())
    names=['linear','k4','k8','state_space'];colors=['#4b5563','#2563eb','#d97706','#7c3aed']
    fig,axes=plt.subplots(3,1,figsize=(12,8),layout='constrained')
    for ax,target in zip(axes,['team','margin','total']):
        for i,(name,color) in enumerate(zip(names,colors)):
            counts=np.array(report['pooled'][name][target]['pit_histogram'])
            ax.bar(np.arange(10)+(i-1.5)*.19,counts/counts.sum(),width=.18,label=name,color=color)
        ax.axhline(.1,color='black',linewidth=1,linestyle='--',label='Uniform reference')
        ax.set(title=target.title()+' PIT',ylabel='Fraction of forecasts',xticks=np.arange(10),xticklabels=[f'{i/10:.1f}–{(i+1)/10:.1f}' for i in range(10)])
        ax.spines[['top','right']].set_visible(False)
    axes[0].legend(ncol=5,frameon=False,fontsize=9)
    fig.suptitle('E1 • 2016–2025 historical development forecasts',fontsize=15)
    fig.savefig(OUT/'pit-histograms.png',dpi=150);plt.close(fig)
    weekly=report['weekly'];keys=sorted(weekly['linear'],key=lambda key:tuple(map(int,key.split('-w'))))
    fig,ax=plt.subplots(figsize=(14,4),layout='constrained')
    ax.plot([weekly['linear'][key]['team']['actual_sd'] for key in keys],color='black',linewidth=1.2,label='Actual score SD',alpha=.7)
    for name,color in zip(names,colors):ax.plot([weekly[name][key]['team']['projected_sd'] for key in keys],color=color,label=name,linewidth=1)
    ticks=[i for i,key in enumerate(keys) if key.endswith('-w1')]
    ax.set(xticks=ticks,xticklabels=[keys[i].split('-')[0] for i in ticks],ylabel='Team points: population SD',title='Weekly projected versus actual score dispersion • paired games')
    ax.spines[['top','right']].set_visible(False);ax.legend(ncol=5,frameon=False)
    fig.savefig(OUT/'weekly-dispersion.png',dpi=150);plt.close(fig)

if __name__=='__main__':run()
