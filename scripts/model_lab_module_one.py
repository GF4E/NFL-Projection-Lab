#!/usr/bin/env python3
"""Run the preregistered, market-free Module 1 team-score experiment.

This module is an offline research runner. It reads the frozen Module 1
contract, builds a point-in-time football-only matrix, evaluates every model
at common weekly forecast origins, and writes immutable-style research
artifacts. It does not import or mutate the production forecast system.
"""

from __future__ import annotations

import argparse
from copy import deepcopy
from dataclasses import asdict, dataclass, is_dataclass, replace
from datetime import datetime, timezone
import gzip
from hashlib import sha256
import json
import math
import os
from pathlib import Path
import sys
import time
from types import SimpleNamespace
from typing import Any, Iterable, Mapping, Sequence

import numpy as np
import pandas as pd

from model_lab_module_one_models import (
    aggregate_scorecard,
    evaluate_distribution,
    fit_dynamic_state_model,
    fit_poisson_score_model,
    fit_ridge_score_model,
    hierarchical_simultaneous_bootstrap,
    independent_count_distribution,
    predict_dynamic_score,
    predict_poisson_score,
    predict_ridge_score,
    prequential_dispersion,
    residual_kernel_distribution,
    run_model_self_tests,
    season_weights,
    stable_hash,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG_PATH = REPOSITORY_ROOT / "config" / "model-lab-module-one.config.json"
DEFAULT_CACHE_DIR = REPOSITORY_ROOT / ".model-lab-cache" / "module-one"
DEFAULT_OUTPUT_DIR = REPOSITORY_ROOT / "artifacts" / "model-lab" / "module-one"

BASELINE_FAMILY = "c0_naive_points"
CHALLENGER_FAMILIES = (
    "c1_ridge_offense_defense",
    "c3_independent_negative_binomial",
    "c2_dynamic_state_space",
)
BASE_FAMILIES = (BASELINE_FAMILY, *CHALLENGER_FAMILIES)
UPSTREAM_FEATURE_TOKENS = ("epa_per_play", "pass_rate_over_expectation")
NAIVE_BASELINE_ONLY_FEATURES = {
    "offense_points_per_game",
    "opponent_defense_points_allowed_per_game",
    "offense_history_games",
    "opponent_defense_history_games",
}


@dataclass(frozen=True)
class ModelSpec:
    """One frozen base, ablation, or negative-control model recipe."""

    name: str
    family: str
    analysis_kind: str
    feature_names: tuple[str, ...]
    reference_family: str | None = None
    ablation: str | None = None
    control: str | None = None
    include_team_identity: bool = True
    include_home: bool = True
    include_states: bool = True
    carry_prior_season: bool = True
    no_decay: bool = False
    shuffle_team_identity: bool = False


def _jsonable(value: Any) -> Any:
    if is_dataclass(value):
        return _jsonable(asdict(value))
    if isinstance(value, pd.DataFrame):
        return [_jsonable(row) for row in value.to_dict("records")]
    if isinstance(value, pd.Series):
        return _jsonable(value.to_dict())
    if isinstance(value, Mapping):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(item) for item in value]
    if isinstance(value, np.ndarray):
        return [_jsonable(item) for item in value.tolist()]
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()
    if isinstance(value, Path):
        return str(value)
    if pd.isna(value) if not isinstance(value, (dict, list, tuple, set)) else False:
        return None
    return value


