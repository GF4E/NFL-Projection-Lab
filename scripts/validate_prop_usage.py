#!/usr/bin/env python3
"""Leakage-safe validation for usage x efficiency NFL player-yard projections."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from io import BytesIO
from urllib.request import urlopen

import numpy as np
import pandas as pd


SEASONS = range(2020, 2026)
TARGET_SEASONS = range(2022, 2026)
TUNING_SEASONS = {2022, 2023}
HOLDOUT_SEASONS = {2024, 2025}
MARKETS = {
    "player_pass_yds": ("attempts", "passing_yards"),
    "player_rush_yds": ("carries", "rushing_yards"),
    "player_reception_yds": ("targets", "receiving_yards"),
}
USAGE_WEIGHTS = (0.50, 0.65, 0.75, 0.85, 0.95)
PRIOR_OPPORTUNITIES = (0, 5, 10, 20, 40, 80, 160)
VALUE_WEIGHT = 0.85
MINIMUM_GAMES = 6
WINDOW_GAMES = 8
BOOTSTRAP_MEMBERS = 5000
BOOTSTRAP_SEED = 20260812


def download_csv(url: str) -> pd.DataFrame:
    with urlopen(url, timeout=120) as response:
        return pd.read_csv(BytesIO(response.read()), low_memory=False)


def normalized_name(value: object) -> str:
    return "".join(character for character in str(value).lower() if character.isalnum())


def weighted_mean(values: np.ndarray, decay: float) -> float:
    weights = decay ** np.arange(len(values), dtype=float)
    return float(np.sum(values * weights) / np.sum(weights))


def load_participation() -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    for season in SEASONS:
        stats = download_csv(
            f"https://github.com/nflverse/nflverse-data/releases/download/stats_player/"
            f"stats_player_week_{season}.csv"
        )
        snaps = download_csv(
            f"https://github.com/nflverse/nflverse-data/releases/download/snap_counts/"
            f"snap_counts_{season}.csv"
        )
        stats = stats[stats["season_type"].eq("REG")].copy()
        snaps = snaps[snaps["game_type"].eq("REG") & snaps["offense_snaps"].gt(0)].copy()
        stats["player_key"] = stats["player_display_name"].map(normalized_name)
        snaps["player_key"] = snaps["player"].map(normalized_name)
        columns = ["game_id", "player_key", "season", "week", *{
            column for pair in MARKETS.values() for column in pair
        }]
        merged = snaps[["game_id", "player_key", "season", "week"]].drop_duplicates().merge(
            stats[columns], on=["game_id", "player_key", "season", "week"], how="left"
        )
        for opportunities, yards in MARKETS.values():
            merged[opportunities] = merged[opportunities].fillna(0.0)
            merged[yards] = merged[yards].fillna(0.0)
        frames.append(merged)
    return pd.concat(frames, ignore_index=True).sort_values(["season", "week", "game_id"])


def league_efficiency_before(rows: pd.DataFrame) -> dict[tuple[int, int, str], float]:
    result: dict[tuple[int, int, str], float] = {}
    for market, (opportunities, yards) in MARKETS.items():
        running_opportunities = 0.0
        running_yards = 0.0
        for (season, week), week_rows in rows.groupby(["season", "week"], sort=True):
            result[(int(season), int(week), market)] = (
                running_yards / running_opportunities if running_opportunities > 0 else 0.0
            )
            running_opportunities += float(week_rows[opportunities].sum())
            running_yards += float(week_rows[yards].sum())
    return result


def forecast_rows(rows: pd.DataFrame) -> pd.DataFrame:
    league_efficiencies = league_efficiency_before(rows)
    output: list[dict[str, float | int | str]] = []
    for market, (opportunities, yards) in MARKETS.items():
        for player, player_rows in rows.groupby("player_key"):
            history: list[tuple[float, float]] = []
            for row in player_rows.sort_values(["season", "week", "game_id"]).itertuples(index=False):
                actual_opportunities = float(getattr(row, opportunities))
                actual_yards = float(getattr(row, yards))
                if int(row.season) in TARGET_SEASONS and actual_opportunities > 0 and len(history) >= MINIMUM_GAMES:
                    recent = history[-WINDOW_GAMES:][::-1]
                    recent_yards = np.array([sample[1] for sample in recent], dtype=float)
                    recent_opportunities = np.array([sample[0] for sample in recent], dtype=float)
                    baseline = weighted_mean(recent_yards, VALUE_WEIGHT)
                    value_weights = VALUE_WEIGHT ** np.arange(len(recent), dtype=float)
                    weighted_yards = float(np.sum(recent_yards * value_weights))
                    weighted_opportunities = float(np.sum(recent_opportunities * value_weights))
                    league_efficiency = league_efficiencies[(int(row.season), int(row.week), market)]
                    for usage_weight in USAGE_WEIGHTS:
                        projected_opportunities = weighted_mean(recent_opportunities, usage_weight)
                        for prior in PRIOR_OPPORTUNITIES:
                            denominator = weighted_opportunities + prior
                            efficiency = (
                                (weighted_yards + prior * league_efficiency) / denominator
                                if denominator > 0 else league_efficiency
                            )
                            challenger = projected_opportunities * efficiency
                            output.append({
                                "market": market,
                                "season": int(row.season),
                                "player": player,
                                "usage_weight": usage_weight,
                                "prior_opportunities": prior,
                                "actual": actual_yards,
                                "baseline_error": abs(actual_yards - baseline),
                                "challenger_error": abs(actual_yards - challenger),
                                "baseline_squared_error": (actual_yards - baseline) ** 2,
                                "challenger_squared_error": (actual_yards - challenger) ** 2,
                            })

                history.append((actual_opportunities, actual_yards))
    return pd.DataFrame(output)


def block_bootstrap_interval(rows: pd.DataFrame) -> tuple[float, float]:
    blocks = [block["baseline_error"].to_numpy() - block["challenger_error"].to_numpy()
              for _, block in rows.groupby(["season", "player"])]
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    improvements = np.empty(BOOTSTRAP_MEMBERS)
    for index in range(BOOTSTRAP_MEMBERS):
        sampled = rng.integers(0, len(blocks), size=len(blocks))
        values = np.concatenate([blocks[block_index] for block_index in sampled])
        improvements[index] = float(np.mean(values))
    low, high = np.quantile(improvements, [0.10, 0.90])
    return float(low), float(high)


def summarize(forecasts: pd.DataFrame) -> dict[str, object]:
    results: list[dict[str, object]] = []
    for market in MARKETS:
        market_rows = forecasts[forecasts["market"].eq(market)]
        tuning = market_rows[market_rows["season"].isin(TUNING_SEASONS)]
        grouped = tuning.groupby(["usage_weight", "prior_opportunities"], as_index=False).agg(
            baseline_mae=("baseline_error", "mean"), challenger_mae=("challenger_error", "mean")
        )
        grouped["improvement"] = grouped["baseline_mae"] - grouped["challenger_mae"]
        chosen = grouped.sort_values(["improvement", "usage_weight", "prior_opportunities"], ascending=[False, True, True]).iloc[0]
        selected = market_rows[
            market_rows["usage_weight"].eq(chosen["usage_weight"]) &
            market_rows["prior_opportunities"].eq(chosen["prior_opportunities"])
        ].copy()
        holdout = selected[selected["season"].isin(HOLDOUT_SEASONS)]
        baseline_mae = float(holdout["baseline_error"].mean())
        challenger_mae = float(holdout["challenger_error"].mean())
        baseline_rmse = float(np.sqrt(holdout["baseline_squared_error"].mean()))
        challenger_rmse = float(np.sqrt(holdout["challenger_squared_error"].mean()))
        interval = block_bootstrap_interval(holdout)
        by_season = []
        for season, season_rows in selected.groupby("season"):
            season_baseline = float(season_rows["baseline_error"].mean())
            season_challenger = float(season_rows["challenger_error"].mean())
            by_season.append({
                "season": int(season),
                "baselineMae": round(season_baseline, 4),
                "challengerMae": round(season_challenger, 4),
                "improvementPercent": round(100 * (season_baseline - season_challenger) / season_baseline, 3),
            })
        promoted = (
            challenger_mae < baseline_mae and challenger_rmse < baseline_rmse and
            interval[0] > 0 and all(row["improvementPercent"] > 0 for row in by_season if row["season"] in HOLDOUT_SEASONS)
        )
        results.append({
            "market": market,
            "tunedOnSeasons": sorted(TUNING_SEASONS),
            "holdoutSeasons": sorted(HOLDOUT_SEASONS),
            "selectedUsageRecencyWeight": float(chosen["usage_weight"]),
            "selectedEfficiencyPriorOpportunities": int(chosen["prior_opportunities"]),
            "holdoutForecasts": int(len(holdout)),
            "holdoutBaselineMae": round(baseline_mae, 4),
            "holdoutChallengerMae": round(challenger_mae, 4),
            "holdoutRelativeMaeImprovementPercent": round(100 * (baseline_mae - challenger_mae) / baseline_mae, 3),
            "holdoutBaselineRmse": round(baseline_rmse, 4),
            "holdoutChallengerRmse": round(challenger_rmse, 4),
            "blockBootstrap80PercentMeanAbsoluteErrorImprovement": [round(interval[0], 4), round(interval[1], 4)],
            "seasonResults": by_season,
            "decision": "promoted" if promoted else "rejected",
        })
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "trainingSource": "nflverse weekly player statistics and snap-count participation",
        "sourceSeasons": list(SEASONS),
        "baseline": "Eight-game exponentially weighted yardage mean with 0.85 per-game recency weight",
        "challenger": "Eight-game workload forecast multiplied by player yards per opportunity, shrunk toward the leakage-safe cumulative league rate",
        "leakageControl": "Every forecast, player history and league prior uses only earlier completed weeks",
        "parameterSelection": "35 candidates selected on 2022-2023 only; 2024-2025 untouched holdout",
        "promotionGate": "Positive holdout MAE and RMSE, positive MAE in each holdout season, and player-season block-bootstrap 80% interval above zero",
        "results": results,
    }


if __name__ == "__main__":
    print(json.dumps(summarize(forecast_rows(load_participation())), indent=2))
