"""Apply one shared team-points edit before cutoff; locked snapshots are immutable."""
import copy
import datetime as dt
from .distribution import summarize


def apply(base,entry,residuals,cutoff,locked=None):
    if locked is not None:return copy.deepcopy(locked)
    result=copy.deepcopy(base)
    if not entry:return result
    stamp=dt.datetime.fromisoformat(entry['entered_at'].replace('Z','+00:00'))
    deadline=dt.datetime.fromisoformat(cutoff.replace('Z','+00:00'))
    if stamp.tzinfo is None or deadline.tzinfo is None:raise ValueError('Timezone-qualified timestamps required')
    if stamp>=deadline or entry.get('post_lock'):
        result['post_lock']=True
        return result
    result.update(source='OURS',ours=summarize(entry['away_points'],entry['home_points'],residuals),confidence=entry.get('confidence'),tags=entry.get('tags',[]),post_lock=False)
    return result
