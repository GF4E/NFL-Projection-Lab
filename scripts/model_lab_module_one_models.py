"""Market-free statistical primitives for Model Laboratory Module 1.

The functions in this file know nothing about sportsbook data. They accept an
already allowlisted, point-in-time team-score matrix and return pregame means,
joint score distributions, proper scores, and paired uncertainty diagnostics.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from hashlib import sha256
import json
import math
from typing import Any, Iterable, Mapping, Sequence

import numpy as np
import pandas as pd


EPSILON = 1e-12
DEFAULT_NUMERICS: dict[str, Any] = {
    "minimumTeamScoreTrainingRows": 128,
    "scoreMeanPredictionBounds": [1.0, 55.0],
    "poissonFitMeanBounds": [0.25, 70.0],
    "dynamicObservationVarianceMinimum": 16.0,
    "dynamicInitialVarianceMinimum": 1.0,
    "dynamicProcessVarianceMinimum": 0.01,
    "dynamicPosteriorVarianceMinimum": 0.01,
    "dispersionMaximum": 1_000_000.0,
    "scalerVarianceFloor": 1e-12,
    "scalerMinimumScale": 1e-6,
}


def _numeric_setting(numerics: Mapping[str, Any] | None, key: str) -> Any:
    return (numerics or DEFAULT_NUMERICS)[key]


def validate_training_origin(
    training: pd.DataFrame,
    origin_season: int,
    origin_week: int | None,
) -> None:
    if origin_week is None:
        raise ValueError("Module 1 fit requires an explicit origin week")
    required = {"season", "week"}
    if not required.issubset(training.columns):
        raise ValueError("Module 1 training rows lack season-week provenance")
    invalid = training["season"].gt(origin_season) | (
        training["season"].eq(origin_season) & training["week"].ge(origin_week)
    )
    if invalid.any():
        example = training.loc[invalid, ["season", "week"]].iloc[0].to_dict()
        raise ValueError(
            f"Module 1 training row reaches or follows origin {origin_season}-{origin_week}: {example}"
        )


def stable_hash(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
    return sha256(payload.encode("utf-8")).hexdigest()


def season_weights(
    seasons: np.ndarray,
    origin_season: int,
    half_life: float,
    no_decay: bool = False,
    season_multipliers: Mapping[int, float] | None = None,
) -> np.ndarray:
    if no_decay:
        weights = np.ones(len(seasons), dtype=float)
    else:
        weights = np.power(0.5, np.maximum(0, origin_season - seasons) / half_life)
    weights = weights.astype(float)
    for season, multiplier in (season_multipliers or {}).items():
        weights[seasons == int(season)] *= float(multiplier)
    return weights


@dataclass(frozen=True)
class FoldScaler:
    names: tuple[str, ...]
    centers: np.ndarray
    scales: np.ndarray

    def transform(self, frame: pd.DataFrame) -> np.ndarray:
        if not self.names:
            return np.empty((len(frame), 0), dtype=float)
        matrix = frame.loc[:, list(self.names)].to_numpy(dtype=float)
        if not np.isfinite(matrix).all():
            raise ValueError("Module 1 numeric features contain non-finite values")
        return (matrix - self.centers) / self.scales


def fit_scaler(
    frame: pd.DataFrame,
    names: Sequence[str],
    weights: np.ndarray,
    numerics: Mapping[str, Any] | None = None,
) -> FoldScaler:
    ordered = tuple(names)
    if not ordered:
        return FoldScaler(ordered, np.array([], dtype=float), np.array([], dtype=float))
    matrix = frame.loc[:, list(ordered)].to_numpy(dtype=float)
    if not np.isfinite(matrix).all():
        raise ValueError("Module 1 cannot fit a transform with non-finite values")
    total = float(weights.sum())
    if total <= 0:
        raise ValueError("Module 1 fold weights have no positive mass")
    centers = (matrix * weights[:, None]).sum(axis=0) / total
    variance = (((matrix - centers) ** 2) * weights[:, None]).sum(axis=0) / total
    scales = np.sqrt(np.maximum(variance, float(_numeric_setting(numerics, "scalerVarianceFloor"))))
    scales[scales < float(_numeric_setting(numerics, "scalerMinimumScale"))] = 1.0
    return FoldScaler(ordered, centers, scales)


def solve_penalized_normal_equations(
    design: np.ndarray,
    outcome: np.ndarray,
    weights: np.ndarray,
    penalties: np.ndarray,
) -> np.ndarray:
    if design.shape[0] != len(outcome) or len(outcome) != len(weights):
        raise ValueError("Module 1 design, outcome, and weight lengths differ")
    if design.shape[1] != len(penalties):
        raise ValueError("Module 1 penalty vector does not match the design")
    root_weight = np.sqrt(np.maximum(weights, 0))
    weighted_design = design * root_weight[:, None]
    weighted_outcome = outcome * root_weight
    information = weighted_design.T @ weighted_design + np.diag(penalties)
    score = weighted_design.T @ weighted_outcome
    try:
        return np.linalg.solve(information, score)
    except np.linalg.LinAlgError:
        return np.linalg.lstsq(information, score, rcond=None)[0]


@dataclass(frozen=True)
class RidgeFit:
    beta: np.ndarray
    scaler: FoldScaler
    teams: tuple[str, ...]
    include_team_identity: bool
    include_home: bool
    score_bounds: tuple[float, float]
    model_hash: str


def ridge_design(
    frame: pd.DataFrame,
    scaler: FoldScaler,
    teams: Sequence[str],
    include_team_identity: bool,
    include_home: bool,
) -> np.ndarray:
    numeric = scaler.transform(frame)
    columns = [np.ones((len(frame), 1), dtype=float)]
    if include_home:
        columns.append(frame["is_home"].to_numpy(dtype=float)[:, None])
    if numeric.shape[1]:
        columns.append(numeric)
    if include_team_identity:
        team_index = {team: index for index, team in enumerate(teams)}
        offense = np.zeros((len(frame), len(teams)), dtype=float)
        defense = np.zeros((len(frame), len(teams)), dtype=float)
        for row_index, (team, opponent) in enumerate(zip(frame["team"], frame["opponent"], strict=True)):
            if team in team_index:
                offense[row_index, team_index[team]] = 1.0
            if opponent in team_index:
                defense[row_index, team_index[opponent]] = 1.0
        columns.extend([offense, defense])
    return np.concatenate(columns, axis=1)


def fit_ridge_score_model(
    training: pd.DataFrame,
    feature_names: Sequence[str],
    origin_season: int,
    half_life: float,
    ridge_penalty: float,
    include_team_identity: bool = True,
    include_home: bool = True,
    no_decay: bool = False,
    season_multipliers: Mapping[int, float] | None = None,
    origin_week: int | None = None,
    numerics: Mapping[str, Any] | None = None,
) -> RidgeFit:
    validate_training_origin(training, origin_season, origin_week)
    minimum_rows = int(_numeric_setting(numerics, "minimumTeamScoreTrainingRows"))
    if len(training) < minimum_rows:
        raise ValueError(f"Ridge score model requires at least {minimum_rows} prior team-score rows")
    weights = season_weights(
        training["season"].to_numpy(int), origin_season, half_life, no_decay, season_multipliers
    )
    scaler = fit_scaler(training, feature_names, weights, numerics)
    teams = tuple(sorted(set(training["team"]).union(training["opponent"])))
    design = ridge_design(training, scaler, teams, include_team_identity, include_home)
    response = training["actual_score"].to_numpy(float) - training["league_team_score_mean"].to_numpy(float)
    unpenalized = 1 + int(include_home)
    penalties = np.full(design.shape[1], ridge_penalty, dtype=float)
    penalties[:unpenalized] = 0.0
    beta = solve_penalized_normal_equations(design, response, weights, penalties)
    score_bounds = tuple(float(value) for value in _numeric_setting(numerics, "scoreMeanPredictionBounds"))
    artifact = {
        "family": "c1_ridge_offense_defense",
        "features": list(feature_names),
        "teams": teams,
        "includeTeamIdentity": include_team_identity,
        "includeHome": include_home,
        "centers": scaler.centers.tolist(),
        "scales": scaler.scales.tolist(),
        "coefficients": beta.tolist(),
        "scoreBounds": score_bounds,
        "trainingRows": len(training),
        "trainingThrough": list(
            max((int(season), int(week)) for season, week in zip(training["season"], training["week"], strict=True))
        ),
    }
    return RidgeFit(beta, scaler, teams, include_team_identity, include_home, score_bounds, stable_hash(artifact))


def predict_ridge_score(model: RidgeFit, frame: pd.DataFrame) -> np.ndarray:
    design = ridge_design(frame, model.scaler, model.teams, model.include_team_identity, model.include_home)
    mean = frame["league_team_score_mean"].to_numpy(float) + design @ model.beta
    return np.clip(mean, model.score_bounds[0], model.score_bounds[1])


@dataclass(frozen=True)
class PoissonFit:
    beta: np.ndarray
    scaler: FoldScaler
    teams: tuple[str, ...]
    include_team_identity: bool
    include_home: bool
    score_bounds: tuple[float, float]
    fit_mean_bounds: tuple[float, float]
    converged: bool
    iterations: int
    model_hash: str


def compact_design(frame: pd.DataFrame, scaler: FoldScaler, include_home: bool) -> np.ndarray:
    columns = [np.ones((len(frame), 1), dtype=float)]
    if include_home:
        columns.append(frame["is_home"].to_numpy(float)[:, None])
    numeric = scaler.transform(frame)
    if numeric.shape[1]:
        columns.append(numeric)
    return np.concatenate(columns, axis=1)


def fit_poisson_score_model(
    training: pd.DataFrame,
    feature_names: Sequence[str],
    origin_season: int,
    half_life: float,
    ridge_penalty: float,
    maximum_iterations: int,
    tolerance: float,
    include_team_identity: bool = True,
    include_home: bool = True,
    no_decay: bool = False,
    season_multipliers: Mapping[int, float] | None = None,
    origin_week: int | None = None,
    numerics: Mapping[str, Any] | None = None,
) -> PoissonFit:
    validate_training_origin(training, origin_season, origin_week)
    minimum_rows = int(_numeric_setting(numerics, "minimumTeamScoreTrainingRows"))
    if len(training) < minimum_rows:
        raise ValueError(f"Count model requires at least {minimum_rows} prior team-score rows")
    base_weights = season_weights(
        training["season"].to_numpy(int), origin_season, half_life, no_decay, season_multipliers
    )
    scaler = fit_scaler(training, feature_names, base_weights, numerics)
    teams = tuple(sorted(set(training["team"]).union(training["opponent"])))
    design = ridge_design(training, scaler, teams, include_team_identity, include_home)
    outcome = training["actual_score"].to_numpy(float)
    offset = np.log(np.clip(training["league_team_score_mean"].to_numpy(float), 1.0, None))
    fit_mean_bounds = tuple(float(value) for value in _numeric_setting(numerics, "poissonFitMeanBounds"))
    beta = np.zeros(design.shape[1], dtype=float)
    weighted_outcome_mean = float(np.average(outcome, weights=base_weights))
    weighted_offset_level = float(np.exp(np.average(offset, weights=base_weights)))
    initial_mean = float(np.clip(weighted_outcome_mean, fit_mean_bounds[0], fit_mean_bounds[1]))
    beta[0] = math.log(initial_mean / weighted_offset_level)
    penalties = np.full(design.shape[1], ridge_penalty, dtype=float)
    penalties[: 1 + int(include_home)] = 0.0
    converged = False
    used_iterations = 0
    for iteration in range(maximum_iterations):
        eta = np.clip(offset + design @ beta, math.log(fit_mean_bounds[0]), math.log(fit_mean_bounds[1]))
        mean = np.exp(eta)
        working = eta + (outcome - mean) / np.maximum(mean, EPSILON) - offset
        weights = base_weights * mean
        next_beta = solve_penalized_normal_equations(design, working, weights, penalties)
        used_iterations = iteration + 1
        if float(np.max(np.abs(next_beta - beta))) < tolerance:
            beta = next_beta
            converged = True
            break
        beta = next_beta
    score_bounds = tuple(float(value) for value in _numeric_setting(numerics, "scoreMeanPredictionBounds"))
    artifact = {
        "family": "c3_independent_negative_binomial",
        "features": list(feature_names),
        "teams": teams,
        "includeTeamIdentity": include_team_identity,
        "includeHome": include_home,
        "centers": scaler.centers.tolist(),
        "scales": scaler.scales.tolist(),
        "coefficients": beta.tolist(),
        "scoreBounds": score_bounds,
        "fitMeanBounds": fit_mean_bounds,
        "converged": converged,
        "iterations": used_iterations,
        "trainingRows": len(training),
    }
    return PoissonFit(
        beta,
        scaler,
        teams,
        include_team_identity,
        include_home,
        score_bounds,
        fit_mean_bounds,
        converged,
        used_iterations,
        stable_hash(artifact),
    )


def predict_poisson_score(model: PoissonFit, frame: pd.DataFrame) -> np.ndarray:
    design = ridge_design(
        frame,
        model.scaler,
        model.teams,
        model.include_team_identity,
        model.include_home,
    )
    offset = np.log(np.clip(frame["league_team_score_mean"].to_numpy(float), 1.0, None))
    return np.clip(
        np.exp(np.clip(offset + design @ model.beta, math.log(model.score_bounds[0]), math.log(model.score_bounds[1]))),
        model.score_bounds[0],
        model.score_bounds[1],
    )


@dataclass
class FilteredState:
    mean: float
    variance: float


@dataclass(frozen=True)
class DynamicFit:
    base: RidgeFit
    offense: Mapping[str, FilteredState]
    defense: Mapping[str, FilteredState]
    observation_variance: float
    model_hash: str


def fit_dynamic_state_model(
    training: pd.DataFrame,
    feature_names: Sequence[str],
    origin_season: int,
    half_life: float,
    ridge_penalty: float,
    initial_variance_ratio: float,
    process_variance_ratio: float,
    offseason_variance_ratio: float,
    offseason_mean_retention: float,
    include_home: bool = True,
    include_states: bool = True,
    carry_prior_season: bool = True,
    no_decay: bool = False,
    season_multipliers: Mapping[int, float] | None = None,
    origin_week: int | None = None,
    numerics: Mapping[str, Any] | None = None,
) -> DynamicFit:
    base = fit_ridge_score_model(
        training,
        feature_names,
        origin_season,
        half_life,
        ridge_penalty,
        include_team_identity=False,
        include_home=include_home,
        no_decay=no_decay,
        season_multipliers=season_multipliers,
        origin_week=origin_week,
        numerics=numerics,
    )
    base_prediction = predict_ridge_score(base, training)
    observation_variance = max(
        float(_numeric_setting(numerics, "dynamicObservationVarianceMinimum")),
        float(np.mean((training["actual_score"].to_numpy(float) - base_prediction) ** 2)),
    )
    initial_variance = max(
        float(_numeric_setting(numerics, "dynamicInitialVarianceMinimum")),
        observation_variance * initial_variance_ratio,
    )
    process_variance = max(
        float(_numeric_setting(numerics, "dynamicProcessVarianceMinimum")),
        observation_variance * process_variance_ratio,
    )
    offseason_variance = max(
        float(_numeric_setting(numerics, "dynamicProcessVarianceMinimum")),
        observation_variance * offseason_variance_ratio,
    )
    offense: dict[str, FilteredState] = {}
    defense: dict[str, FilteredState] = {}
    previous_season: int | None = None

    def state(store: dict[str, FilteredState], team: str) -> FilteredState:
        return store.setdefault(team, FilteredState(0.0, initial_variance))

    for (season, week), block in training.sort_values(["season", "week", "game_id", "is_home"]).groupby(["season", "week"], sort=True):
        season = int(season)
        if previous_season is not None and season != previous_season:
            for current in [*offense.values(), *defense.values()]:
                current.mean = current.mean * offseason_mean_retention if carry_prior_season else 0.0
                current.variance += offseason_variance
        previous_season = season
        for current in [*offense.values(), *defense.values()]:
            current.variance += process_variance
        base_means = predict_ridge_score(base, block)
        updates: list[tuple[FilteredState, float, float]] = []
        for index, (_, row) in enumerate(block.iterrows()):
            offense_state = state(offense, str(row["team"]))
            defense_state = state(defense, str(row["opponent"]))
            state_adjustment = offense_state.mean + defense_state.mean if include_states else 0.0
            prediction = float(
                np.clip(
                    base_means[index] + state_adjustment,
                    base.score_bounds[0],
                    base.score_bounds[1],
                )
            )
            residual = float(row["actual_score"] - prediction)
            innovation = observation_variance + offense_state.variance + defense_state.variance
            updates.append((offense_state, offense_state.variance / innovation * residual, offense_state.variance / innovation))
            updates.append((defense_state, defense_state.variance / innovation * residual, defense_state.variance / innovation))
        if include_states:
            for current, mean_delta, gain in updates:
                current.mean += mean_delta
                current.variance = max(
                    float(_numeric_setting(numerics, "dynamicPosteriorVarianceMinimum")),
                    (1 - gain) * current.variance,
                )
    artifact = {
        "family": "c2_dynamic_state_space",
        "baseModelHash": base.model_hash,
        "includeStates": include_states,
        "carryPriorSeason": carry_prior_season,
        "observationVariance": observation_variance,
        "offense": {team: [value.mean, value.variance] for team, value in sorted(offense.items())},
        "defense": {team: [value.mean, value.variance] for team, value in sorted(defense.items())},
    }
    return DynamicFit(base, offense, defense, observation_variance, stable_hash(artifact))


def predict_dynamic_score(model: DynamicFit, frame: pd.DataFrame) -> np.ndarray:
    base = predict_ridge_score(model.base, frame)
    adjustment = np.array([
        model.offense.get(str(team), FilteredState(0.0, 0.0)).mean +
        model.defense.get(str(opponent), FilteredState(0.0, 0.0)).mean
        for team, opponent in zip(frame["team"], frame["opponent"], strict=True)
    ])
    return np.clip(base + adjustment, model.base.score_bounds[0], model.base.score_bounds[1])


def negative_binomial_pmf(mean: float, dispersion: float, maximum_score: int, tail_bucket: int) -> np.ndarray:
    if mean <= 0 or dispersion <= 0 or tail_bucket != maximum_score + 1:
        raise ValueError("Negative-binomial distribution parameters are invalid")
    probabilities = np.zeros(tail_bucket + 1, dtype=float)
    success = dispersion / (dispersion + mean)
    for score in range(maximum_score + 1):
        log_probability = (
            math.lgamma(score + dispersion)
            - math.lgamma(dispersion)
            - math.lgamma(score + 1)
            + dispersion * math.log(success)
            + score * math.log1p(-success)
        )
        probabilities[score] = math.exp(log_probability)
    probabilities[tail_bucket] = max(0.0, 1.0 - float(probabilities[:-1].sum()))
    probabilities /= probabilities.sum()
    return probabilities


def prequential_dispersion(
    residual_records: Sequence[Mapping[str, float]],
    side: str,
    minimum_dispersion: float,
    maximum_dispersion: float = 1_000_000.0,
    minimum_records: int = 128,
) -> float:
    if len(residual_records) < minimum_records:
        return maximum_dispersion
    means = np.array([float(row[f"mean_{side}"]) for row in residual_records])
    actual = np.array([float(row[f"actual_{side}"]) for row in residual_records])
    denominator = float(np.sum((actual - means) ** 2 - means))
    if denominator <= 0:
        return maximum_dispersion
    dispersion = float(np.sum(means ** 2) / denominator)
    return float(np.clip(dispersion, minimum_dispersion, maximum_dispersion))


def residual_kernel_distribution(
    mean_home: float,
    mean_away: float,
    residual_records: Sequence[Mapping[str, float]],
    origin_season: int,
    config: Mapping[str, Any],
) -> tuple[np.ndarray, str]:
    minimum = int(config["residualLibraryMinimumGames"])
    if len(residual_records) < minimum:
        raise ValueError(f"Residual library has {len(residual_records)}/{minimum} required prequential games")
    maximum_library = int(config.get("residualLibraryMaximumGames", 512))
    records = list(residual_records[-maximum_library:])
    offsets = np.asarray(config["residualKernelOffsets"], dtype=int)
    kernel = np.asarray(config["residualKernelWeights"], dtype=float)
    kernel /= kernel.sum()
    maximum_score = int(config["maximumScore"])
    tail_bucket = int(config["tailBucket"])
    if tail_bucket != maximum_score + 1:
        raise ValueError("Residual-kernel tail bucket must immediately follow maximum score")
    matrix = np.zeros((tail_bucket + 1, tail_bucket + 1), dtype=float)
    half_life = float(config.get("residualTimeDecayHalfLifeSeasons", 2.5))
    record_seasons = np.asarray([int(record["season"]) for record in records], dtype=int)
    time_weights = np.power(
        0.5,
        np.maximum(0, origin_season - record_seasons) / half_life,
    )
    residual_home = np.asarray(
        [float(record["actual_home"] - record["mean_home"]) for record in records]
    )
    residual_away = np.asarray(
        [float(record["actual_away"] - record["mean_away"]) for record in records]
    )
    home_scores = np.clip(
        np.rint(mean_home + residual_home[:, None] + offsets[None, :]),
        0,
        tail_bucket,
    ).astype(int)
    away_scores = np.clip(
        np.rint(mean_away + residual_away[:, None] + offsets[None, :]),
        0,
        tail_bucket,
    ).astype(int)
    pair_weights = (
        time_weights[:, None, None]
        * kernel[None, :, None]
        * kernel[None, None, :]
    )
    home_indexes = np.broadcast_to(home_scores[:, :, None], pair_weights.shape)
    away_indexes = np.broadcast_to(away_scores[:, None, :], pair_weights.shape)
    np.add.at(
        matrix,
        (home_indexes.ravel(), away_indexes.ravel()),
        pair_weights.ravel(),
    )
    probability_floor = float(config.get("probabilityFloor", EPSILON))
    matrix = np.maximum(matrix, probability_floor)
    matrix /= matrix.sum()
    library_hash = stable_hash([
        [row["game_id"], row["season"], row["week"], row["mean_home"], row["mean_away"], row["actual_home"], row["actual_away"]]
        for row in records
    ])
    return matrix, library_hash


def independent_count_distribution(
    mean_home: float,
    mean_away: float,
    home_dispersion: float,
    away_dispersion: float,
    config: Mapping[str, Any],
) -> np.ndarray:
    home = negative_binomial_pmf(mean_home, home_dispersion, int(config["maximumScore"]), int(config["tailBucket"]))
    away = negative_binomial_pmf(mean_away, away_dispersion, int(config["maximumScore"]), int(config["tailBucket"]))
    matrix = np.outer(home, away)
    matrix = np.maximum(matrix, float(config.get("probabilityFloor", EPSILON)))
    matrix /= matrix.sum()
    return matrix


def quantile_from_pmf(probabilities: np.ndarray, probability: float, support: np.ndarray | None = None) -> float:
    support = np.arange(len(probabilities)) if support is None else support
    index = min(len(probabilities) - 1, int(np.searchsorted(np.cumsum(probabilities), probability, side="left")))
    return float(support[index])


def discrete_crps(probabilities: np.ndarray, observation_index: int) -> float:
    observed = np.zeros_like(probabilities)
    observed[max(0, min(len(probabilities) - 1, observation_index)):] = 1.0
    return float(np.sum((np.cumsum(probabilities) - observed) ** 2))


@lru_cache(maxsize=8)
def _score_grid_indexes(size: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    values = np.arange(size, dtype=int)
    home_grid, away_grid = np.meshgrid(values, values, indexing="ij")
    return (
        home_grid,
        away_grid,
        home_grid - away_grid + size - 1,
        home_grid + away_grid,
    )


def grouped_score_probabilities(distribution: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    size = distribution.shape[0]
    home = distribution.sum(axis=1)
    away = distribution.sum(axis=0)
    _, _, margin_indexes, total_indexes = _score_grid_indexes(size)
    margin = np.bincount(
        margin_indexes.ravel(), weights=distribution.ravel(), minlength=2 * size - 1
    )
    total = np.bincount(
        total_indexes.ravel(), weights=distribution.ravel(), minlength=2 * size - 1
    )
    return home, away, margin, total


def interval(probabilities: np.ndarray, support: np.ndarray, mass: float) -> tuple[float, float]:
    lower = (1 - mass) / 2
    return quantile_from_pmf(probabilities, lower, support), quantile_from_pmf(probabilities, 1 - lower, support)


def evaluate_distribution(
    distribution: np.ndarray,
    actual_home: int,
    actual_away: int,
    energy_samples: int,
    seed: int,
    probability_floor: float = EPSILON,
) -> dict[str, Any]:
    if distribution.ndim != 2 or distribution.shape[0] != distribution.shape[1]:
        raise ValueError("Joint score distribution must be a square matrix")
    if abs(float(distribution.sum()) - 1.0) > 1e-9 or np.any(distribution < 0):
        raise ValueError("Joint score distribution is not normalized")
    size = distribution.shape[0]
    capped_home = min(size - 1, max(0, int(actual_home)))
    capped_away = min(size - 1, max(0, int(actual_away)))
    home, away, margin, total = grouped_score_probabilities(distribution)
    margin_support = np.arange(-(size - 1), size)
    total_support = np.arange(2 * size - 1)
    home_mean = float(np.dot(np.arange(size), home))
    away_mean = float(np.dot(np.arange(size), away))
    home_values = np.arange(size, dtype=float)
    away_values = np.arange(size, dtype=float)
    home_variance = float(np.dot((home_values - home_mean) ** 2, home))
    away_variance = float(np.dot((away_values - away_mean) ** 2, away))
    home_grid, away_grid, _, _ = _score_grid_indexes(size)
    score_covariance = float(
        np.sum((home_grid - home_mean) * (away_grid - away_mean) * distribution)
    )
    rng = np.random.default_rng(seed)
    flattened = distribution.ravel()
    cumulative = np.cumsum(flattened)
    cumulative[-1] = 1.0
    first = np.searchsorted(cumulative, rng.random(energy_samples), side="right")
    second = np.searchsorted(cumulative, rng.random(energy_samples), side="right")
    first_points = np.column_stack((first // size, first % size))
    second_points = np.column_stack((second // size, second % size))
    observed = np.array([capped_home, capped_away], dtype=float)
    energy = float(np.linalg.norm(first_points - observed, axis=1).mean() - 0.5 * np.linalg.norm(first_points - second_points, axis=1).mean())
    actual_margin = int(actual_home - actual_away)
    actual_total = int(actual_home + actual_away)
    censored_margin = capped_home - capped_away
    censored_total = capped_home + capped_away
    pit_rng = np.random.default_rng((int(seed) + 2_654_435_761) % (2**32 - 1))
    result: dict[str, Any] = {
        "energy_score": energy,
        "joint_log_score": -math.log(max(probability_floor, float(distribution[capped_home, capped_away]))),
        "home_crps": discrete_crps(home, capped_home),
        "away_crps": discrete_crps(away, capped_away),
        "margin_crps": discrete_crps(margin, censored_margin + size - 1),
        "total_crps": discrete_crps(total, min(len(total) - 1, censored_total)),
        "home_mean": home_mean,
        "away_mean": away_mean,
        "home_variance": home_variance,
        "away_variance": away_variance,
        "score_covariance": score_covariance,
        "actual_home": int(actual_home),
        "actual_away": int(actual_away),
        "home_absolute_error": abs(home_mean - actual_home),
        "away_absolute_error": abs(away_mean - actual_away),
        "home_squared_error": (home_mean - actual_home) ** 2,
        "away_squared_error": (away_mean - actual_away) ** 2,
        "margin_absolute_error": abs((home_mean - away_mean) - actual_margin),
        "total_absolute_error": abs((home_mean + away_mean) - actual_total),
        "home_win_probability": float(np.tril(distribution, k=-1).sum()),
        "tie_probability": float(np.trace(distribution)),
        "home_win_outcome": int(actual_margin > 0),
        "tie": actual_margin == 0,
        "pit_home": float(home[:capped_home].sum() + pit_rng.random() * home[capped_home]),
        "pit_away": float(away[:capped_away].sum() + pit_rng.random() * away[capped_away]),
    }
    for mass in (0.5, 0.8, 0.95):
        label = str(int(mass * 100))
        for name, probabilities, support, observed_value in (
            ("home", home, np.arange(size), capped_home),
            ("away", away, np.arange(size), capped_away),
            ("margin", margin, margin_support, censored_margin),
            ("total", total, total_support, censored_total),
        ):
            lower, upper = interval(probabilities, support, mass)
            result[f"coverage_{label}_{name}"] = int(lower <= observed_value <= upper)
            result[f"width_{label}_{name}"] = upper - lower
            if mass == 0.8:
                result[f"interval_80_{name}"] = [lower, upper]
    result["distribution_hash"] = sha256(np.round(distribution, 15).tobytes()).hexdigest()
    return result


def logistic_calibration(probabilities: np.ndarray, outcomes: np.ndarray) -> dict[str, Any] | None:
    if len(probabilities) < 20 or len(np.unique(outcomes)) < 2:
        return None
    bounded = np.clip(probabilities, 1e-9, 1 - 1e-9)
    predictor = np.log(bounded / (1 - bounded))
    intercept = 0.0
    slope = 1.0
    converged = False
    for _ in range(100):
        eta = np.clip(intercept + slope * predictor, -30, 30)
        fitted = 1 / (1 + np.exp(-eta))
        variance = np.maximum(fitted * (1 - fitted), 1e-9)
        residual = outcomes - fitted
        gradient = np.array([residual.sum(), np.dot(residual, predictor)])
        information = np.array([
            [variance.sum(), np.dot(variance, predictor)],
            [np.dot(variance, predictor), np.dot(variance, predictor ** 2)],
        ])
        try:
            step = np.linalg.solve(information, gradient)
        except np.linalg.LinAlgError:
            break
        step = np.clip(step, -2, 2)
        intercept += float(step[0])
        slope += float(step[1])
        if float(np.max(np.abs(step))) < 1e-8:
            converged = True
            break
    return {"intercept": intercept, "slope": slope, "observations": len(probabilities), "converged": converged}


def linear_score_calibration(predicted: np.ndarray, observed: np.ndarray) -> dict[str, Any] | None:
    if len(predicted) < 20 or float(np.var(predicted)) < 1e-12:
        return None
    design = np.column_stack((np.ones(len(predicted), dtype=float), predicted))
    coefficients = np.linalg.lstsq(design, observed, rcond=None)[0]
    return {
        "intercept": float(coefficients[0]),
        "slope": float(coefficients[1]),
        "observations": int(len(predicted)),
    }


def aggregate_scorecard(rows: pd.DataFrame) -> dict[str, Any]:
    if rows.empty:
        raise ValueError("Module 1 scorecard requires forecast rows")
    mean_fields = [
        "energy_score", "joint_log_score", "home_crps", "away_crps", "margin_crps", "total_crps",
        "home_absolute_error", "away_absolute_error", "margin_absolute_error", "total_absolute_error",
    ]
    result: dict[str, Any] = {"games": int(rows["game_id"].nunique()), "forecastRows": int(len(rows))}
    result.update({field: float(rows[field].mean()) for field in mean_fields})
    result["home_rmse"] = float(np.sqrt(rows["home_squared_error"].mean()))
    result["away_rmse"] = float(np.sqrt(rows["away_squared_error"].mean()))
    result["median_home_absolute_error"] = float(rows["home_absolute_error"].median())
    result["median_away_absolute_error"] = float(rows["away_absolute_error"].median())
    for mass in (50, 80, 95):
        for target in ("home", "away", "margin", "total"):
            result[f"coverage_{mass}_{target}"] = float(rows[f"coverage_{mass}_{target}"].mean())
            result[f"width_{mass}_{target}"] = float(rows[f"width_{mass}_{target}"].mean())
    binary = rows.loc[~rows["tie"]].copy()
    non_tie_probability = np.maximum(
        1e-12,
        1.0 - binary["tie_probability"].to_numpy(float),
    )
    probability = np.clip(
        binary["home_win_probability"].to_numpy(float) / non_tie_probability,
        1e-9,
        1 - 1e-9,
    )
    outcome = binary["home_win_outcome"].to_numpy(float)
    result["home_win_log_loss"] = float(np.mean(-(outcome * np.log(probability) + (1 - outcome) * np.log(1 - probability))))
    result["home_win_brier"] = float(np.mean((probability - outcome) ** 2))
    result["home_win_calibration"] = logistic_calibration(probability, outcome)
    for target in ("home", "away"):
        histogram, _ = np.histogram(np.clip(rows[f"pit_{target}"].to_numpy(float), 0, 1), bins=np.linspace(0, 1, 11))
        result[f"pit_{target}_deciles"] = histogram.tolist()
        result[f"pit_{target}_quantile_calibration"] = {
            f"{quantile:.1f}": float((rows[f"pit_{target}"] <= quantile).mean())
            for quantile in np.arange(0.1, 1.0, 0.1)
        }
        result[f"{target}_score_mean_calibration"] = linear_score_calibration(
            rows[f"{target}_mean"].to_numpy(float),
            rows[f"actual_{target}"].to_numpy(float),
        )
    actual_scores = rows[["actual_home", "actual_away"]].to_numpy(float)
    observed_covariance = np.cov(actual_scores, rowvar=False, ddof=1)
    result["distribution_moments"] = {
        "meanPredictedHomeVariance": float(rows["home_variance"].mean()),
        "meanPredictedAwayVariance": float(rows["away_variance"].mean()),
        "meanPredictedScoreCovariance": float(rows["score_covariance"].mean()),
        "observedHomeVariance": float(observed_covariance[0, 0]),
        "observedAwayVariance": float(observed_covariance[1, 1]),
        "observedScoreCovariance": float(observed_covariance[0, 1]),
    }
    result["forecastFailureRate"] = float(rows.get("forecast_failed", pd.Series(np.zeros(len(rows)))).mean())
    return result


def hierarchical_simultaneous_bootstrap(
    rows: pd.DataFrame,
    baseline_family: str,
    candidate_families: Sequence[str],
    metric: str,
    members: int,
    seed: int,
    block_length: int,
    interval_mass: float,
) -> dict[str, Any]:
    required = [baseline_family, *candidate_families]
    keys = ["game_id", "season", "week"]
    selected = rows.loc[rows["family"].isin(required), [*keys, "family", metric]].copy()
    if selected.duplicated([*keys, "family"]).any():
        raise ValueError("Bootstrap input has duplicate game-family rows")
    manifests = {
        family: set(map(tuple, selected.loc[selected["family"] == family, keys].to_numpy()))
        for family in required
    }
    if not manifests[baseline_family] or any(
        manifests[family] != manifests[baseline_family] for family in required
    ):
        raise ValueError("Bootstrap candidates do not share an exact game manifest")
    pivot = selected.pivot(index=keys, columns="family", values=metric)
    if any(family not in pivot.columns for family in required) or pivot[required].isna().any().any():
        raise ValueError("Bootstrap candidates do not share an identical row manifest")
    differences = pd.DataFrame({family: pivot[baseline_family] - pivot[family] for family in candidate_families}, index=pivot.index).reset_index()
    observed = differences.loc[:, list(candidate_families)].mean().to_numpy(float)
    seasons = sorted(int(value) for value in differences["season"].unique())
    rng = np.random.default_rng(seed)
    draws = np.zeros((members, len(candidate_families)), dtype=float)
    by_season_week: dict[int, dict[int, np.ndarray]] = {}
    for season in seasons:
        season_rows = differences[differences["season"] == season]
        by_season_week[season] = {
            int(week): group.loc[:, list(candidate_families)].to_numpy(float)
            for week, group in season_rows.groupby("week")
        }
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
    deviation = draws - observed
    critical = float(np.quantile(np.max(np.abs(deviation), axis=1), interval_mass))
    output: dict[str, Any] = {
        "baseline": baseline_family,
        "metric": metric,
        "members": members,
        "seed": seed,
        "blockLengthWeeks": block_length,
        "simultaneousMass": interval_mass,
        "seasons": seasons,
        "comparisons": {},
    }
    for index, family in enumerate(candidate_families):
        season_deltas = differences.groupby("season")[family].mean().to_dict()
        leave_one_out = {
            str(season): float(differences.loc[differences["season"] != season, family].mean())
            for season in seasons
        }
        output["comparisons"][family] = {
            "meanImprovement": float(observed[index]),
            "simultaneousInterval": [float(observed[index] - critical), float(observed[index] + critical)],
            "bootstrapProbabilityOfImprovement": float(np.mean(draws[:, index] > 0)),
            "seasonDeltas": {str(key): float(value) for key, value in season_deltas.items()},
            "improvedSeasons": int(sum(value > 0 for value in season_deltas.values())),
            "leaveOneSeasonOut": leave_one_out,
        }
    return output


def run_model_self_tests() -> dict[str, Any]:
    weight_check = season_weights(
        np.array([2019, 2020, 2021]),
        origin_season=2021,
        half_life=2.5,
        season_multipliers={2020: 0.5},
    )
    if not math.isclose(weight_check[1], 0.5 * (0.5 ** (1 / 2.5)), rel_tol=1e-12):
        raise AssertionError("Season observation multiplier was not applied from configuration")
    rows: list[dict[str, Any]] = []
    for season in (2021, 2022, 2023, 2024):
        for week in range(1, 19):
            for team, opponent, is_home, score in (("A", "B", 1, 27), ("B", "A", 0, 19)):
                rows.append({
                    "game_id": f"{season}-{week}", "season": season, "week": week,
                    "team": team, "opponent": opponent, "is_home": is_home,
                    "actual_score": score + (week % 3 - 1), "league_team_score_mean": 22.0,
                    "off_yards": 5.5 + int(team == "A"), "def_yards": 5.0 - 0.5 * int(opponent == "B"),
                })
    training = pd.DataFrame(rows)
    target = training.tail(2).copy()
    ridge = fit_ridge_score_model(
        training.iloc[:-2], ["off_yards", "def_yards"], 2024, 2.5, 8,
        origin_week=18, numerics=DEFAULT_NUMERICS,
    )
    ridge_prediction = predict_ridge_score(ridge, target)
    if not (ridge_prediction[0] > ridge_prediction[1]):
        raise AssertionError("Ridge self-test failed to recover the stronger team")
    poisson = fit_poisson_score_model(
        training.iloc[:-2], ["off_yards", "def_yards"], 2024, 2.5, 2, 75, 1e-7,
        origin_week=18, numerics=DEFAULT_NUMERICS,
    )
    if not poisson.converged:
        raise AssertionError("Count-model self-test did not converge")
    poisson_prediction = predict_poisson_score(poisson, target)
    if np.any(poisson_prediction <= 0):
        raise AssertionError("Poisson self-test produced a non-positive mean")
    if not (poisson_prediction[0] > poisson_prediction[1]):
        raise AssertionError("Count-model self-test failed to recover the stronger team")
    residuals = [
        {"game_id": f"r-{index}", "season": 2023, "week": index % 18 + 1,
         "mean_home": 24.0, "mean_away": 21.0, "actual_home": 24 + index % 5 - 2,
         "actual_away": 21 + index % 3 - 1}
        for index in range(160)
    ]
    distribution, _ = residual_kernel_distribution(24, 21, residuals, 2024, {
        "residualLibraryMinimumGames": 128, "residualLibraryMaximumGames": 512,
        "residualKernelOffsets": [-2, -1, 0, 1, 2], "residualKernelWeights": [0.05, 0.2, 0.5, 0.2, 0.05],
        "maximumScore": 70, "tailBucket": 71, "probabilityFloor": 1e-12,
    })
    if not math.isclose(float(distribution.sum()), 1.0, abs_tol=1e-12):
        raise AssertionError("Residual distribution self-test is not normalized")
    evaluation = evaluate_distribution(distribution, 24, 21, 256, 20260824)
    if evaluation["energy_score"] < 0:
        raise AssertionError("Energy score self-test is negative")
    incomplete = pd.DataFrame(
        [
            {"game_id": "a", "season": 2023, "week": 1, "family": "c0", "energy_score": 1.0},
            {"game_id": "a", "season": 2023, "week": 1, "family": "c1", "energy_score": 0.9},
            {"game_id": "b", "season": 2023, "week": 2, "family": "c0", "energy_score": 1.1},
        ]
    )
    try:
        hierarchical_simultaneous_bootstrap(
            incomplete, "c0", ["c1"], "energy_score", 10, 1, 1, 0.9
        )
    except ValueError:
        pass
    else:
        raise AssertionError("Bootstrap self-test silently dropped a missing challenger game")
    return {
        "ridgeModelHash": ridge.model_hash,
        "poissonModelHash": poisson.model_hash,
        "distributionHash": evaluation["distribution_hash"],
        "normalized": True,
    }
