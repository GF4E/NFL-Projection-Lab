"""Prospective exact-run weather; asynchronous component updates are normal."""
import datetime as dt
import math
import urllib.parse
from engine.live_weather import get, now, MANIFEST, digest
from engine.pricing import timestamp


def common_run(metadata, current):
    run=min(m['last_run_initialisation_time'] for m in metadata)
    # Newer completed runs also establish a conservative availability bound
    # for the older common archived run. Do not claim its exact issue time.
    available=max(m['last_run_availability_time'] for m in metadata)
    if run>available or available>current.timestamp()-600:
        raise ValueError('GFS availability remains within the 10-minute replication window')
    return dt.datetime.fromtimestamp(run,dt.timezone.utc),dt.datetime.fromtimestamp(available,dt.timezone.utc)


def capture(game, folder):
    metadata=[];receipts=[]
    for domain in ('ncep_gfs013','ncep_gfs025'):
        m,r=get(f'https://api.open-meteo.com/data/{domain}/static/meta.json',folder)
        metadata.append(m);receipts.append(r)
    run,available=common_run(metadata,now())
    hour=timestamp(game['kickoff_at']).replace(minute=0,second=0,microsecond=0)
    params=dict(latitude=game['latitude'],longitude=game['longitude'],models='gfs_global',run=run.strftime('%Y-%m-%dT%H:%M'),hourly='wind_speed_10m,precipitation,temperature_2m',wind_speed_unit='mph',timezone='UTC',forecast_days=7)
    data,receipt=get('https://single-runs-api.open-meteo.com/v1/forecast?'+urllib.parse.urlencode(params),folder)
    units=data['hourly_units']
    if (units['wind_speed_10m'],units['precipitation'],units['temperature_2m'])!=('mp/h','mm','°C'):raise ValueError('Unexpected weather units')
    i=data['hourly']['time'].index(hour.strftime('%Y-%m-%dT%H:%M'))
    values=[data['hourly'][k][i] for k in ('wind_speed_10m','precipitation','temperature_2m')]
    if any(v is None or not math.isfinite(v) for v in values):raise ValueError('Missing forecast')
    return dict(event_id=game['game_id'],kickoff_at=game['kickoff_at'],roof=game['roof'],status='FORECAST',model='gfs_global',forecast_run_initialized_at=run.isoformat(),forecast_issued_at=available.isoformat(),issuance_basis='Conservative upper bound from completed GFS013/GFS025 availability; exact common archived run requested',component_initializations=[m['last_run_initialisation_time'] for m in metadata],request_at=receipt['request_at'],received_at=receipt['received_at'],valid_at=hour.isoformat(),wind_mph=values[0],precip_mm=values[1],temperature_c=values[2],source_sha256=receipt['sha256'],requests=receipts+[receipt],venue_manifest_sha256=digest(MANIFEST))


def qualified(forecast, game):
    """Evaluate every live refresh; only the T75 lock enters the paper record."""
    try:
        f=forecast
        return (f['status']=='FORECAST' and f['event_id']==game['game_id'] and
                timestamp(f['forecast_run_initialized_at'])<=timestamp(f['forecast_issued_at'])<=timestamp(f['request_at'])<=timestamp(f['received_at'])<=timestamp(game['cutoff_at']) and
                timestamp(f['forecast_issued_at'])+dt.timedelta(minutes=10)<=timestamp(f['request_at']) and
                timestamp(f['valid_at'])==timestamp(game['kickoff_at']).replace(minute=0,second=0,microsecond=0) and
                all(math.isfinite(float(f[k])) for k in ('wind_mph','precip_mm','temperature_c')) and bool(f['source_sha256']) and bool(f['requests']))
    except (KeyError,ValueError,TypeError):return False
