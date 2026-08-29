export function codePointCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => codePointCompare(left, right))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return typeof value === "bigint" ? value.toString() : value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export const STAGING_CENSUS_FAILURE_CATEGORIES = Object.freeze([
  "catalog_read_failed",
  "catalog_shape_invalid",
  "catalog_identity_mismatch",
  "user_table_count_mismatch",
  "user_table_identifier_shape_invalid",
  "user_table_name_binding_invalid",
  "user_table_create_sql_missing",
  "row_count_read_failed",
  "row_count_shape_invalid",
  "row_count_changed",
  "catalog_changed",
  "internal_worker_failure"
] as const);

export type StagingCensusFailureCategory = typeof STAGING_CENSUS_FAILURE_CATEGORIES[number];

export const STAGING_CENSUS_COUNT_DIAGNOSTIC_VERSION =
  "engine-os.os01-staging-census-table-count-diagnostic.v1";
export const STAGING_CENSUS_COUNT_DIAGNOSTIC_STATUSES = Object.freeze([
  "closed_user_table_count_match",
  "closed_user_table_count_mismatch"
] as const);
export const STAGING_CENSUS_COUNT_DIAGNOSTIC_MAX_TABLE_ROWS = 1_000;

export const STAGING_CENSUS_SEMANTIC_CONTRACT = Object.freeze({
  version: "engine-os.os01-staging-census-contract.v4",
  projectId: "appgprj_6a92435d1d788191b4d6bcaff0a1525d",
  origin: "https://os01-d1-capacity-probe-two-20260829.psoiawesome.chatgpt.site",
  route: "/__engine-os/os01-staging-census/v3",
  method: "POST",
  contentType: "application/json",
  expectedCatalogRows: 377,
  expectedCatalogHash: "3b261b773327b5e6d0923dd22b5c9407db05d92ee3494f8be664afd1cb273eea",
  expectedUserTableCount: 94,
  responseVersion: "engine-os.os01-staging-ddl-row-census-receipt.v1",
  responseStatus: "read_only_ddl_row_census_captured",
  finalReceiptVersion: "engine-os.os01-staging-ddl-row-census-final-receipt.v1",
  finalAcceptanceStatus: "accepted_bounded_read_only_ddl_row_census_after_control_plane_postcheck",
  invocationControl: Object.freeze({
    mode: "controller_enforced_single_invocation",
    requestBudget: 1,
    runtimeDurableFence: false,
    intentReservation: "exclusive_append_only_before_transport",
    retryAfterIntent: false
  }),
  consistencyClaim: "pre_post_catalog_and_row_counts_only_not_transactional_snapshot",
  viewEvidence: "names_and_hash_only_no_view_sql",
  foreignKeyEvidence: "withheld_pending_independent_offline_ddl_replay_and_generation_10",
  foreignKeyClaimsAccepted: false,
  maximumD1QueriesPerInvocation: 4,
  queryPlan: Object.freeze([
    "catalog_pre",
    "row_counts_pre_compound",
    "row_counts_post_compound",
    "catalog_post"
  ]),
  runtimeBindings: Object.freeze(["DB"]),
  providerBindings: Object.freeze([]),
  databaseMutationAllowed: false,
  productionAllowed: false,
  captureActivationAllowed: false
});

export const STAGING_CENSUS_ACTIVE_EXPECTED_USER_TABLE_COUNT =
  STAGING_CENSUS_SEMANTIC_CONTRACT.expectedUserTableCount;
export const STAGING_CENSUS_ID = "8acabdd225af3530825d5ddd65b78fdf0735b638fb38f587fcad40efd378f06d";
export const STAGING_CENSUS_CONTROLLER_AUTHORITY_CONTRACT = Object.freeze({
  version: "engine-os.os01-staging-census-controller-authority-contract.v9",
  semanticQualificationId: STAGING_CENSUS_ID,
  generation: 9,
  predecessorReceiptHash: "826cbc7df6c71ebf678b8dce0279acec087813399abc35d90fbb9d5e3e69711c",
  predecessorStatus: "rejected_hosted_foreign_key_read_failed"
});
export const STAGING_CENSUS_CONTROLLER_ID =
  "195fcbfc0fac28ae7cdb58ef838172bc572e2069397a3be4d6d724bf07e51b0e";
export const STAGING_CENSUS_REQUEST_VERSION = "engine-os.os01-staging-census-request.v3";
export const STAGING_CENSUS_EXACT_BODY =
  `{"version":"${STAGING_CENSUS_REQUEST_VERSION}","censusId":"${STAGING_CENSUS_ID}"}`;
export const STAGING_CENSUS_EXACT_BODY_SHA256 =
  "7b5280076089b7f782c2d5921043882033fa9e35928345e81ed148416d9276ab";
export const STAGING_CENSUS_CONTROLLER_ROOT =
  `/private/tmp/engine-os-os01-staging-census-${STAGING_CENSUS_CONTROLLER_ID}`;
export const STAGING_CENSUS_ARTIFACT_NAMES = Object.freeze({
  authority: "authority.json",
  preObservation: "control-plane-pre.json",
  intent: "intent.json",
  response: "response.json",
  attemptResult: "attempt-result.json",
  dispatchCompletion: "dispatch-completion.json",
  terminalFence: "terminal-fence.json",
  postObservation: "control-plane-post.json",
  finalizationIntent: "finalization-intent.json",
  finalReceipt: "final-receipt.json"
});

export const DEFAULT_STAGING_CENSUS_OPTIONS = Object.freeze({
  expectedOrigin: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
  expectedCatalogHash: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogHash,
  expectedCatalogRows: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogRows,
  expectedUserTableCount: STAGING_CENSUS_ACTIVE_EXPECTED_USER_TABLE_COUNT
});
