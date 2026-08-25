#!/usr/bin/env python3
"""Run the frozen, market-free Model Laboratory Module 2 replay.

This isolated runner reconstructs one Tuesday information set per NFL week,
stores hashed retrospective forecasts, grades the frozen candidates and
falsification variants on one common manifest, and applies only the frozen
shadow-eligibility gate. It has no interface, deployment, sportsbook,
confidence, or production imports.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass, is_dataclass
from datetime import datetime, timezone
import gzip
from hashlib import sha256
import io
import json
import math
import os
from pathlib import Path
import platform
import sys
import time
from typing import Any, Iterable, Mapping, Sequence

import numpy as np
import pandas as pd

from model_lab_module_two_models import (
    count_p2_training_eligible_rows,
    evaluate_joint_pmf,
    factorize_joint_pmf,
    fit_candidate,
    joint_residual_pmf,
    predict_candidate,
    run_model_self_tests,
    season_weights,
    stable_hash,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG_PATH = REPOSITORY_ROOT / "config" / "model-lab-module-two.config.json"
DEFAULT_CACHE_DIR = REPOSITORY_ROOT / ".model-lab-cache" / "module-one"
DEFAULT_OUTPUT_DIR = REPOSITORY_ROOT / "artifacts" / "model-lab" / "module-two-v8"

FREEZE_MANIFEST_NAME = "pre-replay-manifest.json"
SCORED_ARTIFACT_NAMES = frozenset(
    {
        "retrospective-forecasts.jsonl.gz",
        "metric-rows.jsonl.gz",
        "rolling-origin-scorecard.json",
        "paired-uncertainty.json",
        "audit.json",
        "result.json",
        "RESULT.md",
        "artifact-hashes.json",
        "scientific-hashes.json",
    }
)

P0 = "p0_league_season_naive"
P1 = "p1_partially_pooled_rates"
P2 = "p2_regularized_joint_count"
BASE_FAMILIES = (P0, P1, P2)


@dataclass(frozen=True)
class ModelSpec:
    name: str
    family: str
    analysis_kind: str
    feature_names: tuple[str, ...]
    variant: str | None = None
    no_decay: bool = False
    include_home: bool = True
    add_noise: bool = False
    shuffle_profiles: bool = False


@dataclass(frozen=True)
class BootstrapIndexLedger:
    period: str
    block_length: int
    seed: int
    seed_material: str
    manifest: pd.DataFrame
    member_indexes: tuple[np.ndarray, ...]
    manifest_hash: str
    ledger_hash: str


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
    if isinstance(value, float) and not math.isfinite(value):
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
    with temporary.open("wb") as raw:
        with gzip.GzipFile(
            filename="",
            mode="wb",
            fileobj=raw,
            compresslevel=9,
            mtime=0,
        ) as compressed:
            with io.TextIOWrapper(compressed, encoding="utf-8", newline="\n") as handle:
                for row in rows:
                    handle.write(
                        json.dumps(
                            _jsonable(row),
                            sort_keys=True,
                            allow_nan=False,
                            separators=(",", ":"),
                        )
                    )
                    handle.write("\n")
    os.replace(temporary, path)


def _file_hash(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def _code_hashes() -> tuple[str, dict[str, str]]:
    paths = (
        Path(__file__).resolve(),
        Path(__file__).with_name("model_lab_module_two_data.py"),
        Path(__file__).with_name("model_lab_module_two_models.py"),
    )
    hashes = {path.name: _file_hash(path) for path in paths}
    return stable_hash(hashes), hashes


def _stable_seed(*parts: Any) -> int:
    return int(stable_hash(list(parts))[:16], 16) % (2**63 - 1)


def _update_length_prefixed(digest: Any, payload: bytes) -> None:
    digest.update(len(payload).to_bytes(8, "big", signed=False))
    digest.update(payload)


def _update_exact_hash(digest: Any, value: Any) -> None:
    """Hash values without decimal rendering or pointer-valued object bytes."""

    if value is None or value is pd.NA:
        digest.update(b"none")
        return
    if isinstance(value, (bool, np.bool_)):
        digest.update(b"bool:1" if bool(value) else b"bool:0")
        return
    if isinstance(value, (int, np.integer)):
        digest.update(b"int")
        _update_length_prefixed(digest, str(int(value)).encode("ascii"))
        return
    if isinstance(value, (float, np.floating)):
        digest.update(b"float64")
        digest.update(np.asarray([float(value)], dtype="<f8").tobytes(order="C"))
        return
    if isinstance(value, str):
        digest.update(b"str")
        _update_length_prefixed(digest, value.encode("utf-8"))
        return
    if isinstance(value, (bytes, bytearray)):
        digest.update(b"bytes")
        _update_length_prefixed(digest, bytes(value))
        return
    if isinstance(value, Path):
        _update_exact_hash(digest, str(value))
        return
    if isinstance(value, (pd.Timestamp, datetime, np.datetime64)):
        digest.update(b"datetime")
        _update_length_prefixed(digest, str(pd.Timestamp(value)).encode("utf-8"))
        return
    if isinstance(value, Mapping):
        digest.update(b"mapping")
        keys = sorted(value, key=lambda item: str(item))
        _update_exact_hash(digest, len(keys))
        for key in keys:
            _update_exact_hash(digest, str(key))
            _update_exact_hash(digest, value[key])
        return
    if isinstance(value, (pd.Series, pd.Index)):
        digest.update(b"series")
        _update_exact_hash(digest, str(value.dtype))
        _update_exact_hash(digest, value.to_numpy())
        return
    if isinstance(value, np.ndarray):
        array = np.asarray(value)
        digest.update(b"ndarray")
        if array.dtype.kind in "iufcMm":
            array = array.astype(array.dtype.newbyteorder("<"), copy=False)
        _update_exact_hash(digest, array.dtype.str)
        _update_exact_hash(digest, tuple(int(item) for item in array.shape))
        if array.dtype.hasobject:
            for item in array.ravel(order="C"):
                _update_exact_hash(digest, item)
        else:
            contiguous = np.ascontiguousarray(array)
            _update_length_prefixed(digest, contiguous.tobytes(order="C"))
        return
    if isinstance(value, (list, tuple)):
        digest.update(b"tuple" if isinstance(value, tuple) else b"list")
        _update_exact_hash(digest, len(value))
        for item in value:
            _update_exact_hash(digest, item)
        return
    if is_dataclass(value):
        _update_exact_hash(digest, asdict(value))
        return
    raise TypeError(f"Unsupported exact-hash value: {type(value).__name__}")


def _exact_hash(value: Any) -> str:
    digest = sha256()
    _update_exact_hash(digest, value)
    return digest.hexdigest()


def _scientific_arrays_hash(
    arrays: Sequence[np.ndarray], *, integer: bool = False
) -> str:
    """Hash exact little-endian scientific arrays with dtype and shape."""

    digest = sha256()
    for value in arrays:
        dtype = np.dtype("<i8" if integer else "<f8")
        array = np.ascontiguousarray(np.asarray(value, dtype=dtype))
        _update_length_prefixed(digest, array.dtype.str.encode("ascii"))
        shape = np.asarray(array.shape, dtype="<i8")
        _update_length_prefixed(digest, shape.tobytes(order="C"))
        _update_length_prefixed(digest, array.tobytes(order="C"))
    return digest.hexdigest()


def _exact_frame_hash(frame: pd.DataFrame, columns: Sequence[str]) -> str:
    missing = [name for name in columns if name not in frame.columns]
    if missing:
        raise ValueError(f"Exact frame hash lacks model inputs: {missing}")
    ordered = frame.loc[:, list(columns)].copy()
    sort_columns = [name for name in ("season", "week", "game_id") if name in ordered.columns]
    if sort_columns:
        ordered = ordered.sort_values(sort_columns, kind="mergesort").reset_index(drop=True)
    payload = {
        "columns": tuple(str(name) for name in columns),
        "rows": int(len(ordered)),
        "dtypes": tuple(str(ordered[name].dtype) for name in columns),
        "values": tuple(ordered[name].to_numpy() for name in columns),
    }
    return _exact_hash(payload)


def _negative_control_seed(config: Mapping[str, Any]) -> int:
    seed = int(config["evaluation"]["bootstrapSeed"])
    if seed != 20260824:
        raise ValueError("Module 2 frozen negative-control seed changed")
    construction = config["negativeControlConstruction"]
    expected_serialization = (
        "canonical_UTF8_JSON_array_with_no_whitespace_using_python_json_sort_keys_true_"
        "and_separators_comma_colon;take_first_16_SHA256_hex_digits_as_integer_modulo_"
        "2^63_minus_1;initialize_numpy_default_rng_PCG64"
    )
    if construction.get("seedSerialization") != expected_serialization:
        raise ValueError("Module 2 negative-control seed serialization changed")
    if construction.get("noiseSeedTuple") != [
        20260824,
        "game_id_string",
        "side_home_or_away_string",
    ]:
        raise ValueError("Module 2 noise seed tuple changed")
    if construction.get("shuffleSeedTuple") != [
        20260824,
        "season_integer",
        "week_integer",
        "frame_role_training_or_target_string",
    ]:
        raise ValueError("Module 2 shuffle seed tuple changed")
    return seed


def _deterministic_noise(
    game_id: str, side: str, config: Mapping[str, Any]
) -> float:
    rng = np.random.default_rng(
        _stable_seed(_negative_control_seed(config), game_id, side)
    )
    return float(rng.standard_normal())


def _load_config(path: Path) -> dict[str, Any]:
    config = json.loads(path.read_text(encoding="utf-8"))
    if config.get("version") != "module2.2026-08-25.8":
        raise ValueError("Module 2 runner requires frozen protocol v8")
    if not config.get("frozenBeforeCandidateReplay"):
        raise ValueError("Module 2 config is not frozen before replay")
    if any(
        config.get(field)
        for field in (
            "moduleOneArtifactsMutable",
            "productionForecastChangeAllowed",
            "marketComparisonAllowed",
            "confidenceScoreAllowed",
            "nextModuleAllowed",
        )
    ):
        raise ValueError("Module 2 isolation boundary is not frozen")
    if config.get("moduleOneResult") != "reject_all":
        raise ValueError("Module 1 reject_all result changed")
    return config


def _assemble_games(dataset: Any, config: Mapping[str, Any]) -> pd.DataFrame:
    """Join targets only inside the runner while retaining 2010 prehistory."""

    schedule_columns = [
        "game_id",
        "season",
        "week",
        "gameday",
        "home_team",
        "away_team",
        "is_neutral_site",
    ]
    missing_schedule = [name for name in schedule_columns if name not in dataset.schedule.columns]
    if missing_schedule:
        raise ValueError(f"Module 2 schedule lacks runner fields: {missing_schedule}")
    base = dataset.schedule.loc[:, schedule_columns].copy()
    targets = dataset.targets.copy()
    if base["game_id"].duplicated().any() or targets["game_id"].duplicated().any():
        raise ValueError("Module 2 schedule or target ledger has duplicate games")
    joined = base.merge(
        targets,
        on=["game_id", "season", "week", "home_team", "away_team"],
        how="left",
        validate="one_to_one",
    )
    joined = joined.merge(
        dataset.games,
        on=["game_id", "season", "week", "home_team", "away_team", "is_neutral_site"],
        how="left",
        validate="one_to_one",
        suffixes=("", "_origin"),
    )
    no_decay = dataset.games_no_time_decay.copy()
    no_decay_columns = [
        column
        for column in no_decay.columns
        if column not in {"season", "week", "home_team", "away_team", "is_neutral_site"}
    ]
    no_decay = no_decay.loc[:, ["game_id", *[c for c in no_decay_columns if c != "game_id"]]]
    no_decay = no_decay.rename(
        columns={column: f"no_decay__{column}" for column in no_decay_columns if column != "game_id"}
    )
    joined = joined.merge(no_decay, on="game_id", how="left", validate="one_to_one")
    target_home, target_away = config["target"]["primary"]
    joined["actual_home_regulation_series"] = joined[target_home]
    joined["actual_away_regulation_series"] = joined[target_away]
    joined["actual_home_overtime_series"] = joined["home_overtime_offensive_series"]
    joined["actual_away_overtime_series"] = joined["away_overtime_offensive_series"]
    joined["neutral_site"] = joined["is_neutral_site"].astype(float)
    joined["game_date"] = pd.to_datetime(joined["gameday"], errors="raise").dt.normalize()
    return joined.sort_values(["season", "week", "game_id"], kind="mergesort").reset_index(drop=True)


def _validate_dataset(dataset: Any, games: pd.DataFrame, config: Mapping[str, Any]) -> dict[str, Any]:
    target_home, target_away = config["target"]["primary"]
    required = {
        "game_id", "season", "week", "gameday", "home_team", "away_team",
        "is_neutral_site", target_home, target_away, "overtime_occurred",
        "home_overtime_offensive_series", "away_overtime_offensive_series",
    }
    missing = sorted(required.difference(games.columns))
    if missing:
        raise ValueError(f"Module 2 assembled dataset lacks fields: {missing}")
    if games["game_id"].duplicated().any():
        raise ValueError("Module 2 assembled dataset has duplicate games")
    targets = games.loc[:, [target_home, target_away]].apply(pd.to_numeric, errors="coerce")
    if targets.isna().any().any() or not np.equal(targets, np.floor(targets)).all().all():
        raise ValueError("Module 2 targets must be finite integers")
    bounds = config["target"]["integrityBounds"]
    hard_low = int(bounds["hardMinimumObservedPerTeam"])
    hard_high = int(bounds["hardMaximumObservedPerTeam"])
    if (targets < hard_low).any().any() or (targets > hard_high).any().any():
        raise ValueError("Module 2 target falls outside the hard integrity range")
    audit_low = int(bounds["historicalAuditExpectedMinimum"])
    audit_high = int(bounds["historicalAuditExpectedMaximum"])
    audit_warning = games.loc[
        (targets < audit_low).any(axis=1) | (targets > audit_high).any(axis=1),
        ["game_id", target_home, target_away],
    ].to_dict("records")

    development = set(config["forecastContract"]["developmentSeasons"])
    confirmation = int(config["forecastContract"]["retrospectiveConfirmationSeason"])
    evaluated = games[games["season"].isin(development | {confirmation})]
    origin_required = {
        "forecast_at", "inputs_through_season", "inputs_through_week",
        "maximum_input_game_date", "p0_home_mean", "p0_away_mean",
        "p1_home_mean", "p1_away_mean",
    }
    for name in dataset.team_profile_feature_names + dataset.missing_indicator_names:
        origin_required.update((f"home_{name}", f"away_{name}"))
    missing_origin = sorted(origin_required.difference(games.columns))
    if missing_origin:
        raise ValueError(f"Module 2 origin frame lacks fields: {missing_origin}")
    if evaluated.loc[:, sorted(origin_required)].isna().any().any():
        raise ValueError("An evaluated origin has a missing feature or chronology field")
    numeric_features = [
        f"{side}_{name}"
        for side in ("home", "away")
        for name in dataset.team_profile_feature_names + dataset.missing_indicator_names
    ] + ["is_neutral_site", "p0_home_mean", "p0_away_mean", "p1_home_mean", "p1_away_mean"]
    if not np.isfinite(evaluated.loc[:, numeric_features].to_numpy(float)).all():
        raise ValueError("An evaluated origin has a nonfinite model input")

    chronology_failures: list[str] = []
    origin_rows = games.loc[games["forecast_at"].notna()]
    for (season, week), rows in origin_rows.groupby(["season", "week"], sort=True):
        if rows["forecast_at"].nunique(dropna=False) != 1:
            chronology_failures.append(f"{season}-{week}:multiple_origins")
        for row in rows.itertuples(index=False):
            source_week = (int(row.inputs_through_season), int(row.inputs_through_week))
            if source_week >= (int(season), int(week)):
                chronology_failures.append(f"{row.game_id}:same_or_future_week")
            source_date = pd.Timestamp(row.maximum_input_game_date)
            forecast_time = pd.Timestamp(row.forecast_at)
            if forecast_time.tzinfo is not None:
                forecast_time = forecast_time.tz_localize(None)
            if source_date >= forecast_time.normalize():
                chronology_failures.append(f"{row.game_id}:source_date_at_or_after_origin")
    if chronology_failures:
        raise ValueError(f"Module 2 chronology failed: {chronology_failures[:12]}")
    prehistory = games.loc[games["season"].eq(2010)]
    if prehistory.empty or prehistory["forecast_at"].notna().any():
        raise ValueError("Module 2 2010 prehistory treatment changed")
    evaluated_ids = set(evaluated["game_id"].astype(str))
    expected_ids = set(
        dataset.targets.loc[
            dataset.targets["season"].isin(development | {confirmation}), "game_id"
        ].astype(str)
    )
    if evaluated_ids != expected_ids:
        raise ValueError("Module 2 evaluated target manifest is incomplete")
    if not bool(dataset.audits.get("source_missingness_all_passed")):
        raise ValueError("Module 2 source missingness ledger did not pass")
    source_missingness = dataset.audits.get("source_missingness", [])
    required_missingness_fields = set(
        config["dataBoundary"]["missingData"][
            "sourceMissingnessLedgerRequiredFields"
        ]
    )
    if not source_missingness or any(
        set(row) != required_missingness_fields for row in source_missingness
    ):
        raise ValueError("Module 2 source missingness ledger schema is incomplete")
    return {
        "passed": True,
        "games": int(len(games)),
        "seasons": [int(games["season"].min()), int(games["season"].max())],
        "evaluatedGames": int(len(evaluated_ids)),
        "prehistoryGames": int(len(prehistory)),
        "targetRange": [int(targets.min().min()), int(targets.max().max())],
        "historicalAuditWarnings": audit_warning,
        "overtimeGames": int(pd.to_numeric(games["overtime_occurred"], errors="coerce").fillna(0).sum()),
        "sameWeekSharedOrigin": True,
        "historicalAvailability": config["forecastContract"]["historicalAvailability"],
        "sourceMissingnessLedgerPassed": True,
        "sourceMissingnessLedgerRows": int(len(source_missingness)),
        "sourceMissingnessLedgerSha256": str(
            dataset.audits["source_missingness_ledger_sha256"]
        ),
    }


def _model_specs(dataset: Any, config: Mapping[str, Any]) -> list[ModelSpec]:
    base_features = tuple(dataset.team_profile_feature_names) + tuple(dataset.game_feature_names)
    groups = {
        str(group): tuple(str(value) for value in values)
        for group, values in config["features"]["groups"].items()
    }
    specs = [
        ModelSpec(P0, P0, "base", ()),
        ModelSpec(P1, P1, "base", ()),
        ModelSpec(P2, P2, "base", base_features),
    ]
    for variant in config["ablations"][P1]:
        specs.append(
            ModelSpec(
                f"ablation::{P1}::{variant}", P1, "ablation", (),
                variant=str(variant), no_decay=variant == "no_time_decay",
                include_home=variant != "no_home_context",
            )
        )
    for variant in config["ablations"][P2]:
        selected = base_features
        if variant == "no_possession_rate":
            selected = tuple(name for name in selected if name not in groups["possession_rate"])
        elif variant == "no_home_context":
            selected = tuple(name for name in selected if name not in groups["home_context"])
        elif variant != "no_time_decay":
            group = variant.removeprefix("no_")
            removed = set(groups[group])
            selected = tuple(name for name in selected if name not in removed)
        specs.append(
            ModelSpec(
                f"ablation::{P2}::{variant}", P2, "ablation", selected,
                variant=str(variant), no_decay=variant == "no_time_decay",
            )
        )
    specs.extend(
        (
            ModelSpec(
                f"negative_control::{P2}::deterministic_noise", P2,
                "negative_control", (*base_features, "deterministic_noise"),
                variant="deterministic_noise", add_noise=True,
            ),
            ModelSpec(
                f"negative_control::{P2}::shuffle_team_identity", P2,
                "negative_control", base_features,
                variant="shuffle_team_identity", shuffle_profiles=True,
            ),
        )
    )
    expected_count = 3 + len(config["ablations"][P1]) + len(config["ablations"][P2]) + 2
    if len(specs) != expected_count or len({spec.name for spec in specs}) != len(specs):
        raise ValueError("Module 2 spec family is incomplete or duplicated")
    return specs


def _swap_no_decay(frame: pd.DataFrame, dataset: Any) -> pd.DataFrame:
    output = frame.copy()
    fields = [
        "p0_home_mean", "p0_away_mean", "p1_home_mean", "p1_away_mean",
        *[
            f"{side}_{name}"
            for side in ("home", "away")
            for name in dataset.team_profile_feature_names + dataset.missing_indicator_names
        ],
    ]
    for field in fields:
        replacement = f"no_decay__{field}"
        if replacement not in output.columns:
            raise ValueError(f"No-decay origin frame lacks {replacement}")
        output[field] = output[replacement]
    return output


def _prepare_spec_frames(
    training: pd.DataFrame,
    target: pd.DataFrame,
    spec: ModelSpec,
    dataset: Any,
    config: Mapping[str, Any],
) -> tuple[pd.DataFrame, pd.DataFrame]:
    train = _swap_no_decay(training, dataset) if spec.no_decay else training.copy()
    predict = _swap_no_decay(target, dataset) if spec.no_decay else target.copy()
    if spec.add_noise:
        for frame in (train, predict):
            frame["home_deterministic_noise"] = [
                _deterministic_noise(str(game_id), "home", config)
                for game_id in frame["game_id"]
            ]
            frame["away_deterministic_noise"] = [
                _deterministic_noise(str(game_id), "away", config)
                for game_id in frame["game_id"]
            ]
    if spec.shuffle_profiles:
        profile_columns = [
            f"{side}_{name}"
            for side in ("home", "away")
            for name in dataset.team_profile_feature_names + dataset.missing_indicator_names
        ]
        for frame, role in ((train, "training"), (predict, "target")):
            for (season, week), indexes in frame.groupby(["season", "week"], sort=True).groups.items():
                ordered = np.asarray(sorted(indexes), dtype=int)
                rng = np.random.default_rng(
                    _stable_seed(
                        _negative_control_seed(config), int(season), int(week), role
                    )
                )
                permutation = rng.permutation(ordered)
                frame.loc[ordered, profile_columns] = frame.loc[permutation, profile_columns].to_numpy()
    return train, predict


def _training_before(
    games: pd.DataFrame,
    season: int,
    week: int,
    forecast_at: Any,
) -> pd.DataFrame:
    mask = games["season"].lt(season) | (
        games["season"].eq(season) & games["week"].lt(week)
    )
    origin = pd.Timestamp(forecast_at)
    if origin.tzinfo is not None:
        origin = origin.tz_localize(None)
    dates = pd.to_datetime(games["game_date"], errors="coerce")
    if dates.isna().any():
        raise ValueError("Module 2 runner found a non-date game_date")
    mask &= dates.lt(origin.normalize())
    return games.loc[mask].copy()


def _eligible_training_row_count(
    frame: pd.DataFrame,
    spec: ModelSpec,
    config: Mapping[str, Any],
) -> int:
    if spec.family != P2:
        return int(len(frame))
    return count_p2_training_eligible_rows(
        frame,
        spec.feature_names,
        config,
        include_home=spec.include_home,
        variant=spec.variant,
    )


def _origin_hash(
    training: pd.DataFrame,
    target: pd.DataFrame,
    spec: ModelSpec,
    dataset: Any,
    config: Mapping[str, Any],
) -> str:
    """Hash every fitted input and every pregame prediction input exactly."""

    target_home, target_away = config["target"]["primary"]
    identity = (
        "game_id",
        "season",
        "week",
        "game_date",
        "home_team",
        "away_team",
        "is_neutral_site",
    )
    training_columns: list[str] = [*identity, target_home, target_away]
    prediction_columns: list[str] = list(identity)
    if spec.family == P2:
        baselines = ("p0_home_mean", "p0_away_mean", "p1_home_mean", "p1_away_mean")
        training_columns.extend(baselines)
        # Current P2 P0/P1 means are refit from training, but retaining the
        # stored target-origin values in the provenance hash catches a builder
        # disagreement before it can be hidden by an otherwise equal fit.
        prediction_columns.extend(baselines)
        for name in dataset.team_profile_feature_names:
            for side in ("home", "away"):
                training_columns.extend((f"{side}_{name}", f"{side}_{name}_missing"))
                prediction_columns.extend((f"{side}_{name}", f"{side}_{name}_missing"))
        if spec.add_noise:
            training_columns.extend(
                ("home_deterministic_noise", "away_deterministic_noise")
            )
            prediction_columns.extend(
                ("home_deterministic_noise", "away_deterministic_noise")
            )
    payload = {
        "spec": asdict(spec),
        "trainingFrameHash": _exact_frame_hash(training, tuple(training_columns)),
        "predictionFrameHash": _exact_frame_hash(target, tuple(prediction_columns)),
    }
    return _exact_hash(payload)


def _whole_week_residual_window(
    entries: Sequence[Mapping[str, Any]], cap: int
) -> list[dict[str, Any]]:
    frame = pd.DataFrame(entries)
    if frame.empty:
        return []
    selected: list[pd.DataFrame] = []
    count = 0
    for _, week_rows in reversed(list(frame.groupby(["season", "week"], sort=True))):
        if count + len(week_rows) > cap:
            break
        selected.append(week_rows)
        count += len(week_rows)
    if not selected:
        return []
    return (
        pd.concat(selected, ignore_index=True)
        .sort_values(["season", "week", "game_id"], kind="mergesort")
        .to_dict("records")
    )


def _residual_weights(
    library: pd.DataFrame, origin_season: int, config: Mapping[str, Any], no_decay: bool
) -> np.ndarray:
    return season_weights(
        library["season"].to_numpy(int),
        origin_season,
        float(config["distribution"]["residualTimeDecayHalfLifeSeasons"]),
        no_decay=no_decay,
        season_multipliers=config["features"]["observationWeightMultipliersBySeason"],
    )


def _prediction_parts(prediction: pd.DataFrame, rows: int) -> tuple[np.ndarray, np.ndarray]:
    required = {"mean_home", "mean_away", "home_bound_hit", "away_bound_hit"}
    if not required.issubset(prediction.columns) or len(prediction) != rows:
        raise ValueError("Candidate prediction frame violates the frozen API")
    means = prediction.loc[:, ["mean_home", "mean_away"]].to_numpy(float)
    hits = prediction.loc[:, ["home_bound_hit", "away_bound_hit"]].to_numpy(bool)
    if not np.isfinite(means).all():
        raise ValueError("Candidate returned a nonfinite mean")
    return means, hits


def _interval_payload(metrics: Mapping[str, Any]) -> dict[str, Any]:
    return {key.removeprefix("interval_"): value for key, value in metrics.items() if key.startswith("interval_")}


def _run_weekly_forecasts(
    games: pd.DataFrame,
    dataset: Any,
    specs: Sequence[ModelSpec],
    config: Mapping[str, Any],
    hashes: Mapping[str, str],
    show_progress: bool,
) -> tuple[list[dict[str, Any]], pd.DataFrame, list[dict[str, Any]], dict[str, Any]]:
    training_minimum = int(config["distribution"]["minimumBaseTrainingGames"])
    residual_minimum = int(config["distribution"]["minimumPrequentialResidualGames"])
    residual_cap = int(config["distribution"]["prequentialResidualWindowGames"])
    residual_ledgers: dict[str, list[dict[str, Any]]] = {spec.name: [] for spec in specs}
    forecasts: list[dict[str, Any]] = []
    metrics: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    runtime: dict[str, float] = {spec.name: 0.0 for spec in specs}
    fitted_origins: dict[str, int] = {spec.name: 0 for spec in specs}
    baseline_alignment: list[dict[str, Any]] = []
    origins = [item for item in games.groupby(["season", "week"], sort=True) if int(item[0][0]) >= 2011]

    for position, ((season_value, week_value), target) in enumerate(origins, start=1):
        season, week = int(season_value), int(week_value)
        target = target.sort_values("game_id", kind="mergesort").copy()
        forecast_at = target["forecast_at"].iloc[0]
        training_all = _training_before(
            games, season, week, forecast_at
        ).sort_values(
            ["season", "week", "game_id"], kind="mergesort"
        )
        if show_progress:
            print(
                f"Module 2 origin {position}/{len(origins)}: {season} Week {week} "
                f"({len(target)} games, {len(training_all)} prior targets)",
                flush=True,
            )
        pending: dict[str, list[dict[str, Any]]] = {spec.name: [] for spec in specs}
        for spec in specs:
            base_payload = {
                "schemaVersion": "module-two-forecast-v2",
                "experimentVersion": config["version"],
                "candidate": spec.name,
                "family": spec.family,
                "analysisKind": spec.analysis_kind,
                "variant": spec.variant,
                "season": season,
                "week": week,
                "intendedForecastAt": None if target["forecast_at"].isna().all() else str(target["forecast_at"].iloc[0]),
                "configHash": hashes["config"],
                "protocolHash": hashes["protocol"],
                "codeHash": hashes["code"],
                "sourceHash": hashes["source"],
                "dataHash": hashes["data"],
                "featureSchemaHash": hashes["feature_schema"],
            }
            try:
                train, predict = _prepare_spec_frames(
                    training_all, target, spec, dataset, config
                )
                eligible_training_rows = _eligible_training_row_count(
                    train, spec, config
                )
                if eligible_training_rows < training_minimum:
                    for game in target.itertuples(index=False):
                        payload = {
                            **base_payload,
                            "gameId": str(game.game_id),
                            "status": "training_warmup",
                            "eligibleTrainingRows": eligible_training_rows,
                        }
                        forecasts.append(
                            {**payload, "forecastHash": _exact_hash(payload), "storageStatus": "retrospective_warmup"}
                        )
                    continue
                train.attrs["origin_season"] = season
                train.attrs["origin_week"] = week
                origin_hash = _origin_hash(train, predict, spec, dataset, config)
                started = time.perf_counter()
                fitted = fit_candidate(
                    spec.family,
                    train,
                    spec.feature_names,
                    config,
                    include_home=spec.include_home,
                    no_decay=spec.no_decay,
                    variant=spec.variant,
                )
                prediction = predict_candidate(fitted, predict)
                fit_elapsed = time.perf_counter() - started
                runtime[spec.name] += fit_elapsed
                per_game_fit_runtime = fit_elapsed / max(1, len(predict))
                means, bound_hits = _prediction_parts(prediction, len(predict))
                fitted_hash_value = getattr(fitted, "fit_hash", None)
                fit_hash = str(
                    fitted_hash_value
                    if fitted_hash_value is not None
                    else _exact_hash(fitted)
                )
                fitted_origins[spec.name] += 1
                if spec.name in {P0, P1}:
                    expected_columns = (
                        ("p0_home_mean", "p0_away_mean")
                        if spec.name == P0
                        else ("p1_home_mean", "p1_away_mean")
                    )
                    expected = predict.loc[:, list(expected_columns)].to_numpy(float)
                    maximum = float(np.max(np.abs(means - expected)))
                    baseline_alignment.append(
                        {"candidate": spec.name, "season": season, "week": week, "maximumAbsoluteDifference": maximum}
                    )
                    if not np.allclose(means, expected, atol=1e-10, rtol=1e-10):
                        raise AssertionError(
                            f"{spec.name} fit disagrees with stored prequential means at {season}-{week}: {maximum}"
                        )
            except Exception as error:
                failures.append(
                    {"candidate": spec.name, "season": season, "week": week, "error": f"{type(error).__name__}: {error}"}
                )
                continue

            library_rows = _whole_week_residual_window(residual_ledgers[spec.name], residual_cap)
            library = pd.DataFrame(library_rows)
            weights = (
                _residual_weights(library, season, config, spec.no_decay)
                if not library.empty else np.empty(0, dtype=float)
            )
            residual_input_hash = _exact_hash(
                {
                    "library": (
                        _exact_frame_hash(
                            library,
                            (
                                "season",
                                "week",
                                "game_id",
                                "residual_home",
                                "residual_away",
                            ),
                        )
                        if not library.empty
                        else _exact_hash([])
                    ),
                    "weights": _scientific_arrays_hash((weights,)),
                    "candidate": spec.name,
                    "origin": (season, week),
                }
            )
            for index, game in enumerate(predict.itertuples(index=False)):
                mean_home, mean_away = float(means[index, 0]), float(means[index, 1])
                pending[spec.name].append(
                    {
                        "game_id": str(game.game_id), "season": season, "week": week,
                        "residual_home": float(game.actual_home_regulation_series) - mean_home,
                        "residual_away": float(game.actual_away_regulation_series) - mean_away,
                    }
                )
                core = {
                    **base_payload,
                    "gameId": str(game.game_id),
                    "homeTeam": str(game.home_team),
                    "awayTeam": str(game.away_team),
                    "neutralSite": bool(game.is_neutral_site),
                    "structuralHomeMean": mean_home,
                    "structuralAwayMean": mean_away,
                    "homeBoundHit": bool(bound_hits[index, 0]),
                    "awayBoundHit": bool(bound_hits[index, 1]),
                    "originHash": origin_hash,
                    "fitHash": fit_hash,
                    "prequentialResidualCount": int(len(library)),
                    "prequentialResidualFirst": None if library.empty else str(library.iloc[0]["game_id"]),
                    "prequentialResidualThrough": None if library.empty else str(library.iloc[-1]["game_id"]),
                    "prequentialResidualInputHash": residual_input_hash,
                }
                if len(library) < residual_minimum:
                    payload = {**core, "status": "distribution_warmup"}
                    forecasts.append(
                        {**payload, "forecastHash": _exact_hash(payload), "storageStatus": "retrospective_distribution_warmup"}
                    )
                    continue
                score_started = time.perf_counter()
                pmf = joint_residual_pmf(mean_home, mean_away, library, weights, config)
                scored = evaluate_joint_pmf(
                    pmf,
                    int(game.actual_home_regulation_series),
                    int(game.actual_away_regulation_series),
                    str(game.game_id),
                    config,
                )
                score_elapsed = time.perf_counter() - score_started
                runtime[spec.name] += score_elapsed
                distribution_hash = str(scored["distribution_hash"])
                payload = {
                    **core,
                    "status": "forecasted",
                    "distributionHash": distribution_hash,
                    "intervals": _interval_payload(scored),
                    "joint80SetSize": int(scored["joint_80_hds_size"]),
                    "pmfHomeMean": float(scored["predicted_home_mean"]),
                    "pmfAwayMean": float(scored["predicted_away_mean"]),
                    "predictedWithinGameCovariance": float(scored["predicted_within_game_covariance"]),
                }
                forecast_hash = _exact_hash(payload)
                forecasts.append(
                    {
                        **payload,
                        "forecastHash": forecast_hash,
                        "storageStatus": "retrospective_reconstruction",
                        "grade": {
                            "actualHomeRegulationSeries": int(game.actual_home_regulation_series),
                            "actualAwayRegulationSeries": int(game.actual_away_regulation_series),
                            "overtimeOccurred": bool(game.overtime_occurred),
                            "actualHomeOvertimeSeries": int(game.actual_home_overtime_series),
                            "actualAwayOvertimeSeries": int(game.actual_away_overtime_series),
                        },
                    }
                )
                scalar = {
                    str(key): value for key, value in scored.items()
                    if not isinstance(value, (Mapping, list, tuple, np.ndarray))
                }
                metrics.append(
                    {
                        "candidate": spec.name, "family": spec.family,
                        "analysis_kind": spec.analysis_kind, "variant": spec.variant,
                        "game_id": str(game.game_id), "season": season, "week": week,
                        "forecast_hash": forecast_hash,
                        "structural_home_mean": mean_home,
                        "structural_away_mean": mean_away,
                        "home_bound_hit": int(bound_hits[index, 0]),
                        "away_bound_hit": int(bound_hits[index, 1]),
                        "forecast_failed": 0,
                        "runtime_seconds": per_game_fit_runtime + score_elapsed,
                        **scalar,
                    }
                )
                if spec.analysis_kind == "base":
                    independent_scored = evaluate_joint_pmf(
                        factorize_joint_pmf(pmf),
                        int(game.actual_home_regulation_series),
                        int(game.actual_away_regulation_series),
                        str(game.game_id),
                        config,
                    )
                    metrics.append(
                        {
                            "candidate": f"diagnostic::factorized::{spec.name}",
                            "family": spec.family,
                            "analysis_kind": "independence_diagnostic",
                            "variant": "factorized_without_refit",
                            "game_id": str(game.game_id), "season": season, "week": week,
                            **{
                                str(key): value for key, value in independent_scored.items()
                                if not isinstance(value, (Mapping, list, tuple, np.ndarray))
                            },
                        }
                    )

        # Same-week results enter only after every spec and game was forecast.
        for spec in specs:
            residual_ledgers[spec.name].extend(pending[spec.name])

    return (
        forecasts,
        pd.DataFrame(metrics),
        failures,
        {
            "sameWeekResidualIsolation": True,
            "wholeWeekResidualBoundary": True,
            "runtimeSecondsByCandidate": runtime,
            "fittedOriginsByCandidate": fitted_origins,
            "baselineBuilderAlignment": baseline_alignment,
        },
    )


def _expected_manifest(games: pd.DataFrame, config: Mapping[str, Any]) -> set[str]:
    seasons = set(config["forecastContract"]["developmentSeasons"])
    seasons.add(int(config["forecastContract"]["retrospectiveConfirmationSeason"]))
    return set(games.loc[games["season"].isin(seasons), "game_id"].astype(str))


def _manifest_audit(
    metric_frame: pd.DataFrame, specs: Sequence[ModelSpec], expected: set[str]
) -> dict[str, Any]:
    results: dict[str, Any] = {"expectedGames": len(expected), "candidates": {}}
    passed = True
    for spec in specs:
        rows = metric_frame.loc[
            metric_frame["candidate"].eq(spec.name)
            & metric_frame["game_id"].astype(str).isin(expected)
        ]
        ids = set(rows["game_id"].astype(str))
        duplicates = int(rows.duplicated(["game_id"]).sum())
        missing = sorted(expected.difference(ids))
        extra: list[str] = []
        candidate_passed = not missing and duplicates == 0
        passed = passed and candidate_passed
        results["candidates"][spec.name] = {
            "passed": candidate_passed, "rows": int(len(rows)),
            "missingCount": len(missing), "extraCount": len(extra),
            "duplicateCount": duplicates, "missingExamples": missing[:10],
            "extraExamples": extra[:10],
        }
    results["passed"] = passed
    return results


def _comparison_frame(
    metric_frame: pd.DataFrame,
    comparisons: Mapping[str, tuple[str, str]],
    metric: str,
    seasons: set[int],
) -> tuple[pd.DataFrame, dict[str, float]]:
    names = sorted({candidate for pair in comparisons.values() for candidate in pair})
    selected = metric_frame.loc[
        metric_frame["candidate"].isin(names) & metric_frame["season"].isin(seasons),
        ["game_id", "season", "week", "candidate", metric],
    ].copy()
    if selected.duplicated(["game_id", "candidate"]).any():
        raise ValueError("Paired comparison has duplicate candidate-game rows")
    pivot = selected.pivot(index=["game_id", "season", "week"], columns="candidate", values=metric)
    if any(name not in pivot.columns for name in names) or pivot.loc[:, names].isna().any().any():
        raise ValueError("Paired comparison candidates do not share a complete manifest")
    output = pivot.reset_index().loc[:, ["game_id", "season", "week"]].copy()
    baselines: dict[str, float] = {}
    for label, (simpler, candidate) in comparisons.items():
        output[label] = pivot[simpler].to_numpy(float) - pivot[candidate].to_numpy(float)
        baselines[label] = float(pivot[simpler].mean())
    return output, baselines


def _sample_week_positions(
    weeks: Sequence[int], length: int, rng: np.random.Generator
) -> list[int]:
    ordered = list(sorted(int(value) for value in weeks))
    if not ordered:
        raise ValueError("Bootstrap season has no observed weeks")
    block = min(int(length), len(ordered))
    starts = np.arange(len(ordered) - block + 1)
    count = int(math.ceil(len(ordered) / block))
    sampled: list[int] = []
    for start_index in rng.integers(0, len(starts), size=count, endpoint=False):
        start = starts[int(start_index)]
        sampled.extend(ordered[int(start) : int(start) + block])
    return sampled[: len(ordered)]


def _bootstrap_seed(
    config: Mapping[str, Any], block_length: int, period: str
) -> tuple[int, str]:
    evaluation = config["evaluation"]
    if evaluation.get("bootstrapBitGenerator") != "numpy_Generator_PCG64":
        raise ValueError("Module 2 v7 bootstrap bit generator changed")
    base = int(evaluation["bootstrapSeed"])
    material = (
        f"module2.v7|bootstrap|base={base}|period={period}|L={int(block_length)}"
    )
    expected = (
        "seed64_is_first_8_bytes_big_endian_SHA256_UTF8_of_"
        "module2.v7_pipe_bootstrap_pipe_base=20260824_pipe_period=<period>_pipe_L=<L>"
    )
    if evaluation.get("bootstrapSeedDerivation") != expected:
        raise ValueError("Module 2 v7 bootstrap seed derivation changed")
    return int.from_bytes(sha256(material.encode("utf-8")).digest()[:8], "big"), material


def _build_bootstrap_index_ledger(
    metric_frame: pd.DataFrame,
    config: Mapping[str, Any],
    block_length: int,
    period: str = "development",
) -> BootstrapIndexLedger:
    """Create one frozen paired season/week sample ledger for a block length."""

    if config["evaluation"].get("bootstrapCanonicalManifestOrder") != [
        "season",
        "week",
        "game_id",
    ]:
        raise ValueError("Module 2 bootstrap manifest order changed")

    if period == "development":
        seasons = tuple(
            sorted(
                int(value)
                for value in config["forecastContract"]["developmentSeasons"]
            )
        )
    elif period == "confirmation_2025":
        seasons = (
            int(config["forecastContract"]["retrospectiveConfirmationSeason"]),
        )
    else:
        raise ValueError(f"Unknown Module 2 bootstrap-ledger period: {period}")
    period_contract = config["evaluation"]["bootstrapLedgerPeriods"].get(period)
    if not isinstance(period_contract, Mapping):
        raise ValueError(f"Module 2 bootstrap-ledger period is not frozen: {period}")
    if int(block_length) not in [int(value) for value in period_contract["blockLengths"]]:
        raise ValueError(f"Block length {block_length} is not frozen for {period}")
    expected_members = int(
        config["evaluation"]["bootstrapMembers"]
        if period == "development"
        else config["evaluation"]["calibrationBootstrapMembers"]
    )
    if int(period_contract["members"]) != expected_members:
        raise ValueError(f"Bootstrap member count is internally inconsistent for {period}")
    manifest = metric_frame.loc[
        metric_frame["candidate"].eq(P0) & metric_frame["season"].isin(seasons),
        ["game_id", "season", "week"],
    ].copy()
    if manifest.empty or manifest.duplicated(["game_id"]).any():
        raise ValueError("Bootstrap anchor manifest is empty or duplicated")
    manifest = manifest.sort_values(
        ["season", "week", "game_id"], kind="mergesort"
    ).reset_index(drop=True)
    observed_seasons = tuple(sorted(int(value) for value in manifest["season"].unique()))
    if observed_seasons != seasons:
        raise ValueError("Bootstrap anchor does not contain every frozen development season")
    by_season = {
        season: {
            int(week): group.index.to_numpy(dtype=np.int64)
            for week, group in manifest.loc[manifest["season"].eq(season)].groupby(
                "week", sort=True
            )
        }
        for season in seasons
    }
    seed, seed_material = _bootstrap_seed(config, int(block_length), period)
    rng = np.random.Generator(np.random.PCG64(seed))
    members = int(period_contract["members"])
    member_indexes: list[np.ndarray] = []
    for _ in range(members):
        indexes: list[int] = []
        season_positions = rng.integers(
            0, len(seasons), size=len(seasons), endpoint=False
        )
        for sampled_position in season_positions:
            sampled_season = seasons[int(sampled_position)]
            week_map = by_season[sampled_season]
            for sampled_week in _sample_week_positions(
                tuple(week_map), int(block_length), rng
            ):
                indexes.extend(int(value) for value in week_map[sampled_week])
        if not indexes:
            raise ValueError("Bootstrap index ledger produced an empty member")
        member_indexes.append(np.asarray(indexes, dtype=np.int64))
    manifest_hash = _exact_frame_hash(manifest, ("season", "week", "game_id"))
    ledger_hash = _scientific_arrays_hash(member_indexes, integer=True)
    return BootstrapIndexLedger(
        period,
        int(block_length),
        int(seed),
        seed_material,
        manifest,
        tuple(member_indexes),
        manifest_hash,
        ledger_hash,
    )


def _bootstrap_ledger_summary(ledger: BootstrapIndexLedger) -> dict[str, Any]:
    return {
        "period": ledger.period,
        "blockLengthWeeks": int(ledger.block_length),
        "seed": int(ledger.seed),
        "seedMaterial": ledger.seed_material,
        "members": int(len(ledger.member_indexes)),
        "manifestRows": int(len(ledger.manifest)),
        "manifestHash": ledger.manifest_hash,
        "indexLedgerHash": ledger.ledger_hash,
    }


def _shared_calibration_intervals(
    metric_rows: pd.DataFrame,
    ledger: BootstrapIndexLedger,
    config: Mapping[str, Any],
) -> dict[str, Any]:
    """Use the first frozen L=3 ledger members for coverage and covariance."""

    if int(ledger.block_length) != int(config["evaluation"]["primaryWeekBlockLength"]):
        raise ValueError("Calibration must reuse the frozen primary block-length ledger")
    required = {
        "game_id",
        "season",
        "week",
        "actual_home",
        "actual_away",
        "predicted_home_mean",
        "predicted_away_mean",
        "predicted_within_game_covariance",
    }
    coverage_fields = [
        f"coverage_{mass}_{target}"
        for mass in (50, 80, 95)
        for target in ("home", "away", "total", "difference")
    ]
    required.update(coverage_fields)
    missing = sorted(required.difference(metric_rows.columns))
    if missing:
        raise ValueError(f"Shared calibration frame lacks fields: {missing}")
    selected = metric_rows.loc[:, sorted(required)].copy()
    if selected.duplicated(["game_id"]).any():
        raise ValueError("Shared calibration frame has duplicate games")
    expected_ids = set(ledger.manifest["game_id"].astype(str))
    if set(selected["game_id"].astype(str)) != expected_ids:
        raise ValueError("Shared calibration frame differs from the L=3 ledger manifest")
    selected = ledger.manifest.merge(
        selected,
        on=["game_id", "season", "week"],
        how="left",
        validate="one_to_one",
        sort=False,
    )
    numeric_fields = [
        *coverage_fields,
        "actual_home",
        "actual_away",
        "predicted_home_mean",
        "predicted_away_mean",
        "predicted_within_game_covariance",
    ]
    numeric = selected.loc[:, numeric_fields].apply(pd.to_numeric, errors="coerce")
    if not np.isfinite(numeric.to_numpy(float)).all():
        raise ValueError("Shared calibration frame contains nonfinite values")
    members = int(config["evaluation"]["calibrationBootstrapMembers"])
    if members > len(ledger.member_indexes):
        raise ValueError("Calibration requests more members than the shared bootstrap ledger")
    coverage_draws = {
        field: np.empty(members, dtype=np.float64) for field in coverage_fields
    }
    covariance_draws = np.empty(members, dtype=np.float64)
    for member, indexes in enumerate(ledger.member_indexes[:members]):
        sample = selected.iloc[indexes]
        for field in coverage_fields:
            coverage_draws[field][member] = float(sample[field].mean())
        predicted = sample.loc[
            :, ["predicted_home_mean", "predicted_away_mean"]
        ].to_numpy(float)
        observed = sample.loc[:, ["actual_home", "actual_away"]].to_numpy(float)
        predicted_between = np.cov(predicted, rowvar=False, ddof=0)
        observed_between = np.cov(observed, rowvar=False, ddof=0)
        predicted_covariance = float(
            sample["predicted_within_game_covariance"].mean()
            + predicted_between[0, 1]
        )
        covariance_draws[member] = predicted_covariance - float(observed_between[0, 1])
    evaluation = config["evaluation"]
    if evaluation.get("quantileMethod") != "hyndman_fan_type_7_numpy_linear":
        raise ValueError("Module 2 v7 calibration quantile method changed")
    mass = float(evaluation["calibrationInterval"])
    alpha = 0.5 * (1.0 - mass)
    intervals = {
        field: [
            float(np.quantile(draws, alpha, method="linear")),
            float(np.quantile(draws, 1.0 - alpha, method="linear")),
        ]
        for field, draws in coverage_draws.items()
    }
    intervals["covarianceError"] = [
        float(np.quantile(covariance_draws, alpha, method="linear")),
        float(np.quantile(covariance_draws, 1.0 - alpha, method="linear")),
    ]
    return {
        "intervals": intervals,
        "members": members,
        "intervalMass": mass,
        "indexLedgerHash": ledger.ledger_hash,
        "coverageDrawHashes": {
            field: _scientific_arrays_hash((draws,))
            for field, draws in coverage_draws.items()
        },
        "covarianceDrawHash": _scientific_arrays_hash((covariance_draws,)),
    }


def _bootstrap_family(
    metric_frame: pd.DataFrame,
    comparisons: Mapping[str, tuple[str, str]],
    family_name: str,
    config: Mapping[str, Any],
    ledger: BootstrapIndexLedger,
) -> dict[str, Any]:
    seasons = set(int(value) for value in config["forecastContract"]["developmentSeasons"])
    metric = str(config["evaluation"]["primaryMetric"])
    differences, baseline_means = _comparison_frame(metric_frame, comparisons, metric, seasons)
    labels = list(comparisons)
    expected_ids = set(ledger.manifest["game_id"].astype(str))
    difference_ids = set(differences["game_id"].astype(str))
    if difference_ids != expected_ids or len(differences) != len(ledger.manifest):
        raise ValueError("Bootstrap comparison differs from the shared index-ledger manifest")
    differences = ledger.manifest.merge(
        differences,
        on=["game_id", "season", "week"],
        how="left",
        validate="one_to_one",
        sort=False,
    )
    if differences.loc[:, labels].isna().any().any():
        raise ValueError("Bootstrap comparison cannot align to the shared index ledger")
    observed = differences.loc[:, labels].mean().to_numpy(float)
    ordered_seasons = sorted(seasons)
    members = len(ledger.member_indexes)
    draws = np.empty((members, len(labels)), dtype=float)
    for member, indexes in enumerate(ledger.member_indexes):
        draws[member] = differences.iloc[indexes][labels].to_numpy(float).mean(axis=0)
    centered_max = np.max(np.abs(draws - observed[None, :]), axis=1)
    mass = float(config["evaluation"]["simultaneousInterval"])
    if config["evaluation"].get("quantileMethod") != "hyndman_fan_type_7_numpy_linear":
        raise ValueError("Module 2 v7 simultaneous quantile method changed")
    critical = float(np.quantile(centered_max, mass, method="linear"))
    result: dict[str, Any] = {
        "family": family_name,
        "metric": metric,
        "blockLengthWeeks": int(ledger.block_length),
        "members": members,
        "seed": int(ledger.seed),
        "indexLedgerHash": ledger.ledger_hash,
        "indexLedgerManifestHash": ledger.manifest_hash,
        "simultaneousMass": mass,
        "drawsHash": _scientific_arrays_hash((draws,)),
        "comparisons": {},
    }
    for index, label in enumerate(labels):
        season_delta = differences.groupby("season", sort=True)[label].mean()
        leave_one_out = {
            str(season): float(differences.loc[differences["season"].ne(season), label].mean())
            for season in ordered_seasons
        }
        value = float(observed[index])
        result["comparisons"][label] = {
            "simpler": comparisons[label][0],
            "candidate": comparisons[label][1],
            "meanImprovement": value,
            "fractionalImprovement": value / baseline_means[label] if baseline_means[label] else None,
            "simultaneousInterval": [value - critical, value + critical],
            "bootstrapProbabilityOfImprovement": float(np.mean(draws[:, index] > 0)),
            "seasonDeltas": {str(key): float(item) for key, item in season_delta.items()},
            "improvedSeasons": int((season_delta > 0).sum()),
            "leaveOneSeasonOut": leave_one_out,
        }
    return result


def _mean_calibration_point(predicted: np.ndarray, observed: np.ndarray) -> dict[str, Any]:
    predicted = np.asarray(predicted, dtype=float)
    observed = np.asarray(observed, dtype=float)
    usable = np.isfinite(predicted) & np.isfinite(observed)
    if int(usable.sum()) < 3 or float(np.std(predicted[usable])) < 1e-12:
        return {
            "intercept": None,
            "slope": None,
            "observations": int(usable.sum()),
            "status": "not_identifiable",
        }
    design = np.column_stack((np.ones(int(usable.sum())), predicted[usable]))
    coefficients = np.linalg.lstsq(design, observed[usable], rcond=None)[0]
    return {
        "intercept": float(coefficients[0]),
        "slope": float(coefficients[1]),
        "observations": int(usable.sum()),
        "status": "estimated",
    }


def _point_calibration_summary(forecasts: pd.DataFrame) -> dict[str, Any]:
    """Aggregate mandatory point diagnostics without creating a bootstrap."""

    if forecasts.empty:
        raise ValueError("Module 2 point calibration requires forecast rows")
    frame = forecasts.reset_index(drop=True).copy()
    required = {
        "game_id",
        "season",
        "week",
        "actual_home",
        "actual_away",
        "predicted_home_mean",
        "predicted_away_mean",
        "predicted_home_variance",
        "predicted_away_variance",
        "predicted_within_game_covariance",
        "joint_negative_log_score",
        "multivariate_energy_score",
        "home_crps",
        "away_crps",
        "total_crps",
        "difference_crps",
        "home_absolute_error",
        "away_absolute_error",
        "home_squared_error",
        "away_squared_error",
        "joint_80_hds_coverage",
        "joint_80_hds_size",
        "pit_home",
        "pit_away",
        "pit_total",
        "pit_difference",
        "forecast_failed",
        "home_bound_hit",
        "away_bound_hit",
        "runtime_seconds",
    }
    required.update(
        f"{kind}_{mass}_{target}"
        for kind in ("coverage", "width")
        for mass in (50, 80, 95)
        for target in ("home", "away", "total", "difference")
    )
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise ValueError(f"Module 2 point calibration frame lacks columns: {missing}")
    numeric_fields = sorted(required.difference({"game_id"}))
    numeric = frame.loc[:, numeric_fields].apply(pd.to_numeric, errors="coerce")
    if not np.isfinite(numeric.to_numpy(float)).all():
        raise ValueError("Module 2 point calibration frame contains nonfinite values")
    if numeric["forecast_failed"].ne(0).any():
        raise ValueError("Module 2 point calibration cannot include a failed forecast")
    result: dict[str, Any] = {
        "games": int(frame["game_id"].nunique()),
        "forecastRows": int(len(frame)),
    }
    mean_metrics = (
        "joint_negative_log_score",
        "multivariate_energy_score",
        "home_crps",
        "away_crps",
        "total_crps",
        "difference_crps",
        "home_absolute_error",
        "away_absolute_error",
    )
    for field in mean_metrics:
        result[field] = float(frame[field].mean())
    result["home_mae"] = result["home_absolute_error"]
    result["away_mae"] = result["away_absolute_error"]
    for side in ("home", "away"):
        result[f"{side}_rmse"] = float(
            math.sqrt(float(frame[f"{side}_squared_error"].mean()))
        )
        result[f"{side}_mean_calibration"] = _mean_calibration_point(
            frame[f"predicted_{side}_mean"].to_numpy(float),
            frame[f"actual_{side}"].to_numpy(float),
        )
    for mass in (50, 80, 95):
        for target in ("home", "away", "total", "difference"):
            for kind in ("coverage", "width"):
                field = f"{kind}_{mass}_{target}"
                result[field] = float(frame[field].mean())
    for field in ("joint_80_hds_coverage", "joint_80_hds_size", "joint_80_hds_mass"):
        if field in frame.columns:
            result[field] = float(frame[field].mean())
    for target in ("home", "away", "total", "difference"):
        values = np.clip(frame[f"pit_{target}"].to_numpy(float), 0.0, 1.0)
        histogram, _ = np.histogram(values, bins=np.linspace(0.0, 1.0, 11))
        result[f"pit_{target}_deciles"] = histogram.tolist()
        result[f"pit_{target}_quantile_calibration"] = {
            f"{quantile:.1f}": float(np.mean(values <= quantile))
            for quantile in np.arange(0.1, 1.0, 0.1)
        }
    predicted_means = frame.loc[
        :, ["predicted_home_mean", "predicted_away_mean"]
    ].to_numpy(float)
    observed = frame.loc[:, ["actual_home", "actual_away"]].to_numpy(float)
    predicted_between = np.cov(predicted_means, rowvar=False, ddof=0)
    observed_covariance = np.cov(observed, rowvar=False, ddof=0)
    predicted_unconditional_covariance = float(
        frame["predicted_within_game_covariance"].mean() + predicted_between[0, 1]
    )
    result["moments"] = {
        "predictedHomeMean": float(predicted_means[:, 0].mean()),
        "predictedAwayMean": float(predicted_means[:, 1].mean()),
        "observedHomeMean": float(observed[:, 0].mean()),
        "observedAwayMean": float(observed[:, 1].mean()),
        "predictedUnconditionalHomeVariance": float(
            frame["predicted_home_variance"].mean() + predicted_between[0, 0]
        ),
        "predictedUnconditionalAwayVariance": float(
            frame["predicted_away_variance"].mean() + predicted_between[1, 1]
        ),
        "observedHomeVariance": float(observed_covariance[0, 0]),
        "observedAwayVariance": float(observed_covariance[1, 1]),
        "predictedUnconditionalCovariance": predicted_unconditional_covariance,
        "observedCovariance": float(observed_covariance[0, 1]),
        "covarianceAbsoluteError": abs(
            predicted_unconditional_covariance - float(observed_covariance[0, 1])
        ),
    }
    result["forecastFailureRate"] = float(numeric["forecast_failed"].mean())
    result["numericalBoundHitRate"] = float(
        numeric.loc[:, ["home_bound_hit", "away_bound_hit"]].to_numpy().mean()
    )
    result["meanRuntimeSeconds"] = float(numeric["runtime_seconds"].mean())
    return result


def _aggregate_scorecards(
    metric_frame: pd.DataFrame,
    specs: Sequence[ModelSpec],
    config: Mapping[str, Any],
    runtime: Mapping[str, Any],
    calibration_ledgers: Mapping[str, BootstrapIndexLedger],
) -> dict[str, Any]:
    periods = {
        "development": set(int(value) for value in config["forecastContract"]["developmentSeasons"]),
        "confirmation_2025": {int(config["forecastContract"]["retrospectiveConfirmationSeason"])},
    }
    output: dict[str, Any] = {}
    for spec in specs:
        candidate_rows = metric_frame.loc[metric_frame["candidate"].eq(spec.name)].copy()
        output[spec.name] = {
            "family": spec.family,
            "analysisKind": spec.analysis_kind,
            "variant": spec.variant,
            "runtimeSeconds": float(runtime["runtimeSecondsByCandidate"].get(spec.name, 0.0)),
            "periods": {},
        }
        for label, seasons in periods.items():
            rows = candidate_rows.loc[candidate_rows["season"].isin(seasons)].copy()
            summary = _point_calibration_summary(rows)
            if label not in calibration_ledgers:
                raise ValueError(f"Calibration ledger is missing for scorecard period {label}")
            shared = _shared_calibration_intervals(
                rows, calibration_ledgers[label], config
            )
            summary["clusteredIntervals"] = shared["intervals"]
            summary["clusteredBootstrapMembers"] = shared["members"]
            summary["clusteredIntervalMass"] = shared["intervalMass"]
            summary["clusteredIndexLedgerHash"] = shared["indexLedgerHash"]
            summary["clusteredDrawHashes"] = {
                "coverage": shared["coverageDrawHashes"],
                "covariance": shared["covarianceDrawHash"],
            }
            output[spec.name]["periods"][label] = summary
    diagnostics: dict[str, Any] = {}
    for base in BASE_FAMILIES:
        full = metric_frame.loc[
            metric_frame["candidate"].eq(base)
            & metric_frame["season"].isin(periods["development"]),
            "joint_negative_log_score",
        ]
        independent = metric_frame.loc[
            metric_frame["candidate"].eq(f"diagnostic::factorized::{base}")
            & metric_frame["season"].isin(periods["development"]),
            "joint_negative_log_score",
        ]
        diagnostics[base] = {
            "pairedJointMinusFactorizedLogScore": float(full.mean() - independent.mean()),
            "jointMeanLogScore": float(full.mean()),
            "factorizedMeanLogScore": float(independent.mean()),
            "interpretation": "negative_favors_paired_joint_distribution",
        }
    return {"candidates": output, "independenceDiagnostic": diagnostics}


def _mean(summary: Mapping[str, Any], name: str) -> float:
    value = summary.get(name)
    if value is None or not math.isfinite(float(value)):
        raise ValueError(f"Required scorecard metric is missing: {name}")
    return float(value)


def _gate_candidates(
    scorecards: Mapping[str, Any],
    primary_uncertainty: Mapping[str, Any],
    p1_ablations: Mapping[str, Any],
    p2_ablations: Mapping[str, Any],
    controls: Mapping[str, Any],
    config: Mapping[str, Any],
    protocol_valid: bool,
) -> dict[str, Any]:
    if not protocol_valid:
        return {
            "result": "protocol_invalid", "eligibleCandidate": None,
            "candidates": {},
            "reason": "A source, implementation, failure, or common-manifest invariant failed.",
        }
    gate = config["shadowEligibilityGate"]
    candidates = scorecards["candidates"]
    required = {P1: (P0,), P2: (P0, P1)}
    labels = {(P1, P0): "p1_minus_p0", (P2, P0): "p2_minus_p0", (P2, P1): "p2_minus_p1"}
    decisions: dict[str, Any] = {}
    for candidate in (P1, P2):
        checks: list[dict[str, Any]] = []
        candidate_dev = candidates[candidate]["periods"]["development"]
        candidate_confirmation = candidates[candidate]["periods"]["confirmation_2025"]
        for simpler in required[candidate]:
            label = labels[(candidate, simpler)]
            base_dev = candidates[simpler]["periods"]["development"]
            base_confirmation = candidates[simpler]["periods"]["confirmation_2025"]
            primary = primary_uncertainty["3"]["comparisons"][label]
            checks.extend(
                [
                    {"check": f"{label}_minimum_nats", "passed": primary["meanImprovement"] >= float(gate["minimumDevelopmentLogScoreImprovementNats"]), "value": primary["meanImprovement"]},
                    {"check": f"{label}_minimum_fraction", "passed": primary["fractionalImprovement"] >= float(gate["minimumDevelopmentLogScoreImprovementFraction"]), "value": primary["fractionalImprovement"]},
                    {"check": f"{label}_all_block_lower_bounds", "passed": all(primary_uncertainty[str(length)]["comparisons"][label]["simultaneousInterval"][0] > 0 for length in (1, 3, 6)), "value": {str(length): primary_uncertainty[str(length)]["comparisons"][label]["simultaneousInterval"] for length in (1, 3, 6)}},
                    {"check": f"{label}_improved_seasons", "passed": int(primary["improvedSeasons"]) >= int(gate["minimumImprovedDevelopmentSeasons"]), "value": primary["improvedSeasons"]},
                    {"check": f"{label}_leave_one_season_out", "passed": all(float(value) > 0 for value in primary["leaveOneSeasonOut"].values()), "value": primary["leaveOneSeasonOut"]},
                    {"check": f"{label}_confirmation", "passed": _mean(base_confirmation, "joint_negative_log_score") - _mean(candidate_confirmation, "joint_negative_log_score") > 0, "value": _mean(base_confirmation, "joint_negative_log_score") - _mean(candidate_confirmation, "joint_negative_log_score")},
                ]
            )
            for metric in ("multivariate_energy_score", "home_crps", "away_crps", "total_crps", "difference_crps"):
                tolerance = float(
                    gate["maximumEnergyRegressionFraction"]
                    if metric == "multivariate_energy_score"
                    else gate["maximumCrpsRegressionFraction"]
                )
                checks.append(
                    {"check": f"{label}_{metric}", "passed": _mean(candidate_dev, metric) <= _mean(base_dev, metric) * (1.0 + tolerance), "value": _mean(candidate_dev, metric) - _mean(base_dev, metric)}
                )
            for side in ("home", "away"):
                checks.append(
                    {"check": f"{label}_{side}_mae", "passed": _mean(candidate_dev, f"{side}_absolute_error") <= _mean(base_dev, f"{side}_absolute_error") + float(gate["maximumTeamMaeRegressionPossessions"]), "value": _mean(candidate_dev, f"{side}_absolute_error") - _mean(base_dev, f"{side}_absolute_error")}
                )
                checks.append(
                    {"check": f"{label}_{side}_width80", "passed": _mean(candidate_dev, f"width_80_{side}") <= _mean(base_dev, f"width_80_{side}") * (1.0 + float(gate["maximumIntervalWidthIncreaseFraction"])), "value": _mean(candidate_dev, f"width_80_{side}") / _mean(base_dev, f"width_80_{side}")}
                )
            candidate_covariance_error = float(candidate_dev["moments"]["covarianceAbsoluteError"])
            base_covariance_error = float(base_dev["moments"]["covarianceAbsoluteError"])
            checks.append(
                {"check": f"{label}_covariance", "passed": candidate_covariance_error <= base_covariance_error + float(gate["maximumCovarianceAbsoluteErrorIncrease"]), "value": candidate_covariance_error - base_covariance_error}
            )
        for side in ("home", "away"):
            coverage = _mean(candidate_dev, f"coverage_80_{side}")
            interval = candidate_dev["clusteredIntervals"][f"coverage_80_{side}"]
            low, high = map(float, gate["coverage80ObservedRange"])
            checks.append(
                {"check": f"{candidate}_{side}_coverage80", "passed": low <= coverage <= high and float(interval[0]) <= 0.80 <= float(interval[1]), "value": {"coverage": coverage, "clusteredInterval": interval}}
            )
        checks.append(
            {"check": f"{candidate}_failure_rate", "passed": _mean(candidate_dev, "forecastFailureRate") == 0.0, "value": _mean(candidate_dev, "forecastFailureRate")}
        )
        ablation_family = p1_ablations if candidate == P1 else p2_ablations
        ablation_lower_bounds = {
            label: float(value["simultaneousInterval"][0])
            for label, value in ablation_family["comparisons"].items()
        }
        checks.append(
            {"check": f"{candidate}_removal_falsification", "passed": all(value <= 0 for value in ablation_lower_bounds.values()), "value": ablation_lower_bounds}
        )
        if candidate == P2:
            control_lower_bounds = {
                label: float(value["simultaneousInterval"][0])
                for label, value in controls["comparisons"].items()
            }
            checks.append(
                {"check": "p2_negative_controls", "passed": all(value <= 0 for value in control_lower_bounds.values()), "value": control_lower_bounds}
            )
        decisions[candidate] = {"passed": all(bool(check["passed"]) for check in checks), "checks": checks}
    selection_rule = str(gate["simplerCandidatePreference"])
    expected_selection_rule = (
        "select_p2_if_and_only_if_p2_passes_every_gate_including_stable_gain_over_p1;"
        "otherwise_select_p1_if_p1_passes;otherwise_reject_all"
    )
    if selection_rule != expected_selection_rule:
        raise ValueError("Module 2 v7 selection rule changed after the freeze")
    eligible = P2 if decisions[P2]["passed"] else P1 if decisions[P1]["passed"] else None
    return {
        "result": "shadow_eligible" if eligible else "reject_all",
        "eligibleCandidate": eligible,
        "candidates": decisions,
        "reason": (
            "The frozen v7 P2-then-P1 rule selected a candidate for prospective shadow only."
            if eligible else "No challenger cleared every frozen gate."
        ),
    }


def _structural_suite_passed(value: Any) -> bool:
    """Require at least one explicit success marker and no failure marker."""

    saw_success = False
    failed = False

    def visit(item: Any) -> None:
        nonlocal saw_success, failed
        if isinstance(item, Mapping):
            for child in item.values():
                visit(child)
            return
        if isinstance(item, (list, tuple)):
            for child in item:
                visit(child)
            return
        if isinstance(item, (bool, np.bool_)):
            saw_success = saw_success or bool(item)
            failed = failed or not bool(item)
            return
        if isinstance(item, str):
            normalized = item.strip().lower()
            if normalized in {"pass", "passed", "success", "ok"}:
                saw_success = True
            elif normalized in {"fail", "failed", "failure", "error", "invalid"}:
                failed = True

    visit(value)
    return saw_success and not failed


def _structural_suite_schema_status(
    structural: Mapping[str, Any]
) -> dict[str, bool]:
    data = structural.get("data")
    model = structural.get("model")
    runner = structural.get("runner")
    data_tests = data.get("tests", {}) if isinstance(data, Mapping) else {}
    expected_data_tests = {
        "2010_prehistory_origin_omitted",
        "audit_field_mutation_invariance",
        "feature_indicator_pairing",
        "fixed_drive_bijection_invariance",
        "frozen_named_fixture_assertions",
        "future_week_rejection",
        "hard_target_range_enforced",
        "historical_target_range_warning_only",
        "latest_17_selected_before_weighting",
        "live_source_integrity",
        "market_score_pick_column_invariance",
        "missing_indicator_follows_rate",
        "nonnegative_unique_duration_contract",
        "overtime_mutation_invariance",
        "p0_older_prior_and_64_game_update",
        "p1_latest_history_shrinkage_and_signed_home_context",
        "raw_feature_numerator_denominator_contract",
        "repaired_duration_withheld",
        "same_week_isolation",
        "source_missingness_one_percent_boundary",
        "source_missingness_overage_rejection",
        "time_decay_and_2020_multiplier",
        "truncated_source_rejection",
        "tuesday_date_conservative_cutoff",
    }
    live_source = data_tests.get("live_source_integrity", {}) if isinstance(data_tests, Mapping) else {}
    data_string_tests_pass = bool(
        isinstance(data_tests, Mapping)
        and set(data_tests) == expected_data_tests
        and all(
            value == "pass"
            for key, value in data_tests.items()
            if key != "live_source_integrity"
        )
    )
    model_hashes = (
        model.get("fitHashes", {}) if isinstance(model, Mapping) else {}
    )
    is_sha256 = lambda value: bool(
        isinstance(value, str)
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value)
    )
    return {
        "data": bool(
            isinstance(data, Mapping)
            and data.get("passed") is True
            and isinstance(data_tests, Mapping)
            and data_string_tests_pass
            and isinstance(live_source, Mapping)
            and int(live_source.get("source_objects_verified", 0)) == 17
            and live_source.get("source_index_unchanged") is True
            and is_sha256(live_source.get("source_index_sha256"))
            and _structural_suite_passed(data)
        ),
        "model": bool(
            isinstance(model, Mapping)
            and set(model) == {
                "fitHashes",
                "distributionHash",
                "bootstrapDrawsHash",
                "scalerHash",
                "deterministic",
                "manifestFailureDetected",
                "futureWeekFailureDetected",
            }
            and set(model_hashes) == {P0, P1, P2}
            and all(is_sha256(value) for value in model_hashes.values())
            and all(
                is_sha256(model.get(key))
                for key in ("distributionHash", "bootstrapDrawsHash", "scalerHash")
            )
            and model.get("deterministic") is True
            and model.get("manifestFailureDetected") is True
            and model.get("futureWeekFailureDetected") is True
            and _structural_suite_passed(model)
        ),
        "runner": bool(
            isinstance(runner, Mapping)
            and set(runner)
            == {
                "passed",
                "wholeWeekResidualBoundary",
                "deterministicNoiseReplay",
                "exactHashPerturbation",
                "p2PrehistoryWarmupClassification",
                "runnerTuesdayDateCutoff",
                "syntheticFixtureContractCount",
            }
            and runner.get("passed") is True
            and runner.get("wholeWeekResidualBoundary") == "pass"
            and runner.get("deterministicNoiseReplay") == "pass"
            and runner.get("exactHashPerturbation") == "pass"
            and runner.get("p2PrehistoryWarmupClassification") == "pass"
            and runner.get("runnerTuesdayDateCutoff") == "pass"
            and int(runner.get("syntheticFixtureContractCount", 0)) == 17
            and _structural_suite_passed(runner)
        ),
    }


def _protocol_invalid_decision(reason: str) -> dict[str, Any]:
    return {
        "result": "protocol_invalid",
        "eligibleCandidate": None,
        "candidates": {},
        "reason": str(reason),
    }


def _protocol_invalid_markdown(
    decision: Mapping[str, Any],
    stage: str,
    hashes: Mapping[str, str],
) -> str:
    return "\n".join(
        [
            "# Model Laboratory Module 2 Result",
            "",
            "**Decision: `protocol_invalid`**",
            "",
            "No candidate conclusion was calculated. The frozen replay stopped because a required protocol, source, implementation, or common-manifest invariant failed.",
            "",
            f"- Failure stage: `{stage}`",
            f"- Reason: {decision['reason']}",
            *[f"- `{key}`: `{value}`" for key, value in sorted(hashes.items())],
            "",
            "## Exact next decision",
            "",
            "Repair the recorded protocol or data failure, freeze a new version, and rerun from the beginning. Do not infer model quality, redesign the target, begin another module, or change production from this invalid run.",
            "",
        ]
    )


def _write_protocol_invalid_terminal(
    output_dir: Path,
    *,
    version: str,
    stage: str,
    reason: str,
    hashes: Mapping[str, str] | None = None,
    audit_details: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Write a minimal, nonselecting terminal record for an invalid replay."""

    terminal_hashes = dict(hashes or {})
    decision = _protocol_invalid_decision(reason)
    generated_at = datetime.now(timezone.utc).isoformat()
    audit = {
        "protocolValid": False,
        "terminal": True,
        "stage": str(stage),
        "reason": str(reason),
        "generatedAt": generated_at,
        "details": dict(audit_details or {}),
    }
    result = {
        "version": str(version),
        "generatedAt": generated_at,
        "decision": decision,
        "hashes": terminal_hashes,
        "forecastCount": 0,
        "metricRowCount": 0,
    }
    _write_json_atomic(output_dir / "audit.json", audit)
    _write_json_atomic(output_dir / "result.json", result)
    _write_text_atomic(
        output_dir / "RESULT.md",
        _protocol_invalid_markdown(decision, str(stage), terminal_hashes),
    )
    artifact_names = (
        "pre-replay-manifest.json",
        "audit.json",
        "result.json",
        "RESULT.md",
    )
    artifact_hashes = {
        name: _file_hash(output_dir / name)
        for name in artifact_names
        if (output_dir / name).is_file()
    }
    _write_json_atomic(output_dir / "artifact-hashes.json", artifact_hashes)
    result["artifactHashes"] = artifact_hashes
    return result


