"""Deterministic, market-free primitives for Model Laboratory Module 2.

This module deliberately owns no data acquisition, replay schedule, artifact
publication, or production integration.  It receives an allowlisted game frame
whose rows are already known to be eligible at a forecast origin.  A separate
runner is responsible for constructing weekly point-in-time features and for
maintaining candidate-specific *prequential* residual ledgers.

The implementation follows ``model-lab-module-two.config.json`` version 6:

* P0 is a fold-only league home/away mean.
* P1 is the frozen four-game partially pooled offense/defense blend.
* P2 is a weighted two-output ridge adjustment to prequential P0 offsets.
* Every candidate uses the same paired residual-kernel joint PMF.

There are intentionally no sportsbook, pick, confidence, or Module 1 imports.
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
import math
from typing import Any, Iterable, Mapping, Sequence

import numpy as np
import pandas as pd


EPSILON = 1e-12
_P0 = "p0_league_season_naive"
_P1 = "p1_partially_pooled_rates"
_P2 = "p2_regularized_joint_count"
_CANDIDATE_ALIASES = {
    "p0": _P0,
    _P0: _P0,
    "p1": _P1,
    _P1: _P1,
    "p2": _P2,
    _P2: _P2,
}


def _jsonable(value: Any) -> Any:
    """Convert numpy/pandas values to a stable JSON representation."""

    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        value = float(value)
        if not math.isfinite(value):
            return str(value)
        return value
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, Mapping):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    return value


def stable_hash(value: Any) -> str:
    """Return a deterministic SHA-256 hash for JSON-compatible content."""

    payload = json.dumps(
        _jsonable(value), sort_keys=True, separators=(",", ":"), default=str
    )
    return sha256(payload.encode("utf-8")).hexdigest()


def _array_hash(value: Any) -> str:
    """Hash exact numeric bytes together with dtype and shape, without rounding."""

    array = np.ascontiguousarray(np.asarray(value))
    digest = sha256()
    digest.update(str(array.dtype).encode("utf-8"))
    digest.update(json.dumps(list(array.shape), separators=(",", ":")).encode("utf-8"))
    digest.update(array.tobytes(order="C"))
    return digest.hexdigest()


def season_weights(
    seasons: np.ndarray,
    origin_season: int,
    half_life: float,
    no_decay: bool = False,
    season_multipliers: Mapping[int | str, float] | None = None,
) -> np.ndarray:
    """Frozen exponential season weights, including configured era multipliers."""

    values = np.asarray(seasons, dtype=int)
    if values.ndim != 1:
        raise ValueError("Module 2 season weights require a one-dimensional array")
    if half_life <= 0 or not math.isfinite(float(half_life)):
        raise ValueError("Module 2 season-decay half-life must be positive and finite")
    if np.any(values > int(origin_season)):
        raise ValueError("Module 2 received a season after the forecast origin")
    if no_decay:
        weights = np.ones(len(values), dtype=float)
    else:
        weights = np.power(
            0.5,
            np.maximum(0, int(origin_season) - values) / float(half_life),
        ).astype(float)
    for season, multiplier in (season_multipliers or {}).items():
        numeric_multiplier = float(multiplier)
        if numeric_multiplier < 0 or not math.isfinite(numeric_multiplier):
            raise ValueError("Module 2 season multipliers must be finite and nonnegative")
        weights[values == int(season)] *= numeric_multiplier
    if not np.isfinite(weights).all() or np.any(weights < 0):
        raise ValueError("Module 2 produced invalid season weights")
    return weights


@dataclass(frozen=True)
class WeightedFoldScaler:
    """Training-fold-only weighted imputation and standardization artifact."""

    names: tuple[str, ...]
    imputation_values: np.ndarray
    centers: np.ndarray
    scales: np.ndarray
    missing_counts: np.ndarray
    scaler_hash: str

    def transform(self, frame: pd.DataFrame) -> np.ndarray:
        missing = [name for name in self.names if name not in frame.columns]
        if missing:
            raise ValueError(f"Module 2 transform is missing columns: {missing}")
        if not self.names:
            return np.empty((len(frame), 0), dtype=float)
        matrix = frame.loc[:, list(self.names)].apply(pd.to_numeric, errors="coerce").to_numpy(float)
        finite = np.isfinite(matrix)
        matrix = np.where(finite, matrix, self.imputation_values[None, :])
        transformed = (matrix - self.centers[None, :]) / self.scales[None, :]
        if not np.isfinite(transformed).all():
            raise ValueError("Module 2 fold transform produced a nonfinite value")
        return transformed


def fit_weighted_fold_scaler(
    frame: pd.DataFrame,
    names: Sequence[str],
    weights: np.ndarray,
    variance_floor: float = 1e-12,
    minimum_scale: float = 1e-6,
) -> WeightedFoldScaler:
    """Fit weighted means/scales with imputation values learned in this fold only.

    Missing indicators are not invented here: they are part of the runner's
    frozen feature schema.  This routine replaces a nonfinite feature value by
    that feature's weighted training-fold mean before scaling.
    """

    ordered = tuple(str(name) for name in names)
    if len(set(ordered)) != len(ordered):
        raise ValueError("Module 2 scaler feature names must be unique")
    if len(weights) != len(frame):
        raise ValueError("Module 2 scaler weights do not match the training frame")
    numeric_weights = np.asarray(weights, dtype=float)
    if (
        numeric_weights.ndim != 1
        or not np.isfinite(numeric_weights).all()
        or np.any(numeric_weights < 0)
        or float(numeric_weights.sum()) <= 0
    ):
        raise ValueError("Module 2 scaler requires finite nonnegative weights with positive mass")
    missing = [name for name in ordered if name not in frame.columns]
    if missing:
        raise ValueError(f"Module 2 scaler is missing columns: {missing}")
    if not ordered:
        artifact = {
            "names": [],
            "imputationValues": [],
            "centers": [],
            "scales": [],
            "missingCounts": [],
        }
        return WeightedFoldScaler(
            ordered,
            np.array([], dtype=float),
            np.array([], dtype=float),
            np.array([], dtype=float),
            np.array([], dtype=int),
            stable_hash(artifact),
        )

    matrix = frame.loc[:, list(ordered)].apply(pd.to_numeric, errors="coerce").to_numpy(float)
    finite = np.isfinite(matrix)
    positive = numeric_weights > 0
    imputation = np.empty(len(ordered), dtype=float)
    for index in range(len(ordered)):
        usable = finite[:, index] & positive
        if not usable.any():
            raise ValueError(
                f"Module 2 cannot learn a fold prior for all-missing feature {ordered[index]!r}"
            )
        denominator = float(numeric_weights[usable].sum())
        imputation[index] = float(
            np.dot(matrix[usable, index], numeric_weights[usable]) / denominator
        )
    imputed = np.where(finite, matrix, imputation[None, :])
    total_weight = float(numeric_weights.sum())
    centers = np.sum(imputed * numeric_weights[:, None], axis=0) / total_weight
    variance = (
        np.sum(((imputed - centers[None, :]) ** 2) * numeric_weights[:, None], axis=0)
        / total_weight
    )
    scales = np.sqrt(np.maximum(variance, float(variance_floor)))
    scales[scales < float(minimum_scale)] = 1.0
    if not (np.isfinite(imputation).all() and np.isfinite(centers).all() and np.isfinite(scales).all()):
        raise ValueError("Module 2 scaler learned a nonfinite transform")
    artifact = {
        "names": ordered,
        "imputationValues": imputation,
        "centers": centers,
        "scales": scales,
        "missingCounts": (~finite).sum(axis=0),
        "weightHash": _array_hash(numeric_weights),
    }
    return WeightedFoldScaler(
        ordered,
        imputation,
        centers,
        scales,
        (~finite).sum(axis=0).astype(int),
        stable_hash(artifact),
    )


@dataclass(frozen=True)
class P0Fit:
    candidate: str
    league_mean: float
    home_adjustment: float
    prediction_bounds: tuple[float, float]
    origin_season: int
    origin_week: int
    training_rows: int
    include_home: bool
    fit_hash: str


@dataclass(frozen=True)
class P1Fit:
    candidate: str
    league_mean: float
    home_adjustment: float
    offense_rates: Mapping[str, float]
    defense_rates: Mapping[str, float]
    prior_games: float
    prediction_bounds: tuple[float, float]
    origin_season: int
    origin_week: int
    training_rows: int
    include_home: bool
    component_mode: str
    fit_hash: str


@dataclass(frozen=True)
class P2Fit:
    candidate: str
    beta: np.ndarray
    scaler: WeightedFoldScaler
    engineered_feature_names: tuple[str, ...]
    selected_base_features: tuple[str, ...]
    include_p1_means: bool
    include_home_context: bool
    include_deterministic_noise: bool
    p0_fit: P0Fit
    p1_fit: P1Fit
    ridge_penalty: float
    prediction_bounds: tuple[float, float]
    origin_season: int
    origin_week: int
    training_rows: int
    fit_hash: str


CandidateFit = P0Fit | P1Fit | P2Fit


def _candidate_name(candidate: str) -> str:
    try:
        return _CANDIDATE_ALIASES[str(candidate).lower()]
    except KeyError as error:
        raise ValueError(f"Unknown Module 2 candidate: {candidate!r}") from error


def _target_columns(config: Mapping[str, Any]) -> tuple[str, str]:
    targets = tuple(config["target"]["primary"])
    if len(targets) != 2:
        raise ValueError("Module 2 requires exactly two primary target columns")
    return str(targets[0]), str(targets[1])


def _required_game_columns(frame: pd.DataFrame, config: Mapping[str, Any]) -> tuple[str, str]:
    target_home, target_away = _target_columns(config)
    required = {"season", "week", "home_team", "away_team", target_home, target_away}
    missing = sorted(required.difference(frame.columns))
    if missing:
        raise ValueError(f"Module 2 training frame lacks required columns: {missing}")
    bounds = config["target"].get("integrityBounds")
    if bounds is not None:
        lower = int(bounds["hardMinimumObservedPerTeam"])
        upper = int(bounds["hardMaximumObservedPerTeam"])
        for name in (target_home, target_away):
            values = pd.to_numeric(frame[name], errors="coerce").to_numpy(float)
            if (
                not np.isfinite(values).all()
                or not np.equal(values, np.rint(values)).all()
                or np.any(values < lower)
                or np.any(values > upper)
            ):
                raise ValueError(
                    f"Module 2 target {name!r} violates the frozen integer integrity bounds"
                )
    return target_home, target_away


def _neutral_indicator(frame: pd.DataFrame) -> np.ndarray:
    if "is_neutral_site" in frame.columns:
        values = pd.to_numeric(frame["is_neutral_site"], errors="coerce").to_numpy(float)
        if not np.isfinite(values).all() or np.any((values < 0) | (values > 1)):
            raise ValueError("Module 2 neutral-site indicator must lie in [0, 1]")
        return values
    if "neutral_site" in frame.columns:
        values = pd.to_numeric(frame["neutral_site"], errors="coerce").to_numpy(float)
        if not np.isfinite(values).all() or np.any((values < 0) | (values > 1)):
            raise ValueError("Module 2 neutral-site indicator must lie in [0, 1]")
        return values
    if "location" in frame.columns:
        return frame["location"].astype(str).str.lower().eq("neutral").to_numpy(float)
    return np.zeros(len(frame), dtype=float)


def _origin(frame: pd.DataFrame) -> tuple[int, int]:
    """Resolve runner-supplied origin metadata, with a deterministic test fallback."""

    if "origin_season" in frame.attrs and "origin_week" in frame.attrs:
        origin = (int(frame.attrs["origin_season"]), int(frame.attrs["origin_week"]))
    elif {"forecast_origin_season", "forecast_origin_week"}.issubset(frame.columns):
        seasons = frame["forecast_origin_season"].dropna().unique()
        weeks = frame["forecast_origin_week"].dropna().unique()
        if len(seasons) != 1 or len(weeks) != 1:
            raise ValueError("Module 2 fit frame contains multiple forecast origins")
        origin = (int(seasons[0]), int(weeks[0]))
    else:
        raise ValueError(
            "Module 2 fit requires explicit origin_season/origin_week metadata"
        )
    invalid = frame["season"].astype(int).gt(origin[0]) | (
        frame["season"].astype(int).eq(origin[0])
        & frame["week"].astype(int).ge(origin[1])
    )
    if invalid.any():
        example = frame.loc[invalid, ["season", "week"]].iloc[0].to_dict()
        raise ValueError(
            f"Module 2 training row reaches/follows origin {origin[0]}-{origin[1]}: {example}"
        )
    return origin


def _model_weights(
    frame: pd.DataFrame,
    config: Mapping[str, Any],
    origin_season: int,
    no_decay: bool,
) -> np.ndarray:
    features = config["features"]
    return season_weights(
        frame["season"].to_numpy(int),
        origin_season,
        float(features["timeDecayHalfLifeSeasons"]),
        no_decay=no_decay,
        season_multipliers=features.get("observationWeightMultipliersBySeason", {}),
    )


def _weighted_mean(values: np.ndarray, weights: np.ndarray) -> float:
    values = np.asarray(values, dtype=float)
    weights = np.asarray(weights, dtype=float)
    usable = np.isfinite(values) & np.isfinite(weights) & (weights > 0)
    if not usable.any() or float(weights[usable].sum()) <= 0:
        raise ValueError("Module 2 weighted mean has no finite positive-weight rows")
    return float(np.dot(values[usable], weights[usable]) / weights[usable].sum())


def _league_location_parameters(
    frame: pd.DataFrame,
    weights: np.ndarray,
    target_home: str,
    target_away: str,
) -> tuple[float, float]:
    home = pd.to_numeric(frame[target_home], errors="coerce").to_numpy(float)
    away = pd.to_numeric(frame[target_away], errors="coerce").to_numpy(float)
    if not (np.isfinite(home).all() and np.isfinite(away).all()):
        raise ValueError("Module 2 training targets must be finite")
    league = _weighted_mean(np.concatenate((home, away)), np.tile(weights, 2))
    nonneutral = _neutral_indicator(frame) < 0.5
    if nonneutral.any() and float(weights[nonneutral].sum()) > 0:
        home_mean = _weighted_mean(home[nonneutral], weights[nonneutral])
        away_mean = _weighted_mean(away[nonneutral], weights[nonneutral])
        adjustment = 0.5 * (home_mean - away_mean)
    else:
        adjustment = 0.0
    return float(league), float(adjustment)


def _clip_means(values: np.ndarray, bounds: tuple[float, float]) -> tuple[np.ndarray, np.ndarray]:
    numeric = np.asarray(values, dtype=float)
    if not np.isfinite(numeric).all():
        raise ValueError("Module 2 prediction produced a nonfinite mean")
    lower, upper = bounds
    hits = (numeric < lower) | (numeric > upper)
    return np.clip(numeric, lower, upper), hits


def _fit_p0(
    train_games: pd.DataFrame,
    config: Mapping[str, Any],
    weights: np.ndarray,
    origin_season: int,
    origin_week: int,
    include_home: bool,
) -> P0Fit:
    target_home, target_away = _required_game_columns(train_games, config)
    nonneutral = _neutral_indicator(train_games) < 0.5
    historical = (
        train_games["season"].astype(int).lt(origin_season).to_numpy()
        & nonneutral
    )
    current = (
        train_games["season"].astype(int).eq(origin_season).to_numpy()
        & nonneutral
    )
    if not historical.any() or float(weights[historical].sum()) <= 0:
        raise ValueError(
            "Module 2 P0 cannot form its frozen historical league-season prior"
        )
    historical_home = _weighted_mean(
        train_games.loc[historical, target_home].to_numpy(float), weights[historical]
    )
    historical_away = _weighted_mean(
        train_games.loc[historical, target_away].to_numpy(float), weights[historical]
    )
    prior_games = float(config["features"]["leagueSeasonPriorGames"])
    if prior_games != 64.0:
        raise ValueError("Module 2 frozen P0 league-season prior must equal 64 games")
    current_weight = float(weights[current].sum())
    if current.any() and current_weight > 0:
        home_numerator = float(
            np.dot(train_games.loc[current, target_home].to_numpy(float), weights[current])
        )
        away_numerator = float(
            np.dot(train_games.loc[current, target_away].to_numpy(float), weights[current])
        )
        home_mean = (home_numerator + prior_games * historical_home) / (
            current_weight + prior_games
        )
        away_mean = (away_numerator + prior_games * historical_away) / (
            current_weight + prior_games
        )
    else:
        home_mean = historical_home
        away_mean = historical_away
    league = 0.5 * (home_mean + away_mean)
    adjustment = 0.5 * (home_mean - away_mean) if include_home else 0.0
    bounds = tuple(float(value) for value in config["distribution"]["predictionMeanBounds"])
    artifact = {
        "candidate": _P0,
        "leagueMean": league,
        "homeAdjustment": adjustment,
        "historicalHomePrior": historical_home,
        "historicalAwayPrior": historical_away,
        "leagueSeasonPriorGames": prior_games,
        "currentSeasonWeight": current_weight,
        "includeHome": include_home,
        "predictionBounds": bounds,
        "origin": [origin_season, origin_week],
        "trainingRows": len(train_games),
        "trainingHash": stable_hash(
            train_games.loc[:, ["season", "week", target_home, target_away]].to_dict("records")
        ),
        "weightHash": _array_hash(weights),
    }
    return P0Fit(
        _P0,
        league,
        adjustment,
        bounds,
        origin_season,
        origin_week,
        len(train_games),
        include_home,
        stable_hash(artifact),
    )


def _fit_p1(
    train_games: pd.DataFrame,
    config: Mapping[str, Any],
    weights: np.ndarray,
    origin_season: int,
    origin_week: int,
    include_home: bool,
    component_mode: str,
) -> P1Fit:
    target_home, target_away = _required_game_columns(train_games, config)
    league, adjustment = _league_location_parameters(
        train_games, weights, target_home, target_away
    )
    if not include_home:
        adjustment = 0.0
    prior_games = float(config["features"]["possessionPriorGames"])
    if prior_games != 4.0:
        raise ValueError("Module 2 frozen P1 possession prior must equal four games")
    if component_mode not in {"blend", "offense_rate_only", "opponent_allowed_rate_only"}:
        raise ValueError(f"Unknown Module 2 P1 component mode: {component_mode!r}")
    order_columns = tuple(
        str(value)
        for value in config["features"]["timeWeightDefinition"]["equalTimeOrder"]
    )
    missing_order = [name for name in order_columns if name not in train_games.columns]
    if missing_order:
        raise ValueError(
            f"Module 2 P1 lacks frozen latest-history order columns: {missing_order}"
        )
    history_games = int(config["features"]["teamHistoryWindowGames"])
    if history_games != 17:
        raise ValueError("Module 2 frozen P1 team-history window must equal 17 games")
    home_values = train_games[target_home].to_numpy(float)
    away_values = train_games[target_away].to_numpy(float)
    team_rows: list[dict[str, Any]] = []
    for position, (
        home_team,
        away_team,
        home_value,
        away_value,
        weight,
    ) in enumerate(
        zip(
            train_games["home_team"].astype(str),
            train_games["away_team"].astype(str),
            home_values,
            away_values,
            weights,
            strict=True,
        )
    ):
        order = {
            name: train_games.iloc[position][name]
            for name in order_columns
        }
        team_rows.append(
            {
                **order,
                "team": home_team,
                "offense": float(home_value),
                "defense": float(away_value),
                "weight": float(weight),
            }
        )
        team_rows.append(
            {
                **order,
                "team": away_team,
                "offense": float(away_value),
                "defense": float(home_value),
                "weight": float(weight),
            }
        )
    history = pd.DataFrame(team_rows)
    history = history.sort_values(
        [*order_columns, "team"], kind="mergesort"
    )
    history = history.groupby("team", sort=True, group_keys=False).tail(history_games)
    # Compute both weighted sums explicitly after the frozen latest-17 cut.
    rates: dict[str, dict[str, float]] = {}
    for team, group in history.groupby("team", sort=True):
        group_weights = group["weight"].to_numpy(float)
        rates[str(team)] = {
            "offenseSum": float(np.dot(group["offense"].to_numpy(float), group_weights)),
            "defenseSum": float(np.dot(group["defense"].to_numpy(float), group_weights)),
            "weight": float(group_weights.sum()),
        }
    offense_rates = {
        team: (values["offenseSum"] + prior_games * league)
        / (values["weight"] + prior_games)
        for team, values in rates.items()
    }
    defense_rates = {
        team: (values["defenseSum"] + prior_games * league)
        / (values["weight"] + prior_games)
        for team, values in rates.items()
    }
    bounds = tuple(float(value) for value in config["distribution"]["predictionMeanBounds"])
    artifact = {
        "candidate": _P1,
        "leagueMean": league,
        "homeAdjustment": adjustment,
        "includeHome": include_home,
        "componentMode": component_mode,
        "teamHistoryWindowGames": history_games,
        "latestHistoryHash": stable_hash(
            history.loc[
                :, [*order_columns, "team", "offense", "defense", "weight"]
            ].to_dict("records")
        ),
        "priorGames": prior_games,
        "offenseRates": offense_rates,
        "defenseRates": defense_rates,
        "predictionBounds": bounds,
        "origin": [origin_season, origin_week],
        "trainingRows": len(train_games),
        "weightHash": _array_hash(weights),
    }
    return P1Fit(
        _P1,
        league,
        adjustment,
        offense_rates,
        defense_rates,
        prior_games,
        bounds,
        origin_season,
        origin_week,
        len(train_games),
        include_home,
        component_mode,
        stable_hash(artifact),
    )


def _predict_p0(fit: P0Fit, target_games: pd.DataFrame) -> pd.DataFrame:
    neutral = _neutral_indicator(target_games)
    raw = np.column_stack(
        (
            fit.league_mean + fit.home_adjustment * (1.0 - neutral),
            fit.league_mean - fit.home_adjustment * (1.0 - neutral),
        )
    )
    means, hits = _clip_means(raw, fit.prediction_bounds)
    return _prediction_frame(target_games, fit.candidate, fit.fit_hash, means, hits)


def _predict_p1(fit: P1Fit, target_games: pd.DataFrame) -> pd.DataFrame:
    required = {"home_team", "away_team"}
    missing = sorted(required.difference(target_games.columns))
    if missing:
        raise ValueError(f"Module 2 target frame lacks required columns: {missing}")
    neutral = _neutral_indicator(target_games)
    raw = np.empty((len(target_games), 2), dtype=float)
    for index, (home_team, away_team) in enumerate(
        zip(
            target_games["home_team"].astype(str),
            target_games["away_team"].astype(str),
            strict=True,
        )
    ):
        home_offense = float(fit.offense_rates.get(home_team, fit.league_mean))
        away_offense = float(fit.offense_rates.get(away_team, fit.league_mean))
        home_defense = float(fit.defense_rates.get(home_team, fit.league_mean))
        away_defense = float(fit.defense_rates.get(away_team, fit.league_mean))
        adjustment = fit.home_adjustment * (1.0 - neutral[index])
        if fit.component_mode == "offense_rate_only":
            home_location = home_offense
            away_location = away_offense
        elif fit.component_mode == "opponent_allowed_rate_only":
            home_location = away_defense
            away_location = home_defense
        else:
            home_location = 0.5 * (home_offense + away_defense)
            away_location = 0.5 * (away_offense + home_defense)
        raw[index, 0] = home_location + adjustment
        raw[index, 1] = away_location - adjustment
    means, hits = _clip_means(raw, fit.prediction_bounds)
    return _prediction_frame(target_games, fit.candidate, fit.fit_hash, means, hits)


def _prediction_frame(
    target_games: pd.DataFrame,
    candidate: str,
    fit_hash: str,
    means: np.ndarray,
    hits: np.ndarray,
) -> pd.DataFrame:
    result = pd.DataFrame(
        {
            "mean_home": means[:, 0],
            "mean_away": means[:, 1],
            "home_bound_hit": hits[:, 0].astype(bool),
            "away_bound_hit": hits[:, 1].astype(bool),
            "candidate": candidate,
            "fit_hash": fit_hash,
        },
        index=target_games.index,
    )
    if "game_id" in target_games.columns:
        result.insert(0, "game_id", target_games["game_id"].astype(str).to_numpy())
    return result


def _expand_selected_features(
    feature_names: Sequence[str],
    config: Mapping[str, Any],
    variant: str | None = None,
) -> tuple[tuple[str, ...], bool, bool, bool]:
    groups = config["features"]["groups"]
    group_order = (
        "possession_rate",
        *tuple(config["candidates"][_P2]["orderedDesign"]["profileGroupOrder"]),
        "home_context",
    )
    allowed_groups = set(group_order)
    supplied = tuple(str(value) for value in feature_names)
    if not supplied:
        supplied = tuple(
            name
            for group in group_order
            for name in groups[group]
        )
    expanded: list[str] = []
    for value in supplied:
        if value in allowed_groups:
            for name in groups[value]:
                expanded.extend((str(name), f"{name}_missing"))
        else:
            expanded.append(value)
    expanded = list(dict.fromkeys(expanded))
    base_names = {str(name) for group in allowed_groups for name in groups[group]}
    allowed_names = base_names.union(f"{name}_missing" for name in base_names)
    # This is the only non-candidate feature admitted by the frozen negative
    # control.  Arbitrary noise names remain a hard failure.
    allowed_names.add("deterministic_noise")
    unknown = sorted(set(expanded).difference(allowed_names))
    if unknown:
        raise ValueError(f"Module 2 P2 received non-frozen feature names: {unknown}")
    if "deterministic_noise" in expanded and variant != "deterministic_noise":
        raise ValueError(
            "Module 2 deterministic noise is allowed only for its explicit negative-control variant"
        )
    forbidden = tuple(str(value).lower() for value in config["dataBoundary"]["forbiddenFieldPatterns"])
    offending = [
        name for name in expanded if any(pattern in name.lower() for pattern in forbidden)
    ]
    if offending:
        raise ValueError(f"Module 2 P2 feature list crosses the data boundary: {offending}")
    possession = set(str(name) for name in groups["possession_rate"])
    home_context = set(str(name) for name in groups["home_context"])
    include_p1 = bool(possession.intersection(expanded))
    include_home = bool(home_context.intersection(expanded))
    selected_set = set(expanded)
    if variant == "no_possession_rate":
        selected_set.difference_update(
            possession.union(f"{name}_missing" for name in possession)
        )
    group_removals = {
        "no_situation_neutral_pace": "situation_neutral_pace",
        "no_play_volume": "play_volume",
        "no_drive_duration": "drive_duration",
        "no_clock_stop": "clock_stop",
    }
    if variant in group_removals:
        removed = {
            str(name) for name in groups[group_removals[variant]]
        }
        selected_set.difference_update(
            removed.union(f"{name}_missing" for name in removed)
        )
    if variant == "no_home_context":
        selected_set.difference_update(home_context)
    if variant == "deterministic_noise":
        selected_set.add("deterministic_noise")
    profile_names = tuple(
        str(name)
        for group in config["candidates"][_P2]["orderedDesign"]["profileGroupOrder"]
        for name in groups[group]
        if str(name) in selected_set or f"{name}_missing" in selected_set
    )
    include_noise = "deterministic_noise" in selected_set
    include_p1 = bool(possession.intersection(selected_set))
    include_home = bool(home_context.intersection(selected_set))
    return profile_names, include_p1, include_home, include_noise


def _p1_component_mode(
    feature_names: Sequence[str], config: Mapping[str, Any]
) -> str:
    possession = tuple(
        str(value) for value in config["features"]["groups"]["possession_rate"]
    )
    supplied = {str(value) for value in feature_names}
    if not supplied or "possession_rate" in supplied:
        return "blend"
    has_offense = possession[0] in supplied or f"{possession[0]}_missing" in supplied
    has_allowed = possession[1] in supplied or f"{possession[1]}_missing" in supplied
    if has_offense and not has_allowed:
        return "offense_rate_only"
    if has_allowed and not has_offense:
        return "opponent_allowed_rate_only"
    return "blend"


def _engineer_p2_frame(
    frame: pd.DataFrame,
    selected_base_features: Sequence[str],
    include_p1_means: bool,
    include_home_context: bool,
    include_deterministic_noise: bool,
    p1_means: np.ndarray,
) -> pd.DataFrame:
    if p1_means.shape != (len(frame), 2):
        raise ValueError("Module 2 P1 mean matrix does not match the game frame")
    values: dict[str, np.ndarray] = {}
    if include_p1_means:
        values["p1_home_mean"] = p1_means[:, 0]
        values["p1_away_mean"] = p1_means[:, 1]
    for name in selected_base_features:
        home_name = f"home_{name}"
        away_name = f"away_{name}"
        home_missing_name = f"{home_name}_missing"
        away_missing_name = f"{away_name}_missing"
        missing = [
            column
            for column in (
                home_name,
                away_name,
                home_missing_name,
                away_missing_name,
            )
            if column not in frame.columns
        ]
        if missing:
            raise ValueError(f"Module 2 P2 frame lacks frozen profile columns: {missing}")
        home = pd.to_numeric(frame[home_name], errors="coerce").to_numpy(float)
        away = pd.to_numeric(frame[away_name], errors="coerce").to_numpy(float)
        valid = np.isfinite(home) & np.isfinite(away)
        average = np.full(len(frame), np.nan, dtype=float)
        difference = np.full(len(frame), np.nan, dtype=float)
        average[valid] = 0.5 * (home[valid] + away[valid])
        difference[valid] = home[valid] - away[valid]
        values[f"average__{name}"] = average
        values[f"difference__{name}"] = difference
        home_missing = pd.to_numeric(
            frame[home_missing_name], errors="coerce"
        ).to_numpy(float)
        away_missing = pd.to_numeric(
            frame[away_missing_name], errors="coerce"
        ).to_numpy(float)
        if (
            not np.isfinite(home_missing).all()
            or not np.isfinite(away_missing).all()
            or np.any((home_missing < 0) | (home_missing > 1))
            or np.any((away_missing < 0) | (away_missing > 1))
        ):
            raise ValueError(
                f"Module 2 P2 missing indicators for {name!r} must lie in [0, 1]"
            )
        values[f"average__{name}_missing"] = 0.5 * (
            home_missing + away_missing
        )
        values[f"difference__{name}_missing"] = home_missing - away_missing
    if include_deterministic_noise:
        noise_columns = ("home_deterministic_noise", "away_deterministic_noise")
        missing = [name for name in noise_columns if name not in frame.columns]
        if missing:
            raise ValueError(
                f"Module 2 deterministic-noise control lacks columns: {missing}"
            )
        home_noise = pd.to_numeric(
            frame[noise_columns[0]], errors="coerce"
        ).to_numpy(float)
        away_noise = pd.to_numeric(
            frame[noise_columns[1]], errors="coerce"
        ).to_numpy(float)
        if not (np.isfinite(home_noise).all() and np.isfinite(away_noise).all()):
            raise ValueError("Module 2 deterministic-noise control must be finite")
        values["average__deterministic_noise"] = 0.5 * (
            home_noise + away_noise
        )
        values["difference__deterministic_noise"] = home_noise - away_noise
    if include_home_context:
        values["is_neutral_site"] = _neutral_indicator(frame)
    return pd.DataFrame(values, index=frame.index)


def _solve_multi_output_ridge(
    design: np.ndarray,
    outcome: np.ndarray,
    weights: np.ndarray,
    ridge_penalty: float,
) -> np.ndarray:
    if design.ndim != 2 or outcome.ndim != 2 or outcome.shape[1] != 2:
        raise ValueError("Module 2 P2 requires a matrix design and two-column outcome")
    if len(design) != len(outcome) or len(outcome) != len(weights):
        raise ValueError("Module 2 P2 design, outcome, and weight lengths differ")
    if not (np.isfinite(design).all() and np.isfinite(outcome).all() and np.isfinite(weights).all()):
        raise ValueError("Module 2 P2 cannot fit nonfinite numerics")
    root = np.sqrt(np.maximum(weights, 0.0))
    weighted_design = design * root[:, None]
    weighted_outcome = outcome * root[:, None]
    penalty = np.full(design.shape[1], float(ridge_penalty), dtype=float)
    penalty[0] = 0.0  # Frozen unpenalized intercept.
    information = weighted_design.T @ weighted_design + np.diag(penalty)
    score = weighted_design.T @ weighted_outcome
    try:
        return np.linalg.solve(information, score)
    except np.linalg.LinAlgError:
        return np.linalg.lstsq(information, score, rcond=None)[0]


def _p2_training_design_inputs(
    train_games: pd.DataFrame,
    feature_names: Sequence[str],
    config: Mapping[str, Any],
    include_home: bool,
    variant: str | None,
) -> tuple[
    np.ndarray,
    tuple[str, ...],
    bool,
    bool,
    bool,
    pd.DataFrame,
    np.ndarray,
]:
    baseline_columns = (
        "p0_home_mean",
        "p0_away_mean",
        "p1_home_mean",
        "p1_away_mean",
    )
    missing = [column for column in baseline_columns if column not in train_games.columns]
    if missing:
        raise ValueError(
            "Module 2 P2 requires candidate means forecast before each training weekly block; "
            f"missing {missing}"
        )
    baselines = train_games.loc[:, list(baseline_columns)].apply(
        pd.to_numeric, errors="coerce"
    ).to_numpy(float)
    (
        selected,
        include_p1,
        feature_home_context,
        include_deterministic_noise,
    ) = _expand_selected_features(feature_names, config, variant)
    include_home_context = bool(include_home and feature_home_context)
    prehistory_season = min(
        int(value) for value in config["forecastContract"]["warmupSeasons"]
    )
    prehistory = train_games["season"].astype(int).eq(prehistory_season).to_numpy()
    engineering_frame = train_games.copy()
    prehistory_indicator_columns = [
        f"{side}_{name}_missing"
        for name in selected
        for side in ("home", "away")
        if f"{side}_{name}_missing" in engineering_frame.columns
    ]
    if prehistory_indicator_columns and prehistory.any():
        engineering_frame.loc[
            prehistory, prehistory_indicator_columns
        ] = 0.0
    engineered = _engineer_p2_frame(
        engineering_frame,
        selected,
        include_p1,
        include_home_context,
        include_deterministic_noise,
        baselines[:, 2:4],
    )
    finite_inputs = np.isfinite(baselines).all(axis=1) & np.isfinite(
        engineered.to_numpy(float)
    ).all(axis=1)
    unexpected_nonfinite = ~finite_inputs & ~prehistory
    if unexpected_nonfinite.any():
        example_columns = ["game_id", "season", "week"]
        example = train_games.loc[
            unexpected_nonfinite, example_columns
        ].iloc[0].to_dict()
        raise ValueError(
            "Module 2 P2 found a nonfinite prequential input after fixed prehistory: "
            f"{example}"
        )
    eligible = finite_inputs & ~prehistory
    return (
        baselines,
        selected,
        include_p1,
        include_home_context,
        include_deterministic_noise,
        engineered,
        eligible,
    )


def count_p2_training_eligible_rows(
    train_games: pd.DataFrame,
    feature_names: Sequence[str],
    config: Mapping[str, Any],
    include_home: bool = True,
    variant: str | None = None,
) -> int:
    """Count P2 regression rows without discarding P0/P1 prehistory inputs."""

    *_, eligible = _p2_training_design_inputs(
        train_games, feature_names, config, include_home, variant
    )
    return int(eligible.sum())


def _fit_p2(
    train_games: pd.DataFrame,
    feature_names: Sequence[str],
    config: Mapping[str, Any],
    weights: np.ndarray,
    origin_season: int,
    origin_week: int,
    include_home: bool,
    variant: str | None,
) -> P2Fit:
    target_home, target_away = _required_game_columns(train_games, config)
    (
        baselines,
        selected,
        include_p1,
        include_home_context,
        include_deterministic_noise,
        engineered,
        eligible,
    ) = _p2_training_design_inputs(
        train_games, feature_names, config, include_home, variant
    )
    eligible_rows = int(eligible.sum())
    minimum_rows = int(config["distribution"]["minimumBaseTrainingGames"])
    if eligible_rows < minimum_rows:
        raise ValueError(
            "Module 2 P2 lacks enough prior rows with stored finite prequential inputs: "
            f"{eligible_rows}/{minimum_rows}"
        )
    regression_games = train_games.loc[eligible].copy()
    regression_engineered = engineered.loc[eligible].copy()
    regression_weights = weights[eligible]
    regression_baselines = baselines[eligible]
    scaler = fit_weighted_fold_scaler(
        regression_engineered,
        tuple(regression_engineered.columns),
        regression_weights,
    )
    design = np.column_stack(
        (
            np.ones(eligible_rows, dtype=float),
            scaler.transform(regression_engineered),
        )
    )
    actual = regression_games.loc[:, [target_home, target_away]].to_numpy(float)
    p0_offset = regression_baselines[:, :2]
    ridge_penalty = float(config["candidates"][_P2]["ridgePenalty"])
    if ridge_penalty != 32.0:
        raise ValueError("Module 2 frozen P2 ridge penalty must equal 32")
    beta = _solve_multi_output_ridge(
        design, actual - p0_offset, regression_weights, ridge_penalty
    )
    p0_fit = _fit_p0(
        train_games, config, weights, origin_season, origin_week, True
    )
    p1_fit = _fit_p1(
        train_games,
        config,
        weights,
        origin_season,
        origin_week,
        True,
        "blend",
    )
    bounds = tuple(float(value) for value in config["distribution"]["predictionMeanBounds"])
    artifact = {
        "candidate": _P2,
        "origin": [origin_season, origin_week],
        "trainingRows": eligible_rows,
        "priorTargetRows": len(train_games),
        "ridgePenalty": ridge_penalty,
        "selectedBaseFeatures": selected,
        "includeP1Means": include_p1,
        "includeHomeContext": include_home_context,
        "offsetAndP1LocationRetained": True,
        "includeDeterministicNoise": include_deterministic_noise,
        "engineeredFeatureNames": tuple(engineered.columns),
        "scalerHash": scaler.scaler_hash,
        "beta": beta,
        "p0FitHash": p0_fit.fit_hash,
        "p1FitHash": p1_fit.fit_hash,
        "prequentialBaselineHash": _array_hash(regression_baselines),
        "eligibleRowHash": stable_hash(
            regression_games.loc[:, ["game_id", "season", "week"]].to_dict("records")
        ),
        "weightHash": _array_hash(regression_weights),
        "predictionBounds": bounds,
    }
    return P2Fit(
        _P2,
        beta,
        scaler,
        tuple(engineered.columns),
        selected,
        include_p1,
        include_home_context,
        include_deterministic_noise,
        p0_fit,
        p1_fit,
        ridge_penalty,
        bounds,
        origin_season,
        origin_week,
        eligible_rows,
        stable_hash(artifact),
    )


def fit_candidate(
    candidate: str,
    train_games: pd.DataFrame,
    feature_names: Sequence[str],
    config: Mapping[str, Any],
    include_home: bool = True,
    no_decay: bool = False,
    variant: str | None = None,
) -> CandidateFit:
    """Fit one frozen candidate to an already eligible training origin.

    The runner should set ``train_games.attrs['origin_season']`` and
    ``train_games.attrs['origin_week']``.  P2 additionally requires four
    prequential baseline-mean columns; full-fold reconstruction is prohibited.
    """

    if len(train_games) < int(config["distribution"]["minimumBaseTrainingGames"]):
        raise ValueError(
            "Module 2 candidate lacks the frozen minimum number of prior games"
        )
    name = _candidate_name(candidate)
    variant = None if variant is None else str(variant)
    allowed_variants = {
        _P0: {None, "no_home_context", "no_time_decay"},
        _P1: {
            None,
            "offense_rate_only",
            "opponent_allowed_rate_only",
            "no_home_context",
            "no_time_decay",
        },
        _P2: {
            None,
            "no_possession_rate",
            "no_situation_neutral_pace",
            "no_play_volume",
            "no_drive_duration",
            "no_clock_stop",
            "no_home_context",
            "no_time_decay",
            "deterministic_noise",
            "shuffle_team_identity",
        },
    }
    if variant not in allowed_variants[name]:
        raise ValueError(
            f"Variant {variant!r} is not frozen for Module 2 candidate {name}"
        )
    _required_game_columns(train_games, config)
    origin_season, origin_week = _origin(train_games)
    effective_no_decay = bool(no_decay or variant == "no_time_decay")
    weights = _model_weights(
        train_games, config, origin_season, effective_no_decay
    )
    p01_include_home = bool(include_home and variant != "no_home_context")
    if name == _P0:
        return _fit_p0(
            train_games,
            config,
            weights,
            origin_season,
            origin_week,
            p01_include_home,
        )
    if name == _P1:
        return _fit_p1(
            train_games,
            config,
            weights,
            origin_season,
            origin_week,
            p01_include_home,
            (
                variant
                if variant in {"offense_rate_only", "opponent_allowed_rate_only"}
                else _p1_component_mode(feature_names, config)
            ),
        )
    return _fit_p2(
        train_games,
        feature_names,
        config,
        weights,
        origin_season,
        origin_week,
        bool(include_home),
        variant,
    )


def predict_candidate(fit: CandidateFit, target_games: pd.DataFrame) -> pd.DataFrame:
    """Return home/away mean forecasts and numerical-bound diagnostics."""

    if isinstance(fit, P0Fit):
        return _predict_p0(fit, target_games)
    if isinstance(fit, P1Fit):
        return _predict_p1(fit, target_games)
    if not isinstance(fit, P2Fit):
        raise TypeError("Module 2 predict received an unknown fit artifact")
    p0_prediction = _predict_p0(fit.p0_fit, target_games)
    p1_prediction = _predict_p1(fit.p1_fit, target_games)
    p0_means = p0_prediction.loc[:, ["mean_home", "mean_away"]].to_numpy(float)
    p1_means = p1_prediction.loc[:, ["mean_home", "mean_away"]].to_numpy(float)
    engineered = _engineer_p2_frame(
        target_games,
        fit.selected_base_features,
        fit.include_p1_means,
        fit.include_home_context,
        fit.include_deterministic_noise,
        p1_means,
    )
    if tuple(engineered.columns) != fit.engineered_feature_names:
        raise ValueError("Module 2 P2 target feature schema differs from its fit schema")
    design = np.column_stack((np.ones(len(target_games), dtype=float), fit.scaler.transform(engineered)))
    raw = p0_means + design @ fit.beta
    means, hits = _clip_means(raw, fit.prediction_bounds)
    return _prediction_frame(target_games, fit.candidate, fit.fit_hash, means, hits)


def _residual_matrix(calibration_residuals: Any) -> tuple[np.ndarray, np.ndarray | None]:
    if isinstance(calibration_residuals, pd.DataFrame):
        frame = calibration_residuals.copy()
        if {"residual_home", "residual_away"}.issubset(frame.columns):
            matrix = frame.loc[:, ["residual_home", "residual_away"]].to_numpy(float)
        elif {"actual_home", "actual_away", "mean_home", "mean_away"}.issubset(frame.columns):
            matrix = np.column_stack(
                (
                    frame["actual_home"].to_numpy(float) - frame["mean_home"].to_numpy(float),
                    frame["actual_away"].to_numpy(float) - frame["mean_away"].to_numpy(float),
                )
            )
        else:
            raise ValueError(
                "Module 2 residual ledger requires residual_home/residual_away or actual/mean columns"
            )
        order: np.ndarray | None = None
        sort_columns = [name for name in ("season", "week", "game_id") if name in frame.columns]
        if {"season", "week"}.issubset(sort_columns):
            order = (
                frame.assign(__position=np.arange(len(frame)))
                .sort_values(sort_columns + ["__position"], kind="mergesort")["__position"]
                .to_numpy(int)
            )
            matrix = matrix[order]
        return matrix, order
    matrix = np.asarray(calibration_residuals, dtype=float)
    if matrix.ndim != 2 or matrix.shape[1] != 2:
        raise ValueError("Module 2 residuals must be an n-by-two matrix")
    return matrix, None


def joint_residual_pmf(
    mean_home: float,
    mean_away: float,
    calibration_residuals: Any,
    calibration_weights: Sequence[float],
    config: Mapping[str, Any],
) -> np.ndarray:
    """Build the frozen paired residual-kernel PMF on 0..24 plus 25+.

    ``calibration_residuals`` must come from this candidate's prior pregame
    forecast ledger.  The runner, not this function, releases a week's residuals
    only after the complete weekly block has been graded.
    """

    distribution = config["distribution"]
    residuals, order = _residual_matrix(calibration_residuals)
    weights = np.asarray(calibration_weights, dtype=float)
    if len(weights) != len(residuals):
        raise ValueError("Module 2 residual weights do not match the residual ledger")
    if order is not None:
        weights = weights[order]
    if not np.isfinite(residuals).all():
        raise ValueError("Module 2 residual ledger contains nonfinite residuals")
    if not np.isfinite(weights).all() or np.any(weights < 0) or float(weights.sum()) <= 0:
        raise ValueError("Module 2 residual weights must be finite, nonnegative, and nonempty")
    minimum = int(distribution["minimumPrequentialResidualGames"])
    maximum = int(distribution["prequentialResidualWindowGames"])
    if len(residuals) < minimum:
        raise ValueError(
            f"Module 2 residual ledger has {len(residuals)}/{minimum} required prior games"
        )
    if len(residuals) > maximum:
        raise ValueError(
            "Module 2 residual ledger exceeds the runner-owned whole-week window: "
            f"{len(residuals)}/{maximum}"
        )
    if float(weights.sum()) <= 0:
        raise ValueError("Module 2 retained residual window has no positive weight")
    offsets = np.asarray(distribution["residualKernelOffsets"], dtype=int)
    kernel = np.asarray(distribution["residualKernelWeights"], dtype=float)
    if offsets.tolist() != [-1, 0, 1] or not np.allclose(
        kernel, np.array([0.15, 0.70, 0.15]), atol=0.0, rtol=0.0
    ):
        raise ValueError("Module 2 residual kernel differs from the frozen protocol")
    if not math.isclose(float(kernel.sum()), 1.0, abs_tol=1e-15):
        raise ValueError("Module 2 residual kernel must sum to one")
    support = config["target"]["probabilitySupport"]
    if int(support["minimum"]) != 0 or int(support["maximumExact"]) != 24 or int(support["tailBucket"]) != 25:
        raise ValueError("Module 2 joint PMF support differs from the frozen 0..24+tail protocol")
    if not (math.isfinite(float(mean_home)) and math.isfinite(float(mean_away))):
        raise ValueError("Module 2 joint PMF means must be finite")
    tail = int(support["tailBucket"])
    pseudocount = float(distribution["jointCellPseudocount"])
    probability_floor = float(distribution["probabilityFloor"])
    if pseudocount != 0.0001 or probability_floor != 1e-12:
        raise ValueError("Module 2 joint smoothing constants differ from the frozen protocol")
    pmf = np.full((tail + 1, tail + 1), pseudocount, dtype=float)
    home_values = np.clip(
        _round_half_away_from_zero(
            float(mean_home) + residuals[:, 0, None] + offsets[None, :]
        ),
        0,
        tail,
    ).astype(int)
    away_values = np.clip(
        _round_half_away_from_zero(
            float(mean_away) + residuals[:, 1, None] + offsets[None, :]
        ),
        0,
        tail,
    ).astype(int)
    pair_weights = weights[:, None, None] * kernel[None, :, None] * kernel[None, None, :]
    home_index = np.broadcast_to(home_values[:, :, None], pair_weights.shape)
    away_index = np.broadcast_to(away_values[:, None, :], pair_weights.shape)
    np.add.at(pmf, (home_index.ravel(), away_index.ravel()), pair_weights.ravel())
    pmf = np.maximum(pmf, probability_floor)
    pmf /= float(pmf.sum())
    if not np.isfinite(pmf).all() or np.any(pmf <= 0) or not math.isclose(float(pmf.sum()), 1.0, abs_tol=1e-12):
        raise ValueError("Module 2 joint PMF failed normalization")
    return pmf


def _round_half_away_from_zero(values: np.ndarray) -> np.ndarray:
    numeric = np.asarray(values, dtype=float)
    return np.copysign(np.floor(np.abs(numeric) + 0.5), numeric)


def factorize_joint_pmf(pmf: np.ndarray) -> np.ndarray:
    """Frozen nonselecting diagnostic: product of the fitted PMF marginals."""

    matrix = _validate_pmf(pmf)
    factorized = np.outer(matrix.sum(axis=1), matrix.sum(axis=0))
    factorized /= factorized.sum()
    return factorized


def _validate_pmf(pmf: np.ndarray) -> np.ndarray:
    matrix = np.asarray(pmf, dtype=float)
    if matrix.shape != (26, 26):
        raise ValueError("Module 2 joint PMF must have frozen shape 26 by 26")
    if not np.isfinite(matrix).all() or np.any(matrix < 0):
        raise ValueError("Module 2 joint PMF contains invalid probability mass")
    if not math.isclose(float(matrix.sum()), 1.0, abs_tol=1e-10):
        raise ValueError("Module 2 joint PMF is not normalized")
    return matrix


def _grouped_probabilities(
    pmf: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    size = pmf.shape[0]
    home = pmf.sum(axis=1)
    away = pmf.sum(axis=0)
    home_grid, away_grid = np.meshgrid(np.arange(size), np.arange(size), indexing="ij")
    total = np.bincount(
        (home_grid + away_grid).ravel(), weights=pmf.ravel(), minlength=2 * size - 1
    )
    difference = np.bincount(
        (home_grid - away_grid + size - 1).ravel(),
        weights=pmf.ravel(),
        minlength=2 * size - 1,
    )
    return home, away, total, difference


def _discrete_crps(probabilities: np.ndarray, observation_index: int) -> float:
    index = int(np.clip(observation_index, 0, len(probabilities) - 1))
    observed_cdf = np.zeros(len(probabilities), dtype=float)
    observed_cdf[index:] = 1.0
    return float(np.sum((np.cumsum(probabilities) - observed_cdf) ** 2))


def _quantile(probabilities: np.ndarray, support: np.ndarray, probability: float) -> float:
    index = int(np.searchsorted(np.cumsum(probabilities), probability, side="left"))
    index = min(max(index, 0), len(probabilities) - 1)
    return float(support[index])


def _equal_tail_interval(
    probabilities: np.ndarray, support: np.ndarray, mass: float
) -> tuple[float, float]:
    alpha = 0.5 * (1.0 - mass)
    return (
        _quantile(probabilities, support, alpha),
        _quantile(probabilities, support, 1.0 - alpha),
    )


def _randomized_pit(
    probabilities: np.ndarray, observation_index: int, uniform: float
) -> float:
    index = int(np.clip(observation_index, 0, len(probabilities) - 1))
    below = float(probabilities[:index].sum())
    return float(below + uniform * probabilities[index])


def _seed(base_seed: int, seed_parts: Any, label: str) -> int:
    if isinstance(seed_parts, Mapping):
        if "game_id" not in seed_parts:
            raise ValueError("Module 2 randomization seed mapping requires game_id")
        game_id = str(seed_parts["game_id"])
    elif isinstance(seed_parts, str):
        game_id = seed_parts
    elif isinstance(seed_parts, Sequence) and not isinstance(seed_parts, (bytes, bytearray)):
        if len(seed_parts) != 1:
            raise ValueError(
                "Module 2 randomization seed may contain only game_id, never candidate identity"
            )
        game_id = str(seed_parts[0])
    else:
        raise ValueError("Module 2 randomization requires a game_id seed part")
    digest = stable_hash([int(base_seed), game_id, label])
    return int(digest[:16], 16) % (2**63 - 1)


def _validated_actual_count(
    value: Any, side: str, config: Mapping[str, Any]
) -> int:
    try:
        numeric = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"Module 2 actual {side} count is not numeric") from error
    bounds = config["target"]["integrityBounds"]
    lower = int(bounds["hardMinimumObservedPerTeam"])
    upper = int(bounds["hardMaximumObservedPerTeam"])
    if (
        not math.isfinite(numeric)
        or numeric != math.floor(numeric)
        or numeric < lower
        or numeric > upper
    ):
        raise ValueError(
            f"Module 2 actual {side} count violates frozen integer bounds [{lower}, {upper}]"
        )
    return int(numeric)


def evaluate_joint_pmf(
    pmf: np.ndarray,
    actual_home: int,
    actual_away: int,
    seed_parts: Any,
    config: Mapping[str, Any],
) -> dict[str, Any]:
    """Compute exact discrete diagnostics and the frozen Monte Carlo energy score."""

    matrix = _validate_pmf(pmf)
    actual_home = _validated_actual_count(actual_home, "home", config)
    actual_away = _validated_actual_count(actual_away, "away", config)
    support_config = config["target"]["probabilitySupport"]
    tail = int(support_config["tailBucket"])
    capped_home = int(np.clip(actual_home, 0, tail))
    capped_away = int(np.clip(actual_away, 0, tail))
    home, away, total, difference = _grouped_probabilities(matrix)
    side_support = np.arange(tail + 1)
    total_support = np.arange(2 * tail + 1)
    difference_support = np.arange(-tail, tail + 1)
    capped_total = capped_home + capped_away
    capped_difference = capped_home - capped_away
    total_index = capped_total
    difference_index = capped_difference + tail

    home_grid, away_grid = np.meshgrid(side_support, side_support, indexing="ij")
    predicted_home_mean = float(np.dot(side_support, home))
    predicted_away_mean = float(np.dot(side_support, away))
    home_variance = float(np.dot((side_support - predicted_home_mean) ** 2, home))
    away_variance = float(np.dot((side_support - predicted_away_mean) ** 2, away))
    within_covariance = float(
        np.sum(
            (home_grid - predicted_home_mean)
            * (away_grid - predicted_away_mean)
            * matrix
        )
    )

    distribution = config["distribution"]
    energy_pairs = int(distribution["energyScoreDrawPairs"])
    energy_seed = _seed(int(distribution["energyScoreSeed"]), seed_parts, "energy")
    rng = np.random.default_rng(energy_seed)
    cumulative = np.cumsum(matrix.ravel())
    cumulative[-1] = 1.0
    uniforms_first = rng.random(energy_pairs)
    uniforms_second = rng.random(energy_pairs)
    first = np.searchsorted(cumulative, uniforms_first, side="right")
    second = np.searchsorted(cumulative, uniforms_second, side="right")
    first_points = np.column_stack((first // 26, first % 26)).astype(float)
    second_points = np.column_stack((second // 26, second % 26)).astype(float)
    observed = np.array([capped_home, capped_away], dtype=float)
    energy_score = float(
        np.linalg.norm(first_points - observed, axis=1).mean()
        - 0.5 * np.linalg.norm(first_points - second_points, axis=1).mean()
    )

    pit_uniforms = np.array(
        [
            np.random.default_rng(
                _seed(
                    int(distribution["randomizedPitSeed"]),
                    seed_parts,
                    target,
                )
            ).random()
            for target in ("home", "away", "total", "difference")
        ],
        dtype=float,
    )
    result: dict[str, Any] = {
        "joint_negative_log_score": -math.log(
            max(float(distribution["probabilityFloor"]), float(matrix[capped_home, capped_away]))
        ),
        "multivariate_energy_score": energy_score,
        "home_crps": _discrete_crps(home, capped_home),
        "away_crps": _discrete_crps(away, capped_away),
        "total_crps": _discrete_crps(total, total_index),
        "difference_crps": _discrete_crps(difference, difference_index),
        "actual_home": actual_home,
        "actual_away": actual_away,
        "predicted_home_mean": predicted_home_mean,
        "predicted_away_mean": predicted_away_mean,
        "predicted_home_variance": home_variance,
        "predicted_away_variance": away_variance,
        "predicted_within_game_covariance": within_covariance,
        "predicted_covariance": within_covariance,
        "covariance": within_covariance,
        "home_absolute_error": abs(predicted_home_mean - actual_home),
        "away_absolute_error": abs(predicted_away_mean - actual_away),
        "home_mae": abs(predicted_home_mean - actual_home),
        "away_mae": abs(predicted_away_mean - actual_away),
        "home_squared_error": (predicted_home_mean - actual_home) ** 2,
        "away_squared_error": (predicted_away_mean - actual_away) ** 2,
        "pit_home": _randomized_pit(home, capped_home, float(pit_uniforms[0])),
        "pit_away": _randomized_pit(away, capped_away, float(pit_uniforms[1])),
        "pit_total": _randomized_pit(total, total_index, float(pit_uniforms[2])),
        "pit_difference": _randomized_pit(
            difference, difference_index, float(pit_uniforms[3])
        ),
    }
    grouped = {
        "home": (home, side_support, capped_home),
        "away": (away, side_support, capped_away),
        "total": (total, total_support, capped_total),
        "difference": (difference, difference_support, capped_difference),
    }
    for mass in (0.50, 0.80, 0.95):
        label = str(int(round(mass * 100)))
        for name, (probabilities, support, observed_value) in grouped.items():
            lower, upper = _equal_tail_interval(probabilities, support, mass)
            result[f"coverage_{label}_{name}"] = int(lower <= observed_value <= upper)
            result[f"width_{label}_{name}"] = float(upper - lower)
            result[f"interval_{label}_{name}"] = [lower, upper]
    result["intervals"] = {
        label: {
            target: result[f"interval_{label}_{target}"]
            for target in ("home", "away", "total", "difference")
        }
        for label in ("50", "80", "95")
    }

    flat = matrix.ravel()
    order = np.argsort(-flat, kind="mergesort")
    crossing = int(np.searchsorted(np.cumsum(flat[order]), 0.80, side="left"))
    threshold = float(flat[order[min(crossing, len(order) - 1)]])
    highest_density = flat >= threshold
    observed_flat_index = capped_home * 26 + capped_away
    result["joint_80_hds_coverage"] = int(bool(highest_density[observed_flat_index]))
    result["joint_80_hds_size"] = int(highest_density.sum())
    result["joint_80_hds_mass"] = float(flat[highest_density].sum())
    result["joint_80_highest_density_coverage"] = result[
        "joint_80_hds_coverage"
    ]
    result["joint_80_highest_density_size"] = result["joint_80_hds_size"]
    result["joint_80_set_size"] = result["joint_80_hds_size"]
    result["distribution_hash"] = _array_hash(matrix)
    return result


def _candidate_column(frame: pd.DataFrame) -> str:
    if "candidate" in frame.columns:
        return "candidate"
    if "family" in frame.columns:
        return "family"
    raise ValueError("Module 2 metric frame requires a candidate column")


def _metric_column(frame: pd.DataFrame, config: Mapping[str, Any]) -> str:
    configured = str(config["evaluation"]["primaryMetric"])
    if configured in frame.columns:
        return configured
    aliases = {
        "joint_negative_log_score": ("joint_log_score",),
        "multivariate_energy_score": ("energy_score",),
    }
    for alias in aliases.get(configured, ()):
        if alias in frame.columns:
            return alias
    raise ValueError(f"Module 2 metric frame lacks primary metric {configured!r}")


def _paired_difference_frame(
    metric_frame: pd.DataFrame,
    candidates: Sequence[str],
    metric: str,
) -> tuple[pd.DataFrame, list[str]]:
    names = [_candidate_name(value) for value in candidates]
    if len(names) < 2 or len(set(names)) != len(names):
        raise ValueError("Module 2 bootstrap requires one baseline and unique challengers")
    candidate_column = _candidate_column(metric_frame)
    keys = ["game_id", "season", "week"]
    missing = [name for name in [*keys, candidate_column, metric] if name not in metric_frame.columns]
    if missing:
        raise ValueError(f"Module 2 bootstrap frame lacks columns: {missing}")
    accepted_labels = set(names).union(name.split("_", 1)[0] for name in names)
    selected = metric_frame.loc[
        metric_frame[candidate_column].astype(str).str.lower().isin(accepted_labels),
        [*keys, candidate_column, metric],
    ].copy()
    selected[candidate_column] = selected[candidate_column].map(_candidate_name)
    if selected.duplicated([*keys, candidate_column]).any():
        raise ValueError("Module 2 bootstrap has duplicate game-candidate rows")
    manifests = {
        name: set(map(tuple, selected.loc[selected[candidate_column] == name, keys].to_numpy()))
        for name in names
    }
    if not manifests[names[0]] or any(manifests[name] != manifests[names[0]] for name in names[1:]):
        raise ValueError("Module 2 candidates do not share the exact game manifest")
    pivot = selected.pivot(index=keys, columns=candidate_column, values=metric)
    if any(name not in pivot.columns for name in names) or pivot[names].isna().any().any():
        raise ValueError("Module 2 bootstrap manifest contains a missing candidate loss")
    differences = pd.DataFrame(
        {name: pivot[names[0]] - pivot[name] for name in names[1:]},
        index=pivot.index,
    ).reset_index()
    return differences, names


def _week_blocks(weeks: Sequence[int], block_length: int, rng: np.random.Generator) -> list[int]:
    ordered = list(sorted(int(value) for value in weeks))
    if not ordered:
        raise ValueError("Module 2 bootstrap encountered a season without weeks")
    length = min(int(block_length), len(ordered))
    starts = np.arange(len(ordered) - length + 1)
    required = int(math.ceil(len(ordered) / length))
    sampled: list[int] = []
    for start in rng.choice(starts, size=required, replace=True):
        sampled.extend(ordered[int(start) : int(start) + length])
    return sampled[: len(ordered)]


def hierarchical_paired_bootstrap(
    metric_frame: pd.DataFrame,
    candidates: Sequence[str],
    config: Mapping[str, Any],
    block_length: int | None = None,
) -> dict[str, Any]:
    """Frozen paired season/contiguous-week bootstrap with simultaneous intervals."""

    evaluation = config["evaluation"]
    metric = _metric_column(metric_frame, config)
    differences, names = _paired_difference_frame(metric_frame, candidates, metric)
    challenger_names = names[1:]
    observed = differences.loc[:, challenger_names].mean().to_numpy(float)
    seasons = sorted(int(value) for value in differences["season"].unique())
    if not seasons:
        raise ValueError("Module 2 bootstrap has no seasons")
    length = int(
        evaluation["primaryWeekBlockLength"] if block_length is None else block_length
    )
    if length <= 0:
        raise ValueError("Module 2 bootstrap block length must be positive")
    members = int(evaluation["bootstrapMembers"])
    seed = int(evaluation["bootstrapSeed"])
    rng = np.random.default_rng(seed)
    by_season: dict[int, dict[int, tuple[np.ndarray, int]]] = {}
    for season in seasons:
        season_rows = differences.loc[differences["season"] == season]
        by_season[season] = {
            int(week): (
                group.loc[:, challenger_names].to_numpy(float).sum(axis=0),
                len(group),
            )
            for week, group in season_rows.groupby("week", sort=True)
        }
    draws = np.empty((members, len(challenger_names)), dtype=float)
    for member in range(members):
        total = np.zeros(len(challenger_names), dtype=float)
        count = 0
        for sampled_season in rng.choice(seasons, size=len(seasons), replace=True):
            week_map = by_season[int(sampled_season)]
            for week in _week_blocks(tuple(week_map), length, rng):
                week_sum, week_count = week_map[week]
                total += week_sum
                count += week_count
        if count <= 0:
            raise AssertionError("Module 2 bootstrap sampled no games")
        draws[member] = total / count
    deviations = draws - observed[None, :]
    mass = float(evaluation["simultaneousInterval"])
    critical = float(np.quantile(np.max(np.abs(deviations), axis=1), mass))
    output: dict[str, Any] = {
        "baseline": names[0],
        "metric": metric,
        "members": members,
        "seed": seed,
        "blockLengthWeeks": length,
        "simultaneousMass": mass,
        "seasons": seasons,
        "drawsHash": _array_hash(draws),
        "comparisons": {},
    }
    baseline_short = names[0].split("_", 1)[0]
    baseline_mean = float(
        metric_frame.loc[
            metric_frame[_candidate_column(metric_frame)]
            .astype(str)
            .str.lower()
            .isin({baseline_short, names[0]}),
            metric,
        ].mean()
    )
    for index, name in enumerate(challenger_names):
        season_deltas = differences.groupby("season", sort=True)[name].mean()
        leave_one_out = {
            str(season): float(differences.loc[differences["season"] != season, name].mean())
            for season in seasons
        }
        improvement = float(observed[index])
        output["comparisons"][name] = {
            "meanImprovement": improvement,
            "fractionalImprovement": improvement / baseline_mean if baseline_mean != 0 else None,
            "simultaneousInterval": [improvement - critical, improvement + critical],
            "bootstrapProbabilityOfImprovement": float(np.mean(draws[:, index] > 0)),
            "seasonDeltas": {str(key): float(value) for key, value in season_deltas.items()},
            "improvedSeasons": int((season_deltas > 0).sum()),
            "leaveOneSeasonOut": leave_one_out,
        }
    return output


def _linear_calibration(predicted: np.ndarray, observed: np.ndarray) -> dict[str, Any]:
    predicted = np.asarray(predicted, dtype=float)
    observed = np.asarray(observed, dtype=float)
    usable = np.isfinite(predicted) & np.isfinite(observed)
    if usable.sum() < 2 or float(np.var(predicted[usable])) < 1e-12:
        return {
            "intercept": None,
            "slope": None,
            "observations": int(usable.sum()),
            "status": "unidentifiable_constant_or_insufficient_prediction",
        }
    design = np.column_stack((np.ones(int(usable.sum())), predicted[usable]))
    coefficients = np.linalg.lstsq(design, observed[usable], rcond=None)[0]
    return {
        "intercept": float(coefficients[0]),
        "slope": float(coefficients[1]),
        "observations": int(usable.sum()),
        "status": "estimated",
    }


def _resample_frame_indices(
    frame: pd.DataFrame,
    members: int,
    seed: int,
    block_length: int,
) -> Iterable[np.ndarray]:
    seasons = sorted(int(value) for value in frame["season"].unique())
    by_season: dict[int, dict[int, np.ndarray]] = {
        season: {
            int(week): group.index.to_numpy(int)
            for week, group in frame.loc[frame["season"] == season].groupby("week", sort=True)
        }
        for season in seasons
    }
    rng = np.random.default_rng(seed)
    for _ in range(members):
        chunks: list[np.ndarray] = []
        for sampled_season in rng.choice(seasons, size=len(seasons), replace=True):
            week_map = by_season[int(sampled_season)]
            chunks.extend(week_map[week] for week in _week_blocks(tuple(week_map), block_length, rng))
        yield np.concatenate(chunks)


def _single_calibration_summary(
    forecasts: pd.DataFrame,
    config: Mapping[str, Any],
) -> dict[str, Any]:
    if forecasts.empty:
        raise ValueError("Module 2 calibration requires forecast rows")
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
    missing = sorted(required.difference(forecasts.columns))
    if missing:
        raise ValueError(f"Module 2 calibration frame lacks columns: {missing}")
    frame = forecasts.reset_index(drop=True).copy()
    numeric_required = sorted(required.difference({"game_id"}))
    numeric = frame.loc[:, numeric_required].apply(pd.to_numeric, errors="coerce")
    if not np.isfinite(numeric.to_numpy(float)).all():
        raise ValueError("Module 2 calibration frame contains a nonfinite mandatory value")
    if numeric["forecast_failed"].ne(0).any():
        raise ValueError(
            "Module 2 cannot construct a partial calibration scorecard after a forecast failure"
        )
    result: dict[str, Any] = {
        "games": int(frame["game_id"].nunique()) if "game_id" in frame.columns else len(frame),
        "forecastRows": len(frame),
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
        if field in frame.columns:
            result[field] = float(frame[field].mean())
    if "home_absolute_error" in frame.columns:
        result["home_mae"] = float(frame["home_absolute_error"].mean())
    if "away_absolute_error" in frame.columns:
        result["away_mae"] = float(frame["away_absolute_error"].mean())
    for side in ("home", "away"):
        squared = f"{side}_squared_error"
        if squared in frame.columns:
            result[f"{side}_rmse"] = float(math.sqrt(float(frame[squared].mean())))
        result[f"{side}_mean_calibration"] = _linear_calibration(
            frame[f"predicted_{side}_mean"].to_numpy(float),
            frame[f"actual_{side}"].to_numpy(float),
        )
    for mass in (50, 80, 95):
        for target in ("home", "away", "total", "difference"):
            coverage = f"coverage_{mass}_{target}"
            width = f"width_{mass}_{target}"
            if coverage in frame.columns:
                result[coverage] = float(frame[coverage].mean())
            if width in frame.columns:
                result[width] = float(frame[width].mean())
    for field in ("joint_80_hds_coverage", "joint_80_hds_size", "joint_80_hds_mass"):
        if field in frame.columns:
            result[field] = float(frame[field].mean())
    for target in ("home", "away", "total", "difference"):
        field = f"pit_{target}"
        if field not in frame.columns:
            continue
        values = np.clip(frame[field].to_numpy(float), 0.0, 1.0)
        histogram, _ = np.histogram(values, bins=np.linspace(0.0, 1.0, 11))
        result[f"pit_{target}_deciles"] = histogram.tolist()
        result[f"pit_{target}_quantile_calibration"] = {
            f"{quantile:.1f}": float(np.mean(values <= quantile))
            for quantile in np.arange(0.1, 1.0, 0.1)
        }

    predicted_means = frame.loc[:, ["predicted_home_mean", "predicted_away_mean"]].to_numpy(float)
    observed = frame.loc[:, ["actual_home", "actual_away"]].to_numpy(float)
    between_predicted = np.cov(predicted_means, rowvar=False, ddof=0)
    observed_covariance = np.cov(observed, rowvar=False, ddof=0)
    predicted_unconditional_covariance = float(
        frame["predicted_within_game_covariance"].mean() + between_predicted[0, 1]
    )
    result["moments"] = {
        "predictedHomeMean": float(predicted_means[:, 0].mean()),
        "predictedAwayMean": float(predicted_means[:, 1].mean()),
        "observedHomeMean": float(observed[:, 0].mean()),
        "observedAwayMean": float(observed[:, 1].mean()),
        "predictedUnconditionalHomeVariance": float(
            frame["predicted_home_variance"].mean() + between_predicted[0, 0]
        ),
        "predictedUnconditionalAwayVariance": float(
            frame["predicted_away_variance"].mean() + between_predicted[1, 1]
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

    evaluation = config["evaluation"]
    members = int(evaluation["calibrationBootstrapMembers"])
    interval_mass = float(evaluation["calibrationInterval"])
    alpha = 0.5 * (1.0 - interval_mass)
    block_length = int(evaluation["primaryWeekBlockLength"])
    coverage_fields = [
        f"coverage_{mass}_{target}"
        for mass in (50, 80, 95)
        for target in ("home", "away", "total", "difference")
    ]
    coverage_draws = {field: np.empty(members, dtype=float) for field in coverage_fields}
    covariance_draws = np.empty(members, dtype=float)
    for member, indexes in enumerate(
        _resample_frame_indices(
            frame,
            members,
            int(evaluation["bootstrapSeed"]) + 1,
            block_length,
        )
    ):
        sampled = frame.iloc[indexes]
        for field in coverage_fields:
            coverage_draws[field][member] = float(sampled[field].mean())
        sampled_means = sampled.loc[
            :, ["predicted_home_mean", "predicted_away_mean"]
        ].to_numpy(float)
        sampled_observed = sampled.loc[:, ["actual_home", "actual_away"]].to_numpy(float)
        predicted_between = np.cov(sampled_means, rowvar=False, ddof=0)
        observed_between = np.cov(sampled_observed, rowvar=False, ddof=0)
        predicted_covariance = float(
            sampled["predicted_within_game_covariance"].mean() + predicted_between[0, 1]
        )
        covariance_draws[member] = predicted_covariance - float(observed_between[0, 1])
    result["clusteredIntervals"] = {
        field: [
            float(np.quantile(draws, alpha)),
            float(np.quantile(draws, 1.0 - alpha)),
        ]
        for field, draws in coverage_draws.items()
    }
    result["clusteredIntervals"]["covarianceError"] = [
        float(np.quantile(covariance_draws, alpha)),
        float(np.quantile(covariance_draws, 1.0 - alpha)),
    ]
    result["clusteredIntervalMass"] = interval_mass
    result["clusteredBootstrapMembers"] = members
    return result


def calibration_summary(
    forecasts: pd.DataFrame, config: Mapping[str, Any]
) -> dict[str, Any]:
    """Aggregate calibration, moments, clustered coverage, and covariance evidence."""

    if "candidate" in forecasts.columns and forecasts["candidate"].nunique() > 1:
        return {
            str(candidate): _single_calibration_summary(group, config)
            for candidate, group in forecasts.groupby("candidate", sort=True)
        }
    if "family" in forecasts.columns and forecasts["family"].nunique() > 1:
        return {
            str(candidate): _single_calibration_summary(group, config)
            for candidate, group in forecasts.groupby("family", sort=True)
        }
    return _single_calibration_summary(forecasts, config)


def _self_test_config() -> dict[str, Any]:
    return {
        "forecastContract": {"warmupSeasons": [2010, 2011, 2012]},
        "target": {
            "primary": [
                "home_regulation_offensive_series",
                "away_regulation_offensive_series",
            ],
            "probabilitySupport": {"minimum": 0, "maximumExact": 24, "tailBucket": 25},
            "integrityBounds": {
                "hardMinimumObservedPerTeam": 0,
                "hardMaximumObservedPerTeam": 63,
            },
        },
        "dataBoundary": {
            "forbiddenFieldPatterns": [
                "spread", "total_line", "moneyline", "odds", "vig", "book",
                "consensus", "opening", "closing", "line_movement", "ticket",
                "money_percentage", "clv", "selection", "approval", "rationale",
                "units", "final_score", "points_per_drive", "epa", "success",
                "win_probability", "module_one",
            ]
        },
        "features": {
            "leagueSeasonPriorGames": 64,
            "possessionPriorGames": 4,
            "timeDecayHalfLifeSeasons": 2.5,
            "observationWeightMultipliersBySeason": {"2020": 0.5},
            "teamHistoryWindowGames": 17,
            "timeWeightDefinition": {
                "equalTimeOrder": ["season", "week", "game_date", "game_id"]
            },
            "groups": {
                "possession_rate": [
                    "offense_regulation_series_per_game",
                    "opponent_regulation_series_faced_per_game",
                ],
                "situation_neutral_pace": [
                    "offense_neutral_seconds_per_scrimmage_play",
                    "opponent_neutral_seconds_per_scrimmage_play_allowed",
                ],
                "play_volume": [
                    "offense_scrimmage_plays_per_regulation_series",
                    "opponent_scrimmage_plays_per_regulation_series_allowed",
                ],
                "drive_duration": [
                    "offense_regulation_series_seconds",
                    "opponent_regulation_series_seconds_allowed",
                ],
                "clock_stop": [
                    "offense_incompletion_or_out_of_bounds_rate",
                    "opponent_incompletion_or_out_of_bounds_rate_allowed",
                ],
                "home_context": ["is_neutral_site"],
            },
        },
        "candidates": {
            _P2: {
                "ridgePenalty": 32,
                "orderedDesign": {
                    "profileGroupOrder": [
                        "situation_neutral_pace",
                        "play_volume",
                        "drive_duration",
                        "clock_stop",
                    ]
                },
            }
        },
        "distribution": {
            "prequentialResidualWindowGames": 384,
            "minimumBaseTrainingGames": 128,
            "minimumPrequentialResidualGames": 128,
            "residualTimeDecayHalfLifeSeasons": 2.5,
            "residualKernelOffsets": [-1, 0, 1],
            "residualKernelWeights": [0.15, 0.7, 0.15],
            "jointCellPseudocount": 0.0001,
            "probabilityFloor": 1e-12,
            "predictionMeanBounds": [4.0, 20.0],
            "energyScoreDrawPairs": 2048,
            "energyScoreSeed": 20260824,
            "randomizedPitSeed": 20260825,
        },
        "evaluation": {
            "primaryMetric": "joint_negative_log_score",
            "bootstrapMembers": 200,
            "bootstrapSeed": 20260824,
            "primaryWeekBlockLength": 3,
            "simultaneousInterval": 0.9,
            "calibrationBootstrapMembers": 100,
            "calibrationInterval": 0.95,
        },
    }


def _self_test_games(config: Mapping[str, Any]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    teams = ("A", "B", "C", "D")
    profile_features = [
        name
        for group in ("situation_neutral_pace", "play_volume", "drive_duration", "clock_stop")
        for name in config["features"]["groups"][group]
    ]
    game_index = 0
    for season in range(2019, 2025):
        for week in range(1, 19):
            for pairing in range(2):
                home = teams[(week + pairing) % 4]
                away = teams[(week + pairing + 2) % 4]
                home_strength = {"A": 1.2, "B": 0.4, "C": -0.3, "D": -0.8}[home]
                away_strength = {"A": 1.2, "B": 0.4, "C": -0.3, "D": -0.8}[away]
                home_count = int(np.clip(round(11.2 + home_strength + (week % 3 - 1)), 6, 18))
                away_count = int(np.clip(round(10.8 + away_strength - (week % 3 - 1)), 6, 18))
                row: dict[str, Any] = {
                    "game_id": f"{season}-{week}-{pairing}",
                    "season": season,
                    "week": week,
                    "game_date": pd.Timestamp(
                        f"{season}-09-{min(28, week):02d}"
                    ),
                    "home_team": home,
                    "away_team": away,
                    "is_neutral_site": int(week == 9 and pairing == 1),
                    "home_regulation_offensive_series": home_count,
                    "away_regulation_offensive_series": away_count,
                    # These stand in for a runner's earlier weekly forecasts.
                    "p0_home_mean": 11.2,
                    "p0_away_mean": 10.8,
                    "p1_home_mean": 11.2 + 0.5 * home_strength,
                    "p1_away_mean": 10.8 + 0.5 * away_strength,
                }
                for feature_index, feature in enumerate(profile_features):
                    base = 4.0 + feature_index
                    row[f"home_{feature}"] = base + 0.1 * home_strength + 0.01 * week
                    row[f"away_{feature}"] = base + 0.1 * away_strength - 0.01 * week
                    row[f"home_{feature}_missing"] = 0.0
                    row[f"away_{feature}_missing"] = 0.0
                rows.append(row)
                game_index += 1
    frame = pd.DataFrame(rows)
    frame.attrs["origin_season"] = 2025
    frame.attrs["origin_week"] = 1
    return frame


def run_model_self_tests() -> dict[str, Any]:
    """Exercise chronology, candidates, PMF, metrics, bootstrap, and replay determinism."""

    config = _self_test_config()
    weight_check = season_weights(
        np.array([2019, 2020, 2021]),
        2021,
        2.5,
        season_multipliers={2020: 0.5},
    )
    expected = 0.5 * (0.5 ** (1.0 / 2.5))
    if not math.isclose(float(weight_check[1]), expected, rel_tol=1e-12):
        raise AssertionError("Module 2 season-multiplier self-test failed")
    games = _self_test_games(config)
    selected_features = [
        name
        for values in config["features"]["groups"].values()
        for name in values
    ]
    profile_features = [
        name
        for group in config["candidates"][_P2]["orderedDesign"]["profileGroupOrder"]
        for name in config["features"]["groups"][group]
    ]
    target = games.tail(2).drop(
        columns=[
            "home_regulation_offensive_series",
            "away_regulation_offensive_series",
        ]
    )
    fits = {
        name: fit_candidate(name, games, selected_features, config)
        for name in (_P0, _P1, _P2)
    }
    predictions = {
        name: predict_candidate(fit, target) for name, fit in fits.items()
    }
    for name, prediction in predictions.items():
        if prediction.shape[0] != len(target) or not np.isfinite(
            prediction.loc[:, ["mean_home", "mean_away"]].to_numpy(float)
        ).all():
            raise AssertionError(f"Module 2 {name} prediction self-test failed")
    expected_design = ["p1_home_mean", "p1_away_mean"]
    for group in config["candidates"][_P2]["orderedDesign"]["profileGroupOrder"]:
        for feature in config["features"]["groups"][group]:
            expected_design.extend(
                (
                    f"average__{feature}",
                    f"difference__{feature}",
                    f"average__{feature}_missing",
                    f"difference__{feature}_missing",
                )
            )
    expected_design.append("is_neutral_site")
    if list(fits[_P2].engineered_feature_names) != expected_design:
        raise AssertionError("Module 2 P2 ordered design differs from the frozen schema")
    p2_no_home = fit_candidate(
        _P2,
        games,
        selected_features,
        config,
        variant="no_home_context",
    )
    if (
        p2_no_home.include_home_context
        or not p2_no_home.p0_fit.include_home
        or not p2_no_home.p1_fit.include_home
    ):
        raise AssertionError(
            "Module 2 P2 no-home ablation changed its retained P0/P1 location inputs"
        )
    prehistory_rows = games.iloc[:4].copy()
    prehistory_rows["game_id"] = [f"2010-prehistory-{index}" for index in range(4)]
    prehistory_rows["season"] = 2010
    prehistory_rows["week"] = [1, 2, 3, 4]
    prehistory_rows["game_date"] = pd.date_range(
        "2010-09-01", periods=4, freq="7D"
    )
    prehistory_input_columns = [
        "p0_home_mean",
        "p0_away_mean",
        "p1_home_mean",
        "p1_away_mean",
        *[
            f"{side}_{feature}"
            for side in ("home", "away")
            for feature in profile_features
        ],
    ]
    prehistory_rows.loc[:, prehistory_input_columns] = np.nan
    with_prehistory = pd.concat([prehistory_rows, games], ignore_index=True)
    with_prehistory.attrs["origin_season"] = 2025
    with_prehistory.attrs["origin_week"] = 1
    prehistory_fit = fit_candidate(
        _P2, with_prehistory, selected_features, config
    )
    if prehistory_fit.training_rows != fits[_P2].training_rows:
        raise AssertionError("Module 2 P2 admitted fixed 2010 prehistory regression rows")
    unexpected_missing = games.copy()
    unexpected_missing.loc[unexpected_missing.index[0], "p0_home_mean"] = np.nan
    try:
        fit_candidate(_P2, unexpected_missing, selected_features, config)
    except ValueError:
        pass
    else:
        raise AssertionError("Module 2 P2 silently dropped a post-prehistory missing input")

    current_origin = games.loc[
        games["season"].lt(2024)
        | (games["season"].eq(2024) & games["week"].lt(10))
    ].copy()
    current_origin.attrs["origin_season"] = 2024
    current_origin.attrs["origin_week"] = 10
    current_weights = _model_weights(current_origin, config, 2024, False)
    nonneutral = current_origin["is_neutral_site"].eq(0).to_numpy()
    historical = current_origin["season"].lt(2024).to_numpy() & nonneutral
    current = current_origin["season"].eq(2024).to_numpy() & nonneutral
    expected_home_prior = _weighted_mean(
        current_origin.loc[historical, "home_regulation_offensive_series"].to_numpy(float),
        current_weights[historical],
    )
    expected_away_prior = _weighted_mean(
        current_origin.loc[historical, "away_regulation_offensive_series"].to_numpy(float),
        current_weights[historical],
    )
    current_mass = float(current_weights[current].sum())
    expected_home = (
        float(
            np.dot(
                current_origin.loc[current, "home_regulation_offensive_series"].to_numpy(float),
                current_weights[current],
            )
        )
        + 64.0 * expected_home_prior
    ) / (current_mass + 64.0)
    expected_away = (
        float(
            np.dot(
                current_origin.loc[current, "away_regulation_offensive_series"].to_numpy(float),
                current_weights[current],
            )
        )
        + 64.0 * expected_away_prior
    ) / (current_mass + 64.0)
    current_p0 = fit_candidate(_P0, current_origin, selected_features, config)
    if not (
        math.isclose(
            current_p0.league_mean + current_p0.home_adjustment,
            expected_home,
            rel_tol=1e-12,
        )
        and math.isclose(
            current_p0.league_mean - current_p0.home_adjustment,
            expected_away,
            rel_tol=1e-12,
        )
    ):
        raise AssertionError("Module 2 P0 did not apply the frozen 64-game update")
    extreme_neutral = current_origin.iloc[[0]].copy()
    extreme_neutral["game_id"] = "extreme-neutral-control"
    extreme_neutral["season"] = 2024
    extreme_neutral["week"] = 2
    extreme_neutral["game_date"] = pd.Timestamp("2024-09-10")
    extreme_neutral["is_neutral_site"] = 1
    extreme_neutral["home_regulation_offensive_series"] = 63
    extreme_neutral["away_regulation_offensive_series"] = 0
    neutral_augmented = pd.concat(
        [current_origin, extreme_neutral], ignore_index=True
    )
    neutral_augmented.attrs["origin_season"] = 2024
    neutral_augmented.attrs["origin_week"] = 10
    neutral_p0 = fit_candidate(
        _P0, neutral_augmented, selected_features, config
    )
    if not (
        math.isclose(neutral_p0.league_mean, current_p0.league_mean, rel_tol=0, abs_tol=0)
        and math.isclose(
            neutral_p0.home_adjustment,
            current_p0.home_adjustment,
            rel_tol=0,
            abs_tol=0,
        )
    ):
        raise AssertionError("Module 2 P0 used a neutral game to estimate its location means")
    no_home_p0 = fit_candidate(
        _P0, current_origin, selected_features, config, include_home=False
    )
    no_home_prediction = predict_candidate(no_home_p0, target)
    if not np.allclose(
        no_home_prediction["mean_home"], no_home_prediction["mean_away"], atol=0, rtol=0
    ):
        raise AssertionError("Module 2 no-home-context ablation retained a location split")

    scaler_frame = pd.DataFrame({"x": [1.0, np.nan, 5.0]})
    scaler = fit_weighted_fold_scaler(
        scaler_frame, ["x"], np.array([1.0, 2.0, 1.0])
    )
    if not math.isclose(float(scaler.imputation_values[0]), 3.0, rel_tol=1e-12):
        raise AssertionError("Module 2 fold imputation ignored its training weights")

    residual_frame = pd.DataFrame(
        {
            "game_id": [f"r-{index}" for index in range(160)],
            "season": [2023 + int(index >= 80) for index in range(160)],
            "week": [index % 18 + 1 for index in range(160)],
            "residual_home": [(index % 5) - 2 for index in range(160)],
            "residual_away": [(index % 3) - 1 for index in range(160)],
        }
    )
    residual_weights = np.ones(len(residual_frame), dtype=float)
    pmf = joint_residual_pmf(11.0, 10.5, residual_frame, residual_weights, config)
    replay = joint_residual_pmf(11.0, 10.5, residual_frame, residual_weights, config)
    if not np.array_equal(pmf, replay):
        raise AssertionError("Module 2 PMF replay is not byte-identical")
    zero_residuals = residual_frame.copy()
    zero_residuals["residual_home"] = 0.0
    zero_residuals["residual_away"] = 0.0
    half_pmf = joint_residual_pmf(
        10.5, 10.5, zero_residuals, residual_weights, config
    )
    if int(np.argmax(half_pmf.sum(axis=1))) != 11:
        raise AssertionError("Module 2 PMF did not round half away from zero")
    evaluation = evaluate_joint_pmf(pmf, 12, 10, ["self-test-game"], config)
    evaluation_replay = evaluate_joint_pmf(pmf, 12, 10, ["self-test-game"], config)
    if evaluation != evaluation_replay:
        raise AssertionError("Module 2 evaluation replay is not deterministic")
    candidate_seed_a = evaluate_joint_pmf(
        pmf, 12, 10, {"game_id": "seed-test", "candidate": _P0}, config
    )
    candidate_seed_b = evaluate_joint_pmf(
        pmf, 12, 10, {"game_id": "seed-test", "candidate": _P2}, config
    )
    if candidate_seed_a != candidate_seed_b:
        raise AssertionError("Module 2 randomization seed depends on candidate identity")
    if not math.isfinite(float(evaluation["joint_negative_log_score"])):
        raise AssertionError("Module 2 joint log score is not finite")
    if evaluation["joint_80_hds_size"] <= 0:
        raise AssertionError("Module 2 highest-density set is empty")
    point_mass = np.zeros((26, 26), dtype=float)
    point_mass[12, 10] = 1.0
    exact = evaluate_joint_pmf(point_mass, 12, 10, ["exact-point"], config)
    exact_zero_fields = (
        "joint_negative_log_score",
        "multivariate_energy_score",
        "home_crps",
        "away_crps",
        "total_crps",
        "difference_crps",
    )
    if any(abs(float(exact[field])) > 1e-12 for field in exact_zero_fields):
        raise AssertionError("Module 2 exact point-mass score identities failed")
    for invalid_actual in (-1, 64, 10.7, float("nan"), float("inf")):
        try:
            evaluate_joint_pmf(
                point_mass, invalid_actual, 10, ["invalid-actual"], config
            )
        except ValueError:
            pass
        else:
            raise AssertionError(
                f"Module 2 scoring accepted invalid actual count {invalid_actual!r}"
            )
    if _array_hash(np.array([0.0])) == _array_hash(np.array([1e-16])):
        raise AssertionError("Module 2 exact-byte hash erased a sub-1e-15 perturbation")

    metric_rows: list[dict[str, Any]] = []
    calibration_rows: list[dict[str, Any]] = []
    for season in (2023, 2024):
        for week in range(1, 7):
            for game in range(2):
                game_id = f"b-{season}-{week}-{game}"
                base_loss = 3.0 + 0.01 * game
                for candidate, loss in (
                    (_P0, base_loss),
                    (_P1, base_loss - 0.03),
                    (_P2, base_loss - 0.04),
                ):
                    metric_rows.append(
                        {
                            "game_id": game_id,
                            "season": season,
                            "week": week,
                            "candidate": candidate,
                            "joint_negative_log_score": loss,
                        }
                    )
                row = {
                    "game_id": game_id,
                    "season": season,
                    "week": week,
                    "forecast_failed": 0,
                    "home_bound_hit": 0,
                    "away_bound_hit": 0,
                    "runtime_seconds": 0.001,
                    **evaluation,
                }
                calibration_rows.append(row)
    bootstrap = hierarchical_paired_bootstrap(
        pd.DataFrame(metric_rows), (_P0, _P1, _P2), config
    )
    if not all(
        comparison["meanImprovement"] > 0
        for comparison in bootstrap["comparisons"].values()
    ):
        raise AssertionError("Module 2 paired bootstrap reversed a deterministic gain")
    calibration = calibration_summary(pd.DataFrame(calibration_rows), config)
    if "clusteredIntervals" not in calibration:
        raise AssertionError("Module 2 calibration self-test omitted clustered evidence")

    incomplete = pd.DataFrame(metric_rows).loc[
        lambda frame: ~(
            (frame["candidate"] == _P2) & (frame["game_id"] == "b-2024-6-1")
        )
    ]
    try:
        hierarchical_paired_bootstrap(incomplete, (_P0, _P1, _P2), config)
    except ValueError:
        pass
    else:
        raise AssertionError("Module 2 bootstrap silently dropped an incomplete manifest")

    future = games.copy()
    future.attrs["origin_season"] = 2024
    future.attrs["origin_week"] = 18
    try:
        fit_candidate(_P0, future, selected_features, config)
    except ValueError:
        pass
    else:
        raise AssertionError("Module 2 fit accepted a same/future-week training row")
    return {
        "fitHashes": {name: fit.fit_hash for name, fit in fits.items()},
        "distributionHash": evaluation["distribution_hash"],
        "bootstrapDrawsHash": bootstrap["drawsHash"],
        "scalerHash": fits[_P2].scaler.scaler_hash,
        "deterministic": True,
        "manifestFailureDetected": True,
        "futureWeekFailureDetected": True,
    }


if __name__ == "__main__":
    print(json.dumps(run_model_self_tests(), indent=2, sort_keys=True))
