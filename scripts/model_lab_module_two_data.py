#!/usr/bin/env python3
"""Leakage-safe data layer for Model Laboratory Module 2.

This module reconstructs offensive series from the immutable nflverse objects
already cached by Module 1.  It never downloads data and never writes to that
cache.  The public build returns four deliberately separate data products:

* regulation offensive series, the primary target source;
* overtime offensive series, retained only as secondary labels;
* raw team-game numerators and denominators; and
* Tuesday 07:30 Pacific pregame feature frames, with targets kept apart.

The implementation is intentionally market-free and score-outcome-free at the
feature boundary.  ``score_differential`` is materialized only long enough to
apply the preregistered situation-neutral row filter and is never emitted.
Historical availability is reconstructed from season/week/date labels rather
than claimed to be an original publication-time archive.
"""

from __future__ import annotations

import hashlib
import json
import math
import tempfile
from dataclasses import dataclass
from datetime import datetime, time
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd


SCHEDULE_URL = "https://github.com/nflverse/nfldata/raw/master/data/games.csv"
PBP_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/pbp/"
    "play_by_play_{season}.csv.gz"
)
HISTORICAL_AVAILABILITY = "reconstructed_not_original_publication_time"

TEAM_PROFILE_FEATURES = (
    "offense_regulation_series_per_game",
    "opponent_regulation_series_faced_per_game",
    "offense_neutral_seconds_per_scrimmage_play",
    "opponent_neutral_seconds_per_scrimmage_play_allowed",
    "offense_scrimmage_plays_per_regulation_series",
    "opponent_scrimmage_plays_per_regulation_series_allowed",
    "offense_regulation_series_seconds",
    "opponent_regulation_series_seconds_allowed",
    "offense_incompletion_or_out_of_bounds_rate",
    "opponent_incompletion_or_out_of_bounds_rate_allowed",
)
GAME_FEATURES = ("is_neutral_site",)
MISSING_INDICATOR_FEATURES = tuple(
    f"{feature}_missing" for feature in TEAM_PROFILE_FEATURES
)
FEATURE_INDICATOR_PAIRS = tuple(
    (feature, f"{feature}_missing") for feature in TEAM_PROFILE_FEATURES
)
TEAM_PROFILE_FEATURE_AND_INDICATOR_NAMES = tuple(
    name for pair in FEATURE_INDICATOR_PAIRS for name in pair
)
TARGET_COLUMNS = (
    "home_regulation_offensive_series",
    "away_regulation_offensive_series",
    "overtime_occurred",
    "home_overtime_offensive_series",
    "away_overtime_offensive_series",
)

_PROFILE_SPECS: Mapping[str, tuple[str, str, str, str]] = {
    # feature: perspective, raw numerator, raw denominator, prior family
    "offense_regulation_series_per_game": (
        "offense",
        "regulation_offensive_series",
        "games",
        "games",
    ),
    "opponent_regulation_series_faced_per_game": (
        "opponent",
        "opponent_regulation_series_faced",
        "games",
        "games",
    ),
    "offense_neutral_seconds_per_scrimmage_play": (
        "offense",
        "neutral_elapsed_seconds",
        "neutral_pace_opportunities",
        "plays",
    ),
    "opponent_neutral_seconds_per_scrimmage_play_allowed": (
        "opponent",
        "opponent_neutral_elapsed_seconds_allowed",
        "opponent_neutral_pace_opportunities_allowed",
        "plays",
    ),
    "offense_scrimmage_plays_per_regulation_series": (
        "offense",
        "scrimmage_plays",
        "regulation_series_for_play_rate",
        "series",
    ),
    "opponent_scrimmage_plays_per_regulation_series_allowed": (
        "opponent",
        "opponent_scrimmage_plays_allowed",
        "opponent_regulation_series_for_play_rate_allowed",
        "series",
    ),
    "offense_regulation_series_seconds": (
        "offense",
        "series_duration_seconds",
        "series_duration_observations",
        "series",
    ),
    "opponent_regulation_series_seconds_allowed": (
        "opponent",
        "opponent_series_duration_seconds_allowed",
        "opponent_series_duration_observations_allowed",
        "series",
    ),
    "offense_incompletion_or_out_of_bounds_rate": (
        "offense",
        "clock_stops",
        "clock_stop_opportunities",
        "plays",
    ),
    "opponent_incompletion_or_out_of_bounds_rate_allowed": (
        "opponent",
        "opponent_clock_stops_allowed",
        "opponent_clock_stop_opportunities_allowed",
        "plays",
    ),
}


@dataclass(frozen=True)
class ModuleTwoSourceSnapshot:
    """One verified immutable object and its positive projection."""

    logical_name: str
    url: str
    sha256: str
    projected_sha256: str
    byte_count: int
    row_count: int
    projected_columns: tuple[str, ...]
    cache_path: str
    downloaded_at: str


@dataclass(frozen=True)
class ModuleTwoDataset:
    """Complete market-free Module 2 data contract.

    ``games`` and ``games_no_time_decay`` contain predictors and origin audit
    metadata only.  Outcome counts live in ``targets`` and are joined by
    ``game_id`` only inside a chronological model runner.  ``team_games`` is
    the raw historical numerator/denominator ledger from which either origin
    frame can be rebuilt.
    """

    games: pd.DataFrame
    games_no_time_decay: pd.DataFrame
    targets: pd.DataFrame
    team_games: pd.DataFrame
    regulation_series: pd.DataFrame
    overtime_series: pd.DataFrame
    non_series_events: pd.DataFrame
    schedule: pd.DataFrame
    feature_names: tuple[str, ...]
    team_profile_feature_names: tuple[str, ...]
    game_feature_names: tuple[str, ...]
    missing_indicator_names: tuple[str, ...]
    feature_indicator_pairs: tuple[tuple[str, str], ...]
    target_columns: tuple[str, ...]
    source_manifest: tuple[ModuleTwoSourceSnapshot, ...]
    source_hash: str
    data_hash: str
    feature_schema_hash: str
    config_hash: str
    code_hash: str
    exclusions: Mapping[str, int]
    audits: Mapping[str, Any]
    missingness: pd.DataFrame
    historical_availability: str = HISTORICAL_AVAILABILITY

    def numpy_feature_arrays(self) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Return aligned home, away, and game-context arrays."""

        home_names = [
            f"home_{name}"
            for name in TEAM_PROFILE_FEATURE_AND_INDICATOR_NAMES
        ]
        away_names = [
            f"away_{name}"
            for name in TEAM_PROFILE_FEATURE_AND_INDICATOR_NAMES
        ]
        return (
            self.games[home_names].to_numpy(dtype=float),
            self.games[away_names].to_numpy(dtype=float),
            self.games[list(self.game_feature_names)].to_numpy(dtype=float),
        )

    def numpy_targets(self) -> np.ndarray:
        """Return aligned regulation home/away count targets."""

        target = self.targets.set_index("game_id").loc[self.games["game_id"]]
        return target[
            [
                "home_regulation_offensive_series",
                "away_regulation_offensive_series",
            ]
        ].to_numpy(dtype=int)


@dataclass(frozen=True)
class _VerifiedObject:
    logical_name: str
    url: str
    sha256: str
    byte_count: int
    path: Path
    downloaded_at: str


def _json_default(value: Any) -> Any:
    if isinstance(value, (np.integer, np.floating, np.bool_)):
        return value.item()
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()
    if isinstance(value, tuple):
        return list(value)
    raise TypeError(f"unsupported deterministic JSON value: {type(value)!r}")


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
    columns = sorted(str(column) for column in frame.columns)
    canonical = frame.loc[:, columns].copy()
    available_sort = [column for column in sort_columns if column in canonical]
    if available_sort:
        canonical = canonical.sort_values(
            available_sort, kind="mergesort", na_position="last"
        )
    canonical = canonical.reset_index(drop=True)
    digest = hashlib.sha256()
    digest.update(
        json.dumps(
            [(column, str(canonical[column].dtype)) for column in columns],
            separators=(",", ":"),
        ).encode("utf-8")
    )
    row_hashes = pd.util.hash_pandas_object(
        canonical, index=False, categorize=False
    )
    digest.update(row_hashes.to_numpy(dtype=np.uint64, copy=False).tobytes())
    return digest.hexdigest()


def hash_module_two_feature_frame(frame: pd.DataFrame) -> str:
    """Public mutation-invariance fingerprint for one pregame feature frame."""

    forbidden = set(TARGET_COLUMNS) & set(frame.columns)
    if forbidden:
        raise ValueError(f"target fields entered feature frame: {sorted(forbidden)}")
    return _hash_dataframe(frame, ("season", "week", "game_id"))


def hash_module_two_targets(frame: pd.DataFrame) -> str:
    """Public fingerprint for the separately stored target ledger."""

    return _hash_dataframe(frame, ("season", "week", "game_id"))


def assert_module_two_feature_invariance(
    before: pd.DataFrame, after: pd.DataFrame
) -> None:
    """Raise when a source/target mutation changed a feature frame."""

    if hash_module_two_feature_frame(before) != hash_module_two_feature_frame(after):
        raise AssertionError("Module 2 feature frame changed under invariant mutation")


def _normalized_field(value: str) -> str:
    return "_".join(
        part
        for part in "".join(
            character.lower() if character.isalnum() else " "
            for character in value
        ).split()
    )


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
    if len(set(allowlist)) != len(allowlist):
        raise RuntimeError(f"{source_name} allowlist contains duplicate columns")


def _read_positive_csv(
    path: Path,
    allowlist: Sequence[str],
    forbidden_patterns: Sequence[str],
    source_name: str,
) -> pd.DataFrame:
    """Materialize exactly the frozen positive projection and nothing else."""

    _assert_allowlist(allowlist, forbidden_patterns, source_name)
    compression = "gzip" if str(path).endswith(".gz") else None
    header = pd.read_csv(path, compression=compression, nrows=0)
    missing = sorted(set(allowlist) - set(header.columns))
    if missing:
        raise RuntimeError(f"{source_name} is missing allowed columns: {missing}")
    frame = pd.read_csv(
        path,
        compression=compression,
        usecols=list(allowlist),
        low_memory=False,
    )
    if set(frame.columns) != set(allowlist):
        raise RuntimeError(f"{source_name} positive projection is not exact")
    return frame.loc[:, list(allowlist)]


class _ReadOnlyContentAddressedCache:
    """Verifier for Module 1's index and immutable hash-named objects."""

    def __init__(self, cache_dir: Path) -> None:
        self.cache_dir = Path(cache_dir)
        self.objects_dir = self.cache_dir / "objects"
        self.index_path = self.cache_dir / "source-index.json"
        if not self.cache_dir.is_dir() or not self.objects_dir.is_dir():
            raise RuntimeError(f"Module 1 source cache is missing: {self.cache_dir}")
        if not self.index_path.is_file():
            raise RuntimeError("Module 1 source cache index is missing")
        self.index_sha256 = _sha256_file(self.index_path)
        with self.index_path.open("r", encoding="utf-8") as source:
            self.index = json.load(source)
        if self.index.get("version") != 1 or not isinstance(
            self.index.get("sources"), dict
        ):
            raise RuntimeError("Module 1 source cache index is invalid")

    def get(self, logical_name: str, expected_url: str) -> _VerifiedObject:
        entry = self.index["sources"].get(logical_name)
        if not isinstance(entry, dict):
            raise RuntimeError(f"cache index has no source {logical_name}")
        if entry.get("url") != expected_url:
            raise RuntimeError(f"cached URL mismatch for {logical_name}")
        sha256 = str(entry.get("sha256", ""))
        object_name = str(entry.get("object", ""))
        if not sha256 or not object_name.startswith(f"{sha256}."):
            raise RuntimeError(f"cache object name is not content-addressed: {logical_name}")
        path = self.objects_dir / object_name
        if not path.is_file():
            raise RuntimeError(f"cached object is missing for {logical_name}: {path}")
        expected_bytes = int(entry.get("byte_count", -1))
        if path.stat().st_size != expected_bytes:
            raise RuntimeError(f"cached object byte count mismatch for {logical_name}")
        observed = _sha256_file(path)
        if observed != sha256:
            raise RuntimeError(f"cached object hash mismatch for {logical_name}")
        return _VerifiedObject(
            logical_name=logical_name,
            url=expected_url,
            sha256=observed,
            byte_count=expected_bytes,
            path=path,
            downloaded_at=str(entry.get("downloaded_at", "unknown")),
        )


def _team_alias(value: Any, aliases: Mapping[str, str]) -> Any:
    if value is None or pd.isna(value):
        return value
    team = str(value).strip().upper()
    return aliases.get(team, team)


def _numeric(frame: pd.DataFrame, columns: Iterable[str]) -> None:
    for column in columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")


def _parse_possession_seconds(value: Any) -> float:
    if value is None or pd.isna(value):
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
        result = float(text)
    except ValueError:
        return float("nan")
    return result if np.isfinite(result) else float("nan")


def _drive_token(value: Any) -> str:
    number = float(value)
    if not np.isfinite(number):
        return "missing"
    return str(int(number)) if number.is_integer() else format(number, ".12g")


