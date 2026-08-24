import { structuralConfig } from "./config";
import { UNIT_CENTS } from "./play-card";

export function portfolioTriggerSql(): string {
  const maximumWeekCents = structuralConfig.sizing.maximumWeekUnits * UNIT_CENTS;
  const maximumGameCents = structuralConfig.sizing.maximumGameUnits * UNIT_CENTS;
  const maximumSidePositions = structuralConfig.sizing.maximumSidePositionsPerGame;
  const maximumTotals = structuralConfig.sizing.maximumTotalsPerGame;
  return `CREATE TRIGGER IF NOT EXISTS approval_portfolio_guard_v2
    BEFORE UPDATE OF status ON plays
    WHEN OLD.status = 'research' AND NEW.status = 'card'
    BEGIN
      SELECT CASE WHEN (
        SELECT COALESCE(SUM(stake_cents), 0) FROM plays
        WHERE id <> NEW.id AND season = NEW.season AND week = NEW.week AND status IN ('card', 'placed', 'settled')
      ) + NEW.stake_cents > ${maximumWeekCents}
      THEN RAISE(ABORT, 'Weekly exposure cannot exceed ${structuralConfig.sizing.maximumWeekUnits}u') END;

      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM (
          SELECT DISTINCT json_extract(value, '$.gameId') AS game_id FROM json_each(NEW.contract_json)
        ) AS proposed_games
        WHERE (
          SELECT COALESCE(SUM(existing.stake_cents), 0) FROM plays AS existing
          WHERE existing.id <> NEW.id AND existing.season = NEW.season AND existing.week = NEW.week
            AND existing.status IN ('card', 'placed', 'settled')
            AND EXISTS (
              SELECT 1 FROM json_each(existing.contract_json) AS existing_leg
              WHERE json_extract(existing_leg.value, '$.gameId') = proposed_games.game_id
            )
        ) + NEW.stake_cents > ${maximumGameCents}
      ) THEN RAISE(ABORT, 'Game exposure cannot exceed ${structuralConfig.sizing.maximumGameUnits}u') END;

      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM (
          SELECT json_extract(value, '$.gameId') AS game_id,
            SUM(CASE WHEN json_extract(value, '$.market') IN ('spread', 'moneyline', 'teaser') THEN 1 ELSE 0 END) AS side_count
          FROM json_each(NEW.contract_json) GROUP BY json_extract(value, '$.gameId')
        ) AS proposed_games
        WHERE proposed_games.side_count + (
          SELECT COUNT(*) FROM plays AS existing, json_each(existing.contract_json) AS existing_leg
          WHERE existing.id <> NEW.id AND existing.season = NEW.season AND existing.week = NEW.week
            AND existing.status IN ('card', 'placed', 'settled')
            AND json_extract(existing_leg.value, '$.gameId') = proposed_games.game_id
            AND json_extract(existing_leg.value, '$.market') IN ('spread', 'moneyline', 'teaser')
        ) > ${maximumSidePositions}
      ) THEN RAISE(ABORT, 'Only one side position is permitted per game') END;

      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM (
          SELECT json_extract(value, '$.gameId') AS game_id,
            SUM(CASE WHEN json_extract(value, '$.market') = 'total' THEN 1 ELSE 0 END) AS total_count
          FROM json_each(NEW.contract_json) GROUP BY json_extract(value, '$.gameId')
        ) AS proposed_games
        WHERE proposed_games.total_count + (
          SELECT COUNT(*) FROM plays AS existing, json_each(existing.contract_json) AS existing_leg
          WHERE existing.id <> NEW.id AND existing.season = NEW.season AND existing.week = NEW.week
            AND existing.status IN ('card', 'placed', 'settled')
            AND json_extract(existing_leg.value, '$.gameId') = proposed_games.game_id
            AND json_extract(existing_leg.value, '$.market') = 'total'
        ) > ${maximumTotals}
      ) THEN RAISE(ABORT, 'Only one total is permitted per game') END;
    END`;
}

