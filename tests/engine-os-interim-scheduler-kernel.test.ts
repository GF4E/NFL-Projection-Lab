import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { requiredForecastOriginsForSchedule, type RequiredForecastHorizonId } from "@/domain/engine-os";
import { sha256Hex, stableHash } from "@/domain/hash";
import {
  classifyCurrentOriginHead,
  decideLeaseClaim,
  evaluatePublicationTiming,
  interimSchedulerContractHash,
  interimSchedulerCutoverContract,
  interimSchedulerCutoverContractHash,
  interimSchedulerHorizonIds,
  interimSchedulerJobKey,
  interimSchedulerTickKey,
  leaseExpiryForClaim,
  mayPublishTerminalRecord,
  mayRenewLease,
  originPersistenceDeadline,
  schedulerAttemptTokenHash,
  validateInterimSchedulerContract,
  type CurrentOriginHead,
  type LeaseState,
  type PublicationTimes
} from "@/server/engine-os/interim-scheduler-kernel";

const HORIZON_DELAYS: Record<RequiredForecastHorizonId, number> = {
  weekly_tuesday_0730: 600,
  kickoff_minus_120: 600,
  kickoff_minus_90: 600,
  kickoff_minus_60: 600,
  kickoff_minus_15: 300
};

function origin(overrides: Partial<CurrentOriginHead> = {}): CurrentOriginHead {
  return {
    originVersionId: "origin-version-1",
    logicalOriginId: "logical-origin-1",
    gameId: "2026_01_NE_SEA",
    horizonId: "kickoff_minus_60",
    scheduledForUtc: "2026-09-13T19:05:00.000Z",
    kickoffUtc: "2026-09-13T20:05:00.000Z",
    eligible: true,
    eligibilityReason: "eligible",
    activationBoundary: "os15a-qualification",
    isCurrentHead: true,
    terminalRecordExists: false,
    ...overrides
  };
}

function lease(overrides: Partial<LeaseState> = {}): LeaseState {
  return {
    state: "running",
    fence: 4,
    attemptTokenHash: "a".repeat(64),
    leaseExpiresAt: "2026-09-13T19:06:30.000Z",
    ...overrides
  };
}

function times(overrides: Partial<PublicationTimes> = {}): PublicationTimes {
  return {
    scheduledTriggerAt: "2026-09-13T19:05:00.000Z",
    invokedAt: "2026-09-13T19:05:02.000Z",
    evidenceAt: "2026-09-13T19:05:01.000Z",
    generatedAt: "2026-09-13T19:05:03.000Z",
    persistedAt: "2026-09-13T19:05:04.000Z",
    persistenceDeadlineAt: "2026-09-13T19:15:00.000Z",
    kickoffAt: "2026-09-13T20:05:00.000Z",
    ...overrides
  };
}

