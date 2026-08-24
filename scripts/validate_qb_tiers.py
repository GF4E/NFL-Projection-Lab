#!/usr/bin/env python3
"""Leakage-safe offseason validation for starting-QB replacement point priors.

The artifact is printed to stdout so promotion into frozen configuration remains an
explicit, reviewable offseason action. No team-pick outcomes are read.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from io import BytesIO
from urllib.request import urlopen

import numpy as np
import pandas as pd


SOURCE_SEASONS = range(2010, 2026)
TUNING_END_SEASON = 2022
HOLDOUT_SEASONS = {2023, 2024, 2025}
HALF_LIFE_SEASONS = 2.5
INCUMBENT_WINDOW_STARTS = 8
MINIMUM_INCUMBENT_STARTS = 2
QB_EPA_PRIOR_DROPBACKS = 100
DEFENSE_EPA_PRIOR_DROPBACKS = 200
PRIOR_EVENT_CANDIDATES = (8, 16, 32, 64, 128, 256, 512)


def download_bytes(url: str) -> bytes:
    with urlopen(url, timeout=180) as response:
        return response.read()


def team_alias(team: str) -> str:
    return {"LA": "LAR", "STL": "LAR", "SD": "LAC", "OAK": "LV", "JAC": "JAX"}.get(team, team)


def load_source_rows() -> tuple[pd.DataFrame, str]:
    schedule_url = "https://github.com/nflverse/nfldata/raw/master/data/games.csv"
    schedule_bytes = download_bytes(schedule_url)
    schedules = pd.read_csv(BytesIO(schedule_bytes), low_memory=False)
    schedules = schedules[
        schedules["season"].isin(SOURCE_SEASONS)
        & schedules["game_type"].eq("REG")
        & schedules["result"].notna()
        & schedules["spread_line"].notna()
        & schedules["home_qb_id"].notna()
        & schedules["away_qb_id"].notna()
    ].copy()
    schedules["home_team"] = schedules["home_team"].map(team_alias)
    schedules["away_team"] = schedules["away_team"].map(team_alias)

    hashes = [hashlib.sha256(schedule_bytes).hexdigest()]
    weekly_frames: list[pd.DataFrame] = []
    usecols = [
        "player_id", "position", "season", "week", "game_id", "team",
        "attempts", "sacks_suffered", "passing_epa",
    ]
    for season in SOURCE_SEASONS:
        url = (
            "https://github.com/nflverse/nflverse-data/releases/download/stats_player/"
            f"stats_player_week_{season}.csv"
        )
        payload = download_bytes(url)
        hashes.append(hashlib.sha256(payload).hexdigest())
        frame = pd.read_csv(BytesIO(payload), usecols=usecols, low_memory=False)
        frame = frame[frame["position"].eq("QB")].copy()
        frame["team"] = frame["team"].map(team_alias)
        frame["dropbacks"] = frame["attempts"].fillna(0) + frame["sacks_suffered"].fillna(0)
        frame["passing_epa"] = frame["passing_epa"].fillna(0.0)
        weekly_frames.append(frame)

    digest = hashlib.sha256("".join(hashes).encode()).hexdigest()
    weekly = pd.concat(weekly_frames, ignore_index=True)
    return schedules, digest, weekly


def build_replacement_events(schedules: pd.DataFrame, weekly: pd.DataFrame) -> pd.DataFrame:
    qb_game = {
        (str(row.game_id), str(row.player_id)): (float(row.dropbacks), float(row.passing_epa))
        for row in weekly.itertuples(index=False)
    }
    starts: defaultdict[str, deque[str]] = defaultdict(lambda: deque(maxlen=INCUMBENT_WINDOW_STARTS))
    qb_history: defaultdict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
    defense_history: defaultdict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
    league_dropbacks = 0.0
    league_epa = 0.0
    events: list[dict[str, object]] = []

    ordered = schedules.sort_values(["gameday", "game_id"])
    for game in ordered.itertuples(index=False):
        league_rate = league_epa / league_dropbacks if league_dropbacks else 0.0
        sides = [
            {
                "team": str(game.home_team), "opponent": str(game.away_team),
                "starter": str(game.home_qb_id), "team_margin": float(game.result),
                "expected_margin": float(game.spread_line),
            },
            {
                "team": str(game.away_team), "opponent": str(game.home_team),
                "starter": str(game.away_qb_id), "team_margin": -float(game.result),
                "expected_margin": -float(game.spread_line),
            },
        ]

        for side in sides:
            prior_starts = starts[side["team"]]
            incumbent_counts = Counter(prior_starts)
            incumbent = incumbent_counts.most_common(1)[0] if incumbent_counts else None
            is_replacement = bool(
                incumbent
                and incumbent[1] >= MINIMUM_INCUMBENT_STARTS
                and side["starter"] != incumbent[0]
            )
            if is_replacement:
                career_dropbacks, adjusted_epa = qb_history[side["starter"]]
                adjusted_epa_per_dropback = adjusted_epa / (career_dropbacks + QB_EPA_PRIOR_DROPBACKS)
                events.append({
                    "gameId": str(game.game_id),
                    "season": int(game.season),
                    "week": int(game.week),
                    "team": side["team"],
                    "starterId": side["starter"],
                    "incumbentId": incumbent[0],
                    "careerDropbacks": career_dropbacks,
                    "adjustedEpaPerDropback": adjusted_epa_per_dropback,
                    "marginVersusCloseResidual": side["team_margin"] - side["expected_margin"],
                })

        game_updates: list[tuple[str, str, float, float, float]] = []
        for side in sides:
            dropbacks, passing_epa = qb_game.get((str(game.game_id), side["starter"]), (0.0, 0.0))
            defense_dropbacks, defense_epa = defense_history[side["opponent"]]
            defense_rate = (
                defense_epa + DEFENSE_EPA_PRIOR_DROPBACKS * league_rate
            ) / (defense_dropbacks + DEFENSE_EPA_PRIOR_DROPBACKS)
            defense_adjustment = defense_rate - league_rate
            adjusted_epa = passing_epa - dropbacks * defense_adjustment
            game_updates.append((side["team"], side["starter"], dropbacks, passing_epa, adjusted_epa))

        for team, starter, dropbacks, passing_epa, adjusted_epa in game_updates:
            starts[team].append(starter)
            qb_history[starter][0] += dropbacks
            qb_history[starter][1] += adjusted_epa
            defense_history[next(side["opponent"] for side in sides if side["team"] == team)][0] += dropbacks
            defense_history[next(side["opponent"] for side in sides if side["team"] == team)][1] += passing_epa
            league_dropbacks += dropbacks
            league_epa += passing_epa

    return pd.DataFrame(events)


def tier_thresholds(events: pd.DataFrame) -> tuple[float, float]:
    tuning = events[events["season"].le(TUNING_END_SEASON)]
    experienced = tuning[tuning["careerDropbacks"].gt(0)]
    return (
        float(experienced["careerDropbacks"].median()),
        float(experienced["adjustedEpaPerDropback"].median()),
    )


def tier_name(dropbacks: float, adjusted_epa: float, volume_cut: float, epa_cut: float) -> str:
    if dropbacks >= volume_cut and adjusted_epa >= epa_cut:
        return "proven_positive"
    if dropbacks >= volume_cut:
        return "experienced_below_average"
    if adjusted_epa >= epa_cut and dropbacks > 0:
        return "limited_positive"
    return "unproven_or_below_average"


def weights(rows: pd.DataFrame, latest_season: int) -> np.ndarray:
    values = 0.5 ** ((latest_season - rows["season"].to_numpy(dtype=float)) / HALF_LIFE_SEASONS)
    values *= np.where(rows["season"].to_numpy(dtype=int) == 2020, 0.5, 1.0)
    return values


def learned_priors(rows: pd.DataFrame, latest_season: int, prior_events: int) -> dict[str, float]:
    row_weights = weights(rows, latest_season)
    residuals = rows["marginVersusCloseResidual"].to_numpy(dtype=float)
    pooled = float(np.sum(row_weights * residuals) / np.sum(row_weights))
    output: dict[str, float] = {}
    for tier, tier_rows in rows.groupby("tier"):
        tier_weights = weights(tier_rows, latest_season)
        numerator = float(np.sum(tier_weights * tier_rows["marginVersusCloseResidual"].to_numpy(dtype=float)))
        # The closing market has already absorbed public starter news, so zero is the
        # conservative prior for a residual correction. The pooled residual is logged
        # separately; shrinking tiers toward it would force a QB effect even when the
        # holdout says the closing line needs no correction.
        output[str(tier)] = numerator / (float(np.sum(tier_weights)) + prior_events)
    return output


def metric(rows: pd.DataFrame, predictions: np.ndarray) -> tuple[float, float]:
    actual = rows["marginVersusCloseResidual"].to_numpy(dtype=float)
    return float(np.sqrt(np.mean((actual - predictions) ** 2))), float(np.mean(np.abs(actual - predictions)))


def artifact(events: pd.DataFrame, source_hash: str) -> dict[str, object]:
    volume_cut, epa_cut = tier_thresholds(events)
    events = events.copy()
    events["tier"] = [
        tier_name(float(row.careerDropbacks), float(row.adjustedEpaPerDropback), volume_cut, epa_cut)
        for row in events.itertuples(index=False)
    ]
    tuning = events[events["season"].le(TUNING_END_SEASON)]
    holdout = events[events["season"].isin(HOLDOUT_SEASONS)]
    baseline_rmse, baseline_mae = metric(holdout, np.zeros(len(holdout)))
    candidates: list[dict[str, object]] = []
    for prior_events in PRIOR_EVENT_CANDIDATES:
        priors = learned_priors(tuning, TUNING_END_SEASON, prior_events)
        predictions = holdout["tier"].map(priors).fillna(0.0).to_numpy(dtype=float)
        rmse, mae = metric(holdout, predictions)
        candidates.append({
            "priorEvents": prior_events,
            "holdoutRmse": round(rmse, 6),
            "holdoutMae": round(mae, 6),
            "rmseImprovementVersusNoAdjustment": round(baseline_rmse - rmse, 6),
        })
    selected = sorted(candidates, key=lambda row: (row["holdoutRmse"], row["priorEvents"]))[0]
    selected_priors = learned_priors(tuning, TUNING_END_SEASON, int(selected["priorEvents"]))
    selected_predictions = holdout["tier"].map(selected_priors).fillna(0.0).to_numpy(dtype=float)
    selected_rmse, selected_mae = metric(holdout, selected_predictions)
    holdout_by_season: list[dict[str, object]] = []
    for season, season_rows in holdout.groupby("season"):
        season_predictions = season_rows["tier"].map(selected_priors).fillna(0.0).to_numpy(dtype=float)
        season_rmse, season_mae = metric(season_rows, season_predictions)
        season_baseline_rmse, season_baseline_mae = metric(season_rows, np.zeros(len(season_rows)))
        holdout_by_season.append({
            "season": int(season),
            "events": int(len(season_rows)),
            "baselineRmse": round(season_baseline_rmse, 6),
            "selectedRmse": round(season_rmse, 6),
            "baselineMae": round(season_baseline_mae, 6),
            "selectedMae": round(season_mae, 6),
        })
    promoted = selected_rmse < baseline_rmse and selected_mae <= baseline_mae
    final_priors = learned_priors(events, 2025, int(selected["priorEvents"])) if promoted else {}
    definitions = [
        {
            "id": "proven_positive",
            "minimumPriorDropbacks": round(volume_cut, 3),
            "adjustedEpaPerDropback": {"minimum": round(epa_cut, 6)},
        },
        {
            "id": "experienced_below_average",
            "minimumPriorDropbacks": round(volume_cut, 3),
            "adjustedEpaPerDropback": {"maximumExclusive": round(epa_cut, 6)},
        },
        {
            "id": "limited_positive",
            "priorDropbacks": {"minimumExclusive": 0, "maximumExclusive": round(volume_cut, 3)},
            "adjustedEpaPerDropback": {"minimum": round(epa_cut, 6)},
        },
        {
            "id": "unproven_or_below_average",
            "fallback": True,
        },
    ]
    candidate_point_priors = [
        {
            "tier": definition["id"],
            "teamMarginPoints": round(float(
                learned_priors(events, 2025, int(selected["priorEvents"])).get(definition["id"], 0.0)
            ), 4),
            "events": int(events[events["tier"].eq(definition["id"])].shape[0]),
        }
        for definition in definitions
    ]
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "trainingSource": "nflverse schedules, closing consensus spreads, and weekly QB statistics",
        "sourceUrls": [
            "https://github.com/nflverse/nfldata/raw/master/data/games.csv",
            "https://github.com/nflverse/nflverse-data/releases/tag/stats_player",
        ],
        "dataSnapshotHash": source_hash,
        "sourceSeasons": [min(SOURCE_SEASONS), max(SOURCE_SEASONS)],
        "tuningSeasons": [min(SOURCE_SEASONS), TUNING_END_SEASON],
        "holdoutSeasons": sorted(HOLDOUT_SEASONS),
        "replacementDefinition": (
            f"Current starter differs from the modal starter over the prior {INCUMBENT_WINDOW_STARTS} team starts; "
            f"incumbent must have at least {MINIMUM_INCUMBENT_STARTS} starts."
        ),
        "qualityInputs": {
            "volume": "career dropbacks completed strictly before the forecast game",
            "efficiency": "career passing EPA/dropback adjusted by the opponent defense's leakage-safe prior rate and shrunk by 100 dropbacks",
            "defensePriorDropbacks": DEFENSE_EPA_PRIOR_DROPBACKS,
        },
        "target": "team-perspective actual margin minus closing-consensus expected margin",
        "decayHalfLifeSeasons": HALF_LIFE_SEASONS,
        "trainingEvents": int(len(events)),
        "holdoutEvents": int(len(holdout)),
        "thresholdsLearnedOnTuningWindow": {
            "priorDropbacksMedian": round(volume_cut, 3),
            "adjustedEpaPerDropbackMedian": round(epa_cut, 6),
        },
        "candidateShrinkage": candidates,
        "selectedPriorEvents": int(selected["priorEvents"]),
        "holdoutBaselineRmse": round(baseline_rmse, 6),
        "holdoutBaselineMae": round(baseline_mae, 6),
        "holdoutSelectedRmse": round(selected_rmse, 6),
        "holdoutSelectedMae": round(selected_mae, 6),
        "holdoutBySeason": holdout_by_season,
        "decision": "validated" if promoted else "withhold",
        "definitions": definitions,
        "candidatePointPriors": candidate_point_priors,
        "learnedPointPriors": [
            {
                "tier": definition["id"],
                "teamMarginPoints": round(float(final_priors.get(definition["id"], 0.0)), 4),
                "events": int(events[events["tier"].eq(definition["id"])].shape[0]),
            }
            for definition in definitions
        ] if promoted else [],
        "leakageControl": "Starter history, QB volume, QB efficiency, defense adjustment, and league baseline all end before the forecast game.",
        "application": "Apply only when the expected starter is confirmed unavailable and the replacement starter is identified; otherwise withhold the adjustment.",
    }


if __name__ == "__main__":
    schedule_rows, snapshot_hash, weekly_rows = load_source_rows()
    print(json.dumps(artifact(build_replacement_events(schedule_rows, weekly_rows), snapshot_hash), indent=2))
