import type {
  BookKey,
  OddsSnapshot,
  PushDelivery,
  Teammate,
  TeamPickRevision
} from "./types";
import { stableHash } from "./hash";

export function revisionContract(revision: TeamPickRevision): Record<string, unknown> {
  return {
    pickId: revision.pickId,
    revision: revision.revision,
    market: revision.market,
    selection: revision.selection,
    units: revision.units,
    executionStatus: revision.executionStatus,
    book: revision.book,
    point: revision.frozenPoint,
    price: revision.frozenPrice,
    rationale: revision.rationale,
    consensusSnapshotId: revision.consensusSnapshotId,
    modelHash: revision.modelHash,
    dataHash: revision.dataHash,
    uncertaintyInterval: revision.uncertaintyInterval
  };
}

export function revisionHash(revision: TeamPickRevision): string {
  return stableHash(revisionContract(revision));
}

export function editRevision(
  current: TeamPickRevision,
  edits: Partial<
    Pick<
      TeamPickRevision,
      | "market"
      | "selection"
      | "units"
      | "executionStatus"
      | "book"
      | "frozenPoint"
      | "frozenPrice"
      | "rationale"
      | "consensusSnapshotId"
      | "modelHash"
      | "dataHash"
      | "uncertaintyInterval"
    >
  >,
  authorId: string,
  now: string
): TeamPickRevision {
  if (["locked", "settled", "push", "void"].includes(current.status)) {
    throw new Error("Locked or graded entries cannot be edited");
  }
  return {
    ...current,
    ...edits,
    id: `${current.pickId}:r${current.revision + 1}`,
    revision: current.revision + 1,
    authorId,
    approvals: [],
    status: "draft",
    createdAt: now,
    approvedAt: null,
    cashPlacementConfirmed: false
  };
}

export interface ApprovalResult {
  revision: TeamPickRevision;
  refreshedBecauseQuoteChanged: boolean;
  push: PushDelivery | null;
}

export function approveRevision(
  current: TeamPickRevision,
  approver: Teammate,
  teammates: readonly [Teammate, Teammate],
  latestQuote: OddsSnapshot,
  now: string,
  cashPlacementConfirmed = false
): ApprovalResult {
  if (new Date(now) >= new Date(current.kickoffAt)) {
    throw new Error("Approval is closed at kickoff");
  }
  if (latestQuote.book !== current.book || latestQuote.side !== current.selection) {
    throw new Error("Latest quote does not match the candidate contract");
  }
  if (
    latestQuote.point !== current.frozenPoint ||
    latestQuote.americanPrice !== current.frozenPrice
  ) {
    return {
      revision: editRevision(
        current,
        {
          frozenPoint: latestQuote.point,
          frozenPrice: latestQuote.americanPrice,
          consensusSnapshotId: latestQuote.id
        },
        current.authorId,
        now
      ),
      refreshedBecauseQuoteChanged: true,
      push: null
    };
  }
  if (!teammates.some((member) => member.id === approver.id)) {
    throw new Error("Only team members can approve a revision");
  }
  if (current.approvals.some((approval) => approval.teammateId === approver.id)) {
    return { revision: current, refreshedBecauseQuoteChanged: false, push: null };
  }
  const contractHash = revisionHash(current);
  const approvals = [
    ...current.approvals,
    { teammateId: approver.id, approvedAt: now, revisionHash: contractHash }
  ];
  const isSecondApproval = teammates.every((member) =>
    approvals.some(
      (approval) => approval.teammateId === member.id && approval.revisionHash === contractHash
    )
  );
  if (isSecondApproval && current.executionStatus === "executed" && !cashPlacementConfirmed) {
    throw new Error("Executed entries require confirmation that cash was placed at the frozen contract");
  }
  const revision: TeamPickRevision = {
    ...current,
    approvals,
    status: isSecondApproval ? "approved" : "awaiting_approval",
    approvedAt: isSecondApproval ? now : null,
    cashPlacementConfirmed: isSecondApproval && current.executionStatus === "executed"
      ? cashPlacementConfirmed
      : false
  };
  const missing = teammates.find(
    (member) => !approvals.some((approval) => approval.teammateId === member.id)
  );
  return {
    revision,
    refreshedBecauseQuoteChanged: false,
    push: missing
      ? {
          id: `push:${current.id}:${missing.id}`,
          type: "awaiting_you",
          recipientId: missing.id,
          idempotencyKey: `awaiting_you:${current.id}:${missing.id}`,
          state: "pending",
          createdAt: now,
          sentAt: null
        }
      : null
  };
}

export function choosePaperBook(
  evaluations: readonly { book: BookKey; expectedValue: number | null }[]
): BookKey {
  const eligible = evaluations.filter(
    (item): item is { book: BookKey; expectedValue: number } => item.expectedValue !== null
  );
  if (eligible.length === 0) throw new Error("A paper entry requires at least one supported book EV");
  return [...eligible].sort((left, right) => right.expectedValue - left.expectedValue)[0].book;
}

export function expireStaleDraft(
  revision: TeamPickRevision,
  now: string,
  latestQuote: OddsSnapshot
): TeamPickRevision {
  if (["approved", "locked", "settled", "push", "void"].includes(revision.status)) return revision;
  const ageMs = new Date(now).getTime() - new Date(revision.createdAt).getTime();
  if (ageMs < 12 * 60 * 60 * 1000) return revision;
  return editRevision(
    revision,
    {
      frozenPoint: latestQuote.point,
      frozenPrice: latestQuote.americanPrice,
      consensusSnapshotId: latestQuote.id
    },
    revision.authorId,
    now
  );
}

export function applyKickoffLock(revision: TeamPickRevision, now: string): TeamPickRevision {
  if (new Date(now) < new Date(revision.kickoffAt)) return revision;
  if (revision.status === "approved") return { ...revision, status: "locked" };
  if (["draft", "awaiting_approval"].includes(revision.status)) {
    return { ...revision, status: "void", approvals: [] };
  }
  return revision;
}

export function edgeGone(draft: TeamPickRevision, latestEdge: number): boolean {
  return ["draft", "awaiting_approval"].includes(draft.status) && latestEdge <= 0;
}
