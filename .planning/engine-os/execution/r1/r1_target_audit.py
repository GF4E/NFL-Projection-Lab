#!/usr/bin/env python3
"""Freeze and verify the R1 target-reconciliation sample without model imports.

This script intentionally does not reconstruct a target or expose a frozen model
label. It uses the retained comparison cache only to select preregistered strata.
Official NFL gamebooks remain the sole truth source and require independent human
double entry before comparison labels may be revealed.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import gzip
import hashlib
import html
import json
import re
import subprocess
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable


PREREG_SHA256 = "21142d8a45a2e7e9421d5b20b4ecbd2e803657cda7e9bcf832db9fb2fd447866"
SEED = "engine-os-r1.2026-08-25.sample.v1"
MULTI_OFFENSE_GAMES = (
    "2015_01_IND_BUF",
    "2016_15_CLE_BUF",
    "2018_01_TEN_MIA",
    "2018_09_CHI_BUF",
    "2019_02_TB_CAR",
    "2023_12_PIT_CIN",
)
PILOT_EXCLUSIONS = {"2010_01_MIN_NO", "2024_01_BAL_KC"}
EDGE_SELECTORS = (
    "kickoff_touchback",
    "punt",
    "first_qualifying_play_field_goal_attempt",
    "blocked_field_goal_attempt",
    "offensive_turnover",
    "defensive_touchdown",
    "special_teams_return_touchdown",
    "safety",
    "onside_kick",
    "kneel_only_terminal_series",
    "penalty_or_no_play_record",
    "qualifying_live_aborted_snap",
    "half_ending_series",
    "regulation_ending_series",
)

REVIEW_COLUMNS = (
    "game_id",
    "season",
    "week",
    "gameday",
    "away_team",
    "home_team",
    "sampling_stratum",
    "edge_selector",
    "official_gamecenter_discovery_url",
    "official_gamebook_url",
    "official_gamebook_sha256",
    "official_gamebook_page_references",
    "final_home_score",
    "final_away_score",
    "regulation_home_series",
    "regulation_away_series",
    "overtime_occurred",
    "overtime_home_series",
    "overtime_away_series",
    "edge_event_reference",
    "edge_creates_series",
    "edge_offense",
    "notes_limited_to_source_ambiguity",
)

TEAM_SLUG = {
    "ARI": "cardinals", "ATL": "falcons", "BAL": "ravens", "BUF": "bills",
    "CAR": "panthers", "CHI": "bears", "CIN": "bengals", "CLE": "browns",
    "DAL": "cowboys", "DEN": "broncos", "DET": "lions", "GB": "packers",
    "HOU": "texans", "IND": "colts", "JAX": "jaguars", "KC": "chiefs",
    "LA": "rams", "LAR": "rams", "STL": "rams", "LAC": "chargers",
    "SD": "chargers", "LV": "raiders", "OAK": "raiders", "MIA": "dolphins",
    "MIN": "vikings", "NE": "patriots", "NO": "saints", "NYG": "giants",
    "NYJ": "jets", "PHI": "eagles", "PIT": "steelers", "SEA": "seahawks",
    "SF": "49ers", "TB": "buccaneers", "TEN": "titans",
}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def rank_key(stratum: str, game_id: str) -> str:
    return sha256_bytes(f"{SEED}\0{stratum}\0{game_id}".encode("utf-8"))


def as_int(value: str | None, default: int = 0) -> int:
    if value is None or value.strip() == "":
        return default
    try:
        return int(float(value))
    except ValueError:
        return default


def is_one(value: str | None) -> bool:
    return as_int(value) == 1


def is_qualifying(row: dict[str, str]) -> bool:
    quarter = as_int(row.get("qtr"), default=99)
    if quarter < 1 or quarter > 4 or not row.get("posteam"):
        return False
    if any(is_one(row.get(field)) for field in (
        "pass_attempt", "rush_attempt", "qb_kneel", "qb_spike",
        "punt_attempt", "field_goal_attempt",
    )):
        return True
    return (
        is_one(row.get("aborted_play"))
        and row.get("play_type", "").lower() != "no_play"
        and not any(is_one(row.get(field)) for field in (
            "kickoff_attempt", "extra_point_attempt", "two_point_attempt",
        ))
    )


def washington_slug(season: int) -> str:
    if season <= 2019:
        return "redskins"
    if season <= 2021:
        return "washington-football-team"
    return "commanders"


def team_slug(team: str, season: int) -> str:
    if team == "WAS":
        return washington_slug(season)
    if team not in TEAM_SLUG:
        raise RuntimeError(f"No NFL game-center slug for team {team!r}")
    return TEAM_SLUG[team]


def load_source_index(root: Path) -> tuple[dict[str, Any], str]:
    path = root / ".model-lab-cache/module-one/source-index.json"
    raw = path.read_bytes()
    return json.loads(raw), sha256_bytes(raw)


def verify_sources(root: Path, index: dict[str, Any]) -> None:
    objects = root / ".model-lab-cache/module-one/objects"
    required = ["schedules", *(f"pbp_{season}" for season in range(2010, 2026))]
    for source_id in required:
        record = index["sources"].get(source_id)
        if not record:
            raise RuntimeError(f"Missing frozen source index entry: {source_id}")
        path = objects / record["object"]
        if not path.is_file():
            raise RuntimeError(f"Missing frozen source object: {path}")
        observed = sha256_file(path)
        if observed != record["sha256"]:
            raise RuntimeError(f"Frozen source hash mismatch for {source_id}: {observed}")


def load_schedule(root: Path, index: dict[str, Any]) -> dict[str, dict[str, str]]:
    path = root / ".model-lab-cache/module-one/objects" / index["sources"]["schedules"]["object"]
    games: dict[str, dict[str, str]] = {}
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            season = as_int(row.get("season"), default=-1)
            if (
                2010 <= season <= 2025
                and row.get("game_type") == "REG"
                and row.get("home_score", "") != ""
                and row.get("away_score", "") != ""
            ):
                games[row["game_id"]] = row
    if len(games) != 4_175:
        raise RuntimeError(f"Frozen universe changed: expected 4,175 games, found {len(games)}")
    return games


def event_reference(row: dict[str, str]) -> dict[str, Any]:
    return {
        "playId": as_int(row.get("play_id"), default=-1),
        "quarter": as_int(row.get("qtr"), default=-1),
        "gameSecondsRemaining": as_int(row.get("game_seconds_remaining"), default=-1),
        "fixedDrive": row.get("fixed_drive") or None,
        "candidateOffense": row.get("posteam") or None,
    }


def collect_edge_candidates(
    root: Path,
    index: dict[str, Any],
    schedule: dict[str, dict[str, str]],
) -> tuple[dict[str, dict[str, dict[str, Any]]], dict[str, int]]:
    candidates: dict[str, dict[str, dict[str, Any]]] = {selector: {} for selector in EDGE_SELECTORS}
    series_events: dict[tuple[str, str, str], list[dict[str, str]]] = defaultdict(list)
    final_q2: dict[str, dict[str, str]] = {}
    final_q4: dict[str, dict[str, str]] = {}

    def add(selector: str, row: dict[str, str]) -> None:
        game_id = row.get("game_id", "")
        if game_id not in schedule:
            return
        existing = candidates[selector].get(game_id)
        reference = event_reference(row)
        if existing is None or reference["playId"] < existing["playId"]:
            candidates[selector][game_id] = reference

    objects = root / ".model-lab-cache/module-one/objects"
    for season in range(2010, 2026):
        record = index["sources"][f"pbp_{season}"]
        path = objects / record["object"]
        opener = gzip.open if path.suffix == ".gz" else open
        with opener(path, "rt", newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                game_id = row.get("game_id", "")
                if game_id not in schedule:
                    continue

                if is_one(row.get("kickoff_attempt")) and is_one(row.get("touchback")):
                    add("kickoff_touchback", row)
                if is_one(row.get("punt_attempt")):
                    add("punt", row)
                if is_one(row.get("field_goal_attempt")) and (
                    row.get("field_goal_result", "").lower() == "blocked"
                    or "blocked" in row.get("desc", "").lower()
                ):
                    add("blocked_field_goal_attempt", row)
                if is_one(row.get("interception")) or is_one(row.get("fumble_lost")):
                    add("offensive_turnover", row)

                td_team = row.get("td_team", "")
                offense = row.get("posteam", "")
                if (
                    is_one(row.get("touchdown"))
                    and not is_one(row.get("special_teams_play"))
                    and td_team and offense and td_team != offense
                ):
                    add("defensive_touchdown", row)
                if is_one(row.get("return_touchdown")) and is_one(row.get("special_teams_play")):
                    add("special_teams_return_touchdown", row)
                if is_one(row.get("safety")):
                    add("safety", row)
                if re.search(r"\bonside\b", row.get("desc", ""), flags=re.IGNORECASE):
                    add("onside_kick", row)
                if row.get("play_type", "").lower() == "no_play" or (
                    is_one(row.get("penalty")) and not is_qualifying(row)
                ):
                    add("penalty_or_no_play_record", row)
                if (
                    is_one(row.get("aborted_play"))
                    and row.get("play_type", "").lower() != "no_play"
                    and is_qualifying(row)
                ):
                    add("qualifying_live_aborted_snap", row)

                if is_qualifying(row):
                    key = (game_id, row.get("fixed_drive", ""), row.get("posteam", ""))
                    series_events[key].append(row)
                    qtr = as_int(row.get("qtr"), default=-1)
                    play_id = as_int(row.get("play_id"), default=-1)
                    if qtr == 2 and (
                        game_id not in final_q2
                        or play_id > as_int(final_q2[game_id].get("play_id"), default=-1)
                    ):
                        final_q2[game_id] = row
                    if qtr == 4 and (
                        game_id not in final_q4
                        or play_id > as_int(final_q4[game_id].get("play_id"), default=-1)
                    ):
                        final_q4[game_id] = row

    for events in series_events.values():
        ordered = sorted(events, key=lambda row: as_int(row.get("play_id"), default=-1))
        first = ordered[0]
        if is_one(first.get("field_goal_attempt")):
            add("first_qualifying_play_field_goal_attempt", first)
        if all(is_one(row.get("qb_kneel")) for row in ordered):
            last = ordered[-1]
            game_id = last["game_id"]
            if as_int(last.get("qtr"), default=-1) == 4 and final_q4.get(game_id) is last:
                add("kneel_only_terminal_series", last)

    for row in final_q2.values():
        add("half_ending_series", row)
    for row in final_q4.values():
        add("regulation_ending_series", row)

    counts = {selector: len(game_rows) for selector, game_rows in candidates.items()}
    empty = [selector for selector, count in counts.items() if count == 0]
    if empty:
        raise RuntimeError(f"No candidates for preregistered edge selectors: {empty}")
    return candidates, counts


def choose_ranked(
    game_ids: Iterable[str],
    stratum: str,
    count: int,
    selected: set[str],
) -> list[str]:
    eligible = [game_id for game_id in game_ids if game_id not in selected and game_id not in PILOT_EXCLUSIONS]
    ranked = sorted(eligible, key=lambda game_id: rank_key(stratum, game_id))
    if len(ranked) < count:
        raise RuntimeError(f"Stratum {stratum} needs {count} games but has {len(ranked)} eligible")
    chosen = ranked[:count]
    selected.update(chosen)
    return chosen


def gamecenter_url(row: dict[str, str]) -> str:
    season = as_int(row["season"])
    away = team_slug(row["away_team"], season)
    home = team_slug(row["home_team"], season)
    return f"https://www.nfl.com/games/{away}-at-{home}-{season}-reg-{as_int(row['week'])}"


def generate(root: Path) -> None:
    prereg = root / ".planning/engine-os/execution/r1/preregistration.v1.json"
    if sha256_file(prereg) != PREREG_SHA256:
        raise RuntimeError("R1 preregistration hash changed; sampling is forbidden")

    source_index, source_index_hash = load_source_index(root)
    verify_sources(root, source_index)
    schedule = load_schedule(root, source_index)
    edge_candidates, edge_candidate_counts = collect_edge_candidates(root, source_index, schedule)

    selected: set[str] = set()
    records: dict[str, dict[str, Any]] = {}

    def record(game_id: str, stratum: str, edge: str | None = None, ref: dict[str, Any] | None = None) -> None:
        row = schedule[game_id]
        records[game_id] = {
            "gameId": game_id,
            "season": as_int(row["season"]),
            "week": as_int(row["week"]),
            "gameday": row["gameday"],
            "awayTeam": row["away_team"],
            "homeTeam": row["home_team"],
            "samplingStratum": stratum,
            "edgeSelector": edge,
            "comparisonEventReference": ref,
            "officialGamecenterDiscoveryUrl": gamecenter_url(row),
            "officialGamebookUrl": None,
            "officialGamebookSha256": None,
            "reviewStatus": "not_started",
        }

    for game_id in MULTI_OFFENSE_GAMES:
        if game_id not in schedule:
            raise RuntimeError(f"Mandatory multi-offense game missing from frozen schedule: {game_id}")
        selected.add(game_id)
        record(game_id, "fixed_multi_offense_envelope_census", "multi_offense_fixed_drive", None)

    era_ranges = ((2010, 2013), (2014, 2017), (2018, 2021), (2022, 2025))
    for start, end in era_ranges:
        stratum = f"overtime_{start}_{end}"
        pool = [
            game_id for game_id, row in schedule.items()
            if start <= as_int(row["season"]) <= end and is_one(row.get("overtime"))
        ]
        for game_id in choose_ranked(pool, stratum, 3, selected):
            record(game_id, stratum)

    for selector in EDGE_SELECTORS:
        stratum = f"edge_{selector}"
        chosen = choose_ranked(edge_candidates[selector], stratum, 1, selected)[0]
        record(chosen, stratum, selector, edge_candidates[selector][chosen])

    for season in range(2010, 2026):
        for period, predicate in (
            ("early", lambda week: 1 <= week <= 9),
            ("late", lambda week: week >= 10),
        ):
            stratum = f"general_{season}_{period}"
            pool = [
                game_id for game_id, row in schedule.items()
                if as_int(row["season"]) == season and predicate(as_int(row["week"]))
            ]
            chosen = choose_ranked(pool, stratum, 1, selected)[0]
            record(chosen, stratum)

    if len(records) != 64 or len(selected) != 64:
        raise RuntimeError(f"Frozen sample must contain 64 unique games, got {len(records)}")

    ordered = sorted(records.values(), key=lambda item: (item["season"], item["week"], item["gameId"]))
    manifest = {
        "schemaVersion": "engine-os-r1-sample-v1",
        "protocolId": "engine-os-r1-target-reconciliation.2026-08-25.1",
        "preregistrationSha256": PREREG_SHA256,
        "sourceIndexSha256": source_index_hash,
        "rankingSeed": SEED,
        "universeGameCount": len(schedule),
        "sampleGameCount": len(ordered),
        "pilotExclusions": sorted(PILOT_EXCLUSIONS),
        "edgeCandidateCounts": edge_candidate_counts,
        "sample": ordered,
        "truthStatus": "not_reviewed",
        "comparisonLabelsStatus": "sealed_not_exported",
    }

    output = root / "artifacts/engine-os/r1"
    output.mkdir(parents=True, exist_ok=True)
    manifest_path = output / "sample-manifest.json"
    manifest_path.write_bytes(canonical_json(manifest) + b"\n")

    for reviewer in ("a", "b"):
        path = output / f"reviewer-{reviewer}-entry.csv"
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=REVIEW_COLUMNS)
            writer.writeheader()
            for item in ordered:
                writer.writerow({
                    "game_id": item["gameId"],
                    "season": item["season"],
                    "week": item["week"],
                    "gameday": item["gameday"],
                    "away_team": item["awayTeam"],
                    "home_team": item["homeTeam"],
                    "sampling_stratum": item["samplingStratum"],
                    "edge_selector": item["edgeSelector"] or "NOT_ASSIGNED",
                    "official_gamecenter_discovery_url": item["officialGamecenterDiscoveryUrl"],
                })

    source_capture_columns = (
        "game_id", "official_gamecenter_discovery_url", "official_gamebook_url",
        "official_gamebook_sha256", "byte_count", "retrieved_at_utc", "cache_object",
        "retrieval_status",
    )
    with (output / "official-source-capture.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=source_capture_columns)
        writer.writeheader()
        for item in ordered:
            writer.writerow({
                "game_id": item["gameId"],
                "official_gamecenter_discovery_url": item["officialGamecenterDiscoveryUrl"],
                "retrieval_status": "not_started",
            })

    adjudication_columns = (
        "discrepancy_id", "game_id", "field", "reviewer_value_1", "reviewer_value_2",
        "adjudicated_truth", "gamebook_sha256", "page_play_support", "taxonomy",
        "adjudicator_attestation_hash", "resolved_at_utc",
    )
    with (output / "adjudication.csv").open("w", newline="", encoding="utf-8") as handle:
        csv.DictWriter(handle, fieldnames=adjudication_columns).writeheader()

    status = {
        "schemaVersion": "engine-os-r1-status-v1",
        "terminalStatus": "protocol_invalid",
        "gate": "reviewer_independence_blocked",
        "reason": "No evidence binds three distinct natural persons to Reviewer A, Reviewer B, and Adjudicator roles. No official truth or target agreement has been fabricated.",
        "preregistrationSha256": PREREG_SHA256,
        "sampleManifestSha256": sha256_file(manifest_path),
        "sampleGameCount": 64,
        "reviewerEntriesCompleted": 0,
        "officialGamebooksCaptured": 0,
        "comparisonLabelsRevealed": False,
        "r2Authorized": False,
        "unblockRequirements": [
            "Freeze three distinct natural-person role-attestation hashes",
            "Capture and hash all 64 official NFL gamebooks",
            "Complete and hash both blinded entry sheets independently",
            "Complete any third-person adjudications",
            "Only then reveal frozen comparison labels and compute the preregistered gates"
        ],
    }
    status_path = output / "status.json"
    status_path.write_bytes(canonical_json(status) + b"\n")

    result_path = output / "RESULT.md"
    result_path.write_text(
        "# Engine OS R1 — Independent target reconciliation\n\n"
        "## Terminal result\n\n"
        "**`protocol_invalid` — `reviewer_independence_blocked`**\n\n"
        "R1 has not established target agreement and therefore does not authorize R2. "
        "The preregistration was frozen before any selected official gamebook was reviewed, "
        "the 64-game sample was generated deterministically, and blank blinded entry sheets "
        "were produced. No evidence currently binds three distinct natural persons to "
        "Reviewer A, Reviewer B, and Adjudicator. Repeated or automated entry by one agent "
        "would not satisfy the frozen independence gate, so no review outcome was fabricated.\n\n"
        "## Frozen evidence\n\n"
        f"- Preregistration SHA-256: `{PREREG_SHA256}`\n"
        f"- Sample-manifest SHA-256: `{sha256_file(manifest_path)}`\n"
        f"- Frozen comparison source-index SHA-256: `{source_index_hash}`\n"
        "- Universe: 4,175 completed regular-season games, 2010-2025\n"
        "- Sample: 64 unique games — 6 fixed multi-offense census, 12 era-stratified "
        "overtime, 14 ontology edge instances, and 32 season/early-late probability selections\n"
        "- All 17 frozen schedule/play-by-play objects used to select the sample verified by SHA-256.\n"
        "- Frozen comparison labels remain sealed and were not exported into either review sheet.\n\n"
        "## Missing acceptance evidence\n\n"
        "No official NFL gamebook set has been captured and hashed, neither independent entry "
        "sheet has been completed, no third-person adjudication has occurred, and no agreement "
        "metric has been computed. The empty sheets and discrepancy ledger are templates, not "
        "review evidence.\n\n"
        "## Exact next decision\n\n"
        "Do not run Module 2B. First bind three distinct natural persons to the frozen roles. "
        "The source stage must retain all 64 exact official NFL gamebook PDFs; this run has "
        "already captured and hashed them. Then complete and hash "
        "both blinded entries, adjudicate disagreements without viewing nflverse/model labels, "
        "then reveal the comparison labels and run the frozen 100%-agreement/severe-error gates. "
        "Only a terminal `pass` may unblock R2; otherwise a new target decision is required.\n",
        encoding="utf-8",
    )

    artifact_files = (
        manifest_path,
        output / "reviewer-a-entry.csv",
        output / "reviewer-b-entry.csv",
        output / "official-source-capture.csv",
        output / "adjudication.csv",
        status_path,
        result_path,
    )
    hashes = {
        "schemaVersion": "engine-os-r1-artifact-hashes-v1",
        "artifacts": {
            str(path.relative_to(root)): {
                "sha256": sha256_file(path),
                "byteCount": path.stat().st_size,
            }
            for path in artifact_files
        },
    }
    (output / "artifact-hashes.json").write_bytes(canonical_json(hashes) + b"\n")


def curl_bytes(url: str) -> bytes:
    completed = subprocess.run(
        [
            "curl", "--location", "--fail", "--silent", "--show-error",
            "--retry", "3", "--connect-timeout", "15", "--max-time", "90",
            "--user-agent", "Mozilla/5.0 Engine-OS-R1-Source-Capture/1.0", url,
        ],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return completed.stdout


def rebuild_artifact_hashes(root: Path) -> None:
    output = root / "artifacts/engine-os/r1"
    artifact_files = (
        output / "sample-manifest.json",
        output / "reviewer-a-entry.csv",
        output / "reviewer-b-entry.csv",
        output / "official-source-capture.csv",
        output / "adjudication.csv",
        output / "status.json",
        output / "RESULT.md",
    )
    hashes = {
        "schemaVersion": "engine-os-r1-artifact-hashes-v1",
        "artifacts": {
            str(path.relative_to(root)): {
                "sha256": sha256_file(path),
                "byteCount": path.stat().st_size,
            }
            for path in artifact_files
        },
    }
    (output / "artifact-hashes.json").write_bytes(canonical_json(hashes) + b"\n")


def capture_official_gamebooks(root: Path) -> None:
    output = root / "artifacts/engine-os/r1"
    manifest = json.loads((output / "sample-manifest.json").read_text(encoding="utf-8"))
    if manifest["preregistrationSha256"] != PREREG_SHA256 or len(manifest["sample"]) != 64:
        raise RuntimeError("Refusing source capture for an unbound sample")

    cache = root / ".model-lab-cache/engine-os-r1/official-gamebooks"
    cache.mkdir(parents=True, exist_ok=True)
    captured: list[dict[str, Any]] = []
    section_pattern = re.compile(
        r'<section[^>]+data-testid="GameBook[^\"]*".*?<a[^>]+href="([^\"]+\.pdf)"',
        flags=re.IGNORECASE | re.DOTALL,
    )

    for item in manifest["sample"]:
        discovery_url = item["officialGamecenterDiscoveryUrl"]
        page = curl_bytes(discovery_url).decode("utf-8", errors="replace")
        match = section_pattern.search(page)
        if not match:
            raise RuntimeError(f"Official NFL gamebook link not found: {item['gameId']} {discovery_url}")
        gamebook_url = html.unescape(match.group(1))
        if not gamebook_url.startswith("https://static.www.nfl.com/"):
            raise RuntimeError(f"Non-official gamebook origin for {item['gameId']}: {gamebook_url}")
        pdf = curl_bytes(gamebook_url)
        if not pdf.startswith(b"%PDF-"):
            raise RuntimeError(f"Official gamebook response is not a PDF: {item['gameId']}")
        digest = sha256_bytes(pdf)
        object_path = cache / f"{digest}.pdf"
        if object_path.exists():
            if sha256_file(object_path) != digest:
                raise RuntimeError(f"Corrupt cached official gamebook object: {object_path}")
        else:
            object_path.write_bytes(pdf)
        captured.append({
            "game_id": item["gameId"],
            "official_gamecenter_discovery_url": discovery_url,
            "official_gamebook_url": gamebook_url,
            "official_gamebook_sha256": digest,
            "byte_count": len(pdf),
            "retrieved_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
            "cache_object": str(object_path.relative_to(root)),
            "retrieval_status": "captured",
        })

    if len(captured) != 64 or len({row["game_id"] for row in captured}) != 64:
        raise RuntimeError("Official source capture did not preserve 64 unique game assignments")

    capture_path = output / "official-source-capture.csv"
    with capture_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=tuple(captured[0]))
        writer.writeheader()
        writer.writerows(captured)

    status_path = output / "status.json"
    status = json.loads(status_path.read_text(encoding="utf-8"))
    status["officialGamebooksCaptured"] = 64
    status["officialSourceCaptureSha256"] = sha256_file(capture_path)
    status["reason"] = (
        "All 64 official NFL gamebook PDFs were captured and hashed, but no evidence binds "
        "three distinct natural persons to Reviewer A, Reviewer B, and Adjudicator roles. "
        "No official truth entry or target agreement has been fabricated."
    )
    status_path.write_bytes(canonical_json(status) + b"\n")

    result_path = output / "RESULT.md"
    result = result_path.read_text(encoding="utf-8")
    result = result.replace(
        "No official NFL gamebook set has been captured and hashed, neither independent entry ",
        "All 64 official NFL gamebook PDFs were captured from static.www.nfl.com and verified "
        "by content hash. Neither independent entry ",
    )
    result = result.replace(
        "- Frozen comparison labels remain sealed and were not exported into either review sheet.\n",
        "- Frozen comparison labels remain sealed and were not exported into either review sheet.\n"
        f"- Official source-capture SHA-256: `{sha256_file(capture_path)}`\n",
    )
    result_path.write_text(result, encoding="utf-8")
    rebuild_artifact_hashes(root)


def verify(root: Path) -> None:
    prereg = root / ".planning/engine-os/execution/r1/preregistration.v1.json"
    if sha256_file(prereg) != PREREG_SHA256:
        raise RuntimeError("Preregistration hash mismatch")
    hash_line = (prereg.parent / "PREREGISTRATION.sha256").read_text(encoding="utf-8").strip()
    if hash_line != f"{PREREG_SHA256}  preregistration.v1.json":
        raise RuntimeError("Preregistration hash record mismatch")

    output = root / "artifacts/engine-os/r1"
    hashes = json.loads((output / "artifact-hashes.json").read_text(encoding="utf-8"))
    for relative, expected in hashes["artifacts"].items():
        path = root / relative
        if sha256_file(path) != expected["sha256"] or path.stat().st_size != expected["byteCount"]:
            raise RuntimeError(f"Artifact verification failed: {relative}")

    manifest = json.loads((output / "sample-manifest.json").read_text(encoding="utf-8"))
    if manifest["preregistrationSha256"] != PREREG_SHA256:
        raise RuntimeError("Sample does not bind preregistration")
    game_ids = [item["gameId"] for item in manifest["sample"]]
    if len(game_ids) != 64 or len(set(game_ids)) != 64:
        raise RuntimeError("Sample is not 64 unique games")
    if PILOT_EXCLUSIONS.intersection(game_ids):
        raise RuntimeError("Pilot-excluded game entered sample")
    if not set(MULTI_OFFENSE_GAMES).issubset(game_ids):
        raise RuntimeError("Multi-offense census is incomplete")

    for reviewer in ("a", "b"):
        path = output / f"reviewer-{reviewer}-entry.csv"
        with path.open(newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        if len(rows) != 64:
            raise RuntimeError(f"Reviewer {reviewer.upper()} sheet has {len(rows)} rows")
        protected = (
            "official_gamebook_url", "official_gamebook_sha256", "final_home_score",
            "final_away_score", "regulation_home_series", "regulation_away_series",
            "overtime_occurred", "overtime_home_series", "overtime_away_series",
            "edge_event_reference", "edge_creates_series", "edge_offense",
        )
        if any(row[field] != "" for row in rows for field in protected):
            raise RuntimeError(f"Reviewer {reviewer.upper()} sheet is not blank/blinded")

    status = json.loads((output / "status.json").read_text(encoding="utf-8"))
    if status["terminalStatus"] != "protocol_invalid" or status["r2Authorized"] is not False:
        raise RuntimeError("Blocked terminal status does not stop R2")
    capture_path = output / "official-source-capture.csv"
    with capture_path.open(newline="", encoding="utf-8") as handle:
        capture_rows = list(csv.DictReader(handle))
    captured_rows = [row for row in capture_rows if row["retrieval_status"] == "captured"]
    if captured_rows:
        if len(captured_rows) != 64 or status["officialGamebooksCaptured"] != 64:
            raise RuntimeError("Official source capture is partial")
        for row in captured_rows:
            if not row["official_gamebook_url"].startswith("https://static.www.nfl.com/"):
                raise RuntimeError(f"Non-official truth source: {row['game_id']}")
            object_path = root / row["cache_object"]
            if not object_path.is_file() or sha256_file(object_path) != row["official_gamebook_sha256"]:
                raise RuntimeError(f"Official gamebook object failed verification: {row['game_id']}")
    print(json.dumps({
        "status": "verified",
        "preregistrationSha256": PREREG_SHA256,
        "sampleGameCount": 64,
        "terminalStatus": status["terminalStatus"],
        "gate": status["gate"],
        "r2Authorized": status["r2Authorized"],
    }, sort_keys=True))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("generate", "capture", "verify"))
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[4])
    args = parser.parse_args()
    root = args.root.resolve()
    if args.command == "generate":
        generate(root)
    elif args.command == "capture":
        capture_official_gamebooks(root)
    else:
        verify(root)


if __name__ == "__main__":
    main()
