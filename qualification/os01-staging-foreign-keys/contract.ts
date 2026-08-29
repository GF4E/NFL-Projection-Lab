export function codePointCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value: unknown): unknown {
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

export type ForeignKeyCandidateIdentity = Readonly<{
  sourceTable: string;
  sourceCreateSqlHash: string;
}>;

export const OS01_STAGING_FOREIGN_KEY_CANDIDATES = Object.freeze([
  { sourceTable: "canonical_games", sourceCreateSqlHash: "77429516bb940a554c7ff25ae398d8289c9d9d2d1f1c7d3df7abaf6ec89ea702" },
  { sourceTable: "confidence_experiment_decisions", sourceCreateSqlHash: "e25d4e89a9e96d059a145181bc2ceb4318bf73a9fdc77189df26795ce65f2b96" },
  { sourceTable: "confidence_forecast_artifacts", sourceCreateSqlHash: "2471ddd5b4845697e20801e44bc7b8a9b2f54830b17c01edd5f682052fa02e36" },
  { sourceTable: "confidence_forecast_evaluations", sourceCreateSqlHash: "a0815b48b520e939d60c2ab6ac6834995b40f06a9f7d518a8b63440c5319ae10" },
  { sourceTable: "confidence_human_adjustments", sourceCreateSqlHash: "02f161aa004c76d9afe6f2722478bd32ded8c5708695e1563083da303a883ecc" },
  { sourceTable: "engine_job_runs", sourceCreateSqlHash: "23cee241cd9a6e5868df346ffa908755e35335442352607f1aa9f08d587eded9" },
  { sourceTable: "engine_origin_attempts_v2", sourceCreateSqlHash: "d46e11efe72b04d0f81e0cbeaefaca77a675e3a06d6877b22744e531acefceef" },
  { sourceTable: "engine_origin_jobs_v2", sourceCreateSqlHash: "fae69d43dbf6a9cfdbd84fc9330fca2604094ed6d7019918832f535c24727d87" },
  { sourceTable: "engine_origin_records_v2", sourceCreateSqlHash: "4ffe37ff91d30ceec1fd006897fe61169dd7851ead4e64667efe26385618318b" },
  { sourceTable: "engine_scheduler_events_v2", sourceCreateSqlHash: "c6c6578fb3df8ab5e8e155e3ab17fe043e71eb381b8f88626c1d91d9ff4941c1" },
  { sourceTable: "forecast_ledger_activations_v1", sourceCreateSqlHash: "fa531bad7e1fb094d049b829950e0172ef2f09366dc7ce14a21a7be18ea1d986" },
  { sourceTable: "forecast_ledger_attempts_v1", sourceCreateSqlHash: "a03b6e20a85ff09aa2ebecf3ba8dcf846ca9840ee59d59e188260641ac0b788b" },
  { sourceTable: "forecast_ledger_events_v1", sourceCreateSqlHash: "7a285edd842a7c88c7d82a3911eb7ea6511a383c196788b90e4e3011738a5751" },
  { sourceTable: "forecast_ledger_jobs_v1", sourceCreateSqlHash: "75132c71477bc8f5b29704e298003ea81215ef6def88093c9e14d41fd635a633" },
  { sourceTable: "forecast_ledger_records_v1", sourceCreateSqlHash: "a34c24b0dcd7009b91669ec46c2fbc8db4f851f03b64608826970a8597ddb0c9" },
  { sourceTable: "forecast_origin_records", sourceCreateSqlHash: "ce348975ad092c0b89b7a91343a7fd9392b3226c6b39d855c9f853be0f3e122a" },
  { sourceTable: "forecast_origin_versions", sourceCreateSqlHash: "61e2363f9e0357e62b34ec7f32b1286cf34f0b8191cc15d5e21312ccd99c66ff" },
  { sourceTable: "forecast_origins", sourceCreateSqlHash: "42956a59d6ad0ddec3b9f32374f7aea9de5e713e104e83263bb803d77b648643" },
  { sourceTable: "game_kickoff_revisions", sourceCreateSqlHash: "1a787cff6dd8b1a31819c97f784a716bca1659cbbe8a7d8e0c568c010ce8787a" },
  { sourceTable: "game_provider_aliases", sourceCreateSqlHash: "4b67bb5532af1e04bb56debb431d6537e1818ba3ad1420ea99ae524e4aac1b31" },
  { sourceTable: "game_schedule_revisions", sourceCreateSqlHash: "7a6d78e9ce3d4730de3f4b97ec8bf188a06b6012e7198268bb803a6c4b3b565a" },
  { sourceTable: "odds_quota_control", sourceCreateSqlHash: "3f7a5851a067535616c146e66a45261964b839bd02d55f4a299037e29d92a8b3" },
  { sourceTable: "odds_quota_events", sourceCreateSqlHash: "758f4d30dc5042fbc48899e54542457e7ab781160eb8b4d2a0734071a236d828" },
  { sourceTable: "odds_quota_reservation_events", sourceCreateSqlHash: "0e5bf12fdbd2dc5e422df86336a0fc717a012b82af885f3d16729be6900a47fd" },
  { sourceTable: "odds_quota_reservations", sourceCreateSqlHash: "6cd60706b5d5dcf0a69b6785a1f857b59356fbd4c9823e1a7f3c7a1f303e2231" },
  { sourceTable: "source_capture_events", sourceCreateSqlHash: "1b6399381f4733c6c2e415d30a7b64228833c34ed54193984a0d120e6f9d06a6" },
  { sourceTable: "source_capture_heartbeats", sourceCreateSqlHash: "e4a7df51d3d81ced9731575a4bd3314c70b96e96cf60a297e7de5594439f1e79" },
  { sourceTable: "source_capture_manifest_extensions", sourceCreateSqlHash: "397007b1b55a215ca5ff6c554ec9918917b2c5156c118a223baf280bfac3fd02" }
] satisfies readonly ForeignKeyCandidateIdentity[]);

export const OS01_STAGING_FOREIGN_KEYS_FAILURE_CATEGORIES = Object.freeze([
  "batch_read_failed",
  "batch_shape_invalid",
  "catalog_identity_mismatch",
  "catalog_changed",
  "candidate_identity_mismatch",
  "foreign_key_row_shape_invalid",
  "foreign_key_constraint_invalid",
  "foreign_key_count_mismatch",
  "foreign_key_root_mismatch",
  "internal_worker_failure"
] as const);

export type Os01StagingForeignKeysFailureCategory =
  typeof OS01_STAGING_FOREIGN_KEYS_FAILURE_CATEGORIES[number];

export const OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT = Object.freeze({
  version: "engine-os.os01-staging-foreign-keys-contract.v1",
  projectId: "appgprj_6a92435d1d788191b4d6bcaff0a1525d",
  origin: "https://os01-d1-capacity-probe-two-20260829.psoiawesome.chatgpt.site",
  route: "/__engine-os/os01-staging-foreign-keys/v1",
  method: "POST",
  contentType: "application/json",
  responseVersion: "engine-os.os01-staging-foreign-keys-receipt.v1",
  responseStatus: "read_only_foreign_key_evidence_captured",
  finalReceiptVersion: "engine-os.os01-staging-foreign-keys-final-receipt.v1",
  finalAcceptanceStatus: "accepted_bounded_read_only_foreign_key_evidence_after_control_plane_postcheck",
  predecessor: Object.freeze({
    hostedControllerAuthorityId: "379588dc6e7ed0e7445e2fe78788b3f7143a4947ad524c066191cdd336a002aa",
    hostedResponseBytesSha256: "3fdcac828cad28ab70e274565856141a50ac5382964e04bb0047ace2854fb032",
    hostedResponseReceiptHash: "c62008d294736799865622c360ac7e581636f7f6472f5dc4efe75ee6a8b7f3a6",
    hostedFinalReceiptBytesSha256: "9253a4802a777f5a1b26fbbe1987382cf2db398f4f7d3c1c619588db15e4ec80",
    hostedFinalReceiptHash: "72e7232ae1f3abae8810976bebf2330ce5da13060a37fb0d8d16559e75618bc8",
    offlineReplaySourceCommit: "ee179832f2093037f8db6c3ff384305494f6dd77",
    offlineReplaySourceTree: "697fe233a9a120869055bbb7286e6aa3c1891cdb",
    offlineReplayReceiptBytesSha256: "338502edae051d087b324135682f0558a3efb704d0cab4f95b27dff32f1cab76",
    offlineReplayReceiptHash: "50021d5310782e4d9f0cbece4882bfa950fe189e2e123255e50ae388221bc3e4"
  }),
  expectedCatalogRows: 377,
  expectedCatalogHash: "3b261b773327b5e6d0923dd22b5c9407db05d92ee3494f8be664afd1cb273eea",
  candidateCount: 28,
  candidateRoot: "09e6a26e0c2f3d6029e34a2fb42a8b3b550e45eab7d8e8da1aaefb69af62a09e",
  expectedForeignKeyConstraintCount: 51,
  expectedForeignKeyColumnRowCount: 54,
  expectedNormalizedForeignKeyRoot: "bad8738dceb23141a6781540308bbd7d287ce8d7f5119913b7f3986e7e724622",
  statementArrayRoot: "69b92c28b8ef4f318cfd3d1eff15276197df695c08caa6e3e0dd61eb1c86d250",
  statementPlanRoot: "ea060788210674b616e441f790aa148e4596d9bfb485bc410aeace405f854183",
  maximumD1StatementsPerInvocation: 30,
  consistencyClaim: "single_d1_batch_catalog_fk_list_catalog",
  invocationControl: Object.freeze({
    mode: "controller_enforced_single_invocation",
    requestBudget: 1,
    runtimeDurableFence: false,
    intentReservation: "exclusive_append_only_before_transport",
    retryAfterIntent: false
  }),
  runtimeBindings: Object.freeze(["DB"]),
  providerBindings: Object.freeze([]),
  databaseMutationAllowed: false,
  productionAllowed: false,
  captureActivationAllowed: false,
  rowCountEvidence: "withheld_pending_generation_12_deterministic_shards",
  rowCountClaimsAccepted: false
});

export const OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID =
  "d7b47bce082f1780ca475601c0d2ecf197bdffe1975c9bf9303e6e15218f2064";
export const OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID =
  "34ef60bff12ac05299223b708201cb7649c1315270acd235ff293d83099fe7f6";
export const OS01_STAGING_FOREIGN_KEYS_REQUEST_VERSION =
  "engine-os.os01-staging-foreign-keys-request.v1";
export const OS01_STAGING_FOREIGN_KEYS_EXACT_BODY =
  `{"version":"${OS01_STAGING_FOREIGN_KEYS_REQUEST_VERSION}","qualificationId":"${OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID}"}`;
export const OS01_STAGING_FOREIGN_KEYS_EXACT_BODY_SHA256 =
  "5c176541ae26a3b1838acd5c1f422a348e4065fc22d5d5bc79a61b56947a41dd";
export const OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ROOT =
  `/private/tmp/engine-os-os01-staging-foreign-keys-${OS01_STAGING_FOREIGN_KEYS_CONTROLLER_ID}`;

export const OS01_STAGING_FOREIGN_KEYS_ARTIFACT_NAMES = Object.freeze({
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

export const OS01_STAGING_FOREIGN_KEYS_CONTROLLER_AUTHORITY_CONTRACT = Object.freeze({
  version: "engine-os.os01-staging-foreign-keys-controller-authority-contract.v1",
  generation: 11,
  qualificationId: OS01_STAGING_FOREIGN_KEYS_QUALIFICATION_ID,
  predecessorHostedFinalReceiptHash:
    OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.predecessor.hostedFinalReceiptHash,
  offlineReplayReceiptHash:
    OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.predecessor.offlineReplayReceiptHash,
  candidateRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.candidateRoot,
  normalizedForeignKeyRoot:
    OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.expectedNormalizedForeignKeyRoot,
  statementArrayRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.statementArrayRoot,
  statementPlanRoot: OS01_STAGING_FOREIGN_KEYS_SEMANTIC_CONTRACT.statementPlanRoot,
  artifactIdentityPreregistration:
    "authority_hash_commits_exact_source_commit_tree_worker_manifest_archive_hashes_archive_roots_file_count_archive_bytes_upload_method_and_remote_build_identity_before_any_observation",
  observationArtifactIdentityPolicy: "pre_and_post_must_match_preregistered_identity_exactly"
});
