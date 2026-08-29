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
  "foreign_key_read_failed",
  "foreign_key_shape_invalid",
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
  version: "engine-os.os01-staging-census-contract.v3",
  projectId: "appgprj_6a92435d1d788191b4d6bcaff0a1525d",
  origin: "https://os01-d1-capacity-probe-two-20260829.psoiawesome.chatgpt.site",
  route: "/__engine-os/os01-staging-census/v2",
  method: "POST",
  contentType: "application/json",
  expectedCatalogRows: 377,
  expectedCatalogHash: "3b261b773327b5e6d0923dd22b5c9407db05d92ee3494f8be664afd1cb273eea",
  expectedUserTableCount: 94,
  responseVersion: "engine-os.os01-staging-census-receipt.v2",
  invocationControl: Object.freeze({
    mode: "controller_enforced_single_invocation",
    requestBudget: 1,
    runtimeDurableFence: false,
    intentReservation: "exclusive_append_only_before_transport",
    retryAfterIntent: false
  }),
  consistencyClaim: "pre_post_catalog_and_row_counts_only_not_transactional_snapshot",
  viewEvidence: "names_and_hash_only_no_view_sql",
  runtimeBindings: Object.freeze(["DB"]),
  providerBindings: Object.freeze([]),
  databaseMutationAllowed: false,
  productionAllowed: false,
  captureActivationAllowed: false
});

export const STAGING_CENSUS_ACTIVE_EXPECTED_USER_TABLE_COUNT =
  STAGING_CENSUS_SEMANTIC_CONTRACT.expectedUserTableCount;
export const STAGING_CENSUS_ID = "63542b54dcbb72ffb5d317004779d685cb3b32f42ce519e75beed621c894d7e1";
export const STAGING_CENSUS_CONTROLLER_AUTHORITY_CONTRACT = Object.freeze({
  version: "engine-os.os01-staging-census-controller-authority-contract.v8",
  semanticQualificationId: STAGING_CENSUS_ID,
  generation: 8,
  predecessorReceiptHash: "d715fd7ee68e3269c5ebcbcfc769e2a67311d2027ef701b266bac133f4edbdbd",
  predecessorStatus: "rejected_expected_user_table_count_mismatch_after_count_diagnostic"
});
export const STAGING_CENSUS_CONTROLLER_ID =
  "32f0feb8306c355d9761e319ca4bdcefecc47ff230433281cddf7f6e587e2b9f";
export const STAGING_CENSUS_REQUEST_VERSION = "engine-os.os01-staging-census-request.v2";
export const STAGING_CENSUS_EXACT_BODY =
  `{"version":"${STAGING_CENSUS_REQUEST_VERSION}","censusId":"${STAGING_CENSUS_ID}"}`;
export const STAGING_CENSUS_EXACT_BODY_SHA256 =
  "d2721fd17aaa9728658eea99068f46211a3ef9b181c35bd6004126fa552d191b";
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