def _validate_config(config: Mapping[str, Any]) -> tuple[range, Mapping[str, str]]:
    required = {"forecastContract", "target", "dataBoundary", "features"}
    missing = required - set(config)
    if missing:
        raise ValueError(f"Module 2 config is missing sections: {sorted(missing)}")
    if not str(config.get("version", "")).startswith("module2."):
        raise ValueError("Module 2 config version is invalid")
    contract = config["forecastContract"]
    if contract.get("sameWeekEarlierGamesAllowed") is not False:
        raise ValueError("Module 2 requires same-week isolation")
    seasons = sorted(
        {
            *map(int, contract["warmupSeasons"]),
            *map(int, contract["developmentSeasons"]),
            int(contract["retrospectiveConfirmationSeason"]),
        }
    )
    if seasons != list(range(2010, 2026)):
        raise ValueError("Module 2 retrospective seasons must be contiguous 2010-2025")
    boundary = config["dataBoundary"]
    aliases = {
        str(key).upper(): str(value).upper()
        for key, value in boundary.get("teamAliases", {}).items()
    }
    if "score_differential" not in boundary.get("ephemeralFilterOnlyFields", []):
        raise ValueError("score_differential must remain an ephemeral filter-only field")
    if any(
        column in boundary["scheduleAllowlist"]
        for column in ("home_score", "away_score", "result", "total", "overtime")
    ):
        raise ValueError("schedule outcomes entered the Module 2 allowlist")
    expected_features = {
        feature
        for group in config["features"]["groups"].values()
        for feature in group
    }
    if expected_features != set(TEAM_PROFILE_FEATURES) | set(GAME_FEATURES):
        raise ValueError("Module 2 feature groups do not match the data implementation")
    return range(seasons[0], seasons[-1] + 1), aliases


def _prepare_schedule(
    raw: pd.DataFrame, seasons: range, aliases: Mapping[str, str]
) -> tuple[pd.DataFrame, dict[str, int]]:
    schedule = raw.copy()
    _numeric(schedule, ("season", "week"))
    schedule["home_team"] = schedule["home_team"].map(
        lambda value: _team_alias(value, aliases)
    )
    schedule["away_team"] = schedule["away_team"].map(
        lambda value: _team_alias(value, aliases)
    )
    schedule["gameday"] = pd.to_datetime(schedule["gameday"], errors="coerce")
    window = schedule["season"].between(seasons.start, seasons.stop - 1)
    regular = schedule["game_type"].eq("REG")
    selected = schedule.loc[window & regular].copy()
    required_columns = [
        "game_id",
        "season",
        "week",
        "gameday",
        "home_team",
        "away_team",
        "location",
    ]
    if selected[required_columns].isna().any(axis=None):
        raise RuntimeError("Module 2 schedule has missing game identity/context")
    if selected["game_id"].duplicated().any():
        raise RuntimeError("Module 2 schedule has duplicate game IDs")
    if selected["home_team"].eq(selected["away_team"]).any():
        raise RuntimeError("Module 2 schedule has identical home and away teams")
    selected["season"] = selected["season"].astype(int)
    selected["week"] = selected["week"].astype(int)
    selected["is_neutral_site"] = selected["location"].astype(str).str.lower().eq(
        "neutral"
    )
    selected = selected.sort_values(
        ["season", "week", "gameday", "game_id"], kind="mergesort"
    ).reset_index(drop=True)
    return selected, {
        "schedule_rows_outside_retrospective_regular_seasons": int(
            len(schedule) - len(selected)
        )
    }


_PBP_NUMERIC = (
    "season",
    "week",
    "play_id",
    "qtr",
    "quarter_seconds_remaining",
    "play",
    "drive",
    "fixed_drive",
    "drive_play_id_started",
    "game_seconds_remaining",
    "half_seconds_remaining",
    "score_differential",
    "pass_attempt",
    "rush_attempt",
    "sack",
    "qb_kneel",
    "qb_spike",
    "field_goal_attempt",
    "punt_attempt",
    "kickoff_attempt",
    "extra_point_attempt",
    "two_point_attempt",
    "penalty",
    "aborted_play",
    "incomplete_pass",
    "out_of_bounds",
    "touchback",
    "own_kickoff_recovery",
    "own_kickoff_recovery_td",
    "safety",
    "fumble_lost",
    "interception",
    "return_touchdown",
)


def _prepare_pbp(
    raw: pd.DataFrame,
    season: int,
    schedule: pd.DataFrame,
    aliases: Mapping[str, str],
) -> tuple[pd.DataFrame, dict[str, int]]:
    pbp = raw.copy()
    _numeric(pbp, _PBP_NUMERIC)
    for column in ("home_team", "away_team", "posteam", "defteam"):
        pbp[column] = pbp[column].map(lambda value: _team_alias(value, aliases))
    regular = pbp["season_type"].eq("REG") & pbp["season"].eq(season)
    selected = pbp.loc[regular].copy()
    expected = schedule.loc[schedule["season"].eq(season)].copy()
    observed_ids = set(selected["game_id"].dropna().astype(str))
    expected_ids = set(expected["game_id"].astype(str))
    if observed_ids != expected_ids:
        raise RuntimeError(
            f"pbp_{season} game manifest mismatch: missing="
            f"{sorted(expected_ids - observed_ids)[:5]}, extra="
            f"{sorted(observed_ids - expected_ids)[:5]}"
        )
    if selected[["game_id", "play_id", "season", "week", "qtr"]].isna().any(
        axis=None
    ):
        raise RuntimeError(f"pbp_{season} has missing row identity/timing")
    if selected.duplicated(["game_id", "play_id"]).any():
        raise RuntimeError(f"pbp_{season} has duplicate game/play IDs")
    schedule_identity = expected.set_index("game_id")
    for game_id, game_rows in selected.groupby("game_id", sort=False):
        scheduled = schedule_identity.loc[str(game_id)]
        if int(game_rows["week"].iloc[0]) != int(scheduled["week"]):
            raise RuntimeError(f"pbp week disagrees with schedule for {game_id}")
        source_teams = set(
            game_rows[["home_team", "away_team"]]
            .stack()
            .dropna()
            .astype(str)
        )
        expected_teams = {str(scheduled["home_team"]), str(scheduled["away_team"])}
        if source_teams != expected_teams:
            raise RuntimeError(f"pbp scheduled teams disagree for {game_id}")
    selected = selected.sort_values(["game_id", "play_id"], kind="mergesort")
    return selected.reset_index(drop=True), {
        f"pbp_{season}_non_regular_rows": int(len(pbp) - len(selected))
    }


def _annotate_pbp(frame: pd.DataFrame, config: Mapping[str, Any]) -> pd.DataFrame:
    rows = frame.copy()
    qualifying_types = set(config["target"]["qualifyingPlayTypes"])
    conversion = (
        rows["extra_point_attempt"].fillna(0).eq(1)
        | rows["two_point_attempt"].fillna(0).eq(1)
        | rows["play_type"].isin(["extra_point", "two_point_conversion"])
        | rows["play_type_nfl"].isin(["XP_KICK", "PAT2"])
    )
    kickoff = (
        rows["kickoff_attempt"].fillna(0).eq(1)
        | rows["play_type"].eq("kickoff")
        | rows["play_type_nfl"].isin(["KICK_OFF", "FREE_KICK"])
    )
    # nflverse's generic ``play`` indicator is not a live-ball marker: punts,
    # field goals, kneels, and nearly all spikes are recorded as play == 0 even
    # though the frozen target explicitly qualifies them.  The source
    # ``play_type == no_play`` designation is the nullification boundary.
    explicit_no_play = rows["play_type"].eq("no_play")
    source_qualifying = rows["play_type"].isin(qualifying_types)
    aborted_qualifying = (
        rows["aborted_play"].fillna(0).eq(1)
        & rows["posteam"].notna()
        & ~explicit_no_play
        & ~conversion
        & ~kickoff
    )
    qualifying = (
        (source_qualifying | aborted_qualifying)
        & ~explicit_no_play
        & ~conversion
        & ~kickoff
    )
    scrimmage = qualifying & ~rows["play_type"].isin(["punt", "field_goal"])
    rows["_conversion"] = conversion
    rows["_kickoff"] = kickoff
    rows["_explicit_no_play"] = explicit_no_play
    rows["_qualifying"] = qualifying
    rows["_scrimmage"] = scrimmage
    rows["_clock_stop"] = scrimmage & (
        rows["incomplete_pass"].fillna(0).eq(1)
        | rows["out_of_bounds"].fillna(0).eq(1)
    )
    rows["_duration_seconds"] = rows["drive_time_of_possession"].map(
        _parse_possession_seconds
    )
    return rows


def _missing_value_mask(values: pd.Series) -> pd.Series:
    """Return the frozen pre-fill missing mask for one source field."""

    missing = values.isna().copy()
    if pd.api.types.is_numeric_dtype(values):
        numeric = pd.to_numeric(values, errors="coerce").to_numpy(dtype=float)
        missing |= ~np.isfinite(numeric)
    elif pd.api.types.is_string_dtype(values) or values.dtype == object:
        missing |= values.fillna("").astype(str).str.strip().eq("")
    return missing.astype(bool)


def _missing_examples(frame: pd.DataFrame, mask: pd.Series) -> list[str]:
    examples: list[str] = []
    for row in frame.loc[mask].head(10).itertuples(index=False):
        game_id = str(getattr(row, "game_id", "unknown_game"))
        play_id = getattr(row, "play_id", None)
        examples.append(game_id if play_id is None else f"{game_id}/{play_id}")
    return examples


def _missingness_row(
    frame: pd.DataFrame,
    field: str,
    source: str,
    season: int,
    stratum: str,
    maximum: float,
    invalid: pd.Series | None = None,
) -> dict[str, Any]:
    if field not in frame.columns:
        raise RuntimeError(f"{source} missingness stratum lacks field {field}")
    missing = _missing_value_mask(frame[field])
    if invalid is not None:
        if len(invalid) != len(frame):
            raise RuntimeError("source missingness domain mask is misaligned")
        missing |= invalid.reset_index(drop=True).astype(bool)
    missing = missing.reset_index(drop=True)
    eligible_count = int(len(frame))
    missing_count = int(missing.sum())
    fraction = missing_count / eligible_count if eligible_count else 0.0
    return {
        "source": source,
        "season": int(season),
        "stratum": stratum,
        "field": field,
        "eligible_count": eligible_count,
        "missing_count": missing_count,
        "missing_fraction": float(fraction),
        "maximum": float(maximum),
        "passed": bool(fraction <= maximum),
        "example_ids": _missing_examples(frame.reset_index(drop=True), missing),
    }


def _assert_source_missingness(rows: Sequence[Mapping[str, Any]]) -> None:
    failures = [row for row in rows if not bool(row["passed"])]
    if failures:
        summary = [
            {
                "source": row["source"],
                "season": row["season"],
                "stratum": row["stratum"],
                "field": row["field"],
                "missing_fraction": row["missing_fraction"],
                "maximum": row["maximum"],
                "example_ids": row["example_ids"],
            }
            for row in failures[:12]
        ]
        raise RuntimeError(f"unexpected source missingness exceeded its frozen gate: {summary}")


def _schedule_missingness_rows(
    schedule: pd.DataFrame, config: Mapping[str, Any]
) -> list[dict[str, Any]]:
    spec = config["dataBoundary"]["missingData"]["unexpectedMissingnessStrata"][
        "schedule_identity_context"
    ]
    maximum = float(spec["maximum"])
    rows: list[dict[str, Any]] = []
    for season, group in schedule.groupby("season", sort=True):
        selected = group.reset_index(drop=True)
        for field in spec["fields"]:
            invalid = None
            if field == "season":
                invalid = selected[field].astype(int).ne(int(season))
            elif field == "week":
                invalid = pd.to_numeric(selected[field], errors="coerce").le(0)
            elif field in {"home_team", "away_team"}:
                invalid = selected["home_team"].astype(str).eq(
                    selected["away_team"].astype(str)
                )
            rows.append(
                _missingness_row(
                    selected,
                    str(field),
                    "schedules",
                    int(season),
                    "schedule_identity_context",
                    maximum,
                    invalid,
                )
            )
    _assert_source_missingness(rows)
    return rows


def _neutral_interval_missingness_rows(
    annotated: pd.DataFrame,
    season: int,
    config: Mapping[str, Any],
) -> list[dict[str, Any]]:
    spec = config["dataBoundary"]["missingData"]["unexpectedMissingnessStrata"][
        "neutral_interval_inputs"
    ]
    maximum = float(spec["maximum"])
    current_rows: list[pd.DataFrame] = []
    phase_rows = annotated.loc[
        annotated["qtr"].isin(config["target"]["regulationQuarters"])
    ].sort_values(["game_id", "play_id"], kind="mergesort")
    for (_, _), envelope in phase_rows.groupby(
        ["game_id", "fixed_drive"], sort=False, dropna=False
    ):
        qualifying = envelope.loc[envelope["_qualifying"]].sort_values(
            "play_id", kind="mergesort"
        )
        if qualifying.empty:
            continue
        teams = qualifying["posteam"].astype(str).unique()
        if len(teams) == 1:
            pieces = (qualifying,)
        else:
            labels = _segment_indices(qualifying)
            pieces = tuple(
                qualifying.loc[labels == label].copy()
                for label in np.unique(labels)
            )
        for segment in pieces:
            scrimmage = segment.loc[segment["_scrimmage"]].sort_values(
                "play_id", kind="mergesort"
            )
            if len(scrimmage) < 2:
                continue
            current = scrimmage.iloc[:-1].copy()
            current["following_game_seconds_remaining"] = scrimmage.iloc[1:][
                "game_seconds_remaining"
            ].to_numpy()
            current = current.loc[current["qtr"].isin((1, 2, 3))].copy()
            if current.empty:
                continue
            current["current_game_seconds_remaining"] = current[
                "game_seconds_remaining"
            ]
            current["current_half_seconds_remaining"] = current[
                "half_seconds_remaining"
            ]
            current["current_score_differential"] = current["score_differential"]
            current_rows.append(current)
    pairs = (
        pd.concat(current_rows, ignore_index=True)
        if current_rows
        else pd.DataFrame(
            columns=["game_id", "play_id", *map(str, spec["fields"])]
        )
    )
    return [
        _missingness_row(
            pairs,
            str(field),
            f"pbp_{season}",
            season,
            "neutral_interval_inputs",
            maximum,
        )
        for field in spec["fields"]
    ]