describe("OS-15A frozen interim scheduler kernel", () => {
  it("binds the qualification-only contract to OS-00B, lifecycle, OS-02A, and exactly five horizons", () => {
    expect(validateInterimSchedulerContract()).toEqual({
      errors: [],
      contractHash: interimSchedulerContractHash
    });
    expect(interimSchedulerHorizonIds).toEqual([
      "weekly_tuesday_0730",
      "kickoff_minus_120",
      "kickoff_minus_90",
      "kickoff_minus_60",
      "kickoff_minus_15"
    ]);
  });

  it("binds the frozen cutover contract and v4 amendment manifest to exact bytes and canonical content", () => {
    const manifest = JSON.parse(readFileSync(resolve(
      process.cwd(), "config/engine-os-contract-manifest.v5.json"
    ), "utf8")) as {
      version: string;
      artifacts: Array<{
        task: string;
        path: string;
        contractVersion: string;
        byteSha256: string;
        canonicalContentSha256: string;
      }>;
    };
    expect(manifest.version).toBe("engine-os-contract-manifest.2026.5");
    expect(manifest.artifacts.map((artifact) => artifact.task)).toEqual([
      "OS-00B", "R0", "R18A", "OS-15A", "OS-15A-CUTOVER"
    ]);
    for (const artifact of manifest.artifacts) {
      const bytes = readFileSync(resolve(process.cwd(), artifact.path), "utf8");
      const parsed = JSON.parse(bytes) as unknown;
      expect(sha256Hex(bytes)).toBe(artifact.byteSha256);
      expect(stableHash(parsed)).toBe(artifact.canonicalContentSha256);
    }
    expect(interimSchedulerCutoverContract.version)
      .toBe("interim-scheduler-cutover.2026.4");
    expect(interimSchedulerCutoverContractHash)
      .toBe(manifest.artifacts.find((artifact) => artifact.task === "OS-15A-CUTOVER")!
        .canonicalContentSha256);
    expect(interimSchedulerCutoverContract.recordBoundary).toMatchObject({
      terminalRowsImportedUnchanged: true,
      terminalRowsReplayed: false,
      terminalRowsReopened: false,
      onlyFuturePendingCurrentHeadsTransfer: true,
      elapsedOrMissedOriginsReplayed: false,
      elapsedOrMissedOriginsProspective: false,
      activationBoundaryMustRemainIdentical: true
    });
    expect(interimSchedulerCutoverContract.leaseBoundary).toEqual({
      nonexpiredLeaseBehavior: "block_cutover",
      expiredLeaseBehavior: "target_may_reclaim_with_strictly_greater_fence",
      priorAttemptPublicationAfterCutoverAllowed: false
    });
    expect(interimSchedulerCutoverContract.activationBoundary).toEqual({
      qualificationCreatesProductionActivation: false,
      captureMustRemainDisabledUntilSeparateApproval: true,
      twoPublishingSchedulersAllowed: false,
      watchdogCursorMustExistBeforeEnable: true,
      watchdogCursorSource: "engine_activations.activated_at",
      watchdogCursorIdentityFields: [
        "operating_contract_hash",
        "research_contract_hash",
        "lifecycle_hash"
      ],
      firstRecoverableDispatcherSlot: "strictly_after_activated_at",
      missingCursorBehavior: "block_enable"
    });
  });

  it.each(interimSchedulerHorizonIds)(
    "uses the frozen horizon cap and pre-kickoff cap for %s",
    (horizonId) => {
      const scheduled = "2026-09-13T18:00:00.000Z";
      const kickoff = "2026-09-13T20:05:00.000Z";
      expect(originPersistenceDeadline({
        horizonId,
        scheduledTriggerAt: scheduled,
        kickoffAt: kickoff
      })).toBe(new Date(Date.parse(scheduled) + HORIZON_DELAYS[horizonId] * 1_000).toISOString());
      expect(originPersistenceDeadline({
        horizonId,
        scheduledTriggerAt: "2026-09-13T20:04:58.000Z",
        kickoffAt: kickoff
      })).toBe("2026-09-13T20:04:59.000Z");
    }
  );

  it("uses immutable UTC instants for DST-correct Tuesday tick identities", () => {
    const beforeFallBack = requiredForecastOriginsForSchedule({
      gameId: "week-eight",
      week: 8,
      kickoffUtc: "2026-11-01T21:25:00.000Z",
      observedAt: "2026-08-25T00:00:00.000Z",
      activatedAt: "2026-08-25T00:00:00.000Z"
    }).find((candidate) => candidate.horizonId === "weekly_tuesday_0730")!;
    const afterFallBack = requiredForecastOriginsForSchedule({
      gameId: "week-nine",
      week: 9,
      kickoffUtc: "2026-11-08T21:25:00.000Z",
      observedAt: "2026-08-25T00:00:00.000Z",
      activatedAt: "2026-08-25T00:00:00.000Z"
    }).find((candidate) => candidate.horizonId === "weekly_tuesday_0730")!;

    expect(beforeFallBack.scheduledForLocal).toBe("2026-10-27T07:30:00[America/Los_Angeles]");
    expect(beforeFallBack.scheduledForUtc).toBe("2026-10-27T14:30:00.000Z");
    expect(afterFallBack.scheduledForLocal).toBe("2026-11-03T07:30:00[America/Los_Angeles]");
    expect(afterFallBack.scheduledForUtc).toBe("2026-11-03T15:30:00.000Z");
    expect(interimSchedulerTickKey({
      lane: "dispatcher",
      nominalScheduledAt: beforeFallBack.scheduledForUtc
    })).not.toBe(interimSchedulerTickKey({
      lane: "dispatcher",
      nominalScheduledAt: afterFallBack.scheduledForUtc
    }));
    expect(interimSchedulerTickKey({
      lane: "dispatcher",
      nominalScheduledAt: "2026-10-27T07:30:00-07:00"
    })).toBe(interimSchedulerTickKey({
      lane: "dispatcher",
      nominalScheduledAt: beforeFallBack.scheduledForUtc
    }));
  });

  it("makes duplicate triggers and retries converge without incorporating invocation time", () => {
    const firstTick = interimSchedulerTickKey({
      lane: "dispatcher",
      nominalScheduledAt: "2026-09-13T19:05:00Z"
    });
    const duplicateTick = interimSchedulerTickKey({
      lane: "dispatcher",
      nominalScheduledAt: "2026-09-13T12:05:00-07:00"
    });
    expect(firstTick).toBe(duplicateTick);
    expect(firstTick).not.toBe(interimSchedulerTickKey({
      lane: "watchdog",
      nominalScheduledAt: "2026-09-13T19:05:00Z"
    }));

    const firstJob = interimSchedulerJobKey({
      originVersionId: "origin-v1",
      activationBoundary: "boundary-v1"
    });
    const retryJob = interimSchedulerJobKey({
      originVersionId: "origin-v1",
      activationBoundary: "boundary-v1",
      jobType: "forecast_or_withholding"
    });
    expect(firstJob).toBe(retryJob);
    expect(firstJob).not.toBe(interimSchedulerJobKey({
      originVersionId: "origin-v2",
      activationBoundary: "boundary-v1"
    }));
    expect(schedulerAttemptTokenHash("attempt-one")).toMatch(/^[a-f0-9]{64}$/);
    expect(schedulerAttemptTokenHash("attempt-one")).not.toBe(schedulerAttemptTokenHash("attempt-two"));
  });

  it("classifies due, missed, late, terminal, superseded, and unresolved heads without backfill", () => {
    expect(classifyCurrentOriginHead(origin(), "2026-09-13T19:04:59Z")).toMatchObject({
      disposition: "pending",
      terminalRecordRequired: false,
      prospective: false
    });
    expect(classifyCurrentOriginHead(origin(), "2026-09-13T19:05:00Z")).toMatchObject({
      disposition: "due",
      terminalRecordRequired: true,
      prospective: true,
      withholdingReason: "no_eligible_package"
    });
    expect(classifyCurrentOriginHead(origin(), "2026-09-13T19:06:00Z")).toMatchObject({
      disposition: "missed_inside_deadline",
      terminalRecordRequired: true,
      prospective: true,
      withholdingReason: "compute_failure"
    });
    expect(classifyCurrentOriginHead(origin(), "2026-09-13T19:15:01Z")).toMatchObject({
      disposition: "late_nonprospective",
      terminalRecordRequired: true,
      prospective: false,
      withholdingReason: "late_origin_excluded"
    });
    expect(classifyCurrentOriginHead(origin(), "2026-09-13T19:15:00Z")).toMatchObject({
      disposition: "late_nonprospective",
      terminalRecordRequired: true,
      prospective: false,
      withholdingReason: "late_origin_excluded"
    });
    expect(classifyCurrentOriginHead(origin({ terminalRecordExists: true }), "2026-09-13T19:05:00Z"))
      .toMatchObject({ disposition: "terminal", terminalRecordRequired: false });
    expect(classifyCurrentOriginHead(origin({ isCurrentHead: false }), "2026-09-13T19:05:00Z"))
      .toMatchObject({ disposition: "superseded", terminalRecordRequired: false });
    expect(classifyCurrentOriginHead(origin({
      scheduledForUtc: null,
      kickoffUtc: null,
      eligible: false,
      eligibilityReason: "schedule_unresolved"
    }), "2026-09-13T19:05:00Z")).toEqual({
      disposition: "unresolved",
      terminalRecordRequired: false,
      prospective: false,
      withholdingReason: null,
      scheduledTriggerAt: null,
      persistenceDeadlineAt: null
    });
  });

  it("makes late-discovered and elapsed schedule revisions explicitly nonprospective", () => {
    expect(classifyCurrentOriginHead(origin({
      eligible: false,
      eligibilityReason: "earlier_origin_prohibited"
    }), "2026-09-13T19:04:59Z")).toMatchObject({
      disposition: "pending",
      terminalRecordRequired: false,
      prospective: false
    });
    expect(classifyCurrentOriginHead(origin({
      eligible: false,
      eligibilityReason: "known_after_origin"
    }), "2026-09-13T19:05:00Z")).toMatchObject({
      disposition: "late_nonprospective",
      terminalRecordRequired: true,
      prospective: false,
      withholdingReason: "schedule_unavailable_at_origin"
    });
    for (const eligibilityReason of [
      "prior_origin_elapsed",
      "earlier_origin_prohibited",
      "after_kickoff",
      "pre_activation"
    ] as const) {
      expect(classifyCurrentOriginHead(origin({
        eligible: false,
        eligibilityReason
      }), "2026-09-13T19:05:00Z")).toMatchObject({
        disposition: "late_nonprospective",
        terminalRecordRequired: true,
        prospective: false,
        withholdingReason: "late_origin_excluded"
      });
    }
  });

  it("reclaims only an expired lease with a new token and strictly greater fence", () => {
    expect(decideLeaseClaim(lease({
      state: "pending",
      attemptTokenHash: null,
      leaseExpiresAt: null
    }), "2026-09-13T19:05:00Z")).toEqual({
      allowed: true,
      nextFence: 5,
      reason: "claimable"
    });
    expect(decideLeaseClaim(lease(), "2026-09-13T19:06:29Z")).toEqual({
      allowed: false,
      nextFence: null,
      reason: "active_lease"
    });
    expect(decideLeaseClaim(lease(), "2026-09-13T19:06:30Z")).toEqual({
      allowed: true,
      nextFence: 5,
      reason: "claimable"
    });
    expect(decideLeaseClaim(lease({ state: "terminal" }), "2026-09-13T19:07:00Z")).toEqual({
      allowed: false,
      nextFence: null,
      reason: "terminal"
    });
    expect(leaseExpiryForClaim({
      claimedAt: "2026-09-13T19:05:00Z",
      persistenceDeadlineAt: "2026-09-13T19:05:45Z"
    })).toBe("2026-09-13T19:05:45.000Z");
    expect(leaseExpiryForClaim({
      claimedAt: "2026-09-13T19:16:00Z",
      persistenceDeadlineAt: "2026-09-13T19:15:00Z",
      prospective: false
    })).toBe("2026-09-13T19:17:30.000Z");
  });

  it("revokes renewal and publication authority after token, fence, lease, or head loss", () => {
    const state = lease();
    const authority = { attemptTokenHash: "a".repeat(64), fence: 4 };
    expect(mayRenewLease({
      state,
      authority,
      now: "2026-09-13T19:06:00Z",
      persistenceDeadlineAt: "2026-09-13T19:15:00Z"
    })).toBe(true);
    expect(mayRenewLease({
      state,
      authority: { ...authority, fence: 3 },
      now: "2026-09-13T19:06:00Z",
      persistenceDeadlineAt: "2026-09-13T19:15:00Z"
    })).toBe(false);
    expect(mayRenewLease({
      state,
      authority,
      now: "2026-09-13T19:06:30Z",
      persistenceDeadlineAt: "2026-09-13T19:15:00Z"
    })).toBe(false);

    expect(mayPublishTerminalRecord({
      state,
      authority,
      isCurrentEligibleHead: true,
      times: times()
    })).toMatchObject({ allowed: true, prospective: true, violations: [] });
    expect(mayPublishTerminalRecord({
      state,
      authority: { ...authority, fence: 3 },
      isCurrentEligibleHead: true,
      times: times()
    }).violations).toContain("lease_authority_lost");
    expect(mayPublishTerminalRecord({
      state,
      authority,
      isCurrentEligibleHead: false,
      times: times()
    }).violations).toContain("origin_is_not_current_eligible_head");
    expect(mayPublishTerminalRecord({
      state,
      authority,
      isCurrentEligibleHead: true,
      times: times({ persistedAt: "2026-09-13T19:06:30Z" })
    }).violations).toContain("lease_expired_before_publication");
  });

  it("keeps scheduled, invocation, evidence, generation, persistence, and kickoff times distinct", () => {
    expect(evaluatePublicationTiming(times())).toEqual({
      allowed: true,
      prospective: true,
      violations: []
    });
    expect(evaluatePublicationTiming(times({
      invokedAt: "2026-09-13T19:04:59Z",
      evidenceAt: "2026-09-13T19:05:04Z",
      generatedAt: "2026-09-13T19:05:03Z",
      persistedAt: "2026-09-13T19:15:01Z"
    })).violations).toEqual([
      "invocation_precedes_scheduled_trigger",
      "evidence_postdates_generation",
      "persistence_missed_deadline"
    ]);
    expect(evaluatePublicationTiming(times({
      persistenceDeadlineAt: "2026-09-13T20:05:00Z",
      persistedAt: "2026-09-13T20:05:00Z"
    })).violations).toContain("persistence_not_before_kickoff");
  });
});
