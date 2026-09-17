"""Isolated E-UNC scoring and paired-member primitives; not a live model."""
import math

def _values(values):
 values=sorted(float(x) for x in values)
 if not values or not all(math.isfinite(x) for x in values):raise ValueError('Finite nonempty ensemble required')
 return values

def crps(values,actual):
 x=_values(values);n=len(x)
 if not math.isfinite(actual):raise ValueError('Finite actual required')
 return sum(abs(v-actual) for v in x)/n-sum((2*i-n+1)*v for i,v in enumerate(x))/(n*n)

def quantile(values,p):
 x=_values(values)
 if not 0<=p<=1:raise ValueError('Probability outside [0,1]')
 return x[max(0,math.ceil(p*len(x)-1e-12)-1)]

def interval_score(lo,hi,actual,level):
 if not 0<level<1 or lo>hi or not all(math.isfinite(v) for v in (lo,hi,actual)):raise ValueError('Invalid interval')
 return hi-lo+2/(1-level)*(max(lo-actual,0)+max(actual-hi,0))

def coverage(lo,hi,actual):return int(lo<=actual<=hi)

def brier(probability,outcome):
 if not 0<=probability<=1 or outcome not in (0,.5,1):raise ValueError('Invalid probability/outcome')
 return (probability-outcome)**2

def pit(values,actual):
 x=_values(values);return (sum(v<actual for v in x)+.5*sum(v==actual for v in x))/len(x)

def joint_targets(pairs):
 pairs=[(float(h),float(a)) for h,a in pairs]
 if not pairs or not all(math.isfinite(v) for pair in pairs for v in pair):raise ValueError('Finite paired members required')
 margin=[h-a for h,a in pairs]
 return {'home':[h for h,a in pairs],'away':[a for h,a in pairs],'margin':margin,'total':[h+a for h,a in pairs],'home_win_probability':(sum(m>0 for m in margin)+.5*sum(m==0 for m in margin))/len(margin),'tie_probability':sum(m==0 for m in margin)/len(margin)}

def quantile_dots(values):
 return [{'probability_lo':i/10,'probability_hi':(i+1)/10,'mass':.1,'value':quantile(values,(i+.5)/10)} for i in range(10)]

def predictive_variance(parameter_draws,residual_variance):
 """Law of total variance for independent, centered residual noise; synthetic diagnostic."""
 x=_values(parameter_draws)
 if not math.isfinite(residual_variance) or residual_variance<0:raise ValueError('Nonnegative residual variance required')
 mean=sum(x)/len(x);parameter=sum((v-mean)**2 for v in x)/len(x)
 return {'parameter':parameter,'residual':residual_variance,'predictive':parameter+residual_variance}