def _pbp_missingness_rows(
    pbp: pd.DataFrame,
    annotated: pd.DataFrame,
    season: int,
    config: Mapping[str, Any],
) -> list[dict[str, Any]]:
    strata = config["dataBoundary"]["missingData"]["unexpectedMissingnessStrata"]
    rows: list[dict[str, Any]] = []
    identity = strata["pbp_identity_timing_and_teams"]
    selected = pbp.reset_index(drop=True)
    for field in identity["fields"]:
        invalid = None
        if field == "season":
            invalid = selected[field].astype(int).ne(int(season))
        elif field == "week":
            invalid = pd.to_numeric(selected[field], errors="coerce").le(0)
        elif field == "qtr":
            invalid = pd.to_numeric(selected[field], errors="coerce").le(0)
        elif field in {"home_team", "away_team"}:
            invalid = selected["home_team"].astype(str).eq(
                selected["away_team"].astype(str)
            )
        rows.append(
            _missingness_row(
                selected,
                str(field),
                f"pbp_{season}",
                season,
                "pbp_identity_timing_and_teams",
                float(identity["maximum"]),
                invalid,
            )
        )

    qualifying = annotated.loc[annotated["_qualifying"]].reset_index(drop=True)
    keys = strata["qualifying_series_keys"]
    for field in keys["fields"]:
        invalid = None
        if field == "posteam":
            invalid = ~(
                qualifying[field].astype(str).eq(qualifying["home_team"].astype(str))
                | qualifying[field].astype(str).eq(qualifying["away_team"].astype(str))
            )
        elif field == "fixed_drive":
            invalid = pd.to_numeric(qualifying[field], errors="coerce").le(0)
        rows.append(
            _missingness_row(
                qualifying,
                str(field),
                f"pbp_{season}",
                season,
                "qualifying_series_keys",
                float(keys["maximum"]),
                invalid,
            )
        )
    _assert_source_missingness(rows)

    repaired_parts: list[pd.DataFrame] = []
    for (_, _), envelope in qualifying.groupby(
        ["game_id", "fixed_drive"], sort=False, dropna=False
    ):
        if envelope["posteam"].nunique(dropna=True) > 1:
            repaired_parts.append(envelope)
    repaired = (
        pd.concat(repaired_parts, ignore_index=True)
        if repaired_parts
        else qualifying.iloc[0:0].copy()
    )
    repaired_spec = strata["repaired_envelope_drive_key"]
    for field in repaired_spec["fields"]:
        invalid = pd.to_numeric(repaired[field], errors="coerce").le(0)
        rows.append(
            _missingness_row(
                repaired,
                str(field),
                f"pbp_{season}",
                season,
                "repaired_envelope_drive_key",
                float(repaired_spec["maximum"]),
                invalid,
            )
        )
    rows.extend(_neutral_interval_missingness_rows(annotated, season, config))
    _assert_source_missingness(rows)
    return rows


_SERIES_COLUMNS = (
    "game_id",
    "season",
    "week",
    "phase",
    "series_id",
    "fixed_drive",
    "segment_index",
    "offense",
    "defense",
    "raw_drive_first",
    "raw_drive_last",
    "first_play_id",
    "last_play_id",
    "qualifying_events",
    "scrimmage_plays",
    "neutral_elapsed_seconds",
    "neutral_pace_opportunities",
    "clock_stops",
    "clock_stop_opportunities",
    "series_duration_seconds",
    "series_duration_observations",
    "kneel_only",
    "aborted_live",
    "repaired",
    "start_transition_audit",
    "end_transition_audit",
    "fixed_drive_result_audit",
)


def _empty_series() -> pd.DataFrame:
    return pd.DataFrame(columns=list(_SERIES_COLUMNS))


def _segment_indices(qualifying: pd.DataFrame) -> np.ndarray:
    """Split ordered qualifying rows on raw-drive OR possession-team change."""

    if qualifying.empty:
        return np.array([], dtype=int)
    if qualifying["drive"].isna().any():
        raise RuntimeError("multi-offense repaired segment has missing raw drive")
    team_changed = qualifying["posteam"].ne(qualifying["posteam"].shift())
    drive_changed = qualifying["drive"].ne(qualifying["drive"].shift())
    boundaries = (team_changed | drive_changed).astype(int)
    boundaries.iloc[0] = 1
    return boundaries.cumsum().to_numpy(dtype=int) - 1


def _series_record(
    segment: pd.DataFrame,
    phase: str,
    segment_index: int,
    repaired: bool,
    neutral_config: Mapping[str, Any],
) -> tuple[dict[str, Any], dict[str, int]]:
    segment = segment.sort_values("play_id", kind="mergesort").copy()
    teams = segment["posteam"].dropna().astype(str).unique()
    if len(teams) != 1:
        raise RuntimeError("corrected series segment does not have one possession team")
    offense = str(teams[0])
    defenses = segment.loc[segment["posteam"].eq(offense), "defteam"].dropna().unique()
    if len(defenses) > 1:
        raise RuntimeError("corrected series segment has multiple defensive teams")
    defense = str(defenses[0]) if len(defenses) else ""
    scrimmage = segment.loc[segment["_scrimmage"]].copy()
    neutral_seconds = 0.0
    neutral_opportunities = 0
    invalid_intervals = 0
    if len(scrimmage) >= 2:
        current = scrimmage.iloc[:-1].copy()
        following_seconds = scrimmage["game_seconds_remaining"].iloc[1:].to_numpy(
            dtype=float
        )
        current_seconds = current["game_seconds_remaining"].to_numpy(dtype=float)
        elapsed = current_seconds - following_seconds
        neutral = (
            current["qtr"].isin(neutral_config["quarters"]).to_numpy()
            & current["half_seconds_remaining"]
            .ge(float(neutral_config["minimumHalfSecondsRemaining"]))
            .to_numpy()
            & current["score_differential"]
            .abs()
            .le(float(neutral_config["maximumAbsolutePregameIndependentScoreDifferential"]))
            .to_numpy()
        )
        finite_nonnegative = np.isfinite(elapsed) & (elapsed >= 0)
        invalid_intervals = int(np.sum(neutral & ~finite_nonnegative))
        included = neutral & finite_nonnegative
        neutral_seconds = float(np.sum(elapsed[included]))
        neutral_opportunities = int(np.sum(included))
    durations = np.unique(
        segment.loc[
            np.isfinite(segment["_duration_seconds"])
            & segment["_duration_seconds"].ge(0),
            "_duration_seconds",
        ].to_numpy(dtype=float)
    )
    # Provider time of possession belongs to the unsplit fixed-drive envelope.
    # Once a multi-offense envelope is repaired, none of its child segments may
    # inherit that unsplittable duration, even when the provider value is unique.
    repaired_duration_withheld = int(repaired)
    duration_conflict = int(not repaired and len(durations) > 1)
    duration = (
        float(durations[0]) if not repaired and len(durations) == 1 else float("nan")
    )
    duration_observation = int(np.isfinite(duration))
    kneels = (
        scrimmage["qb_kneel"].fillna(0).eq(1)
        | scrimmage["play_type"].eq("qb_kneel")
    )
    spikes = (
        scrimmage["qb_spike"].fillna(0).eq(1)
        | scrimmage["play_type"].eq("qb_spike")
    )
    kneel_only = bool(len(scrimmage) > 0 and (kneels | spikes).all())
    first = segment.iloc[0]
    last = segment.iloc[-1]
    fixed_drive = first["fixed_drive"]
    series_id = (
        f"{first['game_id']}/{phase}/{_drive_token(fixed_drive)}/"
        f"{segment_index}/{offense}"
    )
    raw_drives = segment["drive"].dropna().to_numpy(dtype=float)
    record = {
        "game_id": str(first["game_id"]),
        "season": int(first["season"]),
        "week": int(first["week"]),
        "phase": phase,
        "series_id": series_id,
        "fixed_drive": float(fixed_drive),
        "segment_index": int(segment_index),
        "offense": offense,
        "defense": defense,
        "raw_drive_first": float(raw_drives[0]) if len(raw_drives) else float("nan"),
        "raw_drive_last": float(raw_drives[-1]) if len(raw_drives) else float("nan"),
        "first_play_id": float(first["play_id"]),
        "last_play_id": float(last["play_id"]),
        "qualifying_events": int(len(segment)),
        "scrimmage_plays": int(len(scrimmage)),
        "neutral_elapsed_seconds": neutral_seconds,
        "neutral_pace_opportunities": neutral_opportunities,
        "clock_stops": int(scrimmage["_clock_stop"].sum()),
        "clock_stop_opportunities": int(len(scrimmage)),
        "series_duration_seconds": duration,
        "series_duration_observations": duration_observation,
        "kneel_only": kneel_only,
        "aborted_live": bool(segment["aborted_play"].fillna(0).eq(1).any()),
        "repaired": bool(repaired),
        "start_transition_audit": first["drive_start_transition"],
        "end_transition_audit": last["drive_end_transition"],
        "fixed_drive_result_audit": last["fixed_drive_result"],
    }
    return record, {
        "invalid_neutral_clock_intervals": invalid_intervals,
        "series_duration_conflicts": duration_conflict,
        "series_duration_missing": int(not duration_observation),
        "repaired_duration_withheld": repaired_duration_withheld,
    }


def _non_series_record(envelope: pd.DataFrame, phase: str) -> dict[str, Any]:
    ordered = envelope.sort_values("play_id", kind="mergesort")
    if ordered["_kickoff"].any():
        reason = "kickoff_only"
    elif ordered["_conversion"].any():
        reason = "conversion_only"
    elif ordered["_explicit_no_play"].any() or ordered["penalty"].fillna(0).eq(1).any():
        reason = "penalty_or_no_play_only"
    elif ordered["play_type_nfl"].isin(
        ["GAME_START", "END_QUARTER", "END_GAME", "TIMEOUT", "COMMENT"]
    ).all():
        reason = "administrative_only"
    else:
        reason = "other_nonqualifying"
    first = ordered.iloc[0]
    return {
        "game_id": str(first["game_id"]),
        "season": int(first["season"]),
        "week": int(first["week"]),
        "phase": phase,
        "fixed_drive": float(first["fixed_drive"]),
        "first_play_id": float(ordered["play_id"].min()),
        "last_play_id": float(ordered["play_id"].max()),
        "reason": reason,
        "kickoff_rows": int(ordered["_kickoff"].sum()),
        "conversion_rows": int(ordered["_conversion"].sum()),
        "penalty_or_no_play_rows": int(
            (ordered["_explicit_no_play"] | ordered["penalty"].fillna(0).eq(1)).sum()
        ),
        "return_touchdown_rows": int(ordered["return_touchdown"].fillna(0).eq(1).sum()),
    }