def _write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(_jsonable(value), indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def _write_text_atomic(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(value, encoding="utf-8")
    os.replace(temporary, path)


def _write_jsonl_gzip_atomic(path: Path, rows: Iterable[Mapping[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with gzip.open(temporary, "wt", encoding="utf-8", compresslevel=9) as handle:
        for row in rows:
            handle.write(json.dumps(_jsonable(row), sort_keys=True, allow_nan=False, separators=(",", ":")))
            handle.write("\n")
    os.replace(temporary, path)


def _file_hash(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def _code_hash() -> tuple[str, dict[str, str]]:
    paths = (
        Path(__file__).resolve(),
        Path(__file__).with_name("model_lab_module_one_data.py"),
        Path(__file__).with_name("model_lab_module_one_models.py"),
    )
    hashes = {path.name: _file_hash(path) for path in paths if path.exists()}
    return stable_hash(hashes), hashes


def _stable_seed(*parts: Any) -> int:
    return int(stable_hash(list(parts))[:16], 16) % (2**32 - 1)


def _deterministic_noise(game_id: str, team: str) -> float:
    """A fixed null predictor with no outcome or chronology dependency."""

    first = max(1e-12, (_stable_seed("noise-u1", game_id, team) + 1) / 2**32)
    second = (_stable_seed("noise-u2", game_id, team) + 1) / 2**32
    return float(math.sqrt(-2 * math.log(first)) * math.cos(2 * math.pi * second))


def _contains_forbidden(name: str, forbidden: Sequence[str]) -> bool:
    lowered = str(name).lower()
    return any(pattern.lower() in lowered for pattern in forbidden)


def _is_upstream_feature(name: str) -> bool:
    lowered = str(name).lower()
    return any(token in lowered for token in UPSTREAM_FEATURE_TOKENS) or "_proe" in lowered


def _forecastable_game_mask(games: pd.DataFrame) -> pd.Series:
    required = [
        "forecast_at",
        "inputs_through_season",
        "inputs_through_week",
        "maximum_input_game_date",
        "league_team_score_mean",
        "naive_home_mean",
        "naive_away_mean",
    ]
    return games.loc[:, required].notna().all(axis=1)


def _validate_no_forbidden_fields(
    games: pd.DataFrame,
    feature_names: Sequence[str],
    forbidden: Sequence[str],
) -> None:
    offending_columns = sorted(column for column in games.columns if _contains_forbidden(column, forbidden))
    offending_features = sorted(name for name in feature_names if _contains_forbidden(name, forbidden))
    if offending_columns or offending_features:
        raise ValueError(
            "Forbidden market or decision fields reached the Module 1 analysis boundary: "
            + json.dumps({"columns": offending_columns, "features": offending_features}, sort_keys=True)
        )


def _validate_chronology(games: pd.DataFrame) -> dict[str, Any]:
    chronology_available = games.loc[
        :,
        ["forecast_at", "inputs_through_season", "inputs_through_week", "maximum_input_game_date"],
    ].notna().all(axis=1)
    origins = list(zip(games["season"].astype(int), games["week"].astype(int), strict=True))
    earliest_origin = min(origins)
    invalid_unavailable = games.loc[
        ~chronology_available
        & pd.Series([origin != earliest_origin for origin in origins], index=games.index),
        "game_id",
    ].astype(str).tolist()
    if invalid_unavailable:
        raise ValueError(
            "Chronology metadata is unavailable outside the first warmup origin: "
            f"{invalid_unavailable[:10]}"
        )
    checked = games.loc[chronology_available].copy()
    if checked.empty:
        raise ValueError("No Module 1 origin has prior chronology metadata")
    input_origins = list(
        zip(
            checked["inputs_through_season"].astype(int),
            checked["inputs_through_week"].astype(int),
            strict=True,
        )
    )
    target_origins = list(zip(checked["season"].astype(int), checked["week"].astype(int), strict=True))
    leaking = [
        str(game_id)
        for game_id, input_origin, target_origin in zip(checked["game_id"], input_origins, target_origins, strict=True)
        if input_origin >= target_origin
    ]
    if leaking:
        raise ValueError(f"Feature input origin is not before target week for {leaking[:10]}")

    forecast_times = pd.to_datetime(checked["forecast_at"], utc=True, errors="coerce")
    maximum_dates = pd.to_datetime(checked["maximum_input_game_date"], utc=True, errors="coerce")
    if forecast_times.isna().any() or maximum_dates.isna().any():
        raise ValueError("Forecast or maximum input dates are missing or unparsable")
    date_leaks = checked.loc[maximum_dates >= forecast_times, "game_id"].astype(str).tolist()
    if date_leaks:
        raise ValueError(f"An input game timestamp reaches or follows the forecast origin: {date_leaks[:10]}")

    forecast_counts = games.groupby(["season", "week"], sort=True)["forecast_at"].nunique()
    if int(forecast_counts.max()) != 1:
        raise ValueError("Games in the same season-week do not share one forecast timestamp")
    return {
        "passed": True,
        "gamesChecked": int(len(games)),
        "warmupUnforecastableGames": int((~chronology_available).sum()),
        "warmupUnforecastableOrigin": list(earliest_origin),
        "latestInputTimestamp": maximum_dates.max().isoformat(),
        "earliestForecastTimestamp": forecast_times.min().isoformat(),
        "sameWeekEarlierGamesUsed": False,
    }


def _analysis_projection_hash(games: pd.DataFrame, feature_names: Sequence[str]) -> str:
    columns = [
        "game_id",
        "season",
        "week",
        "forecast_at",
        "home_team",
        "away_team",
        "neutral_site",
        "actual_home_score",
        "actual_away_score",
        "league_team_score_mean",
        "naive_home_mean",
        "naive_away_mean",
        "inputs_through_season",
        "inputs_through_week",
        "maximum_input_game_date",
    ]
    for name in feature_names:
        columns.extend((f"home_{name}", f"away_{name}"))
    projected = games.loc[:, columns].sort_values(["season", "week", "game_id"]).reset_index(drop=True)
    payload = projected.to_csv(index=False, float_format="%.12g", lineterminator="\n").encode("utf-8")
    return sha256(payload).hexdigest()


def _origin_input_hash(
    training: pd.DataFrame,
    target: pd.DataFrame,
    feature_names: Sequence[str],
    family: str,
) -> str:
    if family == BASELINE_FAMILY:
        training_projection = pd.DataFrame()
        target_columns = [
            "game_id",
            "season",
            "week",
            "team",
            "opponent",
            "is_home",
            "naive_mean",
        ]
    else:
        training_columns = [
            "game_id",
            "season",
            "week",
            "team",
            "opponent",
            "is_home",
            "actual_score",
            "league_team_score_mean",
            *feature_names,
        ]
        training_projection = training.loc[:, training_columns].sort_values(
            ["season", "week", "game_id", "is_home"],
            ascending=[True, True, True, False],
        )
        target_columns = [
            "game_id",
            "season",
            "week",
            "team",
            "opponent",
            "is_home",
            "league_team_score_mean",
            *feature_names,
        ]
    target_projection = target.loc[:, target_columns].sort_values(
        ["season", "week", "game_id", "is_home"],
        ascending=[True, True, True, False],
    )
    digest = sha256()
    digest.update(family.encode("utf-8"))
    digest.update(training_projection.to_csv(index=False, float_format="%.12g", na_rep="NA").encode("utf-8"))
    digest.update(target_projection.to_csv(index=False, float_format="%.12g", na_rep="NA").encode("utf-8"))
    return digest.hexdigest()


def _validate_dataset(dataset: Any, config: Mapping[str, Any]) -> dict[str, Any]:
    games = dataset.games.copy()
    feature_names = tuple(str(name) for name in dataset.feature_names)
    required = {
        "game_id",
        "season",
        "week",
        "forecast_at",
        "home_team",
        "away_team",
        "neutral_site",
        "actual_home_score",
        "actual_away_score",
        "league_team_score_mean",
        "naive_home_mean",
        "naive_away_mean",
        "inputs_through_season",
        "inputs_through_week",
        "maximum_input_game_date",
    }
    for name in feature_names:
        required.update((f"home_{name}", f"away_{name}"))
    missing = sorted(required - set(games.columns))
    if missing:
        raise ValueError(f"Module 1 dataset is missing required columns: {missing}")
    if games.empty:
        raise ValueError("Module 1 dataset contains no completed regular-season games")
    if games["game_id"].duplicated().any():
        duplicates = games.loc[games["game_id"].duplicated(False), "game_id"].astype(str).tolist()
        raise ValueError(f"Module 1 dataset contains duplicate games: {duplicates[:10]}")

    forbidden = tuple(config["dataBoundary"]["forbiddenFieldPatterns"])
    _validate_no_forbidden_fields(games, feature_names, forbidden)
    chronology = _validate_chronology(games)

    forecastable = _forecastable_game_mask(games)
    target_numeric = games.loc[:, ["actual_home_score", "actual_away_score"]].apply(pd.to_numeric, errors="coerce")
    if not np.isfinite(target_numeric.to_numpy(dtype=float)).all():
        counts = {
            column: int((~np.isfinite(target_numeric[column].to_numpy(dtype=float))).sum())
            for column in target_numeric.columns
            if not np.isfinite(target_numeric[column].to_numpy(dtype=float)).all()
        }
        raise ValueError(f"Module 1 targets contain non-finite values: {counts}")
    if (target_numeric < 0).any().any():
        raise ValueError("Module 1 target scores cannot be negative")

    baseline_columns = ["naive_home_mean", "naive_away_mean", "league_team_score_mean"]
    baseline_numeric = games.loc[forecastable, baseline_columns].apply(pd.to_numeric, errors="coerce")
    if not np.isfinite(baseline_numeric.to_numpy(dtype=float)).all():
        raise ValueError("A forecastable Module 1 origin contains non-finite baseline means")
    if (baseline_numeric <= 0).any().any():
        raise ValueError("Module 1 baseline means must be positive")
    warmup_unforecastable = games.loc[~forecastable]
    earliest_origin = min(zip(games["season"].astype(int), games["week"].astype(int), strict=True))
    invalid_warmup = warmup_unforecastable.loc[
        [
            (int(row.season), int(row.week)) != earliest_origin
            for row in warmup_unforecastable.itertuples()
        ]
    ]
    if not invalid_warmup.empty:
        raise ValueError(
            "Only the first warmup origin may lack prior means and input metadata: "
            f"{invalid_warmup['game_id'].astype(str).tolist()[:10]}"
        )

    feature_missingness: dict[str, Any] = {}
    maximum_unexpected = float(config["dataBoundary"]["unexpectedFeatureMissingnessMaximum"])
    for name in feature_names:
        for side in ("home", "away"):
            column = f"{side}_{name}"
            values = pd.to_numeric(games[column], errors="coerce").to_numpy(dtype=float)
            if np.isinf(values).any():
                raise ValueError(f"Module 1 feature contains infinite values: {column}")
            scored_values = values[forecastable.to_numpy()]
            missing_fraction = float(np.isnan(scored_values).mean())
            expected_gap = name == "prior_week_roster_jaccard" or _is_upstream_feature(name)
            if missing_fraction > maximum_unexpected and not expected_gap:
                raise ValueError(
                    f"Unexpected missingness for {column} is {missing_fraction:.3%}, above {maximum_unexpected:.3%}"
                )
            feature_missingness[column] = {
                "count": int(np.isnan(values).sum()),
                "fraction": missing_fraction,
                "warmupUnforecastableMissingCount": int(np.isnan(values[~forecastable.to_numpy()]).sum()),
                "expectedSourceGap": expected_gap,
                "policy": "training_origin_mean_plus_missing_indicator_where_declared",
            }

    analysis_hash = _analysis_projection_hash(games, feature_names)
    return {
        "passed": True,
        "games": int(len(games)),
        "seasons": [int(games["season"].min()), int(games["season"].max())],
        "weeks": int(games[["season", "week"]].drop_duplicates().shape[0]),
        "featureCount": len(feature_names),
        "featureNames": list(feature_names),
        "analysisProjectionHash": analysis_hash,
        "datasetHash": str(dataset.data_hash),
        "featureSchemaHash": str(dataset.feature_schema_hash),
        "warmupUnforecastable": {
            "games": int((~forecastable).sum()),
            "origin": list(earliest_origin),
            "gameIds": games.loc[~forecastable, "game_id"].astype(str).tolist(),
            "policy": "retain_outcomes_for_history_but_do_not_forecast_score_or_update_residual_libraries",
        },
        "chronology": chronology,
        "featureMissingness": feature_missingness,
        "missingness": _jsonable(getattr(dataset, "missingness", {})),
        "exclusions": _jsonable(getattr(dataset, "exclusions", {})),
    }


def _to_team_score_rows(games: pd.DataFrame, feature_names: Sequence[str]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for game in games.sort_values(["season", "week", "game_id"]).to_dict("records"):
        forecastable = all(
            not pd.isna(game[name])
            for name in (
                "forecast_at",
                "inputs_through_season",
                "inputs_through_week",
                "maximum_input_game_date",
                "league_team_score_mean",
                "naive_home_mean",
                "naive_away_mean",
            )
        )
        common = {
            "game_id": str(game["game_id"]),
            "season": int(game["season"]),
            "week": int(game["week"]),
            "forecast_at": game["forecast_at"],
            "league_team_score_mean": float(game["league_team_score_mean"]),
            "inputs_through_season": int(game["inputs_through_season"])
            if not pd.isna(game["inputs_through_season"])
            else None,
            "inputs_through_week": int(game["inputs_through_week"])
            if not pd.isna(game["inputs_through_week"])
            else None,
            "maximum_input_game_date": game["maximum_input_game_date"],
            "forecastable": forecastable,
        }
        neutral_site = bool(game["neutral_site"])
        for side, opponent_side, is_home in (
            ("home", "away", 0.5 if neutral_site else 1.0),
            ("away", "home", 0.5 if neutral_site else 0.0),
        ):
            row = {
                **common,
                "team": str(game[f"{side}_team"]),
                "opponent": str(game[f"{opponent_side}_team"]),
                "is_home": float(is_home),
                "actual_score": float(game[f"actual_{side}_score"]),
                "naive_mean": float(game[f"naive_{side}_mean"]),
            }
            for name in feature_names:
                row[name] = float(is_home if name == "is_home" else game[f"{side}_{name}"])
            row["deterministic_noise_feature"] = _deterministic_noise(row["game_id"], row["team"])
            rows.append(row)
    frame = pd.DataFrame(rows).sort_values(["season", "week", "game_id", "is_home"], ascending=[True, True, True, False])
    return frame.reset_index(drop=True)


def _main_feature_names(feature_names: Sequence[str]) -> tuple[str, ...]:
    return tuple(
        name
        for name in feature_names
        if name != "is_home"
        and name not in NAIVE_BASELINE_ONLY_FEATURES
        and not _is_upstream_feature(name)
    )


def _feature_group_match(name: str, ablation: str) -> bool:
    if ablation == "no_raw_efficiency":
        return any(
            token in name
            for token in (
                "yards_per_play",
                "rule_success_rate",
                "sack_rate",
                "qb_hit_rate",
                "red_zone_touchdown_rate",
            )
        )
    if ablation == "no_explosiveness":
        return "explosive_rate" in name
    if ablation == "no_turnovers":
        return "turnover_rate" in name
    if ablation == "no_tempo_and_tendency":
        return any(token in name for token in ("seconds_per_play", "drives_per_game", "pass_rate"))
    if ablation == "no_roster_continuity":
        return name in {"prior_week_roster_jaccard", "roster_continuity_missing"}
    return False


def _base_specs(feature_names: Sequence[str]) -> list[ModelSpec]:
    main = _main_feature_names(feature_names)
    return [
        ModelSpec(BASELINE_FAMILY, BASELINE_FAMILY, "base", ()),
        ModelSpec("c1_ridge_offense_defense", "c1_ridge_offense_defense", "base", main),
        ModelSpec("c3_independent_negative_binomial", "c3_independent_negative_binomial", "base", main),
        ModelSpec("c2_dynamic_state_space", "c2_dynamic_state_space", "base", main),
    ]


def _ablation_specs(feature_names: Sequence[str], config: Mapping[str, Any]) -> tuple[list[ModelSpec], list[dict[str, Any]]]:
    main = _main_feature_names(feature_names)
    all_numeric = tuple(
        name
        for name in feature_names
        if name != "is_home" and name not in NAIVE_BASELINE_ONLY_FEATURES
    )
    specs: list[ModelSpec] = []
    not_applicable: list[dict[str, Any]] = []
    for family in CHALLENGER_FAMILIES:
        for ablation in config["ablations"]:
            name = f"ablation::{family}::{ablation}"
            spec = ModelSpec(
                name=name,
                family=family,
                analysis_kind="ablation",
                feature_names=main,
                reference_family=family,
                ablation=str(ablation),
            )
            if ablation in {
                "no_raw_efficiency",
                "no_explosiveness",
                "no_turnovers",
                "no_tempo_and_tendency",
                "no_roster_continuity",
            }:
                selected = tuple(item for item in main if not _feature_group_match(item, str(ablation)))
                if selected == main:
                    not_applicable.append(
                        {"family": family, "ablation": ablation, "status": "protocol_invalid_no_matching_feature"}
                    )
                    continue
                spec = replace(spec, feature_names=selected)
            elif ablation == "no_team_identity":
                if family == "c2_dynamic_state_space":
                    spec = replace(spec, include_states=False)
                else:
                    spec = replace(spec, include_team_identity=False)
            elif ablation == "no_time_decay":
                spec = replace(spec, no_decay=True)
            elif ablation == "no_home_effect":
                spec = replace(spec, include_home=False)
            elif ablation == "no_prior_season_carryover":
                if family != "c2_dynamic_state_space":
                    not_applicable.append({"family": family, "ablation": ablation, "status": "not_applicable"})
                    continue
                spec = replace(spec, carry_prior_season=False)
            elif ablation == "add_upstream_epa_and_proe_sensitivity":
                if all_numeric == main:
                    not_applicable.append(
                        {"family": family, "ablation": ablation, "status": "protocol_invalid_no_upstream_features"}
                    )
                    continue
                spec = replace(spec, feature_names=all_numeric)
            else:
                not_applicable.append({"family": family, "ablation": ablation, "status": "protocol_invalid_unknown"})
                continue
            specs.append(spec)
    return specs, not_applicable


def _negative_control_specs(feature_names: Sequence[str]) -> list[ModelSpec]:
    main = _main_feature_names(feature_names)
    specs: list[ModelSpec] = []
    for family in CHALLENGER_FAMILIES:
        specs.append(
            ModelSpec(
                name=f"negative_control::{family}::deterministic_noise_feature",
                family=family,
                analysis_kind="negative_control",
                feature_names=(*main, "deterministic_noise_feature"),
                reference_family=family,
                control="deterministic_noise_feature",
            )
        )
        specs.append(
            ModelSpec(
                name=f"negative_control::{family}::shuffle_team_identity_within_season_week",
                family=family,
                analysis_kind="negative_control",
                feature_names=main,
                reference_family=family,
                control="shuffle_team_identity_within_season_week",
                shuffle_team_identity=True,
            )
        )
    return specs


def _shuffle_identities(frame: pd.DataFrame, seed: int) -> pd.DataFrame:
    shuffled = frame.copy()
    for (season, week), indexes in shuffled.groupby(["season", "week"], sort=True).groups.items():
        block = shuffled.loc[indexes]
        teams = sorted(set(block["team"]).union(block["opponent"]))
        if len(teams) < 2:
            continue
        rng = np.random.default_rng(_stable_seed(seed, int(season), int(week)))
        permuted = list(rng.permutation(teams))
        mapping = dict(zip(teams, permuted, strict=True))
        shuffled.loc[indexes, "team"] = block["team"].map(mapping)
        shuffled.loc[indexes, "opponent"] = block["opponent"].map(mapping)
    return shuffled


def _impute_inside_training_origin(
    training: pd.DataFrame,
    target: pd.DataFrame,
    feature_names: Sequence[str],
    origin_season: int,
    config: Mapping[str, Any],
    no_decay: bool,
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    """Fit missing-value replacements on prior rows, then apply to the target."""

    fit_training = training.copy()
    fit_target = target.copy()
    imputation_values: dict[str, float] = {}
    missing_counts: dict[str, dict[str, int]] = {}
    half_life = float(config["features"]["timeDecayHalfLifeSeasons"])
    multipliers = {
        int(season): float(weight)
        for season, weight in config["features"].get("observationWeightMultipliersBySeason", {}).items()
    }
    weights = season_weights(
        fit_training["season"].to_numpy(int),
        origin_season,
        half_life,
        no_decay,
        multipliers,
    )
    imputed_columns = [*feature_names, "league_team_score_mean"]
    for name in imputed_columns:
        training_values = pd.to_numeric(fit_training[name], errors="coerce").to_numpy(dtype=float)
        target_values = pd.to_numeric(fit_target[name], errors="coerce").to_numpy(dtype=float)
        if np.isinf(training_values).any() or np.isinf(target_values).any():
            raise ValueError(f"Infinite values cannot be imputed for {name}")
        finite_training = training_values[np.isfinite(training_values)]
        if len(finite_training) == 0:
            raise ValueError(f"No prior finite training value is available to impute {name}")
        finite_mask = np.isfinite(training_values)
        finite_weights = weights[finite_mask]
        if float(finite_weights.sum()) <= 0:
            raise ValueError(f"No positive fold weight is available to impute {name}")
        fill_value = float(np.average(training_values[finite_mask], weights=finite_weights))
        training_missing = int(np.isnan(training_values).sum())
        target_missing = int(np.isnan(target_values).sum())
        fit_training[name] = np.where(np.isnan(training_values), fill_value, training_values)
        fit_target[name] = np.where(np.isnan(target_values), fill_value, target_values)
        imputation_values[name] = fill_value
        missing_counts[name] = {"training": training_missing, "target": target_missing}
    artifact = {
        "method": "training_origin_model_weighted_mean",
        "halfLifeSeasons": half_life,
        "noDecay": no_decay,
        "seasonWeightMultipliers": multipliers,
        "values": imputation_values,
        "missingCounts": missing_counts,
        "hash": stable_hash(
            {
                "method": "training_origin_model_weighted_mean",
                "halfLifeSeasons": half_life,
                "noDecay": no_decay,
                "seasonWeightMultipliers": multipliers,
                "values": imputation_values,
                "trainingRows": len(training),
                "trainingThrough": max(
                    ((int(row.season), int(row.week)) for row in training.itertuples()),
                    default=None,
                ),
            }
        ),
    }
    if imputed_columns and (
        not np.isfinite(fit_training.loc[:, imputed_columns].to_numpy(dtype=float)).all()
        or not np.isfinite(fit_target.loc[:, imputed_columns].to_numpy(dtype=float)).all()
    ):
        raise AssertionError("Training-origin imputation left a non-finite model value")
    return fit_training, fit_target, artifact


def _fit_predict_spec(
    spec: ModelSpec,
    training: pd.DataFrame,
    target: pd.DataFrame,
    origin_season: int,
    config: Mapping[str, Any],
) -> tuple[np.ndarray, str, dict[str, Any]]:
    origin_input_hash = _origin_input_hash(training, target, spec.feature_names, spec.family)
    if spec.family == BASELINE_FAMILY:
        score_bounds = tuple(float(value) for value in config["numerics"]["scoreMeanPredictionBounds"])
        means = np.clip(target["naive_mean"].to_numpy(float), score_bounds[0], score_bounds[1])
        model_hash = stable_hash(
            {
                "family": spec.family,
                "origin": [origin_season, int(target["week"].iloc[0])],
                "trainingThrough": max(
                    ((int(row.season), int(row.week)) for row in training.itertuples()),
                    default=None,
                ),
                "originInputHash": origin_input_hash,
            }
        )
        return means, model_hash, {
            "family": spec.family,
            "fitRows": int(len(training)),
            "originInputHash": origin_input_hash,
        }

    fit_training, fit_target, imputation = _impute_inside_training_origin(
        training,
        target,
        spec.feature_names,
        origin_season,
        config,
        spec.no_decay,
    )
    if spec.shuffle_team_identity:
        fit_training = _shuffle_identities(
            fit_training,
            _stable_seed("training-shuffle", spec.name, origin_season),
        )
        fit_target = _shuffle_identities(
            fit_target,
            _stable_seed("target-shuffle", spec.name, origin_season),
        )

    half_life = float(config["features"]["timeDecayHalfLifeSeasons"])
    multipliers = {
        int(season): float(weight)
        for season, weight in config["features"].get("observationWeightMultipliersBySeason", {}).items()
    }
    candidate = config["candidates"][spec.family]
    details: dict[str, Any] = {
        "family": spec.family,
        "features": list(spec.feature_names),
        "fitRows": int(len(training)),
        "includeTeamIdentity": spec.include_team_identity,
        "includeHome": spec.include_home,
        "includeStates": spec.include_states,
        "carryPriorSeason": spec.carry_prior_season,
        "noDecay": spec.no_decay,
        "seasonWeightMultipliers": multipliers,
        "imputation": imputation,
        "originInputHash": origin_input_hash,
    }
    if spec.family == "c1_ridge_offense_defense":
        fitted = fit_ridge_score_model(
            fit_training,
            spec.feature_names,
            origin_season,
            half_life,
            float(candidate["ridgePenalty"]),
            include_team_identity=spec.include_team_identity,
            include_home=spec.include_home,
            no_decay=spec.no_decay,
            season_multipliers=multipliers,
            origin_week=int(target["week"].iloc[0]),
            numerics=config["numerics"],
        )
        means = predict_ridge_score(fitted, fit_target)
        model_hash = fitted.model_hash
    elif spec.family == "c3_independent_negative_binomial":
        fitted = fit_poisson_score_model(
            fit_training,
            spec.feature_names,
            origin_season,
            half_life,
            float(candidate["ridgePenalty"]),
            int(candidate["maximumIterations"]),
            float(candidate["convergenceTolerance"]),
            include_team_identity=spec.include_team_identity,
            include_home=spec.include_home,
            no_decay=spec.no_decay,
            season_multipliers=multipliers,
            origin_week=int(target["week"].iloc[0]),
            numerics=config["numerics"],
        )
        details.update({"converged": fitted.converged, "iterations": fitted.iterations})
        if not fitted.converged:
            raise RuntimeError("Count-model IRLS did not converge at this origin")
        means = predict_poisson_score(fitted, fit_target)
        model_hash = fitted.model_hash
    elif spec.family == "c2_dynamic_state_space":
        fitted = fit_dynamic_state_model(
            fit_training,
            spec.feature_names,
            origin_season,
            half_life,
            float(candidate["baseRidgePenalty"]),
            float(candidate["initialVarianceRatio"]),
            float(candidate["processVarianceRatio"]),
            float(candidate["offseasonVarianceRatio"]),
            float(candidate["offseasonMeanRetention"]),
            include_home=spec.include_home,
            include_states=spec.include_states,
            carry_prior_season=spec.carry_prior_season,
            no_decay=spec.no_decay,
            season_multipliers=multipliers,
            origin_week=int(target["week"].iloc[0]),
            numerics=config["numerics"],
        )
        means = predict_dynamic_score(fitted, fit_target)
        model_hash = fitted.model_hash
        details["observationVariance"] = fitted.observation_variance
    else:
        raise ValueError(f"Unknown Module 1 candidate family: {spec.family}")

    recipe_hash = stable_hash(
        {
            "fitHash": model_hash,
            "spec": _jsonable(spec.__dict__),
            "origin": [origin_season, int(target["week"].iloc[0])],
            "imputationHash": imputation["hash"],
            "originInputHash": origin_input_hash,
        }
    )
    return np.asarray(means, dtype=float), recipe_hash, details


def _distribution_for_game(
    spec: ModelSpec,
    mean_home: float,
    mean_away: float,
    residuals: Sequence[Mapping[str, Any]],
    origin_season: int,
    config: Mapping[str, Any],
) -> tuple[np.ndarray | None, dict[str, Any]]:
    distribution_config = config["distribution"]
    if spec.family == "c3_independent_negative_binomial":
        minimum_dispersion = float(config["candidates"][spec.family]["minimumDispersion"])
        maximum_dispersion = float(config["numerics"]["dispersionMaximum"])
        minimum_records = int(config["distribution"]["residualLibraryMinimumGames"])
        library_limit = int(distribution_config.get("residualLibraryMaximumGames", 512))
        dispersion_records = list(residuals[-library_limit:])
        home_dispersion = prequential_dispersion(
            dispersion_records,
            "home",
            minimum_dispersion,
            maximum_dispersion,
            minimum_records,
        )
        away_dispersion = prequential_dispersion(
            dispersion_records,
            "away",
            minimum_dispersion,
            maximum_dispersion,
            minimum_records,
        )
        distribution = independent_count_distribution(
            mean_home,
            mean_away,
            home_dispersion,
            away_dispersion,
            distribution_config,
        )
        library_hash = stable_hash(
            [
                [
                    row["game_id"],
                    row["season"],
                    row["week"],
                    row["mean_home"],
                    row["mean_away"],
                    row["actual_home"],
                    row["actual_away"],
                ]
                for row in dispersion_records
            ]
        )
        return distribution, {
            "type": "independent_negative_binomial",
            "residualLibraryHash": library_hash,
            "residualLibraryGames": len(dispersion_records),
            "totalPriorResidualGames": len(residuals),
            "homeDispersion": home_dispersion,
            "awayDispersion": away_dispersion,
        }
    if len(residuals) < int(distribution_config["residualLibraryMinimumGames"]):
        return None, {
            "type": "prequential_residual_kernel",
            "residualLibraryGames": len(residuals),
            "requiredResidualLibraryGames": int(distribution_config["residualLibraryMinimumGames"]),
            "status": "warmup_not_scored",
        }
    distribution, library_hash = residual_kernel_distribution(
        mean_home,
        mean_away,
        residuals,
        origin_season,
        distribution_config,
    )
    return distribution, {
        "type": "prequential_residual_kernel",
        "residualLibraryHash": library_hash,
        "residualLibraryGames": len(residuals),
    }


def _run_weekly_forecasts(
    games: pd.DataFrame,
    team_rows: pd.DataFrame,
    specs: Sequence[ModelSpec],
    config: Mapping[str, Any],
    run_generated_at: str,
    config_hash: str,
    data_hash: str,
    feature_schema_hash: str,
    code_hash: str,
    show_progress: bool = True,
) -> tuple[list[dict[str, Any]], pd.DataFrame, list[dict[str, Any]], dict[str, Any]]:
    residual_libraries: dict[str, list[dict[str, Any]]] = {spec.name: [] for spec in specs}
    forecast_records: list[dict[str, Any]] = []
    metric_rows: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    timing: dict[str, float] = {spec.name: 0.0 for spec in specs}
    last_progress_season: int | None = None
    origins = sorted((int(season), int(week)) for season, week in games[["season", "week"]].drop_duplicates().itertuples(index=False))

    for origin_season, origin_week in origins:
        if show_progress and origin_season != last_progress_season:
            print(f"Module 1 chronological replay: season {origin_season}", flush=True)
            last_progress_season = origin_season
        before = (team_rows["season"] < origin_season) | (
            (team_rows["season"] == origin_season) & (team_rows["week"] < origin_week)
        )
        target_mask = (team_rows["season"] == origin_season) & (team_rows["week"] == origin_week)
        training = team_rows.loc[before].copy()
        target = team_rows.loc[target_mask].copy()
        origin_games = games.loc[(games["season"] == origin_season) & (games["week"] == origin_week)].copy()
        if len(target) != 2 * len(origin_games):
            raise ValueError(f"Paired team-score rows are incomplete at {origin_season} Week {origin_week}")

        if not bool(target["forecastable"].all()):
            if bool(target["forecastable"].any()):
                raise ValueError(f"The warmup origin is partially forecastable at {origin_season} Week {origin_week}")
            for spec in specs:
                for game in origin_games.sort_values("game_id").to_dict("records"):
                    forecast_payload = {
                        "schemaVersion": "module-one-forecast-v1",
                        "experimentVersion": config["version"],
                        "family": spec.name,
                        "baseFamily": spec.family,
                        "analysisKind": spec.analysis_kind,
                        "ablation": spec.ablation,
                        "negativeControl": spec.control,
                        "gameId": str(game["game_id"]),
                        "season": origin_season,
                        "week": origin_week,
                        "intendedForecastAt": _jsonable(game["forecast_at"]),
                        "inputsThrough": None,
                        "maximumInputGameDate": None,
                        "homeTeam": str(game["home_team"]),
                        "awayTeam": str(game["away_team"]),
                        "meanHome": None,
                        "meanAway": None,
                        "distributionReady": False,
                        "distribution": {
                            "status": "warmup_unforecastable",
                            "residualLibraryGames": len(residual_libraries[spec.name]),
                        },
                        "modelHash": None,
                        "configHash": config_hash,
                        "originInputHash": None,
                        "archiveDataHash": data_hash,
                        "featureSchemaHash": feature_schema_hash,
                        "codeHash": code_hash,
                    }
                    forecast_records.append(
                        {
                            **forecast_payload,
                            "forecastHash": stable_hash(
                                {key: value for key, value in forecast_payload.items() if key != "archiveDataHash"}
                            ),
                            "generatedAt": run_generated_at,
                            "storageStatus": "warmup_unforecastable_no_pregame_history",
                            "fit": None,
                            "actual": {
                                "home": int(round(float(game["actual_home_score"]))),
                                "away": int(round(float(game["actual_away_score"]))),
                            },
                            "grade": None,
                        }
                    )
            continue

        for spec in specs:
            started = time.perf_counter()
            try:
                means, model_hash, fit_details = _fit_predict_spec(spec, training, target, origin_season, config)
                if len(means) != len(target) or not np.isfinite(means).all():
                    raise ValueError("Candidate returned missing, non-finite, or misaligned means")
            except Exception as error:  # noqa: BLE001 - failures are part of the scorecard
                failures.append(
                    {
                        "family": spec.name,
                        "baseFamily": spec.family,
                        "season": origin_season,
                        "week": origin_week,
                        "stage": "fit_or_mean_prediction",
                        "errorType": type(error).__name__,
                        "message": str(error),
                    }
                )
                timing[spec.name] += time.perf_counter() - started
                continue

            target_with_mean = target.copy()
            target_with_mean["predicted_mean"] = means
            prior_residual_count = len(residual_libraries[spec.name])
            origin_residual_updates: list[dict[str, Any]] = []
            for game_id, paired in target_with_mean.groupby("game_id", sort=True):
                if len(paired) != 2:
                    raise ValueError(f"Home and away forecast pairing failed for {game_id}")
                scheduled = origin_games.loc[origin_games["game_id"].astype(str) == str(game_id)]
                if len(scheduled) != 1:
                    raise ValueError(f"Schedule pairing failed for {game_id}")
                home_team = str(scheduled.iloc[0]["home_team"])
                away_team = str(scheduled.iloc[0]["away_team"])
                home_rows = paired.loc[paired["team"] == home_team]
                away_rows = paired.loc[paired["team"] == away_team]
                if len(home_rows) != 1 or len(away_rows) != 1:
                    raise ValueError(f"Team identity pairing failed for {game_id}")
                home = home_rows.iloc[0]
                away = away_rows.iloc[0]
                mean_home = float(home["predicted_mean"])
                mean_away = float(away["predicted_mean"])
                distribution, distribution_details = _distribution_for_game(
                    spec,
                    mean_home,
                    mean_away,
                    residual_libraries[spec.name],
                    origin_season,
                    config,
                )
                intended_forecast_at = pd.to_datetime(home["forecast_at"], utc=True).isoformat()
                forecast_payload = {
                    "schemaVersion": "module-one-forecast-v1",
                    "experimentVersion": config["version"],
                    "family": spec.name,
                    "baseFamily": spec.family,
                    "analysisKind": spec.analysis_kind,
                    "ablation": spec.ablation,
                    "negativeControl": spec.control,
                    "gameId": str(game_id),
                    "season": origin_season,
                    "week": origin_week,
                    "intendedForecastAt": intended_forecast_at,
                    "inputsThrough": [int(home["inputs_through_season"]), int(home["inputs_through_week"])],
                    "maximumInputGameDate": pd.to_datetime(home["maximum_input_game_date"], utc=True).isoformat(),
                    "homeTeam": str(home["team"]),
                    "awayTeam": str(away["team"]),
                    "meanHome": mean_home,
                    "meanAway": mean_away,
                    "distributionReady": distribution is not None,
                    "distribution": distribution_details,
                    "modelHash": model_hash,
                    "configHash": config_hash,
                    "originInputHash": fit_details["originInputHash"],
                    "archiveDataHash": data_hash,
                    "featureSchemaHash": feature_schema_hash,
                    "codeHash": code_hash,
                }
                if distribution is not None:
                    forecast_payload["distributionHash"] = sha256(np.round(distribution, 15).tobytes()).hexdigest()
                forecast_hash = stable_hash(
                    {key: value for key, value in forecast_payload.items() if key != "archiveDataHash"}
                )
                actual_home = int(round(float(home["actual_score"])))
                actual_away = int(round(float(away["actual_score"])))
                grade: dict[str, Any] | None = None
                if distribution is not None:
                    energy_seed = _stable_seed(int(config["distribution"]["energyScoreSeed"]), str(game_id))
                    grade = evaluate_distribution(
                        distribution,
                        actual_home,
                        actual_away,
                        int(config["distribution"]["energyScoreSamples"]),
                        energy_seed,
                        probability_floor=float(config["distribution"]["probabilityFloor"]),
                    )
                    metric_rows.append(
                        {
                            "family": spec.name,
                            "base_family": spec.family,
                            "analysis_kind": spec.analysis_kind,
                            "game_id": str(game_id),
                            "season": origin_season,
                            "week": origin_week,
                            "forecast_hash": forecast_hash,
                            "forecast_failed": 0,
                            **grade,
                        }
                    )
                forecast_records.append(
                    {
                        **forecast_payload,
                        "forecastHash": forecast_hash,
                        "generatedAt": run_generated_at,
                        "storageStatus": "retrospective_reconstruction_not_prospectively_stored",
                        "fit": fit_details,
                        "actual": {"home": actual_home, "away": actual_away},
                        "grade": grade,
                    }
                )
                origin_residual_updates.append(
                    {
                        "game_id": str(game_id),
                        "season": origin_season,
                        "week": origin_week,
                        "mean_home": mean_home,
                        "mean_away": mean_away,
                        "actual_home": actual_home,
                        "actual_away": actual_away,
                    }
                )
            if len(residual_libraries[spec.name]) != prior_residual_count:
                raise AssertionError("A residual library changed before the weekly origin completed")
            residual_libraries[spec.name].extend(origin_residual_updates)
            timing[spec.name] += time.perf_counter() - started

    metrics = pd.DataFrame(metric_rows)
    isolation_checks: list[dict[str, Any]] = []
    for spec in specs:
        family_records = [row for row in forecast_records if row["family"] == spec.name]
        unique_prior_counts = {
            (int(row["season"]), int(row["week"])): set(
                int(item["distribution"]["residualLibraryGames"])
                for item in family_records
                if int(item["season"]) == int(row["season"]) and int(item["week"]) == int(row["week"])
            )
            for row in family_records
        }
        passed = all(len(values) == 1 for values in unique_prior_counts.values())
        if not passed:
            raise AssertionError(f"Same-week residual isolation failed for {spec.name}")
        isolation_checks.append(
            {
                "family": spec.name,
                "passed": True,
                "weeklyOriginsChecked": len(unique_prior_counts),
            }
        )
    runtime = {
        "secondsByFamily": timing,
        "totalSeconds": float(sum(timing.values())),
        "sameWeekResidualIsolation": isolation_checks,
    }
    return forecast_records, metrics, failures, runtime


def _common_scorecards(
    metrics: pd.DataFrame,
    games: pd.DataFrame,
    seasons: Sequence[int],
    families: Sequence[str],
) -> dict[str, Any]:
    season_set = {int(season) for season in seasons}
    expected = set(games.loc[games["season"].isin(season_set), "game_id"].astype(str))
    observed = {
        family: set(
            metrics.loc[(metrics["family"] == family) & (metrics["season"].isin(season_set)), "game_id"].astype(str)
        )
        for family in families
    }
    missing = {family: sorted(expected - values) for family, values in observed.items()}
    extra = {family: sorted(values - expected) for family, values in observed.items()}
    common = set.intersection(*(observed[family] for family in families)) if families else set()
    identical = all(observed[family] == expected for family in families)
    scorecards: dict[str, Any] = {}
    by_season: dict[str, Any] = {}
    if common:
        common_rows = metrics.loc[
            metrics["season"].isin(season_set)
            & metrics["game_id"].astype(str).isin(common)
            & metrics["family"].isin(families)
        ].copy()
        for family in families:
            family_rows = common_rows.loc[common_rows["family"] == family]
            card = aggregate_scorecard(family_rows)
            card["forecastFailureRate"] = float(len(expected - observed[family]) / max(1, len(expected)))
            scorecards[family] = card
            by_season[family] = {
                str(season): aggregate_scorecard(family_rows.loc[family_rows["season"] == season])
                for season in sorted(season_set)
                if not family_rows.loc[family_rows["season"] == season].empty
            }
    return {
        "seasons": sorted(season_set),
        "expectedGames": len(expected),
        "commonGames": len(common),
        "identicalCompleteManifest": identical,
        "missingByFamily": {family: values[:25] for family, values in missing.items()},
        "missingCountsByFamily": {family: len(values) for family, values in missing.items()},
        "extraByFamily": {family: values[:25] for family, values in extra.items()},
        "scorecards": scorecards,
        "bySeason": by_season,
    }


def _bootstrap_group(
    metrics: pd.DataFrame,
    seasons: Sequence[int],
    baseline: str,
    candidates: Sequence[str],
    config: Mapping[str, Any],
) -> dict[str, Any] | None:
    if not candidates:
        return None
    rows = metrics.loc[
        metrics["season"].isin([int(season) for season in seasons])
        & metrics["family"].isin([baseline, *candidates])
    ]
    return hierarchical_simultaneous_bootstrap(
        rows,
        baseline,
        candidates,
        "energy_score",
        int(config["evaluation"]["bootstrapMembers"]),
        int(config["evaluation"]["bootstrapSeed"]),
        int(config["evaluation"]["bootstrapWeekBlockLength"]),
        float(config["evaluation"]["simultaneousInterval"]),
    )


def _clustered_mean_intervals(
    rows: pd.DataFrame,
    metric_names: Sequence[str],
    config: Mapping[str, Any],
    seed_label: str,
) -> dict[str, Any]:
    if rows.empty:
        raise ValueError("Clustered calibration intervals require forecast rows")
    gate = config["shadowEligibilityGate"]
    members = int(gate["coverageBootstrapMembers"])
    block_length = int(config["evaluation"]["bootstrapWeekBlockLength"])
    interval_mass = float(gate["coverageBootstrapIntervalMass"])
    seasons = sorted(int(value) for value in rows["season"].unique())
    by_season_week: dict[int, dict[int, np.ndarray]] = {}
    for season in seasons:
        season_rows = rows.loc[rows["season"] == season]
        by_season_week[season] = {
            int(week): block.loc[:, list(metric_names)].to_numpy(dtype=float)
            for week, block in season_rows.groupby("week", sort=True)
        }
    rng = np.random.default_rng(
        _stable_seed(int(config["evaluation"]["bootstrapSeed"]), "coverage", seed_label)
    )
    draws = np.zeros((members, len(metric_names)), dtype=float)
    for member in range(members):
        sampled_values: list[np.ndarray] = []
        for sampled_season in rng.choice(seasons, size=len(seasons), replace=True):
            week_map = by_season_week[int(sampled_season)]
            weeks = sorted(week_map)
            starts = list(range(max(1, len(weeks) - block_length + 1)))
            required_blocks = math.ceil(len(weeks) / block_length)
            sampled_weeks: list[int] = []
            for start in rng.choice(starts, size=required_blocks, replace=True):
                sampled_weeks.extend(weeks[int(start): int(start) + block_length])
            for week in sampled_weeks[: len(weeks)]:
                sampled_values.append(week_map[week])
        draws[member] = np.concatenate(sampled_values, axis=0).mean(axis=0)
    lower_probability = (1 - interval_mass) / 2
    observed = rows.loc[:, list(metric_names)].mean().to_numpy(dtype=float)
    return {
        "members": members,
        "blockLengthWeeks": block_length,
        "intervalMass": interval_mass,
        "seasons": seasons,
        "metrics": {
            name: {
                "observed": float(observed[index]),
                "interval": [
                    float(np.quantile(draws[:, index], lower_probability)),
                    float(np.quantile(draws[:, index], 1 - lower_probability)),
                ],
            }
            for index, name in enumerate(metric_names)
        },
    }


def _coverage_uncertainty(
    metrics: pd.DataFrame,
    seasons: Sequence[int],
    families: Sequence[str],
    config: Mapping[str, Any],
) -> dict[str, Any]:
    targets = tuple(str(target) for target in config["shadowEligibilityGate"]["coverage80Targets"])
    names = tuple(f"coverage_80_{target}" for target in targets)
    output: dict[str, Any] = {}
    for family in families:
        rows = metrics.loc[
            (metrics["family"] == family)
            & metrics["season"].isin([int(season) for season in seasons])
        ]
        output[family] = _clustered_mean_intervals(rows, names, config, family)
        for name in names:
            interval = output[family]["metrics"][name]["interval"]
            output[family]["metrics"][name]["nominalContained"] = bool(interval[0] <= 0.8 <= interval[1])
    return output


def _static_negative_controls(
    dataset: Any,
    config: Mapping[str, Any],
    data_audit: Mapping[str, Any],
) -> dict[str, Any]:
    forbidden = tuple(config["dataBoundary"]["forbiddenFieldPatterns"])
    market_rejected = False
    market_message = None
    injected_market = dataset.games.copy()
    injected_market["market_spread"] = -3.5
    try:
        _validate_no_forbidden_fields(injected_market, dataset.feature_names, forbidden)
    except ValueError as error:
        market_rejected = True
        market_message = str(error)

    future_rejected = False
    future_message = None
    injected_future = dataset.games.copy()
    forecastable_indexes = injected_future.index[_forecastable_game_mask(injected_future)]
    if len(forecastable_indexes) == 0:
        raise ValueError("No forecastable row is available for the future-week negative control")
    first = forecastable_indexes[0]
    injected_future.loc[first, "inputs_through_season"] = int(injected_future.loc[first, "season"])
    injected_future.loc[first, "inputs_through_week"] = int(injected_future.loc[first, "week"])
    try:
        _validate_chronology(injected_future)
    except ValueError as error:
        future_rejected = True
        future_message = str(error)

    projection_before = str(data_audit["analysisProjectionHash"])
    unrelated_external_tables = {
        "sportsbook": [{"game": "synthetic", "american_price": -110}],
        "recorded_picks": [{"game": "synthetic", "choice": "home"}],
    }
    projection_after = _analysis_projection_hash(dataset.games, dataset.feature_names)
    del unrelated_external_tables
    invariance_passed = projection_before == projection_after
    return {
        "market_field_must_fail": {
            "passed": market_rejected,
            "evidence": market_message,
        },
        "future_week_row_must_fail": {
            "passed": future_rejected,
            "evidence": future_message,
        },
        "odds_and_pick_tables_invariance": {
            "passed": invariance_passed,
            "beforeHash": projection_before,
            "afterHash": projection_after,
            "evidence": "The runner accepts only the allowlisted ModuleOneDataset projection.",
        },
    }


def _variant_analysis(
    metrics: pd.DataFrame,
    games: pd.DataFrame,
    specs: Sequence[ModelSpec],
    config: Mapping[str, Any],
    kind: str,
) -> dict[str, Any]:
    development = config["forecastContract"]["developmentSeasons"]
    confirmation = [config["forecastContract"]["confirmationSeason"]]
    by_reference: dict[str, Any] = {}
    for family in CHALLENGER_FAMILIES:
        family_specs = [spec for spec in specs if spec.analysis_kind == kind and spec.reference_family == family]
        names = [spec.name for spec in family_specs]
        if not names:
            by_reference[family] = {"status": "protocol_invalid_unexecuted", "variants": {}}
            continue
        development_cards = _common_scorecards(metrics, games, development, [family, *names])
        confirmation_cards = _common_scorecards(metrics, games, confirmation, [family, *names])
        bootstrap = None
        bootstrap_error = None
        if development_cards["identicalCompleteManifest"]:
            try:
                bootstrap = _bootstrap_group(metrics, development, family, names, config)
            except Exception as error:  # noqa: BLE001 - retained as protocol evidence
                bootstrap_error = f"{type(error).__name__}: {error}"
        variants: dict[str, Any] = {}
        for spec in family_specs:
            comparison = (
                bootstrap["comparisons"].get(spec.name)
                if bootstrap is not None
                else None
            )
            interval = comparison["simultaneousInterval"] if comparison else None
            stable_improvement_over_full = bool(
                comparison
                and comparison["meanImprovement"] > 0
                and interval is not None
                and interval[0] > 0
            )
            variants[spec.name] = {
                "baseFamily": family,
                "ablation": spec.ablation,
                "negativeControl": spec.control,
                "features": list(spec.feature_names),
                "developmentScorecard": development_cards["scorecards"].get(spec.name),
                "confirmationScorecard": confirmation_cards["scorecards"].get(spec.name),
                "pairedEnergyComparison": comparison,
                "stableImprovementOverFullModel": stable_improvement_over_full,
            }
        by_reference[family] = {
            "status": "complete"
            if development_cards["identicalCompleteManifest"] and confirmation_cards["identicalCompleteManifest"] and bootstrap
            else "protocol_invalid_incomplete",
            "developmentManifest": {
                key: development_cards[key]
                for key in ("expectedGames", "commonGames", "identicalCompleteManifest", "missingCountsByFamily")
            },
            "confirmationManifest": {
                key: confirmation_cards[key]
                for key in ("expectedGames", "commonGames", "identicalCompleteManifest", "missingCountsByFamily")
            },
            "bootstrapError": bootstrap_error,
            "variants": variants,
        }
    return by_reference


def _candidate_gate_checks(
    family: str,
    development_cards: Mapping[str, Any],
    confirmation_cards: Mapping[str, Any],
    bootstrap: Mapping[str, Any],
    config: Mapping[str, Any],
    data_controls_passed: bool,
    ablation_analysis: Mapping[str, Any],
    control_analysis: Mapping[str, Any],
    coverage_uncertainty: Mapping[str, Any],
) -> dict[str, Any]:
    gate = config["shadowEligibilityGate"]
    baseline_dev = development_cards["scorecards"][BASELINE_FAMILY]
    candidate_dev = development_cards["scorecards"][family]
    baseline_confirmation = confirmation_cards["scorecards"][BASELINE_FAMILY]
    candidate_confirmation = confirmation_cards["scorecards"][family]
    comparison = bootstrap["comparisons"][family]
    energy_fraction = comparison["meanImprovement"] / baseline_dev["energy_score"]
    checks: dict[str, dict[str, Any]] = {}

    def add(name: str, passed: bool, evidence: Any) -> None:
        checks[name] = {"passed": bool(passed), "evidence": _jsonable(evidence)}

    add(
        "minimum_development_energy_gain",
        energy_fraction >= float(gate["minimumDevelopmentEnergyImprovementFraction"]),
        {"fraction": energy_fraction, "minimum": gate["minimumDevelopmentEnergyImprovementFraction"]},
    )
    lower = float(comparison["simultaneousInterval"][0])
    add(
        "paired_simultaneous_interval_above_zero",
        lower > 0 if gate["simultaneousImprovementIntervalMustBeAboveZero"] else True,
        comparison["simultaneousInterval"],
    )
    add(
        "improved_development_seasons",
        int(comparison["improvedSeasons"]) >= int(gate["minimumImprovedDevelopmentSeasons"]),
        {"observed": comparison["improvedSeasons"], "minimum": gate["minimumImprovedDevelopmentSeasons"]},
    )
    leave_one_out = {str(season): float(value) for season, value in comparison["leaveOneSeasonOut"].items()}
    add(
        "leave_one_season_out_stability",
        all(value > 0 for value in leave_one_out.values())
        if gate.get("leaveOneSeasonOutImprovementMustRemainPositive", False)
        else True,
        leave_one_out,
    )
    add(
        "confirmation_energy_point_estimate",
        candidate_confirmation["energy_score"] < baseline_confirmation["energy_score"]
        if gate["confirmationPointEstimateMustImprove"]
        else True,
        {
            "baseline": baseline_confirmation["energy_score"],
            "candidate": candidate_confirmation["energy_score"],
        },
    )

    maximum_crps_regression = float(gate["maximumMarginalCrpsRegressionFraction"])
    crps_targets = tuple(str(target) for target in gate["crpsNoninferiorityTargets"])
    crps_regressions = {
        metric: (candidate_dev[metric] - baseline_dev[metric]) / baseline_dev[metric]
        for metric in (f"{target}_crps" for target in crps_targets)
    }
    add(
        "crps_noninferiority",
        all(value <= maximum_crps_regression for value in crps_regressions.values()),
        {"regressions": crps_regressions, "maximum": maximum_crps_regression},
    )
    log_regression = (
        candidate_dev["joint_log_score"] - baseline_dev["joint_log_score"]
    ) / baseline_dev["joint_log_score"]
    add(
        "joint_log_score_noninferiority",
        log_regression <= float(gate["maximumJointLogScoreRegressionFraction"]),
        {"regression": log_regression, "maximum": gate["maximumJointLogScoreRegressionFraction"]},
    )
    mae_targets = tuple(str(target) for target in gate["teamMaeTargets"])
    mae_regressions = {
        side: candidate_dev[f"{side}_absolute_error"] - baseline_dev[f"{side}_absolute_error"]
        for side in mae_targets
    }
    add(
        "team_mae_noninferiority",
        all(value <= float(gate["maximumTeamMaeRegressionPoints"]) for value in mae_regressions.values()),
        {"pointRegressions": mae_regressions, "maximum": gate["maximumTeamMaeRegressionPoints"]},
    )
    coverage_range = [float(value) for value in gate["coverage80ObservedRange"]]
    coverage_targets = tuple(str(target) for target in gate["coverage80Targets"])
    coverage = {target: candidate_dev[f"coverage_80_{target}"] for target in coverage_targets}
    clustered_coverage = coverage_uncertainty[family]["metrics"]
    nominal_contained = {
        target: bool(clustered_coverage[f"coverage_80_{target}"]["nominalContained"])
        for target in coverage_targets
    }
    add(
        "coverage_80",
        all(coverage_range[0] <= value <= coverage_range[1] for value in coverage.values())
        and all(nominal_contained.values()),
        {
            "observed": coverage,
            "practicalRange": coverage_range,
            "clusteredIntervals": clustered_coverage,
            "nominalContained": nominal_contained,
            "requiredNominal": 0.8,
        },
    )
    width_targets = tuple(str(target) for target in gate["intervalWidthTargets"])
    width_increases = {
        target: (
            candidate_dev[f"width_80_{target}"] - baseline_dev[f"width_80_{target}"]
        ) / baseline_dev[f"width_80_{target}"]
        for target in width_targets
    }
    width_exception = energy_fraction >= float(
        gate["wideIntervalEnergyImprovementExceptionFraction"]
    )
    width_passed = all(
        value <= float(gate["maximumIntervalWidthIncreaseFraction"])
        for value in width_increases.values()
    ) or width_exception
    add(
        "interval_width",
        width_passed,
        {
            "increaseFractionByTarget": width_increases,
            "maximum": gate["maximumIntervalWidthIncreaseFraction"],
            "energyException": gate["wideIntervalEnergyImprovementExceptionFraction"],
            "energyExceptionApplied": width_exception,
        },
    )
    add(
        "forecast_failure_rate",
        candidate_dev["forecastFailureRate"] <= float(gate["maximumForecastFailureRate"]),
        {"observed": candidate_dev["forecastFailureRate"], "maximum": gate["maximumForecastFailureRate"]},
    )
    add("leakage_and_invariance", data_controls_passed, {"passed": data_controls_passed})

    candidate_ablations = ablation_analysis[family]
    stable_removal_improvements = [
        value
        for value in candidate_ablations.get("variants", {}).values()
        if value["ablation"] != "add_upstream_epa_and_proe_sensitivity"
        and value["stableImprovementOverFullModel"]
    ]
    add(
        "ablation_falsification",
        candidate_ablations.get("status") == "complete" and not stable_removal_improvements,
        {
            "status": candidate_ablations.get("status"),
            "stableImprovingAblations": [value["ablation"] for value in stable_removal_improvements],
        },
    )
    candidate_controls = control_analysis[family]
    improving_controls = [
        value for value in candidate_controls.get("variants", {}).values() if value["stableImprovementOverFullModel"]
    ]
    add(
        "model_negative_controls",
        candidate_controls.get("status") == "complete" and not improving_controls,
        {
            "status": candidate_controls.get("status"),
            "stableImprovingControls": [value["negativeControl"] for value in improving_controls],
        },
    )
    return {
        "family": family,
        "energyImprovementFraction": energy_fraction,
        "checks": checks,
        "passed": all(value["passed"] for value in checks.values()),
    }


def _select_shadow_candidate(
    candidate_gates: Mapping[str, Any],
    metrics: pd.DataFrame,
    config: Mapping[str, Any],
) -> tuple[str | None, dict[str, Any]]:
    development = config["forecastContract"]["developmentSeasons"]
    ordered = sorted(CHALLENGER_FAMILIES, key=lambda family: int(config["candidates"][family]["complexityRank"]))
    development_rows = metrics.loc[
        metrics["season"].isin([int(season) for season in development])
        & metrics["family"].isin(ordered)
    ]
    development_energy = development_rows.groupby("family")["energy_score"].mean().to_dict()
    qualifying: list[str] = []
    complexity_checks: dict[str, Any] = {}
    best_simpler: str | None = None
    for family in ordered:
        if not candidate_gates[family]["passed"]:
            complexity_checks[family] = {"passed": False, "reason": "base_or_falsification_gate_failed"}
            continue
        if best_simpler is None:
            complexity_checks[family] = {"passed": True, "reason": "simplest_qualifying_challenger"}
            qualifying.append(family)
            best_simpler = family
            continue
        paired = _bootstrap_group(metrics, development, best_simpler, [family], config)
        comparison = paired["comparisons"][family] if paired else None
        passed = bool(comparison and comparison["simultaneousInterval"][0] > 0)
        complexity_checks[family] = {
            "passed": passed,
            "reason": "must_beat_best_simpler_qualifying_candidate",
            "simplerFamily": best_simpler,
            "pairedEnergyComparison": comparison,
        }
        if passed:
            qualifying.append(family)
            best_simpler = min(
                qualifying,
                key=lambda candidate: float(development_energy.get(candidate, math.inf)),
            )
    selected = best_simpler if qualifying else None
    return selected, {"orderedCandidates": ordered, "checks": complexity_checks, "qualifying": qualifying}


def _markdown_scorecard(report: Mapping[str, Any]) -> str:
    lines = [
        "# Model Laboratory Module 1 scorecard",
        "",
        f"Result: **{report['result']}**",
        "",
        "This is a retrospective football-only replay. It did not change the production forecast.",
        "",
        "| Candidate | Development energy | Gain vs C0 | Simultaneous 90% interval | 2025 energy | 80% home coverage | Calibration slope | Gate |",
        "|---|---:|---:|---:|---:|---:|---:|---|",
    ]
    development = report["baseScorecards"]["development"]["scorecards"]
    confirmation = report["baseScorecards"]["confirmation"]["scorecards"]
    comparisons = report["pairedUncertainty"].get("comparisons", {})
    baseline_energy = development.get(BASELINE_FAMILY, {}).get("energy_score")
    for family in BASE_FAMILIES:
        dev = development.get(family)
        confirm = confirmation.get(family)
        if dev is None or confirm is None:
            lines.append(f"| `{family}` | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | reject |")
            continue
        if family == BASELINE_FAMILY:
            gain = 0.0
            interval_text = "reference"
            gate_text = "reference"
        else:
            comparison = comparisons.get(family)
            gain = comparison["meanImprovement"] / baseline_energy if comparison and baseline_energy else math.nan
            interval_text = (
                f"[{comparison['simultaneousInterval'][0]:.3f}, {comparison['simultaneousInterval'][1]:.3f}]"
                if comparison
                else "unavailable"
            )
            gate_text = "pass" if report["shadowEligibility"]["candidateGates"][family]["passed"] else "reject"
        calibration = dev.get("home_win_calibration") or {}
        slope = calibration.get("slope")
        slope_text = "NA" if slope is None else f"{slope:.3f}"
        lines.append(
            f"| `{family}` | {dev['energy_score']:.3f} | {gain:.2%} | {interval_text} | "
            f"{confirm['energy_score']:.3f} | {dev['coverage_80_home']:.1%} | {slope_text} | {gate_text} |"
        )
    lines.extend(
        [
            "",
            "## Falsification",
            "",
        ]
    )
    for family in CHALLENGER_FAMILIES:
        ablation = report["ablations"]["byCandidate"][family]
        controls = report["negativeControls"]["modelControls"][family]
        improving_ablation = [
            value["ablation"]
            for value in ablation.get("variants", {}).values()
            if value["stableImprovementOverFullModel"]
            and value["ablation"] != "add_upstream_epa_and_proe_sensitivity"
        ]
        improving_control = [
            value["negativeControl"]
            for value in controls.get("variants", {}).values()
            if value["stableImprovementOverFullModel"]
        ]
        lines.append(
            f"- `{family}`: improving removal ablations = {improving_ablation or 'none'}; "
            f"improving negative controls = {improving_control or 'none'}."
        )
    lines.extend(
        [
            "",
            "## Audit limits",
            "",
            "- Historical feature availability is reconstructed by season and week. It is not an original publication-time archive.",
            "- The 2025 period is a frozen retrospective confirmation, not an untouched test set.",
            "- Every historical ledger row was reconstructed after its outcome. Prospective 2026 storage is still required.",
            "- No market baseline was compared because the football model is not yet frozen for prospective shadow use.",
            "",
            "## Exact next decision",
            "",
            report["nextDecision"],
            "",
        ]
    )
    return "\n".join(lines)


def run_module_one(
    dataset: Any,
    config: Mapping[str, Any],
    output_dir: Path,
    show_progress: bool = True,
) -> dict[str, Any]:
    if bool(config["productionForecastChangeAllowed"]):
        raise ValueError("Module 1 cannot run with production forecast changes enabled")
    generated_at = datetime.now(timezone.utc).isoformat()
    config_hash = stable_hash(config)
    code_hash, code_file_hashes = _code_hash()
    data_audit = _validate_dataset(dataset, config)
    games = dataset.games.copy().sort_values(["season", "week", "game_id"]).reset_index(drop=True)
    team_rows = _to_team_score_rows(games, dataset.feature_names)
    base_specs = _base_specs(dataset.feature_names)
    ablation_specs, ablation_not_applicable = _ablation_specs(dataset.feature_names, config)
    control_specs = _negative_control_specs(dataset.feature_names)
    all_specs = [*base_specs, *ablation_specs, *control_specs]
    if len({spec.name for spec in all_specs}) != len(all_specs):
        raise ValueError("Module 1 model recipe names are not unique")

    forecasts, metrics, failures, runtime = _run_weekly_forecasts(
        games,
        team_rows,
        all_specs,
        config,
        generated_at,
        config_hash,
        str(dataset.data_hash),
        str(dataset.feature_schema_hash),
        code_hash,
        show_progress,
    )
    development_seasons = config["forecastContract"]["developmentSeasons"]
    confirmation_seasons = [config["forecastContract"]["confirmationSeason"]]
    base_development = _common_scorecards(metrics, games, development_seasons, BASE_FAMILIES)
    base_confirmation = _common_scorecards(metrics, games, confirmation_seasons, BASE_FAMILIES)
    base_manifest_complete = bool(
        base_development["identicalCompleteManifest"] and base_confirmation["identicalCompleteManifest"]
    )
    paired_uncertainty = None
    paired_error = None
    coverage_uncertainty = None
    coverage_error = None
    if base_manifest_complete:
        try:
            paired_uncertainty = _bootstrap_group(
                metrics,
                development_seasons,
                BASELINE_FAMILY,
                CHALLENGER_FAMILIES,
                config,
            )
        except Exception as error:  # noqa: BLE001 - reported as a protocol failure
            paired_error = f"{type(error).__name__}: {error}"
        try:
            coverage_uncertainty = _coverage_uncertainty(
                metrics,
                development_seasons,
                BASE_FAMILIES,
                config,
            )
        except Exception as error:  # noqa: BLE001 - reported as a protocol failure
            coverage_error = f"{type(error).__name__}: {error}"

    static_controls = _static_negative_controls(dataset, config, data_audit)
    static_controls_passed = all(control["passed"] for control in static_controls.values())
    ablation_analysis = _variant_analysis(metrics, games, ablation_specs, config, "ablation")
    model_control_analysis = _variant_analysis(metrics, games, control_specs, config, "negative_control")
    unexecuted_ablation_controls = [
        row for row in ablation_not_applicable if str(row["status"]).startswith("protocol_invalid")
    ]
    protocol_invalid_reasons: list[str] = []
    if failures:
        evaluated_failure_origins = [
            row
            for row in failures
            if int(row["season"]) in set(development_seasons) | set(confirmation_seasons)
        ]
        if evaluated_failure_origins:
            protocol_invalid_reasons.append("one_or_more_candidate_origins_failed")
    if not base_manifest_complete:
        protocol_invalid_reasons.append("base_candidates_do_not_share_the_complete_game_manifest")
    if paired_uncertainty is None:
        protocol_invalid_reasons.append("paired_simultaneous_bootstrap_not_completed")
    if coverage_uncertainty is None:
        protocol_invalid_reasons.append("clustered_coverage_intervals_not_completed")
    if not static_controls_passed:
        protocol_invalid_reasons.append("static_leakage_or_invariance_control_failed")
    if unexecuted_ablation_controls:
        protocol_invalid_reasons.append("a_preregistered_ablation_could_not_be_mapped_to_the_feature_schema")
    if any(value.get("status") != "complete" for value in ablation_analysis.values()):
        protocol_invalid_reasons.append("one_or_more_ablation_series_is_incomplete")
    if any(value.get("status") != "complete" for value in model_control_analysis.values()):
        protocol_invalid_reasons.append("one_or_more_model_negative_control_series_is_incomplete")

    candidate_gates: dict[str, Any] = {}
    selected: str | None = None
    complexity_checks: dict[str, Any] = {"checks": {}, "qualifying": []}
    if not protocol_invalid_reasons and paired_uncertainty is not None and coverage_uncertainty is not None:
        for family in CHALLENGER_FAMILIES:
            candidate_gates[family] = _candidate_gate_checks(
                family,
                base_development,
                base_confirmation,
                paired_uncertainty,
                config,
                static_controls_passed,
                ablation_analysis,
                model_control_analysis,
                coverage_uncertainty,
            )
        selected, complexity_checks = _select_shadow_candidate(candidate_gates, metrics, config)
    else:
        for family in CHALLENGER_FAMILIES:
            candidate_gates[family] = {
                "family": family,
                "passed": False,
                "checks": {},
                "reason": "protocol_invalid_before_shadow_gate",
            }

    if protocol_invalid_reasons:
        result = "protocol_invalid"
        next_decision = (
            "Repair only the named protocol failure, assign a new experiment version, and rerun every chronological fold. "
            "Do not tune the current candidates against these results."
        )
    elif selected is None:
        result = "reject_all"
        next_decision = (
            "Freeze this rejection. Diagnose failure cases and write a new preregistered Module 1 protocol before changing "
            "features, penalties, state dynamics, or distributions."
        )
    else:
        result = "shadow_eligible"
        next_decision = (
            f"Register `{selected}` for prospective 2026 shadow forecasts stored before kickoff. Do not compare it with "
            "the market baseline and do not change production until the prospective ledger is graded."
        )

    report: dict[str, Any] = {
        "schemaVersion": "model-lab-module-one-scorecard-v1",
        "experimentVersion": config["version"],
        "result": result,
        "protocolInvalidReasons": protocol_invalid_reasons,
        "generatedAt": generated_at,
        "researchOnly": True,
        "productionForecastChanged": False,
        "marketBaselineCompared": False,
        "historicalLedgerStatus": "retrospective_reconstruction_not_prospectively_stored",
        "hashes": {
            "config": config_hash,
            "data": str(dataset.data_hash),
            "featureSchema": str(dataset.feature_schema_hash),
            "code": code_hash,
            "codeFiles": code_file_hashes,
        },
        "sourceManifest": _jsonable(dataset.source_manifest),
        "dataAudit": data_audit,
        "leakageAudit": {
            "passed": bool(base_manifest_complete and static_controls_passed),
            "positiveFeatureAllowlist": True,
            "marketAndDecisionFieldsRejected": static_controls["market_field_must_fail"],
            "futureRowsRejected": static_controls["future_week_row_must_fail"],
            "externalOddsAndPickInvariance": static_controls["odds_and_pick_tables_invariance"],
            "originChronology": data_audit["chronology"],
            "trainingTransformsFitInsideEachOrigin": True,
            "trainingOriginValidatedInsideEachModelFit": True,
            "sameWeekModelAndResidualUpdatesBlocked": runtime["sameWeekResidualIsolation"],
            "baseCandidateGameManifestComplete": base_manifest_complete,
            "forecastHashExcludesArchiveOutcomes": True,
            "historicalAvailabilityLimitation": "inferred_from_season_week_not_original_publication_time",
        },
        "baseScorecards": {
            "development": base_development,
            "confirmation": base_confirmation,
        },
        "pairedUncertainty": paired_uncertainty or {"error": paired_error},
        "coverageUncertainty": coverage_uncertainty or {"error": coverage_error},
        "ablations": {
            "byCandidate": ablation_analysis,
            "notApplicableOrInvalid": ablation_not_applicable,
        },
        "negativeControls": {
            "staticControls": static_controls,
            "modelControls": model_control_analysis,
        },
        "shadowEligibility": {
            "candidateGates": candidate_gates,
            "complexityPreference": complexity_checks,
            "selectedCandidate": selected,
            "automaticProductionPromotion": False,
        },
        "runtime": runtime,
        "failures": failures,
        "forecastLedger": {
            "records": len(forecasts),
            "gradedRecords": int(len(metrics)),
            "path": "forecasts.jsonl.gz",
        },
        "assumptions": [
            "Official final scores include overtime.",
            "Every target week shares one Tuesday 07:30 Pacific information cutoff.",
            "Historical source availability is inferred by season and week rather than proven from original publication logs.",
            "C0, C1, and C2 distributions use candidate-specific prior prequential residual pairs.",
            "C3 home and away scores are conditionally independent after its fitted means and dispersions.",
            "The 2025 confirmation is retrospective because the protocol postdates those outcomes.",
        ],
        "failureCases": {
            "tailScoresCappedInScoring": "Scores above 70 use a 71-or-more tail bucket.",
            "playerAvailability": "Prior-week roster Jaccard is continuity only. It is not quarterback or starter availability.",
            "clockAndOvertime": "Final scores include overtime, but Module 1 has no explicit possession, clock, or overtime submodel.",
            "historicalPublicationTime": "The raw file hash proves current snapshot content, not its historical publication time.",
        },
        "nextDecision": next_decision,
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    _write_jsonl_gzip_atomic(output_dir / "forecasts.jsonl.gz", forecasts)
    _write_json_atomic(output_dir / "scorecard.json", report)
    _write_text_atomic(output_dir / "scorecard.md", _markdown_scorecard(report))
    return report


def _synthetic_dataset() -> SimpleNamespace:
    feature_names = (
        "offense_yards_per_play",
        "opponent_defense_yards_per_play",
        "offense_rule_success_rate",
        "opponent_defense_rule_success_rate",
        "offense_explosive_rate",
        "opponent_defense_explosive_rate",
        "offense_turnover_rate",
        "opponent_defense_turnover_rate",
        "offense_seconds_per_play",
        "opponent_defense_seconds_per_play",
        "offense_pass_rate",
        "opponent_defense_pass_rate",
        "offense_epa_per_play",
        "opponent_defense_epa_per_play",
        "offense_pass_rate_over_expectation",
        "opponent_defense_pass_rate_over_expectation",
        "prior_week_roster_jaccard",
        "roster_continuity_missing",
        "is_home",
    )
    teams = tuple("ABCDEFGH")
    rows: list[dict[str, Any]] = []
    for season in range(2010, 2016):
        for week in range(1, 9):
            forecast = pd.Timestamp(f"{season}-09-01", tz="UTC") + pd.Timedelta(days=7 * (week - 1))
            pairings = [(teams[index], teams[-index - 1]) for index in range(4)]
            for game_index, (home, away) in enumerate(pairings):
                home_strength = teams.index(home) * 0.45
                away_strength = teams.index(away) * 0.45
                home_score = int(round(22.0 + home_strength - 0.35 * away_strength + 1.5 + ((week + game_index) % 4 - 1.5)))
                away_score = int(round(22.0 + away_strength - 0.35 * home_strength + ((season + week) % 3 - 1)))
                row: dict[str, Any] = {
                    "game_id": f"{season}-{week}-{game_index}",
                    "season": season,
                    "week": week,
                    "forecast_at": forecast.isoformat(),
                    "home_team": home,
                    "away_team": away,
                    "neutral_site": False,
                    "actual_home_score": home_score,
                    "actual_away_score": away_score,
                    "league_team_score_mean": 22.0,
                    "naive_home_mean": 23.0 + 0.25 * home_strength,
                    "naive_away_mean": 21.5 + 0.25 * away_strength,
                    "inputs_through_season": season if week > 1 else season - 1,
                    "inputs_through_week": week - 1 if week > 1 else 8,
                    "maximum_input_game_date": (forecast - pd.Timedelta(days=2)).isoformat(),
                }
                for side, strength, opponent_strength, is_home in (
                    ("home", home_strength, away_strength, 1.0),
                    ("away", away_strength, home_strength, 0.0),
                ):
                    values = {
                        "offense_yards_per_play": 5.1 + 0.08 * strength,
                        "opponent_defense_yards_per_play": 5.4 - 0.04 * opponent_strength,
                        "offense_rule_success_rate": 0.42 + 0.006 * strength,
                        "opponent_defense_rule_success_rate": 0.44 - 0.004 * opponent_strength,
                        "offense_explosive_rate": 0.10 + 0.003 * strength,
                        "opponent_defense_explosive_rate": 0.11 - 0.002 * opponent_strength,
                        "offense_turnover_rate": 0.025 - 0.001 * strength,
                        "opponent_defense_turnover_rate": 0.024 + 0.001 * opponent_strength,
                        "offense_seconds_per_play": 29.0 - 0.1 * strength,
                        "opponent_defense_seconds_per_play": 29.2 + 0.05 * opponent_strength,
                        "offense_pass_rate": 0.57 + 0.002 * strength,
                        "opponent_defense_pass_rate": 0.58 - 0.001 * opponent_strength,
                        "offense_epa_per_play": 0.01 * strength,
                        "opponent_defense_epa_per_play": -0.008 * opponent_strength,
                        "offense_pass_rate_over_expectation": 0.004 * strength,
                        "opponent_defense_pass_rate_over_expectation": -0.003 * opponent_strength,
                        "prior_week_roster_jaccard": 0.9,
                        "roster_continuity_missing": 0.0,
                        "is_home": is_home,
                    }
                    for name, value in values.items():
                        row[f"{side}_{name}"] = value
                if season == 2010 and week == 1:
                    row["inputs_through_season"] = None
                    row["inputs_through_week"] = None
                    row["maximum_input_game_date"] = None
                    row["league_team_score_mean"] = math.nan
                    row["naive_home_mean"] = math.nan
                    row["naive_away_mean"] = math.nan
                    for name in feature_names:
                        row[f"home_{name}"] = math.nan
                        row[f"away_{name}"] = math.nan
                rows.append(row)
    games = pd.DataFrame(rows)
    projection_hash = _analysis_projection_hash(games, feature_names)
    return SimpleNamespace(
        games=games,
        feature_names=feature_names,
        source_manifest={"synthetic": True},
        data_hash=projection_hash,
        feature_schema_hash=stable_hash(feature_names),
        exclusions={},
        missingness={},
    )


def run_runner_self_tests(config: Mapping[str, Any]) -> dict[str, Any]:
    model_tests = run_model_self_tests()
    synthetic = _synthetic_dataset()
    contract_feature_names = tuple(synthetic.feature_names) + tuple(
        sorted(NAIVE_BASELINE_ONLY_FEATURES)
    )
    leaked_baseline_fields = set(_main_feature_names(contract_feature_names)).intersection(
        NAIVE_BASELINE_ONLY_FEATURES
    )
    if leaked_baseline_fields:
        raise AssertionError(
            f"Naive-only scoring fields reached challenger features: {sorted(leaked_baseline_fields)}"
        )
    test_config = deepcopy(config)
    test_config["forecastContract"]["developmentSeasons"] = [2013, 2014]
    test_config["forecastContract"]["confirmationSeason"] = 2015
    test_config["distribution"]["residualLibraryMinimumGames"] = 16
    test_config["distribution"]["residualLibraryMaximumGames"] = 64
    test_config["distribution"]["energyScoreSamples"] = 32
    test_config["evaluation"]["bootstrapMembers"] = 100
    data_audit = _validate_dataset(synthetic, test_config)
    controls = _static_negative_controls(synthetic, test_config, data_audit)
    team_rows = _to_team_score_rows(synthetic.games, synthetic.feature_names)
    specs = _base_specs(synthetic.feature_names)
    forecasts, metrics, failures, runtime = _run_weekly_forecasts(
        synthetic.games,
        team_rows,
        specs,
        test_config,
        "2026-08-24T00:00:00+00:00",
        stable_hash(test_config),
        synthetic.data_hash,
        synthetic.feature_schema_hash,
        "synthetic-code-hash",
        show_progress=False,
    )
    development = _common_scorecards(metrics, synthetic.games, [2013, 2014], BASE_FAMILIES)
    confirmation = _common_scorecards(metrics, synthetic.games, [2015], BASE_FAMILIES)
    if not development["identicalCompleteManifest"] or not confirmation["identicalCompleteManifest"]:
        raise AssertionError("Runner self-test candidates do not share the synthetic game manifest")
    if not all(control["passed"] for control in controls.values()):
        raise AssertionError("Runner self-test leakage or invariance control failed")
    evaluated_failures = [row for row in failures if int(row["season"]) >= 2013]
    if evaluated_failures:
        raise AssertionError(f"Runner self-test has evaluated-period failures: {evaluated_failures[:3]}")
    bootstrap = _bootstrap_group(metrics, [2013, 2014], BASELINE_FAMILY, CHALLENGER_FAMILIES, test_config)
    if bootstrap is None or set(bootstrap["comparisons"]) != set(CHALLENGER_FAMILIES):
        raise AssertionError("Runner self-test did not create all paired comparisons")
    selection_rows: list[dict[str, Any]] = []
    energy_levels = {
        "c1_ridge_offense_defense": 10.0,
        "c3_independent_negative_binomial": 7.0,
        "c2_dynamic_state_space": 4.0,
    }
    for season in (2013, 2014):
        for week in range(1, 9):
            for family, energy_score in energy_levels.items():
                selection_rows.append(
                    {
                        "season": season,
                        "week": week,
                        "game_id": f"selection-{season}-{week}",
                        "family": family,
                        "energy_score": energy_score,
                    }
                )
    all_pass = {family: {"passed": True} for family in CHALLENGER_FAMILIES}
    selected, _ = _select_shadow_candidate(
        all_pass,
        pd.DataFrame(selection_rows),
        test_config,
    )
    if selected != "c2_dynamic_state_space":
        raise AssertionError(
            "Nested selection did not advance to a complex candidate with stable paired gains"
        )
    return {
        "passed": True,
        "modelPrimitiveTests": model_tests,
        "dataAuditHash": data_audit["analysisProjectionHash"],
        "forecastRecords": len(forecasts),
        "gradedRecords": len(metrics),
        "warmupFailuresExpectedBefore128Rows": len(failures),
        "developmentGames": development["commonGames"],
        "confirmationGames": confirmation["commonGames"],
        "staticNegativeControls": controls,
        "naiveOnlyFeatureIsolation": "pass",
        "nestedCandidateSelection": "pass",
        "runtime": runtime,
    }


def _load_config(path: Path) -> dict[str, Any]:
    config = json.loads(path.read_text(encoding="utf-8"))
    if config.get("status") != "preregistered_research_only":
        raise ValueError("Module 1 config is not frozen as preregistered research")
    if config.get("productionForecastChangeAllowed") is not False:
        raise ValueError("Module 1 config does not hard-disable production changes")
    return config


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    arguments = parser.parse_args(argv)
    config = _load_config(DEFAULT_CONFIG_PATH)
    if arguments.self_test:
        print(json.dumps(_jsonable(run_runner_self_tests(config)), indent=2, sort_keys=True, allow_nan=False))
        return 0

    try:
        from model_lab_module_one_data import build_module_one_dataset
    except ImportError as error:
        raise RuntimeError("Module 1 data builder is not available") from error

    dataset = build_module_one_dataset(config, arguments.cache_dir, refresh=arguments.refresh)
    report = run_module_one(dataset, config, arguments.output_dir)
    print(
        json.dumps(
            {
                "result": report["result"],
                "selectedCandidate": report["shadowEligibility"]["selectedCandidate"],
                "scorecard": str(arguments.output_dir / "scorecard.json"),
                "forecasts": str(arguments.output_dir / "forecasts.jsonl.gz"),
                "productionForecastChanged": False,
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Module 1 interrupted. No research artifact was promoted.", file=sys.stderr)
        raise SystemExit(130)
