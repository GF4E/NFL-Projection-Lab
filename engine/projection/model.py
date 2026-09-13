"""Pure score arithmetic and deterministic fitted point contributions."""
import hashlib
import json
import math
from dataclasses import dataclass
import numpy as np


def baseline(offensive_ppd, opposing_defensive_ppd, offensive_drives, opposing_drives):
    values=(offensive_ppd,opposing_defensive_ppd,offensive_drives,opposing_drives)
    if not all(isinstance(v,(int,float)) and math.isfinite(v) and v>=0 for v in values):
        raise ValueError('Four measured nonnegative per-drive inputs required')
    return (offensive_ppd+opposing_defensive_ppd)/2 * (offensive_drives+opposing_drives)/2


def hash_value(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()


@dataclass(frozen=True)
class Fit:
    names: tuple
    means: tuple
    scales: tuple
    coefficients: tuple
    intercept: float
    penalty: float
    training_hash: str

    @property
    def fit_hash(self):
        return hash_value(self.__dict__)

    def predict(self, features):
        values=np.asarray([features[n] for n in self.names],dtype=float)
        if not np.isfinite(values).all():raise ValueError('Unqualified or missing features')
        terms=(values-np.asarray(self.means))/np.asarray(self.scales)*np.asarray(self.coefficients)
        contributions=[{'input':n,'points':float(v)} for n,v in zip(self.names,terms)]
        contributions.append({'input':'fitted_intercept','points':self.intercept})
        points=math.fsum(x['points'] for x in contributions)
        return {'points':points,'contributions':sorted(contributions,key=lambda x:(-abs(x['points']),x['input']))}


def fit(rows, names, penalty):
    """Caller supplies the registered population; input order cannot change a fit."""
    if penalty<=0 or not math.isfinite(penalty):raise ValueError('Positive ridge penalty required')
    rows=sorted(rows,key=lambda r:r['row_id'])
    if not rows or len({r['row_id'] for r in rows})!=len(rows):raise ValueError('Unique training rows required')
    names=tuple(names)
    x=np.asarray([[r['features'][n] for n in names] for r in rows],dtype=float)
    y=np.asarray([r['actual_points'] for r in rows],dtype=float)
    if not np.isfinite(x).all() or not np.isfinite(y).all():raise ValueError('Unqualified training values')
    means=x.mean(axis=0);scales=x.std(axis=0);scales=np.where(scales>0,scales,1.)
    z=(x-means)/scales;intercept=float(y.mean())
    coefficients=np.linalg.solve(z.T@z+np.eye(len(names))*penalty,z.T@(y-intercept))
    return Fit(names,tuple(means),tuple(scales),tuple(coefficients),intercept,float(penalty),hash_value(rows))