def _reconstruct_phase(
    annotated: pd.DataFrame,
    phase: str,
    config: Mapping[str, Any],
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    if phase == "regulation":
        phase_rows = annotated.loc[annotated["qtr"].isin(config["target"]["regulationQuarters"])]
    elif phase == "overtime":
        phase_rows = annotated.loc[
            annotated["qtr"].ge(int(config["target"]["overtimeMinimumQuarter"]))
        ]
    else:
        raise ValueError(f"unknown phase {phase!r}")
    phase_rows = phase_rows.sort_values(["game_id", "play_id"], kind="mergesort")
    qualifying = phase_rows.loc[phase_rows["_qualifying"]]
    if qualifying["posteam"].isna().any():
        raise RuntimeError("qualifying row is missing possession team")
    if qualifying["fixed_drive"].isna().any():
        raise RuntimeError("qualifying row is missing fixed_drive")
    records: list[dict[str, Any]] = []
    non_series: list[dict[str, Any]] = []
    multi_keys: list[str] = []
    repaired_segment_count = 0
    audit_counts = {
        "invalid_neutral_clock_intervals": 0,
        "series_duration_conflicts": 0,
        "series_duration_missing": 0,
        "repaired_duration_withheld": 0,
    }
    for (game_id, fixed_drive), envelope in phase_rows.groupby(
        ["game_id", "fixed_drive"], sort=False, dropna=False
    ):
        qrows = envelope.loc[envelope["_qualifying"]].sort_values(
            "play_id", kind="mergesort"
        )
        if qrows.empty:
            non_series.append(_non_series_record(envelope, phase))
            continue
        teams = qrows["posteam"].astype(str).unique()
        if len(teams) == 1:
            pieces = [(0, qrows)]
            repaired = False
        else:
            fixture_key = f"{game_id}/{_drive_token(fixed_drive)}"
            multi_keys.append(fixture_key)
            labels = _segment_indices(qrows)
            pieces = [
                (int(label), qrows.loc[labels == label].copy())
                for label in np.unique(labels)
            ]
            repaired = True
            repaired_segment_count += len(pieces)
        for segment_index, segment in pieces:
            record, record_audits = _series_record(
                segment,
                phase,
                segment_index,
                repaired,
                config["features"]["situationNeutralFilter"],
            )
            records.append(record)
            for key, value in record_audits.items():
                audit_counts[key] += int(value)
    series = pd.DataFrame(records, columns=list(_SERIES_COLUMNS))
    if not series.empty:
        if series["series_id"].duplicated().any():
            raise RuntimeError("corrected offensive-series key is not unique")
        if (series["qualifying_events"] <= 0).any():
            raise RuntimeError("series without qualifying event escaped reconstruction")
    control = pd.DataFrame(non_series)
    audit: dict[str, Any] = {
        "phase": phase,
        "source_rows": int(len(phase_rows)),
        "qualifying_rows": int(len(qualifying)),
        "candidate_envelopes": int(
            phase_rows.groupby(["game_id", "fixed_drive"], dropna=False).ngroups
        ),
        "series": int(len(series)),
        "non_series_envelopes": int(len(control)),
        "multi_offense_fixture_keys": sorted(multi_keys),
        "repaired_segments": int(repaired_segment_count),
        **audit_counts,
    }
    return series, control, audit


def _validate_repair_fixtures(
    observed: Sequence[str], config: Mapping[str, Any]
) -> None:
    expected = sorted(config["target"]["driveRepair"]["knownMultiOffenseFixtureKeys"])
    if sorted(observed) != expected:
        raise RuntimeError(
            "multi-offense fixed_drive fixture set changed; produce a target-diff "
            f"before continuing (expected={expected}, observed={sorted(observed)})"
        )


def _series_metrics(series: pd.DataFrame, team: str) -> dict[str, float]:
    rows = series.loc[series["offense"].eq(team)]
    return {
        "regulation_offensive_series": float(len(rows)),
        "neutral_elapsed_seconds": float(rows["neutral_elapsed_seconds"].sum()),
        "neutral_pace_opportunities": float(rows["neutral_pace_opportunities"].sum()),
        "scrimmage_plays": float(rows["scrimmage_plays"].sum()),
        "regulation_series_for_play_rate": float(len(rows)),
        "series_duration_seconds": float(rows["series_duration_seconds"].sum()),
        "series_duration_observations": float(rows["series_duration_observations"].sum()),
        "clock_stops": float(rows["clock_stops"].sum()),
        "clock_stop_opportunities": float(rows["clock_stop_opportunities"].sum()),
        "kneel_only_series": float(rows["kneel_only"].sum()),
    }


def _audit_primary_target_integrity(
    primary: pd.DataFrame,
    game_ids: pd.Series,
    integrity_bounds: Mapping[str, Any],
) -> dict[str, Any]:
    """Enforce hard support and report, but never censor, historical warnings."""

    hard_lower = int(integrity_bounds["hardMinimumObservedPerTeam"])
    hard_upper = int(integrity_bounds["hardMaximumObservedPerTeam"])
    historical_lower = int(integrity_bounds["historicalAuditExpectedMinimum"])
    historical_upper = int(integrity_bounds["historicalAuditExpectedMaximum"])
    values = primary.to_numpy(dtype=float)
    if (~np.isfinite(values)).any() or not np.equal(values, np.floor(values)).all():
        raise RuntimeError("non-integer offensive-series target")
    if not primary.ge(hard_lower).all(axis=None) or not primary.le(hard_upper).all(
        axis=None
    ):
        extrema = (int(primary.min().min()), int(primary.max().max()))
        raise RuntimeError(
            "offensive-series target outside hard integrity bounds "
            f"{hard_lower}-{hard_upper}: {extrema}"
        )
    historical_outside = ~primary.ge(historical_lower) | ~primary.le(historical_upper)
    historical_outside_games = game_ids.loc[
        historical_outside.any(axis=1)
    ].astype(str).tolist()
    return {
        "minimum_regulation_series_per_team": int(primary.min().min()),
        "maximum_regulation_series_per_team": int(primary.max().max()),
        "hard_integrity_range": [hard_lower, hard_upper],
        "historical_audit_expected_range": [historical_lower, historical_upper],
        "outside_historical_audit_range_count": int(historical_outside.sum().sum()),
        "outside_historical_audit_range_game_ids": historical_outside_games,
        "outside_historical_audit_range_warning": bool(historical_outside.any(axis=None)),
    }


def _build_team_games_and_targets(
    schedule: pd.DataFrame,
    regulation_series: pd.DataFrame,
    overtime_series: pd.DataFrame,
    overtime_game_ids: set[str],
    integrity_bounds: Mapping[str, Any],
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    team_records: list[dict[str, Any]] = []
    target_records: list[dict[str, Any]] = []
    for game in schedule.itertuples(index=False):
        game_reg = regulation_series.loc[regulation_series["game_id"].eq(game.game_id)]
        game_ot = overtime_series.loc[overtime_series["game_id"].eq(game.game_id)]
        expected = {str(game.home_team), str(game.away_team)}
        observed = set(game_reg["offense"].astype(str))
        if observed != expected:
            raise RuntimeError(
                f"scheduled team missing from reconstructed game {game.game_id}: "
                f"expected={sorted(expected)}, observed={sorted(observed)}"
            )
        per_team = {
            team: _series_metrics(game_reg, team)
            for team in (str(game.home_team), str(game.away_team))
        }
        ot_counts = {
            team: int(game_ot["offense"].eq(team).sum())
            for team in (str(game.home_team), str(game.away_team))
        }
        for team, opponent, is_home in (
            (str(game.home_team), str(game.away_team), 1.0),
            (str(game.away_team), str(game.home_team), 0.0),
        ):
            own = per_team[team]
            allowed = per_team[opponent]
            team_records.append(
                {
                    "game_id": str(game.game_id),
                    "season": int(game.season),
                    "week": int(game.week),
                    "game_date": pd.Timestamp(game.gameday).normalize(),
                    "team": team,
                    "opponent": opponent,
                    "is_home": is_home,
                    "is_neutral_site": float(bool(game.is_neutral_site)),
                    "games": 1.0,
                    **own,
                    "opponent_regulation_series_faced": allowed[
                        "regulation_offensive_series"
                    ],
                    "opponent_neutral_elapsed_seconds_allowed": allowed[
                        "neutral_elapsed_seconds"
                    ],
                    "opponent_neutral_pace_opportunities_allowed": allowed[
                        "neutral_pace_opportunities"
                    ],
                    "opponent_scrimmage_plays_allowed": allowed["scrimmage_plays"],
                    "opponent_regulation_series_for_play_rate_allowed": allowed[
                        "regulation_series_for_play_rate"
                    ],
                    "opponent_series_duration_seconds_allowed": allowed[
                        "series_duration_seconds"
                    ],
                    "opponent_series_duration_observations_allowed": allowed[
                        "series_duration_observations"
                    ],
                    "opponent_clock_stops_allowed": allowed["clock_stops"],
                    "opponent_clock_stop_opportunities_allowed": allowed[
                        "clock_stop_opportunities"
                    ],
                    "overtime_offensive_series": float(ot_counts[team]),
                }
            )
        target_records.append(
            {
                "game_id": str(game.game_id),
                "season": int(game.season),
                "week": int(game.week),
                "home_team": str(game.home_team),
                "away_team": str(game.away_team),
                "home_regulation_offensive_series": int(
                    per_team[str(game.home_team)]["regulation_offensive_series"]
                ),
                "away_regulation_offensive_series": int(
                    per_team[str(game.away_team)]["regulation_offensive_series"]
                ),
                "overtime_occurred": int(str(game.game_id) in overtime_game_ids),
                "home_overtime_offensive_series": ot_counts[str(game.home_team)],
                "away_overtime_offensive_series": ot_counts[str(game.away_team)],
            }
        )
    team_games = pd.DataFrame(team_records).sort_values(
        ["season", "week", "game_date", "game_id", "is_home"],
        ascending=[True, True, True, True, False],
        kind="mergesort",
    ).reset_index(drop=True)
    targets = pd.DataFrame(target_records).sort_values(
        ["season", "week", "game_id"], kind="mergesort"
    ).reset_index(drop=True)
    if len(team_games) != 2 * len(schedule) or len(targets) != len(schedule):
        raise RuntimeError("team-game or target manifest is incomplete")
    primary = targets[
        [
            "home_regulation_offensive_series",
            "away_regulation_offensive_series",
        ]
    ]
    target_integrity = _audit_primary_target_integrity(
        primary, targets["game_id"], integrity_bounds
    )
    return team_games, targets, {
        "team_game_rows": int(len(team_games)),
        "target_games": int(len(targets)),
        **target_integrity,
        "overtime_games": int(targets["overtime_occurred"].sum()),
    }


def _origin_timestamp(week_games: pd.DataFrame) -> str:
    first_date = pd.Timestamp(week_games["gameday"].min()).date()
    days_since_tuesday = (first_date.weekday() - 1) % 7
    tuesday = first_date - pd.Timedelta(days=days_since_tuesday)
    local = datetime.combine(
        tuesday, time(hour=7, minute=30), ZoneInfo("America/Los_Angeles")
    )
    return local.isoformat()


def history_before_module_two_origin(
    team_games: pd.DataFrame,
    season: int,
    week: int,
    forecast_at: str,
) -> pd.DataFrame:
    """Public same-week-isolation hook used by runners and negative controls."""

    eligible = team_games["season"].lt(season) | (
        team_games["season"].eq(season) & team_games["week"].lt(week)
    )
    origin = pd.Timestamp(forecast_at)
    if origin.tzinfo is not None:
        origin = origin.tz_localize(None)
    dates = pd.to_datetime(team_games["game_date"], errors="coerce")
    eligible &= dates.lt(origin.normalize())
    result = team_games.loc[eligible].copy()
    assert_module_two_history_cutoff(result, season, week, forecast_at)
    return result


def assert_module_two_history_cutoff(
    history: pd.DataFrame, season: int, week: int, forecast_at: str
) -> None:
    """Reject future, same-week, or Tuesday-date rows supplied to an origin."""

    invalid_week = history["season"].gt(season) | (
        history["season"].eq(season) & history["week"].ge(week)
    )
    origin = pd.Timestamp(forecast_at)
    if origin.tzinfo is not None:
        origin = origin.tz_localize(None)
    invalid_date = pd.to_datetime(history["game_date"], errors="coerce").ge(
        origin.normalize()
    )
    if invalid_week.any() or invalid_date.any():
        raise RuntimeError(f"future/same-week row reached origin {season}-{week}")


def _time_weights(
    rows: pd.DataFrame,
    origin_season: int,
    config: Mapping[str, Any],
    use_time_decay: bool,
) -> np.ndarray:
    seasons = rows["season"].to_numpy(dtype=float)
    ages = origin_season - seasons
    if (ages < 0).any():
        raise RuntimeError("future season reached Module 2 weighting")
    if use_time_decay:
        half_life = float(config["features"]["timeDecayHalfLifeSeasons"])
        weights = np.power(0.5, ages / half_life)
    else:
        weights = np.ones(len(rows), dtype=float)
    multipliers = config["features"].get("observationWeightMultipliersBySeason", {})
    weights *= np.array(
        [float(multipliers.get(str(int(season)), 1.0)) for season in seasons],
        dtype=float,
    )
    if (~np.isfinite(weights)).any() or (weights < 0).any():
        raise RuntimeError("invalid Module 2 observation weight")
    return weights


def _weighted_sum(rows: pd.DataFrame, column: str, weights: np.ndarray) -> float:
    values = rows[column].to_numpy(dtype=float)
    observed = np.isfinite(values)
    if not observed.any():
        return 0.0
    return float(np.sum(values[observed] * weights[observed]))


def _weighted_rate(
    rows: pd.DataFrame, numerator: str, denominator: str, weights: np.ndarray
) -> float:
    denominator_sum = _weighted_sum(rows, denominator, weights)
    if denominator_sum <= 0:
        return float("nan")
    return _weighted_sum(rows, numerator, weights) / denominator_sum


def _latest_team_games(
    history: pd.DataFrame, team: str, maximum_games: int
) -> pd.DataFrame:
    return (
        history.loc[history["team"].eq(team)]
        .sort_values(["season", "week", "game_date", "game_id"], kind="mergesort")
        .tail(maximum_games)
        .copy()
    )


def _profile_rate(
    rows: pd.DataFrame,
    numerator: str,
    denominator: str,
    league_prior: float,
    prior_strength: float,
    origin_season: int,
    config: Mapping[str, Any],
    use_time_decay: bool,
) -> tuple[float, float]:
    weights = _time_weights(rows, origin_season, config, use_time_decay)
    observed_denominator = _weighted_sum(rows, denominator, weights)
    missing = float(observed_denominator <= 0)
    if not np.isfinite(league_prior):
        return float("nan"), 1.0
    numerator_sum = _weighted_sum(rows, numerator, weights)
    value = (
        numerator_sum + prior_strength * league_prior
    ) / (observed_denominator + prior_strength)
    return float(value), missing


def _matchup_profile(
    team: str,
    opponent: str,
    history: pd.DataFrame,
    league_priors: Mapping[str, float],
    origin_season: int,
    config: Mapping[str, Any],
    use_time_decay: bool,
) -> dict[str, float]:
    window = int(config["features"]["teamHistoryWindowGames"])
    team_rows = _latest_team_games(history, team, window)
    opponent_rows = _latest_team_games(history, opponent, window)
    prior_strengths = {
        "games": float(config["features"]["possessionPriorGames"]),
        "plays": float(config["features"]["pacePriorOpportunities"]),
        "series": float(config["features"]["drivePriorSeries"]),
    }
    profile: dict[str, float] = {}
    for feature, (perspective, numerator, denominator, family) in _PROFILE_SPECS.items():
        rows = team_rows if perspective == "offense" else opponent_rows
        value, missing = _profile_rate(
            rows,
            numerator,
            denominator,
            league_priors[feature],
            prior_strengths[family],
            origin_season,
            config,
            use_time_decay,
        )
        profile[feature] = value
        profile[f"{feature}_missing"] = missing
    return profile


def _league_priors(
    history: pd.DataFrame,
    origin_season: int,
    config: Mapping[str, Any],
    use_time_decay: bool,
) -> dict[str, float]:
    weights = _time_weights(history, origin_season, config, use_time_decay)
    return {
        feature: _weighted_rate(history, numerator, denominator, weights)
        for feature, (_, numerator, denominator, _) in _PROFILE_SPECS.items()
    }


def _p0_home_away_means(
    history: pd.DataFrame,
    origin_season: int,
    config: Mapping[str, Any],
    use_time_decay: bool,
) -> tuple[float, float]:
    """Apply the frozen 64-game older-season prior and current-season update."""

    older = history.loc[history["season"].lt(origin_season)]
    current = history.loc[history["season"].eq(origin_season)]
    older_home = older.loc[
        older["is_home"].eq(1) & older["is_neutral_site"].eq(0)
    ]
    older_away = older.loc[
        older["is_home"].eq(0) & older["is_neutral_site"].eq(0)
    ]
    current_home = current.loc[
        current["is_home"].eq(1) & current["is_neutral_site"].eq(0)
    ]
    current_away = current.loc[
        current["is_home"].eq(0) & current["is_neutral_site"].eq(0)
    ]
    older_home_weights = _time_weights(
        older_home, origin_season, config, use_time_decay
    )
    older_away_weights = _time_weights(
        older_away, origin_season, config, use_time_decay
    )
    home_prior = _weighted_rate(
        older_home,
        "regulation_offensive_series",
        "games",
        older_home_weights,
    )
    away_prior = _weighted_rate(
        older_away,
        "regulation_offensive_series",
        "games",
        older_away_weights,
    )
    if not np.isfinite(home_prior) or not np.isfinite(away_prior):
        return float("nan"), float("nan")
    prior_games = float(config["features"]["leagueSeasonPriorGames"])

    def update(rows: pd.DataFrame, prior: float) -> float:
        weights = _time_weights(rows, origin_season, config, use_time_decay)
        games = _weighted_sum(rows, "games", weights)
        series = _weighted_sum(rows, "regulation_offensive_series", weights)
        return float((series + prior_games * prior) / (games + prior_games))

    return update(current_home, home_prior), update(current_away, away_prior)


def _p1_home_adjustment(
    history: pd.DataFrame,
    origin_season: int,
    config: Mapping[str, Any],
    use_time_decay: bool,
) -> float:
    """Frozen P1 signed home context from all eligible nonneutral history."""

    nonneutral = history.loc[history["is_neutral_site"].eq(0)]
    home = nonneutral.loc[nonneutral["is_home"].eq(1)]
    away = nonneutral.loc[nonneutral["is_home"].eq(0)]
    home_rate = _weighted_rate(
        home,
        "regulation_offensive_series",
        "games",
        _time_weights(home, origin_season, config, use_time_decay),
    )
    away_rate = _weighted_rate(
        away,
        "regulation_offensive_series",
        "games",
        _time_weights(away, origin_season, config, use_time_decay),
    )
    if not np.isfinite(home_rate) or not np.isfinite(away_rate):
        return float("nan")
    return float(0.5 * (home_rate - away_rate))


def build_module_two_origin_games(
    schedule: pd.DataFrame,
    team_games: pd.DataFrame,
    config: Mapping[str, Any],
    *,
    use_time_decay: bool = True,
) -> pd.DataFrame:
    """Public rebuild hook for chronological origin frames and ablations.

    Setting ``use_time_decay=False`` removes exponential time decay from every
    league prior and team/opponent profile.  The frozen 2020 observation
    multiplier remains an era weight.  A model runner must also remove decay
    from its later observation weights for the full ``no_time_decay`` ablation.
    """

    records: list[dict[str, Any]] = []
    prehistory_season = min(map(int, config["forecastContract"]["warmupSeasons"]))
    lower_mean, upper_mean = map(float, config["distribution"]["predictionMeanBounds"])
    for (season, week), week_games in schedule.groupby(["season", "week"], sort=True):
        season, week = int(season), int(week)
        forecast_at = _origin_timestamp(week_games)
        history = history_before_module_two_origin(
            team_games, season, week, forecast_at
        )
        current_ids = set(week_games["game_id"].astype(str))
        if current_ids & set(history["game_id"].astype(str)):
            raise RuntimeError("current-week game entered Module 2 origin history")
        priors = _league_priors(history, season, config, use_time_decay)
        home_mean, away_mean = _p0_home_away_means(
            history, season, config, use_time_decay
        )
        home_adjustment = _p1_home_adjustment(
            history, season, config, use_time_decay
        )
        origin_inputs = [*priors.values(), home_mean, away_mean, home_adjustment]
        if not all(np.isfinite(value) for value in origin_inputs):
            if season != prehistory_season:
                raise RuntimeError(
                    f"nonfinite league prior at forecastable origin {season}-{week}"
                )
            # 2010 is frozen as source-only prehistory. Its targets and raw
            # team-game rows remain available, but no pseudo-prior is invented.
            continue
        overall_mean = (
            0.5 * (home_mean + away_mean)
            if np.isfinite(home_mean) and np.isfinite(away_mean)
            else float("nan")
        )
        if history.empty:
            input_season: float | int = float("nan")
            input_week: float | int = float("nan")
            maximum_date: str | None = None
        else:
            maximum = history.sort_values(
                ["season", "week", "game_date", "game_id"], kind="mergesort"
            ).iloc[-1]
            input_season, input_week = int(maximum["season"]), int(maximum["week"])
            maximum_date = pd.Timestamp(history["game_date"].max()).date().isoformat()
        origin_hash = _stable_json_hash(
            {
                "season": season,
                "week": week,
                "forecast_at": forecast_at,
                "use_time_decay": use_time_decay,
                "history": _hash_dataframe(
                    history, ("season", "week", "game_id", "team")
                ),
                "config_version": config.get("version"),
            }
        )
        for game in week_games.sort_values(["gameday", "game_id"]).itertuples(
            index=False
        ):
            home_profile = _matchup_profile(
                str(game.home_team),
                str(game.away_team),
                history,
                priors,
                season,
                config,
                use_time_decay,
            )
            away_profile = _matchup_profile(
                str(game.away_team),
                str(game.home_team),
                history,
                priors,
                season,
                config,
                use_time_decay,
            )
            neutral = bool(game.is_neutral_site)
            p0_home = overall_mean if neutral else home_mean
            p0_away = overall_mean if neutral else away_mean
            p1_home = 0.5 * (
                home_profile["offense_regulation_series_per_game"]
                + home_profile["opponent_regulation_series_faced_per_game"]
            )
            p1_away = 0.5 * (
                away_profile["offense_regulation_series_per_game"]
                + away_profile["opponent_regulation_series_faced_per_game"]
            )
            if not neutral and np.isfinite(home_adjustment):
                p1_home += home_adjustment
                p1_away -= home_adjustment
            if np.isfinite(p1_home):
                p1_home = float(np.clip(p1_home, lower_mean, upper_mean))
            if np.isfinite(p1_away):
                p1_away = float(np.clip(p1_away, lower_mean, upper_mean))
            record: dict[str, Any] = {
                "game_id": str(game.game_id),
                "season": season,
                "week": week,
                "forecast_at": forecast_at,
                "home_team": str(game.home_team),
                "away_team": str(game.away_team),
                "is_neutral_site": float(neutral),
                "league_team_regulation_series_mean": overall_mean,
                "league_home_regulation_series_mean": home_mean,
                "league_away_regulation_series_mean": away_mean,
                "p0_home_mean": p0_home,
                "p0_away_mean": p0_away,
                "p1_home_mean": p1_home,
                "p1_away_mean": p1_away,
                "inputs_through_season": input_season,
                "inputs_through_week": input_week,
                "maximum_input_game_date": maximum_date,
                "origin_hash": origin_hash,
                "historical_availability": HISTORICAL_AVAILABILITY,
            }
            for name in TEAM_PROFILE_FEATURE_AND_INDICATOR_NAMES:
                record[f"home_{name}"] = home_profile[name]
                record[f"away_{name}"] = away_profile[name]
            records.append(record)
    games = pd.DataFrame(records).sort_values(
        ["season", "week", "game_id"], kind="mergesort"
    ).reset_index(drop=True)
    expected_schedule = schedule.loc[schedule["season"].ne(prehistory_season)]
    if len(games) != len(expected_schedule) or games["game_id"].duplicated().any():
        raise RuntimeError("Module 2 origin build lost or duplicated a scheduled game")
    if set(games["game_id"].astype(str)) != set(
        expected_schedule["game_id"].astype(str)
    ):
        raise RuntimeError("Module 2 origin build changed the forecastable manifest")
    _assert_feature_boundary(games, config)
    return games


def _assert_feature_boundary(frame: pd.DataFrame, config: Mapping[str, Any]) -> None:
    forbidden_columns = set(TARGET_COLUMNS) | {
        "score_differential",
        "fixed_drive_result",
        "drive_start_transition",
        "drive_end_transition",
        "home_score",
        "away_score",
        "final_score",
    }
    overlap = forbidden_columns & set(frame.columns)
    if overlap:
        raise RuntimeError(f"outcome/audit field entered feature frame: {sorted(overlap)}")
    normalized = [_normalized_field(column) for column in frame.columns]
    violations = [
        pattern
        for pattern in map(
            _normalized_field, config["dataBoundary"]["forbiddenFieldPatterns"]
        )
        if any(pattern in column for column in normalized)
    ]
    if violations:
        raise RuntimeError(f"forbidden feature-frame patterns: {sorted(set(violations))}")


def _missingness_report(
    games: pd.DataFrame, games_no_time_decay: pd.DataFrame
) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    columns = [
        f"{side}_{feature}"
        for side in ("home", "away")
        for feature in TEAM_PROFILE_FEATURE_AND_INDICATOR_NAMES
    ] + ["p0_home_mean", "p0_away_mean", "p1_home_mean", "p1_away_mean"]
    for label, frame in (
        ("time_decay", games),
        ("no_time_decay", games_no_time_decay),
    ):
        for column in columns:
            missing = int(frame[column].isna().sum())
            rows.append(
                {
                    "frame": label,
                    "column": column,
                    "missing_count": missing,
                    "missing_fraction": missing / len(frame) if len(frame) else 0.0,
                    "classification": "structural_pre_history"
                    if missing
                    else "observed_or_fold_imputed",
                }
            )
    return pd.DataFrame(rows)


def _source_snapshot(
    cached: _VerifiedObject,
    frame: pd.DataFrame,
    sort_columns: Sequence[str],
) -> ModuleTwoSourceSnapshot:
    return ModuleTwoSourceSnapshot(
        logical_name=cached.logical_name,
        url=cached.url,
        sha256=cached.sha256,
        projected_sha256=_hash_dataframe(frame, sort_columns),
        byte_count=cached.byte_count,
        row_count=len(frame),
        projected_columns=tuple(frame.columns),
        cache_path=str(cached.path.resolve()),
        downloaded_at=cached.downloaded_at,
    )


def build_module_two_dataset(
    config: dict, cache_dir: Path
) -> ModuleTwoDataset:
    """Build the frozen Module 2 data products from a read-only Module 1 cache.

    Parameters
    ----------
    config:
        Parsed current ``model-lab-module-two.config.json`` mapping.
    cache_dir:
        Existing Module 1 content-addressed cache.  The directory and its index
        are verified before use and re-hashed afterward; no refresh/write path
        exists in this module.
    """

    seasons, aliases = _validate_config(config)
    boundary = config["dataBoundary"]
    forbidden = tuple(boundary["forbiddenFieldPatterns"])
    cache = _ReadOnlyContentAddressedCache(Path(cache_dir))
    index_hash_before = cache.index_sha256
    manifest: list[ModuleTwoSourceSnapshot] = []
    exclusions: dict[str, int] = {}

    schedule_object = cache.get("schedules", SCHEDULE_URL)
    raw_schedule = _read_positive_csv(
        schedule_object.path,
        tuple(boundary["scheduleAllowlist"]),
        forbidden,
        "schedules",
    )
    manifest.append(
        _source_snapshot(
            schedule_object, raw_schedule, ("season", "week", "game_id")
        )
    )
    schedule, schedule_exclusions = _prepare_schedule(raw_schedule, seasons, aliases)
    exclusions.update(schedule_exclusions)
    del raw_schedule
    source_missingness: list[dict[str, Any]] = _schedule_missingness_rows(
        schedule, config
    )

    regulation_frames: list[pd.DataFrame] = []
    overtime_frames: list[pd.DataFrame] = []
    non_series_frames: list[pd.DataFrame] = []
    reconstruction_audits: list[dict[str, Any]] = []
    regulation_multi_keys: list[str] = []
    overtime_game_ids: set[str] = set()

    for season in seasons:
        logical_name = f"pbp_{season}"
        pbp_object = cache.get(logical_name, PBP_URL.format(season=season))
        raw_pbp = _read_positive_csv(
            pbp_object.path,
            tuple(boundary["pbpAllowlist"]),
            forbidden,
            logical_name,
        )
        manifest.append(
            _source_snapshot(
                pbp_object,
                raw_pbp,
                ("season", "week", "game_id", "play_id"),
            )
        )
        pbp, pbp_exclusions = _prepare_pbp(raw_pbp, season, schedule, aliases)
        exclusions.update(pbp_exclusions)
        del raw_pbp
        annotated = _annotate_pbp(pbp, config)
        source_missingness.extend(
            _pbp_missingness_rows(pbp, annotated, season, config)
        )
        fixed_phase_counts = annotated.groupby(["game_id", "fixed_drive"])["qtr"].agg(
            lambda values: (values.le(4).any(), values.ge(5).any())
        )
        if any(regulation and overtime for regulation, overtime in fixed_phase_counts):
            raise RuntimeError("regulation and overtime share a corrected series key")
        overtime_game_ids.update(
            annotated.loc[
                annotated["qtr"].ge(int(config["target"]["overtimeMinimumQuarter"])),
                "game_id",
            ]
            .astype(str)
            .unique()
        )
        regulation, regulation_control, regulation_audit = _reconstruct_phase(
            annotated, "regulation", config
        )
        overtime, overtime_control, overtime_audit = _reconstruct_phase(
            annotated, "overtime", config
        )
        regulation_frames.append(regulation)
        overtime_frames.append(overtime)
        non_series_frames.extend([regulation_control, overtime_control])
        regulation_multi_keys.extend(regulation_audit["multi_offense_fixture_keys"])
        reconstruction_audits.extend(
            [
                {"season": season, **regulation_audit},
                {"season": season, **overtime_audit},
            ]
        )
        exclusions[f"pbp_{season}_overtime_rows_excluded_from_primary"] = int(
            annotated["qtr"].ge(int(config["target"]["overtimeMinimumQuarter"])).sum()
        )
        exclusions[f"pbp_{season}_conversion_rows_excluded"] = int(
            annotated["_conversion"].sum()
        )
        exclusions[f"pbp_{season}_kickoff_rows_nonqualifying"] = int(
            annotated["_kickoff"].sum()
        )
        del annotated, pbp

    _validate_repair_fixtures(regulation_multi_keys, config)
    regulation_series = pd.concat(regulation_frames, ignore_index=True).sort_values(
        ["season", "week", "game_id", "first_play_id", "series_id"],
        kind="mergesort",
    ).reset_index(drop=True)
    overtime_series = pd.concat(overtime_frames, ignore_index=True).sort_values(
        ["season", "week", "game_id", "first_play_id", "series_id"],
        kind="mergesort",
    ).reset_index(drop=True)
    non_series_events = pd.concat(
        [frame for frame in non_series_frames if not frame.empty], ignore_index=True
    ).sort_values(
        ["season", "week", "game_id", "first_play_id"], kind="mergesort"
    ).reset_index(drop=True)
    team_games, targets, target_audits = _build_team_games_and_targets(
        schedule,
        regulation_series,
        overtime_series,
        overtime_game_ids,
        config["target"]["integrityBounds"],
    )
    games = build_module_two_origin_games(
        schedule, team_games, config, use_time_decay=True
    )
    games_no_time_decay = build_module_two_origin_games(
        schedule, team_games, config, use_time_decay=False
    )
    if not games[["game_id", "forecast_at"]].equals(
        games_no_time_decay[["game_id", "forecast_at"]]
    ):
        raise RuntimeError("time-decay ablation changed the origin manifest")
    missingness = _missingness_report(games, games_no_time_decay)
    if missingness["missing_count"].gt(0).any():
        failures = missingness.loc[
            missingness["missing_count"].gt(0),
            ["frame", "column", "missing_count", "missing_fraction"],
        ].head(12).to_dict("records")
        raise RuntimeError(
            f"forecastable origin model inputs violate the frozen finite-input invariant: {failures}"
        )
    origin_game_ids = set(games["game_id"].astype(str))
    omitted_origins = schedule.loc[
        ~schedule["game_id"].astype(str).isin(origin_game_ids),
        ["game_id", "season", "week"],
    ].copy()
    prehistory_season = min(map(int, config["forecastContract"]["warmupSeasons"]))
    if not omitted_origins["season"].eq(prehistory_season).all():
        raise RuntimeError("a forecastable Module 2 origin was omitted")
    scored_seasons = {
        *map(int, config["forecastContract"]["developmentSeasons"]),
        int(config["forecastContract"]["retrospectiveConfirmationSeason"]),
    }
    expected_scored_ids = set(
        schedule.loc[schedule["season"].isin(scored_seasons), "game_id"].astype(str)
    )
    if not expected_scored_ids.issubset(origin_game_ids):
        raise RuntimeError("common 2013-2025 scored manifest is incomplete")

    index_hash_after = _sha256_file(cache.index_path)
    if index_hash_after != index_hash_before:
        raise RuntimeError("Module 1 source cache index changed during read-only build")
    config_hash = _stable_json_hash(config)
    source_hash = _stable_json_hash(
        {
            "index_sha256": index_hash_before,
            "sources": [
                {
                    "logical_name": source.logical_name,
                    "url": source.url,
                    "sha256": source.sha256,
                    "projected_sha256": source.projected_sha256,
                    "byte_count": source.byte_count,
                }
                for source in manifest
            ],
        }
    )
    data_hash = _stable_json_hash(
        {
            "games": hash_module_two_feature_frame(games),
            "games_no_time_decay": hash_module_two_feature_frame(
                games_no_time_decay
            ),
            "targets": hash_module_two_targets(targets),
            "team_games": _hash_dataframe(
                team_games, ("season", "week", "game_id", "team")
            ),
            "regulation_series": _hash_dataframe(
                regulation_series, ("season", "week", "game_id", "series_id")
            ),
            "overtime_series": _hash_dataframe(
                overtime_series, ("season", "week", "game_id", "series_id")
            ),
            "source_missingness_ledger": _stable_json_hash(source_missingness),
        }
    )
    paired_features = [
        f"{side}_{feature}"
        for side in ("home", "away")
        for feature in TEAM_PROFILE_FEATURE_AND_INDICATOR_NAMES
    ]
    feature_schema_hash = _stable_json_hash(
        {
            "team_profile_features": TEAM_PROFILE_FEATURES,
            "missing_indicators": MISSING_INDICATOR_FEATURES,
            "feature_indicator_pairs": FEATURE_INDICATOR_PAIRS,
            "game_features": GAME_FEATURES,
            "paired_features": paired_features,
            "target_columns": TARGET_COLUMNS,
            "targets_separate": True,
            "dtypes": {
                column: str(games[column].dtype)
                for column in paired_features + list(GAME_FEATURES)
            },
            "historical_availability": HISTORICAL_AVAILABILITY,
        }
    )
    audits: dict[str, Any] = {
        "source_cache_index_sha256": index_hash_before,
        "source_cache_read_only_verified": True,
        "prehistory_only_origin_season": prehistory_season,
        "omitted_unforecastable_origin_games": int(len(omitted_origins)),
        "omitted_unforecastable_origin_game_ids": omitted_origins[
            "game_id"
        ].astype(str).tolist(),
        "common_scored_manifest_games": int(len(expected_scored_ids)),
        "multi_offense_fixture_keys": sorted(regulation_multi_keys),
        "reconstruction": reconstruction_audits,
        "targets": target_audits,
        "regulation_series": int(len(regulation_series)),
        "overtime_series": int(len(overtime_series)),
        "non_series_events": int(len(non_series_events)),
        "kneel_only_regulation_series": int(regulation_series["kneel_only"].sum()),
        "repaired_regulation_series": int(regulation_series["repaired"].sum()),
        "series_duration_missing": int(
            regulation_series["series_duration_observations"].eq(0).sum()
        ),
        "invalid_neutral_clock_intervals": int(
            sum(
                audit["invalid_neutral_clock_intervals"]
                for audit in reconstruction_audits
                if audit["phase"] == "regulation"
            )
        ),
        "source_missingness": source_missingness,
        "source_missingness_ledger_sha256": _stable_json_hash(source_missingness),
        "source_missingness_all_passed": bool(
            source_missingness and all(row["passed"] for row in source_missingness)
        ),
    }
    code_hash = _sha256_file(Path(__file__).resolve())
    all_feature_names = TEAM_PROFILE_FEATURE_AND_INDICATOR_NAMES + GAME_FEATURES
    return ModuleTwoDataset(
        games=games,
        games_no_time_decay=games_no_time_decay,
        targets=targets,
        team_games=team_games,
        regulation_series=regulation_series,
        overtime_series=overtime_series,
        non_series_events=non_series_events,
        schedule=schedule,
        feature_names=all_feature_names,
        team_profile_feature_names=TEAM_PROFILE_FEATURES,
        game_feature_names=GAME_FEATURES,
        missing_indicator_names=MISSING_INDICATOR_FEATURES,
        feature_indicator_pairs=FEATURE_INDICATOR_PAIRS,
        target_columns=TARGET_COLUMNS,
        source_manifest=tuple(manifest),
        source_hash=source_hash,
        data_hash=data_hash,
        feature_schema_hash=feature_schema_hash,
        config_hash=config_hash,
        code_hash=code_hash,
        exclusions=dict(sorted(exclusions.items())),
        audits=audits,
        missingness=missingness,
    )


def _synthetic_row(**updates: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "game_id": "2020_01_AAA_BBB",
        "season": 2020,
        "season_type": "REG",
        "week": 1,
        "play_id": 1,
        "home_team": "BBB",
        "away_team": "AAA",
        "posteam": "AAA",
        "defteam": "BBB",
        "qtr": 1,
        "game_half": "Half1",
        "quarter_seconds_remaining": 900,
        "play_type": "run",
        "play_type_nfl": "RUSH",
        "play": 1,
        "drive": 1,
        "fixed_drive": 1,
        "fixed_drive_result": "Punt",
        "drive_play_id_started": 1,
        "drive_start_transition": "KICKOFF",
        "drive_end_transition": "PUNT",
        "drive_time_of_possession": "1:00",
        "game_seconds_remaining": 3600,
        "half_seconds_remaining": 1800,
        "score_differential": 0,
        "pass_attempt": 0,
        "rush_attempt": 1,
        "sack": 0,
        "qb_kneel": 0,
        "qb_spike": 0,
        "field_goal_attempt": 0,
        "punt_attempt": 0,
        "kickoff_attempt": 0,
        "extra_point_attempt": 0,
        "two_point_attempt": 0,
        "penalty": 0,
        "aborted_play": 0,
        "incomplete_pass": 0,
        "out_of_bounds": 0,
        "touchback": 0,
        "own_kickoff_recovery": 0,
        "own_kickoff_recovery_td": 0,
        "safety": 0,
        "fumble_lost": 0,
        "interception": 0,
        "return_touchdown": 0,
    }
    row.update(updates)
    return row


def _self_test_config() -> dict[str, Any]:
    return {
        "version": "module2.self-test",
        "forecastContract": {
            "sameWeekEarlierGamesAllowed": False,
            "warmupSeasons": [2010, 2011, 2012],
            "developmentSeasons": list(range(2013, 2025)),
            "retrospectiveConfirmationSeason": 2025,
        },
        "target": {
            "qualifyingPlayTypes": [
                "pass",
                "run",
                "qb_kneel",
                "qb_spike",
                "punt",
                "field_goal",
            ],
            "regulationQuarters": [1, 2, 3, 4],
            "overtimeMinimumQuarter": 5,
            "driveRepair": {"knownMultiOffenseFixtureKeys": []},
            "integrityBounds": {
                "hardMinimumObservedPerTeam": 0,
                "hardMaximumObservedPerTeam": 63,
                "historicalAuditExpectedMinimum": 4,
                "historicalAuditExpectedMaximum": 22,
            },
            "syntheticFixtureAssertions": {
                "kickoff_touchback_only": {
                    "regulationSeries": 0,
                    "overtimeSeries": 0,
                },
                "punt_only": {"regulationSeries": 1, "offense": "AAA"},
                "blocked_field_goal_only": {
                    "regulationSeries": 1,
                    "offense": "AAA",
                },
                "live_offensive_turnover": {
                    "regulationSeries": 1,
                    "offense": "AAA",
                },
                "defensive_or_return_score_only": {"regulationSeries": 0},
                "live_safety": {"regulationSeries": 1, "offense": "AAA"},
                "onside_kick_only": {"regulationSeries": 0},
                "onside_then_live_play": {
                    "regulationSeries": 1,
                    "offense": "BBB",
                },
                "kneel_only_end_half": {
                    "regulationSeries": 1,
                    "kneelOnly": True,
                },
                "penalty_or_no_play_only": {"regulationSeries": 0},
                "accepted_penalty_on_live_play": {"regulationSeries": 1},
                "aborted_live_play": {"regulationSeries": 1},
                "aborted_nullified_play": {"regulationSeries": 0},
                "live_play_ending_at_halftime": {"regulationSeries": 1},
                "live_play_ending_at_regulation": {"regulationSeries": 1},
                "overtime_live_play": {
                    "regulationSeries": 0,
                    "overtimeSeries": 1,
                },
                "multi_offense_fixed_drive": {
                    "regulationSeries": 2,
                    "offenses": ["AAA", "BBB"],
                },
            },
        },
        "dataBoundary": {
            "scheduleAllowlist": [],
            "pbpAllowlist": [],
            "forbiddenFieldPatterns": ["spread", "moneyline", "odds", "final_score"],
            "ephemeralFilterOnlyFields": ["score_differential"],
            "teamAliases": {},
        },
        "features": {
            "teamHistoryWindowGames": 17,
            "leagueSeasonPriorGames": 64,
            "possessionPriorGames": 4,
            "pacePriorOpportunities": 250,
            "drivePriorSeries": 32,
            "timeDecayHalfLifeSeasons": 2.5,
            "observationWeightMultipliersBySeason": {"2020": 0.5},
            "situationNeutralFilter": {
                "quarters": [1, 2, 3],
                "minimumHalfSecondsRemaining": 121,
                "maximumAbsolutePregameIndependentScoreDifferential": 8,
            },
            "groups": {
                "possession_rate": list(TEAM_PROFILE_FEATURES[:2]),
                "situation_neutral_pace": list(TEAM_PROFILE_FEATURES[2:4]),
                "play_volume": list(TEAM_PROFILE_FEATURES[4:6]),
                "drive_duration": list(TEAM_PROFILE_FEATURES[6:8]),
                "clock_stop": list(TEAM_PROFILE_FEATURES[8:10]),
                "home_context": ["is_neutral_site"],
            },
        },
        "distribution": {"predictionMeanBounds": [4.0, 20.0]},
    }


def _series_projection(frame: pd.DataFrame) -> pd.DataFrame:
    columns = [
        "game_id",
        "phase",
        "offense",
        "qualifying_events",
        "scrimmage_plays",
        "neutral_elapsed_seconds",
        "neutral_pace_opportunities",
        "clock_stops",
        "clock_stop_opportunities",
        "kneel_only",
    ]
    return frame[columns].sort_values(
        ["game_id", "phase", "offense"], kind="mergesort"
    ).reset_index(drop=True)


def _run_synthetic_series_tests(config: Mapping[str, Any]) -> dict[str, str]:
    rows = [
        _synthetic_row(
            game_id="kickoff_touchback_only",
            play_type="kickoff",
            play_type_nfl="KICK_OFF",
            kickoff_attempt=1,
            touchback=1,
            rush_attempt=0,
        ),
        _synthetic_row(
            game_id="punt_only",
            play_type="punt",
            play_type_nfl="PUNT",
            punt_attempt=1,
            rush_attempt=0,
        ),
        _synthetic_row(
            game_id="blocked_field_goal_only",
            play_type="field_goal",
            play_type_nfl="FIELD_GOAL",
            field_goal_attempt=1,
            rush_attempt=0,
            fixed_drive_result="Blocked FG",
        ),
        _synthetic_row(
            game_id="live_offensive_turnover",
            play_type="pass",
            play_type_nfl="PASS",
            pass_attempt=1,
            rush_attempt=0,
            interception=1,
        ),
        _synthetic_row(
            game_id="defensive_or_return_score_only",
            play_type="kickoff",
            play_type_nfl="KICK_OFF",
            kickoff_attempt=1,
            return_touchdown=1,
            rush_attempt=0,
        ),
        _synthetic_row(game_id="live_safety", safety=1),
        _synthetic_row(
            game_id="onside_kick_only",
            play_type="kickoff",
            play_type_nfl="KICK_OFF",
            kickoff_attempt=1,
            own_kickoff_recovery=1,
            rush_attempt=0,
        ),
        _synthetic_row(
            game_id="onside_then_live_play",
            play_id=1,
            fixed_drive=1,
            drive=1,
            play_type="kickoff",
            play_type_nfl="KICK_OFF",
            kickoff_attempt=1,
            own_kickoff_recovery=1,
            rush_attempt=0,
        ),
        _synthetic_row(
            game_id="onside_then_live_play",
            play_id=2,
            fixed_drive=2,
            drive=2,
            posteam="BBB",
            defteam="AAA",
        ),
        _synthetic_row(
            game_id="kneel_only_end_half",
            qtr=2,
            game_half="Half1",
            game_seconds_remaining=1800,
            half_seconds_remaining=0,
            play_type="qb_kneel",
            play_type_nfl="RUSH",
            qb_kneel=1,
        ),
        _synthetic_row(
            game_id="penalty_or_no_play_only",
            play_type="no_play",
            play_type_nfl="PENALTY",
            play=0,
            penalty=1,
            rush_attempt=0,
        ),
        _synthetic_row(
            game_id="accepted_penalty_on_live_play",
            play_type="pass",
            play_type_nfl="PASS",
            pass_attempt=1,
            rush_attempt=0,
            penalty=1,
            incomplete_pass=1,
        ),
        _synthetic_row(
            game_id="aborted_live_play",
            play_type="unspecified",
            play_type_nfl="UNSPECIFIED",
            rush_attempt=0,
            aborted_play=1,
        ),
        _synthetic_row(
            game_id="aborted_nullified_play",
            play_type="no_play",
            play_type_nfl="PENALTY",
            play=0,
            rush_attempt=0,
            aborted_play=1,
        ),
        _synthetic_row(
            game_id="live_play_ending_at_halftime",
            qtr=2,
            game_half="Half1",
            game_seconds_remaining=1800,
            half_seconds_remaining=0,
            drive_end_transition="END_HALF",
        ),
        _synthetic_row(
            game_id="live_play_ending_at_regulation",
            qtr=4,
            game_half="Half2",
            game_seconds_remaining=0,
            half_seconds_remaining=0,
            drive_end_transition="END_GAME",
        ),
        _synthetic_row(
            game_id="overtime_live_play",
            qtr=5,
            game_half="Overtime",
            game_seconds_remaining=600,
            half_seconds_remaining=600,
        ),
        _synthetic_row(
            game_id="multi_offense_fixed_drive",
            play_id=1,
            fixed_drive=9,
            drive=9,
            posteam="AAA",
            defteam="BBB",
            drive_time_of_possession="2:00",
        ),
        _synthetic_row(
            game_id="multi_offense_fixed_drive",
            play_id=2,
            fixed_drive=9,
            drive=10,
            posteam="BBB",
            defteam="AAA",
            drive_time_of_possession="2:00",
        ),
    ]
    annotated = _annotate_pbp(pd.DataFrame(rows), config)
    regulation, control, _ = _reconstruct_phase(annotated, "regulation", config)
    overtime, _, _ = _reconstruct_phase(annotated, "overtime", config)
    assertions = config["target"]["syntheticFixtureAssertions"]
    expected_names = set(assertions)
    observed_names = set(pd.DataFrame(rows)["game_id"].astype(str))
    assert observed_names == expected_names
    for fixture, expectation in assertions.items():
        regulation_rows = regulation.loc[regulation["game_id"].eq(fixture)]
        overtime_rows = overtime.loc[overtime["game_id"].eq(fixture)]
        observed: dict[str, Any] = {
            "regulationSeries": int(len(regulation_rows)),
            "overtimeSeries": int(len(overtime_rows)),
        }
        if len(regulation_rows) == 1:
            observed["offense"] = str(regulation_rows.iloc[0]["offense"])
            observed["kneelOnly"] = bool(regulation_rows.iloc[0]["kneel_only"])
        if len(regulation_rows) > 0:
            observed["offenses"] = sorted(regulation_rows["offense"].astype(str))
        for key, expected in expectation.items():
            assert observed.get(key) == expected, (
                fixture,
                key,
                expected,
                observed.get(key),
            )
    repaired_rows = regulation.loc[
        regulation["game_id"].eq("multi_offense_fixed_drive")
    ]
    assert repaired_rows["repaired"].all()
    assert repaired_rows["series_duration_observations"].eq(0).all()
    assert repaired_rows["series_duration_seconds"].isna().all()
    assert set(control["reason"]) >= {
        "kickoff_only",
        "penalty_or_no_play_only",
    }

    metric_rows = pd.DataFrame(
        [
            _synthetic_row(
                game_id="raw_metric_contract",
                play_id=1,
                play_type="pass",
                play_type_nfl="PASS",
                pass_attempt=1,
                rush_attempt=0,
                incomplete_pass=1,
                game_seconds_remaining=3600,
                drive_time_of_possession="1:00",
            ),
            _synthetic_row(
                game_id="raw_metric_contract",
                play_id=2,
                play_type="run",
                play_type_nfl="RUSH",
                game_seconds_remaining=3570,
                drive_time_of_possession="1:00",
            ),
            _synthetic_row(
                game_id="raw_metric_contract",
                play_id=3,
                play_type="punt",
                play_type_nfl="PUNT",
                punt_attempt=1,
                rush_attempt=0,
                game_seconds_remaining=3550,
                drive_time_of_possession="1:00",
            ),
        ]
    )
    metric_series, _, _ = _reconstruct_phase(
        _annotate_pbp(metric_rows, config), "regulation", config
    )
    metric = metric_series.iloc[0]
    assert metric["qualifying_events"] == 3
    assert metric["scrimmage_plays"] == 2
    assert metric["neutral_elapsed_seconds"] == 30.0
    assert metric["neutral_pace_opportunities"] == 1
    assert metric["clock_stops"] == 1
    assert metric["clock_stop_opportunities"] == 2
    assert metric["series_duration_seconds"] == 60.0
    assert metric["series_duration_observations"] == 1

    negative_duration = pd.DataFrame(
        [_synthetic_row(game_id="negative_duration", drive_time_of_possession="-1")]
    )
    negative_series, _, _ = _reconstruct_phase(
        _annotate_pbp(negative_duration, config), "regulation", config
    )
    assert negative_series.iloc[0]["series_duration_observations"] == 0
    assert pd.isna(negative_series.iloc[0]["series_duration_seconds"])

    # Derived drive labels/results are audit-only and cannot alter targets/features.
    mutated = annotated.copy()
    mutated["fixed_drive_result"] = "MUTATED"
    mutated["drive_start_transition"] = "MUTATED"
    mutated["drive_end_transition"] = "MUTATED"
    mutated_regulation, _, _ = _reconstruct_phase(mutated, "regulation", config)
    assert _hash_dataframe(_series_projection(regulation)) == _hash_dataframe(
        _series_projection(mutated_regulation)
    )

    # Bijection of fixed-drive identifiers cannot change the series projection.
    renumbered = annotated.copy()
    renumbered["fixed_drive"] = renumbered["fixed_drive"] + 1000
    renumbered_regulation, _, _ = _reconstruct_phase(
        renumbered, "regulation", config
    )
    assert _hash_dataframe(_series_projection(regulation)) == _hash_dataframe(
        _series_projection(renumbered_regulation)
    )

    # OT mutation cannot alter regulation reconstruction.
    ot_mutated = annotated.copy()
    ot_mutated.loc[ot_mutated["qtr"].ge(5), "posteam"] = "ZZZ"
    regulation_after_ot_mutation, _, _ = _reconstruct_phase(
        ot_mutated, "regulation", config
    )
    assert _hash_dataframe(_series_projection(regulation)) == _hash_dataframe(
        _series_projection(regulation_after_ot_mutation)
    )
    return {
        "frozen_named_fixture_assertions": "pass",
        "raw_feature_numerator_denominator_contract": "pass",
        "nonnegative_unique_duration_contract": "pass",
        "repaired_duration_withheld": "pass",
        "audit_field_mutation_invariance": "pass",
        "fixed_drive_bijection_invariance": "pass",
        "overtime_mutation_invariance": "pass",
    }


def _run_origin_isolation_tests(config: Mapping[str, Any]) -> dict[str, str]:
    base = {
        "game_id": "old",
        "season": 2020,
        "week": 1,
        "game_date": pd.Timestamp("2020-09-13"),
        "team": "AAA",
        "opponent": "BBB",
    }
    history = pd.DataFrame(
        [
            {**base, "regulation_offensive_series": 10.0},
            {
                **base,
                "game_id": "same_week_earlier",
                "week": 2,
                "game_date": pd.Timestamp("2020-09-17"),
                "regulation_offensive_series": 999.0,
            },
            {
                **base,
                "game_id": "future",
                "week": 3,
                "game_date": pd.Timestamp("2020-09-24"),
                "regulation_offensive_series": -999.0,
            },
            {
                **base,
                "game_id": "tuesday_prior_week",
                "week": 1,
                "game_date": pd.Timestamp("2020-09-15"),
                "regulation_offensive_series": 500.0,
            },
        ]
    )
    forecast_at = "2020-09-15T07:30:00-07:00"
    isolated = history_before_module_two_origin(history, 2020, 2, forecast_at)
    assert isolated["game_id"].tolist() == ["old"]
    rejected = False
    try:
        assert_module_two_history_cutoff(history, 2020, 2, forecast_at)
    except RuntimeError:
        rejected = True
    assert rejected
    return {
        "same_week_isolation": "pass",
        "future_week_rejection": "pass",
        "tuesday_date_conservative_cutoff": "pass",
    }


def _synthetic_team_game(
    *,
    game_id: str,
    season: int,
    week: int,
    game_date: str,
    team: str,
    opponent: str,
    is_home: float,
    own_series: float,
    opponent_series: float,
) -> dict[str, Any]:
    """Complete raw numerator/denominator row for origin-contract tests."""

    return {
        "game_id": game_id,
        "season": season,
        "week": week,
        "game_date": pd.Timestamp(game_date),
        "team": team,
        "opponent": opponent,
        "is_home": is_home,
        "is_neutral_site": 0.0,
        "games": 1.0,
        "regulation_offensive_series": own_series,
        "opponent_regulation_series_faced": opponent_series,
        "neutral_elapsed_seconds": 20.0 * own_series,
        "neutral_pace_opportunities": own_series,
        "opponent_neutral_elapsed_seconds_allowed": 20.0 * opponent_series,
        "opponent_neutral_pace_opportunities_allowed": opponent_series,
        "scrimmage_plays": 5.0 * own_series,
        "regulation_series_for_play_rate": own_series,
        "opponent_scrimmage_plays_allowed": 5.0 * opponent_series,
        "opponent_regulation_series_for_play_rate_allowed": opponent_series,
        "series_duration_seconds": 120.0 * own_series,
        "series_duration_observations": own_series,
        "opponent_series_duration_seconds_allowed": 120.0 * opponent_series,
        "opponent_series_duration_observations_allowed": opponent_series,
        "clock_stops": own_series,
        "clock_stop_opportunities": 5.0 * own_series,
        "opponent_clock_stops_allowed": opponent_series,
        "opponent_clock_stop_opportunities_allowed": 5.0 * opponent_series,
        "kneel_only_series": 0.0,
        "overtime_offensive_series": 0.0,
    }


def _run_profile_contract_tests(config: Mapping[str, Any]) -> dict[str, str]:
    history = pd.DataFrame(
        [
            _synthetic_team_game(
                game_id="2010_01_BBB_AAA",
                season=2010,
                week=1,
                game_date="2010-09-12",
                team="AAA",
                opponent="BBB",
                is_home=1.0,
                own_series=12.0,
                opponent_series=10.0,
            ),
            _synthetic_team_game(
                game_id="2010_01_BBB_AAA",
                season=2010,
                week=1,
                game_date="2010-09-12",
                team="BBB",
                opponent="AAA",
                is_home=0.0,
                own_series=10.0,
                opponent_series=12.0,
            ),
            _synthetic_team_game(
                game_id="2011_01_BBB_AAA",
                season=2011,
                week=1,
                game_date="2011-09-11",
                team="AAA",
                opponent="BBB",
                is_home=1.0,
                own_series=20.0,
                opponent_series=6.0,
            ),
            _synthetic_team_game(
                game_id="2011_01_BBB_AAA",
                season=2011,
                week=1,
                game_date="2011-09-11",
                team="BBB",
                opponent="AAA",
                is_home=0.0,
                own_series=6.0,
                opponent_series=20.0,
            ),
        ]
    )
    schedule = pd.DataFrame(
        [
            {
                "game_id": "2010_01_BBB_AAA",
                "season": 2010,
                "week": 1,
                "gameday": pd.Timestamp("2010-09-12"),
                "home_team": "AAA",
                "away_team": "BBB",
                "is_neutral_site": False,
            },
            {
                "game_id": "2011_02_BBB_AAA",
                "season": 2011,
                "week": 2,
                "gameday": pd.Timestamp("2011-09-18"),
                "home_team": "AAA",
                "away_team": "BBB",
                "is_neutral_site": False,
            }
        ]
    )
    games = build_module_two_origin_games(schedule, history, config)
    assert len(games) == 1
    row = games.iloc[0]
    assert row["game_id"] == "2011_02_BBB_AAA"
    expected_p0_home = (64.0 * 12.0 + 20.0) / 65.0
    expected_p0_away = (64.0 * 10.0 + 6.0) / 65.0
    assert np.isclose(row["p0_home_mean"], expected_p0_home)
    assert np.isclose(row["p0_away_mean"], expected_p0_away)

    older_weight = 0.5 ** (1.0 / float(config["features"]["timeDecayHalfLifeSeasons"]))
    league_rate = ((12.0 + 10.0) * older_weight + 20.0 + 6.0) / (
        2.0 * older_weight + 2.0
    )
    aaa_rate = (12.0 * older_weight + 20.0 + 4.0 * league_rate) / (
        older_weight + 1.0 + 4.0
    )
    bbb_rate = (10.0 * older_weight + 6.0 + 4.0 * league_rate) / (
        older_weight + 1.0 + 4.0
    )
    home_context = 0.5 * (
        (12.0 * older_weight + 20.0) / (older_weight + 1.0)
        - (10.0 * older_weight + 6.0) / (older_weight + 1.0)
    )
    assert np.isclose(
        _p1_home_adjustment(history, 2011, config, True), home_context
    )
    assert np.isclose(row["p1_home_mean"], aaa_rate + home_context)
    assert np.isclose(row["p1_away_mean"], bbb_rate - home_context)

    missing_rows = history.loc[history["team"].eq("AAA")].copy()
    missing_rows["neutral_pace_opportunities"] = 0.0
    missing_rows["neutral_elapsed_seconds"] = 0.0
    folded, missing = _profile_rate(
        missing_rows,
        "neutral_elapsed_seconds",
        "neutral_pace_opportunities",
        19.5,
        250.0,
        2011,
        config,
        True,
    )
    assert folded == 19.5 and missing == 1.0

    ordered = pd.DataFrame(
        {
            "game_id": [f"g{number:02d}" for number in range(20)],
            "season": [2010] * 20,
            "week": list(range(1, 21)),
            "game_date": pd.date_range("2010-01-01", periods=20),
            "team": ["AAA"] * 20,
        }
    )
    latest = _latest_team_games(ordered, "AAA", 17)
    assert latest["game_id"].tolist() == [f"g{number:02d}" for number in range(3, 20)]

    era_rows = pd.DataFrame({"season": [2020, 2021]})
    decayed = _time_weights(era_rows, 2021, config, True)
    no_decay = _time_weights(era_rows, 2021, config, False)
    assert np.isclose(decayed[0], 0.5 * 0.5 ** (1.0 / 2.5))
    assert np.allclose(no_decay, [0.5, 1.0])
    assert tuple(FEATURE_INDICATOR_PAIRS) == tuple(
        (feature, f"{feature}_missing") for feature in TEAM_PROFILE_FEATURES
    )
    return {
        "p0_older_prior_and_64_game_update": "pass",
        "p1_latest_history_shrinkage_and_signed_home_context": "pass",
        "latest_17_selected_before_weighting": "pass",
        "missing_indicator_follows_rate": "pass",
        "time_decay_and_2020_multiplier": "pass",
        "feature_indicator_pairing": "pass",
        "2010_prehistory_origin_omitted": "pass",
    }


def _run_target_bound_tests(config: Mapping[str, Any]) -> dict[str, str]:
    bounds = config["target"]["integrityBounds"]
    primary = pd.DataFrame(
        {
            "home_regulation_offensive_series": [0, 4],
            "away_regulation_offensive_series": [23, 63],
        }
    )
    audit = _audit_primary_target_integrity(
        primary, pd.Series(["g1", "g2"]), bounds
    )
    assert audit["outside_historical_audit_range_warning"] is True
    assert audit["outside_historical_audit_range_count"] == 3
    assert audit["outside_historical_audit_range_game_ids"] == ["g1", "g2"]

    for invalid in (
        pd.DataFrame(
            {
                "home_regulation_offensive_series": [-1],
                "away_regulation_offensive_series": [10],
            }
        ),
        pd.DataFrame(
            {
                "home_regulation_offensive_series": [64],
                "away_regulation_offensive_series": [10],
            }
        ),
        pd.DataFrame(
            {
                "home_regulation_offensive_series": [10.5],
                "away_regulation_offensive_series": [10],
            }
        ),
    ):
        rejected = False
        try:
            _audit_primary_target_integrity(invalid, pd.Series(["bad"]), bounds)
        except RuntimeError:
            rejected = True
        assert rejected
    return {
        "hard_target_range_enforced": "pass",
        "historical_target_range_warning_only": "pass",
    }


def _run_positive_projection_tests() -> dict[str, str]:
    allowlist = ("game_id", "season", "week")
    forbidden = ("spread", "moneyline", "odds", "home_score")
    with tempfile.TemporaryDirectory() as directory:
        directory_path = Path(directory)
        left_path = directory_path / "left.csv"
        right_path = directory_path / "right.csv"
        base = {"game_id": "g", "season": 2020, "week": 1}
        pd.DataFrame(
            [{**base, "spread_line": -3.5, "home_score": 20, "selection": "A"}]
        ).to_csv(left_path, index=False)
        pd.DataFrame(
            [{**base, "spread_line": 99, "home_score": 999, "selection": "B"}]
        ).to_csv(right_path, index=False)
        left = _read_positive_csv(left_path, allowlist, forbidden, "left")
        right = _read_positive_csv(right_path, allowlist, forbidden, "right")
        assert _hash_dataframe(left) == _hash_dataframe(right)

        # A truncated content-addressed object must fail byte/hash verification.
        cache_path = directory_path / "cache"
        objects = cache_path / "objects"
        objects.mkdir(parents=True)
        payload = b"abc"
        digest = hashlib.sha256(payload).hexdigest()
        object_path = objects / f"{digest}.csv"
        object_path.write_bytes(payload[:2])
        index = {
            "version": 1,
            "sources": {
                "schedules": {
                    "url": SCHEDULE_URL,
                    "sha256": digest,
                    "object": object_path.name,
                    "byte_count": len(payload),
                    "downloaded_at": "test",
                }
            },
        }
        (cache_path / "source-index.json").write_text(
            json.dumps(index), encoding="utf-8"
        )
        rejected = False
        try:
            _ReadOnlyContentAddressedCache(cache_path).get("schedules", SCHEDULE_URL)
        except RuntimeError:
            rejected = True
        assert rejected
    return {
        "market_score_pick_column_invariance": "pass",
        "truncated_source_rejection": "pass",
    }


def _run_live_source_integrity_tests(
    config: Mapping[str, Any], cache_dir: Path
) -> dict[str, Any]:
    seasons, _ = _validate_config(config)
    boundary = config["dataBoundary"]
    cache = _ReadOnlyContentAddressedCache(cache_dir)
    before = cache.index_sha256
    schedule = cache.get("schedules", SCHEDULE_URL)
    _read_positive_csv(
        schedule.path,
        tuple(boundary["scheduleAllowlist"]),
        tuple(boundary["forbiddenFieldPatterns"]),
        "schedules_integrity",
    ).head(0)
    checked = 1
    for season in seasons:
        source = cache.get(f"pbp_{season}", PBP_URL.format(season=season))
        header = pd.read_csv(source.path, compression="gzip", nrows=0)
        missing = set(boundary["pbpAllowlist"]) - set(header.columns)
        if missing:
            raise RuntimeError(f"pbp_{season} integrity header missing: {sorted(missing)}")
        checked += 1
    after = _sha256_file(cache.index_path)
    assert before == after
    return {
        "source_objects_verified": checked,
        "source_index_unchanged": True,
        "source_index_sha256": before,
    }


def run_data_self_tests(
    config: Mapping[str, Any] | None = None,
    cache_dir: Path | None = None,
) -> dict[str, Any]:
    """Run deterministic synthetic, isolation, projection, and source tests."""

    synthetic_config = _self_test_config()
    contract_config = config if config is not None else synthetic_config
    tests: dict[str, Any] = {}
    tests.update(_run_synthetic_series_tests(contract_config))
    tests.update(_run_origin_isolation_tests(synthetic_config))
    tests.update(_run_profile_contract_tests(contract_config))
    tests.update(_run_target_bound_tests(contract_config))
    tests.update(_run_positive_projection_tests())
    fixture = pd.DataFrame(
        {
            "game_id": [f"missingness-{index}" for index in range(100)],
            "play_id": np.arange(100),
            "required_value": np.ones(100, dtype=float),
        }
    )
    fixture.loc[0, "required_value"] = np.nan
    boundary = _missingness_row(
        fixture,
        "required_value",
        "synthetic_source",
        2025,
        "synthetic_missingness_boundary",
        0.01,
    )
    if not boundary["passed"] or boundary["missing_fraction"] != 0.01:
        raise AssertionError("Module 2 source missingness boundary must be inclusive")
    fixture.loc[1, "required_value"] = np.nan
    over = _missingness_row(
        fixture,
        "required_value",
        "synthetic_source",
        2025,
        "synthetic_missingness_overage",
        0.01,
    )
    try:
        _assert_source_missingness([over])
    except RuntimeError:
        pass
    else:
        raise AssertionError("Module 2 source missingness overage did not abort")
    tests["source_missingness_one_percent_boundary"] = "pass"
    tests["source_missingness_overage_rejection"] = "pass"
    if config is not None or cache_dir is not None:
        if config is None or cache_dir is None:
            raise ValueError("config and cache_dir must be supplied together")
        tests["live_source_integrity"] = _run_live_source_integrity_tests(
            config, Path(cache_dir)
        )
    return {"passed": True, "tests": tests}


if __name__ == "__main__":
    script_root = Path(__file__).resolve().parents[1]
    config_path = script_root / "config" / "model-lab-module-two.config.json"
    with config_path.open("r", encoding="utf-8") as source:
        current_config = json.load(source)
    cache_path = script_root / current_config["dataBoundary"]["sourceCache"]
    print(
        json.dumps(
            run_data_self_tests(current_config, cache_path),
            sort_keys=True,
        )
    )
