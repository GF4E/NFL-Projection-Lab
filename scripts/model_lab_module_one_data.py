#!/usr/bin/env python3
"""Point-in-time data builder for Model Laboratory Module 1.

The public API is :func:`build_module_one_dataset`.  It downloads only the
three source families frozen in ``model-lab-module-one.config.json``, retains
their original bytes in a content-addressed cache, and projects every CSV
through a positive column allowlist at read time.  Sportsbook and pick-process
fields are never materialized in a pandas frame.

Historical weekly availability is reconstructed from season and week labels.
It is therefore explicitly labelled ``inferred`` rather than represented as an
original publication-time archive.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import ssl
import tempfile
from dataclasses import dataclass
from datetime import datetime, time, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd


SCHEDULE_URL = "https://github.com/nflverse/nfldata/raw/master/data/games.csv"
PBP_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/pbp/"
    "play_by_play_{season}.csv.gz"
)
WEEKLY_ROSTER_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/"
    "roster_weekly_{season}.csv"
)
HISTORICAL_AVAILABILITY = "inferred_from_season_week_not_original_publication_time"
TEAM_ALIASES = {
    "LA": "LAR",
    "SL": "LAR",
    "STL": "LAR",
    "SD": "LAC",
    "OAK": "LV",
    "JAC": "JAX",
    "ARZ": "ARI",
    "BLT": "BAL",
    "CLV": "CLE",
    "HST": "HOU",
}


@dataclass(frozen=True)
class SourceSnapshot:
    """One immutable source object and its positive projection metadata."""

    logical_name: str
    url: str
    sha256: str
    projected_sha256: str
    byte_count: int
    row_count: int
    projected_columns: tuple[str, ...]
    cache_path: str
    downloaded_at: str
    historical_availability: str = HISTORICAL_AVAILABILITY


@dataclass(frozen=True)
class ModuleOneDataset:
    """Leakage-safe historical games and raw team-game observations.

    ``feature_names`` contains unprefixed feature names.  For every name ``f``,
    ``games`` contains numeric columns ``home_f`` and ``away_f``.  Score targets
    remain in the same game-indexed frame for alignment, but are listed
    separately in ``target_columns`` and never appear in ``feature_names``.
    ``team_games`` contains unpooled raw numerators and denominators.
    """

    games: pd.DataFrame
    team_games: pd.DataFrame
    feature_names: tuple[str, ...]
    target_columns: tuple[str, ...]
    source_manifest: tuple[SourceSnapshot, ...]
    source_hash: str
    data_hash: str
    feature_schema_hash: str
    config_hash: str
    exclusions: Mapping[str, int]
    missingness: pd.DataFrame
    historical_availability: str = HISTORICAL_AVAILABILITY

    def numpy_arrays(self) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """Return aligned home inputs, away inputs, home targets, and away targets."""

        home = self.games[[f"home_{name}" for name in self.feature_names]].to_numpy(
            dtype=float
        )
        away = self.games[[f"away_{name}" for name in self.feature_names]].to_numpy(
            dtype=float
        )
        return (
            home,
            away,
            self.games["actual_home_score"].to_numpy(dtype=float),
            self.games["actual_away_score"].to_numpy(dtype=float),
        )


@dataclass(frozen=True)
class _CachedObject:
    logical_name: str
    url: str
    sha256: str
    byte_count: int
    path: Path
    downloaded_at: str


def _json_default(value: Any) -> Any:
    if isinstance(value, (np.integer, np.floating)):
        return value.item()
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()
    if isinstance(value, tuple):
        return list(value)
    raise TypeError(f"unsupported value for deterministic JSON: {type(value)!r}")


def _stable_json_hash(value: Any) -> str:
    payload = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        default=_json_default,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _hash_dataframe(frame: pd.DataFrame, sort_columns: Sequence[str] = ()) -> str:
    """Hash a projected frame without depending on ignored source columns."""

    columns = sorted(str(column) for column in frame.columns)
    canonical = frame.loc[:, columns].copy()
    available_sort = [column for column in sort_columns if column in canonical.columns]
    if available_sort:
        canonical = canonical.sort_values(available_sort, kind="mergesort", na_position="last")
    canonical = canonical.reset_index(drop=True)
    digest = hashlib.sha256()
    digest.update(
        json.dumps(
            [(column, str(canonical[column].dtype)) for column in columns],
            separators=(",", ":"),
        ).encode("utf-8")
    )
    row_hashes = pd.util.hash_pandas_object(canonical, index=False, categorize=False)
    digest.update(row_hashes.to_numpy(dtype=np.uint64, copy=False).tobytes())
    return digest.hexdigest()


def _verified_ssl_context() -> ssl.SSLContext:
    configured = os.environ.get("SSL_CERT_FILE")
    if configured and Path(configured).is_file():
        return ssl.create_default_context(cafile=configured)
    system_bundle = Path("/etc/ssl/cert.pem")
    if system_bundle.is_file():
        return ssl.create_default_context(cafile=str(system_bundle))
    return ssl.create_default_context()


class _ContentAddressedCache:
    """URL index pointing to immutable SHA-256 named source objects."""

    def __init__(self, cache_dir: Path) -> None:
        self.cache_dir = Path(cache_dir)
        self.objects_dir = self.cache_dir / "objects"
        self.index_path = self.cache_dir / "source-index.json"
        self.objects_dir.mkdir(parents=True, exist_ok=True)

    def _load_index(self) -> dict[str, Any]:
        if not self.index_path.exists():
            return {"version": 1, "sources": {}}
        with self.index_path.open("r", encoding="utf-8") as source:
            value = json.load(source)
        if value.get("version") != 1 or not isinstance(value.get("sources"), dict):
            raise RuntimeError("Module 1 cache index is invalid")
        return value

    def _write_index(self, value: Mapping[str, Any]) -> None:
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        fd, temporary_name = tempfile.mkstemp(
            prefix="source-index-", suffix=".json", dir=self.cache_dir
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as target:
                json.dump(value, target, sort_keys=True, indent=2)
                target.write("\n")
                target.flush()
                os.fsync(target.fileno())
            os.replace(temporary_name, self.index_path)
        finally:
            if os.path.exists(temporary_name):
                os.unlink(temporary_name)

    def _cached(self, logical_name: str, url: str, entry: Mapping[str, Any]) -> _CachedObject:
        if entry.get("url") != url:
            raise RuntimeError(f"cached URL changed for {logical_name}; run with refresh=True")
        path = self.objects_dir / str(entry.get("object"))
        if not path.is_file():
            raise RuntimeError(f"cached object is missing for {logical_name}: {path}")
        expected_size = int(entry.get("byte_count", -1))
        if path.stat().st_size != expected_size:
            raise RuntimeError(f"cached object size mismatch for {logical_name}")
        observed_hash = _sha256_file(path)
        if observed_hash != entry.get("sha256"):
            raise RuntimeError(f"cached object hash mismatch for {logical_name}")
        return _CachedObject(
            logical_name=logical_name,
            url=url,
            sha256=observed_hash,
            byte_count=expected_size,
            path=path,
            downloaded_at=str(entry.get("downloaded_at", "unknown")),
        )

    def fetch(self, logical_name: str, url: str, refresh: bool) -> _CachedObject:
        index = self._load_index()
        existing = index["sources"].get(logical_name)
        if existing is not None and not refresh:
            return self._cached(logical_name, url, existing)

        suffix = ".csv.gz" if url.endswith(".csv.gz") else ".csv"
        fd, temporary_name = tempfile.mkstemp(
            prefix="download-", suffix=suffix, dir=self.objects_dir
        )
        byte_count = 0
        digest = hashlib.sha256()
        downloaded_at = datetime.now(timezone.utc).isoformat()
        request = Request(url, headers={"User-Agent": "nfl-projection-lab-module-one/1"})
        try:
            with os.fdopen(fd, "wb") as target, urlopen(
                request, timeout=240, context=_verified_ssl_context()
            ) as response:
                content_length_header = response.headers.get("Content-Length")
                expected_content_length = (
                    int(content_length_header)
                    if content_length_header is not None and content_length_header.isdigit()
                    else None
                )
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    target.write(chunk)
                    digest.update(chunk)
                    byte_count += len(chunk)
                target.flush()
                os.fsync(target.fileno())
            if expected_content_length is not None and byte_count != expected_content_length:
                raise RuntimeError(
                    f"download length mismatch for {logical_name}: "
                    f"expected {expected_content_length}, received {byte_count}"
                )
            if byte_count <= 0:
                raise RuntimeError(f"download returned an empty object for {logical_name}")
            sha256 = digest.hexdigest()
            object_name = f"{sha256}{suffix}"
            object_path = self.objects_dir / object_name
            if object_path.exists():
                if _sha256_file(object_path) != sha256:
                    raise RuntimeError(f"immutable cache collision for {logical_name}")
                os.unlink(temporary_name)
            else:
                os.replace(temporary_name, object_path)

            index["sources"][logical_name] = {
                "url": url,
                "sha256": sha256,
                "byte_count": byte_count,
                "object": object_name,
                "downloaded_at": downloaded_at,
            }
            self._write_index(index)
            return _CachedObject(
                logical_name=logical_name,
                url=url,
                sha256=sha256,
                byte_count=byte_count,
                path=object_path,
                downloaded_at=downloaded_at,
            )
        finally:
            if os.path.exists(temporary_name):
                os.unlink(temporary_name)


def _normalized_field(value: str) -> str:
    return "_".join(part for part in "".join(
        character.lower() if character.isalnum() else " " for character in value
    ).split())


def _assert_allowlist(
    allowlist: Sequence[str], forbidden_patterns: Sequence[str], source_name: str
) -> None:
    normalized = [_normalized_field(column) for column in allowlist]
    violations = [
        pattern
        for pattern in map(_normalized_field, forbidden_patterns)
        if any(pattern in column for column in normalized)
    ]
    if violations:
        raise RuntimeError(
            f"{source_name} positive allowlist contains forbidden patterns: {violations}"
        )


def _read_positive_csv(
    path: Path,
    allowlist: Sequence[str],
    forbidden_patterns: Sequence[str],
    source_name: str,
) -> pd.DataFrame:
    """Read only positively allowed columns from CSV or CSV.gz source bytes."""

    _assert_allowlist(allowlist, forbidden_patterns, source_name)
    compression = "gzip" if str(path).endswith(".gz") else None
    header = pd.read_csv(path, compression=compression, nrows=0)
    missing = sorted(set(allowlist) - set(header.columns))
    if missing:
        raise RuntimeError(f"{source_name} schema is missing allowed columns: {missing}")
    frame = pd.read_csv(
        path,
        compression=compression,
        usecols=list(allowlist),
        low_memory=False,
    )
    if set(frame.columns) != set(allowlist):
        raise RuntimeError(f"{source_name} positive projection did not match the frozen allowlist")
    return frame.loc[:, list(allowlist)]


def _team_alias(value: Any) -> Any:
    if value is None or pd.isna(value):
        return value
    team = str(value).strip().upper()
    return TEAM_ALIASES.get(team, team)


def _numeric(frame: pd.DataFrame, columns: Iterable[str]) -> None:
    for column in columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")


def _parse_possession_seconds(value: Any) -> float:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return float("nan")
    text = str(value).strip()
    if not text:
        return float("nan")
    pieces = text.split(":")
    if len(pieces) == 2:
        try:
            return float(int(pieces[0]) * 60 + int(pieces[1]))
        except ValueError:
            return float("nan")
    try:
        number = float(text)
    except ValueError:
        return float("nan")
    return number if np.isfinite(number) else float("nan")


def _prepare_schedule(
    frame: pd.DataFrame, first_season: int, last_season: int
) -> tuple[pd.DataFrame, dict[str, int]]:
    schedule = frame.copy()
    _numeric(schedule, ["season", "week", "home_score", "away_score"])
    schedule["home_team"] = schedule["home_team"].map(_team_alias)
    schedule["away_team"] = schedule["away_team"].map(_team_alias)
    schedule["gameday"] = pd.to_datetime(schedule["gameday"], errors="coerce")
    in_window = schedule["season"].between(first_season, last_season, inclusive="both")
    regular = schedule["game_type"].eq("REG")
    candidate = schedule.loc[in_window & regular].copy()
    incomplete = candidate["home_score"].isna() | candidate["away_score"].isna()
    completed = candidate.loc[~incomplete].copy()
    required_missing = (
        completed[["game_id", "season", "week", "gameday", "home_team", "away_team"]]
        .isna()
        .any(axis=1)
    )
    if required_missing.any():
        raise RuntimeError("completed schedule rows have invalid game identity")
    if completed["game_id"].duplicated().any():
        duplicates = completed.loc[completed["game_id"].duplicated(), "game_id"].tolist()
        raise RuntimeError(f"duplicate completed schedule game IDs: {duplicates[:5]}")
    if (completed["home_team"] == completed["away_team"]).any():
        raise RuntimeError("schedule contains a game with identical home and away teams")
    completed["season"] = completed["season"].astype(int)
    completed["week"] = completed["week"].astype(int)
    completed["home_score"] = completed["home_score"].astype(int)
    completed["away_score"] = completed["away_score"].astype(int)
    completed = completed.sort_values(["season", "week", "gameday", "game_id"]).reset_index(
        drop=True
    )
    return completed, {
        "schedule_rows_outside_frozen_seasons_or_non_regular": int(len(schedule) - len(candidate)),
        "incomplete_regular_schedule_games": int(incomplete.sum()),
    }


_PBP_NUMERIC_COLUMNS = (
    "season",
    "week",
    "play",
    "qb_kneel",
    "qb_spike",
    "epa",
    "down",
    "ydstogo",
    "yardline_100",
    "yards_gained",
    "pass_attempt",
    "rush_attempt",
    "sack",
    "qb_scramble",
    "qb_hit",
    "interception",
    "fumble_lost",
    "qb_dropback",
    "touchdown",
    "field_goal_attempt",
    "punt_attempt",
    "game_seconds_remaining",
    "total_home_score",
    "total_away_score",
    "pass_oe",
)


def _annotate_scrimmage_rows(frame: pd.DataFrame) -> pd.DataFrame:
    """Create mutually exclusive raw opportunities and their outcome counts.

    ``play == 1`` plus an actual pass, sack, dropback, or rush opportunity is the
    positive definition.  This excludes administrative and penalty-only no-play
    rows without reading a free-text description or a penalty field.  Kneels and
    spikes are removed explicitly.  A quarterback scramble is one dropback and is
    excluded from designed rush opportunities, so it cannot inflate a denominator.
    """

    rows = frame.copy()
    _numeric(rows, _PBP_NUMERIC_COLUMNS)
    one = lambda column: rows[column].fillna(0).eq(1)  # noqa: E731
    live = one("play") & ~one("qb_kneel") & ~one("qb_spike")
    dropback = live & (one("qb_dropback") | one("pass_attempt") | one("sack"))
    scramble = live & one("qb_scramble")
    designed_rush = live & one("rush_attempt") & ~scramble & ~dropback
    scrimmage = dropback | designed_rush

    down = rows["down"]
    to_go = rows["ydstogo"]
    gained = rows["yards_gained"]
    rule_observed = scrimmage & down.isin([1, 2, 3, 4]) & to_go.notna() & gained.notna()
    rule_success = rule_observed & (
        one("touchdown")
        | ((down == 1) & (gained >= 0.40 * to_go))
        | ((down == 2) & (gained >= 0.60 * to_go))
        | (down.isin([3, 4]) & (gained >= to_go))
    )
    explosive = scrimmage & (
        (gained >= 20) | (one("rush_attempt") & (gained >= 10))
    )
    turnover = scrimmage & (one("interception") | one("fumble_lost"))
    red_zone = scrimmage & rows["yardline_100"].le(20)

    rows["_scrimmage"] = scrimmage.astype(int)
    rows["_dropback"] = dropback.astype(int)
    rows["_designed_rush"] = designed_rush.astype(int)
    rows["_rule_observed"] = rule_observed.astype(int)
    rows["_rule_success"] = rule_success.astype(int)
    rows["_explosive"] = explosive.astype(int)
    rows["_turnover"] = turnover.astype(int)
    rows["_sack"] = (scrimmage & one("sack")).astype(int)
    rows["_qb_hit"] = (dropback & one("qb_hit")).astype(int)
    rows["_red_zone"] = red_zone.astype(int)
    rows["_red_zone_td"] = (red_zone & one("touchdown")).astype(int)
    rows["_yards"] = rows["yards_gained"].where(scrimmage, 0.0).fillna(0.0)
    rows["_epa"] = rows["epa"].where(scrimmage, 0.0).fillna(0.0)
    rows["_epa_observed"] = (scrimmage & rows["epa"].notna()).astype(int)
    tendency_opportunity = dropback | designed_rush
    rows["_pass_oe"] = rows["pass_oe"].where(tendency_opportunity, 0.0).fillna(0.0)
    rows["_pass_oe_observed"] = (
        tendency_opportunity & rows["pass_oe"].notna()
    ).astype(int)
    rows["_possession_seconds"] = rows["drive_time_of_possession"].map(
        _parse_possession_seconds
    )
    return rows


def _aggregate_offense_rows(frame: pd.DataFrame) -> pd.DataFrame:
    annotated = _annotate_scrimmage_rows(frame)
    keys = ["game_id", "season", "week", "posteam", "defteam"]
    annotated = annotated.loc[annotated["posteam"].notna()].copy()
    sum_columns = {
        "scrimmage_plays": "_scrimmage",
        "yards": "_yards",
        "rule_successes": "_rule_success",
        "rule_success_opportunities": "_rule_observed",
        "explosive_plays": "_explosive",
        "turnovers": "_turnover",
        "dropbacks": "_dropback",
        "designed_rushes": "_designed_rush",
        "sacks": "_sack",
        "qb_hits": "_qb_hit",
        "epa": "_epa",
        "epa_observations": "_epa_observed",
        "pass_oe": "_pass_oe",
        "pass_oe_observations": "_pass_oe_observed",
    }
    grouped = annotated.groupby(keys, dropna=False, sort=False)
    values = pd.DataFrame(
        {
            output: grouped[source].sum(min_count=1)
            for output, source in sum_columns.items()
        }
    ).reset_index()

    valid_drives = annotated.loc[annotated["fixed_drive"].notna()].copy()
    if valid_drives.empty:
        drives = pd.DataFrame(columns=keys + ["drives", "possession_seconds"])
    else:
        drive_keys = keys + ["fixed_drive"]
        drive_rows = valid_drives.groupby(drive_keys, dropna=False, sort=False).agg(
            possession_seconds=("_possession_seconds", "max")
        ).reset_index()
        drives = drive_rows.groupby(keys, dropna=False, sort=False).agg(
            drives=("fixed_drive", "nunique"),
            possession_seconds=("possession_seconds", "sum"),
        ).reset_index()

    red_zone_rows = annotated.loc[
        annotated["_red_zone"].eq(1) & annotated["fixed_drive"].notna()
    ].copy()
    if red_zone_rows.empty:
        red_zone = pd.DataFrame(
            columns=keys + ["red_zone_drives", "red_zone_touchdown_drives"]
        )
    else:
        red_zone_rows["_red_zone_drive_td"] = red_zone_rows.groupby(
            keys + ["fixed_drive"], dropna=False
        )["_red_zone_td"].transform("max")
        red_zone = red_zone_rows.groupby(keys, dropna=False, sort=False).agg(
            red_zone_drives=("fixed_drive", "nunique"),
            red_zone_touchdown_drives=("_red_zone_drive_td", "sum"),
        ).reset_index()
        # The transformed drive flag repeats on every red-zone play.  Replace its
        # raw sum with a unique drive-level count.
        red_zone_td = (
            red_zone_rows.groupby(keys + ["fixed_drive"], dropna=False, sort=False)[
                "_red_zone_td"
            ]
            .max()
            .groupby(level=list(range(len(keys))))
            .sum()
            .reset_index(name="red_zone_touchdown_drives")
        )
        red_zone = red_zone.drop(columns=["red_zone_touchdown_drives"]).merge(
            red_zone_td, on=keys, how="left", validate="one_to_one"
        )

    output = values.merge(drives, on=keys, how="left", validate="one_to_one").merge(
        red_zone, on=keys, how="left", validate="one_to_one"
    )
    for column in (
        "drives",
        "possession_seconds",
        "red_zone_drives",
        "red_zone_touchdown_drives",
    ):
        output[column] = pd.to_numeric(output[column], errors="coerce").fillna(0.0)
    output["pass_rate_opportunities"] = output["dropbacks"] + output["designed_rushes"]
    return output


def _team_game_rows(
    schedule: pd.DataFrame,
    pbp: pd.DataFrame,
    season: int,
    integrity: Mapping[str, Any] | None = None,
) -> tuple[pd.DataFrame, dict[str, int]]:
    selected_schedule = schedule.loc[schedule["season"].eq(season)].copy()
    expected_ids = set(selected_schedule["game_id"].astype(str))
    rows = pbp.copy()
    rows["game_id"] = rows["game_id"].astype(str)
    rows["posteam"] = rows["posteam"].map(_team_alias)
    rows["defteam"] = rows["defteam"].map(_team_alias)
    rows = rows.loc[
        rows["season_type"].eq("REG") & rows["game_id"].isin(expected_ids)
    ].copy()
    integrity = integrity or {}
    _numeric(rows, ["game_seconds_remaining", "total_home_score", "total_away_score"])
    if integrity:
        partial_games: list[str] = []
        maximum_remaining = float(integrity["maximumObservedGameSecondsRemaining"])
        require_score = bool(integrity["scoreProgressionMustReachScheduleFinal"])
        for game in selected_schedule.itertuples(index=False):
            game_rows = rows.loc[rows["game_id"].eq(str(game.game_id))]
            if game_rows.empty:
                partial_games.append(f"{game.game_id}:no_rows")
                continue
            remaining = pd.to_numeric(
                game_rows["game_seconds_remaining"], errors="coerce"
            )
            if remaining.dropna().empty or float(remaining.min()) > maximum_remaining:
                partial_games.append(f"{game.game_id}:clock_not_near_final")
            if require_score:
                home_progress = pd.to_numeric(
                    game_rows["total_home_score"], errors="coerce"
                )
                away_progress = pd.to_numeric(
                    game_rows["total_away_score"], errors="coerce"
                )
                if (
                    home_progress.dropna().empty
                    or away_progress.dropna().empty
                    or float(home_progress.max()) < float(game.home_score)
                    or float(away_progress.max()) < float(game.away_score)
                ):
                    partial_games.append(f"{game.game_id}:score_progression_incomplete")
        if partial_games:
            raise RuntimeError(
                "completed REG PBP import failed source-integrity checks: "
                + ", ".join(partial_games[:12])
            )
    offense = _aggregate_offense_rows(rows)
    offense = offense.loc[offense["scrimmage_plays"].gt(0)].copy()
    duplicate_team = offense.duplicated(["game_id", "posteam"], keep=False)
    if duplicate_team.any():
        examples = (
            offense.loc[duplicate_team, ["game_id", "posteam", "defteam"]]
            .head(8)
            .to_dict("records")
        )
        raise RuntimeError(f"PBP produced multiple opponent groups for a team-game: {examples}")
    lookup = {
        (str(row.game_id), str(row.posteam)): row
        for row in offense.itertuples(index=False)
    }
    output: list[dict[str, Any]] = []
    missing: list[str] = []
    for game in selected_schedule.itertuples(index=False):
        neutral_site = str(game.location).strip().lower() == "neutral"
        home_indicator = 0.5 if neutral_site else 1.0
        away_indicator = 0.5 if neutral_site else 0.0
        pairs = (
            (
                str(game.home_team), str(game.away_team), home_indicator,
                int(game.home_score), int(game.away_score),
            ),
            (
                str(game.away_team), str(game.home_team), away_indicator,
                int(game.away_score), int(game.home_score),
            ),
        )
        for team, opponent, is_home, points_for, points_against in pairs:
            own = lookup.get((str(game.game_id), team))
            opposing = lookup.get((str(game.game_id), opponent))
            if own is None or opposing is None:
                missing.append(f"{game.game_id}:{team}")
                continue
            if integrity:
                if float(own.scrimmage_plays) < float(
                    integrity["minimumScrimmagePlaysPerTeamGame"]
                ):
                    missing.append(f"{game.game_id}:{team}:scrimmage_floor")
                    continue
                if float(own.drives) < float(integrity["minimumDrivesPerTeamGame"]):
                    missing.append(f"{game.game_id}:{team}:drive_floor")
                    continue
            if _team_alias(own.defteam) != opponent:
                raise RuntimeError(
                    f"PBP opponent mismatch for {game.game_id}:{team}; "
                    f"expected {opponent}, observed {own.defteam}"
                )
            record: dict[str, Any] = {
                "game_id": str(game.game_id),
                "season": int(game.season),
                "week": int(game.week),
                "game_date": pd.Timestamp(game.gameday),
                "team": team,
                "opponent": opponent,
                "is_home": is_home,
                "points_for": points_for,
                "points_against": points_against,
            }
            for name in (
                "scrimmage_plays",
                "yards",
                "rule_successes",
                "rule_success_opportunities",
                "explosive_plays",
                "turnovers",
                "dropbacks",
                "designed_rushes",
                "sacks",
                "qb_hits",
                "red_zone_drives",
                "red_zone_touchdown_drives",
                "drives",
                "possession_seconds",
                "epa",
                "epa_observations",
                "pass_oe",
                "pass_oe_observations",
                "pass_rate_opportunities",
            ):
                record[f"offense_{name}"] = float(getattr(own, name))
                record[f"defense_{name}"] = float(getattr(opposing, name))
            output.append(record)

    if missing:
        raise RuntimeError(
            "completed REG games require two-team PBP aggregates; missing "
            + ", ".join(missing[:12])
        )
    team_games = pd.DataFrame(output).sort_values(
        ["season", "week", "game_date", "game_id", "is_home"],
        ascending=[True, True, True, True, False],
    )
    if len(team_games) != 2 * len(selected_schedule):
        raise RuntimeError(
            f"season {season} produced {len(team_games)} team rows for "
            f"{len(selected_schedule)} completed games"
        )
    annotated = _annotate_scrimmage_rows(rows)
    exclusions = {
        f"pbp_{season}_kneels": int(
            (annotated["qb_kneel"].fillna(0).eq(1) & annotated["play"].fillna(0).eq(1)).sum()
        ),
        f"pbp_{season}_spikes": int(
            (annotated["qb_spike"].fillna(0).eq(1) & annotated["play"].fillna(0).eq(1)).sum()
        ),
        f"pbp_{season}_non_scrimmage_or_penalty_only": int(
            (annotated["_scrimmage"].eq(0)).sum()
        ),
    }
    return team_games.reset_index(drop=True), exclusions


def _player_identity(row: Any) -> str | None:
    for prefix, value in (("gsis", row.gsis_id), ("smart", row.smart_id)):
        if value is not None and not pd.isna(value) and str(value).strip():
            return f"{prefix}:{str(value).strip()}"
    if row.full_name is not None and not pd.isna(row.full_name) and str(row.full_name).strip():
        return f"name:{str(row.full_name).strip().lower()}|{str(row.position).strip().upper()}"
    return None


def _roster_snapshots(
    frame: pd.DataFrame,
    season: int,
    expected_team_weeks: set[tuple[str, int, int]] | None = None,
    integrity: Mapping[str, Any] | None = None,
) -> dict[tuple[str, int, int], frozenset[str]]:
    roster = frame.copy()
    _numeric(roster, ["season", "week"])
    roster["team"] = roster["team"].map(_team_alias)
    roster = roster.loc[
        roster["season"].eq(season) & roster["game_type"].eq("REG")
    ].copy()
    roster["_player_identity"] = [
        _player_identity(row) for row in roster.itertuples(index=False)
    ]
    roster = roster.loc[roster["_player_identity"].notna()].copy()
    snapshots: dict[tuple[str, int, int], frozenset[str]] = {}
    for (team, row_season, week), rows in roster.groupby(
        ["team", "season", "week"], sort=True
    ):
        snapshots[(str(team), int(row_season), int(week))] = frozenset(
            rows["_player_identity"].astype(str)
        )
    integrity = integrity or {}
    if integrity:
        minimum_identities = int(
            integrity["minimumPlayerIdentitiesPerScheduledTeamWeek"]
        )
        expected = expected_team_weeks or set()
        if bool(integrity["requireEveryCompletedScheduledTeamWeek"]):
            missing = sorted(expected - set(snapshots))
            if missing:
                raise RuntimeError(
                    "weekly roster import is missing completed scheduled team-weeks: "
                    + ", ".join(f"{team}:{row_season}:{week}" for team, row_season, week in missing[:12])
                )
        short = sorted(
            (key, len(snapshots[key]))
            for key in expected.intersection(snapshots)
            if len(snapshots[key]) < minimum_identities
        )
        if short:
            raise RuntimeError(
                "weekly roster import failed player-identity completeness: "
                + ", ".join(
                    f"{team}:{row_season}:{week}={count}"
                    for (team, row_season, week), count in short[:12]
                )
            )
    return snapshots


def _roster_history(
    snapshots: Mapping[tuple[str, int, int], frozenset[str]]
) -> dict[str, list[tuple[int, int, frozenset[str]]]]:
    history: dict[str, list[tuple[int, int, frozenset[str]]]] = {}
    for (team, season, week), identities in snapshots.items():
        history.setdefault(team, []).append((season, week, identities))
    for values in history.values():
        values.sort(key=lambda value: (value[0], value[1]))
    return history


def _prior_roster_jaccard(
    history: Mapping[str, Sequence[tuple[int, int, frozenset[str]]]],
    team: str,
    season: int,
    week: int,
) -> tuple[float, float]:
    eligible = [
        value
        for value in history.get(team, ())
        if value[0] < season or (value[0] == season and value[1] < week)
    ]
    if len(eligible) < 2:
        return float("nan"), 1.0
    left, right = eligible[-2][2], eligible[-1][2]
    union = left | right
    if not union:
        return float("nan"), 1.0
    return float(len(left & right) / len(union)), 0.0


def _origin_timestamp(week_games: pd.DataFrame) -> str:
    first_date = pd.Timestamp(week_games["gameday"].min()).date()
    days_since_tuesday = (first_date.weekday() - 1) % 7
    tuesday = first_date - pd.Timedelta(days=days_since_tuesday)
    local = datetime.combine(tuesday, time(hour=7, minute=30), ZoneInfo("America/Los_Angeles"))
    return local.isoformat()


def _history_before_origin(
    team_games: pd.DataFrame,
    season: int,
    week: int,
    forecast_at: str | None = None,
) -> pd.DataFrame:
    eligible = team_games["season"].lt(season) | (
        team_games["season"].eq(season) & team_games["week"].lt(week)
    )
    if forecast_at is not None and "game_date" in team_games.columns:
        origin = pd.Timestamp(forecast_at)
        if origin.tzinfo is not None:
            origin = origin.tz_localize(None)
        # A date-only historical record cannot prove a Tuesday game was final by
        # 07:30 PT.  Require the game date to precede the origin's local date.
        eligible &= pd.to_datetime(team_games["game_date"], errors="coerce").lt(
            origin.normalize()
        )
    return team_games.loc[eligible].copy()


def _assert_history_cutoff(history: pd.DataFrame, season: int, week: int) -> None:
    invalid = history["season"].gt(season) | (
        history["season"].eq(season) & history["week"].ge(week)
    )
    if invalid.any():
        example = history.loc[invalid, ["season", "week"]].iloc[0].to_dict()
        raise RuntimeError(
            f"future or same-week row reached origin {season}-{week}: {example}"
        )


def _time_weights(
    rows: pd.DataFrame,
    origin_season: int,
    half_life: float,
    season_multipliers: Mapping[str, float] | None = None,
) -> np.ndarray:
    age = origin_season - rows["season"].to_numpy(dtype=float)
    if (age < 0).any():
        raise RuntimeError("future season reached time weighting")
    weights = np.power(0.5, age / half_life)
    if season_multipliers:
        multipliers = np.array(
            [
                float(season_multipliers.get(str(int(season)), 1.0))
                for season in rows["season"].to_numpy(dtype=float)
            ],
            dtype=float,
        )
        if (~np.isfinite(multipliers)).any() or (multipliers < 0).any():
            raise ValueError("season observation multipliers must be finite and non-negative")
        weights *= multipliers
    return weights


def _weighted_sum(rows: pd.DataFrame, column: str, weights: np.ndarray) -> float:
    values = rows[column].to_numpy(dtype=float)
    observed = np.isfinite(values)
    if not observed.any():
        return 0.0
    return float(np.sum(values[observed] * weights[observed]))


def _league_rate(
    rows: pd.DataFrame,
    numerator: str,
    denominator: str,
    weights: np.ndarray,
) -> float:
    denominator_sum = _weighted_sum(rows, denominator, weights)
    if denominator_sum <= 0:
        return float("nan")
    return _weighted_sum(rows, numerator, weights) / denominator_sum


def _pooled_rate(
    team_rows: pd.DataFrame,
    team_weights: np.ndarray,
    numerator: str,
    denominator: str,
    league_value: float,
    prior_exposure: float,
) -> float:
    if not np.isfinite(league_value):
        return float("nan")
    denominator_sum = _weighted_sum(team_rows, denominator, team_weights)
    numerator_sum = _weighted_sum(team_rows, numerator, team_weights)
    return float(
        (numerator_sum + prior_exposure * league_value)
        / (denominator_sum + prior_exposure)
    )


def _last_team_games(rows: pd.DataFrame, team: str, limit: int) -> pd.DataFrame:
    selected = rows.loc[rows["team"].eq(team)].sort_values(
        ["season", "week", "game_date", "game_id"], kind="mergesort"
    )
    return selected.tail(limit).copy()


def _profile(
    team: str,
    opponent: str,
    history: pd.DataFrame,
    league_weights: np.ndarray,
    origin_season: int,
    config: Mapping[str, Any],
    roster_history: Mapping[str, Sequence[tuple[int, int, frozenset[str]]]],
    origin_week: int,
    is_home: bool,
) -> dict[str, float]:
    features = config["features"]
    limit = int(features["windowGames"])
    half_life = float(features["timeDecayHalfLifeSeasons"])
    rate_prior = float(features["ratePriorPlays"])
    turnover_prior = float(features["turnoverPriorPlays"])
    game_prior = float(features["scorePriorGames"])
    season_multipliers = features.get("observationWeightMultipliersBySeason", {})
    offense = _last_team_games(history, team, limit)
    opponent_rows = _last_team_games(history, opponent, limit)
    offense_weights = _time_weights(
        offense, origin_season, half_life, season_multipliers
    )
    opponent_weights = _time_weights(
        opponent_rows, origin_season, half_life, season_multipliers
    )

    def rate(
        side_rows: pd.DataFrame,
        side_weights: np.ndarray,
        numerator: str,
        denominator: str,
        prior: float = rate_prior,
    ) -> float:
        league = _league_rate(history, numerator, denominator, league_weights)
        return _pooled_rate(
            side_rows, side_weights, numerator, denominator, league, prior
        )

    offense_points = rate(
        offense, offense_weights, "points_for", "_game_count", game_prior
    )
    opponent_points_allowed = rate(
        opponent_rows,
        opponent_weights,
        "points_against",
        "_game_count",
        game_prior,
    )
    roster_jaccard, roster_missing = _prior_roster_jaccard(
        roster_history, team, origin_season, origin_week
    )
    profile = {
        "offense_yards_per_play": rate(
            offense, offense_weights, "offense_yards", "offense_scrimmage_plays"
        ),
        "opponent_defense_yards_per_play": rate(
            opponent_rows,
            opponent_weights,
            "defense_yards",
            "defense_scrimmage_plays",
        ),
        "offense_rule_success_rate": rate(
            offense,
            offense_weights,
            "offense_rule_successes",
            "offense_rule_success_opportunities",
        ),
        "opponent_defense_rule_success_rate": rate(
            opponent_rows,
            opponent_weights,
            "defense_rule_successes",
            "defense_rule_success_opportunities",
        ),
        "offense_explosive_rate": rate(
            offense,
            offense_weights,
            "offense_explosive_plays",
            "offense_scrimmage_plays",
        ),
        "opponent_defense_explosive_rate": rate(
            opponent_rows,
            opponent_weights,
            "defense_explosive_plays",
            "defense_scrimmage_plays",
        ),
        "offense_turnover_rate": rate(
            offense,
            offense_weights,
            "offense_turnovers",
            "offense_scrimmage_plays",
            turnover_prior,
        ),
        "opponent_defense_turnover_rate": rate(
            opponent_rows,
            opponent_weights,
            "defense_turnovers",
            "defense_scrimmage_plays",
            turnover_prior,
        ),
        "offense_sack_rate": rate(
            offense, offense_weights, "offense_sacks", "offense_dropbacks"
        ),
        "opponent_defense_sack_rate": rate(
            opponent_rows,
            opponent_weights,
            "defense_sacks",
            "defense_dropbacks",
        ),
        "offense_qb_hit_rate": rate(
            offense, offense_weights, "offense_qb_hits", "offense_dropbacks"
        ),
        "opponent_defense_qb_hit_rate": rate(
            opponent_rows,
            opponent_weights,
            "defense_qb_hits",
            "defense_dropbacks",
        ),
        "offense_red_zone_touchdown_rate": rate(
            offense,
            offense_weights,
            "offense_red_zone_touchdown_drives",
            "offense_red_zone_drives",
            game_prior,
        ),
        "opponent_defense_red_zone_touchdown_rate": rate(
            opponent_rows,
            opponent_weights,
            "defense_red_zone_touchdown_drives",
            "defense_red_zone_drives",
            game_prior,
        ),
        "offense_seconds_per_play": rate(
            offense,
            offense_weights,
            "offense_possession_seconds",
            "offense_scrimmage_plays",
        ),
        "opponent_defense_seconds_per_play": rate(
            opponent_rows,
            opponent_weights,
            "defense_possession_seconds",
            "defense_scrimmage_plays",
        ),
        "offense_drives_per_game": rate(
            offense, offense_weights, "offense_drives", "_game_count", game_prior
        ),
        "opponent_defense_drives_per_game": rate(
            opponent_rows,
            opponent_weights,
            "defense_drives",
            "_game_count",
            game_prior,
        ),
        "offense_pass_rate": rate(
            offense,
            offense_weights,
            "offense_dropbacks",
            "offense_pass_rate_opportunities",
        ),
        "opponent_defense_pass_rate": rate(
            opponent_rows,
            opponent_weights,
            "defense_dropbacks",
            "defense_pass_rate_opportunities",
        ),
        "offense_epa_per_play": rate(
            offense,
            offense_weights,
            "offense_epa",
            "offense_epa_observations",
        ),
        "opponent_defense_epa_per_play": rate(
            opponent_rows,
            opponent_weights,
            "defense_epa",
            "defense_epa_observations",
        ),
        "offense_pass_rate_over_expectation": rate(
            offense,
            offense_weights,
            "offense_pass_oe",
            "offense_pass_oe_observations",
        ),
        "opponent_defense_pass_rate_over_expectation": rate(
            opponent_rows,
            opponent_weights,
            "defense_pass_oe",
            "defense_pass_oe_observations",
        ),
        "offense_points_per_game": offense_points,
        "opponent_defense_points_allowed_per_game": opponent_points_allowed,
        "offense_history_games": float(len(offense)),
        "opponent_defense_history_games": float(len(opponent_rows)),
        "prior_week_roster_jaccard": roster_jaccard,
        "roster_continuity_missing": roster_missing,
        "is_home": float(is_home),
    }
    profile["offense_pass_rate_over_expectation_missing"] = float(
        not np.isfinite(profile["offense_pass_rate_over_expectation"])
    )
    profile["opponent_defense_pass_rate_over_expectation_missing"] = float(
        not np.isfinite(profile["opponent_defense_pass_rate_over_expectation"])
    )
    return profile


FEATURE_NAMES = (
    "offense_yards_per_play",
    "opponent_defense_yards_per_play",
    "offense_rule_success_rate",
    "opponent_defense_rule_success_rate",
    "offense_explosive_rate",
    "opponent_defense_explosive_rate",
    "offense_turnover_rate",
    "opponent_defense_turnover_rate",
    "offense_sack_rate",
    "opponent_defense_sack_rate",
    "offense_qb_hit_rate",
    "opponent_defense_qb_hit_rate",
    "offense_red_zone_touchdown_rate",
    "opponent_defense_red_zone_touchdown_rate",
    "offense_seconds_per_play",
    "opponent_defense_seconds_per_play",
    "offense_drives_per_game",
    "opponent_defense_drives_per_game",
    "offense_pass_rate",
    "opponent_defense_pass_rate",
    "offense_epa_per_play",
    "opponent_defense_epa_per_play",
    "offense_pass_rate_over_expectation",
    "opponent_defense_pass_rate_over_expectation",
    "offense_pass_rate_over_expectation_missing",
    "opponent_defense_pass_rate_over_expectation_missing",
    "offense_points_per_game",
    "opponent_defense_points_allowed_per_game",
    "offense_history_games",
    "opponent_defense_history_games",
    "prior_week_roster_jaccard",
    "roster_continuity_missing",
)


def _build_pregame_games(
    schedule: pd.DataFrame,
    team_games: pd.DataFrame,
    roster_history: Mapping[str, Sequence[tuple[int, int, frozenset[str]]]],
    config: Mapping[str, Any],
) -> pd.DataFrame:
    rows = team_games.copy()
    rows["_game_count"] = 1.0
    half_life = float(config["features"]["timeDecayHalfLifeSeasons"])
    season_multipliers = config["features"].get(
        "observationWeightMultipliersBySeason", {}
    )
    records: list[dict[str, Any]] = []

    for (season, week), week_games in schedule.groupby(["season", "week"], sort=True):
        season, week = int(season), int(week)
        forecast_at = _origin_timestamp(week_games)
        history = _history_before_origin(rows, season, week, forecast_at)
        _assert_history_cutoff(history, season, week)
        current_ids = set(week_games["game_id"].astype(str))
        if current_ids & set(history["game_id"].astype(str)):
            raise RuntimeError("current-week target game entered the profile history")
        league_weights = _time_weights(
            history, season, half_life, season_multipliers
        )
        if history.empty:
            league_mean = float("nan")
            home_advantage = float("nan")
            input_season: float | int = float("nan")
            input_week: float | int = float("nan")
            maximum_date: str | None = None
        else:
            league_mean = _league_rate(
                history, "points_for", "_game_count", league_weights
            )
            home_rows = history.loc[history["is_home"].eq(1)]
            away_rows = history.loc[history["is_home"].eq(0)]
            home_weights = _time_weights(
                home_rows, season, half_life, season_multipliers
            )
            away_weights = _time_weights(
                away_rows, season, half_life, season_multipliers
            )
            home_mean = _league_rate(home_rows, "points_for", "_game_count", home_weights)
            away_mean = _league_rate(away_rows, "points_for", "_game_count", away_weights)
            home_advantage = home_mean - away_mean
            maximum = history.sort_values(["season", "week", "game_date", "game_id"]).iloc[-1]
            input_season, input_week = int(maximum["season"]), int(maximum["week"])
            maximum_date = pd.Timestamp(history["game_date"].max()).date().isoformat()

        for game in week_games.sort_values(["gameday", "game_id"]).itertuples(index=False):
            neutral_site = str(game.location).strip().lower() == "neutral"
            home_profile = _profile(
                str(game.home_team),
                str(game.away_team),
                history,
                league_weights,
                season,
                config,
                roster_history,
                week,
                True,
            )
            away_profile = _profile(
                str(game.away_team),
                str(game.home_team),
                history,
                league_weights,
                season,
                config,
                roster_history,
                week,
                False,
            )
            naive_home = 0.5 * (
                home_profile["offense_points_per_game"]
                + home_profile["opponent_defense_points_allowed_per_game"]
            )
            naive_away = 0.5 * (
                away_profile["offense_points_per_game"]
                + away_profile["opponent_defense_points_allowed_per_game"]
            )
            if np.isfinite(home_advantage) and not neutral_site:
                naive_home += home_advantage / 2.0
                naive_away -= home_advantage / 2.0
            record: dict[str, Any] = {
                "game_id": str(game.game_id),
                "season": season,
                "week": week,
                "forecast_at": forecast_at,
                "home_team": str(game.home_team),
                "away_team": str(game.away_team),
                "neutral_site": neutral_site,
                "actual_home_score": int(game.home_score),
                "actual_away_score": int(game.away_score),
                "league_team_score_mean": league_mean,
                "league_home_advantage": home_advantage,
                "naive_home_mean": naive_home,
                "naive_away_mean": naive_away,
                "inputs_through_season": input_season,
                "inputs_through_week": input_week,
                "maximum_input_game_date": maximum_date,
                "historical_availability": "inferred",
            }
            record.update({f"home_{name}": home_profile[name] for name in FEATURE_NAMES})
            record.update({f"away_{name}": away_profile[name] for name in FEATURE_NAMES})
            records.append(record)

    games = pd.DataFrame(records).sort_values(
        ["season", "week", "game_id"], kind="mergesort"
    ).reset_index(drop=True)
    if games["game_id"].duplicated().any() or len(games) != len(schedule):
        raise RuntimeError("pregame feature build lost or duplicated a scheduled game")
    return games


def _missingness_report(games: pd.DataFrame, maximum_unexpected: float) -> pd.DataFrame:
    expected_missing = {
        "prior_week_roster_jaccard",
        "offense_pass_rate_over_expectation",
        "opponent_defense_pass_rate_over_expectation",
    }
    rows: list[dict[str, Any]] = []
    for side in ("home", "away"):
        for feature in FEATURE_NAMES:
            column = f"{side}_{feature}"
            missing_count = int(games[column].isna().sum())
            fraction = missing_count / len(games) if len(games) else 0.0
            expected = feature in expected_missing
            rows.append(
                {
                    "column": column,
                    "missing_count": missing_count,
                    "missing_fraction": fraction,
                    "classification": "expected" if expected else "unexpected",
                }
            )
            if not expected and fraction > maximum_unexpected:
                raise RuntimeError(
                    f"unexpected missingness {fraction:.4%} exceeds {maximum_unexpected:.4%} "
                    f"for {column}"
                )
    return pd.DataFrame(rows)


def build_module_one_dataset(
    config: dict, cache_dir: Path, refresh: bool = False
) -> ModuleOneDataset:
    """Build the frozen, market-free Module 1 historical data set.

    Parameters
    ----------
    config:
        Parsed ``config/model-lab-module-one.config.json`` mapping.
    cache_dir:
        Directory holding immutable content-hash source objects and their URL
        index.  A complete cache permits an offline run with ``refresh=False``.
    refresh:
        When true, download each logical source again and update only its index
        pointer.  Existing hash-named objects are never overwritten.

    Returns
    -------
    ModuleOneDataset
        One game frame for NumPy model runners, raw two-row-per-game counts,
        source provenance, hashes, exclusions, and missingness.
    """

    required_sections = {"forecastContract", "dataBoundary", "features"}
    missing_sections = required_sections - set(config)
    if missing_sections:
        raise ValueError(f"Module 1 config is missing sections: {sorted(missing_sections)}")
    boundary = config["dataBoundary"]
    configured_aliases = {
        str(key).upper(): str(value).upper()
        for key, value in boundary.get("teamAliases", {}).items()
    }
    if configured_aliases != TEAM_ALIASES:
        raise ValueError("Module 1 team aliases do not match the frozen data contract")
    forbidden = tuple(boundary["forbiddenFieldPatterns"])
    first_season = int(config["forecastContract"]["trainingStartSeason"])
    last_season = int(config["forecastContract"]["confirmationSeason"])
    seasons = range(first_season, last_season + 1)
    if first_season != 2010 or last_season != 2025:
        raise ValueError("Module 1 source seasons are frozen to 2010 through 2025")
    if config["forecastContract"].get("sameWeekEarlierGamesAllowed"):
        raise ValueError("Module 1 forbids same-week feature updates")

    cache = _ContentAddressedCache(Path(cache_dir))
    manifest: list[SourceSnapshot] = []
    exclusions: dict[str, int] = {}

    schedule_object = cache.fetch("schedules", SCHEDULE_URL, refresh)
    raw_schedule = _read_positive_csv(
        schedule_object.path,
        tuple(boundary["scheduleAllowlist"]),
        forbidden,
        "schedules",
    )
    schedule_projection_hash = _hash_dataframe(raw_schedule, ("season", "week", "game_id"))
    manifest.append(
        SourceSnapshot(
            logical_name="schedules",
            url=schedule_object.url,
            sha256=schedule_object.sha256,
            projected_sha256=schedule_projection_hash,
            byte_count=schedule_object.byte_count,
            row_count=len(raw_schedule),
            projected_columns=tuple(raw_schedule.columns),
            cache_path=str(schedule_object.path.resolve()),
            downloaded_at=schedule_object.downloaded_at,
        )
    )
    schedule, schedule_exclusions = _prepare_schedule(
        raw_schedule, first_season, last_season
    )
    exclusions.update(schedule_exclusions)
    del raw_schedule

    team_game_frames: list[pd.DataFrame] = []
    roster_sets: dict[tuple[str, int, int], frozenset[str]] = {}
    for season in seasons:
        pbp_object = cache.fetch(f"pbp_{season}", PBP_URL.format(season=season), refresh)
        pbp = _read_positive_csv(
            pbp_object.path,
            tuple(boundary["pbpAllowlist"]),
            forbidden,
            f"pbp_{season}",
        )
        pbp_projection_hash = _hash_dataframe(
            pbp, ("season", "week", "game_id", "posteam", "fixed_drive")
        )
        manifest.append(
            SourceSnapshot(
                logical_name=f"pbp_{season}",
                url=pbp_object.url,
                sha256=pbp_object.sha256,
                projected_sha256=pbp_projection_hash,
                byte_count=pbp_object.byte_count,
                row_count=len(pbp),
                projected_columns=tuple(pbp.columns),
                cache_path=str(pbp_object.path.resolve()),
                downloaded_at=pbp_object.downloaded_at,
            )
        )
        season_team_games, season_exclusions = _team_game_rows(
            schedule, pbp, season, boundary["pbpIntegrity"]
        )
        team_game_frames.append(season_team_games)
        exclusions.update(season_exclusions)
        del pbp

        roster_object = cache.fetch(
            f"weekly_roster_{season}", WEEKLY_ROSTER_URL.format(season=season), refresh
        )
        roster = _read_positive_csv(
            roster_object.path,
            tuple(boundary["weeklyRosterAllowlist"]),
            forbidden,
            f"weekly_roster_{season}",
        )
        roster_projection_hash = _hash_dataframe(
            roster, ("season", "week", "team", "gsis_id", "smart_id")
        )
        manifest.append(
            SourceSnapshot(
                logical_name=f"weekly_roster_{season}",
                url=roster_object.url,
                sha256=roster_object.sha256,
                projected_sha256=roster_projection_hash,
                byte_count=roster_object.byte_count,
                row_count=len(roster),
                projected_columns=tuple(roster.columns),
                cache_path=str(roster_object.path.resolve()),
                downloaded_at=roster_object.downloaded_at,
            )
        )
        season_schedule = schedule.loc[schedule["season"].eq(season)]
        expected_team_weeks = {
            (str(team), int(season), int(week))
            for game in season_schedule.itertuples(index=False)
            for team, week in (
                (game.home_team, game.week),
                (game.away_team, game.week),
            )
        }
        roster_sets.update(
            _roster_snapshots(
                roster,
                season,
                expected_team_weeks,
                boundary["rosterIntegrity"],
            )
        )
        del roster

    team_games = pd.concat(team_game_frames, ignore_index=True)
    team_games = team_games.sort_values(
        ["season", "week", "game_date", "game_id", "is_home"],
        ascending=[True, True, True, True, False],
        kind="mergesort",
    ).reset_index(drop=True)
    if len(team_games) != 2 * len(schedule):
        raise RuntimeError("final raw team-game table is not exactly two rows per completed game")
    roster_history = _roster_history(roster_sets)
    games = _build_pregame_games(schedule, team_games, roster_history, config)
    missingness = _missingness_report(
        games, float(boundary["unexpectedFeatureMissingnessMaximum"])
    )

    target_columns = ("actual_home_score", "actual_away_score")
    feature_columns = [
        column
        for feature in FEATURE_NAMES
        for column in (f"home_{feature}", f"away_{feature}")
    ]
    if set(target_columns) & set(feature_columns):
        raise RuntimeError("targets reached the predictor schema")
    config_hash = _stable_json_hash(config)
    source_hash = _stable_json_hash(
        [
            {
                "logical_name": source.logical_name,
                "url": source.url,
                "sha256": source.sha256,
                "projected_sha256": source.projected_sha256,
            }
            for source in manifest
        ]
    )
    data_hash = _stable_json_hash(
        {
            "games": _hash_dataframe(games, ("season", "week", "game_id")),
            "team_games": _hash_dataframe(
                team_games, ("season", "week", "game_id", "team")
            ),
        }
    )
    feature_schema_hash = _stable_json_hash(
        {
            "feature_names": FEATURE_NAMES,
            "target_columns": target_columns,
            "paired_columns": feature_columns,
            "dtypes": {column: str(games[column].dtype) for column in feature_columns},
            "historical_availability": HISTORICAL_AVAILABILITY,
        }
    )
    return ModuleOneDataset(
        games=games,
        team_games=team_games,
        feature_names=FEATURE_NAMES,
        target_columns=target_columns,
        source_manifest=tuple(manifest),
        source_hash=source_hash,
        data_hash=data_hash,
        feature_schema_hash=feature_schema_hash,
        config_hash=config_hash,
        exclusions=dict(sorted(exclusions.items())),
        missingness=missingness,
    )


def _synthetic_pbp_row(**updates: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "game_id": "2020_01_AAA_BBB",
        "season": 2020,
        "season_type": "REG",
        "week": 1,
        "posteam": "AAA",
        "defteam": "BBB",
        "play": 1,
        "qb_kneel": 0,
        "qb_spike": 0,
        "epa": 0.0,
        "success": 0,
        "down": 1,
        "ydstogo": 10,
        "yardline_100": 50,
        "yards_gained": 0,
        "pass_attempt": 0,
        "rush_attempt": 0,
        "sack": 0,
        "qb_scramble": 0,
        "qb_hit": 0,
        "interception": 0,
        "fumble_lost": 0,
        "qb_dropback": 0,
        "touchdown": 0,
        "field_goal_attempt": 0,
        "field_goal_result": None,
        "punt_attempt": 0,
        "game_seconds_remaining": 0,
        "total_home_score": 0,
        "total_away_score": 0,
        "fixed_drive": 1,
        "drive_time_of_possession": "2:00",
        "pass_oe": 0.0,
    }
    row.update(updates)
    return row


def run_data_self_tests() -> dict[str, Any]:
    """Run fast offline invariance, isolation, rejection, and denominator tests."""

    tests: dict[str, str] = {}
    schedule_allowlist = (
        "game_id",
        "season",
        "game_type",
        "week",
        "gameday",
        "gametime",
        "away_team",
        "home_team",
        "away_score",
        "home_score",
        "location",
    )
    forbidden = ("spread", "total_line", "moneyline", "odds", "book", "units")
    base = {
        "game_id": "2020_01_AAA_BBB",
        "season": 2020,
        "game_type": "REG",
        "week": 1,
        "gameday": "2020-09-10",
        "gametime": "20:20",
        "away_team": "AAA",
        "home_team": "BBB",
        "away_score": 20,
        "home_score": 24,
        "location": "Home",
    }
    with tempfile.TemporaryDirectory() as directory:
        left_path = Path(directory) / "left.csv"
        right_path = Path(directory) / "right.csv"
        pd.DataFrame([{**base, "spread_line": -3.5, "home_moneyline": -170}]).to_csv(
            left_path, index=False
        )
        pd.DataFrame([{**base, "spread_line": 99.5, "home_moneyline": 9999}]).to_csv(
            right_path, index=False
        )
        left = _read_positive_csv(
            left_path, schedule_allowlist, forbidden, "self_test_schedule_left"
        )
        right = _read_positive_csv(
            right_path, schedule_allowlist, forbidden, "self_test_schedule_right"
        )
        assert _hash_dataframe(left) == _hash_dataframe(right)
    tests["odds_column_invariance"] = "pass"

    history = pd.DataFrame(
        [
            {"season": 2020, "week": 1, "game_id": "a", "value": 1.0},
            {"season": 2020, "week": 2, "game_id": "b", "value": 999.0},
        ]
    )
    first_projection = _history_before_origin(history.iloc[[0]], 2020, 2)
    projection_with_completed_same_week = _history_before_origin(history, 2020, 2)
    assert _hash_dataframe(first_projection) == _hash_dataframe(
        projection_with_completed_same_week
    )
    tests["same_week_isolation"] = "pass"

    rescheduled = pd.DataFrame(
        [
            {
                "season": 2020,
                "week": 1,
                "game_id": "monday_final",
                "game_date": "2020-09-14",
            },
            {
                "season": 2020,
                "week": 1,
                "game_id": "tuesday_not_final_at_origin",
                "game_date": "2020-09-15",
            },
        ]
    )
    conservative_history = _history_before_origin(
        rescheduled, 2020, 2, "2020-09-15T07:30:00-07:00"
    )
    assert conservative_history["game_id"].tolist() == ["monday_final"]
    tests["rescheduled_prior_week_origin_isolation"] = "pass"

    future = pd.DataFrame(
        [{"season": 2020, "week": 3, "game_id": "future", "value": -1.0}]
    )
    rejected = False
    try:
        _assert_history_cutoff(future, 2020, 2)
    except RuntimeError:
        rejected = True
    assert rejected
    tests["future_week_rejection"] = "pass"

    scrimmage = pd.DataFrame(
        [
            _synthetic_pbp_row(
                qb_scramble=1,
                qb_dropback=1,
                rush_attempt=1,
                yards_gained=7,
                epa=0.4,
            ),
            _synthetic_pbp_row(
                rush_attempt=1,
                yards_gained=5,
                fixed_drive=1,
                epa=0.2,
            ),
            _synthetic_pbp_row(
                qb_kneel=1,
                rush_attempt=1,
                yards_gained=-1,
                fixed_drive=2,
            ),
            _synthetic_pbp_row(
                qb_spike=1,
                qb_dropback=1,
                pass_attempt=1,
                yards_gained=0,
                fixed_drive=2,
            ),
            _synthetic_pbp_row(
                play=0,
                rush_attempt=1,
                yards_gained=20,
                fixed_drive=2,
            ),
        ]
    )
    aggregate = _aggregate_offense_rows(scrimmage).iloc[0]
    assert int(aggregate["scrimmage_plays"]) == 2
    assert int(aggregate["dropbacks"]) == 1
    assert int(aggregate["designed_rushes"]) == 1
    assert int(aggregate["pass_rate_opportunities"]) == 2
    assert float(aggregate["yards"]) == 12.0
    tests["scramble_denominator"] = "pass"

    neutral_schedule = pd.DataFrame(
        [{
            "game_id": "2020_01_AAA_BBB",
            "season": 2020,
            "week": 1,
            "gameday": pd.Timestamp("2020-09-10"),
            "home_team": "BBB",
            "away_team": "AAA",
            "home_score": 24,
            "away_score": 20,
            "location": "Neutral",
        }]
    )
    neutral_pbp = pd.DataFrame(
        [
            _synthetic_pbp_row(
                posteam="AAA", defteam="BBB", rush_attempt=1, yards_gained=5,
            ),
            _synthetic_pbp_row(
                posteam="BBB", defteam="AAA", rush_attempt=1, yards_gained=4,
            ),
        ]
    )
    neutral_team_games, _ = _team_game_rows(neutral_schedule, neutral_pbp, 2020)
    assert neutral_team_games["is_home"].tolist() == [0.5, 0.5]
    tests["neutral_site_home_indicator"] = "pass"

    partial_rejected = False
    try:
        _team_game_rows(
            neutral_schedule,
            neutral_pbp,
            2020,
            {
                "minimumScrimmagePlaysPerTeamGame": 20,
                "minimumDrivesPerTeamGame": 4,
                "maximumObservedGameSecondsRemaining": 60,
                "scoreProgressionMustReachScheduleFinal": True,
            },
        )
    except RuntimeError:
        partial_rejected = True
    assert partial_rejected
    tests["partial_two_team_import_rejection"] = "pass"

    partial_roster_rejected = False
    partial_roster = pd.DataFrame(
        [
            {
                "season": 2020,
                "week": 1,
                "game_type": "REG",
                "team": team,
                "position": "QB",
                "status": "ACT",
                "status_description_abbr": "ACT",
                "full_name": f"Player {team}",
                "gsis_id": f"00-{team}",
                "smart_id": None,
                "years_exp": 1,
            }
            for team in ("AAA", "BBB")
        ]
    )
    try:
        _roster_snapshots(
            partial_roster,
            2020,
            {("AAA", 2020, 1), ("BBB", 2020, 1)},
            {
                "minimumPlayerIdentitiesPerScheduledTeamWeek": 40,
                "requireEveryCompletedScheduledTeamWeek": True,
            },
        )
    except RuntimeError:
        partial_roster_rejected = True
    assert partial_roster_rejected
    tests["partial_roster_import_rejection"] = "pass"

    return {"passed": True, "tests": tests}


if __name__ == "__main__":
    print(json.dumps(run_data_self_tests(), sort_keys=True))
