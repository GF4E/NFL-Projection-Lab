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
  "user_object_identifier_shape_invalid",
  "user_object_name_binding_invalid",
  "user_object_create_sql_missing",
  "user_object_type_invalid",
  "derived_autoindex_shape_invalid",
  "unknown_internal_object",
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
  version: "engine-os.os01-staging-census-contract.v5",
  projectId: "appgprj_6a92435d1d788191b4d6bcaff0a1525d",
  origin: "https://os01-d1-capacity-probe-two-20260829.psoiawesome.chatgpt.site",
  route: "/__engine-os/os01-staging-census/v4",
  method: "POST",
  contentType: "application/json",
  expectedCatalogRows: 377,
  expectedCatalogHash: "3b261b773327b5e6d0923dd22b5c9407db05d92ee3494f8be664afd1cb273eea",
  expectedUserTableCount: 94,
  responseVersion: "engine-os.os01-staging-ddl-only-census-receipt.v1",
  responseStatus: "read_only_ddl_catalog_census_captured",
  finalReceiptVersion: "engine-os.os01-staging-ddl-only-census-final-receipt.v1",
  finalAcceptanceStatus: "accepted_bounded_read_only_ddl_catalog_census_after_control_plane_postcheck",
  invocationControl: Object.freeze({
    mode: "controller_enforced_single_invocation",
    requestBudget: 1,
    runtimeDurableFence: false,
    intentReservation: "exclusive_append_only_before_transport",
    retryAfterIntent: false
  }),
  consistencyClaim: "single_d1_batch_sequential_transactional_catalog_pair",
  replayableObjectTypes: Object.freeze(["table", "index", "trigger", "view"]),
  replayableObjectEvidence: "exact_non_internal_sql_bearing_sqlite_schema_projection_and_hashes",
  replayableObjectOrder: "type_name_tbl_name_binary_ascending",
  replayableObjectHashRules: Object.freeze({
    createSqlHash: "sha256_utf8_exact_create_sql",
    objectSetHash: "sha256_canonical_json_all_non_internal_type_name_tbl_name_projection",
    replayableDdlRoot: "sha256_canonical_json_full_replayable_objects",
    perTypeRoots: "sha256_canonical_json_all_non_internal_physical_evidence_of_type"
  }),
  internalTableNames: Object.freeze([
    "_cf_KV",
    "d1_migrations",
    "sqlite_sequence",
    "sqlite_stat1",
    "sqlite_stat4"
  ]),
  internalObjectClassification: "table_type_and_name_equals_tbl_name_and_exact_internal_name_only",
  unknownInternalObjectPolicy: "reject_any_unclassified_sqlite_prefixed_name_or_table_binding",
  derivedAutoIndexEvidence: "five_field_null_sql_sqlite_autoindex_and_user_table_binding",
  wholeCatalogEvidence: "exact_canonical_sqlite_schema_projection_plus_independent_batch_pair_hashes",
  viewEvidence: "exact_create_sql_and_hash",
  foreignKeyEvidence: "withheld_pending_independent_offline_ddl_replay_and_generation_11",
  foreignKeyClaimsAccepted: false,
  rowCountEvidence: "withheld_pending_deterministic_sharded_capture",
  rowCountClaimsAccepted: false,
  maximumD1QueriesPerInvocation: 2,
  queryPlan: Object.freeze([
    "catalog_batch_statement_1",
    "catalog_batch_statement_2"
  ]),
  runtimeBindings: Object.freeze(["DB"]),
  providerBindings: Object.freeze([]),
  databaseMutationAllowed: false,
  productionAllowed: false,
  captureActivationAllowed: false
});

export const STAGING_CENSUS_ACTIVE_EXPECTED_USER_TABLE_COUNT =
  STAGING_CENSUS_SEMANTIC_CONTRACT.expectedUserTableCount;
export const STAGING_CENSUS_ID = "525370dfc8d64ef549f8c76186c2846fe97ac5beca48d3671cda25a0a0fa5f74";
export const STAGING_CENSUS_CONTROLLER_AUTHORITY_CONTRACT = Object.freeze({
  version: "engine-os.os01-staging-census-controller-authority-contract.v10",
  semanticQualificationId: STAGING_CENSUS_ID,
  generation: 10,
  predecessorReceiptHash: "23d7928251a73669ec0a03496b717e6f6c99643544e3cd96f236bef268873d29",
  predecessorStatus: "rejected_hosted_row_count_read_failed",
  artifactIdentityPreregistration:
    "authority_hash_commits_exact_source_commit_tree_worker_manifest_archive_hashes_archive_roots_file_count_archive_bytes_upload_method_and_remote_build_identity_before_any_observation",
  observationArtifactIdentityPolicy: "pre_and_post_must_match_preregistered_identity_exactly"
});
export const STAGING_CENSUS_CONTROLLER_ID =
  "379588dc6e7ed0e7445e2fe78788b3f7143a4947ad524c066191cdd336a002aa";
export const STAGING_CENSUS_REQUEST_VERSION = "engine-os.os01-staging-census-request.v4";
export const STAGING_CENSUS_EXACT_BODY =
  `{"version":"${STAGING_CENSUS_REQUEST_VERSION}","censusId":"${STAGING_CENSUS_ID}"}`;
export const STAGING_CENSUS_EXACT_BODY_SHA256 =
  "e946e6493cf8d6e53c8013ca51d27ddc47c9168809eee9684558227eea89f00c";
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