export function contractGuardTriggerSql(): string {
  const exceptionalProbabilityEdge = structuralConfig.monitoring.pushEdgeThreshold;
  const exceptionalTeaserEvPercent = structuralConfig.teasers.preferredOpponentExceptionalEv * 100;
  return `CREATE TRIGGER IF NOT EXISTS approval_contract_guard_v6
    BEFORE UPDATE OF status ON plays
    WHEN OLD.status = 'research' AND NEW.status = 'card'
    BEGIN
      SELECT CASE WHEN NEW.forecast_json IS NULL
        OR json_valid(NEW.forecast_json) = 0
        OR NULLIF(json_extract(NEW.forecast_json, '$.configHash'), '') IS NULL
        OR NULLIF(json_extract(NEW.forecast_json, '$.dataHash'), '') IS NULL
        OR NULLIF(json_extract(NEW.forecast_json, '$.consensusSnapshotId'), '') IS NULL
        OR json_array_length(json_extract(NEW.forecast_json, '$.legs')) <> json_array_length(NEW.contract_json)
      THEN RAISE(ABORT, 'Approval requires a complete forecast and consensus snapshot') END;

      SELECT CASE WHEN json_valid(NEW.contract_json) = 0
        OR json_type(NEW.contract_json) <> 'array'
        OR json_array_length(NEW.contract_json) = 0
      THEN RAISE(ABORT, 'A stored contract must contain at least one leg') END;

      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM json_each(NEW.contract_json)
        WHERE NULLIF(TRIM(COALESCE(json_extract(value, '$.sourceQuoteId'), '')), '') IS NULL
      ) THEN RAISE(ABORT, 'Every contract leg must reference its live source quote') END;

      SELECT CASE WHEN (
        SELECT COUNT(*) FROM json_each(NEW.contract_json)
      ) <> (
        SELECT COUNT(DISTINCT json_extract(value, '$.sourceQuoteId')) FROM json_each(NEW.contract_json)
      ) THEN RAISE(ABORT, 'A source quote can appear only once in a contract') END;

      SELECT CASE WHEN NEW.play_type = 'single' AND (
        json_array_length(NEW.contract_json) <> 1
        OR NEW.market <> json_extract(NEW.contract_json, '$[0].market')
        OR NEW.game_id <> json_extract(NEW.contract_json, '$[0].gameId')
        OR json_extract(NEW.contract_json, '$[0].market') = 'teaser'
      ) THEN RAISE(ABORT, 'A straight contract must contain exactly one matching leg') END;

      SELECT CASE WHEN NEW.play_type = 'parlay' AND (
        NEW.market <> 'parlay'
        OR json_array_length(NEW.contract_json) < 2
        OR EXISTS (
          SELECT 1 FROM json_each(NEW.contract_json)
          WHERE json_extract(value, '$.market') = 'teaser'
        )
        OR (SELECT COUNT(DISTINCT json_extract(value, '$.gameId')) FROM json_each(NEW.contract_json))
          <> json_array_length(NEW.contract_json)
      ) THEN RAISE(ABORT, 'Parlay legs must be valid independent-game contracts') END;

      SELECT CASE WHEN NEW.play_type = 'teaser' AND (
        NEW.market <> 'teaser'
        OR json_array_length(NEW.contract_json) <> 2
        OR EXISTS (
          SELECT 1 FROM json_each(NEW.contract_json)
          WHERE json_extract(value, '$.market') <> 'teaser'
        )
        OR (SELECT COUNT(DISTINCT json_extract(value, '$.gameId')) FROM json_each(NEW.contract_json)) <> 2
      ) THEN RAISE(ABORT, 'Teaser legs must be valid two-game teaser contracts') END;

      SELECT CASE WHEN NEW.play_type = 'teaser' AND (
        json_extract(NEW.forecast_json, '$.authoritativeExpectedValuePercent') IS NULL
        OR json_extract(NEW.forecast_json, '$.authoritativeExpectedValuePercent') < 0
      ) THEN RAISE(ABORT, 'The exact two-team teaser price must have nonnegative EV') END;

      SELECT CASE WHEN NEW.play_type = 'parlay' AND EXISTS (
        SELECT 1 FROM json_each(json_extract(NEW.forecast_json, '$.legs'))
        WHERE COALESCE(json_extract(value, '$.pushProbability'), -1) <> 0
      ) THEN RAISE(ABORT, 'Parlay approval is withheld when a leg can push') END;

      SELECT CASE WHEN NEW.play_type = 'parlay' AND (
        json_extract(NEW.forecast_json, '$.authoritativeExpectedValuePercent') IS NULL
        OR json_extract(NEW.forecast_json, '$.authoritativeExpectedValuePercent') < 0
      ) THEN RAISE(ABORT, 'The exact independent-game parlay must have nonnegative EV') END;

      SELECT CASE WHEN NEW.play_type IN ('single', 'parlay') AND EXISTS (
        SELECT 1 FROM json_each(json_extract(NEW.forecast_json, '$.legs'))
        WHERE COALESCE(json_extract(value, '$.preferenceConflict'), 0) = 1
          AND (
            json_extract(value, '$.betProbability') IS NULL
            OR json_extract(value, '$.marketProbability') IS NULL
            OR json_extract(value, '$.betProbability') - json_extract(value, '$.marketProbability') < ${exceptionalProbabilityEdge}
          )
      ) THEN RAISE(ABORT, 'A side opposing a preferred team must clear the exceptional edge threshold') END;

      SELECT CASE WHEN NEW.play_type = 'teaser' AND EXISTS (
        SELECT 1 FROM json_each(json_extract(NEW.forecast_json, '$.legs'))
        WHERE COALESCE(json_extract(value, '$.preferenceConflict'), 0) = 1
      ) AND (
        json_extract(NEW.forecast_json, '$.authoritativeExpectedValuePercent') IS NULL
        OR json_extract(NEW.forecast_json, '$.authoritativeExpectedValuePercent') < ${exceptionalTeaserEvPercent}
      ) THEN RAISE(ABORT, 'A teaser opposing a preferred team must clear the exceptional EV threshold') END;

      SELECT CASE WHEN NEW.play_type IN ('single', 'parlay', 'teaser') AND (
        json_extract(NEW.forecast_json, '$.authoritativeProbabilityInterval') IS NULL
        OR COALESCE(json_extract(NEW.forecast_json, '$.suggestedUnits'), 0) < ${structuralConfig.sizing.minimumUnits}
      ) THEN RAISE(ABORT, 'The contract must clear the uncertainty and ${structuralConfig.sizing.minimumUnits}u Kelly inclusion gates') END;

      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM json_each(NEW.contract_json) AS contract_leg
        WHERE json_extract(contract_leg.value, '$.market') = 'prop'
          AND NOT EXISTS (
            SELECT 1 FROM json_each(json_extract(NEW.forecast_json, '$.legs')) AS forecast_leg
            WHERE json_extract(forecast_leg.value, '$.sourceQuoteId') = json_extract(contract_leg.value, '$.sourceQuoteId')
              AND json_extract(forecast_leg.value, '$.market') = 'prop'
              AND json_extract(forecast_leg.value, '$.betProbability') IS NOT NULL
              AND json_extract(forecast_leg.value, '$.uncertaintyInterval') IS NOT NULL
              AND json_extract(forecast_leg.value, '$.expectedValue') >= ${structuralConfig.props.minimumExpectedValue}
          )
      ) THEN RAISE(ABORT, 'Player props must retain current evidence-qualified positive EV') END;
    END`;
}

