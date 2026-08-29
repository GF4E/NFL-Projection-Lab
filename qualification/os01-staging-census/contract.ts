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

export const STAGING_CENSUS_SEMANTIC_CONTRACT = Object.freeze({
  version: "engine-os.os01-staging-census-contract.v2",
  projectId: "appgprj_6a92435d1d788191b4d6bcaff0a1525d",
  origin: "https://os01-d1-capacity-probe-two-20260829.psoiawesome.chatgpt.site",
  route: "/__engine-os/os01-staging-census/v2",
  method: "POST",
  contentType: "application/json",
  expectedCatalogRows: 377,
  expectedCatalogHash: "3b261b773327b5e6d0923dd22b5c9407db05d92ee3494f8be664afd1cb273eea",
  expectedUserTableCount: 50,
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

export const STAGING_CENSUS_ID = "471001d7f8ad783dbabc1c03c4e7a022799466a20afba70e1eaf087a4761ec29";
export const STAGING_CENSUS_CONTROLLER_AUTHORITY_CONTRACT = Object.freeze({
  version: "engine-os.os01-staging-census-controller-authority-contract.v4",
  semanticQualificationId: STAGING_CENSUS_ID,
  generation: 4,
  predecessorReceiptHash: "b474905efd81b73de2516687b467cf6cc17cda49b5abefe0c56be3aadafa0cd7",
  predecessorStatus: "rejected_invalid_site_authorization_value_before_worker"
});
export const STAGING_CENSUS_CONTROLLER_ID =
  "33b8fc16f102a6c377edaee7c0eeaadcb832be4a3127a636d1050a1e27a41a2c";
export const STAGING_CENSUS_REQUEST_VERSION = "engine-os.os01-staging-census-request.v2";
export const STAGING_CENSUS_EXACT_BODY =
  `{"version":"${STAGING_CENSUS_REQUEST_VERSION}","censusId":"${STAGING_CENSUS_ID}"}`;
export const STAGING_CENSUS_EXACT_BODY_SHA256 =
  "41ebcdd5650da64705e811190bdfaaa737790eadf2ffe650286bf7fde2f7f182";
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
  expectedUserTableCount: STAGING_CENSUS_SEMANTIC_CONTRACT.expectedUserTableCount
});