def _write_nonoverwriting_failure_notice(
    output_dir: Path,
    payload: Mapping[str, Any],
) -> Path:
    """Record a rejected retry without changing any prior scored artifact."""

    output_dir.mkdir(parents=True, exist_ok=True)
    for index in range(1, 1000):
        path = output_dir / f"protocol-invalid-nonoverwriting-{index:03d}.json"
        try:
            descriptor = os.open(
                path,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                0o600,
            )
        except FileExistsError:
            continue
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(
                json.dumps(
                    _jsonable(payload),
                    indent=2,
                    sort_keys=True,
                    allow_nan=False,
                )
                + "\n"
            )
        return path
    raise RuntimeError("could not allocate a nonoverwriting protocol-invalid notice")


def _result_markdown(
    result: Mapping[str, Any], scorecards: Mapping[str, Any], hashes: Mapping[str, str]
) -> str:
    lines = [
        "# Model Laboratory Module 2 Result", "",
        f"**Decision: `{result['result']}`**", "",
        "This is a retrospective, market-free possession-count experiment. It does not change production and it does not issue a confidence value.",
        "", "## Rolling-origin scorecard", "",
        "| Candidate | Development joint NLL | Energy | Home CRPS | Away CRPS | Home MAE | Away MAE | 2025 joint NLL |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for candidate in BASE_FAMILIES:
        dev = scorecards["candidates"][candidate]["periods"]["development"]
        confirmation = scorecards["candidates"][candidate]["periods"]["confirmation_2025"]
        lines.append(
            "| " + " | ".join(
                [
                    candidate,
                    f"{float(dev['joint_negative_log_score']):.6f}",
                    f"{float(dev['multivariate_energy_score']):.6f}",
                    f"{float(dev['home_crps']):.6f}",
                    f"{float(dev['away_crps']):.6f}",
                    f"{float(dev['home_absolute_error']):.6f}",
                    f"{float(dev['away_absolute_error']):.6f}",
                    f"{float(confirmation['joint_negative_log_score']):.6f}",
                ]
            ) + " |"
        )
    lines.extend(
        [
            "", "## Artifact hashes", "",
            *[f"- `{key}`: `{value}`" for key, value in sorted(hashes.items())],
            "",
            "The full calibration, paired uncertainty, ablations, falsification tests, failure audit, leakage audit, and gate checks are stored in the adjacent JSON artifacts.",
            "", "## Exact next decision", "",
            (
                "Repair the recorded failure and rerun without drawing a model conclusion."
                if result.get("result") == "protocol_invalid"
                else (
                    "Begin prospective 2026 pre-kickoff shadow storage for the named candidate only. Do not enter production or begin the drive-outcome module."
                    if result.get("eligibleCandidate")
                    else "Retain no possession model. Decide whether to redesign the possession target or stop this decomposition before any drive-outcome work."
                )
            ), "",
        ]
    )
    return "\n".join(lines)


def _runner_self_tests(config: Mapping[str, Any]) -> dict[str, Any]:
    entries = [
        {
            "game_id": f"g-{season}-{week}-{game}", "season": season, "week": week,
            "residual_home": 0.0, "residual_away": 0.0,
        }
        for season in (2023, 2024) for week in range(1, 19) for game in range(8)
    ]
    window = _whole_week_residual_window(entries, 100)
    grouped = pd.DataFrame(window).groupby(["season", "week"]).size()
    if len(window) > 100 or (grouped != 8).any():
        raise AssertionError("Whole-week residual boundary self-test failed")
    if _deterministic_noise("g", "home", config) != _deterministic_noise(
        "g", "home", config
    ):
        raise AssertionError("Deterministic negative-control noise changed")
    first = np.asarray([1.0], dtype=np.float64)
    second = first.copy()
    second[0] = np.nextafter(second[0], np.inf)
    if _exact_hash(first) == _exact_hash(second):
        raise AssertionError("Exact runner hash erased a one-ULP perturbation")
    prehistory_rows = pd.DataFrame(
        {
            "game_id": [f"prehistory-{index}" for index in range(64)]
            + [f"eligible-{index}" for index in range(64)],
            "season": [2010] * 64 + [2011] * 64,
            "week": [1] * 128,
            "p0_home_mean": [np.nan] * 64 + [10.0] * 64,
            "p0_away_mean": [np.nan] * 64 + [10.0] * 64,
            "p1_home_mean": [np.nan] * 64 + [10.0] * 64,
            "p1_away_mean": [np.nan] * 64 + [10.0] * 64,
        }
    )
    profile_features = tuple(
        str(name)
        for group in config["candidates"][P2]["orderedDesign"][
            "profileGroupOrder"
        ]
        for name in config["features"]["groups"][group]
    )
    for name in profile_features:
        for side in ("home", "away"):
            prehistory_rows[f"{side}_{name}"] = [np.nan] * 64 + [0.0] * 64
            prehistory_rows[f"{side}_{name}_missing"] = (
                [np.nan] * 64 + [0.0] * 64
            )
    prehistory_rows["is_neutral_site"] = 0.0
    p2_spec = ModelSpec(
        P2,
        P2,
        "base",
        (
            *config["features"]["groups"]["possession_rate"],
            *profile_features,
            *config["features"]["groups"]["home_context"],
        ),
    )
    if _eligible_training_row_count(
        prehistory_rows.iloc[:-1].copy(), p2_spec, config
    ) != 63:
        raise AssertionError("P2 warmup count admitted fixed 2010 prehistory")
    if _eligible_training_row_count(prehistory_rows, p2_spec, config) != 64:
        raise AssertionError("P2 warmup count rejected an eligible post-prehistory row")
    cutoff_fixture = pd.DataFrame(
        {
            "game_id": ["older-season", "played-prior-week", "postponed-prior-week", "same-week"],
            "season": [2024, 2025, 2025, 2025],
            "week": [18, 5, 5, 6],
            "game_date": pd.to_datetime(
                ["2025-01-05", "2025-10-05", "2025-10-16", "2025-10-12"]
            ),
        }
    )
    cutoff_ids = set(
        _training_before(
            cutoff_fixture,
            2025,
            6,
            "2025-10-07T07:30:00-07:00",
        )["game_id"].astype(str)
    )
    if cutoff_ids != {"older-season", "played-prior-week"}:
        raise AssertionError("Runner Tuesday cutoff admitted an unavailable game")
    fixture_names = set(config["target"]["syntheticFixtureAssertions"])
    if len(fixture_names) != 17:
        raise AssertionError("Synthetic fixture contract is incomplete")
    return {
        "passed": True,
        "wholeWeekResidualBoundary": "pass",
        "deterministicNoiseReplay": "pass",
        "exactHashPerturbation": "pass",
        "p2PrehistoryWarmupClassification": "pass",
        "runnerTuesdayDateCutoff": "pass",
        "syntheticFixtureContractCount": len(fixture_names),
    }


def _dependency_fingerprint() -> dict[str, Any]:
    lock_paths = (
        REPOSITORY_ROOT / "requirements-model-lab.txt",
        REPOSITORY_ROOT / "pnpm-lock.yaml",
        REPOSITORY_ROOT / "package.json",
    )
    return {
        "pythonImplementation": platform.python_implementation(),
        "pythonVersion": platform.python_version(),
        "pythonExecutable": str(Path(sys.executable).resolve()),
        "platform": platform.platform(),
        "numpyVersion": np.__version__,
        "pandasVersion": pd.__version__,
        "lockFiles": {
            path.name: _file_hash(path) for path in lock_paths if path.is_file()
        },
    }


def _target_schema_hash(dataset: Any, config: Mapping[str, Any]) -> str:
    target_columns = tuple(str(value) for value in dataset.target_columns)
    return _exact_hash(
        {
            "targetColumns": target_columns,
            "targetDtypes": tuple(
                (name, str(dataset.targets[name].dtype)) for name in target_columns
            ),
            "primaryDefinition": config["target"],
            "targetsStoredSeparately": True,
        }
    )


def _source_object_ledger(dataset: Any) -> list[dict[str, Any]]:
    return [
        {
            "logicalName": str(item.logical_name),
            "url": str(item.url),
            "sha256": str(item.sha256),
            "projectedSha256": str(item.projected_sha256),
            "byteCount": int(item.byte_count),
            "rowCount": int(item.row_count),
            "projectedColumns": list(map(str, item.projected_columns)),
        }
        for item in dataset.source_manifest
    ]


def _freeze_scientific_contract(config: Mapping[str, Any]) -> dict[str, Any]:
    evaluation = config["evaluation"]
    distribution = config["distribution"]
    return {
        "negativeControls": config["negativeControlConstruction"],
        "bootstrap": {
            key: evaluation[key]
            for key in (
                "bootstrapMembers",
                "bootstrapSeed",
                "bootstrapBitGenerator",
                "bootstrapSeedDerivation",
                "bootstrapLedgerPeriods",
                "bootstrapCanonicalManifestOrder",
                "bootstrapLedgerReuse",
                "bootstrapIntegerDrawRule",
                "bootstrapLedgerHashRule",
                "bootstrapConstruction",
                "quantileMethod",
                "quantileEquation",
                "scientificArrayHashRule",
            )
        },
        "distributionSeeds": {
            "energyScoreSeed": int(distribution["energyScoreSeed"]),
            "randomizedPitSeed": int(distribution["randomizedPitSeed"]),
        },
    }


def _existing_output_files(output_dir: Path) -> list[str]:
    if not output_dir.exists():
        return []
    return sorted(path.name for path in output_dir.iterdir() if path.is_file())


def prepare_module_two_freeze(
    config_path: Path,
    cache_dir: Path,
    output_dir: Path,
) -> dict[str, Any]:
    """Create the append-only pre-replay manifest without a historical score."""

    from model_lab_module_two_data import build_module_two_dataset, run_data_self_tests

    config = _load_config(config_path)
    existing = _existing_output_files(output_dir)
    if existing:
        raise RuntimeError(
            f"freeze preparation requires an empty output directory; found {existing}"
        )
    protocol_path = REPOSITORY_ROOT / "docs" / "MODEL_LAB_MODULE_2_PROTOCOL.md"
    data_tests = run_data_self_tests(config, cache_dir)
    model_tests = run_model_self_tests()
    runner_tests = _runner_self_tests(config)
    structural = {"data": data_tests, "model": model_tests, "runner": runner_tests}
    structural_status = _structural_suite_schema_status(structural)
    if not all(structural_status.values()):
        raise RuntimeError("freeze preparation structural suite did not explicitly pass")
    dataset = build_module_two_dataset(config, cache_dir)
    games = _assemble_games(dataset, config)
    data_audit = _validate_dataset(dataset, games, config)
    specs = _model_specs(dataset, config)
    code_hash, code_files = _code_hashes()
    target_schema = _target_schema_hash(dataset, config)
    scan = [name for name in existing if name in SCORED_ARTIFACT_NAMES]
    if scan:
        raise RuntimeError(f"candidate score artifacts predate the freeze: {scan}")
    manifest = {
        "schemaVersion": "module-two-freeze-manifest-v1",
        "version": config["version"],
        "frozenBeforeHistoricalTargetLinkedCandidateFitOrScore": True,
        "candidateScoreArtifactScan": {
            "outputDirectory": str(output_dir.resolve()),
            "existingFiles": existing,
            "scoredArtifactMatches": scan,
            "passed": not scan,
        },
        "byteHashes": {
            "config": _file_hash(config_path),
            "protocol": _file_hash(protocol_path),
            "codeAggregate": code_hash,
            "codeFiles": code_files,
        },
        "dependencyFingerprint": _dependency_fingerprint(),
        "sourceObjects": _source_object_ledger(dataset),
        "dataHashes": {
            "source": dataset.source_hash,
            "data": dataset.data_hash,
            "featureSchema": dataset.feature_schema_hash,
            "targetSchema": target_schema,
            "sourceMissingnessLedger": str(
                dataset.audits["source_missingness_ledger_sha256"]
            ),
        },
        "scientificContract": _freeze_scientific_contract(config),
        "expectedSpecs": [_jsonable(spec) for spec in specs],
        "sourceAndTargetAudit": {
            "dataAudit": data_audit,
            "structuralTests": structural,
            "structuralSuiteSchemaStatus": structural_status,
            "sourceMissingnessAllPassed": bool(
                dataset.audits["source_missingness_all_passed"]
            ),
        },
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / FREEZE_MANIFEST_NAME
    if manifest_path.exists():
        raise RuntimeError("pre-replay manifest is append-only and already exists")
    _write_json_atomic(manifest_path, manifest)
    return {
        "version": config["version"],
        "manifestPath": str(manifest_path),
        "manifestSha256": _file_hash(manifest_path),
        "historicalCandidateScoresComputed": False,
        "sourceGames": int(data_audit["games"]),
        "evaluatedGames": int(data_audit["evaluatedGames"]),
    }


def _load_and_verify_freeze_before_source_build(
    config_path: Path,
    protocol_path: Path,
    output_dir: Path,
    config: Mapping[str, Any],
) -> tuple[dict[str, Any], str]:
    manifest_path = output_dir / FREEZE_MANIFEST_NAME
    if not manifest_path.is_file():
        raise RuntimeError("scored replay requires the append-only pre-replay manifest")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("version") != config.get("version"):
        raise RuntimeError("freeze manifest protocol version changed")
    if not manifest.get("frozenBeforeHistoricalTargetLinkedCandidateFitOrScore"):
        raise RuntimeError("freeze manifest does not establish the pre-score boundary")
    current_code, code_files = _code_hashes()
    expected = manifest.get("byteHashes", {})
    observed = {
        "config": _file_hash(config_path),
        "protocol": _file_hash(protocol_path),
        "codeAggregate": current_code,
        "codeFiles": code_files,
    }
    if observed != expected:
        raise RuntimeError("config, protocol, or scientific code changed after the freeze")
    if _dependency_fingerprint() != manifest.get("dependencyFingerprint"):
        raise RuntimeError("dependency or runtime fingerprint changed after the freeze")
    scored = sorted(
        name for name in _existing_output_files(output_dir) if name in SCORED_ARTIFACT_NAMES
    )
    if scored:
        raise RuntimeError(f"scored output directory is not clean: {scored}")
    return manifest, _file_hash(manifest_path)


def _verify_freeze_after_source_build(
    manifest: Mapping[str, Any],
    dataset: Any,
    specs: Sequence[ModelSpec],
    config: Mapping[str, Any],
) -> None:
    observed_hashes = {
        "source": dataset.source_hash,
        "data": dataset.data_hash,
        "featureSchema": dataset.feature_schema_hash,
        "targetSchema": _target_schema_hash(dataset, config),
        "sourceMissingnessLedger": str(
            dataset.audits["source_missingness_ledger_sha256"]
        ),
    }
    if observed_hashes != manifest.get("dataHashes"):
        raise RuntimeError("source, data, feature, target, or missingness hash changed after freeze")
    if _source_object_ledger(dataset) != manifest.get("sourceObjects"):
        raise RuntimeError("source-object ledger changed after freeze")
    if [_jsonable(spec) for spec in specs] != manifest.get("expectedSpecs"):
        raise RuntimeError("candidate or falsification spec list changed after freeze")
    if _freeze_scientific_contract(config) != manifest.get("scientificContract"):
        raise RuntimeError("randomization, quantile, or resampling contract changed after freeze")


def verify_module_two_freeze(
    config_path: Path,
    cache_dir: Path,
    output_dir: Path,
) -> dict[str, Any]:
    """Verify the append-only freeze without fitting or scoring a candidate."""

    from model_lab_module_two_data import build_module_two_dataset

    config = _load_config(config_path)
    protocol_path = REPOSITORY_ROOT / "docs" / "MODEL_LAB_MODULE_2_PROTOCOL.md"
    manifest, manifest_hash = _load_and_verify_freeze_before_source_build(
        config_path, protocol_path, output_dir, config
    )
    dataset = build_module_two_dataset(config, cache_dir)
    specs = _model_specs(dataset, config)
    _verify_freeze_after_source_build(manifest, dataset, specs, config)
    return {
        "version": config["version"],
        "manifestSha256": manifest_hash,
        "verified": True,
        "historicalCandidateScoresComputed": False,
    }


_OPERATIONAL_METADATA_KEYS = frozenset(
    {
        "artifactHashes",
        "createdAt",
        "generatedAt",
        "meanRuntimeSeconds",
        "runtimeSeconds",
        "runtimeSecondsByCandidate",
        "runtime_seconds",
    }
)


def _without_operational_metadata(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {
            str(key): _without_operational_metadata(item)
            for key, item in value.items()
            if str(key) not in _OPERATIONAL_METADATA_KEYS
        }
    if isinstance(value, (list, tuple)):
        return [_without_operational_metadata(item) for item in value]
    if isinstance(value, np.generic):
        return value.item()
    return value


def _scientific_hash_bundle(
    forecasts: Sequence[Mapping[str, Any]],
    metric_frame: pd.DataFrame,
    scorecards: Mapping[str, Any],
    uncertainty: Mapping[str, Any],
    audit: Mapping[str, Any],
    result: Mapping[str, Any],
) -> dict[str, str]:
    payloads = {
        "retrospectiveForecasts": list(forecasts),
        "metricRows": metric_frame.to_dict("records"),
        "rollingOriginScorecard": scorecards,
        "pairedUncertainty": uncertainty,
        "audit": audit,
        "result": result,
    }
    stripped = {
        name: _without_operational_metadata(payload)
        for name, payload in payloads.items()
    }
    component_hashes = {
        name: _exact_hash(payload) for name, payload in stripped.items()
    }
    return {
        **component_hashes,
        "bundle": _exact_hash(component_hashes),
    }


def run_module_two(
    config_path: Path,
    cache_dir: Path,
    output_dir: Path,
    show_progress: bool = True,
) -> dict[str, Any]:
    from model_lab_module_two_data import build_module_two_dataset, run_data_self_tests

    config = _load_config(config_path)
    protocol_path = REPOSITORY_ROOT / "docs" / "MODEL_LAB_MODULE_2_PROTOCOL.md"
    freeze_manifest, freeze_manifest_hash = _load_and_verify_freeze_before_source_build(
        config_path, protocol_path, output_dir, config
    )
    data_tests = run_data_self_tests(config, cache_dir)
    model_tests = run_model_self_tests()
    runner_tests = _runner_self_tests(config)
    dataset = build_module_two_dataset(config, cache_dir)
    specs = _model_specs(dataset, config)
    _verify_freeze_after_source_build(freeze_manifest, dataset, specs, config)
    games = _assemble_games(dataset, config)
    data_audit = _validate_dataset(dataset, games, config)

    code_hash, code_files = _code_hashes()
    hashes = {
        "config": _file_hash(config_path),
        "protocol": _file_hash(protocol_path),
        "code": code_hash,
        "source": dataset.source_hash,
        "data": dataset.data_hash,
        "feature_schema": dataset.feature_schema_hash,
        "target_schema": _target_schema_hash(dataset, config),
        "freeze_manifest": freeze_manifest_hash,
    }

    forecasts, metric_frame, failures, runtime = _run_weekly_forecasts(
        games, dataset, specs, config, hashes, show_progress
    )
    expected = _expected_manifest(games, config)
    manifest_audit = _manifest_audit(metric_frame, specs, expected)
    development = set(config["forecastContract"]["developmentSeasons"])
    confirmation = int(config["forecastContract"]["retrospectiveConfirmationSeason"])
    evaluation_failures = [
        item for item in failures if int(item["season"]) in development | {confirmation}
    ]
    alignment_values = [
        float(item["maximumAbsoluteDifference"])
        for item in runtime["baselineBuilderAlignment"]
    ]
    structural_tests = {
        "data": data_tests,
        "model": model_tests,
        "runner": runner_tests,
        "baselineBuilderAlignmentMaximum": max(alignment_values, default=None),
    }
    structural_suite_status = _structural_suite_schema_status(structural_tests)
    baseline_alignment_passed = (
        structural_tests["baselineBuilderAlignmentMaximum"] is not None
        and float(structural_tests["baselineBuilderAlignmentMaximum"]) <= 1e-10
    )
    protocol_valid = (
        bool(manifest_audit["passed"])
        and not evaluation_failures
        and bool(data_audit["passed"])
        and all(structural_suite_status.values())
        and baseline_alignment_passed
    )
    if not protocol_valid:
        reasons: list[str] = []
        if not manifest_audit["passed"]:
            reasons.append("common scored manifest is incomplete")
        if evaluation_failures:
            reasons.append("one or more expected candidate origins failed")
        if not data_audit["passed"]:
            reasons.append("data audit did not pass")
        if not all(structural_suite_status.values()):
            reasons.append("one or more structural self-test suites did not explicitly pass")
        if not baseline_alignment_passed:
            reasons.append("P0/P1 builder alignment did not pass")
        return _write_protocol_invalid_terminal(
            output_dir,
            version=config["version"],
            stage="post_forecast_common_manifest",
            reason="; ".join(reasons),
            hashes=hashes,
            audit_details={
                "manifest": manifest_audit,
                "failures": failures,
                "evaluationFailures": evaluation_failures,
                "data": data_audit,
                "structuralTests": structural_tests,
                "structuralSuiteStatus": structural_suite_status,
                "runtime": runtime,
                "partialForecastRowsHeldNonselecting": int(len(forecasts)),
                "partialMetricRowsHeldNonselecting": int(len(metric_frame)),
            },
        )

    development_ledger_l3 = _build_bootstrap_index_ledger(
        metric_frame, config, 3
    )
    confirmation_ledger = _build_bootstrap_index_ledger(
        metric_frame, config, 3, period="confirmation_2025"
    )
    calibration_ledgers = {
        "development": development_ledger_l3,
        "confirmation_2025": confirmation_ledger,
    }
    scorecards = _aggregate_scorecards(
        metric_frame, specs, config, runtime, calibration_ledgers
    )

    primary_comparisons = {
        "p1_minus_p0": (P0, P1),
        "p2_minus_p0": (P0, P2),
        "p2_minus_p1": (P1, P2),
    }
    primary_uncertainty: dict[str, Any] = {}
    development_ledger_summaries: dict[str, Any] = {}
    for length in (1, 3, 6):
        ledger = (
            development_ledger_l3
            if length == 3
            else _build_bootstrap_index_ledger(metric_frame, config, length)
        )
        development_ledger_summaries[f"development_L{length}"] = (
            _bootstrap_ledger_summary(ledger)
        )
        primary_uncertainty[str(length)] = _bootstrap_family(
            metric_frame,
            primary_comparisons,
            "primary_candidates",
            config,
            ledger,
        )
        if length != 3:
            del ledger
    p1_ablation_comparisons = {
        f"p1_{variant}_minus_full": (P1, f"ablation::{P1}::{variant}")
        for variant in config["ablations"][P1]
    }
    p2_ablation_comparisons = {
        f"p2_{variant}_minus_full": (P2, f"ablation::{P2}::{variant}")
        for variant in config["ablations"][P2]
    }
    control_comparisons = {
        "p2_noise_control_minus_full": (P2, f"negative_control::{P2}::deterministic_noise"),
        "p2_shuffle_control_minus_full": (P2, f"negative_control::{P2}::shuffle_team_identity"),
    }
    p1_ablations = _bootstrap_family(
        metric_frame,
        p1_ablation_comparisons,
        "p1_ablations",
        config,
        development_ledger_l3,
    )
    p2_ablations = _bootstrap_family(
        metric_frame,
        p2_ablation_comparisons,
        "p2_ablations",
        config,
        development_ledger_l3,
    )
    controls = _bootstrap_family(
        metric_frame,
        control_comparisons,
        "p2_negative_controls",
        config,
        development_ledger_l3,
    )
    gate = _gate_candidates(
        scorecards, primary_uncertainty, p1_ablations, p2_ablations,
        controls, config, True,
    )
    audit = {
        "protocolValid": protocol_valid,
        "data": data_audit,
        "manifest": manifest_audit,
        "failures": failures,
        "evaluationFailures": evaluation_failures,
        "structuralTests": structural_tests,
        "structuralSuiteStatus": structural_suite_status,
        "runtime": runtime,
        "sourceAudits": _jsonable(dataset.audits),
        "exclusions": _jsonable(dataset.exclusions),
        "missingness": _jsonable(dataset.missingness),
        "freeze": {
            "verified": True,
            "manifestSha256": freeze_manifest_hash,
            "configProtocolCodeAndDependencyVerifiedBeforeSourceBuild": True,
            "sourceDataSchemasAndSpecsVerifiedBeforeCandidateFit": True,
        },
        "leakage": {
            "sameWeekResidualIsolation": runtime["sameWeekResidualIsolation"],
            "wholeWeekResidualBoundary": runtime["wholeWeekResidualBoundary"],
            "marketFieldsMaterialized": False,
            "moduleOneOutputsMaterialized": False,
            "overtimeInPrimaryTarget": False,
            "historicalAvailability": dataset.historical_availability,
        },
    }
    uncertainty = {
        "bootstrapIndexLedgers": development_ledger_summaries
        | {
            "confirmation_2025_L3": _bootstrap_ledger_summary(confirmation_ledger)
        },
        "primary": primary_uncertainty,
        "p1Ablations": p1_ablations,
        "p2Ablations": p2_ablations,
        "negativeControls": controls,
    }
    result = {
        "version": config["version"],
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "decision": gate,
        "hashes": hashes,
        "forecastCount": len(forecasts),
        "metricRowCount": int(len(metric_frame)),
    }

    _write_jsonl_gzip_atomic(output_dir / "retrospective-forecasts.jsonl.gz", forecasts)
    _write_jsonl_gzip_atomic(output_dir / "metric-rows.jsonl.gz", metric_frame.to_dict("records"))
    _write_json_atomic(output_dir / "rolling-origin-scorecard.json", scorecards)
    _write_json_atomic(output_dir / "paired-uncertainty.json", uncertainty)
    _write_json_atomic(output_dir / "audit.json", audit)
    _write_json_atomic(output_dir / "result.json", result)
    _write_text_atomic(output_dir / "RESULT.md", _result_markdown(gate, scorecards, hashes))
    scientific_hashes = _scientific_hash_bundle(
        forecasts, metric_frame, scorecards, uncertainty, audit, result
    )
    _write_json_atomic(output_dir / "scientific-hashes.json", scientific_hashes)
    artifact_hashes = {
        path.name: _file_hash(path)
        for path in sorted(output_dir.iterdir())
        if path.is_file() and path.name != "artifact-hashes.json"
    }
    _write_json_atomic(output_dir / "artifact-hashes.json", artifact_hashes)
    result["artifactHashes"] = artifact_hashes
    return result


def _parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--no-progress", action="store_true")
    parser.add_argument("--self-test-only", action="store_true")
    parser.add_argument("--prepare-freeze-only", action="store_true")
    parser.add_argument("--verify-freeze-only", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)
    config_path = args.config.resolve()
    output_dir = args.output_dir.resolve()
    try:
        config = _load_config(config_path)
        selected_modes = sum(
            bool(value)
            for value in (
                args.self_test_only,
                args.prepare_freeze_only,
                args.verify_freeze_only,
            )
        )
        if selected_modes > 1:
            raise ValueError("select only one Module 2 non-scoring runner mode")
        if args.self_test_only:
            from model_lab_module_two_data import run_data_self_tests

            payload = {
                "data": run_data_self_tests(config, args.cache_dir.resolve()),
                "model": run_model_self_tests(),
                "runner": _runner_self_tests(config),
            }
            if not all(_structural_suite_schema_status(payload).values()):
                raise RuntimeError("A Module 2 structural self-test lacked an explicit pass")
            print(json.dumps(_jsonable(payload), indent=2, sort_keys=True))
            return 0
        if args.prepare_freeze_only:
            result = prepare_module_two_freeze(
                config_path, args.cache_dir.resolve(), output_dir
            )
            print(json.dumps(_jsonable(result), indent=2, sort_keys=True))
            return 0
        if args.verify_freeze_only:
            result = verify_module_two_freeze(
                config_path, args.cache_dir.resolve(), output_dir
            )
            print(json.dumps(_jsonable(result), indent=2, sort_keys=True))
            return 0
        result = run_module_two(
            config_path,
            args.cache_dir.resolve(),
            output_dir,
            show_progress=not args.no_progress,
        )
        print(json.dumps(_jsonable(result), indent=2, sort_keys=True))
        return 2 if result.get("decision", {}).get("result") == "protocol_invalid" else 0
    except Exception as error:
        version = "unavailable"
        failure_hashes: dict[str, str] = {}
        try:
            raw_config = json.loads(config_path.read_text(encoding="utf-8"))
            version = str(raw_config.get("version", version))
            failure_hashes["config"] = _file_hash(config_path)
        except Exception:
            pass
        protocol_path = REPOSITORY_ROOT / "docs" / "MODEL_LAB_MODULE_2_PROTOCOL.md"
        if protocol_path.is_file():
            failure_hashes["protocol"] = _file_hash(protocol_path)
        try:
            failure_hashes["code"] = _code_hashes()[0]
        except Exception:
            pass
        reason = f"{type(error).__name__}: {error}"
        existing_scored_artifacts = sorted(
            name
            for name in _existing_output_files(output_dir)
            if name in SCORED_ARTIFACT_NAMES
        )
        if existing_scored_artifacts:
            notice_payload = {
                "version": version,
                "decision": {
                    "result": "protocol_invalid",
                    "stage": "top_level_exception",
                    "reason": reason,
                },
                "existingScoredArtifacts": existing_scored_artifacts,
                "priorReplayPreserved": True,
                "hashes": failure_hashes,
                "exception": {
                    "type": type(error).__name__,
                    "message": str(error),
                },
            }
            notice_path = _write_nonoverwriting_failure_notice(
                output_dir, notice_payload
            )
            notice_payload["noticePath"] = str(notice_path)
            print(reason, file=sys.stderr, flush=True)
            print(json.dumps(_jsonable(notice_payload), indent=2, sort_keys=True))
            return 2
        result = _write_protocol_invalid_terminal(
            output_dir,
            version=version,
            stage="top_level_exception",
            reason=reason,
            hashes=failure_hashes,
            audit_details={"exceptionType": type(error).__name__, "exceptionMessage": str(error)},
        )
        print(reason, file=sys.stderr, flush=True)
        print(json.dumps(_jsonable(result), indent=2, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