export function executionStateGuardTriggerSql(): string {
  return `CREATE TRIGGER IF NOT EXISTS approval_execution_state_guard_v1
    BEFORE UPDATE OF status, execution_status, cash_placement_confirmed ON plays
    BEGIN
      SELECT CASE WHEN OLD.execution_status <> NEW.execution_status
      THEN RAISE(ABORT, 'Execution status is immutable; create a new jointly approved revision') END;

      SELECT CASE WHEN OLD.cash_placement_confirmed = 1 AND NEW.cash_placement_confirmed <> 1
      THEN RAISE(ABORT, 'Cash placement confirmation is immutable') END;

      SELECT CASE WHEN OLD.cash_placement_confirmed = 0 AND NEW.cash_placement_confirmed = 1 AND (
        NEW.execution_status <> 'executed'
        OR NEW.analyst_a_approved <> 1
        OR NEW.analyst_b_approved <> 1
        OR NEW.status <> 'placed'
        OR NEW.result <> 'pending'
      ) THEN RAISE(ABORT, 'Cash placement requires both approvals on a pending executed contract') END;

      SELECT CASE WHEN NEW.status = 'placed' AND (
        NEW.execution_status <> 'executed'
        OR NEW.cash_placement_confirmed <> 1
        OR NEW.analyst_a_approved <> 1
        OR NEW.analyst_b_approved <> 1
        OR NEW.result <> 'pending'
      ) THEN RAISE(ABORT, 'Placed status requires a jointly approved pending cash contract') END;
    END`;
}
